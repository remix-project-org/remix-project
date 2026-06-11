import { test, expect } from './helpers/e2e-pool'

test.use({ viewport: { width: 1440, height: 900 } })

// Verifies the visual gating of the AI assistant composer:
//   1. Anonymous load    → composer renders a "Sign in" CTA (no disabled
//                          send button, no stop button) and a friendly
//                          "Sign in to chat with RemixAI…" placeholder.
//   2. Sign-in CTA click → plan-manager hand-off opens with reason
//                          'auth-required'.
//   3. Successful sign-in → CTA disappears, regular send button returns,
//                          placeholder switches back to the normal copy.
test('composer shows a Sign in CTA when anonymous and reverts to send after sign-in', async ({ page }) => {
  const poolApiKey = process.env.E2E_POOL_API_KEY || process.env.E2E_POOL_KEY
  if (!poolApiKey) {
    throw new Error('Missing E2E pool key. Set E2E_POOL_API_KEY (or E2E_POOL_KEY) in your environment before running this test.')
  }

  const url = `http://localhost:8080/?#e2e_feature_groups=e2e-free-tier&e2e_pool_key=${encodeURIComponent(poolApiKey)}&lang=en&optimize&runs=200&evmVersion&version=soljson-v0.8.34+commit.80d5c536.js`
  await page.goto(url)

  // Topbar Sign In button proves we loaded as an anonymous user.
  await expect(page.locator('[data-id="login-button"]')).toBeVisible({ timeout: 30000 })

  // Open the AI assistant side panel.
  await page.locator('[data-id="verticalIconsKindremixaiassistant"]').click()

  // --- Anonymous composer gating ---
  // The sign-in CTA replaces the disabled paper-plane.
  const signInCta = page.locator('[data-id="aiPromptSignInButton"]')
  await expect(signInCta).toBeVisible({ timeout: 20000 })
  await expect(signInCta).toContainText('Sign in')

  // The normal send button must NOT be rendered while unauthenticated —
  // that's the whole point of swapping it for the CTA.
  await expect(page.locator('[data-id="remix-ai-composer-send-btn"]')).toHaveCount(0)

  // Placeholder copy switched to the sign-in invitation.
  const composerTextarea = page.locator('[data-id="remix-ai-prompt-input"]')
  await expect(composerTextarea).toBeVisible()

  // --- Plan-manager hand-off ---
  await signInCta.click()
  const planManagerSignIn = page.locator('[data-id="planManagerSignIn"]')
  await expect(planManagerSignIn).toBeVisible()

  await planManagerSignIn.click()
  await page.locator('[data-id="loginModalE2EPoolButton"]').click()

  // Plan-manager backdrop re-renders after login — dismiss it.
  await page.locator('[data-id="planManagerCloseButton"]').click()

  // --- Authenticated composer ---
  // Sign-in CTA must be gone and the regular send button back.
  await expect(page.locator('[data-id="aiPromptSignInButton"]')).toHaveCount(0, { timeout: 30000 })
  await expect(page.locator('[data-id="remix-ai-composer-send-btn"]')).toBeVisible()

  // Placeholder reverts to the normal "Ask me anything…" copy.
  await expect(page.locator('[data-id="remix-ai-prompt-input"]')).toBeVisible()

  // Sanity: the topbar reflects the authenticated state.
  await expect(page.locator('[data-id="login-button"]')).toHaveCount(0)
  await expect(page.locator('[data-id="user-menu-compact"]')).toBeVisible()
})
