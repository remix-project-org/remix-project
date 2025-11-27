'use strict'
import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

module.exports = {
  '@disabled': true,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done, 'http://127.0.0.1:8080', false)
  },

  'Should switch to ganache provider, set a custom URL and fail to connect #group1': function (browser: NightwatchBrowser) {
    browser.waitForElementVisible('div[data-id="remixIdeIconPanel"]', 10000)
      .clickLaunchIcon('udapp')
      .switchEnvironment('ganache-provider')
      .waitForElementVisible('*[data-id="ganache-providerModalDialogModalBody-react"]')

      .execute(() => {
        (document.querySelector('*[data-id="ganache-providerModalDialogModalBody-react"] input') as any).focus()
      }, [], () => { })
      .clearValue('*[data-id="ganache-providerModalDialogModalBody-react"] input')
      .setValue('*[data-id="ganache-providerModalDialogModalBody-react"] input', 'http://127.0.0.1:8084')
      .modalFooterOKClick('ganache-provider')
      .waitForElementVisible({
        locateStrategy: 'xpath',
        selector: "//span[@class='text-danger' and contains(., 'Error while querying the provider')]",
        timeout: 10000
      })
  },

  'Should switch to ganache provider, use the default ganache URL and succeed to connect #group1': function (browser: NightwatchBrowser) {
    browser
      .switchEnvironment('vm-cancun')
      .pause(2000)
      .switchEnvironment('ganache-provider')
      .waitForElementVisible('*[data-id="ganache-providerModalDialogModalBody-react"]')
      .modalFooterOKClick('ganache-provider')
      .waitForElementNotVisible('*[data-id="ganache-providerModalDialogContainer-react"]', 15000)
      .waitForElementVisible({ selector: `[data-id="selected-provider-ganache-provider"]`, timeout: 10000 })
  },

  'Should switch to foundry provider, set a custom URL and fail to connect #group1': function (browser: NightwatchBrowser) {
    browser.waitForElementVisible('div[data-id="remixIdeIconPanel"]', 10000)
      .switchEnvironment('foundry-provider')
      .waitForElementVisible('*[data-id="foundry-providerModalDialogModalBody-react"]')
      .execute(() => {
        (document.querySelector('*[data-id="foundry-providerModalDialogModalBody-react"] input') as any).focus()
      }, [], () => { })
      .clearValue('*[data-id="foundry-providerModalDialogModalBody-react"] input')
      .setValue('*[data-id="foundry-providerModalDialogModalBody-react"] input', 'http://127.0.0.1:8084')
      .modalFooterOKClick('foundry-provider')
      .pause(1000)
  },
  'Should switch to foundry provider, use the default foundry URL and succeed to connect #group1': function (browser: NightwatchBrowser) {
    browser
      .switchEnvironment('vm-cancun')
      .pause(2000)
      .switchEnvironment('foundry-provider')
      .waitForElementVisible('*[data-id="foundry-providerModalDialogModalBody-react"]', 60000)
      .modalFooterOKClick('foundry-provider')
      .waitForElementContainsText('*[data-id="settingsNetworkEnv"]', '1337) network')
  },

  'Should switch to custom provider #group2': function (browser: NightwatchBrowser) {
    browser.waitForElementVisible('div[data-id="remixIdeIconPanel"]', 10000)
      .clickLaunchIcon('udapp')
      .switchEnvironment('ganache-provider')
      .waitForElementVisible('*[data-id="ganache-providerModalDialogModalBody-react"]')

      .execute(() => {
        (document.querySelector('*[data-id="ganache-providerModalDialogModalBody-react"] input') as any).focus()
      }, [], () => { })
      .clearValue('*[data-id="ganache-providerModalDialogModalBody-react"] input')
      .setValue('*[data-id="ganache-providerModalDialogModalBody-react"] input', 'https://scroll-rpc.publicnode.com')
      .modalFooterOKClick('ganache-provider')
      .pause(1000)
      .waitForElementPresent({ selector: `[data-id="selected-provider-ganache-provider"]`, timeout: 5000 })
      .pause(1000)
  },

  'execute script #group2': function (browser: NightwatchBrowser) {
    browser.clickLaunchIcon('filePanel')
      .addFile('testScript.ts', { content: testScript })
      .clearConsole()
      .pause(10000)
      .waitForElementVisible('*[data-id="compile-action"]')
      .click('*[data-id="compile-action"]')
      .waitForElementVisible({
        locateStrategy: 'xpath',
        selector: "//span[@class='text-danger' and contains(., 'exceed maximum block range')]"
      }, 60000)
      .waitForElementPresent({ selector: `[data-id="selected-provider-ganache-provider"]`, timeout: 5000 })
  }
}


const testScript = `
// Importing necessary libraries from Ethers.js for interaction with Ethereum blockchain.
import { ethers } from "hardhat";

// https://scroll-rpc.publicnode.com
async function main() {
  // Setting up provider (RPC URL) to interact with your chosen Ethereum chain, 
  const [deployer] = await ethers.getSigners();
  
   try{
    let provider;
     if(!provider){
      provider=ethers.provider;   
       }
       
     const contractAddress = "0x2bC16Bf30435fd9B3A3E73Eb759176C77c28308D"; // Replace with your smart contract's address.
    
     // Retrieving all events of a specific kind from the blockchain
  let logs = await provider.getLogs({address:contractAddress, fromBlock: '0x332f23',toBlock: '0x384410', topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef']});
   console.log("Got Logs ",logs)
 }catch(error){
 }

}

main()`
