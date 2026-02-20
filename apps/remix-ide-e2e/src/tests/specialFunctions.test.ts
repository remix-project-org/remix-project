'use strict'
import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

module.exports = {
  '@disabled': true,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    // this test suite also contribute testing https://github.com/ethereum/remix/pull/1497 and https://github.com/ethereum/remix-ide/pull/2898
    // quick explanation:
    // the goal of https://github.com/ethereum/remix-ide/pull/2898 is to keep track of all the compiled contracts a not only the last one.
    // this introduce an issue: if 2 compiled contracts have the same name, the second one override the first which is not wanted.
    // fix's delivered by https://github.com/ethereum/remix/pull/1497: instead of getting contract by name,
    // which result in name clashing we process the whole contract object (which contain bytecode, deployedbytecode, ...)
    init(browser, done)
  },

  '@sources': function () {
    return sources
  },

  'Use special functions receive/fallback - both are declared, sending data #group1': function (browser: NightwatchBrowser) {
    browser.waitForElementVisible('#icon-panel', 10000)
      .testContracts('receiveAndFallback.sol', sources[0]['receiveAndFallback.sol'], ['CheckSpecials']) // compile
      .clickLaunchIcon('udapp')
      .selectAccount('0xCA35b7d915458EF540aDe6068dFe2F44E8fa733c') // this account will be used for this test suite
      .selectContract('CheckSpecials')
      .createContract('') // deploy
      .clickInstance(0)
      .perform((done) => {
        browser.getAddressAtPosition(0, (address) => {
          browser.sendLowLevelTx(0, '0', '0xaa')
            .journalLastChildIncludes('to: CheckSpecials.(fallback)')
            .journalLastChildIncludes('value: 0 wei')
            .journalLastChildIncludes('data: 0xaa')
            .perform(done())
        })
      })
  },

  'Use special functions receive/fallback - both are declared, failing sending data < 1 byte #group1': function (browser: NightwatchBrowser) {
    // don't need to redeploy it, same contract
    browser.perform((done) => {
      browser.getAddressAtPosition(0, (address) => {
        browser.sendLowLevelTx(0, '0', '0xa')
          .pause(1000)
          .waitForElementVisible(`#instance${address} [data-id="deployAndRunLLTxError"]`)
          .assert.containsText(`#instance${address} [data-id="deployAndRunLLTxError"]`, 'The calldata should be a valid hexadecimal value with size of at least one byte.')
          .perform(done())
      })
    })
  },
  'Use special functions receive/fallback - both are declared, failing sending data with odd number of digits #group1': function (browser: NightwatchBrowser) {
    // don't need to redeploy it, same contract
    browser.perform((done) => {
      browser.getAddressAtPosition(0, (address) => {
        browser.sendLowLevelTx(0, '0', '0x1aa')
          .pause(1000)
          .waitForElementVisible(`#instance${address} [data-id="deployAndRunLLTxError"]`)
          .assert.containsText(`#instance${address} [data-id="deployAndRunLLTxError"]`, 'The calldata should be a valid hexadecimal value.')
          .perform(done())
      })
    })
  },
  'Use special functions receive/fallback - both are declared - receive called, sending wei #group1': function (browser: NightwatchBrowser) {
    // don't need to redeploy it, same contract
    browser.perform((done) => {
      browser.getAddressAtPosition(0, (address) => {
        browser.sendLowLevelTx(0, '1', '')
          .journalLastChildIncludes('to: CheckSpecials.(receive)')
          .journalLastChildIncludes('value: 1 wei')
          .journalLastChildIncludes('data: 0x')
          .perform(done())
      })
    })
  },
  'Use special functions receive/fallback - both are declared - fallback should fail cause not payable, sending data and wei #group1': '' + function (browser: NightwatchBrowser) {
    // don't need to redeploy it, same contract
    browser.perform((done) => {
      browser.getAddressAtPosition(0, (address) => {
        browser.sendLowLevelTx(0, '10', '0xaa')
          .journalLastChildIncludes('to CheckSpecials.(fallback) errored:')
          .journalLastChildIncludes('The called function should be payable if you send value')
          .perform(done())
      })
    })
  },
  'Use special functions receive/fallback - only receive is declared, sending wei #group2': function (browser: NightwatchBrowser) {
    browser.waitForElementVisible('#icon-panel', 10000)
      .testContracts('receiveOnly.sol', sources[1]['receiveOnly.sol'], ['CheckSpecials'])
      .clickLaunchIcon('udapp')
      .selectContract('CheckSpecials')
      .createContract('')
      .clickInstance(0)
      .perform((done) => {
        browser.getAddressAtPosition(0, (address) => {
          browser.sendLowLevelTx(0, '1', '')
            .journalLastChildIncludes('to: CheckSpecials.(receive)')
            .journalLastChildIncludes('value: 1 wei')
            .journalLastChildIncludes('data: 0x')
            .perform(done())
        })
      })
  },
  'Use special functions receive/fallback - only receive is declared, failing, fallback is not declared, sending data #group2': '' + function (browser: NightwatchBrowser) {
    // don't need to redeploy it, same contract
    browser.perform((done) => {
      browser.getAddressAtPosition(0, (address) => {
        browser.sendLowLevelTx(0, '0', '0xaa')
          .waitForElementVisible(`#instance${address} [data-id="deployAndRunLLTxError"]`)
          .assert.containsText(`#instance${address} [data-id="deployAndRunLLTxError"]`, '\'Fallback\' function is not defined')
          .perform(done())
      })
    })
  },
  'Use special functions receive/fallback - only fallback declared and is payable, sending wei #group3': '' + function (browser: NightwatchBrowser) {
    browser.waitForElementVisible('#icon-panel', 10000)
      .testContracts('fallbackOnlyPayable.sol', sources[2]['fallbackOnlyPayable.sol'], ['CheckSpecials'])
      .clickLaunchIcon('udapp')
      .selectContract('CheckSpecials')
      .createContract('')
      .clickInstance(0)
      .perform((done) => {
        browser.getAddressAtPosition(0, (address) => {
          browser.sendLowLevelTx(0, '1', '')
            .journalLastChildIncludes('to: CheckSpecials.(fallback)')
            .journalLastChildIncludes('value: 1 wei')
            .journalLastChildIncludes('data: 0x')
            .perform(done())
        })
      })
  },
  'Use special functions receive/fallback - only fallback is declared and is payable, sending data and wei #group3': '' + function (browser: NightwatchBrowser) {
    // don't need to redeploy it, same contract
    browser.perform((done) => {
      browser.getAddressAtPosition(0, (address) => {
        browser.sendLowLevelTx(0, '1', '0xaa')
          .journalLastChildIncludes('to: CheckSpecials.(fallback)')
          .journalLastChildIncludes('value: 1 wei')
          .journalLastChildIncludes('data: 0xaa')
          .perform(done())
      })
    })
  },
  'Use special functions receive/fallback - only fallback is declared, fallback should fail cause not payable, sending wei #group4': '' + function (browser: NightwatchBrowser) {
    browser.waitForElementVisible('#icon-panel', 10000)
      .testContracts('fallbackOnlyNotPayable.sol', sources[3]['fallbackOnlyNotPayable.sol'], ['CheckSpecials'])
      .clickLaunchIcon('udapp')
      .selectContract('CheckSpecials')
      .createContract('')
      .clickInstance(0)
      .perform((done) => {
        browser.getAddressAtPosition(0, (address) => {
          browser.sendLowLevelTx(0, '1', '')
            .pause(1000)
            .waitForElementVisible(`#instance${address} [data-id="deployAndRunLLTxError"]`)
            .assert.containsText(`#instance${address} [data-id="deployAndRunLLTxError"]`, 'should have either \'receive\' or payable \'fallback\'')
            .perform(done())
        })
      })
  },
  'Use special functions receive/fallback - receive and fallback are declared, sending data and wei #group6': '' + function (browser: NightwatchBrowser) {
    browser.waitForElementVisible('#icon-panel', 10000)
      .testContracts('receiveAndFallbackBothPayable.sol', sources[4]['receiveAndFallbackBothPayable.sol'], ['CheckSpecials'])
      .clickLaunchIcon('udapp')
      .selectContract('CheckSpecials')
      .waitForElementVisible('#value')
      .clearValue('#value')
      .setValue('#value', '0')
      .pause(2000)
      .createContract('')
      .pause(1000)
      .clickInstance(0).pause(1000)
      .perform((done) => {
        browser.getAddressAtPosition(0, (address) => {
          browser.sendLowLevelTx(0, '999999998765257135', '0xaa')
            .journalLastChildIncludes('to: CheckSpecials.(fallback)')
            .journalLastChildIncludes('value: 999999998765257135 wei')
            .journalLastChildIncludes('data: 0xaa')
            .perform(done())
        })
      })
  },
  'Use special functions receive/fallback - receive and fallback are declared and payable, sending wei #group6': '' + function (browser: NightwatchBrowser) {
    browser.perform((done) => {
      browser.getAddressAtPosition(0, (address) => {
        browser.sendLowLevelTx(0, '1', '')
          .pause(1000)
          .journalLastChildIncludes('to: CheckSpecials.(receive)')
          .journalLastChildIncludes('value: 1 wei')
          .journalLastChildIncludes('data: 0x')
          .perform(done())
      })
    })
  },
  'Use special functions receive/fallback - receive and fallback are not declared, sending nothing #group5': '' + function (browser: NightwatchBrowser) {
    browser.waitForElementVisible('#icon-panel', 10000)
      .testContracts('notSpecial.sol', sources[5]['notSpecial.sol'], ['CheckSpecials'])
      .clickLaunchIcon('udapp')
      .selectContract('CheckSpecials')
      .waitForElementVisible('#value')
      .clearValue('#value')
      .setValue('#value', '0').pause(2000)
      .createContract('')
      .clickInstance(0)
      .pause(1000)
      .perform((done) => {
        browser.getAddressAtPosition(0, (address) => {
          browser.sendLowLevelTx(0, '0', '')
            .pause(1000)
            .waitForElementVisible(`#instance${address} [data-id="deployAndRunLLTxError"]`)
            .assert.containsText(`#instance${address} [data-id="deployAndRunLLTxError"]`, 'Both \'receive\' and \'fallback\' functions are not defined')
            .perform(done())
        })
      })
      .end()
  }
}

const sources = [
  {
    'receiveAndFallback.sol': {
      content: `
        contract CheckSpecials {
          receive() payable external{}
          fallback() external {}
        }
      `
    }
  },
  {
    'receiveOnly.sol': {
      content: `
        contract CheckSpecials {
          receive() payable external {}
        }
      `
    }
  },
  {
    'fallbackOnlyPayable.sol': {
      content: `
        contract CheckSpecials {
          fallback() payable external {}
        }
      `
    }
  },
  {
    'fallbackOnlyNotPayable.sol': {
      content: `
        contract CheckSpecials {
          fallback() external {}
        }
      `
    }
  },
  {
    'receiveAndFallbackBothPayable.sol': {
      content: `
        contract CheckSpecials {
          receive() payable external {}
          fallback() payable external {}
        }
      `
    }
  },
  {
    'notSpecial.sol': {
      content: `
        contract CheckSpecials {
          function otherFallback() payable external {}
        }
      `
    }
  }
]
