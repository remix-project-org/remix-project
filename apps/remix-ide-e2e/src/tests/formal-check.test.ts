'use strict'

import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

const VAULT_SOL = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
contract SimpleVault {
    uint256 public deposited;
    uint256 public withdrawn;
    function deposit(uint256 amount) external { deposited += amount; }
    function withdraw(uint256 amount) external { withdrawn += amount; }
}`

const tests = {
  '@disabled': true,

  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done)
  },

  // -----------------------------------------------------------------------
  // group1 — plugin activates and shows UI
  // -----------------------------------------------------------------------

  'Plugin icon appears in sidebar #group1': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('formalCheck')
      .waitForElementPresent('[data-id="formalCheckPanel"]', 10000)
  },

  'Panel shows "open a file" hint when no file is active #group1': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('formalCheck')
      .waitForElementPresent('[data-id="formalCheckNoFile"]', 5000)
  },

  'Template picker populates when a Solidity file is open #group1': function (browser: NightwatchBrowser) {
    browser
      .addFile('SimpleVault.sol', { content: VAULT_SOL })
      .openFile('SimpleVault.sol')
      .clickLaunchIcon('formalCheck')
      .waitForElementPresent('[data-id="formalCheckTemplateSelect"]', 5000)
      .execute(function () {
        const sel = document.querySelector('[data-id="formalCheckTemplateSelect"]') as HTMLSelectElement
        return sel ? sel.options.length : 0
      }, [], function (result) {
        browser.assert.ok((result.value as number) > 1, 'template picker has at least one template')
      })
  },

  // -----------------------------------------------------------------------
  // group2 — full run flow (requires solc + a successful compile first)
  // -----------------------------------------------------------------------

  'Compile the vault then run the vault-withdraw template #group2': function (browser: NightwatchBrowser) {
    browser
      .addFile('SimpleVault.sol', { content: VAULT_SOL })
      .openFile('SimpleVault.sol')
      // Compile first so the solidity plugin has a soljson URL ready
      .clickLaunchIcon('solidity')
      .waitForElementPresent('[data-id="compileBtn"]', 10000)
      .click('[data-id="compileBtn"]')
      .pause(3000)
      // Switch to Formal Check panel
      .clickLaunchIcon('formalCheck')
      .waitForElementPresent('[data-id="formalCheckTemplateSelect"]', 5000)
      // Select the vault template
      .execute(function () {
        const sel = document.querySelector('[data-id="formalCheckTemplateSelect"]') as HTMLSelectElement
        if (!sel) return false
        for (let i = 0; i < sel.options.length; i++) {
          if (sel.options[i].value === 'vault-withdraw-invariant') {
            sel.value = 'vault-withdraw-invariant'
            sel.dispatchEvent(new Event('change', { bubbles: true }))
            return true
          }
        }
        return false
      }, [], function (result) {
        browser.assert.ok(result.value, 'vault template found and selected')
      })
      .click('[data-id="formalCheckRunBtn"]')
      // Wait for result — either done or error (Z3 may not be available in test env)
      .waitForElementPresent(
        '[data-id="formalCheckOutcomeBadge"],[data-id="formalCheckError"]',
        60000,
        'result or error appears within 60s',
      )
  },

  'Result or error message is shown after run #group2': function (browser: NightwatchBrowser) {
    browser
      .execute(function () {
        return (
          document.querySelector('[data-id="formalCheckOutcomeBadge"]') !== null ||
          document.querySelector('[data-id="formalCheckError"]') !== null
        )
      }, [], function (result) {
        browser.assert.ok(result.value, 'outcome badge or error message is present')
      })
  },

  // -----------------------------------------------------------------------
  // group3 — Phase 2 LLM consent flow UI
  // -----------------------------------------------------------------------

  'Mode toggle switches to LLM input #group3': function (browser: NightwatchBrowser) {
    browser
      .addFile('SimpleVault.sol', { content: VAULT_SOL })
      .openFile('SimpleVault.sol')
      .clickLaunchIcon('formalCheck')
      .waitForElementPresent('[data-id="formalCheckModeLLM"]', 5000)
      .click('[data-id="formalCheckModeLLM"]')
      .waitForElementPresent('[data-id="formalCheckIntentTextarea"]', 3000)
      .waitForElementNotPresent('[data-id="formalCheckTemplateSelect"]', 2000)
  },

  'LLM mode shows Propose button disabled until intent is typed #group3': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('formalCheck')
      .click('[data-id="formalCheckModeLLM"]')
      .waitForElementPresent('[data-id="formalCheckProposeBtn"]', 3000)
      .execute(function () {
        const btn = document.querySelector('[data-id="formalCheckProposeBtn"]') as HTMLButtonElement
        return btn ? btn.disabled : true
      }, [], function (result) {
        browser.assert.ok(result.value, 'Propose button is disabled when intent is empty')
      })
  },

  'Clicking Propose shows the consent banner #group3': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('formalCheck')
      .click('[data-id="formalCheckModeLLM"]')
      .waitForElementPresent('[data-id="formalCheckIntentTextarea"]', 3000)
      .setValue('[data-id="formalCheckIntentTextarea"]', 'withdrawn should never exceed deposited')
      .click('[data-id="formalCheckProposeBtn"]')
      // Consent banner must appear before any source leaves the browser
      .waitForElementPresent('[data-id="formalCheckConsentBanner"]', 3000)
  },

  'Denying consent returns to idle, hides banner #group3': function (browser: NightwatchBrowser) {
    browser
      .waitForElementPresent('[data-id="formalCheckConsentDeny"]', 3000)
      .click('[data-id="formalCheckConsentDeny"]')
      .waitForElementNotPresent('[data-id="formalCheckConsentBanner"]', 3000)
      .waitForElementPresent('[data-id="formalCheckIntentTextarea"]', 3000)
  },
}

export default tests
module.exports = tests
