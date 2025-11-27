'use strict'

import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'
import examples from '../examples/example-contracts'

const sources = [
  { 'Untitled.sol': { content: examples.ballot_0_4_11.content } }
]

module.exports = {
  '@disabled': true,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done)
  },
  '@sources': function () {
    return sources
  },

  'Set Ballot 0.4.14': function (browser: NightwatchBrowser) {
    browser
      .setSolidityCompilerVersion('soljson-v0.4.14+commit.c2215d46.js')
  },

  'Add Ballot': function (browser: NightwatchBrowser) {
    browser
      .addFile('Untitled.sol', sources[0]['Untitled.sol'])
  },

  'Compile Ballot with compiler version 0.4.14': function (browser: NightwatchBrowser) {
    browser
      .testContracts('Untitled.sol', sources[0]['Untitled.sol'], ['Ballot'])
  },

  'Deploy Ballot #group1': function (browser: NightwatchBrowser) {
    browser.pause(500)
      .clickLaunchIcon('udapp')
      .selectAccount('0xCA35b7d915458EF540aDe6068dFe2F44E8fa733c')
      .setValue('input[placeholder="uint8 _numProposals"]', '2')
      .click('*[data-id="Deploy - transact (not payable)"]')
      .waitForElementPresent('*[data-id="universalDappUiContractActionWrapper"]', 60000)
      .clickInstance(0)
      .clickFunction('delegate - transact (not payable)', { types: 'address to', values: '"0x4b0897b0513fdc7c541b6d9d7e929c4e5364d2db"' })
      .testFunction('last',
        {
          status: '1 Transaction mined and execution succeed',
          'decoded input': { 'address to': '0x4B0897b0513fdC7C541B6d9D7E929C4e5364D2dB' }
        })
  },

  'Debug Ballot / delegate #group1': function (browser: NightwatchBrowser) {
    browser.pause(500)
      .debugTransaction(1)
      .pause(2000)
      // .waitForElementVisible('*[data-id="buttonNavigatorJumpPreviousBreakpoint"]')
      // .click('*[data-id="buttonNavigatorJumpPreviousBreakpoint"]') That button is disabled
      .waitForElementVisible('#stepdetail')
      .goToVMTraceStep(20)
      .pause(1000)
      .checkVariableDebug('callstackpanel', ['0x692a70D2e424a56D2C6C27aA97D1a86395877b3A'])
  },

  'Access Ballot via at address #group1': function (browser: NightwatchBrowser) {
    browser.clickLaunchIcon('udapp')
      .click('*[data-id="universalDappUiUdappClose"]')
      .addFile('ballot.abi', { content: ballotABI })
      .clickLaunchIcon('udapp')
      .click({
        selector: '*[data-id="deployAndRunClearInstances"]',
        abortOnFailure: false,
        suppressNotFoundErrors: true,
      })
      // we are not changing the visibility for not checksummed contracts
      // .addAtAddressInstance('0x692a70D2e424a56D2C6C27aA97D1a86395877b3B', true, false)
      .clickLaunchIcon('filePanel')
      .addAtAddressInstance('0x692a70D2e424a56D2C6C27aA97D1a86395877b3A', true, true)
      .waitForElementVisible({
        locateStrategy: 'xpath',
        selector: "//*[@id='instance0x692a70D2e424a56D2C6C27aA97D1a86395877b3A']"
      })
      .clickInstance(0)
      .clickFunction('delegate - transact (not payable)', { types: 'address to', values: '"0x4b0897b0513fdc7c541b6d9d7e929c4e5364d2db"' })
      .testFunction('last',
        {
          status: '1 Transaction mined and execution succeed',
          'decoded input': { 'address to': '0x4B0897b0513fdC7C541B6d9D7E929C4e5364D2dB' }
        })
  },
  'Deploy and use Ballot using external web3 #group2': function (browser: NightwatchBrowser) {
    browser

      .clickLaunchIcon('udapp')
      .connectToExternalHttpProvider('http://localhost:8545', 'Custom')
      .clickLaunchIcon('solidity')
      .clickLaunchIcon('udapp')
      .createContract('2')
      .clickInstance(0)
      .click('*[data-id="terminalClearConsole"]')
      .clickFunction('delegate - transact (not payable)', { types: 'address to', values: '0xCA35b7d915458EF540aDe6068dFe2F44E8fa733c' })
      .journalLastChildIncludes('Ballot.delegate(address)')
      .journalLastChildIncludes('data: 0x5c1...a733c')
  }
}

const ballotABI = `[
  {
    "constant": false,
    "inputs": [
      {
        "name": "to",
        "type": "address"
      }
    ],
    "name": "delegate",
    "outputs": [],
    "payable": false,
    "type": "function",
    "stateMutability": "nonpayable"
  },
  {
    "constant": false,
    "inputs": [],
    "name": "winningProposal",
    "outputs": [
      {
        "name": "_winningProposal",
        "type": "uint8"
      }
    ],
    "payable": false,
    "type": "function",
    "stateMutability": "nonpayable"
  },
  {
    "constant": false,
    "inputs": [
      {
        "name": "toVoter",
        "type": "address"
      }
    ],
    "name": "giveRightToVote",
    "outputs": [],
    "payable": false,
    "type": "function",
    "stateMutability": "nonpayable"
  },
  {
    "constant": false,
    "inputs": [
      {
        "name": "toProposal",
        "type": "uint8"
      }
    ],
    "name": "vote",
    "outputs": [],
    "payable": false,
    "type": "function",
    "stateMutability": "nonpayable"
  },
  {
    "inputs": [
      {
        "name": "_numProposals",
        "type": "uint8"
      }
    ],
    "payable": false,
    "type": "constructor",
    "stateMutability": "nonpayable"
  }
]`
