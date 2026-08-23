import { IParams } from './types';
import { Features } from '@remix-api';

/**
 * Model registry entry.
 *
 * The authoritative list lives on the backend (`/permissions` →
 * `ai_models[]`) and is fetched per-user. The fields below mirror that
 * payload one-for-one (snake_case → camelCase). For anonymous users we
 * use the small `ANONYMOUS_FALLBACK_MODELS` list further down.
 */
export interface AIModel {
  id: string
  provider: 'openai' | 'mistralai' | 'moonshot' | 'openrouter' | 'anthropic' | 'ollama' | 'bedrock'
  routeProvider?: 'openai' | 'mistralai' | 'moonshot' | 'openrouter' | 'anthropic' | 'ollama' | 'bedrock'
  /** Display name as the backend wants it shown. */
  displayName: string
  description: string
  category: 'coding' | 'general' | 'local'
  capabilities: string[]
  isDefault: boolean
  /** Informational; does NOT gate selection on its own — `available` does. */
  requiresAuth: boolean
  /** ai:* feature key that gates this model, or null when always allowed. */
  requiredFeature: string | null
  /** False → render greyed-out + lock icon; click opens planManager / sign-in. */
  available: boolean
  /** Backend-supplied reason when `available === false`. e.g. 'feature_required'. */
  reason?: string
  requireAPIKey?: boolean
  /** Backend ordering hint. */
  sortOrder: number
}

/** Backwards-compat alias — old code reads `model.name`. */
export type AIModelLegacy = AIModel & { name: string }

/** Always-on local entry — appended to every model list. */
export const OLLAMA_MODEL: AIModel = {
  id: 'ollama',
  provider: 'ollama',
  displayName: 'Local Models (Ollama)',
  description: 'Run AI models locally on your machine',
  category: 'local',
  capabilities: ['chat', 'code', 'completion'],
  isDefault: false,
  requiresAuth: false,
  requiredFeature: null,
  available: true,
  sortOrder: 1000
}

/**
 * Anonymous fallback. The picker shows a single placeholder row that
 * tells the user to sign in (clicking opens planManager(auth-required))
 * plus the always-available Ollama entry.
 *
 * Once `/permissions` resolves, the assistant-state plugin replaces
 * this list with the backend-provided `ai_models` array.
 */
export const ANONYMOUS_PLACEHOLDER_MODEL: AIModel = {
  id: '__signin__',
  provider: 'mistralai',
  displayName: 'Sign in to use AI models',
  description: 'Sign in to your Remix account to access AI features.',
  category: 'general',
  capabilities: [],
  isDefault: true,
  requiresAuth: true,
  requiredFeature: null,
  available: false,
  reason: 'auth_required',
  sortOrder: 0
}

/**
 * Anonymous users have no AI access — only the sign-in placeholder.
 * Ollama is gated by the `ai:ollama` feature; logged-out users don't
 * have any features, so they don't get Ollama either.
 */
export const ANONYMOUS_FALLBACK_MODELS: AIModel[] = [
  ANONYMOUS_PLACEHOLDER_MODEL
]

/**
 * NO bootstrap default model. The chat-default is whichever row the
 * backend marks `is_default: true` in `permissions.ai_models[]`. Read
 * it via `assistantState.getDefaultModel()` (or `selectDefaultModel(snap)`).
 *
 * If you find yourself wanting a literal model id here, you have a bug:
 *   - For "user just opened the app" → selectedModel should be `null`
 *     until /permissions resolves. Render a "Loading…" state.
 *   - For "task X needs model Y" → backend advertises that via
 *     `permissions.task_models[X]`. Read with `assistantState.getModelForTask('X')`.
 *   - For "Ollama / anonymous fallback" → ANONYMOUS_FALLBACK_MODELS.
 *
 * Anything else MUST throw rather than silently substitute.
 */
export function getModelById(id: string, list: ReadonlyArray<AIModel> = ANONYMOUS_FALLBACK_MODELS): AIModel | undefined {
  return list.find(m => m.id === id)
}

export function modelKey(model: Pick<AIModel, 'provider' | 'id'>): string {
  return `${model.provider}::${model.id}`
}

export function parseModelKey(key: string): { provider?: string; id: string } {
  const idx = key.indexOf('::')
  if (idx === -1) return { id: key }
  return { provider: key.slice(0, idx), id: key.slice(idx + 2) }
}

export function findModel(
  list: ReadonlyArray<AIModel>,
  id: string,
  provider?: string
): AIModel | undefined {
  if (provider) return list.find(m => m.id === id && m.provider === provider)
  return list.find(m => m.id === id)
}

/**
 * Parse the `ai_models` array from a /permissions response into the
 * client-side AIModel shape. Returns null when the field is missing.
 *
 *   {
 *     id, provider, display_name, description, category, capabilities,
 *     is_default, requires_auth, required_feature, available, reason,
 *     sort_order
 *   }
 */
export function parseAIModelsFromPermissions(permissions: any): AIModel[] | null {
  const raw = permissions?.ai_models
  if (!Array.isArray(raw)) return null
  const parsed: AIModel[] = raw
    .filter((m: any) => m && typeof m.id === 'string' && typeof m.provider === 'string')
    .map((m: any): AIModel => ({
      id: m.id,
      provider: m.provider,
      displayName: m.display_name ?? m.id,
      description: m.description ?? '',
      category: (m.category ?? 'general') as AIModel['category'],
      capabilities: Array.isArray(m.capabilities) ? m.capabilities : [],
      isDefault: !!m.is_default,
      requiresAuth: !!m.requires_auth,
      requiredFeature: typeof m.required_feature === 'string' ? m.required_feature : null,
      available: m.available !== false,
      reason: typeof m.reason === 'string' ? m.reason : undefined,
      requireAPIKey: !!(m.require_api_key ?? m.requireAPIKey),
      sortOrder: typeof m.sort_order === 'number' ? m.sort_order : 0
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder)

  // Append the local Ollama option only when the user has the `ai:ollama`
  // feature. Every other provider (anthropic / openai / mistral / moonshot /
  // openrouter / bedrock) is advertised directly by the backend in `ai_models`.
  const features = permissions?.features as Record<string, { is_enabled?: boolean }> | undefined

  if (features && features[Features.AI_OLLAMA]?.is_enabled === true) {
    parsed.push(OLLAMA_MODEL)
  }
  return parsed
}

/** Settings key holding the user's own AWS Bedrock bearer token. */
export const BEDROCK_API_KEY_SETTING = 'deepagent-bedrock-bearer-token'

/** True when the model reaches AWS Bedrock, whichever brand it is shown under. */
export function isBedrockModel(model: Pick<AIModel, 'provider' | 'routeProvider'>): boolean {
  return model.routeProvider === 'bedrock' || model.provider === 'bedrock'
}

/**
 * AWS Bedrock is BYOK-only — the Remix proxy no longer fronts it.
 */
export function applyBedrockByokPolicy(models: AIModel[], hasBedrockKey: boolean): AIModel[] {
  if (!Array.isArray(models)) return models
  if (!hasBedrockKey) return models.filter((model) => !isBedrockModel(model))
  return models.map((model) =>
    isBedrockModel(model)
      ? { ...model, available: true, requiredFeature: null, requireAPIKey: true, reason: undefined }
      : model
  )
}

/** Settings key holding the user's own OpenRouter API key. */
export const OPENROUTER_API_KEY_SETTING = 'deepagent-openrouter-api-key'

export const BYOK_API_KEY_SETTINGS: Partial<Record<AIModel['provider'], string>> = {
  bedrock: BEDROCK_API_KEY_SETTING,
  openrouter: OPENROUTER_API_KEY_SETTING
}

/** The provider that actually carries the request (route wins over brand). */
export function modelTransportProvider(model: Pick<AIModel, 'provider' | 'routeProvider'>): AIModel['provider'] {
  return model.routeProvider ?? model.provider
}

/**
 * Applies the BYOK key policy over the whole catalogue: deleting a key must
 * invalidate the provider it belonged to.
 */
export function applyByokKeyPolicy(
  models: AIModel[],
  keyPresence: Partial<Record<AIModel['provider'], boolean>>
): AIModel[] {
  if (!Array.isArray(models)) return models
  return applyBedrockByokPolicy(models, !!keyPresence.bedrock).map((model) => {
    const provider = modelTransportProvider(model)
    // Bedrock rows were already normalized above.
    if (provider === 'bedrock') return model
    if (!BYOK_API_KEY_SETTINGS[provider]) return model
    if (!model.requireAPIKey || keyPresence[provider]) return model
    return { ...model, available: false, reason: 'api_key_required' }
  })
}

/**
 * OpenRouter is the default router: a model is "routed" when it reaches the
 * vendor through another provider's transport. `curateOpenRouterBrandedModels`
 * is the only curation that sets one.
 *
 */
export function isOpenRouterRouted(model: AIModel): boolean {
  return model.routeProvider === 'openrouter' || model.provider === 'openrouter'
}

/**
 * OpenRouter ids are `vendor/slug` (e.g. `anthropic/claude-sonnet-5`). Map the
 * vendor segment onto the brand the picker groups under, so an OpenRouter-routed
 * Claude lands in the Anthropic section rather than a 400-row OpenRouter one.
 * Vendors absent from this map keep `provider: 'openrouter'` and stay grouped
 * under OpenRouter.
 */
const OPENROUTER_VENDOR_BRANDS: Record<string, AIModel['provider']> = {
  anthropic: 'anthropic',
  openai: 'openai',
  mistralai: 'mistralai',
  mistral: 'mistralai',
  moonshotai: 'moonshot',
  moonshot: 'moonshot'
}

/** `anthropic/claude-sonnet-5` → `Claude Sonnet 5`. Only used when the backend
 *  sent no display_name (parseAIModelsFromPermissions falls back to the id). */
function prettifyOpenRouterId(id: string): string {
  const slug = id.includes('/') ? id.slice(id.indexOf('/') + 1) : id
  return slug
    .replace(/:.*$/, '') // drop OpenRouter variant suffixes (`:batch`, `:free`, …)
    .split(/[-_]/)
    .map((part) => (/^\d/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(' ')
}

/**
 * OpenRouter is the primary route: Anthropic / OpenAI / Mistral / Moonshot
 * models reach us as `provider: 'openrouter'` rows and are rebranded here to
 * their vendor so the picker groups them by brand, with `routeProvider:
 * 'openrouter'` carrying the actual transport (ModelFactory reads
 * `routeProvider ?? provider`). The model id is left untouched — OpenRouter
 * requires the full `vendor/slug`.
 *
 * Needs no per-model rule table: the vendor prefix is part of every
 * OpenRouter id.
 */
export function curateOpenRouterBrandedModels(models: AIModel[]): AIModel[] {
  if (!Array.isArray(models) || models.length === 0) return models
  return models.map((model) => {
    if (model.provider !== 'openrouter') return model
    // parseAIModelsFromPermissions falls back to the id when the backend sends
    // no display_name — never show a raw `vendor/slug` in the picker.
    const displayName = model.displayName && model.displayName !== model.id
      ? model.displayName
      : prettifyOpenRouterId(model.id)
    const vendor = model.id.includes('/') ? model.id.slice(0, model.id.indexOf('/')).toLowerCase() : ''
    const brand = OPENROUTER_VENDOR_BRANDS[vendor]
    // Unmapped vendor (x-ai, google, deepseek, …) — stays under OpenRouter.
    if (!brand) return { ...model, displayName }
    return {
      ...model, // preserves backend `isDefault`, `available`, `sortOrder`, etc.
      provider: brand,
      routeProvider: 'openrouter' as const,
      displayName
    }
  })
}

const CompletionParams:IParams = {
  temperature: 0.8,
  topK: 40,
  topP: 0.92,
  max_new_tokens: 15,
  stream_result: false,
  max_tokens: 200,
  version: '1.0.0'
}

const InsertionParams:IParams = {
  temperature: 0.8,
  topK: 40,
  topP: 0.92,
  max_new_tokens: 150,
  stream_result: false,
  stream: false,
  model: "",
  version: '1.0.0',
}

const GenerationParams:IParams = {
  temperature: 0.5,
  topK: 40,
  topP: 0.92,
  max_new_tokens: 20000,
  stream_result: false,
  stream: false,
  model: "",
  repeat_penalty: 1.2,
  terminal_output: false,
  version: '1.0.0',
}

const AssistantParams:IParams = GenerationParams
// Provider is set by ModelManager when the user's model is resolved
// from /permissions. No literal default \u2014 backend drives it.

export { CompletionParams, InsertionParams, GenerationParams, AssistantParams }
