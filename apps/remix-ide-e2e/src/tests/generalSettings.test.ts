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
      .waitForElementContainsText('[data-id="settings-sidebar-header"] h2', 'Settings')
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
  // These e2e should be enabled after settings panel refactoring
  // 'Should load dark theme ': function (browser: NightwatchBrowser) {
  //   browser.waitForElementVisible('*[data-id="verticalIconsKindsettings"]', 5000)
  //     .scrollAndClick('*[data-id="settingsTabThemeLabelDark"]')
  //     .pause(2000)
  //     .checkElementStyle(':root', '--primary', remixIdeThemes.dark.primary)
  //     .checkElementStyle(':root', '--secondary', remixIdeThemes.dark.secondary)
  //     .checkElementStyle(':root', '--success', remixIdeThemes.dark.success)
  //     .checkElementStyle(':root', '--info', remixIdeThemes.dark.info)
  //     .checkElementStyle(':root', '--warning', remixIdeThemes.dark.warning)
  //     .checkElementStyle(':root', '--danger', remixIdeThemes.dark.danger)
  // },

  // 'Should load light theme ': function (browser: NightwatchBrowser) {
  //   browser.waitForElementVisible('*[data-id="verticalIconsKindsettings"]', 5000)
  //     .scrollAndClick('*[data-id="settingsTabThemeLabelLight"]')
  //     .pause(2000)
  //     .checkElementStyle(':root', '--primary', remixIdeThemes.light.primary)
  //     .checkElementStyle(':root', '--secondary', remixIdeThemes.light.secondary)
  //     .checkElementStyle(':root', '--success', remixIdeThemes.light.success)
  //     .checkElementStyle(':root', '--info', remixIdeThemes.light.info)
  //     .checkElementStyle(':root', '--warning', remixIdeThemes.light.warning)
  //     .checkElementStyle(':root', '--danger', remixIdeThemes.light.danger)
  // },

}

const remixIdeThemes = {
  dark: {
    primary: '#007aa6',
    secondary: '#595c76',
    success: '#32ba89',
    info: '#086CB5',
    warning: '#c97539',
    danger: '#b84040'
  },
  light: {
    primary: '#007aa6',
    secondary: '#b3bcc483',
    success: '#32ba89',
    info: '#007aa6',
    warning: '#c97539',
    danger: '#b84040'
  }
}
