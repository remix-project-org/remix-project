'use strict'
import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

const step = (id: string) => `*[data-id="preDeployChecks-step-${id}"]`

module.exports = {
  '@disabled': true,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done)
  },

  '@sources': function () {
    return sources
  },

  'Should open the panel with the disclaimer and an empty state #group1': function (browser: NightwatchBrowser) {
    browser.waitForElementVisible('*[data-id="remixIdeSidePanel"]')
      .clickLaunchIcon('preDeployChecks')
      .waitForElementVisible('*[data-id="preDeployChecks-disclaimer"]')
      .assert.containsText('*[data-id="preDeployChecks-disclaimer"]', 'not a security audit')
  },

  'Should compile, analyze, flatten and deploy a clean contract on Remix VM #group1': function (browser: NightwatchBrowser) {
    let address: string
    browser
      .clickLaunchIcon('filePanel')
      .addFile('Counter.sol', sources[0]['Counter.sol'])
      .clickLaunchIcon('preDeployChecks')
      .waitForElementContainsText('*[data-id="preDeployChecks-file"]', 'Counter.sol')
      .assert.not.elementPresent('*[data-id="preDeployChecks-toggle-ai"]:checked')
      .click('*[data-id="preDeployChecks-run"]')
      // the constructor needs an argument: the run stops before deploying and asks for it
      .waitForElementVisible('*[data-id="preDeployChecks-outcome-invalid-args"]', 120000)
      .assert.attributeEquals(step('compile'), 'data-status', 'passed')
      .assert.attributeEquals(step('slither'), 'data-status', 'skipped')
      .setValue('*[data-id="preDeployChecks-arg-0"]', '5')
      .click('*[data-id="preDeployChecks-run"]')
      .waitForElementVisible('*[data-id="preDeployChecks-outcome-done"]', 120000)
      .assert.attributeEquals(step('analysis'), 'data-status', 'findings')
      .assert.attributeEquals(step('flatten'), 'data-status', 'passed')
      .assert.attributeEquals(step('deploy'), 'data-status', 'passed')
      .assert.attributeEquals(step('verify'), 'data-status', 'skipped')
      .assert.containsText(`${step('verify')}`, 'Remix VM')
      .getText('*[data-id="preDeployChecks-deployedAddress"]', (result) => {
        address = result.value as string
      })
      .perform(() => {
        browser
          .clickLaunchIcon('udapp')
          .waitForElementPresent(`#instance${address}`, 30000)
      })
      .openFile('Counter_flattened.sol')
  },

  'Should mark results out of date after an edit and redo only those steps #group1': function (browser: NightwatchBrowser) {
    browser
      .openFile('Counter.sol')
      .setEditorValue(sources[0]['Counter.sol'].content + '\n// edited\n')
      .pause(2000)
      .clickLaunchIcon('preDeployChecks')
      // auto-compile (on in the e2e setup) recompiles the edit: the compile is picked up as done by hand,
      // and everything produced from the previous content is out of date
      .waitForElementPresent(`${step('analysis')}[data-status="stale"]`, 30000)
      .assert.attributeEquals(step('compile'), 'data-status', 'passed')
      .assert.containsText(`*[data-id="preDeployChecks-step-compile-origin"]`, 'By hand')
      .assert.attributeEquals(step('flatten'), 'data-status', 'stale')
      .assert.attributeEquals(step('deploy'), 'data-status', 'passed')
      .waitForElementVisible('*[data-id="preDeployChecks-deployedEarlier"]')
  },

  'Should stop before deploying a contract with a high-severity finding #group2': function (browser: NightwatchBrowser) {
    let address: string
    browser.waitForElementVisible('*[data-id="remixIdeSidePanel"]')
      .clickLaunchIcon('filePanel')
      .addFile('Wallet.sol', sources[0]['Wallet.sol'])
      .clickLaunchIcon('preDeployChecks')
      .waitForElementContainsText('*[data-id="preDeployChecks-file"]', 'Wallet.sol')
      .click('*[data-id="preDeployChecks-run"]')
      .waitForElementVisible('*[data-id="preDeployChecks-gate"]', 120000)
      .assert.attributeEquals(step('deploy'), 'data-status', 'not-run')
      .waitForElementVisible('*[data-id="preDeployChecks-finding-high"]')
      .assert.containsText('*[data-id="preDeployChecks-finding-high"]', 'tx.origin')
      .click('*[data-id="preDeployChecks-deployAnyway"]')
      .waitForElementVisible('*[data-id="preDeployChecks-outcome-done"]', 120000)
      .assert.attributeEquals(step('deploy'), 'data-status', 'passed')
      .getText('*[data-id="preDeployChecks-deployedAddress"]', (result) => {
        address = result.value as string
      })
      .perform(() => {
        browser
          .clickLaunchIcon('udapp')
          .waitForElementPresent(`#instance${address}`, 30000)
      })
  },

  'Should save a report next to the source #group2': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('preDeployChecks')
      .click('*[data-id="preDeployChecks-saveReport"]')
      .pause(2000)
      .getEditorValue((content) => {
        browser.assert.ok(content.includes('# Pre-deploy checks: Wallet'), 'report title')
        browser.assert.ok(content.includes('Overridden'), 'gate override recorded')
        browser.assert.ok(content.includes('not a security audit'), 'disclaimer')
      })
      .end()
  }
}

const sources = [
  {
    'Counter.sol': {
      content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Counter {
    uint256 public count;

    constructor(uint256 start) {
        count = start;
    }

    function increment() public {
        count += 1;
    }
}
`
    },
    'Wallet.sol': {
      content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Wallet {
    address public owner;

    constructor() {
        owner = msg.sender;
    }

    function withdraw() public {
        require(tx.origin == owner, "not owner");
        payable(msg.sender).transfer(address(this).balance);
    }

    receive() external payable {}
}
`
    }
  }
]
