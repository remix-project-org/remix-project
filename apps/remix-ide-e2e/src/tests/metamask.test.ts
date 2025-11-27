'use strict'
import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'
import examples from '../examples/example-contracts'

const passphrase = process.env.account_passphrase
const password = process.env.account_password

let extension_url = ``

const checkBrowserIsChrome = function (browser: NightwatchBrowser) {
  return browser.browserName.indexOf('chrome') > -1
}

const localsCheck = {
  to: {
    value: '0x4B0897B0513FDC7C541B6D9D7E929C4E5364D2DB',
    type: 'address'
  }
}

const tests = {
  '@disabled': false,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done)
  },

  '@sources': function () {
    return sources
  },

  'Should connect to Sepolia Test Network using MetaMask': function (browser: NightwatchBrowser) {
    console.log('Sepolia test running')

    browser//.waitForElementPresent('*[data-id="remixIdeSidePanel"]')
      .setupMetamask(passphrase, password)
      .perform(() => {
        console.log(browser.globals)
        extension_url = browser.globals.extensionUrl
      })
      .perform((browser, done) => {
        extension_url = browser.globals.extensionUrl
        console.log('✅ Got extension URL:', extension_url)

        browser
          .useCss()
          .switchBrowserTab(0)
          .refreshPage()
          .waitForElementVisible('*[data-id="remixIdeIconPanel"]', 10000)
          .clickLaunchIcon('udapp')
          .waitForElementPresent('*[data-id="settingsNetworkEnv"]')
          .switchEnvironment('injected-MetaMask')
          //.getBrowserLogs()
          .pause(3000)
          .switchBrowserTab(extension_url, true)
          //   .hideMetaMaskPopup()
          .waitForElementVisible('*[data-testid="confirm-btn"]', 60000)
          .click('*[data-testid="confirm-btn"]') // this connects the metamask account to remix
          .switchBrowserTab(0) // back to remix
          .pause(2000)
          .assert.containsText('*[data-id="settingsNetworkEnv"]', 'Sepolia (11155111) network')

        done()
      })

  },

  'Should add a contract file': function (browser: NightwatchBrowser) {
    browser.waitForElementVisible('*[data-id="remixIdeSidePanel"]')
      .clickLaunchIcon('filePanel')
      .addFile('Greet.sol', sources[0]['Greet.sol'])
      .clickLaunchIcon('udapp')
      .waitForElementVisible('*[data-id="Deploy - transact (not payable)"]', 45000) // wait for the contract to compile
  },

  'Should deploy contract on Sepolia Test Network using MetaMask': function (browser: NightwatchBrowser) {
    browser.clearConsole().waitForElementPresent('*[data-id="runTabSelectAccount"]', 45000)
      .clickLaunchIcon('filePanel')
      .openFile('Greet.sol')
      .clickLaunchIcon('udapp')
      .waitForElementPresent('*[data-id="Deploy - transact (not payable)"]')
      .click('*[data-id="Deploy - transact (not payable)"]')
      .pause(1000)
      .clearConsole()
      .switchBrowserTab(extension_url, true)
      .waitForElementVisible('[data-testid="confirm-footer-button"]')
      .click('[data-testid="confirm-footer-button"]') // approve the tx
      .switchBrowserTab(0) // back to remix
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'view on Etherscan view on Blockscout', 60000)
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'from: 0x76a...2708f', 60000)
  },
  'Should run low level interaction (fallback function) on Sepolia Test Network using MetaMask': function (browser: NightwatchBrowser) {
    browser.clearConsole().waitForElementPresent('*[data-id="remixIdeSidePanel"]')
      .clickInstance(0)
      .clearConsole()
      .waitForElementPresent('*[data-id="pluginManagerSettingsDeployAndRunLLTxSendTransaction"]')
      .click('*[data-id="pluginManagerSettingsDeployAndRunLLTxSendTransaction"]')
      .pause(1000)
      .switchBrowserTab(extension_url, true)

      .waitForElementVisible('[data-testid="confirm-footer-button"]')
      .scrollAndClick('[data-testid="confirm-footer-button"]')
      .switchBrowserTab(0) // back to remix
      .waitForElementVisible({
        locateStrategy: 'xpath',
        selector: "//span[@class='text-log' and contains(., 'transact to HelloWorld.(fallback) pending')]"
      })
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'view on Etherscan view on Blockscout', 60000)
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'from: 0x76a...2708f', 60000)
  },
  'Should run transaction (greet function) on Sepolia Test Network using MetaMask': function (browser: NightwatchBrowser) {
    browser.clearConsole().waitForElementPresent('*[data-id="remixIdeSidePanel"]')
      .clearConsole()
      .waitForElementPresent('*[data-bs-title="string _message"]')
      .setValue('*[data-bs-title="string _message"]', 'test')
      .waitForElementVisible('*[data-id="greet - transact (not payable)"]')
      .click('*[data-id="greet - transact (not payable)"]')
      .pause(1000)
      .switchBrowserTab(extension_url, true)
      .waitForElementVisible('[data-testid="confirm-footer-button"]')
      .scrollAndClick('[data-testid="confirm-footer-button"]')
      .switchBrowserTab(0) // back to remix
      .waitForElementVisible({
        locateStrategy: 'xpath',
        selector: "//span[@class='text-log' and contains(., 'transact to HelloWorld.greet pending')]"
      })
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'view on Etherscan view on Blockscout', 60000)
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'from: 0x76a...2708f', 60000)
  },

  'Should deploy faulty contract on Sepolia Test Network using MetaMask and show error in terminal': function (browser: NightwatchBrowser) {
    browser
      .clearConsole()
      .clickLaunchIcon('filePanel')
      .addFile('faulty.sol', sources[0]['faulty.sol'])
      .clickLaunchIcon('udapp')
      .waitForElementPresent('*[data-id="Deploy - transact (not payable)"]')
      .click('*[data-id="Deploy - transact (not payable)"]')
      .waitForElementVisible('*[data-id="udappNotifyModalDialogModalBody-react"]', 60000)
      .click('[data-id="udappNotify-modal-footer-cancel-react"]')
      .waitForElementVisible({
        locateStrategy: 'xpath',
        selector: "//span[@class='text-log' and contains(., 'errored')]"
      })
  },
  'Should deploy contract on Sepolia Test Network using MetaMask again': function (browser: NightwatchBrowser) {
    browser.clearConsole().waitForElementPresent('*[data-id="runTabSelectAccount"]', 45000)
      .clickLaunchIcon('filePanel')
      .openFile('Greet.sol')
      .clickLaunchIcon('udapp')
      .waitForElementPresent('*[data-id="Deploy - transact (not payable)"]')
      .click('*[data-id="Deploy - transact (not payable)"]')
      .pause(1000)
      .clearConsole()
      .switchBrowserTab(extension_url, true)
      .waitForElementPresent('[data-testid="confirm-footer-button"]')
      .click('[data-testid="confirm-footer-button"]') // approve the tx
      .switchBrowserTab(0) // back to remix
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'view on Etherscan view on Blockscout', 60000)
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'from: 0x76a...2708f', 60000)
  },


  // debug transaction
  'Should deploy Ballot to Sepolia using metamask': function (browser: NightwatchBrowser) {
    browser.waitForElementPresent('*[data-id="remixIdeSidePanel"]')

      .addFile('BallotTest.sol', examples.ballot)

      .clearConsole()
      .clearTransactions()
      .waitForElementVisible('input[placeholder="bytes32[] proposalNames"]')
      .pause(2000)
      .setValue('input[placeholder="bytes32[] proposalNames"]', '["0x48656c6c6f20576f726c64210000000000000000000000000000000000000000"]')
      .pause(1000)
      .click('*[data-id="Deploy - transact (not payable)"]') // deploy ballot
      .pause(1000)
      .waitForElementVisible({
        locateStrategy: 'xpath',
        selector: "//span[@class='text-log' and contains(., 'creation of')]"
      })
      .waitForElementVisible({
        locateStrategy: 'xpath',
        selector: "//span[@class='text-log' and contains(., 'pending')]"
      })
      .switchBrowserTab(extension_url, true)
      .waitForElementVisible('[data-testid="confirm-footer-button"]')
      .scrollAndClick('[data-testid="confirm-footer-button"]')
      .pause(2000)
      .switchBrowserTab(0) // back to remix
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'view on Etherscan view on Blockscout', 60000)
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'from: 0x76a...2708f', 60000)
  },

  'do transaction': function (browser: NightwatchBrowser) {
    browser.waitForElementPresent('*[data-id="universalDappUiContractActionWrapper"]', 60000)
      .clearConsole()
      .clickInstance(0)
      .clickInstance(1)
      .clickFunction('delegate - transact (not payable)', { types: 'address to', values: '"0x4b0897b0513fdc7c541b6d9d7e929c4e5364d2db"' })
      .switchBrowserTab(extension_url, true)
      .waitForElementPresent('[data-testid="confirm-footer-button"]')
      .scrollAndClick('[data-testid="confirm-footer-button"]')
      .switchBrowserTab(0) // back to remix
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'view on Etherscan view on Blockscout', 60000)
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'from: 0x76a...2708f', 60000)

      .testFunction('last',
        {
          status: '1 Transaction mined and execution succeed',
          'decoded input': { 'address to': '0x4B0897b0513fdC7C541B6d9D7E929C4e5364D2dB' }
        })
  },
  'Should debug Sepolia transaction with source highlighting MetaMask': function (browser: NightwatchBrowser) {
    let txhash
    browser.waitForElementVisible('*[data-id="remixIdeIconPanel"]', 10000)
      .clickLaunchIcon('pluginManager') // load debugger and source verification
      .clickLaunchIcon('udapp')
      .perform((done) => {
        browser.getLastTransactionHash((hash) => {
          txhash = hash
          done()
        })
      })
      .pause(5000)
      .perform((done) => {
        browser
          .waitForElementVisible('*[data-id="remixIdeIconPanel"]', 10000)
          .clickLaunchIcon('debugger')
          .waitForElementVisible('*[data-id="debuggerTransactionInput"]')
          .setValue('*[data-id="debuggerTransactionInput"]', txhash) // debug tx
          .pause(2000)
          .click('*[data-id="debuggerTransactionStartButton"]')
          .waitForElementVisible('*[data-id="treeViewDivto"]', 30000)
          .checkVariableDebug('soliditylocals', localsCheck)
          .perform(() => done())
      })

  },
  'Call web3.eth.getAccounts() using Injected Provider (Metamask)': function (browser: NightwatchBrowser) {
    if (!checkBrowserIsChrome(browser)) return
    browser
      .executeScriptInTerminal('web3.eth.getAccounts()')
      .journalLastChildIncludes('["0x76a3ABb5a12dcd603B52Ed22195dED17ee82708f"]')
  },
  // EIP 712 tests
  'Test EIP 712 Signature with Injected Provider (Metamask)': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('udapp')
      .waitForElementPresent('i[id="remixRunSignMsg"]')
      .click('i[id="remixRunSignMsg"]')
      .waitForElementVisible('*[data-id="signMessageTextarea"]', 120000)
      .click('*[data-id="sign-eip-712"]')
      .waitForElementVisible('*[data-id="udappNotify-modal-footer-ok-react"]')
      .modalFooterOKClick('udappNotify')
      .pause(1000)
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf('"primaryType": "AuthRequest",') !== -1, 'EIP 712 data file must be opened')
      })
      .setEditorValue(JSON.stringify(EIP712_Example, null, '\t'))
      .pause(5000)
      .clickLaunchIcon('filePanel')
      .rightClick('li[data-id="treeViewLitreeViewItemEIP-712-data.json"]')
      .click('*[data-id="contextMenuItemsignTypedData"]')
      .pause(1000)
      .switchBrowserTab(extension_url, true)
      .waitForElementPresent('[data-testid="confirm-footer-button"]')
      .scrollAndClick('button[data-testid="confirm-footer-button"]') // confirm
      .switchBrowserTab(0) // back to remix
      .pause(1000)
      .journalChildIncludes('0xec72bbabeb47a3a766af449674a45a91a6e94e35ebf0ae3c644b66def7bd387f1c0b34d970c9f4a1e9398535e5860b35e82b2a8931b7c9046b7766a53e66db3d1b')
  },
  'Should add and run sendETH script on Sepolia using MetaMask': function (browser: NightwatchBrowser) {
    browser
      .waitForElementPresent('*[data-id="remixIdeSidePanel"]')
      .clickLaunchIcon('filePanel')
      .addFile('sendETH.ts', { content: sendETHExample })
      .openFile('sendETH.ts')
      .pause(2000)
      .clearConsole()
      .rightClick('li[data-id="treeViewLitreeViewItemsendETH.ts"]')
      .waitForElementVisible('*[id="menuitemrun"]')
      .click('*[id="menuitemrun"]')
      .pause(2000)
      .switchBrowserTab(extension_url, true)
      .waitForElementPresent('[data-testid="confirm-footer-button"]', 60000)
      .scrollAndClick('[data-testid="confirm-footer-button"]')
      .switchBrowserTab(0) // back to remix
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'Transaction confirmed for', 120000)
  }  // main network tests
  , 'Should connect to Ethereum Main Network using MetaMask': function (browser: NightwatchBrowser) {
    browser.waitForElementPresent('*[data-id="remixIdeSidePanel"]')
      .execute((done) => {
        // @ts-ignore
        window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0x1' }]
        });
      })
      .refreshPage()
      .waitForElementVisible('*[data-id="remixIdeIconPanel"]', 10000)
      .clickLaunchIcon('udapp')
      .switchEnvironment('injected-MetaMask')
      .waitForElementPresent('*[data-id="settingsNetworkEnv"]')
      .assert.containsText('*[data-id="settingsNetworkEnv"]', 'Main (1) network')


  },

  'Should deploy contract on Ethereum Main Network using MetaMask2': function (browser: NightwatchBrowser) {
    browser.waitForElementPresent('*[data-id="runTabSelectAccount"]')
      .clickLaunchIcon('filePanel')
      .addFile('Greet.sol', sources[0]['Greet.sol'])
      .clickLaunchIcon('udapp')
      .waitForElementPresent('*[data-id="Deploy - transact (not payable)"]')
      .click('*[data-id="Deploy - transact (not payable)"]')
      .waitForElementVisible('*[data-id="udappNotifyModalDialogModalBody-react"]', 65000)
      .modalFooterOKClick('udappNotify')
      .pause(10000)
      .assert.containsText('*[data-id="udappNotifyModalDialogModalBody-react"]', 'You are about to create a transaction on Main Network. Confirm the details to send the info to your provider.')
      .modalFooterCancelClick('udappNotify')
  },
}

const branch = process.env.CIRCLE_BRANCH
const runTestsConditions = branch && (branch === 'master' || branch === 'remix_live' || branch.includes('remix_beta') || branch.includes('metamask'))

// if (!checkBrowserIsChrome(browser)) {
  module.exports = {}
// } else {
//   module.exports = {
//     ...(branch ? (runTestsConditions ? tests : {}) : tests)
//   };
// }

const EIP712_Example = {
  domain: {
    chainId: 11155111,
    name: "Example App",
    verifyingContract: "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC",
    version: "1",
  },
  message: {
    prompt: "Welcome! In order to authenticate to this website, sign this request and your public address will be sent to the server in a verifiable way.",
    createdAt: 1718570375196,
  },
  primaryType: 'AuthRequest',
  types: {
    EIP712Domain: [
      { name: 'name', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' },
      { name: 'verifyingContract', type: 'address' },
    ],
    AuthRequest: [
      { name: 'prompt', type: 'string' },
      { name: 'createdAt', type: 'uint256' },
    ],
  },
}

const sendETHExample = `
"use strict"

import { ethers } from "ethers"

async function sendEth() {
    // Replace these with actual recipient addresses
    const recipientAddresses = [
        "0xefeaf7647997cc11ae1f99f6add557fa9d70a552"
    ];

    // Amount of ETH to send (0.05 ETH in wei)
    const amount = ethers.parseEther("0.005");

    // Get provider and signer from Remix environment
    const provider = new ethers.BrowserProvider(web3Provider);
    const signer = await provider.getSigner();

    // Send ETH to each address
    for (const address of recipientAddresses) {
      
        try {
            const tx = await signer.sendTransaction({
                to: address,
                value: amount
            });
            await tx.wait();
            console.log("Transaction confirmed for");
        } catch (error) {
            console.error("Failed to send to ");
        }
    }
}

sendEth().catch(console.error);
`

const sources = [
  {
    'Greet.sol': {
      content:
        `
      pragma solidity ^0.8.0;
      contract HelloWorld {
          string public message;

          fallback () external {
              message = 'Hello World!';
          }

          function greet(string memory _message) public {
              message = _message;
          }
      }`
    },
    'faulty.sol': {
      content: `// SPDX-License-Identifier: GPL-3.0

      pragma solidity >=0.8.2 <0.9.0;

      contract Test {
          error O_o(uint256);
          constructor() {
              revert O_o(block.timestamp);
          }
      }`
    }
  }
]
