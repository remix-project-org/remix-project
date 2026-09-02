import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { remixAILogger } from '../../helpers/logger'
import { IUserApiKeyConfig, ModelSelection } from '../../types/deepagent'
import { DAPP_MAX_TOKENS } from './constants'
import { resolveModelParams, ResolvedModelParams } from './modelParams'
import { getProviderAdapter } from './providers'
import { onApiKeysChange } from './deepAgentSettingsEvents'

function fingerprint(value: string | undefined): string {
  if (!value) return '0'
  let h = 0
  for (let i = 0; i < value.length; i++) {
    h = ((h << 5) - h + value.charCodeAt(i)) | 0
  }
  return `${value.length}.${(h >>> 0).toString(36)}`
}

function cacheKey(selection: ModelSelection, params: ResolvedModelParams, userApiKeys?: IUserApiKeyConfig): string {
  const keyPart = [
    userApiKeys?.useOwnKeys ? '1' : '0',
    fingerprint(userApiKeys?.openrouterApiKey),
    fingerprint(userApiKeys?.bedrockBearerToken)
  ].join('.')
  return [
    selection.provider,
    selection.routeProvider ?? '-',
    selection.modelId,
    params.maxOutputTokens,
    params.temperature,
    params.topP ?? '-',
    keyPart
  ].join('::')
}

const instanceCache = new Map<string, BaseChatModel>()
/** In-flight builds, so two concurrent callers share one instance. */
const pendingCache = new Map<string, Promise<BaseChatModel>>()

export function clearModelCache(): void {
  if (instanceCache.size || pendingCache.size) {
    remixAILogger.log(`[ModelFactory] clearing model cache (${instanceCache.size} instance(s))`)
  }
  instanceCache.clear()
  pendingCache.clear()
}

// A changed BYOK key changes the transport (proxy ↔ direct API), so every
// cached instance built under the old keys is stale.
onApiKeysChange(() => clearModelCache())

export interface CreateModelOptions {
  /** Bypass the cache and build a fresh instance. */
  fresh?: boolean
}

/**
 * @param maxTokens Ceiling on the output budget — the model's own advertised
 *   limit still wins when it is lower. Defaults to the DApp generator's
 *   budget, which is the largest any caller asks for.
 */
export async function createModelInstance(
  modelSelection: ModelSelection,
  maxTokens: number = DAPP_MAX_TOKENS,
  userApiKeys?: IUserApiKeyConfig,
  options: CreateModelOptions = {}
): Promise<BaseChatModel> {
  const provider = modelSelection.routeProvider ?? modelSelection.provider
  const params = resolveModelParams(modelSelection, maxTokens)
  const key = cacheKey(modelSelection, params, userApiKeys)

  if (!options.fresh) {
    const cached = instanceCache.get(key)
    if (cached) return cached
    const pending = pendingCache.get(key)
    if (pending) return pending
  }

  const adapter = getProviderAdapter(provider)
  const label = `${provider}/${modelSelection.modelId}`

  const build = adapter
    .create({ selection: modelSelection, params, userApiKeys, label })
    .then((model) => {
      if (!options.fresh) instanceCache.set(key, model)
      return model
    })
    .finally(() => {
      pendingCache.delete(key)
    })

  if (!options.fresh) pendingCache.set(key, build)
  return build
}

/**
 * Whether a built model instance can call tools, per the provider SDK's own
 * capability profile. Independent of the backend catalogue, which advertises
 * `capabilities` by hand and can disagree with what the provider actually
 * serves — a code-tuned model is routinely code-capable and tool-incapable at
 * the same time, and binding tools to one fails the whole request.
 *
 * Permissive when the provider ships no profile (Bedrock, Ollama): silence is
 * not evidence of missing support.
 */
export function modelInstanceSupportsTools(model: BaseChatModel): boolean {
  return (model as any)?.profile?.toolCalling !== false
}
