'use strict'

import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

const sources = []

module.exports = {
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done)
  },
  '@sources': function () {
    return sources
  },
  'Deploy SampleERC721 whose bytecode is very similar to ERC721': function (browser: NightwatchBrowser) {
    browser.clickLaunchIcon('filePanel')
      .click('*[data-id="workspacesSelect"]')
      .pause(2000)
      .click('*[data-id="workspacecreate"]')
      .waitForElementVisible('*[data-id="template-explorer-modal-react"]')
      .waitForElementVisible('*[data-id="template-explorer-template-container"]')
      .click('*[data-id="template-explorer-template-container"]')
      .waitForElementVisible('*[data-id="template-explorer-template-container"]')
      .waitForElementVisible('*[data-id="contract-wizard-topcard"]')
      .click('*[data-id="contract-wizard-topcard"]')
      .waitForElementVisible('*[data-id="contract-wizard-container"]')
      .click('*[data-id="contract-wizard-contract-type-dropdown"]')
      .click('*[data-id="contract-wizard-contract-type-dropdown-item-erc721"]')
      .click('*[data-id="contract-wizard-validate-workspace-button"]')
      .pause(100)
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemcontracts"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemcontracts/MyToken.sol"]')
      .openFile('contracts/MyToken.sol')
      // because the compilatiom imports are slow and sometimes stop loading (not sure why, it's bug) we need to recompile and check to see if the files are really in de FS
      .clickLaunchIcon('solidity')
      .pause(2000)
      .click('[data-id="compilerContainerCompileBtn"]')
      .clickLaunchIcon('filePanel')
      .clickLaunchIcon('udapp')
      .verifyContracts(['MyToken'])
      .clickLaunchIcon('udapp')
      // deploy contract
      .selectContract('MyToken')
      .createContract('')
      .testFunction('last',
        {
          status: '1 Transaction mined and execution succeed',
          'decoded input': {}
        }).end()
  }
}
