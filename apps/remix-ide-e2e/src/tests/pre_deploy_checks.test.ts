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
      // E2E runs disable tooltips: the button carries the disclaimer the tooltip shows
      .assert.attributeContains('*[data-id="preDeployChecks-info"]', 'aria-label', 'not a security audit')
      .waitForElementVisible('*[data-id="preDeployChecks-intro"]')
  },

  'Should choose the checks in the settings #group1': function (browser: NightwatchBrowser) {
    browser
      // the intro card and the settings page show the same switches
      .assert.elementPresent('*[data-id="preDeployChecks-intro"] *[data-id="preDeployChecks-toggle-compileSwitch"][aria-checked="true"][disabled]')
      .click('*[data-id="preDeployChecks-intro"] *[data-id="preDeployChecks-toggle-flattenSwitch"]')
      .waitForElementPresent('*[data-id="preDeployChecks-intro"] *[data-id="preDeployChecks-toggle-flattenSwitch"][aria-checked="false"]')
      .click('*[data-id="preDeployChecks-openSettings"]')
      .waitForElementVisible('*[data-id="preDeployChecks-settings"]')
      .assert.elementPresent('*[data-id="preDeployChecks-toggle-aiSwitch"][aria-checked="false"]')
      .assert.elementPresent('*[data-id="preDeployChecks-toggle-analysisSwitch"][aria-checked="true"]')
      .assert.elementPresent('*[data-id="preDeployChecks-toggle-flattenSwitch"][aria-checked="false"]')
      .click('*[data-id="preDeployChecks-toggle-flattenSwitch"]')
      .waitForElementPresent('*[data-id="preDeployChecks-toggle-flattenSwitch"][aria-checked="true"]')
      .click('*[data-id="preDeployChecks-back"]')
      .waitForElementVisible('*[data-id="preDeployChecks-intro"]')
      .assert.elementPresent('*[data-id="preDeployChecks-intro"] *[data-id="preDeployChecks-toggle-flattenSwitch"][aria-checked="true"]')
  },

  'Should run the checks on a clean contract #group1': function (browser: NightwatchBrowser) {
    browser
      .click('*[data-id="preDeployChecks-run"]')
      .waitForElementVisible(status('clear'), 120000)
      .assert.containsText('*[data-id="preDeployChecks-status-title"]', 'No high-severity issues')
      // Slither runs on the hosted service: no skipped or failed line
      .assert.not.elementPresent('*[data-id="preDeployChecks-toolLine-slither"]')
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

  'Should leave out imported packages and stay on the contract while showing an issue in an imported file #group3': function (browser: NightwatchBrowser) {
    const libIssue = '*[data-id^="preDeployChecks-issue-"][data-severity="high"]'
    browser.waitForElementVisible('*[data-id="remixIdeSidePanel"]')
      .clickLaunchIcon('filePanel')
      .addFile('Lib.sol', sources[0]['Lib.sol'])
      .addFile('Main.sol', sources[0]['Main.sol'])
      .clickLaunchIcon('preDeployChecks')
      .waitForElementContainsText('*[data-id="preDeployChecks-file"]', 'Main.sol')
      .click('*[data-id="preDeployChecks-run"]')
      .waitForElementVisible(status('gate'), 120000)
      // hardhat/console.sol is an imported package: none of its issues are listed
      .assert.not.elementPresent('*[data-id="preDeployChecks-issues"] [title="hardhat/console.sol"]')
      // the issue in the local import names its file
      .assert.containsText(`${libIssue} .pdc-issue-line`, 'Lib.sol')
      .click(`${libIssue} button`)
      .pause(1000)
      .waitForElementContainsText('*[data-id="preDeployChecks-file"]', 'Main.sol')
      .waitForElementVisible(`${libIssue} [data-id$="-ignore"]`)
  },

  'Should open the panel on the compiled contract from the Solidity compiler #group3': function (browser: NightwatchBrowser) {
    // the panel still shows Main.sol; Lib.sol, opened from the issue, was auto-compiled
    browser
      .clickLaunchIcon('solidity')
      .waitForElementPresent('select[id="compiledContracts"] option[value=Lib]', 60000)
      .click('*[data-id="compilerOpenPreDeployChecks"]')
      .waitForElementVisible('*[data-id="preDeployChecks-file"]')
      .waitForElementContainsText('*[data-id="preDeployChecks-file"]', 'Lib.sol')
  },

  'Should open the panel on a file from the file explorer menu #group3': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('filePanel')
      .rightClick('*[data-id="treeViewLitreeViewItemMain.sol"]')
      .click('*[data-id="contextMenuItempreDeployChecks"]')
      .waitForElementVisible('*[data-id="preDeployChecks-file"]')
      .waitForElementContainsText('*[data-id="preDeployChecks-file"]', 'Main.sol')
      .end()
  },

  'Should pick up an analysis run in the Solidity Analyzers panel #group4': function (browser: NightwatchBrowser) {
    browser.waitForElementVisible('*[data-id="remixIdeSidePanel"]')
      // the analyzer takes the compilation made while it is open
      .clickLaunchIcon('solidityStaticAnalysis')
      .clickLaunchIcon('filePanel')
      .addFile('Lib.sol', sources[0]['Lib.sol'])
      .addFile('Main.sol', sources[0]['Main.sol'])
      .clickLaunchIcon('solidity')
      .click('*[id="compileBtn"]')
      .waitForElementPresent('select[id="compiledContracts"] option[value=Main]', 60000)
      .clickLaunchIcon('solidityStaticAnalysis')
      .waitForElementPresent('#staticAnalysisRunBtn:enabled', 30000)
      .click('#staticAnalysisRunBtn')
      .waitForElementVisible('span#ssaRemixtab', 30000)
      .clickLaunchIcon('preDeployChecks')
      .waitForElementContainsText('*[data-id="preDeployChecks-file"]', 'Main.sol')
      // the tx.origin issue the analyzer found in Lib.sol holds the contract, without a run from the panel
      .waitForElementVisible(status('gate'), 30000)
      .assert.containsText(`${firstHigh} .pdc-issue-line`, 'Lib.sol')
      .assert.not.elementPresent('*[data-id="preDeployChecks-openFlattened"]')
  },

  'Should pick up a file flattened from the file explorer #group4': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('filePanel')
      .rightClick('*[data-id="treeViewLitreeViewItemMain.sol"]')
      .click('*[id="menuitemflattenacontract"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemMain_flattened.sol"]', 60000)
      .clickLaunchIcon('preDeployChecks')
      .waitForElementVisible('*[data-id="preDeployChecks-openFlattened"]', 30000)
      .assert.containsText('*[data-id="preDeployChecks-outputs"]', 'Main_flattened.sol')
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
      .waitForElementVisible('*[data-id="preDeployChecks-issue-0-reason-false-positive"]')
      .click('*[data-id="preDeployChecks-issue-0-reason-false-positive"]')
      .waitForElementVisible(status('clear'))
      .assert.containsText('*[data-id="preDeployChecks-status-sub"]', '1 ignored')
      // the issue keeps its place for a moment with an Undo
      .waitForElementVisible('*[data-id="preDeployChecks-issue-0-justIgnored"]')
      .click('*[data-id="preDeployChecks-issue-0-undo"]')
      .waitForElementVisible(status('gate'))
      // ignored again, it moves under "1 ignored" with its reason and a Restore
      .click(`${firstHigh} button`)
      .click('*[data-id="preDeployChecks-issue-0-ignore"]')
      .click('*[data-id="preDeployChecks-issue-0-reason-false-positive"]')
      .waitForElementVisible('*[data-id="preDeployChecks-ignoredToggle"]', 10000)
      .click('*[data-id="preDeployChecks-ignoredToggle"]')
      .waitForElementVisible('*[data-id="preDeployChecks-ignored"]')
      .assert.containsText('*[data-id="preDeployChecks-ignored"]', 'False positive')
      .click('*[data-id="preDeployChecks-ignored"] *[data-id$="-restore"]')
      .waitForElementVisible(status('gate'))
  },

  'Should search and filter the issues #group2': function (browser: NightwatchBrowser) {
    browser
      .setValue('*[data-id="preDeployChecks-search"]', 'tx.origin')
      .waitForElementVisible('*[data-id="preDeployChecks-filterSummary"]')
      .assert.containsText(firstHigh, 'tx.origin')
      .assert.not.elementPresent('*[data-id^="preDeployChecks-issue-"][data-severity="low"]')
      .setValue('*[data-id="preDeployChecks-search"]', 'no such issue')
      .waitForElementVisible('*[data-id="preDeployChecks-noMatch"]')
      .click('*[data-id="preDeployChecks-noMatch"] button')
      .waitForElementNotPresent('*[data-id="preDeployChecks-filterSummary"]')
      .click('*[data-id="preDeployChecks-filterBtn"]')
      .waitForElementVisible('*[data-id="preDeployChecks-filterMenu"]')
      .click('*[data-id="preDeployChecks-filter-severity-high"] input')
      .waitForElementVisible('*[data-id="preDeployChecks-filterSummary"]')
      .assert.elementPresent(firstHigh)
      .assert.not.elementPresent('*[data-id^="preDeployChecks-issue-"][data-severity="low"]')
      // the counts above the list keep counting every issue
      .assert.containsText('*[data-id="preDeployChecks-counts"]', 'low')
      .click('*[data-id="preDeployChecks-filterBtn"]')
      .waitForElementNotPresent('*[data-id="preDeployChecks-filterMenu"]')
      .click('*[data-id="preDeployChecks-clearFilters"]')
      .waitForElementPresent('*[data-id^="preDeployChecks-issue-"][data-severity="low"]')
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
      // the report opens rendered in the doc viewer, and the panel stays on the contract
      .waitForElementVisible('#plugin-doc-viewer', 30000)
      .frame('plugin-doc-viewer')
      .waitForElementContainsText('.aiMarkup', 'Pre-deploy checks: Wallet', 30000)
      .assert.containsText('.aiMarkup', 'not a security audit')
      .assert.containsText('.aiMarkup', 'Deployed with 1 open high-severity issue')
      .frameParent()
      .waitForElementContainsText('*[data-id="preDeployChecks-file"]', 'Wallet.sol')
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
    'Lib.sol': {
      content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

library Lib {
    function isOwner(address owner) internal view returns (bool) {
        return tx.origin == owner;
    }
}
`
    },
    'Main.sol': {
      content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "hardhat/console.sol";
import "./Lib.sol";

contract Main {
    address public owner;

    constructor() {
        owner = msg.sender;
        console.log("deployed");
    }

    function isOwner() public view returns (bool) {
        return Lib.isOwner(owner);
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

    function setOwner(address next) public {
        require(tx.origin == owner, "not owner");
        owner = next;
    }

    receive() external payable {}
}
`
    }
  }
]
