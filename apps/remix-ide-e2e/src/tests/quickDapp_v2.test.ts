'use strict'
import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

module.exports = {
    '@disabled': true,
    before: function (browser: NightwatchBrowser, done: VoidFunction) {
        init(browser, done, 'http://127.0.0.1:8080', false)
    },

    '@sources': function () {
        return sources
    },

    'Should enable experimental mode and open Quick Dapp v2 via sparkle button #group1': function (browser: NightwatchBrowser) {
        browser
            .url('http://127.0.0.1:8080/#experimental')
            .refreshPage() // Reload to ensure workspace is properly initialized with experimental flag
            .pause(3000)
            .waitForElementPresent('*[data-id="remixIdeSidePanel"]')
            .clickLaunchIcon('filePanel')
            .addFile('Storage.sol', sources[0]['Storage.sol'])
            .clickLaunchIcon('solidity')
            .waitForElementVisible('*[data-id="compilerContainerCompileBtn"]')
            .click('*[data-id="compilerContainerCompileBtn"]')
            .waitForElementPresent('*[data-id="compiledContracts"] option', 60000)
            .clickLaunchIcon('udapp')
            .waitForElementVisible('*[data-id="Deploy - transact (not payable)"]', 45000)
            .click('*[data-id="Deploy - transact (not payable)"]')
            .pause(3000)
            .waitForElementPresent('[data-id="universalDappUiContractActionWrapper"]', 30000)
            .clickInstance(0)
            .waitForElementVisible('*[data-id="instanceEditIcon"]', 10000)
            .click('*[data-id="instanceEditIcon"]')
            .pause(2000)
            .waitForElementVisible('*[data-id="generate-website-ai-modal-footer-ok-react"]', 10000)
            .click('*[data-id="generate-website-ai-modal-footer-ok-react"]')
            .pause(10000)
            .frame(0)
            .waitForElementVisible('*[data-id="quick-dapp-dashboard"]', 30000)
            .assert.containsText('h3', 'Quick Dapp')
    },

    'Should display DApp dashboard with at least one DApp #group1': function (browser: NightwatchBrowser) {
        browser
            .frameParent()
            .frame(0)
            .waitForElementVisible('*[data-id="quick-dapp-dashboard"]', 5000)
            .pause(3000)
            .waitForElementVisible('[data-id^="dapp-card-"]', 30000)
            .assert.visible('*[data-id="dapp-count-badge"]')
    },

    'Should open DApp for editing #group1': function (browser: NightwatchBrowser) {
        browser
            .frameParent()
            .frame(0)
            .waitForElementVisible('[data-id^="dapp-card-"]', 10000)
            .waitForElementNotPresent('.spinner-border', 90000)
            .pause(1000)
            .click('[data-id^="dapp-card-"]')
            .pause(5000)
            .waitForElementVisible('*[data-id="back-to-dashboard-btn"]', 30000)
    },

    'Should return to dashboard using back button #group1': function (browser: NightwatchBrowser) {
        browser
            .frameParent()
            .frame(0)
            .waitForElementVisible('*[data-id="back-to-dashboard-btn"]', 10000)
            .click('*[data-id="back-to-dashboard-btn"]')
            .pause(3000)
            .waitForElementVisible('*[data-id="quick-dapp-dashboard"]', 10000)
    },

    'Should deploy DApp to IPFS #group1': function (browser: NightwatchBrowser) {
        browser
            .frameParent()
            .frame(0)
            .waitForElementVisible('[data-id^="dapp-card-"]', 10000)
            .click('[data-id^="dapp-card-"]')
            .pause(3000)
            .waitForElementVisible('*[data-id="back-to-dashboard-btn"]', 10000)
            .waitForElementVisible('*[data-id="deploy-ipfs-btn"]', 10000)
            .click('*[data-id="deploy-ipfs-btn"]')
            .waitForElementVisible('*[data-id="ipfs-deploy-success"]', 90000)
            .assert.containsText('*[data-id="ipfs-deploy-success"]', 'CID:')
    },

    'Should register ENS subdomain #group1': function (browser: NightwatchBrowser) {
        const ensSubdomain = `test-${Date.now().toString(36)}`

        browser
            .frameParent()
            .frame(0)
            .waitForElementVisible('*[data-id="ens-subdomain-input"]', 10000)
            .setValue('*[data-id="ens-subdomain-input"]', ensSubdomain)
            .pause(500)
            .click('*[data-id="register-ens-btn"]')
            .waitForElementVisible('*[data-id="ens-register-success"]', 90000)
            .assert.containsText('*[data-id="ens-register-success"]', 'ENS Linked')
    },

    'Should return to dashboard after deployment #group1': function (browser: NightwatchBrowser) {
        browser
            .frameParent()
            .frame(0)
            .waitForElementVisible('*[data-id="back-to-dashboard-btn"]', 10000)
            .click('*[data-id="back-to-dashboard-btn"]')
            .pause(3000)
            .waitForElementVisible('*[data-id="quick-dapp-dashboard"]', 10000)
    },

    'Should delete a DApp from dashboard #group1': function (browser: NightwatchBrowser) {
        browser
            .frameParent()
            .frame(0)
            .waitForElementVisible('*[data-id="quick-dapp-dashboard"]', 5000)
            .waitForElementVisible('[data-id^="delete-dapp-btn-"]', 5000)
            .click('[data-id^="delete-dapp-btn-"]')
            .pause(1000)
            .waitForElementVisible('*[data-id="confirm-delete-dapp-btn"]', 5000)
            .click('*[data-id="confirm-delete-dapp-btn"]')
            .pause(3000)
            .waitForElementVisible('*[data-id="quickDappTooltips"]', 10000)
            .end()
    }
}

const sources = [
    {
        'Storage.sol': {
            content:
                `
      // SPDX-License-Identifier: GPL-3.0
      pragma solidity >=0.8.2 <0.9.0;

      /**
       * @title Storage
       * @dev Store & retrieve value in a variable
       */
      contract Storage {
          uint256 number;

          /**
           * @dev Store value in variable
           * @param num value to store
           */
          function store(uint256 num) public {
              number = num;
          }

          /**
           * @dev Return value
           * @return value of 'number'
           */
          function retrieve() public view returns (uint256){
              return number;
          }
      }`
        }
    }
]
