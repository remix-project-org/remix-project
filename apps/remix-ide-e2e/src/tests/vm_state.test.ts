'use strict'
import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

declare global {
  interface Window { testplugin: { name: string, url: string }; }
}

const tests = {
  '@disabled': true,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done, null)
  },

  'Should show fork and delete VM state icons #group1': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('udapp')
      .waitForElementVisible('*[data-id="selected-provider-vm-osaka"]', 30000)
      .waitForElementVisible('*[data-id="fork-state-icon"]')
      .waitForElementVisible('*[data-id="delete-state-icon"]')
  },
  'Should show toaster while trying fork and delete VM state without state #group1': '' + function (browser: NightwatchBrowser) {
    // removing this test as now the state contains the created addresses and is not empty...
    browser
      .waitForElementVisible('*[data-id="fork-state-icon"]')
      .click('*[data-id="fork-state-icon"]')
      .waitForElementVisible(
        {
          selector: "//*[@data-shared='tooltipPopup' and contains(.,'State not available to fork')]",
          locateStrategy: 'xpath'
        }
      )
      .waitForElementVisible('*[data-id="delete-state-icon"]')
      .click('*[data-id="delete-state-icon"]')
      .waitForElementVisible(
        {
          selector: "//*[@data-shared='tooltipPopup' and contains(.,'State not available to reset')]",
          locateStrategy: 'xpath'
        }
      )
  },
  'Should fork state successfully #group1': function (browser: NightwatchBrowser) {
    let contractAddress = ''
    browser
      .openFile('contracts')
      .openFile('contracts/1_Storage.sol')
      .verifyContracts(['Storage'])
      .clickLaunchIcon('udapp')
      .createContract('')
      .clickInstance(0)
      .perform((done) => {
        browser.getAddressAtPosition(0, (address) => {
          contractAddress = address
          done()
        })
      })
      .clickFunction(0, 0, ["55"])
      .testFunction('last',
        {
          status: '1 Transaction mined and execution completed',
          'decoded input': { 'uint256 num': '55' }
        })
      .clickFunction(0, 1)
      .testFunction('last',
        {
          'decoded output': { '0': 'uint256: 55' }
        })
      .click('*[data-id="fork-state-icon"]')
      .waitForElementVisible('[data-id="forkInput"]')
      .click('[data-id="forkInput"]')
      .setValue('[data-id="forkInput"]', 'forkedState_1')
      .click('[data-id="btnForkState"]')
      // check toaster for forked state
      .waitForElementVisible(
        {
          selector: '//*[@data-shared="tooltipPopup" and contains(.,"New environment \'forkedState_1\' created with forked state.")]',
          locateStrategy: 'xpath'
        }
      )
      // check if forked state is selected as current environment
      .assert.elementPresent('*[data-id="selected-provider-vm-fs-forkedState_1"]')
      // check if forked state file is created with expected details
      .openFile('.states/forked_states/forkedState_1.json')
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf(`"latestBlockNumber": "0x2"`) !== -1)
        browser.assert.ok(content.indexOf(`"stateName": "forkedState_1"`) !== -1)
        browser.assert.ok(content.indexOf(`"forkName": "osaka"`) !== -1)
        browser.assert.ok(content.indexOf(`"savingTimestamp":`) !== -1)
        browser.assert.ok(content.indexOf(`"db":`) !== -1)
        browser.assert.ok(content.indexOf(`"blocks":`) !== -1)
      })
      // fork again this state. The name of the new forked state will be sub_forkedState_2
      .clickLaunchIcon('udapp')
      .click('*[data-id="fork-state-icon"]')
      .waitForElementVisible('[data-id="forkInput"]')
      .click('[data-id="forkInput"]')
      .setValue('[data-id="forkInput"]', 'sub_forkedState_2')
      .click('[data-id="btnForkState"]')
      // load the previous contract
      .clickLaunchIcon('filePanel')
      .openFile('contracts/1_Storage.sol')
      .perform((done) => {
        browser.addAtAddressInstance(contractAddress, true, true, false)
          .perform(() => done())
      })
      .clickInstance(0)
      // check that the state is correct
      .clickFunction(0, 0)
      .testFunction('last',
        {
          'decoded output': { '0': 'uint256: 55' }
        })
      // update the state and check it's correctly applied
      .clickFunction(0, 1, ["57"])
      .testFunction('last',
        {
          status: '1 Transaction mined and execution completed',
          'decoded input': { 'uint256 num': '57' }
        })
      .clearConsole()
      .clickFunction(0, 0)
      .testFunction('last',
        {
          'decoded output': { '0': 'uint256: 57' }
        })
      // switch back to the previous state and check the value hasn't changed.
      .switchEnvironment('vm-fs-forkedState_1', 'Forked_State')
      .clickLaunchIcon('filePanel')
      .openFile('contracts/1_Storage.sol')
      .perform((done) => {
        browser.addAtAddressInstance(contractAddress, true, true, false)
          .perform(() => done())
      })
      .clickInstance(0)
      .clearConsole()
      .clickFunction(0, 0)
      .testFunction('last',
        {
          'decoded output': { '0': 'uint256: 55' }
        })
      .clickLaunchIcon('filePanel')
  },
  'Should show fork states provider in environment dropdown & make txs using forked state #group1': function (browser: NightwatchBrowser) {
    const remixVMSpanXPath = "//span[contains(@class,'dropdown-item') and normalize-space()='Remix VM']"
    browser
      .clickLaunchIcon('udapp')
      .waitForElementVisible('[data-id="settingsSelectEnvOptions"]')
      .click('[data-id="settingsSelectEnvOptions"] button')
      .waitForElementVisible(`[data-id="dropdown-item-vm-fs-forkedState_1"]`)
      .click('[data-id="settingsSelectEnvOptions"] button')
      .switchEnvironment('vm-osaka', 'Remix_VM')
      .openFile('contracts/1_Storage.sol')
      .clickLaunchIcon('solidity')
      .click('*[data-id="compilerContainerCompileBtn"]')
      .pause(2000)
      .clickLaunchIcon('udapp')
      .selectContract('Storage')
      .createContract('')
      .pause(5000)
      .click('*[data-id="fork-state-icon"]')
      .waitForElementVisible('[data-id="forkInput"]')
      .click('[data-id="forkInput"]')
      .setValue('[data-id="forkInput"]', 'forkedState_2')
      .click('[data-id="btnForkState"]')
      .waitForElementVisible('*[data-shared="tooltipPopup"]', 10000)
      .waitForElementContainsText('*[data-shared="tooltipPopup"]', `New environment 'forkedState_2' created with forked state.`)
      .assert.elementPresent('*[data-id="selected-provider-vm-fs-forkedState_2"]')

      .click('[data-id="settingsSelectEnvOptions"] button')
      .waitForElementVisible(`[data-id="dropdown-item-vm-fs-forkedState_2"]`)
      .click('[data-id="settingsSelectEnvOptions"] button')
      .pause(2000)
      .createContract('')
      .closeBetaPopUp()
      .clickInstance(0)
      .clickFunction(0, 0, ["555"])
      .testFunction('last',
        {
          status: '1 Transaction mined and execution completed',
          'block number': '5',
          'decoded input': { 'uint256 num': '555' }
        })
  },
  'Should delete state successfully #group1': function (browser: NightwatchBrowser) {
    browser
      .switchEnvironment('vm-prague', 'Remix_VM')
      .openFile('contracts/1_Storage.sol')
      .clickLaunchIcon('solidity')
      .click('*[data-id="compilerContainerCompileBtn"]')
      .pause(2000)
      .clickLaunchIcon('udapp')
      .createContract('')
      .pause(10000)
      .assert.textContains('*[data-id="deployedContractsBadge"]', '1')
      .click(('*[data-id="delete-state-icon"]'))
      .waitForElementVisible('[data-id="btnResetState"]')
      .click('[data-id="btnResetState"]')
      .waitForElementVisible('*[data-shared="tooltipPopup"]', 10000)
      // check if toaster is shown
      .assert.textContains('*[data-shared="tooltipPopup"]', `VM state reset successfully.`)
      // check that there are no instances
      .assert.textContains('*[data-id="deployedContractsBadge"]', '0')
      // check if state file is deleted
      .openFile('.states/vm-prague')
      .assert.not.elementPresent('*[data-id="treeViewDivDraggableItem.states/vm-prague/state.json"]')
  }
}

module.exports = {
  ...tests
};
