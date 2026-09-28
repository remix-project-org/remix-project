import { test, expect } from '@playwright/test'

const BASE_URL = 'http://127.0.0.1:8080/'

interface TemplateConfig {
  templateValue: string
  cardDataId: string
  contractFile: string
}

// Template card data-ids use the index within the deduplicated items array of each category.
// DeFi Protocols: erc4626Vault(0), ammDex(1), lendingProtocol(2), stablecoin(3), derivativesProtocol(4), yieldAggregator(5)
// Governance & Identity: daoGovernance(0), ensSystem(1)
// Account Abstraction & Proxies: erc4337Account(0), proxyPatterns(1)
// NFT & Bridges: nftMarketplace(0), crossChainBridge(1)
const TEMPLATES: TemplateConfig[] = [
  { templateValue: 'ammDex',             cardDataId: 'template-card-ammDex-1',             contractFile: 'ConstantProductAMM.sol' },
  { templateValue: 'crossChainBridge',   cardDataId: 'template-card-crossChainBridge-1',   contractFile: 'L1Bridge.sol' },
  { templateValue: 'daoGovernance',      cardDataId: 'template-card-daoGovernance-0',      contractFile: 'GovernanceToken.sol' },
  { templateValue: 'derivativesProtocol',cardDataId: 'template-card-derivativesProtocol-4',contractFile: 'OptionsVault.sol' },
  { templateValue: 'ensSystem',          cardDataId: 'template-card-ensSystem-1',          contractFile: 'ENSRegistry.sol' },
  { templateValue: 'erc4337Account',     cardDataId: 'template-card-erc4337Account-0',     contractFile: 'SimpleAccount.sol' },
  { templateValue: 'erc4626Vault',       cardDataId: 'template-card-erc4626Vault-0',       contractFile: 'ERC4626Vault.sol' },
  { templateValue: 'lendingProtocol',    cardDataId: 'template-card-lendingProtocol-2',    contractFile: 'LendingPool.sol' },
  { templateValue: 'nftMarketplace',     cardDataId: 'template-card-nftMarketplace-0',     contractFile: 'NFTMarketplace.sol' },
  { templateValue: 'proxyPatterns',      cardDataId: 'template-card-proxyPatterns-1',      contractFile: 'TransparentProxy.sol' },
  { templateValue: 'stablecoin',         cardDataId: 'template-card-stablecoin-3',         contractFile: 'CDPVaultManager.sol' },
  { templateValue: 'yieldAggregator',    cardDataId: 'template-card-yieldAggregator-5',    contractFile: 'YieldVault.sol' },
]

for (const { templateValue, cardDataId, contractFile } of TEMPLATES) {
  test(`template ${templateValue}: create workspace and compile ${contractFile}`, async ({ page }) => {
    test.setTimeout(120000)

    await page.goto(BASE_URL)

    // Dismiss any notification popup
    try {
      await page.getByTitle('Dismiss').waitFor({ state: 'visible', timeout: 5000 })
      await page.getByTitle('Dismiss').click()
    } catch { /* not present */ }

    // Ensure file panel is visible
    await page.locator('[data-id="verticalIconsKindfilePanel"]').click()

    // Wait for workspace selector to be enabled, then open it
    await page.locator('[data-id="workspacesSelect"]').waitFor({ state: 'visible', timeout: 30000 })
    await page.locator('[data-id="workspacesSelect"]:not([data-disabled="true"])').waitFor({ timeout: 30000 })
    await page.locator('[data-id="workspacesSelect"]').click()

    // Click "Create" workspace in the dropdown
    await page.locator('[data-id="workspacecreate"]').waitFor({ state: 'visible', timeout: 10000 })
    await page.locator('[data-id="workspacecreate"]').click()

    // Wait for the template explorer modal and template list
    // await page.locator('[data-id="template-explorer-modal-react"]').waitFor({ state: 'visible', timeout: 10000 })
    await page.locator('[data-id="template-explorer-template-container"]').waitFor({ state: 'visible' })

    // Scroll to and click the template card
    await page.locator(`[data-id="${cardDataId}"]`).scrollIntoViewIfNeeded()
    await page.locator(`[data-id="${cardDataId}"]`).click()

    // Wait for workspace name input to confirm we're on the creation screen
    console.log(`Waiting for workspace name input for template ${templateValue}...`)
    await page.locator(`[data-id="workspace-name-${templateValue}-input"]`).waitFor({ state: 'visible', timeout: 10000 })

    // Create the workspace
    await page.locator(`[data-id="validate-${templateValue}workspace-button"]`).waitFor({ state: 'visible', timeout: 10000 })
    await page.locator(`[data-id="validate-${templateValue}workspace-button"]`).click()

    // Wait for workspace to be ready — contracts folder appears in file tree
    await page.locator('li[data-id="treeViewLitreeViewItemcontracts"]').waitFor({ state: 'visible', timeout: 30000 })

    // Click the target contract file to make it the active editor file
    await page.locator(`li[data-id="treeViewLitreeViewItemcontracts/${contractFile}"]`).waitFor({ state: 'visible', timeout: 10000 })
    await page.locator(`li[data-id="treeViewLitreeViewItemcontracts/${contractFile}"]`).click()

    // Switch to Solidity compiler panel
    await page.locator('[data-id="verticalIconsKindsolidity"]').click()
    await page.locator('[data-id="compilerContainerCompileBtn"]').waitFor({ state: 'visible', timeout: 10000 })

    // Compile and assert success — compiledContracts section appears only on success
    await page.locator('[data-id="compilerContainerCompileBtn"]').click()
    await expect(page.locator('[data-id="compiledContracts"]')).toBeVisible({ timeout: 60000 })
  })
}
