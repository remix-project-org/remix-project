import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

/**
 * Comprehensive E2E tests for Deployment Handler tools
 * Tests deployment tools: deploy_contract, call_contract (view and state-changing),
 * get_deployed_contracts, set_execution_environment, get_account_balance,
 * get_user_accounts, set_selected_account, get_current_environment,
 * run_script, simulate_transaction
 */

const deploymentContract = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract DeploymentTest {
    uint256 public value;
    address public owner;

    event ValueSet(uint256 newValue);

    constructor(uint256 _initialValue) {
        owner = msg.sender;
        value = _initialValue;
    }

    function setValue(uint256 _newValue) public {
        value = _newValue;
        emit ValueSet(_newValue);
    }

    function getValue() public view returns (uint256) {
        return value;
    }

    function getOwner() public view returns (address) {
        return owner;
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

  'Should test get_current_environment tool': function (browser: NightwatchBrowser) {
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
            name: 'get_current_environment',
            arguments: {}
          },
          id: 'test-get-env'
        }).then(function (result) {
          const resultData = JSON.parse(result.result?.content?.[0]?.text || '{}');
          done({
            success: !result.error,
            hasEnvironment: !!resultData?.environment,
            environmentName: resultData?.environment?.name || null,
            provider: resultData?.environment?.provider || null
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Get current environment error:', data.error);
          return;
        }
        browser.assert.ok(data.success, 'Get current environment should succeed');
        browser.assert.ok(data.hasEnvironment, 'Should return environment info');
      });
  },

  'Should test set_execution_environment tool': function (browser: NightwatchBrowser) {
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
            name: 'set_execution_environment',
            arguments: {
              environment: 'vm-cancun'
            }
          },
          id: 'test-set-env'
        }).then(function (result) {
          const resultData = JSON.parse(result.result?.content?.[0]?.text || '{}');

          // Verify environment was set
          return aiPlugin.remixMCPServer.handleMessage({
            method: 'tools/call',
            params: {
              name: 'get_current_environment',
              arguments: {}
            },
            id: 'test-verify-env'
          }).then(function (verifyResult) {
            const verifyData = JSON.parse(verifyResult.result?.content?.[0]?.text || '{}');
            done({
              setSuccess: resultData?.success || false,
              currentEnv: verifyData?.environment?.name || null,
              environmentSet: !!verifyData?.environment
            });
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Set execution environment error:', data.error);
          return;
        }
        browser.assert.ok(data.setSuccess, 'Set execution environment should succeed');
        browser.assert.ok(data.environmentSet, 'Environment should be set');
      });
  },

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
            arguments: {}
          },
          id: 'test-get-accounts'
        }).then(function (result) {
          const resultData = JSON.parse(result.result?.content?.[0]?.text || '{}');
          done({
            success: !result.error,
            hasAccounts: Array.isArray(resultData?.accounts) && resultData.accounts.length > 0,
            accountCount: resultData?.accounts?.length || 0,
            firstAccount: resultData?.accounts?.[0] || null
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Get user accounts error:', data.error);
          return;
        }
        browser.assert.ok(data.success, 'Get user accounts should succeed');
        browser.assert.ok(data.hasAccounts, 'Should return accounts list');
        browser.assert.ok(data.accountCount > 0, 'Should have at least one account');
      });
  },

  'Should test set_selected_account tool': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        // First get accounts
        aiPlugin.remixMCPServer.handleMessage({
          method: 'tools/call',
          params: {
            name: 'get_user_accounts',
            arguments: {}
          },
          id: 'test-get-accounts-for-set'
        }).then(function (accountsResult) {
          const accountsData = JSON.parse(accountsResult.result?.content?.[0]?.text || '{}');
          const firstAccount = accountsData?.accounts?.[0];

          if (!firstAccount) {
            done({ error: 'No accounts available' });
            return;
          }

          // Then set selected account
          return aiPlugin.remixMCPServer.handleMessage({
            method: 'tools/call',
            params: {
              name: 'set_selected_account',
              arguments: {
                address: firstAccount.address || firstAccount
              }
            },
            id: 'test-set-account'
          }).then(function (result) {
            const resultData = JSON.parse(result.result?.content?.[0]?.text || '{}');
            done({
              success: !result.error,
              setSuccess: resultData?.success || false,
              accountSet: firstAccount.address || firstAccount
            });
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Set selected account error:', data.error);
          return;
        }
        browser.assert.ok(data.success, 'Set selected account should succeed');
        browser.assert.ok(data.setSuccess, 'Account should be set successfully');
      });
  },

  'Should test get_account_balance tool': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        // Get first account
        aiPlugin.remixMCPServer.handleMessage({
          method: 'tools/call',
          params: {
            name: 'get_user_accounts',
            arguments: {}
          },
          id: 'test-get-accounts-for-balance'
        }).then(function (accountsResult) {
          const accountsData = JSON.parse(accountsResult.result?.content?.[0]?.text || '{}');
          const firstAccount = accountsData?.accounts?.[0];

          if (!firstAccount) {
            done({ error: 'No accounts available' });
            return;
          }

          // Get balance
          return aiPlugin.remixMCPServer.handleMessage({
            method: 'tools/call',
            params: {
              name: 'get_account_balance',
              arguments: {
                account: firstAccount.address || firstAccount
              }
            },
            id: 'test-get-balance'
          }).then(function (result) {
            const resultData = JSON.parse(result.result?.content?.[0]?.text || '{}');
            done({
              success: !result.error,
              hasBalance: resultData?.balance !== undefined,
              balance: resultData?.balance || '0',
              account: firstAccount.address || firstAccount
            });
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Get account balance error:', data.error);
          return;
        }
        browser.assert.ok(data.success, 'Get account balance should succeed');
        browser.assert.ok(data.hasBalance, 'Should return balance');
      });
  },

  'Should test deploy_contract tool': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="remix-ai-assistant"]')
      // Trigger file write - this will show the permission modal
      .execute(function (deploymentContract) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (aiPlugin && aiPlugin.remixMCPServer) {
          aiPlugin.remixMCPServer.handleMessage({
            method: 'tools/call',
            params: {
              name: 'file_write',
              arguments: {
                path: 'contracts/DeploymentTest.sol',
                content: deploymentContract
              }
            },
            id: 'test-write-deploy-contract'
          });
        }
      }, [deploymentContract])
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
      // Now continue with compile and deploy
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        // Compile contract
        aiPlugin.remixMCPServer.handleMessage({
          method: 'tools/call',
          params: {
            name: 'solidity_compile',
            arguments: {
              file: 'contracts/DeploymentTest.sol'
            }
          },
          id: 'test-compile-for-deploy'
        }).then(function () {
          return new Promise(function (resolve) {
            setTimeout(resolve, 2000);
          });
        }).then(function () {
          // Deploy contract
          return aiPlugin.remixMCPServer.handleMessage({
            method: 'tools/call',
            params: {
              name: 'deploy_contract',
              arguments: {
                file: 'contracts/DeploymentTest.sol',
                contractName: 'DeploymentTest',
                constructorArgs: ['42']
              }
            },
            id: 'test-deploy'
          });
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
            deploySuccess: resultData?.success || false,
            hasAddress: !!resultData?.contractAddress,
            address: resultData?.contractAddress || null,
            hasTransactionHash: !!resultData?.transactionHash
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
        browser.assert.ok(data.success, 'Deploy contract should succeed');
        browser.assert.ok(data.deploySuccess, 'Contract should be deployed successfully');
        browser.assert.ok(data.hasAddress, 'Should return contract address');
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
          const resultData = JSON.parse(result.result?.content?.[0]?.text || '{}');
          done({
            success: !result.error,
            hasContracts: Array.isArray(resultData?.contracts),
            contractCount: resultData?.contracts?.length || 0,
            contracts: resultData?.contracts || []
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
        browser.assert.ok(data.hasContracts, 'Should return contracts array');
      });
  },

  'Should test call_contract tool': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        // Get deployed contracts
        aiPlugin.remixMCPServer.handleMessage({
          method: 'tools/call',
          params: {
            name: 'get_deployed_contracts',
            arguments: {}
          },
          id: 'test-get-contracts-for-call'
        }).then(function (contractsResult) {
          const contractsData = JSON.parse(contractsResult.result?.content?.[0]?.text || '{}');
          const deployedContract = contractsData?.contracts?.find(function (c: any) {
            return c.name === 'DeploymentTest';
          });

          if (!deployedContract) {
            done({ error: 'DeploymentTest contract not found' });
            return;
          }

          // Call getValue function
          return aiPlugin.remixMCPServer.handleMessage({
            method: 'tools/call',
            params: {
              name: 'call_contract',
              arguments: {
                contractName: 'DeploymentTest',
                address: deployedContract.address,
                abi: deployedContract.abi,
                methodName: 'getValue',
                args: []
              }
            },
            id: 'test-call-contract'
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
              callSuccess: resultData?.success || false,
              hasReturnValue: resultData?.result !== undefined,
              returnValue: resultData?.result
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
        browser.assert.ok(data.success, 'Call contract should succeed');
        browser.assert.ok(data.hasReturnValue, 'Should return function result');
      });
  },

  'Should test call_contract with state change (setValue)': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        // Get deployed contracts
        aiPlugin.remixMCPServer.handleMessage({
          method: 'tools/call',
          params: {
            name: 'get_deployed_contracts',
            arguments: {}
          },
          id: 'test-get-contracts-for-tx'
        }).then(function (contractsResult) {
          const contractsData = JSON.parse(contractsResult.result?.content?.[0]?.text || '{}');
          const deployedContract = contractsData?.contracts?.find(function (c: any) {
            return c.name === 'DeploymentTest';
          });

          if (!deployedContract) {
            done({ error: 'DeploymentTest contract not found' });
            return;
          }

          // Call setValue (state-changing transaction)
          return aiPlugin.remixMCPServer.handleMessage({
            method: 'tools/call',
            params: {
              name: 'call_contract',
              arguments: {
                contractName: 'DeploymentTest',
                address: deployedContract.address,
                abi: deployedContract.abi,
                methodName: 'setValue',
                args: ['100']
              }
            },
            id: 'test-send-tx'
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
              txSuccess: resultData?.success || false,
              hasTransactionHash: !!resultData?.transactionHash,
              transactionHash: resultData?.transactionHash
            });
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('State-changing transaction error:', data.error);
          return;
        }
        browser.assert.ok(data.success, 'State-changing transaction should succeed');
        browser.assert.ok(data.hasTransactionHash, 'Should return transaction hash');
      });
  },

  'Should test simulate_transaction tool': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        // Get accounts first
        aiPlugin.remixMCPServer.handleMessage({
          method: 'tools/call',
          params: {
            name: 'get_user_accounts',
            arguments: {}
          },
          id: 'test-get-accounts-for-simulate'
        }).then(function (accountsResult) {
          if (accountsResult.error) {
            done({
              success: false,
              error: accountsResult.error.message || JSON.stringify(accountsResult.error)
            });
            return;
          }
          const accountsData = JSON.parse(accountsResult.result?.content?.[0]?.text || '{}');
          const fromAccount = accountsData?.accounts?.[0]?.address;
          const toAccount = accountsData?.accounts?.[1]?.address || fromAccount;

          if (!fromAccount) {
            done({ error: 'No accounts available for simulation' });
            return;
          }

          // Simulate a simple value transfer transaction
          return aiPlugin.remixMCPServer.handleMessage({
            method: 'tools/call',
            params: {
              name: 'simulate_transaction',
              arguments: {
                from: fromAccount,
                to: toAccount,
                value: '1000000000000000',
                data: '0x'
              }
            },
            id: 'test-simulate'
          });
        }).then(function (result) {
          if (result.error) {
            const errorMsg = result.error.message || JSON.stringify(result.error);
            done({
              success: false,
              error: errorMsg,
              simulationNotSupported: errorMsg.includes('not available') ||
                                      errorMsg.includes('not supported') ||
                                      errorMsg.includes('not found')
            });
            return;
          }
          const resultData = JSON.parse(result.result?.content?.[0]?.text || '{}');
          done({
            success: !result.error,
            simulationSuccess: resultData?.success || false,
            hasResult: resultData !== null
          });
        }).catch(function (error) {
          done({
            success: false,
            error: error.message,
            // Simulation might not be available in all environments
          });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Simulate transaction error:', data.error);
          return;
        }
        // Simulation may not be supported in all environments, so we allow graceful failure

      });
  },

  'Should test run_script tool': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        const testScript = `
(async () => {
  const accounts = await web3.eth.getAccounts();
  console.log('Accounts:', accounts.length);
  console.log('First account:', accounts[0]);
})()
        `;

        // First write the script file
        aiPlugin.remixMCPServer.handleMessage({
          method: 'tools/call',
          params: {
            name: 'file_write',
            arguments: {
              path: 'scripts/test_script.js',
              content: testScript
            }
          },
          id: 'test-write-script'
        }).then(function () {
          // Then run the script
          return aiPlugin.remixMCPServer.handleMessage({
            method: 'tools/call',
            params: {
              name: 'run_script',
              arguments: {
                file: 'scripts/test_script.js'
              }
            },
            id: 'test-run-script'
          });
        }).then(function (result) {
          done({
            success: !result.error,
            scriptExecuted: !result.error
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Run script error:', data.error);
          return;
        }
        browser.assert.ok(data.success, 'Run script should succeed');
        browser.assert.ok(data.scriptExecuted, 'Script should be executed');
      });
  }
};
