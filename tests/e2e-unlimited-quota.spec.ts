import { test, expect } from './helpers/e2e-pool'

test.use({ viewport: { width: 1440, height: 900 } })

/**
 * Scenario: user signed in under the `e2e-unlimited-quota` pool group has
 *   - Mistral Small: unlimited (Free tier "Free AI usage included")
 *   - Mistral Medium: gated by credits, but the account has 0 credits
 *
 * Expected behaviour:
 *   - Sending a prompt on Mistral Small succeeds (assistant streams a reply).
 *   - Switching to Mistral Medium and sending a prompt surfaces the
 *     "Insufficient credits" chat notice with a "Top up credits" action.
 */
test('Unlimited Mistral Small works, Mistral Medium shows insufficient credits', async ({ page }) => {
  test.setTimeout(240_000)

  const poolApiKey = process.env.E2E_POOL_API_KEY || process.env.E2E_POOL_KEY
  if (!poolApiKey) {
    throw new Error('Missing E2E pool key. Set E2E_POOL_API_KEY (or E2E_POOL_KEY) before running.')
  }

  const url = `http://localhost:8080/?#e2e_feature_groups=e2e-unlimited-quota&e2e_pool_key=${encodeURIComponent(poolApiKey)}&lang=en&optimize&runs=200&evmVersion&version=soljson-v0.8.34+commit.80d5c536.js`
  await page.goto(url)

  // --- 1. Sign in via topbar ----------------------------------------------
  await page.locator('[data-id="topbarSignInButton"]').click()
  await page.locator('[data-id="loginModalE2EPoolButton"]').click()
  await expect(page.locator('[data-id="user-menu-compact"]').first()).toBeVisible({ timeout: 30000 })

  // --- 2. Open the AI panel and pick Mistral Small ------------------------
  await page.locator('[data-id="verticalIconsKindremixaiassistant"]').click()
  await page.locator('[data-id="ai-model-selector-btn"]').click()
  await page.locator('[data-id="ai-model-mistral-small-latest"]').click()
  await expect(page.locator('[data-id="ai-model-selector-btn"]')).toContainText(/Mistral Small/i, { timeout: 10000 })

  // Wait for the route to be ready (badge flips out of "initializing").
  await expect(page.locator('[data-id="ai-route-status"]'))
    .toHaveAttribute('data-route', /agent|tools|chat/, { timeout: 30000 })

  // --- 3. Ask a trivial question — must succeed on the unlimited tier -----
  const promptInput = page.locator('[data-id="remix-ai-prompt-input"]')
  await promptInput.click()
  await promptInput.fill('Say "pong" and nothing else.')
  await page.locator('[data-id="remix-ai-composer-send-btn"]').click()

  await expect(page.locator('[data-id="ai-assistant-landing"]')).toBeHidden({ timeout: 15000 })
  const firstBubble = page.locator('[data-id="ai-response-chat-bubble-section"].me-3').first()
  await expect(firstBubble).toBeVisible({ timeout: 60000 })
  await expect.poll(
    async () => (await firstBubble.innerText()).trim().length,
    { timeout: 90000, intervals: [500, 1000, 2000] }
  ).toBeGreaterThan(2)

  // No insufficient-credits notice should have appeared on the Small reply.
  await expect(page.locator('[data-id="ai-chat-notice"]')).toHaveCount(0)

  // --- 4. Switch to Mistral Medium and ask again --------------------------
  await page.locator('[data-id="ai-model-selector-btn"]').click()
  await page.locator('[data-id="ai-model-mistral-medium-latest"]').click()
  await expect(page.locator('[data-id="ai-model-selector-btn"]')).toContainText(/Mistral Medium/i, { timeout: 10000 })

  await promptInput.click()
  await promptInput.fill('Say "pong" and nothing else.')
  await page.locator('[data-id="remix-ai-composer-send-btn"]').click()

  // --- 5. Verify the Insufficient credits notice + Top up action ---------
  const notice = page.locator('[data-id="ai-chat-notice"]')
  await expect(notice).toBeVisible({ timeout: 60000 })
  await expect(notice).toContainText(/Insufficient credits/i)
  await expect(notice).toContainText(/do not have enough credits/i)
  await expect(page.locator('[data-id="ai-chat-notice-action-topup-credits"]')).toBeVisible()
})
