/**
 * Model tiering, shared by the chat assistant and the checklist modal.
 *
 * Kept in its own small module rather than in `types/models.ts` so UI packages
 * can import it through a narrow alias without pulling the whole remix-ai-core
 * barrel into their bundle.
 */

import { AIModel, isAutoModelId, isOpenRouterRouted } from '../types/models'

/**
 * Frontier model lines, grouped by the vendor family they belong to.
 */
export interface FrontierModelFamily {
  family: string
  markers: string[]
}

export const FRONTIER_MODEL_FAMILIES: FrontierModelFamily[] = [
  { family: 'Anthropic', markers: ['sonnet-5']},
  { family: 'OpenAI', markers: ['gpt-5']},
  { family: 'Google', markers: ['gemini-2', 'gemini-3']},
  { family: 'DeepSeek', markers: ['deepseek-v4']},
  { family: 'GLM', markers: ['glm-5']},
  { family: 'Qwen', markers: ['qwen-max', 'qwen3']},
  { family: 'Moonshot', markers: ['kimi-k2']},
  { family: 'MiniMax', markers: ['minimax-m']},
  { family: 'Mistral', markers: ['mistral-large', 'magistral']},
  { family: 'xAI', markers: ['grok-4', 'grok-3']}
]

/** Flat marker list, derived so the families stay the single source of truth. */
export const FRONTIER_MODEL_MARKERS: string[] = FRONTIER_MODEL_FAMILIES.flatMap(entry => entry.markers)

/** Split an id into comparable word tokens: `claude-opus-4.7:beta` -> claude, opus, 4.7, beta. */
function tokenize(slug: string): string[] {
  return slug.split(/[^a-z0-9.]+/).filter(token => token.length > 0)
}

/**
 * Does `slug` name this marker's flagship rather than a cut-down relative?
 */
function matchesMarker(slug: string, marker: string): boolean {
  const normalizedMarker = marker.replace(/[-_.:/]+$/, '')
  if (!normalizedMarker) return false

  const markerTokens = tokenize(normalizedMarker)
  const slugTokens = tokenize(slug)
  if (!markerTokens.length) return false

  const tokenMatches = (markerToken: string, slugToken: string, isLast: boolean): boolean => {
    if (slugToken === undefined) return false
    if (slugToken === markerToken) return true
    if (!isLast || !slugToken.startsWith(markerToken)) return false
    const remainder = slugToken.slice(markerToken.length)
    return /^[0-9.]+$/.test(remainder)
  }

  return slugTokens.some((_, index) =>
    markerTokens.every((token, offset) =>
      tokenMatches(token, slugTokens[index + offset], offset === markerTokens.length - 1)
    )
  )
}

/** Which family a model id belongs to, or null when it is not frontier. */
export function frontierFamilyOf(id: string | undefined | null): string | null {
  if (!id) return null
  // Compare on the slug, so the provider prefix never participates in matching.
  const slug = id.toLowerCase().split('/').pop() || ''
  const match = FRONTIER_MODEL_FAMILIES.find(entry => entry.markers.some(marker => matchesMarker(slug, marker)))
  return match ? match.family : null
}

export function isFrontierModelId(id: string | undefined | null): boolean {
  return frontierFamilyOf(id) !== null
}

/**
 * Fisher-Yates with an injectable source of randomness.
 */
function shuffled<T>(items: T[], random: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const swap = out[i]
    out[i] = out[j]
    out[j] = swap
  }
  return out
}

/**
 * The frontier models a user can actually pick right now.
 */
export function selectFrontierModels(
  models: AIModel[] | undefined,
  limit = 8,
  random: () => number = Math.random
): AIModel[] {
  if (!Array.isArray(models)) return []
  const eligible = models
    .filter(model => !!model && model.available !== false)
    // OpenRouter only: Bedrock is BYOK-only and Ollama is a local route, so
    // neither is something we can switch a user onto for an audit.
    .filter(model => isOpenRouterRouted(model))
    .filter(model => !isAutoModelId(model.id))
    .filter(model => isFrontierModelId(model.id))

  const byFamily = new Map<string, AIModel[]>()
  eligible.forEach(model => {
    const family = frontierFamilyOf(model.id) as string
    if (!byFamily.has(family)) byFamily.set(family, [])
    byFamily.get(family).push(model)
  })

  // Shuffle each family once, so a second round still cannot repeat a model.
  byFamily.forEach((entries, family) => byFamily.set(family, shuffled(entries, random)))

  // Families in catalogue order, so an unknown-but-frontier family still gets a turn.
  const order = [
    ...FRONTIER_MODEL_FAMILIES.map(entry => entry.family).filter(family => byFamily.has(family)),
    ...Array.from(byFamily.keys()).filter(family => !FRONTIER_MODEL_FAMILIES.some(entry => entry.family === family))
  ]

  const picked: AIModel[] = []
  const cap = Math.max(0, limit)
  for (let round = 0; picked.length < cap; round++) {
    let addedThisRound = false
    for (const family of order) {
      if (picked.length >= cap) break
      const candidate = byFamily.get(family)[round]
      if (!candidate) continue
      picked.push(candidate)
      addedThisRound = true
    }
    if (!addedThisRound) break
  }
  return picked
}

/**
 * The frontier models worth offering *instead of* the current one.
 */
export function frontierAlternativesFor(
  currentModelId: string | undefined | null,
  models: AIModel[] | undefined,
  limit = 8,
  random: () => number = Math.random
): AIModel[] {
  if (!isAutoModelId(currentModelId)) return []
  return selectFrontierModels(models, limit, random)
}
