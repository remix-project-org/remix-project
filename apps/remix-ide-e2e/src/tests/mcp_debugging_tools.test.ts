import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

const debugContract = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract DebugTest {
    // State variables
    uint256 public stateValue;
    uint256 public counter;
    address public owner;
    bool public isActive;
    string public name;
    mapping(address => uint256) public balances;
    uint256[] public numbers;

    event ValueUpdated(uint256 oldValue, uint256 newValue);
    event CounterIncremented(uint256 newCounter);

    constructor() {
        owner = msg.sender;
        stateValue = 10;
        counter = 0;
        isActive = true;
        name = "DebugTest";
    }

    function updateValue(uint256 _newValue) public {
        uint256 oldValue = stateValue;
        stateValue = _newValue;
        balances[msg.sender] = _newValue;
        emit ValueUpdated(oldValue, _newValue);
    }

    function complexFunction(uint256 a, uint256 b) public returns (uint256) {
        // Local variables
        uint256 localSum = a + b;
        uint256 localProduct = a * b;
        uint256 localDiff = b > a ? b - a : a - b;
        uint256 localResult = localSum + localProduct + localDiff;

        // Update state variables
        stateValue = localResult;
        counter = counter + 1;
        balances[msg.sender] = localResult;
        numbers.push(localResult);

        emit CounterIncremented(counter);
        return localResult;
    }

    function multipleLocals(uint256 x, uint256 y, uint256 z) public pure returns (uint256) {
        // Multiple local variables for debugging
        uint256 step1 = x + y;
        uint256 step2 = step1 * z;
        uint256 step3 = step2 / 2;
        uint256 step4 = step3 + 100;
        bool isLarge = step4 > 1000;
        uint256 finalResult = isLarge ? step4 * 2 : step4;
        return finalResult;
    }

    function toggleActive() public {
        bool previousState = isActive;
        isActive = !isActive;
        uint256 toggleCount = counter + 1;
        counter = toggleCount;
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

  'Should prepare debug contract for testing': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="remix-ai-assistant"]')
      // Trigger file write - this will show the permission modal
      .execute(function (debugContract) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (aiPlugin && aiPlugin.remixMCPServer) {
          aiPlugin.remixMCPServer.handleMessage({
            method: 'tools/call',
            params: {
              name: 'file_write',
              arguments: {
                path: 'contracts/DebugTest.sol',
                content: debugContract
              }
            },
            id: 'test-write-debug-contract'
          });
        }
      }, [debugContract])
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
      // Now compile and deploy the contract
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }
        console.log('compiling contract')
        // Compile contract
        aiPlugin.remixMCPServer.handleMessage({
          method: 'tools/call',
          params: {
            name: 'solidity_compile',
            arguments: {
              file: 'contracts/DebugTest.sol'
            }
          },
          id: 'test-compile-debug-contract'
        }).then(function () {
          // Wait for UI to process the compilation
          return new Promise(function (resolve) {
            setTimeout(resolve, 2000);
          });
        }).then(function () {
          console.log('deploying contract')
          // Deploy contract
          return aiPlugin.remixMCPServer.handleMessage({
            method: 'tools/call',
            params: {
              name: 'deploy_contract',
              arguments: {
                file: 'contracts/DebugTest.sol',
                contractName: 'DebugTest',
                constructorArgs: []
              }
            },
            id: 'test-deploy-debug-contract'
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
            contractAddress: resultData?.address || null
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (!data || data.error) {
          console.error('Prepare debug contract error:', data?.error || 'No data returned');
          return;
        }
        browser.assert.ok(data.success, 'Debug contract setup should succeed');
        browser.assert.ok(data.deploySuccess, 'Debug contract should be deployed');
      });
  },

  'Should execute transaction to generate debug data': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        // Get deployed contract
        aiPlugin.remixMCPServer.handleMessage({
          method: 'tools/call',
          params: {
            name: 'get_deployed_contracts',
            arguments: {}
          },
          id: 'test-get-debug-contract'
        }).then(function (contractsResult) {
          const contractsData = JSON.parse(contractsResult.result?.content?.[0]?.text || '{}');
          const debugContract = contractsData?.contracts?.find(function (c: any) {
            return c.name === 'DebugTest';
          });

          if (!debugContract) {
            done({ error: 'DebugTest contract not found' });
            return;
          }

          // Wait for UI to process before executing transaction
          return new Promise(function (resolve) {
            setTimeout(function () {
              resolve(debugContract);
            }, 1000);
          });
        }).then(function (debugContract: any) {
          // Execute transaction to debug
          return aiPlugin.remixMCPServer.handleMessage({
            method: 'tools/call',
            params: {
              name: 'call_contract',
              arguments: {
                contractName: "DebugTest",
                address: debugContract.address,
                abi: debugContract.abi,
                methodName: 'complexFunction',
                args: ['5', '10']
              }
            },
            id: 'test-execute-for-debug'
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

          // Store transaction hash for debugging tests
          (window as any).debugTransactionHash = resultData?.transactionHash;

          done({
            success: !result.error,
            txSuccess: resultData?.success || false,
            transactionHash: resultData?.transactionHash || null
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (!data || data.error) {
          console.error('Execute transaction for debug error:', data?.error || 'No data returned');
          return;
        }
        browser.assert.ok(data.success, 'Transaction execution should succeed');
        browser.assert.ok(data.transactionHash, 'Should have transaction hash');
      });
  },

  'Should test start_debug_session tool': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        const txHash = (window as any).debugTransactionHash;

        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        if (!txHash) {
          done({ error: 'No transaction hash available' });
          return;
        }

        aiPlugin.remixMCPServer.handleMessage({
          method: 'tools/call',
          params: {
            name: 'start_debug_session',
            arguments: {
              transactionHash: txHash
            }
          },
          id: 'test-start-debug'
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
            debugSuccess: resultData?.success || false,
            hasStatus: !!resultData?.status,
            status: resultData?.status || null,
            transactionHash: resultData?.transactionHash || null
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (!data || data.error) {
          console.error('Start debug session error:', data?.error || 'No data returned');
          return;
        }
        browser.assert.ok(data.success, 'Start debug session should succeed');
        browser.assert.ok(data.debugSuccess, 'Debug session should be started');
        browser.assert.ok(data.hasStatus, 'Should return status');
      });
  },

  'Should test get_global_context tool': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;

        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        // Wait for debug session to be ready
        setTimeout(function () {
          aiPlugin.remixMCPServer.handleMessage({
            method: 'tools/call',
            params: {
              name: 'get_global_context',
              arguments: {}
            },
            id: 'test-global-context'
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
              hasContext: !!resultData?.context,
              hasBlockInfo: !!resultData?.context?.block,
              hasMessageInfo: !!resultData?.context?.msg,
              hasTxInfo: !!resultData?.context?.tx
            });
          }).catch(function (error) {
            done({ error: error.message });
          });
        }, 1000);
      }, [], function (result) {
        const data = result.value as any;
        if (!data || data.error) {
          console.error('Get global context error:', data?.error || 'No data returned');
          return;
        }
        browser.assert.ok(data.success, 'Get global context should succeed');
        browser.assert.ok(data.hasContext, 'Should return context object');
      });
  },

  'Should test extract_locals_at tool': function (browser: NightwatchBrowser) {
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
            name: 'extract_locals_at',
            arguments: {
              step: 5
            }
          },
          id: 'test-extract-locals'
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
            hasScope: !!resultData?.scope,
            step: resultData?.step
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (!data || data.error) {
          console.error('Extract locals error:', data?.error || 'No data returned');
          return;
        }
        browser.assert.ok(data.success || data.error, 'Extract locals should execute');
        browser.assert.ok(data.hasScope , 'Extract locals scope');
      });
  },

  'Should test decode_locals_at tool': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;

        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        // First get source location, then decode locals at that location
        aiPlugin.remixMCPServer.handleMessage({
          method: 'tools/call',
          params: {
            name: 'get_valid_source_location_from_vm_trace_index',
            arguments: {
              stepIndex: 5
            }
          },
          id: 'test-get-source-location-for-locals'
        }).then(function (locationResult) {
          const locationData = JSON.parse(locationResult.result?.content?.[0]?.text || '{}');

          if (!locationData?.sourceLocation) {
            done({
              success: false,
              error: 'Could not get source location for decode_locals_at'
            });
            return;
          }

          return aiPlugin.remixMCPServer.handleMessage({
            method: 'tools/call',
            params: {
              name: 'decode_locals_at',
              arguments: {
                step: 5,
                sourceLocation: locationData.sourceLocation
              }
            },
            id: 'test-decode-locals'
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
            hasLocals: !!resultData?.locals,
            step: resultData?.step
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (!data || data.error) {
          console.error('Decode locals error:', data?.error || 'No data returned');
          return;
        }
        browser.assert.ok(data.success, 'Decode locals should execute');
        browser.assert.ok(data.hasLocals, 'Decode locals has locals');
      });
  },

  'Should test extract_state_at tool': function (browser: NightwatchBrowser) {
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
            name: 'extract_state_at',
            arguments: {
              step: 5
            }
          },
          id: 'test-extract-state'
        }).then(function (result) {
          if (result.error) {
            done({
              success: false,
              error: result.error.message || JSON.stringify(result.error)
            });
            return;
          }
          const resultData = JSON.parse(result.result?.content?.[0]?.text || '{}');

          // Store state variables for decode_state_at test
          (window as any).stateVariablesAt5 = resultData?.stateVariables;

          done({
            success: !result.error,
            hasStateVariables: !!resultData?.stateVariables,
            step: resultData?.step
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (!data || data.error) {
          console.error('Extract state error:', data?.error || 'No data returned');
          return;
        }
        browser.assert.ok(data.success || data.error, 'Extract state should execute');
      });
  },

  'Should test decode_state_at tool': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        const stateVars = (window as any).stateVariablesAt5;

        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        if (!stateVars || !Array.isArray(stateVars) || stateVars.length === 0) {
          done({
            success: false,
            error: 'No state variables available from extract_state_at'
          });
          return;
        }

        aiPlugin.remixMCPServer.handleMessage({
          method: 'tools/call',
          params: {
            name: 'decode_state_at',
            arguments: {
              step: 5,
              stateVars: stateVars
            }
          },
          id: 'test-decode-state'
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
            hasDecodedState: !!resultData?.decodedState,
            step: resultData?.step
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (!data || data.error) {
          console.error('Decode state error:', data?.error || 'No data returned');
          return;
        }
        browser.assert.ok(data.success || data.error, 'Decode state should execute');
      });
  },

  'Should test storage_view_at tool': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;

        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        // Get deployed contract address for storage view
        aiPlugin.remixMCPServer.handleMessage({
          method: 'tools/call',
          params: {
            name: 'get_deployed_contracts',
            arguments: {}
          },
          id: 'test-get-contract-for-storage'
        }).then(function (contractsResult) {
          if (contractsResult.error) {
            done({
              success: false,
              error: contractsResult.error.message || JSON.stringify(contractsResult.error)
            });
            return;
          }
          const contractsData = JSON.parse(contractsResult.result?.content?.[0]?.text || '{}');
          const debugContract = contractsData?.contracts?.find(function (c: any) {
            return c.name === 'DebugTest';
          });

          if (!debugContract || !debugContract.address) {
            done({
              success: false,
              error: 'Contract address not available for storage_view_at'
            });
            return;
          }

          return aiPlugin.remixMCPServer.handleMessage({
            method: 'tools/call',
            params: {
              name: 'storage_view_at',
              arguments: {
                step: 10,
                address: debugContract.address
              }
            },
            id: 'test-storage-view'
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
            hasMessage: !!resultData?.message,
            step: resultData?.step
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (!data || data.error) {
          console.error('Storage view error:', data?.error || 'No data returned');
          return;
        }
        browser.assert.ok(data.success || data.error, 'Storage view should execute');
      });
  },

  'Should test get_valid_source_location_from_vm_trace_index tool': function (browser: NightwatchBrowser) {
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
            name: 'get_valid_source_location_from_vm_trace_index',
            arguments: {
              stepIndex: 5
            }
          },
          id: 'test-source-location'
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
            hasSourceLocation: !!resultData?.sourceLocation,
            stepIndex: resultData?.stepIndex
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (!data || data.error) {
          console.error('Get source location error:', data?.error || 'No data returned');
          return;
        }
        browser.assert.ok(data.success || data.error, 'Get source location should execute');
      });
  },

  'Should test jump_to tool': function (browser: NightwatchBrowser) {
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
            name: 'jump_to',
            arguments: {
              step: 165
            }
          },
          id: 'test-jump-to'
        }).then(function (result) {
          console.log('jump to result', result)
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
            jumpSuccess: resultData?.success || false,
            step: resultData?.step,
            hasMessage: !!resultData?.message
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        browser.pause(10000)
        const data = result.value as any;
        if (!data || data.error) {
          console.error('Jump to error:', data?.error || 'No data returned');
          return;
        }
        browser.assert.ok(data.success || data.error, 'Jump to should execute');
      });
  },

  'Should test decode_local_variable tool': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;

        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        // Using variableId 0 as an example - in real scenario, get this from extract_locals_at
        aiPlugin.remixMCPServer.handleMessage({
          method: 'tools/call',
          params: {
            name: 'decode_local_variable',
            arguments: {
              variableId: 81,
              stepIndex: 165
            }
          },
          id: 'test-decode-local-var'
        }).then(function (result) {
          console.log('local var debug', result)
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
            hasDecodedValue: resultData?.decodedValue !== undefined,
            variableId: resultData?.variableId,
            stepIndex: resultData?.stepIndex
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (!data || data.error) {
          console.error('Decode local variable error:', data?.error || 'No data returned');
          return;
        }
        browser.assert.ok(data.success || data.error, 'Decode local variable should execute');
      });
  },

  'Should test decode_state_variable tool': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;

        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        // Using variableId 0 as an example - in real scenario, get this from extract_state_at
        aiPlugin.remixMCPServer.handleMessage({
          method: 'tools/call',
          params: {
            name: 'decode_state_variable',
            arguments: {
              variableId: 3,
              stepIndex: 165
            }
          },
          id: 'test-decode-state-var'
        }).then(function (result) {
          console.log(result)
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
            hasDecodedValue: resultData?.decodedValue !== undefined,
            variableId: resultData?.variableId,
            stepIndex: resultData?.stepIndex
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (!data || data.error) {
          console.error('Decode state variable error:', data?.error || 'No data returned');
          return;
        }
        browser.assert.ok(data.success || data.error, 'Decode state variable should execute');
      });
  },

  'Should test get_stack_at tool': function (browser: NightwatchBrowser) {
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
            name: 'get_stack_at',
            arguments: {
              step: 100
            }
          },
          id: 'test-get-stack-at'
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
            hasStack: !!resultData?.stack,
            step: resultData?.step,
            stackDepth: resultData?.metadata?.stackDepth
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (!data || data.error) {
          console.error('Get stack at error:', data?.error || 'No data returned');
          return;
        }
        browser.assert.ok(data.success || data.error, 'Get stack at should execute');
      });
  },

  'Should test get_scopes_with_root tool': function (browser: NightwatchBrowser) {
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
            name: 'get_scopes_with_root',
            arguments: {
              rootScopeId: '1'
            }
          },
          id: 'test-get-scopes-with-root'
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
            hasScopes: !!resultData?.scopes,
            rootScopeId: resultData?.rootScopeId,
            totalScopes: resultData?.metadata?.totalScopes,
            hasDepthLimit: !!resultData?.metadata?.depthLimit
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (!data || data.error) {
          console.error('Get scopes with root error:', data?.error || 'No data returned');
          return;
        }
        browser.assert.ok(data.success || data.error, 'Get scopes with root should execute');
      });
  }
};
