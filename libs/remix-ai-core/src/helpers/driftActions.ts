/**
 * One switch for every drift countermeasure, so acting can be compared with
 * observing before it is turned on for everyone.
 *
 *  - `observe` (default) — detectors run and report, the run is left alone.
 *    Findings a countermeasure *would* have acted on are still reported, so
 *    the two modes produce comparable analytics.
 *  - `act` — countermeasures change the run: duplicate tool calls are
 *    skipped, echoed answers retried, reminders injected.
 *  - `off` — the monitor does nothing at all.
 *
 * Set with `localStorage.AI_DRIFT_ACT = 'act' | 'observe' | 'off'`. Read on
 * every call rather than cached, so it can be flipped without a reload.
 *
 * The system-prompt leak guard is not behind this switch: showing internal
 * instructions is never an acceptable outcome to measure.
 */

export type DriftMode = 'observe' | 'act' | 'off'

export const DRIFT_MODE_STORAGE_KEY = 'AI_DRIFT_ACT'

export function getDriftMode(): DriftMode {
  try {
    const value = (globalThis as any)?.localStorage?.getItem(DRIFT_MODE_STORAGE_KEY)
    if (value === 'act' || value === 'off') return value
  } catch {
    // Storage can be unavailable (private mode, Node); fall through.
  }
  return 'observe'
}
