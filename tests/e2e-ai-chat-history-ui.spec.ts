import { test, expect, Page } from '@playwright/test'

// RemixAI chat UI at narrow widths: the shortcut pills scroll sideways.

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
