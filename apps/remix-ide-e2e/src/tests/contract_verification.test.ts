'use strict'
import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

declare global {
  interface Window { testplugin: { name: string, url: string }; }
}

const tests = {
  '@disabled': true,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done, null)
  },

  'Should load contract verification plugin #group1': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('pluginManager')
      .scrollAndClick('[data-id="pluginManagerComponentActivateButtoncontract-verification"]')
      .clickLaunchIcon('contract-verification')
      .pause(5000)
      .frame(0)
      .waitForElementVisible('*[data-id="VerifyDescription"]')
  },

  'Should select a chain by searching #group1': function (browser: NightwatchBrowser) {
    browser
      .click('[data-id="chainDropdownbox"]')
      .waitForElementVisible('[data-id="network-dropdownSearch"]')
      .setValue('[data-id="network-dropdownSearch"]', 'scr')
      .click('[data-id="534351"]')
      .assert.attributeEquals('[data-id="chainDropdownbox"]', 'data-value', '534351')
      .assert.textContains('[data-id="chainDropdownbox"]', 'Scroll Sepolia Testnet (534351)')
  }
}

module.exports = {
  ...tests
};
