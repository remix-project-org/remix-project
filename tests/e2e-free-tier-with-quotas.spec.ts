import { test, expect } from './helpers/e2e-pool';

test.use({ viewport: { width: 1440, height: 900 } })

test('test', async ({ page }) => {
  const poolApiKey = process.env.E2E_POOL_API_KEY || process.env.E2E_POOL_KEY
  if (!poolApiKey) {
    throw new Error('Missing E2E pool key. Set E2E_POOL_API_KEY (or E2E_POOL_KEY) in your environment before running this test.')
  }

  const url = `http://localhost:8080/?#e2e_feature_groups=e2e-free-with-quotas&e2e_pool_key=${encodeURIComponent(poolApiKey)}&lang=en&optimize&runs=200&evmVersion&version=soljson-v0.8.34+commit.80d5c536.js`
  await page.goto(url);
  await page.locator('[data-id="login-button"]').click();
  await page.locator('[data-id="loginModalE2EPoolButton"]').click();
  await page.locator('[data-id="user-menu-compact"]').first().click();
  await expect(page.getByText('[e2e]-free-with-quotas')).toBeVisible();
  await expect(page.locator('[data-id="userMenuManagePlanButton"]')).toBeVisible();
  await expect(page.getByText('Your Plan')).toBeVisible();
  await page.locator('[data-id="userMenuManagePlanButton"]').click();
  await page.pause();
  //await expect(page.getByText('Unlock more credits')).toBeVisible();
  await expect(page.locator('[data-id="planManagerNav-plans"]')).toBeVisible();
  await page.locator('[data-id="planManagerNav-plans"]').click();
  await page.locator('[data-id="planManagerCloseButton"]').click();

  // Switch to Mistral Medium for faster runs
  await page.locator('[data-id="ai-model-selector-btn"]').click();
  await page.locator('[data-id="ai-model-mistral-medium-latest"]').click();

  await page.locator('[data-id="remix-ai-prompt-input"]').click();
  await page.locator('[data-id="remix-ai-prompt-input"]').fill('what contracts do I have');
  await page.locator('[data-id="remix-ai-composer-send-btn"]').click();

  await page.waitForTimeout(5000);
    await page.locator('[data-id="user-menu-compact"]').click();
  await page.locator('[data-id="userMenuManagePlanButton"]').click();

  const mistralQuota = page.locator('[data-quota-model="mistral-medium-latest"]')
  await expect(mistralQuota).toBeVisible({ timeout: 60000 })

  // Quota panel can lag a beat behind the backend usage write — poll until
  // we observe a non-zero used value (or time out).
  await expect.poll(
    async () => Number(await mistralQuota.getAttribute('data-quota-used')),
    { timeout: 30000, intervals: [1000, 2000, 3000] }
  ).toBeGreaterThan(0)

  const usedValue = Number(await mistralQuota.getAttribute('data-quota-used'))
  console.log('Used quota value:', usedValue)
  expect(usedValue).toBeGreaterThan(0)


});