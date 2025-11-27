'use strict'
import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

declare global {
  interface Window { testplugin: { name: string, url: string }; }
}

module.exports = {
  '@disabled': true,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done, null)
  },

  'Should open submenu and close both menus on selection #group1': function (browser: NightwatchBrowser) {
   browser
      .clickLaunchIcon('udapp')
      .waitForElementVisible('[data-id="settingsSelectEnvOptions"]')
      .click('[data-id="settingsSelectEnvOptions"]')
      .waitForElementVisible('[data-id="custom-dropdown-items"]')
      .moveToElement('*[data-id="custom-dropdown-items"] span:nth-of-type(1)', 10, 10)
      .waitForElementVisible('[data-id="dropdown-item-vm-cancun"]')
      .click('[data-id="dropdown-item-vm-cancun"]')
      .assert.containsText('[data-id="selected-provider-vm-cancun"]', 'Remix VM (Cancun)')
  },

  'Should display sample accounts and balances #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('[data-id="runTabSelectAccount"]')
      .click('[data-id="runTabSelectAccount"]')
      .pause(3000)
      .waitForElementVisible('[data-id^="txOriginSelectAccountItem-"]')
      .assert.containsText({
        selector: '[data-id^="txOriginSelectAccountItem-"]',
        index: 0
      }, '100.0 ETH')
      .end()
  }
}
