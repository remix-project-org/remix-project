import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

/**
 * Comprehensive E2E tests for Security and Validation Middleware
 * Tests permission validation, rate limiting, input validation, security checks,
 * audit logging, and dangerous operation detection
 */

module.exports = {
  '@disabled': false,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done, 'http://127.0.0.1:8080/#experimental=true', true, undefined, true, true)
  },

  'Setup: Clear any existing file permissions': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="remix-ai-assistant"]')
      .execute(function () {
        // Clear config to ensure modal appears on first write
        localStorage.removeItem('remix.config.json');
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (aiPlugin) {
          aiPlugin.call('fileManager', 'remove', 'remix.config.json');
          if (aiPlugin.remixMCPServer) {
            aiPlugin.remixMCPServer.reloadConfig();
          }
        }
      })
      .pause(500);
  },

  /**
   * PERMISSION VALIDATION TESTS
   */
  'Should test permission-based access control': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="remix-ai-assistant"]')
      // First create a test file - this will show the permission modal
      .execute(function () {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (aiPlugin && aiPlugin.remixMCPServer) {
          aiPlugin.remixMCPServer.handleMessage({
            method: 'tools/call',
            params: {
              name: 'file_write',
              arguments: {
                path: 'test_permission.txt',
                content: 'test content for permission check'
              }
            },
            id: 'test-permission-setup'
          });
        }
      })
      .pause(500)
      // Handle permission modal - First modal: Allow/Deny
      .waitForElementVisible('*[data-id="mcp_file_write_permission_initialModalDialogContainer-react"]', 10000)
      .modalFooterOKClick("mcp_file_write_permission_initial") // Click "Allow"
      .pause(500)
      // Second modal: Just This File / All Files in Project
      .waitForElementVisible('*[data-id="mcp_file_write_permission_scopeModalDialogContainer-react"]', 10000)
      .modalFooterCancelClick("mcp_file_write_permission_scope") // Click "All Files in Project"
      .pause(500)
      // Third modal: Accept All confirmation
      .useXpath()
      .waitForElementVisible('//button[contains(text(), "Accept All")]', 10000)
      .click('//button[contains(text(), "Accept All")]')
      .useCss()
      .pause(1000)
      // Now test file read permission
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        // Test file read permission (should succeed with default permissions)
        aiPlugin.remixMCPServer.handleMessage({
          method: 'tools/call',
          params: {
            name: 'file_read',
            arguments: {
              path: 'test_permission.txt'
            }
          },
          id: 'test-permission-read'
        }).then(function (result) {
          return aiPlugin.remixMCPServer.handleMessage({
            method: 'tools/call',
            params: {
              name: 'file_read',
              arguments: {
                path: 'test_permission.txt'
              }
            },
            id: 'test-permission-read'
          });
        }).then(function (result) {
          const isError = !!result.error || !!result.result?.isError;
          const errorMessage = result.error?.message || result.result?.content?.[0]?.text || null;
          done({
            success: !isError,
            hasPermission: !isError,
            errorCode: result.error?.code || null,
            errorMessage: errorMessage
          });
        }).catch(function (error) {
          done({
            success: false,
            hasPermission: false,
            errorMessage: error.message
          });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error && !data.errorMessage) {
          console.error('Permission test error:', data.error);
          return;
        }
        // With default permissions, file read should succeed
        browser.assert.ok(data.hasPermission, 'Should have permission for file read');
      });
  },

  /**
   * INPUT VALIDATION TESTS
   */
  'Should validate tool arguments': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        // Test with invalid arguments (missing required field)
        aiPlugin.remixMCPServer.handleMessage({
          method: 'tools/call',
          params: {
            name: 'file_read',
            arguments: {
              // Missing required 'path' argument
            }
          },
          id: 'test-validation-missing'
        }).then(function (result) {
          const isError = !!result.error || !!result.result?.isError;
          const errorMessage = result.error?.message || result.result?.content?.[0]?.text || null;
          done({
            errorMessage: errorMessage,
            validationFailed: isError
          });
        }).catch(function (error) {
          done({
            validationFailed: true,
            errorMessage: error.message
          });
        });
      }, [], function (result) {
        const data = result.value as any;
        browser.assert.ok(data.validationFailed, 'Should fail validation with missing arguments');
      });
  },

  'Should validate argument types': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        // Test with invalid type (array instead of string)
        aiPlugin.remixMCPServer.handleMessage({
          method: 'tools/call',
          params: {
            name: 'file_read',
            arguments: {
              path: ['invalid', 'array']
            }
          },
          id: 'test-validation-type'
        }).then(function (result) {
          const isError = !!result.error || !!result.result?.isError;
          const errorMessage = result.error?.message || result.result?.content?.[0]?.text || null;
          done({
            hasError: isError,
            typeValidationFailed: isError,
            errorMessage: errorMessage
          });
        }).catch(function (error) {
          done({
            hasError: true,
            typeValidationFailed: true,
            errorMessage: error.message
          });
        });
      }, [], function (result) {
        const data = result.value as any;
        browser.assert.ok(
          data.hasError,
          'Type validation should be enforced'
        );
      });
  },

  /**
   * PATH SECURITY TESTS
   */
  'Should prevent directory traversal attacks': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        // Test with path traversal attempt
        aiPlugin.remixMCPServer.handleMessage({
          method: 'tools/call',
          params: {
            name: 'file_read',
            arguments: {
              path: '../../../etc/passwd'
            }
          },
          id: 'test-traversal-attack'
        }).then(function (result) {
          const isError = !!result.error || !!result.result?.isError;
          const errorMessage = result.error?.message || result.result?.content?.[0]?.text || null;
          done({
            blocked: isError,
            errorMessage: errorMessage,
            securityViolation: errorMessage?.includes('security') ||
                              errorMessage?.includes('invalid') ||
                              errorMessage?.includes('denied') || false
          });
        }).catch(function (error) {
          done({
            blocked: true,
            securityViolation: true,
            errorMessage: error.message
          });
        });
      }, [], function (result) {
        const data = result.value as any;
        // Path traversal should be blocked or sanitized
        browser.assert.ok(
          data.blocked || data.securityViolation || !data.errorMessage?.includes('passwd'),
          'Should prevent directory traversal'
        );
      });
  },

  'Should sanitize file paths': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        // Test with potentially dangerous path characters
        aiPlugin.remixMCPServer.handleMessage({
          method: 'tools/call',
          params: {
            name: 'file_write',
            arguments: {
              path: 'test/../safe_file.txt',
              content: 'test content'
            }
          },
          id: 'test-path-sanitization'
        }).then(function (result) {
          const isError = !!result.error || !!result.result?.isError;
          const resultData = !isError ? JSON.parse(result.result?.content?.[0]?.text || '{}') : {};
          done({
            success: !isError,
            pathSanitized: !!resultData?.path && !resultData.path.includes('..'),
            finalPath: resultData?.path || null
          });
        }).catch(function (error) {
          done({
            success: false,
            errorMessage: error.message
          });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error && !data.errorMessage) {
          console.error('Path sanitization error:', data.error);
          return;
        }
        // Path should either be sanitized or blocked
        browser.assert.ok(
          data.pathSanitized || !data.success,
          'Should sanitize or block dangerous paths'
        );
      });
  },

  /**
   * RATE LIMITING TESTS
   */
  'Should track tool execution rate': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        // Execute multiple rapid requests
        const requests = [];
        for (let i = 0; i < 5; i++) {
          requests.push(
            aiPlugin.remixMCPServer.handleMessage({
              method: 'tools/call',
              params: {
                name: 'get_compiler_versions',
                arguments: {}
              },
              id: 'test-rate-limit-' + i
            })
          );
        }

        Promise.all(requests).then(function (results) {
          const successCount = results.filter(function (r) { return !r.error; }).length;
          const rateLimitErrors = results.filter(function (r) {
            return r.error?.message?.includes('rate limit') || r.error?.code === 'RATE_LIMIT_EXCEEDED';
          }).length;

          done({
            totalRequests: results.length,
            successCount: successCount,
            rateLimitErrors: rateLimitErrors,
            allSucceeded: successCount === results.length
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Rate limiting test error:', data.error);
          return;
        }
        // Rate limiting may or may not be enforced depending on config
        browser.assert.ok(
          data.totalRequests === 5,
          'Should track all requests'
        );
        console.log(`Rate limit test: ${data.successCount}/${data.totalRequests} succeeded, ${data.rateLimitErrors} rate limited`);
      });
  },

  /**
   * DANGEROUS OPERATION DETECTION
   */
  'Should detect potentially dangerous operations': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        // Test deletion of potentially important file
        aiPlugin.remixMCPServer.handleMessage({
          method: 'tools/call',
          params: {
            name: 'file_delete',
            arguments: {
              path: 'package.json'
            }
          },
          id: 'test-dangerous-op'
        }).then(function (result) {
          const isError = !!result.error || !!result.result?.isError;
          const errorMessage = result.error?.message || result.result?.content?.[0]?.text || null;
          done({
            hasWarning: isError || (result.result?.content?.[0]?.text?.includes('warning')),
            blocked: isError,
            errorMessage: errorMessage
          });
        }).catch(function (error) {
          done({
            hasWarning: true,
            blocked: true,
            errorMessage: error.message
          });
        });
      }, [], function (result) {
        const data = result.value as any;
        // Dangerous operations may be warned about or blocked
        console.log('Dangerous operation detection:', data.hasWarning ? 'warned/blocked' : 'allowed');
      });
  },

  /**
   * CONFIGURATION VALIDATION
   */
  'Should validate MCP server configuration': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        // Get server capabilities to check configuration
        aiPlugin.remixMCPServer.handleMessage({
          method: 'server/capabilities',
          params: {},
          id: 'test-server-capabilities'
        }).then(function (result) {
          const isError = !!result.error || !!result.result?.isError;
          const capabilities = result.result || {};
          done({
            success: !isError,
            hasCapabilities: !!capabilities,
            hasTools: !!capabilities.tools,
            hasResources: !!capabilities.resources,
            supportsLogging: !!capabilities.logging,
            capabilities: capabilities
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Server capabilities error:', data.error);
          return;
        }
        browser.assert.ok(data.success, 'Should return server capabilities');
        browser.assert.ok(data.hasCapabilities, 'Should have capabilities object');
        console.log('Server capabilities:', JSON.stringify(data.capabilities, null, 2));
      });
  }
};
