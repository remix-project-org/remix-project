import { test, expect } from '@playwright/test';

test('e2e-erc721-generation-with-form', async ({ page }) => {
  test.setTimeout(120000);
  const prompt = `
    generate an erc721, before you do it, let me specify it in a form.
    - dropdown for the Solidity framework (with options: openzeppelin, etc...)
    - text input for the name of the collection (input placeholder: My NFT Collection)
    - text input for the symbol of the collection (input placeholder: MNFT)
    - text input for the baseURI of the collection (input placeholder: https://my-nft-collection.com/)
    - number input for the max supply (input placeholder: Supply)
    - checkbox for allowing token holders to burn their tokens
    - validation button: Generate ERC-721
  `
  const poolApiKey = process.env.E2E_POOL_API_KEY || process.env.E2E_POOL_KEY
  if (!poolApiKey) {
    throw new Error('Missing E2E pool key. Set E2E_POOL_API_KEY (or E2E_POOL_KEY) before running.')
  }
  await page.goto(`http://127.0.0.1:8080/#e2e_feature_groups=e2e-unlimited-quota&e2e_pool_key=${encodeURIComponent(poolApiKey)}&lang=en&optimize&runs=200&evmVersion&version=soljson-v0.8.34+commit.80d5c536.js`);
  try {
    await page.getByTitle('Dismiss').waitFor({ state: 'visible', timeout: 50000 });
    await page.getByTitle('Dismiss').click();
  } catch { /* not present */ }
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await page.getByRole('button', { name: 'E2E Test Pool', exact: false }).click();
  try {
    await page.getByTitle('Dismiss').waitFor({ state: 'visible', timeout: 3000 });
    await page.getByTitle('Dismiss').click();
  } catch { /* not present */ }
  await page.getByRole('textbox', { name: 'Type "/" for more options or' }).click();
  await page.getByRole('textbox', { name: 'Type "/" for more options or' }).fill(prompt);
  await page.getByRole('textbox', { name: 'Type "/" for more options or' }).press('Enter');
  await page.getByRole('checkbox', { name: 'Auto-accept all changes' }).check();
  await page.getByRole('button', { name: 'Approve' }).click();
  await page.getByRole('combobox').waitFor({ state: 'visible' });
  await page.getByRole('combobox').selectOption('openzeppelin');
  await page.getByRole('textbox', { name: 'My NFT Collection' }).waitFor({ state: 'visible' });
  await page.getByRole('textbox', { name: 'My NFT Collection' }).click();
  await page.getByRole('textbox', { name: 'My NFT Collection' }).fill('CollectionName');
  await page.getByRole('textbox', { name: 'My NFT Collection' }).press('Tab');
  await page.getByRole('textbox', { name: 'MNFT' }).waitFor({ state: 'visible' });
  await page.getByRole('textbox', { name: 'MNFT' }).click();
  await page.getByRole('textbox', { name: 'MNFT' }).fill('SymbolY');
  await page.getByRole('textbox', { name: 'https://my-nft-collection.com/' }).waitFor({ state: 'visible' });
  await page.getByRole('textbox', { name: 'https://my-nft-collection.com/' }).click();
  await page.getByRole('textbox', { name: 'https://my-nft-collection.com/' }).fill('https://my-nft-collection.com/');
  await page.getByRole('checkbox', { name: 'Allow token holders to burn' }).check();
  await page.getByPlaceholder('Supply').waitFor({ state: 'visible' });
  await page.getByPlaceholder('Supply').click();
  await page.getByPlaceholder('Supply').fill('1000000');
  await page.locator('[data-id="remix-ai-streaming"][data-streaming="false"]').waitFor({ state: 'attached' });
  await page.getByRole('button', { name: 'Generate ERC-721' }).click();
  await page.getByRole('img', { name: 'filePanel' }).click();
  await page.getByText('contracts', { exact: true }).click();
  await page.locator('[data-test-id="virtuoso-item-list"]').getByText('CollectionName.sol').waitFor({ state: 'visible' })
  await page.locator('[data-test-id="virtuoso-item-list"]').getByText('CollectionName.sol').click();
  await page.getByText('CollectionName', { exact: true }).dblclick();
  await page.getByText('CollectionName', { exact: true }).first().dblclick();
  await expect(page.locator('#editorView')).toContainText('CollectionName');
});