import { test, expect, Page, FrameLocator, Locator } from '@playwright/test'
import { test as poolTest } from './helpers/e2e-pool'

test.describe.serial('Circom hashchecker: trusted setup, zk dapp button, and zkVerify flows', () => {
  test.describe.configure({ timeout: 180_000 })

  let page: Page
  let circuitFrame: FrameLocator
  let terminalJournal: Locator

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    terminalJournal = page.locator('[data-id="terminalJournal"]')

    await page.goto('http://127.0.0.1:8080')

    // --- Wait for the IDE to finish loading ----------------------------------
    await expect(page.locator('[data-id="apploaded"]')).toBeAttached({ timeout: 60_000 })
    await page.evaluate(() => {
      document.querySelectorAll('#nudge-widget-container, .nudge-widget, .nudge-modal-backdrop, .nudge-decoration').forEach((el) => el.remove())
    })

    // --- Create a new workspace from the "Hash checker" circom template -----
    await page.locator('#icon-panel div[plugin="filePanel"]').click()
    const workspacesSelect = page.locator('[data-id="workspacesSelect"]')
    await expect(workspacesSelect).toBeVisible()
    await expect(workspacesSelect).not.toHaveAttribute('data-disabled', 'true')
    await workspacesSelect.click()
    await page.locator('[data-id="workspacecreate"]').click()
    await expect(page.locator('[data-id="template-explorer-template-container"]')).toBeVisible()

    const hashCheckerCategory = page.locator('[data-id="template-category-Circom ZKP"]')
    await hashCheckerCategory.scrollIntoViewIfNeeded()

    const hashCheckerCard = page.locator('[data-id="template-card-hashchecker-1"]')
    await expect(hashCheckerCard).toBeVisible()
    await hashCheckerCard.click()

    await page.locator('[data-id="validate-hashcheckerworkspace-button"]').click()

    // --- Open the generated circuit file -------------------------------------
    const circuitTreeItem = page.locator('[data-id="treeViewLitreeViewItemcircuits/calculate_hash.circom"]')
    await expect(circuitTreeItem).toBeVisible({ timeout: 30_000 })
    await circuitTreeItem.click()
    await expect(page.locator('[data-path="circuits/calculate_hash.circom"]')).toBeVisible()
    await expect(page.locator('[data-id="verticalIconsKindcircuit-compiler"]')).toBeVisible({ timeout: 30_000 })

    // --- Compile the circuit via the editor tab's compile action -----------
    // Show the terminal so we can assert on the compile result.
    await page.locator('[data-id="toggleBottomPanelIcon"]').click()
    await page.locator('[data-id="compile-action"]').click()
    await expect(terminalJournal).toContainText('Everything went okay', { timeout: 60_000 })

    // --- Open the circuit-compiler panel -------------------------------------
    const circuitIcon = page.locator('#icon-panel div[plugin="circuit-compiler"]')
    circuitFrame = page.frameLocator('#plugin-circuit-compiler')
    await circuitIcon.click()
    if (await page.locator('.sidepanel.d-none').count() > 0) {
      await circuitIcon.click()
    }

    await expect(circuitFrame.locator('[data-id="setup_exports_toggler"]')).toBeVisible({ timeout: 30_000 })
  })

  test.afterAll(async () => {
    await page.close()
  })

  async function runTrustedSetupAndWait () {
    const runSetupBtn = circuitFrame.locator('[data-id="runSetupBtn"]')
    await runSetupBtn.click()
    await expect(runSetupBtn.locator('.fa-spin')).toBeVisible({ timeout: 10_000 })
    await expect(runSetupBtn.locator('.fa-spin')).toHaveCount(0, { timeout: 120_000 })
  }

  async function ensureSetupSectionExpanded () {
    const isCollapsed = await circuitFrame.locator('[data-id="setup_exports_toggler"] .fa-angle-right').count() > 0
    if (isCollapsed) {
      await circuitFrame.locator('[data-id="setup_exports_toggler"]').click()
    }
  }

  test('Create ZK DApp button appears after running the Groth16 trusted setup', async () => {
    await expect(circuitFrame.locator('[data-id="create_zk_dapp_btn"]')).toHaveCount(0)

    await circuitFrame.locator('[data-id="groth16ProvingScheme"]').click()
    await runTrustedSetupAndWait()
    await expect(circuitFrame.locator('[data-id="setup_exports_toggler"] .fa-check-circle')).toBeVisible({ timeout: 15_000 })

    const createZkDappBtn = circuitFrame.locator('[data-id="create_zk_dapp_btn"]')
    await expect(createZkDappBtn).toBeVisible({ timeout: 15_000 })
    await expect(createZkDappBtn).toBeEnabled()
    await expect(createZkDappBtn).toContainText('Create ZK DApp')
  })

  test('zkVerify button is only shown for the Groth16 proving scheme, not Plonk', async () => {
    await ensureSetupSectionExpanded()
    await circuitFrame.locator('[data-id="plonkProvingScheme"]').click()
    await runTrustedSetupAndWait()

    await expect(circuitFrame.locator('[data-id="create_zk_dapp_btn"]')).toBeVisible({ timeout: 15_000 })
    await expect(circuitFrame.locator('[data-id="zkverify_btn"]')).toHaveCount(0)
  })

  test('zkVerify shows an error in the terminal when no API key is configured', async () => {
    await ensureSetupSectionExpanded()
    await circuitFrame.locator('[data-id="groth16ProvingScheme"]').click()
    await runTrustedSetupAndWait()
    await circuitFrame.locator('[data-id="circuit_input_value1"]').fill('1234')
    await circuitFrame.locator('[data-id="circuit_input_value2"]').fill('2')
    await circuitFrame.locator('[data-id="circuit_input_value3"]').fill('3')
    await circuitFrame.locator('[data-id="circuit_input_value4"]').fill('4')
    await circuitFrame.locator('[data-id="circuit_input_hash"]').fill('16382790289988537028417564277589554649233048801038362947503054340165041751802')

    const computeWitnessBtn = circuitFrame.locator('[data-id="compute_witness_btn"]')
    await computeWitnessBtn.click()
    await expect(computeWitnessBtn).toBeEnabled({ timeout: 30_000 })

    await circuitFrame.locator('[data-id="generateProofBtn"]').click()
    await expect(terminalJournal).toContainText('zk proof validity true', { timeout: 60_000 })

    await circuitFrame.locator('[data-id="zkverify_btn"]').click()
    await expect(terminalJournal).toContainText(
      'zkVerify error: zkVerify API key not configured. Please add it in Settings > Connected Services > zkVerify (Kurier).',
      { timeout: 30_000 }
    )
  })

  test('Create ZK DApp opens the verification method modal and warns about Remix VM', async () => {
    await circuitFrame.locator('[data-id="setup_exports_toggler"]').hover()
    await expect(circuitFrame.locator('.popover')).toHaveCount(0, { timeout: 10_000 })

    await circuitFrame.locator('[data-id="create_zk_dapp_btn"]').click()

    const modal = page.locator('[data-id="zkVerificationMethodModal"]')
    await expect(modal).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-id="zkVerificationMethodModalModalDialogModalTitle-react"]')).toContainText('Choose Verification Method')

    await page.locator('#zk-verification-method-onchain').check()
    await expect(modal).toContainText(
      'Select a live network (not Remix VM) from the Deploy & Run environment dropdown, deploy your verifier contract to it, then reopen this dialog.',
      { timeout: 15_000 }
    )

    // Close the modal so later tests reopen it fresh.
    await page.locator('[data-id="zkVerificationMethodModal-modal-footer-cancel-react"]').click()
    await expect(page.locator('[data-id="zkVerificationMethodModal"]')).toHaveCount(0)
  })
})
