import { CONVERSATION_THREAD_PREFIX, DeepAgentInferencer } from '@remix/remix-ai-core'
import type { IRemixAIPlugin, ToolApprovalResponse } from './types'
import type { DeepAgentEventBridge } from './DeepAgentEventBridge'
import type { MCPServerManager } from './MCPServerManager'
import { ApiKeySettingsHelper } from './ApiKeySettingsHelper'

export interface DeepAgentManagerDeps {
  plugin: IRemixAIPlugin
  eventBridge: DeepAgentEventBridge
  mcpManager: MCPServerManager
  setupDeepAgentEventListeners: () => void
}

export class DeepAgentManager {
  private deps: DeepAgentManagerDeps
  private apiKeyHelper: ApiKeySettingsHelper

  constructor(deps: DeepAgentManagerDeps) {
    this.deps = deps
    this.apiKeyHelper = new ApiKeySettingsHelper(deps.plugin)
  }

  async enable(): Promise<void> {
    const plugin = this.deps.plugin

    try {
      if (!plugin.remixMCPServer) {
        throw new Error('RemixMCPServer not initialized')
      }
      // Model selection is API-driven — if /permissions hasn't resolved
      // yet, refuse to start rather than substitute a literal default.
      if (!plugin.selectedModel || !plugin.selectedModelId) {
        throw new Error('[DeepAgentManager.enable] No selectedModel — wait for /permissions before enabling DeepAgent')
      }

      console.log('[RemixAI Plugin] Enabling DeepAgent (API key handled by proxy)...')

      // Ensure MCP servers are fully ready before creating DeepAgent
      if (plugin.mcpInferencer) {
        await this.deps.mcpManager.waitForServersReady()
      }

      // Create or reinitialize DeepAgentInferencer
      const userApiKeys = await this.apiKeyHelper.getUserApiKeysConfig()
      if (userApiKeys?.useOwnKeys) {
        console.log('[RemixAI Plugin] Using user-provided API keys for DeepAgent')
      }
      console.log('[RemixAI Plugin] Using model for DeepAgent:', plugin.selectedModel.provider, plugin.selectedModelId)
      plugin.deepAgentInferencer = new DeepAgentInferencer(
        plugin as any, // Cast to Plugin type
        plugin.remixMCPServer.tools,
        {
          memoryBackend: (localStorage.getItem('deepagent_memory_backend') as 'state' | 'store') || 'store',
          enableSubagents: true,
          enablePlanning: true,
          userApiKeys
        },
        plugin.remoteInferencer,
        plugin.mcpInferencer,
        { provider: plugin.selectedModel.provider as 'anthropic' | 'mistralai' | 'openai' | 'moonshot', modelId: plugin.selectedModelId }
      )

      await plugin.deepAgentInferencer.initialize()

      // Set up event listeners (centralized method prevents duplicates)
      this.deps.eventBridge.resetSetup()
      this.deps.setupDeepAgentEventListeners()

      plugin.deepAgentEnabled = true

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

    console.log('[RemixAI Plugin] DeepAgent disabled')
  }

  isEnabled(): boolean {
    return this.deps.plugin.deepAgentEnabled
  }

  async setAutoMode(_enabled: boolean): Promise<void> {
    // Auto mode is disabled — it can block with no answer.
    console.log('[RemixAI Plugin] Auto mode is disabled')
  }

  getAutoModeStatus(): boolean {
    return false
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
      const emitter = plugin.deepAgentInferencer.getEventEmitter()
      const listenerCount = emitter.listenerCount('onToolApprovalResponse')
      console.log('[DeepAgentManager] respondToToolApproval', response.requestId, 'approved=', response.approved, 'listeners=', listenerCount)
      emitter.emit('onToolApprovalResponse', response)
    } else {
      console.warn('[DeepAgentManager] respondToToolApproval: no deepAgentInferencer')
    }
  }

  cancelRequest(): void {
    const plugin = this.deps.plugin

    if (plugin.deepAgentEnabled && plugin.deepAgentInferencer) {
      plugin.deepAgentInferencer.cancelRequest()
    }
  }

  async isUsingOwnApiKey(): Promise<boolean> {
    const plugin = this.deps.plugin
    const currentProvider = plugin.selectedModel.provider
    return this.apiKeyHelper.isUsingOwnApiKeyForProvider(currentProvider)
  }

  async fallbackToProxy(): Promise<void> {
    const plugin = this.deps.plugin

    try {
      console.log('[DeepAgentManager] Falling back to proxy server...')

      // Update setting to disable own keys via helper
      await this.apiKeyHelper.disableOwnApiKeys()

      // Emit event for UI update
      plugin.emit('apiKeyModeChanged', { usingOwnKey: false })

      // Reinitialize DeepAgent with proxy mode
      await this.reinitialize()

      console.log('[DeepAgentManager] Successfully fell back to proxy server')
    } catch (error) {
      console.error('[DeepAgentManager] Failed to fallback to proxy:', error)
      throw error
    }
  }

  /**
   * Reinitialize DeepAgent with current settings.
   * Used when MCP servers are refreshed, reset, or API key settings change.
   */
  async reinitialize(): Promise<void> {
    const plugin = this.deps.plugin
    // Reinitialize iff the agent is currently active. No localStorage
    // probe — the in-memory `deepAgentEnabled` flag is authoritative.
    if (!(plugin.deepAgentEnabled && plugin.remixMCPServer)) return

    // Race guard: this path runs from MCP server refresh (e.g. on
    // auth change). On login, the MCP recreate completes BEFORE
    // /permissions resolves a model, so selectedModel is still null.
    // Instead of throwing (and worse — flipping deepAgentEnabled off,
    // which then gates out the applyDefaultFromState → enable() path),
    // bow out and let the model-resolution path drive the init.
    if (!plugin.selectedModel || !plugin.selectedModelId) {
      console.log('[RemixAI Plugin] Reinitialize skipped: no selectedModel yet — applyDefaultFromState will enable() once /permissions resolves')
      // Make sure there's no stale instance pointing at outdated MCP state.
      if (plugin.deepAgentInferencer) {
        try {
          this.deps.eventBridge.teardownListeners(plugin.deepAgentInferencer)
          await plugin.deepAgentInferencer.close()
        } catch (e) {
          console.warn('[RemixAI Plugin] Failed to close stale DeepAgent during reinit skip', e)
        }
        plugin.deepAgentInferencer = null
      }
      // Keep deepAgentEnabled = true so the post-permissions enable() path runs.
      return
    }

    try {
      console.log('[RemixAI Plugin] Reinitializing DeepAgent after MCP server reset...')

      // Clean up old instance first
      if (plugin.deepAgentInferencer) {
        this.deps.eventBridge.teardownListeners(plugin.deepAgentInferencer)
        await plugin.deepAgentInferencer.close()
      }

      let autoModeEnabled = false
      try {
        autoModeEnabled = !!(await plugin.call('assistantState' as any, 'isAutoModeEnabled'))
      } catch (e) {
        console.warn('[DeepAgentManager.reinitialize] assistantState.isAutoModeEnabled failed', e)
      }

      console.log('[RemixAI Plugin] Using model for DeepAgent:', plugin.selectedModel.provider, plugin.selectedModelId, 'autoMode:', autoModeEnabled)
      const userApiKeys = await this.apiKeyHelper.getUserApiKeysConfig()
      if (userApiKeys?.useOwnKeys) {
        console.log('[RemixAI Plugin] Using user-provided API keys for DeepAgent (reinitialize)')
      }
      plugin.deepAgentInferencer = new DeepAgentInferencer(
        plugin as any, // Cast to Plugin type
        plugin.remixMCPServer.tools,
        {
          memoryBackend: (localStorage.getItem('deepagent_memory_backend') as 'state' | 'store') || 'store',
          enableSubagents: true,
          enablePlanning: true,
          userApiKeys,
          autoMode: { enabled: autoModeEnabled }
        },
        plugin.remoteInferencer,
        plugin.mcpInferencer,
        { provider: plugin.selectedModel.provider as 'anthropic' | 'mistralai' | 'openai' | 'moonshot', modelId: plugin.selectedModelId }
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
