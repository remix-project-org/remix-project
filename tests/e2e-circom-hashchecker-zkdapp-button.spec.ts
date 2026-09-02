import { test, expect, Page, FrameLocator, Locator } from '@playwright/test'
import { releaseAccount } from '../apps/remix-ide-e2e/src/helpers/pool'

const poolApiKey = process.env.E2E_POOL_API_KEY || process.env.E2E_POOL_KEY || ''

test.describe.serial('Circom hashchecker: trusted setup, zk dapp button, and zkVerify flows', () => {
  test.describe.configure({ timeout: 300_000 })

  let page: Page
  let circuitFrame: FrameLocator
  let terminalJournal: Locator
  let poolSessionId: string | null = null

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    terminalJournal = page.locator('[data-id="terminalJournal"]')

    const url = poolApiKey
      ? `http://127.0.0.1:8080/#lang=en&e2e_pool_key=${encodeURIComponent(poolApiKey)}&e2e_feature_groups=e2e-unlimited-quota&optimize&runs=200&evmVersion&version=soljson-v0.8.34+commit.80d5c536.js`
      : 'http://127.0.0.1:8080'
    await page.goto(url)

    // --- Wait for the IDE to finish loading ----------------------------------
    await expect(page.locator('[data-id="apploaded"]')).toBeAttached({ timeout: 60_000 })
    await page.evaluate(() => {
      document.querySelectorAll('#nudge-widget-container, .nudge-widget, .nudge-modal-backdrop, .nudge-decoration').forEach((el) => el.remove())
    })

    if (poolApiKey) {
      // --- Sign in via the E2E test pool -------------------------------------
      await page.locator('[data-id="login-button"]').click()
      await page.locator('[data-id="loginModalE2EPoolButton"]').click()
      await expect(page.locator('[data-id="user-menu-compact"]').first()).toBeVisible({ timeout: 30_000 })
      await page.locator('[data-id="verticalIconsKindremixaiassistant"]').click()
      await page.locator('[data-id="ai-model-selector-btn"]').click()
      await page.locator('[data-id="ai-model-search"]').fill('haiku')
      await page.locator('[data-id^="ai-model-"][data-locked="false"]').first().click()
      await expect(page.locator('[data-id="ai-route-status"]'))
        .toHaveAttribute('data-route', /agent|tools|chat/, { timeout: 30_000 })

      // --- Save a sample zkVerify API key via Settings > Connected Services --
      await page.locator('[data-id="topbar-settingsIcon"]').click()
      await page.locator('[data-id="settings-sidebar-services"]').click()
      await page.locator('[data-id="zkverify-configSwitch"]').click()
      await page.locator('[data-id="settingsTabzkverify-api-key"]').fill('zk-verify-api-key')
      await page.locator('[data-id="settingsTabSavezkverify-config"]').click()
      await expect(page.locator('[data-shared="tooltipPopup"]')).toContainText('Credentials updated', { timeout: 10_000 })

      poolSessionId = await page.evaluate(() => {
        try {
          const raw = window.sessionStorage.getItem('remix_pool_session')
          return raw ? JSON.parse(raw).sessionId || null : null
        } catch {
          return null
        }
      })
    }

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
    if (poolSessionId) {
      await releaseAccount(poolSessionId)
    }
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
    test.skip(!!poolApiKey, 'A real zkVerify API key is saved for the pool session, so this scheme is not reachable here')

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
    await ensureSetupSectionExpanded()
    await circuitFrame.locator('[data-id="groth16ProvingScheme"]').click()
    await runTrustedSetupAndWait()

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

  /**
   * Verifies that selecting zkVerify with a saved API key actually reaches a
   * live RemixAI reply, and that the reply asks for the DApp's setup details
   */
  test('selecting zkVerify with a saved API key gets a RemixAI reply asking for location, description, and design', async () => {
    test.skip(!poolApiKey, 'Requires E2E_POOL_API_KEY (or E2E_POOL_KEY) to check out a live test-pool account')
    test.setTimeout(300_000)

    await ensureSetupSectionExpanded()
    await circuitFrame.locator('[data-id="groth16ProvingScheme"]').click()
    await runTrustedSetupAndWait()

    await circuitFrame.locator('[data-id="setup_exports_toggler"]').hover()
    await expect(circuitFrame.locator('.popover')).toHaveCount(0, { timeout: 10_000 })

    // --- Open the verification method modal and choose zkVerify -------------
    await circuitFrame.locator('[data-id="create_zk_dapp_btn"]').click()
    const modal = page.locator('[data-id="zkVerificationMethodModal"]')
    await expect(modal).toBeVisible({ timeout: 15_000 })

    await page.locator('#zk-verification-method-zkverify').check()
    await expect(modal).toContainText("zkVerify (Kurier) API key found. You're good to go.", { timeout: 15_000 })

    await page.locator('[data-id="zkVerificationMethodModal-modal-footer-ok-react"]').click()
    await expect(modal).toHaveCount(0)

    const userBubbles = page.locator('[data-id="ai-user-chat-bubble"].bubble-user')
    const assistantBubbles = page.locator('[data-id="ai-user-chat-bubble"]:not(.bubble-user)')

    const firstUserBubble = userBubbles.first()
    await expect(firstUserBubble).toBeVisible({ timeout: 15_000 })
    await expect(firstUserBubble).toContainText('Location')
    await expect(firstUserBubble).toContainText('Wallet Connection')
    await expect(firstUserBubble).toContainText('Design')

    // --- RemixAI's reply should ask for location, description, and design ---
    // The reply is a live LLM call, so its exact phrasing isn't deterministic
    // — match loosely (case-insensitive keyword presence), same approach used
    // by apps/remix-ide-e2e/src/tests/quickDapp_v2.test.ts for AI-reply checks.
    const assistantBubble = assistantBubbles.first()
    await expect.poll(
      async () => (await assistantBubble.innerText()).trim().length,
      { timeout: 60_000, intervals: [1000, 2000, 3000]}
    ).toBeGreaterThan(20)

    // Let streaming finish before reading the final text.
    let prevLen = -1
    for (let i = 0; i < 60; i++) {
      const len = (await assistantBubble.innerText()).trim().length
      if (len === prevLen && len > 0) break
      prevLen = len
      await page.waitForTimeout(1000)
    }

    const reply = (await assistantBubble.innerText()).toLowerCase()
    for (const keyword of ['location', 'description', 'design']) {
      expect(reply).toContain(keyword)
    }
  })
})
