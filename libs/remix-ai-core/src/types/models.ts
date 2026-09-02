import { IParams } from './types';
import { Features } from '@remix-api';
import { ModelProvider, ModelTransport } from './deepagent';
import { remixAILogger } from '../helpers/logger';

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
  /** Display brand — what the picker groups under. Not how we reach the model. */
  provider: ModelProvider
  /**
   * The transport that carries the request. Only the three real transports
   * are valid here; a vendor brand reaching us as a route is a backend bug,
   * and `getProviderAdapter` rejects it by name rather than guessing.
   */
  routeProvider?: ModelTransport
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
  /** Max output tokens this model accepts. Backend `max_output_tokens`. */
  maxOutputTokens?: number
  /** Total context window in tokens. Backend `context_window`. */
  contextWindow?: number
  /** Sampling temperature this model should run at. Backend `temperature`. */
  temperature?: number
  /** Nucleus sampling. Backend `top_p`. */
  topP?: number
  /** Model emits reasoning/thinking content. Backend `supports_reasoning`. */
  supportsReasoning?: boolean
  systemPromptSuffix?: string
  /** Tool names to hide from this model. Backend `excluded_tools`. */
  excludedTools?: string[]
  /** Per-tool description rewrites. Backend `tool_description_overrides`. */
  toolDescriptionOverrides?: Record<string, string>
  /** General-purpose subagent shaping. Backend `general_purpose_subagent`. */
  generalPurposeSubagent?: {
    enabled?: boolean
    description?: string
    systemPrompt?: string
  }
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
  provider: 'openrouter',
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

export const ANONYMOUS_FALLBACK_MODELS: AIModel[] = [
  ANONYMOUS_PLACEHOLDER_MODEL
]

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

const MODEL_TRANSPORTS: ReadonlySet<string> = new Set<ModelTransport>(['openrouter', 'bedrock', 'ollama'])

function normalizeTransport(
  provider: string,
  routeProvider?: unknown
): { provider: ModelProvider; routeProvider?: ModelTransport } {
  // An explicit, valid route from the backend always wins.
  if (typeof routeProvider === 'string' && MODEL_TRANSPORTS.has(routeProvider)) {
    return {
      provider: (MODEL_TRANSPORTS.has(provider) ? provider : routeProvider) as ModelProvider,
      routeProvider: routeProvider as ModelTransport
    }
  }
  if (MODEL_TRANSPORTS.has(provider)) return { provider: provider as ModelProvider }
  return { provider: 'openrouter', routeProvider: 'openrouter' }
}

function finiteNumber(value: any): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function positiveNumber(value: any): number | undefined {
  const n = finiteNumber(value)
  return n !== undefined && n > 0 ? n : undefined
}

/** A non-empty trimmed string, or undefined. Blank means "not advertised". */
function nonEmptyString(value: any): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/** Array of non-empty strings, or undefined when nothing usable was sent. */
function stringArray(value: any): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const items = value.map(nonEmptyString).filter((v): v is string => !!v)
  return items.length > 0 ? items : undefined
}

/** Record of string→non-empty-string, or undefined. */
function stringRecord(value: any): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const out: Record<string, string> = {}
  for (const [key, raw] of Object.entries(value)) {
    const text = nonEmptyString(raw)
    const name = nonEmptyString(key)
    if (name && text) out[name] = text
  }
  return Object.keys(out).length > 0 ? out : undefined
}

function generalPurposeSubagent(value: any): AIModel['generalPurposeSubagent'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const enabled = typeof value.enabled === 'boolean' ? value.enabled : undefined
  const description = nonEmptyString(value.description)
  const systemPrompt = nonEmptyString(value.system_prompt ?? value.systemPrompt)
  if (enabled === undefined && !description && !systemPrompt) return undefined
  return {
    ...(enabled !== undefined ? { enabled } : {}),
    ...(description ? { description } : {}),
    ...(systemPrompt ? { systemPrompt } : {})
  }
}

export function parseAIModelsFromPermissions(permissions: any): AIModel[] | null {
  const raw = permissions?.ai_models
  console.log('parseAIModelsFromPermissions', { raw, permissions })
  if (!Array.isArray(raw)) return null
  const usable = raw.filter((m: any) => m && typeof m.id === 'string' && m.id.trim() !== '')
  if (usable.length !== raw.length) {
    remixAILogger.warn(
      `[parseAIModelsFromPermissions] ${raw.length - usable.length} of ${raw.length} ai_models rows have no usable id and were skipped`
    )
  }
  const parsed: AIModel[] = usable
    .map((m: any): AIModel => ({
      id: m.id,
      ...normalizeTransport(m.provider, m.route_provider ?? m.routeProvider),
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
      sortOrder: typeof m.sort_order === 'number' ? m.sort_order : 0,
      maxOutputTokens: positiveNumber(m.max_output_tokens ?? m.maxOutputTokens),
      contextWindow: positiveNumber(m.context_window ?? m.contextWindow),
      temperature: finiteNumber(m.temperature),
      topP: finiteNumber(m.top_p ?? m.topP),
      supportsReasoning: typeof (m.supports_reasoning ?? m.supportsReasoning) === 'boolean'
        ? !!(m.supports_reasoning ?? m.supportsReasoning)
        : undefined,
      systemPromptSuffix: nonEmptyString(m.system_prompt_suffix ?? m.systemPromptSuffix),
      excludedTools: stringArray(m.excluded_tools ?? m.excludedTools),
      toolDescriptionOverrides: stringRecord(m.tool_description_overrides ?? m.toolDescriptionOverrides),
      generalPurposeSubagent: generalPurposeSubagent(m.general_purpose_subagent ?? m.generalPurposeSubagent)
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
 * AWS Bedrock is BYOK-only — the Remix proxy no longer fronts it. Without the
 * user's bearer token its rows stay in the catalogue but go unavailable with
 * `reason: 'api_key_required'`, so the picker can advertise Bedrock (and offer
 * the "Add API key" hand-off) instead of hiding a provider the user could use.
 */
export function applyBedrockByokPolicy(models: AIModel[], hasBedrockKey: boolean): AIModel[] {
  if (!Array.isArray(models)) return models
  return models.map((model) => {
    if (!isBedrockModel(model)) return model
    return hasBedrockKey
      ? { ...model, available: true, requiredFeature: null, requireAPIKey: true, reason: undefined }
      : { ...model, available: false, requiredFeature: null, requireAPIKey: true, reason: 'api_key_required' }
  })
}

/** Settings key holding the user's own OpenRouter API key. */
export const OPENROUTER_API_KEY_SETTING = 'deepagent-openrouter-api-key'

/** Keyed by transport: only Bedrock and OpenRouter can run on a user key. */
export const BYOK_API_KEY_SETTINGS: Partial<Record<ModelTransport, string>> = {
  bedrock: BEDROCK_API_KEY_SETTING,
  openrouter: OPENROUTER_API_KEY_SETTING
}

export function modelTransportProvider(model: Pick<AIModel, 'provider' | 'routeProvider'>): AIModel['provider'] {
  return model.routeProvider ?? model.provider
}

const DISPLAY_VENDORS: ReadonlySet<string> = new Set(['anthropic', 'openai', 'mistralai'])

/** Vendor spellings that mean the same maker. */
const VENDOR_ALIASES: Record<string, string> = {
  mistral: 'mistralai'
}

/** The six sections the picker can show. */
export const MODEL_SECTIONS = ['anthropic', 'openai', 'mistralai', 'openrouter', 'bedrock', 'ollama'] as const
export type ModelSection = typeof MODEL_SECTIONS[number]

export function modelVendor(model: Pick<AIModel, 'id' | 'provider' | 'routeProvider'>): ModelSection {
  const transport = modelTransportProvider(model)
  if (transport !== 'openrouter') return transport as ModelSection
  const slashAt = model.id.indexOf('/')
  if (slashAt <= 0) return 'openrouter'
  const raw = model.id.slice(0, slashAt).toLowerCase()
  const vendor = VENDOR_ALIASES[raw] ?? raw
  return DISPLAY_VENDORS.has(vendor) ? (vendor as ModelSection) : 'openrouter'
}

export function isAutoModelId(id: string | undefined | null): boolean {
  if (!id) return false
  const normalized = id.toLowerCase()
  return normalized === 'auto' || normalized === 'openrouter/auto' || normalized.endsWith('/auto')
}

/**
 * Whether a model can call tools.
 */
export function modelSupportsToolCalling(model: Pick<AIModel, 'capabilities'> | undefined): boolean {
  const caps = model?.capabilities
  if (!Array.isArray(caps) || caps.length === 0) return true
  return caps.some((c) => c === 'tools' || c === 'tool_use' || c === 'function_calling')
}

export function modelSupportsCodeGeneration(model: Pick<AIModel, 'capabilities'> | undefined): boolean {
  const caps = model?.capabilities
  if (!Array.isArray(caps) || caps.length === 0) return true
  return caps.includes('code')
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

/** Whether a row runs on the user's own key, or is waiting for one. */
export type ByokKeyState = 'own-key' | 'needs-key'

export function byokKeyState(
  model: Pick<AIModel, 'provider' | 'routeProvider' | 'requireAPIKey'>,
  keyPresence: Partial<Record<AIModel['provider'], boolean>>
): ByokKeyState | undefined {
  const provider = modelTransportProvider(model)
  if (!BYOK_API_KEY_SETTINGS[provider]) return undefined
  if (keyPresence[provider]) return 'own-key'
  return model.requireAPIKey ? 'needs-key' : undefined
}

export function isOpenRouterRouted(model: AIModel): boolean {
  return model.routeProvider === 'openrouter' || model.provider === 'openrouter'
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

export function curateOpenRouterBrandedModels(models: AIModel[]): AIModel[] {
  if (!Array.isArray(models) || models.length === 0) return models
  return models.map((model) => {
    if (model.provider !== 'openrouter') return model
    // parseAIModelsFromPermissions falls back to the id when the backend sends
    // no display_name — never show a raw `vendor/slug` in the picker.
    const displayName = model.displayName && model.displayName !== model.id
      ? model.displayName
      : prettifyOpenRouterId(model.id)
    return {
      ...model, // preserves backend `isDefault`, `available`, `sortOrder`, etc.
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
