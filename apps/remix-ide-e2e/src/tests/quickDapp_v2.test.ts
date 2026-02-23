'use strict'
import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

module.exports = {
  '@disabled': true,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done, 'http://127.0.0.1:8080', false)
  },

  '@sources': function () {
    return sources
  },

  // ──────────────────────────────────
  // Test 1: Compile+deploy contract and trigger QuickDapp V2 via sparkle button
  // ──────────────────────────────────
  'Should compile and deploy Storage contract #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementPresent('*[data-id="remixIdeSidePanel"]')
      .clickLaunchIcon('filePanel')
      .addFile('Storage.sol', sources[0]['Storage.sol'])
      .clickLaunchIcon('solidity')
      .waitForElementVisible('*[data-id="compilerContainerCompileBtn"]')
      .click('*[data-id="compilerContainerCompileBtn"]')
      .waitForElementPresent('*[data-id="compiledContracts"] option', 60000)
      .clickLaunchIcon('udapp')
      .waitForElementVisible('*[data-id="deployButton"]', 45000)
      .click('*[data-id="deployButton"]')
      .pause(3000)
      .waitForElementPresent('[data-id="deployedContractItem-0"]', 30000)
  },

  // ──────────────────────────────────
  // Test 2: Click kebab menu → Create a dapp, verify AI modal, enter description, and generate
  // ──────────────────────────────────
  'Should open AI modal and submit DApp generation request #group1': function (browser: NightwatchBrowser) {
    browser
      .click('*[data-id="contractKebabIcon-0"]')
      .pause(500)
      .waitForElementVisible('*[data-id="createDapp"]', 5000)
      .click('*[data-id="createDapp"]')
      .pause(2000)
      .waitForElementVisible('*[data-id="generate-website-aiModalDialogModalTitle-react"]', 10000)
      .assert.textContains('*[data-id="generate-website-aiModalDialogModalTitle-react"]', 'Generate a Dapp UI with AI')
      .waitForElementVisible('*[data-id="generate-website-aiModalDialogModalBody-react"] textarea', 5000)
      .waitForElementVisible('*[data-id="generate-website-ai-modal-footer-ok-react"]', 5000)
      .pause(500)
      .execute(function () {
        const textarea = document.querySelector('[data-id="generate-website-aiModalDialogModalBody-react"] textarea') as HTMLTextAreaElement
        if (textarea) {
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
          nativeInputValueSetter.call(textarea, 'Create a simple Storage DApp with a dark theme. Include store and retrieve buttons.')
          textarea.dispatchEvent(new Event('input', { bubbles: true }))
        }
      })
      .pause(500)
      .click('*[data-id="generate-website-ai-modal-footer-ok-react"]')
      .pause(1000)
  },

  // ──────────────────────────────────
  // Test 3: Wait for DApp generation and verify QuickDapp V2 side panel opens with dashboard
  // ──────────────────────────────────
  'Should wait for DApp generation and display dashboard #group1': function (browser: NightwatchBrowser) {
    browser
      .pause(10000)
      .waitForElementVisible('*[data-id="quick-dapp-dashboard"]', 180000)
      .pause(2000)
      .waitForElementVisible('*[data-id="dapp-count-badge"]', 10000)
      .assert.not.textEquals('*[data-id="dapp-count-badge"]', '0')
      .waitForElementVisible('[data-id^="dapp-card-"]', 30000)
  },

  // ──────────────────────────────────
  // Test 5: Verify dashboard has correct UI elements
  // ──────────────────────────────────
  'Should display dashboard with all expected UI elements #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="create-new-dapp-btn"]', 5000)
      .waitForElementVisible('*[data-id="delete-all-dapps-btn"]', 5000)
      .waitForElementVisible('*[data-id="network-filter-select"]', 5000)
      .waitForElementVisible('*[data-id="sort-order-select"]', 5000)
      .waitForElementVisible('[data-id^="dapp-card-name-"]', 5000)
      .waitForElementVisible('[data-id^="dapp-status-"]', 5000)
      .waitForElementVisible('[data-id^="dapp-network-"]', 5000)
  },

  // ──────────────────────────────────
  // Test 6: Wait for any processing spinner to finish, then open DApp editor
  // ──────────────────────────────────
  'Should open DApp editor by clicking on DApp card #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementNotPresent('.spinner-border', 90000)
      .pause(1000)
      .click('[data-id^="dapp-card-"]')
      .pause(5000)
      .waitForElementVisible('*[data-id="back-to-dashboard-btn"]', 30000)
      .waitForElementVisible('*[data-id="editor-dapp-title"]', 10000)
      .waitForElementVisible('*[data-id="editor-workspace-name"]', 10000)
  },

  // ──────────────────────────────────
  // Test 7: Verify editor has all expected UI elements (ChatBox, Preview, DeployPanel)
  // ──────────────────────────────────
  'Should display all editor UI elements #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="chat-input"]', 10000)
      .waitForElementVisible('*[data-id="chat-send-btn"]', 10000)
      .waitForElementVisible('*[data-id="chat-attach-btn"]', 10000)
      .waitForElementVisible('*[data-id="refresh-preview-btn"]', 10000)
      .waitForElementVisible('*[data-id="dapp-preview-iframe"]', 10000)
      .waitForElementVisible('*[data-id="delete-dapp-editor-btn"]', 10000)
      .waitForElementVisible('*[data-id="deploy-panel"]', 10000)
      .waitForElementVisible('*[data-id="deploy-ipfs-btn"]', 10000)
  },

  // ──────────────────────────────────
  // Test 8: Verify VM warning banner is displayed
  // ──────────────────────────────────
  'Should display VM warning banner in editor #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="vm-warning-banner"]', 30000)
      .assert.textContains('*[data-id="vm-warning-banner"]', 'Remix VM')
      .assert.textContains('*[data-id="vm-warning-banner"]', 'Local Only')
  },

  // ──────────────────────────────────
  // Test 9: Click Refresh Preview and verify build completes
  // ──────────────────────────────────
  'Should refresh preview successfully #group1': function (browser: NightwatchBrowser) {
    browser
      .pause(3000)
      .execute(function () {
        const closeBtn = document.querySelector('[data-id="notification-modal-close-btn"]') as HTMLElement
        if (closeBtn) closeBtn.click()
      })
      .pause(1000)
      .waitForElementVisible('*[data-id="refresh-preview-btn"]', 10000)
      .click('*[data-id="refresh-preview-btn"]')
      .pause(10000)
      .waitForElementVisible('*[data-id="dapp-preview-iframe"]', 30000)
      .pause(3000)
      .execute(function () {
        const closeBtn = document.querySelector('[data-id="notification-modal-close-btn"]') as HTMLElement
        if (closeBtn) closeBtn.click()
      })
      .pause(500)
  },

  // ──────────────────────────────────
  // Test 10: Send a chat message (AI update) and verify processing state
  // ──────────────────────────────────
  'Should send a chat message for AI update #group1': function (browser: NightwatchBrowser) {
    browser
      .execute(function () {
        const closeBtn = document.querySelector('[data-id="notification-modal-close-btn"]') as HTMLElement
        if (closeBtn) closeBtn.click()
      })
      .pause(1000)
      .waitForElementVisible('*[data-id="chat-input"]', 10000)
      .execute(function () {
        const textarea = document.querySelector('[data-id="chat-input"]') as HTMLTextAreaElement
        if (textarea) {
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
          nativeInputValueSetter.call(textarea, 'Add a title that says Storage DApp at the top of the page.')
          textarea.dispatchEvent(new Event('input', { bubbles: true }))
          textarea.dispatchEvent(new Event('change', { bubbles: true }))
        }
      })
      .pause(500)
      .click('*[data-id="chat-send-btn"]')
      .pause(2000)
      .waitForElementVisible('*[data-id="ai-updating-overlay"]', 30000)
      .waitForElementNotPresent('*[data-id="ai-updating-overlay"]', 180000)
      .pause(5000)
      .waitForElementVisible('*[data-id="notification-modal-close-btn"]', 60000)
      .click('*[data-id="notification-modal-close-btn"]')
      .pause(500)
  },

  // ──────────────────────────────────
  // Test 11: Deploy to IPFS and verify success
  // ──────────────────────────────────
  'Should deploy DApp to IPFS successfully #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="deploy-ipfs-btn"]', 10000)
      .click('*[data-id="deploy-ipfs-btn"]')
      .waitForElementVisible('*[data-id="deploy-ipfs-success"]', 120000)
      .assert.textContains('*[data-id="deploy-ipfs-success"]', 'Deployed Successfully')
  },

  // ──────────────────────────────────
  // Test 12: Verify ENS section appears after IPFS deployment
  // ──────────────────────────────────
  'Should show ENS section after IPFS deploy #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="ens-section-header"]', 10000)
      .assert.textContains('*[data-id="ens-section-header"]', 'Register ENS')
  },

  // ──────────────────────────────────
  // Test 13: Navigate back to dashboard from editor
  // ──────────────────────────────────
  'Should navigate back to dashboard using back button #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="back-to-dashboard-btn"]', 10000)
      .click('*[data-id="back-to-dashboard-btn"]')
      .pause(3000)
      .waitForElementVisible('*[data-id="quick-dapp-dashboard"]', 10000)
      .waitForElementVisible('[data-id^="dapp-card-"]', 10000)
  },

  // ──────────────────────────────────
  // Test 14: Open editor again and delete DApp from editor
  // ──────────────────────────────────
  'Should delete DApp from editor and return to empty state #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementNotPresent('.spinner-border', 90000)
      .pause(1000)
      .click('[data-id^="dapp-card-"]')
      .pause(5000)
      .waitForElementVisible('*[data-id="back-to-dashboard-btn"]', 30000)
      .waitForElementVisible('*[data-id="delete-dapp-editor-btn"]', 10000)
      .click('*[data-id="delete-dapp-editor-btn"]')
      .pause(1000)
      .waitForElementVisible('*[data-id="confirm-delete-dapp-btn"]', 5000)
      .click('*[data-id="confirm-delete-dapp-btn"]')
      .pause(3000)
      .waitForElementVisible('*[data-id="quickdapp-getting-started"]', 30000)
      .assert.textContains('*[data-id="quickdapp-getting-started"]', 'Getting Started')
  },

  // ──────────────────────────────────
  // Test 15: Create another DApp, verify dashboard, then delete from dashboard
  // ──────────────────────────────────
  'Should create a second DApp and delete from dashboard #group1': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('filePanel')
      .switchWorkspace('default_workspace')
      .pause(3000)
      .openFile('Storage.sol')
      .pause(3000)
      .useXpath()
      .waitForElementPresent('//*[@data-id="tab-active" and contains(@data-path, "Storage.sol")]', 10000)
      .useCss()
      .clickLaunchIcon('solidity')
      .pause(5000)
      .execute(function () {
        const btn = document.querySelector('[data-id="compilerContainerCompileBtn"]') as HTMLButtonElement
        if (btn) {
          btn.removeAttribute('disabled')
          btn.click()
        }
      })
      .waitForElementPresent('*[data-id="compiledContracts"] option', 60000)
      .clickLaunchIcon('udapp')
      .waitForElementVisible('*[data-id="deployButton"]', 45000)
      .click('*[data-id="deployButton"]')
      .pause(3000)
      .waitForElementPresent('[data-id="deployedContractItem-0"]', 30000)
      .click('*[data-id="contractKebabIcon-0"]')
      .pause(500)
      .waitForElementVisible('*[data-id="createDapp"]', 5000)
      .click('*[data-id="createDapp"]')
      .pause(2000)
      .waitForElementVisible('*[data-id="generate-website-ai-modal-footer-ok-react"]', 10000)
      .waitForElementVisible('*[data-id="generate-website-aiModalDialogModalBody-react"] textarea', 5000)
      .pause(500)
      .execute(function () {
        const textarea = document.querySelector('[data-id="generate-website-aiModalDialogModalBody-react"] textarea') as HTMLTextAreaElement
        if (textarea) {
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
          nativeInputValueSetter.call(textarea, 'Create a minimal Storage DApp with a light theme')
          textarea.dispatchEvent(new Event('input', { bubbles: true }))
        }
      })
      .pause(500)
      .click('*[data-id="generate-website-ai-modal-footer-ok-react"]')
      .pause(1000)
      .pause(10000)
      .waitForElementVisible('*[data-id="quick-dapp-dashboard"]', 180000)
      .waitForElementVisible('[data-id^="dapp-card-"]', 30000)
      .waitForElementNotPresent('.spinner-border', 90000)
      .pause(1000)
      .click('[data-id^="delete-dapp-btn-"]')
      .pause(1000)
      .waitForElementVisible('*[data-id="confirm-delete-one-btn"]', 5000)
      .click('*[data-id="confirm-delete-one-btn"]')
      .pause(3000)
      .waitForElementVisible('*[data-id="quickdapp-getting-started"]', 30000)
      .assert.textContains('*[data-id="quickdapp-getting-started"]', 'Getting Started')
      .end()
  },

  // ══════════════════════════════════
  // GROUP 2: Dashboard Interactions (Sort, Filter, Delete All, Create New)
  // ══════════════════════════════════

  // ──────────────────────────────────
  // Test G2-1: Setup — compile + deploy contract + create DApp (same as group1)
  // ──────────────────────────────────
  'Should setup contract and create DApp for group2 tests #group2': function (browser: NightwatchBrowser) {
    browser
      .waitForElementPresent('*[data-id="remixIdeSidePanel"]')
      .clickLaunchIcon('filePanel')
      .addFile('Storage.sol', sources[0]['Storage.sol'])
      .clickLaunchIcon('solidity')
      .waitForElementVisible('*[data-id="compilerContainerCompileBtn"]')
      .click('*[data-id="compilerContainerCompileBtn"]')
      .waitForElementPresent('*[data-id="compiledContracts"] option', 60000)
      .clickLaunchIcon('udapp')
      .waitForElementVisible('*[data-id="deployButton"]', 45000)
      .click('*[data-id="deployButton"]')
      .pause(3000)
      .waitForElementPresent('[data-id="deployedContractItem-0"]', 30000)
      .click('*[data-id="contractKebabIcon-0"]')
      .pause(500)
      .waitForElementVisible('*[data-id="createDapp"]', 5000)
      .click('*[data-id="createDapp"]')
      .pause(2000)
      .waitForElementVisible('*[data-id="generate-website-ai-modal-footer-ok-react"]', 10000)
      .waitForElementVisible('*[data-id="generate-website-aiModalDialogModalBody-react"] textarea', 5000)
      .pause(500)
      .execute(function () {
        const textarea = document.querySelector('[data-id="generate-website-aiModalDialogModalBody-react"] textarea') as HTMLTextAreaElement
        if (textarea) {
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
          nativeInputValueSetter.call(textarea, 'Create a simple Storage DApp for testing dashboard features')
          textarea.dispatchEvent(new Event('input', { bubbles: true }))
        }
      })
      .pause(500)
      .click('*[data-id="generate-website-ai-modal-footer-ok-react"]')
      .pause(10000)
      .waitForElementVisible('*[data-id="quick-dapp-dashboard"]', 180000)
      .waitForElementVisible('[data-id^="dapp-card-"]', 30000)
      .waitForElementNotPresent('.spinner-border', 180000)
  },

  // ──────────────────────────────────
  // Test G2-2: Sort Order — toggle between Newest/Oldest and verify no crash
  // ──────────────────────────────────
  'Should toggle sort order without errors #group2': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="sort-order-select"]', 5000)
      .click('*[data-id="sort-order-select"]')
      .execute(function () {
        const select = document.querySelector('[data-id="sort-order-select"]') as HTMLSelectElement
        if (select) {
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
          nativeInputValueSetter.call(select, 'oldest')
          select.dispatchEvent(new Event('change', { bubbles: true }))
        }
      })
      .pause(1000)
      .waitForElementVisible('[data-id^="dapp-card-"]', 5000)
      .execute(function () {
        const select = document.querySelector('[data-id="sort-order-select"]') as HTMLSelectElement
        if (select) {
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
          nativeInputValueSetter.call(select, 'newest')
          select.dispatchEvent(new Event('change', { bubbles: true }))
        }
      })
      .pause(1000)
      .waitForElementVisible('[data-id^="dapp-card-"]', 5000)
  },

  // ──────────────────────────────────
  // Test G2-3: Network Filter — select a network and verify filtering works
  // ──────────────────────────────────
  'Should filter DApps by network #group2': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="network-filter-select"]', 5000)
      .waitForElementVisible('[data-id^="dapp-card-"]', 5000)
      .waitForElementVisible('*[data-id="dapp-count-badge"]', 5000)
      .execute(function () {
        const select = document.querySelector('[data-id="network-filter-select"]') as HTMLSelectElement
        if (select) {
          const option = document.createElement('option')
          option.value = 'Fake Network'
          option.text = 'Fake Network'
          select.add(option)
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
          nativeInputValueSetter.call(select, 'Fake Network')
          select.dispatchEvent(new Event('change', { bubbles: true }))
        }
      })
      .pause(1000)
      .assert.textEquals('*[data-id="dapp-count-badge"]', '0')
      .execute(function () {
        const select = document.querySelector('[data-id="network-filter-select"]') as HTMLSelectElement
        if (select) {
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
          nativeInputValueSetter.call(select, 'All Chains')
          select.dispatchEvent(new Event('change', { bubbles: true }))
        }
      })
      .pause(1000)
      .waitForElementVisible('[data-id^="dapp-card-"]', 5000)
      .assert.not.textEquals('*[data-id="dapp-count-badge"]', '0')
  },

  // ──────────────────────────────────
  // Test G2-4: Create a second DApp and verify multiple DApps coexist
  // ──────────────────────────────────
  'Should create a second DApp and show multiple cards #group2': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('filePanel')
      .switchWorkspace('default_workspace')
      .pause(3000)
      .openFile('Storage.sol')
      .pause(3000)
      .useXpath()
      .waitForElementPresent('//*[@data-id="tab-active" and contains(@data-path, "Storage.sol")]', 10000)
      .useCss()
      .clickLaunchIcon('solidity')
      .pause(5000)
      .execute(function () {
        const btn = document.querySelector('[data-id="compilerContainerCompileBtn"]') as HTMLButtonElement
        if (btn) {
          btn.removeAttribute('disabled')
          btn.click()
        }
      })
      .waitForElementPresent('*[data-id="compiledContracts"] option', 60000)
      .clickLaunchIcon('udapp')
      .waitForElementVisible('*[data-id="deployButton"]', 45000)
      .click('*[data-id="deployButton"]')
      .pause(3000)
      .waitForElementPresent('[data-id="deployedContractItem-0"]', 30000)
      .click('*[data-id="contractKebabIcon-0"]')
      .pause(500)
      .waitForElementVisible('*[data-id="createDapp"]', 5000)
      .click('*[data-id="createDapp"]')
      .pause(2000)
      .waitForElementVisible('*[data-id="generate-website-ai-modal-footer-ok-react"]', 10000)
      .waitForElementVisible('*[data-id="generate-website-aiModalDialogModalBody-react"] textarea', 5000)
      .pause(500)
      .execute(function () {
        const textarea = document.querySelector('[data-id="generate-website-aiModalDialogModalBody-react"] textarea') as HTMLTextAreaElement
        if (textarea) {
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
          nativeInputValueSetter.call(textarea, 'Create a minimal Storage DApp with blue theme')
          textarea.dispatchEvent(new Event('input', { bubbles: true }))
        }
      })
      .pause(500)
      .click('*[data-id="generate-website-ai-modal-footer-ok-react"]')
      .pause(10000)
      .waitForElementVisible('*[data-id="quick-dapp-dashboard"]', 180000)
      .waitForElementNotPresent('.spinner-border', 180000)
      .pause(2000)
      .waitForElementVisible('*[data-id="dapp-count-badge"]', 10000)
      .assert.not.textEquals('*[data-id="dapp-count-badge"]', '0')
      .assert.not.textEquals('*[data-id="dapp-count-badge"]', '1')
  },

  // ──────────────────────────────────
  // Test G2-5: Delete All DApps — click "Delete All" and confirm
  // ──────────────────────────────────
  'Should delete all DApps and show empty state #group2': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="delete-all-dapps-btn"]', 5000)
      .click('*[data-id="delete-all-dapps-btn"]')
      .pause(1000)
      .waitForElementVisible('*[data-id="confirm-delete-all-btn"]', 5000)
      .click('*[data-id="confirm-delete-all-btn"]')
      .pause(5000)
      .waitForElementVisible('*[data-id="quickdapp-getting-started"]', 30000)
      .assert.textContains('*[data-id="quickdapp-getting-started"]', 'Getting Started')
  },

  // ──────────────────────────────────
  // Test G2-6: Verify Getting Started screen shows correct guidance after delete all
  // ──────────────────────────────────
  'Should display Getting Started guidance with two options #group2': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="quickdapp-getting-started"]', 10000)
      .assert.textContains('*[data-id="quickdapp-getting-started"]', 'Getting Started')
      .assert.textContains('*[data-id="quickdapp-getting-started"]', 'Option 1: Start Now Banner')
      .assert.textContains('*[data-id="quickdapp-getting-started"]', 'Option 2: Sparkle Button')
      .end()
  },

  // ══════════════════════════════════
  // GROUP 3: Base Mini App (create with checkbox, verify wizard UI)
  // ══════════════════════════════════

  // ──────────────────────────────────
  // Test G3-1: Setup — compile + deploy + create DApp with Base Mini App checkbox
  // ──────────────────────────────────
  'Should create a Base Mini App DApp #group3': function (browser: NightwatchBrowser) {
    browser
      .waitForElementPresent('*[data-id="remixIdeSidePanel"]')
      .clickLaunchIcon('filePanel')
      .addFile('Storage.sol', sources[0]['Storage.sol'])
      .clickLaunchIcon('solidity')
      .waitForElementVisible('*[data-id="compilerContainerCompileBtn"]')
      .click('*[data-id="compilerContainerCompileBtn"]')
      .waitForElementPresent('*[data-id="compiledContracts"] option', 60000)
      .clickLaunchIcon('udapp')
      .waitForElementVisible('*[data-id="deployButton"]', 45000)
      .click('*[data-id="deployButton"]')
      .pause(3000)
      .waitForElementPresent('[data-id="deployedContractItem-0"]', 30000)
      .click('*[data-id="contractKebabIcon-0"]')
      .pause(500)
      .waitForElementVisible('*[data-id="createDapp"]', 5000)
      .click('*[data-id="createDapp"]')
      .pause(2000)
      .waitForElementVisible('*[data-id="generate-website-ai-modal-footer-ok-react"]', 10000)
      .waitForElementVisible('*[data-id="generate-website-aiModalDialogModalBody-react"] textarea', 5000)
      .pause(500)
      .execute(function () {
        const checkbox = document.getElementById('base-miniapp-checkbox') as HTMLInputElement
        if (checkbox && !checkbox.checked) {
          checkbox.click()
        }
      })
      .pause(500)
      .execute(function () {
        const textarea = document.querySelector('[data-id="generate-website-aiModalDialogModalBody-react"] textarea') as HTMLTextAreaElement
        if (textarea) {
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
          nativeInputValueSetter.call(textarea, 'Create a simple Storage DApp as Base Mini App')
          textarea.dispatchEvent(new Event('input', { bubbles: true }))
        }
      })
      .pause(500)
      .click('*[data-id="generate-website-ai-modal-footer-ok-react"]')
      .pause(10000)
      .waitForElementVisible('*[data-id="quick-dapp-dashboard"]', 180000)
      .waitForElementVisible('[data-id^="dapp-card-"]', 30000)
      .waitForElementNotPresent('.spinner-border', 180000)
  },

  // ──────────────────────────────────
  // Test G3-2: Verify BaseAppWizard UI appears when entering the DApp editor
  // ──────────────────────────────────
  'Should show BaseAppWizard with Setup Wizard when editing Base Mini App DApp #group3': function (browser: NightwatchBrowser) {
    browser
      .click('[data-id^="dapp-card-"]')
      .pause(3000)
      .waitForElementVisible('*[data-id="base-app-wizard"]', 10000)
      .waitForElementVisible('*[data-id="base-wizard-card"]', 5000)
      .assert.textContains('*[data-id="base-wizard-card"]', 'Setup Wizard')
      .waitForElementVisible('*[data-id="wizard-step-1-config"]', 5000)
      .assert.textContains('*[data-id="wizard-step-1-config"]', 'Step 1: App Registration')
      .waitForElementVisible('*[data-id="wizard-step1-next-btn"]', 5000)
      .assert.not.elementPresent('*[data-id="deploy-ipfs-btn"]')
      .assert.not.elementPresent('*[data-id="ens-section-header"]')
  },

  // ──────────────────────────────────
  // Test G3-3: Go back to dashboard and verify dapp card exists
  // ──────────────────────────────────
  'Should navigate back and verify Base Mini App card on dashboard #group3': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="back-to-dashboard-btn"]', 5000)
      .click('*[data-id="back-to-dashboard-btn"]')
      .pause(2000)
      .waitForElementVisible('*[data-id="quick-dapp-dashboard"]', 10000)
      .waitForElementVisible('[data-id^="dapp-card-"]', 10000)
      .waitForElementVisible('*[data-id="dapp-count-badge"]', 5000)
      .assert.not.textEquals('*[data-id="dapp-count-badge"]', '0')
  },

  // ──────────────────────────────────
  // Test G3-4: Delete the Base Mini App DApp and verify empty state
  // ──────────────────────────────────
  'Should delete Base Mini App DApp and return to empty state #group3': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('[data-id^="delete-dapp-btn-"]', 5000)
      .click('[data-id^="delete-dapp-btn-"]')
      .pause(1000)
      .waitForElementVisible('*[data-id="confirm-delete-one-btn"]', 5000)
      .click('*[data-id="confirm-delete-one-btn"]')
      .pause(3000)
      .waitForElementVisible('*[data-id="quickdapp-getting-started"]', 30000)
      .assert.textContains('*[data-id="quickdapp-getting-started"]', 'Getting Started')
      .end()
  }
}

const sources = [
  {
    'Storage.sol': {
      content:
        `
      // SPDX-License-Identifier: GPL-3.0
      pragma solidity >=0.8.2 <0.9.0;

      /**
       * @title Storage
       * @dev Store & retrieve value in a variable
       */
      contract Storage {
          uint256 number;

          /**
           * @dev Store value in variable
           * @param num value to store
           */
          function store(uint256 num) public {
              number = num;
          }

          /**
           * @dev Return value
           * @return value of 'number'
           */
          function retrieve() public view returns (uint256){
              return number;
          }
      }`
    }
  }
]
