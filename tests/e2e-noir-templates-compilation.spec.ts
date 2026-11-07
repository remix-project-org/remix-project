import { test, expect, Page, FrameLocator } from '@playwright/test'

const BASE_URL = 'http://127.0.0.1:8080'

interface NoirTemplateConfig {
  templateValue: string
  cardDataId: string
  displayName: string
}

// Indices are 0-based within the "Noir ZKP" category in helpers.tsx:
// 0: multNr, 1: stealthDropNr, 2: rangeProofNr, 3: votingNr,
// 4: recursiveNr, 5: sudokuNr, 6: zkKYCNr
const NOIR_TEMPLATES: NoirTemplateConfig[] = [
  { templateValue: 'rangeProofNr',  cardDataId: 'template-card-rangeProofNr-2',  displayName: 'Range Proof' },
  { templateValue: 'votingNr',      cardDataId: 'template-card-votingNr-3',      displayName: 'Anonymous Voting' },
  { templateValue: 'recursiveNr',   cardDataId: 'template-card-recursiveNr-4',   displayName: 'Recursive Proof' },
  { templateValue: 'sudokuNr',      cardDataId: 'template-card-sudokuNr-5',      displayName: 'ZK Sudoku' },
  { templateValue: 'zkKYCNr',       cardDataId: 'template-card-zkKYCNr-6',       displayName: 'ZK KYC' },
]

async function loadIde(page: Page) {
  await page.goto(BASE_URL)
  await expect(page.locator('[data-id="apploaded"]')).toBeAttached({ timeout: 60_000 })
  // Remove any nudge/onboarding overlays that might block clicks
  await page.evaluate(() => {
    document.querySelectorAll(
      '#nudge-widget-container, .nudge-widget, .nudge-modal-backdrop, .nudge-decoration'
    ).forEach((el) => el.remove())
  })
}

async function createNoirWorkspace(
  page: Page,
  templateValue: string,
  cardDataId: string
): Promise<FrameLocator> {
  // Open file panel
  await page.locator('#icon-panel div[plugin="filePanel"]').click()

  // Open workspace dropdown and click Create
  const workspacesSelect = page.locator('[data-id="workspacesSelect"]')
  await expect(workspacesSelect).toBeVisible({ timeout: 20_000 })
  await expect(workspacesSelect).not.toHaveAttribute('data-disabled', 'true')
  await workspacesSelect.click()
  await page.locator('[data-id="workspacecreate"]').click()

  // Template explorer modal
  await expect(page.locator('[data-id="template-explorer-template-container"]')).toBeVisible()

  // Scroll to and click the Noir ZKP category card
  const card = page.locator(`[data-id="${cardDataId}"]`)
  await card.scrollIntoViewIfNeeded()
  await expect(card).toBeVisible()
  await card.click()

  // Confirm workspace creation
  const validateBtn = page.locator(`[data-id="validate-${templateValue}workspace-button"]`)
  await expect(validateBtn).toBeVisible({ timeout: 10_000 })
  await validateBtn.click()

  // noir-compiler icon must appear (workspace action auto-activates it)
  await expect(page.locator('[data-id="verticalIconsKindnoir-compiler"]')).toBeVisible({ timeout: 30_000 })

  return page.frameLocator('#plugin-noir-compiler')
}

async function openCircuitAndCompile(page: Page, noirFrame: FrameLocator) {
  const noirIcon    = page.locator('#icon-panel div[plugin="noir-compiler"]')
  const filePanelIcon = page.locator('#icon-panel div[plugin="filePanel"]')

  // Open the Noir compiler panel
  await noirIcon.click()
  if (await page.locator('.sidepanel.d-none').count() > 0) await noirIcon.click()

  // Open the file panel and navigate to src/main.nr
  await filePanelIcon.click()
  if (await page.locator('.sidepanel.d-none').count() > 0) await filePanelIcon.click()

  const circuitFile = page.locator('[data-id="treeViewLitreeViewItemsrc/main.nr"]')
  await expect(circuitFile).toBeVisible({ timeout: 30_000 })
  await circuitFile.click()
  await expect(page.locator('[data-path="src/main.nr"]')).toBeVisible()

  // Switch back to noir-compiler panel and compile
  await noirIcon.click()
  if (await page.locator('.sidepanel.d-none').count() > 0) await noirIcon.click()

  const compileBtn = noirFrame.locator('[data-id="compile_noir_btn"]')
  await expect(compileBtn).toBeEnabled({ timeout: 15_000 })
  await compileBtn.click()

  // Compilation success → "Generate Proof" button becomes visible
  await expect(noirFrame.locator('#noir_generate_proof')).toBeVisible({ timeout: 90_000 })
}

for (const { templateValue, cardDataId, displayName } of NOIR_TEMPLATES) {
  test.describe(`Noir template: ${displayName}`, () => {
    test.describe.configure({ timeout: 180_000 })

    let page: Page
    let noirFrame: FrameLocator

    test.beforeAll(async ({ browser }) => {
      page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
      await loadIde(page)
      noirFrame = await createNoirWorkspace(page, templateValue, cardDataId)
    })

    test.afterEach(async ({}, testInfo) => {
      if (testInfo.status !== testInfo.expectedStatus) {
        await page.screenshot({
          path: `test-results/noir-${templateValue}-${testInfo.title.replace(/[^\w]/g, '_')}.png`,
          fullPage: true,
        })
      }
    })

    test.afterAll(async () => {
      await page.close()
    })

    test('workspace is created and noir-compiler is activated', async () => {
      await expect(page.locator('[data-id="verticalIconsKindnoir-compiler"]')).toBeVisible()
      await expect(page.locator('[data-id="treeViewLitreeViewItemsrc/main.nr"]')).toBeVisible({ timeout: 20_000 })
    })

    test('circuit compiles successfully', async () => {
      await openCircuitAndCompile(page, noirFrame)
    })
  })
}
