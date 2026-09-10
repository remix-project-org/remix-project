import { ModelSelection } from '../../../types/deepagent'
import { AIModel, isAutoModelId, modelTransportProvider } from '../../../types/models'
import { getModelCatalog } from '../modelParams'

export const OPENROUTER_BACKSTOP_MODELS = [
  '~z-ai/glm-latest',
  '~deepseek/deepseek-v4-flash-latest'
]

/** Entries in the `models` array: the nearest sibling, then the two backstops. */
const MAX_FALLBACK_MODELS = 3

/** Small/cheap-tier naming, matched on the OpenRouter slug. */
const FAST_TIER_PATTERN = /flash|mini|lite|air|turbo|small|haiku|nano/i

/** `z-ai/glm-5.3` → `z-ai`. Slugless ids (Bedrock, ollama) have no vendor. */
function vendorOf(modelId: string): string | undefined {
  const slashAt = modelId.indexOf('/')
  return slashAt > 0 ? modelId.slice(0, slashAt).toLowerCase() : undefined
}

function isFastTier(modelId: string): boolean {
  return FAST_TIER_PATTERN.test(modelId)
}

function sharedCapabilities(a: AIModel, b: AIModel): number {
  const theirs = new Set(b.capabilities.map(c => c.toLowerCase()))
  return a.capabilities.reduce((n, c) => n + (theirs.has(c.toLowerCase()) ? 1 : 0), 0)
}

/**
 * How well `candidate` stands in for `target`. Only the ordering matters — the
 * weights say which likenesses we are least willing to trade away:
 */
function similarity(target: AIModel, candidate: AIModel): number {
  let score = 0

  const targetVendor = vendorOf(target.id)
  if (targetVendor && targetVendor === vendorOf(candidate.id)) score += 4
  if (isFastTier(target.id) === isFastTier(candidate.id)) score += 3
  if (target.category === candidate.category) score += 2
  if (target.supportsReasoning !== undefined && target.supportsReasoning === candidate.supportsReasoning) score += 1
  score += Math.min(sharedCapabilities(target, candidate), 2)

  const want = target.contextWindow
  const have = candidate.contextWindow
  if (want && have) {
    if (have >= want) score += 2
    else if (have >= want / 2) score += 1
    else score -= 2
  }

  return score
}

/**
 * Whether a catalogue row can serve as an OpenRouter fallback at all. The
 */
function isRoutableFallback(candidate: AIModel, targetId: string): boolean {
  if (candidate.id === targetId) return false
  if (modelTransportProvider(candidate) !== 'openrouter') return false
  // `auto` is OpenRouter's own router — nesting it under our list is circular.
  if (isAutoModelId(candidate.id)) return false
  // Gated or key-hungry rows fail the same way for this user as the model we
  // are falling back *from*, so they buy nothing.
  if (candidate.available === false) return false
  if (candidate.requireAPIKey) return false
  return true
}

/**
 * The OpenRouter `models` list for a selection: its closest catalogue sibling,
 * then the backstop aliases. The picked model is NOT in here — it travels in
 * the `model` field and stays the primary; this array is only the sequence
 * OpenRouter walks when that one cannot be served.
 */
export function openrouterFallbackModels(
  selection: Pick<ModelSelection, 'provider' | 'modelId'>,
  catalog: ReadonlyArray<AIModel> = getModelCatalog()
): string[] {
  // Dropped when the user picked a backstop itself, which frees a slot for one
  // more sibling rather than shortening the chain.
  const backstops = OPENROUTER_BACKSTOP_MODELS.filter(id => id !== selection.modelId)
  const target = catalog.find(m => m.id === selection.modelId)

  const similar = target
    ? catalog
      .filter(candidate => isRoutableFallback(candidate, target.id))
      .map(candidate => ({ id: candidate.id, score: similarity(target, candidate), sortOrder: candidate.sortOrder }))
      // Ties break on the backend's own ordering hint, which already ranks by
      // how much we want a model used.
      .sort((a, b) => b.score - a.score || a.sortOrder - b.sortOrder)
      .filter(entry => !backstops.includes(entry.id))
      .slice(0, MAX_FALLBACK_MODELS - backstops.length)
      .map(entry => entry.id)
    : []

  return [...similar, ...backstops]
}
