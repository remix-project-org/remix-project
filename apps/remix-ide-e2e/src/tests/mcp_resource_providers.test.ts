import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

const resourceTestContract = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract ResourceTest {
    uint256 public value = 42;

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

  'Should prepare resources for testing': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="remix-ai-assistant"]')
      // First write - this will show the permission modal
      .execute(function (resourceTestContract) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (aiPlugin && aiPlugin.remixMCPServer) {
          aiPlugin.remixMCPServer.handleMessage({
            method: 'tools/call',
            params: {
              name: 'file_write',
              arguments: {
                path: 'contracts/ResourceTest.sol',
                content: resourceTestContract
              }
            },
            id: 'setup-resource-file'
          });
        }
      }, [resourceTestContract])
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
      // Now continue with the rest of the setup
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        // Create README file (permission already granted)
        aiPlugin.remixMCPServer.handleMessage({
          method: 'tools/call',
          params: {
            name: 'file_write',
            arguments: {
              path: 'README.md',
              content: '# Test Project for MCP Resources'
            }
          },
          id: 'setup-readme'
        }).then(function () {
          return new Promise(function (resolve) { setTimeout(resolve, 100); });
        }).then(function () {
          // Compile contract
          return aiPlugin.remixMCPServer.handleMessage({
            method: 'tools/call',
            params: {
              name: 'solidity_compile',
              arguments: {
                file: 'contracts/ResourceTest.sol'
              }
            },
            id: 'setup-compile'
          });
        }).then(function () {
          return new Promise(function (resolve) { setTimeout(resolve, 2000); });
        }).then(function () {
          // Deploy contract
          return aiPlugin.remixMCPServer.handleMessage({
            method: 'tools/call',
            params: {
              name: 'deploy_contract',
              arguments: {
                contractName: 'ResourceTest',
                file: 'contracts/ResourceTest.sol'
              }
            },
            id: 'setup-deploy'
          });
        }).then(function (result) {
          done({ success: true });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Resource setup error:', data.error);
          return;
        }
        browser.assert.ok(data.success, 'Resource setup should succeed');
      });
  },

  /**
   * PROJECT RESOURCE PROVIDER TESTS
   */
  'Should test project://structure resource': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        aiPlugin.remixMCPServer.handleMessage({
          method: 'resources/read',
          params: {
            uri: 'project://structure'
          },
          id: 'test-project-structure'
        }).then(function (result) {
          const resourceData = result.result;
          let structureData = null;
          if (resourceData?.text) {
            try {
              structureData = JSON.parse(resourceData.text);
            } catch (e) {
              structureData = resourceData.text;
            }
          }

          // Check for files/children at top level or nested in structure property
          const hasFiles = !!structureData?.files ||
                          !!structureData?.children ||
                          !!structureData?.structure?.children ||
                          !!structureData?.structure?.files;

          done({
            success: !result.error,
            hasStructure: !!structureData,
            hasFiles: hasFiles,
            structureType: typeof structureData
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Project structure resource error:', data.error);
          return;
        }
        browser.assert.ok(data.success, 'Should read project structure resource');
        browser.assert.ok(data.hasFiles, 'Should have project structure with files');
      });
  },

  'Should test project://config resource': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        aiPlugin.remixMCPServer.handleMessage({
          method: 'resources/read',
          params: {
            uri: 'project://config'
          },
          id: 'test-project-config'
        }).then(function (result) {
          const resourceData = result.result;
          done({
            success: !result.error,
            hasConfig: !!resourceData,
            configText: resourceData?.text || null
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Project config resource error:', data.error);
          return;
        }
        browser.assert.ok(data.success, 'Should read project config resource');
      });
  },

  'Should test project://dependencies resource': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        aiPlugin.remixMCPServer.handleMessage({
          method: 'resources/read',
          params: {
            uri: 'project://dependencies'
          },
          id: 'test-project-dependencies'
        }).then(function (result) {
          const resourceData = result.result;
          done({
            success: !result.error,
            hasDependencies: !!resourceData,
            dependenciesText: resourceData?.text || null
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Project dependencies resource error:', data.error);
          return;
        }
        browser.assert.ok(data.success, 'Should read project dependencies resource');
      });
  },

  'Should test file:// resource': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        aiPlugin.remixMCPServer.handleMessage({
          method: 'resources/read',
          params: {
            uri: 'file://contracts/ResourceTest.sol'
          },
          id: 'test-file-resource'
        }).then(function (result) {
          const resourceData = result.result;
          done({
            success: !result.error,
            hasContent: !!resourceData?.text,
            containsContract: resourceData?.text?.includes('contract ResourceTest') || false
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('File resource error:', data.error);
          return;
        }
        browser.assert.ok(data.success, 'Should read file resource');
      });
  },

  /**
   * COMPILATION RESOURCE PROVIDER TESTS
   */
  'Should test compilation://latest resource': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        aiPlugin.remixMCPServer.handleMessage({
          method: 'resources/read',
          params: {
            uri: 'compilation://latest'
          },
          id: 'test-compilation-latest'
        }).then(function (result) {
          const resourceData = result.result;
          let compilationData = null;
          if (resourceData?.text) {
            try {
              compilationData = JSON.parse(resourceData.text);
            } catch (e) {
              compilationData = resourceData.text;
            }
          }

          done({
            success: !result.error,
            hasCompilation: !!compilationData,
            hasContracts: !!compilationData?.contracts || !!compilationData?.result?.contracts
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Compilation latest resource error:', data.error);
          return;
        }
        browser.assert.ok(data.success, 'Should read latest compilation resource');
      });
  },

  'Should test compilation://contracts resource': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        aiPlugin.remixMCPServer.handleMessage({
          method: 'resources/read',
          params: {
            uri: 'compilation://contracts'
          },
          id: 'test-compilation-contracts'
        }).then(function (result) {
          const resourceData = result.result;
          let contractsData = null;
          if (resourceData?.text) {
            try {
              contractsData = JSON.parse(resourceData.text);
            } catch (e) {
              contractsData = resourceData.text;
            }
          }

          done({
            success: !result.error,
            hasContracts: !!contractsData,
            contractsType: typeof contractsData
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Compilation contracts resource error:', data.error);
          return;
        }
        browser.assert.ok(data.success, 'Should read compiled contracts resource');
      });
  },

  'Should test compilation://errors resource': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        aiPlugin.remixMCPServer.handleMessage({
          method: 'resources/read',
          params: {
            uri: 'compilation://errors'
          },
          id: 'test-compilation-errors'
        }).then(function (result) {
          const resourceData = result.result;
          done({
            success: !result.error,
            hasErrors: !!resourceData
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Compilation errors resource error:', data.error);
          return;
        }
        browser.assert.ok(data.success, 'Should read compilation errors resource');
      });
  },

  'Should test compilation://config resource': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        aiPlugin.remixMCPServer.handleMessage({
          method: 'resources/read',
          params: {
            uri: 'compilation://config'
          },
          id: 'test-compilation-config'
        }).then(function (result) {
          const resourceData = result.result;
          done({
            success: !result.error,
            hasConfig: !!resourceData
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Compilation config resource error:', data.error);
          return;
        }
        browser.assert.ok(data.success, 'Should read compilation config resource');
      });
  },

  'Should test contract://<name> resource': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        aiPlugin.remixMCPServer.handleMessage({
          method: 'resources/read',
          params: {
            uri: 'contract://ResourceTest'
          },
          id: 'test-contract-resource'
        }).then(function (result) {
          const resourceData = result.result;
          let contractData = null;
          if (resourceData?.text) {
            try {
              contractData = JSON.parse(resourceData.text);
            } catch (e) {
              contractData = resourceData.text;
            }
          }

          done({
            success: !result.error,
            hasContract: !!contractData,
            hasABI: !!contractData?.abi,
            hasBytecode: !!contractData?.bytecode || !!contractData?.evm?.bytecode
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Contract resource error:', data.error);
          return;
        }
        browser.assert.ok(data.success, 'Should read contract resource');
      });
  },

  /**
   * DEPLOYMENT RESOURCE PROVIDER TESTS
   */
  'Should test deployment://active resource': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        aiPlugin.remixMCPServer.handleMessage({
          method: 'resources/read',
          params: {
            uri: 'deployment://active'
          },
          id: 'test-deployment-active'
        }).then(function (result) {
          const resourceData = result.result;
          let deploymentsData = null;
          if (resourceData?.text) {
            try {
              deploymentsData = JSON.parse(resourceData.text);
            } catch (e) {
              deploymentsData = resourceData.text;
            }
          }

          done({
            success: !result.error,
            hasDeployments: !!deploymentsData,
            hasContracts: Array.isArray(deploymentsData?.contracts) || Array.isArray(deploymentsData)
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Deployment active resource error:', data.error);
          return;
        }
        browser.assert.ok(data.success, 'Should read active deployments resource');
      });
  },

  'Should test deployment://history resource': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        aiPlugin.remixMCPServer.handleMessage({
          method: 'resources/read',
          params: {
            uri: 'deployment://history'
          },
          id: 'test-deployment-history'
        }).then(function (result) {
          const resourceData = result.result;
          done({
            success: !result.error,
            hasHistory: !!resourceData
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Deployment history resource error:', data.error);
          return;
        }
        browser.assert.ok(data.success, 'Should read deployment history resource');
      });
  },

  'Should test deployment://networks resource': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        aiPlugin.remixMCPServer.handleMessage({
          method: 'resources/read',
          params: {
            uri: 'deployment://networks'
          },
          id: 'test-deployment-networks'
        }).then(function (result) {
          const resourceData = result.result;
          done({
            success: !result.error,
            hasNetworks: !!resourceData
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Deployment networks resource error:', data.error);
          return;
        }
        browser.assert.ok(data.success, 'Should read deployment networks resource');
      });
  },

  'Should test deployment://config resource': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        aiPlugin.remixMCPServer.handleMessage({
          method: 'resources/read',
          params: {
            uri: 'deployment://config'
          },
          id: 'test-deployment-config'
        }).then(function (result) {
          const resourceData = result.result;
          done({
            success: !result.error,
            hasConfig: !!resourceData
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Deployment config resource error:', data.error);
          return;
        }
        browser.assert.ok(data.success, 'Should read deployment config resource');
      });
  },

  /**
   * RESOURCES LIST TESTS
   */
  'Should test resources/list method': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        aiPlugin.remixMCPServer.handleMessage({
          method: 'resources/list',
          params: {},
          id: 'test-resources-list'
        }).then(function (result) {
          const resources = result.result?.resources || [];

          // Categorize resources
          const projectResources = resources.filter(function (r: any) {
            return r.uri?.startsWith('project://') || r.uri?.startsWith('file://');
          });
          const compilationResources = resources.filter(function (r: any) {
            return r.uri?.startsWith('compilation://') || r.uri?.startsWith('contract://');
          });
          const deploymentResources = resources.filter(function (r: any) {
            return r.uri?.startsWith('deployment://');
          });

          done({
            success: !result.error,
            hasResources: Array.isArray(resources) && resources.length > 0,
            totalCount: resources.length,
            projectCount: projectResources.length,
            compilationCount: compilationResources.length,
            deploymentCount: deploymentResources.length,
            sampleUris: resources.slice(0, 5).map(function (r: any) { return r.uri; })
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Resources list error:', data.error);
          return;
        }
        browser.assert.ok(data.success, 'Resources list should succeed');
        browser.assert.ok(data.hasResources, 'Should return resources');
        browser.assert.ok(data.totalCount > 0, 'Should have multiple resources');
        console.log(`Found ${data.totalCount} resources: ${data.projectCount} project, ${data.compilationCount} compilation, ${data.deploymentCount} deployment`);
      });
  },

  /**
   * ADDITIONAL COMPILATION RESOURCES
   */
  'Should test compilation://artifacts resource': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        aiPlugin.remixMCPServer.handleMessage({
          method: 'resources/read',
          params: {
            uri: 'compilation://artifacts'
          },
          id: 'test-compilation-artifacts'
        }).then(function (result) {
          const resourceData = result.result;
          done({
            success: !result.error,
            hasArtifacts: !!resourceData
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Compilation artifacts resource error:', data.error);
          return;
        }
        browser.assert.ok(data.success, 'Should read compilation artifacts resource');
      });
  },

  /**
   * DEPLOYMENT TRANSACTIONS RESOURCE
   */
  'Should test deployment://transactions resource': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        aiPlugin.remixMCPServer.handleMessage({
          method: 'resources/read',
          params: {
            uri: 'deployment://transactions'
          },
          id: 'test-deployment-transactions'
        }).then(function (result) {
          const resourceData = result.result;
          let transactionsData = null;
          if (resourceData?.text) {
            try {
              transactionsData = JSON.parse(resourceData.text);
            } catch (e) {
              transactionsData = resourceData.text;
            }
          }

          done({
            success: !result.error,
            hasTransactions: !!transactionsData,
            hasDeployments: !!transactionsData?.deployments
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Deployment transactions resource error:', data.error);
          return;
        }
        browser.assert.ok(data.success, 'Should read deployment transactions resource');
      });
  },

  /**
   * TUTORIALS RESOURCE PROVIDER TESTS
   */
  'Should test tutorials://list resource': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        aiPlugin.remixMCPServer.handleMessage({
          method: 'resources/read',
          params: {
            uri: 'tutorials://list'
          },
          id: 'test-tutorials-list'
        }).then(function (result) {
          const resourceData = result.result;
          let tutorialsData = null;
          if (resourceData?.text) {
            try {
              tutorialsData = JSON.parse(resourceData.text);
            } catch (e) {
              tutorialsData = resourceData.text;
            }
          }

          done({
            success: !result.error,
            hasTutorials: !!tutorialsData
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Tutorials list resource error:', data.error);
          return;
        }
        browser.assert.ok(data.success, 'Should read tutorials list resource');
      });
  },

  /**
   * AMP RESOURCE PROVIDER TESTS
   */
  'Should test amp://examples resource': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        aiPlugin.remixMCPServer.handleMessage({
          method: 'resources/read',
          params: {
            uri: 'amp://examples'
          },
          id: 'test-amp-examples'
        }).then(function (result) {
          const resourceData = result.result;
          let examplesData = null;
          if (resourceData?.text) {
            try {
              examplesData = JSON.parse(resourceData.text);
            } catch (e) {
              examplesData = resourceData.text;
            }
          }

          done({
            success: !result.error,
            hasExamples: !!examplesData,
            hasExamplesList: !!examplesData?.examples
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('AMP examples resource error:', data.error);
          return;
        }
        browser.assert.ok(data.success, 'Should read AMP examples resource');
      });
  }
};
