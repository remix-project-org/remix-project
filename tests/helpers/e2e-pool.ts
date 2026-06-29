import { expect, type Page, test as base } from '@playwright/test'
import { releaseAccount } from '../../apps/remix-ide-e2e/src/helpers/pool'

interface BrowserPoolSession {
  sessionId?: string
}

async function getPoolSession(page: Page): Promise<BrowserPoolSession | null> {
  const raw = await page.evaluate(() => window.sessionStorage.getItem('remix_pool_session')).catch((error: any) => {
    console.warn('[PlaywrightPool] Could not read pool session from browser:', error?.message || error)
    return null
  })

  if (!raw) return null

  try {
    return JSON.parse(raw) as BrowserPoolSession
  } catch (error: any) {
    console.warn('[PlaywrightPool] Could not parse pool session:', error?.message || error)
    return null
  }
}

async function releasePoolSession(page: Page, title: string): Promise<void> {
  const session = await getPoolSession(page)
  if (!session?.sessionId) return

  console.log(`[PlaywrightPool] Releasing pool session for "${title}": ${session.sessionId}`)
  await releaseAccount(session.sessionId)
}

export const test = base.extend<{ releasePoolAfterTest: void }>({
  releasePoolAfterTest: [async ({ page }, use, testInfo) => {
    await use()
    await releasePoolSession(page, testInfo.title)
  }, { auto: true }]
})

export { expect }