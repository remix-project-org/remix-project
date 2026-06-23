/**
 * AssistantMachine — XState v5 machine that owns the answer to:
 *   "Can the user talk to Remix AI right now, and if not, what should we
 *    show them?"
 *
 * Modelled as parallel regions so unrelated dimensions (auth, permissions,
 * provider selection, in-flight request, cooldown) never fight for
 * ownership. Selectors expose narrow, derived shapes; the UI consumes
 * only those.
 *
 * Pattern mirrors libs/remix-ui/modal-help/src/lib/plan-manager-machine.ts:
 * pure machine + actor + typed event union + selectors. No fetch, no React,
 * no plugin engine — those live in the wrapping plugin which dispatches
 * events into the actor.
 *
 * Error envelope matches services/ai/docs/ERROR_CODES.md (upstream contract).
 * Frontend MUST switch on `error.code`, never parse `error.message`.
 */

import { setup, createActor, type AnyActorRef } from 'xstate'
import type { PermissionsResponse } from '@remix-api'
import { Features } from '@remix-api'
import { ANONYMOUS_FALLBACK_MODELS, parseAIModelsFromPermissions, type AIModel } from '../types/models'

// ─── Public types ───────────────────────────────────────────────────

/** Single AI feature flag entry as it appears under PermissionsResponse.features. */
export interface AIFeatureFlag {
  feature_name: string
  is_enabled: boolean
  limit_value?: number | null
  limit_unit?: string | null
}

/**
 * Normalized AI error envelope. Mirrors the upstream ERROR_CODES.md:
 *
 *   { error: { code, message, status, retryAfter?, resetAt?, details? } }
 *
 * The wrapping plugin should unwrap the JSON envelope (or the SSE
 * `{ type: "error" }` frame) into this shape before dispatching
 * ERROR_RECEIVED — the machine does not parse HTTP responses.
 */
export interface AIError {
  code: string
  message: string
  status: number
  retryAfter?: number
  resetAt?: string | null
  /** RATE_LIMITED metadata: numeric quota cap (e.g. 10) and window (e.g. "hour"). */
  limit?: number
  window?: string
  details?: {
    feature?: string
    allowedProviders?: string[]
    [k: string]: any
  }
}

/**
 * Why the assistant is unavailable. The UI maps these reasons to copy
 * and to the plan-manager `reason` argument. New reasons land here and
 * in the error→UX table in the agent file.
 */
export type GateReason =
  | 'auth-required' // user is anonymous
  | 'email-unverified' // ai:verified_accounts gate not satisfied
  | 'feature-required' // FEATURE_DENIED for some ai:* capability
  | 'quota-exhausted' // RATE_LIMITED on a per-feature quota
  | null

/** Mirrors the four `reason` strings the plan-manager understands. */
export type PlanManagerReason =
  | 'auth-required'
  | 'email-unverified'
  | 'feature-required'
  | 'quota-exhausted'

export interface PlanManagerHandoff {
  reason: PlanManagerReason
  /** Only meaningful when reason === 'feature-required'. */
  requiredFeature?: string
}

export type AvailabilityState =
  | 'unknown' // permissions not loaded yet
  | 'gated' // sign-in / verify / upgrade needed
  | 'available' // ready to take requests

export type SessionState =
  | 'idle'
  | 'requesting'
  | 'streaming'
  | 'done'
  | 'failed'

export type CooldownState =
  | 'none'
  | 'rate-limited' // expiresAt valid; UI shows countdown
  | 'blocked' // terminal: IP_BLOCKED / ABUSE_BLOCKED

/** Snapshot the UI subscribes to. Pure derivation from machine state + context. */
export interface AssistantSnapshot {
  isAuthenticated: boolean
  permissionsState: 'idle' | 'loading' | 'ready' | 'error'
  availability: AvailabilityState
  session: SessionState
  cooldown: CooldownState
  /** Why the assistant is gated, if at all. Mirrors plan-manager reasons. */
  gateReason: GateReason
  /** Only set when gateReason === 'feature-required'. */
  requiredFeature: string | null
  /** Epoch-ms; UI countdown ticks against this. */
  cooldownExpiresAt: number | null
  /** Last error envelope received — kept for diagnostics + form-error UIs. */
  lastError: AIError | null
  /** Permissions blob. Source of truth for any other ai:* feature check. */
  permissions: PermissionsResponse | null
}

// ─── Machine context + events ───────────────────────────────────────

interface MachineContext {
  isAuthenticated: boolean
  permissions: PermissionsResponse | null
  permissionsErrorMessage: string | null
  /** Reason the assistant is gated. Null when available or disabled. */
  gateReason: GateReason
  requiredFeature: string | null
  /** Epoch-ms when the current rate-limit lifts. */
  cooldownExpiresAt: number | null
  /** Last AIError received (for diagnostics + form-error display). */
  lastError: AIError | null
  /** Allowed provider list returned by the most recent PROVIDER_DENIED. */
  allowedProviders: string[] | null
}

const initialContext: MachineContext = {
  isAuthenticated: false,
  permissions: null,
  permissionsErrorMessage: null,
  gateReason: null,
  requiredFeature: null,
  cooldownExpiresAt: null,
  lastError: null,
  allowedProviders: null
}

export type AssistantEvent =
  // auth
  | { type: 'AUTH_CHANGED'; isAuthenticated: boolean }
  | { type: 'LOGOUT' }
  // permissions
  | { type: 'PERMISSIONS_LOADING' }
  | { type: 'PERMISSIONS_LOADED'; permissions: PermissionsResponse | null }
  | { type: 'PERMISSIONS_FAILED'; message: string }
  // request lifecycle
  | { type: 'REQUEST_STARTED' }
  | { type: 'STREAM_STARTED' }
  | { type: 'REQUEST_SUCCEEDED' }
  // backend error envelope (parsed by the wrapping plugin)
  | { type: 'ERROR_RECEIVED'; error: AIError }
  // cooldown ticker — no-op event the plugin fires once per second so
  // selectors that read `cooldownRemaining` re-evaluate. Not strictly
  // required by the machine but keeps subscribers re-rendering.
  | { type: 'COOLDOWN_TICK' }
  | { type: 'COOLDOWN_CLEARED' }
  // operator/dev resets
  | { type: 'RESET_SESSION' }
  // Caller (UI) acknowledged the chat notice for the current `lastError`
  // — clears `lastError` so `selectChatNotice` returns null. Does NOT
  // touch cooldown / gate state, those are independently managed.
  | { type: 'NOTICE_DISMISSED' }

// ─── Error → state mapping ──────────────────────────────────────────
//
// Single source of truth — the agent file's table is the spec, this is
// the implementation. New codes land in BOTH places.

const PERMISSION_GATE_FOR_CODE: Record<string, GateReason> = {
  EMAIL_NOT_VERIFIED: 'email-unverified',
  // FEATURE_DENIED splits on details.feature — handled imperatively below.
}

const COOLDOWN_TERMINAL_CODES = new Set(['IP_BLOCKED', 'ABUSE_BLOCKED'])
const COOLDOWN_RATE_LIMITED_CODES = new Set(['RATE_LIMITED', 'RATE_LIMITED_GLOBAL'])

/** Per-feature quota that resets only on plan upgrade. The plan manager
 *  should pop the upgrade screen for these; the per-minute kind shouldn't.
 *  We treat any RATE_LIMITED carrying `details.feature` as quota-exhausted
 *  IFF it has no `retryAfter`/`resetAt` (i.e. it's not a rolling window).
 *  RATE_LIMITED_GLOBAL never opens the plan manager. */
/** Backend uses `required_feature` (snake_case); legacy callers send `feature`. */
function extractFeatureName(err: AIError): string | null {
  const d = err.details as Record<string, unknown> | undefined
  if (!d) return null
  const f = (d.feature ?? d.required_feature ?? d.requiredFeature)
  return typeof f === 'string' ? f : null
}

function isQuotaExhausted(err: AIError): boolean {
  if (err.code !== 'RATE_LIMITED') return false
  if (!extractFeatureName(err)) return false
  return !err.retryAfter && !err.resetAt
}

function deriveCooldownExpiry(err: AIError, now: number): number | null {
  if (err.resetAt) {
    const t = Date.parse(err.resetAt)
    if (!Number.isNaN(t)) return t
  }
  if (typeof err.retryAfter === 'number' && err.retryAfter > 0) {
    return now + err.retryAfter * 1000
  }
  return null
}

/**
 * /permissions.features can be either:
 *   - array rows: [{ feature_name, is_enabled|allowed, ... }]
 *   - record map: { [featureName]: boolean | { is_enabled|allowed, ... } }
 */
function getFeatureEntry(permissions: PermissionsResponse | null | undefined, key: string): any {
  const features: any = permissions?.features
  if (!features) return null
  if (Array.isArray(features)) {
    return features.find((row: any) => row?.feature_name === key) ?? null
  }
  if (typeof features === 'object') {
    return features[key] ?? null
  }
  return null
}

function isFeatureEnabledEntry(entry: any): boolean {
  if (entry === null || entry === undefined) return false
  if (typeof entry === 'boolean') return entry
  if (typeof entry !== 'object') return false
  if (entry.is_enabled === false) return false
  if (entry.allowed === false) return false
  if (entry.is_enabled === true) return true
  if (entry.allowed === true) return true
  return false
}

function isFeatureEnabled(permissions: PermissionsResponse | null | undefined, key: string): boolean {
  return isFeatureEnabledEntry(getFeatureEntry(permissions, key))
}

// ─── Machine ─────────────────────────────────────────────────────────

export const assistantMachine = setup({
  types: {
    context: {} as MachineContext,
    events: {} as AssistantEvent
  },
  guards: {
    /** ai:verified_accounts present but email_verified !== true. */
    isEmailVerificationRequired: ({ context }) => {
      // Only require verification when the gate exists AND is enabled.
      if (!isFeatureEnabled(context.permissions, Features.AI_VERIFIED_ACCOUNTS)) return false
      return context.permissions?.email_verified !== true
    },
    isAnonymous: ({ context }) => !context.isAuthenticated,
    cooldownStillActive: ({ context }) =>
      context.cooldownExpiresAt !== null && context.cooldownExpiresAt > Date.now()
  },
  actions: {
    setAuth: ({ context, event }) => {
      if (event.type !== 'AUTH_CHANGED') return
      context.isAuthenticated = event.isAuthenticated
      if (!event.isAuthenticated) {
        context.permissions = null
        context.gateReason = 'auth-required'
        context.requiredFeature = null
      }
    },
    clearAuth: ({ context }) => {
      context.isAuthenticated = false
      context.permissions = null
      context.gateReason = 'auth-required'
      context.requiredFeature = null
      context.lastError = null
    },
    setPermissions: ({ context, event }) => {
      if (event.type !== 'PERMISSIONS_LOADED') return
      context.permissions = event.permissions
      context.permissionsErrorMessage = null
    },
    setPermissionsError: ({ context, event }) => {
      if (event.type !== 'PERMISSIONS_FAILED') return
      context.permissionsErrorMessage = event.message
    },
    /**
     * After permissions land, decide the gate:
     *   1. anonymous              → 'auth-required'
      *   2. ai:verified_accounts   → 'email-unverified'
      *   3. otherwise              → null  (available)
     * FEATURE_DENIED / quota gates are set imperatively by handleAIError.
     */
    deriveGateFromPermissions: ({ context }) => {
      if (!context.isAuthenticated) {
        context.gateReason = 'auth-required'
        context.requiredFeature = null
        return
      }
      // Only enforce email verification when ai:verified_accounts exists and is enabled.
      if (isFeatureEnabled(context.permissions, Features.AI_VERIFIED_ACCOUNTS) && context.permissions?.email_verified !== true) {
        context.gateReason = 'email-unverified'
        context.requiredFeature = null
        return
      }
      context.gateReason = null
      context.requiredFeature = null
    },
    handleAIError: ({ context, event }) => {
      if (event.type !== 'ERROR_RECEIVED') return
      const err = event.error
      context.lastError = err

      // 1. Cooldown family ─────────────────────────────────────────
      if (COOLDOWN_TERMINAL_CODES.has(err.code)) {
        context.cooldownExpiresAt = Number.POSITIVE_INFINITY
        return
      }
      if (COOLDOWN_RATE_LIMITED_CODES.has(err.code)) {
        const expiresAt = deriveCooldownExpiry(err, Date.now())
        context.cooldownExpiresAt = expiresAt
        // Per-feature quota exhaustion (no retryAfter) → also gate for upgrade.
        if (isQuotaExhausted(err)) {
          context.gateReason = 'quota-exhausted'
          context.requiredFeature = extractFeatureName(err)
        }
        return
      }

      // 2. Permission family ───────────────────────────────────────
      if (err.code === 'EMAIL_NOT_VERIFIED') {
        context.gateReason = 'email-unverified'
        context.requiredFeature = null
        return
      }
      if (err.code === 'FEATURE_DENIED') {
        const feature = extractFeatureName(err)
        context.gateReason = 'feature-required'
        context.requiredFeature = feature ?? null
        return
      }
      if (err.code === 'PROVIDER_DENIED') {
        context.allowedProviders = err.details?.allowedProviders ?? null
        // Stay 'available' — the UI swaps the model picker; no gate.
        return
      }

      // 3. Server / validation / client-bug → no state change beyond
      //    `lastError`. Session region transitions to 'failed'.
    },
    clearCooldown: ({ context }) => {
      // Only clear non-terminal cooldowns — IP_BLOCKED / ABUSE_BLOCKED stay.
      if (context.cooldownExpiresAt === Number.POSITIVE_INFINITY) return
      context.cooldownExpiresAt = null
    },
    resetSession: ({ context }) => {
      context.lastError = null
      context.allowedProviders = null
    },
    dismissNotice: ({ context }) => {
      // The chat notice is purely a `lastError`-driven view. Clear the
      // error so the strip disappears — cooldown / gate state remain
      // intact (they have their own clear paths).
      context.lastError = null
      context.allowedProviders = null
    }
  }
}).createMachine({
  id: 'assistant',
  type: 'parallel',
  context: initialContext,
  states: {
    auth: {
      initial: 'unknown',
      on: {
        AUTH_CHANGED: [
          {
            guard: ({ event }) => event.type === 'AUTH_CHANGED' && event.isAuthenticated,
            target: '.authenticated',
            actions: ['setAuth', 'deriveGateFromPermissions']
          },
          {
            target: '.anonymous',
            actions: ['clearAuth']
          }
        ],
        LOGOUT: { target: '.anonymous', actions: ['clearAuth']}
      },
      states: {
        unknown: {},
        anonymous: {},
        authenticated: {}
      }
    },
    permissions: {
      initial: 'idle',
      on: {
        AUTH_CHANGED: [
          {
            guard: ({ event }) => event.type === 'AUTH_CHANGED' && event.isAuthenticated,
            target: '.loading'
          },
          { target: '.idle' }
        ],
        LOGOUT: { target: '.idle' },
        PERMISSIONS_LOADING: { target: '.loading' }
      },
      states: {
        idle: {},
        loading: {
          on: {
            PERMISSIONS_LOADED: {
              target: 'ready',
              actions: ['setPermissions', 'deriveGateFromPermissions']
            },
            PERMISSIONS_FAILED: {
              target: 'error',
              actions: ['setPermissionsError']
            }
          }
        },
        ready: {
          on: {
            PERMISSIONS_LOADING: 'loading'
          }
        },
        error: {
          on: {
            PERMISSIONS_LOADING: 'loading'
          }
        }
      }
    },
    session: {
      initial: 'idle',
      on: {
        RESET_SESSION: { target: '.idle', actions: ['resetSession']},
        NOTICE_DISMISSED: { actions: ['dismissNotice']}
      },
      states: {
        idle: {
          on: {
            REQUEST_STARTED: 'requesting'
          }
        },
        requesting: {
          on: {
            STREAM_STARTED: 'streaming',
            REQUEST_SUCCEEDED: 'done',
            ERROR_RECEIVED: { target: 'failed', actions: ['handleAIError']}
          }
        },
        streaming: {
          on: {
            REQUEST_SUCCEEDED: 'done',
            ERROR_RECEIVED: { target: 'failed', actions: ['handleAIError']}
          }
        },
        done: {
          on: {
            REQUEST_STARTED: 'requesting'
          }
        },
        failed: {
          on: {
            REQUEST_STARTED: 'requesting',
            ERROR_RECEIVED: { actions: ['handleAIError']}
          }
        }
      }
    },
    cooldown: {
      initial: 'none',
      on: {
        ERROR_RECEIVED: [
          {
            guard: ({ event }) =>
              event.type === 'ERROR_RECEIVED' &&
              (event.error.code === 'IP_BLOCKED' || event.error.code === 'ABUSE_BLOCKED'),
            target: '.blocked'
          },
          {
            guard: ({ event }) =>
              event.type === 'ERROR_RECEIVED' &&
              (event.error.code === 'RATE_LIMITED' || event.error.code === 'RATE_LIMITED_GLOBAL'),
            target: '.rateLimited'
          }
        ],
        COOLDOWN_CLEARED: { target: '.none', actions: ['clearCooldown']}
      },
      states: {
        none: {},
        rateLimited: {
          on: {
            // Tick re-evaluates; if the deadline passed we drop back to 'none'.
            COOLDOWN_TICK: [
              {
                guard: 'cooldownStillActive',
                target: 'rateLimited'
              },
              { target: 'none', actions: ['clearCooldown']}
            ]
          }
        },
        // Terminal — no transition out. Operator must reset (and only after
        // upstream lifts the block).
        blocked: {}
      }
    }
  }
})

// ─── Selectors ──────────────────────────────────────────────────────

/**
 * Snapshot adapter — pulls state value + context into the flat shape the
 * UI consumes via useSyncExternalStore. Mirrors plan-manager-machine.
 */
export function snapshotFromActor(actor: AnyActorRef): AssistantSnapshot {
  const snap = actor.getSnapshot() as { value: any; context: MachineContext }
  const value = snap.value as Record<string, string>
  const ctx = snap.context

  const permissionsState =
    value.permissions === 'loading' ? 'loading'
      : value.permissions === 'ready' ? 'ready'
        : value.permissions === 'error' ? 'error'
          : 'idle'

  // Availability is computed top-down so callers don't have to know about
  // the parallel regions:
  //   1. permissions still loading           → 'unknown'
  //   2. any gateReason set                  → 'gated'
  //   3. otherwise                           → 'available'
  let availability: AvailabilityState = 'unknown'
  if (permissionsState === 'ready' || !ctx.isAuthenticated) {
    if (ctx.gateReason) {
      availability = 'gated'
    } else if (ctx.isAuthenticated) {
      availability = 'available'
    } else {
      // Anonymous users are gated for sign-in.
      availability = 'gated'
    }
  }

  const cooldown: CooldownState =
    value.cooldown === 'blocked' ? 'blocked'
      : value.cooldown === 'rateLimited' ? 'rate-limited'
        : 'none'

  return {
    isAuthenticated: ctx.isAuthenticated,
    permissionsState,
    availability,
    session: (value.session ?? 'idle') as SessionState,
    cooldown,
    gateReason: ctx.gateReason,
    requiredFeature: ctx.requiredFeature,
    cooldownExpiresAt: ctx.cooldownExpiresAt,
    lastError: ctx.lastError,
    permissions: ctx.permissions
  }
}

/** Can the user submit an AI request right now? */
export function selectCanAskAI(snap: AssistantSnapshot): boolean {
  return snap.availability === 'available' && snap.cooldown === 'none'
}

/**
 * Generic feature-flag check against `permissions.features`. Returns true
 * iff the named flag is present AND `is_enabled !== false`. Anonymous
 * users (no permissions yet) get `false` for everything.
 *
 * Use this for capability toggles that aren't tied to a specific model
 * row, e.g. `ai:auto`, `ai:ollama`, `ai:completion`.
 */
export function selectFeatureEnabled(snap: AssistantSnapshot, key: string): boolean {
  return isFeatureEnabled(snap.permissions, key)
}

/** Map the snapshot to a plan-manager hand-off, or null if no action needed. */
export function selectPlanManagerHandoff(snap: AssistantSnapshot): PlanManagerHandoff | null {
  if (!snap.gateReason) return null
  // RATE_LIMITED_GLOBAL never opens the plan manager — caller handles toast.
  if (snap.gateReason === 'quota-exhausted' && snap.requiredFeature === null) return null
  return {
    reason: snap.gateReason,
    requiredFeature: snap.requiredFeature ?? undefined
  }
}

/**
 * Allowed provider/model IDs. Drives the model picker without scattering
 * `if (features['ai:foo'])` checks across the codebase. Pass in the static
 * model registry; we filter by `ai:<provider>` feature flags.
 *
 * Convention (matches the live /permissions/ shape):
 *   feature_name === 'ai:Mistral'   → mistralai provider models
 *   feature_name === 'ai:Anthropic' → anthropic provider models
 *   feature_name === 'ai:OpenAI'    → openai provider models
 *   feature_name === 'ai:completion' → models with capabilities including 'completion'
 */
export function selectAllowedModelIds(
  snap: AssistantSnapshot,
  models: ReadonlyArray<{ id: string; provider: string; capabilities?: string[] }>
): string[] {
  if (!snap.permissions?.features) {
    // No permissions yet — fall back to anything that doesn't require auth.
    // (Mirrors getDefaultModel() behaviour.)
    return models.filter((m) => m.provider === 'mistralai').map((m) => m.id)
  }
  const allowed: string[] = []
  for (const m of models) {
    if (m.provider === 'ollama') { allowed.push(m.id); continue }
    // Provider key is capitalised in /permissions/ (`ai:Mistral`, not `ai:mistralai`).
    const providerKey = providerToFeatureKey(m.provider)
    if (providerKey && isFeatureEnabled(snap.permissions, providerKey)) allowed.push(m.id)
  }
  return allowed
}

function providerToFeatureKey(provider: string): string | null {
  switch (provider) {
  case 'mistralai': return Features.AI_PROVIDER_MISTRAL
  case 'anthropic': return Features.AI_PROVIDER_ANTHROPIC
  case 'openai': return Features.AI_PROVIDER_OPENAI
  default: return null
  }
}

/** Seconds remaining on the current cooldown, or null if none. */
export function selectCooldownRemaining(snap: AssistantSnapshot, now: number = Date.now()): number | null {
  if (snap.cooldown === 'blocked') return Number.POSITIVE_INFINITY
  if (snap.cooldown !== 'rate-limited') return null
  if (snap.cooldownExpiresAt === null) return null
  return Math.max(0, Math.ceil((snap.cooldownExpiresAt - now) / 1000))
}

/** When PROVIDER_DENIED arrives, this is the list the picker should switch to. */
export function selectAllowedProvidersFromError(snap: AssistantSnapshot): string[] | null {
  if (snap.lastError?.code !== 'PROVIDER_DENIED') return null
  const d = (snap.lastError.details ?? {}) as Record<string, any>
  return d.allowedProviders ?? d.allowed_providers ?? null
}

/**
 * The model catalogue the picker should render.
 *
 *   1. authenticated + permissions loaded → backend `ai_models` (parsed),
 *      Ollama appended client-side.
 *   2. otherwise → ANONYMOUS_FALLBACK_MODELS (the "sign-in" placeholder
 *      row + Ollama). The placeholder is marked `available: false` so
 *      the picker greys it out and clicking opens planManager(auth-required).
 *
 * The selector is pure derivation over the snapshot — no caching.
 */
export function selectAvailableModels(snap: AssistantSnapshot): AIModel[] {
  if (snap.isAuthenticated && snap.permissions) {
    const parsed = parseAIModelsFromPermissions(snap.permissions)
    if (parsed && parsed.length > 0) return parsed
  }
  return ANONYMOUS_FALLBACK_MODELS
}

/**
 * The chat-default model — the row the backend marks `is_default: true`
 * in `permissions.ai_models[]`. There is NO client-side fallback: when
 * permissions haven't loaded or no row is flagged, this returns null
 * and the caller must wait (or reject loudly).
 */
export function selectDefaultModel(snap: AssistantSnapshot): AIModel | null {
  const models = selectAvailableModels(snap)
  if (!models.length) return null
  // Prefer an `available` default; only fall back to the unavailable one
  // (e.g. anonymous placeholder) if nothing else is marked default.
  const availableDefault = models.find((m) => m.isDefault && m.available)
  if (availableDefault) return availableDefault
  const anyDefault = models.find((m) => m.isDefault)
  if (anyDefault) return anyDefault
  // No is_default flag anywhere — pick the first available row.
  return models.find((m) => m.available) ?? models[0] ?? null
}

/**
 * Backend-driven model assignment for a named task (e.g. 'dapp_generator',
 * 'completion'). Source: `permissions.task_models[taskId]`. Returns null
 * when the task isn't advertised — callers MUST throw rather than guess.
 */
export function selectModelForTask(snap: AssistantSnapshot, taskId: string): string | null {
  const tm = (snap.permissions as any)?.task_models as Record<string, string> | undefined
  if (!tm || typeof tm[taskId] !== 'string' || !tm[taskId]) return null
  return tm[taskId]
}

/**
 * Backend-driven numeric/boolean param for a named task (e.g.
 * `selectTaskParam(snap, 'dapp_generator', 'max_tokens')`). Returns null
 * when the task or key isn't advertised.
 */
export function selectTaskParam(
  snap: AssistantSnapshot,
  taskId: string,
  key: string
): number | string | boolean | null {
  const tp = (snap.permissions as any)?.task_params as Record<string, Record<string, any>> | undefined
  const row = tp?.[taskId]
  if (!row || row[key] === undefined || row[key] === null) return null
  return row[key]
}

/** Sugar over selectFeatureEnabled — Auto Mode is just `ai:auto`. */
export function selectAutoModeEnabled(snap: AssistantSnapshot): boolean {
  return selectFeatureEnabled(snap, Features.AI_AUTO)
}

/**
 * One-stop derivation for cooldown UI: countdown chip / banner copy / disable
 * the Send button. Returns null when the assistant is free to take requests.
 *
 *   active        – any cooldown is in effect (rate-limit OR terminal block)
 *   isTerminal    – IP_BLOCKED / ABUSE_BLOCKED — never lifts on its own
 *   remainingMs   – ms until lift; Number.POSITIVE_INFINITY for terminal
 *   remainingSec  – ceil(remainingMs / 1000)
 *   expiresAt     – epoch-ms or null (terminal)
 *   feature       – for per-feature RATE_LIMITED, the feature_name
 *   limit / window – informational ("10 / hour"), pulled from the error envelope
 *   message       – the human-readable backend message
 *   code          – the AIError code that triggered the cooldown
 */
export interface CooldownDisplay {
  active: boolean
  isTerminal: boolean
  remainingMs: number
  remainingSec: number
  expiresAt: number | null
  feature: string | null
  limit: number | null
  window: string | null
  message: string
  code: string
}

export function selectCooldownDisplay(
  snap: AssistantSnapshot,
  now: number = Date.now()
): CooldownDisplay | null {
  if (snap.cooldown === 'none') return null
  const err = snap.lastError
  const isTerminal = snap.cooldown === 'blocked'
  const remainingMs = isTerminal
    ? Number.POSITIVE_INFINITY
    : Math.max(0, (snap.cooldownExpiresAt ?? now) - now)
  const remainingSec = isTerminal ? Number.POSITIVE_INFINITY : Math.ceil(remainingMs / 1000)
  const details: any = err?.details ?? {}
  return {
    active: true,
    isTerminal,
    remainingMs,
    remainingSec,
    expiresAt: isTerminal ? null : snap.cooldownExpiresAt,
    feature: typeof details.feature === 'string' ? details.feature : null,
    limit: typeof err?.limit === 'number' ? err.limit
      : typeof details.limit === 'number' ? details.limit : null,
    window: typeof err?.window === 'string' ? err.window
      : typeof details.window === 'string' ? details.window : null,
    message: err?.message || 'Rate limit reached. Please wait a moment.',
    code: err?.code || 'RATE_LIMITED'
  }
}

// ─── Chat-notice derivation ─────────────────────────────────────────
//
// The cooldown banner covers RATE_LIMITED / IP_BLOCKED / ABUSE_BLOCKED.
// The plan-manager hand-off covers EMAIL_NOT_VERIFIED / FEATURE_DENIED
// (non-solcoder) / quota-exhausted RATE_LIMITED.
//
// Everything ELSE that lands in `lastError` — PROVIDER_DENIED, server
// errors, validation errors, client-bug codes, and unknown codes — has
// no other UI signal. `selectChatNotice` returns a typed view of that
// remainder so the chat surface can render a non-blocking strip and an
// in-chat error bubble. Returning null means "no further UI needed —
// either we're fine, or another surface (banner/plan-manager) already
// has the user's attention."
//
// `severity` drives the strip colour:
//   - 'warning'  → recoverable, user can retry or change something
//   - 'error'    → server-side / unrecoverable on this attempt
//   - 'info'     → purely informational (currently unused, future hook)
//
// `actionable` flags whether retrying the SAME prompt is likely to help.
// PROVIDER_DENIED + transient upstream → true. Validation / client-bug → false.

export type ChatNoticeSeverity = 'info' | 'warning' | 'error'

export type ChatNoticeActionStyle = 'primary' | 'secondary' | 'link'

export interface ChatNoticeAction {
  /** Stable id for React keys / test selectors. */
  id: string
  /** Button label shown in the notice strip. */
  label: string
  /** Visual style hint for the chat UI. */
  style?: ChatNoticeActionStyle
  /** Target plugin and method to call when the button is clicked. */
  plugin: string
  method: string
  /** Variadic arguments passed to plugin.call(plugin, method, ...args). */
  args?: unknown[]
  /** Auto-dismiss the notice after a successful click action. */
  dismissOnClick?: boolean
}

export interface ChatNotice {
  severity: ChatNoticeSeverity
  /** AIError.code, verbatim. UI can use it as a stable id / data-attribute. */
  code: string
  /** Short headline, e.g. "Provider not allowed". */
  title: string
  /** The backend's `message`, lightly smoothed. */
  message: string
  /** True if retrying the same prompt may succeed (server transient,
   *  or after the user changes the model picker). False for validation
   *  / client-bug codes — UI can hide the retry hint. */
  actionable: boolean
  /** PROVIDER_DENIED only — the providers the user IS allowed to use. */
  allowedProviders?: string[]
  /** Optional call-to-action buttons shown under the notice message. */
  actions?: ChatNoticeAction[]
}

/** Codes that are fully handled by the cooldown banner — no extra notice. */
const COOLDOWN_OWNED_CODES = new Set([
  'RATE_LIMITED', 'RATE_LIMITED_GLOBAL', 'IP_BLOCKED', 'ABUSE_BLOCKED'
])

/** Codes that are fully handled by the plan-manager hand-off — no extra notice. */
const GATE_OWNED_CODES = new Set([
  'EMAIL_NOT_VERIFIED'
  // FEATURE_DENIED handled imperatively below — only "owned" when it produces
  // a gateReason.
])

export function selectChatNotice(snap: AssistantSnapshot): ChatNotice | null {
  const err = snap.lastError
  if (!err) return null
  if (COOLDOWN_OWNED_CODES.has(err.code)) return null
  // Per-feature quota exhaustion — plan-manager already opens.
  if (snap.gateReason === 'quota-exhausted') return null
  if (GATE_OWNED_CODES.has(err.code) && snap.gateReason) return null
  if (err.code === 'FEATURE_DENIED' && snap.gateReason === 'feature-required') return null

  switch (err.code) {
  case 'PROVIDER_DENIED': {
    const d = (err.details ?? {}) as Record<string, any>
    const allowed: string[] = d.allowedProviders ?? d.allowed_providers ?? []
    const tried: string | undefined = d.provider
    const allowedText = allowed.length ? allowed.join(', ') : 'a different provider'
    return {
      severity: 'warning',
      code: err.code,
      title: tried ? `${tried} is not enabled for your account` : 'Provider not allowed',
      message: `Switch the model picker to ${allowedText} and try again.`,
      actionable: true,
      allowedProviders: allowed
    }
  }
  case 'UPSTREAM_ERROR':
  case 'STREAM_ERROR':
  case 'INTERNAL_ERROR':
  case 'SERVICE_NOT_CONFIGURED':
    return {
      severity: 'error',
      code: err.code,
      title: 'AI service error',
      message: err.message || 'The AI service ran into an issue. Please try again.',
      actionable: true
    }
  case 'BAD_REQUEST':
  case 'MISSING_ENDPOINT':
  case 'PROVIDER_NOT_SPECIFIED':
  case 'UNAUTHORIZED_ORIGIN':
    return {
      severity: 'error',
      code: err.code,
      title: 'Request rejected',
      message: err.message || 'The request was malformed. Please report this if it keeps happening.',
      actionable: false
    }
  case 'PAYLOAD_TOO_LARGE':
    return {
      severity: 'warning',
      code: err.code,
      title: 'Input too large',
      message: err.message || 'Shorten your prompt or context and try again.',
      actionable: true
    }
  case 'MISSING_FIGMA_INPUT':
  case 'INVALID_FIGMA_URL':
    return {
      severity: 'warning',
      code: err.code,
      title: 'Invalid input',
      message: err.message || 'Check the Figma input and try again.',
      actionable: true
    }
  case 'EMAIL_NOT_VERIFIED':
    // gate didn't fire (e.g. plan-manager declined to open) — still tell the user.
    return {
      severity: 'warning',
      code: err.code,
      title: 'Email verification required',
      message: err.message || 'Verify your email address to use the AI assistant.',
      actionable: false
    }
  case 'FEATURE_DENIED': {
    const d = (err.details ?? {}) as Record<string, any>
    const feat: string | undefined = d.feature ?? d.required_feature ?? d.requiredFeature
    const model: string | undefined = d.model
    const featLabel = feat ? ` (${feat})` : ''
    const modelLabel = model ? ` for model "${model}"` : ''
    return {
      severity: 'warning',
      code: err.code,
      title: `Feature not available on your plan${featLabel}`,
      message: err.message || `This feature${modelLabel} is not enabled for your account.`,
      actionable: false
    }
  }

  case 'INSUFFICIENT_CREDITS':
    return {
      severity: 'info',
      code: '',
      title: 'Insufficient AI credits',
      message: 'You do not have enough AI credits to perform this action. Please check your billing details or add more AI credits.',
      actionable: false,
      actions: [
        {
          id: 'topup-credits',
          label: 'Top up AI credits',
          style: 'primary',
          plugin: 'planManager',
          method: 'open',
          args: [{ reason: 'quota-exhausted', initialSection: 'topup' }]
        }
      ]
    }
  default:
    // Unknown code — surface verbatim so devtools/Sentry / users see it.
    return {
      severity: 'error',
      code: err.code || 'UNKNOWN',
      title: 'Unexpected error',
      message: err.message || 'The AI service returned an error we don\u2019t recognise.',
      actionable: true
    }
  }
}

// ─── Actor factory ──────────────────────────────────────────────────

/** Create a fresh actor. The wrapping plugin owns the lifecycle. */
export function createAssistantActor() {
  return createActor(assistantMachine)
}
