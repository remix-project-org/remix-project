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

/* -------------------------------------------------------------------------- */
/* Per-contract checklist storage                                             */
/*                                                                            */
/* Selected checklists are saved one file per category under                  */
/* `audits/<Contract>/<token>.md`. The naming lives here, next to the paths it */
/* derives from, so the filenames and the selectable paths cannot drift apart. */
/* -------------------------------------------------------------------------- */

/** Anything that has to become a single safe path segment goes through this. */
const sanitizeSegment = (raw: string): string => {
  return raw
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

/**
 * Filename stem for one selected category. `Main::Sub` becomes `Main-Sub` so the
 * two halves stay readable in the file explorer.
 */
export function categoryFileToken(categoryPath: string): string {
  const raw = categoryPath.includes('::') ? categoryPath.split('::').join('-') : categoryPath
  return sanitizeSegment(raw)
}

/**
 * Folder name for the contract the checklists are saved against.
 *
 * The compiled contract name is preferred over the filename: `contracts/Token.sol`
 * declaring `MyToken` reads better as `audits/MyToken/`. Falls back to the file
 * stem when the file has not been compiled, and to `contract` when even that
 * sanitizes away (a file named `__.sol`). The result is always a single path
 * segment — it is interpolated straight into a write path.
 */
export function deriveContractName(target: string, namesByFile: Record<string, string[]> = {}): string {
  if (!target) return ''
  const compiled = namesByFile[target]?.[0]
  if (compiled) {
    const fromCompiled = sanitizeSegment(compiled)
    if (fromCompiled) return fromCompiled
  }
  const stem = (target.split('/').pop() ?? target).replace(/\.sol$/i, '')
  return sanitizeSegment(stem) || 'contract'
}

/**
 * Which categories already have a checklist file saved for the selected contract.
 *
 * `files` is the listing of `audits/<Contract>/`, where each checklist owns one
 * `<token>.md`. Matching is exact on that stem — a substring test over the whole
 * listing would let `Access_Control` light up `Token-Access_Control` too.
 */
export function computeLoadedCategories(data: AuditChecklistNode[] | undefined, files: string[]): Set<string> {
  const stems = new Set(
    files
      .map(file => (file.split('/').pop() ?? file))
      .filter(name => name.toLowerCase().endsWith('.md'))
      .map(name => name.slice(0, -3))
  )
  const loaded = new Set<string>()
  enumerateSelectableChecklistPaths(data).forEach(path => {
    const token = categoryFileToken(path)
    if (token && stems.has(token)) loaded.add(path)
  })
  return loaded
}

/* -------------------------------------------------------------------------- */
/* Audience variants for a finished audit report                              */
/* -------------------------------------------------------------------------- */

export interface AuditReportAudience {
  label: string
  /** What changes for this reader — keeps a rewrite from being a retitle. */
  focus: string
  /** Filename stem, so the model is never left to invent one. */
  slug: string
}

/**
 * Audiences offered once an audit run has produced its report.
 *
 * One technical report rarely serves everyone who must act on it: the person
 * approving the budget, the one scheduling the work and the one writing the fix
 * need the same findings at different depths. Shared by the modal's audit
 * instruction and the auditor subagent prompt so the two can never drift.
 */
export const AUDIT_REPORT_AUDIENCES: AuditReportAudience[] = [
  { label: 'Beginners', slug: 'beginners', focus: 'plain language, every term explained, why each issue matters' },
  { label: 'Decision makers', slug: 'decision_makers', focus: 'risk posture, business impact, cost of fixing vs not, clear go/no-go' },
  { label: 'Project managers', slug: 'project_managers', focus: 'work breakdown, effort estimates, dependencies and suggested sequencing' },
  { label: 'Developers', slug: 'developers', focus: 'exact files and lines, concrete patches, tests to add' },
  { label: 'Investors / due diligence', slug: 'investors', focus: 'overall risk rating, red flags, comparison against common standards' },
  { label: 'End users / community', slug: 'end_users', focus: 'short public-facing note on what was checked and what it means for funds' },
  { label: 'Compliance / risk officers', slug: 'compliance', focus: 'controls coverage, residual risk, evidence trail and sign-off checklist' }
]

/** `"Beginners, Decision makers, …"` — labels only, where focus would bloat. */
export function renderAudienceLabels(audiences: AuditReportAudience[] = AUDIT_REPORT_AUDIENCES): string {
  return audiences.map(a => a.label).join(', ')
}

/**
 * `"Project managers -> summary_project_managers.md (work breakdown, …)"`.
 *
 * Pairs each choice with the exact filename and what to emphasise, so the model
 * has nothing left to invent and cannot answer "the existing summary covers it".
 */
export function renderAudienceTargets(audiences: AuditReportAudience[] = AUDIT_REPORT_AUDIENCES): string {
  return audiences.map(a => `${a.label} -> summary_${a.slug}.md (${a.focus})`).join('; ')
}
