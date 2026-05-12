import { CONVERSATION_THREAD_PREFIX, DeepAgentInferencer } from '@remix/remix-ai-core'
import type { IRemixAIPlugin, ToolApprovalResponse } from './types'
import type { DeepAgentEventBridge } from './DeepAgentEventBridge'
import type { MCPServerManager } from './MCPServerManager'

export interface DeepAgentManagerDeps {
  plugin: IRemixAIPlugin
  eventBridge: DeepAgentEventBridge
  mcpManager: MCPServerManager
  setupDeepAgentEventListeners: () => void
}

export class DeepAgentManager {
  private deps: DeepAgentManagerDeps

  constructor(deps: DeepAgentManagerDeps) {
    this.deps = deps
  }

  async enable(): Promise<void> {
    const plugin = this.deps.plugin

    try {
      if (!plugin.remixMCPServer) {
        throw new Error('RemixMCPServer not initialized')
      }

      console.log('[RemixAI Plugin] Enabling DeepAgent (API key handled by proxy)...')

      // Ensure MCP servers are fully ready before creating DeepAgent
      if (plugin.mcpInferencer) {
        await this.deps.mcpManager.waitForServersReady()
      }

      // Create or reinitialize DeepAgentInferencer
      console.log('[RemixAI Plugin] Using model for DeepAgent:', plugin.selectedModel.provider, plugin.selectedModelId)
      plugin.deepAgentInferencer = new DeepAgentInferencer(
        plugin as any, // Cast to Plugin type
        plugin.remixMCPServer.tools,
        {
          memoryBackend: (localStorage.getItem('deepagent_memory_backend') as 'state' | 'store') || 'store',
          enableSubagents: true,
          enablePlanning: true,
          autoMode: {
            enabled: localStorage.getItem('deepagent_auto_mode') === 'true',
            fallbackModel: {
              provider: 'mistralai',
              modelId: 'mistral-medium-latest'
            }
          }
        },
        plugin.remoteInferencer,
        plugin.mcpInferencer,
        { provider: plugin.selectedModel.provider as 'anthropic' | 'mistralai', modelId: plugin.selectedModelId }
      )

      await plugin.deepAgentInferencer.initialize()

      // Set up event listeners (centralized method prevents duplicates)
      this.deps.eventBridge.resetSetup()
      this.deps.setupDeepAgentEventListeners()

      plugin.deepAgentEnabled = true

      // Store settings
      localStorage.setItem('deepagent_enabled', 'true')

      console.log('[RemixAI Plugin] DeepAgent enabled successfully')

      // Apply pending thread_id if setDeepAgentThread was called before init completed
      if (plugin.pendingDeepAgentThreadId) {
        plugin.deepAgentInferencer.setSessionThreadId(plugin.pendingDeepAgentThreadId)
        plugin.pendingDeepAgentThreadId = null
      }
    } catch (error) {
      console.error('[RemixAI Plugin] Failed to enable DeepAgent:', error)
      plugin.deepAgentEnabled = false
      plugin.deepAgentInferencer = null
      throw error
    }
  }

  async disable(): Promise<void> {
    const plugin = this.deps.plugin
    console.log('[RemixAI Plugin] Disabling DeepAgent...')

    if (plugin.deepAgentInferencer) {
      this.deps.eventBridge.teardownListeners(plugin.deepAgentInferencer)
      await plugin.deepAgentInferencer.close()
    }

    plugin.deepAgentEnabled = false
    plugin.deepAgentInferencer = null

    // Store settings
    localStorage.setItem('deepagent_enabled', 'false')

    console.log('[RemixAI Plugin] DeepAgent disabled')
  }

  isEnabled(): boolean {
    return this.deps.plugin.deepAgentEnabled
  }

  async setAutoMode(enabled: boolean): Promise<void> {
    const plugin = this.deps.plugin
    console.log(`[RemixAI Plugin] ${enabled ? 'Enabling' : 'Disabling'} auto mode for DeepAgent`)

    if (plugin.deepAgentInferencer) {
      plugin.deepAgentInferencer.setAutoMode(enabled)
      console.log(`[RemixAI Plugin] Auto mode ${enabled ? 'enabled' : 'disabled'} for existing DeepAgent instance`)
    } else {
      console.warn('[RemixAI Plugin] DeepAgent not initialized, auto mode setting will apply when initialized')
    }

    // Store the auto mode preference
    localStorage.setItem('deepagent_auto_mode', enabled ? 'true' : 'false')
  }

  getAutoModeStatus(): boolean {
    const plugin = this.deps.plugin

    if (plugin.deepAgentInferencer) {
      return plugin.deepAgentInferencer.isAutoModeEnabled()
    }

    // Return stored preference if DeepAgent not initialized
    return localStorage.getItem('deepagent_auto_mode') === 'true'
  }

  /**
   * Set DeepAgent thread for an existing conversation.
   * Uses conversationId as part of thread_id so MemorySaver restores that conversation's context.
   * If DeepAgent is not yet initialized, stores the thread_id for later application.
   */
  setThread(conversationId: string): void {
    const plugin = this.deps.plugin
    const threadId = `${CONVERSATION_THREAD_PREFIX}${conversationId}`

    if (plugin.deepAgentInferencer) {
      plugin.deepAgentInferencer.setSessionThreadId(threadId)
      plugin.pendingDeepAgentThreadId = null
      console.log('[DeepAgent-Thread] Plugin: thread set for conversation:', conversationId, '->', threadId)
    } else {
      // DeepAgent not yet initialized - store for later
      plugin.pendingDeepAgentThreadId = threadId
      console.log('[DeepAgent-Thread] Plugin: thread PENDING (DeepAgent not ready):', conversationId, '->', threadId)
    }
  }

  respondToToolApproval(response: ToolApprovalResponse): void {
    const plugin = this.deps.plugin

    if (plugin.deepAgentInferencer) {
      plugin.deepAgentInferencer.getEventEmitter().emit('onToolApprovalResponse', response)
    }
  }

  cancelRequest(): void {
    const plugin = this.deps.plugin

    if (plugin.deepAgentEnabled && plugin.deepAgentInferencer) {
      plugin.deepAgentInferencer.cancelRequest()
    }
  }

  /**
   * Reinitialize DeepAgent with current settings.
   * Used when MCP servers are refreshed or reset.
   */
  async reinitialize(): Promise<void> {
    const plugin = this.deps.plugin
    const deepAgentEnabled = localStorage.getItem('deepagent_enabled') === 'true'

    if (deepAgentEnabled && plugin.remixMCPServer) {
      try {
        console.log('[RemixAI Plugin] Reinitializing DeepAgent after MCP server reset...')

        // Clean up old instance first
        if (plugin.deepAgentInferencer) {
          this.deps.eventBridge.teardownListeners(plugin.deepAgentInferencer)
          await plugin.deepAgentInferencer.close()
        }

        console.log('[RemixAI Plugin] Using model for DeepAgent:', plugin.selectedModel.provider, plugin.selectedModelId)
        plugin.deepAgentInferencer = new DeepAgentInferencer(
          plugin as any, // Cast to Plugin type
          plugin.remixMCPServer.tools,
          {
            memoryBackend: (localStorage.getItem('deepagent_memory_backend') as 'state' | 'store') || 'store',
            enableSubagents: true,
            enablePlanning: true
          },
          plugin.remoteInferencer,
          plugin.mcpInferencer,
          { provider: plugin.selectedModel.provider as 'anthropic' | 'mistralai', modelId: plugin.selectedModelId }
        )
        await plugin.deepAgentInferencer.initialize()
        plugin.deepAgentEnabled = true

        // Set up event listeners (reset flag first)
        this.deps.eventBridge.resetSetup()
        this.deps.setupDeepAgentEventListeners()

        console.log('[RemixAI Plugin] DeepAgent reinitialized successfully')
      } catch (error) {
        console.error('[RemixAI Plugin] Failed to reinitialize DeepAgent:', error)
        plugin.deepAgentEnabled = false
        plugin.deepAgentInferencer = null
      }
    }
  }
}
