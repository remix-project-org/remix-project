/**
 * Audit checklist taxonomy helpers.
 *
 * The audit checklist is fetched at runtime from a third-party repo
 * (Cyfrin/audit-checklist). Nothing here hardcodes a category name: the set of
 * selectable paths, their descriptions and their sample questions are all
 * derived from whatever JSON was fetched. That is what lets the AI-match
 * feature survive an upstream rename without a code change.
 *
 */

/** Structural shape of a checklist node — either a leaf item or a category. */
export interface AuditChecklistNode {
  category?: string
  description?: string
  data?: AuditChecklistNode[]
  id?: string
  question?: string
}

/** One selectable category, flattened, with just enough context to match on. */
export interface AuditTaxonomyEntry {
  /** `"Main"` or `"Main::Sub"` — the exact string the checkbox uses. */
  path: string
  itemCount: number
  description?: string
  samples?: string[]
}

export type AuditMatchConfidence = 'high' | 'medium' | 'low'

export interface AuditMatch {
  path: string
  confidence: AuditMatchConfidence
  reason: string
}

export interface AuditMatchContract {
  path: string
  skeleton: string
  contractNames?: string[]
}

export interface AuditMatchRequest {
  contract: AuditMatchContract
  taxonomy: AuditTaxonomyEntry[]
  maxMatches?: number
}

export interface AuditMatchResult {
  matches: AuditMatch[]
  discarded: string[]
  skippedReason?: string
  source: 'structured' | 'loose'
}

const CONFIDENCE_ORDER: Record<AuditMatchConfidence, number> = { high: 0, medium: 1, low: 2 }
const DEFAULT_MAX_SAMPLES = 3
const DEFAULT_MAX_DESCRIPTION_CHARS = 180
const DEFAULT_MAX_SAMPLE_CHARS = 110
/** Below this, a description tells the model nothing useful — use samples instead. */
const THIN_DESCRIPTION_CHARS = 24
const MAX_REASON_CHARS = 240

/** A leaf item carries both `id` and `question`; a category carries `data`. */
export function isChecklistLeaf(node: AuditChecklistNode): boolean {
  return !!node && typeof node.id === 'string' && typeof node.question === 'string'
}

/** Every leaf item under `data`, recursing through nested categories. */
export function collectChecklistLeaves(data: AuditChecklistNode[] | undefined): AuditChecklistNode[] {
  if (!Array.isArray(data)) return []
  const items: AuditChecklistNode[] = []
  for (const node of data) {
    if (!node) continue
    if (isChecklistLeaf(node)) items.push(node)
    else items.push(...collectChecklistLeaves(node.data))
  }
  return items
}

/**
 * The selectable category paths, in catalogue order.
 */
export function enumerateSelectableChecklistPaths(data: AuditChecklistNode[] | undefined): string[] {
  if (!Array.isArray(data)) return []
  const paths: string[] = []
  for (const mainCat of data) {
    if (!mainCat || !mainCat.category) continue
    const children = Array.isArray(mainCat.data) ? mainCat.data : []
    const hasDirectItems = children.some(isChecklistLeaf)
    const subCats = children.filter(item => item && !isChecklistLeaf(item))
    if (hasDirectItems && subCats.length === 0) {
      paths.push(mainCat.category)
    } else {
      subCats.forEach(sub => { if (sub.category) paths.push(`${mainCat.category}::${sub.category}`) })
    }
  }
  return paths
}

/** Resolve a `Main` / `Main::Sub` path back to its node. */
function resolvePathNode(data: AuditChecklistNode[], path: string): AuditChecklistNode | null {
  const [mainName, subName] = path.split('::')
  const main = data.find(c => c && c.category === mainName)
  if (!main) return null
  if (!subName) return main
  const children = Array.isArray(main.data) ? main.data : []
  return children.find(i => i && !isChecklistLeaf(i) && i.category === subName) ?? null
}

export interface BuildTaxonomyOptions {
  maxSamples?: number
  maxDescriptionChars?: number
  maxSampleChars?: number
}

/**
 * Flatten the fetched catalogue into one entry per selectable path.
 *
 */
export function buildAuditTaxonomy(
  data: AuditChecklistNode[] | undefined,
  options: BuildTaxonomyOptions = {}
): AuditTaxonomyEntry[] {
  if (!Array.isArray(data)) return []
  const maxSamples = options.maxSamples ?? DEFAULT_MAX_SAMPLES
  const maxDescriptionChars = options.maxDescriptionChars ?? DEFAULT_MAX_DESCRIPTION_CHARS
  const maxSampleChars = options.maxSampleChars ?? DEFAULT_MAX_SAMPLE_CHARS

  return enumerateSelectableChecklistPaths(data).map(path => {
    const node = resolvePathNode(data, path)
    const leaves = collectChecklistLeaves(node?.data)
    const description = (node?.description ?? '').trim().slice(0, maxDescriptionChars)
    const entry: AuditTaxonomyEntry = { path, itemCount: leaves.length }
    if (description) entry.description = description
    if (description.length < THIN_DESCRIPTION_CHARS) {
      const samples = Array.from(new Set(
        leaves
          .map(l => (l.question ?? '').trim())
          .filter(Boolean)
          .map(q => q.slice(0, maxSampleChars))
      )).slice(0, maxSamples)
      if (samples.length) entry.samples = samples
    }
    return entry
  })
}

/**
 * Render the taxonomy as prompt text under a hard character budget.
 *
 */
export function renderTaxonomyBlock(
  taxonomy: AuditTaxonomyEntry[],
  options: { maxChars?: number } = {}
): string {
  const maxChars = options.maxChars ?? 12000
  const render = (entry: AuditTaxonomyEntry, tier: 0 | 1 | 2): string => {
    const head = `- ${entry.path} (${entry.itemCount} items)`
    if (tier === 2) return head
    const descLimit = tier === 0 ? DEFAULT_MAX_DESCRIPTION_CHARS : 90
    const description = entry.description ? entry.description.slice(0, descLimit) : ''
    if (description) return `${head}: ${description}`
    if (tier === 0 && entry.samples?.length) return `${head}: e.g. ${entry.samples.join(' | ')}`
    return head
  }
  for (const tier of [0, 1, 2] as const) {
    const block = taxonomy.map(entry => render(entry, tier)).join('\n')
    if (block.length <= maxChars || tier === 2) return block
  }
  return ''
}

/**
 * Best-effort JSON extraction from a free-form model reply.
 */
export function parseLooseJson(raw: string): unknown | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  const withoutFences = raw.replace(/```(?:json)?/gi, '')
  const start = withoutFences.indexOf('{')
  const end = withoutFences.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return null
  try {
    return JSON.parse(withoutFences.slice(start, end + 1))
  } catch {
    return null
  }
}

/**
 * Canonical form for path comparison: case- and separator-insensitive, so
 * `basics::math`, `Basics > Math` and `Basics  Math` all collapse together.
 */
export function normalizeChecklistPath(path: string): string {
  return String(path ?? '')
    .toLowerCase()
    .replace(/[\s_:>/\\-]+/g, ' ')
    .trim()
}

function coerceConfidence(value: unknown): AuditMatchConfidence {
  return value === 'high' || value === 'medium' || value === 'low' ? value : 'low'
}

/**
 * The hallucination gate — the single point where a model-supplied path becomes
 * a real selection, applied identically to the structured and fallback paths.
 */
export function filterAuditMatches(
  parsed: unknown,
  allowedPaths: string[],
  maxMatches = 12
): { matches: AuditMatch[]; discarded: string[] } {
  const empty = { matches: [] as AuditMatch[], discarded: [] as string[] }
  const rawMatches = (parsed as any)?.matches
  if (!Array.isArray(rawMatches)) return empty

  const exact = new Set(allowedPaths)
  const byNormalized = new Map<string, string>()
  // Bare sub-category names are accepted only when unambiguous, so a suffix
  // shared by two parents can never silently resolve to the wrong one.
  const bySuffix = new Map<string, string | null>()
  for (const path of allowedPaths) {
    byNormalized.set(normalizeChecklistPath(path), path)
    const suffix = normalizeChecklistPath(path.split('::').pop() ?? path)
    bySuffix.set(suffix, bySuffix.has(suffix) ? null : path)
  }

  const resolved = new Map<string, AuditMatch>()
  const discarded: string[] = []

  for (const raw of rawMatches) {
    const candidate = typeof raw?.path === 'string' ? raw.path.trim() : ''
    if (!candidate) continue
    const normalized = normalizeChecklistPath(candidate)
    const live = exact.has(candidate)
      ? candidate
      : byNormalized.get(normalized) ?? bySuffix.get(normalized) ?? null
    if (!live) {
      discarded.push(candidate)
      continue
    }
    const match: AuditMatch = {
      path: live,
      confidence: coerceConfidence(raw?.confidence),
      reason: typeof raw?.reason === 'string' ? raw.reason.trim().slice(0, MAX_REASON_CHARS) : ''
    }
    const previous = resolved.get(live)
    if (!previous || CONFIDENCE_ORDER[match.confidence] < CONFIDENCE_ORDER[previous.confidence]) {
      resolved.set(live, match)
    }
  }

  const matches = Array.from(resolved.values())
    .sort((a, b) => CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence])
    .slice(0, Math.max(1, maxMatches))

  return { matches, discarded }
}
