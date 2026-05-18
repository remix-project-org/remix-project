import { MCPInferencer, mcpDefaultServersConfig, mcpBasicServersConfig, getDefaultModel } from '@remix/remix-ai-core'
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
      console.error(`[RemixAI Plugin] Failed to add MCP server ${server.name}:`, error)
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
      console.error(`[RemixAI Plugin] Failed to remove MCP server ${serverName}:`, error)
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

  getDefaultServers(hasBasicMcp: boolean): IMCPServer[] {
    return [
      ...mcpDefaultServersConfig.defaultServers,
      ...(hasBasicMcp ? mcpBasicServersConfig.defaultServers : [])
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

    console.log(`[RemixAI Plugin] Waiting for ${serversToWaitFor.length} external MCP servers to connect:`, serversToWaitFor.map(s => s.name))

    return new Promise<void>((resolve) => {
      const connectedServers = new Set<string>()
      const erroredServers = new Set<string>()

      const checkComplete = () => {
        const totalResolved = connectedServers.size + erroredServers.size
        console.log(`[RemixAI Plugin] MCP servers progress: ${totalResolved}/${serversToWaitFor.length} (${connectedServers.size} connected, ${erroredServers.size} errored)`)

        if (totalResolved >= serversToWaitFor.length) {
          console.log(`[RemixAI Plugin] All ${serversToWaitFor.length} external MCP servers resolved`)
          cleanup()
          resolve()
        }
      }

      const onConnected = (serverName: string) => {
        if (serversToWaitFor.some(s => s.name === serverName)) {
          connectedServers.add(serverName)
          console.log(`[RemixAI Plugin] waitForServersReady: "${serverName}" connected`)
          checkComplete()
        }
      }

      const onError = (serverName: string, _error: Error) => {
        if (serversToWaitFor.some(s => s.name === serverName)) {
          erroredServers.add(serverName)
          console.log(`[RemixAI Plugin] waitForServersReady: "${serverName}" errored`)
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
        console.warn(`[RemixAI Plugin] Timeout waiting for MCP servers. Missing: ${missing.join(', ')}`)
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
      remoteInferencer
    )

    mcpInferencer.event.on('mcpServerConnected', (serverName: string) => {
      console.log(`[RemixAI Plugin] MCP server connected: ${serverName}`)
    })
    mcpInferencer.event.on('mcpServerError', (serverName: string, error: Error) => {
      console.error(`[RemixAI Plugin] MCP server error (${serverName}):`, error)
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
      console.warn('[MCPServerManager] deps not set, skipping auth refresh')
      return
    }

    try {
      const isAuthenticated = authState?.isAuthenticated || false

      if (!isAuthenticated) {
        // User logged out - reset to defaults
        console.log('[RemixAI Plugin] User logged out, resetting to default model and MCP servers')
        const defaultModel = getDefaultModel()
        await this.deps.setModel(defaultModel.id)
        await this.resetToDefaultWithReinit()
        return
      }

      const { hasBasicMcp, isBetaUser } = await this.deps.permissionChecker.checkMCPAccess()

      // Determine the expected model based on user type

      // Calculate server list change
      const newServerList = this.getDefaultServers(hasBasicMcp)
      const currentServerNames = this.plugin.mcpServers.map(s => s.name).sort().join(',')
      const newServerNames = newServerList.map(s => s.name).sort().join(',')
      const serversChanged = currentServerNames !== newServerNames

      // Update servers if needed
      if (serversChanged) {
        console.log('[RemixAI Plugin] Updating MCP servers')
        this.plugin.mcpServers = newServerList
        await this.recreateInferencerAndConnect()
      }
    } catch (error) {
      console.error('[RemixAI Plugin] Failed to refresh MCP servers on auth change:', error)
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
      console.error('[RemixAI Plugin] Failed to reset MCP servers to default:', error)
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
      this.plugin.remoteInferencer
    )

    this.plugin.mcpInferencer.event.on('mcpServerConnected', (serverName: string) => {
      console.log(`[RemixAI Plugin] MCP server connected: ${serverName}`)
    })
    this.plugin.mcpInferencer.event.on('mcpServerError', (serverName: string, error: Error) => {
      console.error(`[RemixAI Plugin] MCP server error (${serverName}):`, error)
    })

    // Connect enabled servers
    const enabledServers = this.plugin.mcpServers.filter((s: IMCPServer) => s.enabled)
    if (enabledServers.length > 0) {
      const waitPromise = this.waitForServersReady()
      await this.plugin.mcpInferencer.connectAllServers()
      await waitPromise
      this.plugin.emit('mcpServersLoaded')
      console.log('[RemixAI Plugin] MCP servers refreshed and connected')
    }

    if (this.deps) {
      await this.deps.reinitializeDeepAgent()
    }
  }
}
