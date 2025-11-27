'use strict'
import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'
import examples from '../examples/example-contracts'

const sources = [
  { 'Untitled.sol': { content: examples.ballot.content } },
  { 'Untitled1.sol': { content: 'contract test {}' } }
]

module.exports = {
  '@disabled': true,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done)
  },
  '@sources': function () {
    return sources
  },
  'The sequence: Compiling / Deploying / Compiling another contract / calling the first contract - should display in the log the transaction with all the decoded information #group1': function (browser: NightwatchBrowser) {
    // https://github.com/ethereum/remix-ide/issues/2864
    browser
      .waitForElementVisible('*[data-id="remixIdeIconPanel"]', 10000)
      .clickLaunchIcon('solidity')
      .testContracts('Untitled.sol', sources[0]['Untitled.sol'], ['Ballot'])
      .clickLaunchIcon('udapp')
      .selectAccount('0xCA35b7d915458EF540aDe6068dFe2F44E8fa733c')
      .setValue('input[placeholder="bytes32[] proposalNames"]', '["0x48656c6c6f20576f726c64210000000000000000000000000000000000000000"]')
      .click('*[data-id="Deploy - transact (not payable)"]')
      .waitForElementPresent('*[data-id="universalDappUiContractActionWrapper"]', 60000)
      .clickInstance(0)
      .clickFunction('delegate - transact (not payable)', { types: 'address to', values: '"0x4b0897b0513fdc7c541b6d9d7e929c4e5364d2db"' })
      .testFunction('last',
        {
          status: '1 Transaction mined and execution succeed',
          'decoded input': { 'address to': '0x4B0897b0513fdC7C541B6d9D7E929C4e5364D2dB' }
        })
      .clickLaunchIcon('solidity')
      .testContracts('Untitled1.sol', sources[1]['Untitled1.sol'], ['test'])
      .clickLaunchIcon('udapp')
      .clickFunction('delegate - transact (not payable)', { types: 'address to', values: '"0x4b0897b0513fdc7c541b6d9d7e929c4e5364d2db"' })
      .testFunction('last',
        {
          status: '0 Transaction mined but execution failed',
          'decoded input': { 'address to': '0x4B0897b0513fdC7C541B6d9D7E929C4e5364D2dB' }
        })
      .end()
  }
}
