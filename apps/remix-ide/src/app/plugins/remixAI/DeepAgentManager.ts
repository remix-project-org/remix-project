import { remixAILogger, CONVERSATION_THREAD_PREFIX, DeepAgentInferencer, getBestAvailableModel } from '@remix/remix-ai-core'
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
  // Tracks an in-flight reinitialize so any subsequent answer()/prompt()
  // dispatch can await the rebuilt inferencer instead of racing the
  // about-to-be-replaced one.
  private reinitPromise: Promise<void> | null = null
  private pendingHistoryMessages: Array<{ role: 'user' | 'assistant'; content: string }> | null = null

  constructor(deps: DeepAgentManagerDeps) {
    this.deps = deps
    this.apiKeyHelper = new ApiKeySettingsHelper(deps.plugin)
  }

  /**
   * Resolves once any pending DeepAgent reinitialization (triggered by
   * cancelRequest / fallbackToProxy / MCP refresh) has finished. Call
   * before dispatching a new turn so the request never lands on the
   * about-to-be-replaced inferencer.
   */
  async awaitReady(): Promise<void> {
    if (this.reinitPromise) {
      try {
        await this.reinitPromise
      } catch {
        // reinitialize() already logs; swallow so callers can still
        // proceed (they will hit the deepAgentInferencer null-check
        // downstream).
      }
    }
  }

  /**
   * For the Ollama provider, the DeepAgent picker only stores the generic
   * 'ollama' id.
   */
  private async resolveOllamaModelId(provider: string, modelId: string): Promise<string> {
    if (provider !== 'ollama') return modelId
    if (modelId && modelId !== 'ollama') return modelId
    const plugin = this.deps.plugin
    // Prefer the user's explicit Ollama sub-selector pick (or a previously
    // resolved one) over re-running auto-discovery on every reinit.
    const cached = (plugin as any).discoveredOllamaModel
    if (typeof cached === 'string' && cached.length > 0) {
      plugin.emit('ollamaModelDiscovered', cached)
      return cached
    }
    const best = await getBestAvailableModel()
    if (!best) return modelId
    ;(plugin as any).discoveredOllamaModel = best
    plugin.emit('ollamaModelDiscovered', best)
    remixAILogger.log(`[DeepAgentManager] Resolved Ollama model: ${best}`)
    return best
  }

  async enable(): Promise<void> {
    const plugin = this.deps.plugin

    try {
      if (!plugin.remixMCPServer) {
        throw new Error('RemixMCPServer not initialized')
      }

      remixAILogger.log('[RemixAI Plugin] Enabling DeepAgent (API key handled by proxy)...')

      // Ensure MCP servers are fully ready before creating DeepAgent
      if (plugin.mcpInferencer) {
        await this.deps.mcpManager.waitForServersReady()
      }

      // Create or reinitialize DeepAgentInferencer
      remixAILogger.log('[RemixAI Plugin] Using model for DeepAgent:', plugin.selectedModel.provider, plugin.selectedModelId)
      const userApiKeys = await this.apiKeyHelper.getUserApiKeysConfig()
      if (userApiKeys?.useOwnKeys) {
        remixAILogger.log('[RemixAI Plugin] Using user-provided API keys for DeepAgent')
      }
      const resolvedModelId = await this.resolveOllamaModelId(plugin.selectedModel.provider, plugin.selectedModelId)
      // Don't use remote fallback for Ollama - user explicitly chose local models
      const fallbackInferencer = plugin.selectedModel.provider === 'ollama' ? null : plugin.remoteInferencer

      // Clean up old instance if it exists
      if (plugin.deepAgentInferencer && typeof plugin.deepAgentInferencer.cleanup === 'function') {
        plugin.deepAgentInferencer.cleanup()
      }

      plugin.deepAgentInferencer = new DeepAgentInferencer(
        plugin as any, // Cast to Plugin type
        plugin.remixMCPServer.tools,
        {
          memoryBackend: (localStorage.getItem('deepagent_memory_backend') as 'state' | 'store') || 'store',
          enableSubagents: true,
          enablePlanning: true,
          userApiKeys
        },
        fallbackInferencer,
        plugin.mcpInferencer,
        { provider: plugin.selectedModel.provider as 'anthropic' | 'mistralai' | 'openai' | 'moonshot' | 'ollama', modelId: resolvedModelId }
      )

      await plugin.deepAgentInferencer.initialize()

      // Set up event listeners (centralized method prevents duplicates)
      this.deps.eventBridge.resetSetup()
      this.deps.setupDeepAgentEventListeners()

      plugin.deepAgentEnabled = true

      ;(plugin as any).traceDeepAgentLifecycle?.('manager.enable:success', 'DeepAgentInferencer constructed + initialized', {
        provider: plugin.selectedModel?.provider,
        modelId: plugin.selectedModelId
      })
      ;(plugin as any).publishRouteStatus?.()

      // Store settings
      localStorage.setItem('deepagent_enabled', 'true')

      remixAILogger.log('[RemixAI Plugin] DeepAgent enabled successfully')

      // Apply pending thread_id if setDeepAgentThread was called before init completed
      if (plugin.pendingDeepAgentThreadId) {
        plugin.deepAgentInferencer.setSessionThreadId(plugin.pendingDeepAgentThreadId)
        plugin.pendingDeepAgentThreadId = null
      }
    } catch (error) {
      remixAILogger.error('[RemixAI Plugin] Failed to enable DeepAgent:', error)
      plugin.deepAgentEnabled = false
      plugin.deepAgentInferencer = null
      ;(plugin as any).traceDeepAgentLifecycle?.('manager.enable:failed', 'caught error inside DeepAgentManager.enable()', {
        errorMessage: (error as any)?.message,
        errorStack: ((error as any)?.stack || '').split('\n').slice(0, 8).join('\n')
      })
      ;(plugin as any).publishRouteStatus?.()
      throw error
    }
  }

  async disable(): Promise<void> {
    const plugin = this.deps.plugin
    remixAILogger.log('[RemixAI Plugin] Disabling DeepAgent...')

    if (plugin.deepAgentInferencer) {
      this.deps.eventBridge.teardownListeners(plugin.deepAgentInferencer)
      await plugin.deepAgentInferencer.close()
    }

    plugin.deepAgentEnabled = false
    plugin.deepAgentInferencer = null

    ;(plugin as any).traceDeepAgentLifecycle?.('manager.disable', 'DeepAgentManager.disable() called', {})
    ;(plugin as any).publishRouteStatus?.()

    // Store settings
    localStorage.setItem('deepagent_enabled', 'false')

    remixAILogger.log('[RemixAI Plugin] DeepAgent disabled')
  }

  isEnabled(): boolean {
    return this.deps.plugin.deepAgentEnabled
  }

  async setAutoMode(enabled: boolean): Promise<void> {
    // const plugin = this.deps.plugin
    // remixAILogger.log(`[RemixAI Plugin] ${enabled ? 'Enabling' : 'Disabling'} auto mode for DeepAgent`)

    // if (plugin.deepAgentInferencer) {
    //   plugin.deepAgentInferencer.setAutoMode(enabled)
    //   remixAILogger.log(`[RemixAI Plugin] Auto mode ${enabled ? 'enabled' : 'disabled'} for existing DeepAgent instance`)
    // } else {
    //   remixAILogger.warn('[RemixAI Plugin] DeepAgent not initialized, auto mode setting will apply when initialized')
    // }

    // // Store the auto mode preference
    // localStorage.setItem('deepagent_auto_mode', enabled ? 'true' : 'false')
    remixAILogger.log('[RemixAI Plugin] Auto mode is disabled')

  }

  getAutoModeStatus(): boolean {
    // const plugin = this.deps.plugin

    // if (plugin.deepAgentInferencer) {
    //   return plugin.deepAgentInferencer.isAutoModeEnabled()
    // }

    // // Return stored preference if DeepAgent not initialized
    // return localStorage.getItem('deepagent_auto_mode') === 'true'
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
      remixAILogger.log('[DeepAgent-Thread] Plugin: thread set for conversation:', conversationId, '->', threadId)
    } else {
      // DeepAgent not yet initialized - store for later
      plugin.pendingDeepAgentThreadId = threadId
      remixAILogger.log('[DeepAgent-Thread] Plugin: thread PENDING (DeepAgent not ready):', conversationId, '->', threadId)
    }
  }

  respondToToolApproval(response: ToolApprovalResponse): void {
    const plugin = this.deps.plugin

    if (plugin.deepAgentInferencer) {
      plugin.deepAgentInferencer.getEventEmitter().emit('onToolApprovalResponse', response)
    }
  }

  async cancelRequest(historyMessages?: Array<{ role: 'user' | 'assistant'; content: string }>): Promise<void> {
    const plugin = this.deps.plugin

    if (plugin.deepAgentInferencer) {
      plugin.deepAgentInferencer.cancelRequest()
      // Stash history on the manager so doReinitialize() seeds it onto the
      // final inferencer regardless of how many rebuilds queue behind us.
      this.pendingHistoryMessages = historyMessages && historyMessages.length > 0 ? historyMessages : null
      await this.reinitialize()
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
      remixAILogger.log('[DeepAgentManager] Falling back to proxy server...')

      // Update setting to disable own keys via helper
      await this.apiKeyHelper.disableOwnApiKeys()

      // Emit event for UI update
      plugin.emit('apiKeyModeChanged', { usingOwnKey: false })

      // Reinitialize DeepAgent with proxy mode
      await this.reinitialize()

      remixAILogger.log('[DeepAgentManager] Successfully fell back to proxy server')
    } catch (error) {
      remixAILogger.error('[DeepAgentManager] Failed to fallback to proxy:', error)
      throw error
    }
  }

  /**
   * Reinitialize DeepAgent with current settings.
   */
  async reinitialize(): Promise<void> {
    const run = (this.reinitPromise ?? Promise.resolve())
      .catch(() => {}) // never let a prior failure break the chain
      .then(() => this.doReinitialize())
    this.reinitPromise = run.finally(() => {
      if (this.reinitPromise === run) this.reinitPromise = null
    })
    return this.reinitPromise
  }

  private async doReinitialize(): Promise<void> {
    const plugin = this.deps.plugin
    const hasSelectedModel = !!(plugin.selectedModel && plugin.selectedModelId)

    ;(plugin as any).traceDeepAgentLifecycle?.('manager.reinitialize:enter', 'reinitialize() entered — evaluating prereqs', {
      hasRemixMCPServer: !!plugin.remixMCPServer,
      hasSelectedModel,
      willProceed: !!(plugin.remixMCPServer && hasSelectedModel)
    })

    if (plugin.remixMCPServer && hasSelectedModel) {
      try {
        remixAILogger.log('[RemixAI Plugin] Reinitializing DeepAgent after MCP server reset...')

        // Clean up old instance first
        if (plugin.deepAgentInferencer) {
          this.deps.eventBridge.teardownListeners(plugin.deepAgentInferencer)
          await plugin.deepAgentInferencer.close()
        }

        remixAILogger.log('[RemixAI Plugin] Using model for DeepAgent:', plugin.selectedModel.provider, plugin.selectedModelId)
        const userApiKeys = await this.apiKeyHelper.getUserApiKeysConfig()
        if (userApiKeys?.useOwnKeys) {
          remixAILogger.log('[RemixAI Plugin] Using user-provided API keys for DeepAgent (reinitialize)')
        }
        const resolvedModelId = await this.resolveOllamaModelId(plugin.selectedModel.provider, plugin.selectedModelId)
        // Don't use remote fallback for Ollama - user explicitly chose local models
        const fallbackInferencer = plugin.selectedModel.provider === 'ollama' ? null : plugin.remoteInferencer

        // Clean up old instance if it exists
        if (plugin.deepAgentInferencer && typeof plugin.deepAgentInferencer.cleanup === 'function') {
          plugin.deepAgentInferencer.cleanup()
        }

        plugin.deepAgentInferencer = new DeepAgentInferencer(
          plugin as any, // Cast to Plugin type
          plugin.remixMCPServer.tools,
          {
            memoryBackend: (localStorage.getItem('deepagent_memory_backend') as 'state' | 'store') || 'store',
            enableSubagents: true,
            enablePlanning: true,
            userApiKeys
          },
          fallbackInferencer,
          plugin.mcpInferencer,
          { provider: plugin.selectedModel.provider as 'anthropic' | 'mistralai' | 'openai' | 'moonshot' | 'ollama', modelId: resolvedModelId }
        )
        await plugin.deepAgentInferencer.initialize()
        plugin.deepAgentEnabled = true

        ;(plugin as any).traceDeepAgentLifecycle?.('manager.reinitialize:success', 'DeepAgent reinitialized', {
          provider: plugin.selectedModel?.provider,
          modelId: plugin.selectedModelId
        })
        ;(plugin as any).publishRouteStatus?.()

        // Set up event listeners (reset flag first)
        this.deps.eventBridge.resetSetup()
        this.deps.setupDeepAgentEventListeners()

        if (plugin.pendingDeepAgentThreadId) {
          plugin.deepAgentInferencer.setSessionThreadId(plugin.pendingDeepAgentThreadId)
          plugin.pendingDeepAgentThreadId = null
        }

        // Seed any history stashed by cancelRequest onto the final inferencer.
        if (this.pendingHistoryMessages && this.pendingHistoryMessages.length > 0) {
          plugin.deepAgentInferencer.setPendingHistoryMessages(this.pendingHistoryMessages)
          remixAILogger.log('[DeepAgentManager] doReinitialize: seeded pending history messages on new inferencer', this.pendingHistoryMessages.length)
          this.pendingHistoryMessages = null
        }

        remixAILogger.log('[RemixAI Plugin] DeepAgent reinitialized successfully')
      } catch (error) {
        remixAILogger.error('[RemixAI Plugin] Failed to reinitialize DeepAgent:', error)
        plugin.deepAgentEnabled = false
        plugin.deepAgentInferencer = null
        ;(plugin as any).traceDeepAgentLifecycle?.('manager.reinitialize:failed', 'caught error inside DeepAgentManager.reinitialize()', {
          errorMessage: (error as any)?.message,
          errorStack: ((error as any)?.stack || '').split('\n').slice(0, 8).join('\n')
        })
        ;(plugin as any).publishRouteStatus?.()
      }
    }
  }
}
