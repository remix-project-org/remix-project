/**
 * PlanManagerMachine — XState v5 machine modelling the lifecycle of the
 * Plan & Credits side panel.
 *
 * Five parallel regions, one source of truth:
 *   - auth      : unknown | unauthenticated | authenticated
 *   - data      : idle | loading | ready | refreshing | error  (account-scoped)
 *   - catalog   : idle | loading | ready | error               (public)
 *   - checkout  : idle | inProgress | result                   (Paddle-driven)
 *   - overlay   : closed | open
 *
 * The machine is pure — it knows nothing about React, fetch, or the plugin
 * engine. It receives events; the plugin wires them up to the outside world
 * (auth events, Paddle events, API fetches, "out of credits" signals from
 * the AI plugin, dev-switcher buttons, etc.).
 *
 * UI reads state through the `selectors` exported below — never by digging
 * into raw context. This keeps the contract narrow.
 *
 * Catalog endpoints (`/billing/subscription-plans`, `/billing/credit-packages`)
 * are public; the catalog region loads eagerly. Account data only loads once
 * authenticated. When the server eventually exposes a per-user "available
 * plans" endpoint, we swap the `selectVisiblePlans` selector for a direct
 * `context.availablePlans` read — no other call site changes.
 */

import { setup, createActor, type AnyActorRef } from 'xstate'
import type {
  Credits,
  QuotaEntry,
  UserSubscription,
  SubscriptionPlan,
  CreditPackage,
  PermissionsResponse
} from '@remix-api'

export type { QuotaEntry }

// ─── Public types ───────────────────────────────────────────────────

export type CreditState = 'unknown' | 'healthy' | 'low' | 'critical' | 'empty'
export type PlanLifecycle = 'active' | 'trial' | 'expiring' | 'expired'
export type PlanKind = 'no_subscription' | 'beta' | 'paid'
export type DataState = 'loading' | 'error' | 'ready'
export type ActiveAlert =
  | 'beta-transition'
  | 'plan-lifecycle'
  | 'credit'
  | null

export type CheckoutResultKind = 'processing' | 'success' | 'closed' | 'error'
export type CheckoutIntent = 'subscription' | 'topup' | 'feature' | 'cancel'

export interface CheckoutResult {
  kind: CheckoutResultKind
  intent: CheckoutIntent
  itemLabel?: string
  errorMessage?: string
  transactionId?: string
  /**
   * Free-form per-flow context that the result screen can render — e.g.
   * `{ effectiveFrom: 'next_billing_period', accessUntil: 'Jun 19, 2026' }`
   * for a cancel result. Kept loose because intents have different shapes.
   */
  meta?: Record<string, string>
}

/** Snapshot the UI consumes — purely derived, never mutated outside the machine. */
export interface PlanManagerSnapshot {
  isAuthenticated: boolean
  dataState: DataState
  isOpen: boolean
  credits: Credits | null
  subscription: UserSubscription | null
  /** Whether the user can still claim a free trial (never used one before). */
  isTrialEligible: boolean
  permissions: PermissionsResponse | null
  catalogPlans: SubscriptionPlan[]
  catalogPackages: CreditPackage[]
  checkoutResult: CheckoutResult | null
  /** Set while a Paddle checkout is being prepared/open (no result yet). */
  pendingCheckout: CheckoutIntentRecord | null
  errorMessage: string | null
  /**
   * Why the panel was opened. Set on the most recent OPEN_OVERLAY when a
   * caller passes an intent (e.g. AI assistant routing a gate to the right
   * screen). `null` when the user opened the panel from the menu icon.
   */
  openIntent: OpenIntent | null
  /**
   * In-panel confirm dialog. Set when the plugin requests confirmation
   * (e.g. plan change preview, cancel subscription). Cleared when the user
   * picks an action or dismisses. The Promise/resolver lives on the plugin;
   * only display data is in the snapshot.
   */
  confirmDialog: ConfirmDialog | null
}

/** A button in a confirm dialog. The `value` is what the plugin's promise resolves to. */
export interface ConfirmAction {
  value: string
  label: string
  variant?: 'primary' | 'danger' | 'ghost'
  /** Optional Font Awesome icon class, e.g. 'fas fa-times'. */
  icon?: string
}

/**
 * Optional inline key/value chip rendered above the actions. Use these to
 * surface concrete data the user needs to see before committing — e.g.
 * "Access until: Jun 19, 2026" for a cancel, or "You'll be charged: $4.32"
 * for a plan switch. Tones drive colour: positive = teal, negative = pink,
 * muted = dim grey, default = neutral.
 */
export interface ConfirmHighlight {
  label: string
  value: string
  tone?: 'default' | 'positive' | 'negative' | 'muted'
}

export interface ConfirmDialog {
  /** Stable id so the React side can key the modal. */
  id: string
  title: string
  /** Body text. May contain newlines; rendered as paragraphs. */
  message: string
  /** Action buttons, rendered in order. The dismiss ‘X’ / backdrop resolves to `null`. */
  actions: ConfirmAction[]
  /** Visual variant for the modal frame. */
  variant?: 'default' | 'danger'
  /** Small uppercase label rendered above the title. */
  eyebrow?: string
  /** Font Awesome class for the header icon (e.g. 'fas fa-arrow-right-arrow-left'). */
  icon?: string
  /** Accent colour (hex) for the header icon halo. Defaults vary by variant. */
  accent?: string
  /** Inline highlights surfaced before the actions. */
  highlights?: ConfirmHighlight[]
}

/** Reason a non-UI plugin asked to open the panel. */
export type OpenReason =
  | 'auth-required'
  | 'email-unverified'
  | 'feature-required'
  | 'quota-exhausted'
  | 'manual'

/** Payload accepted by `OPEN_OVERLAY`. All fields are optional. */
export interface OpenIntent {
  reason?: OpenReason
  /** Feature key (e.g. 'ai:Anthropic') that triggered a 'feature-required' gate. */
  requiredFeature?: string
  /** Section to focus when the panel transitions to ready. */
  initialSection?: 'plans' | 'topup' | 'usage'
}

// ─── Machine context + events ───────────────────────────────────────

/** Tuning knobs — colocated so the machine is the single source of thresholds. */
export const THRESHOLDS = {
  CREDIT_LOW_PCT: 0.20,        // <20% of monthly allowance → 'low'
  CREDIT_CRITICAL_PCT: 0.05,   // <5%                       → 'critical'
  PLAN_EXPIRING_DAYS: 7        // ≤7 days to renewal/end    → 'expiring'
} as const

interface CheckoutIntentRecord {
  intent: CheckoutIntent
  itemLabel?: string
  productId?: string
}

interface MachineContext {
  // auth
  token: string | null
  userId: number | null
  // account data
  credits: Credits | null
  subscription: UserSubscription | null
  /** Mirrors the top-level `isTrialEligible` flag from /billing/subscription. */
  isTrialEligible: boolean
  permissions: PermissionsResponse | null
  // catalog
  catalogPlans: SubscriptionPlan[]
  catalogPackages: CreditPackage[]
  // checkout
  pendingCheckout: CheckoutIntentRecord | null
  checkoutResult: CheckoutResult | null
  // overlay routing
  openIntent: OpenIntent | null
  // confirm dialog
  confirmDialog: ConfirmDialog | null
  // diagnostics
  lastError: string | null
}

export type PlanManagerEvent =
  // auth
  | { type: 'AUTH_CHANGED'; isAuthenticated: boolean; token?: string | null; userId?: number | null }
  | { type: 'LOGOUT' }
  // account data
  | { type: 'REFRESH' }
  | { type: 'DATA_LOADED'; credits: Credits | null; subscription: UserSubscription | null; permissions: PermissionsResponse | null; isTrialEligible?: boolean }
  | { type: 'DATA_FAILED'; message: string }
  // catalog
  | { type: 'CATALOG_LOAD' }
  | { type: 'CATALOG_LOADED'; plans: SubscriptionPlan[]; packages: CreditPackage[] }
  | { type: 'CATALOG_FAILED'; message: string }
  // checkout
  | { type: 'CHECKOUT_INTENT'; intent: CheckoutIntent; itemLabel?: string; productId?: string }
  | { type: 'CHECKOUT_OPENED' }
  | { type: 'CHECKOUT_COMPLETED'; transactionId?: string; meta?: Record<string, string> }
  | { type: 'CHECKOUT_CLOSED' }
  | { type: 'CHECKOUT_ERROR'; message?: string; transactionId?: string }
  | { type: 'CHECKOUT_RESULT_DISMISS' }
  // Plugin-side signal: backend confirmed the purchase + we just refreshed
  // permissions/credits/sub. Promotes 'processing' → 'success' regardless of
  // current data substate (DATA_LOADED alone only fires inside `refreshing`).
  | { type: 'PURCHASE_CONFIRMED' }
  // External signal — e.g. AI plugin received a 402 from upstream.
  | { type: 'CREDITS_EXHAUSTED' }
  // overlay
  | { type: 'OPEN_OVERLAY'; intent?: OpenIntent }
  | { type: 'CLOSE_OVERLAY' }
  | { type: 'TOGGLE_OVERLAY'; intent?: OpenIntent }
  // confirm dialog
  | { type: 'CONFIRM_REQUEST'; dialog: ConfirmDialog }
  | { type: 'CONFIRM_DISMISS' }
  // dev — inject a synthetic snapshot for the side-panel scenario buttons.
  | { type: 'DEV_INJECT'; partial: Partial<MachineContext> }

const initialContext: MachineContext = {
  token: null,
  userId: null,
  credits: null,
  subscription: null,
  isTrialEligible: false,
  permissions: null,
  catalogPlans: [],
  catalogPackages: [],
  pendingCheckout: null,
  checkoutResult: null,
  openIntent: null,
  confirmDialog: null,
  lastError: null
}

// ─── Machine ─────────────────────────────────────────────────────────

export const planManagerMachine = setup({
  types: {
    context: {} as MachineContext,
    events: {} as PlanManagerEvent
  },
  guards: {
    isAuthenticated: ({ context, event }) => {
      if (event.type === 'AUTH_CHANGED') return event.isAuthenticated
      return context.token !== null
    }
  },
  actions: {
    setAuth: ({ context, event }) => {
      if (event.type !== 'AUTH_CHANGED') return
      context.token = event.isAuthenticated ? (event.token ?? context.token) : null
      context.userId = event.isAuthenticated ? (event.userId ?? context.userId) : null
    },
    clearAuth: ({ context }) => {
      context.token = null
      context.userId = null
      context.credits = null
      context.subscription = null
      context.permissions = null
      context.isTrialEligible = false
      context.lastError = null
    },
    setData: ({ context, event }) => {
      if (event.type !== 'DATA_LOADED') return
      context.credits = event.credits
      context.subscription = event.subscription
      context.permissions = event.permissions
      context.isTrialEligible = !!event.isTrialEligible
      context.lastError = null
    },
    setDataError: ({ context, event }) => {
      if (event.type !== 'DATA_FAILED') return
      context.lastError = event.message
    },
    setCatalog: ({ context, event }) => {
      if (event.type !== 'CATALOG_LOADED') return
      context.catalogPlans = event.plans
      context.catalogPackages = event.packages
    },
    setCatalogError: ({ context, event }) => {
      if (event.type !== 'CATALOG_FAILED') return
      context.lastError = event.message
    },
    captureCheckoutIntent: ({ context, event }) => {
      if (event.type !== 'CHECKOUT_INTENT') return
      context.pendingCheckout = {
        intent: event.intent,
        itemLabel: event.itemLabel,
        productId: event.productId
      }
    },
    setCheckoutProcessing: ({ context, event }) => {
      if (event.type !== 'CHECKOUT_COMPLETED') return
      const intent = context.pendingCheckout?.intent ?? 'subscription'
      const itemLabel = context.pendingCheckout?.itemLabel
      context.checkoutResult = {
        kind: 'processing',
        intent,
        itemLabel,
        transactionId: event.transactionId,
        meta: event.meta
      }
    },
    setCheckoutSuccess: ({ context }) => {
      // Promotion from 'processing' → 'success' once the data refresh confirms.
      if (context.checkoutResult?.kind !== 'processing') return
      context.checkoutResult = { ...context.checkoutResult, kind: 'success' }
      // Clear the in-flight intent so per-card "Opening…" / disabled states
      // reset (selectPurchasingProductId reads from pendingCheckout).
      context.pendingCheckout = null
    },
    setCheckoutClosed: ({ context }) => {
      const intent = context.pendingCheckout?.intent ?? 'subscription'
      const itemLabel = context.pendingCheckout?.itemLabel
      context.checkoutResult = { kind: 'closed', intent, itemLabel }
      context.pendingCheckout = null
    },
    setCheckoutError: ({ context, event }) => {
      if (event.type !== 'CHECKOUT_ERROR') return
      const intent = context.pendingCheckout?.intent ?? 'subscription'
      const itemLabel = context.pendingCheckout?.itemLabel
      context.checkoutResult = {
        kind: 'error',
        intent,
        itemLabel,
        errorMessage: event.message,
        transactionId: event.transactionId
      }
      context.pendingCheckout = null
    },
    clearCheckoutResult: ({ context }) => {
      context.checkoutResult = null
    },
    setOpenIntent: ({ context, event }) => {
      if (event.type !== 'OPEN_OVERLAY' && event.type !== 'TOGGLE_OVERLAY') return
      context.openIntent = event.intent ?? null
    },
    clearOpenIntent: ({ context }) => {
      context.openIntent = null
    },
    devInject: ({ context, event }) => {
      if (event.type !== 'DEV_INJECT') return
      Object.assign(context, event.partial)
    },
    setConfirmDialog: ({ context, event }) => {
      if (event.type !== 'CONFIRM_REQUEST') return
      context.confirmDialog = event.dialog
    },
    clearConfirmDialog: ({ context }) => {
      context.confirmDialog = null
    }
  }
}).createMachine({
  id: 'planManager',
  type: 'parallel',
  context: initialContext,
  states: {
    auth: {
      initial: 'unknown',
      on: {
        AUTH_CHANGED: [
          {
            guard: 'isAuthenticated',
            target: '.authenticated',
            actions: ['setAuth']
          },
          {
            target: '.unauthenticated',
            actions: ['clearAuth']
          }
        ],
        LOGOUT: { target: '.unauthenticated', actions: ['clearAuth'] }
      },
      states: {
        unknown: {},
        unauthenticated: {},
        authenticated: {}
      }
    },
    data: {
      initial: 'idle',
      on: {
        // Whenever auth flips to authenticated we want a fresh load.
        AUTH_CHANGED: [
          { guard: 'isAuthenticated', target: '.loading' },
          { target: '.idle' }
        ],
        LOGOUT: { target: '.idle' }
      },
      states: {
        idle: {
          on: {
            REFRESH: 'loading'
          }
        },
        loading: {
          on: {
            DATA_LOADED: { target: 'ready', actions: ['setData'] },
            DATA_FAILED: { target: 'error', actions: ['setDataError'] }
          }
        },
        ready: {
          on: {
            REFRESH: 'refreshing',
            // Out-of-band data refresh (e.g. after pollPaymentConfirmation
            // calls loadAccountData while we're already in 'ready'). Just
            // apply the new data; success promotion happens via
            // PURCHASE_CONFIRMED, not here.
            DATA_LOADED: { actions: ['setData'] },
            // External signal "I just got a 402 from the API" → re-fetch to
            // sync the UI with reality, but stay 'ready' so the panel doesn't
            // flash the skeleton.
            CREDITS_EXHAUSTED: 'refreshing'
          }
        },
        refreshing: {
          on: {
            DATA_LOADED: {
              target: 'ready',
              actions: ['setData', 'setCheckoutSuccess']
            },
            DATA_FAILED: { target: 'error', actions: ['setDataError'] }
          }
        },
        error: {
          on: {
            REFRESH: 'loading'
          }
        }
      }
    },
    catalog: {
      initial: 'idle',
      on: {
        CATALOG_LOAD: { target: '.loading' }
      },
      states: {
        idle: {},
        loading: {
          on: {
            CATALOG_LOADED: { target: 'ready', actions: ['setCatalog'] },
            CATALOG_FAILED: { target: 'error', actions: ['setCatalogError'] }
          }
        },
        ready: {
          on: {
            CATALOG_LOAD: 'loading'
          }
        },
        error: {
          on: {
            CATALOG_LOAD: 'loading'
          }
        }
      }
    },
    checkout: {
      initial: 'idle',
      states: {
        idle: {
          on: {
            CHECKOUT_INTENT: {
              target: 'inProgress',
              actions: ['captureCheckoutIntent']
            }
          }
        },
        inProgress: {
          on: {
            CHECKOUT_OPENED: {},
            CHECKOUT_COMPLETED: {
              target: 'result',
              actions: ['setCheckoutProcessing']
            },
            CHECKOUT_CLOSED: {
              target: 'result',
              actions: ['setCheckoutClosed']
            },
            CHECKOUT_ERROR: {
              target: 'result',
              actions: ['setCheckoutError']
            }
          }
        },
        result: {
          on: {
            CHECKOUT_RESULT_DISMISS: {
              target: 'idle',
              actions: ['clearCheckoutResult']
            },
            // A new purchase starts — supersede the previous result.
            CHECKOUT_INTENT: {
              target: 'inProgress',
              actions: ['clearCheckoutResult', 'captureCheckoutIntent']
            }
          }
        }
      }
    },
    overlay: {
      initial: 'closed',
      on: {
        // Surface checkout outcomes immediately — auto-open if closed.
        CHECKOUT_COMPLETED: { target: '.open' },
        CHECKOUT_CLOSED: { target: '.open' },
        CHECKOUT_ERROR: { target: '.open' },
        // External signal "out of credits" should also reveal the panel.
        CREDITS_EXHAUSTED: { target: '.open' }
      },
      states: {
        closed: {
          on: {
            OPEN_OVERLAY: { target: 'open', actions: ['setOpenIntent'] },
            TOGGLE_OVERLAY: { target: 'open', actions: ['setOpenIntent'] }
          }
        },
        open: {
          on: {
            // Re-opening while already open just updates the intent so the
            // panel can re-route (e.g. AI plugin opens for a different gate).
            OPEN_OVERLAY: { actions: ['setOpenIntent'] },
            CLOSE_OVERLAY: { target: 'closed', actions: ['clearOpenIntent'] },
            TOGGLE_OVERLAY: { target: 'closed', actions: ['clearOpenIntent'] }
          }
        }
      }
    }
  },
  on: {
    DEV_INJECT: { actions: ['devInject'] },
    CONFIRM_REQUEST: { actions: ['setConfirmDialog'] },
    CONFIRM_DISMISS: { actions: ['clearConfirmDialog'] },
    PURCHASE_CONFIRMED: { actions: ['setCheckoutSuccess'] }
  }
})

// ─── Selectors ──────────────────────────────────────────────────────
//
// The UI consumes nothing but selectors. Each selector takes a snapshot
// (or context) and returns a pure derived value. Tested in isolation; no
// React, no async, no plugin engine.

/**
 * Snapshot adapter. Pulls the cross-cutting state into a flat shape the
 * UI can `useSyncExternalStore` against.
 */
export function snapshotFromActor(actor: AnyActorRef): PlanManagerSnapshot {
  const snap = actor.getSnapshot() as { value: any; context: MachineContext }
  const value = snap.value as Record<string, string>
  const ctx = snap.context

  const dataState: DataState =
    value.data === 'loading' ? 'loading'
      : value.data === 'error' ? 'error'
        : 'ready'

  return {
    isAuthenticated: value.auth === 'authenticated',
    dataState,
    isOpen: value.overlay === 'open',
    credits: ctx.credits,
    subscription: ctx.subscription,
    permissions: ctx.permissions,
    catalogPlans: ctx.catalogPlans,
    catalogPackages: ctx.catalogPackages,
    checkoutResult: ctx.checkoutResult,
    pendingCheckout: ctx.pendingCheckout,
    errorMessage: ctx.lastError,
    isTrialEligible: ctx.isTrialEligible,
    openIntent: ctx.openIntent,
    confirmDialog: ctx.confirmDialog
  }
}

/** Plan derivation. Folds subscription + permissions into a single shape. */
export interface PlanState {
  kind: PlanKind
  planId: string | null
  planName: string
  isBeta: boolean
  isCancelled: boolean
  daysUntilExpiry: number      // negative → already expired
  expiresOn: string | null     // ISO date string
  lifecycle: PlanLifecycle
  // Trial info — only meaningful when lifecycle === 'trial'.
  isInTrial: boolean
  trialDaysRemaining: number | null
  trialTotalDays: number | null
  trialEndsOn: string | null
}

const MS_PER_DAY = 1000 * 60 * 60 * 24

function daysBetween(now: number, iso: string | null | undefined): number {
  if (!iso) return Number.POSITIVE_INFINITY
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY
  return Math.floor((t - now) / MS_PER_DAY)
}

function deriveLifecycle(daysUntilExpiry: number): PlanLifecycle {
  if (daysUntilExpiry < 0) return 'expired'
  if (daysUntilExpiry <= THRESHOLDS.PLAN_EXPIRING_DAYS) return 'expiring'
  return 'active'
}

/**
 * Beta detection — confirmed against /permissions/ live response:
 *   { feature_groups: [{ name: 'beta', expires_at: null|string, ... }] }
 */
export function selectBetaGroup(snap: PlanManagerSnapshot) {
  const groups = snap.permissions?.feature_groups
  if (!groups) return null
  return groups.find(g => g.name === 'beta' || g.name === 'beta_tester') ?? null
}

export function selectPlanState(snap: PlanManagerSnapshot, now: number = Date.now()): PlanState {
  const beta = selectBetaGroup(snap)
  const sub = snap.subscription

  // Beta first — beta is a permissions group, NOT a billing plan.
  if (beta) {
    const expiresIso = beta.expires_at
    const days = daysBetween(now, expiresIso)
    const lifecycle = deriveLifecycle(days)
    return {
      kind: 'beta',
      planId: 'beta',
      planName: 'Beta Tester',
      isBeta: true,
      isCancelled: false,
      daysUntilExpiry: Number.isFinite(days) ? days : Number.POSITIVE_INFINITY,
      expiresOn: expiresIso ?? null,
      lifecycle: expiresIso ? lifecycle : 'active',
      isInTrial: false,
      trialDaysRemaining: null,
      trialTotalDays: null,
      trialEndsOn: null
    }
  }

  if (!sub) {
    return {
      kind: 'no_subscription',
      planId: null,
      planName: 'Free',
      isBeta: false,
      isCancelled: false,
      daysUntilExpiry: Number.POSITIVE_INFINITY,
      expiresOn: null,
      lifecycle: 'active',
      isInTrial: false,
      trialDaysRemaining: null,
      trialTotalDays: null,
      trialEndsOn: null
    }
  }

  // Paddle-native subscription
  const endsAt = sub.currentBillingPeriod?.endsAt ?? sub.currentPeriodEnd ?? null
  const days = daysBetween(now, endsAt)
  const isCancelled =
    sub.scheduledChange?.action === 'cancel' ||
    sub.cancelAtPeriodEnd === true ||
    sub.cancelAtPeriodEnd === 1 ||
    sub.status === 'canceled'

  // Trial: backend exposes `isInTrial` + days remaining; we also infer from
  // status==='trialing' + trialEnd as a fallback.
  const isInTrial =
    sub.isInTrial === true ||
    (sub.status === 'trialing' && !!sub.trialEnd)
  const trialEndsOn = sub.trialEnd ?? null
  const trialDaysRemaining =
    typeof sub.trialDaysRemaining === 'number' ? sub.trialDaysRemaining
      : isInTrial && trialEndsOn ? Math.max(0, daysBetween(now, trialEndsOn))
        : null
  const trialTotalDays =
    typeof sub.trialTotalDays === 'number' ? sub.trialTotalDays : null

  // Lifecycle precedence:
  //   1. trialing + cancelled                     → 'expiring' (the trial will end without conversion)
  //   2. trialing                                 → 'trial'
  //   3. active && !cancelled                     → 'active'
  //   4. past_due                                 → 'expiring'
  //   5. otherwise derive from days-until-end
  const lifecycle: PlanLifecycle =
    isInTrial && isCancelled ? 'expiring'
      : isInTrial ? 'trial'
        : sub.status === 'active' && !isCancelled ? 'active'
          : sub.status === 'past_due' ? 'expiring'
            : deriveLifecycle(days)

  const planName =
    sub.planName ||
    sub.items?.[0]?.product?.name ||
    sub.planId ||
    sub.planSlug ||
    'Subscription'

  return {
    kind: 'paid',
    planId: sub.planSlug ?? sub.planId ?? sub.items?.[0]?.priceId ?? null,
    planName,
    isBeta: false,
    isCancelled,
    daysUntilExpiry: Number.isFinite(days) ? days : Number.POSITIVE_INFINITY,
    expiresOn: endsAt,
    lifecycle,
    isInTrial,
    trialDaysRemaining,
    trialTotalDays,
    trialEndsOn
  }
}

/**
 * Credit severity. Total = credits per cycle (subscription's allowance,
 * else permissions/free quota, else just balance for accuracy when nothing
 * else is known).
 */
export interface CreditStatus {
  state: CreditState
  remaining: number
  total: number
  used: number
  usedPct: number     // 0–100
  remainingPct: number // 0–1
  refreshDate: string | null  // ISO, when the next allowance lands
}

export function selectCreditStatus(snap: PlanManagerSnapshot): CreditStatus {
  const credits = snap.credits
  if (!credits) {
    return { state: 'unknown', remaining: 0, total: 0, used: 0, usedPct: 0, remainingPct: 0, refreshDate: null }
  }

  const remaining = Math.max(0, credits.balance ?? 0)

  // Total (this cycle's allowance) — best-effort:
  //   1. subscription.creditsPerMonth (legacy field on UserSubscription)
  //   2. matching catalog plan's creditsPerMonth
  //   3. (free + paid) — gives a sensible baseline when no plan signal exists
  const sub = snap.subscription
  let total = 0
  if (sub?.creditsPerPeriod) total = sub.creditsPerPeriod
  if (!total && sub?.creditsPerMonth) total = sub.creditsPerMonth
  if (!total && sub?.planId) {
    const match = snap.catalogPlans.find(p => p.id === sub.planId)
    if (match) total = match.creditsPerMonth
  }
  if (!total) {
    // Best fallback: balance + any consumed paid credits we can infer.
    // Free-credits + paid-credits gives the *current* split, not the
    // monthly cap — but it's better than zero for severity calc.
    total = (credits.free_credits ?? 0) + (credits.paid_credits ?? 0)
  }
  if (!total) total = remaining // last resort; severity will read 'healthy'

  const used = Math.max(0, total - remaining)
  const remainingPct = total > 0 ? remaining / total : 1
  const usedPct = total > 0 ? Math.min(100, (used / total) * 100) : 0

  let state: CreditState
  if (remaining <= 0) state = 'empty'
  else if (remainingPct < THRESHOLDS.CREDIT_CRITICAL_PCT) state = 'critical'
  else if (remainingPct < THRESHOLDS.CREDIT_LOW_PCT) state = 'low'
  else state = 'healthy'

  const refreshDate = sub?.currentBillingPeriod?.endsAt ?? sub?.currentPeriodEnd ?? sub?.nextBilledAt ?? null

  return { state, remaining, total, used, usedPct, remainingPct, refreshDate }
}

/**
 * Severity hierarchy — only ONE alert ever shows at the top.
 *   1. beta-transition (beta tester whose access is ending/ended)
 *   2. plan-lifecycle  (paid user with cancelled / past_due / expired / trialing)
 *   3. credit          (any non-healthy credit state)
 * Returns null when the panel is calm.
 */
export function selectActiveAlert(snap: PlanManagerSnapshot): ActiveAlert {
  if (snap.dataState !== 'ready') return null
  const plan = selectPlanState(snap)
  if (plan.isBeta && plan.lifecycle !== 'active') return 'beta-transition'
  if (!plan.isBeta && plan.kind === 'paid' && plan.lifecycle !== 'active') return 'plan-lifecycle'
  const credit = selectCreditStatus(snap)
  if (credit.state !== 'healthy' && credit.state !== 'unknown') return 'credit'
  return null
}

/**
 * Visible plans for this user. Today the catalog is identical for all
 * users (server filtering is planned). Once the API exposes a per-user
 * "available plans" endpoint, swap this for `snap.availablePlans`.
 */
export function selectVisiblePlans(snap: PlanManagerSnapshot): SubscriptionPlan[] {
  return snap.catalogPlans
}

export function selectVisiblePackages(snap: PlanManagerSnapshot): CreditPackage[] {
  return snap.catalogPackages
}

/** Top tier? Then nothing to upgrade to. */
export function selectCanUpgrade(snap: PlanManagerSnapshot): boolean {
  const plans = snap.catalogPlans
  if (plans.length === 0) return false
  const plan = selectPlanState(snap)
  if (plan.kind === 'no_subscription' || plan.isBeta) return true
  const sorted = [...plans].sort((a, b) => a.priceUsd - b.priceUsd)
  const top = sorted[sorted.length - 1]
  return plan.planId !== top.id
}

export function selectCheckoutResult(snap: PlanManagerSnapshot): CheckoutResult | null {
  return snap.checkoutResult
}

/**
 * The product id (plan slug or package slug) currently being purchased, or
 * `null` if no purchase is in flight. Used to render per-card busy state on
 * the buy buttons. Active only while we're between CHECKOUT_INTENT and the
 * first CHECKOUT_* result event.
 */
export function selectPurchasingProductId(snap: PlanManagerSnapshot): string | null {
  if (!snap.pendingCheckout) return null
  if (snap.checkoutResult) return null
  return snap.pendingCheckout.productId ?? null
}

/**
 * Per-(provider, model) quotas the user is entitled to via active feature
 * groups. Comes straight from `credits.quotas` (the balance endpoint with
 * `?include=quotas`).
 *
 * Filters out:
 *   - non-array payloads (defensive against bad shapes)
 *   - rows with `amount <= 0` (per the brief, these are disabled and must
 *     not be rendered)
 *
 * Preserves the backend ordering (amount ASC, slug ASC) so the tightest
 * cap — which drains first — stays on top.
 */
export function selectQuotas(snap: PlanManagerSnapshot): QuotaEntry[] {
  const raw = snap.credits?.quotas
  if (!Array.isArray(raw)) return []
  return raw.filter(q => q && typeof q.amount === 'number' && q.amount > 0)
}

/**
 * Permission lookup against the loaded /permissions response.
 *
 * Tolerates both shapes the backend may ship `features` as:
 *   - `Permission[]`  — `[{ feature_name, allowed, ... }]`
 *   - `Record<string, boolean | { allowed: boolean, ... }>`
 *
 * Default-deny: absent / malformed / `allowed:false` all return false. This
 * matches the onboarding UX intent — a freshly-signed-in user without any
 * `ui:show-*` features set should see a clean "logged in" view rather than
 * the full plans/credits/quotas surface.
 */
export function hasFeature(permissions: PermissionsResponse | null | undefined, name: string): boolean {
  if (!permissions) return false
  const f: any = (permissions as any).features
  if (Array.isArray(f)) {
    const hit = f.find((p: any) => p?.feature_name === name)
    return !!hit?.allowed
  }
  if (f && typeof f === 'object') {
    const v = f[name]
    if (typeof v === 'boolean') return v
    if (v && typeof v === 'object') return !!v.allowed
  }
  return false
}

export interface UiVisibility {
  showCredits: boolean
  showPlans: boolean
  showQuotas: boolean
  showTopUps: boolean
  showUsage: boolean
  anyVisible: boolean
}

/**
 * Drives section-level visibility in the Plan Manager overlay. Each flag
 * mirrors a `ui:show-*` feature on /permissions. When the user has none
 * of these granted, the overlay collapses to a minimal "Signed in as
 * <plan>" identity card.
 */
export function selectUiVisibility(snap: PlanManagerSnapshot): UiVisibility {
  const p = snap.permissions
  const showCredits = hasFeature(p, 'ui:show-credits')
  const showPlans   = hasFeature(p, 'ui:show-plans')
  const showQuotas  = hasFeature(p, 'ui:show-quotas')
  const showTopUps  = hasFeature(p, 'ui:show-top-ups')
  const showUsage   = hasFeature(p, 'ui:show-usage')
  return {
    showCredits,
    showPlans,
    showQuotas,
    showTopUps,
    showUsage,
    anyVisible: showCredits || showPlans || showQuotas || showTopUps || showUsage
  }
}

export type { CheckoutIntentRecord }

// ─── Facade ─────────────────────────────────────────────────────────

/**
 * Lightweight wrapper that owns the actor and exposes a stable API.
 * The plugin holds one of these; React components subscribe via the
 * `subscribe` method (compatible with `useSyncExternalStore`).
 */
export class PlanManagerStore {
  private actor: AnyActorRef
  private snapshot: PlanManagerSnapshot
  private listeners = new Set<() => void>()

  constructor(opts?: { debug?: boolean }) {
    const debug = opts?.debug ?? false
    this.actor = createActor(planManagerMachine, {
      inspect: debug
        ? (ev: any) => {
          if (ev.type === '@xstate.event') {
             
            console.log('%c[PlanManager] event %c%s',
              'color:#1f4b99', 'color:#0b6b3a;font-weight:bold',
              JSON.stringify(ev.event))
          } else if (ev.type === '@xstate.snapshot') {
             
            console.log('%c[PlanManager] state %c%s',
              'color:#1f4b99', 'color:#7a5200',
              JSON.stringify(ev.snapshot?.value))
          }
        }
        : undefined
    })
    this.actor.subscribe(() => {
      this.snapshot = snapshotFromActor(this.actor)
      for (const fn of this.listeners) {
        try { fn() } catch (e) { console.error('[PlanManagerStore] listener error', e) }
      }
    })
    this.actor.start()
    this.snapshot = snapshotFromActor(this.actor)
  }

  send(event: PlanManagerEvent): void {
    this.actor.send(event)
  }

  getSnapshot = (): PlanManagerSnapshot => this.snapshot

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb)
    return () => { this.listeners.delete(cb) }
  }

  stop(): void {
    this.actor.stop()
    this.listeners.clear()
  }
}
