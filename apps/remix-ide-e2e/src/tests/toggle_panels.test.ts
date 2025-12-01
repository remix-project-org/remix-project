'use strict'
import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

module.exports = {
  '@disabled': true,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done)
  },
  'Check if all three toggle icons are visible on topbar #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="toggleLeftSidePanelIcon"]')
      .waitForElementVisible('.codicon-layout-sidebar-left')
      .waitForElementVisible('*[data-id="toggleBottomPanelIcon"]')
      .waitForElementVisible('.codicon-layout-panel')
      .waitForElementVisible('*[data-id="toggleRightSidePanelIcon"]')
      .waitForElementVisible('.codicon-layout-sidebar-right')
  },
  'Check if RemixAI plugin is pinned to right side panel on load #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="movePluginToLeft"]')
      .waitForElementVisible('*[data-id="toggleRightSidePanelIcon"]')
      .waitForElementVisible('.codicon-layout-sidebar-right')
      .waitForElementVisible('*[data-id="remix-ai-assistant-starter-beginner-0"]')
      .waitForElementVisible('*[data-id="remix-ai-assistant-starter-intermediate-1"]')
      .waitForElementVisible('*[data-id="remix-ai-assistant-starter-expert-2"]')
      .click('*[data-id="movePluginToLeft"]')
      .waitForElementVisible('*[data-pinnedPlugin="movePluginToRight-remixaiassistant"]')
      .waitForElementVisible('.codicon-layout-sidebar-right-off') // check the icon toggling on top bar
      .click('*[data-id="toggleRightSidePanelIcon"]') // Check for toaster if plugin on the right side is moved to left, no plugin is pinned on the right side
      .waitForElementVisible(
        {
          selector: "//*[@data-shared='tooltipPopup' and contains(.,'No plugin pinned on the Right Side Panel')]",
          locateStrategy: 'xpath'
        }
      )
  },
  'Pin Solidity Compiler plugin to right side panel #group1': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('solidity')
      .pause(2000)
      .waitForElementVisible('*[data-id="movePluginToRight"]')
      .click('*[data-id="movePluginToRight"]')
      .waitForElementVisible('*[data-pinnedPlugin="movePluginToLeft-solidity"]')
      .waitForElementVisible('.codicon-layout-sidebar-right')
      .clickLaunchIcon('filePanel')
  },
  'Toggle right side panel to hide and show pinned plugin #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="hideRightSidePanel"]')
      .click('*[data-id="hideRightSidePanel"]')
      .waitForElementVisible('.codicon-layout-sidebar-right-off')
      .waitForElementNotVisible('#right-side-panel') // check the right side panel is not rendered
      .click('*[data-id="toggleRightSidePanelIcon"]')
      .waitForElementVisible('*[data-pinnedplugin="movePluginToLeft-solidity"]')
      .waitForElementVisible('.codicon-layout-sidebar-right')
  },
  'Toggle right side panel, reload IDE, panel state should persist #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="hideRightSidePanel"]')
      .click('*[data-id="hideRightSidePanel"]')
      .waitForElementVisible('.codicon-layout-sidebar-right-off')
      .waitForElementNotVisible('#right-side-panel')
      .refresh()
      .waitForElementVisible('*[data-id="toggleRightSidePanelIcon"')
      .waitForElementVisible('.codicon-layout-sidebar-right-off')
      .click('*[data-id="toggleRightSidePanelIcon"]')
      .waitForElementVisible('*[data-pinnedplugin="movePluginToLeft-solidity"]')
      .waitForElementVisible('.codicon-layout-sidebar-right')
  },
  'Swap pinned plugin from right side panel when panel is hidden #group1': function (browser: NightwatchBrowser) {
    browser
      .refreshPage()
      .waitForElementVisible('*[data-pinnedplugin="movePluginToLeft-solidity"]')
      .waitForElementVisible('*[data-id="hideRightSidePanel"]')
      .click('*[data-id="hideRightSidePanel"]')
      .waitForElementVisible('.codicon-layout-sidebar-right-off')
      .waitForElementNotVisible('#right-side-panel')
      .clickLaunchIcon('udapp')
      .waitForElementVisible('*[data-pinnedplugin="movePluginToRight-udapp"]')
      .click('*[data-id="movePluginToRight"]')
      .waitForElementVisible('#right-side-panel')
      .waitForElementVisible('*[data-pinnedplugin="movePluginToLeft-udapp"]')
      .waitForElementVisible('.codicon-layout-sidebar-right')
      .waitForElementVisible('*[data-pinnedplugin="movePluginToRight-solidity"]')
  },
  'Click vertical icon of pinned plugin to unhide right side panel #group1': function (browser: NightwatchBrowser) {
    browser
      .refreshPage()
      .waitForElementVisible('*[data-pinnedplugin="movePluginToLeft-udapp"]')
      .waitForElementVisible('#right-side-panel')
      .click('*[data-id="hideRightSidePanel"]')
      .waitForElementVisible('.codicon-layout-sidebar-right-off')
      .waitForElementNotVisible('#right-side-panel')
      // Click the vertical icon for the pinned plugin (udapp)
      .click('*[data-id="verticalIconsKindudapp"]')
      .waitForElementVisible('#right-side-panel')
      .waitForElementVisible('.codicon-layout-sidebar-right')
      .waitForElementVisible('*[data-pinnedplugin="movePluginToLeft-udapp"]')
  },
  'Hide left side panel using toggle icon on top bar #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('#side-panel')
      .waitForElementVisible('.codicon-layout-sidebar-left')
      .click('*[data-id="toggleLeftSidePanelIcon"]')
      .waitForElementVisible('.codicon-layout-sidebar-left-off')
      .waitForElementNotVisible('#side-panel')
      // Make sure other panels are visible
      .waitForElementVisible('#right-side-panel')
      .waitForElementVisible('.terminal-wrap')
  },
  'Reload & use vertical icon panel and top bar toggle icon to toggle left side bar #group1': function (browser: NightwatchBrowser) {
    browser
      .refreshPage()
      .waitForElementVisible('.codicon-layout-sidebar-left-off')
      .waitForElementNotVisible('#side-panel')
      .waitForElementVisible('*[data-id="verticalIconsKindsolidity"]')
      .click('*[data-id="verticalIconsKindsolidity"]')
      .waitForElementVisible('.codicon-layout-sidebar-left')
      .waitForElementVisible('#side-panel')
      .waitForElementVisible('*[data-pinnedplugin="movePluginToRight-solidity"]')
      .click('*[data-id="toggleLeftSidePanelIcon"]')
      .waitForElementVisible('.codicon-layout-sidebar-left-off')
      .waitForElementNotVisible('#side-panel')
      .click('*[data-id="toggleLeftSidePanelIcon"]')
      .waitForElementVisible('.codicon-layout-sidebar-left')
      .waitForElementVisible('#side-panel')
  },
  'Hide bottom terminal panel using toggle icon on top bar #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('.terminal-wrap')
      .waitForElementVisible('.codicon-layout-panel')
      .click('*[data-id="toggleBottomPanelIcon"]')
      .waitForElementVisible('.codicon-layout-panel-off')
      .waitForElementNotVisible('.terminal-wrap')
      .click('*[data-id="toggleBottomPanelIcon"]')
      .waitForElementVisible('.terminal-wrap')
      .waitForElementVisible('.codicon-layout-panel')
  },
  'Hide bottom terminal panel using hideBottomPanel icon (close icon) #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('.terminal-wrap')
      .waitForElementVisible('*[data-id="hideBottomPanel"]')
      .click('*[data-id="hideBottomPanel"]')
      .waitForElementNotVisible('.terminal-wrap')
      // Show the terminal again using top bar toggle icon
      .click('*[data-id="toggleBottomPanelIcon"]')
      .waitForElementVisible('.terminal-wrap')
      .waitForElementVisible('*[data-id="hideBottomPanel"]')
      // Hide again using hideBottomPanel
      .click('*[data-id="hideBottomPanel"]')
      .waitForElementNotVisible('.terminal-wrap')
      // Show again using hideBottomPanel (requires clicking top bar toggle first to show terminal bar)
      .click('*[data-id="toggleBottomPanelIcon"]')
      .waitForElementVisible('.terminal-wrap')
  },
  'Terminal panel automatically unhides when log is added #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('.terminal-wrap')
      .click('*[data-id="hideBottomPanel"]')
      .waitForElementNotVisible('.terminal-wrap')
      .waitForElementVisible('.codicon-layout-panel-off')
      // Execute a script that will generate a log
      .addFile('test_log.ts', { content: 'console.log("test")' })
      .pause(1000)
      .clickLaunchIcon('solidity')
      .pause(1000)
      .click('*[data-id="compile-action"]') // run script
      .pause(2000)
      // Terminal should automatically unhide when compilation logs are generated
      .waitForElementVisible('.terminal-wrap')
      .waitForElementVisible('.codicon-layout-panel')
  },
  'Hide all three panels using toggle icons on top bar, reload and ensure all are hidden #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="toggleLeftSidePanelIcon"]')
      .waitForElementVisible('.codicon-layout-sidebar-left')
      .waitForElementVisible('*[data-id="toggleBottomPanelIcon"]')
      .waitForElementVisible('.codicon-layout-panel')
      .waitForElementVisible('*[data-id="toggleRightSidePanelIcon"]')
      .waitForElementVisible('.codicon-layout-sidebar-right')
      .click('*[data-id="toggleRightSidePanelIcon"]')
      .click('*[data-id="toggleLeftSidePanelIcon"]')
      .click('*[data-id="toggleBottomPanelIcon"]')
      .refreshPage()
      .waitForElementVisible('.codicon-layout-sidebar-left-off')
      .waitForElementNotVisible('#side-panel')
      .waitForElementVisible('.codicon-layout-panel-off')
      .waitForElementNotVisible('.terminal-wrap')
      .waitForElementVisible('.codicon-layout-sidebar-right-off')
      .waitForElementNotVisible('#right-side-panel')
  },
  'Check if right side panel is hidden when app is in desktop client mode #group1': function (browser: NightwatchBrowser) {
    browser
      .url('http://127.0.0.1:8080/?#activate=udapp,desktopClient')
      .waitForElementNotPresent('#right-side-panel')
      .end()
  }
}
