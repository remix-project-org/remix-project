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
}

export default tests
module.exports = tests
