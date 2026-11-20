'use strict'

import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'
import examples from '../examples/example-contracts'

const sources = [
  { 'Untitled.sol': { content: examples.ballot.content } }
]

module.exports = {
  "@disabled": true,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done)
  },
  '@sources': function () {
    return sources
  },
  'Add Ballot for Monad VM #group1': function (browser: NightwatchBrowser) {
    browser
      .addFile('Untitled.sol', sources[0]['Untitled.sol'])
  },
  'Deploy Ballot on Monad VM #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="remixIdeIconPanel"]', 10000)
      .clickLaunchIcon('solidity')
      .testContracts('Untitled.sol', sources[0]['Untitled.sol'], ['Ballot'])
      .clickLaunchIcon('udapp')
      .switchEnvironment('vm-monad-ten', 'Monad_VM')
      .selectAccount('0xCA35b7d915458EF540aDe6068dFe2F44E8fa733c')
      .createContract('["0x48656c6c6f20576f726c64210000000000000000000000000000000000000000"]')
      .clickInstance(0)
      .clickFunction(0, 0, ['"0x4b0897b0513fdc7c541b6d9d7e929c4e5364d2db"'])
      .testFunction('last',
        {
          status: '1 Transaction mined and execution completed',
          'decoded input': { 'address to': '0x4B0897b0513fdC7C541B6d9D7E929C4e5364D2dB' }
        })
  },

  'Call method from Ballot to check return value on Monad VM #group1': function (browser: NightwatchBrowser) {
    browser
      .clickFunction(0, 6)
      // Test in terminal - check that it's calling Ballot.winnerName()
      .journalLastChildIncludes('Ballot.winnerName()')
      .testFunction('last',
        {
          'decoded output': { 0: 'bytes32: winnerName_ 0x48656c6c6f20576f726c64210000000000000000000000000000000000000000' }
        })
      // Test in Udapp UI , treeViewDiv0 shows returned value on method click
      .assert.containsText('*[data-id="treeViewDiv0"]', 'bytes32: winnerName_ 0x48656c6c6f20576f726c64210000000000000000000000000000000000000000')
  },

  'Access Ballot via at address on Monad VM #group1': function (browser: NightwatchBrowser) {
    let ballotAddress: string
    browser
      .perform((done: VoidFunction) => {
        browser.getAddressAtPosition(0, (address) => {
          ballotAddress = address
          done()
        })
      })
      .perform(() => {
        browser
          .addFile('ballot.abi', { content: ballotABI })
          .clearDeployedContracts()
          .clickLaunchIcon('filePanel')
          .addAtAddressInstance(ballotAddress, true, true)
          .waitForElementVisible({
            locateStrategy: 'xpath',
            selector: `//*[@id='instance${ballotAddress}']`
          })
          .clickInstance(0)
          .clickFunction(0, 1, ['"0x4b0897b0513fdc7c541b6d9d7e929c4e5364d2db"'])
          .testFunction('last',
            {
              status: '0 Transaction mined but execution failed',
              'decoded input': { 'address to': '0x4B0897b0513fdC7C541B6d9D7E929C4e5364D2dB' }
            })
          .end()
      })
  }
}

const ballotABI = `[
{
  "inputs": [
    {
      "internalType": "bytes32[]",
      "name": "proposalNames",
      "type": "bytes32[]"
    }
  ],
  "payable": false,
  "stateMutability": "nonpayable",
  "type": "constructor"
},
{
  "constant": true,
  "inputs": [],
  "name": "chairperson",
  "outputs": [
    {
      "internalType": "address",
      "name": "",
      "type": "address"
    }
  ],
  "payable": false,
  "stateMutability": "view",
  "type": "function"
},
{
  "constant": false,
  "inputs": [
    {
      "internalType": "address",
      "name": "to",
      "type": "address"
    }
  ],
  "name": "delegate",
  "outputs": [],
  "payable": false,
  "stateMutability": "nonpayable",
  "type": "function"
},
{
  "constant": false,
  "inputs": [
    {
      "internalType": "address",
      "name": "voter",
      "type": "address"
    }
  ],
  "name": "giveRightToVote",
  "outputs": [],
  "payable": false,
  "stateMutability": "nonpayable",
  "type": "function"
},
{
  "constant": true,
  "inputs": [
    {
      "internalType": "uint256",
      "name": "",
      "type": "uint256"
    }
  ],
  "name": "proposals",
  "outputs": [
    {
      "internalType": "bytes32",
      "name": "name",
      "type": "bytes32"
    },
    {
      "internalType": "uint256",
      "name": "voteCount",
      "type": "uint256"
    }
  ],
  "payable": false,
  "stateMutability": "view",
  "type": "function"
},
{
  "constant": false,
  "inputs": [
    {
      "internalType": "uint256",
      "name": "proposal",
      "type": "uint256"
    }
  ],
  "name": "vote",
  "outputs": [],
  "payable": false,
  "stateMutability": "nonpayable",
  "type": "function"
},
{
  "constant": true,
  "inputs": [
    {
      "internalType": "address",
      "name": "",
      "type": "address"
    }
  ],
  "name": "voters",
  "outputs": [
    {
      "internalType": "uint256",
      "name": "weight",
      "type": "uint256"
    },
    {
      "internalType": "bool",
      "name": "voted",
      "type": "bool"
    },
    {
      "internalType": "address",
      "name": "delegate",
      "type": "address"
    },
    {
      "internalType": "uint256",
      "name": "vote",
      "type": "uint256"
    }
  ],
  "payable": false,
  "stateMutability": "view",
  "type": "function"
},
{
  "constant": true,
  "inputs": [],
  "name": "winnerName",
  "outputs": [
    {
      "internalType": "bytes32",
      "name": "winnerName_",
      "type": "bytes32"
    }
  ],
  "payable": false,
  "stateMutability": "view",
  "type": "function"
},
{
  "constant": true,
  "inputs": [],
  "name": "winningProposal",
  "outputs": [
    {
      "internalType": "uint256",
      "name": "winningProposal_",
      "type": "uint256"
    }
  ],
  "payable": false,
  "stateMutability": "view",
  "type": "function"
}
]`
