import { test, expect, Page } from '@playwright/test'

// AI mode "Changes" panel: files RemixAI changed in the current chat, and file
// writes waiting for approval, with their diff. The agent is simulated by
// emitting the remixAI plugin events it would send, so no model or sign-in.

test.use({ viewport: { width: 1600, height: 1000 } })
test.describe.configure({ mode: 'default', timeout: 180_000 })

const sel = {
  aiBtn: '[data-id="aiReviewModeBtn"]',
  switcher: '.ai-mode-toggle-group',
  host: '#ai-chat-maximized-host',
  chatReady: '[data-id="remix-ai-assistant-ready"]',
  toggle: '[data-id="toggle-changes-btn"]',
  toggleCount: '[data-id="toggle-changes-count"]',
  historyToggle: '[data-id="toggle-history-btn"]',
  panel: '[data-id="ai-changes-panel"]',
  fileRow: '[data-id="ai-changes-file-row"]',
  pendingRow: '[data-id="ai-changes-pending-row"]',
  diff: '[data-id="ai-changes-diff"]',
  diffPath: '[data-id="ai-changes-diff-path"]',
  stat: '[data-id="ai-changes-stat"]'
}

async function removeOverlays (page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll('#nudge-widget-container, .nudge-widget, .nudge-modal-backdrop, .nudge-decoration, .modal-backdrop').forEach((el) => el.remove())
  })
}

async function click (page: Page, target: string) {
  await removeOverlays(page)
  await page.mouse.move(0, 0)
  await page.locator(target).first().click({ force: true })
}

async function loadIdeInAiMode (page: Page) {
  await page.addInitScript(() => localStorage.setItem('remix_nudge_dismissed_permanent', JSON.stringify(['ai-mode-intro'])))
  await page.goto('http://127.0.0.1:8080/#lang=en')
  await expect(page.locator('[data-id="apploaded"]')).toBeAttached({ timeout: 90_000 })
  await expect(page.locator(sel.chatReady)).toBeAttached({ timeout: 90_000 })
  await click(page, sel.aiBtn)
  await expect(page.locator(sel.switcher)).toHaveAttribute('data-active', 'ai')
  await expect(page.locator(`${sel.host} ${sel.chatReady}`)).toBeAttached()
}

async function emitFileChanged (page: Page, change: { path: string, existed: boolean, oldContent: string, newContent: string, deleted?: boolean, movedFrom?: string }) {
  await page.evaluate((change) => {
    (window as any).getRemixAIPlugin.emit('onAIFileChanged', { ...change, timestamp: Date.now() })
  }, change)
}

async function emitApprovalRequired (page: Page, requestId: string, filePath: string, existingContent: string, proposedContent: string) {
  await page.evaluate(({ requestId, filePath, existingContent, proposedContent }) => {
    (window as any).getRemixAIPlugin.emit('onToolApprovalRequired', {
      requestId,
      toolName: 'write_file',
      toolArgs: { path: filePath, content: proposedContent },
      category: 'file_write',
      risk: 'high',
      existingContent,
      proposedContent,
      filePath,
      timestamp: Date.now()
    })
  }, { requestId, filePath, existingContent, proposedContent })
}

test('files changed by the agent are listed with their stats and diff, and open in the editor', async ({ page }) => {
  await loadIdeInAiMode(page)
  await expect(page.locator(sel.toggle)).toBeVisible()
  await expect(page.locator(sel.toggleCount)).toHaveCount(0)

  await emitFileChanged(page, { path: '/contracts/1_Storage.sol', existed: true, oldContent: 'a\nb\nc', newContent: 'a\nB\nc\nd' })
  await expect(page.locator(sel.toggleCount)).toHaveText('1')

  // A second change to the same file keeps one row, diffed against the content before the first change
  await emitFileChanged(page, { path: '/contracts/1_Storage.sol', existed: true, oldContent: 'a\nB\nc\nd', newContent: 'a\nB\nc\nd\ne' })
  await emitFileChanged(page, { path: '/contracts/New.sol', existed: false, oldContent: '', newContent: 'x\ny' })
  await expect(page.locator(sel.toggleCount)).toHaveText('2')

  await click(page, sel.toggle)
  await expect(page.locator(sel.panel)).toBeVisible()
  await expect(page.locator(sel.fileRow)).toHaveCount(2)
  // Latest change first
  await expect(page.locator(sel.fileRow).first()).toHaveAttribute('data-path', 'contracts/New.sol')
  const storageRow = page.locator(`${sel.fileRow}[data-path="contracts/1_Storage.sol"]`)
  await expect(storageRow).toContainText('edited')
  await expect(storageRow.locator(sel.stat)).toHaveText('+3 −1')
  // The simulated change is not what is on disk: flagged as changed since
  await expect(storageRow.locator('[data-id="ai-changes-stale-badge"]')).toBeVisible()

  await click(page, `${sel.fileRow}[data-path="contracts/1_Storage.sol"]`)
  await expect(page.locator(sel.diff)).toBeVisible()
  await expect(page.locator(sel.diffPath)).toHaveText('contracts/1_Storage.sol')
  await expect(page.locator(`${sel.diff} .monaco-diff-editor`)).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('[data-id="ai-changes-diff-notice"]')).toContainText('changed since')

  // Open in editor leaves AI mode on that file
  await click(page, '[data-id="ai-changes-open-editor-btn"]')
  await expect(page.locator(sel.switcher)).toHaveAttribute('data-active', 'code')
  await expect(page.locator('[data-id="tab-active"][data-path$="contracts/1_Storage.sol"]')).toBeVisible()
})

test('a file write waiting for approval opens the panel on its diff; accepting it moves on', async ({ page }) => {
  await loadIdeInAiMode(page)

  await emitApprovalRequired(page, 'e2e_approval_1', '/contracts/Pending.sol', 'one\ntwo', 'one\nTWO\nthree')
  await expect(page.locator(sel.panel)).toBeVisible()
  await expect(page.locator(sel.diff)).toBeVisible()
  await expect(page.locator(sel.diffPath)).toHaveText('contracts/Pending.sol')
  await expect(page.locator(`${sel.diff} ${sel.stat}`)).toHaveText('+2 −1')

  await click(page, '[data-id="ai-changes-accept-btn"]')
  await expect(page.locator(sel.diff)).toHaveCount(0)
  await expect(page.locator(sel.pendingRow)).toHaveCount(0)

  // History and changes share the right column
  await click(page, sel.historyToggle)
  await expect(page.locator(sel.panel)).toHaveCount(0)
  await click(page, sel.toggle)
  await expect(page.locator(sel.panel)).toBeVisible()
  await expect(page.locator('[data-id="chat-history-sidebar-title"]')).toHaveCount(0)
})

test('deleted and moved files are labelled; a file created then deleted in the chat disappears', async ({ page }) => {
  await loadIdeInAiMode(page)

  await emitFileChanged(page, { path: 'contracts/Old.sol', existed: true, oldContent: 'a\nb', newContent: '', deleted: true })
  await emitFileChanged(page, { path: 'contracts/Moved.sol', movedFrom: 'contracts/Before.sol', existed: true, oldContent: 'x', newContent: 'x' })
  await emitFileChanged(page, { path: 'contracts/Temp.sol', existed: false, oldContent: '', newContent: 'tmp' })
  await emitFileChanged(page, { path: 'contracts/Temp.sol', existed: true, oldContent: 'tmp', newContent: '', deleted: true })

  await click(page, sel.toggle)
  await expect(page.locator(sel.fileRow)).toHaveCount(2)
  const deletedRow = page.locator(`${sel.fileRow}[data-path="contracts/Old.sol"]`)
  await expect(deletedRow).toContainText('deleted')
  await expect(deletedRow.locator(sel.stat)).toHaveText('+0 −2')
  const movedRow = page.locator(`${sel.fileRow}[data-path="contracts/Moved.sol"]`)
  await expect(movedRow).toContainText('moved')
  await expect(movedRow).toContainText('moved from contracts/Before.sol')

  // A deleted file has nothing to open in the editor
  await click(page, `${sel.fileRow}[data-path="contracts/Old.sol"]`)
  await expect(page.locator(sel.diff)).toBeVisible()
  await expect(page.locator('[data-id="ai-changes-open-editor-btn"]')).toHaveCount(0)
})

test('a saved answer shows its file changes in place, grouped, with rejected edits muted', async ({ page }) => {
  await loadIdeInAiMode(page)

  // A conversation as saved after an answer that changed files
  await page.evaluate(async () => {
    const now = Date.now()
    const change = (path: string, anchor: string, extra: Record<string, any> = {}) => ({
      path, anchor, existed: true, oldContent: 'a\nb', newContent: 'a\nB\nc', timestamp: now, workspace: 'default_workspace', ...extra
    })
    const answer = "I'll add a guard to withdraw().\n\nNow the tests:\n\nDone, withdraw() is protected."
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const request = indexedDB.open('RemixAIChatHistory')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const tx = db.transaction(['conversations', 'messages'], 'readwrite')
    tx.objectStore('conversations').put({
      id: 'e2e-changes-conv', title: 'E2E file changes', createdAt: now, updatedAt: now, lastAccessedAt: now,
      archived: false, messageCount: 2, preview: 'Fix withdraw'
    })
    tx.objectStore('messages').put({ id: 'e2e-user', conversationId: 'e2e-changes-conv', role: 'user', content: 'Fix withdraw', timestamp: now })
    tx.objectStore('messages').put({
      id: 'e2e-answer', conversationId: 'e2e-changes-conv', role: 'assistant', content: answer, timestamp: now + 1,
      fileChanges: [
        change('contracts/Vault.sol', "I'll add a guard to withdraw()."),
        change('tests/Vault.test.js', 'Now the tests:', { existed: false, oldContent: '' }),
        change('contracts/Guard.sol', 'Now the tests:', { existed: false, oldContent: '' }),
        change('README.md', 'Now the tests:', { status: 'rejected' })
      ]
    })
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error) })
    db.close()
    await (window as any).getRemixAIPlugin.call('remixaiassistant', 'loadConversations')
  })

  await click(page, sel.historyToggle)
  await click(page, '[data-id="conversation-item-e2e-changes-conv"]')

  const answer = page.locator('.aiMarkup').filter({ has: page.locator('[data-id="ai-change-group"]') })
  await expect(answer.locator('[data-id="ai-change-group"]')).toHaveCount(2)
  // In place: the Vault edit sits between the first and second paragraphs
  const order = await answer.evaluate((el) => Array.from(el.querySelectorAll('p, [data-id="ai-change-line"], [data-id="ai-change-group-toggle"], [data-id="ai-change-line-rejected"]'))
    .map((node) => node.getAttribute('data-path') || node.getAttribute('data-id') === 'ai-change-group-toggle' && 'group' || node.textContent.trim()))
  expect(order).toEqual(["I'll add a guard to withdraw().", 'contracts/Vault.sol', 'Now the tests:', 'group', 'README.md', 'Done, withdraw() is protected.'])

  await expect(answer.locator('[data-id="ai-change-group-toggle"]')).toContainText('Edited 2 files')
  await expect(answer.locator('[data-id="ai-change-line-rejected"]')).toContainText('Rejected edit to README.md')

  // The panel lists what was written, not the rejected edit; a line opens its file there
  await click(page, '[data-id="ai-change-line"][data-path="contracts/Vault.sol"]')
  await expect(page.locator(sel.panel)).toBeVisible()
  await expect(page.locator(sel.diffPath)).toHaveText('contracts/Vault.sol')
  await click(page, '[data-id="ai-changes-back-btn"]')
  await expect(page.locator(sel.fileRow)).toHaveCount(3)
  await expect(page.locator(`${sel.fileRow}[data-path="README.md"]`)).toHaveCount(0)
})
