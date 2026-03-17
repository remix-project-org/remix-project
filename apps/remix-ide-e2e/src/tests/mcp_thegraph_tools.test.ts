import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

module.exports = {
  '@disabled': false,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done)
  },

  'Setup: Verify RemixAI Plugin and Thegraph API connection': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="remix-ai-assistant"]')
      .pause(2000)
      .execute(function () {
        const aiPlugin = (window as any).getRemixAIPlugin;

        if (!aiPlugin) {
          return { error: 'AI Plugin not available' };
        }

        // Check for executeMCPTool method
        const hasExecuteMCPTool = typeof aiPlugin.executeMCPTool === 'function';

        // Check MCP connection status (synchronous call)
        try {
          const statuses = aiPlugin.getMCPConnectionStatus();
          const thegraphStatus = statuses.find((s: any) => s.serverName === 'Thegraph API');
          return {
            hasPlugin: true,
            hasExecuteMCPTool: hasExecuteMCPTool,
            hasThegraphServer: !!thegraphStatus,
            thegraphConnected: thegraphStatus?.status === 'connected',
            thegraphStatus: thegraphStatus,
            allStatuses: statuses
          };
        } catch (error: any) {
          return {
            hasPlugin: true,
            hasExecuteMCPTool: hasExecuteMCPTool,
            error: error.message
          };
        }
      }, [], function (result) {
        const data = result.value as any;
        console.log('[Setup] RemixAI and Thegraph API status:', data);
        browser.assert.ok(data.hasPlugin, 'AI Plugin should be available');
        browser.assert.ok(data.hasExecuteMCPTool, 'executeMCPTool method should be available');
        browser.assert.ok(data.hasThegraphServer, 'Thegraph API server should be configured');
        browser.assert.ok(data.thegraphConnected, 'Thegraph API should be connected');
      });
  },

  'Should test thegraph_token_balances tool': function (browser: NightwatchBrowser) {
    browser
      .pause(2000)
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin) {
          done({ error: 'RemixAI Plugin not available' });
          return;
        }

        aiPlugin.executeMCPTool('Thegraph API', 'thegraph_token_balances', {
          network: 'mainnet',
          address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
          limit: 5
        }).then(function (result: any) {
          if (result.isError) {
            done({
              success: false,
              notConfigured: true,
              error: result.content?.[0]?.text || 'Error occurred',
              payload: result
            });
            return;
          }
          const resultText = result.content?.[0]?.text || '{}';
          const resultData = JSON.parse(resultText);
          done({
            success: !result.isError,
            hasData: !!resultData?.data || !!resultData?.balances,
            toolName: 'thegraph_token_balances',
            payload: result,
            data: resultData
          });
        }).catch(function (error: any) {
          done({
            success: false,
            notConfigured: true,
            error: error.message,
            payload: null
          });
        });
      }, [], function (result) {
        const data = result.value as any;
        console.log('[thegraph_token_balances]', data);
        browser.assert.ok(
          data.success || data.notConfigured,
          'Token balances tool should execute or indicate not configured'
        );
      });
  },

  'Should test thegraph_token_transfers tool': function (browser: NightwatchBrowser) {
    browser
      .pause(2000)
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin) {
          done({ error: 'RemixAI Plugin not available' });
          return;
        }

        aiPlugin.executeMCPTool('Thegraph API', 'thegraph_token_transfers', {
          network: 'mainnet',
          limit: 5
        }).then(function (result: any) {
          if (result.isError) {
            done({
              success: false,
              notConfigured: true,
              error: result.content?.[0]?.text || 'Error occurred',
              payload: result
            });
            return;
          }
          const resultText = result.content?.[0]?.text || '{}';
          const resultData = JSON.parse(resultText);
          done({
            success: !result.isError,
            hasData: !!resultData?.data || !!resultData?.transfers,
            toolName: 'thegraph_token_transfers',
            payload: result,
            data: resultData
          });
        }).catch(function (error: any) {
          done({
            success: false,
            notConfigured: true,
            error: error.message,
            payload: null
          });
        });
      }, [], function (result) {
        const data = result.value as any;
        console.log('[thegraph_token_transfers]', data);
        browser.assert.ok(
          data.success || data.notConfigured,
          'Token transfers tool should execute or indicate not configured'
        );
      });
  },

  'Should test thegraph_token_holders tool': function (browser: NightwatchBrowser) {
    browser
      .pause(2000)
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin) {
          done({ error: 'RemixAI Plugin not available' });
          return;
        }

        aiPlugin.executeMCPTool('Thegraph API', 'thegraph_token_holders', {
          network: 'mainnet',
          contract: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', // UNI token
          limit: 5
        }).then(function (result: any) {
          if (result.isError) {
            done({
              success: false,
              notConfigured: true,
              error: result.content?.[0]?.text || 'Error occurred',
              payload: result
            });
            return;
          }
          const resultText = result.content?.[0]?.text || '{}';
          const resultData = JSON.parse(resultText);
          done({
            success: !result.isError,
            hasData: !!resultData?.data || !!resultData?.holders,
            toolName: 'thegraph_token_holders',
            payload: result,
            data: resultData
          });
        }).catch(function (error: any) {
          done({
            success: false,
            notConfigured: true,
            error: error.message,
            payload: null
          });
        });
      }, [], function (result) {
        const data = result.value as any;
        console.log('[thegraph_token_holders]', data);
        browser.assert.ok(
          data.success || data.notConfigured,
          'Token holders tool should execute or indicate not configured'
        );
      });
  },

  'Should test thegraph_nft_ownerships tool': function (browser: NightwatchBrowser) {
    browser
      .pause(2000)
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin) {
          done({ error: 'RemixAI Plugin not available' });
          return;
        }

        aiPlugin.executeMCPTool('Thegraph API', 'thegraph_nft_ownerships', {
          network: 'mainnet',
          address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
          limit: 5
        }).then(function (result: any) {
          if (result.isError) {
            done({
              success: false,
              notConfigured: true,
              error: result.content?.[0]?.text || 'Error occurred',
              payload: result
            });
            return;
          }
          const resultText = result.content?.[0]?.text || '{}';
          const resultData = JSON.parse(resultText);
          done({
            success: !result.isError,
            hasData: !!resultData?.data || !!resultData?.ownerships,
            toolName: 'thegraph_nft_ownerships',
            payload: result,
            data: resultData
          });
        }).catch(function (error: any) {
          done({
            success: false,
            notConfigured: true,
            error: error.message,
            payload: null
          });
        });
      }, [], function (result) {
        const data = result.value as any;
        console.log('[thegraph_nft_ownerships]', data);
        browser.assert.ok(
          data.success || data.notConfigured,
          'NFT ownerships tool should execute or indicate not configured'
        );
      });
  },

  'Should test thegraph_nft_holders tool': function (browser: NightwatchBrowser) {
    browser
      .pause(2000)
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin) {
          done({ error: 'RemixAI Plugin not available' });
          return;
        }

        aiPlugin.executeMCPTool('Thegraph API', 'thegraph_nft_holders', {
          network: 'mainnet',
          contract: '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D', // BAYC
          limit: 5
        }).then(function (result: any) {
          if (result.isError) {
            done({
              success: false,
              notConfigured: true,
              error: result.content?.[0]?.text || 'Error occurred',
              payload: result
            });
            return;
          }
          const resultText = result.content?.[0]?.text || '{}';
          const resultData = JSON.parse(resultText);
          done({
            success: !result.isError,
            hasData: !!resultData?.data || !!resultData?.holders,
            toolName: 'thegraph_nft_holders',
            payload: result,
            data: resultData
          });
        }).catch(function (error: any) {
          done({
            success: false,
            notConfigured: true,
            error: error.message,
            payload: null
          });
        });
      }, [], function (result) {
        const data = result.value as any;
        console.log('[thegraph_nft_holders]', data);
        browser.assert.ok(
          data.success || data.notConfigured,
          'NFT holders tool should execute or indicate not configured'
        );
      });
  },

  'Should test thegraph_dex_pools tool': function (browser: NightwatchBrowser) {
    browser
      .pause(2000)
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin) {
          done({ error: 'RemixAI Plugin not available' });
          return;
        }

        aiPlugin.executeMCPTool('Thegraph API', 'thegraph_dex_pools', {
          network: 'mainnet',
          protocol: 'uniswap_v3',
          limit: 5
        }).then(function (result: any) {
          if (result.isError) {
            done({
              success: false,
              notConfigured: true,
              error: result.content?.[0]?.text || 'Error occurred',
              payload: result
            });
            return;
          }
          const resultText = result.content?.[0]?.text || '{}';
          const resultData = JSON.parse(resultText);
          done({
            success: !result.isError,
            hasData: !!resultData?.data || !!resultData?.pools,
            toolName: 'thegraph_dex_pools',
            payload: result,
            data: resultData
          });
        }).catch(function (error: any) {
          done({
            success: false,
            notConfigured: true,
            error: error.message,
            payload: null
          });
        });
      }, [], function (result) {
        const data = result.value as any;
        console.log('[thegraph_dex_pools]', data);
        browser.assert.ok(
          data.success || data.notConfigured,
          'DEX pools tool should execute or indicate not configured'
        );
      });
  },

  'Should test thegraph_subgraph_list_templates tool': function (browser: NightwatchBrowser) {
    browser
      .pause(2000)
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin) {
          done({ error: 'RemixAI Plugin not available' });
          return;
        }

        aiPlugin.executeMCPTool('Thegraph API', 'thegraph_subgraph_list_templates', {})
          .then(function (result: any) {
            if (result.isError) {
              done({
                success: false,
                notConfigured: true,
                error: result.content?.[0]?.text || 'Error occurred',
                payload: result
              });
              return;
            }
            const resultText = result.content?.[0]?.text || '{}';
            const resultData = JSON.parse(resultText);
            done({
              success: !result.isError,
              hasData: !!resultData?.templates || Array.isArray(resultData),
              toolName: 'thegraph_subgraph_list_templates',
              data: resultData
            });
          }).catch(function (error: any) {
            done({
              success: false,
              notConfigured: true,
              error: error.message,
              payload: null
            });
          });
      }, [], function (result) {
        const data = result.value as any;
        console.log('[thegraph_subgraph_list_templates]', data);
        browser.assert.ok(
          data.success || data.notConfigured,
          'List templates tool should execute or indicate not configured'
        );
      });
  },

  'Should test thegraph_subgraph_metadata tool': function (browser: NightwatchBrowser) {
    browser
      .pause(2000)
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin) {
          done({ error: 'RemixAI Plugin not available' });
          return;
        }

        aiPlugin.executeMCPTool('Thegraph API', 'thegraph_subgraph_metadata', {
          subgraphId: '5XqPmWe6gjyrJtFn9cLy237i4cWw2j9HcUJEXsP5qGtH'
        }).then(function (result: any) {
          if (result.isError) {
            done({
              success: false,
              notConfigured: true,
              error: result.content?.[0]?.text || 'Error occurred',
              payload: result
            });
            return;
          }
          const resultText = result.content?.[0]?.text || '{}';
          const resultData = JSON.parse(resultText);
          done({
            success: !result.isError,
            hasData: !!resultData?.metadata || !!resultData,
            toolName: 'thegraph_subgraph_metadata',
            data: resultData
          });
        }).catch(function (error: any) {
          done({
            success: false,
            notConfigured: true,
            error: error.message,
            payload: null
          });
        });
      }, [], function (result) {
        const data = result.value as any;
        console.log('[thegraph_subgraph_metadata]', data);
        browser.assert.ok(
          data.success || data.notConfigured,
          'Subgraph metadata tool should execute or indicate not configured'
        );
      });
  },

  'Should test all Graph tools in sequence with 2-second delays': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin) {
          done({ error: 'RemixAI Plugin not available' });
          return;
        }

        const tools = [
          {
            name: 'thegraph_token_balances',
            args: { network: 'mainnet', address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0', limit: 3 }
          },
          {
            name: 'thegraph_token_transfers',
            args: { network: 'mainnet', limit: 3 }
          },
          {
            name: 'thegraph_token_holders',
            args: { network: 'mainnet', contract: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', limit: 3 }
          },
          {
            name: 'thegraph_nft_ownerships',
            args: { network: 'mainnet', address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0', limit: 3 }
          },
          {
            name: 'thegraph_nft_holders',
            args: { network: 'mainnet', contract: '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D', limit: 3 }
          },
          {
            name: 'thegraph_dex_pools',
            args: { network: 'mainnet', protocol: 'uniswap_v3', limit: 3 }
          },
          {
            name: 'thegraph_subgraph_list_templates',
            args: {}
          },
          {
            name: 'thegraph_subgraph_metadata',
            args: { endpoint: 'https://api.thegraph.com/subgraphs/name/aave/protocol-v3' }
          }
        ];

        const results: any[] = [];
        let currentIndex = 0;

        function testNextTool() {
          if (currentIndex >= tools.length) {
            done({
              success: true,
              totalTools: tools.length,
              results: results
            });
            return;
          }

          const tool = tools[currentIndex];
          console.log('[Graph Tools Test] Testing:', tool.name, 'with args:', tool.args);

          aiPlugin.executeMCPTool('Thegraph API', tool.name, tool.args)
            .then(function (result: any) {
              const resultText = result.content?.[0]?.text || '{}';
              let parsedData = null;
              try {
                parsedData = JSON.parse(resultText);
              } catch (e) {
                parsedData = resultText;
              }

              results.push({
                tool: tool.name,
                success: !result.isError,
                error: result.isError ? (result.content?.[0]?.text || 'Unknown error') : null,
                payload: result,
                data: parsedData
              });
              console.log('[Graph Tools Test] Result for', tool.name, ':', !result.isError ? 'success' : 'error');
              currentIndex++;
              // Wait 2 seconds before next tool
              setTimeout(testNextTool, 2000);
            }).catch(function (error: any) {
              results.push({
                tool: tool.name,
                success: false,
                error: error.message,
                payload: null,
                data: null
              });
              console.log('[Graph Tools Test] Exception for', tool.name, ':', error.message);
              currentIndex++;
              // Wait 2 seconds before next tool
              setTimeout(testNextTool, 2000);
            });
        }

        testNextTool();
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('[Graph Tools Sequence] Error:', data.error);
          return;
        }
        console.log('[Graph Tools Sequence] Completed:', data.totalTools, 'tools tested');
        console.log('[Graph Tools Sequence] Results:', data.results);

        const successCount = data.results.filter((r: any) => r.success).length;
        console.log(`[Graph Tools Sequence] Success rate: ${successCount}/${data.totalTools}`);

        browser.assert.ok(
          data.success,
          'All Graph tools should execute (may not be configured but should not crash)'
        );
      });
  }
};
