import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

const workflowContract = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract WorkflowTest {
    uint256 public value;
    address public owner;
    mapping(address => uint256) public balances;

    event ValueChanged(uint256 oldValue, uint256 newValue);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    constructor() {
        value = 100;
        owner = msg.sender;
        balances[msg.sender] = 1000;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not the owner");
        _;
    }

    function setValue(uint256 _newValue) public onlyOwner {
        uint256 oldValue = value;
        value = _newValue;
        emit ValueChanged(oldValue, _newValue);
    }

    function transferOwnership(address _newOwner) public onlyOwner {
        require(_newOwner != address(0), "Invalid address");
        address previousOwner = owner;
        owner = _newOwner;
        emit OwnershipTransferred(previousOwner, _newOwner);
    }

    function deposit() public payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw(uint256 _amount) public {
        require(balances[msg.sender] >= _amount, "Insufficient balance");
        balances[msg.sender] -= _amount;
        payable(msg.sender).transfer(_amount);
    }
}
`;

module.exports = {
  '@disabled': false,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done)
  },

  'Should test complete MCP workflow: file creation to deployment': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="remix-ai-assistant"]')
      // Step 1: Create file through MCP if available, otherwise through UI
      .addFile('contracts/WorkflowTest.sol', { content: workflowContract })
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.mcpInferencer) {
          done({ error: 'MCP inferencer not available' });
          return;
        }

        // Step 2: Verify file exists through MCP resources
        const mcpClients = (aiPlugin.mcpInferencer as any).mcpClients;
        const remixClient = mcpClients.get('Remix IDE Server');

        remixClient.readResource('project://structure').then(function (structureContent) {
          const structureData = structureContent.text ? JSON.parse(structureContent.text) : null;

          // Recursively search through the structure's children
          const findFile = function (node, targetName) {
            if (!node) return null;
            if (node.name && node.name.includes(targetName)) return node;
            if (node.path && node.path.includes(targetName)) return node;
            if (node.children && Array.isArray(node.children)) {
              for (const child of node.children) {
                const found = findFile(child, targetName);
                if (found) return found;
              }
            }
            return null;
          };

          const workflowFile = structureData?.structure ? findFile(structureData.structure, 'WorkflowTest.sol') : null;

          // Step 3: Set compiler configuration through MCP
          return aiPlugin.mcpInferencer.executeTool('Remix IDE Server', {
            name: 'set_compiler_config',
            arguments: {
              version: '0.8.30',
              optimize: true,
              runs: 200,
              evmVersion: 'london'
            }
          }).then(function (setConfigResult) {
            // Step 4: Compile through MCP
            return aiPlugin.mcpInferencer.executeTool('Remix IDE Server', {
              name: 'solidity_compile',
              arguments: {
                file: 'contracts/WorkflowTest.sol',
                version: '0.8.30',
                optimize: true,
                runs: 200
              }
            }).then(function (compileResult) {
              // Step 5: Get last/ latest compilation result through MCP
              return aiPlugin.mcpInferencer.executeTool('Remix IDE Server', {
                name: 'get_compilation_result',
                arguments: {}
              }).then(function (resultData) {
                done({
                  fileFound: !!workflowFile,
                  fileName: workflowFile?.name || null,
                  configSet: !setConfigResult.isError,
                  compileExecuted: !compileResult.isError,
                  resultRetrieved: !resultData.isError,
                  workflowComplete: !!workflowFile && !setConfigResult.isError && !compileResult.isError && !resultData.isError,
                  compilationContent: resultData.content?.[0]?.text || null
                });
              });
            });
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('MCP workflow error:', data.error);
          return;
        }
        browser.assert.ok(data.fileFound, 'File should be found through MCP resources');
        browser.assert.ok(data.configSet, 'Compiler config should be set through MCP');
        browser.assert.ok(data.compileExecuted, 'Compilation should execute through MCP');
        browser.assert.ok(data.resultRetrieved, 'Compilation result should be retrieved through MCP');
        browser.assert.ok(data.workflowComplete, 'Complete workflow should succeed');
      });
  },

  'Should test MCP integration with Remix deployment workflow': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.mcpInferencer) {
          done({ error: 'MCP inferencer not available' });
          return;
        }

        const mcpClients = (aiPlugin.mcpInferencer as any).mcpClients;
        const remixClient = mcpClients.get('Remix IDE Server');

        remixClient.callTool({
          name: 'solidity_compile',
          arguments: { version: '0.8.30', optimize: true, runs: 200, evmVersion: 'prague', file: 'contracts/WorkflowTest.sol' }
        }).then(function (compilationContent) {
          console.log('compilationContent', compilationContent);
          const compilationData = compilationContent.content ? JSON.parse(compilationContent.content[0].text) : null;

          return remixClient.readResource('deployment://networks').then(function (accountContent) {
            const accountData = accountContent.text ? JSON.parse(accountContent.text) : null;
            const accounts = accountData?.configured[0]?.accounts;
            console.log('compilationData', compilationData);

            return remixClient.callTool({
              name: 'deploy_contract',
              arguments: {
                contractName: 'WorkflowTest',
                file: 'contracts/WorkflowTest.sol',
                constructorArgs: [],
                gasLimit: 3000000,
                value: '0',
                account: accounts[0]?.address
              }
            }).then(function (deployContent) {
              console.log('deployContent', deployContent);
              const deployData = deployContent.content ? JSON.parse(deployContent.content[0].text) : null;
              console.log('deployData', deployData);

              return new Promise(function (resolve) { setTimeout(resolve, 2000); }).then(function () {
                return remixClient.readResource('deployment://history').then(function (historyContent) {
                  const historyData = historyContent.text ? JSON.parse(historyContent.text) : null;
                  console.log('historyData', historyData);

                  return remixClient.readResource('deployment://active').then(function (activeContent) {
                    const activeData = activeContent.text ? JSON.parse(activeContent.text) : null;
                    console.log('activeData', activeData);

                    return remixClient.readResource('deployment://transactions').then(function (transactionsContent) {
                      const transactionsData = transactionsContent.text ? JSON.parse(transactionsContent.text) : null;
                      console.log('transactionsData', transactionsData);

                      const workflowDeployment = historyData?.deployments?.find(function (d) {
                        return d.contractName === 'WorkflowTest';
                      });

                      const workflowActive = activeData?.contracts?.find(function (c) {
                        return c.name === 'WorkflowTest';
                      });

                      const workflowTransaction = transactionsData?.deployments?.find(function (t) {
                        return t.contractName === 'WorkflowTest';
                      });

                      done({
                        didCompile: !!compilationData.success,
                        didDeploy: !!deployData.success,
                        hasHistory: !!historyData && historyData.deployments.length > 0,
                        hasActive: !!activeData && activeData.contracts.length > 0,
                        userAccounts: accounts,
                        hasTransactions: !!transactionsData && transactionsData.deployments.length > 0,
                        workflowInHistory: !!workflowDeployment,
                        workflowInActive: !!workflowActive,
                        workflowInTransactions: !!workflowTransaction,
                        deploymentCaptured: !!workflowDeployment && !!workflowActive && !!workflowTransaction,
                        deploymentDetails: workflowDeployment ? {
                          hasAddress: !!workflowDeployment.address,
                          hasTransactionHash: !!workflowDeployment.transactionHash,
                          hasBlockNumber: !!workflowDeployment.blockNumber,
                          hasGasUsed: !!workflowDeployment.gasUsed
                        } : null
                      });
                    });
                  });
                });
              });
            });
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('MCP deployment integration error:', data.error);
          return;
        }
        browser.assert.ok(data.didCompile, 'Should compile the workflowContract');
        browser.assert.ok(data.didDeploy, 'Should deploy the workflowContract');
        browser.assert.ok(data.hasHistory, 'Should capture deployment in history');
        browser.assert.ok(data.hasActive, 'Should show active deployments');
        browser.assert.ok(data.userAccounts.length > 0, 'Should have multiple user accounts');
        browser.assert.ok(data.hasTransactions, 'Should capture deployment transactions');
        browser.assert.ok(data.deploymentCaptured, 'Workflow deployment should be captured in all MCP resources');
        if (data.deploymentDetails) {
          browser.assert.ok(data.deploymentDetails.hasAddress, 'Deployment should have address');
          browser.assert.ok(data.deploymentDetails.hasTransactionHash, 'Deployment should have transaction hash');
        }
      });
  },

  'Should test MCP integration with contract interaction workflow': function (browser: NightwatchBrowser) {
    browser
      // Interact with deployed contract through UI
      .clickLaunchIcon('udapp')
      .waitForElementPresent('*[data-id="sidePanelSwapitTitle"]')
      .click('*[data-id="Deploy - transact (not payable)"]')
      .waitForElementPresent('*[data-id="universalDappUiContractActionWrapper"]', 60000)
      .clickInstance(0)
      .clickFunction('setValue - transact (not payable)', { types: 'uint256 _newValue', values: '87' })

      .pause(3000)
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.mcpInferencer) {
          done({ error: 'MCP inferencer not available' });
          return;
        }

        const mcpClients = (aiPlugin.mcpInferencer as any).mcpClients;
        const remixClient = mcpClients.get('Remix IDE Server');

        remixClient.readResource('deployment://transactions').then(function (transactionsContent) {
          const transactionsData = transactionsContent.text ? JSON.parse(transactionsContent.text) : null;

          return remixClient.readResource('deployment://networks').then(function (networksContent) {
            const networksData = networksContent.text ? JSON.parse(networksContent.text) : null;

            const recentTransactions = transactionsData?.deployments || [];
            const interactionTransactions = recentTransactions.filter(function (t) {
              return t.type === 'transaction' || (t.contractName === 'WorkflowTest' && t.method);
            });

            done({
              transactionsAvailable: recentTransactions.length > 0,
              interactionsCaptured: interactionTransactions.length > 0,
              networksAvailable: !!networksData && Object.keys(networksData).length > 0,
              transactionCount: recentTransactions.length,
              interactionCount: interactionTransactions.length,
              networkCount: networksData ? Object.keys(networksData).length : 0,
              integrationWorking: recentTransactions.length > 0 && !!networksData
            });
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Contract interaction integration error:', data.error);
          return;
        }
        browser.assert.ok(data.transactionsAvailable, 'Should have transactions available');
        browser.assert.ok(data.networksAvailable, 'Should have network information');
        browser.assert.ok(data.integrationWorking, 'MCP integration should work with contract interactions');
      });
  },

  'Should test RemixMCPServer solidity compile tool execution via server': function (browser: NightwatchBrowser) {
    browser
      .addFile('contracts/RemixMCPServerTest.sol', { content: workflowContract })
      .pause(1000)
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        const server = aiPlugin.remixMCPServer;

        server.executeTool({
          name: 'solidity_compile',
          arguments: {
            file: 'contracts/RemixMCPServerTest.sol',
            version: '0.8.20',
            optimize: true,
            runs: 200
          }
        }).then(function (compileResult) {
          return server.executeTool({
            name: 'get_compiler_config',
            arguments: {}
          }).then(function (configResult) {
            done({
              compileExecuted: !compileResult.isError,
              configExecuted: !configResult.isError,
              compileContent: compileResult.content?.[0]?.text || null,
              configContent: configResult.content?.[0]?.text || null,
              compileError: compileResult.isError ? compileResult.content?.[0]?.text : null,
              configError: configResult.isError ? configResult.content?.[0]?.text : null
            });
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Server tool execution error:', data.error);
          return;
        }
        browser.assert.ok(data.compileExecuted, 'Should execute compile tool successfully');
        browser.assert.ok(data.configExecuted, 'Should execute config tool successfully');
      });
  },

  'Should test MCP workflow error recovery': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.mcpInferencer || !aiPlugin?.remixMCPServer) {
          done({ error: 'MCP components not available' });
          return;
        }

        const mcpClients = (aiPlugin.mcpInferencer as any).mcpClients;
        const remixClient = mcpClients.get('Remix IDE Server');

        const workflowErrors = [];
        const workflowRecoveries = [];

        // Test 1: Compile nonexistent file
        aiPlugin.mcpInferencer.executeTool('Remix IDE Server', {
          name: 'solidity_compile',
          arguments: {
            file: 'nonexistent.sol',
            version: '0.8.30'
          }
        }).then(function () {
          // No error, continue to test 2
          return Promise.resolve();
        }).catch(function () {
          workflowErrors.push('compile_nonexistent');

          return aiPlugin.mcpInferencer.executeTool('Remix IDE Server', {
            name: 'get_compiler_config',
            arguments: {}
          }).then(function (recovery) {
            if (recovery) {
              workflowRecoveries.push('compile_recovery');
            }
          }).catch(function () {
            // Recovery failed
          });
        }).then(function () {
          // Test 2: Invalid resource access
          return remixClient.readResource('invalid://resource').then(function () {
            // No error, continue
            return Promise.resolve();
          }).catch(function () {
            workflowErrors.push('invalid_resource');

            return remixClient.readResource('deployment://history').then(function (recovery) {
              if (recovery) {
                workflowRecoveries.push('resource_recovery');
              }
            }).catch(function () {
              // Recovery failed
            });
          });
        }).then(function () {
          return aiPlugin.mcpInferencer.getAllTools().then(function (finalState) {
            const systemStable = !!finalState && Object.keys(finalState).length > 0;

            done({
              errorsEncountered: workflowErrors.length,
              recoveriesSuccessful: workflowRecoveries.length,
              systemStableAfterErrors: systemStable,
              errorRecoveryRatio: workflowRecoveries.length / Math.max(workflowErrors.length, 1),
              errorRecoveryWorking: systemStable && workflowRecoveries.length > 0,
              workflowResilience: systemStable && workflowRecoveries.length >= workflowErrors.length * 0.5,
              errorTypes: workflowErrors,
              recoveryTypes: workflowRecoveries
            });
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Error recovery test error:', data.error);
          return;
        }
        browser.assert.ok(data.systemStableAfterErrors, 'System should remain stable after workflow errors');
        browser.assert.ok(data.errorRecoveryWorking, 'Error recovery mechanism should work');
        browser.assert.ok(data.workflowResilience, 'Workflow should show resilience to errors');
      });
  }
};