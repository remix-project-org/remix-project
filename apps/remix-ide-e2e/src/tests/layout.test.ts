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
      .waitForElementVisible('*[data-id="close_settings"]')
      .click('*[data-id="close_settings"]')
  },
  'Should pin a plugin while an another plugin is already pinned': function (browser: NightwatchBrowser) {
    browser.waitForElementVisible('[data-id="movePluginToRight"]')
      .click('[data-id="movePluginToRight"]')
      .waitForElementVisible('[data-id="movePluginToLeft"]')
      .waitForElementVisible('.right-side-panel h6[data-id="sidePanelSwapitTitle"]')
      .assert.containsText('.right-side-panel h6[data-id="sidePanelSwapitTitle"]', 'SOLIDITY COMPILER')
      .clickLaunchIcon('search')
      .waitForElementVisible('[data-id="movePluginToRight"]')
      .click('[data-id="movePluginToRight"]')
      .waitForElementVisible('[data-id="movePluginToLeft"]')
      .assert.containsText('.right-side-panel h6[data-id="sidePanelSwapitTitle"]', 'SEARCH')
      .assert.containsText('.sidepanel h6[data-id="sidePanelSwapitTitle"]', 'SOLIDITY COMPILER')
  },
  'Should pin a pinned plugin to the right after reloading the page': function (browser: NightwatchBrowser) {
    browser.refreshPage()
      .waitForElementVisible('.right-side-panel h6[data-id="sidePanelSwapitTitle"]')
      .assert.containsText('.right-side-panel h6[data-id="sidePanelSwapitTitle"]', 'SEARCH')
  },
  'Should maintain logged state of search plugin after pinning and unpinning to verify state persistence': function (browser: NightwatchBrowser) {
    browser.clickLaunchIcon('search')
      .waitForElementVisible('*[id="search_input"]')
      .waitForElementVisible('*[id="search_include"]')
      .setValue('*[id="search_include"]', ', *.*').pause(2000)
      .setValue('*[id="search_input"]', 'Storage').sendKeys('*[id="search_input"]', browser.Keys.ENTER)
      .pause(1000)
      .waitForElementContainsText('*[data-id="search_results"]', '1_STORAGE.SOL', 60000)
      .click('[data-id="movePluginToLeft"]')
      .waitForElementVisible('[data-id="movePluginToRight"]')
      .waitForElementContainsText('*[data-id="search_results"]', '1_STORAGE.SOL')
  },
  'Should maintain logged state of search plugin after pinning and unpinning': '' + function (browser: NightwatchBrowser) {
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
