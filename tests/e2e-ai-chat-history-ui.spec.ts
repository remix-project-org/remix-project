import { test, expect, Page } from '@playwright/test'

// RemixAI chat UI at narrow widths and in the chat history list: the shortcut
// pills scroll sideways, and the history list shows hover, open-conversation
// and menu states in both themes. Conversations are written to IndexedDB, so
// no model or sign-in is needed.

test.use({ viewport: { width: 1600, height: 1000 } })
test.describe.configure({ mode: 'default', timeout: 180_000 })

async function removeOverlays (page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll('#nudge-widget-container, .nudge-widget, .nudge-modal-backdrop, .nudge-decoration, .modal-backdrop').forEach((el) => el.remove())
  })
}

async function loadIde (page: Page) {
  await page.addInitScript(() => localStorage.setItem('remix_nudge_dismissed_permanent', JSON.stringify(['ai-mode-intro'])))
  await page.goto('http://127.0.0.1:8080/#lang=en')
  await expect(page.locator('[data-id="apploaded"]')).toBeAttached({ timeout: 90_000 })
  await expect(page.locator('[data-id="remix-ai-assistant-ready"]').first()).toBeAttached({ timeout: 90_000 })
  await removeOverlays(page)
}

async function seedConversations (page: Page) {
  await page.evaluate(async () => {
    const now = Date.now()
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const request = indexedDB.open('RemixAIChatHistory')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const tx = db.transaction(['conversations', 'messages'], 'readwrite')
    const conversations: [string, string, number][] = [
      ['e2e-c1', 'Add reentrancy guard to Vault withdraw', 0],
      ['e2e-c2', 'Explain the ERC20 approve flow', 3 * 3600e3],
      ['e2e-c3', 'Optimise gas in storage writes', 30 * 3600e3]
    ]
    conversations.forEach(([id, title, ago], i) => {
      tx.objectStore('conversations').put({ id, title, createdAt: now - ago, updatedAt: now - ago, lastAccessedAt: now - ago, archived: false, messageCount: 2 + i, preview: title })
      tx.objectStore('messages').put({ id: `${id}-u`, conversationId: id, role: 'user', content: `Prompt: ${title}`, timestamp: now - ago })
      tx.objectStore('messages').put({ id: `${id}-a`, conversationId: id, role: 'assistant', content: `Answer: ${title}`, timestamp: now - ago + 1 })
    })
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error) })
    db.close()
    await (window as any).getRemixAIPlugin.call('remixaiassistant', 'loadConversations')
  })
}

const backgroundOf = (page: Page, selector: string) => page.locator(selector).first().evaluate((el) => getComputedStyle(el).backgroundColor)

test('shortcut pills scroll sideways in a narrow chat, with faded edges', async ({ page }) => {
  await loadIde(page)
  const row = page.locator('#right-side-panel [data-id="shortcut-pills"]')
  await expect(row).toBeVisible()

  const setPanelWidth = (width: number) => page.evaluate((width) => {
    const panel = document.getElementById('right-side-panel')
    panel.style.transition = 'none'
    panel.style.width = `${width}px`
  }, width)

  await setPanelWidth(331)
  await expect.poll(() => row.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
  await expect(row).toHaveClass(/ai-shortcut-pills-fade-end/)
  await expect(row).not.toHaveClass(/ai-shortcut-pills-fade-start/)

  // The mouse wheel scrolls the row to its last pill, which is then inside the row
  await row.hover()
  for (let i = 0; i < 5; i++) await page.mouse.wheel(0, 200)
  await expect(row).toHaveClass(/ai-shortcut-pills-fade-start/)
  await expect(row).not.toHaveClass(/ai-shortcut-pills-fade-end/)
  const lastPillInside = await row.evaluate((el) => {
    const last = el.lastElementChild.getBoundingClientRect()
    const box = el.getBoundingClientRect()
    return last.left >= box.left - 1 && last.right <= box.right + 1
  })
  expect(lastPillInside).toBe(true)

  // Wide enough: no scrolling, no fade
  await setPanelWidth(700)
  await expect(row).not.toHaveClass(/ai-shortcut-pills-fade-start/)
  await expect(row).not.toHaveClass(/ai-shortcut-pills-fade-end/)
})

for (const theme of ['Dark', 'Light']) {
  test(`chat history shows hover, open conversation and menus clearly (${theme} theme)`, async ({ page }) => {
    await loadIde(page)
    await page.evaluate((theme) => (window as any).getRemixAIPlugin.call('theme', 'switchTheme', theme), theme)
    await seedConversations(page)
    await page.locator('[data-id="aiReviewModeBtn"]').click({ force: true })
    await expect(page.locator('.ai-mode-toggle-group')).toHaveAttribute('data-active', 'ai')
    await removeOverlays(page)
    const host = '#ai-chat-maximized-host'
    await page.locator(`${host} [data-id="toggle-history-btn"]`).click({ force: true })

    const item = (id: string) => `${host} [data-id="conversation-item-${id}"]`
    await expect(page.locator(item('e2e-c2'))).toBeVisible()
    await expect(page.locator(`${item('e2e-c1')} [data-id="conversation-item-title"]`)).toHaveText('Add reentrancy guard to Vault withdraw')

    // Titles stand out from the list background more than the muted date and message count
    const contrast = await page.locator(item('e2e-c2')).evaluate((el) => {
      const canvas = document.createElement('canvas').getContext('2d')
      // Resolves any CSS colour (color-mix, rgb, ...) to its rendered sRGB value
      const luminance = (colour: string) => {
        canvas.clearRect(0, 0, 1, 1)
        canvas.fillStyle = colour
        canvas.fillRect(0, 0, 1, 1)
        const [r, g, b] = Array.from(canvas.getImageData(0, 0, 1, 1).data)
        return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
      }
      let background = 'rgba(0, 0, 0, 0)'
      for (let node: HTMLElement = el.parentElement; node && background === 'rgba(0, 0, 0, 0)'; node = node.parentElement) background = getComputedStyle(node).backgroundColor
      const bg = luminance(background)
      return {
        title: Math.abs(luminance(getComputedStyle(el.querySelector('[data-id="conversation-item-title"]')).color) - bg),
        meta: Math.abs(luminance(getComputedStyle(el.querySelector('[data-id="conversation-item-meta"]')).color) - bg)
      }
    })
    expect(contrast.title).toBeGreaterThan(0.45)
    expect(contrast.title).toBeGreaterThan(contrast.meta)

    // Hover: a visible background and the menu button appears
    await page.mouse.move(5, 5)
    const idle = await backgroundOf(page, item('e2e-c2'))
    const menuButton = page.locator(`${host} [data-id="conversation-menu-e2e-c2"]`)
    await expect(menuButton).toHaveCSS('opacity', '0')
    await page.locator(item('e2e-c2')).hover()
    await expect.poll(() => backgroundOf(page, item('e2e-c2'))).not.toBe(idle)
    await expect(menuButton).toHaveCSS('opacity', '1')
    const buttonIdle = await menuButton.evaluate((el) => getComputedStyle(el).backgroundColor)
    await menuButton.hover()
    await expect.poll(() => menuButton.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(buttonIdle)

    // The menu opens below its button and leaves the title visible
    await menuButton.click()
    const menu = page.locator('.conversation-menu')
    await expect(menu).toBeVisible()
    const [menuBox, buttonBox, titleBox] = await Promise.all([menu.boundingBox(), menuButton.boundingBox(), page.locator(`${item('e2e-c2')} [data-id="conversation-item-title"]`).boundingBox()])
    expect(menuBox.y).toBeGreaterThanOrEqual(buttonBox.y + buttonBox.height)
    expect(menuBox.y).toBeGreaterThanOrEqual(titleBox.y + titleBox.height)
    expect(Math.abs(menuBox.x + menuBox.width - (buttonBox.x + buttonBox.width))).toBeLessThanOrEqual(2)
    // Closes on Escape and on a click anywhere else, including the chat area
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    await menuButton.click()
    await expect(menu).toBeVisible()
    await page.mouse.click(800, 600)
    await expect(menu).toHaveCount(0)

    // The open conversation: tinted background and a bar on its left edge
    await page.locator(item('e2e-c1')).click()
    await expect(page.locator(item('e2e-c1'))).toHaveClass(/conversation-item-active/)
    await page.mouse.move(5, 5)
    await expect.poll(() => backgroundOf(page, item('e2e-c1'))).not.toBe(idle)
    const bar = await page.locator(item('e2e-c1')).evaluate((el) => getComputedStyle(el, '::before').width)
    expect(bar).toBe('3px')

    // Delete all is in the header menu, not next to the archive filter
    await expect(page.locator(`${host} [data-id="delete-all-conversations-btn"]`)).toHaveCount(0)
    await page.locator(`${host} [data-id="chat-history-menu-btn"]`).click()
    await expect(page.locator(`${host} [data-id="delete-all-conversations-btn"]`)).toHaveText('Delete all conversations')
    await page.locator(`${host} [data-id="chat-history-menu-btn"]`).click()
    await expect(page.locator(`${host} [data-id="delete-all-conversations-btn"]`)).toHaveCount(0)
  })
}
