'use strict'
import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

const status = (kind: string) => `*[data-id="preDeployChecks-status"][data-kind="${kind}"]`
const checksLine = (kind: string) => `*[data-id="udappChecksStatus"][data-kind="${kind}"]`
const firstHigh = '*[data-id^="preDeployChecks-issue-"][data-severity="high"]'

module.exports = {
  '@disabled': true,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done)
  },

  '@sources': function () {
    return sources
  },

  'Should open the panel with the disclaimer behind the info icon #group1': function (browser: NightwatchBrowser) {
    browser.waitForElementVisible('*[data-id="remixIdeSidePanel"]')
      .clickLaunchIcon('preDeployChecks')
      .waitForElementVisible('*[data-id="preDeployChecks"], *[data-id="preDeployChecks-empty"]')
      .clickLaunchIcon('filePanel')
      .addFile('Counter.sol', sources[0]['Counter.sol'])
      .clickLaunchIcon('preDeployChecks')
      .waitForElementContainsText('*[data-id="preDeployChecks-file"]', 'Counter.sol')
      .assert.attributeContains('*[data-id="preDeployChecks-info"]', 'title', 'not a security audit')
      .waitForElementVisible('*[data-id="preDeployChecks-intro"]')
  },

  'Should choose the checks in the settings #group1': function (browser: NightwatchBrowser) {
    browser
      .click('*[data-id="preDeployChecks-openSettings"]')
      .waitForElementVisible('*[data-id="preDeployChecks-settings"]')
      .assert.not.elementPresent('*[data-id="preDeployChecks-toggle-ai"]:checked')
      .assert.elementPresent('*[data-id="preDeployChecks-toggle-analysis"]:checked')
      .click('*[data-id="preDeployChecks-back"]')
      .waitForElementVisible('*[data-id="preDeployChecks-intro"]')
  },

  'Should run the checks on a clean contract #group1': function (browser: NightwatchBrowser) {
    browser
      .click('*[data-id="preDeployChecks-run"]')
      .waitForElementVisible(status('clear'), 120000)
      .assert.containsText('*[data-id="preDeployChecks-status-title"]', 'No high-severity issues')
      // Slither needs remixd: it says so instead of failing
      .waitForElementVisible('*[data-id="preDeployChecks-toolLine-slither"][data-kind="skipped"]')
      .waitForElementVisible('*[data-id="preDeployChecks-openFlattened"]')
      .waitForElementVisible('*[data-id="preDeployChecks-goToDeploy"]')
  },

  'Should hand over to Deploy & Run and pick up the deployment #group1': function (browser: NightwatchBrowser) {
    let address: string
    browser
      .click('*[data-id="preDeployChecks-goToDeploy"]')
      .waitForElementVisible('*[data-id="deployButton"]')
      .waitForElementContainsText('*[data-id="contractDropdownToggle"]', 'Counter')
      .waitForElementVisible(checksLine('clear'))
      .click('*[data-id="deployButton"]')
      .clickLaunchIcon('preDeployChecks')
      .waitForElementVisible(status('deployed'), 30000)
      .assert.containsText('*[data-id="preDeployChecks-status-sub"]', 'Counter')
      .getText('*[data-id="preDeployChecks-deployedAddress"]', (result) => {
        address = result.value as string
      })
      .perform(() => {
        browser
          .clickLaunchIcon('udapp')
          .waitForElementPresent(`#instance${address}`, 30000)
      })
  },

  'Should mark the checks out of date after an edit #group1': function (browser: NightwatchBrowser) {
    browser
      .openFile('Counter.sol')
      .setEditorValue(sources[0]['Counter.sol'].content + '\n// edited\n')
      .pause(2000)
      .clickLaunchIcon('preDeployChecks')
      .waitForElementVisible(status('out-of-date'), 30000)
      .waitForElementVisible('*[data-id="preDeployChecks-toolLine-analyzer-solhint"][data-kind="stale"]')
      .clickLaunchIcon('udapp')
      .click('*[data-id="udappDeployTab"]')
      .waitForElementVisible(checksLine('out-of-date'))
  },

  'Should keep the contract in view while another file is open #group1': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('filePanel')
      .addFile('notes.md', { content: '# notes' })
      .clickLaunchIcon('preDeployChecks')
      .waitForElementContainsText('*[data-id="preDeployChecks-file"]', 'Counter.sol')
      .end()
  },

  'Should hold a contract with a high-severity issue until it is ignored #group2': function (browser: NightwatchBrowser) {
    browser.waitForElementVisible('*[data-id="remixIdeSidePanel"]')
      .clickLaunchIcon('filePanel')
      .addFile('Wallet.sol', sources[0]['Wallet.sol'])
      .clickLaunchIcon('preDeployChecks')
      .waitForElementContainsText('*[data-id="preDeployChecks-file"]', 'Wallet.sol')
      .click('*[data-id="preDeployChecks-run"]')
      .waitForElementVisible(status('gate'), 120000)
      .assert.containsText('*[data-id="preDeployChecks-status-title"]', '1 high-severity issue')
      .assert.containsText('*[data-id="preDeployChecks-counts"]', '1 high')
      .assert.containsText(firstHigh, 'tx.origin')
      // the issue opens in place with the tools that found it, and can be ignored with a reason
      .click(`${firstHigh} button`)
      .waitForElementVisible('*[data-id="preDeployChecks-issue-0-ignore"]')
      .assert.containsText(firstHigh, 'Remix analyzer')
      .click('*[data-id="preDeployChecks-issue-0-ignore"]')
      .click('*[data-id="preDeployChecks-issue-0-reason-false-positive"]')
      .waitForElementVisible(status('clear'))
      .assert.containsText('*[data-id="preDeployChecks-status-sub"]', '1 ignored')
      // restore brings the gate back
      .click('*[data-id="preDeployChecks-ignoredToggle"]')
      .waitForElementVisible('*[data-id="preDeployChecks-ignored"]')
      .click('*[data-id="preDeployChecks-ignored"] li button')
      .click('*[data-id$="-restore"]')
      .waitForElementVisible(status('gate'))
  },

  'Should deploy anyway after a confirmation and record it in the report #group2': function (browser: NightwatchBrowser) {
    browser
      .click('*[data-id="preDeployChecks-deployAnyway"]')
      .waitForElementVisible('*[data-id="preDeployChecks-confirm"]')
      .assert.containsText('*[data-id="preDeployChecks-confirm"]', '1 open high-severity issue')
      .click('*[data-id="preDeployChecks-confirmCancel"]')
      .waitForElementNotPresent('*[data-id="preDeployChecks-confirm"]')
      .click('*[data-id="preDeployChecks-deployAnyway"]')
      .click('*[data-id="preDeployChecks-confirmDeploy"]')
      .waitForElementVisible('*[data-id="deployButton"]')
      .waitForElementContainsText('*[data-id="contractDropdownToggle"]', 'Wallet')
      .waitForElementVisible(checksLine('gate'))
      .click('*[data-id="deployButton"]')
      .clickLaunchIcon('preDeployChecks')
      .waitForElementVisible(status('deployed'), 30000)
      .click('*[data-id="preDeployChecks-saveReport"]')
      .pause(2000)
      .getEditorValue((content) => {
        browser.assert.ok(content.includes('# Pre-deploy checks: Wallet'), 'report title')
        browser.assert.ok(content.includes('not a security audit'), 'disclaimer')
        browser.assert.ok(content.includes('Deployed with 1 open high-severity issue'), 'deployment with an open high issue recorded')
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
