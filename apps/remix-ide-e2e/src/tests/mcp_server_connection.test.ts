import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

module.exports = {
  '@disabled': false,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done)
  },

  'Should initialize AI plugin with MCP server by default': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="remix-ai-assistant"]')
      .execute(function () {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin) {
          return { error: 'AI Plugin not found' };
        }

        return {
          pluginName: aiPlugin.profile?.name,
          hasMCPInferencer: !!aiPlugin.mcpInferencer,
          mcpIsEnabled: aiPlugin.mcpEnabled,
          isActive: aiPlugin.aiIsActivated
        };
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('AI Plugin error:', data.error);
          return;
        }
        browser.assert.equal(data.pluginName, 'remixAI', 'AI plugin should be loaded');
        browser.assert.ok(data.hasMCPInferencer, 'Should have MCP inferencer');
        browser.assert.ok(data.isActive, 'AI plugin should be active');
        browser.assert.ok(data.mcpIsEnabled, 'MCP on AI plugin should be enabled');
      });
  },

  'Should connect to MCP default servers': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.mcpInferencer) {
          done({ error: 'MCP inferencer not available' });
          return;
        }

        // Connect to all default servers - default servers are loaded at startup, see loadMCPServersFromSettings
        aiPlugin.mcpInferencer.connectAllServers().then(function () {
          const connectedServers = aiPlugin.mcpInferencer.getConnectedServers();
          const connectionStatuses = aiPlugin.mcpInferencer.getConnectionStatuses();

          done({
            connectedServers: connectedServers,
            connectionStatuses: connectionStatuses,
            hasRemixMcpServer: connectedServers.includes('Remix IDE Server'),
            totalConnected: connectedServers.length
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('MCP connection error:', data.error);
          return;
        }
        browser.assert.ok(data.hasRemixMcpServer, 'Should be connected to Remix IDE Server');
        browser.assert.ok(data.totalConnected > 0, 'Should have at least one connected server');
      });
  },

  'Should handle server disconnection and reconnection': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.mcpInferencer) {
          done({ error: 'MCP inferencer not available' });
          return;
        }

        const initialConnectionStatuses = aiPlugin.mcpInferencer.getConnectionStatuses();
        const initialConnectedServers = aiPlugin.mcpInferencer.getConnectedServers();

        aiPlugin.mcpInferencer.disconnectAllServers().then(function () {
          const disconnectedServers = aiPlugin.mcpInferencer.getConnectedServers();
          const disconnectedStatuses = aiPlugin.mcpInferencer.getConnectionStatuses();

          return aiPlugin.mcpInferencer.connectAllServers().then(function () {
            const reconnectedServers = aiPlugin.mcpInferencer.getConnectedServers();
            const reconnectedStatuses = aiPlugin.mcpInferencer.getConnectionStatuses();

            done({
              initialConnectionStatuses: initialConnectionStatuses.map(function (s: any) {
                return {
                  serverName: s.serverName,
                  status: s.status,
                  connected: s.status === 'connected'
                };
              }),
              disconnectedStatuses: disconnectedStatuses.map(function (s: any) {
                return {
                  serverName: s.serverName,
                  status: s.status,
                  connected: s.status === 'connected'
                };
              }),
              reconnectedStatuses: reconnectedStatuses.map(function (s: any) {
                return {
                  serverName: s.serverName,
                  status: s.status,
                  connected: s.status === 'connected'
                };
              }),
              initialConnectedCount: initialConnectedServers.length,
              disconnectedCount: disconnectedServers.length,
              reconnectedCount: reconnectedServers.length,
              reconnectionSuccessful: reconnectedServers.length > 0, // at leat the remix mcp server
              serverStatusSummary: {
                totalServers: initialConnectionStatuses.length,
                initiallyConnected: initialConnectionStatuses.filter(function (s: any) { return s.status === 'connected'; }).length,
                afterDisconnect: disconnectedStatuses.filter(function (s: any) { return s.status === 'disconnected'; }).length,
                afterReconnect: reconnectedStatuses.filter(function (s: any) { return s.status === 'connected'; }).length
              }
            });
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('MCP reconnection error:', data.error);
          return;
        }

        // Verify the disconnection/reconnection process
        browser.assert.ok(data.initialConnectedCount > 0, 'Should start with connected servers');
        browser.assert.equal(data.disconnectedCount, 0, 'Should have no connected servers after disconnect');
        browser.assert.ok(data.reconnectionSuccessful, 'Should successfully reconnect servers');

        // Verify status transitions work correctly
        browser.assert.ok(data.serverStatusSummary.totalServers > 0, 'Should have servers configured');
        browser.assert.ok(data.serverStatusSummary.initiallyConnected > 0, 'Should start with connected servers');
        browser.assert.ok(data.serverStatusSummary.afterReconnect > 0, 'Should have reconnected servers');

        // Verify all initially connected servers were included in disconnection list
        browser.assert.equal(
          data.serverStatusSummary.afterReconnect,
          data.serverStatusSummary.initiallyConnected,
          'All connected servers should be listed for disconnection'
        );
      });
  },

  'Should get default remix mcp server capabilities': function (browser: NightwatchBrowser) {
    browser
      .execute(function () {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.mcpInferencer) {
          return { error: 'MCP inferencer not available' };
        }

        const connectionStatuses = aiPlugin.mcpInferencer.getConnectionStatuses();
        const remixServerStatus = connectionStatuses.find((s: any) => s.serverName === 'Remix IDE Server');

        return {
          serverFound: !!remixServerStatus,
          capabilities: remixServerStatus?.capabilities || null,
          status: remixServerStatus?.status || 'unknown'
        };
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Server capabilities error:', data.error);
          return;
        }
        browser.assert.ok(data.serverFound, 'Should find Remix IDE Server');
        browser.assert.equal(data.status, 'connected', 'Server should be connected');
        browser.assert.ok(data.capabilities, 'Server should have capabilities');
      });
  }
};