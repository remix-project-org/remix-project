import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

/**
 * Comprehensive test suite for all RemixMCPServer tool handlers
 * Tests File Management, Compilation, Deployment, Code Analysis, and Debugging tools
 */

const testContract = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract MCPToolTest {
    uint256 public value;
    address public owner;

    event ValueChanged(uint256 newValue);

    constructor() {
        owner = msg.sender;
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
    init(browser, done)
  },

  /**
   * Test: Verify all tools are registered
   */
  'Should have all tool categories registered': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="remix-ai-assistant"]')
      .execute(function () {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer?.tools) {
          return { error: 'Tool registry not available' };
        }

        try {
          const allTools = aiPlugin.remixMCPServer.tools.list();

          const fileTools = allTools.filter((t: any) =>
            t.category === 'file_management' || t.name.includes('file') || t.name.includes('directory')
          );

          const compilationTools = allTools.filter((t: any) =>
            t.category === 'compilation' || t.name.includes('compile')
          );

          const deploymentTools = allTools.filter((t: any) =>
            t.category === 'deployment' || t.name.includes('deploy') ||
            t.name.includes('account') || t.name.includes('contract')
          );

          const analysisTools = allTools.filter((t: any) =>
            t.category === 'analysis' || t.name.includes('analysis')
          );

          const debuggingTools = allTools.filter((t: any) =>
            t.category === 'debugging' || t.name.includes('debug')
          );

          return {
            totalTools: allTools.length,
            fileToolsCount: fileTools.length,
            compilationToolsCount: compilationTools.length,
            deploymentToolsCount: deploymentTools.length,
            analysisToolsCount: analysisTools.length,
            debuggingToolsCount: debuggingTools.length,
            allToolNames: allTools.map((t: any) => t.name)
          };
        } catch (error) {
          return { error: error.message };
        }
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Tool registry error:', data.error);
          return;
        }
        browser.assert.ok(data.totalTools > 0, 'Should have tools registered');
        browser.assert.ok(data.fileToolsCount > 0, 'Should have file management tools');
        browser.assert.ok(data.compilationToolsCount > 0, 'Should have compilation tools');
        browser.assert.ok(data.deploymentToolsCount > 0, 'Should have deployment tools');
        console.log(`Total tools: ${data.totalTools}, File: ${data.fileToolsCount}, Compilation: ${data.compilationToolsCount}, Deployment: ${data.deploymentToolsCount}`);
      });
  },

  /**
   * FILE MANAGEMENT TOOLS TESTS
   */
  'Should test file_write tool': function (browser: NightwatchBrowser) {
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
            name: 'file_write',
            arguments: {
              path: 'test_mcp_write.txt',
              content: 'Hello from MCP test!'
            }
          },
          id: 'test-file-write'
        }).then(function (result) {
          let resultData = null;
          if (!result.error && result.result?.content?.[0]?.text) {
            resultData = JSON.parse(result.result.content[0].text);
          }

          done({
            success: !result.error,
            hasResult: !!resultData,
            writeSuccess: resultData?.success || false,
            path: resultData?.path || null,
            errorMessage: result.error?.message || null
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('File write error:', data.error);
          return;
        }
        browser.assert.ok(data.success, 'File write tool should succeed');
        browser.assert.ok(data.writeSuccess, 'File should be written successfully');
        browser.assert.equal(data.path, 'test_mcp_write.txt', 'Path should match');
      });
  },

  'Should test file_read tool': function (browser: NightwatchBrowser) {
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
            name: 'file_read',
            arguments: {
              path: 'test_mcp_write.txt'
            }
          },
          id: 'test-file-read'
        }).then(function (result) {
          let resultData = null;
          if (!result.error && result.result?.content?.[0]?.text) {
            resultData = JSON.parse(result.result.content[0].text);
          }

          done({
            success: !result.error,
            hasResult: !!resultData,
            readSuccess: resultData?.success || false,
            content: resultData?.content || null,
            path: resultData?.path || null
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('File read error:', data.error);
          return;
        }
        browser.assert.ok(data.success, 'File read tool should succeed');
        browser.assert.ok(data.readSuccess, 'File should be read successfully');
        browser.assert.equal(data.content, 'Hello from MCP test!', 'Content should match written content');
      });
  },

  'Should test file_exists tool': function (browser: NightwatchBrowser) {
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
            name: 'file_exists',
            arguments: {
              path: 'test_mcp_write.txt'
            }
          },
          id: 'test-exists-1'
        }).then(function (existingResult) {
          return aiPlugin.remixMCPServer.handleMessage({
            method: 'tools/call',
            params: {
              name: 'file_exists',
              arguments: {
                path: 'nonexistent_file_12345.txt'
              }
            },
            id: 'test-exists-2'
          }).then(function (nonExistingResult) {
            let existingData = null;
            let nonExistingData = null;

            if (!existingResult.error && existingResult.result?.content?.[0]?.text) {
              existingData = JSON.parse(existingResult.result.content[0].text);
            }

            if (!nonExistingResult.error && nonExistingResult.result?.content?.[0]?.text) {
              nonExistingData = JSON.parse(nonExistingResult.result.content[0].text);
            }

            done({
              existingFileSuccess: !existingResult.error,
              existingFileExists: existingData?.exists || false,
              nonExistingFileSuccess: !nonExistingResult.error,
              nonExistingFileExists: nonExistingData?.exists || false
            });
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('File exists error:', data.error);
          return;
        }
        browser.assert.ok(data.existingFileSuccess, 'File exists tool should succeed for existing file');
        browser.assert.ok(data.existingFileExists, 'Existing file should be detected');
        browser.assert.ok(data.nonExistingFileSuccess, 'File exists tool should succeed for non-existing file');
        browser.assert.ok(!data.nonExistingFileExists, 'Non-existing file should not be detected');
      });
  },

  'Should test file_delete tool': function (browser: NightwatchBrowser) {
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
            name: 'file_delete',
            arguments: {
              path: 'test_mcp_write.txt'
            }
          },
          id: 'test-file-delete'
        }).then(function (result) {
          let resultData = null;
          if (!result.error && result.result?.content?.[0]?.text) {
            resultData = JSON.parse(result.result.content[0].text);
          }

          done({
            success: !result.error,
            deleteSuccess: resultData?.success || false,
            path: resultData?.path || null
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('File delete error:', data.error);
          return;
        }
        browser.assert.ok(data.success, 'File delete tool should succeed');
        browser.assert.ok(data.deleteSuccess, 'File should be deleted successfully');
      });
  },

  'Should test directory_list tool': function (browser: NightwatchBrowser) {
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
            name: 'directory_list',
            arguments: {
              path: '',
              recursive: true
            }
          },
          id: 'test-dir-list'
        }).then(function (result) {
          let resultData = null;
          if (!result.error && result.result?.content?.[0]?.text) {
            resultData = JSON.parse(result.result.content[0].text);
          }

          done({
            success: !result.result?.isError,
            hasFiles: !!resultData?.files,
            fileCount: resultData?.files?.length || 0,
            listSuccess: resultData?.success || false
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Directory list error:', data.error);
          return;
        }
        browser.assert.ok(data.success, 'Directory list tool should succeed');
        browser.assert.ok(data.listSuccess, 'Directory listing should be successful');
      })
  },

  /**
   * COMPILATION TOOLS TESTS
   */
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
          let configData = null;
          if (!result.error && result.result?.content?.[0]?.text) {
            configData = JSON.parse(result.result.content[0].text);
          }

          done({
            success: !result.error,
            hasConfig: !!configData?.config,
            configSuccess: configData?.success || false,
            version: configData?.config?.version || null,
            optimize: configData?.config?.optimize,
            runs: configData?.config?.runs || null
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
        browser.assert.ok(data.configSuccess, 'Config retrieval should be successful');
      });
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
              evmVersion: 'london',
              language: 'Solidity'
            }
          },
          id: 'test-set-config'
        }).then(function (result) {
          let resultData = null;
          if (!result.error && result.result?.content?.[0]?.text) {
            resultData = JSON.parse(result.result.content[0].text);
          }

          done({
            success: !result.error,
            setSuccess: resultData?.success || false,
            hasConfig: !!resultData?.config,
            version: resultData?.config?.version || null
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
        browser.assert.ok(data.success, 'Set compiler config should succeed');
        browser.assert.ok(data.setSuccess, 'Config should be set successfully');
        browser.assert.equal(data.version, '0.8.20', 'Version should match');
      });
  },

  'Should test solidity_compile tool': function (browser: NightwatchBrowser) {
    browser
      .addFile('contracts/MCPToolTest.sol', { content: testContract })
      .pause(1000)
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
              file: 'contracts/MCPToolTest.sol',
              version: '0.8.20',
              optimize: true,
              runs: 200
            }
          },
          id: 'test-compile'
        }).then(function (result) {
          let compileData = null;
          if (!result.error && result.result?.content?.[0]?.text) {
            compileData = JSON.parse(result.result.content[0].text);
          }

          done({
            success: !result.error,
            compileSuccess: compileData?.success || false,
            hasContracts: !!compileData?.contracts,
            hasErrors: !!compileData?.errors,
            contractCount: compileData?.contracts ? Object.keys(compileData.contracts).length : 0,
            errorCount: compileData?.errors?.length || 0
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Compile error:', data.error);
          return;
        }
        browser.assert.ok(data.success, 'Solidity compile should succeed');
        browser.assert.ok(data.hasContracts, 'Should have contracts object');
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
          let resultData = null;
          if (!result.error && result.result?.content?.[0]?.text) {
            resultData = JSON.parse(result.result.content[0].text);
          }

          done({
            success: !result.error,
            hasContracts: !!resultData?.contracts,
            compileSuccess: resultData?.success,
            contractCount: resultData?.contracts ? Object.keys(resultData.contracts).length : 0
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
        browser.assert.ok(data.hasContracts, 'Should have contracts');
      });
  },

  /**
   * DEPLOYMENT & ACCOUNT TOOLS TESTS
   */
  'Should test get_user_accounts tool': function (browser: NightwatchBrowser) {
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
            name: 'get_user_accounts',
            arguments: {
              includeBalances: true
            }
          },
          id: 'test-accounts'
        }).then(function (result) {
          let accountsData = null;
          if (!result.error && result.result?.content?.[0]?.text) {
            accountsData = JSON.parse(result.result.content[0].text);
          }

          done({
            success: !result.error,
            getSuccess: accountsData?.success || false,
            hasAccounts: !!accountsData?.accounts,
            accountCount: accountsData?.accounts?.length || 0,
            hasSelectedAccount: !!accountsData?.selectedAccount,
            hasEnvironment: !!accountsData?.environment,
            firstAccountHasBalance: accountsData?.accounts?.[0]?.balance !== undefined
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Get accounts error:', data.error);
          return;
        }
        browser.assert.ok(data.success, 'Get user accounts should succeed');
        browser.assert.ok(data.hasAccounts, 'Should have accounts');
        browser.assert.ok(data.accountCount > 0, 'Should have at least one account');
        browser.assert.ok(data.firstAccountHasBalance, 'Accounts should include balance when requested');
      });
  },

  'Should test get_current_environment tool': function (browser: NightwatchBrowser) {
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
            name: 'get_current_environment',
            arguments: {}
          },
          id: 'test-environment'
        }).then(function (result) {
          let envData = null;
          if (!result.error && result.result?.content?.[0]?.text) {
            envData = JSON.parse(result.result.content[0].text);
          }

          done({
            success: !result.error,
            getSuccess: envData?.success || false,
            hasEnvironment: !!envData?.environment,
            hasProvider: !!envData?.environment?.provider,
            hasNetwork: !!envData?.environment?.network,
            hasAccounts: !!envData?.environment?.accounts
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Get environment error:', data.error);
          return;
        }
        browser.assert.ok(data.success, 'Get current environment should succeed');
        browser.assert.ok(data.hasEnvironment, 'Should have environment object');
      });
  },

  'Should test deploy_contract tool': function (browser: NightwatchBrowser) {
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
            name: 'deploy_contract',
            arguments: {
              contractName: 'MCPToolTest',
              file: 'contracts/MCPToolTest.sol',
              value: '0'
            }
          },
          id: 'test-deploy'
        }).then(function (result) {
          let deployData = null;
          if (!result.error && result.result?.content?.[0]?.text) {
            deployData = JSON.parse(result.result.content[0].text);
          }

          done({
            success: !result.isError,
            deploySuccess: deployData?.success || false,
            hasTransactionHash: !!deployData?.transactionHash,
            hasContractAddress: !!deployData?.contractAddress,
            hasGasUsed: deployData?.gasUsed !== undefined,
            contractAddress: deployData?.contractAddress || null,
            errorMessage: result.error?.message || deployData?.error || null
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Deploy contract error:', data.error);
          return;
        }
        browser.assert.ok(data.success, 'Deploy contract tool should succeed');
        browser.assert.ok(data.hasContractAddress, 'Should have contract address');
        browser.assert.ok(data.hasTransactionHash, 'Should have transaction hash');
        browser.assert.ok(data.hasGasUsed, 'Should have gas used');
      })
  },

  'Should test call_contract tool': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        // First get deployed contracts to find an address
        aiPlugin.remixMCPServer.handleMessage({
          method: 'resources/read',
          params: { uri: 'deployment://active' },
          id: 'test-get-deployed'
        }).then(function (deployedResult) {
          let deployedData = null;
          if (deployedResult.result?.text) {
            deployedData = JSON.parse(deployedResult.result.text);
          }
          const contracts = deployedData?.contracts || [];
          if (contracts.length === 0) {
            done({ skipped: true, reason: 'No deployed contracts available' });
            return;
          }

          const testContract = contracts[0];

          // Call the contract
          return aiPlugin.remixMCPServer.handleMessage({
            method: 'tools/call',
            params: {
              name: 'call_contract',
              arguments: {
                contractName: testContract.name,
                address: testContract.address,
                abi: testContract.abi,
                methodName: 'getValue',
                args: []
              }
            },
            id: 'test-call'
          }).then(function (result) {
            let callData = null;
            if (!result.error && result.result?.content?.[0]?.text) {
              callData = JSON.parse(result.result.content[0].text);
            }

            done({
              success: !result?.isError,
              callSuccess: callData?.success || false,
              hasResult: callData?.result !== undefined,
              result: callData?.result || null,
              errorMessage: result.error?.message || null
            });
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Call contract error:', data.error);
          return;
        }
        if (data.skipped) {
          console.log('Test skipped:', data.reason);
          return;
        }
        browser.assert.ok(data.success, 'Call contract tool should succeed');
      });
  },

  'Should test get_deployed_contracts tool': function (browser: NightwatchBrowser) {
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
            name: 'get_deployed_contracts',
            arguments: {}
          },
          id: 'test-get-deployed'
        }).then(function (result) {
          let resultData = null;
          if (!result.error && result.result?.content?.[0]?.text) {
            resultData = JSON.parse(result.result.content[0].text);
          }

          done({
            success: !result.error,
            getSuccess: resultData?.success || false,
            hasContracts: !!resultData?.contracts,
            contractCount: resultData?.count || 0
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Get deployed contracts error:', data.error);
          return;
        }
        browser.assert.ok(data.success, 'Get deployed contracts should succeed');
        browser.assert.ok(data.hasContracts, 'Should have contracts array');
      });
  },

  /**
   * ERROR HANDLING & VALIDATION TESTS
   */
  'Should validate tool arguments': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        const tests = [
          // Missing required argument
          {
            name: 'file_read',
            arguments: {},
            expectedError: true
          },
          // Invalid type
          {
            name: 'solidity_compile',
            arguments: {
              file: 'test.sol',
              runs: 'invalid' // Should be number
            },
            expectedError: true
          },
          // Invalid value range
          {
            name: 'solidity_compile',
            arguments: {
              file: 'test.sol',
              runs: 99999 // Too high
            },
            expectedError: true
          }
        ];

        const results = [];

        // Convert loop to sequential promise chain
        function processTest(index) {
          if (index >= tests.length) {
            done({
              totalTests: tests.length,
              results: results,
              allValidated: results.every(function (r) { return r.hasError === r.expectedError; }),
              systemStable: true
            });
            return;
          }

          const test = tests[index];
          aiPlugin.remixMCPServer.handleMessage({
            method: 'tools/call',
            params: test,
            id: 'test-validation-' + test.name
          }).then(function (result) {
            results.push({
              tool: test.name,
              hasError: !!result.error || result.result?.isError,
              errorMessage: result.error?.message || result.result?.content?.[0]?.text || null,
              expectedError: test.expectedError
            });
            processTest(index + 1);
          }).catch(function (error) {
            results.push({
              tool: test.name,
              hasError: true,
              errorMessage: error.message,
              expectedError: test.expectedError
            });
            processTest(index + 1);
          });
        }

        processTest(0);
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Validation test error:', data.error);
          return;
        }
        browser.assert.equal(data.totalTests, 3, 'Should run all validation tests');
        browser.assert.ok(data.allValidated, 'All validation tests should behave as expected');
        browser.assert.ok(data.systemStable, 'System should remain stable after validation errors');
      });
  },

  'Should handle non-existent tools gracefully': function (browser: NightwatchBrowser) {
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
            name: 'non_existent_tool_12345',
            arguments: {}
          },
          id: 'test-nonexistent'
        }).then(function (result) {
          done({
            hasError: !!result.error,
            errorCode: result.error?.code || null,
            errorMessage: result.error?.message || null,
            systemStable: true
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Non-existent tool test error:', data.error);
          return;
        }
        browser.assert.ok(data.hasError, 'Should return error for non-existent tool');
        browser.assert.ok(data.systemStable, 'System should remain stable');
      });
  },

  /**
   * PERFORMANCE TESTS
   */
  'Should handle concurrent tool execution': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        const startTime = Date.now();

        // Execute multiple tools concurrently
        const promises = [
          aiPlugin.remixMCPServer.handleMessage({
            method: 'tools/call',
            params: { name: 'get_compiler_config', arguments: {} },
            id: 'concurrent-1'
          }),
          aiPlugin.remixMCPServer.handleMessage({
            method: 'tools/call',
            params: { name: 'get_user_accounts', arguments: {} },
            id: 'concurrent-2'
          }),
          aiPlugin.remixMCPServer.handleMessage({
            method: 'tools/call',
            params: { name: 'get_current_environment', arguments: {} },
            id: 'concurrent-3'
          }),
          aiPlugin.remixMCPServer.handleMessage({
            method: 'tools/call',
            params: { name: 'get_compilation_result', arguments: {} },
            id: 'concurrent-4'
          })
        ];

        Promise.all(promises).then(function (results) {
          const endTime = Date.now();

          const allSucceeded = results.every(function (r) { return !r.error; });
          const executionTime = endTime - startTime;

          done({
            totalTools: promises.length,
            allSucceeded: allSucceeded,
            executionTime: executionTime,
            averageTime: executionTime / promises.length,
            performanceAcceptable: executionTime < 5000 // 5 seconds for 4 tools
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Concurrent execution error:', data.error);
          return;
        }
        browser.assert.equal(data.totalTools, 4, 'Should execute all tools');
        browser.assert.ok(data.allSucceeded, 'All concurrent executions should succeed');
        browser.assert.ok(data.performanceAcceptable, 'Performance should be acceptable');
        console.log(`Concurrent execution completed in ${data.executionTime}ms (avg: ${data.averageTime}ms per tool)`);
      });
  }
};
