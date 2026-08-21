import { test, expect, Page, FrameLocator, Locator } from '@playwright/test'

test.describe.serial('Noir multiplier: proof generation and zk dapp button flows', () => {
  test.describe.configure({ timeout: 240_000 })

  let page: Page
  let noirFrame: FrameLocator
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

    // --- Create a new workspace from the "Simple Multiplier" Noir template --
    await page.locator('#icon-panel div[plugin="filePanel"]').click()
    const workspacesSelect = page.locator('[data-id="workspacesSelect"]')
    await expect(workspacesSelect).toBeVisible()
    await expect(workspacesSelect).not.toHaveAttribute('data-disabled', 'true')
    await workspacesSelect.click()
    await page.locator('[data-id="workspacecreate"]').click()

    await expect(page.locator('[data-id="template-explorer-template-container"]')).toBeVisible()

    const noirCategory = page.locator('[data-id="template-category-Noir ZKP"]')
    await noirCategory.scrollIntoViewIfNeeded()

    const multiplierCard = page.locator('[data-id="template-card-multNr-0"]')
    await expect(multiplierCard).toBeVisible()
    await multiplierCard.click()

    await page.locator('[data-id="validate-multNrworkspace-button"]').click()
    await expect(page.locator('[data-id="verticalIconsKindnoir-compiler"]')).toBeVisible({ timeout: 30_000 })

    const noirIcon = page.locator('#icon-panel div[plugin="noir-compiler"]')
    const filePanelIcon = page.locator('#icon-panel div[plugin="filePanel"]')
    noirFrame = page.frameLocator('#plugin-noir-compiler')
    await noirIcon.click()
    if (await page.locator('.sidepanel.d-none').count() > 0) {
      await noirIcon.click()
    }

    await filePanelIcon.click()
    if (await page.locator('.sidepanel.d-none').count() > 0) {
      await filePanelIcon.click()
    }

    // --- Open the generated circuit file -------------------------------------
    const circuitTreeItem = page.locator('[data-id="treeViewLitreeViewItemsrc/main.nr"]')
    await expect(circuitTreeItem).toBeVisible({ timeout: 30_000 })
    await circuitTreeItem.click()
    await expect(page.locator('[data-path="src/main.nr"]')).toBeVisible()

    // --- Switch back to the noir-compiler panel to compile -------------------
    await noirIcon.click()
    if (await page.locator('.sidepanel.d-none').count() > 0) {
      await noirIcon.click()
    }

    // --- Compile the circuit via the in-panel compile button ----------------
    // Show the terminal so later steps can assert on proof-generation output.
    await page.locator('[data-id="toggleBottomPanelIcon"]').click()

    const compileBtn = noirFrame.locator('[data-id="compile_noir_btn"]')
    await expect(compileBtn).toBeEnabled({ timeout: 15_000 })
    await compileBtn.click()
    await expect(noirFrame.locator('#noir_generate_proof')).toBeVisible({ timeout: 90_000 })
    await page.locator('#icon-panel div[plugin="filePanel"]').click()
    await page.locator('[data-id="treeViewLitreeViewItemProver.toml"]').click()
    await expect(page.locator('[data-path="Prover.toml"]')).toBeVisible()
    await page.evaluate(() => {
      (document.getElementById('editorView') as any).setCurrentContent('a = "20"\nb = "40"\n')
    })

    await noirIcon.click()
    if (await page.locator('.sidepanel.d-none').count() > 0) {
      await noirIcon.click()
    }
  })

  test.afterAll(async () => {
    await page.close()
  })

  test('Create ZK DApp button appears after generating a proof', async () => {
    const createZkDappBtn = noirFrame.locator('#noir_create_zk_dapp_btn')
    await expect(createZkDappBtn).toHaveCount(0)

    await noirFrame.locator('#noir_generate_proof').click()
    await expect(terminalJournal).toContainText('Proof generation and file extraction complete.', { timeout: 120_000 })

    await expect(createZkDappBtn).toBeVisible({ timeout: 15_000 })
    await expect(createZkDappBtn).toBeEnabled()
    await expect(createZkDappBtn).toContainText('Create ZK DApp')
  })

  test('Create ZK DApp opens the verification method modal in on-chain-only mode and warns about Remix VM', async () => {
    await noirFrame.locator('#noir_create_zk_dapp_btn').click()

    const modal = page.locator('[data-id="zkVerificationMethodModal"]')
    await expect(modal).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-id="zkVerificationMethodModalModalDialogModalTitle-react"]')).toContainText('Choose Verification Method')
    await expect(modal).toContainText('This proving scheme only supports on-chain verification. Select your deployed verifier contract.')

    // No method choice is offered for Noir — only the on-chain flow exists.
    await expect(page.locator('#zk-verification-method-zkverify')).toHaveCount(0)
    await expect(page.locator('#zk-verification-method-onchain')).toHaveCount(0)

    await expect(modal).toContainText(
      'Select a live network (not Remix VM) from the Deploy & Run environment dropdown, deploy your verifier contract to it, then reopen this dialog.',
      { timeout: 15_000 }
    )

    await page.locator('[data-id="zkVerificationMethodModal-modal-footer-cancel-react"]').click()
    await expect(page.locator('[data-id="zkVerificationMethodModal"]')).toHaveCount(0)
  })
})
