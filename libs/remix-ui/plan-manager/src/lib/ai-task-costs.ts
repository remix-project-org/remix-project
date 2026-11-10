import measured from './ai-task-costs.data.json'

export type CostTier = string

export interface TaskCost {
  medianCredits: number
  p90Credits: number
  runs: number
  successRate: number
  medianDurationMs: number
  /** Models that actually answered, by share of credits (Auto routes per request). */
  servedModels?: ServedShare[]
}

export interface ServedShare {
  model: string
  share: number
}

export interface MeasuredTask {
  id: string
  title: string
  costs: Partial<Record<CostTier, TaskCost>>
}

export interface TaskCostTable {
  version: number
  measuredAt: string | null
  models: Record<CostTier, ProfiledModel>
  tasks: MeasuredTask[]
}

export interface ProfiledModel {
  id: string
  label: string
  /** Models that actually answered, by share of credits (Auto routes per request). */
  served?: ServedShare[]
}

export interface TaskCapacity {
  id: string
  title: string
  /** Runs of the task in the mix that fits the credits, per tier that was measured. */
  counts: Partial<Record<CostTier, number>>
  /** Typical credits per run, per tier. */
  costs: Partial<Record<CostTier, number>>
}

/** Below this a task fails too often for "you can do N of these" to be honest. */
export const MIN_SUCCESS_RATE = 0.6
/** Measurements older than this are flagged: prices and models move. */
export const STALE_AFTER_DAYS = 60

export const TASK_COSTS = measured as TaskCostTable

/**
 * Share of the credits each task gets in the advertised mix, in display order.
 * The counts are one mix that fits the credits *together*, not "all of the
 * credits on one task", and it leans on the features people buy credits for:
 * audits and contract / front-end generation. Shares are renormalised over the
 * tasks shown for a model, so a hidden task's share goes to the others.
 */
export const MIX_WEIGHTS: Record<string, number> = {
  'gas-audit-simple': 0.2,
  'security-audit-complex': 0.25,
  'frontend-generation': 0.2,
  'contract-generation-agent': 0.15,
  'contract-generation-generate': 0.1,
  'fix-compile-error': 0.05,
  'explain-contract': 0.03,
  'autofill-inputs': 0.02
}
/** Weight of a task the mix does not name yet (a newly benchmarked one). */
const DEFAULT_WEIGHT = 0.02

const weightOf = (taskId: string): number => MIX_WEIGHTS[taskId] ?? DEFAULT_WEIGHT
const mixOrder = (taskId: string): number => {
  const at = Object.keys(MIX_WEIGHTS).indexOf(taskId)
  return at === -1 ? Number.MAX_SAFE_INTEGER : at
}

function usable(cost: TaskCost | undefined): cost is TaskCost {
  return !!cost && cost.medianCredits > 0 && cost.runs > 0 && cost.successRate >= MIN_SUCCESS_RATE
}

/** Each usable task's share of the credits on `tier`; the shares sum to 1. */
function mixShares(table: TaskCostTable, tier: CostTier): Map<string, number> {
  const tasks = table.tasks.filter((task) => usable(task.costs[tier]))
  const total = tasks.reduce((sum, task) => sum + weightOf(task.id), 0)
  return new Map(tasks.map((task) => [task.id, total > 0 ? weightOf(task.id) / total : 0]))
}

/**
 * Turns a credit amount into a mix of tasks that fits it together: each task
 * gets its `MIX_WEIGHTS` share of the credits, divided by its typical cost.
 * `credits === null` means unlimited (no balance to divide); counts are then
 * left empty and only costs are set. Tasks with no usable measurement for
 * `tier` (the model being shown) are dropped; rows come in mix order.
 */
export function taskCapacity(credits: number | null, table: TaskCostTable = TASK_COSTS, tier: CostTier = 'default'): TaskCapacity[] {
  const shares = new Map(Object.keys(table.models).map((t) => [t, mixShares(table, t)]))
  return table.tasks
    .filter((task) => usable(task.costs[tier]))
    .sort((a, b) => mixOrder(a.id) - mixOrder(b.id))
    .map((task) => {
      const counts: TaskCapacity['counts'] = {}
      const costs: TaskCapacity['costs'] = {}
      for (const tier of Object.keys(table.models)) {
        const cost = task.costs[tier]
        if (!usable(cost)) continue
        costs[tier] = cost.medianCredits
        const share = shares.get(tier)?.get(task.id) ?? 0
        if (credits !== null) counts[tier] = Math.floor((Math.max(0, credits) * share) / cost.medianCredits)
      }
      return { id: task.id, title: task.title, counts, costs }
    })
}

/**
 * Models a user can pick to see the numbers for: those with at least one
 * usable measurement, the default first. `mostlyServed` names the model that
 * did most of the work when that is not the one picked (Auto is a router).
 */
export function profiledModels(table: TaskCostTable = TASK_COSTS): { tier: CostTier; label: string; mostlyServed: string | null }[] {
  return Object.entries(table.models)
    .filter(([tier]) => table.tasks.some((task) => usable(task.costs[tier])))
    .sort(([a], [b]) => (a === 'default' ? -1 : b === 'default' ? 1 : 0))
    .map(([tier, model]) => {
      const top = model.served?.[0]
      const mostlyServed = top && top.model !== model.id && top.model !== 'unknown' ? top.model : null
      return { tier, label: model.label, mostlyServed }
    })
}

export function isStale(table: TaskCostTable = TASK_COSTS, now: Date = new Date()): boolean {
  if (!table.measuredAt) return true
  const ageMs = now.getTime() - new Date(table.measuredAt).getTime()
  return ageMs > STALE_AFTER_DAYS * 24 * 60 * 60 * 1000
}

/** "gas audit (simple contract)" → "gas audits (simple contract)" for counts above one. */
export function pluralTitle(title: string, count: number): string {
  if (count === 1) return title
  const at = title.indexOf(' (')
  const head = at === -1 ? title : title.slice(0, at)
  const tail = at === -1 ? '' : title.slice(at)
  const plural = /(s|x|ch|sh)$/.test(head) ? `${head}es` : `${head}s`
  return plural + tail
}

/** Compact one-liner for package and plan cards, the head of the mix: "≈ 7 gas audits + 2 security audits". */
export function capacitySummary(credits: number, limit = 2, table: TaskCostTable = TASK_COSTS, tier: CostTier = 'default'): string | null {
  const parts = taskCapacity(credits, table, tier)
    .filter((task) => (task.counts[tier] ?? 0) > 0)
    .slice(0, limit)
    .map((task) => `${task.counts[tier]} ${pluralTitle(task.title.replace(/ \(.*\)$/, ''), task.counts[tier] as number)}`)
  return parts.length > 0 ? `≈ ${parts.join(' + ')}` : null
}

/**
 * The model the capacity numbers are shown for, shared by every place that
 * shows them (balance panel, plan cards, top-up packs) so one pick moves all
 * of them. Plain store for `useSyncExternalStore`.
 */
let selectedTier: CostTier = 'haiku'
const tierListeners = new Set<() => void>()

export const capacityModel = {
  get: (): CostTier => selectedTier,
  set(tier: CostTier): void {
    if (tier === selectedTier) return
    selectedTier = tier
    tierListeners.forEach((listener) => listener())
  },
  subscribe(listener: () => void): () => void {
    tierListeners.add(listener)
    return () => tierListeners.delete(listener)
  }
}
