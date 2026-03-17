'use strict'

import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

/**
 * E2E Tests for MCP File Write Permissions via Chat Interface
 *
 * Tests the file write permission system when triggered through AI chat prompts,
 * verifying that users are prompted before allowing the AI to write or create files.
 *
 * Unlike mcp_file_permissions.test.ts which uses direct plugin access,
 * this test simulates real user interaction through the chat interface.
 */

const tests = {
  '@disabled': true,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done)
  },

  'Setup: mistralAI Assistant and enable MCP #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="remixIdeSidePanel"]', 10000)
      .clickLaunchIcon('filePanel')
      .removeFile('remix.config.json', '/')
      .removeFile('remix.config1.json', '/')
      .clickLaunchIcon('remixaiassistant')
      .waitForElementPresent('*[data-id="remix-ai-assistant-ready"]', 60000)
      .pause(1000)
      // Click the model selector button to open the model menu
      .waitForElementVisible('*[data-assist-btn="assistant-selector-btn"]', 5000)
      .click('*[data-assist-btn="assistant-selector-btn"]')
      .pause(500)
      // Enable MCP Enhancement checkbox
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
   * Test 1: Chat prompt requesting file creation shows permission modal
   * Verifies that when AI attempts to create a file via MCP, the permission modal appears
   */
  'Should show permission modal when AI creates file via chat #group1': function (browser: NightwatchBrowser) {
    browser
      .refresh()
      .waitForElementVisible('*[data-id="remixIdeSidePanel"]', 10000)
      .clickLaunchIcon('remixaiassistant')
      .waitForElementPresent('*[data-id="remix-ai-assistant-ready"]', 60000)
      .pause(1000)
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
      .pause(500)
      .waitForElementVisible('*[data-id=remix-ai-prompt-input]', 5000)
      .clearValue('*[data-id=remix-ai-prompt-input]')
      .setValue('*[data-id=remix-ai-prompt-input]', 'Create a file called hello.txt with content "Hello World"')
      .sendKeys('*[data-id=remix-ai-prompt-input]', browser.Keys.ENTER)
      .pause(2000)
      .waitForElementPresent({
        locateStrategy: 'xpath',
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='true']",
        timeout: 30000
      })
      .waitForElementVisible('*[data-id="mcp_file_write_permission_initialModalDialogContainer-react"]', 60000)
      .waitForElementContainsText('*[data-id="mcp_file_write_permission_initialModalDialogContainer-react"]', 'File Write Permission Required', 5000)
      .assert.containsText('*[data-id="mcp_file_write_permission_initialModalDialogContainer-react"]', 'hello.txt')
      .assert.containsText('*[data-id="mcp_file_write_permission_initialModalDialogContainer-react"]', 'Allow')
      .assert.containsText('*[data-id="mcp_file_write_permission_initialModalDialogContainer-react"]', 'Deny')
  },

  /**
   * Test 2: Allow + "Just This File" creates allow-specific mode via chat
   */
  'Should allow write for specific file only via chat #group1': function (browser: NightwatchBrowser) {
    browser
      .refresh()
      .waitForElementVisible('*[data-id="remixIdeSidePanel"]', 10000)
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemremix.config.json"]', 5000)
      .removeFile('remix.config.json', '/')
      .refresh()
      .waitForElementVisible('*[data-id="remixIdeSidePanel"]', 10000)
      .clickLaunchIcon('remixaiassistant')
      .waitForElementPresent('*[data-id="remix-ai-assistant-ready"]', 60000)
      .pause(1000)
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
      .pause(500)
      .waitForElementVisible('*[data-id=remix-ai-prompt-input]', 5000)
      .clearValue('*[data-id=remix-ai-prompt-input]')
      .setValue('*[data-id=remix-ai-prompt-input]', 'Create a file named specific.txt with the content "Specific test"')
      .sendKeys('*[data-id=remix-ai-prompt-input]', browser.Keys.ENTER)
      .pause(2000)
      // Wait for permission modal
      .waitForElementVisible('*[data-id="mcp_file_write_permission_initialModalDialogContainer-react"]', 60000)
      .modalFooterOKClick("mcp_file_write_permission_initial") // Click "Allow"
      .pause(1000)
      // Second modal - Click "Just This File"
      .waitForElementVisible('*[data-id="mcp_file_write_permission_scopeModalDialogContainer-react"]', 30000)
      .waitForElementContainsText('*[data-id="mcp_file_write_permission_scopeModalDialogContainer-react"]', 'Permission Scope', 5000)
      .modalFooterOKClick("mcp_file_write_permission_scope") // Click "Just This File"
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
  },

  /**
   * Test 3: Allow + "All Files in Project" creates allow-all mode via chat
   */
  'Should allow all files in project via chat #group2': function (browser: NightwatchBrowser) {
    browser
      .refresh()
      .waitForElementVisible('*[data-id="remixIdeSidePanel"]', 10000)
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemremix.config.json"]', 5000)
      .removeFile('remix.config.json', '/')
      .refresh()
      .waitForElementVisible('*[data-id="remixIdeSidePanel"]', 10000)
      .clickLaunchIcon('remixaiassistant')
      .waitForElementPresent('*[data-id="remix-ai-assistant-ready"]', 60000)
      .pause(1000)
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
      .waitForElementVisible('*[data-id=remix-ai-prompt-input]', 5000)
      .clearValue('*[data-id=remix-ai-prompt-input]')
      .setValue('*[data-id=remix-ai-prompt-input]', 'Create file1.txt with content "Test 1"')
      .sendKeys('*[data-id=remix-ai-prompt-input]', browser.Keys.ENTER)
      .pause(2000)
      .waitForElementVisible('*[data-id="mcp_file_write_permission_initialModalDialogContainer-react"]', 60000)
      .pause(500)
      .modalFooterOKClick("mcp_file_write_permission_initial") // Click "Allow"
      .waitForElementNotPresent('*[data-id="mcp_file_write_permission_initialModalDialogContainer-react"]', 10000)
      .waitForElementVisible('*[data-id="mcp_file_write_permission_scopeModalDialogContainer-react"]', 30000)
      .pause(500)
      .modalFooterCancelClick("mcp_file_write_permission_scope") // Click "All Files in Project"
      .useXpath()
      .waitForElementVisible('//button[contains(text(), "Accept All")]', 10000)
      .pause(500)
      .click('//button[contains(text(), "Accept All")]')
      .useCss()
      .waitForElementPresent({
        locateStrategy: 'xpath',
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']",
        timeout: 60000
      })
      .pause(1000)
      .waitForElementVisible('*[data-id=remix-ai-prompt-input]', 5000)
      .clearValue('*[data-id=remix-ai-prompt-input]')
      .setValue('*[data-id=remix-ai-prompt-input]', 'Create file2.txt with content "Test 2"')
      .sendKeys('*[data-id=remix-ai-prompt-input]', browser.Keys.ENTER)
      .waitForElementPresent({
        locateStrategy: 'xpath',
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='true']",
        timeout: 30000
      })
      .elements('css selector', '*[data-id="mcp_file_write_permission_initialModalDialogContainer-react"]', function (result) {
        const elements = Array.isArray(result.value) ? result.value : [];
        browser.assert.equal(elements.length, 0, 'No modal should appear for subsequent writes with allow-all mode');
      })
  },

  /**
   * Test 4: Deny blocks file writes via chat
   */
  'Should deny file writes when user clicks Deny via chat #group2': function (browser: NightwatchBrowser) {
    browser
      .refresh()
      .waitForElementVisible('*[data-id="remixIdeSidePanel"]', 10000)
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemremix.config.json"]', 5000)
      .removeFile('remix.config.json', '/')
      .refresh()
      .waitForElementVisible('*[data-id="remixIdeSidePanel"]', 10000)
      .clickLaunchIcon('remixaiassistant')
      .waitForElementPresent('*[data-id="remix-ai-assistant-ready"]', 60000)
      .pause(1000)
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
      .pause(500)
      .waitForElementVisible('*[data-id=remix-ai-prompt-input]', 5000)
      .clearValue('*[data-id=remix-ai-prompt-input]')
      .setValue('*[data-id=remix-ai-prompt-input]', 'Create denied.txt with content "Should not be created"')
      .sendKeys('*[data-id=remix-ai-prompt-input]', browser.Keys.ENTER)
      .pause(2000)
      .waitForElementVisible('*[data-id="mcp_file_write_permission_initialModalDialogContainer-react"]', 60000)
      .modalFooterCancelClick("mcp_file_write_permission_initial") // Click "Deny"
      .pause(2000)
      .waitForElementPresent({
        locateStrategy: 'xpath',
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']",
        timeout: 60000
      })
      .clickLaunchIcon('filePanel')
      .pause(500)
      .expect.element('*[data-id="treeViewLitreeViewItemdenied.txt"]').to.not.be.present
  },

  /**
   * Test 5: Allow + "Just This File" creates allow-specific mode via chat
   */
  'Should allow all files access #group3': function (browser: NightwatchBrowser) {
    browser
      .refresh()
      .waitForElementVisible('*[data-id="remixIdeSidePanel"]', 10000)
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemremix.config.json"]', 5000)
      .removeFile('remix.config.json', '/')
      .refresh()
      .waitForElementVisible('*[data-id="remixIdeSidePanel"]', 10000)
      .clickLaunchIcon('remixaiassistant')
      .waitForElementPresent('*[data-id="remix-ai-assistant-ready"]', 60000)
      .pause(1000)
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
      .waitForElementVisible('*[data-id=remix-ai-prompt-input]', 5000)
      .clearValue('*[data-id=remix-ai-prompt-input]')
      .setValue('*[data-id=remix-ai-prompt-input]', 'Create file1.txt with content "Test 1"')
      .sendKeys('*[data-id=remix-ai-prompt-input]', browser.Keys.ENTER)
      .pause(2000)
      .waitForElementVisible('*[data-id="mcp_file_write_permission_initialModalDialogContainer-react"]', 60000)
      .pause(500)
      .modalFooterOKClick("mcp_file_write_permission_initial") // Click "Allow"
      .waitForElementNotPresent('*[data-id="mcp_file_write_permission_initialModalDialogContainer-react"]', 10000)
      .waitForElementVisible('*[data-id="mcp_file_write_permission_scopeModalDialogContainer-react"]', 30000)
      .pause(500)
      .modalFooterCancelClick("mcp_file_write_permission_scope") // Click "All Files in Project"
      .pause(2000)
      .waitForElementPresent({
        locateStrategy: 'xpath',
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']",
        timeout: 60000
      })
      .pause(1000)
      .useXpath()
      .elements('xpath', '//button[contains(text(), "Accept All")]', function (result) {
        const elements = Array.isArray(result.value) ? result.value : [];
        if (elements.length > 0) {
          browser.click('//button[contains(text(), "Accept All")]').pause(1000);
        }
      })
      .useCss()
      .pause(500)
  },

  /**
   * Test 6: Config persists across page reload with chat interaction
   * This test verifies that the previous test's allow-all config persists after refresh
   */
  'Should persist permissions after reload with chat #group3': function (browser: NightwatchBrowser) {
    browser
      .refresh()
      .waitForElementVisible('*[data-id="remixIdeSidePanel"]', 10000)
      .clickLaunchIcon('remixaiassistant')
      .waitForElementPresent('*[data-id="remix-ai-assistant-ready"]', 60000)
      .pause(2000)
      .waitForElementVisible('*[data-assist-btn="assistant-selector-btn"]', 5000)
      .click('*[data-assist-btn="assistant-selector-btn"]')
      .pause(1000)
      .waitForElementVisible('#mcpEnhancementToggle', 5000)
      .execute(function () {
        const checkbox = document.getElementById('mcpEnhancementToggle') as HTMLInputElement;
        if (checkbox && !checkbox.checked) {
          checkbox.click();
        }
      })
      .pause(1000)
      .execute(function () {
        const checkbox = document.getElementById('mcpEnhancementToggle') as HTMLInputElement;
        return { mcpEnabled: checkbox?.checked || false };
      }, [], function (result) {
        const data = result.value as any;
        browser.assert.ok(data.mcpEnabled, 'MCP Enhancement should be enabled');
      })
      .pause(500)
      .click('*[data-id="remixIdeSidePanel"]')
      .pause(500)
      .waitForElementVisible('*[data-id=remix-ai-prompt-input]', 5000)
      .click('*[data-id=remix-ai-prompt-input]')
      .pause(500)
      .clearValue('*[data-id=remix-ai-prompt-input]')
      .setValue('*[data-id=remix-ai-prompt-input]', 'Create persistent.txt with content "Persistent test"')
      .sendKeys('*[data-id=remix-ai-prompt-input]', browser.Keys.ENTER)
      .pause(3000)
      .elements('css selector', '*[data-id="mcp_file_write_permission_initialModalDialogContainer-react"]', function (result) {
        const elements = Array.isArray(result.value) ? result.value : [];
        browser.assert.equal(elements.length, 0, 'No permission modal should appear with persisted allow-all config');
      })
      .waitForElementPresent({
        locateStrategy: 'xpath',
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']",
        timeout: 60000
      })
      .pause(2000)
      .waitForElementVisible('*[data-id="treeViewLitreeViewItempersistent.txt"]', 10000)
  },
}

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
