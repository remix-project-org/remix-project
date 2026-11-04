import { expect, type Page } from '@playwright/test'

/**
 * Drives the real IDE for the AI cost benchmark: sign-in through the E2E
 * pool, model selection, the assistant composer, approvals, and plugin calls.
 * Selectors and flows follow the AI specs in `/tests`.
 */

export const IDE_URL = process.env.BENCH_IDE_URL || 'http://127.0.0.1:8080'

/** Calls a plugin method inside the page, through the hook remixAIPlugin exposes. */
export async function ideCall<T = any>(page: Page, plugin: string, method: string, ...args: any[]): Promise<T> {
  return page.evaluate(
    ({ plugin, method, args }) => (window as any).getRemixAIPlugin.call(plugin, method, ...args),
    { plugin, method, args }
  )
}

export async function signIn(page: Page, group: string): Promise<void> {
  const poolKey = process.env.E2E_POOL_API_KEY || process.env.E2E_POOL_KEY
  if (!poolKey) throw new Error('Missing E2E pool key — set E2E_POOL_API_KEY.')

  if (process.env.BENCH_DEBUG) traceSignIn(page)
  // AI_DEBUG exposes window.__remixAI (model call stats) at activation.
  await page.addInitScript(() => window.localStorage.setItem('AI_DEBUG', 'true'))
  await page.addInitScript(hideNudges)
  await page.goto(`${IDE_URL}/?#e2e_feature_groups=${group}&e2e_pool_key=${encodeURIComponent(poolKey)}&lang=en&optimize&runs=200&evmVersion&version=soljson-v0.8.34+commit.80d5c536.js`)
  await waitForAppLoaded(page)
  await openPoolLogin(page)
  await expect(page.locator('[data-id="user-menu-compact"]').first()).toBeVisible({ timeout: 30_000 })
  await dismissPopups(page)
}

/**
 * Waits until the IDE has booted, reloading when it lands on the preload
 * error screen ("An unknown error has occurred while loading the
 * application"). That screen is what a failed or timed-out download of the
 * main app chunk looks like — common when several browsers cold-load the dev
 * server's bundle at once — and the app never recovers from it on its own.
 */
async function waitForAppLoaded(page: Page, { attempts = 3, timeoutMs = 180_000 } = {}): Promise<void> {
  const loaded = page.locator('[data-id="login-button"], [data-id="user-menu-compact"]').first()
  const failed = page.locator('.preload-info-container.alert-danger')
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const outcome = await Promise.race([
      loaded.waitFor({ timeout: timeoutMs }).then(() => 'loaded' as const),
      failed.waitFor({ timeout: timeoutMs }).then(() => 'failed' as const)
    ]).catch(() => 'timeout' as const)
    if (outcome === 'loaded') return
    console.warn(`[bench] IDE did not load (${outcome}), attempt ${attempt}/${attempts}${attempt < attempts ? ' — reloading' : ''}`)
    if (attempt < attempts) await page.reload()
  }
  throw new Error(`IDE failed to load after ${attempts} attempts (preload error screen or no login button)`)
}

/** BENCH_DEBUG=1: log what the page does around sign-in — navigations, crashes, pool and SSO calls. */
function traceSignIn(page: Page): void {
  const t0 = Date.now()
  const log = (line: string) => console.log(`[bench:debug +${((Date.now() - t0) / 1000).toFixed(1)}s] ${line}`)
  page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) log(`navigated ${frame.url().split('#')[0]}`) })
  page.on('pageerror', (error) => log(`page error: ${String(error).slice(0, 300)}`))
  page.on('crash', () => log('page crashed'))
  page.on('console', (message) => {
    if (message.type() === 'error' || /ContractAgent|structured|generation failed/.test(message.text())) log(`console.${message.type()}: ${message.text().slice(0, 600)}`)
  })
  page.on('requestfailed', (request) => { if (/sso|pool|8080\/[^?#]*\.js/.test(request.url())) log(`request failed: ${request.url().slice(0, 120)} ${request.failure()?.errorText}`) })
  page.on('response', (response) => { if (/test\/pool|\/sso\/providers/.test(response.url())) log(`${response.status()} ${response.url().slice(0, 120)}`) })
}

/**
 * Opens the login dialog and picks the E2E pool. The dialog asks the pool
 * whether an account is free once, when it opens, and only shows the pool
 * button when that one request succeeds — a slow or failed answer from
 * staging hides it for good. So a missing button means "ask again": reload
 * and reopen the dialog.
 */
async function openPoolLogin(page: Page, attempts = 3): Promise<void> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    await dismissPopups(page)
    await page.locator('[data-id="login-button"]').click({ timeout: 30_000 })
    try {
      await page.locator('[data-id="loginModalE2EPoolButton"]').click({ timeout: 45_000 })
      return
    } catch {
      console.warn(`[bench] E2E pool button not shown, attempt ${attempt}/${attempts}${attempt < attempts ? ' — reloading' : ''}`)
      if (attempt === attempts) break
      await page.reload()
      await waitForAppLoaded(page)
    }
  }
  throw new Error(`E2E pool login unavailable after ${attempts} attempts (pool status check failed or no free account)`)
}

/**
 * Hides the promotional nudges, which can sit over the controls the
 * benchmark clicks. Hidden with CSS, never removed: React owns those nodes,
 * and deleting them from under it makes its next update throw
 * "removeChild … not a child of this node", which unmounts the whole IDE and
 * leaves a blank page. Runs as an init script, so it survives reloads.
 */
function hideNudges(): void {
  const css = '#nudge-widget-container, .nudge-widget, .nudge-modal-backdrop, .nudge-decoration { display: none !important; pointer-events: none !important; }'
  const install = () => {
    const style = document.createElement('style')
    style.textContent = css
    document.head.appendChild(style)
  }
  if (document.head) install()
  else document.addEventListener('DOMContentLoaded', install)
}

async function dismissPopups(page: Page): Promise<void> {
  try {
    await page.getByTitle('Dismiss').click({ timeout: 3000 })
  } catch { /* not present */ }
}

/**
 * `auto` picks Auto LLM Mode; anything else is typed into the model search
 * and the first unlocked match is taken. Returns the label shown on the
 * picker, so results record the model actually selected.
 */
export async function selectModel(page: Page, model: string): Promise<string> {
  const picker = page.locator('[data-id="ai-model-selector-btn"]')
  await picker.click()
  if (model === 'auto') {
    await page.locator('[data-id="ai-model-auto"]').click()
  } else {
    // The picker searches display names ("Anthropic Claude Haiku Latest"),
    // not ids, so `haiku-latest` or `~anthropic/claude-haiku-latest` must be
    // turned into words first.
    const query = model.replace(/[-_/~:.]+/g, ' ').replace(/\s+/g, ' ').trim()
    await page.locator('[data-id="ai-model-search"]').fill(query)
    const match = page.locator('[data-id^="ai-model-"][data-locked="false"]').first()
    try {
      await match.click({ timeout: 15_000 })
    } catch {
      const offered = await page.locator('[data-id^="ai-model-"][data-locked]').allInnerTexts().catch(() => [])
      throw new Error(`no unlocked model matches "${query}" (from BENCH_MODELS "${model}"). Shown: ${offered.map((t) => t.split('\n')[0]).join(' | ') || 'none'}`)
    }
  }
  // Agent start-up syncs the model catalogue and loads the MCP tools; under
  // load (several browsers on the dev server) it can take well over a minute.
  await expect(page.locator('[data-id="ai-route-status"]')).toHaveAttribute('data-route', 'agent', { timeout: 180_000 })
  return (await picker.innerText()).split('\n')[0].trim()
}

export async function writeFile(page: Page, path: string, content: string): Promise<void> {
  await ideCall(page, 'fileManager', 'writeFile', path, content)
}

export async function exists(page: Page, path: string): Promise<boolean> {
  return !!(await ideCall(page, 'fileManager', 'exists', path).catch(() => false))
}

/** Paths under `dir` (recursive) whose path matches `pattern`. */
export async function findFiles(page: Page, dir: string, pattern: RegExp): Promise<string[]> {
  if (!(await exists(page, dir))) return []
  const found: string[] = []
  const walk = async (folder: string) => {
    const entries: Record<string, { isDirectory: boolean }> = await ideCall(page, 'fileManager', 'readdir', folder)
    for (const [path, entry] of Object.entries(entries || {})) {
      if (entry?.isDirectory) await walk(path)
      else if (pattern.test(path)) found.push(path)
    }
  }
  await walk(dir)
  return found
}

/**
 * Compiles `path` and returns its compiler errors (severity `error` only).
 * Waits for a result whose source matches the file's current content, so a
 * stale earlier compilation is never read as this one.
 */
export async function compile(page: Page, path: string, timeoutMs = 180_000): Promise<string[]> {
  const content: string = await ideCall(page, 'fileManager', 'readFile', path)
  await ideCall(page, 'solidity', 'compileFile', { path: [path]})
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const result = await ideCall(page, 'solidity', 'getCompilationResult').catch(() => null)
    const source = result?.source?.sources?.[path]?.content
    if (source === content) {
      return (result?.data?.errors ?? [])
        .filter((e: any) => e?.severity === 'error')
        .map((e: any) => e?.formattedMessage || e?.message || String(e))
    }
    await page.waitForTimeout(1000)
  }
  throw new Error(`compilation of ${path} did not finish in ${timeoutMs}ms`)
}

/** Sends a message through the composer, as a user would. */
export async function send(page: Page, text: string): Promise<void> {
  const input = page.locator('[data-id="remix-ai-prompt-input"]')
  await input.click()
  await input.fill(text)
  await page.locator('[data-id="remix-ai-composer-send-btn"]').click()
}

/**
 * Waits for the assistant to finish its turn, approving every tool request on
 * the way (file writes, deploys) so the run never stalls on a modal. A turn is
 * over once streaming has stopped and stayed stopped for `settleMs` — the
 * agent can pause between steps.
 */
export async function waitForIdle(page: Page, { timeoutMs = 600_000, settleMs = 5000 } = {}): Promise<void> {
  const streaming = page.locator('[data-id="remix-ai-streaming"]').first()
  const deadline = Date.now() + timeoutMs
  let idleSince: number | null = null
  let started = false

  while (Date.now() < deadline) {
    await approvePending(page)
    const isStreaming = (await streaming.getAttribute('data-streaming').catch(() => null)) === 'true'
    if (isStreaming) {
      started = true
      idleSince = null
    } else {
      idleSince ??= Date.now()
      // Before the first token, give the request time to start.
      const needed = started ? settleMs : Math.max(settleMs, 20_000)
      if (Date.now() - idleSince >= needed) return
    }
    await page.waitForTimeout(1000)
  }
  throw new Error(`assistant still busy after ${timeoutMs}ms`)
}

async function approvePending(page: Page): Promise<void> {
  const autoAccept = page.getByRole('checkbox', { name: 'Auto-accept all changes' })
  if (await autoAccept.isVisible().catch(() => false)) {
    await autoAccept.check().catch(() => {})
  }
  const approve = page.locator('[data-id="tool-approval-approve-button"]').first()
  if (await approve.isVisible().catch(() => false)) {
    await approve.click().catch(() => {})
  }
}

/**
 * Sends `opening`, then keeps answering with `followUps` (in order) until
 * `done()` holds or the follow-ups run out. For flows where the agent asks
 * questions before acting, e.g. the gas optimizer asking which file.
 */
export async function converse(
  page: Page,
  opening: string,
  followUps: string[],
  done: () => Promise<boolean>
): Promise<boolean> {
  await send(page, opening)
  await waitForIdle(page)
  for (const reply of followUps) {
    if (await done()) return true
    await send(page, reply)
    await waitForIdle(page)
  }
  return done()
}
