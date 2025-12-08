'use strict'
import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

module.exports = {
  '@disabled': true,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done)
  },

  '@sources': function () {
    return sources
  },

  'Should load run and deploy tab #group1 #group2': function (browser: NightwatchBrowser) {
    browser.waitForElementPresent('*[data-id="remixIdeSidePanel"]')
      .clickLaunchIcon('udapp')
      .waitForElementPresent('*[data-id="sidePanelSwapitTitle"]')
      .assert.containsText('*[data-id="sidePanelSwapitTitle"]', 'DEPLOY & RUN TRANSACTIONS')
  },

  'Should load run and deploy tab and check value validation #group1': function (browser: NightwatchBrowser) {
    browser.waitForElementPresent('*[data-id="remixIdeSidePanel"]')
      .assert.containsText('*[data-id="sidePanelSwapitTitle"]', 'DEPLOY & RUN TRANSACTIONS')
      .validateValueInput('*[data-id="dandrValue"]', ['9','9','9'], '999')
      .validateValueInput('*[data-id="dandrValue"]', ['0','0','0'], '0')
      .validateValueInput('*[data-id="dandrValue"]', ['1','.','3'], '0') // no decimal
      // .validateValueInput('*[data-id="dandrValue"]', 'dragon', '0') // only numbers
  },

  'Should sign message using account key #group2': function (browser: NightwatchBrowser) {
    browser.waitForElementVisible('*[data-id="settingsRemixRunSignMsg"]')
      .waitForElementVisible('*[data-id="settingsRemixRunSignMsg"]', 30000)
      .click('*[data-id="settingsRemixRunSignMsg"]')
      .waitForElementVisible('*[data-id="signMessageTextarea"]', 120000)
      .click('*[data-id="signMessageTextarea"]')
      .setValue('*[data-id="signMessageTextarea"]', 'Remix is cool!')
      .assert.not.elementPresent('*[data-id="settingsRemixRunSignMsgHash"]')
      .assert.not.elementPresent('*[data-id="settingsRemixRunSignMsgSignature"]')
      .pause(2000)
      .waitForElementPresent('[data-id="udappNotify-modal-footer-ok-react"]')
      .click('[data-id="udappNotify-modal-footer-ok-react"]')
      .waitForElementVisible('*[data-id="udappNotifyModalDialogModalBody-react"]', 12000)
      .assert.elementPresent('*[data-id="settingsRemixRunSignMsgHash"]')
      .assert.elementPresent('*[data-id="settingsRemixRunSignMsgSignature"]')
      .waitForElementPresent('[data-id="udappNotify-modal-footer-ok-react"]')
      .click('[data-id="udappNotify-modal-footer-ok-react"]')
  },

  'Should deploy contract on JavascriptVM #group3': function (browser: NightwatchBrowser) {
    browser.waitForElementVisible('*[data-id="remixIdeSidePanel"]')
      .clickLaunchIcon('filePanel')
      .addFile('Greet.sol', sources[0]['Greet.sol'])
      .clickLaunchIcon('udapp')
      .selectAccount('0xCA35b7d915458EF540aDe6068dFe2F44E8fa733c')
      .waitForElementVisible('*[data-id="Deploy - transact (not payable)"]', 45000)
      .click('*[data-id="Deploy - transact (not payable)"]')
      .pause(5000)
      .testFunction('last', {
        status: '1 Transaction mined and execution succeed'
      })
  },

  'Should show and update balance for deployed contract on JavascriptVM #group3': function (browser: NightwatchBrowser) {
    let instanceAddress
    browser.waitForElementVisible('*[data-id="remixIdeSidePanel"]')
      .clickLaunchIcon('filePanel')
      .addFile('checkBalance.sol', sources[0]['checkBalance.sol'])
      .clickLaunchIcon('udapp')
      .setValue('*[data-id="dandrValue"]', '111')
      .waitForElementVisible('*[data-id="Deploy - transact (payable)"]', 45000)
      .click('*[data-id="Deploy - transact (payable)"]')
      .pause(1000)
      .clickInstance(1)
      .pause(1000)
      .getAddressAtPosition(1, (address) => {
        instanceAddress = address
        console.log('instanceAddress', instanceAddress)
        browser
          .waitForElementVisible(`#instance${instanceAddress} [data-id="instanceContractBal"]`)
        //*[@id="instance0xbBF289D846208c16EDc8474705C748aff07732dB" and contains(.,"Balance") and contains(.,'0.000000000000000111')]
          .waitForElementVisible({
            locateStrategy: 'xpath',
            selector: `//*[@id="instance${instanceAddress}" and contains(.,"Balance") and contains(.,'0.000000000000000111')]`,
            timeout: 60000
          })
        //.waitForElementContainsText(`#instance${instanceAddress} [data-id="instanceContractBal"]`, 'Balance: 0.000000000000000111 ETH', 60000)
          .clickFunction('sendSomeEther - transact (not payable)', { types: 'uint256 num', values: '2' })
          .pause(1000)
          .waitForElementVisible({
            locateStrategy: 'xpath',
            selector: `//*[@id="instance${instanceAddress}" and contains(.,"Balance") and contains(.,'0.000000000000000109')]`,
            timeout: 60000
          })
      })
  },

  'Should run low level interaction (fallback function) #group3': function (browser: NightwatchBrowser) {
    browser.waitForElementPresent('*[data-id="remixIdeSidePanel"]')
      .clickInstance(0)
      .waitForElementPresent('*[data-id="pluginManagerSettingsDeployAndRunLLTxSendTransaction"]')
      .click('*[data-id="pluginManagerSettingsDeployAndRunLLTxSendTransaction"]')
      .pause(5000)
      .testFunction('last', {
        status: '1 Transaction mined and execution succeed'
      })
      // When this is removed and tests are running by connecting to metamask
      // Consider adding tests to check return value of contract call
      // See: https://github.com/ethereum/remix-project/pull/1229
      .end()
  },

  'Should ensure that save environment state is checked by default #group4 #group5': function (browser: NightwatchBrowser) {
    browser.waitForElementPresent('*[data-id="remixIdeSidePanel"]')
      .waitForElementVisible('*[data-id="topbar-settingsIcon"]')
      .click('*[data-id="topbar-settingsIcon"]')
      .waitForElementVisible('*[data-id="settings-sidebar-general"]')
      .click('*[data-id="settings-sidebar-general"]')
      .pause(100)
      .waitForElementPresent('[data-id="save-evm-stateSwitch"] > .fa-toggle-on')
  },

  'Should deploy default storage contract; store value and ensure that state is saved. #group4 #group5': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('filePanel')
      .click('*[data-id="treeViewLitreeViewItemcontracts"]')
      .openFile('contracts/1_Storage.sol')
      .pause(5000)
      .clickLaunchIcon('udapp')
      .waitForElementPresent('*[data-id="Deploy - transact (not payable)"]')
      .click('*[data-id="Deploy - transact (not payable)"]')
      .waitForElementPresent('#instance0xd9145CCE52D386f254917e481eB44e9943F39138')
      .clickInstance(0)
      .clickFunction('store - transact (not payable)', { types: 'uint256 num', values: '10' })
      .clickFunction('retrieve - call')
      .waitForElementContainsText('[data-id="treeViewLi0"]', 'uint256: 10')
      .clickLaunchIcon('filePanel')
      .openFile('.states/vm-osaka/state.json')
      .getEditorValue((content) => {
        browser
          .assert.ok(content.includes('"latestBlockNumber": "0x2"'), 'State is saved')
      })
  },

  'Should load state after page refresh #group4': function (browser: NightwatchBrowser) {
    browser.refreshPage()
      .waitForElementVisible('*[data-id="remixIdeSidePanel"]')
      .click('*[data-id="treeViewLitreeViewItemcontracts"]')
      .openFile('contracts/1_Storage.sol')
      .addAtAddressInstance('0xd9145CCE52D386f254917e481eB44e9943F39138', true, true, false)
      .clickInstance(0)
      .clickFunction('retrieve - call')
      .waitForElementContainsText('[data-id="treeViewLi0"]', 'uint256: 10')
  },

  'Should save state after running ethers script #group4': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="topbar-settingsIcon"]')
      .click('*[data-id="topbar-settingsIcon"]')
      .waitForElementPresent('[data-id="generate-contract-metadataSwitch"]')
      .click('[data-id="generate-contract-metadataSwitch"]')
      .clickLaunchIcon('solidity')
      .click('.remixui_compilerConfigSection')
      .setValue('#evmVersionSelector', 'london')
      .click('*[data-id="compilerContainerCompileBtn"]')
      .clickLaunchIcon('udapp')
      .switchEnvironment('vm-london')
      .clickLaunchIcon('filePanel')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemscripts"]')
      .click('*[data-id="treeViewLitreeViewItemscripts"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemscripts/deploy_with_ethers.ts"]')
      .openFile('scripts/deploy_with_ethers.ts')
      .click('[data-id="compile-action"]')
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'address:')
      .openFile('.states/vm-london/state.json')
      .waitForElementPresent('[data-id="treeViewDivDraggableItem.states/vm-london/state.json"]')
      .click('[data-id="treeViewDivDraggableItem.states/vm-london/state.json"]')
      .pause(1000)
      .getEditorValue((content) => {
        browser
          .assert.ok(content.includes('"latestBlockNumber": "0x1"'), 'State is saved')
      })
  },

  'Should ensure that .states is not updated when save env option is unchecked #group5': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="topbar-settingsIcon"]')
      .click('*[data-id="topbar-settingsIcon"]')
      .waitForElementPresent('[data-id="save-evm-stateSwitch"]')
      .click('[data-id="save-evm-stateSwitch"]')
      .clickLaunchIcon('filePanel')
      .openFile('contracts/1_Storage.sol')
      .pause(5000)
      .clickLaunchIcon('udapp')
      .waitForElementPresent('*[data-id="Deploy - transact (not payable)"]')
      .click('*[data-id="Deploy - transact (not payable)"]')
      .pause(5000)
      .clickLaunchIcon('filePanel')
      .openFile('.states/vm-osaka/state.json')
      .getEditorValue((content) => {
        browser
          .assert.ok(content.includes('"latestBlockNumber": "0x2"'), 'State is unchanged')
      })
      .end()
  }
}

const sources = [
  {
    'Greet.sol': {
      content:
      `
      pragma solidity ^0.8.0;
      contract HelloWorld {
          string public message;

          fallback () external {
              message = 'Hello World!';
          }

          function greet(string memory _message) public {
              message = _message;
          }
      }`
    },
    'checkBalance.sol': {
      content: `pragma solidity ^0.8.0;
      contract CheckBalance {
        constructor () payable {}

        function sendSomeEther(uint256 num) public {
            payable(msg.sender).transfer(num);
        }

    }`
    }
  }
]
