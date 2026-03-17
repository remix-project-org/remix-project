import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

/**
 * E2E Tests for MCP Compilation Tools via Chat Interface
 *
 * Tests compilation tools when triggered through AI chat prompts,
 * verifying that the AI can successfully compile contracts, manage compiler
 * configuration, and handle different compilation frameworks.
 *
 * Unlike mcp_compilation_tools (direct plugin), this test simulates
 * real user interaction through the chat interface.
 */

const invalidContract = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract CompilationTest {
    uint256 public value;
    address public owner;

    event ValueChanged(uint256 newValue)

    construoctor() {
        owner = msg.sender;
        value = 0;
    }

    function setValue(uint256 _newValue) public {
        require(msg.sender == owner, "Only owner can set value");
        value = _newValue;
        emit ValueChanged(_newValue);
    }

    function getValue() public view returns (uint256) {
        return value;
    }
}
`;

const tests = {
  '@disabled': true,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done)
  },

  'Setup: Enable MCP and allow file permissions #group1 #group2': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="remixIdeSidePanel"]', 10000)
      .clickLaunchIcon('filePanel')
      .removeFile('remix.config.json', '/')
      .removeFile('remix.config1.json', '/')
      .clickLaunchIcon('remixaiassistant')
      .waitForElementPresent('*[data-id="remix-ai-assistant-ready"]', 60000)
      .pause(1000)
      // Enable MCP Enhancement
      .waitForElementVisible('*[data-assist-btn="assistant-selector-btn"]', 5000)
      .click('*[data-assist-btn="assistant-selector-btn"]')
      .pause(500)
      .waitForElementVisible('#mcpEnhancementToggle', 5000)
      .execute(function () {
        const checkbox = document.getElementById('mcpEnhancementToggle') as HTMLInputElement;
        if (checkbox && !checkbox.checked) {
          checkbox.click();
        }
      })
      .pause(1000)
      // Verify MCP is enabled
      .execute(function () {
        const checkbox = document.getElementById('mcpEnhancementToggle') as HTMLInputElement;
        return { mcpEnabled: checkbox?.checked || false };
      }, [], function (result) {
        const data = result.value as any;
        browser.assert.ok(data.mcpEnabled, 'MCP Enhancement should be enabled');
      })
  },

  /**
   * Test 1: Request compiler versions
   * Verifies that AI can retrieve and display available compiler versions
   */
  'Should get compiler version #group1': function (browser: NightwatchBrowser) {
    browser
      .refresh()
      .waitForElementVisible('*[data-id="remixIdeSidePanel"]', 10000)
      .clickLaunchIcon('remixaiassistant')
      .waitForElementPresent('*[data-id="remix-ai-assistant-ready"]', 60000)
      .waitForElementVisible('*[data-id=remix-ai-prompt-input]', 5000)
      .clearValue('*[data-id=remix-ai-prompt-input]')
      .setValue('*[data-id=remix-ai-prompt-input]', 'What is the current Solidity compiler version?')
      .sendKeys('*[data-id=remix-ai-prompt-input]', browser.Keys.ENTER)
      .pause(2000)
      .waitForElementPresent({
        locateStrategy: 'xpath',
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='true']",
        timeout: 30000
      })
      .waitForElementPresent({
        locateStrategy: 'xpath',
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']",
        timeout: 60000
      })
      .pause(1000)
      .waitForElementVisible({
        locateStrategy: 'xpath',
        selector: '//div[contains(@class,"chat-bubble") and (contains(.,"version") or contains(.,"Version") or contains(.,"0.8") or contains(.,"compiler") or contains(.,"current"))]',
        timeout: 5000
      })
  },

  /**
   * Test 2: Get current compiler configuration
   */
  'Should get compiler config #group1': function (browser: NightwatchBrowser) {
    browser
      .refresh()
      .waitForElementVisible('*[data-id="remixIdeSidePanel"]', 10000)
      .clickLaunchIcon('remixaiassistant')
      .waitForElementPresent('*[data-id="remix-ai-assistant-ready"]', 60000)
      .pause(1000)
      .waitForElementVisible('*[data-id=remix-ai-prompt-input]', 5000)
      .clearValue('*[data-id=remix-ai-prompt-input]')
      .setValue('*[data-id=remix-ai-prompt-input]', 'Show me the current compiler configuration')
      .sendKeys('*[data-id=remix-ai-prompt-input]', browser.Keys.ENTER)
      .waitForElementPresent({
        locateStrategy: 'xpath',
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='true']",
        timeout: 30000
      })
      .waitForElementPresent({
        locateStrategy: 'xpath',
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']",
        timeout: 60000
      })
      .pause(1000)
      .waitForElementVisible({
        locateStrategy: 'xpath',
        selector: '//div[contains(@class,"chat-bubble") and (contains(.,"config") or contains(.,"version") or contains(.,"optimization") or contains(.,"EVM") or contains(.,"compiler"))]',
        timeout: 5000
      })
  },

  /**
   * Test 3: Set compiler configuration
   */
  'Should set compiler config #group1': function (browser: NightwatchBrowser) {
    browser
      .refresh()
      .waitForElementVisible('*[data-id="remixIdeSidePanel"]', 10000)
      .clickLaunchIcon('remixaiassistant')
      .waitForElementPresent('*[data-id="remix-ai-assistant-ready"]', 60000)
      .pause(2000)
      .waitForElementVisible('*[data-id=remix-ai-prompt-input]', 5000)
      .clearValue('*[data-id=remix-ai-prompt-input]')
      .pause(500)
      .setValue('*[data-id=remix-ai-prompt-input]', 'Set the compiler to version 0.8.20 with optimization enabled and 200 runs using paris EVM version')
      .pause(1000)
      .sendKeys('*[data-id=remix-ai-prompt-input]', browser.Keys.ENTER)
      .pause(2000)
      .waitForElementVisible({
        locateStrategy: 'xpath',
        selector: '//div[contains(@class,"chat-bubble") and (contains(.,"0.8.20") or contains(.,"optimization") or contains(.,"paris") or contains(.,"set") or contains(.,"configured"))]',
        timeout: 5000
      })
      .pause(1000)
  },

  /**
   * Test 4: Create and compile a contract
   * This test handles file write permissions and compilation
   */
  'Should create and compile contract #group2': function (browser: NightwatchBrowser) {
    browser
      .refresh()
      .waitForElementVisible('*[data-id="remixIdeSidePanel"]', 10000)
      .clickLaunchIcon('remixaiassistant')
      .waitForElementPresent('*[data-id="remix-ai-assistant-ready"]', 60000)
      .waitForElementVisible('*[data-id=remix-ai-prompt-input]', 5000)
      .clearValue('*[data-id=remix-ai-prompt-input]')
      .setValue('*[data-id=remix-ai-prompt-input]', 'Create a contract file at contracts/CompilationTest.sol with a simple storage contract that has a uint256 value and a setter function, then compile it')
      .sendKeys('*[data-id=remix-ai-prompt-input]', browser.Keys.ENTER)
      .pause(2000)
      .waitForElementVisible('*[data-id="mcp_file_write_permission_initialModalDialogContainer-react"]', 60000)
      .modalFooterOKClick("mcp_file_write_permission_initial") // Click "Allow"
      .pause(500)
      .waitForElementVisible('*[data-id="mcp_file_write_permission_scopeModalDialogContainer-react"]', 30000)
      .modalFooterCancelClick("mcp_file_write_permission_scope") // Click "All Files in Project"
      .useXpath()
      .waitForElementVisible('//button[contains(text(), "Accept All")]', 10000)
      .click('//button[contains(text(), "Accept All")]')
      .useCss()
      .pause(2000)
      .waitForElementPresent({
        locateStrategy: 'xpath',
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']",
        timeout: 60000
      })
      .pause(1000)
      .waitForElementVisible({
        locateStrategy: 'xpath',
        selector: '//div[contains(@class,"chat-bubble") and (contains(.,"created") or contains(.,"file") or contains(.,"CompilationTest"))]',
        timeout: 5000
      })
      .waitForElementVisible({
        locateStrategy: 'xpath',
        selector: '//div[contains(@class,"chat-bubble") and (contains(.,"compil") or contains(.,"success"))]',
        timeout: 5000
      })
      .pause(1000)
      .clickLaunchIcon('filePanel')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemcontracts"]', 10000)
  },

  /**
   * Test 5: Get compilation results
   */
  'Should get compilation results #group2': function (browser: NightwatchBrowser) {
    browser
      .refresh()
      .waitForElementVisible('*[data-id="remixIdeSidePanel"]', 10000)
      .waitForElementPresent('*[data-id="remix-ai-assistant-ready"]', 60000)
      .waitForElementVisible('*[data-id=remix-ai-prompt-input]', 5000)
      .clearValue('*[data-id=remix-ai-prompt-input]')
      .setValue('*[data-id=remix-ai-prompt-input]', 'Compile the contracts/CompilationTest.sol file')
      .sendKeys('*[data-id=remix-ai-prompt-input]', browser.Keys.ENTER)
      .pause(2000)
      .waitForElementPresent({
        locateStrategy: 'xpath',
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='true']",
        timeout: 30000
      })
      .waitForElementPresent({
        locateStrategy: 'xpath',
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']",
        timeout: 60000
      })
      .pause(1000)
      // Verify compilation was successful in the chat
      .waitForElementVisible({
        locateStrategy: 'xpath',
        selector: '//div[contains(@class,"chat-bubble") and (contains(.,"compil") or contains(.,"Compil"))]',
        timeout: 5000
      })
      .pause(1000)
      .clearValue('*[data-id=remix-ai-prompt-input]')
      .setValue('*[data-id=remix-ai-prompt-input]', 'Show me the last compilation result')
      .sendKeys('*[data-id=remix-ai-prompt-input]', browser.Keys.ENTER)
      .pause(3000)
      .waitForElementVisible({
        locateStrategy: 'xpath',
        selector: '//div[contains(@class,"chat-bubble") and (contains(.,"CompilationTest") or contains(.,"compilation"))]',
        timeout: 5000
      })
      .waitForElementVisible({
        locateStrategy: 'xpath',
        selector: '//div[contains(@class,"chat-bubble") and (contains(.,"success") or contains(.,"compiled") or contains(.,"contract") or contains(.,"bytecode") or contains(.,"abi"))]',
        timeout: 5000
      })
  },

  /**
   * Test 6: Compile contract with errors
   */
  'Should handle compilation errors #group2': function (browser: NightwatchBrowser) {
    browser
      .refresh()
      .waitForElementVisible('*[data-id="remixIdeSidePanel"]', 10000)
      .clickLaunchIcon('filePanel')
      .addFile('contracts/InvalidContract.sol', { content: invalidContract })
      .pause(1000)
      .clickLaunchIcon('remixaiassistant')
      .waitForElementPresent('*[data-id="remix-ai-assistant-ready"]', 60000)
      .waitForElementVisible('*[data-id=remix-ai-prompt-input]', 5000)
      .clearValue('*[data-id=remix-ai-prompt-input]')
      .setValue('*[data-id=remix-ai-prompt-input]', 'Compile the contracts/InvalidContract.sol file')
      .sendKeys('*[data-id=remix-ai-prompt-input]', browser.Keys.ENTER)
      .pause(2000)
      .waitForElementVisible({
        locateStrategy: 'xpath',
        selector: '//div[contains(@class,"chat-bubble") and (contains(.,"error") or contains(.,"Error") or contains(.,"fail") or contains(.,"invalid") or contains(.,"syntax"))]',
        timeout: 5000
      })
  },

}
console.log('module export', module.exports)

const branch = process.env.CIRCLE_BRANCH
const runTestsConditions = branch && (branch === 'master' || branch === 'remix_live' || branch.includes('remix_beta') || branch.includes('metamask'))

const checkBrowserIsChrome = function (browser: NightwatchBrowser) {
  return browser.browserName.indexOf('chrome') > -1
}

if (!checkBrowserIsChrome(browser)) {
  module.exports = {}
} else {
  module.exports = {
    ...(branch ? (runTestsConditions ? tests : {}) : tests)
  };
}

