'use strict'
import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

module.exports = {
  '@disabled': true,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done)
  },

  'Check if RemixAI plugin is pinned #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="movePluginToLeft"]')
      .waitForElementVisible('*[data-id="remix-ai-assistant-starter-beginner-0"]')
      .waitForElementVisible('*[data-id="remix-ai-assistant-starter-intermediate-1"]')
      .waitForElementVisible('*[data-id="remix-ai-assistant-starter-expert-2"]')
      .click('*[data-id="movePluginToLeft"]')
      .waitForElementVisible('*[data-pinnedPlugin="movePluginToRight-remixaiassistant"]')
  },
  'Pin Solidity Compiler plugin #group1': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('solidity')
      .pause(2000)
      .waitForElementVisible('*[data-id="movePluginToRight"]')
      .click('*[data-id="movePluginToRight"]')
      .waitForElementVisible('*[data-pinnedPlugin="movePluginToLeft-solidity"]')
      .clickLaunchIcon('filePanel')
  },
  'Close Solidity Compiler Plugin and restore it #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="closePinnedPlugin"]')
      .click('*[data-id="closePinnedPlugin"]')
      .waitForElementNotVisible('*[data-pinnedplugin="movePluginToLeft-solidity"]')
      .waitForElementVisible('*[data-id="restoreClosedPlugin"')
      .click('*[data-id="restoreClosedPlugin"]')
      .waitForElementVisible('*[data-pinnedplugin="movePluginToLeft-solidity"]')
  },
  'Swap pinned Solidity Compiler Plugin with RemixAI Assistant when pinned plugin is closed #group1': function (browser: NightwatchBrowser) {
    browser
      .refreshPage()
      .waitForElementVisible('*[data-pinnedplugin="movePluginToLeft-solidity"]')
      .waitForElementVisible('*[data-id="closePinnedPlugin"]')
      .click('*[data-id="closePinnedPlugin"]')
      .waitForElementVisible('*[data-id="restoreClosedPlugin"]')
      .clickLaunchIcon('udapp')
      .waitForElementVisible('*[data-pinnedplugin="movePluginToRight-udapp"]')
      .click('*[data-id="movePluginToRight"]')
      .waitForElementVisible('*[data-pinnedplugin="movePluginToLeft-udapp"]')
      .waitForElementVisible('*[data-id="movePluginToRight"]')
      .click('*[data-pinnedplugin="movePluginToLeft-udapp"]')
      .end()
  }
}
