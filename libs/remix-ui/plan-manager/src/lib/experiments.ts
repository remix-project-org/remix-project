/**
 * Product-page experiments (A/B/C on the Plan & Credits panel).
 *
 * Definitions come from the public app config (`experiments.definitions`,
 * edited on the admin Experiments page). Each browser gets a random
 * "subject" id once; the variant is a deterministic hash of experiment key +
 * subject, so it is sticky without storing assignments and survives
 * signing in. Stopped experiments serve their winner (or the control) and
 * are no longer reported.
 *
 * QA: force a variant with `#exp.<key>=<variant>` in the URL (kept in
 * sessionStorage for the tab). Forced views are never reported as
 * exposures, so they don't pollute results.
 */

export const EXPERIMENTS_CONFIG_KEY = 'experiments.definitions'

export interface ExperimentVariant {
  key: string
  weight: number
}

export interface ExperimentDefinition {
  key: string
  status: 'draft' | 'running' | 'stopped'
  variants: ExperimentVariant[]
  audience?: 'all' | 'non_paying'
  winner?: string
}

export interface ExperimentAssignment {
  variant: string
  /** Counted in results: running, enrolled, not forced. */
  reported: boolean
}

const SUBJECT_KEY = 'remix:visitor-id'
const OVERRIDES_KEY = 'remix:exp-overrides'

/** Lenient parse of the config value; anything malformed is dropped. */
export function parseExperiments(raw: unknown): ExperimentDefinition[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((e: any): ExperimentDefinition[] => {
    if (!e || typeof e.key !== 'string' || !Array.isArray(e.variants) || e.variants.length < 2) return []
    const variants = e.variants
      .filter((v: any) => v && typeof v.key === 'string')
      .map((v: any) => ({ key: v.key, weight: Math.max(0, Number(v.weight ?? 1) || 0) }))
    if (variants.length < 2) return []
    const status = e.status === 'running' || e.status === 'stopped' ? e.status : 'draft'
    return [{ key: e.key, status, variants, audience: e.audience === 'non_paying' ? 'non_paying' : 'all', winner: typeof e.winner === 'string' ? e.winner : undefined }]
  })
}

/** This browser's stable, random visitor id. */
export function getSubjectId(): string {
  try {
    const existing = localStorage.getItem(SUBJECT_KEY)
    if (existing && /^[A-Za-z0-9-]{8,64}$/.test(existing)) return existing
    const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
    localStorage.setItem(SUBJECT_KEY, id)
    return id
  } catch {
    // Storage blocked: a per-page id still gives a consistent experience for this visit.
    return (fallbackSubject ??= `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`)
  }
}
let fallbackSubject: string | undefined

/** 32-bit FNV-1a, mapped to [0, 1). */
function hashUnit(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0) / 0x100000000
}

/** Weighted, deterministic pick for this subject. */
export function pickVariant(def: ExperimentDefinition, subjectId: string): string {
  const total = def.variants.reduce((s, v) => s + v.weight, 0)
  if (total <= 0) return def.variants[0].key
  let point = hashUnit(`${def.key}:${subjectId}`) * total
  for (const v of def.variants) {
    if (point < v.weight) return v.key
    point -= v.weight
  }
  return def.variants[def.variants.length - 1].key
}

/** `#exp.<key>=<variant>` → sticky for this tab. */
export function readOverrides(): Record<string, string> {
  let stored: Record<string, string> = {}
  try { stored = JSON.parse(sessionStorage.getItem(OVERRIDES_KEY) || '{}') || {} } catch { /* ignore */ }
  try {
    const raw = `${location.search.slice(1)}&${location.hash.replace(/^#/, '')}`
    let changed = false
    for (const part of raw.split('&')) {
      const m = /^exp\.([a-z0-9_-]+)=([a-z0-9_-]+)$/i.exec(decodeURIComponent(part))
      if (m) { stored[m[1]] = m[2]; changed = true }
    }
    if (changed) sessionStorage.setItem(OVERRIDES_KEY, JSON.stringify(stored))
  } catch { /* ignore */ }
  return stored
}

/** Browser driven by a test runner (Playwright / WebDriver) or flagged as an E2E run. */
export function isAutomatedBrowser(): boolean {
  try {
    return !!(globalThis as any).__IS_E2E_TEST__ || (typeof navigator !== 'undefined' && navigator.webdriver === true)
  } catch {
    return false
  }
}

/**
 * Variant for one experiment. `isPayingCustomer` matters for
 * `audience: 'non_paying'` experiments — paying users get the control and
 * aren't counted. Automated browsers always get the control (a forced
 * variant still applies) so test suites see a stable UI.
 */
export function assign(
  def: ExperimentDefinition,
  subjectId: string,
  overrides: Record<string, string>,
  isPayingCustomer: boolean,
  automated = false
): ExperimentAssignment {
  const control = def.variants[0].key
  const forced = overrides[def.key]
  if (forced && def.variants.some(v => v.key === forced)) return { variant: forced, reported: false }
  if (def.status === 'stopped') {
    const winner = def.winner && def.variants.some(v => v.key === def.winner) ? def.winner : control
    return { variant: winner, reported: false }
  }
  if (def.status !== 'running' || automated) return { variant: control, reported: false }
  if (def.audience === 'non_paying' && isPayingCustomer) return { variant: control, reported: false }
  return { variant: pickVariant(def, subjectId), reported: true }
}
