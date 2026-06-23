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
  provider: 'openai' | 'mistralai' | 'moonshot' | 'anthropic' | 'ollama'
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
 *   - For "user just opened the app" \u2192 selectedModel should be `null`
 *     until /permissions resolves. Render a "Loading\u2026" state.
 *   - For "task X needs model Y" \u2192 backend advertises that via
 *     `permissions.task_models[X]`. Read with `assistantState.getModelForTask('X')`.
 *   - For "Ollama / anonymous fallback" \u2192 ANONYMOUS_FALLBACK_MODELS.
 *
 * Anything else MUST throw rather than silently substitute.
 */

export function getModelById(id: string, list: ReadonlyArray<AIModel> = ANONYMOUS_FALLBACK_MODELS): AIModel | undefined {
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
      sortOrder: typeof m.sort_order === 'number' ? m.sort_order : 0
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder)
  // Append the local Ollama option only when the user has the `ai:ollama`
  // feature enabled. The backend doesn't ship Ollama in `ai_models[]`
  // (it's a local capability), so the feature flag is the only signal.
  const features = permissions?.features as Record<string, { is_enabled?: boolean }> | undefined
  if (features && features[Features.AI_OLLAMA]?.is_enabled === true) {
    parsed.push(OLLAMA_MODEL)
  }
  return parsed
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
