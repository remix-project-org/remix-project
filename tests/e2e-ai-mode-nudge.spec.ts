import { test, expect, Page } from '@playwright/test'

// The one-time "Meet AI mode" callout under the topbar AI/Code switcher. It
// appears the first time the user reaches for the docked RemixAI chat, and is
// retired for good once closed or once the user enters AI mode.

test.use({ viewport: { width: 1600, height: 1000 } })
test.describe.configure({ mode: 'default', timeout: 180_000 })

const sel = {
  callout: '[data-id="nudge-callout"]',
  switcher: '[data-id="aiModeSwitcher"]',
  // Any press inside the docked chat counts (the input is disabled while signed out)
  dockedPrompt: '#right-side-panel [data-id="remix-ai-prompt-area"]',
  host: '#ai-chat-maximized-host',
  chatReady: '[data-id="remix-ai-assistant-ready"]'
}

async function removeOtherNudges (page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll('.nudge-widget, .nudge-modal-backdrop, .nudge-decoration, .modal-backdrop').forEach((el) => el.remove())
  })
}

async function loadIde (page: Page, { reload = false } = {}) {
  // goto() to the same URL only changes the hash (no reload), so a real reload
  // is needed to check what persists across visits.
  if (reload) await page.reload()
  else await page.goto('http://127.0.0.1:8080/#lang=en')
  await expect(page.locator('[data-id="apploaded"]')).toBeAttached({ timeout: 90_000 })
  await expect(page.locator(`#right-side-panel ${sel.chatReady}`)).toBeAttached({ timeout: 90_000 })
  await removeOtherNudges(page)
}

async function reachForChat (page: Page) {
  await page.locator(sel.dockedPrompt).click({ position: { x: 20, y: 10 }, force: true })
}

test('first press in the docked chat shows the callout under the switcher; "Try AI mode" enters AI mode', async ({ page }) => {
  await loadIde(page)
  await expect(page.locator(sel.callout)).toHaveCount(0)

  await reachForChat(page)
  const callout = page.locator(sel.callout)
  await expect(callout).toBeVisible({ timeout: 15_000 })
  await expect(callout).toContainText('Meet AI mode')

  // Anchored below the switcher, arrow pointing at its center
  const sw = await page.locator(sel.switcher).boundingBox()
  const box = await callout.boundingBox()
  expect(box.y).toBeGreaterThan(sw.y + sw.height)
  expect(box.y - (sw.y + sw.height)).toBeLessThan(20)
  expect(box.x).toBeLessThan(sw.x + sw.width / 2)
  expect(box.x + box.width).toBeGreaterThan(sw.x + sw.width / 2)

  await page.locator('[data-id="nudge-callout-primary"]').click()
  await expect(callout).toHaveCount(0)
  await expect(page.locator(`${sel.host} ${sel.chatReady}`)).toBeAttached()
  await page.locator('[data-id="codeModeBtn"]').click({ force: true })
  await expect(page.locator(`#right-side-panel ${sel.chatReady}`)).toBeAttached()

  // Once ever: not shown again after a reload
  await loadIde(page, { reload: true })
  await reachForChat(page)
  await page.waitForTimeout(4000)
  await expect(page.locator(sel.callout)).toHaveCount(0)
})

test('"Got it" closes the callout for good', async ({ page }) => {
  await loadIde(page)
  await reachForChat(page)
  await expect(page.locator(sel.callout)).toBeVisible({ timeout: 15_000 })
  await page.locator('[data-id="nudge-callout-secondary"]').click()
  await expect(page.locator(sel.callout)).toHaveCount(0)

  await loadIde(page, { reload: true })
  await reachForChat(page)
  await page.waitForTimeout(4000)
  await expect(page.locator(sel.callout)).toHaveCount(0)
})

test('entering AI mode before the callout ever shows retires it', async ({ page }) => {
  await loadIde(page)
  await page.locator('[data-id="aiReviewModeBtn"]').click({ force: true })
  await expect(page.locator(`${sel.host} ${sel.chatReady}`)).toBeAttached()
  await page.locator('[data-id="codeModeBtn"]').click({ force: true })
  await expect(page.locator(`#right-side-panel ${sel.chatReady}`)).toBeAttached()

  await reachForChat(page)
  await page.waitForTimeout(4000)
  await expect(page.locator(sel.callout)).toHaveCount(0)
})
