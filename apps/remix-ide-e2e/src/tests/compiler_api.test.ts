'use strict'

import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'
import examples from '../examples/example-contracts'

const sources = [
  { 'Untitled.sol': { content: examples.ballot.content } }
]

module.exports = {
  '@disabled': true,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done)
  },

  '@sources': function () {
    return sources
  },

  'Should compile using "compileWithParameters" API #group1': function (browser: NightwatchBrowser) {
    browser
      .addFile('test_jsCompile.js', { content: jsCompile })
      .executeScriptInTerminal('remix.exeCurrent()')
      .waitForElementContainsText('*[data-id="terminalJournal"]', '"languageversion":"0.6.8+commit.0bbfe453"', 60000)
      .click('*[data-id="terminalClearConsole"]')
  },

  'Should compile using "compileWithParameters" API with optimization On #group2': function (browser: NightwatchBrowser) {
    browser
      .addFile('test_jsCompileWithOptimization.js', { content: jsCompileWithOptimization })
      .executeScriptInTerminal('remix.exeCurrent()')
      .waitForElementContainsText('*[data-id="terminalJournal"]', '\\"optimizer\\":{\\"enabled\\":true,\\"runs\\":300}', 60000)
      .click('*[data-id="terminalClearConsole"]')
  },

  'Should compile using "compileWithParameters" API with optimization off check default runs #group3': function (browser: NightwatchBrowser) {
    browser
      .addFile('test_jsCompileWithOptimizationDefault.js', { content: jsCompileWithOptimizationDefault })
      .executeScriptInTerminal('remix.exeCurrent()')
      .waitForElementContainsText('*[data-id="terminalJournal"]', '\\"optimizer\\":{\\"enabled\\":false,\\"runs\\":200}', 60000)
      .click('*[data-id="terminalClearConsole"]')
  },

  'Should update the compiler configuration with "setCompilerConfig" API #group4': function (browser: NightwatchBrowser) {
    browser
      .addFile('test_updateConfiguration.js', { content: updateConfiguration })
      .executeScriptInTerminal('remix.exeCurrent()')
      .pause(15000)
      .addFile('test_updateConfiguration.sol', { content: simpleContract })
      .verifyContracts(['StorageTestUpdateConfiguration'], { wait: 5000, version: '0.6.8+commit.0bbfe453' })
  },

  'Should produce a stack too deep error #group5': function (browser: NightwatchBrowser) {
    browser
      .setSolidityCompilerVersion('soljson-v0.8.1+commit.df193b15.js')
      .addFile('ContractStackLimit.sol', { content: contractStackLimit })
      .clickLaunchIcon('solidity')
      .waitForElementContainsText('*[data-id="compiledErrors"]', 'CompilerError: Stack too deep when compiling inline assembly: Variable headStart is 1 slot(s) too deep inside the stack.', 60000)
  },

  'Should compile Yul contract and get no remapping errors #group1': function (browser: NightwatchBrowser) {
    browser
      .addFile('yulTest.yul', { content: yulTest })
      .clickLaunchIcon('solidity')
      .waitForElementVisible('*[data-id="scConfigExpander"]')
      .click('*[data-id="scConfigExpander"]')
      .waitForElementVisible('*[id="compilerLanguageSelectorWrapper"]')
      .waitForElementVisible('*[id="compilerLanguageSelector"]')
      .click('*[id="compilerLanguageSelector"]')
      .waitForElementVisible('*[data-sol-lang="yul"]')
      .click('*[data-sol-lang="yul"]')
      .pause(500)
      .click('*[data-id="scConfigExpander"]')
      .clickLaunchIcon('filePanel')
      .waitForElementVisible('*[data-id="treeViewDivtreeViewItemyulTest.yul"]')
      .click('*[data-id="treeViewDivtreeViewItemyulTest.yul"]')
      .waitForElementVisible('*[data-id="compile-action"]')
      .click('*[data-id="compile-action"]')
      .waitForElementVisible('#verticalIconsKindsolidity > i.remixui_status.fas.fa-check-circle.text-success.remixui_statusCheck')
      .end()
  }
}

const simpleContract = `pragma solidity >=0.4.22 <0.9.1;

/**
* @title Storage
* @dev Store & retrieve value in a variable
*/
contract StorageTestUpdateConfiguration {

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
}

          `

const jsCompile = `(async () => {

  try {
      const contract = {
          "storage.sol": {content : \`${simpleContract}\` }
      }
      console.log('compile')
      const params = {
          optimize: false,
          evmVersion: null,
          language: 'Solidity',
          version: '0.6.8+commit.0bbfe453'
      }
      const result = await remix.call('solidity', 'compileWithParameters', contract, params)
      console.log('result ', result)
  } catch (e) {
      console.log(e.message)
  }
})()`

const jsCompileWithOptimization = `(async () => {
  try {
      const contract = {
          "storage.sol": {content : \`${simpleContract}\` }
      }
      console.log('compile')
      const params = {
          optimize: true,
          runs: 300,
          evmVersion: null,
          language: 'Solidity',
          version: '0.6.8+commit.0bbfe453'
      }
      const result = await remix.call('solidity', 'compileWithParameters', contract, params)
      console.log('result ', result)
  } catch (e) {
      console.log(e.message)
  }
})()`

const jsCompileWithOptimizationDefault = `(async () => {
  try {
      const contract = {
          "storage.sol": {content : \`${simpleContract}\` }
      }
      console.log('compile')
      const params = {
          optimize: false,
      }
      const result = await remix.call('solidity', 'compileWithParameters', contract, params)
      console.log('result ', result)
  } catch (e) {
      console.log(e.message)
  }
})()`

const updateConfiguration = `(async () => {
  try {
      const params = {
          optimize: false,
          evmVersion: null,
          language: 'Solidity',
          version: '0.6.8+commit.0bbfe453'
      }
      await remix.call('solidity', 'setCompilerConfig', params)
  } catch (e) {
      console.log(e.message)
  }
})()`

const contractStackLimit = `
//SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.9.1;
contract DoesNotCompile {
    uint u;
    function fStackLimit(uint u1, uint u2, uint u3, uint u4, uint u5, uint u6, uint u7, uint u8, uint u9, uint u10, uint u11, uint u12) public {
    }
}`

const yulTest = `
object "Addition" {
    code {
        datacopy(0, dataoffset("runtime"), datasize("runtime"))
        return(0, datasize("runtime"))
    }
    object "runtime" {
        code {
            // Read two 32-byte numbers from calldata
            let a := calldataload(0)
            let b := calldataload(32)

            // Add them
            let result := add(a, b)

            // Store result in memory and return it
            mstore(0, result)
            return(0, 32)
        }
    }
}`
