import { test, expect } from './helpers/e2e-pool';

test.use({ viewport: { width: 1440, height: 900 } })

test('test', async ({ page }) => {
  const poolApiKey = process.env.E2E_POOL_API_KEY || process.env.E2E_POOL_KEY
  if (!poolApiKey) {
    throw new Error('Missing E2E pool key. Set E2E_POOL_API_KEY (or E2E_POOL_KEY) in your environment before running this test.')
  }

  const url = `http://localhost:8080/?#e2e_feature_groups=e2e-free-tier&e2e_pool_key=${encodeURIComponent(poolApiKey)}&lang=en&optimize&runs=200&evmVersion&version=soljson-v0.8.34+commit.80d5c536.js`
  await page.goto(url);

  // Sanity-check that the topbar Sign In button is rendered (we do NOT click it
  // here — we want to sign in through the plan-manager hand-off instead).
  await expect(page.locator('[data-id="login-button"]')).toBeVisible({ timeout: 30000 });

  // Activate the AI assistant side panel.
  await page.locator('[data-id="verticalIconsKindremixaiassistant"]').click();

  // Pre-login: model picker should show no usable models. The anonymous
  // fallback renders a single "Sign in to use AI models" placeholder which
  // is marked locked. Clicking it must launch the plan-manager sign-in prompt.
  await page.locator('[data-id="ai-model-selector-btn"]').click();
  const signInPlaceholder = page.locator('[data-id="ai-model---signin--"]')
  await expect(signInPlaceholder).toBeVisible();
  await expect(signInPlaceholder).toHaveAttribute('data-locked', 'true');
  // No unlocked model should be available to an anonymous user.
  await expect(page.locator('[data-id^="ai-model-"][data-locked="false"]')).toHaveCount(0);
  await signInPlaceholder.click();

  // Plan-manager opens with the sign-in prompt (auth-required hand-off).
  const planManagerSignIn = page.locator('[data-id="planManagerSignIn"]')
  await expect(planManagerSignIn).toBeVisible();

  // Sign in through the plan-manager button instead of the topbar.
  await planManagerSignIn.click();
  await page.locator('[data-id="loginModalE2EPoolButton"]').click();

  // After successful sign-in the LoginModal auto-closes; the plan-manager
  // re-renders with the (empty) account view behind its backdrop. Close it so
  // we can interact with the topbar.
  await page.locator('[data-id="planManagerCloseButton"]').click();

  // Verify the topbar reflects the loaded tier: the Sign In button is gone,
  // the user-menu-compact (titled with the pool account name) is visible, and
  // opening it shows the expected feature badge for the free tier ("AI BASIC").
  await expect(page.locator('[data-id="login-button"]')).toHaveCount(0);
  const userMenu = page.locator('[data-id="user-menu-compact"]')
  await expect(userMenu).toBeVisible();
  await expect(userMenu).toHaveAttribute('title', /E2E Pool/i);
  await userMenu.click();
  await expect(page.getByText('[e2e]-free-tier')).toBeVisible();
  // A feature badge for the loaded tier should render in the dropdown.
  await expect(page.locator('[data-id^="feature-badge-name-"]').first()).toBeVisible();
  await expect(page.locator('[data-id^="feature-badge-name-"]').filter({ hasText: '[e2e]-free-tier' })).toBeVisible();

  await expect(page.locator('[data-id="userMenuManagePlanButton"]')).toBeVisible();
  await expect(page.getByText('Your Plan')).toBeVisible();
  await page.locator('[data-id="userMenuManagePlanButton"]').click();
  await expect(page.getByText('You\'ve used all your credits')).toBeVisible();
  await expect(page.locator('[data-id="planManagerNav-plans"]')).toBeVisible();
  await page.locator('[data-id="planManagerNav-plans"]').click();
  await page.locator('[data-id="planManagerCloseButton"]').click();
  await page.locator('[data-id="remix-ai-prompt-input"]').click();
  await page.locator('[data-id="remix-ai-prompt-input"]').fill('hi');
  await page.locator('[data-id="remix-ai-composer-send-btn"]').click();
  await page.getByText('Insufficient credits').click();
  await page.getByText('Insufficient credits').click();
  await expect(page.getByText('Insufficient credits')).toBeVisible();
  await page.locator('[data-id="ai-chat-notice-action-topup-credits"]').click();
  await page.getByText('No top-up packages available').click();
  await expect(page.getByText('No top-up packages available')).toBeVisible();

  // Close the plan manager before interacting with the composer model picker.
  await page.locator('[data-id="planManagerCloseButton"]').click();

  // Locked model gating: free tier should NOT have access to Codestral.
  // Open the model picker and assert the Codestral entry is locked.
  /*
  await page.locator('[data-id="ai-model-selector-btn"]').click();
  const codestralOption = page.locator('[data-id="ai-model-codestral-latest"]')
  await expect(codestralOption).toBeVisible();
  await expect(codestralOption).toHaveAttribute('data-locked', 'true');
  await expect(codestralOption.getByText('Upgrade plan')).toBeVisible();
  // Clicking the locked option should open the plan-manager Plans view
  // with a "required feature" banner referencing the codestral feature flag.
  await codestralOption.click();
  await expect(page.locator('[data-id="pm-plans-view"]')).toBeVisible();
  await expect(page.locator('[data-id="pm-plans-required-feature"]')).toBeVisible();
  */
});