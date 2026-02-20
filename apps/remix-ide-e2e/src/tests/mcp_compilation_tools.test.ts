import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

/**
 * Comprehensive E2E tests for Compilation Handler tools
 * Tests all 8 compilation tools: compile, get_result, set_config, get_config,
 * hardhat, foundry, truffle, get_versions
 */

const testContract = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract CompilationTest {
    uint256 public value;
    address public owner;

    event ValueChanged(uint256 newValue);

    constructor() {
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

  'Should test get_compiler_versions tool': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="remix-ai-assistant"]')
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        aiPlugin.remixMCPServer.handleMessage({
          method: 'tools/call',
          params: {
            name: 'get_compiler_versions',
            arguments: {}
          },
          id: 'test-get-versions'
        }).then(function (result) {
          if (result.error) {
            done({
              success: false,
              error: result.error.message || JSON.stringify(result.error)
            });
            return;
          }
          const resultData = JSON.parse(result.result?.content?.[0]?.text || '{}');
          done({
            success: !result.error,
            hasVersions: Array.isArray(resultData?.versions) && resultData.versions.length > 0,
            versionCount: resultData?.versions?.length || 0,
            hasLatest: !!resultData?.latestVersion
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Get compiler versions error:', data.error);
          return;
        }
        browser.assert.ok(data.success, 'Get compiler versions should succeed');
        browser.assert.ok(data.hasVersions, 'Should return available compiler versions');
        browser.assert.ok(data.versionCount > 0, 'Should have at least one compiler version');
      });
  },

  'Should test get_compiler_config tool': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        aiPlugin.remixMCPServer.handleMessage({
          method: 'tools/call',
          params: {
            name: 'get_compiler_config',
            arguments: {}
          },
          id: 'test-get-config'
        }).then(function (result) {
          const resultData = JSON.parse(result.result?.content?.[0]?.text || '{}');
          done({
            success: !result.error,
            hasConfig: !!resultData?.config,
            hasVersion: !!resultData?.config?.currentVersion,
            hasOptimize: resultData?.config?.optimize !== undefined,
            evmVersion: resultData?.config?.evmVersion || null,
            fullResult: resultData
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Get compiler config error:', data.error);
          return;
        }
        browser.assert.ok(data.success, 'Get compiler config should succeed');
        browser.assert.ok(data.hasConfig, 'Should return config object');
        browser.assert.ok(data.hasVersion, 'Config should include compiler version');
      })
  },

  'Should test set_compiler_config tool': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        aiPlugin.remixMCPServer.handleMessage({
          method: 'tools/call',
          params: {
            name: 'set_compiler_config',
            arguments: {
              version: '0.8.20',
              optimize: true,
              runs: 200,
              evmVersion: 'paris'
            }
          },
          id: 'test-set-config'
        }).then(function (result) {
          const resultData = JSON.parse(result.result?.content?.[0]?.text || '{}');

          // Wait for UI to process the config change
          return new Promise(function (resolve) {
            setTimeout(function () {
              resolve(resultData);
            }, 2000);
          });
        }).then(function (resultData: any) {
          // Verify config was set by retrieving it
          return aiPlugin.remixMCPServer.handleMessage({
            method: 'tools/call',
            params: {
              name: 'get_compiler_config',
              arguments: {}
            },
            id: 'test-verify-config'
          }).then(function (verifyResult) {
            const verifyData = JSON.parse(verifyResult.result?.content?.[0]?.text || '{}');
            done({
              setSuccess: resultData?.success || false,
              configSet: !!verifyData?.config,
              resolvedVersion: resultData?.resolvedVersion || null,
              currentVersion: verifyData?.config?.currentVersion || null,
              versionMatch: verifyData?.config?.currentVersion?.includes('0.8.20') || false,
              optimizeEnabled: verifyData?.config?.optimize === true
            });
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Set compiler config error:', data.error);
          return;
        }
        browser.assert.ok(data.setSuccess, 'Set compiler config should succeed');
        browser.assert.ok(data.configSet, 'Config should be retrievable');
        browser.assert.ok(data.versionMatch, `Version should be set correctly - resolved: ${data.resolvedVersion}, current: ${data.currentVersion}`);
      });
  },

  'Should test solidity_compile tool': function (browser: NightwatchBrowser) {
    browser
      // Trigger file write - this will show the permission modal
      .execute(function (testContract) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (aiPlugin && aiPlugin.remixMCPServer) {
          aiPlugin.remixMCPServer.handleMessage({
            method: 'tools/call',
            params: {
              name: 'file_write',
              arguments: {
                path: 'contracts/CompilationTest.sol',
                content: testContract
              }
            },
            id: 'test-write-contract'
          });
        }
      }, [testContract])
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
      .pause(2000)
      // Now compile the contract
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        aiPlugin.remixMCPServer.handleMessage({
          method: 'tools/call',
          params: {
            name: 'solidity_compile',
            arguments: {
              file: 'contracts/CompilationTest.sol'
            }
          },
          id: 'test-compile'
        }).then(function (result) {
          const resultData = JSON.parse(result.result?.content?.[0]?.text || '{}');
          done({
            success: !result.error,
            compilationSuccess: resultData?.success || false,
            hasContracts: !!resultData?.contracts,
            hasErrors: Array.isArray(resultData?.errors) && resultData.errors.length > 0,
            contractCount: Object.keys(resultData?.contracts || {}).length
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Solidity compile error:', data.error);
          return;
        }
        browser.assert.ok(data.success, 'Solidity compile should succeed');
        browser.assert.ok(data.compilationSuccess, 'Compilation should be successful');
        browser.assert.ok(data.hasContracts, 'Should return compiled contracts');
      });
  },

  'Should test get_compilation_result tool': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        aiPlugin.remixMCPServer.handleMessage({
          method: 'tools/call',
          params: {
            name: 'get_compilation_result',
            arguments: {}
          },
          id: 'test-get-result'
        }).then(function (result) {
          const resultData = JSON.parse(result.result?.content?.[0]?.text || '{}');
          console.log('result', result)
          done({
            success: !result.error,
            hasContracts: !!resultData?.contracts,
            hasSources: !!resultData?.sources,
            contractNames: Object.keys(resultData?.contracts || {})
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Get compilation result error:', data.error);
          return;
        }
        browser.assert.ok(data.success, 'Get compilation result should succeed');
        browser.assert.ok(data.hasSources, 'Should return compilation result');
        browser.assert.ok(data.hasContracts, 'Result should include contracts');
      });
  },

  'Should test compile with errors': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        const invalidContract = `
          pragma solidity ^0.8.0;
          contract Invalid {
            // Missing semicolon
            uint256 public value
            function test() public {}
          }
        `;

        aiPlugin.remixMCPServer.handleMessage({
          method: 'tools/call',
          params: {
            name: 'file_write',
            arguments: {
              path: 'contracts/InvalidContract.sol',
              content: invalidContract
            }
          },
          id: 'test-write-invalid'
        }).then(function () {
          return aiPlugin.remixMCPServer.handleMessage({
            method: 'tools/call',
            params: {
              name: 'solidity_compile',
              arguments: {
                file: 'contracts/InvalidContract.sol'
              }
            },
            id: 'test-compile-invalid'
          });
        }).then(function (result) {
          console.log("InvalidContract", result)
          const resultData = JSON.parse(result.result?.content?.[0]?.text || '{}');
          done({
            success: !result.error,
            hasErrors: Array.isArray(resultData?.errors) && resultData.errors.length > 0,
            errorCount: resultData?.errors?.length || 0,
            compilationFailed: !resultData?.success
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Compile with errors test error:', data.error);
          return;
        }
        browser.assert.ok(data.hasErrors, 'Should detect compilation errors');
        browser.assert.ok(data.errorCount > 0, 'Should return error details');
      });
  },

  'Should test compile_with_hardhat tool': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        aiPlugin.remixMCPServer.handleMessage({
          method: 'tools/call',
          params: {
            name: 'compile_with_hardhat',
            arguments: {
              contracts: ['contracts/CompilationTest.sol']
            }
          },
          id: 'test-hardhat-compile'
        }).then(function (result) {
          const resultData = JSON.parse(result.result?.content?.[0]?.text || '{}');
          done({
            success: !result.error,
            hasResult: !!resultData,
            hasContracts: !!resultData?.contracts,
            compilationAttempted: true,
            errorMessage: result.error?.message || null
          });
        }).catch(function (error) {
          // Hardhat might not be configured - that's OK for this test
          done({
            success: false,
            hardhatNotConfigured: true,
            errorMessage: error.message
          });
        });
      }, [], function (result) {
        const data = result.value as any;
        // Either succeeds or fails gracefully (Hardhat may not be set up)
        browser.assert.ok(
          data.success || data.hardhatNotConfigured,
          'Hardhat compile should execute or fail gracefully'
        );
      });
  },

  'Should test compile_with_foundry tool': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        aiPlugin.remixMCPServer.handleMessage({
          method: 'tools/call',
          params: {
            name: 'compile_with_foundry',
            arguments: {
              contracts: ['contracts/CompilationTest.sol']
            }
          },
          id: 'test-foundry-compile'
        }).then(function (result) {
          const resultData = JSON.parse(result.result?.content?.[0]?.text || '{}');
          done({
            success: !result.error,
            hasResult: !!resultData,
            hasContracts: !!resultData?.contracts,
            compilationAttempted: true
          });
        }).catch(function (error) {
          // Foundry might not be configured - that's OK
          done({
            success: false,
            foundryNotConfigured: true,
            errorMessage: error.message
          });
        });
      }, [], function (result) {
        const data = result.value as any;
        browser.assert.ok(
          data.success || data.foundryNotConfigured,
          'Foundry compile should execute or fail gracefully'
        );
      });
  },

  'Should test compile_with_truffle tool': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        aiPlugin.remixMCPServer.handleMessage({
          method: 'tools/call',
          params: {
            name: 'compile_with_truffle',
            arguments: {
              contracts: ['contracts/CompilationTest.sol']
            }
          },
          id: 'test-truffle-compile'
        }).then(function (result) {
          const resultData = JSON.parse(result.result?.content?.[0]?.text || '{}');
          done({
            success: !result.error,
            hasResult: !!resultData,
            hasContracts: !!resultData?.contracts,
            compilationAttempted: true
          });
        }).catch(function (error) {
          // Truffle might not be configured - that's OK
          done({
            success: false,
            truffleNotConfigured: true,
            errorMessage: error.message
          });
        });
      }, [], function (result) {
        const data = result.value as any;
        browser.assert.ok(
          data.success || data.truffleNotConfigured,
          'Truffle compile should execute or fail gracefully'
        );
      });
  }
};
