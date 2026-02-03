'use strict'

import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

/**
 * E2E Tests for MCP File Write Permissions
 *
 * Tests the file write permission system that prompts users before allowing
 * the AI to write or create files, with options to:
 * - Allow just one file
 * - Allow all files in the project
 * - Deny file writes
 */

const tests = {
  '@disabled': true,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done, 'http://127.0.0.1:8080/#experimental=true', true, undefined, true, true)
  },

  after: function (browser: NightwatchBrowser) {
    browser.perform((done) => {
      // Clean up any test artifacts
      browser.execute(function () {
        try {
          localStorage.removeItem('remix.config.json');
          (window as any).getRemixAIPlugin.call('fileManager', 'remove', 'remix.config.json');
        } catch (e) {
          console.log('Cleanup error:', e);
        }
      }, [], () => done());
    });
  },

  'Setup: Enable MCP experimental features #group1 #group2 #group3': function (browser: NightwatchBrowser) {
    browser
      // Refresh to apply settings
      .refresh()
      .waitForElementVisible('*[data-id="remixIdeSidePanel"]', 10000)
      .pause(1000)
      // Verify and enable MCP in AI plugin
      .execute(function () {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (aiPlugin) {
          console.log('[Test Setup] AI Plugin found');
          console.log('[Test Setup] MCP enabled before:', aiPlugin.mcpEnabled);

          if (typeof aiPlugin.enableMCPEnhancement === 'function') {
            aiPlugin.enableMCPEnhancement();
            console.log('[Test Setup] Called enableMCPEnhancement()');
          }

          console.log('[Test Setup] MCP enabled after:', aiPlugin.mcpEnabled);
          return { mcpEnabled: aiPlugin.mcpEnabled };
        }
        return { error: 'AI Plugin not found' };
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('[Test Setup] Error:', data.error);
        } else {
          browser.assert.ok(data.mcpEnabled, 'MCP should be enabled for file permission tests');
        }
      })
      .pause(1000)
  },

  /**
   * Test 1: First time file write shows permission modal
   * Verifies that when a file write is attempted for the first time,
   * the user is prompted with the permission modal.
   */
  'Should show permission modal on first file write #group1': function (browser: NightwatchBrowser) {
    browser
      // Clear any existing config to ensure fresh state
      .execute(function () {
        localStorage.removeItem('remix.config.json');
        (window as any).getRemixAIPlugin.call('fileManager', 'remove', 'remix.config.json');
        (window as any).getRemixAIPlugin.remixMCPServer.reloadConfig();
      })
      .refresh()
      // Wait for IDE to be ready
      .waitForElementVisible('*[data-id="remixIdeSidePanel"]', 10000)
      .pause(2000)
      // Trigger MCP file write operation via AI plugin's MCP server
      .execute(function () {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (aiPlugin && aiPlugin.remixMCPServer) {
          aiPlugin.remixMCPServer.executeTool({
            name: 'file_write',
            arguments: { path: 'test.txt', content: 'Hello World' }
          });
        }
      })
      .pause(1000)
      // Wait for first modal to appear
      .waitForElementVisible('*[data-id="mcp_file_write_permission_initialModalDialogContainer-react"]', 30000)
      .waitForElementContainsText('*[data-id="mcp_file_write_permission_initialModalDialogContainer-react"]', 'File Write Permission Required', 5000)
      .waitForElementContainsText('*[data-id="mcp_file_write_permission_initialModalDialogContainer-react"]', 'test.txt', 5000)
      // Verify buttons are present
      .assert.containsText('*[data-id="mcp_file_write_permission_initialModalDialogContainer-react"]', 'Allow')
      .assert.containsText('*[data-id="mcp_file_write_permission_initialModalDialogContainer-react"]', 'Deny')
  },

  /**
   * Test 2: Allow + "Just This File" creates allow-specific mode
   * Tests the flow where user allows one specific file.
   */
  'Should allow write for specific file only #group1': function (browser: NightwatchBrowser) {
    browser
      .refresh()
      .waitForElementVisible('*[data-id="remixIdeSidePanel"]', 10000)
      .pause(1000)
      // Clear config
      .execute(function () {
        localStorage.removeItem('remix.config.json');
        (window as any).getRemixAIPlugin.call('fileManager', 'remove', 'remix.config.json');
        (window as any).getRemixAIPlugin.remixMCPServer.reloadConfig();
      })
      .refresh()
      .waitForElementVisible('*[data-id="remixIdeSidePanel"]', 10000)
      .pause(1000)
      // Trigger file write via AI plugin's MCP server
      .execute(function () {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (aiPlugin && aiPlugin.remixMCPServer) {
          aiPlugin.remixMCPServer.executeTool({
            name: 'file_write',
            arguments: { path: 'specific.txt', content: 'Test content' }
          });
        }
      })
      .pause(1000)
      // First modal - Click Allow
      .waitForElementVisible('*[data-id="mcp_file_write_permission_initialModalDialogContainer-react"]', 30000)
      .modalFooterOKClick("mcp_file_write_permission_initial") // Clicks "Allow"
      .pause(1000)
      // Second modal - Click "Just This File"
      .waitForElementVisible('*[data-id="mcp_file_write_permission_scopeModalDialogContainer-react"]', 30000)
      .waitForElementContainsText('*[data-id="mcp_file_write_permission_scopeModalDialogContainer-react"]', 'Permission Scope', 5000)
      .waitForElementContainsText('*[data-id="mcp_file_write_permission_scopeModalDialogContainer-react"]', 'Just This File', 5000)
      .modalFooterOKClick("mcp_file_write_permission_scope") // Clicks "Just This File"
      .pause(2000)
      // Verify config was updated
      .pause(1000)
      .execute(function () {
        return (window as any).getRemixAIPlugin.call('fileManager', 'readFile', 'remix.config.json');
      }, [], function (result) {
        const configStr = result.value as string;
        if (configStr) {
          const config = JSON.parse(configStr);
          browser.assert.equal(config.mcp.security.fileWritePermissions.mode, 'allow-specific');
          browser.assert.ok(config.mcp.security.fileWritePermissions.allowedFiles.includes('specific.txt'));
        } else {
          browser.assert.fail('Config file not found or empty');
        }
      })
      // Test that another file triggers modal again
      .execute(function () {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (aiPlugin && aiPlugin.remixMCPServer) {
          aiPlugin.remixMCPServer.executeTool({
            name: 'file_write',
            arguments: { path: 'another.txt', content: 'Different file' }
          });
        }
      })
      .pause(1000)
      .waitForElementVisible('*[data-id="mcp_file_write_permission_initialModalDialogContainer-react"]', 30000)
      .assert.containsText('*[data-id="mcp_file_write_permission_initialModalDialogContainer-react"]', 'another.txt')
  },

  /**
   * Test 3: Allow + "All Files in Project" creates allow-all mode
   * Tests the flow where user allows all file writes.
   */
  'Should allow all files in project #group2': function (browser: NightwatchBrowser) {
    browser
      .refresh()
      .waitForElementVisible('*[data-id="remixIdeSidePanel"]', 10000)
      .pause(1000)
      // Clear config
      .execute(function () {
        localStorage.removeItem('remix.config.json');
        (window as any).getRemixAIPlugin.call('fileManager', 'remove', 'remix.config.json');
        (window as any).getRemixAIPlugin.remixMCPServer.reloadConfig();
      })
      .refresh()
      .waitForElementVisible('*[data-id="remixIdeSidePanel"]', 10000)
      .pause(1000)
      // Trigger file write via AI plugin's MCP server
      .execute(function () {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (aiPlugin && aiPlugin.remixMCPServer) {
          aiPlugin.remixMCPServer.executeTool({
            name: 'file_write',
            arguments: { path: 'file1.txt', content: 'Content 1' }
          });
        }
      })
      .pause(1000)
      // First modal - Click Allow
      .waitForElementVisible('*[data-id="mcp_file_write_permission_initialModalDialogContainer-react"]', 30000)
      .modalFooterOKClick("mcp_file_write_permission_initial")
      .pause(1000)
      // Second modal - Click "All Files in Project" (Cancel button)
      .waitForElementVisible('*[data-id="mcp_file_write_permission_scopeModalDialogContainer-react"]', 30000)
      .modalFooterCancelClick("mcp_file_write_permission_scope") // Clicks "All Files in Project"
      .pause(2000)
      .execute(function () {
        return (window as any).getRemixAIPlugin.call('fileManager', 'readFile', 'remix.config.json');
      }, [], function (result) {
        const configStr = result.value as string;
        if (configStr) {
          const config = JSON.parse(configStr);
          browser.assert.equal(config.mcp.security.fileWritePermissions.mode, 'allow-all');
        } else {
          browser.assert.fail('Config file not found or empty');
        }
      })
      // Test that subsequent write does NOT trigger modal
      .execute(function () {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (aiPlugin && aiPlugin.remixMCPServer) {
          return aiPlugin.remixMCPServer.executeTool({
            name: 'file_write',
            arguments: { path: 'file2.txt', content: 'Content 2' }
          });
        }
      })
      .pause(2000)
      // Verify no modal appeared (modal should not be visible)
      .elements('css selector', '*[data-id="mcp_file_write_permission_initialModalDialogContainer-react"]', function (result) {
        const elements = Array.isArray(result.value) ? result.value : [];
        browser.assert.equal(elements.length, 0, 'No modal should appear for subsequent writes');
      })
  },

  /**
   * Test 4: Deny sets deny-all mode
   * Tests that clicking Deny blocks file writes.
   */
  'Should deny all file writes when user clicks Deny #group2': function (browser: NightwatchBrowser) {
    browser
      .refresh()
      .waitForElementVisible('*[data-id="remixIdeSidePanel"]', 10000)
      .pause(1000)
      // Clear config
      .execute(function () {
        localStorage.removeItem('remix.config.json');
        (window as any).getRemixAIPlugin.call('fileManager', 'remove', 'remix.config.json');
        (window as any).getRemixAIPlugin.remixMCPServer.reloadConfig();
      })
      .refresh()
      .waitForElementVisible('*[data-id="remixIdeSidePanel"]', 10000)
      .pause(1000)
      // Trigger file write via AI plugin's MCP server
      .execute(function () {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (aiPlugin && aiPlugin.remixMCPServer) {
          aiPlugin.remixMCPServer.executeTool({
            name: 'file_write',
            arguments: { path: 'denied.txt', content: 'Should not write' }
          });
        }
        console.log("Wrote the denied file")
      })
      // First modal - Click Deny (Cancel button)
      .pause(1000)
      .waitForElementVisible('*[data-id="mcp_file_write_permission_initialModalDialogContainer-react"]', 30000)
      .modalFooterCancelClick("mcp_file_write_permission_initial") // Clicks "Deny"
      .pause(2000)
      // Verify file was NOT created
      .execute(function () {
        return (window as any).getRemixAIPlugin.call('fileManager', 'exists', 'denied.txt');
      }, [], function (result) {
        browser.assert.equal(result.value, false, 'File should not be created when denied');
      })
  },

  /**
   * Test 5: Config persists across page reload
   * Tests that permission settings survive page refresh.
   */
  'Should persist permissions after page reload #group3': function (browser: NightwatchBrowser) {
    browser
      .refresh()
      .waitForElementVisible('*[data-id="remixIdeSidePanel"]', 10000)
      .pause(1000)
      // Set allow-all mode
      .execute(function () {
        const config = {
          mcp: {
            version: '1.0.0',
            security: {
              fileWritePermissions: {
                mode: 'allow-all',
                allowedFiles: [],
                lastPrompted: new Date().toISOString()
              }
            }
          }
        };
        return (window as any).getRemixAIPlugin.call(
          'fileManager',
          'writeFile',
          'remix.config.json',
          JSON.stringify(config, null, 2)
        );
      })
      .pause(1000)
      // Reload page
      .refresh()
      .waitForElementVisible('*[data-id="remixIdeSidePanel"]', 2000)
      .pause(3000)
      // Trigger file write - should NOT show modal
      .execute(function () {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (aiPlugin && aiPlugin.remixMCPServer) {
          return aiPlugin.remixMCPServer.executeTool({
            name: 'file_write',
            arguments: { path: 'persistent.txt', content: 'Persistent test' }
          });
        }
      })
      .pause(1000)
      // Verify no modal appeared
      .elements('css selector', '*[data-id="mcp_file_write_permission_initialModalDialogContainer-react"]', function (result) {
        const elements = Array.isArray(result.value) ? result.value : [];
        browser.assert.equal(elements.length, 0, 'No modal should appear after reload with allow-all');
      })
  },

  /**
   * Test 6: File create operation also requires permission
   * Tests that file_create tool also uses the permission system.
   */
  'Should require permission for file_create operation #group3': function (browser: NightwatchBrowser) {
    browser
      .refresh()
      .waitForElementVisible('*[data-id="remixIdeSidePanel"]', 10000)
      .pause(1000)
      // Clear config
      .execute(function () {
        localStorage.removeItem('remix.config.json');
        (window as any).getRemixAIPlugin.call('fileManager', 'remove', 'remix.config.json');
        (window as any).getRemixAIPlugin.remixMCPServer.reloadConfig();
      })
      .refresh()
      .waitForElementVisible('*[data-id="remixIdeSidePanel"]', 1000)
      .execute(function () {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (aiPlugin && aiPlugin.remixMCPServer) {
          aiPlugin.remixMCPServer.executeTool({
            name: 'file_create',
            arguments: { path: 'newfile.txt', content: 'Created by AI' }
          });
        }
      })
      .pause(1000)
      // Should show permission modal
      .waitForElementVisible('*[data-id="mcp_file_write_permission_initialModalDialogContainer-react"]', 2000)
      .waitForElementContainsText('*[data-id="mcp_file_write_permission_initialModalDialogContainer-react"]', 'File Write Permission Required', 5000)
      .assert.textContains('*[data-id="mcp_file_write_permission_initialModalDialogContainer-react"]', 'newfile.txt')
  },

}

module.exports = tests
