/**
 * Event Guard / Prerequisite Registry with combinators (AND, OR, sequence).
 *
 * Usage:
 *   const guard = new EventGuard()
 *   guard.when(all('EDITOR_MOUNTED', 'WORKSPACE_INITIALIZED'), () => { ... })
 *   guard.when(any('PROVIDER_CONNECTED:remixd', 'PROVIDER_CONNECTED:electron'), () => { ... })
 *   guard.when(sequence('PLUGIN_ACTIVATED:solidity', 'CACHE_READY'), () => { ... })
 *   guard.when(all('A', any('B', 'C')), () => { ... })  // nested
 *   await guard.waitFor(all('EDITOR_MOUNTED', 'WORKSPACE_INITIALIZED'))
 *   guard.has('EDITOR_MOUNTED') // synchronous check
 */

import type {
  Condition,
  ConditionInput,
  AllCondition,
  AnyCondition,
  SequenceCondition,
  EventCondition,
  EventId,
  GuardRegistration,
  SerializedCondition
} from './types'

// ─── Combinator Constructors ─────────────────────────────────────────

function normalize(input: ConditionInput): Condition {
  if (typeof input === 'string') {
    return { kind: 'event', eventId: input } as EventCondition
  }
  return input
}

/** All conditions must be satisfied (any order) */
export function all(...inputs: ConditionInput[]): AllCondition {
  return { kind: 'all', conditions: inputs.map(normalize) }
}

/** At least one condition must be satisfied */
export function any(...inputs: ConditionInput[]): AnyCondition {
  return { kind: 'any', conditions: inputs.map(normalize) }
}

/** All conditions must be satisfied in the given order */
export function sequence(...inputs: ConditionInput[]): SequenceCondition {
  return { kind: 'sequence', conditions: inputs.map(normalize) }
}

// ─── Condition Evaluation ────────────────────────────────────────────

function isSatisfied(condition: Condition, firedEvents: Set<string>, orderedEvents: string[]): boolean {
  switch (condition.kind) {
  case 'event':
    return firedEvents.has(condition.eventId)

  case 'all':
    return condition.conditions.every(c => isSatisfied(c, firedEvents, orderedEvents))

  case 'any':
    return condition.conditions.some(c => isSatisfied(c, firedEvents, orderedEvents))

  case 'sequence': {
    // Each condition in the sequence must have been satisfied,
    // and the *first* event of each must appear in order.
    let searchFrom = 0
    for (const sub of condition.conditions) {
      if (!isSatisfied(sub, firedEvents, orderedEvents)) return false
      // Find the position of the first matching leaf event in orderedEvents
      const firstLeaf = getFirstLeafEvent(sub)
      if (firstLeaf === null) continue // sub-condition has no leaf events (edge case)
      const idx = orderedEvents.indexOf(firstLeaf, searchFrom)
      if (idx === -1) return false
      searchFrom = idx + 1
    }
    return true
  }

  default:
    return false
  }
}

/** Get the first leaf event ID from a condition tree (for sequence ordering) */
function getFirstLeafEvent(condition: Condition): string | null {
  switch (condition.kind) {
  case 'event':
    return condition.eventId
  case 'all':
  case 'any':
  case 'sequence':
    for (const sub of condition.conditions) {
      const leaf = getFirstLeafEvent(sub)
      if (leaf !== null) return leaf
    }
    return null
  default:
    return null
  }
}

// ─── Serialization (for cross-plugin communication) ──────────────────

export function deserializeCondition(input: SerializedCondition): Condition {
  if (typeof input === 'string') {
    return { kind: 'event', eventId: input }
  }
  if ('all' in input) {
    return all(...(input.all as SerializedCondition[]).map(deserializeCondition).map(c => c as ConditionInput))
  }
  if ('any' in input) {
    return any(...(input.any as SerializedCondition[]).map(deserializeCondition).map(c => c as ConditionInput))
  }
  if ('sequence' in input) {
    return sequence(...(input.sequence as SerializedCondition[]).map(deserializeCondition).map(c => c as ConditionInput))
  }
  throw new Error(`Invalid serialized condition: ${JSON.stringify(input)}`)
}

// ─── EventGuard Registry ─────────────────────────────────────────────

export class EventGuard {
  private firedEvents: Set<string> = new Set()
  private orderedEvents: string[] = []
  private registrations: GuardRegistration[] = []
  private nextId = 1
  private evaluating = false // re-entrancy guard
  private debug: boolean
  private label: string

  constructor(options?: { debug?: boolean; label?: string }) {
    this.debug = options?.debug ?? false
    this.label = options?.label ?? 'EventGuard'
  }

  private log(...args: any[]): void {
    if (this.debug) console.log(`[${this.label}]`, ...args)
  }

  /** Record that an event has occurred, then evaluate all pending guards */
  fire(eventId: EventId): void {
    if (this.firedEvents.has(eventId)) {
      this.log(`⏭ fire("${eventId}") — already fired, skipping`)
      return
    }

    this.firedEvents.add(eventId)
    this.orderedEvents.push(eventId)
    this.log(`🔥 fire("${eventId}") — total fired: [${[...this.firedEvents].join(', ')}]`)
    this.evaluate()
  }

  /** Check if a specific event has ever been fired */
  has(eventId: EventId): boolean {
    return this.firedEvents.has(eventId)
  }

  /**
   * Remove a previously fired event from the context.
   * Useful for mutually exclusive state flags (e.g. logged_in vs not_logged_in).
   */
  unfire(eventId: EventId): void {
    if (!this.firedEvents.has(eventId)) return
    this.firedEvents.delete(eventId)
    this.orderedEvents = this.orderedEvents.filter(e => e !== eventId)
    this.log(`🧹 unfire("${eventId}") — total fired: [${[...this.firedEvents].join(', ')}]`)
  }

  /** Get a snapshot of all fired events */
  getFiredEvents(): string[] {
    return [...this.firedEvents]
  }

  /**
   * Register a callback to execute when a condition is satisfied.
   * If the condition is already satisfied, the callback fires immediately (synchronously).
   * By default, callbacks are one-shot (fire once, then auto-removed).
   */
  when(input: ConditionInput, callback: () => void, options?: { once?: boolean }): () => void {
    const condition = normalize(input)
    const once = options?.once !== false // default true

    const reg: GuardRegistration = {
      id: this.nextId++,
      condition,
      callback,
      once,
      fired: false
    }

    this.log(`📋 when(#${reg.id}) registered — condition:`, conditionToString(condition), once ? '(once)' : '(repeatable)')

    // Check if already satisfied (late registration)
    if (isSatisfied(condition, this.firedEvents, this.orderedEvents)) {
      reg.fired = true
      this.log(`⚡ when(#${reg.id}) — already satisfied, firing immediately`)
      try {
        callback()
      } catch (e) {
        console.error('[EventGuard] Callback error:', e)
      }
      if (once) {
        // Don't even register — it's done
        return () => {}
      }
    }

    this.registrations.push(reg)

    // Return unsubscribe function
    return () => {
      this.registrations = this.registrations.filter(r => r.id !== reg.id)
    }
  }

  /**
   * Returns a Promise that resolves when the condition is satisfied.
   * Optionally accepts a timeout in ms — rejects with Error on timeout.
   */
  waitFor(input: ConditionInput, timeoutMs?: number): Promise<void> {
    const condition = normalize(input)

    // Already satisfied
    if (isSatisfied(condition, this.firedEvents, this.orderedEvents)) {
      return Promise.resolve()
    }

    return new Promise<void>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | null = null

      const unsubscribe = this.when(condition, () => {
        if (timer) clearTimeout(timer)
        resolve()
      })

      if (timeoutMs && timeoutMs > 0) {
        timer = setTimeout(() => {
          unsubscribe()
          reject(new Error(`EventGuard.waitFor timed out after ${timeoutMs}ms`))
        }, timeoutMs)
      }
    })
  }

  /** Re-evaluate all pending registrations after a new event fires */
  private evaluate(): void {
    if (this.evaluating) return // prevent re-entrant evaluation
    this.evaluating = true

    try {
      const toFire: GuardRegistration[] = []

      for (const reg of this.registrations) {
        if (reg.once && reg.fired) continue
        const satisfied = isSatisfied(reg.condition, this.firedEvents, this.orderedEvents)
        if (satisfied) {
          reg.fired = true
          toFire.push(reg)
          this.log(`✅ guard #${reg.id} satisfied:`, conditionToString(reg.condition))
        }
      }

      if (toFire.length === 0 && this.registrations.length > 0) {
        this.log(`⏳ ${this.registrations.filter(r => !(r.once && r.fired)).length} guard(s) still waiting`)
      }

      // Remove one-shot registrations that have fired
      this.registrations = this.registrations.filter(r => !(r.once && r.fired))

      // Fire callbacks outside the filter loop to avoid mutation issues
      for (const reg of toFire) {
        try {
          reg.callback()
        } catch (e) {
          console.error('[EventGuard] Callback error:', e)
        }
      }
    } finally {
      this.evaluating = false
    }
  }

  /** Reset all state (primarily for testing) */
  reset(): void {
    this.log('🔄 reset()')
    this.firedEvents.clear()
    this.orderedEvents = []
    this.registrations = []
    this.nextId = 1
    this.evaluating = false
  }
}

// ─── Debug Helpers ───────────────────────────────────────────────────

/** Pretty-print a condition tree for logging */
function conditionToString(condition: Condition): string {
  switch (condition.kind) {
  case 'event':
    return `"${condition.eventId}"`
  case 'all':
    return `all(${condition.conditions.map(conditionToString).join(', ')})`
  case 'any':
    return `any(${condition.conditions.map(conditionToString).join(', ')})`
  case 'sequence':
    return `seq(${condition.conditions.map(conditionToString).join(' → ')})`
  default:
    return '?'
  }
}
