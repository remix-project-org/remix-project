'use strict'
import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

module.exports = {
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done)
  },

  '@sources': function () {
    return sources
  },

  'Should pin solidity compiler plugin to the right and switch focus for left side panel to the file-explorer': function (browser: NightwatchBrowser) {
    browser.waitForElementVisible('[data-id="movePluginToRight"]')
      .click('[data-id="movePluginToRight"]')
      .waitForElementVisible('[data-id="movePluginToLeft"]')
      .waitForElementVisible('.right-side-panel h6[data-id="sidePanelSwapitTitle"]')
      .clickLaunchIcon('filePanel')
      .assert.containsText('.sidepanel h6[data-id="sidePanelSwapitTitle"]', 'FILE EXPLORER')
      .assert.containsText('.right-side-panel h6[data-id="sidePanelSwapitTitle"]', 'SOLIDITY COMPILER')
  },
  'Should unpin and focus on solidity compiler in the left side panel': function (browser: NightwatchBrowser) {
    browser.waitForElementVisible('[data-id="movePluginToLeft"]')
      .click('[data-id="movePluginToLeft"]')
      .waitForElementVisible('[data-id="movePluginToRight"]')
      .assert.containsText('.sidepanel h6[data-id="sidePanelSwapitTitle"]', 'SOLIDITY COMPILER')
      .waitForElementNotVisible('.right-side-panel h6[data-id="sidePanelSwapitTitle"]')
  },
  'Should pin a plugin while an another plugin is already pinned': function (browser: NightwatchBrowser) {
    browser.waitForElementVisible('[data-id="movePluginToRight"]')
      .click('[data-id="movePluginToRight"]')
      .waitForElementVisible('[data-id="movePluginToLeft"]')
      .waitForElementVisible('.right-side-panel h6[data-id="sidePanelSwapitTitle"]')
      .assert.containsText('.right-side-panel h6[data-id="sidePanelSwapitTitle"]', 'SOLIDITY COMPILER')
      .clickLaunchIcon('udapp')
      .click('[data-id="movePluginToRight"]')
      .waitForElementVisible('[data-id="movePluginToLeft"]')
      .assert.containsText('.right-side-panel h6[data-id="sidePanelSwapitTitle"]', 'DEPLOY & RUN TRANSACTIONS')
      .assert.containsText('.sidepanel h6[data-id="sidePanelSwapitTitle"]', 'SOLIDITY COMPILER')
  },
  'Should pin a pinned plugin to the right after reloading the page': function (browser: NightwatchBrowser) {
    browser.refreshPage()
      .waitForElementVisible('.right-side-panel h6[data-id="sidePanelSwapitTitle"]')
      .assert.containsText('.right-side-panel h6[data-id="sidePanelSwapitTitle"]', 'DEPLOY & RUN TRANSACTIONS')
  },
  'Should maintain logged state of udapp plugin after pinning and unpinning': function (browser: NightwatchBrowser) {
    browser.waitForElementVisible('*[data-id="treeViewLitreeViewItemcontracts"]')
      .click('*[data-id="treeViewLitreeViewItemcontracts"]')
      .openFile('contracts/1_Storage.sol')
      .pause(5000)
      .waitForElementPresent('*[data-id="Deploy - transact (not payable)"]')
      .click('*[data-id="Deploy - transact (not payable)"]')
      .waitForElementPresent('#instance0xd9145CCE52D386f254917e481eB44e9943F39138')
      .clickInstance(0)
      .clickFunction('store - transact (not payable)', { types: 'uint256 num', values: '10' })
      .clickFunction('retrieve - call')
      .click('[data-id="movePluginToLeft"]')
      .waitForElementVisible('[data-id="movePluginToRight"]')
      .clickInstance(0)
      .waitForElementContainsText('[data-id="treeViewLi0"]', 'uint256: 10')
  },
  'Should maintain logged state of search plugin after pinning and unpinning': function (browser: NightwatchBrowser) {
    browser.clickLaunchIcon('search')
      .waitForElementVisible('*[id="search_input"]')
      .waitForElementVisible('*[id="search_include"]')
      .setValue('*[id="search_include"]', ', *.*').pause(2000)
      .setValue('*[id="search_input"]', 'read').sendKeys('*[id="search_input"]', browser.Keys.ENTER)
      .pause(1000)
      .waitForElementContainsText('*[data-id="search_results"]', '3_BALLOT.SOL', 60000)
      .waitForElementContainsText('*[data-id="search_results"]', 'contracts', 60000)
      .waitForElementContainsText('*[data-id="search_results"]', 'README.TXT', 60000)
      .click('[data-id="movePluginToRight"]')
      .waitForElementContainsText('*[data-id="search_results"]', '3_BALLOT.SOL')
      .waitForElementContainsText('*[data-id="search_results"]', 'contracts')
      .waitForElementContainsText('*[data-id="search_results"]', 'README.TXT')
  }
}

const sources = []
