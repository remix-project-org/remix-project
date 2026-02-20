import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

/**
 * Integration workflow E2E tests for MCP Server
 * Tests complete workflows combining multiple tools and resources
 * Simulates real-world usage scenarios
 */

const workflowContract = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Counter {
    uint256 private count;
    address public owner;

    event CountIncremented(uint256 newCount);
    event CountDecremented(uint256 newCount);

    constructor() {
        owner = msg.sender;
        count = 0;
    }

    function increment() public {
        count += 1;
        emit CountIncremented(count);
    }

    function decrement() public {
        require(count > 0, "Count cannot be negative");
        count -= 1;
        emit CountDecremented(count);
    }

    function getCount() public view returns (uint256) {
        return count;
    }

    function reset() public {
        require(msg.sender == owner, "Only owner can reset");
        count = 0;
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

  /**
   * WORKFLOW 1: Complete contract development lifecycle
   * Write → Compile → Deploy → Interact → Debug
   */
  'Should complete full contract development workflow': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="remix-ai-assistant"]')
      // Step 1: Write contract - this will show the permission modal
      .execute(function (workflowContract) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (aiPlugin && aiPlugin.remixMCPServer) {
          aiPlugin.remixMCPServer.handleMessage({
            method: 'tools/call',
            params: {
              name: 'file_write',
              arguments: {
                path: 'workflows/Counter.sol',
                content: workflowContract
              }
            },
            id: 'workflow-write'
          });
        }
      }, [workflowContract])
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
      // Now continue with the rest of the workflow
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        const workflow = {
          contractPath: 'workflows/Counter.sol',
          contractName: 'Counter',
          deployedAddress: null,
          transactionHash: null,
          abi: null
        };

        // Step 2: Compile contract
        aiPlugin.remixMCPServer.handleMessage({
          method: 'tools/call',
          params: {
            name: 'solidity_compile',
            arguments: {
              file: workflow.contractPath
            }
          },
          id: 'workflow-compile'
        }).then(function (compileResult) {
          if (compileResult.error) throw new Error('Compile failed: ' + compileResult.error.message);
          const compileData = JSON.parse(compileResult.result?.content?.[0]?.text || '{}');
          // Extract ABI from compilation result
          const contractKey = Object.keys(compileData.contracts || {}).find(function(key) {
            return key.includes(workflow.contractName);
          });
          if (contractKey) {
            workflow.abi = compileData.contracts[contractKey].abi;
          }

          // Step 3: Deploy contract
          return aiPlugin.remixMCPServer.handleMessage({
            method: 'tools/call',
            params: {
              name: 'deploy_contract',
              arguments: {
                file: workflow.contractPath,
                contractName: workflow.contractName
              }
            },
            id: 'workflow-deploy'
          });
        }).then(function (deployResult) {
          if (deployResult.error) throw new Error('Deploy failed: ' + deployResult.error.message);
          const deployData = JSON.parse(deployResult.result?.content?.[0]?.text || '{}');
          workflow.deployedAddress = deployData.contractAddress;

          // Step 4: Call increment function
          return aiPlugin.remixMCPServer.handleMessage({
            method: 'tools/call',
            params: {
              name: 'call_contract',
              arguments: {
                address: workflow.deployedAddress,
                abi: workflow.abi,
                contractName: workflow.contractName,
                methodName: 'increment',
                args: []
              }
            },
            id: 'workflow-increment'
          });
        }).then(function (txResult) {
          if (txResult.error) throw new Error('Transaction failed: ' + txResult.error.message);
          const txData = JSON.parse(txResult.result?.content?.[0]?.text || '{}');
          workflow.transactionHash = txData.transactionHash;

          // Step 5: Read count value
          return aiPlugin.remixMCPServer.handleMessage({
            method: 'tools/call',
            params: {
              name: 'call_contract',
              arguments: {
                address: workflow.deployedAddress,
                abi: workflow.abi,
                contractName: workflow.contractName,
                methodName: 'getCount',
                args: []
              }
            },
            id: 'workflow-getcount'
          });
        }).then(function (callResult) {
          if (callResult.error) throw new Error('Call failed: ' + callResult.error.message);
          const callData = JSON.parse(callResult.result?.content?.[0]?.text || '{}');

          // Step 6: Read compilation resource
          return aiPlugin.remixMCPServer.handleMessage({
            method: 'resources/read',
            params: {
              uri: 'compilation://latest'
            },
            id: 'workflow-compilation-resource'
          }).then(function (resourceResult) {
            done({
              success: true,
              workflowCompleted: true,
              deployedAddress: workflow.deployedAddress,
              transactionHash: workflow.transactionHash,
              countValue: callData.returnValue,
              hasCompilationResource: !!resourceResult.result
            });
          });
        }).catch(function (error) {
          done({
            success: false,
            error: error.message,
            workflowCompleted: false
          });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Full workflow error:', data.error);
          return;
        }
        browser.assert.ok(data.workflowCompleted, 'Full development workflow should complete');
        browser.assert.ok(data.deployedAddress, 'Contract should be deployed');
        browser.assert.ok(data.transactionHash, 'Transaction should execute');
        console.log(`Workflow completed: Contract at ${data.deployedAddress}, Count = ${data.countValue}`);
      });
  },

  /**
   * WORKFLOW 2: Project exploration and analysis
   * List files → Read files → Compile → Analyze → Get resources
   */
  'Should complete project exploration workflow': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        const exploration = {
          files: [],
          contracts: [],
          resources: []
        };

        // Step 1: List project files
        aiPlugin.remixMCPServer.handleMessage({
          method: 'tools/call',
          params: {
            name: 'directory_list',
            arguments: {
              path: '/'
            }
          },
          id: 'explore-list'
        }).then(function (listResult) {
          if (listResult.error) throw new Error('Directory list failed: ' + (listResult.error.message || JSON.stringify(listResult.error)));
          const listData = JSON.parse(listResult.result?.content?.[0]?.text || '{}');
          exploration.files = listData.files || [];

          // Step 2: Read project structure resource
          return aiPlugin.remixMCPServer.handleMessage({
            method: 'resources/read',
            params: {
              uri: 'project://structure'
            },
            id: 'explore-structure'
          });
        }).then(function (structureResult) {
          if (structureResult.error) throw new Error('Structure read failed: ' + (structureResult.error.message || JSON.stringify(structureResult.error)));

          // Step 3: Get compilation results
          return aiPlugin.remixMCPServer.handleMessage({
            method: 'resources/read',
            params: {
              uri: 'compilation://contracts'
            },
            id: 'explore-contracts'
          });
        }).then(function (contractsResult) {
          if (contractsResult.error) throw new Error('Contracts read failed: ' + (contractsResult.error.message || JSON.stringify(contractsResult.error)));

          // Step 4: List all available resources
          return aiPlugin.remixMCPServer.handleMessage({
            method: 'resources/list',
            params: {},
            id: 'explore-resources'
          });
        }).then(function (resourcesResult) {
          if (resourcesResult.error) throw new Error('Resources list failed: ' + (resourcesResult.error.message || JSON.stringify(resourcesResult.error)));
          exploration.resources = resourcesResult.result?.resources || [];

          // Step 5: Get compiler config
          return aiPlugin.remixMCPServer.handleMessage({
            method: 'tools/call',
            params: {
              name: 'get_compiler_config',
              arguments: {}
            },
            id: 'explore-compiler-config'
          });
        }).then(function (configResult) {
          if (configResult.error) throw new Error('Compiler config failed: ' + (configResult.error.message || JSON.stringify(configResult.error)));
          const configData = JSON.parse(configResult.result?.content?.[0]?.text || '{}');

          done({
            success: true,
            explorationCompleted: true,
            filesFound: exploration.files.length,
            resourcesFound: exploration.resources.length,
            hasCompilerConfig: !!configData.config
          });
        }).catch(function (error) {
          done({
            success: false,
            error: error.message
          });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Exploration workflow error:', data.error);
          return;
        }
        browser.assert.ok(data.explorationCompleted, 'Exploration workflow should complete');
        console.log(`Exploration: ${data.filesFound} files, ${data.resourcesFound} resources`);
      });
  },

  /**
   * WORKFLOW 3: Environment configuration and deployment
   * Set environment → Get accounts → Set account → Deploy → Verify
   */
  'Should complete environment setup and deployment workflow': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        const envWorkflow = {
          environment: 'vm-cancun',
          accounts: [],
          selectedAccount: null,
          deployedContracts: [],
          balance:null
        };

        // Step 1: Set execution environment
        aiPlugin.remixMCPServer.handleMessage({
          method: 'tools/call',
          params: {
            name: 'set_execution_environment',
            arguments: {
              environment: envWorkflow.environment
            }
          },
          id: 'env-set-environment'
        }).then(function (envResult) {
          if (envResult.error) throw new Error('Set environment failed: ' + (envResult.error.message || JSON.stringify(envResult.error)));

          // Step 2: Get user accounts
          return aiPlugin.remixMCPServer.handleMessage({
            method: 'tools/call',
            params: {
              name: 'get_user_accounts',
              arguments: {}
            },
            id: 'env-get-accounts'
          });
        }).then(function (accountsResult) {
          if (accountsResult.error) throw new Error('Get accounts failed: ' + (accountsResult.error.message || JSON.stringify(accountsResult.error)));
          const accountsData = JSON.parse(accountsResult.result?.content?.[0]?.text || '{}');
          envWorkflow.accounts = accountsData.accounts || [];
          envWorkflow.selectedAccount = envWorkflow.accounts[4]?.address || envWorkflow.accounts[4];

          // Step 3: Set selected account
          return aiPlugin.remixMCPServer.handleMessage({
            method: 'tools/call',
            params: {
              name: 'set_selected_account',
              arguments: {
                address: envWorkflow.selectedAccount
              }
            },
            id: 'env-set-account'
          });
        }).then(function (setAccountResult) {
          if (setAccountResult.error) throw new Error('Set account failed: ' + (setAccountResult.error.message || JSON.stringify(setAccountResult.error)));

          // Step 4: Get account balance
          return aiPlugin.remixMCPServer.handleMessage({
            method: 'tools/call',
            params: {
              name: 'get_account_balance',
              arguments: {
                account: envWorkflow.selectedAccount
              }
            },
            id: 'env-get-balance'
          });
        }).then(function (balanceResult) {
          if (balanceResult.error) throw new Error('Get balance failed: ' + (balanceResult.error.message || JSON.stringify(balanceResult.error)));
          const balanceData = JSON.parse(balanceResult.result?.content?.[0]?.text || '{}');
          envWorkflow.balance = balanceData
          // Step 5: Get current environment
          return aiPlugin.remixMCPServer.handleMessage({
            method: 'tools/call',
            params: {
              name: 'get_current_environment',
              arguments: {}
            },
            id: 'env-get-current'
          });
        }).then(function (currentEnvResult) {
          if (currentEnvResult.isError) throw new Error('Get current environment failed: ' + (currentEnvResult.error.message || JSON.stringify(currentEnvResult.error)));
          const currentEnvData = JSON.parse(currentEnvResult.result?.content?.[0]?.text || '{}');

          // Step 6: Get deployed contracts
          return aiPlugin.remixMCPServer.handleMessage({
            method: 'tools/call',
            params: {
              name: 'get_deployed_contracts',
              arguments: {}
            },
            id: 'env-get-deployed'
          });
        }).then(function (deployedResult) {
          if (deployedResult.error) throw new Error('Get deployed contracts failed: ' + (deployedResult.error.message || JSON.stringify(deployedResult.error)));
          const deployedData = JSON.parse(deployedResult.result?.content?.[0]?.text || '{}');
          envWorkflow.deployedContracts = deployedData.contracts || [];

          done({
            success: true,
            workflowCompleted: true,
            environmentSet: true,
            accountsCount: envWorkflow.accounts.length,
            selectedAccount: envWorkflow.selectedAccount,
            deployedContractsCount: envWorkflow.deployedContracts.length
          });
        }).catch(function (error) {
          done({
            success: false,
            error: error.message
          });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Environment workflow error:', data.error);
          return;
        }
        browser.assert.ok(data.workflowCompleted, 'Environment workflow should complete');
        browser.assert.ok(data.accountsCount > 0, 'Should have accounts');
        console.log(`Environment setup: ${data.accountsCount} accounts, ${data.deployedContractsCount} deployed contracts`);
      });
  },

  /**
   * WORKFLOW 4: File management operations
   * Create directory → Write files → Copy → Move → Delete
   */
  'Should complete file management workflow': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        const basePath = 'test_workflow';
        const steps = [];

        // Step 1: Create original file
        aiPlugin.remixMCPServer.handleMessage({
          method: 'tools/call',
          params: {
            name: 'file_write',
            arguments: {
              path: basePath + '/original.txt',
              content: 'Original content'
            }
          },
          id: 'filemgmt-create'
        }).then(function (createResult) {
          if (createResult.error) throw new Error('Create file failed: ' + (createResult.error.message || JSON.stringify(createResult.error)));
          steps.push('create');

          // Step 2: Copy file
          return aiPlugin.remixMCPServer.handleMessage({
            method: 'tools/call',
            params: {
              name: 'file_copy',
              arguments: {
                from: basePath + '/original.txt',
                to: basePath + '/copy.txt'
              }
            },
            id: 'filemgmt-copy'
          });
        }).then(function (copyResult) {
          if (copyResult.error) throw new Error('Copy file failed: ' + (copyResult.error.message || JSON.stringify(copyResult.error)));
          steps.push('copy');

          // Step 3: Read copied file
          return aiPlugin.remixMCPServer.handleMessage({
            method: 'tools/call',
            params: {
              name: 'file_read',
              arguments: {
                path: basePath + '/copy.txt'
              }
            },
            id: 'filemgmt-read'
          });
        }).then(function (readResult) {
          if (readResult.error) throw new Error('Read file failed: ' + (readResult.error.message || JSON.stringify(readResult.error)));
          steps.push('read');

          // Step 4: Move file
          return aiPlugin.remixMCPServer.handleMessage({
            method: 'tools/call',
            params: {
              name: 'file_move',
              arguments: {
                from: basePath + '/copy.txt',
                to: basePath + '/moved.txt'
              }
            },
            id: 'filemgmt-move'
          });
        }).then(function (moveResult) {
          if (moveResult.error) throw new Error('Move file failed: ' + (moveResult.error.message || JSON.stringify(moveResult.error)));
          steps.push('move');

          // Step 5: List directory
          return aiPlugin.remixMCPServer.handleMessage({
            method: 'tools/call',
            params: {
              name: 'directory_list',
              arguments: {
                path: basePath
              }
            },
            id: 'filemgmt-list'
          });
        }).then(function (listResult) {
          if (listResult.error) throw new Error('List directory failed: ' + (listResult.error.message || JSON.stringify(listResult.error)));
          steps.push('list');
          const listData = JSON.parse(listResult.result?.content?.[0]?.text || '{}');

          // Step 6: Delete files
          return Promise.all([
            aiPlugin.remixMCPServer.handleMessage({
              method: 'tools/call',
              params: {
                name: 'file_delete',
                arguments: { path: basePath + '/original.txt' }
              },
              id: 'filemgmt-delete1'
            }),
            aiPlugin.remixMCPServer.handleMessage({
              method: 'tools/call',
              params: {
                name: 'file_delete',
                arguments: { path: basePath + '/moved.txt' }
              },
              id: 'filemgmt-delete2'
            })
          ]).then(function () {
            steps.push('delete');

            done({
              success: true,
              workflowCompleted: true,
              stepsCompleted: steps,
              totalSteps: steps.length,
              filesInDir: listData.files?.length || 0
            });
          });
        }).catch(function (error) {
          done({
            success: false,
            error: error.message,
            stepsCompleted: steps
          });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('File management workflow error:', data.error);
          console.log('Steps completed before error:', data.stepsCompleted?.join(', '));
          return;
        }
        browser.assert.ok(data.workflowCompleted, 'File management workflow should complete');
        console.log(`File operations: ${data.stepsCompleted.join(' → ')}`);
      });
  },

  /**
   * WORKFLOW 5: Compilation configuration and multi-file compilation
   * Set compiler config → Write multiple contracts → Compile all → Verify
   */
  'Should complete multi-file compilation workflow': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        const contract1 = '// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\ncontract A { uint256 public x = 1; }';
        const contract2 = '// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\ncontract B { uint256 public y = 2; }';

        // Step 1: Set compiler config
        aiPlugin.remixMCPServer.handleMessage({
          method: 'tools/call',
          params: {
            name: 'set_compiler_config',
            arguments: {
              version: '0.8.20',
              optimize: true,
              runs: 200
            }
          },
          id: 'multicomp-config'
        }).then(function (configResult) {
          if (configResult.error) throw new Error('Set compiler config failed: ' + (configResult.error.message || JSON.stringify(configResult.error)));

          // Step 2: Write first contract
          return aiPlugin.remixMCPServer.handleMessage({
            method: 'tools/call',
            params: {
              name: 'file_write',
              arguments: {
                path: 'multicomp/ContractA.sol',
                content: contract1
              }
            },
            id: 'multicomp-write1'
          });
        }).then(function (write1Result) {
          if (write1Result.error) throw new Error('Write ContractA failed: ' + (write1Result.error.message || JSON.stringify(write1Result.error)));

          // Step 3: Write second contract
          return aiPlugin.remixMCPServer.handleMessage({
            method: 'tools/call',
            params: {
              name: 'file_write',
              arguments: {
                path: 'multicomp/ContractB.sol',
                content: contract2
              }
            },
            id: 'multicomp-write2'
          });
        }).then(function (write2Result) {
          if (write2Result.error) throw new Error('Write ContractB failed: ' + (write2Result.error.message || JSON.stringify(write2Result.error)));

          // Step 4: Compile first contract
          return aiPlugin.remixMCPServer.handleMessage({
            method: 'tools/call',
            params: {
              name: 'solidity_compile',
              arguments: {
                file: 'multicomp/ContractA.sol'
              }
            },
            id: 'multicomp-compile-a'
          });
        }).then(function (compileResultA) {
          if (compileResultA.error) throw new Error('Compile ContractA failed: ' + (compileResultA.error.message || JSON.stringify(compileResultA.error)));

          // Step 5: Compile second contract
          return aiPlugin.remixMCPServer.handleMessage({
            method: 'tools/call',
            params: {
              name: 'solidity_compile',
              arguments: {
                file: 'multicomp/ContractB.sol'
              }
            },
            id: 'multicomp-compile-b'
          });
        }).then(function (compileResult) {
          if (compileResult.error) throw new Error('Compile ContractB failed: ' + (compileResult.error.message || JSON.stringify(compileResult.error)));
          const compileData = JSON.parse(compileResult.result?.content?.[0]?.text || '{}');

          // Step 6: Get compilation result
          return aiPlugin.remixMCPServer.handleMessage({
            method: 'tools/call',
            params: {
              name: 'get_compilation_result',
              arguments: {}
            },
            id: 'multicomp-get-result'
          });
        }).then(function (resultData) {
          if (resultData.error) throw new Error('Get compilation result failed: ' + (resultData.error.message || JSON.stringify(resultData.error)));
          const result = JSON.parse(resultData.result?.content?.[0]?.text || '{}');

          // Step 7: Read compilation resources
          return Promise.all([
            aiPlugin.remixMCPServer.handleMessage({
              method: 'resources/read',
              params: { uri: 'compilation://contracts' },
              id: 'multicomp-resource1'
            }),
            aiPlugin.remixMCPServer.handleMessage({
              method: 'resources/read',
              params: { uri: 'contract://A' },
              id: 'multicomp-resource2'
            }),
            aiPlugin.remixMCPServer.handleMessage({
              method: 'resources/read',
              params: { uri: 'contract://B' },
              id: 'multicomp-resource3'
            })
          ]);
        }).then(function (resources) {
          done({
            success: true,
            workflowCompleted: true,
            resourcesRead: resources.length,
            allResourcesSucceeded: resources.every(function (r) { return !r.error; })
          });
        }).catch(function (error) {
          done({
            success: false,
            error: error.message
          });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Multi-compilation workflow error:', data.error);
          return;
        }
        browser.assert.ok(data.workflowCompleted, 'Multi-file compilation workflow should complete');
        console.log(`Compiled multiple contracts and read ${data.resourcesRead} resources`);
      });
  }
};
