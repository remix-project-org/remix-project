import { test, expect } from './helpers/e2e-pool'

test.use({ viewport: { width: 1440, height: 900 } })

// Contract with a 3-param constructor (uint256, string, address) — simple
// scalar types that the AI handles reliably without bytes-padding issues.
const CONTRACT_WITH_CONSTRUCTOR = `// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

contract ParamTest {
    uint256 public count;
    string public label;
    address public owner;

    constructor(uint256 _count, string memory _label, address _owner) {
        count = _count;
        label = _label;
        owner = _owner;
    }

    function update(uint256 _count, string memory _label) public {
        count = _count;
        label = _label;
    }
}
`

async function signIn(page: any, poolApiKey: string) {
  const url = `http://127.0.0.1:8080/?#e2e_feature_groups=e2e-unlimited-quota&e2e_pool_key=${encodeURIComponent(poolApiKey)}&lang=en&optimize&runs=200&evmVersion&version=soljson-v0.8.34+commit.80d5c536.js`
  await page.goto(url)
  try {
    await page.getByTitle('Dismiss').waitFor({ state: 'visible', timeout: 5000 });
    await page.getByTitle('Dismiss').click();
  } catch { /* not present */ }
  await page.locator('[data-id="login-button"]').click()
  await page.locator('[data-id="loginModalE2EPoolButton"]').click()
  await expect(page.locator('[data-id="user-menu-compact"]').first()).toBeVisible({ timeout: 30000 })
  await expect(page.locator('[data-id="planManagerStubOpenButton"]')).toBeVisible({ timeout: 10000 })
  await page.locator('[data-id="verticalIconsKindfilePanel"]').click()
}

async function loadAndCompileContract(page: any, source: string) {
  // Open an existing file so the editor is active, then replace its content
  await page.locator('li[data-id="treeViewLitreeViewItemcontracts"]').click()
  await page.locator('li[data-id="treeViewLitreeViewItemcontracts/1_Storage.sol"]').click()
  await page.evaluate((code: string) => {
    const elem: any = document.getElementById('editorView')
    elem.setCurrentContent(code)
  }, source)

  // Compile
  await page.locator('[data-id="verticalIconsKindsolidity"]').click()
  await page.locator('[data-id="compilerContainerCompileBtn"]').click()
  // Wait for compilation success — compiled contracts list appears
  await expect(page.locator('[data-id="compiledContracts"]')).toBeVisible({ timeout: 30000 })
}

/**
 * Test: Auto fill with AI — constructor inputs
 *
 * Steps:
 *   1. Sign in via E2E pool
 *   2. Load and compile a contract with a 3-param constructor
 *   3. Open the Deploy & Run tab
 *   4. Verify the three constructor inputs are visible and empty
 *   5. Click the "Auto" (auto-fill) button
 *   6. Assert all three inputs receive non-empty values from the AI
 */
test('auto fill with AI populates constructor inputs', async ({ page }) => {
  test.setTimeout(180_000)

  const poolApiKey = process.env.E2E_POOL_API_KEY || process.env.E2E_POOL_KEY
  if (!poolApiKey) {
    throw new Error('Missing E2E pool key — set E2E_POOL_API_KEY before running this test.')
  }

  await signIn(page, poolApiKey)
  await loadAndCompileContract(page, CONTRACT_WITH_CONSTRUCTOR)

  // Open the Deploy & Run tab
  await page.locator('[data-id="verticalIconsKindudapp"]').click()

  // Wait for the constructor inputs to be rendered
  await expect(page.locator('[data-id="constructorInput0"]')).toBeVisible({ timeout: 15000 })
  await expect(page.locator('[data-id="constructorInput1"]')).toBeVisible()
  await expect(page.locator('[data-id="constructorInput2"]')).toBeVisible()

  // Inputs must start empty
  await expect(page.locator('[data-id="constructorInput0"]')).toHaveValue('')
  await expect(page.locator('[data-id="constructorInput1"]')).toHaveValue('')
  await expect(page.locator('[data-id="constructorInput2"]')).toHaveValue('')

  // The "Auto" button should be visible and enabled
  const autoFillBtn = page.locator('[data-id="deploy-auto-fill-with-ai"]')
  await expect(autoFillBtn).toBeVisible()
  await expect(autoFillBtn).toBeEnabled()

  // Click Auto fill — this calls remixAI.basic_prompt and populates inputs directly
  await autoFillBtn.click()

  // Button should enter a loading/disabled state while the AI is working
  await expect(autoFillBtn).toBeDisabled({ timeout: 5000 })

  // Wait for the first input to receive a non-empty value (generous timeout for AI latency)
  await expect.poll(
    async () => (await page.locator('[data-id="constructorInput0"]').inputValue()).trim().length,
    { timeout: 120_000, intervals: [2000, 3000, 5000] }
  ).toBeGreaterThan(0)

  // All three inputs should now have values
  const val0 = await page.locator('[data-id="constructorInput0"]').inputValue()
  const val1 = await page.locator('[data-id="constructorInput1"]').inputValue()
  const val2 = await page.locator('[data-id="constructorInput2"]').inputValue()

  expect(val0.trim(), 'constructor param 0 (uint256) should be filled').not.toBe('')
  expect(val1.trim(), 'constructor param 1 (string) should be filled').not.toBe('')
  expect(val2.trim(), 'constructor param 2 (address) should be filled').not.toBe('')

  // Button should have returned to enabled state after the AI responded
  await expect(autoFillBtn).toBeEnabled({ timeout: 10000 })
})

/**
 * Test: Auto fill with AI — deployed contract function inputs
 *
 * Steps:
 *   1. Sign in, compile and deploy ParamTest with dummy constructor args
 *   2. Expand the deployed contract, locate the `update` function
 *   3. Click "Auto" next to that function
 *   4. Assert both function inputs (uint256, string) receive non-empty values
 */
test('auto fill with AI populates deployed contract function inputs', async ({ page }) => {
  test.setTimeout(180_000)

  const poolApiKey = process.env.E2E_POOL_API_KEY || process.env.E2E_POOL_KEY
  if (!poolApiKey) {
    throw new Error('Missing E2E pool key — set E2E_POOL_API_KEY before running this test.')
  }

  await signIn(page, poolApiKey)
  await loadAndCompileContract(page, CONTRACT_WITH_CONSTRUCTOR)

  // Open Deploy & Run tab
  await page.locator('[data-id="verticalIconsKindudapp"]').click()
  await expect(page.locator('[data-id="constructorInput0"]')).toBeVisible({ timeout: 15000 })

  // Fill constructor params manually so we can deploy
  await page.locator('[data-id="constructorInput0"]').fill('42')
  await page.locator('[data-id="constructorInput1"]').fill('hello')
  await page.locator('[data-id="constructorInput2"]').fill('0x0000000000000000000000000000000000000001')

  // Deploy
  await page.locator('[data-id="deployButton"]').click()

  // Wait for the deployed contract card to appear
  const deployedCard = page.locator('[data-shared="universalDappUiInstance"]').first()
  await expect(deployedCard).toBeVisible({ timeout: 30000 })

  // The `update` function has 2 inputs — its auto-fill button is fn index 0 in the ABI
  // (sorted ABIs put functions alphabetically; use the data-id suffix to target it)
  // Find the auto-fill button for the first multi-input function
  const fnAutoFillBtn = page.locator('[data-id^="deployed-auto-fill-with-ai-fn-"]').first()
  await expect(fnAutoFillBtn).toBeVisible({ timeout: 10000 })
  await expect(fnAutoFillBtn).toBeEnabled()

  // Identify which function this button belongs to by reading its data-id suffix
  const btnDataId = await fnAutoFillBtn.getAttribute('data-id') ?? ''
  const fnIndex = parseInt(btnDataId.replace('deployed-auto-fill-with-ai-fn-', ''), 10)

  // The inputs for this function use data-id="input-{contractIndex}-{fnIndex}-{paramIndex}"
  // contractIndex is 0 (first deployed contract)
  const fnInput0 = page.locator(`[data-id="input-0-${fnIndex}-0"]`)
  const fnInput1 = page.locator(`[data-id="input-0-${fnIndex}-1"]`)

  await expect(fnInput0).toBeVisible()
  await expect(fnInput0).toHaveValue('')
  await expect(fnInput1).toHaveValue('')

  // Click Auto fill for this function
  await fnAutoFillBtn.click()
  await expect(fnAutoFillBtn).toBeDisabled({ timeout: 5000 })

  // Wait for inputs to be populated
  await expect.poll(
    async () => (await fnInput0.inputValue()).trim().length,
    { timeout: 120_000, intervals: [2000, 3000, 5000] }
  ).toBeGreaterThan(0)

  const fnVal0 = await fnInput0.inputValue()
  const fnVal1 = await fnInput1.inputValue()

  expect(fnVal0.trim(), 'function param 0 (uint256) should be filled').not.toBe('')
  expect(fnVal1.trim(), 'function param 1 (string) should be filled').not.toBe('')

  await expect(fnAutoFillBtn).toBeEnabled({ timeout: 10000 })
})
