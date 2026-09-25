import { test, expect, Page, Locator } from '@playwright/test'

// "AI mode": the RemixAI chat maximized into the center panel (tab bar hidden),
// driven by the topbar AI/Code switcher, the panel-header maximize button and
// the chat header's exit button. Layout only — no sign-in needed.

test.use({ viewport: { width: 1600, height: 1000 } })
// Each test boots a full IDE; running them concurrently (repo default is
// fullyParallel) overloads a local dev server. Run this file's tests in order.
test.describe.configure({ mode: 'default', timeout: 180_000 })

const sel = {
  aiBtn: '[data-id="aiReviewModeBtn"]',
  codeBtn: '[data-id="codeModeBtn"]',
  switcher: '.ai-mode-toggle-group',
  host: '#ai-chat-maximized-host',
  chatReady: '[data-id="remix-ai-assistant-ready"]',
  rightPanel: '#right-side-panel',
  terminal: '.terminal-wrap',
  leftPanel: '#side-panel',
  panelTitle: '[data-id="sidePanelSwapitTitle"]',
  // RemixUIPanelPlugin swaps a slot's whole class list for `d-none` when inactive
  tabsSlot: '.mainview > .tabs-wrap',
  bottomBarSlot: '.mainview > .bottomBar-wrap',
  editorSlot: '.mainview > .editor-wrap',
  mainSlot: '.mainview > .mainPanel-wrap'
}

async function removeOverlays (page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll('#nudge-widget-container, .nudge-widget, .nudge-modal-backdrop, .nudge-decoration, .modal-backdrop').forEach((el) => el.remove())
  })
}

async function click (page: Page, target: string | Locator) {
  await removeOverlays(page)
  const locator = typeof target === 'string' ? page.locator(target) : target
  await locator.first().click({ force: true })
}

async function loadIde (page: Page) {
  // The AI-mode intro callout is covered by e2e-ai-mode-nudge.spec.ts; keep it
  // out of the way here (it appears on the first press inside the chat).
  await page.addInitScript(() => localStorage.setItem('remix_nudge_dismissed_permanent', JSON.stringify(['ai-mode-intro'])))
  await page.goto('http://127.0.0.1:8080/#lang=en')
  await expect(page.locator('[data-id="apploaded"]')).toBeAttached({ timeout: 90_000 })
  await expect(page.locator(sel.chatReady)).toBeAttached({ timeout: 90_000 })
  await removeOverlays(page)
  // Default layout: chat docked in the right panel
  await expect(page.locator(`${sel.rightPanel} ${sel.chatReady}`)).toBeAttached()
}

async function expectAiMode (page: Page) {
  await expect(page.locator(sel.switcher)).toHaveAttribute('data-active', 'ai')
  await expect(page.locator(sel.host)).toBeVisible()
  await expect(page.locator(`${sel.host} ${sel.chatReady}`)).toBeAttached()
  await expect(page.locator(sel.tabsSlot)).toHaveCount(0)
  await expect(page.locator(sel.bottomBarSlot)).toHaveCount(0)
}

async function expectCodeMode (page: Page) {
  await expect(page.locator(sel.switcher)).toHaveAttribute('data-active', 'code')
  await expect(page.locator(`${sel.host} ${sel.chatReady}`)).toHaveCount(0)
  await expect(page.locator(sel.tabsSlot)).toHaveCount(1)
  await expect(page.locator(sel.bottomBarSlot)).toHaveCount(1)
}

async function enterAiMode (page: Page) {
  await click(page, sel.aiBtn)
  await expectAiMode(page)
}

async function pinToRight (page: Page, plugin: string) {
  await click(page, `[data-id="verticalIconsKind${plugin}"]`)
  await click(page, `[data-pinnedplugin="movePluginToRight-${plugin}"]`)
}

test('topbar AI/Code switcher enters and leaves AI mode, restoring the previous center view', async ({ page }) => {
  await loadIde(page)
  // Home is the initial center view (itself a mainPanel view)
  await expect(page.locator(sel.mainSlot)).toHaveCount(1)

  await enterAiMode(page)
  await expect(page.locator(sel.rightPanel)).toBeHidden()

  await click(page, sel.codeBtn)
  await expectCodeMode(page)
  await expect(page.locator(`${sel.rightPanel} ${sel.chatReady}`)).toBeAttached()
  await expect(page.locator(sel.rightPanel)).toBeVisible()
  await expect(page.locator(sel.mainSlot)).toHaveCount(1)
  await expect(page.locator(sel.editorSlot)).toHaveCount(0)
})

test('entering AI mode hides every panel; leaving brings back exactly the ones that were open', async ({ page }) => {
  await loadIde(page)
  // The terminal starts hidden on the Home view; open it so every panel is showing
  await page.evaluate(async () => {
    const ai = (window as any).getRemixAIPlugin
    if (await ai.call('terminal', 'isPanelHidden')) await ai.call('terminal', 'togglePanel')
  })
  await expect(page.locator(sel.leftPanel)).toBeVisible()
  await expect(page.locator(sel.terminal)).toBeVisible()

  await enterAiMode(page)
  await expect(page.locator(sel.leftPanel)).toBeHidden()
  await expect(page.locator(sel.rightPanel)).toBeHidden()
  await expect(page.locator(sel.terminal)).toBeHidden()

  await click(page, sel.codeBtn)
  await expectCodeMode(page)
  await expect(page.locator(sel.leftPanel)).toBeVisible()
  await expect(page.locator(sel.rightPanel)).toBeVisible()
  await expect(page.locator(sel.terminal)).toBeVisible()

  // A panel closed before entering stays closed after leaving
  await page.evaluate(() => (window as any).getRemixAIPlugin.call('terminal', 'togglePanel'))
  await expect(page.locator(sel.terminal)).toBeHidden()
  await enterAiMode(page)
  await click(page, sel.codeBtn)
  await expectCodeMode(page)
  await expect(page.locator(sel.leftPanel)).toBeVisible()
  await expect(page.locator(sel.terminal)).toBeHidden()

  // Another plugin pinned right is hidden too, and comes back on exit
  await pinToRight(page, 'solidity')
  await expect(page.locator(`${sel.rightPanel} ${sel.panelTitle}`)).toHaveText(/Solidity compiler/i)
  await enterAiMode(page)
  await expect(page.locator(sel.rightPanel)).toBeHidden()
  await click(page, sel.codeBtn)
  await expectCodeMode(page)
  await expect(page.locator(sel.rightPanel)).toBeVisible()
  await expect(page.locator(`${sel.rightPanel} ${sel.panelTitle}`)).toHaveText(/Solidity compiler/i)
})

test('panel-header maximize enters AI mode and the chat header exit button leaves it', async ({ page }) => {
  await loadIde(page)

  await click(page, `${sel.rightPanel} [data-id="maximizeRightSidePanel"]`)
  await expectAiMode(page)

  await click(page, `${sel.host} [data-id="exit-ai-mode-btn"]`)
  await expectCodeMode(page)
  await expect(page.locator(`${sel.rightPanel} ${sel.chatReady}`)).toBeAttached()
})

test('pinning a plugin in AI mode keeps the chat in the center; leaving AI mode docks the chat left', async ({ page }) => {
  await loadIde(page)
  await enterAiMode(page)

  await pinToRight(page, 'solidity')
  await expectAiMode(page)
  await expect(page.locator(sel.rightPanel)).toBeVisible()
  await expect(page.locator(`${sel.rightPanel} ${sel.panelTitle}`)).toHaveText(/Solidity compiler/i)

  await click(page, sel.codeBtn)
  await expectCodeMode(page)
  // The pinned plugin keeps the right panel; the chat moved to the left panel
  await expect(page.locator(`${sel.rightPanel} ${sel.panelTitle}`)).toHaveText(/Solidity compiler/i)
  await expect(page.locator(`${sel.leftPanel} ${sel.chatReady}`)).toBeAttached()

  // AI mode can be re-entered from the left-docked state
  await enterAiMode(page)
})

test('moving the pinned plugin back left during AI mode hands the right panel back to the chat', async ({ page }) => {
  await loadIde(page)
  await enterAiMode(page)
  await pinToRight(page, 'solidity')
  await expect(page.locator(`${sel.rightPanel} ${sel.panelTitle}`)).toHaveText(/Solidity compiler/i)

  await click(page, `${sel.rightPanel} [data-pinnedplugin="movePluginToLeft-solidity"]`)
  await expectAiMode(page)
  await expect(page.locator(sel.rightPanel)).toBeHidden()

  await click(page, sel.codeBtn)
  await expectCodeMode(page)
  await expect(page.locator(`${sel.rightPanel} ${sel.chatReady}`)).toBeAttached()
  await expect(page.locator(`${sel.rightPanel} ${sel.panelTitle}`)).toHaveText(/RemixAI Assistant/i)
})

test('history opens inline on the right of the chat and RemixAI icons keep AI mode', async ({ page }) => {
  await loadIde(page)
  await enterAiMode(page)

  const historyBtn = page.locator(`${sel.host} [data-id="toggle-history-btn"]`)
  await click(page, historyBtn)
  const sidebar = page.locator(`${sel.host} [data-id="chat-history-sidebar"]`)
  await expect(sidebar).toBeVisible()
  const chatBox = await page.locator(`${sel.host} .always-show`).boundingBox()
  const sidebarBox = await sidebar.boundingBox()
  expect(sidebarBox.x).toBeGreaterThanOrEqual(chatBox.x + chatBox.width - 1)
  // Full height: the sidebar reaches the bottom of the center panel (not cut by the prompt)
  const hostBox = await page.locator(sel.host).boundingBox()
  expect(Math.abs((sidebarBox.y + sidebarBox.height) - (hostBox.y + hostBox.height))).toBeLessThanOrEqual(1)
  // Only the history toggle is highlighted, not the archive button next to it
  await expect(historyBtn).toHaveClass(/btn-primary/)
  await expect(page.locator(`${sel.host} [data-id="archive-chat-btn"]`)).not.toHaveClass(/btn-primary/)
  await click(page, historyBtn)
  await expect(sidebar).toHaveCount(0)

  // Neither RemixAI icon reveals the (now empty) side-panel container
  await click(page, '[data-id="remixai-assistant-icon"]')
  await expectAiMode(page)
  await expect(page.locator(sel.rightPanel)).toBeHidden()
  await click(page, '[data-id="verticalIconsKindremixaiassistant"]')
  await expectAiMode(page)
  await expect(page.locator(sel.rightPanel)).toBeHidden()
})

test('docked history fills the panel height and hides the prompt until Back to chat', async ({ page }) => {
  await loadIde(page)
  const prompt = page.locator(`${sel.rightPanel} section#remix-ai-prompt-area`)
  await expect(prompt).toBeVisible()
  await click(page, `${sel.rightPanel} [data-id="toggle-history-btn"]`)
  const sidebar = page.locator(`${sel.rightPanel} [data-id="chat-history-sidebar"]`)
  await expect(sidebar).toBeVisible()
  await expect(prompt).toBeHidden()
  const sidebarBox = await sidebar.boundingBox()
  const chatBox = await page.locator(`${sel.rightPanel} [data-id="remix-ai-assistant"]`).boundingBox()
  expect(Math.abs((sidebarBox.y + sidebarBox.height) - (chatBox.y + chatBox.height))).toBeLessThanOrEqual(1)
  await click(page, `${sel.rightPanel} [data-id="chat-history-back-btn"]`)
  await expect(prompt).toBeVisible()
})

test('toggling the right panel in AI mode (chat pinned right) stays in AI mode', async ({ page }) => {
  await loadIde(page)
  await enterAiMode(page)
  await click(page, '[data-id="toggleRightSidePanelIcon"]')
  await page.waitForTimeout(500)
  await expectAiMode(page)
  await expect(page.locator(sel.rightPanel)).toBeHidden()
})

test('the chat input keeps its height across mode and panel switches', async ({ page }) => {
  await loadIde(page)
  const input = page.locator('#remix-ai-prompt-input')
  const height = async () => Math.round((await input.boundingBox()).height)
  const initial = await height()
  expect(initial).toBeGreaterThan(40)
  for (let i = 0; i < 3; i++) {
    await enterAiMode(page)
    expect(await height()).toBe(initial)
    await click(page, sel.codeBtn)
    await expectCodeMode(page)
    expect(await height()).toBe(initial)
  }
  await click(page, '[data-id="toggleRightSidePanelIcon"]')
  await expect(page.locator(sel.rightPanel)).toBeHidden()
  await click(page, '[data-id="toggleRightSidePanelIcon"]')
  await expect(page.locator(sel.rightPanel)).toBeVisible()
  expect(await height()).toBe(initial)
})

test('the AI mode header has no top border (the topbar already draws it)', async ({ page }) => {
  await loadIde(page)
  await enterAiMode(page)
  const borderTop = await page.locator(`${sel.host} section`).first().evaluate((el) => getComputedStyle(el).borderTopWidth)
  expect(borderTop).toBe('0px')
})

test('a file opened programmatically keeps AI mode; a File Explorer click leaves it', async ({ page }) => {
  await loadIde(page)
  await enterAiMode(page)

  // What the AI agent does when it opens/edits a file
  await page.evaluate(() => (window as any).getRemixAIPlugin.call('fileManager', 'open', 'contracts/1_Storage.sol'))
  await page.waitForTimeout(1500)
  await expectAiMode(page)

  // AI mode hid the left panel; the user opens the File Explorer to pick a file
  await click(page, '[data-id="verticalIconsKindfilePanel"]')
  await expectAiMode(page)
  const file = page.locator(`${sel.leftPanel} [data-path="contracts/2_Owner.sol"]`)
  if (!(await file.isVisible())) await click(page, `${sel.leftPanel} [data-path="contracts"]`)
  await click(page, file)
  await expectCodeMode(page)
  await expect(page.locator(sel.editorSlot)).toHaveCount(1)
})
