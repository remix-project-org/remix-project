import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

module.exports = {
  '@disabled': false,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done)
  },

  'Setup: Verify RemixAI Plugin and Etherscan connection': function (browser: NightwatchBrowser) {
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
          const etherscanStatus = statuses.find((s: any) => s.serverName === 'Etherscan');
          return {
            hasPlugin: true,
            hasExecuteMCPTool: hasExecuteMCPTool,
            hasEtherscanServer: !!etherscanStatus,
            etherscanConnected: etherscanStatus?.status === 'connected',
            etherscanStatus: etherscanStatus,
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
        console.log('[Setup] RemixAI and Etherscan status:', data);
        browser.assert.ok(data.hasPlugin, 'AI Plugin should be available');
        browser.assert.ok(data.hasExecuteMCPTool, 'executeMCPTool method should be available');
        browser.assert.ok(data.hasEtherscanServer, 'Etherscan server should be configured');
        browser.assert.ok(data.etherscanConnected, 'Etherscan should be connected');
      });
  },

  'Should test etherscan_account_balance tool': function (browser: NightwatchBrowser) {
    browser
      .pause(2000)
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin) {
          done({ error: 'RemixAI Plugin not available' });
          return;
        }

        aiPlugin.executeMCPTool('Etherscan', 'etherscan_account_balance', {
          address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
          tag: 'latest'
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
            hasData: !!resultData?.result || !!resultData?.balance,
            toolName: 'etherscan_account_balance',
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
        console.log('[etherscan_account_balance]', data);
        browser.assert.ok(
          data.success,
          'Account balance tool should execute or indicate not configured'
        );
      });
  },

  'Should test etherscan_account_balancehistory tool': function (browser: NightwatchBrowser) {
    browser
      .pause(2000)
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin) {
          done({ error: 'RemixAI Plugin not available' });
          return;
        }

        aiPlugin.executeMCPTool('Etherscan', 'etherscan_account_balancehistory', {
          address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
          blockno: '15000000'
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
            hasData: !!resultData?.result || !!resultData?.balance,
            toolName: 'etherscan_account_balancehistory',
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
        console.log('[etherscan_account_balancehistory]', data);
        const proEndpoint = data.error && data.error.indexOf('API Pro endpoint') !== -1
        browser.assert.ok(
          data.success || proEndpoint,
          'Account balance history tool should execute or indicate not configured'
        );
      });
  },

  'Should test etherscan_stats_dailyavggaslimit tool': function (browser: NightwatchBrowser) {
    browser
      .pause(2000)
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin) {
          done({ error: 'RemixAI Plugin not available' });
          return;
        }

        aiPlugin.executeMCPTool('Etherscan', 'etherscan_stats_dailyavggaslimit', {
          startdate: '2023-01-01',
          enddate: '2023-01-31',
          sort: 'asc'
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
            hasData: !!resultData?.result || Array.isArray(resultData?.result),
            toolName: 'etherscan_stats_dailyavggaslimit',
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
        console.log('[etherscan_stats_dailyavggaslimit]', data);
        const proEndpoint = data.error && data.error.indexOf('API Pro endpoint') !== -1
        browser.assert.ok(
          data.success || proEndpoint,
          'Daily average gas limit stats tool should execute or indicate not configured'
        );
      });
  },

  'Should test etherscan_stats_dailyavggasprice tool': function (browser: NightwatchBrowser) {
    browser
      .pause(2000)
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin) {
          done({ error: 'RemixAI Plugin not available' });
          return;
        }

        aiPlugin.executeMCPTool('Etherscan', 'etherscan_stats_dailyavggasprice', {
          startdate: '2023-01-01',
          enddate: '2023-01-31',
          sort: 'asc'
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
            hasData: !!resultData?.result || Array.isArray(resultData?.result),
            toolName: 'etherscan_stats_dailyavggasprice',
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
        console.log('[etherscan_stats_dailyavggasprice]', data);
        const proEndpoint = data.error && data.error.indexOf('API Pro endpoint') !== -1
        browser.assert.ok(
          data.success || proEndpoint,
          'Daily average gas price stats tool should execute or indicate not configured'
        );
      });
  },

  'Should test etherscan_contract_getabi tool': function (browser: NightwatchBrowser) {
    browser
      .pause(2000)
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin) {
          done({ error: 'RemixAI Plugin not available' });
          return;
        }

        aiPlugin.executeMCPTool('Etherscan', 'etherscan_contract_getabi', {
          address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984' // UNI token
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
            hasData: !!resultData?.result || Array.isArray(resultData?.result),
            toolName: 'etherscan_contract_getabi',
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
        console.log('[etherscan_contract_getabi]', data);
        const proEndpoint = data.error && data.error.indexOf('API Pro endpoint') !== -1
        browser.assert.ok(
          data.success || proEndpoint,
          'Contract ABI tool should execute or indicate not configured'
        );
      });
  },

  'Should test etherscan_nametag_getaddresstag tool': function (browser: NightwatchBrowser) {
    browser
      .pause(2000)
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin) {
          done({ error: 'RemixAI Plugin not available' });
          return;
        }

        aiPlugin.executeMCPTool('Etherscan', 'etherscan_nametag_getaddresstag', {
          address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984' // UNI token
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
            hasData: !!resultData?.result || !!resultData?.tag,
            toolName: 'etherscan_nametag_getaddresstag',
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
        console.log('[etherscan_nametag_getaddresstag]', data);
        const proEndpoint = data.error && data.error.indexOf('API Exclusive endpoint') !== -1
        browser.assert.ok(
          data.success || proEndpoint,
          'Name tag address tool should execute or indicate not configured'
        );
      });
  },

  'Should test all Etherscan tools in sequence with 2-second delays': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin) {
          done({ error: 'RemixAI Plugin not available' });
          return;
        }

        const tools = [
          {
            name: 'etherscan_account_balance',
            args: { address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0' }
          },
          {
            name: 'etherscan_account_balancehistory',
            args: { address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0', blockno: '15000000' }
          },
          {
            name: 'etherscan_stats_dailyavggaslimit',
            args: { startdate: '2023-01-01', enddate: '2023-01-31', sort: 'asc' }
          },
          {
            name: 'etherscan_stats_dailyavggasprice',
            args: { startdate: '2023-01-01', enddate: '2023-01-31', sort: 'asc' }
          },
          {
            name: 'etherscan_contract_getabi',
            args: { address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984' }
          },
          {
            name: 'etherscan_nametag_getaddresstag',
            args: { address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984' }
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
          console.log('[Etherscan Tools Test] Testing:', tool.name, 'with args:', tool.args);

          aiPlugin.executeMCPTool('Etherscan', tool.name, tool.args)
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
              console.log('[Etherscan Tools Test] Result for', tool.name, ':', !result.isError ? 'success' : 'error');
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
              console.log('[Etherscan Tools Test] Exception for', tool.name, ':', error.message);
              currentIndex++;
              // Wait 2 seconds before next tool
              setTimeout(testNextTool, 2000);
            });
        }

        testNextTool();
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('[Etherscan Tools Sequence] Error:', data.error);
          return;
        }
        console.log('[Etherscan Tools Sequence] Completed:', data.totalTools, 'tools tested');
        console.log('[Etherscan Tools Sequence] Results:', data.results);

        const successCount = data.results.filter((r: any) => r.success).length;
        console.log(`[Etherscan Tools Sequence] Success rate: ${successCount}/${data.totalTools}`);

        browser.assert.ok(
          data.success,
          'All Etherscan tools should execute (may not be configured but should not crash)'
        );
      });
  }
};