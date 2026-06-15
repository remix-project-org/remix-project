import { remixAILogger,
  MCPInferencer,
  GenerationParams,
  CompletionParams,
  AssistantParams,
  isOllamaAvailable,
  getBestAvailableModel,
  listModels,
  modelSupportsTools,
  getModelById
} from '@remix/remix-ai-core'
import type { AIModel } from '@remix/remix-ai-core'
import type { IRemixAIPlugin } from './types'
import type { DeepAgentEventBridge } from './DeepAgentEventBridge'

export interface ModelManagerDeps {
  plugin: IRemixAIPlugin
  eventBridge: DeepAgentEventBridge
  setupDeepAgentEventListeners: () => void
}

export class ModelManager {
  private deps: ModelManagerDeps

  constructor(deps: ModelManagerDeps) {
    this.deps = deps
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
      remixAILogger.warn('[ModelManager] assistantState.getAvailableModels failed', e)
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

    if (plugin.deepAgentEnabled && plugin.deepAgentInferencer && plugin.remixMCPServer && previousModelId !== modelId) {
      remixAILogger.log('[ModelManager] Reinitializing DeepAgent due to model change...')
      await (plugin as any).deepAgentManager.reinitialize()
    }

    // Emit event for UI updates
    plugin.emit('modelChanged', modelId)
    ;(plugin as any).publishRouteStatus?.()
  }

  private async handleOllamaProvider(_model: AIModel, _modelId: string): Promise<void> {
    const plugin = this.deps.plugin
    const isAvailable = await isOllamaAvailable()

    if (!isAvailable) {
      // Loud failure: no silent fallback to a hardcoded default. The UI
      // catches this and shows the Ollama-setup help message.
      throw new Error('[ModelManager.handleOllamaProvider] Ollama is not available. Start `ollama serve` or pick a different model.')
    }

    const bestModel = await getBestAvailableModel()
    if (!bestModel) {
      throw new Error('[ModelManager.handleOllamaProvider] No tool-capable Ollama model is installed. The agent needs a model that supports tool calling — run `ollama pull qwen2.5-coder` (or another tool-capable model) and try again.')
    }

    (plugin as any).discoveredOllamaModel = bestModel
    remixAILogger.log(`[ModelManager] Ollama provider selected, discovered model: ${bestModel}`)

    plugin.emit('ollamaModelDiscovered', bestModel)
  }

  async setOllamaModel(ollamaModelName: string): Promise<void> {
    const plugin = this.deps.plugin

    // Special method for selecting specific Ollama model after "Ollama" is selected
    if (plugin.selectedModel.provider !== 'ollama') {
      remixAILogger.warn('setOllamaModel should only be called when Ollama provider is selected')
      return
    }

    const isAvailable = await isOllamaAvailable()
    if (!isAvailable) {
      remixAILogger.error('Ollama is not available. Please ensure Ollama is running.')
      return
    }

    // Block models without tool support — the agent depends on tool calling.
    if (!(await modelSupportsTools(ollamaModelName))) {
      throw new Error(`Ollama model "${ollamaModelName}" does not support tool calling and can't be used with the Remix agent. Pick a tool-capable model (e.g. qwen2.5-coder, llama3.1).`)
    }

    (plugin as any).discoveredOllamaModel = ollamaModelName
    remixAILogger.log(`[ModelManager] Ollama model selected: ${ollamaModelName}`)

    if (plugin.deepAgentEnabled && plugin.deepAgentInferencer && plugin.remixMCPServer) {
      remixAILogger.log(`[ModelManager] Reinitializing DeepAgent for Ollama model: ${ollamaModelName}`)
      await (plugin as any).deepAgentManager.reinitialize()
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

  async getOllamaModels(): Promise<{ name: string; supported: boolean }[]> {
    const plugin = this.deps.plugin

    if (plugin.selectedModel.provider !== 'ollama') {
      throw new Error('Ollama is not the selected provider')
    }

    const available = await isOllamaAvailable()
    if (!available) {
      throw new Error('Ollama is not running')
    }

    // Return ALL installed models, flagged by tool support, so the UI can show
    // unsupported models grayed out rather than hiding them. `supported` means
    // the model can call tools — the hard requirement for the agent.
    const all = await listModels()
    return Promise.all(all.map(async (name) => ({ name, supported: await modelSupportsTools(name) })))
  }
}
