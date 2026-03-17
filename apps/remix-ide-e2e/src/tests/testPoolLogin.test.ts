'use strict'
import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'
import { releaseAccount } from '../helpers/pool'
import { waitAndVerifySync, waitForSyncIdle } from '../helpers/cloud-sync-verify'

require('dotenv').config()

const poolApiKey = process.env.E2E_POOL_API_KEY || ''

module.exports = {
  '@disabled': true,

  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    if (!poolApiKey) {
      console.error('[TestPoolLogin] E2E_POOL_API_KEY not set — cannot run pool test')
      return done()
    }

    // Pass the pool key + enableLogin in the hash so the auth plugin can use it.
    // No fake token injection — the real login flow will do the checkout.
    const url = `http://127.0.0.1:8080#e2e_pool_key=${poolApiKey}`
    init(browser, done, url, true)
  },

  after: async function (browser: NightwatchBrowser, done: VoidFunction) {
    // Read the pool session that the auth plugin stored in sessionStorage
    try {
      const result: any = await new Promise((resolve) => {
        browser.execute(function () {
          return sessionStorage.getItem('remix_pool_session')
        }, [], (res: any) => resolve(res))
      })

      if (result && result.value) {
        const session = JSON.parse(result.value)
        console.log(`[TestPoolLogin] Releasing pool session: ${session.sessionId}`)
        await releaseAccount(session.sessionId)
      }
    } catch (err: any) {
      console.error(`[TestPoolLogin] Release failed: ${err.message}`)
    }
    browser.end()
    done()
  },

  'Should enable login and show sign-in button #group1': function (browser: NightwatchBrowser) {
    browser
      // enableLogin must be set for the Sign In button to appear
      .execute(function () {
        localStorage.setItem('enableLogin', 'true')
      })
      .refreshPage()
      .pause(5000)
      .waitForElementVisible('*[data-id="login-button"]', 15000)
      .assert.elementPresent('*[data-id="login-button"]')
  },

  'Should login via the test pool through the real UI flow #group1': function (browser: NightwatchBrowser) {
    browser
      // Open the login modal
      .click('*[data-id="login-button"]')
      .pause(3000)
      // The modal should detect the e2e_pool_key and show the "E2E Test Pool" button
      .waitForElementVisible({
        selector: '//button[contains(., "E2E Test Pool")]',
        locateStrategy: 'xpath',
        timeout: 15000
      })
      // Click the test pool login button — this triggers a real pool checkout
      .click({
        selector: '//button[contains(., "E2E Test Pool")]',
        locateStrategy: 'xpath'
      })
      // Wait for the login to complete (modal closes, tokens get stored)
      .pause(5000)
  },

  'Should have auth tokens in localStorage after pool login #group1': function (browser: NightwatchBrowser) {
    browser
      .execute(function () {
        return {
          accessToken: localStorage.getItem('remix_access_token'),
          refreshToken: localStorage.getItem('remix_refresh_token'),
          user: localStorage.getItem('remix_user'),
          poolSession: sessionStorage.getItem('remix_pool_session'),
        }
      }, [], function (result: any) {
        const data = result.value
        browser
          .assert.ok(data.accessToken && data.accessToken.length > 0, 'Access token is set')
          .assert.ok(data.refreshToken && data.refreshToken.length > 0, 'Refresh token is set')
          .assert.ok(data.user && data.user.length > 0, 'User object is set')
          .assert.ok(data.poolSession && data.poolSession.length > 0, 'Pool session is tracked in sessionStorage')
      })
  },

  'Should show the user as logged in with test provider #group1': function (browser: NightwatchBrowser) {
    browser
      .execute(function () {
        const user = localStorage.getItem('remix_user')
        if (user) {
          try {
            const parsed = JSON.parse(user)
            return { email: parsed.email, name: parsed.name, provider: parsed.provider }
          } catch (e) {
            return null
          }
        }
        return null
      }, [], function (result: any) {
        const user = result.value
        browser
          .assert.ok(user !== null, 'User data is parseable')
          .assert.ok(user.email && user.email.includes('@'), 'User has a valid email')
          .assert.equal(user.provider, 'test', 'Provider is "test"')
        console.log(`[TestPoolLogin] Logged in as: ${user.name} (${user.email})`)
      })
  },

  // ── Cloud workspace + sync verification ────────────────

  'Should create a cloud workspace #group2': async function (browser: NightwatchBrowser) {
    // group2 needs login first — repeat the login flow
    browser
      .execute(function () {
        localStorage.setItem('enableLogin', 'true')
      })
      .refreshPage()
      .pause(5000)
      .waitForElementVisible('*[data-id="login-button"]', 15000)
      .click('*[data-id="login-button"]')
      .pause(3000)
      .waitForElementVisible({
        selector: '//button[contains(., "E2E Test Pool")]',
        locateStrategy: 'xpath',
        timeout: 15000,
      })
      .click({
        selector: '//button[contains(., "E2E Test Pool")]',
        locateStrategy: 'xpath',
      })
      .pause(5000)
      // Enable cloud mode via toggle (cloud is OFF by default after login)
      .clickCloudToggle()
      .pause(10000)
      // Open the workspace dropdown → template explorer → Blank template
      .clickWorkspaceDropdown()
      .pause(2000)
      .click('*[data-id="workspacecreate"]')
      .waitForElementVisible('*[data-id="template-explorer-modal-react"]', 10000)
      .waitForElementVisible('*[data-id="template-explorer-template-container"]', 10000)
      .click('*[data-id="template-explorer-template-container"]')
      .waitForElementVisible('*[data-id="template-card-blank-1"]', 10000)
      .click('*[data-id="template-card-blank-1"]')
      // The blank workspace section appears with a name input
      .waitForElementVisible('*[data-id="generic-template-section-blank"]', 10000)
      .waitForElementVisible('*[data-id="workspace-name-blank-input"]', 10000)
      .click('*[data-id="workspace-name-blank-input"]')
      .clearValue('*[data-id="workspace-name-blank-input"]')
      .setValue('*[data-id="workspace-name-blank-input"]', 'e2e-sync-test')
      .pause(500)
      .click('*[data-id="validate-blankworkspace-button"]')
      .currentWorkspaceIs('e2e-sync-test')

    // Wait for cloud sync engine to activate and complete initial sync
    await waitForSyncIdle(browser)
  },

  'Should create a test file in the cloud workspace #group2': function (browser: NightwatchBrowser) {
    browser
      // Use the real UI: right-click tree → New File → type name → set content
      .addFile('test-sync.sol', {
        content: '// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\n\ncontract SyncTest {\n    uint256 public value;\n\n    function setValue(uint256 _value) public {\n        value = _value;\n    }\n}\n'
      }, 'remix.config.json')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemtest-sync.sol"]', 10000)
  },

  'Should flush pending changes and verify sync integrity #group2': async function (browser: NightwatchBrowser) {
    // waitAndVerifySync polls until the engine is idle with 0 pending changes
    const result = await waitAndVerifySync(browser, 30_000, {
      allowPhantoms: 0,
      allowMissing: 0,
      allowMismatched: 0,
    })

    console.log(`[TestPoolLogin:SyncVerify] manifest=${result.manifestFileCount} files, remote=${result.remoteFileCount} files, ok=${result.ok}`)
  },

  'Should edit the file and re-verify sync #group2': async function (browser: NightwatchBrowser) {
    // Open the file and edit it through the editor UI
    browser
      .openFile('test-sync.sol')
      .setEditorValue('// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\n\ncontract SyncTest {\n    uint256 public value;\n    string public name;\n\n    function setValue(uint256 _value) public {\n        value = _value;\n    }\n\n    function setName(string memory _name) public {\n        name = _name;\n    }\n}\n')
      .pause(1000)
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf('setName') !== -1, 'Editor contains the new setName function')
      })

    // waitAndVerifySync polls until the engine is idle — no manual pause needed
    const result = await waitAndVerifySync(browser, 30_000)
    console.log(`[TestPoolLogin:SyncVerify] After edit: manifest=${result.manifestFileCount}, remote=${result.remoteFileCount}, ok=${result.ok}`)
  },

  'Should delete the file and verify sync reflects deletion #group2': async function (browser: NightwatchBrowser) {
    // Delete the file through the real UI: right-click → Delete → confirm modal
    browser
      .removeFile('test-sync.sol', 'e2e-sync-test')

    // waitAndVerifySync polls until the engine is idle — no manual pause needed
    const result = await waitAndVerifySync(browser, 30_000)
    console.log(`[TestPoolLogin:SyncVerify] After delete: manifest=${result.manifestFileCount}, remote=${result.remoteFileCount}, ok=${result.ok}`)
  },

  // ── S3 Restore: wipe local, reload, verify restore ────────

  'Should login and create first cloud workspace ws-alpha #group3': async function (browser: NightwatchBrowser) {
    // Login (each group is isolated)
    browser
      .execute(function () {
        localStorage.setItem('enableLogin', 'true')
      })
      .refreshPage()
      .pause(5000)
      .waitForElementVisible('*[data-id="login-button"]', 15000)
      .click('*[data-id="login-button"]')
      .pause(3000)
      .waitForElementVisible({
        selector: '//button[contains(., "E2E Test Pool")]',
        locateStrategy: 'xpath',
        timeout: 15000,
      })
      .click({
        selector: '//button[contains(., "E2E Test Pool")]',
        locateStrategy: 'xpath',
      })
      .pause(5000)
      // Enable cloud mode via toggle (cloud is OFF by default after login)
      .clickCloudToggle()
      .pause(10000)
      // Create ws-alpha via template explorer
      .clickWorkspaceDropdown()
      .pause(2000)
      .click('*[data-id="workspacecreate"]')
      .waitForElementVisible('*[data-id="template-explorer-modal-react"]', 10000)
      .waitForElementVisible('*[data-id="template-explorer-template-container"]', 10000)
      .click('*[data-id="template-explorer-template-container"]')
      .waitForElementVisible('*[data-id="template-card-blank-1"]', 10000)
      .click('*[data-id="template-card-blank-1"]')
      .waitForElementVisible('*[data-id="generic-template-section-blank"]', 10000)
      .waitForElementVisible('*[data-id="workspace-name-blank-input"]', 10000)
      .click('*[data-id="workspace-name-blank-input"]')
      .clearValue('*[data-id="workspace-name-blank-input"]')
      .setValue('*[data-id="workspace-name-blank-input"]', 'ws-alpha')
      .pause(500)
      .click('*[data-id="validate-blankworkspace-button"]')
      .currentWorkspaceIs('ws-alpha')
      // Add a unique file
      .addFile('alpha-contract.sol', {
        content: '// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\n\ncontract AlphaTest {\n    string public name = "alpha";\n\n    function greet() public pure returns (string memory) {\n        return "Hello from Alpha";\n    }\n}\n'
      }, 'remix.config.json')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemalpha-contract.sol"]', 10000)

    // Wait for cloud sync engine to push all changes to S3
    await waitForSyncIdle(browser)
  },

  'Should create second cloud workspace ws-beta #group3': async function (browser: NightwatchBrowser) {
    browser
      .clickWorkspaceDropdown()
      .pause(2000)
      .click('*[data-id="workspacecreate"]')
      .waitForElementVisible('*[data-id="template-explorer-modal-react"]', 10000)
      .waitForElementVisible('*[data-id="template-explorer-template-container"]', 10000)
      .click('*[data-id="template-explorer-template-container"]')
      .waitForElementVisible('*[data-id="template-card-blank-1"]', 10000)
      .click('*[data-id="template-card-blank-1"]')
      .waitForElementVisible('*[data-id="generic-template-section-blank"]', 10000)
      .waitForElementVisible('*[data-id="workspace-name-blank-input"]', 10000)
      .click('*[data-id="workspace-name-blank-input"]')
      .clearValue('*[data-id="workspace-name-blank-input"]')
      .setValue('*[data-id="workspace-name-blank-input"]', 'ws-beta')
      .pause(500)
      .click('*[data-id="validate-blankworkspace-button"]')
      .currentWorkspaceIs('ws-beta')
      // Add unique files
      .addFile('beta-contract.sol', {
        content: '// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\n\ncontract BetaTest {\n    uint256 public counter;\n\n    function increment() public {\n        counter += 1;\n    }\n\n    function getCounter() public view returns (uint256) {\n        return counter;\n    }\n}\n'
      }, 'remix.config.json')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItembeta-contract.sol"]', 10000)
      .addFile('beta-lib.sol', {
        content: '// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\n\nlibrary BetaLib {\n    function add(uint256 a, uint256 b) internal pure returns (uint256) {\n        return a + b;\n    }\n}\n'
      }, 'remix.config.json')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItembeta-lib.sol"]', 10000)

    // Wait for cloud sync engine to push all changes to S3
    await waitForSyncIdle(browser)
  },

  'Should create third cloud workspace ws-gamma #group3': async function (browser: NightwatchBrowser) {
    browser
      .clickWorkspaceDropdown()
      .pause(2000)
      .click('*[data-id="workspacecreate"]')
      .waitForElementVisible('*[data-id="template-explorer-modal-react"]', 10000)
      .waitForElementVisible('*[data-id="template-explorer-template-container"]', 10000)
      .click('*[data-id="template-explorer-template-container"]')
      .waitForElementVisible('*[data-id="template-card-blank-1"]', 10000)
      .click('*[data-id="template-card-blank-1"]')
      .waitForElementVisible('*[data-id="generic-template-section-blank"]', 10000)
      .waitForElementVisible('*[data-id="workspace-name-blank-input"]', 10000)
      .click('*[data-id="workspace-name-blank-input"]')
      .clearValue('*[data-id="workspace-name-blank-input"]')
      .setValue('*[data-id="workspace-name-blank-input"]', 'ws-gamma')
      .pause(500)
      .click('*[data-id="validate-blankworkspace-button"]')
      .currentWorkspaceIs('ws-gamma')
      // Add a unique file
      .addFile('gamma-main.sol', {
        content: '// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\n\ncontract GammaMain {\n    address public owner;\n\n    constructor() {\n        owner = msg.sender;\n    }\n\n    function getOwner() public view returns (address) {\n        return owner;\n    }\n}\n'
      }, 'remix.config.json')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemgamma-main.sol"]', 10000)

    // Wait for cloud sync engine to push all changes to S3
    await waitForSyncIdle(browser)
  },

  'Should verify sync integrity for all three workspaces #group3': async function (browser: NightwatchBrowser) {
    // Currently on ws-gamma — verify it
    const gammaResult = await waitAndVerifySync(browser, 30_000)
    console.log(`[group3] ws-gamma: manifest=${gammaResult.manifestFileCount}, remote=${gammaResult.remoteFileCount}, ok=${gammaResult.ok}`)

    // Switch to ws-beta and verify
    browser
      .clickWorkspaceDropdown()
      .pause(2000)
      .waitForElementVisible('*[data-id="dropdown-item-ws-beta"]', 10000)
      .click('*[data-id="dropdown-item-ws-beta"]')

    // waitAndVerifySync polls until engine is idle — covers activate + pull
    const betaResult = await waitAndVerifySync(browser, 30_000)
    console.log(`[group3] ws-beta: manifest=${betaResult.manifestFileCount}, remote=${betaResult.remoteFileCount}, ok=${betaResult.ok}`)

    // Switch to ws-alpha and verify
    browser
      .clickWorkspaceDropdown()
      .pause(2000)
      .waitForElementVisible('*[data-id="dropdown-item-ws-alpha"]', 10000)
      .click('*[data-id="dropdown-item-ws-alpha"]')

    // waitAndVerifySync polls until engine is idle — covers activate + pull
    const alphaResult = await waitAndVerifySync(browser, 30_000)
    console.log(`[group3] ws-alpha: manifest=${alphaResult.manifestFileCount}, remote=${alphaResult.remoteFileCount}, ok=${alphaResult.ok}`)
  },

  'Should wipe local cloud data and reload the page #group3': async function (browser: NightwatchBrowser) {
    browser
      // Wipe the local .cloud-workspaces directory from IndexedDB
      .execute(function () {
        return (window as any).remixFileSystem.unlink('.cloud-workspaces')
      }, [], function (result: any) {
        console.log('[group3] Wiped .cloud-workspaces from local FS')
      })
      // Reload the page — tokens stay in localStorage, so user is still logged in
      .refresh()
      .waitForElementVisible('[data-id="workspacesSelect"]', 30000)
      // Re-enable cloud (OFF by default after reload)
      .clickCloudToggle()
      .pause(10000)

    // Wait for cloud system to discover workspaces and complete initial pull from S3
    await waitForSyncIdle(browser, 60_000)
  },

  'Should verify ws-alpha restored from S3 with correct files #group3': function (browser: NightwatchBrowser) {
    browser
      .clickWorkspaceDropdown()
      .pause(2000)
      .waitForElementVisible('*[data-id="dropdown-item-ws-alpha"]', 20000)
      .click('*[data-id="dropdown-item-ws-alpha"]')
      .pause(10000)
//       .clickLaunchIcon('filePanel')
      .pause(3000)
      .currentWorkspaceIs('ws-alpha')
      // Verify the file exists in the tree
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemalpha-contract.sol"]', 20000)
      // Open and verify content
      .openFile('alpha-contract.sol')
      .pause(2000)
      .getEditorValue((content) => {
        browser.assert.ok(
          content.indexOf('contract AlphaTest') !== -1,
          'ws-alpha: alpha-contract.sol contains contract AlphaTest'
        )
        browser.assert.ok(
          content.indexOf('Hello from Alpha') !== -1,
          'ws-alpha: alpha-contract.sol contains "Hello from Alpha"'
        )
      })
  },

  'Should verify ws-beta restored from S3 with correct files #group3': function (browser: NightwatchBrowser) {
    browser
      .clickWorkspaceDropdown()
      .pause(2000)
      .waitForElementVisible('*[data-id="dropdown-item-ws-beta"]', 20000)
      .click('*[data-id="dropdown-item-ws-beta"]')
      .pause(10000)
      .currentWorkspaceIs('ws-beta')
      // Verify both files exist
      .waitForElementVisible('*[data-id="treeViewLitreeViewItembeta-contract.sol"]', 20000)
      .waitForElementVisible('*[data-id="treeViewLitreeViewItembeta-lib.sol"]', 20000)
      // Check beta-contract.sol content
      .openFile('beta-contract.sol')
      .pause(2000)
      .getEditorValue((content) => {
        browser.assert.ok(
          content.indexOf('contract BetaTest') !== -1,
          'ws-beta: beta-contract.sol contains contract BetaTest'
        )
        browser.assert.ok(
          content.indexOf('function increment') !== -1,
          'ws-beta: beta-contract.sol contains increment function'
        )
      })
      // Check beta-lib.sol content
      .openFile('beta-lib.sol')
      .pause(2000)
      .getEditorValue((content) => {
        browser.assert.ok(
          content.indexOf('library BetaLib') !== -1,
          'ws-beta: beta-lib.sol contains library BetaLib'
        )
      })
  },

  'Should verify ws-gamma restored from S3 with correct files #group3': function (browser: NightwatchBrowser) {
    browser
      .clickWorkspaceDropdown()
      .pause(2000)
      .waitForElementVisible('*[data-id="dropdown-item-ws-gamma"]', 20000)
      .click('*[data-id="dropdown-item-ws-gamma"]')
      .pause(10000)
      .currentWorkspaceIs('ws-gamma')
      // Verify the file exists
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemgamma-main.sol"]', 20000)
      // Open and verify content
      .openFile('gamma-main.sol')
      .pause(2000)
      .getEditorValue((content) => {
        browser.assert.ok(
          content.indexOf('contract GammaMain') !== -1,
          'ws-gamma: gamma-main.sol contains contract GammaMain'
        )
        browser.assert.ok(
          content.indexOf('function getOwner') !== -1,
          'ws-gamma: gamma-main.sol contains getOwner function'
        )
      })
  },

  // ── Git-clone workspace templates ──────────────────────

  'Should login for git clone tests #group4': function (browser: NightwatchBrowser) {
    browser
      .execute(function () {
        localStorage.setItem('enableLogin', 'true')
      })
      .refreshPage()
      .pause(5000)
//       .clickLaunchIcon('filePanel')
      .waitForElementVisible('*[data-id="login-button"]', 15000)
      .click('*[data-id="login-button"]')
      .pause(3000)
      .waitForElementVisible({
        selector: '//button[contains(., "E2E Test Pool")]',
        locateStrategy: 'xpath',
        timeout: 15000,
      })
      .click({
        selector: '//button[contains(., "E2E Test Pool")]',
        locateStrategy: 'xpath',
      })
      .pause(5000)
      // Enable cloud mode via toggle (cloud is OFF by default after login)
      .clickCloudToggle()
      .pause(10000)
  },

  'Should clone Account Abstraction repo into a cloud workspace #group4': async function (browser: NightwatchBrowser) {
    browser
      .clickWorkspaceDropdown()
      .pause(2000)
      .click('*[data-id="workspacecreate"]')
      .waitForElementVisible('*[data-id="template-explorer-modal-react"]', 10000)
      .waitForElementVisible('*[data-id="template-explorer-template-container"]', 10000)
      // accountAbstraction is in the Generic category, index 3
      .click('*[data-id="template-card-accountAbstraction-3"]')
      .waitForElementVisible('*[data-id="generic-template-section-accountAbstraction"]', 10000)
      .waitForElementVisible('*[data-id="workspace-name-accountAbstraction-input"]', 10000)
      // Click Finish to start cloning
      .click('*[data-id="validate-accountAbstractionworkspace-button"]')
      // Wait for modal to disappear — clone is complete once modal closes
      .waitForElementNotPresent('*[data-id="template-explorer-modal-react"]', 120000)
      .pause(3000)

    // Wait for sync engine to activate and push to S3
    await waitForSyncIdle(browser, 120_000)

    // Verify key files from the account-abstraction repo exist
    browser
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemcontracts"]', 30000)
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemtest"]', 30000)
      .waitForElementVisible('*[data-id="treeViewLitreeViewItempackage.json"]', 10000)
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemREADME.md"]', 10000)
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemLICENSE"]', 10000)

    // Verify sync integrity
    const result = await waitAndVerifySync(browser, 60_000)
    console.log(`[group4] accountAbstraction: manifest=${result.manifestFileCount}, remote=${result.remoteFileCount}, ok=${result.ok}`)
  },

  'Should clone Uniswap v4 Template repo into a cloud workspace #group4': async function (browser: NightwatchBrowser) {
    browser
      .clickWorkspaceDropdown()
      .pause(2000)
      .click('*[data-id="workspacecreate"]')
      .waitForElementVisible('*[data-id="template-explorer-modal-react"]', 10000)
      .waitForElementVisible('*[data-id="template-explorer-template-container"]', 10000)
      // uniswapV4Template is in the Uniswap V4 category, index 0
      .click('*[data-id="template-card-uniswapV4Template-0"]')
      .waitForElementVisible('*[data-id="generic-template-section-uniswapV4Template"]', 10000)
      .waitForElementVisible('*[data-id="workspace-name-uniswapV4Template-input"]', 10000)
      // Click Finish to start cloning
      .click('*[data-id="validate-uniswapV4Templateworkspace-button"]')
      // Wait for modal to disappear — clone completes when modal closes
      .waitForElementNotPresent('*[data-id="template-explorer-modal-react"]', 120000)
      .pause(3000)

    // Wait for sync engine to activate and push to S3
    await waitForSyncIdle(browser, 120_000)

    // Verify key files from the v4-template repo exist
    browser
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemsrc"]', 30000)
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemlib"]', 30000)
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemscript"]', 30000)
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemtest"]', 30000)
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemfoundry.toml"]', 10000)
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemREADME.md"]', 10000)

    // Verify sync integrity
    const result = await waitAndVerifySync(browser, 60_000)
    console.log(`[group4] uniswapV4Template: manifest=${result.manifestFileCount}, remote=${result.remoteFileCount}, ok=${result.ok}`)
  },

  'Should clone Breakthrough-Labs Hooks repo into a cloud workspace #group4': async function (browser: NightwatchBrowser) {
    browser
      .clickWorkspaceDropdown()
      .pause(2000)
      .click('*[data-id="workspacecreate"]')
      .waitForElementVisible('*[data-id="template-explorer-modal-react"]', 10000)
      .waitForElementVisible('*[data-id="template-explorer-template-container"]', 10000)
      // breakthroughLabsUniswapv4Hooks is in the Uniswap V4 category, index 1
      .click('*[data-id="template-card-breakthroughLabsUniswapv4Hooks-1"]')
      .waitForElementVisible('*[data-id="generic-template-section-breakthroughLabsUniswapv4Hooks"]', 10000)
      .waitForElementVisible('*[data-id="workspace-name-breakthroughLabsUniswapv4Hooks-input"]', 10000)
      // Click Finish to start cloning
      .click('*[data-id="validate-breakthroughLabsUniswapv4Hooksworkspace-button"]')
      // Wait for modal to disappear — clone completes when modal closes
      .waitForElementNotPresent('*[data-id="template-explorer-modal-react"]', 120000)
      .pause(3000)

    // Wait for sync engine to activate and push to S3
    await waitForSyncIdle(browser, 120_000)

    // Verify key files from the Uniswapv4Hooks repo exist
    browser
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemsrc"]', 30000)
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemlib"]', 30000)
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemtest"]', 30000)
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemfoundry.toml"]', 10000)
      .waitForElementVisible('*[data-id="treeViewLitreeViewItem.gitmodules"]', 10000)
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemREADME.md"]', 10000)

    // Verify sync integrity
    const result = await waitAndVerifySync(browser, 60_000)
    console.log(`[group4] breakthroughLabsUniswapv4Hooks: manifest=${result.manifestFileCount}, remote=${result.remoteFileCount}, ok=${result.ok}`)
  },

  'Should verify all cloned workspaces are listed and switchable #group4': async function (browser: NightwatchBrowser) {
    // Open workspace dropdown and verify all three cloned workspaces are listed
    browser
      .clickWorkspaceDropdown()
      .pause(2000)

    // Verify the workspace items exist in the dropdown (names may have suffix like "- 1")
    browser
      .waitForElementVisible({
        selector: '//*[contains(@data-id, "dropdown-item-") and contains(., "Account Abstraction")]',
        locateStrategy: 'xpath',
        timeout: 10000,
      })
      .waitForElementVisible({
        selector: '//*[contains(@data-id, "dropdown-item-") and contains(., "Uniswap v4 Template")]',
        locateStrategy: 'xpath',
        timeout: 10000,
      })
      .waitForElementVisible({
        selector: '//*[contains(@data-id, "dropdown-item-") and contains(., "Breakthrough-Labs Hooks")]',
        locateStrategy: 'xpath',
        timeout: 10000,
      })

    // Switch to Account Abstraction and verify it loads
    browser
      .click({
        selector: '//*[contains(@data-id, "dropdown-item-") and contains(., "Account Abstraction")]',
        locateStrategy: 'xpath',
      })

    await waitForSyncIdle(browser, 60_000)

    browser
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemcontracts"]', 30000)
      .waitForElementVisible('*[data-id="treeViewLitreeViewItempackage.json"]', 10000)

    // Switch to Uniswap v4 Template
    browser
      .clickWorkspaceDropdown()
      .pause(2000)
      .click({
        selector: '//*[contains(@data-id, "dropdown-item-") and contains(., "Uniswap v4 Template")]',
        locateStrategy: 'xpath',
      })

    await waitForSyncIdle(browser, 60_000)

    browser
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemsrc"]', 30000)
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemfoundry.toml"]', 10000)
      .pause()
  },

  // ── Git-init workspace + .git cloud sync + S3 restore ──

  'Should login for git-init sync tests #group5': function (browser: NightwatchBrowser) {
    browser
      .execute(function () {
        localStorage.setItem('enableLogin', 'true')
      })
      .refreshPage()
      .pause(5000)
//       .clickLaunchIcon('filePanel')
      .waitForElementVisible('*[data-id="login-button"]', 15000)
      .click('*[data-id="login-button"]')
      .pause(3000)
      .waitForElementVisible({
        selector: '//button[contains(., "E2E Test Pool")]',
        locateStrategy: 'xpath',
        timeout: 15000,
      })
      .click({
        selector: '//button[contains(., "E2E Test Pool")]',
        locateStrategy: 'xpath',
      })
      .pause(5000)
      // Enable cloud mode via toggle (cloud is OFF by default after login)
      .clickCloudToggle()
      .pause(10000)
  },

  'Should create a Basic workspace with git init checked #group5': async function (browser: NightwatchBrowser) {
    browser
      .clickWorkspaceDropdown()
      .pause(2000)
      .click('*[data-id="workspacecreate"]')
      .waitForElementVisible('*[data-id="template-explorer-modal-react"]', 10000)
      .waitForElementVisible('*[data-id="template-explorer-template-container"]', 10000)
      // Basic (remixDefault) is in the Generic category, index 0
      .click('*[data-id="template-card-remixDefault-0"]')
      .waitForElementVisible('*[data-id="workspace-details-section"]', 10000)
      // Check "Initialize as a Git repository"
      .click('*[data-id="initGitRepositoryLabel"]')
      .pause(500)
      // Click "Create a new workspace"
      .click('*[data-id="validateWorkspaceButton"]')
      .waitForElementNotPresent('*[data-id="template-explorer-modal-react"]', 30000)
      .pause(3000)

    // Wait for file sync to complete
    await waitForSyncIdle(browser)

    // Confirm we're in the new workspace
    browser
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemcontracts"]', 10000)
  },

  'Should add a file, commit, and verify .git sync to S3 #group5': async function (browser: NightwatchBrowser) {
    // Add a custom test file
    browser
      .addFile('git-test.sol', {
        content: '// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\n\ncontract GitTest {\n    string public message = "git sync test";\n}\n'
      }, 'README.txt')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemgit-test.sol"]', 10000)

    // Wait for file sync to push to S3
    await waitForSyncIdle(browser)

    // Trigger forceGitSnapshot fire-and-forget (async not supported in execute)
    await new Promise<void>((resolve) => {
      browser.execute(
        function () {
          var engine = (window as any).cloudSyncEngine
          if (engine && engine.isActive && engine.forceGitSnapshot) {
            engine.forceGitSnapshot()
          }
        },
        [],
        () => resolve(),
      )
    })

    // Poll until lastGitZipEtag is set (confirms _git.zip pushed to S3)
    const start = Date.now()
    let gitEtag: string | null = null
    while (Date.now() - start < 90_000 && !gitEtag) {
      gitEtag = await new Promise<string | null>((resolve) => {
        browser.execute(
          function () {
            var engine = (window as any).cloudSyncEngine
            return engine && engine.lastGitZipEtag ? engine.lastGitZipEtag : null
          },
          [],
          (result: any) => resolve(result?.value || null),
        )
      })
      if (!gitEtag) {
        await new Promise((r) => setTimeout(r, 2000))
      }
    }

    console.log(`[group5] lastGitZipEtag after push: ${gitEtag}`)
    browser.assert.ok(!!gitEtag, '.git snapshot was pushed to S3 (ETag is set)')

    // Verify file sync integrity too
    const result = await waitAndVerifySync(browser, 30_000)
    console.log(`[group5] After git push: manifest=${result.manifestFileCount}, remote=${result.remoteFileCount}, ok=${result.ok}`)
  },

  'Should wipe local data and reload — workspace + .git must restore from S3 #group5': async function (browser: NightwatchBrowser) {
    // Save current workspace name for later verification
    const wsName = await new Promise<string>((resolve) => {
      browser.execute(
        function () {
          const engine = (window as any).cloudSyncEngine
          return engine?.getWorkspaceUuid() || ''
        },
        [],
        (result: any) => resolve(result?.value || ''),
      )
    })
    console.log(`[group5] Workspace UUID before wipe: ${wsName}`)

    // Wipe local IndexedDB data
    browser
      .execute(function () {
        return (window as any).remixFileSystem.unlink('.cloud-workspaces')
      }, [], function () {
        console.log('[group5] Wiped .cloud-workspaces from local FS')
      })
      .refresh()
      .waitForElementVisible('[data-id="workspacesSelect"]', 30000)
      // Re-enable cloud (OFF by default after reload)
      .clickCloudToggle()
      .pause(10000)

    // Wait for cloud system to restore workspaces from S3
    await waitForSyncIdle(browser, 120_000)
  },

  'Should verify workspace files restored from S3 after wipe #group5': function (browser: NightwatchBrowser) {
    // The restored workspace should be listed — switch to it
    browser
      .clickWorkspaceDropdown()
      .pause(2000)
      .waitForElementVisible({
        selector: '//*[contains(@data-id, "dropdown-item-") and contains(., "Basic")]',
        locateStrategy: 'xpath',
        timeout: 20000,
      })
      .click({
        selector: '//*[contains(@data-id, "dropdown-item-") and contains(., "Basic")]',
        locateStrategy: 'xpath',
      })
      .pause(10000)
//       .clickLaunchIcon('filePanel')
      .pause(3000)
      // Verify the workspace files are restored
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemcontracts"]', 20000)
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemgit-test.sol"]', 20000)
      // Open the test file and verify content
      .openFile('git-test.sol')
      .pause(2000)
      .getEditorValue((content) => {
        browser.assert.ok(
          content.indexOf('contract GitTest') !== -1,
          'Restored git-test.sol contains contract GitTest'
        )
        browser.assert.ok(
          content.indexOf('git sync test') !== -1,
          'Restored git-test.sol contains "git sync test"'
        )
      })
  },

  'Should verify .git directory was restored from S3 #group5': async function (browser: NightwatchBrowser) {
    // .git is hidden in file explorer — verify via engine state and filesystem
    // Poll for lastGitZipEtag (set when _git.zip is pulled from S3 during activate)
    let restoredEtag: string | null = null
    const start = Date.now()
    while (Date.now() - start < 60000 && !restoredEtag) {
      restoredEtag = await new Promise<string | null>((resolve) => {
        browser.execute(
          function () {
            var engine = (window as any).cloudSyncEngine
            if (!engine) return JSON.stringify({ error: 'no engine' })
            return JSON.stringify({
              isActive: engine.isActive,
              wsPath: engine.localWorkspacePath,
              etag: engine.lastGitZipEtag || null,
            })
          },
          [],
          (result: any) => {
            try {
              var info = JSON.parse(result?.value || '{}')
              console.log('[group5] .git poll:', JSON.stringify(info))
              resolve(info.etag || null)
            } catch (e) {
              resolve(null)
            }
          },
        )
      })
      if (!restoredEtag) await new Promise((r) => setTimeout(r, 2000))
    }
    console.log(`[group5] lastGitZipEtag after restore: ${restoredEtag}`)
    browser.assert.ok(!!restoredEtag, '.git snapshot ETag is set — _git.zip was pulled from S3')

    // Verify .git/HEAD exists using executeAsyncScript (remixFileSystem is async-only)
    const hasGitHead = await new Promise<boolean>((resolve) => {
      browser.executeAsyncScript(
        function (done: (result: boolean) => void) {
          var engine = (window as any).cloudSyncEngine
          var fs = (window as any).remixFileSystem
          var wsPath = engine && engine.localWorkspacePath
          if (!wsPath || !fs) { done(false); return }
          fs.stat(wsPath + '/.git/HEAD')
            .then(function () { done(true) })
            .catch(function () { done(false) })
        },
        [],
        (result: any) => resolve(result?.value === true),
      )
    })
    browser.assert.ok(hasGitHead, '.git/HEAD exists in filesystem — git repository structure restored')
  },

  // ══════════════════════════════════════════════════════════════
  //  Group 6 — Migration: local workspaces → cloud
  // ══════════════════════════════════════════════════════════════

  'Should login for local workspace creation #group6': function (browser: NightwatchBrowser) {
    // Login only — cloud is OFF by default, no need to toggle
    browser
      .execute(function () { localStorage.setItem('enableLogin', 'true') })
      .refreshPage()
      .pause(5000)
//       .clickLaunchIcon('filePanel')
      .waitForElementVisible('*[data-id="login-button"]', 15000)
      .click('*[data-id="login-button"]')
      .pause(3000)
      .waitForElementVisible({
        selector: '//button[contains(., "E2E Test Pool")]',
        locateStrategy: 'xpath',
        timeout: 15000,
      })
      .click({
        selector: '//button[contains(., "E2E Test Pool")]',
        locateStrategy: 'xpath',
      })
      .pause(5000)
  },

  'Should create local workspace migrate-ws-A with files #group6': function (browser: NightwatchBrowser) {
    browser
      .clickWorkspaceDropdown()
      .pause(2000)
      .click('*[data-id="workspacecreate"]')
      .waitForElementVisible('*[data-id="template-explorer-modal-react"]', 10000)
      .waitForElementVisible('*[data-id="template-explorer-template-container"]', 10000)
      .click('*[data-id="template-explorer-template-container"]')
      .waitForElementVisible('*[data-id="template-card-blank-1"]', 10000)
      .click('*[data-id="template-card-blank-1"]')
      .waitForElementVisible('*[data-id="generic-template-section-blank"]', 10000)
      .clearValue('*[data-id="workspace-name-blank-input"]')
      .setValue('*[data-id="workspace-name-blank-input"]', 'migrate-ws-A')
      .pause(500)
      .click('*[data-id="validate-blankworkspace-button"]')
      .waitForElementNotPresent('*[data-id="template-explorer-modal-react"]', 30000)
      .currentWorkspaceIs('migrate-ws-A')
      .pause(1000)
      // Create file in blank workspace via right-click context menu
      .rightClickCustom('[data-id="treeViewUltreeViewMenu"]')
      .click('*[data-id="contextMenuItemnewFile"]')
      .waitForElementContainsText('*[data-id$="fileExplorerTreeItemInput"]', '', 60000)
      .sendKeys('*[data-id$="fileExplorerTreeItemInput"]', 'fileA.sol')
      .sendKeys('*[data-id$="fileExplorerTreeItemInput"]', browser.Keys.ENTER)
      .waitForElementVisible({
        selector: `//*[@data-id='tab-active' and contains(@data-path, "fileA.sol")]`,
        locateStrategy: 'xpath',
        timeout: 10000,
      })
      .setEditorValue('// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\n\ncontract MigrateA {\n    string public name = "workspace A";\n}\n')
      .pause(2000)
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemfileA.sol"]', 10000)
  },

  'Should create local workspace migrate-ws-B with files #group6': function (browser: NightwatchBrowser) {
    browser
      .clickWorkspaceDropdown()
      .pause(2000)
      .click('*[data-id="workspacecreate"]')
      .waitForElementVisible('*[data-id="template-explorer-modal-react"]', 10000)
      .waitForElementVisible('*[data-id="template-explorer-template-container"]', 10000)
      .click('*[data-id="template-explorer-template-container"]')
      .waitForElementVisible('*[data-id="template-card-blank-1"]', 10000)
      .click('*[data-id="template-card-blank-1"]')
      .waitForElementVisible('*[data-id="generic-template-section-blank"]', 10000)
      .clearValue('*[data-id="workspace-name-blank-input"]')
      .setValue('*[data-id="workspace-name-blank-input"]', 'migrate-ws-B')
      .pause(500)
      .click('*[data-id="validate-blankworkspace-button"]')
      .waitForElementNotPresent('*[data-id="template-explorer-modal-react"]', 30000)
      .currentWorkspaceIs('migrate-ws-B')
      .pause(1000)
      .rightClickCustom('[data-id="treeViewUltreeViewMenu"]')
      .click('*[data-id="contextMenuItemnewFile"]')
      .waitForElementContainsText('*[data-id$="fileExplorerTreeItemInput"]', '', 60000)
      .sendKeys('*[data-id$="fileExplorerTreeItemInput"]', 'fileB.sol')
      .sendKeys('*[data-id$="fileExplorerTreeItemInput"]', browser.Keys.ENTER)
      .waitForElementVisible({
        selector: `//*[@data-id='tab-active' and contains(@data-path, "fileB.sol")]`,
        locateStrategy: 'xpath',
        timeout: 10000,
      })
      .setEditorValue('// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\n\ncontract MigrateB {\n    uint256 public count = 42;\n}\n')
      .pause(2000)
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemfileB.sol"]', 10000)
  },

  'Should create local workspace migrate-ws-C (will NOT be migrated) #group6': function (browser: NightwatchBrowser) {
    browser
      .clickWorkspaceDropdown()
      .pause(2000)
      .click('*[data-id="workspacecreate"]')
      .waitForElementVisible('*[data-id="template-explorer-modal-react"]', 10000)
      .waitForElementVisible('*[data-id="template-explorer-template-container"]', 10000)
      .click('*[data-id="template-explorer-template-container"]')
      .waitForElementVisible('*[data-id="template-card-blank-1"]', 10000)
      .click('*[data-id="template-card-blank-1"]')
      .waitForElementVisible('*[data-id="generic-template-section-blank"]', 10000)
      .clearValue('*[data-id="workspace-name-blank-input"]')
      .setValue('*[data-id="workspace-name-blank-input"]', 'migrate-ws-C')
      .pause(500)
      .click('*[data-id="validate-blankworkspace-button"]')
      .waitForElementNotPresent('*[data-id="template-explorer-modal-react"]', 30000)
      .currentWorkspaceIs('migrate-ws-C')
      .pause(1000)
      .rightClickCustom('[data-id="treeViewUltreeViewMenu"]')
      .click('*[data-id="contextMenuItemnewFile"]')
      .waitForElementContainsText('*[data-id$="fileExplorerTreeItemInput"]', '', 60000)
      .sendKeys('*[data-id$="fileExplorerTreeItemInput"]', 'fileC.sol')
      .sendKeys('*[data-id$="fileExplorerTreeItemInput"]', browser.Keys.ENTER)
      .waitForElementVisible({
        selector: `//*[@data-id='tab-active' and contains(@data-path, "fileC.sol")]`,
        locateStrategy: 'xpath',
        timeout: 10000,
      })
      .setEditorValue('// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\n\ncontract MigrateC {\n    bool public flag = true;\n}\n')
      .pause(2000)
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemfileC.sol"]', 10000)
  },

  'Should enable cloud and open migration via dropdown #group6': function (browser: NightwatchBrowser) {
    // Re-enable cloud via toggle
    browser
      .clickCloudToggle()
      .pause(10000)
      // Dismiss any auto-appearing migration dialog via JS
      .execute(function () {
        var skip = document.querySelector('[data-id="cloud-migration-dialog-modal-footer-cancel-react"]') as HTMLElement
        if (skip && skip.offsetParent !== null) skip.click()
      })
      .pause(3000)
      // Clear the migration dismissal flag so "Migrate" still shows in dropdown
      .execute(function () {
        var keys = Object.keys(localStorage)
        for (var i = 0; i < keys.length; i++) {
          if (keys[i].indexOf('migrationDismissed') !== -1) localStorage.removeItem(keys[i])
        }
      })
      .pause(1000)
      // Open workspace dropdown and click "Migrate local workspaces to cloud"
      .clickWorkspaceDropdown()
      .pause(2000)
      .waitForElementVisible('*[data-id="workspaceMigrateToCloud"]', 15000)
      .click('*[data-id="workspaceMigrateToCloud"]')
      .pause(3000)
      // Wait for the dialog to appear and finish loading
      .waitForElementVisible('*[data-id="cloud-migration-dialogModalDialogContainer-react"]', 15000)
  },

  'Should deselect migrate-ws-C and migrate only A and B #group6': async function (browser: NightwatchBrowser) {
    // Wait for workspace rows to load (select phase)
    browser
      .waitForElementVisible('*[data-id="migration-ws-migrate-ws-A"]', 10000)
      .waitForElementVisible('*[data-id="migration-ws-migrate-ws-B"]', 10000)
      .waitForElementVisible('*[data-id="migration-ws-migrate-ws-C"]', 10000)

    // Uncheck migrate-ws-C by clicking its checkbox
    browser
      .click('*[data-id="migration-ws-checkbox-migrate-ws-C"]')
      .pause(500)

    // Click the Migrate button
    browser
      .click('*[data-id="cloud-migration-dialog-modal-footer-ok-react"]')
      .pause(3000)

    // Wait for migration to complete — poll for "migration-phase-done" data-id
    let migrationDone = false
    const start = Date.now()
    while (Date.now() - start < 120_000 && !migrationDone) {
      migrationDone = await new Promise<boolean>((resolve) => {
        browser.execute(
          function () {
            return !!document.querySelector('[data-id="migration-phase-done"]')
          },
          [],
          (result: any) => resolve(result?.value === true),
        )
      })
      if (!migrationDone) await new Promise((r) => setTimeout(r, 2000))
    }
    console.log(`[group6] Migration completed in ${Date.now() - start}ms`)
    browser.assert.ok(migrationDone, 'Migration dialog reached "done" phase')

    // Click Done to close the dialog
    browser
      .click('*[data-id="cloud-migration-dialog-modal-footer-ok-react"]')
      .pause(3000)
  },

  'Should verify migrated workspaces in cloud dropdown #group6': function (browser: NightwatchBrowser) {
    browser
      .pause(5000)
      .clickWorkspaceDropdown()
      .pause(2000)
      // Verify migrate-ws-A and migrate-ws-B are listed in cloud
      .waitForElementVisible({
        selector: '//*[contains(@data-id, "dropdown-item-") and contains(., "migrate-ws-A")]',
        locateStrategy: 'xpath',
        timeout: 15000,
      })
      .assert.elementPresent({
        selector: '//*[contains(@data-id, "dropdown-item-") and contains(., "migrate-ws-B")]',
        locateStrategy: 'xpath',
      })
      // Switch to migrate-ws-A
      .click({
        selector: '//*[contains(@data-id, "dropdown-item-") and contains(., "migrate-ws-A")]',
        locateStrategy: 'xpath',
      })
      .pause(10000)
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemfileA.sol"]', 20000)
      .openFile('fileA.sol')
      .pause(2000)
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf('contract MigrateA') !== -1, 'fileA.sol contains contract MigrateA')
        browser.assert.ok(content.indexOf('workspace A') !== -1, 'fileA.sol contains "workspace A"')
      })
  },

  'Should verify migrate-ws-B content in cloud #group6': function (browser: NightwatchBrowser) {
    browser
      .clickWorkspaceDropdown()
      .pause(2000)
      .click({
        selector: '//*[contains(@data-id, "dropdown-item-") and contains(., "migrate-ws-B")]',
        locateStrategy: 'xpath',
      })
      .pause(10000)
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemfileB.sol"]', 20000)
      .openFile('fileB.sol')
      .pause(2000)
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf('contract MigrateB') !== -1, 'fileB.sol contains contract MigrateB')
      })
  },

  'Should verify migrate-ws-C is still local and A/B are gone locally #group6': function (browser: NightwatchBrowser) {
    // Disable cloud to switch to local mode
    browser
      .clickCloudToggle()
      .pause(5000)
      // Open dropdown
      .clickWorkspaceDropdown()
      .pause(2000)
      // migrate-ws-C should still exist locally (it was NOT migrated)
      .waitForElementVisible({
        selector: '//*[contains(@data-id, "dropdown-item-") and contains(., "migrate-ws-C")]',
        locateStrategy: 'xpath',
        timeout: 10000,
      })
      // migrate-ws-A and B should be GONE from local (they were migrated → local deleted)
      .assert.not.elementPresent({
        selector: '//*[contains(@data-id, "dropdown-item-") and contains(., "migrate-ws-A")]',
        locateStrategy: 'xpath',
      })
      .assert.not.elementPresent({
        selector: '//*[contains(@data-id, "dropdown-item-") and contains(., "migrate-ws-B")]',
        locateStrategy: 'xpath',
      })
      // Switch to migrate-ws-C and verify content
      .click({
        selector: '//*[contains(@data-id, "dropdown-item-") and contains(., "migrate-ws-C")]',
        locateStrategy: 'xpath',
      })
      .pause(5000)
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemfileC.sol"]', 20000)
      .openFile('fileC.sol')
      .waitForElementVisible({
        selector: `//*[@data-id='tab-active' and contains(@data-path, "fileC.sol")]`,
        locateStrategy: 'xpath',
        timeout: 10000,
      })
      .pause(5000)
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf('MigrateC') !== -1, 'Local fileC.sol still has MigrateC')
      })
  },

  'Should re-enable cloud and verify migrated workspaces persist #group6': function (browser: NightwatchBrowser) {
    // Re-enable cloud
    browser
      .clickCloudToggle()
      .pause(10000)
      // Dismiss migration dialog if it auto-appears
      .execute(function () {
        var skip = document.querySelector('[data-id="cloud-migration-dialog-modal-footer-cancel-react"]') as HTMLElement
        if (skip && skip.offsetParent !== null) skip.click()
      })
      .pause(3000)
      // Cloud workspace dropdown should still have migrate-ws-A and migrate-ws-B
      .clickWorkspaceDropdown()
      .pause(2000)
      .waitForElementVisible({
        selector: '//*[contains(@data-id, "dropdown-item-") and contains(., "migrate-ws-A")]',
        locateStrategy: 'xpath',
        timeout: 15000,
      })
      .assert.elementPresent({
        selector: '//*[contains(@data-id, "dropdown-item-") and contains(., "migrate-ws-B")]',
        locateStrategy: 'xpath',
      })
      // Switch to migrate-ws-A to confirm it's still accessible
      .click({
        selector: '//*[contains(@data-id, "dropdown-item-") and contains(., "migrate-ws-A")]',
        locateStrategy: 'xpath',
      })
      .pause(10000)
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemfileA.sol"]', 20000)
  },

  // ───── Group 7: logout / login isolation — cloud workspaces are per-account ─────

  'Should login and create a cloud workspace with data #group7': async function (browser: NightwatchBrowser) {
    // Standard pool login flow
    browser
      .execute(function () {
        localStorage.setItem('enableLogin', 'true')
      })
      .refreshPage()
      .pause(5000)
      .waitForElementVisible('*[data-id="login-button"]', 15000)
      .click('*[data-id="login-button"]')
      .pause(3000)
      .waitForElementVisible({
        selector: '//button[contains(., "E2E Test Pool")]',
        locateStrategy: 'xpath',
        timeout: 15000,
      })
      .click({
        selector: '//button[contains(., "E2E Test Pool")]',
        locateStrategy: 'xpath',
      })
      .pause(5000)
      // Enable cloud mode via toggle (cloud is OFF by default after login)
      .clickCloudToggle()
      .pause(10000)

    // Create a cloud workspace from the Blank template
    browser
      .clickWorkspaceDropdown()
      .pause(2000)
      .click('*[data-id="workspacecreate"]')
      .waitForElementVisible('*[data-id="template-explorer-modal-react"]', 10000)
      .waitForElementVisible('*[data-id="template-explorer-template-container"]', 10000)
      .click('*[data-id="template-explorer-template-container"]')
      .waitForElementVisible('*[data-id="template-card-blank-1"]', 10000)
      .click('*[data-id="template-card-blank-1"]')
      .waitForElementVisible('*[data-id="generic-template-section-blank"]', 10000)
      .waitForElementVisible('*[data-id="workspace-name-blank-input"]', 10000)
      .click('*[data-id="workspace-name-blank-input"]')
      .clearValue('*[data-id="workspace-name-blank-input"]')
      .setValue('*[data-id="workspace-name-blank-input"]', 'user1-cloud-ws')
      .pause(500)
      .click('*[data-id="validate-blankworkspace-button"]')
      .currentWorkspaceIs('user1-cloud-ws')

    // Wait for cloud sync to finish
    await waitForSyncIdle(browser)
  },

  'Should add a file to the cloud workspace #group7': async function (browser: NightwatchBrowser) {
    browser
      .addFile('isolation-test.sol', {
        content: '// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\n\ncontract IsolationTest {\n    string public owner = "user1";\n}\n',
      }, 'remix.config.json')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemisolation-test.sol"]', 10000)

    await waitForSyncIdle(browser)
  },

  'Should verify workspace content before logout #group7': function (browser: NightwatchBrowser) {
    browser
      .openFile('isolation-test.sol')
      .pause(2000)
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf('IsolationTest') !== -1, 'Cloud workspace has IsolationTest contract')
      })
  },

  'Should log out and see only local default workspace #group7': function (browser: NightwatchBrowser) {
    // Open user menu and click Sign Out
    browser
      .click('*[data-id="user-menu-compact"]')
      .pause(1000)
      .waitForElementVisible('*[data-id="user-menu-sign-out"]', 5000)
      .click('*[data-id="user-menu-sign-out"]')
      .pause(5000)

    // After logout, should see the Sign In button again
    browser
      .waitForElementVisible('*[data-id="login-button"]', 15000)

    // Cloud workspace should NOT be in the dropdown — only the local default_workspace
    browser
      .clickWorkspaceDropdown()
      .pause(2000)
      .assert.not.elementPresent({
        selector: '//*[contains(@data-id, "dropdown-item-") and contains(., "user1-cloud-ws")]',
        locateStrategy: 'xpath',
      })
      // There should be a default workspace
      .assert.elementPresent({
        selector: '//*[contains(@data-id, "dropdown-item-") and contains(., "default_workspace")]',
        locateStrategy: 'xpath',
      })
      // Close the dropdown
      .clickWorkspaceDropdown()
      .pause(500)
  },

  'Should login with a new pool account #group7': function (browser: NightwatchBrowser) {
    // Log in again — the pool should give us a DIFFERENT account
    // Cloud stays OFF — we just verify the workspace list is empty for this user
    browser
      .click('*[data-id="login-button"]')
      .pause(3000)
      .waitForElementVisible({
        selector: '//button[contains(., "E2E Test Pool")]',
        locateStrategy: 'xpath',
        timeout: 15000,
      })
      .click({
        selector: '//button[contains(., "E2E Test Pool")]',
        locateStrategy: 'xpath',
      })
      .pause(5000)
  },

  'Should NOT see the first user cloud workspace #group7': function (browser: NightwatchBrowser) {
    // The new user should not have user1-cloud-ws in their workspace list
    browser
      .clickWorkspaceDropdown()
      .pause(2000)
      .assert.not.elementPresent({
        selector: '//*[contains(@data-id, "dropdown-item-") and contains(., "user1-cloud-ws")]',
        locateStrategy: 'xpath',
      })
      // Close dropdown
      .clickWorkspaceDropdown()
      .pause(500)
  },

  // ══════════════════════════════════════════════════════════════
  //  Group 8 — Rename & delete cloud workspaces + S3 persistence
  // ══════════════════════════════════════════════════════════════

  'Should login and enable cloud #group8': function (browser: NightwatchBrowser) {
    browser
      .execute(function () { localStorage.setItem('enableLogin', 'true') })
      .refreshPage()
      .pause(5000)
      .waitForElementVisible('*[data-id="login-button"]', 15000)
      .click('*[data-id="login-button"]')
      .pause(3000)
      .waitForElementVisible({
        selector: '//button[contains(., "E2E Test Pool")]',
        locateStrategy: 'xpath',
        timeout: 15000,
      })
      .click({
        selector: '//button[contains(., "E2E Test Pool")]',
        locateStrategy: 'xpath',
      })
      .pause(5000)
      .clickCloudToggle()
      .pause(10000)
  },

  'Should create three cloud workspaces #group8': async function (browser: NightwatchBrowser) {
    // ─── Create rename-me ───
    browser
      .clickWorkspaceDropdown()
      .pause(2000)
      .click('*[data-id="workspacecreate"]')
      .waitForElementVisible('*[data-id="template-explorer-modal-react"]', 10000)
      .waitForElementVisible('*[data-id="template-explorer-template-container"]', 10000)
      .click('*[data-id="template-explorer-template-container"]')
      .waitForElementVisible('*[data-id="template-card-blank-1"]', 10000)
      .click('*[data-id="template-card-blank-1"]')
      .waitForElementVisible('*[data-id="generic-template-section-blank"]', 10000)
      .waitForElementVisible('*[data-id="workspace-name-blank-input"]', 10000)
      .click('*[data-id="workspace-name-blank-input"]')
      .clearValue('*[data-id="workspace-name-blank-input"]')
      .setValue('*[data-id="workspace-name-blank-input"]', 'rename-me')
      .pause(500)
      .click('*[data-id="validate-blankworkspace-button"]')
      .currentWorkspaceIs('rename-me')
    browser
      .addFile('rename-file.sol', {
        content: '// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\n\ncontract RenameTest {\n    string public msg = "I was renamed";\n}\n',
      }, 'remix.config.json')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemrename-file.sol"]', 10000)
    await waitForSyncIdle(browser)

    // ─── Create delete-me ───
    browser
      .clickWorkspaceDropdown()
      .pause(2000)
      .click('*[data-id="workspacecreate"]')
      .waitForElementVisible('*[data-id="template-explorer-modal-react"]', 10000)
      .waitForElementVisible('*[data-id="template-explorer-template-container"]', 10000)
      .click('*[data-id="template-explorer-template-container"]')
      .waitForElementVisible('*[data-id="template-card-blank-1"]', 10000)
      .click('*[data-id="template-card-blank-1"]')
      .waitForElementVisible('*[data-id="generic-template-section-blank"]', 10000)
      .waitForElementVisible('*[data-id="workspace-name-blank-input"]', 10000)
      .click('*[data-id="workspace-name-blank-input"]')
      .clearValue('*[data-id="workspace-name-blank-input"]')
      .setValue('*[data-id="workspace-name-blank-input"]', 'delete-me')
      .pause(500)
      .click('*[data-id="validate-blankworkspace-button"]')
      .currentWorkspaceIs('delete-me')
    browser
      .addFile('doomed-file.sol', {
        content: '// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\n\ncontract DoomedContract {\n    string public msg = "goodbye";\n}\n',
      }, 'remix.config.json')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemdoomed-file.sol"]', 10000)
    await waitForSyncIdle(browser)

    // ─── Create keep-me ───
    browser
      .clickWorkspaceDropdown()
      .pause(2000)
      .click('*[data-id="workspacecreate"]')
      .waitForElementVisible('*[data-id="template-explorer-modal-react"]', 10000)
      .waitForElementVisible('*[data-id="template-explorer-template-container"]', 10000)
      .click('*[data-id="template-explorer-template-container"]')
      .waitForElementVisible('*[data-id="template-card-blank-1"]', 10000)
      .click('*[data-id="template-card-blank-1"]')
      .waitForElementVisible('*[data-id="generic-template-section-blank"]', 10000)
      .waitForElementVisible('*[data-id="workspace-name-blank-input"]', 10000)
      .click('*[data-id="workspace-name-blank-input"]')
      .clearValue('*[data-id="workspace-name-blank-input"]')
      .setValue('*[data-id="workspace-name-blank-input"]', 'keep-me')
      .pause(500)
      .click('*[data-id="validate-blankworkspace-button"]')
      .currentWorkspaceIs('keep-me')
    browser
      .addFile('keeper-file.sol', {
        content: '// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\n\ncontract KeeperContract {\n    string public msg = "still here";\n}\n',
      }, 'remix.config.json')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemkeeper-file.sol"]', 10000)
    await waitForSyncIdle(browser)
  },

  'Should rename rename-me to renamed-ws #group8': async function (browser: NightwatchBrowser) {
    // Open dropdown and click the sub-menu icon for rename-me
    browser
      .clickWorkspaceDropdown()
      .pause(2000)
      .waitForElementVisible('*[data-id="dropdown-item-rename-me"]', 10000)
    // Click the three-dot icon next to rename-me
    const subMenuSelector = 'a[data-id="dropdown-item-rename-me"] + div [data-id="workspacesubMenuIcon"]'
    browser
      .waitForElementVisible(subMenuSelector, 10000)
      .click(subMenuSelector)
      .waitForElementVisible('*[data-id="workspacesubMenuRename"]', 5000)
      .click('*[data-id="workspacesubMenuRename"]')
      .pause(500)
      .waitForElementVisible('*[data-id="modalDialogCustomPromptTextRename"]', 10000)
      .click('*[data-id="modalDialogCustomPromptTextRename"]')
      .clearValue('*[data-id="modalDialogCustomPromptTextRename"]')
      .setValue('*[data-id="modalDialogCustomPromptTextRename"]', 'renamed-ws')
      .waitForElementPresent('[data-id="topbarModalStaticModalDialogModalFooter-react"] .modal-ok')
      .click('[data-id="topbarModalStaticModalDialogModalFooter-react"] > .modal-ok')
      .pause(3000)
    // Verify the rename took effect
    browser
      .clickWorkspaceDropdown()
      .pause(2000)
      .waitForElementVisible('*[data-id="dropdown-item-renamed-ws"]', 10000)
      .assert.not.elementPresent('*[data-id="dropdown-item-rename-me"]')
      .click('*[data-id="dropdown-item-renamed-ws"]')
    await waitForSyncIdle(browser)
    browser
      .currentWorkspaceIs('renamed-ws')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemrename-file.sol"]', 20000)
  },

  'Should delete delete-me workspace #group8': function (browser: NightwatchBrowser) {
    // Open dropdown and click the sub-menu icon for delete-me
    browser
      .clickWorkspaceDropdown()
      .pause(2000)
      .waitForElementVisible('*[data-id="dropdown-item-delete-me"]', 10000)
      // Click the three-dot icon next to delete-me
      .waitForElementVisible({
        selector: '//a[@data-id="dropdown-item-delete-me"]/following-sibling::div//*[@data-id="workspacesubMenuIcon"]',
        locateStrategy: 'xpath',
        timeout: 10000,
      })
      .click({
        selector: '//a[@data-id="dropdown-item-delete-me"]/following-sibling::div//*[@data-id="workspacesubMenuIcon"]',
        locateStrategy: 'xpath',
      })
      .pause(500)
      .waitForElementVisible('*[data-id="workspacesubMenuDelete"]', 5000)
      .click('*[data-id="workspacesubMenuDelete"]')
      .waitForElementVisible('*[data-id="topbarModalStaticModalDialogModalFooter-react"]')
      .click('*[data-id="topbarModalStaticModalDialogModalFooter-react"] .modal-ok')
      .pause(5000)
    // Verify delete-me is gone from the dropdown
    browser
      .clickWorkspaceDropdown()
      .pause(2000)
      .assert.not.elementPresent('*[data-id="dropdown-item-delete-me"]')
      // renamed-ws and keep-me should still be there
      .waitForElementVisible('*[data-id="dropdown-item-renamed-ws"]', 10000)
      .waitForElementVisible('*[data-id="dropdown-item-keep-me"]', 10000)
      .clickWorkspaceDropdown()
      .pause(500)
  },

  'Should wipe local data and reload #group8': async function (browser: NightwatchBrowser) {
    browser
      .execute(function () {
        return (window as any).remixFileSystem.unlink('.cloud-workspaces')
      }, [], function () {
        console.log('[group8] Wiped .cloud-workspaces from local FS')
      })
      .refresh()
      .waitForElementVisible('[data-id="workspacesSelect"]', 30000)
      // Re-enable cloud (OFF by default after reload)
      .clickCloudToggle()
      .pause(10000)
    await waitForSyncIdle(browser, 60_000)
  },

  'Should verify renamed-ws survived S3 restore #group8': async function (browser: NightwatchBrowser) {
    browser
      .clickWorkspaceDropdown()
      .pause(2000)
      .waitForElementVisible('*[data-id="dropdown-item-renamed-ws"]', 20000)
      .click('*[data-id="dropdown-item-renamed-ws"]')
    await waitForSyncIdle(browser)
    browser
      .currentWorkspaceIs('renamed-ws')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemrename-file.sol"]', 20000)
      .openFile('rename-file.sol')
      .pause(2000)
      .getEditorValue((content) => {
        browser.assert.ok(
          content.indexOf('RenameTest') !== -1,
          'renamed-ws: rename-file.sol contains contract RenameTest'
        )
      })
  },

  'Should verify delete-me is still gone after S3 restore #group8': function (browser: NightwatchBrowser) {
    browser
      .clickWorkspaceDropdown()
      .pause(2000)
      .assert.not.elementPresent('*[data-id="dropdown-item-delete-me"]')
      .pause(500)
  },

  'Should verify keep-me survived S3 restore #group8': async function (browser: NightwatchBrowser) {
    browser
      .pause(2000)
      .waitForElementVisible('*[data-id="dropdown-item-keep-me"]', 20000)
      .click('*[data-id="dropdown-item-keep-me"]')
    await waitForSyncIdle(browser)
    browser
      .currentWorkspaceIs('keep-me')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemkeeper-file.sol"]', 20000)
      .openFile('keeper-file.sol')
      .pause(2000)
      .getEditorValue((content) => {
        browser.assert.ok(
          content.indexOf('KeeperContract') !== -1,
          'keep-me: keeper-file.sol contains contract KeeperContract'
        )
      })
  },

  // ══════════════════════════════════════════════════════════════
  //  Group 9 — File edit + file delete persistence across S3 restore
  // ══════════════════════════════════════════════════════════════

  'Should login and enable cloud for file ops test #group9': function (browser: NightwatchBrowser) {
    browser
      .execute(function () { localStorage.setItem('enableLogin', 'true') })
      .refreshPage()
      .pause(5000)
      .waitForElementVisible('*[data-id="login-button"]', 15000)
      .click('*[data-id="login-button"]')
      .pause(3000)
      .waitForElementVisible({
        selector: '//button[contains(., "E2E Test Pool")]',
        locateStrategy: 'xpath',
        timeout: 15000,
      })
      .click({
        selector: '//button[contains(., "E2E Test Pool")]',
        locateStrategy: 'xpath',
      })
      .pause(5000)
      .clickCloudToggle()
      .pause(10000)
  },

  'Should create a workspace with three files #group9': async function (browser: NightwatchBrowser) {
    browser
      .clickWorkspaceDropdown()
      .pause(2000)
      .click('*[data-id="workspacecreate"]')
      .waitForElementVisible('*[data-id="template-explorer-modal-react"]', 10000)
      .waitForElementVisible('*[data-id="template-explorer-template-container"]', 10000)
      .click('*[data-id="template-explorer-template-container"]')
      .waitForElementVisible('*[data-id="template-card-blank-1"]', 10000)
      .click('*[data-id="template-card-blank-1"]')
      .waitForElementVisible('*[data-id="generic-template-section-blank"]', 10000)
      .waitForElementVisible('*[data-id="workspace-name-blank-input"]', 10000)
      .click('*[data-id="workspace-name-blank-input"]')
      .clearValue('*[data-id="workspace-name-blank-input"]')
      .setValue('*[data-id="workspace-name-blank-input"]', 'file-ops-ws')
      .pause(500)
      .click('*[data-id="validate-blankworkspace-button"]')
      .currentWorkspaceIs('file-ops-ws')

    // Add three files: edit-me.sol, delete-me.sol, untouched.sol
    browser
      .addFile('edit-me.sol', {
        content: '// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\n\ncontract EditMe {\n    string public version = "v1";\n}\n',
      }, 'remix.config.json')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemedit-me.sol"]', 10000)
    browser
      .addFile('delete-me.sol', {
        content: '// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\n\ncontract DeleteMe {\n    string public msg = "soon gone";\n}\n',
      }, 'edit-me.sol')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemdelete-me.sol"]', 10000)
    browser
      .addFile('untouched.sol', {
        content: '// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\n\ncontract Untouched {\n    string public msg = "never changed";\n}\n',
      }, 'delete-me.sol')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemuntouched.sol"]', 10000)

    await waitForSyncIdle(browser)
  },

  'Should edit edit-me.sol with new content #group9': async function (browser: NightwatchBrowser) {
    browser
      .openFile('edit-me.sol')
      .pause(2000)
      .setEditorValue('// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\n\ncontract EditMe {\n    string public version = "v2-updated";\n    uint256 public counter = 42;\n}\n')
      .pause(1000)
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf('v2-updated') !== -1, 'Editor contains v2-updated after edit')
        browser.assert.ok(content.indexOf('counter = 42') !== -1, 'Editor contains counter = 42 after edit')
      })

    await waitForSyncIdle(browser)
  },

  'Should delete delete-me.sol #group9': async function (browser: NightwatchBrowser) {
    browser
      .removeFile('delete-me.sol', 'file-ops-ws')

    await waitForSyncIdle(browser)
  },

  'Should verify state before wipe #group9': function (browser: NightwatchBrowser) {
    // edit-me.sol should exist with v2 content
    browser
      .openFile('edit-me.sol')
      .pause(2000)
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf('v2-updated') !== -1, 'Pre-wipe: edit-me.sol has v2-updated')
      })
    // delete-me.sol should be gone
    browser
      .assert.not.elementPresent('*[data-id="treeViewLitreeViewItemdelete-me.sol"]')
    // untouched.sol should still be there
    browser
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemuntouched.sol"]', 10000)
  },

  'Should wipe local data and reload #group9': async function (browser: NightwatchBrowser) {
    browser
      .execute(function () {
        // Clear workspace names from localStorage BEFORE wipe/reload
        // so that after reload, enableCloud triggers a fresh workspace switch
        // (otherwise Redux may see the same name and skip re-rendering the tree)
        localStorage.removeItem('currentWorkspace')
        localStorage.removeItem('lastCloudWorkspace')
        // Also try cloud-scoped keys
        for (var i = 0; i < localStorage.length; i++) {
          var key = localStorage.key(i) || ''
          if (key.indexOf('lastCloudWorkspace') >= 0) {
            localStorage.removeItem(key)
          }
        }
        return (window as any).remixFileSystem.unlink('.cloud-workspaces')
      }, [], function () {
        console.log('[group9] Wiped .cloud-workspaces + localStorage from local FS')
      })
      .refresh()
      .waitForElementVisible('[data-id="workspacesSelect"]', 30000)
      .clickCloudToggle()
      .pause(15000)
    await waitForSyncIdle(browser, 60_000)
    // Extra pause to ensure the S3 pull and file tree are fully loaded
    browser.pause(5000)
  },

  'Should verify edit-me.sol has v2 content after S3 restore #group9': async function (browser: NightwatchBrowser) {
    // The first enableCloud restored data from S3 but the tree may not render.
    // Do a second refresh → enableCloud cycle to ensure proper tree rendering.
    browser
      .refresh()
      .waitForElementVisible('[data-id="workspacesSelect"]', 30000)
      .clickCloudToggle()
      .pause(10000)

    await waitForSyncIdle(browser, 60_000)

    // Click file panel to ensure it's active and renders the tree
    await browser
//       .clickLaunchIcon('filePanel')
      .pause(3000)
      .currentWorkspaceIs('file-ops-ws')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemedit-me.sol"]', 30000)
      .openFile('edit-me.sol')
      .pause(2000)
      .getEditorValue((content) => {
        browser.assert.ok(
          content.indexOf('v2-updated') !== -1,
          'After restore: edit-me.sol contains v2-updated'
        )
        browser.assert.ok(
          content.indexOf('counter = 42') !== -1,
          'After restore: edit-me.sol contains counter = 42'
        )
        browser.assert.ok(
          content.indexOf('version = "v1"') === -1,
          'After restore: edit-me.sol no longer contains old v1 content'
        )
      })
  },

  'Should verify delete-me.sol is still gone after S3 restore #group9': function (browser: NightwatchBrowser) {
    browser
      .assert.not.elementPresent('*[data-id="treeViewLitreeViewItemdelete-me.sol"]')
  },

  'Should verify untouched.sol is unchanged after S3 restore #group9': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemuntouched.sol"]', 30000)
      .openFile('untouched.sol')
      .pause(2000)
      .getEditorValue((content) => {
        browser.assert.ok(
          content.indexOf('never changed') !== -1,
          'After restore: untouched.sol still contains "never changed"'
        )
      })
  },

  // ══════════════════════════════════════════════════════════════
  //  Group 10 — Git Clone via template explorer in cloud mode
  // ══════════════════════════════════════════════════════════════

  'Should login and enable cloud for git clone test #group10': function (browser: NightwatchBrowser) {
    browser
      .execute(function () { localStorage.setItem('enableLogin', 'true') })
      .refreshPage()
      .pause(5000)
      .waitForElementVisible('*[data-id="login-button"]', 15000)
      .click('*[data-id="login-button"]')
      .pause(3000)
      .waitForElementVisible({
        selector: '//button[contains(., "E2E Test Pool")]',
        locateStrategy: 'xpath',
        timeout: 15000,
      })
      .click({
        selector: '//button[contains(., "E2E Test Pool")]',
        locateStrategy: 'xpath',
      })
      .pause(5000)
      .clickCloudToggle()
      .pause(10000)
  },

  'Should open template explorer and clone awesome-remix via Git Clone #group10': async function (browser: NightwatchBrowser) {
    browser
      .clickWorkspaceDropdown()
      .pause(2000)
      .click('*[data-id="workspacecreate"]')
      .waitForElementVisible('*[data-id="template-explorer-modal-react"]', 10000)
      // Click "Git Clone" top card
      .waitForElementVisible('*[data-id="create-git-clone"]', 10000)
      .click('*[data-id="create-git-clone"]')
      // Wait for the git clone screen to appear
      .waitForElementVisible('*[data-id="git-clone-screen-url-input"]', 10000)
      .click('*[data-id="git-clone-screen-url-input"]')
      .clearValue('*[data-id="git-clone-screen-url-input"]')
      .setValue('*[data-id="git-clone-screen-url-input"]', 'https://github.com/remix-project-org/awesome-remix')
      .pause(500)
      // Click Clone button
      .waitForElementVisible('*[data-id="git-clone-screen-clone-btn"]', 5000)
      .click('*[data-id="git-clone-screen-clone-btn"]')
      // Wait for modal to disappear — clone is complete once modal closes
      .waitForElementNotPresent('*[data-id="template-explorer-modal-react"]', 120000)
      .pause(5000)

    // Wait for sync engine to push to S3
    await waitForSyncIdle(browser, 120_000)

    // Verify the awesome-remix workspace was created with expected files
    browser
      .currentWorkspaceIs('awesome-remix')
//       .clickLaunchIcon('filePanel')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemREADME.md"]', 30000)
  },

  'Should verify awesome-remix sync integrity #group10': async function (browser: NightwatchBrowser) {
    const result = await waitAndVerifySync(browser, 60_000)
    console.log(`[group10] awesome-remix clone: manifest=${result.manifestFileCount}, remote=${result.remoteFileCount}, ok=${result.ok}`)
  },

  'Should wipe local data and restore cloned workspace from S3 #group10': async function (browser: NightwatchBrowser) {
    browser
      .execute(function () {
        return (window as any).remixFileSystem.unlink('.cloud-workspaces')
      }, [], function () {
        console.log('[group10] Wiped .cloud-workspaces from local FS')
      })
      .refresh()
      .waitForElementVisible('[data-id="workspacesSelect"]', 30000)
      .clickCloudToggle()
      .pause(10000)

    await waitForSyncIdle(browser, 120_000)
  },

  'Should verify cloned workspace restored from S3 #group10': function (browser: NightwatchBrowser) {
    browser
      .clickWorkspaceDropdown()
      .pause(2000)
      .waitForElementVisible({
        selector: '//*[contains(@data-id, "dropdown-item-") and contains(., "awesome-remix")]',
        locateStrategy: 'xpath',
        timeout: 20000,
      })
      .click({
        selector: '//*[contains(@data-id, "dropdown-item-") and contains(., "awesome-remix")]',
        locateStrategy: 'xpath',
      })
      .pause(10000)
      .currentWorkspaceIs('awesome-remix')
//       .clickLaunchIcon('filePanel')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemREADME.md"]', 30000)
      .openFile('README.md')
  },

  // ══════════════════════════════════════════════════════════════
  //  Group 11 — AI workspace generation in cloud mode
  // ══════════════════════════════════════════════════════════════

  'Should login and enable cloud for AI workspace test #group11': function (browser: NightwatchBrowser) {
    browser
      .execute(function () { localStorage.setItem('enableLogin', 'true') })
      .refreshPage()
      .pause(5000)
      .waitForElementVisible('*[data-id="login-button"]', 15000)
      .click('*[data-id="login-button"]')
      .pause(3000)
      .waitForElementVisible({
        selector: '//button[contains(., "E2E Test Pool")]',
        locateStrategy: 'xpath',
        timeout: 15000,
      })
      .click({
        selector: '//button[contains(., "E2E Test Pool")]',
        locateStrategy: 'xpath',
      })
      .pause(5000)
      .clickCloudToggle()
      .pause(10000)
  },

  'Should open template explorer and generate workspace with AI #group11': function (browser: NightwatchBrowser) {
    browser
      .clickWorkspaceDropdown()
      .pause(2000)
      .click('*[data-id="workspacecreate"]')
      .waitForElementVisible('*[data-id="template-explorer-modal-react"]', 10000)
      // Click "Create with AI" top card
      .waitForElementVisible('*[data-id="create-with-ai-topcard"]', 10000)
      .click('*[data-id="create-with-ai-topcard"]')
      // Wait for the AI prompt textarea to appear
      .waitForElementVisible('*[data-id="ai-workspace-prompt-input"]', 10000)
      .click('*[data-id="ai-workspace-prompt-input"]')
      .setValue('*[data-id="ai-workspace-prompt-input"]', 'Create a simple ERC20 token contract called TestToken with a mint function')
      .pause(500)
      // Click "Generate my Workspace" button
      .waitForElementVisible('*[data-id="validateWorkspaceButton"]', 5000)
      .click('*[data-id="validateWorkspaceButton"]')
      // Modal should close after clicking generate
      .waitForElementNotPresent('*[data-id="template-explorer-modal-react"]', 15000)
      .pause(3000)
  },

  'Should wait for AI workspace generation to complete #group11': async function (browser: NightwatchBrowser) {
    // The AI generates files asynchronously — poll until the workspace has at least one .sol file
    let hasSolFile = false
    const start = Date.now()
    const timeout = 180_000 // 3 minutes max for AI generation

    while (Date.now() - start < timeout && !hasSolFile) {
      hasSolFile = await new Promise<boolean>((resolve) => {
        browser.execute(
          function () {
            // Check if any .sol file is visible in the file tree
            var solFiles = document.querySelectorAll('[data-id*="treeViewLitreeViewItem"][data-id$=".sol"]')
            return solFiles.length > 0
          },
          [],
          (result: any) => resolve(result?.value === true),
        )
      })
      if (!hasSolFile) {
        await new Promise((r) => setTimeout(r, 5000))
      }
    }

    console.log(`[group11] AI workspace: has .sol file=${hasSolFile}, elapsed=${Date.now() - start}ms`)
    browser.assert.ok(hasSolFile, 'AI generated at least one .sol file in the workspace')
  },

  'Should verify AI workspace has files and sync to S3 #group11': async function (browser: NightwatchBrowser) {
    // Wait for sync to push the AI-generated files to S3
    await waitForSyncIdle(browser, 60_000)

    // Verify sync integrity — AI workspace should have files synced
    const result = await waitAndVerifySync(browser, 60_000)
    console.log(`[group11] AI workspace: manifest=${result.manifestFileCount}, remote=${result.remoteFileCount}, ok=${result.ok}`)
    browser.assert.ok(result.manifestFileCount > 0, 'AI workspace has files in manifest')
  },

  'Should wipe local data and restore AI workspace from S3 #group11': async function (browser: NightwatchBrowser) {
    // Save workspace name before wipe
    const wsName = await new Promise<string>((resolve) => {
      browser.execute(
        function () {
          var el = document.querySelector('[data-id="workspacesSelect-togglerText"]')
          return el ? el.textContent.trim() : ''
        },
        [],
        (result: any) => resolve(result?.value || ''),
      )
    })
    console.log(`[group11] AI workspace name before wipe: "${wsName}"`)

    browser
      .execute(function () {
        return (window as any).remixFileSystem.unlink('.cloud-workspaces')
      }, [], function () {
        console.log('[group11] Wiped .cloud-workspaces from local FS')
      })
      .refresh()
      .waitForElementVisible('[data-id="workspacesSelect"]', 30000)
      .clickCloudToggle()
      .pause(10000)

    await waitForSyncIdle(browser, 120_000)
  },

  'Should verify AI workspace restored from S3 with .sol files #group11': async function (browser: NightwatchBrowser) {
    // After restore, check that at least one .sol file exists in the file tree
    // The AI workspace should be auto-selected or available in the dropdown
    browser.clickLaunchIcon('filePanel').expandAllFolders()
    let hasSolFile = false
    const start = Date.now()
    while (Date.now() - start < 60_000 && !hasSolFile) {
      hasSolFile = await new Promise<boolean>((resolve) => {
        browser.execute(
          function () {
            var solFiles = document.querySelectorAll('[data-id*="treeViewLitreeViewItem"][data-id$=".sol"]')
            return solFiles.length > 0
          },
          [],
          (result: any) => resolve(result?.value === true),
        )
      })
      if (!hasSolFile) {
        await new Promise((r) => setTimeout(r, 3000))
      }
    }

    console.log(`[group11] After S3 restore: has .sol file=${hasSolFile}`)
    browser.assert.ok(hasSolFile, 'AI workspace restored from S3 still has .sol files')
  }

}
