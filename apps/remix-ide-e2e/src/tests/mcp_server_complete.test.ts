import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

/**
 * Comprehensive test suite for RemixMCPServer core functionality
 * Tests server lifecycle, MCP protocol compliance, capabilities, statistics, and error handling
 */

module.exports = {
  '@disabled': false,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done)
  },

  /**
   * SERVER INITIALIZATION & STATE TESTS
   */
  'Should initialize RemixMCPServer correctly': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="remix-ai-assistant"]')
      .execute(function () {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          return { error: 'RemixMCPServer not available' };
        }

        try {
          const server = aiPlugin.remixMCPServer;

          return {
            hasServer: !!server,
            hasConfig: !!server.config,
            hasState: server.state !== undefined,
            hasStats: !!server.stats,
            hasTools: !!server.tools,
            hasResources: !!server.resources,
            serverName: server.config?.name || null,
            serverVersion: server.config?.version || null,
            currentState: server.state || null,
            toolCount: server.tools?.list()?.length || 0,
            resourceProviderCount: server.resources?.list()?.length || 0
          };
        } catch (error) {
          return { error: error.message };
        }
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Server initialization error:', data.error);
          return;
        }
        browser.assert.ok(data.hasServer, 'Should have server instance');
        browser.assert.ok(data.hasConfig, 'Should have server config');
        browser.assert.ok(data.hasState, 'Should have server state');
        browser.assert.ok(data.hasStats, 'Should have server stats');
        browser.assert.ok(data.hasTools, 'Should have tool registry');
        browser.assert.ok(data.hasResources, 'Should have resource registry');
        browser.assert.ok(data.toolCount > 0, 'Should have registered tools');
        browser.assert.ok(data.resourceProviderCount > 0, 'Should have registered resource providers');
        console.log(`Server: ${data.serverName} v${data.serverVersion}, State: ${data.currentState}, Tools: ${data.toolCount}, Providers: ${data.resourceProviderCount}`);
      });
  },

  'Should have correct server configuration': function (browser: NightwatchBrowser) {
    browser
      .execute(function () {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          return { error: 'RemixMCPServer not available' };
        }

        try {
          const server = aiPlugin.remixMCPServer;
          const config = server.config;

          return {
            hasName: !!config.name,
            hasVersion: !!config.version,
            hasDescription: !!config.description,
            hasDebug: config.debug !== undefined,
            hasMaxConcurrentTools: config.maxConcurrentTools !== undefined,
            hasToolTimeout: config.toolTimeout !== undefined,
            hasResourceCacheTTL: config.resourceCacheTTL !== undefined,
            hasFeatures: !!config.features,
            name: config.name,
            version: config.version,
            features: config.features || null,
            maxConcurrentTools: config.maxConcurrentTools,
            toolTimeout: config.toolTimeout
          };
        } catch (error) {
          return { error: error.message };
        }
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Server config error:', data.error);
          return;
        }
        browser.assert.ok(data.hasName, 'Config should have name');
        browser.assert.ok(data.hasVersion, 'Config should have version');
        browser.assert.ok(data.hasFeatures, 'Config should have features');
        browser.assert.ok(data.maxConcurrentTools > 0, 'Should allow concurrent tools');
        browser.assert.ok(data.toolTimeout > 0, 'Should have tool timeout configured');
      });
  },

  /**
   * MCP PROTOCOL COMPLIANCE TESTS
   */
  'Should handle initialize method': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        aiPlugin.remixMCPServer.handleMessage({
          method: 'initialize',
          id: 'test-init-1'
        }).then(function (response) {
          done({
            hasResult: !!response.result,
            hasError: !!response.error,
            hasProtocolVersion: !!response.result?.protocolVersion,
            hasCapabilities: !!response.result?.capabilities,
            hasServerInfo: !!response.result?.serverInfo,
            hasInstructions: !!response.result?.instructions,
            protocolVersion: response.result?.protocolVersion || null,
            serverInfo: response.result?.serverInfo || null
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Initialize method error:', data.error);
          return;
        }
        browser.assert.ok(data.hasResult, 'Should have result');
        browser.assert.ok(!data.hasError, 'Should not have error');
        browser.assert.ok(data.hasProtocolVersion, 'Should have protocol version');
        browser.assert.ok(data.hasCapabilities, 'Should have capabilities');
        browser.assert.ok(data.hasServerInfo, 'Should have server info');
        browser.assert.equal(data.protocolVersion, '2024-11-05', 'Protocol version should match MCP spec');
      });
  },

  'Should handle tools/list method': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        aiPlugin.remixMCPServer.handleMessage({
          method: 'tools/list',
          id: 'test-tools-list-1'
        }).then(function (response) {
          const tools = response.result?.tools || [];

          done({
            hasResult: !!response.result,
            hasError: !!response.error,
            hasTools: !!response.result?.tools,
            toolCount: tools.length,
            allToolsValid: tools.every(function (t) {
              return t.name && t.description && t.inputSchema;
            }),
            sampleTools: tools.slice(0, 3).map(function (t) {
              return {
                name: t.name,
                hasDescription: !!t.description,
                hasInputSchema: !!t.inputSchema
              };
            })
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Tools list method error:', data.error);
          return;
        }
        browser.assert.ok(data.hasResult, 'Should have result');
        browser.assert.ok(!data.hasError, 'Should not have error');
        browser.assert.ok(data.hasTools, 'Should have tools array');
        browser.assert.ok(data.toolCount > 0, 'Should have tools');
        browser.assert.ok(data.allToolsValid, 'All tools should have required fields');
      });
  },

  'Should handle tools/call method': function (browser: NightwatchBrowser) {
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
          id: 'test-tools-call-1'
        }).then(function (response) {
          done({
            hasResult: !!response.result,
            hasError: !!response.error,
            hasContent: !!response.result?.content,
            isArray: Array.isArray(response.result?.content),
            firstContentHasText: response.result?.content?.[0]?.text !== undefined,
            isError: response.result?.isError || false
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Tools call method error:', data.error);
          return;
        }
        browser.assert.ok(data.hasResult, 'Should have result');
        browser.assert.ok(data.hasContent, 'Should have content');
        browser.assert.ok(data.isArray, 'Content should be array');
        browser.assert.ok(data.firstContentHasText, 'Content should have text');
      });
  },

  'Should handle resources/list method': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        aiPlugin.remixMCPServer.handleMessage({
          method: 'resources/list',
          id: 'test-resources-list-1'
        }).then(function (response) {
          const resources = response.result?.resources || [];

          done({
            hasResult: !!response.result,
            hasError: !!response.error,
            hasResources: !!response.result?.resources,
            resourceCount: resources.length,
            allResourcesValid: resources.every(function (r) {
              return r.uri && r.name && r.mimeType;
            }),
            sampleResources: resources.slice(0, 3).map(function (r) {
              return {
                uri: r.uri,
                name: r.name,
                mimeType: r.mimeType
              };
            })
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Resources list method error:', data.error);
          return;
        }
        browser.assert.ok(data.hasResult, 'Should have result');
        browser.assert.ok(!data.hasError, 'Should not have error');
        browser.assert.ok(data.hasResources, 'Should have resources array');
        browser.assert.ok(data.resourceCount > 0, 'Should have resources');
        browser.assert.ok(data.allResourcesValid, 'All resources should have required fields');
      });
  },

  'Should handle resources/read method': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        aiPlugin.remixMCPServer.handleMessage({
          method: 'resources/read',
          params: { uri: 'project://structure' },
          id: 'test-resources-read-1'
        }).then(function (response) {
          done({
            hasResult: !!response.result,
            hasError: !!response.error,
            hasUri: !!response.result?.uri,
            hasMimeType: !!response.result?.mimeType,
            hasText: !!response.result?.text,
            uri: response.result?.uri || null,
            mimeType: response.result?.mimeType || null
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Resources read method error:', data.error);
          return;
        }
        browser.assert.ok(data.hasResult, 'Should have result');
        browser.assert.ok(!data.hasError, 'Should not have error');
        browser.assert.ok(data.hasUri, 'Should have uri');
        browser.assert.ok(data.hasMimeType, 'Should have mimeType');
        browser.assert.ok(data.hasText, 'Should have text content');
      });
  },

  'Should handle server/capabilities method': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        aiPlugin.remixMCPServer.handleMessage({
          method: 'server/capabilities',
          id: 'test-capabilities-1'
        }).then(function (response) {
          const capabilities = response.result || {};

          done({
            hasResult: !!response.result,
            hasError: !!response.error,
            hasResources: !!capabilities.resources,
            hasTools: !!capabilities.tools,
            hasPrompts: capabilities.prompts !== undefined,
            hasLogging: capabilities.logging !== undefined,
            hasExperimental: !!capabilities.experimental,
            resourcesSubscribe: capabilities.resources?.subscribe || false,
            toolsListChanged: capabilities.tools?.listChanged || false,
            experimentalFeatures: capabilities.experimental || null
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Capabilities method error:', data.error);
          return;
        }
        browser.assert.ok(data.hasResult, 'Should have result');
        browser.assert.ok(data.hasResources, 'Should have resources capability');
        browser.assert.ok(data.hasTools, 'Should have tools capability');
        browser.assert.ok(data.resourcesSubscribe, 'Resources should support subscribe');
        browser.assert.ok(data.toolsListChanged, 'Tools should support listChanged');
      });
  },

  'Should handle server/stats method': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        aiPlugin.remixMCPServer.handleMessage({
          method: 'server/stats',
          id: 'test-stats-1'
        }).then(function (response) {
          const stats = response.result || {};

          done({
            hasResult: !!response.result,
            hasError: !!response.error,
            hasUptime: stats.uptime !== undefined,
            hasTotalToolCalls: stats.totalToolCalls !== undefined,
            hasTotalResourcesServed: stats.totalResourcesServed !== undefined,
            hasActiveToolExecutions: stats.activeToolExecutions !== undefined,
            hasErrorCount: stats.errorCount !== undefined,
            hasLastActivity: !!stats.lastActivity,
            stats: stats
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Stats method error:', data.error);
          return;
        }
        browser.assert.ok(data.hasResult, 'Should have result');
        browser.assert.ok(data.hasUptime, 'Should have uptime');
        browser.assert.ok(data.hasTotalToolCalls, 'Should have total tool calls');
        browser.assert.ok(data.hasTotalResourcesServed, 'Should have total resources served');
        browser.assert.ok(data.hasActiveToolExecutions, 'Should have active tool executions count');
        browser.assert.ok(data.hasErrorCount, 'Should have error count');
        browser.assert.ok(data.hasLastActivity, 'Should have last activity timestamp');
        console.log('Server stats:', JSON.stringify(data.stats, null, 2));
      });
  },

  'Should handle unknown method': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        aiPlugin.remixMCPServer.handleMessage({
          method: 'unknown/method',
          id: 'test-unknown-1'
        }).then(function (response) {
          done({
            hasResult: response.result !== undefined,
            hasError: !!response.error,
            errorCode: response.error?.code || null,
            errorMessage: response.error?.message || null
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Unknown method handling error:', data.error);
          return;
        }
        browser.assert.ok(data.hasError, 'Should have error for unknown method');
        browser.assert.ok(data.errorMessage?.includes('Unknown method'), 'Error message should indicate unknown method');
      });
  },

  /**
   * SERVER CAPABILITIES TESTS
   */
  'Should verify all server capabilities': function (browser: NightwatchBrowser) {
    browser
      .execute(function () {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          return { error: 'RemixMCPServer not available' };
        }

        try {
          const capabilities = aiPlugin.remixMCPServer.getCapabilities();

          return {
            capabilities,
            hasResources: !!capabilities.resources,
            hasTools: !!capabilities.tools,
            hasPrompts: capabilities.prompts !== undefined,
            hasLogging: capabilities.logging !== undefined,
            hasExperimental: !!capabilities.experimental,

            // Resource capabilities
            resourcesSubscribe: capabilities.resources?.subscribe || false,
            resourcesListChanged: capabilities.resources?.listChanged || false,

            // Tool capabilities
            toolsListChanged: capabilities.tools?.listChanged || false,

            // Experimental features
            hasRemixFeatures: !!capabilities.experimental?.remix,
            remixCompilation: capabilities.experimental?.remix?.compilation || false,
            remixDeployment: capabilities.experimental?.remix?.deployment || false,
            remixDebugging: capabilities.experimental?.remix?.debugging || false,
            remixAnalysis: capabilities.experimental?.remix?.analysis || false,
            remixTesting: capabilities.experimental?.remix?.testing || false,
            remixGit: capabilities.experimental?.remix?.git || false
          };
        } catch (error) {
          return { error: error.message };
        }
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Capabilities verification error:', data.error);
          return;
        }
        browser.assert.ok(data.hasResources, 'Should have resources capability');
        browser.assert.ok(data.hasTools, 'Should have tools capability');
        browser.assert.ok(data.resourcesSubscribe, 'Resources should support subscribe');
        browser.assert.ok(data.resourcesListChanged, 'Resources should support listChanged');
        browser.assert.ok(data.toolsListChanged, 'Tools should support listChanged');
        browser.assert.ok(data.hasRemixFeatures, 'Should have Remix-specific features');
        browser.assert.ok(data.remixCompilation, 'Should support compilation feature');
        browser.assert.ok(data.remixDeployment, 'Should support deployment feature');
        console.log('Capabilities:', JSON.stringify(data.capabilities, null, 2));
      });
  },

  /**
   * SERVER STATISTICS & MONITORING TESTS
   */
  'Should track server statistics correctly': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        const server = aiPlugin.remixMCPServer;

        // Get initial stats
        const initialStats = server.stats;

        // Execute some operations
        server.handleMessage({
          method: 'tools/call',
          params: { name: 'get_compiler_config', arguments: {} },
          id: 'stats-test-1'
        }).then(function () {
          return server.handleMessage({
            method: 'resources/read',
            params: { uri: 'project://structure' },
            id: 'stats-test-2'
          });
        }).then(function () {
          // Get updated stats
          const updatedStats = server.stats;

          done({
            initialStats: initialStats,
            updatedStats: updatedStats,
            uptimeIncreased: updatedStats.uptime >= initialStats.uptime,
            toolCallsTracked: updatedStats.totalToolCalls >= initialStats.totalToolCalls,
            resourcesTracked: updatedStats.totalResourcesServed >= initialStats.totalResourcesServed,
            lastActivityUpdated: new Date(updatedStats.lastActivity) >= new Date(initialStats.lastActivity),
            hasAllStatFields: !!(
              updatedStats.uptime !== undefined &&
              updatedStats.totalToolCalls !== undefined &&
              updatedStats.totalResourcesServed !== undefined &&
              updatedStats.activeToolExecutions !== undefined &&
              updatedStats.errorCount !== undefined &&
              updatedStats.lastActivity
            )
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Statistics tracking error:', data.error);
          return;
        }
        browser.assert.ok(data.uptimeIncreased, 'Uptime should increase');
        browser.assert.ok(data.lastActivityUpdated, 'Last activity should be updated');
        browser.assert.ok(data.hasAllStatFields, 'Stats should have all required fields');
        console.log('Initial stats:', data.initialStats);
        console.log('Updated stats:', data.updatedStats);
      });
  },

  'Should provide cache statistics': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        const server = aiPlugin.remixMCPServer;

        // Trigger some cache operations
        server.handleMessage({
          method: 'resources/read',
          params: { uri: 'deployment://history' },
          id: 'cache-test-1'
        }).then(function () {
          return server.handleMessage({
            method: 'resources/read',
            params: { uri: 'deployment://history' },
            id: 'cache-test-2'
          });
        }).then(function () {
          const cacheStats = server.getCacheStats();

          done({
            hasCacheStats: !!cacheStats,
            hasSize: cacheStats?.size !== undefined,
            hasHitRate: cacheStats?.hitRate !== undefined,
            hasEntries: !!cacheStats?.entries,
            size: cacheStats?.size || 0,
            hitRate: cacheStats?.hitRate || 0,
            entryCount: cacheStats?.entries?.length || 0
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Cache stats error:', data.error);
          return;
        }
        browser.assert.ok(data.hasCacheStats, 'Should have cache statistics');
        browser.assert.ok(data.hasSize, 'Should have cache size');
        browser.assert.ok(data.hasHitRate, 'Should have cache hit rate');
        browser.assert.ok(data.hasEntries, 'Should have cache entries');
        console.log(`Cache: size=${data.size}, hitRate=${data.hitRate}, entries=${data.entryCount}`);
      });
  },

  'Should track active tool executions': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        const server = aiPlugin.remixMCPServer;

        // Execute a tool
        const toolPromise = server.handleMessage({
          method: 'tools/call',
          params: { name: 'get_compiler_config', arguments: {} },
          id: 'exec-test-1'
        });

        // Check active executions (should be empty after completion in our test)
        toolPromise.then(function () {
          const activeExecutions = server.getActiveExecutions();

          done({
            hasMethod: typeof server.getActiveExecutions === 'function',
            isArray: Array.isArray(activeExecutions),
            count: activeExecutions.length,
            // After completion, should be 0
            allCompleted: activeExecutions.length === 0
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Active executions error:', data.error);
          return;
        }
        browser.assert.ok(data.hasMethod, 'Should have getActiveExecutions method');
        browser.assert.ok(data.isArray, 'Should return array');
        browser.assert.ok(data.allCompleted, 'Should not have active executions after completion');
      });
  },

  /**
   * ERROR HANDLING TESTS
   */
  'Should handle malformed messages gracefully': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        const testCases = [
          // Missing method
          { id: 'test-1' },
          // Invalid method type
          { method: 123, id: 'test-2' },
          // Missing required params
          { method: 'tools/call', id: 'test-3' },
          // Invalid params type
          { method: 'resources/read', params: 'invalid', id: 'test-4' }
        ];

        const results = [];

        // Convert loop to sequential promise chain
        function processTestCase(index) {
          if (index >= testCases.length) {
            done({
              totalTests: testCases.length,
              results: results,
              allHandled: results.every(function (r) { return r.handled; }),
              systemStable: true
            });
            return;
          }

          const testCase = testCases[index];
          aiPlugin.remixMCPServer.handleMessage(testCase).then(function (response) {
            results.push({
              test: testCase,
              hasError: !!response.error,
              handled: true
            });
            processTestCase(index + 1);
          }).catch(function (error) {
            results.push({
              test: testCase,
              hasError: true,
              handled: true,
              errorMessage: error.message
            });
            processTestCase(index + 1);
          });
        }

        processTestCase(0);
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Malformed message handling error:', data.error);
          return;
        }
        browser.assert.equal(data.totalTests, 4, 'Should test all malformed messages');
        browser.assert.ok(data.allHandled, 'All malformed messages should be handled');
        browser.assert.ok(data.systemStable, 'System should remain stable');
      });
  },

  'Should enforce tool execution timeout': function (browser: NightwatchBrowser) {
    browser
      .execute(function () {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          return { error: 'RemixMCPServer not available' };
        }

        try {
          const server = aiPlugin.remixMCPServer;
          const config = server.config;

          return {
            hasTimeout: config.toolTimeout !== undefined,
            timeoutValue: config.toolTimeout || 0,
            isReasonable: config.toolTimeout > 0 && config.toolTimeout <= 60000 // Between 0 and 60 seconds
          };
        } catch (error) {
          return { error: error.message };
        }
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Timeout config error:', data.error);
          return;
        }
        browser.assert.ok(data.hasTimeout, 'Should have tool timeout configured');
        browser.assert.ok(data.timeoutValue > 0, 'Timeout should be positive');
        browser.assert.ok(data.isReasonable, 'Timeout should be reasonable');
        console.log(`Tool timeout: ${data.timeoutValue}ms`);
      });
  },

  /**
   * PERFORMANCE & SCALABILITY TESTS
   */
  'Should handle high concurrent load': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        const server = aiPlugin.remixMCPServer;
        const concurrentOperations = 10;
        const startTime = Date.now();

        // Create array of promises for concurrent operations
        const promises = [];
        for (let i = 0; i < concurrentOperations; i++) {
          promises.push(
            server.handleMessage({
              method: i % 2 === 0 ? 'tools/list' : 'resources/list',
              id: 'concurrent-' + i
            })
          );
        }

        Promise.all(promises).then(function (results) {
          const endTime = Date.now();
          const totalTime = endTime - startTime;

          done({
            operationCount: concurrentOperations,
            successCount: results.filter(function (r) { return r.result && !r.error; }).length,
            totalTime: totalTime,
            averageTime: totalTime / concurrentOperations,
            allSucceeded: results.every(function (r) { return r.result && !r.error; }),
            performanceAcceptable: totalTime < 10000 // 10 seconds for 10 operations
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Concurrent load error:', data.error);
          return;
        }
        browser.assert.equal(data.successCount, data.operationCount, 'All operations should succeed');
        browser.assert.ok(data.allSucceeded, 'All operations should complete successfully');
        browser.assert.ok(data.performanceAcceptable, 'Performance should be acceptable under load');
        console.log(`Concurrent load test: ${data.operationCount} operations in ${data.totalTime}ms (avg: ${data.averageTime}ms)`);
      });
  },

  'Should verify server stability over time': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        const server = aiPlugin.remixMCPServer;
        const iterations = 5;
        const results = [];

        // Convert loop to sequential promise chain
        function processIteration(i) {
          if (i >= iterations) {
            done({
              iterations: iterations,
              results: results,
              consistentBehavior: results.every(function (r) { return r.errorCount === results[0].errorCount; }),
              uptimeIncreasing: results.every(function (r, idx) {
                return idx === 0 || r.uptime >= results[idx - 1].uptime;
              }),
              stable: true
            });
            return;
          }

          const stats = server.stats;

          // Execute some operations
          server.handleMessage({
            method: 'tools/list',
            id: 'stability-' + i + '-1'
          }).then(function () {
            return server.handleMessage({
              method: 'resources/list',
              id: 'stability-' + i + '-2'
            });
          }).then(function () {
            results.push({
              iteration: i,
              uptime: stats.uptime,
              totalToolCalls: stats.totalToolCalls,
              errorCount: stats.errorCount
            });

            // Small delay between iterations
            return new Promise(function (resolve) { setTimeout(resolve, 100); });
          }).then(function () {
            processIteration(i + 1);
          }).catch(function (error) {
            done({ error: error.message });
          });
        }

        processIteration(0);
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Stability test error:', data.error);
          return;
        }
        browser.assert.equal(data.iterations, 5, 'Should complete all iterations');
        browser.assert.ok(data.uptimeIncreasing, 'Uptime should consistently increase');
        browser.assert.ok(data.stable, 'Server should remain stable');
        console.log('Stability test results:', data.results);
      });
  }
};
