'use strict'
import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

module.exports = {
  '@disabled': true,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done)
  },
  'Setup: Pin Solidity Compiler plugin to right side panel #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="movePluginToRight"]')
      .click('*[data-id="movePluginToRight"]')
      .waitForElementVisible('*[data-pinnedPlugin="movePluginToLeft-solidity"]')
      .waitForElementVisible('.codicon-layout-sidebar-right')
      .clickLaunchIcon('filePanel')
  },
  'Maximize right side panel #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('#right-side-panel')
      .waitForElementVisible('*[data-id="maximizeRightSidePanel"]')
      .click('*[data-id="maximizeRightSidePanel"]')
      .waitForElementVisible('#right-side-panel.right-panel-maximized')
      .pause(1000)
  },
  'Verify right panel has no borders when maximized #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('#right-side-panel.right-panel-maximized')
      .checkElementStyle('#right-side-panel', 'border-left-style', 'none')
      .checkElementStyle('#right-side-panel', 'border-right-style', 'none')
  },
  'Verify left panel is hidden when right panel is maximized #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('#right-side-panel.right-panel-maximized')
      .waitForElementNotVisible('#side-panel')
  },
  'Verify main panel is hidden when right panel is maximized #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('#right-side-panel.right-panel-maximized')
      .assert.hasClass('.mainpanel', 'd-none')
  },
  'Verify terminal panel is hidden when right panel is maximized #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('#right-side-panel.right-panel-maximized')
      .waitForElementNotVisible('.terminal-wrap')
  },
  'Verify dragbar is hidden when right panel is maximized #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('#right-side-panel.right-panel-maximized')
      .checkElementStyle('#right-side-panel.right-panel-maximized ~ .dragbar', 'background-color', 'rgba(0, 0, 0, 0)')
      .checkElementStyle('#right-side-panel.right-panel-maximized ~ .dragbar', 'pointer-events', 'none')
  },
  'Minimize right side panel #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="maximizeRightSidePanel"]')
      .click('*[data-id="maximizeRightSidePanel"]')
      .waitForElementNotPresent('#right-side-panel.right-panel-maximized')
      .pause(1000)
  },
  'Verify borders are visible when panel is minimized #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('#right-side-panel')
      .waitForElementNotPresent('#right-side-panel.right-panel-maximized')
      .execute(function () {
        const panel = document.querySelector('#right-side-panel')
        const computedStyle = window.getComputedStyle(panel)
        const borderLeft = computedStyle.getPropertyValue('border-left-style')
        const borderRight = computedStyle.getPropertyValue('border-right-style')
        return borderLeft !== 'none' || borderRight !== 'none'
      }, [], function (result: any) {
        browser.assert.ok(result.value, 'Borders should be visible when panel is not maximized')
      })
  },
  'Verify left panel is visible again when right panel is minimized #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('#side-panel')
      .waitForElementVisible('.sidepanel')
  },
  'Verify main panel is visible again when right panel is minimized #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('.mainpanel')
      .assert.not.hasClass('.mainpanel', 'd-none')
  },
  'Verify terminal panel is visible again when right panel is minimized #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('.terminal-wrap')
  },
  'Maximize and then hide right panel #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('#right-side-panel')
      .waitForElementVisible('*[data-id="maximizeRightSidePanel"]')
      .click('*[data-id="maximizeRightSidePanel"]')
      .waitForElementVisible('#right-side-panel.right-panel-maximized')
      .pause(1000)
      .waitForElementVisible('*[data-id="hideRightSidePanel"]')
      .click('*[data-id="hideRightSidePanel"]')
      .waitForElementNotVisible('#right-side-panel')
      .waitForElementVisible('.codicon-layout-sidebar-right-off')
  },
  'Verify panels are restored when hidden maximized panel is shown again #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="toggleRightSidePanelIcon"]')
      .click('*[data-id="toggleRightSidePanelIcon"]')
      .pause(1000)
      .waitForElementVisible('#right-side-panel')
      .waitForElementVisible('#side-panel')
      .waitForElementVisible('.mainpanel')
      .assert.not.hasClass('.mainpanel', 'd-none')
  },
  'Test auto-restore on file change when panel is maximized #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('#right-side-panel')
      .waitForElementVisible('*[data-id="maximizeRightSidePanel"]')
      .click('*[data-id="maximizeRightSidePanel"]')
      .waitForElementVisible('#right-side-panel.right-panel-maximized')
      .pause(1000)
      .assert.hasClass('.mainpanel', 'd-none')
      .openFile('contracts/2_Owner.sol')
      .pause(2000)
      .waitForElementVisible('#right-side-panel')
      .execute(function () {
        return !document.querySelector('#right-side-panel').classList.contains('right-panel-maximized')
      }, [], function (result: any) {
        browser.assert.ok(result.value, 'Panel should auto-restore after file change')
      })
      .waitForElementVisible('.mainpanel')
      .assert.not.hasClass('.mainpanel', 'd-none')
  },
  'Test panel maximization persists with different plugin #group1': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('udapp')
      .waitForElementVisible('*[data-id="movePluginToRight"]')
      .click('*[data-id="movePluginToRight"]')
      .waitForElementVisible('*[data-pinnedPlugin="movePluginToLeft-udapp"]')
      .pause(1000)
      .waitForElementVisible('*[data-id="maximizeRightSidePanel"]')
      .click('*[data-id="maximizeRightSidePanel"]')
      .waitForElementVisible('#right-side-panel.right-panel-maximized')
      .checkElementStyle('#right-side-panel', 'border-left-style', 'none')
      .checkElementStyle('#right-side-panel', 'border-right-style', 'none')
      .waitForElementNotVisible('#side-panel')
      .assert.hasClass('.mainpanel', 'd-none')
  },
  'Test maximize panel with terminal open #group1': function (browser: NightwatchBrowser) {
    browser
      // Right panel is maximized from previous test, which hides terminal
      // Showing the terminal will auto-restore the right panel
      .waitForElementVisible('#right-side-panel.right-panel-maximized')
      .click('*[data-id="toggleBottomPanelIcon"]')
      .pause(1500)
      .waitForElementVisible('.terminal-wrap')
      .waitForElementVisible('#side-panel')
      .assert.not.hasClass('#right-side-panel', 'right-panel-maximized')
      // Now maximize the right panel again
      .click('*[data-id="maximizeRightSidePanel"]')
      .pause(1000)
      .waitForElementVisible('#right-side-panel.right-panel-maximized')
      .waitForElementNotVisible('.terminal-wrap')
      .waitForElementNotVisible('#side-panel')
  },
  'Verify panel state after page reload when not maximized #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('#right-side-panel.right-panel-maximized')
      .click('*[data-id="maximizeRightSidePanel"]')
      .pause(1500)
      .assert.not.hasClass('#right-side-panel', 'right-panel-maximized')
      .waitForElementVisible('#side-panel')
      .waitForElementVisible('.mainpanel')
      .assert.not.hasClass('.mainpanel', 'd-none')
      .refreshPage()
      .waitForElementVisible('#right-side-panel')
      .pause(1000)
      .assert.not.hasClass('#right-side-panel', 'right-panel-maximized')
      .waitForElementVisible('#side-panel')
      .waitForElementVisible('.mainpanel')
      .assert.not.hasClass('.mainpanel', 'd-none')
  },
  'Maximize bottom panel #group2': function (browser: NightwatchBrowser) {
    browser
      // Terminal is shown by init.ts for e2e tests
      .waitForElementVisible('.terminal-wrap')
      .waitForElementVisible('*[data-id="maximizeBottomPanel"]')
      .click('*[data-id="maximizeBottomPanel"]')
      .waitForElementVisible('.terminal-wrap.maximized')
      .pause(1000)
  },
  'Verify main panel content is hidden when bottom panel is maximized #group2': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('.terminal-wrap.maximized')
      .execute(function () {
        const mainView = document.querySelector('.mainview')
        const wraps = mainView.querySelectorAll('[class*="-wrap"]')
        let allOtherWrapsHidden = true
        wraps.forEach((wrap: HTMLElement) => {
          if (!wrap.classList.contains('terminal-wrap')) {
            if (!wrap.classList.contains('d-none')) {
              allOtherWrapsHidden = false
            }
          }
        })
        return allOtherWrapsHidden
      }, [], function (result: any) {
        browser.assert.ok(result.value, 'All main panel wraps except terminal should be hidden')
      })
  },
  'Verify left panel is still visible when bottom panel is maximized #group2': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('.terminal-wrap.maximized')
      .waitForElementVisible('#side-panel')
  },
  'Verify right panel is still visible when bottom panel is maximized #group2': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('.terminal-wrap.maximized')
      .waitForElementVisible('#right-side-panel')
  },
  'Minimize bottom panel #group2': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="maximizeBottomPanel"]')
      .click('*[data-id="maximizeBottomPanel"]')
      .waitForElementNotPresent('.terminal-wrap.maximized')
      .pause(1000)
  },
  'Verify main panel content is visible again when bottom panel is minimized #group2': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('.terminal-wrap')
      .assert.not.hasClass('.terminal-wrap', 'maximized')
      .execute(function () {
        const mainView = document.querySelector('.mainview')
        const wraps = mainView.querySelectorAll('[class*="-wrap"]')
        let allWrapsVisible = true
        wraps.forEach((wrap: HTMLElement) => {
          if (wrap.classList.contains('d-none')) {
            allWrapsVisible = false
          }
        })
        return allWrapsVisible
      }, [], function (result: any) {
        browser.assert.ok(result.value, 'All main panel wraps should be visible again')
      })
  },
  'Test auto-restore on file change when bottom panel is maximized #group2': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('.terminal-wrap')
      .waitForElementVisible('*[data-id="maximizeBottomPanel"]')
      .click('*[data-id="maximizeBottomPanel"]')
      .waitForElementVisible('.terminal-wrap.maximized')
      .pause(1000)
      .openFile('contracts/1_Storage.sol')
      .pause(2000)
      .waitForElementVisible('.terminal-wrap')
      .execute(function () {
        return !document.querySelector('.terminal-wrap').classList.contains('maximized')
      }, [], function (result: any) {
        browser.assert.ok(result.value, 'Bottom panel should auto-restore after file change')
      })
      .execute(function () {
        const mainView = document.querySelector('.mainview')
        const wraps = mainView.querySelectorAll('[class*="-wrap"]')
        let allWrapsVisible = true
        wraps.forEach((wrap: HTMLElement) => {
          if (wrap.classList.contains('d-none')) {
            allWrapsVisible = false
          }
        })
        return allWrapsVisible
      }, [], function (result: any) {
        browser.assert.ok(result.value, 'All main panel wraps should be visible after auto-restore')
      })
  },
  'Test maximize and minimize bottom panel multiple times #group2': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('.terminal-wrap')
      .waitForElementVisible('*[data-id="maximizeBottomPanel"]')
      .click('*[data-id="maximizeBottomPanel"]')
      .waitForElementVisible('.terminal-wrap.maximized')
      .pause(500)
      .click('*[data-id="maximizeBottomPanel"]')
      .waitForElementNotPresent('.terminal-wrap.maximized')
      .pause(500)
      .click('*[data-id="maximizeBottomPanel"]')
      .waitForElementVisible('.terminal-wrap.maximized')
      .pause(500)
      .click('*[data-id="maximizeBottomPanel"]')
      .waitForElementNotPresent('.terminal-wrap.maximized')
  },
  'Test maximize bottom panel persists during terminal activity #group2': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('.terminal-wrap')
      .waitForElementVisible('*[data-id="maximizeBottomPanel"]')
      .click('*[data-id="maximizeBottomPanel"]')
      .waitForElementVisible('.terminal-wrap.maximized')
      .pause(1000)
      .click('*[data-id="terminalClearConsole"]')
      .pause(500)
      .waitForElementVisible('.terminal-wrap.maximized')
      .assert.hasClass('.terminal-wrap', 'maximized')
  },
  'Hide maximized bottom panel and verify main panel is restored #group2': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('.terminal-wrap.maximized')
      .execute(function () {
        const mainView = document.querySelector('.mainview')
        const wraps = mainView.querySelectorAll('[class*="-wrap"]')
        let allNonTerminalWrapsHidden = true
        wraps.forEach((wrap: HTMLElement) => {
          if (!wrap.classList.contains('terminal-wrap')) {
            if (!wrap.classList.contains('d-none')) {
              allNonTerminalWrapsHidden = false
            }
          }
        })
        return allNonTerminalWrapsHidden
      }, [], function (result: any) {
        browser.assert.ok(result.value, 'All main panel wraps except terminal should be hidden when maximized')
      })
      .waitForElementVisible('*[data-id="hideBottomPanel"]')
      .click('*[data-id="hideBottomPanel"]')
      .pause(500)
      .waitForElementNotVisible('.terminal-wrap')
      .assert.hasClass('.terminal-wrap', 'd-none')
      .execute(function () {
        const mainView = document.querySelector('.mainview')
        const wraps = mainView.querySelectorAll('[class*="-wrap"]')
        let allNonTerminalWrapsVisible = true
        wraps.forEach((wrap: HTMLElement) => {
          if (!wrap.classList.contains('terminal-wrap')) {
            if (wrap.classList.contains('d-none')) {
              allNonTerminalWrapsVisible = false
            }
          }
        })
        return allNonTerminalWrapsVisible
      }, [], function (result: any) {
        browser.assert.ok(result.value, 'All main panel wraps should be restored when maximized panel is hidden')
      })
  },
  'Verify bottom panel state after page reload when not maximized #group2': function (browser: NightwatchBrowser) {
    browser
      .waitForElementNotVisible('.terminal-wrap')
      .waitForElementVisible('*[data-id="toggleBottomPanelIcon"]')
      .click('*[data-id="toggleBottomPanelIcon"]')
      .pause(500)
      .waitForElementVisible('.terminal-wrap')
      .assert.not.hasClass('.terminal-wrap', 'maximized')
      .waitForElementVisible('#side-panel')
      .waitForElementVisible('.mainpanel')
      .refreshPage()
      .waitForElementVisible('.terminal-wrap')
      .pause(1000)
      .assert.not.hasClass('.terminal-wrap', 'maximized')
      .waitForElementVisible('#side-panel')
      .waitForElementVisible('.mainpanel')
      .end()
  }
}
