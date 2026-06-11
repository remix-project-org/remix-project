import { test, expect } from '@playwright/test';

test('RemixAI action autocomplete panel should show available actions, selecting an action should copy the command to the input', async ({ page }) => {
  const poolApiKey = process.env.E2E_POOL_API_KEY || process.env.E2E_POOL_KEY
  if (!poolApiKey) {
    throw new Error('Missing E2E pool key. Set E2E_POOL_API_KEY (or E2E_POOL_KEY) in your environment before running this test.')
  }

  const url = `http://localhost:8080/?#e2e_feature_groups=e2e-free-tier&e2e_pool_key=${encodeURIComponent(poolApiKey)}&lang=en&optimize&runs=200&evmVersion&version=soljson-v0.8.34+commit.80d5c536.js`
  await page.goto(url);

  // --- 1. Sign in via topbar -----------------------------------------------
  await page.locator('[data-id="login-button"]').click()
  await page.locator('[data-id="loginModalE2EPoolButton"]').click()
  await expect(page.locator('[data-id="user-menu-compact"]').first()).toBeVisible({ timeout: 30000 })

  await page.getByRole('textbox', { name: 'Type "/" for more options or' }).click();
  await page.getByRole('textbox', { name: 'Type "/" for more options or' }).fill('/');
  await page.getByRole('button', { name: '/alchemy Fetch data from' }).click();
  await page.getByRole('textbox', { name: 'Type "/" for more options or' }).dblclick();
  await expect(page.getByPlaceholder('Type "/" for more options or')).toContainText('/alchemy:');
});