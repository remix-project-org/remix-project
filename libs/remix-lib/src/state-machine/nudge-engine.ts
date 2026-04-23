/**
 * NudgeEngine — Contextual feature discovery / nudge system.
 *
 * Sits on top of EventGuard combinators to evaluate rules like:
 *   "When user is logged in AND is a beta tester AND opens AI chat
 *    while on Mistral → show a toast suggesting Opus"
 *
 * Rules can be hardcoded or loaded from JSON (API).
 * Shown nudges are tracked per-session (Set) and persistently (localStorage).
 *
 * Usage:
 *   const engine = new NudgeEngine()
 *   engine.addRule({
 *     id: 'try-opus',
 *     condition: all('user:logged_in', 'user:beta_tester', 'ai:model:mistral', 'ai:chat_opened'),
 *     action: { type: 'toast', message: 'Try Opus for better code generation', actionLabel: 'Switch' },
 *   })
 *   engine.onNudge((rule) => showToast(rule.action))
 *   engine.fire('user:logged_in')
 *   engine.fire('user:beta_tester')
 *   engine.fire('ai:model:mistral')
 *   engine.fire('ai:chat_opened')  // → nudge triggers
 */

import { EventGuard, deserializeCondition } from './event-guard'
import type { NudgeRule, NudgeAction, SerializedNudgeRule, ConditionInput } from './types'

const STORAGE_KEY = 'remix_nudges_shown'

export class NudgeEngine {
  private guard: EventGuard
  private rules: Map<string, NudgeRule> = new Map()
  private unsubscribers: Map<string, () => void> = new Map()
  private shownSession: Set<string> = new Set()
  private callbacks: Array<(rule: NudgeRule) => void> = []
  private debug: boolean

  constructor(options?: { debug?: boolean }) {
    this.debug = options?.debug ?? false
    this.guard = new EventGuard({ debug: this.debug, label: 'NudgeGuard' })
  }

  // ─── Event input ─────────────────────────────────────────────────

  /** Fire a context event (e.g. 'user:logged_in', 'ai:chat_opened') */
  fire(eventId: string): void {
    if (this.debug) {
      console.log(
        '%c[Nudge] fire %c%s',
        'color:#bd93f9', 'color:#50fa7b;font-weight:bold', eventId
      )
    }
    this.guard.fire(eventId)
  }

  /** Check if a context event has been fired */
  has(eventId: string): boolean {
    return this.guard.has(eventId)
  }

  /** Remove a previously fired context event */
  unfire(eventId: string): void {
    this.guard.unfire(eventId)
  }

  // ─── Rule management ─────────────────────────────────────────────

  /** Register a nudge rule. If a rule with the same id exists, it's replaced. */
  addRule(rule: NudgeRule): void {
    if (this.rules.has(rule.id)) {
      this.removeRule(rule.id)
    }
    this.rules.set(rule.id, rule)
    if (rule.enabled !== false) {
      this._activateRule(rule)
    }
  }

  /** Register multiple rules at once. */
  addRules(rules: NudgeRule[]): void {
    for (const rule of rules) {
      this.addRule(rule)
    }
  }

  /** Add rules from JSON (for API-loaded rules). Deserializes conditions. */
  addRulesFromJSON(rules: SerializedNudgeRule[]): void {
    for (const raw of rules) {
      this.addRule({
        ...raw,
        condition: deserializeCondition(raw.condition) as ConditionInput
      })
    }
  }

  /** Remove a rule by id. */
  removeRule(id: string): void {
    const unsub = this.unsubscribers.get(id)
    if (unsub) unsub()
    this.unsubscribers.delete(id)
    this.rules.delete(id)
  }

  /** Enable a previously disabled rule. */
  enableRule(id: string): void {
    const rule = this.rules.get(id)
    if (rule && rule.enabled === false) {
      rule.enabled = true
      this._activateRule(rule)
    }
  }

  /** Disable a rule without removing it. */
  disableRule(id: string): void {
    const rule = this.rules.get(id)
    if (rule) {
      rule.enabled = false
      const unsub = this.unsubscribers.get(id)
      if (unsub) unsub()
      this.unsubscribers.delete(id)
    }
  }

  /** Get all registered rule ids. */
  getRuleIds(): string[] {
    return [...this.rules.keys()]
  }

  // ─── Nudge output ────────────────────────────────────────────────

  /** Subscribe to nudge triggers. Returns unsubscribe function. */
  onNudge(callback: (rule: NudgeRule) => void): () => void {
    this.callbacks.push(callback)
    return () => {
      this.callbacks = this.callbacks.filter(cb => cb !== callback)
    }
  }

  // ─── Shown state management ──────────────────────────────────────

  /** Get all nudge ids that have been shown this session. */
  getShownNudges(): string[] {
    return [...this.shownSession]
  }

  /** Reset shown state. If id provided, resets only that nudge. */
  resetShown(id?: string): void {
    if (id) {
      this.shownSession.delete(id)
      this._removePersistent(id)
    } else {
      this.shownSession.clear()
      this._clearPersistent()
    }
  }

  // ─── Internal ────────────────────────────────────────────────────

  private _activateRule(rule: NudgeRule): void {
    const unsub = this.guard.when(rule.condition, () => {
      if (this._shouldShow(rule)) {
        this._markShown(rule)
        this._emit(rule)
      }
    })
    this.unsubscribers.set(rule.id, unsub)
  }

  private _shouldShow(rule: NudgeRule): boolean {
    const showOnce = rule.showOnce ?? true
    if (showOnce === 'session') {
      return !this.shownSession.has(rule.id)
    }
    if (showOnce === true) {
      return !this.shownSession.has(rule.id) && !this._hasBeenShownPersistent(rule.id)
    }
    return true // showOnce: false → always show
  }

  private _markShown(rule: NudgeRule): void {
    const showOnce = rule.showOnce ?? true
    this.shownSession.add(rule.id)
    if (showOnce === true) {
      this._persistShown(rule.id)
    }
  }

  private _emit(rule: NudgeRule): void {
    if (this.debug) {
      console.log(
        '%c[Nudge] ✨ %c%s %c→ %s: %s',
        'color:#bd93f9', 'color:#50fa7b;font-weight:bold', rule.id,
        'color:#8be9fd', rule.action.type, rule.action.message
      )
    }
    for (const cb of this.callbacks) {
      try {
        cb(rule)
      } catch (e) {
        console.error('[NudgeEngine] Callback error:', e)
      }
    }
  }

  // ─── localStorage helpers ────────────────────────────────────────

  private _hasBeenShownPersistent(id: string): boolean {
    try {
      const shown: string[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
      return shown.includes(id)
    } catch {
      return false
    }
  }

  private _persistShown(id: string): void {
    try {
      const shown: string[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
      if (!shown.includes(id)) {
        shown.push(id)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(shown))
      }
    } catch { /* ignore storage errors */ }
  }

  private _removePersistent(id: string): void {
    try {
      const shown: string[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
      const filtered = shown.filter(s => s !== id)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
    } catch { /* ignore */ }
  }

  private _clearPersistent(): void {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch { /* ignore */ }
  }
}
