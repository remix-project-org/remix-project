'use strict'
import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

module.exports = {
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done, 'http://127.0.0.1:8080', false)
  },

  'Loads Icon\'s Panel': function (browser: NightwatchBrowser) {
    browser.waitForElementVisible('div[data-id="remixIdeIconPanel"]', 10000)
      .waitForElementVisible('div[data-id="verticalIconsHomeIcon"]')
      .waitForElementVisible('div[plugin="filePanel"]')
      .waitForElementVisible('div[plugin="pluginManager"]')
      .waitForElementVisible('*[data-id="topbar-settingsIcon"]')
  },

  'Loads Side Panel': function (browser: NightwatchBrowser) {
    browser.waitForElementVisible('div[data-id="remixIdeSidePanel"]')
      .assert.containsText('h6[data-id="sidePanelSwapitTitle"]', 'FILE EXPLORER')
      .waitForElementVisible('div[data-id="filePanelFileExplorerTree"]')
      .waitForElementVisible('[data-id="treeViewLitreeViewItemcontracts"]')
      .waitForElementVisible('[data-id="treeViewLitreeViewItemscripts"]')
      .waitForElementVisible('[data-id="treeViewLitreeViewItemtests"]')
      .waitForElementVisible('[data-id="treeViewLitreeViewItemREADME.txt"]')
  },

  'Loads Main View': function (browser: NightwatchBrowser) {
    browser.waitForElementVisible('div[data-id="mainPanelPluginsContainer"]')
      .waitForElementVisible('div[data-id="landingPageHomeContainer"]')
      .waitForElementVisible('div[data-id="remixUIHTAll"]')
      .waitForElementVisible('div[data-id="terminalContainer"]')
  },

  'Loads terminal': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('div[data-id="terminalCli"]', 10000)
      .journalLastChildIncludes('Welcome to Remix')
  },

  'Toggles Side Panel': function (browser: NightwatchBrowser) {
    browser.waitForElementVisible('div[data-id="remixIdeSidePanel"]')
      .assert.containsText('h6[data-id="sidePanelSwapitTitle"]', 'FILE EXPLORER')
      .clickLaunchIcon('filePanel')
      .assert.not.visible('div[data-id="remixIdeSidePanel"]')
      .clickLaunchIcon('filePanel')
      .assert.visible('div[data-id="remixIdeSidePanel"]')
      .assert.containsText('h6[data-id="sidePanelSwapitTitle"]', 'FILE EXPLORER')
  },

  'Hides Terminal': function (browser: NightwatchBrowser) {
    browser.waitForElementVisible('div[data-id="terminalContainer"]')
      .assert.elementPresent('div[data-id="terminalCli"]')
      .assert.elementPresent('div[data-id="terminalContainer"]')
      .waitForElementVisible('div[data-id="terminalContainer"]')
      .waitForElementVisible('div[data-id="terminalCli"]')
      .click('i[data-id="hideBottomPanel"]')
      .waitForElementNotVisible('div[data-id="terminalCli"]')
  },

  'Switch Tabs using tabs icon': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('div[data-id="filePanelFileExplorerTree"]')
      .click('[data-id="treeViewLitreeViewItemcontracts"]')
      .openFile('contracts/3_Ballot.sol')
      .assert.containsText('div[data-path="default_workspace/contracts/3_Ballot.sol"]', '3_Ballot.sol')
      .end()
  }
}
