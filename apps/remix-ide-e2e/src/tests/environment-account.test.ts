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
      .switchEnvironment('vm-cancun', 'Remix_VM')
      .assert.containsText('[data-id="selected-provider-vm-cancun"]', 'Remix VM')
  },

  'Should display sample accounts and balances #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('[data-id="runTabSelectAccount"]')
      .click('[data-id="runTabSelectAccount"]')
      .waitForElementVisible('.custom-dropdown-items.show')
      .waitForElementVisible('[data-id="0x5B38Da6a701c568545dCfcB03FcB875f56beddC4"]')
      .assert.containsText('[data-id="0x5B38Da6a701c568545dCfcB03FcB875f56beddC4"] .account-balance-text', '100.000 ETH')
      .end()
  }
}
