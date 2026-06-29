import { remixAILogger, MCPInferencer, mcpDefaultServersConfig, mcpBasicServersConfig, mcpWebSearchServersConfig } from '@remix/remix-ai-core'
import type { IMCPServer, IMCPConnectionStatus } from '@remix/remix-ai-core'
import type { IRemixAIPlugin } from './types'
import type { PermissionChecker } from './PermissionChecker'

export interface MCPServerManagerDeps {
  plugin: IRemixAIPlugin
  permissionChecker: PermissionChecker
  setModel: (modelId: string) => Promise<void>
  reinitializeDeepAgent: () => Promise<void>
}

export class MCPServerManager {
  private plugin: IRemixAIPlugin
  private deps: MCPServerManagerDeps | null = null

  constructor(plugin: IRemixAIPlugin) {
    this.plugin = plugin
  }

  setDeps(deps: MCPServerManagerDeps): void {
    this.deps = deps
  }

  async addServer(server: IMCPServer): Promise<void> {
    try {
      this.plugin.mcpServers.push(server)

      // If MCP inferencer is active, add the server dynamically
      if (this.plugin.mcpInferencer) {
        await this.plugin.mcpInferencer.addMCPServer(server)
      }
    } catch (error) {
      remixAILogger.error(`[RemixAI Plugin] Failed to add MCP server ${server.name}:`, error)
      throw error
    }
  }

  async removeServer(serverName: string): Promise<void> {
    try {
      const serverToRemove = this.plugin.mcpServers.find(s => s.name === serverName)
      if (serverToRemove?.isBuiltIn) {
        throw new Error(`Cannot remove built-in server: ${serverName}`)
      }
      this.plugin.mcpServers = this.plugin.mcpServers.filter(s => s.name !== serverName)

      // If MCP inferencer is active, remove the server dynamically
      if (this.plugin.mcpInferencer) {
        await this.plugin.mcpInferencer.removeMCPServer(serverName)
      }
    } catch (error) {
      remixAILogger.error(`[RemixAI Plugin] Failed to remove MCP server ${serverName}:`, error)
      throw error
    }
  }

  getConnectionStatus(): IMCPConnectionStatus[] {
    if (this.plugin.mcpInferencer) {
      return this.plugin.mcpInferencer.getConnectionStatuses()
    }

    return this.plugin.mcpServers.map(server => ({
      serverName: server.name,
      status: 'disconnected' as const,
      lastAttempt: Date.now()
    }))
  }

  async getResources(): Promise<Record<string, any[]>> {
    if (this.plugin.mcpInferencer) {
      return await this.plugin.mcpInferencer.getAllResources()
    }
    return {}
  }

  async getTools(): Promise<Record<string, any[]>> {
    if (this.plugin.mcpInferencer) {
      return await this.plugin.mcpInferencer.getAllTools()
    }
    return {}
  }

  async executeTool(serverName: string, toolName: string, arguments_: Record<string, any>): Promise<any> {
    if (this.plugin.mcpInferencer) {
      return await this.plugin.mcpInferencer.executeTool(serverName, { name: toolName, arguments: arguments_ })
    }
    throw new Error('MCP provider not active')
  }

  getServers(): IMCPServer[] {
    return this.plugin.mcpServers
  }

  getDefaultServers(hasBasicMcp: boolean, hasWebSearch: boolean = false): IMCPServer[] {
    return [
      ...mcpDefaultServersConfig.defaultServers,
      ...(hasBasicMcp ? mcpBasicServersConfig.defaultServers : []),
      // Web Search requires authentication — only include when the user
      // has the `mcp:web-search` permission. Otherwise the auto-connect
      // would fire an unauthenticated request and the gateway returns 401.
      ...(hasWebSearch ? mcpWebSearchServersConfig.defaultServers : [])
    ]
  }

  /**
   * Waits for all enabled MCP servers to emit their connection events (connected or errored).
   * This ensures all external MCP tools are available before DeepAgentInferencer is instantiated.
   */
  waitForServersReady(timeout: number = 30000): Promise<void> {
    const mcpInferencer = this.plugin.mcpInferencer
    if (!mcpInferencer) return Promise.resolve()

    const enabledServers = this.plugin.mcpServers.filter(s => s.enabled)
    if (enabledServers.length === 0) return Promise.resolve()

    // Track which servers we're waiting for (excluding Remix IDE Server which is internal)
    const serversToWaitFor = enabledServers.filter(s => s.name !== 'Remix IDE Server')
    if (serversToWaitFor.length === 0) return Promise.resolve()

    // Seed with already-resolved servers. Connection events may have fired
    // before this listener was attached (e.g. when called after a prior
    // connectAllServers() has completed — happens on the post-login
    // refreshMCPServersOnAuthChange → applyDefaultFromState → enable()
    // sequence). Without this, the listeners hang for the full timeout.
    const statuses = mcpInferencer.getConnectionStatuses?.() ?? []
    const statusByName = new Map(statuses.map(s => [s.serverName, s.status]))
    const preConnected = new Set<string>()
    const preErrored = new Set<string>()
    for (const s of serversToWaitFor) {
      const st = statusByName.get(s.name)
      if (st === 'connected') preConnected.add(s.name)
      else if (st === 'error') preErrored.add(s.name)
    }
    if (preConnected.size + preErrored.size >= serversToWaitFor.length) {
      remixAILogger.log(`[RemixAI Plugin] waitForServersReady: all ${serversToWaitFor.length} servers already resolved (connected=${preConnected.size}, errored=${preErrored.size}), skipping wait`)
      return Promise.resolve()
    }

    remixAILogger.log(`[RemixAI Plugin] Waiting for ${serversToWaitFor.length} external MCP servers to connect:`, serversToWaitFor.map(s => s.name), `(already resolved: ${preConnected.size + preErrored.size})`)

    return new Promise<void>((resolve) => {
      const connectedServers = new Set<string>(preConnected)
      const erroredServers = new Set<string>(preErrored)

      const checkComplete = () => {
        const totalResolved = connectedServers.size + erroredServers.size
        remixAILogger.log(`[RemixAI Plugin] MCP servers progress: ${totalResolved}/${serversToWaitFor.length} (${connectedServers.size} connected, ${erroredServers.size} errored)`)

        if (totalResolved >= serversToWaitFor.length) {
          remixAILogger.log(`[RemixAI Plugin] All ${serversToWaitFor.length} external MCP servers resolved`)
          cleanup()
          resolve()
        }
      }

      const onConnected = (serverName: string) => {
        if (serversToWaitFor.some(s => s.name === serverName)) {
          connectedServers.add(serverName)
          remixAILogger.log(`[RemixAI Plugin] waitForServersReady: "${serverName}" connected`)
          checkComplete()
        }
      }

      const onError = (serverName: string, _error: Error) => {
        if (serversToWaitFor.some(s => s.name === serverName)) {
          erroredServers.add(serverName)
          remixAILogger.log(`[RemixAI Plugin] waitForServersReady: "${serverName}" errored`)
          checkComplete()
        }
      }

      const cleanup = () => {
        mcpInferencer.event.off('mcpServerConnected', onConnected)
        mcpInferencer.event.off('mcpServerError', onError)
        clearTimeout(timeoutId)
      }

      const timeoutId = setTimeout(() => {
        const missing = serversToWaitFor
          .filter(s => !connectedServers.has(s.name) && !erroredServers.has(s.name))
          .map(s => s.name)
        remixAILogger.warn(`[RemixAI Plugin] Timeout waiting for MCP servers. Missing: ${missing.join(', ')}`)
        cleanup()
        resolve()
      }, timeout)

      // Listen for connection events
      mcpInferencer.event.on('mcpServerConnected', onConnected)
      mcpInferencer.event.on('mcpServerError', onError)
    })
  }

  async createInferencer(remixMCPServer: any, remoteInferencer: any): Promise<MCPInferencer> {
    const mcpInferencer = new MCPInferencer(
      this.plugin.mcpServers,
      undefined,
      undefined,
      remixMCPServer,
      remoteInferencer,
      this.plugin.getMcpAuthToken
    )

    mcpInferencer.event.on('mcpServerConnected', (serverName: string) => {
      remixAILogger.log(`[RemixAI Plugin] MCP server connected: ${serverName}`)
    })
    mcpInferencer.event.on('mcpServerError', (serverName: string, error: Error) => {
      remixAILogger.error(`[RemixAI Plugin] MCP server error (${serverName}):`, error)
    })
    mcpInferencer.event.on('onInference', () => {
      this.plugin.isInferencing = true
    })
    mcpInferencer.event.on('onInferenceDone', () => {
      this.plugin.isInferencing = false
    })

    return mcpInferencer
  }

  async connectAndWait(mcpInferencer: MCPInferencer): Promise<void> {
    const enabledServers = this.plugin.mcpServers.filter((s: IMCPServer) => s.enabled)
    if (enabledServers.length > 0) {
      const waitPromise = this.waitForServersReady()
      await mcpInferencer.connectAllServers()
      await waitPromise
      this.plugin.emit('mcpServersLoaded')
    }
  }

  async resetToDefault(): Promise<void> {
    this.plugin.mcpServers = [...mcpDefaultServersConfig.defaultServers]
  }

  async refreshOnAuthChange(authState: any): Promise<void> {
    if (!this.deps) {
      remixAILogger.warn('[MCPServerManager] deps not set, skipping auth refresh')
      return
    }

    try {
      const isAuthenticated = authState?.isAuthenticated || false

      if (!isAuthenticated) {
        // User logged out — clear the in-memory model selection and reset
        // MCP servers. The next /permissions response (after re-login) will
        // re-populate selectedModel via assistantState. No literal default.
        remixAILogger.log('[RemixAI Plugin] User logged out, clearing model selection and resetting MCP servers')
        this.plugin.selectedModel = null
        this.plugin.selectedModelId = ''
        await this.resetToDefaultWithReinit()
        return
      }

      const { hasBasicMcp, hasWebSearch, isBetaUser } = await this.deps.permissionChecker.checkMCPAccess()

      // Determine the expected model based on user type

      // Calculate server list change
      const newServerList = this.getDefaultServers(hasBasicMcp, hasWebSearch)
      const currentServerNames = this.plugin.mcpServers.map(s => s.name).sort().join(',')
      const newServerNames = newServerList.map(s => s.name).sort().join(',')
      const serversChanged = currentServerNames !== newServerNames

      // Update servers if needed
      if (serversChanged) {
        remixAILogger.log('[RemixAI Plugin] Updating MCP servers')
        this.plugin.mcpServers = newServerList
        await this.recreateInferencerAndConnect()
      }
    } catch (error) {
      remixAILogger.error('[RemixAI Plugin] Failed to refresh MCP servers on auth change:', error)
    }
  }

  /**
   * Reset to default servers with full MCP inferencer recreation and DeepAgent reinit.
   */
  async resetToDefaultWithReinit(): Promise<void> {
    try {
      this.plugin.mcpServers = [...mcpDefaultServersConfig.defaultServers]
      await this.recreateInferencerAndConnect()
    } catch (error) {
      remixAILogger.error('[RemixAI Plugin] Failed to reset MCP servers to default:', error)
    }
  }

  private async recreateInferencerAndConnect(): Promise<void> {
    if (!this.plugin.remixMCPServer) return

    if (this.plugin.mcpInferencer) {
      for (const server of this.plugin.mcpServers) {
        try {
          await this.plugin.mcpInferencer.removeMCPServer(server.name)
        } catch (err) {
        }
      }
    }

    // Create new inferencer
    this.plugin.mcpInferencer = new MCPInferencer(
      this.plugin.mcpServers,
      undefined,
      undefined,
      this.plugin.remixMCPServer,
      this.plugin.remoteInferencer,
      this.plugin.getMcpAuthToken
    )

    this.plugin.mcpInferencer.event.on('mcpServerConnected', (serverName: string) => {
      remixAILogger.log(`[RemixAI Plugin] MCP server connected: ${serverName}`)
    })
    this.plugin.mcpInferencer.event.on('mcpServerError', (serverName: string, error: Error) => {
      remixAILogger.error(`[RemixAI Plugin] MCP server error (${serverName}):`, error)
    })

    // Connect enabled servers
    const enabledServers = this.plugin.mcpServers.filter((s: IMCPServer) => s.enabled)
    if (enabledServers.length > 0) {
      const waitPromise = this.waitForServersReady()
      await this.plugin.mcpInferencer.connectAllServers()
      await waitPromise
      this.plugin.emit('mcpServersLoaded')
      remixAILogger.log('[RemixAI Plugin] MCP servers refreshed and connected')
    }

    if (this.deps) {
      await this.deps.reinitializeDeepAgent()
    }
  }
}
