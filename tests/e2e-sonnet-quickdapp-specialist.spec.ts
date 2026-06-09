import { test, expect } from './helpers/e2e-pool'

test.use({ viewport: { width: 1440, height: 900 } })

/**
 * Sign in as an e2e pool user in the `e2e-starter-with-quotas` group, switch to
 * Claude Sonnet, then ask a deterministic question about the QuickDapp
 * Specialist subagent.
 *
 * Ground truth lives in:
 *   libs/remix-ai-core/src/inferencers/deepagent/SubagentConfig.ts
 *     name:        'QuickDapp Specialist'
 *     description: 'Specializes in generating and updating React-based DApp
 *                   frontends using file_write tools.'
 *   libs/remix-ai-core/src/inferencers/deepagent/prompts/system/lightPrompts.ts
 *     QUICKDAPP_SPECIALIST_SUBAGENT_PROMPT mentions the tool names:
 *     list_dapps, generate_dapp, update_dapp, file_write, finalize_dapp_generation
 *
 * The main agent is told about its subagents (name + description) by the
 * orchestrator, so asking Sonnet to identify the dapp-frontend subagent by
 * name should produce a deterministic answer containing "QuickDapp" (and
 * usually at least one of its tool names).
 */
test('Sonnet identifies the QuickDapp Specialist subagent', async ({ page }) => {
  test.setTimeout(300_000)

  const poolApiKey = process.env.E2E_POOL_API_KEY || process.env.E2E_POOL_KEY
  if (!poolApiKey) {
    throw new Error('Missing E2E pool key. Set E2E_POOL_API_KEY (or E2E_POOL_KEY) before running.')
  }

  const url = `http://localhost:8080/?#e2e_feature_groups=e2e-starter-with-quotas&e2e_pool_key=${encodeURIComponent(poolApiKey)}&lang=en&optimize&runs=200&evmVersion&version=soljson-v0.8.34+commit.80d5c536.js`
  await page.goto(url)

  // --- 1. Sign in via topbar -----------------------------------------------
  await page.locator('[data-id="topbarSignInButton"]').click()
  await page.locator('[data-id="loginModalE2EPoolButton"]').click()
  await expect(page.locator('[data-id="user-menu-compact"]').first()).toBeVisible({ timeout: 30000 })

  // --- 2. Open the AI panel and switch to Claude Sonnet 4.6 ----------------
  await page.locator('[data-id="verticalIconsKindremixaiassistant"]').click()
  await page.locator('[data-id="ai-model-selector-btn"]').click()
  await page.locator('[data-id="ai-model-claude-sonnet-4-6"]').click()

  // Sanity: the model selector should now show Sonnet as the selected model.
  await expect(page.locator('[data-id="ai-model-selector-btn"]')).toContainText(/Sonnet/i, { timeout: 10000 })

  // Wait for the route-status badge to flip out of "initializing" and into
  // "agent" (DeepAgent ready). This replaces the old `waitForTimeout(2000)`
  // — the UI now publishes a real readiness signal we can deterministically
  // wait on.
  await expect(page.locator('[data-id="ai-route-status"]')).toHaveAttribute('data-route', 'agent', { timeout: 30000 })
  // --- 3. Ask the deterministic question -----------------------------------
  // Force the orchestrator to actually delegate to the QuickDapp Specialist
  // subagent and report back. Ground truth: the QuickDapp Specialist's tool
  // list includes `generate_dapp`, so the answer should be YES.
  const question = 'Ask the QuickDapp Specialist if he has access to generate_dapp.'

  const promptInput = page.locator('[data-id="remix-ai-prompt-input"]')
  await promptInput.click()
  await promptInput.fill(question)
  await page.locator('[data-id="remix-ai-composer-send-btn"]').click()
  
  // --- 4. Wait for the assistant response ----------------------------------
  await expect(page.locator('[data-id="ai-assistant-landing"]')).toBeHidden({ timeout: 15000 })
  const assistantBubble = page.locator('[data-id="ai-response-chat-bubble-section"].me-3').first()
  await expect(assistantBubble).toBeVisible({ timeout: 90000 })

  // Poll until the bubble settles (length stabilises) — streaming UI. Subagent
  // delegation can take a while; allow a generous window.
  await expect.poll(
    async () => (await assistantBubble.innerText()).trim().length,
    { timeout: 180000, intervals: [1000, 2000, 3000] }
  ).toBeGreaterThan(10)

  // Let streaming finish.
  let prevLen = -1
  for (let i = 0; i < 60; i++) {
    const len = (await assistantBubble.innerText()).trim().length
    if (len === prevLen && len > 0) break
    prevLen = len
    await page.waitForTimeout(1000)
  }

  const answer = (await assistantBubble.innerText()).trim()
  console.log('[sonnet-quickdapp] answer:\n' + answer)

  // --- 5. Verify the answer is deterministic -------------------------------
  // We delegated the question to the QuickDapp Specialist subagent and asked
  // whether it has access to `generate_dapp`. The ground truth in
  // SubagentConfig.ts wires `quickDappTools` (which includes `generate_dapp`)
  // onto this subagent, so the answer must be affirmative.

  // The tool name itself should be echoed back.
  expect(answer.toLowerCase()).toContain('generate_dapp')

  // The reply must be affirmative. Accept any common "yes" phrasing.
  expect(answer).toMatch(/\b(yes|yep|yeah|affirmative|confirmed|has access|can use|does have)\b/i)

  // Belt-and-suspenders: make sure it isn't a denial.
  expect(answer).not.toMatch(/\b(no,|does not have|doesn't have|no access|cannot|can't access|not available)\b/i)
})
