import {
  RemoteInferencer,
  OllamaInferencer,
  MCPInferencer,
  DeepAgentInferencer,
  GenerationParams,
  CompletionParams,
  AssistantParams,
  isOllamaAvailable,
  getBestAvailableModel,
  listModels,
  getModelById
} from '@remix/remix-ai-core'
import type { AIModel } from '@remix/remix-ai-core'
import type { IRemixAIPlugin } from './types'
import type { DeepAgentEventBridge } from './DeepAgentEventBridge'
import { ApiKeySettingsHelper } from './ApiKeySettingsHelper'

export interface ModelManagerDeps {
  plugin: IRemixAIPlugin
  eventBridge: DeepAgentEventBridge
  setupDeepAgentEventListeners: () => void
}

export class ModelManager {
  private deps: ModelManagerDeps
  private apiKeyHelper: ApiKeySettingsHelper

  constructor(deps: ModelManagerDeps) {
    this.deps = deps
    this.apiKeyHelper = new ApiKeySettingsHelper(deps.plugin)
  }

  async setModel(modelId: string, allowedModels: string[] = []): Promise<void> {
    const plugin = this.deps.plugin
    // The static `getModelById` only knows the anonymous fallback list
    // (placeholder + ollama). Real model metadata lives in the
    // assistantState plugin, fed by /permissions.ai_models. Look it up
    // there first; only fall back to the static helper for the bootstrap
    // / ollama cases.
    let model: AIModel | undefined
    try {
      const dynamic: AIModel[] = await plugin.call('assistantState', 'getAvailableModels')
      if (Array.isArray(dynamic)) {
        model = dynamic.find(m => m.id === modelId)
      }
    } catch (e) {
      console.warn('[ModelManager] assistantState.getAvailableModels failed', e)
    }
    if (!model) model = getModelById(modelId)
    if (!model) {
      // No silent fallback. The picker is fed by /permissions — if a
      // caller asks for a model id that isn't in any catalogue we have a
      // bug, not a recoverable situation. Throw loud.
      throw new Error(`[ModelManager.setModel] Model id "${modelId}" not found in /permissions ai_models nor in the anonymous fallback catalogue. Cannot continue without an API-resolved model.`)
    }

    plugin.allowedModels = allowedModels

    // Store previous model for comparison
    const previousModelId = plugin.selectedModelId

    plugin.selectedModelId = modelId
    plugin.selectedModel = model

    // Update inference parameters
    GenerationParams.provider = model.provider
    GenerationParams.model = modelId
    CompletionParams.provider = model.provider
    CompletionParams.model = modelId
    AssistantParams.provider = model.provider
    AssistantParams.model = modelId

    // Clear thread IDs when switching models
    if (previousModelId !== modelId) {
      plugin.assistantThreadId = ''
      GenerationParams.threadId = ''
      CompletionParams.threadId = ''
      AssistantParams.threadId = ''
    }

    // Switch inferencer based on provider
    if (model.provider === 'ollama') {
      await this.handleOllamaProvider(model, modelId)
    }

    // Update MCP inferencer if enabled
    if (plugin.mcpEnabled) {
      plugin.mcpInferencer = new MCPInferencer(
        plugin.mcpServers,
        undefined,
        undefined,
        plugin.remixMCPServer,
        plugin.remoteInferencer,
        plugin.getMcpAuthToken
      )
      plugin.mcpInferencer.event.on('mcpServerConnected', (_serverName: string) => {
        // Handle server connected
      })
      plugin.mcpInferencer.event.on('mcpServerError', (_serverName: string, _error: Error) => {
        // Handle server error
      })
      plugin.mcpInferencer.event.on('onInference', () => {
        plugin.isInferencing = true
      })
      plugin.mcpInferencer.event.on('onInferenceDone', () => {
        plugin.isInferencing = false
      })
      await plugin.mcpInferencer.connectAllServers()
    }

    // Reinitialize DeepAgent if enabled and model changed
    console.log(`[ModelManager] Model set to ${modelId} (provider: ${model.provider}). Previous model was ${previousModelId}. Reinitializing DeepAgent if needed.`)
    if (plugin.deepAgentEnabled && plugin.deepAgentInferencer && plugin.remixMCPServer && previousModelId !== modelId) {
      console.log('[ModelManager] Reinitializing DeepAgent due to model change...')
      await this.reinitializeDeepAgentForModelChange(model, modelId)
    }

    // Emit event for UI updates
    plugin.emit('modelChanged', modelId)
  }

  private async handleOllamaProvider(model: AIModel, modelId: string): Promise<void> {
    const plugin = this.deps.plugin
    const isAvailable = await isOllamaAvailable()

    if (!isAvailable) {
      // Loud failure: no silent fallback to a hardcoded default. The UI
      // catches this and shows the Ollama-setup help message.
      throw new Error('[ModelManager.handleOllamaProvider] Ollama is not available. Start `ollama serve` or pick a different model.')
    }

    const bestModel = await getBestAvailableModel()
    if (!bestModel) {
      throw new Error('[ModelManager.handleOllamaProvider] No Ollama models installed locally. Run `ollama pull codestral:latest` (or another model) and try again.')
    }

    // Switch to Ollama inferencer
    plugin.remoteInferencer = new OllamaInferencer(bestModel)
    this.setupInferencerEvents(plugin.remoteInferencer)
  }

  // applyFallbackModel removed — there is no client-side fallback model.
  // If selection fails, throw and let the caller decide (the UI surfaces
  // a help message and the user picks a different model).

  private setupInferencerEvents(inferencer: RemoteInferencer | OllamaInferencer): void {
    const plugin = this.deps.plugin
    inferencer.event.on('onInference', () => {
      plugin.isInferencing = true
    })
    inferencer.event.on('onInferenceDone', () => {
      plugin.isInferencing = false
    })
  }

  private async reinitializeDeepAgentForModelChange(_model: AIModel, _modelId: string): Promise<void> {
    const plugin = this.deps.plugin
    console.log('[RemixAI Plugin] Model changed, reinitializing DeepAgent with new model:', _model.provider, _modelId)

    try {
      // Clean up old instance
      this.deps.eventBridge.teardownListeners(plugin.deepAgentInferencer!)
      await plugin.deepAgentInferencer!.close()

      // Get user API keys config
      const userApiKeys = await this.apiKeyHelper.getUserApiKeysConfig()
      if (userApiKeys?.useOwnKeys) {
        console.log('[RemixAI Plugin] Using user-provided API keys for DeepAgent (model change)')
      }

      // Create new instance with updated model
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
        { provider: _model.provider as 'anthropic' | 'mistralai' | 'openai' | 'moonshot', modelId: _modelId }
      )
      await plugin.deepAgentInferencer.initialize()

      // Reset and set up event listeners
      this.deps.eventBridge.resetSetup()
      this.deps.setupDeepAgentEventListeners()

      console.log('[RemixAI Plugin] DeepAgent reinitialized with new model successfully')

      // Apply pending thread_id after model switch reinitialization
      if (plugin.pendingDeepAgentThreadId) {
        plugin.deepAgentInferencer.setSessionThreadId(plugin.pendingDeepAgentThreadId)
        plugin.pendingDeepAgentThreadId = null
      }
    } catch (error) {
      console.error('[RemixAI Plugin] Failed to reinitialize DeepAgent on model change:', error)
      // Keep DeepAgent enabled but log the error
    }
  }

  async setOllamaModel(ollamaModelName: string): Promise<void> {
    const plugin = this.deps.plugin

    // Special method for selecting specific Ollama model after "Ollama" is selected
    if (plugin.selectedModel.provider !== 'ollama') {
      console.warn('setOllamaModel should only be called when Ollama provider is selected')
      return
    }

    const isAvailable = await isOllamaAvailable()
    if (!isAvailable) {
      console.error('Ollama is not available. Please ensure Ollama is running.')
      return
    }

    plugin.remoteInferencer = new OllamaInferencer(ollamaModelName)
    this.setupInferencerEvents(plugin.remoteInferencer)

    // Update MCP if enabled
    if (plugin.mcpEnabled && plugin.mcpInferencer) {
      plugin.mcpInferencer = new MCPInferencer(
        plugin.mcpServers,
        undefined,
        undefined,
        plugin.remixMCPServer,
        plugin.remoteInferencer,
        plugin.getMcpAuthToken
      )
      await plugin.mcpInferencer.connectAllServers()
    }
  }

  async setAssistantProvider(provider: string): Promise<void> {
    const plugin = this.deps.plugin
    // Resolve the provider to a concrete model via /permissions instead
    // of a hardcoded provider→model literal map. We pick the first available
    // model whose provider matches — preferring the one flagged is_default.
    let catalogue: AIModel[] = []
    try {
      catalogue = await plugin.call('assistantState' as any, 'getAvailableModels')
    } catch (e) {
      throw new Error(`[ModelManager.setAssistantProvider] Cannot resolve provider "${provider}" — assistantState.getAvailableModels failed: ${(e as Error)?.message ?? e}`)
    }
    const candidates = (Array.isArray(catalogue) ? catalogue : []).filter(m => m.provider === provider && m.available)
    if (candidates.length === 0) {
      throw new Error(`[ModelManager.setAssistantProvider] No available model for provider "${provider}" in /permissions ai_models. Backend must advertise at least one row for this provider.`)
    }
    const chosen = candidates.find(m => m.isDefault) ?? candidates[0]
    await this.setModel(chosen.id)
  }

  async getOllamaModels(): Promise<string[]> {
    const plugin = this.deps.plugin

    if (plugin.selectedModel.provider !== 'ollama') {
      throw new Error('Ollama is not the selected provider')
    }

    const available = await isOllamaAvailable()
    if (!available) {
      throw new Error('Ollama is not running')
    }

    const models = await listModels()
    return models
  }
}
