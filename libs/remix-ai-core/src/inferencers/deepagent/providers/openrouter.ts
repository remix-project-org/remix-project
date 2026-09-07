import { endpointUrls } from '@remix-endpoints-helper'
import { remixAILogger } from '../../../helpers/logger'
import { modelCallbacks } from '../../../helpers/modelTelemetry'
import { SDK_MAX_RETRIES } from '../retryTransport'
import { ProxyChatOpenRouter, RemixChatOpenRouter } from './remixOpenRouter'
import { ProviderAdapter } from './types'

/** OpenRouter needs these to report `usage.cost` and stream reasoning back. */
const OPENROUTER_MODEL_KWARGS = {
  usage: { include: true },
  include_reasoning: true
}

/**
 * Compress the prompt server-side when it would otherwise overflow the model's
 * context window.
 *
 * This matters most in auto mode: `openrouter/auto` picks the model per
 * request, so the client cannot know the window in advance, and a long agent
 * transcript aimed at a small-context model is a hard 400 rather than a
 * degraded answer. The plugin is a no-op when the prompt already fits.
 *
 * Note it compresses the *prompt* only — the output budget still has to fit
 * inside the window on its own, which `resolveModelParams` handles.
 */
const OPENROUTER_PLUGINS = [{ id: 'context-compression' }]

export const openrouterAdapter: ProviderAdapter = {
  id: 'openrouter',
  capabilities: { tools: true, streaming: true, reasoning: true, vision: true, injectableFetch: false },
  async create({ selection, params, userApiKeys, label }) {
    const useDirectApi = !!(userApiKeys?.useOwnKeys && userApiKeys?.openrouterApiKey)
    remixAILogger.log(`[ModelFactory] OpenRouter ${selection.modelId}${useDirectApi ? ' (direct API)' : ' (proxy)'} maxTokens=${params.maxOutputTokens}`)

    const common = {
      model: selection.modelId,
      temperature: params.temperature,
      topP: params.topP,
      maxTokens: params.maxOutputTokens,
      // The SDK takes no custom fetch, so it carries the retry budget itself.
      maxRetries: SDK_MAX_RETRIES,
      callbacks: modelCallbacks(label),
      plugins: OPENROUTER_PLUGINS,
      modelKwargs: OPENROUTER_MODEL_KWARGS
    }

    // Own key → talk to OpenRouter directly.
    if (useDirectApi) {
      return new RemixChatOpenRouter({
        ...common,
        apiKey: userApiKeys!.openrouterApiKey as string,
        siteUrl: 'app.remix.live'
      })
    }

    // No key → route through the Remix proxy, which swaps our bearer token for
    // its own OpenRouter key before forwarding the body untouched.
    return new ProxyChatOpenRouter({
      ...common,
      apiKey: 'proxy-handled',
      baseURL: `${endpointUrls.langchain}/openrouter`
    })
  }
}
