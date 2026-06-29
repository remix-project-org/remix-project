/**
 * LifecyclePlugin — Remix engine plugin that wraps the AppLifecycle state machine,
 * exposing it to other plugins via the standard call()/on() API.
 *
 * Internal plugins can do:
 *   await this.call('lifecycle', 'waitFor', { all: ['EDITOR_MOUNTED', 'WORKSPACE_INITIALIZED'] })
 *   const ready = await this.call('lifecycle', 'has', 'EDITOR_MOUNTED')
 *   const phase = await this.call('lifecycle', 'getState')
 */

import { Plugin } from '@remixproject/engine'
import { AppLifecycle } from './app-lifecycle'
import { deserializeCondition } from './event-guard'
import type { SerializedCondition, LifecycleEvent } from './types'

const profile = {
  name: 'lifecycle',
  methods: ['waitFor', 'has', 'getState', 'getActivatedPlugins', 'getFiredEvents'],
  events: ['phaseChanged'],
  version: '1.0.0'
}

export class LifecyclePlugin extends Plugin {
  private lifecycle: AppLifecycle

  constructor(lifecycle: AppLifecycle) {
    super(profile)
    this.lifecycle = lifecycle
  }

  onActivation(): void {
    // Forward phase changes as plugin events
    this.lifecycle.onPhaseChange((phase: string) => {
      this.emit('phaseChanged', phase)
    })
  }

  /** Send an event into the lifecycle (called from app.ts / remixAppManager, not from other plugins) */
  send(event: LifecycleEvent): void {
    this.lifecycle.send(event)
  }

  // ─── Plugin API methods (callable by other plugins via this.call('lifecycle', ...)) ──

  /**
   * Returns a Promise that resolves when the condition is satisfied.
   * Accepts a serialized condition: string | { all: [...] } | { any: [...] } | { sequence: [...] }
   */
  async waitFor(condition: SerializedCondition, timeoutMs?: number): Promise<void> {
    const parsed = deserializeCondition(condition)
    return this.lifecycle.waitFor(parsed, timeoutMs)
  }

  /** Check if a specific event has fired */
  has(eventId: string): boolean {
    return this.lifecycle.has(eventId)
  }

  /** Get the current boot phase */
  getState(): string {
    return this.lifecycle.getPhase()
  }

  /** Get all activated plugin names */
  getActivatedPlugins(): string[] {
    return this.lifecycle.getActivatedPlugins()
  }

  /** Get all fired event IDs */
  getFiredEvents(): string[] {
    return this.lifecycle.getFiredEvents()
  }
}
