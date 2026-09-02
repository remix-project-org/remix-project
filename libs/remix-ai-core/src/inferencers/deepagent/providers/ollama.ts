import { ChatOllama } from '@langchain/ollama'
import { remixAILogger } from '../../../helpers/logger'
import { modelCallbacks } from '../../../helpers/modelTelemetry'
import { SDK_MAX_RETRIES } from '../retryTransport'
import { discoverOllamaHost, getBestAvailableModel, getModelCapabilities } from '../../local/ollama'
import { ProviderAdapter } from './types'

export const ollamaAdapter: ProviderAdapter = {
  id: 'ollama',
  // Tool support is per-installed-model here, so it is probed in create()
  // rather than declared. The transport itself supports it.
  capabilities: { tools: true, streaming: true, reasoning: true, injectableFetch: false },
  async create({ selection, params, label }) {
    const host = await discoverOllamaHost()
    if (!host) {
      throw new Error('[ModelFactory] Ollama is not running or unreachable')
    }

    const chosenModel = (selection.modelId && selection.modelId !== 'ollama')
      ? selection.modelId
      : await getBestAvailableModel()
    if (!chosenModel) {
      throw new Error('[ModelFactory] No tool-capable Ollama model is installed. The Remix agent requires a model that supports tool calling — install one (e.g. `ollama pull qwen2.5-coder`) and try again.')
    }

    const caps = await getModelCapabilities(chosenModel)
    if (!caps.tools) {
      throw new Error(`[ModelFactory] Ollama model "${chosenModel}" does not support tool calling, which the Remix agent requires. Choose a tool-capable model (e.g. qwen2.5-coder, llama3.1, mistral-nemo).`)
    }

    remixAILogger.log(`[ModelFactory] Ollama ${chosenModel} @ ${host} (thinking: ${caps.thinking}) numPredict=${params.maxOutputTokens}`)
    return new ChatOllama({
      baseUrl: host,
      model: chosenModel,
      temperature: params.temperature,
      topP: params.topP,
      numPredict: params.maxOutputTokens,
      streaming: true,
      maxRetries: SDK_MAX_RETRIES,
      callbacks: modelCallbacks(label),
      ...(caps.thinking ? { think: true } : {})
    })
  }
}
