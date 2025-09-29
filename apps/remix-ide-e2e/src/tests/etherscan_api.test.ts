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

  'Should load etherscan plugin #group1': function (browser: NightwatchBrowser) {
    browser.clickLaunchIcon('pluginManager')
      .scrollAndClick('[data-id="pluginManagerComponentActivateButtonetherscan"]')
      .clickLaunchIcon('etherscan')
      .pause(5000)
      // @ts-ignore
      .frame(0)
      .waitForElementVisible('input[name="apiKey"]')
      .setValue('input[name="apiKey"]', '2HKUX5ZVASZIKWJM8MIQVCRUVZ6JAWT531')
      .click('[data-id="save-api-key"]')
  },

  'Should verify a contract (contract is already verified) #group1': function (browser: NightwatchBrowser) {
    browser
      .frameParent()
      .clickLaunchIcon('udapp') // switch to Goerli
      .switchEnvironment('basic-http-provider')
      .waitForElementPresent('[data-id="basic-http-provider-modal-footer-ok-react"]')
      .execute(() => {
        (document.querySelector('*[data-id="basic-http-providerModalDialogContainer-react"] input[data-id="modalDialogCustomPromp"]') as any).focus()
      }, [], () => {})
      .setValue('[data-id="modalDialogCustomPromp"]', 'https://go.getblock.io/7fbe62b139884d2c9c1616ca0de8b5b2') // sepolia
      .modalFooterOKClick('basic-http-provider')
      .clickLaunchIcon('solidity') // compile
      .testContracts('Owner_1.sol', { content: verifiedContract }, ['Owner'])
      .clickLaunchIcon('etherscan') // start etherscan verification
      // @ts-ignore
      .frame(0)
      .click('[data-id="home"]')
      .setValue('select[name="contractName"]', 'Owner')
      .setValue('*[name="contractAddress"]', ['0xfF6A41815582cFD18855c5B90efD1d45784fd4f5', browser.Keys.TAB])
      .click('[data-id="verify-contract"]')
      .waitForElementVisible('[data-id="verify-result"]')
      .waitForElementContainsText('[data-id="verify-result"]', 'Contract source code already verified', 15000)
    },

    'Should call the etherscan plugin api #group1': function (browser: NightwatchBrowser) {
      browser
        .frameParent()
        .clickLaunchIcon('filePanel')
        .addFile('receiptStatusScript.ts', { content: receiptStatusScript })
        .click('*[data-id="compile-action"]') // run the script
        .waitForElementContainsText('*[data-id="terminalJournal"]', 'Already Verified', 60000)
      }
}

const branch = process.env.CIRCLE_BRANCH;
const isMasterBranch = branch === 'master';

module.exports = {
  ...{} //(branch ? (isMasterBranch ? tests : {}) : tests),
};


const verifiedContract = `
// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.7.0 <0.9.0;

/**
 * @title Owner
 * @dev Set & change owner
 */
contract Owner {

    address private owner;
    
    // event for EVM logging
    event OwnerSet(address indexed oldOwner, address indexed newOwner);
    
    // modifier to check if caller is owner
    modifier isOwner() {
        // If the first argument of 'require' evaluates to 'false', execution terminates and all
        // changes to the state and to Ether balances are reverted.
        // This used to consume all gas in old EVM versions, but not anymore.
        // It is often a good idea to use 'require' to check if functions are called correctly.
        // As a second argument, you can also provide an explanation about what went wrong.
        require(msg.sender == owner, "Caller is not owner");
        _;
    }

    function getInt() public returns (uint) {
        return 123498;
    }
    
    /**
     * @dev Set contract deployer as owner
     */
    constructor() {
        owner = msg.sender; // 'msg.sender' is sender of current call, contract deployer for a constructor
        emit OwnerSet(address(0), owner);
    }

    /**
     * @dev Change owner
     * @param newOwner address of new owner
     */
    function changeOwner(address newOwner) public isOwner {
        emit OwnerSet(owner, newOwner);
        owner = newOwner;
    }

    /**
     * @dev Return owner address 
     * @return address of owner
     */
    function getOwner() external view returns (address) {
        return owner;
    }
}`

const receiptStatusScript = `
  const receiptStatus = async () => {
    try {
        const apikey = '2HKUX5ZVASZIKWJM8MIQVCRUVZ6JAWT531'
        const ret = await remix.call('etherscan' as any,  'receiptStatus', 'tsrrzmayenrslvixnvhdv7fbbp6kk1xuqkg667aqlesblpkimt', apikey)
        console.log(ret)
    } catch (e) {
        console.log(e.message)
    }
  }
  receiptStatus()
`

/* eslint-disable */
const verifyScript = `
  const verify = async () => {
    try {
        const apikey = '2HKUX5ZVASZIKWJM8MIQVCRUVZ6JAWT531'
        const contractAddress = '0x900d15ce8fc2115c4a870107e5ea855e4243900e'
        const contractArguments = '' // hex value without 0x
        const contractName = 'Owner'
        const contractFile = 'contracts/2_Owner.sol'
        const compilationResultParam = await remix.call('compilerArtefacts' as any, 'getCompilerAbstract', contractFile)
        console.log('verifying..')
        const ret = await remix.call('etherscan' as any,  'verify', apikey, contractAddress, contractArguments, contractName, compilationResultParam)
        console.log(ret)
    } catch (e) {
        console.log(e.message)
    }
  }
  verify()
`
