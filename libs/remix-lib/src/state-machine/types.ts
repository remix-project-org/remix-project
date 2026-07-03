/**
 * Types for the Remix IDE lifecycle state machine and event guard system.
 */

// ─── Lifecycle Events ────────────────────────────────────────────────

export type LifecycleEvent =
  | { type: 'BOOT' }
  | { type: 'PLUGINS_REGISTERED' }
  | { type: 'PLUGIN_ACTIVATED'; name: string }
  | { type: 'PLUGIN_DEACTIVATED'; name: string }
  | { type: 'PLUGIN_ACTIVATION_FAILED'; name: string; error: string }
  | { type: 'WORKSPACE_INITIALIZED' }
  | { type: 'EDITOR_MOUNTED' }
  | { type: 'CACHE_READY' }
  | { type: 'PROVIDER_CONNECTED'; name: string }
  | { type: 'PROVIDER_DISCONNECTED'; name: string }
  | { type: 'WORKSPACE_PLUGINS_ACTIVATED' }
  | { type: 'APP_LOADED' }
  | { type: 'CUSTOM'; id: string; payload?: any }

/** String identifier for a lifecycle event, used in guard conditions */
export type EventId = string

// ─── Machine Context ─────────────────────────────────────────────────

export interface AppLifecycleContext {
  activatedPlugins: Set<string>
  failedPlugins: Map<string, string>
  readyServices: Set<string>
  bootStartedAt: number
  currentPhase: string
  firedEvents: Set<string>
}

// ─── Machine State Values ────────────────────────────────────────────

export type BootPhase =
  | 'idle'
  | 'booting'
  | 'coreReady'
  | 'servicesReady'
  | 'uiReady'
  | 'toolsReady'
  | 'running'
  | 'degraded'

// ─── Event Guard Condition Combinators ───────────────────────────────

export interface AllCondition {
  kind: 'all'
  conditions: Condition[]
}

export interface AnyCondition {
  kind: 'any'
  conditions: Condition[]
}

export interface SequenceCondition {
  kind: 'sequence'
  conditions: Condition[]
}

export interface EventCondition {
  kind: 'event'
  eventId: EventId
}

export type Condition = AllCondition | AnyCondition | SequenceCondition | EventCondition

export type ConditionInput = Condition | EventId

// ─── Guard Registration ─────────────────────────────────────────────

export interface GuardRegistration {
  id: number
  condition: Condition
  callback: () => void
  once: boolean
  fired: boolean
}

// ─── Lifecycle Plugin Profile ────────────────────────────────────────

export interface LifecyclePluginMethods {
  waitFor(condition: SerializedCondition): Promise<void>
  has(eventId: string): boolean
  getState(): string
  getActivatedPlugins(): string[]
  getFiredEvents(): string[]
}

/**
 * JSON-safe representation of a Condition for cross-plugin communication.
 * Plugins pass these via `call('lifecycle', 'waitFor', condition)`.
 */
export type SerializedCondition =
  | { all: SerializedConditionInput[] }
  | { any: SerializedConditionInput[] }
  | { sequence: SerializedConditionInput[] }
  | string

export type SerializedConditionInput = SerializedCondition

// ─── Nudge Engine Types ──────────────────────────────────────────────

export interface NudgeAction {
  type: 'toast' | 'modal' | 'hint' | 'widget'
  title?: string
  message: string
  actionLabel?: string // e.g. "Try it now"
  actionTarget?: string // e.g. 'remixAI::switchModel::opus'
  icon?: string // e.g. 'fas fa-robot'
  dismissable?: boolean // default true; hides both X and 'Don't show again'
  hidePermanentDismiss?: boolean // hides only the 'Don't show this again' footer button
  position?: 'left' | 'right' // which side of the screen the widget anchors to (default 'left')
  hintStyle?: 'pulse' | 'glow' | 'badge' // decoration style for type:'hint' (default 'pulse')
  hintColor?: string // CSS color override, e.g. '#10b981', 'var(--bs-warning)'
  widgetColor?: string // accent color for the widget, e.g. '#6366f1'
  widgetBg?: string // background gradient start color for the illustration area
}

export interface NudgeRule {
  id: string
  condition: ConditionInput
  action: NudgeAction
  /** true = show once ever (localStorage), 'session' = once per session, false = every time */
  showOnce?: boolean | 'session'
  priority?: number
  enabled?: boolean
}

/** JSON-safe nudge rule for API-loaded rules */
export interface SerializedNudgeRule {
  id: string
  condition: SerializedCondition
  action: NudgeAction
  showOnce?: boolean | 'session'
  priority?: number
  enabled?: boolean
}
