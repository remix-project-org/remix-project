'use strict'
import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

const sources = [
  {
    'basic.sol': {
      content:
    `pragma solidity >=0.2.0 <0.7.0;

    /**
     * @title Basic contract
     */
    contract Basic {
        uint someVar;
        constructor() public {}
    }`
    }
  }
]

module.exports = {
  '@disabled': true,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done)
  },
  '@sources': function () {
    return sources
  },
  'Using Web Worker #group1': function (browser: NightwatchBrowser) {
    browser
      // using autocompile when switching compilers quickly confuses the process and results in a wrong compiler version being used or results displayed
      .waitForElementVisible('[for="autoCompile"]')
      .click('[for="autoCompile"]')
      .click('*[data-id="scConfigExpander"]')
      .waitForElementVisible('[data-id="compilerNightliesBuild"]')
      .click('[data-id="compilerNightliesBuild"]')
      .addFile('basic.sol', sources[0]['basic.sol'])      
      .clickLaunchIcon('solidity')
      .noWorkerErrorFor('soljson-v0.6.5+commit.f956cc89.js')
      .noWorkerErrorFor('soljson-v0.6.8-nightly.2020.5.14+commit.a6d0067b.js')
      .noWorkerErrorFor('soljson-v0.6.0-nightly.2019.12.17+commit.d13438ee.js')
      .noWorkerErrorFor('soljson-v0.4.26+commit.4563c3fc.js')
      .execute(function () {
        const elem = document.getElementById('nightlies') as HTMLInputElement

        elem.checked = false
      })
      .end()
  }
}
