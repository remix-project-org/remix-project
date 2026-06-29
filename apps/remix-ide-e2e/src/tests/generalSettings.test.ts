'use strict'
import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

module.exports = {
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done, 'http://127.0.0.1:8080', false)
  },

  'Should display settings menu ': function (browser: NightwatchBrowser) {
    browser.waitForElementVisible('*[data-id="remixIdeIconPanel"]', 10000)
      .waitForElementVisible('*[data-id="topbar-settingsIcon"]')
      .click('*[data-id="topbar-settingsIcon"]')
      .waitForElementContainsText('[data-id="settings-sidebar-header"] h3', 'Settings')
  },

  'Should activate `generate contract metadata` ': function (browser) {
    browser.waitForElementVisible('*[data-id="remixIdeSidePanel"]')
      .waitForElementVisible('*[data-id="generate-contract-metadataSwitch"]')
      .verify.elementPresent('[data-id="generate-contract-metadataSwitch"] .fa-toggle-on')
      .openFile('contracts/3_Ballot.sol')
      .click('*[data-id="verticalIconsKindsolidity"]')
      .pause(2000)
      .click('*[data-id="compilerContainerCompileBtn"]')
      .pause(3000)
      .click('*[data-id="verticalIconsKindfilePanel"]')
      .openFile('artifacts/Ballot.json')
      .openFile('artifacts/Ballot_metadata.json')
      .getEditorValue((content) => {
        const metadata = JSON.parse(content)
        browser.assert.equal(metadata.language, 'Solidity')
      })
  },

  'Should add new github access token ': function (browser: NightwatchBrowser) {
    browser.waitForElementVisible('*[data-id="topbar-settingsIcon"]')
      .click('*[data-id="topbar-settingsIcon"]')
      .waitForElementVisible('*[data-id="settings-sidebar-services"]')
      .click('*[data-id="settings-sidebar-services"]')
      .pause(100)
      .click('*[data-id="github-configSwitch"]')
      .setValue('[data-id="settingsTabgist-access-token"]', '**********')
      .click('[data-id="settingsTabSavegithub-config"]')
      .pause(100)
      .waitForElementVisible('*[data-shared="tooltipPopup"]', 5000)
      .assert.containsText('*[data-shared="tooltipPopup"]', 'Credentials updated')
      .pause(3000)
  },

  'Should remove github access token ': function (browser: NightwatchBrowser) {
    browser
      .click('*[data-id="github-configSwitch"]')
      .pause(500)
      .waitForElementVisible('*[data-shared="tooltipPopup"]', 5000)
      .assert.containsText('*[data-shared="tooltipPopup"]', 'Credentials removed')
      .waitForElementNotPresent('[data-id="settingsTabgist-access-token"]')
      .click('*[data-id="github-configSwitch"]')
      .pause(100)
      .assert.containsText('[data-id="settingsTabgist-access-token"]', '')
  },

  'Should switch to Dark theme from Appearance section': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="topbar-settingsIcon"]')
      .click('*[data-id="topbar-settingsIcon"]')
      .waitForElementVisible('*[data-id="settings-sidebar-general"]')
      .click('*[data-id="settings-sidebar-general"]')
      .waitForElementVisible('*[data-id="settingsTabthemeLabel"]')
      .click('*[data-id="settingsTabDropdownToggletheme"]')
      .waitForElementVisible('*[data-id="settingsTabDropdownItemDark"]')
      .click('*[data-id="settingsTabDropdownItemDark"]')
      .pause(2000)
      .checkElementStyle(':root', '--bs-primary', remixIdeThemes.dark.primary)
      .checkElementStyle(':root', '--bs-secondary', remixIdeThemes.dark.secondary)
      .checkElementStyle(':root', '--bs-success', remixIdeThemes.dark.success)
      .checkElementStyle(':root', '--bs-info', remixIdeThemes.dark.info)
      .checkElementStyle(':root', '--bs-warning', remixIdeThemes.dark.warning)
      .checkElementStyle(':root', '--bs-danger', remixIdeThemes.dark.danger)
  },

  'Should switch to Light theme from Appearance section': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="settingsTabthemeLabel"]')
      .click('*[data-id="settingsTabDropdownToggletheme"]')
      .waitForElementVisible('*[data-id="settingsTabDropdownItemLight"]')
      .click('*[data-id="settingsTabDropdownItemLight"]')
      .pause(2000)
      .checkElementStyle(':root', '--bs-primary', remixIdeThemes.light.primary)
      .checkElementStyle(':root', '--bs-secondary', remixIdeThemes.light.secondary)
      .checkElementStyle(':root', '--bs-success', remixIdeThemes.light.success)
      .checkElementStyle(':root', '--bs-info', remixIdeThemes.light.info)
      .checkElementStyle(':root', '--bs-warning', remixIdeThemes.light.warning)
      .checkElementStyle(':root', '--bs-danger', remixIdeThemes.light.danger)
      .end()
  },

}

const remixIdeThemes = {
  dark: {
    primary: '#007aa6',
    secondary: '#444',
    success: '#00bc8c',
    info: '#3498db',
    warning: '#f39c12',
    danger: '#e74c3c'
  },
  light: {
    primary: '#007aa6',
    secondary: '#a2a3bd',
    success: '#18bc9c',
    info: '#3498db',
    warning: '#f39c12',
    danger: '#e74c3c'
  }
}
