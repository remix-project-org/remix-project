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
  getDefaultModel,
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
    let model = getModelById(modelId)
    if (!model) {
      model = getDefaultModel()
      modelId = model.id
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
        plugin.remoteInferencer
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
      console.error('Ollama is not available. Please ensure Ollama is running. Falling back to default model.')
      const defaultModel = getDefaultModel()
      this.applyFallbackModel(defaultModel)
      return
    }

    const bestModel = await getBestAvailableModel()
    if (!bestModel) {
      console.error('No Ollama models available. Falling back to default model.')
      const defaultModel = getDefaultModel()
      this.applyFallbackModel(defaultModel)
      return
    }

    // Switch to Ollama inferencer
    plugin.remoteInferencer = new OllamaInferencer(bestModel)
    this.setupInferencerEvents(plugin.remoteInferencer)
  }

  private applyFallbackModel(defaultModel: AIModel): void {
    const plugin = this.deps.plugin
    plugin.selectedModelId = defaultModel.id
    plugin.selectedModel = defaultModel
    GenerationParams.provider = defaultModel.provider
    GenerationParams.model = defaultModel.id
    CompletionParams.provider = defaultModel.provider
    CompletionParams.model = defaultModel.id
    AssistantParams.provider = defaultModel.provider
    AssistantParams.model = defaultModel.id
  }

  private setupInferencerEvents(inferencer: RemoteInferencer | OllamaInferencer): void {
    const plugin = this.deps.plugin
    inferencer.event.on('onInference', () => {
      plugin.isInferencing = true
    })
    inferencer.event.on('onInferenceDone', () => {
      plugin.isInferencing = false
    })
  }

  private async reinitializeDeepAgentForModelChange(model: AIModel, modelId: string): Promise<void> {
    const plugin = this.deps.plugin
    console.log('[RemixAI Plugin] Model changed, reinitializing DeepAgent with new model:', model.provider, modelId)

    try {
      // Clean up old instance
      this.deps.eventBridge.teardownListeners(plugin.deepAgentInferencer!)
      await plugin.deepAgentInferencer!.close()

      // Create new instance with updated model
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
        { provider: model.provider as 'anthropic' | 'mistralai', modelId: modelId }
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
        plugin.remoteInferencer
      )
      await plugin.mcpInferencer.connectAllServers()
    }
  }

  async setAssistantProvider(provider: string): Promise<void> {
    const providerToModelMap: Record<string, string> = {
      'openai': 'gpt-4-turbo',
      'mistralai': 'mistral-medium-latest',
      'anthropic': 'claude-sonnet-4-6',
      'ollama': 'ollama'
    }
    const modelId = providerToModelMap[provider] || getDefaultModel().id
    await this.setModel(modelId)
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
