'use strict'

import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

module.exports = {
  '@disabled': true,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done)
  },
  'Should activate delegation and make a transaction to the authority address #group1': function (browser: NightwatchBrowser) {
    let addressDelegate
    browser
      .clickLaunchIcon('udapp')
      .switchEnvironment('vm-prague', 'Remix_VM')
      .addFile('delegate.sol', { content: delegate })
      .clickLaunchIcon('solidity')
      .setSolidityCompilerVersion('soljson-v0.8.28+commit.7893614a.js')
      .clickLaunchIcon('solidity')
      .verifyContracts(['TestDelegate'])
      .clickLaunchIcon('udapp')
      .selectContract('Simple7702Account')
      .createContract('')
      .perform((done) => {
        browser.getAddressAtPosition(0, (address) => {
          addressDelegate = address
          done()
        })
      })
      .clickLaunchIcon('udapp')
      .clearDeployedContracts()
      .perform((done) => {
        browser
          .waitForElementVisible('[data-id="runTabSelectAccount"]')
          .moveToElement('[data-id="runTabSelectAccount"]', 10, 10)
          .pause(500)
          .waitForElementPresent('[data-id="selected-account-kebab-menu"]')
          .click('[data-id="selected-account-kebab-menu"]')
          .waitForElementVisible('[data-id="authorizeDelegation"]')
          .click('[data-id="authorizeDelegation"]')
          .waitForElementVisible('*[data-id="create-delegation-authorization-input"]')
          .execute(() => {
            (document.querySelector('*[data-id="create-delegation-authorization-input"]') as any).focus()
          }, [], () => {})
          .setValue('*[data-id="create-delegation-authorization-input"]', addressDelegate)
          .perform(() => done())
      })
      .modalFooterOKClick('createDelegationAuthorization')
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'This account will be running the code located at')
      .clickInstance(0)
      .clickFunction(0, 6)
      .verifyCallReturnValue('0x5B38Da6a701c568545dCfcB03FcB875f56beddC4', ['0:address: 0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108'])
  },

  'Should keep the delegation status after reload & switching accounts #group1': function (browser: NightwatchBrowser) {
    browser
      .refresh()
      .clickLaunchIcon('udapp')
      .switchEnvironment('vm-prague', 'Remix_VM')
      .waitForElementVisible('*[data-id="delete-delegation"]')
      .selectAccount('0xAb8483F64d9C6d1EcF9b849Ae677dD3315835cb2')
      .waitForElementNotPresent('*[data-id="delete-delegation"]')
      .selectAccount('0x5B38Da6a701c568545dCfcB03FcB875f56beddC4')
      .waitForElementVisible('*[data-id="delete-delegation"]')
  },

  'Should remove the delegation #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="delete-delegation"]')
      .click('*[data-id="delete-delegation"]')
      .modalFooterOKClick('deleteDelegation')
      .waitForElementNotPresent('*[data-id="delete-delegation"]')
      .waitForElementContainsText('*[data-id="terminalJournal"]', `Delegation for 0x5B38Da6a701c568545dCfcB03FcB875f56beddC4 removed.`)
      .refresh()
      .clickLaunchIcon('udapp')
      .switchEnvironment('vm-prague', 'Remix_VM')
      .waitForElementNotPresent('*[data-id="delete-delegation"]')
  }
}

const delegate = `import "https://github.com/eth-infinitism/account-abstraction/blob/v0.8.0/contracts/accounts/Simple7702Account.sol";`
