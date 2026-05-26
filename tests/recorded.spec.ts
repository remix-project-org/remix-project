import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('http://127.0.0.1:8080/#lang=en&optimize&runs=200&evmVersion&version=soljson-v0.8.34+commit.80d5c536.js');
  await page.getByTitle('Dismiss').click();
  await page.getByRole('img', { name: 'planManager' }).click();
  await page.getByRole('button', { name: 'Open manager' }).click();
  await page.getByRole('heading', { name: 'Create a free account to use' }).dblclick();
  await page.getByRole('heading', { name: 'Create a free account to use' }).click();
  await page.getByRole('heading', { name: 'Create a free account to use' }).click();
  await expect(page.locator('h2')).toContainText('Create a free account to use Remix AI');
  await expect(page.getByRole('button', { name: ' Sign in to Remix' })).toBeVisible();
  await page.getByRole('button', { name: ' Sign in to Remix' }).click();
  await expect(page.getByRole('button', { name: ' Connect Ethereum Wallet' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue with Base' })).toBeVisible();
  await expect(page.getByRole('button', { name: ' Continue with Google' })).toBeVisible();
  const page1Promise = page.waitForEvent('popup');
  await page.getByRole('button', { name: ' Continue with GitHub' }).click();
  const page1 = await page1Promise;
});