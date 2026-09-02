import { ChatBedrockConverse } from '@langchain/aws'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { remixAILogger } from '../../../helpers/logger'
import { modelCallbacks } from '../../../helpers/modelTelemetry'
import { SDK_MAX_RETRIES } from '../retryTransport'
import { ProviderAdapter } from './types'

export const DEFAULT_BEDROCK_REGION = 'us-east-1'

export function ensureToolDescriptions<T>(tools: T[]): T[] {
  if (!Array.isArray(tools)) return tools
  const fallback = (name?: unknown) =>
    (typeof name === 'string' && name.length > 0 ? `The ${name} tool.` : 'No description provided.')
  return tools.map((tool: any) => {
    if (!tool || typeof tool !== 'object') return tool
    try {
      // StructuredTool / DynamicStructuredTool and plain { name, description }.
      if ('description' in tool && (!tool.description || String(tool.description).trim().length === 0)) {
        tool.description = fallback(tool.name)
      }
      // OpenAI-style function tool: { type: 'function', function: { name, description } }.
      const fn = tool.function
      if (fn && typeof fn === 'object' && (!fn.description || String(fn.description).trim().length === 0)) {
        fn.description = fallback(fn.name)
      }
    } catch {
      /* description may be read-only on some tool classes — best effort. */
    }
    return tool
  })
}

export function geoForRegion(region: string): string {
  if (region.startsWith('us-gov-')) return 'us-gov'
  if (region.startsWith('eu-')) return 'eu'
  if (region.startsWith('ap-')) return 'apac'
  return 'us'
}

export function resolveBedrockModelId(modelId: string, region: string): string {
  const m = modelId.match(/^(us-gov|us|eu|apac)\.(.+)$/)
  if (!m) return modelId
  return `${geoForRegion(region)}.${m[2]}`
}

function patchBindTools<T extends BaseChatModel>(model: T): T {
  const original = typeof (model as any).bindTools === 'function' ? (model as any).bindTools.bind(model) : null
  if (!original) return model
  ;(model as any).bindTools = (tools: any[], kwargs?: any) => original(ensureToolDescriptions(tools), kwargs)
  return model
}

export const bedrockAdapter: ProviderAdapter = {
  id: 'bedrock',
  // ChatBedrockConverse builds its own signed HTTP client; no fetch to inject.
  capabilities: { tools: true, streaming: true, reasoning: true, injectableFetch: false },
  async create({ selection, params, userApiKeys, label }) {
    // Bedrock is BYOK-only — the Remix proxy no longer fronts it. Without the
    // user's own bearer token there is no route to build, and the picker hides
    // Bedrock models until it is set, so reaching here means a stale selection.
    const bedrockBearerToken = userApiKeys?.bedrockBearerToken?.trim()
    if (!bedrockBearerToken) {
      throw new Error('[ModelFactory] AWS Bedrock requires your own Bedrock API key. Add it under Settings → RemixAI Assistant → Bring Your Own API Keys.')
    }
    const region = DEFAULT_BEDROCK_REGION
    const bedrockModelId = resolveBedrockModelId(selection.modelId, region)

    remixAILogger.log(`[ModelFactory] Bedrock ${bedrockModelId} @ ${region} (own key) maxTokens=${params.maxOutputTokens}`)
    return patchBindTools(new ChatBedrockConverse({
      model: bedrockModelId,
      region,
      bedrockBearerToken,
      // Previously omitted entirely, so every Bedrock run silently used the
      // service default rather than the budget the caller asked for.
      maxTokens: params.maxOutputTokens,
      temperature: params.temperature,
      topP: params.topP,
      maxRetries: SDK_MAX_RETRIES,
      callbacks: modelCallbacks(label)
    }))
  }
}
