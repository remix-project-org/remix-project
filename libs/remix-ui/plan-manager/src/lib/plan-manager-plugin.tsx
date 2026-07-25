/**
 * PlanManagerPlugin — Remix `sidePanel` ViewPlugin for the
 * "Plan & Credits" experience.
 *
 * The plugin is a thin shell around `PlanManagerStore` (XState v5 actor).
 * All UI state lives in the machine; the plugin's job is to:
 *   - bridge auth-plugin events → `AUTH_CHANGED`
 *   - fetch account data (credits, subscription, permissions) → `DATA_LOADED`
 *   - fetch the public catalog (plans, packages) → `CATALOG_LOADED`
 *   - bridge Paddle checkout events → `CHECKOUT_*`
 *   - expose `reportCreditsExhausted()` so any plugin that hits a 402 can
 *     ask the panel to refresh + reveal itself
 *   - render the React tree, which subscribes to the store
 *
 * The plugin owns NO derived state — every visible string is a selector.
 */

import { ViewPlugin } from '@remixproject/engine-web'
import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { PluginViewWrapper, DISCORD_URL } from '@remix-ui/helper'
// Paddle singleton lives next to this plugin now — `@remix-ui/billing` was
// removed when Plan Manager became the sole billing surface.
import { initPaddle, getPaddle, openCheckoutWithTransaction, onPaddleEvent, offPaddleEvent, previewPrices } from './paddle-singleton'
import { reportCheckoutTelemetry, setCheckoutTelemetryToken, setCheckoutTelemetryEnv } from './checkout-telemetry'
import type { Paddle, PaddleEventData } from '@paddle/paddle-js'
import type { CreditsUsageQuery, FeatureGroup, UsageReport, PendingCheckout } from '@remix-api'
import { Features, FEATURE_LABELS, trackMatomoEvent } from '@remix-api'
import type { CheckoutEvent } from '@remix-api'
import * as packageJson from '../../../../../package.json'

import {
  PlanManagerStore,
  type PlanManagerSnapshot,
  type CheckoutResult,
  type CheckoutResultKind,
  type CheckoutIntent,
  type CheckoutBreakdown,
  type CartItem,
  type PlanState,
  type CreditStatus,
  type CreditState,
  type PlanLifecycle,
  type ActiveAlert,
  type OpenIntent,
  type OpenReason,
  type ConfirmDialog,
  type ConfirmAction,
  type ConfirmHighlight,
  selectActiveAlert,
  selectPlanState,
  selectCreditStatus,
  selectVisiblePlans,
  selectVisiblePackages,
  selectQuotas,
  selectCanUpgrade,
  selectCheckoutResult,
  selectPurchasingProductId,
  selectUiVisibility,
  hasFeature,
  type QuotaEntry,
  type UiVisibility
} from './plan-manager-machine'
import { LoginModal, startSignInFlow, OtpDigitInput, OtpDigitInputHandle } from '@remix-ui/login'
import { planManagerLogger } from './plan-manager-logger'

import './plan-manager.css'

const PLAN_ICON = 'data:image/svg+xml;base64,' + btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#a2a3bd" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 4 6v6c0 5 3.4 9.5 8 10 4.6-.5 8-5 8-10V6l-8-4z"/><path d="M9 12l2 2 4-4"/></svg>`)

const profile = {
  name: 'planManager',
  displayName: 'Plan & Credits',
  description: 'Manage your subscription, top up credits and review AI usage',
  methods: ['open', 'close', 'toggle', 'setCheckoutResult', 'reportCreditsExhausted', 'refresh', 'purchaseCredits', 'subscribeToPlan', 'changePlan', 'cancelSubscription', 'reactivateSubscription', 'resolveConfirm', 'cancelCheckout', 'resumeCheckout', 'dismissResumeNudge', 'getPendingCheckouts', 'discardCheckout'],
  events: ['opened', 'closed', 'checkoutResultChanged', 'pendingCheckoutsChanged'],
  icon: PLAN_ICON,
  location: 'sidePanel',
  version: packageJson.version,
  maintainedBy: 'Remix'
}

// Re-export public types for other packages.
export type { CheckoutResult, CheckoutResultKind, CheckoutIntent, OpenIntent, OpenReason }

export class PlanManagerPlugin extends ViewPlugin {
  dispatch: React.Dispatch<any> = () => {}
  readonly debugUI: boolean
  readonly store: PlanManagerStore

  // Memo to detect repeated AUTH events (auth-plugin re-emits a lot).
  private lastAuthSig = ''
  // Prevent the free-plan welcome nudge from firing more than once per session
  // (it fires on every loadAccountData otherwise).
  private freePlanAutoOpenFired = false
  // Guard so we only auto-load the resume list once per auth session.
  private resumeCheckoutsLoaded = false
  // Paddle wiring is owned by the plugin so the panel can drive checkout
  // end-to-end without a host shell. The Paddle singleton lives in
  // ./paddle-singleton (formerly @remix-ui/billing).
  private paddle: Paddle | null = null
  private paddleEventHandler: ((e: PaddleEventData) => void) | null = null
  private paddleTheme: 'dark' | 'light' = 'dark'
  // initPaddleSingleton runs on several paths (activation, auth arrival,
  // checkout, price preview); only surface a blocked Paddle.js once per session
  // so a blocker doesn't spam the telemetry sink.
  private paddleBlockedReported = false
  // Init-lifecycle telemetry guards (once per session each). `configMissing`
  // resets on a fresh login so a later successful token re-reports if it fails
  // again. These make the init path visible: init.ok = SDK ready; config.missing
  // = getPaddleConfig gave no client token (no token yet, or billing/config
  // failing) — the overlay can then only fall back to the hosted URL.
  private paddleInitOkReported = false
  private paddleConfigMissingReported = false
  // Last reason the inline Paddle SDK wasn't available, so a subsequent
  // hosted-checkout fallback can report WHY it fell back (config/token problem
  // vs a blocked CDN/global vs no attempt yet). Cleared on a successful init.
  private lastPaddleInitIssue: 'config_missing' | 'script_blocked' | null = null

  // Load watchdog for the inline overlay. Paddle sometimes emits nothing (or a
  // payload-less checkout.error) when the iframe fails to render — so after we
  // hand a transaction to Paddle we arm a timer and, if checkout.loaded never
  // arrives, emit `checkout.load_timeout`. `checkoutContext` also lets us
  // correlate a later payload-less error back to the transaction we opened and
  // report whether the overlay ever rendered.
  private checkoutLoadWatchdog: number | null = null
  private checkoutContext: { transactionId?: string; intent?: string; itemLabel?: string; openedAt: number; loaded: boolean } | null = null
  // How long to wait for checkout.loaded before declaring a silent render
  // failure. Generous enough to survive a slow network / cold Paddle CDN.
  private readonly checkoutLoadTimeoutMs = 12_000

  // Desktop (Electron) billing bridge.
  // Paddle's checkout iframe can't run inside the Electron shell, so on
  // desktop the buy/switch actions open the web IDE in the user's browser
  // (see `openBillingOnWeb`). `desktopBillingReturn` is set on the *web*
  // instance that was launched from desktop (carries `?desktop_billing=1`):
  // once its purchase succeeds we hand control back to the desktop app via the
  // remix://billing/complete protocol, mirroring the SSO login bridge.
  private desktopBillingReturn = false
  private desktopReturnFired = false
  // The billing section the desktop user was sent to buy from (set on the
  // *desktop* instance in `openBillingOnWeb`). Used when control returns so the
  // confirmation screen shows the right intent (subscription vs top-up).
  private desktopPendingBillingSection: 'plans' | 'topup' | null = null

  constructor() {
    super(profile)
    // Dev-only UI controls are hidden by default. Flip this to `true`
    // locally when you want scenario switchers + machine debug traces.
    this.debugUI = false
    this.store = new PlanManagerStore({ debug: this.debugUI, stateCards: this.debugUI })

    // Surface checkout results as a plugin event so external listeners
    // (e.g. analytics) can react without subscribing to the store.
    let lastResult: CheckoutResult | null = null
    this.store.subscribe(() => {
      const next = this.store.getSnapshot().checkoutResult
      if (next !== lastResult) {
        lastResult = next
        this.emit('checkoutResultChanged', next)
        // If this web instance was launched from Remix Desktop, hand the
        // successful purchase back to the desktop app (focus + refresh) the
        // same way SSO login hands tokens back via the remix:// protocol.
        if (next?.kind === 'success' && this.desktopBillingReturn) {
          this.returnToDesktopAfterBilling()
        }
      }
    })

    // Same for overlay open/closed.
    let wasOpen = false
    this.store.subscribe(() => {
      const open = this.store.getSnapshot().isOpen
      if (open !== wasOpen) {
        wasOpen = open
        this.emit(open ? 'opened' : 'closed')
        this.renderComponent()
      }
    })

    // Broadcast the unfinished-checkout list so surfaces outside this panel
    // (notably the top-bar cart button) can render the exact same state
    // without re-fetching. The machine already resets `resumeCheckouts` on
    // sign-out, so listeners stay in sync with auth for free.
    let lastResume: PendingCheckout[] = []
    this.store.subscribe(() => {
      const next = this.store.getSnapshot().resumeCheckouts
      if (next !== lastResume) {
        lastResume = next
        this.emit('pendingCheckoutsChanged', next)
      }
    })

    // When the user leaves an in-progress checkout (completed, closed or
    // cancelled — i.e. `pendingCheckout` goes from set → null), refresh the
    // account data and the unfinished-checkout list so credits/plan and the
    // resume surfaces reflect whatever just happened.
    let hadPending = false
    this.store.subscribe(() => {
      const pending = !!this.store.getSnapshot().pendingCheckout
      if (hadPending && !pending) {
        if (this.store.getSnapshot().isAuthenticated) {
          void this.loadAccountData()
          void this.loadPendingCheckouts()
        }
      }
      hadPending = pending
    })
  }

  async onActivation(): Promise<void> {
    this.renderComponent()

    // Detect whether this (web) instance was launched from Remix Desktop to
    // complete a purchase. Captured once here so a later URL rewrite can't
    // lose the marker before checkout finishes.
    this.desktopBillingReturn = this.readDesktopBillingMarker()

    // On desktop, listen for the web checkout completing so we can refresh
    // credits/plan once the user returns (the remix:// protocol already
    // brings the window forward).
    if (this.isDesktop()) {
      try {
        this.on('desktopBillingHandler' as any, 'onBillingComplete', () => {
          void this.handleDesktopBillingComplete()
        })
      } catch (err) {
        planManagerLogger.warn('[PlanManager] desktop billing bridge unavailable', err)
      }
    }

    // Catalog is public — load it eagerly so plan/package cards are ready
    // even before the user signs in.
    this.store.send({ type: 'CATALOG_LOAD' })
    void this.loadCatalog()

    // Init Paddle once (singleton). Token comes from the auth backend so
    // we never bake it into the build.
    void this.initPaddleSingleton()

    // Bridge Paddle checkout events directly into the machine. The
    // singleton fan-outs to all subscribers — we are now the sole
    // listener since the legacy BillingManager was removed.
    this.paddleEventHandler = (event: PaddleEventData) => this.handlePaddleEvent(event)
    onPaddleEvent(this.paddleEventHandler)

    // Sync app theme so the Paddle checkout iframe matches the IDE.
    try {
      const theme = await this.call('theme', 'currentTheme').catch(() => null) as { quality: 'dark' | 'light' } | null
      if (theme?.quality) this.paddleTheme = theme.quality
      this.on('theme', 'themeChanged', (t: { quality: 'dark' | 'light' }) => {
        if (t?.quality === 'dark' || t?.quality === 'light') this.paddleTheme = t.quality
      })
    } catch { /* theme plugin unavailable */ }

    // Bridge auth events. Re-fired on token refresh so we tolerate noise.
    const onAuthChange = (s: { isAuthenticated: boolean; token?: string; user?: { id?: number } }) => {
      const sig = `${s.isAuthenticated}|${s.token ?? ''}`
      if (sig === this.lastAuthSig) return
      this.lastAuthSig = sig
      // Attach the JWT to checkout telemetry so the admin viewer can attribute
      // failures to a user (the sink is optionalAuth — works without it too).
      setCheckoutTelemetryToken(s.isAuthenticated ? (s.token ?? null) : null)
      this.store.send({
        type: 'AUTH_CHANGED',
        isAuthenticated: !!s.isAuthenticated,
        token: s.token ?? null,
        userId: s.user?.id ?? null
      })
      if (s.isAuthenticated) {
        void this.initPaddleSingleton()
        // Auth is the driving motor: every login must (re)load the catalog of
        // available products, exactly like permissions/balance. The eager load
        // in onActivation runs while still anonymous and 401s, so without this
        // the panel can open (e.g. via a sign-in CTA) with no plans/packages.
        this.store.send({ type: 'CATALOG_LOAD' })
        void this.loadCatalog()
        void this.loadAccountData()
        // Out-of-band from account data (brief: never fold into /permissions).
        void this.loadPendingCheckouts()
      }
    }
    try {
      this.on('auth', 'authStateChanged', onAuthChange as any)
      // A silent token refresh emits `tokenRefreshed` (NOT authStateChanged, so
      // consumers don't re-init). Keep the telemetry bearer token in sync here
      // too, otherwise it goes stale after the first refresh and the admin
      // viewer can't attribute later checkout events to the user.
      this.on('auth', 'tokenRefreshed', (p: { token?: string }) => {
        if (p?.token) setCheckoutTelemetryToken(p.token)
      })
      this.on('auth', 'creditsUpdated', () => { void this.loadAccountData() })
      // Initial sync — auth might already be settled by the time we activate.
      const user = await this.call('auth', 'getUser').catch(() => null)
      if (user) {
        const token = await this.call('auth', 'getToken').catch(() => null)
        onAuthChange({ isAuthenticated: true, token, user })
      } else {
        this.store.send({ type: 'AUTH_CHANGED', isAuthenticated: false })
      }
    } catch (err) {
      planManagerLogger.warn('[PlanManager] auth bridge failed', err)
    }

    try {
      if (!this.store.getSnapshot().isAuthenticated && Math.random() < 0.60) {
        this.call('nudgePlugin', 'fire', 'app:time-to-promote-plans')
      }
    } catch (err) {
      planManagerLogger.warn('[PlanManager] nudge failed', err)
    }
  }

  onDeactivation(): void {
    this.clearCheckoutLoadWatchdog()
    if (this.paddleEventHandler) {
      offPaddleEvent(this.paddleEventHandler)
      this.paddleEventHandler = null
    }
  }

  /**
   * Public API — called by the menu icon, by feature-badges.tsx, and by
   * other plugins (notably `assistantState`) routing a gate to the right
   * screen. Pass an `intent` to pre-select a section and/or surface the
   * feature key that triggered the open.
   */
  async open(intent?: OpenIntent | string): Promise<void> {
    // Support string shortcut from nudge targets: 'topup' → { initialSection: 'topup' }
    const resolved: OpenIntent | undefined = typeof intent === 'string'
      ? { initialSection: intent as OpenIntent['initialSection'] }
      : intent
    const snapBefore = this.store.getSnapshot()
    planManagerLogger.log('[PlanManager:open] called', {
      rawIntent: intent,
      resolvedIntent: resolved,
      wasOpen: snapBefore.isOpen,
      isAuthenticated: snapBefore.isAuthenticated,
      dataState: snapBefore.dataState,
      catalogPlans: snapBefore.catalogPlans?.length ?? 0,
      hasPermissions: !!snapBefore.permissions
    })
    this.store.send({ type: 'OPEN_OVERLAY', intent: resolved })
    // Refresh on every open — catalog (plans/packages) and, when signed
    // in, account-scoped data (credits/quotas, subscription, permissions).
    // This keeps the panel consistent with the API instead of relying on
    // whatever was loaded at login.
    this.refreshOnOpen()
    try {
      // If the side panel is collapsed (d-none), un-hide it first.
      // showContent alone doesn't remove d-none when isHidden===true &&
      // the saved panelState also has isHidden===true — the sidePanel handler
      // deliberately keeps it hidden in that code path.
      const panelHidden = await this.call('sidePanel' as any, 'isPanelHidden').catch(() => false)
      if (panelHidden) {
        await this.call('sidePanel' as any, 'togglePanel').catch(() => {})
      }
      await this.call('sidePanel' as any, 'showContent', 'planManager').catch(() => {})
    } catch { /* noop */ }
    try {
      await this.call('menuicons', 'select', 'planManager')
    } catch { /* noop */ }
  }

  close(): void {
    // If Paddle checkout is in-progress, clear it before closing — otherwise
    // re-opening the panel shows an empty checkout frame with no iframe.
    // Also clear any pending cart so the upsell step doesn't linger on re-open.
    const snap = this.store.getSnapshot()
    if (snap.pendingCheckout && !snap.checkoutResult) {
      this.cancelCheckout('panel_closed')
    }
    if (snap.cartItems.length > 0 && !snap.checkoutResult) {
      this.store.send({ type: 'CART_CLEAR' })
    }
    this.store.send({ type: 'CLOSE_OVERLAY' })
  }

  cancelCheckout(reason: string = 'user_cancelled'): void {
    // The user is walking away from this checkout — stop the load watchdog so
    // a dismissal isn't misreported as a silent render failure.
    this.clearCheckoutLoadWatchdog()
    const pending = this.store.getSnapshot().pendingCheckout
    if (pending) {
      this.trackCheckout('closed', pending.intent, reason)
      // Our own signal: the user dismissed the Remix modal that hosts the
      // Paddle frame (X / backdrop / Escape / panel close). Paddle's own
      // `checkout.closed` often does NOT fire here because we tear the frame
      // container down ourselves — so this is a distinct abandonment signal.
      reportCheckoutTelemetry('checkout.abandoned', {
        transactionId: (pending as any)?.transactionId,
        message: `Remix checkout modal closed (${reason})`,
        detail: { reason, intent: pending.intent, itemLabel: (pending as any)?.itemLabel },
      })
    }
    this.store.send({ type: 'CHECKOUT_CLOSED' })
  }

  toggle(): void {
    const wasOpen = this.store.getSnapshot().isOpen
    this.store.send({ type: 'TOGGLE_OVERLAY' })
    // Only refresh on the closed → open transition.
    if (!wasOpen) this.refreshOnOpen()
  }

  /**
   * Re-fetch catalog + account data when the panel opens. Catalog is
   * always re-fetched (public endpoint); account data only if signed in.
   * Errors are swallowed by the underlying loaders, which dispatch
   * CATALOG_FAILED / DATA_FAILED into the machine.
   */
  private refreshOnOpen(): void {
    const result = this.store.getSnapshot().checkoutResult
    if (result && (result.kind === 'closed' || result.kind === 'error')) {
      this.store.send({ type: 'CHECKOUT_RESULT_DISMISS' })
    }
    this.store.send({ type: 'CATALOG_LOAD' })
    void this.loadCatalog()
    const snap = this.store.getSnapshot()
    if (snap.isAuthenticated) {
      this.store.send({ type: 'REFRESH' })
      void this.loadAccountData()
      // Refresh the resume list on open (sparingly — brief says route
      // change / manual, not a tight interval).
      void this.loadPendingCheckouts()
    }
  }

  /**
   * Set or clear the checkout result screen. Auto-opens the panel when
   * a result is supplied so the user always sees the outcome.
   *
   * Today this maps onto the machine's CHECKOUT_* events for backwards
   * compatibility with billing-manager.tsx — once that file is updated to
   * emit CHECKOUT_* directly, this method becomes redundant.
   */
  setCheckoutResult(result: CheckoutResult | null): void {
    if (!result) {
      this.store.send({ type: 'CHECKOUT_RESULT_DISMISS' })
      return
    }
    // We weren't told the intent up-front, so capture it now from the result.
    this.store.send({
      type: 'CHECKOUT_INTENT',
      intent: result.intent,
      itemLabel: result.itemLabel
    })
    switch (result.kind) {
    case 'processing':
    case 'success':
      this.store.send({ type: 'CHECKOUT_COMPLETED', transactionId: result.transactionId })
      // Refresh ending with PURCHASE_CONFIRMED so 'processing' promotes to
      // 'success'. A bare loadAccountData() emits DATA_LOADED, which does NOT
      // promote while the data region is already in the 'ready' state.
      void this.completePurchaseRefresh()
      break
    case 'closed':
      this.trackCheckout('closed', result.intent, 'result_dismissed')
      this.store.send({ type: 'CHECKOUT_CLOSED' })
      break
    case 'error':
      this.store.send({
        type: 'CHECKOUT_ERROR',
        message: result.errorMessage,
        transactionId: result.transactionId,
        meta: result.meta
      })
      break
    }
  }

  /**
   * Called by other plugins (e.g. AI chat) when an upstream API call
   * returned "insufficient credits" / 402. The machine refreshes its
   * data and reveals the panel — the API stays the source of truth.
   */
  reportCreditsExhausted(): void {
    this.store.send({ type: 'CREDITS_EXHAUSTED' })
    void this.loadAccountData()
  }

  /** Manual refresh — called from the error state's retry button. */
  async refresh(): Promise<void> {
    this.store.send({ type: 'REFRESH' })
    await this.loadAccountData()
  }

  /**
   * Purchase a credit top-up package. Drives the entire flow:
   *   1. Capture intent in the machine (CHECKOUT_INTENT) — disables the card.
   *   2. Make sure the user is signed in (Paddle needs customData=userId).
   *   3. POST /billing/purchase-credits → backend returns Paddle transactionId.
   *   4. Open Paddle overlay (or fall back to the hosted checkout URL).
   * Paddle's events feed back through the singleton listener installed in
   * `onActivation`, which dispatches CHECKOUT_COMPLETED / CLOSED / ERROR.
   */
  async purchaseCredits(packageId: string, priceId?: number): Promise<void> {
    // Paddle checkout can't run inside the Electron shell — hand the user off
    // to the web IDE's top-up screen in their browser instead.
    if (this.isDesktop()) {
      this.trackCheckout('desktop_handoff', 'topup', packageId)
      this.openBillingOnWeb('topup')
      return
    }
    const snap = this.store.getSnapshot()
    const pkg = snap.catalogPackages.find(p => p.id === packageId)
    const itemLabel = pkg ? `${pkg.credits.toLocaleString()} credits${pkg.name ? ` (${pkg.name})` : ''}` : packageId
    this.trackCheckout('intent', 'topup', itemLabel)
    this.store.send({ type: 'CHECKOUT_INTENT', intent: 'topup', itemLabel, productId: packageId })
    // Credit-package purchases stay on the legacy /billing/purchase-credits
    // endpoint for now (it already produces a Paddle transaction); the
    // optional `priceId` is forwarded for multi-price packages once the
    // backend method gains the parameter. Suppress unused-warning via void.
    void priceId
    await this.runCheckout('topup', itemLabel, async (api) => api.purchaseCredits(packageId, 'paddle'))
  }

  /**
   * Subscribe to a plan via the unified POST /products/purchase endpoint.
   * Three response shapes are possible:
   *   1. Paid plan, no existing sub → { checkoutUrl, transactionId } → open Paddle.
   *   2. Free plan → { ok: true, immediate: true, ... } → grant is instant; refresh data.
   *   3. User already has a paid sub → 409 ALREADY_SUBSCRIBED → must use PATCH flow.
   */
  async subscribeToPlan(planId: string, priceId?: number): Promise<void> {
    const snap = this.store.getSnapshot()
    const plan = snap.catalogPlans.find(p => p.id === planId)
    const itemLabel = plan?.name ?? planId

    // Resolve the price the user is paying for. If the caller didn't pass
    // one, fall back to the plan's default price — keeps single-cadence
    // plans (and older call sites) working unchanged.
    const resolvedPriceId = (typeof priceId === 'number' && Number.isFinite(priceId))
      ? priceId
      : (plan?.prices?.find((pr: any) => pr.is_default)?.id
        ?? plan?.prices?.[0]?.id
        ?? undefined)

    // Pre-flight: if the user already has an active paid subscription and is
    // picking a *different* paid plan, route to the change-plan flow upfront
    // (the doc explicitly recommends not relying on the 409 fallback).
    // The free plan does NOT count as an "active subscription" for this
    // guard — free → paid still goes through purchase.
    const planState = selectPlanState(snap)
    const targetIsFree = (plan?.priceUsd ?? 0) === 0

    // On desktop, any paid plan (new subscription or switch) needs Paddle,
    // which we can't open in the Electron shell — hand off to the web IDE's
    // plans screen. The free plan is granted server-side with no Paddle
    // hand-off, so it stays in-app.
    if (this.isDesktop() && !targetIsFree) {
      this.trackCheckout('desktop_handoff', 'plans', planId)
      this.openBillingOnWeb('plans')
      return
    }

    if (planState.kind === 'paid' && !targetIsFree && planState.planId !== planId) {
      await this.changePlan(planId, resolvedPriceId)
      return
    }

    // Free plan → straight to checkout (no upsell opportunity).
    if (targetIsFree) {
      this.trackCheckout('intent', 'free', itemLabel)
      this.store.send({ type: 'CHECKOUT_INTENT', intent: 'subscription', itemLabel, productId: planId })
      await this.runCheckout('subscription', itemLabel, async () => {
        const productsApi: any = await this.call('auth', 'getProductsApi').catch(() => null)
        if (!productsApi) return { ok: false, error: 'Products API unavailable' }
        const req: any = { slug: planId, provider: 'paddle' }
        if (typeof resolvedPriceId === 'number') req.price_id = resolvedPriceId
        const resp = await productsApi.purchaseProduct(req)
        if (!resp?.ok) return { ok: false, error: resp?.error || 'Could not start purchase.' }
        const data: any = resp.data
        if (data?.immediate === true) {
          return { ok: true, data: { immediate: true, message: data.message } as any }
        }
        return { ok: true, data: { transactionId: data?.transactionId, checkoutUrl: data?.checkoutUrl } }
      })
      return
    }

    // Paid plan → seed the cart with this plan and show the upsell step.
    // The user can then add credit packages before proceeding to checkout.
    this.trackCheckout('cart_add', 'subscription', itemLabel)
    this.store.send({ type: 'CART_CLEAR' })
    this.store.send({
      type: 'CART_ADD',
      item: {
        slug: planId,
        name: itemLabel,
        productType: 'subscription_plan',
        priceCents: plan?.priceUsd ?? 0,
        priceId: resolvedPriceId,
        billingInterval: plan?.billingInterval ?? 'month'
      }
    })
  }

  /**
   * Multi-item checkout — bundles a subscription plan + optional credit
   * packages into a single Paddle transaction via POST /products/checkout.
   * The cart is built up by the upsell UI; this fires when the user hits
   * "Proceed to checkout" from the cart step.
   */
  async checkoutCart(): Promise<void> {
    const snap = this.store.getSnapshot()
    const cart = snap.cartItems
    if (cart.length === 0) return

    // Safety net — paid carts always end in a Paddle transaction, which can't
    // open in Electron. Send desktop users to the web plans screen instead.
    if (this.isDesktop()) {
      this.trackCheckout('desktop_handoff', 'plans')
      this.openBillingOnWeb('plans')
      return
    }

    // Build a label from all items for the pending-checkout indicator.
    const planItem = cart.find(i => i.productType === 'subscription_plan')
    const addOnCount = cart.length - 1
    const itemLabel = planItem
      ? (addOnCount > 0
        ? `${planItem.name} + ${addOnCount} add-on${addOnCount !== 1 ? 's' : ''}`
        : planItem.name)
      : cart.map(i => i.name).join(' + ')
    const productId = planItem?.slug ?? cart[0].slug

    this.trackCheckout('intent', 'subscription', `${itemLabel} (${cart.length} item${cart.length !== 1 ? 's' : ''})`)
    this.store.send({ type: 'CHECKOUT_INTENT', intent: 'subscription', itemLabel, productId })

    await this.runCheckout('subscription', itemLabel, async () => {
      const productsApi: any = await this.call('auth', 'getProductsApi').catch(() => null)
      if (!productsApi) return { ok: false, error: 'Products API unavailable' }

      const items = cart.map(item => {
        const entry: { slug: string; price_id?: number } = { slug: item.slug }
        if (typeof item.priceId === 'number') entry.price_id = item.priceId
        return entry
      })

      const resp = await productsApi.checkoutProducts({
        items,
        provider: 'paddle'
      })

      if (!resp?.ok) {
        const err = (resp?.data as any)?.error || resp?.error
        if (err === 'ALREADY_SUBSCRIBED') {
          // Fall back to single-plan change flow for the subscription item.
          this.trackCheckout('error', 'subscription', 'ALREADY_SUBSCRIBED')
          if (planItem) void this.changePlan(planItem.slug, planItem.priceId)
          return { ok: false, error: 'You already have an active subscription. Switching to change-plan flow…' }
        }
        return { ok: false, error: resp?.error || 'Could not start checkout.' }
      }

      const data: any = resp.data
      return { ok: true, data: { transactionId: data?.transactionId, checkoutUrl: data?.checkoutUrl } }
    })
  }

  /**
   * Resolve a cart line to its Paddle external price id (`pri_...`).
   * Looks the product up in the catalog, matches the chosen internal price
   * (or the default), then reads the Paddle provider linkage. Falls back to
   * the product's top-level provider price id. Returns `null` when nothing
   * maps — callers should skip the preview rather than show a partial total.
   */
  private resolvePaddlePriceId(item: CartItem): string | null {
    const snap = this.store.getSnapshot()
    const catalog: any[] = item.productType === 'subscription_plan'
      ? snap.catalogPlans
      : snap.catalogPackages
    const product: any = catalog.find((p: any) => p.id === item.slug)
    if (!product) return null
    const prices: any[] = Array.isArray(product.prices) ? product.prices : []
    const price = (typeof item.priceId === 'number'
      ? prices.find((pr: any) => pr.id === item.priceId)
      : null)
      ?? prices.find((pr: any) => pr.is_default)
      ?? prices[0]
      ?? null
    const fromPrice = price?.providers?.find((pr: any) => pr.slug === 'paddle')?.external_price_id
    if (fromPrice) return fromPrice
    // Top-level providers are stored in mapped form (`priceId` is external).
    const fromTop = product.providers?.find((pr: any) => pr.slug === 'paddle')?.priceId
    return fromTop ?? null
  }

  /**
   * Preview the cart's localized, discounted totals via Paddle PricePreview.
   *
   * Resolves every cart line to its Paddle price id and forwards the
   * subscription's intro-discount id (if any). Paddle localizes to the
   * visitor's region (auto IP geo-location) and applies the discount's own
   * `restrictTo` — so this transparently handles the discount living on the
   * subscription only OR the whole cart. Returns `null` when Paddle is
   * unavailable or the cart can't be fully mapped, letting the UI fall back
   * to the static USD estimate.
   */
  async previewCartPrices(cart?: CartItem[]): Promise<CartPricePreview | null> {
    const snap = this.store.getSnapshot()
    const items = cart ?? snap.cartItems
    if (!items || items.length === 0) return null

    const resolved = items.map(item => ({ item, paddlePriceId: this.resolvePaddlePriceId(item) }))
    if (resolved.some(r => !r.paddlePriceId)) {
      planManagerLogger.log('[PlanManager] previewCartPrices: missing Paddle price id for a cart item — skipping preview')
      return null
    }

    // The intro discount is attached to the subscription plan. We pass its
    // Paddle id and let Paddle decide which line items it applies to.
    const planItem = items.find(i => i.productType === 'subscription_plan')
    const planObj: any = planItem ? snap.catalogPlans.find((p: any) => p.id === planItem.slug) : null
    const introDiscount: any = (planObj?.introDiscounts ?? [])[0] ?? null
    const discountId: string | undefined = introDiscount?.paddleDiscountId ?? undefined

    if (!this.paddle && !getPaddle()) {
      await this.initPaddleSingleton()
    }
    const paddle = this.paddle ?? getPaddle()
    if (!paddle) {
      planManagerLogger.log('[PlanManager] previewCartPrices: Paddle not available')
      return null
    }

    try {
      const result: any = await previewPrices(paddle, {
        items: resolved.map(r => ({ priceId: r.paddlePriceId as string, quantity: 1 })),
        discountId
      })
      return normalizePricePreview(result, resolved)
    } catch (err) {
      planManagerLogger.warn('[PlanManager] previewCartPrices failed', err)
      return null
    }
  }

  /**
   * Preview localized list prices for a set of products (no discount).
   * Used to render the upsell grid's per-package prices in the visitor's
   * currency. Returns a `slug → localized price` map (pre-tax subtotal),
   * or `null` when Paddle is unavailable / nothing maps.
   */
  async previewProductPrices(
    items: Array<{ slug: string; productType: CartItem['productType']; priceId?: number }>
  ): Promise<Record<string, string> | null> {
    if (!items || items.length === 0) return null
    const resolved = items
      .map(it => ({ slug: it.slug, paddlePriceId: this.resolvePaddlePriceId(it as CartItem) }))
      .filter((r): r is { slug: string; paddlePriceId: string } => !!r.paddlePriceId)
    if (resolved.length === 0) return null

    if (!this.paddle && !getPaddle()) {
      await this.initPaddleSingleton()
    }
    const paddle = this.paddle ?? getPaddle()
    if (!paddle) return null

    try {
      const result: any = await previewPrices(paddle, {
        items: resolved.map(r => ({ priceId: r.paddlePriceId, quantity: 1 }))
      })
      const byPriceId = new Map<string, string>()
      resolved.forEach(r => byPriceId.set(r.paddlePriceId, r.slug))
      const out: Record<string, string> = {}
      const currencyCode: string = result?.data?.currencyCode ?? 'USD'
      const lineItems: any[] = result?.data?.details?.lineItems ?? []
      lineItems.forEach((li: any) => {
        const pid = li?.price?.id
        const slug = pid ? byPriceId.get(pid) : undefined
        // Format with Intl (not Paddle's `formattedTotals`) for consistency
        // across the UI and to avoid Paddle's locale-ambiguous strings
        // (e.g. CLP renders as "$18.393" which reads like ~18 dollars).
        if (slug) out[slug] = formatPaddleMinor(Number(li?.totals?.subtotal ?? 0) || 0, currencyCode)
      })
      return out
    } catch (err) {
      planManagerLogger.warn('[PlanManager] previewProductPrices failed', err)
      return null
    }
  }

  /**
   * Preview localized list prices for the WHOLE catalog in one batched
   * Paddle PricePreview call. Collects every Paddle price id across all plan
   * cadences (month/year) + credit packages and returns a
   * `paddlePriceId → { rawMinor, currencyCode, formatted }` map so the plan
   * cards and top-up grid can render the visitor's local currency.
   *
   * No discount is forwarded — the overview shows several plans each with
   * their own intro discount, so the cards apply the (percentage) discount
   * client-side off the localized base. Returns `null` when Paddle is
   * unavailable / nothing maps, letting the UI fall back to static USD.
   */
  async previewCatalogPrices(): Promise<CatalogPricePreview | null> {
    const snap = this.store.getSnapshot()
    const products: any[] = [...(snap.catalogPlans ?? []), ...(snap.catalogPackages ?? [])]

    const priceIds = new Set<string>()
    products.forEach((product: any) => {
      const prices: any[] = Array.isArray(product?.prices) ? product.prices : []
      let matched = false
      prices.forEach((pr: any) => {
        const pid = pr?.providers?.find((p: any) => p.slug === 'paddle')?.external_price_id
        if (pid) { priceIds.add(pid); matched = true }
      })
      if (!matched) {
        // Products without per-price providers expose the (mapped) external id at top level.
        const top = product?.providers?.find((p: any) => p.slug === 'paddle')?.priceId
        if (top) priceIds.add(top)
      }
    })
    if (priceIds.size === 0) return null

    if (!this.paddle && !getPaddle()) {
      await this.initPaddleSingleton()
    }
    const paddle = this.paddle ?? getPaddle()
    if (!paddle) {
      planManagerLogger.log('[PlanManager] previewCatalogPrices: Paddle not available')
      return null
    }

    try {
      const result: any = await previewPrices(paddle, {
        items: Array.from(priceIds).map(priceId => ({ priceId, quantity: 1 }))
      })
      const currencyCode: string = result?.data?.currencyCode ?? 'USD'
      const byPaddlePriceId: Record<string, LocalizedCatalogPrice> = {}
      const lineItems: any[] = result?.data?.details?.lineItems ?? []
      // Diagnostics: surface exactly what Paddle returns for this region so we
      // can compare Paddle's own `formattedTotals` (locale-aware on their side)
      // against our `Intl.NumberFormat` output. They diverge for currencies
      // that share the `$` glyph (e.g. CAD → Paddle "$" vs Intl "CA$").
      // Enable with: localStorage.setItem('plan-manager-debug','1') then reload.
      planManagerLogger.log('[PlanManager:price] previewCatalogPrices result', {
        currencyCode,
        countryCode: result?.data?.address?.countryCode ?? result?.data?.customerIpAddress ?? '(auto-geo)',
        lineItems: lineItems.map((li: any) => {
          const rawMinor = Number(li?.totals?.subtotal ?? 0) || 0
          return {
            priceId: li?.price?.id,
            productName: li?.product?.name,
            rawMinorSubtotal: rawMinor,
            paddleFormatted: li?.formattedTotals?.subtotal,
            intlFormatted: formatPaddleMinor(rawMinor, currencyCode)
          }
        }),
        rawData: result?.data
      })
      lineItems.forEach((li: any) => {
        const pid = li?.price?.id
        if (!pid) return
        const rawMinor = Number(li?.totals?.subtotal ?? 0) || 0
        byPaddlePriceId[pid] = {
          paddlePriceId: pid,
          rawMinor,
          currencyCode,
          // Always format with Intl for consistency (struck base, computed
          // discount, and the checkout breakdown all use formatPaddleMinor).
          // Paddle's own `formattedTotals` is locale-ambiguous for currencies
          // that share the `$` glyph (CAD "$28.34" vs Intl "CA$28.34") or use
          // `.` as a thousands separator (CLP "$18.393" == 18,393 CLP).
          formatted: formatPaddleMinor(rawMinor, currencyCode)
        }
      })
      return { currencyCode, byPaddlePriceId }
    } catch (err) {
      planManagerLogger.warn('[PlanManager] previewCatalogPrices failed', err)
      return null
    }
  }

  /**
   * Change the active paid subscription to a different paid plan.
   * Flow: POST /billing/subscription/preview-change → in-panel confirm with
   * proration totals → PATCH /billing/subscription → refresh account data.
   * Proration is always immediate; on payment failure the change is rejected.
   * Not for switching to free — use cancelSubscription() instead.
   */
  async changePlan(planId: string, priceId?: number): Promise<void> {
    // Plan switches are charged through Paddle (proration), which can't open
    // in the Electron shell — redirect to the web plans screen.
    if (this.isDesktop()) {
      this.trackCheckout('desktop_handoff', 'change_plan', planId)
      this.openBillingOnWeb('plans')
      return
    }
    const snap = this.store.getSnapshot()
    const plan = snap.catalogPlans.find(p => p.id === planId)
    const itemLabel = plan?.name ?? planId
    this.trackCheckout('change_plan', itemLabel, planId)
    const PRORATION = 'prorated_immediately' as const
    const ON_FAILURE = 'prevent_change' as const

    // Resolve internal → external price id for the change endpoints, which
    // take Paddle's external `pri_...` directly (not the unified `price_id`).
    const resolvedPrice = (typeof priceId === 'number' && Number.isFinite(priceId))
      ? plan?.prices?.find((pr: any) => pr.id === priceId)
      : (plan?.prices?.find((pr: any) => pr.is_default) || plan?.prices?.[0])
    const externalPriceId: string | undefined = resolvedPrice?.providers?.find((pr: any) => pr.slug === 'paddle')?.external_price_id ?? undefined

    if (!this.store.getSnapshot().isAuthenticated) {
      try { await this.call('auth', 'login', 'github') } catch { /* user closed */ }
      return
    }

    this.store.send({ type: 'CHECKOUT_INTENT', intent: 'subscription', itemLabel, productId: planId })
    try {
      const billingApi: any = await this.call('auth', 'getBillingApi').catch(() => null)
      if (!billingApi) {
        this.store.send({ type: 'CHECKOUT_ERROR', message: 'Billing service is not available right now.' })
        return
      }

      // 1. Preview proration. This is authoritative: the backend can refuse
      //    a plan change before we ever show a confirm dialog (for example,
      //    downgrades that must wait until the current period ends).
      let confirmMessage = `Switch your subscription to ${itemLabel}?`
      let chargeCentsNum: number | null = null
      let creditCentsNum: number | null = null
      let switchCurrency = 'USD'
      try {
        const previewReq: any = { planSlug: planId, prorationBillingMode: PRORATION }
        if (externalPriceId) previewReq.priceId = externalPriceId
        const preview = await billingApi.previewSubscriptionChange(previewReq)
        if (!preview?.ok) {
          const failure = this.formatApiFailure(preview, `Could not preview the switch to ${itemLabel}.`, 'plan-change-preview')
          this.store.send({ type: 'CHECKOUT_ERROR', message: failure.message, meta: failure.meta })
          return
        }
        if (preview?.ok && preview.data?.preview) {
          const totals = (preview.data.preview as any)?.update_summary || (preview.data.preview as any)?.totals || {}
          const charge = totals?.result?.amount ?? totals?.charge?.amount ?? totals?.total ?? null
          const credit = totals?.credit?.amount ?? null
          const currency = (preview.data.preview as any)?.currency_code || 'USD'
          switchCurrency = currency
          if (charge != null && Number(charge) > 0) {
            chargeCentsNum = Number(charge)
            confirmMessage = `Switch to ${itemLabel}? You'll be charged ${formatMoney(charge, currency)} now (prorated).`
          } else if (credit != null && Number(credit) > 0) {
            creditCentsNum = Number(credit)
            confirmMessage = `Switch to ${itemLabel}? You'll receive a ${formatMoney(credit, currency)} credit on your next invoice.`
          }
        }
      } catch (err: any) {
        this.store.send({
          type: 'CHECKOUT_ERROR',
          message: err?.message || `Could not preview the switch to ${itemLabel}.`,
          meta: { flow: 'plan-change-preview' }
        })
        return
      }

      const choice = await this.requestConfirm({
        title: `Switch to ${itemLabel}`,
        message: confirmMessage,
        eyebrow: 'Plan switch',
        icon: 'fas fa-arrow-right-arrow-left',
        highlights: this.buildSwitchHighlights({
          fromPlanName: selectPlanState(snap).planName,
          toPlanName: itemLabel,
          toPlanCents: typeof plan?.priceUsd === 'number' ? plan.priceUsd : null,
          chargeCents: chargeCentsNum,
          creditCents: creditCentsNum,
          currency: switchCurrency
        }),
        actions: [
          { value: 'confirm', label: `Switch to ${itemLabel}`, variant: 'primary', icon: 'fas fa-arrow-right' },
          { value: 'cancel', label: 'Keep current plan', variant: 'ghost' }
        ]
      })
      if (choice !== 'confirm') {
        this.cancelCheckout('change_plan_declined')
        return
      }

      // 2. Commit.
      const changeReq: any = { planSlug: planId, prorationBillingMode: PRORATION, onPaymentFailure: ON_FAILURE }
      if (externalPriceId) changeReq.priceId = externalPriceId
      const resp = await billingApi.changeSubscription(changeReq)
      if (!resp?.ok) {
        const failure = this.formatApiFailure(resp, 'Could not change plan.', 'plan-change-commit')
        this.store.send({ type: 'CHECKOUT_ERROR', message: failure.message, meta: failure.meta })
        return
      }

      // 3. PATCH response already reflects new state — mark complete and refresh.
      this.store.send({ type: 'CHECKOUT_COMPLETED' })
      // Use completePurchaseRefresh so it ends with PURCHASE_CONFIRMED, which
      // promotes the result 'processing' → 'success'. A bare loadAccountData()
      // only emits DATA_LOADED, which does NOT promote while the data region is
      // already in the 'ready' state.
      setTimeout(() => { void this.completePurchaseRefresh() }, 250)
    } catch (err: any) {
      planManagerLogger.error('[PlanManager] Plan change failed', err)
      this.store.send({ type: 'CHECKOUT_ERROR', message: err?.message || 'Unexpected error during plan change.' })
    }
  }

  /**
   * Cancel the active paid subscription. The user picks the effective time
   * from the in-panel modal; "keep" dismisses without action.
   * 'next_billing_period' keeps access until period end then auto-rolls to free.
   * 'immediately' cancels now — backend webhook auto-grants the free plan as fallback.
   */
  async cancelSubscription(effectiveFrom?: 'next_billing_period' | 'immediately'): Promise<void> {
    const snap = this.store.getSnapshot()
    if (!snap.isAuthenticated) return
    const planState = selectPlanState(snap)
    if (planState.kind !== 'paid') return

    const periodEndDate = planState.expiresOn ? formatDate(planState.expiresOn) : null

    // If the caller didn't pre-select an option, ask the user.
    let chosen: 'next_billing_period' | 'immediately' | null = effectiveFrom ?? null
    if (!chosen) {
      const periodEndLabel = periodEndDate
        ? `Cancel at period end (keeps access until ${periodEndDate})`
        : 'Cancel at period end'
      const choice = await this.requestConfirm({
        title: `Cancel ${planState.planName}?`,
        message: 'After cancellation you\u2019ll keep the Free plan automatically \u2014 no action needed on your part.',
        variant: 'danger',
        eyebrow: 'Cancel subscription',
        icon: 'fas fa-circle-xmark',
        highlights: [
          { label: 'Current plan', value: planState.planName, tone: 'default' },
          ...(periodEndDate ? [{ label: 'Access until', value: periodEndDate, tone: 'positive' as const }] : []),
          { label: 'After cancellation', value: 'Free plan', tone: 'muted' as const }
        ],
        actions: [
          { value: 'next_billing_period', label: periodEndLabel, variant: 'primary', icon: 'fas fa-calendar-check' },
          // { value: 'immediately', label: 'Cancel immediately', variant: 'danger', icon: 'fas fa-bolt' },
          { value: 'keep', label: 'Keep subscription', variant: 'ghost' }
        ]
      })
      if (choice !== 'immediately' && choice !== 'next_billing_period') return
      chosen = choice
    }

    // flips the plan card to "Free" in real time.
    const planName = planState.planName
    this.trackCheckout('cancel', planName, chosen)
    this.store.send({ type: 'CHECKOUT_INTENT', intent: 'cancel', itemLabel: planName, productId: planState.planId ?? planName })

    try {
      const billingApi: any = await this.call('auth', 'getBillingApi').catch(() => null)
      if (!billingApi) {
        this.store.send({ type: 'CHECKOUT_ERROR', message: 'Billing service is not available right now.' })
        return
      }
      const resp = await billingApi.cancelSubscription({ effectiveFrom: chosen })
      if (!resp?.ok) {
        this.store.send({ type: 'CHECKOUT_ERROR', message: resp?.error || 'Could not cancel your subscription.' })
        return
      }
      // Success — surface the per-flow context to the result screen.
      const meta: Record<string, string> = { effectiveFrom: chosen }
      if (chosen === 'next_billing_period' && periodEndDate) meta.accessUntil = periodEndDate
      this.store.send({ type: 'CHECKOUT_COMPLETED', meta })
      // Refresh — immediate cancel triggers webhook to grant free; period-end
      // cancel just sets cancelAtPeriodEnd, which the next refresh will pick up.
      // Use completePurchaseRefresh so it ends with PURCHASE_CONFIRMED, which
      // promotes the result 'processing' → 'success'. A bare loadAccountData()
      // only emits DATA_LOADED, which does NOT promote while the data region is
      // already in the 'ready' state, leaving the UI stuck on "waiting for
      // confirmation".
      setTimeout(() => { void this.completePurchaseRefresh() }, 250)
    } catch (err: any) {
      planManagerLogger.error('[PlanManager] Cancel subscription failed', err)
      this.store.send({ type: 'CHECKOUT_ERROR', message: err?.message || 'Unexpected error during cancellation.' })
    }
  }

  /**
   * Reactivate (un-cancel) a subscription that is scheduled to cancel at period
   * end. Removes the pending scheduled cancellation so the sub renews as normal.
   * No-op when the user has no paid subscription with a pending cancellation.
   */
  async reactivateSubscription(): Promise<void> {
    const snap = this.store.getSnapshot()
    if (!snap.isAuthenticated) return
    const planState = selectPlanState(snap)
    if (planState.kind !== 'paid' || !planState.isCancelled) return

    const planName = planState.planName
    this.trackCheckout('reactivate', planName, planState.planId ?? planName)
    this.store.send({ type: 'CHECKOUT_INTENT', intent: 'reactivate', itemLabel: planName, productId: planState.planId ?? planName })

    try {
      const billingApi: any = await this.call('auth', 'getBillingApi').catch(() => null)
      if (!billingApi) {
        this.trackCheckout('error', 'reactivate', 'billing_unavailable')
        this.store.send({ type: 'CHECKOUT_ERROR', message: 'Billing service is not available right now.' })
        return
      }
      const resp = await billingApi.reactivateSubscription()
      if (!resp?.ok) {
        this.trackCheckout('error', 'reactivate', resp?.error || 'reactivate_failed')
        this.store.send({ type: 'CHECKOUT_ERROR', message: resp?.error || 'Could not reactivate your subscription.' })
        return
      }
      this.store.send({ type: 'CHECKOUT_COMPLETED' })
      // End with completePurchaseRefresh so it emits PURCHASE_CONFIRMED, which
      // promotes the result 'processing' → 'success' and refreshes permissions.
      setTimeout(() => { void this.completePurchaseRefresh() }, 250)
    } catch (err: any) {
      planManagerLogger.error('[PlanManager] Reactivate subscription failed', err)
      this.store.send({ type: 'CHECKOUT_ERROR', message: err?.message || 'Unexpected error during reactivation.' })
    }
  }

  // ===== Confirm-dialog plumbing ============================================
  // The XState snapshot carries the *display* data (title/message/actions),
  // but the resolver Promise lives here on the plugin since callbacks aren't
  // serialisable. The React modal calls back into `resolveConfirm` which
  // resolves the awaiting promise and clears the snapshot.

  private pendingConfirmResolver: ((value: string | null) => void) | null = null

  private requestConfirm(input: {
    title: string;
    message: string;
    actions: ConfirmAction[];
    variant?: 'default' | 'danger';
    eyebrow?: string;
    icon?: string;
    accent?: string;
    highlights?: ConfirmHighlight[];
  }): Promise<string | null> {
    // Reject any in-flight confirm so we never have two stacked dialogs.
    if (this.pendingConfirmResolver) {
      this.pendingConfirmResolver(null)
      this.pendingConfirmResolver = null
    }
    const dialog: ConfirmDialog = {
      id: `cd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      title: input.title,
      message: input.message,
      actions: input.actions,
      variant: input.variant ?? 'default',
      eyebrow: input.eyebrow,
      icon: input.icon,
      accent: input.accent,
      highlights: input.highlights
    }
    return new Promise<string | null>((resolve) => {
      this.pendingConfirmResolver = resolve
      this.store.send({ type: 'CONFIRM_REQUEST', dialog })
    })
  }

  private formatApiFailure(resp: any, fallback: string, flow?: string): { message: string; meta: Record<string, string> } {
    const data = resp?.data ?? {}
    const bodyMessage = typeof data?.message === 'string' && data.message.trim() ? data.message.trim() : ''
    const responseError = typeof resp?.error === 'string' && resp.error.trim() ? resp.error.trim() : ''
    const errorCode = typeof data?.error === 'string' && data.error.trim()
      ? data.error.trim()
      : responseError
    const message = bodyMessage || responseError || fallback
    const meta: Record<string, string> = {}
    if (flow) meta.flow = flow
    if (errorCode) meta.errorCode = errorCode
    if (typeof data?.hint === 'string' && data.hint.trim()) meta.hint = data.hint.trim()
    if (Number.isFinite(Number(data?.currentPriceCents))) meta.currentPrice = formatMoney(Number(data.currentPriceCents), 'USD')
    if (Number.isFinite(Number(data?.targetPriceCents))) meta.targetPrice = formatMoney(Number(data.targetPriceCents), 'USD')
    return { message, meta }
  }

  /**
   * Build the proration / from→to highlights surfaced in the plan-switch
   * confirm modal. Kept on the plugin (not the React side) so the same data
   * the API call uses is the data the user sees — no double-formatting.
   */
  private buildSwitchHighlights(input: {
    fromPlanName: string
    toPlanName: string
    toPlanCents: number | null
    chargeCents: number | null
    creditCents: number | null
    currency: string
  }): ConfirmHighlight[] {
    const hs: ConfirmHighlight[] = [
      { label: 'From', value: input.fromPlanName, tone: 'muted' },
      { label: 'To', value: input.toPlanName, tone: 'default' }
    ]
    if (input.chargeCents != null && input.chargeCents > 0) {
      hs.push({ label: 'Due now', value: formatMoney(input.chargeCents, input.currency), tone: 'negative' })
    } else if (input.creditCents != null && input.creditCents > 0) {
      hs.push({ label: 'Credit next invoice', value: formatMoney(input.creditCents, input.currency), tone: 'positive' })
    }
    if (input.toPlanCents != null && input.toPlanCents > 0) {
      hs.push({ label: 'New plan price', value: `${formatMoney(input.toPlanCents, input.currency)} / mo`, tone: 'default' })
    }
    return hs
  }

  /** Called by the React modal when the user clicks an action or dismisses. */
  resolveConfirm(value: string | null): void {
    const r = this.pendingConfirmResolver
    this.pendingConfirmResolver = null
    this.store.send({ type: 'CONFIRM_DISMISS' })
    if (r) r(value)
  }

  // ─── Internals ──────────────────────────────────────────────────

  // ─── Desktop (Electron) billing bridge ───────────────────────────

  /** True when running inside the Electron desktop shell. */
  private isDesktop(): boolean {
    return typeof window !== 'undefined' && (window as any).electronAPI !== undefined
  }

  /**
   * Base URL of the web IDE used for the desktop → web checkout hand-off.
   * Dev/E2E desktop builds load the app from localhost, so reuse that origin;
   * packaged desktop loads from `file://`, where we fall back to production.
   */
  private webBillingBaseUrl(): string {
    try {
      const loc = typeof window !== 'undefined' ? window.location : null
      if (loc && /^https?:$/.test(loc.protocol) && /^(localhost|127\.0\.0\.1)$/.test(loc.hostname)) {
        return loc.origin
      }
    } catch { /* ignore */ }
    return 'https://remix.ethereum.org'
  }

  /** Read the `desktop_billing` marker from the current URL (web instance). */
  private readDesktopBillingMarker(): boolean {
    try {
      if (typeof window === 'undefined') return false
      const search = new URLSearchParams(window.location.search)
      if (search.get('desktop_billing') === '1') return true
      // The `#` fragment may carry params too (parity with QueryParams).
      const hash = window.location.hash || ''
      const hashQuery = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : hash.replace(/^#/, '')
      return new URLSearchParams(hashQuery).get('desktop_billing') === '1'
    } catch {
      return false
    }
  }

  /**
   * Desktop can't render Paddle's checkout iframe, so buy/switch actions open
   * the matching web IDE screen in the user's browser. `window.open` is routed
   * to `shell.openExternal` by the Electron shell's window-open handler. The
   * `desktop_billing=1` marker tells that web instance to hand control back to
   * the desktop app once the purchase succeeds.
   */
  private openBillingOnWeb(section: 'plans' | 'topup'): void {
    // Remember where we sent the user so the desktop confirmation screen can
    // show the right intent when control comes back via remix://billing/complete.
    this.desktopPendingBillingSection = section
    const url = `${this.webBillingBaseUrl()}/?call=planManager//open//${section}&desktop_billing=1`
    try {
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      planManagerLogger.warn('[PlanManager] Failed to open web billing', err)
    }
    // Let the user know where checkout went, and keep the panel on the
    // relevant section so they see the result when they return.
    this.call('notification' as any, 'toast', 'Opening checkout in your browser — complete your purchase there, then return to the app.').catch(() => { /* noop */ })
    this.store.send({ type: 'OPEN_OVERLAY', intent: { initialSection: section } })
  }

  /**
   * Web instance (launched from desktop) finished a purchase: hand control
   * back to the desktop app via the remix:// protocol, just like the SSO
   * login bridge. The desktop side brings its window forward and refreshes.
   */
  private returnToDesktopAfterBilling(): void {
    if (this.desktopReturnFired) return
    this.desktopReturnFired = true
    // Brief delay so the success screen is visible before we redirect.
    setTimeout(() => {
      try {
        window.location.href = 'remix://billing/complete'
      } catch (err) {
        planManagerLogger.warn('[PlanManager] Failed to return to desktop', err)
      }
    }, 1500)
  }

  /**
   * Desktop side: the web checkout completed and handed control back. Mirror
   * the web post-purchase flow so the desktop reaches the same end state:
   *   1. Reveal the panel.
   *   2. Seed a `success` checkout result so the confirmation screen shows.
   *      `setCheckoutResult('success')` internally runs `completePurchaseRefresh`,
   *      which reloads account data *and* refreshes the auth plugin's
   *      permissions / credits / access-policy — so the top-bar avatar dropdown
   *      and every feature gate reflect the new plan, exactly like on the web.
   * The purchase happened on the (already-authenticated) web account, so there
   * are no tokens to transfer; we just resync this desktop instance's view.
   */
  private async handleDesktopBillingComplete(): Promise<void> {
    planManagerLogger.log('[PlanManager] desktop billing complete — confirming + refreshing user state')
    try { await this.open() } catch { /* noop */ }
    // We don't know the exact item bought on the web, so use the section the
    // user was sent to as the intent and keep the label generic; the plan/credit
    // cards below the confirmation render the precise, freshly-refreshed values.
    const intent: CheckoutIntent = this.desktopPendingBillingSection === 'topup' ? 'topup' : 'subscription'
    const itemLabel = intent === 'subscription' ? 'Remix' : undefined
    this.desktopPendingBillingSection = null
    this.setCheckoutResult({ kind: 'success', intent, itemLabel })
  }

  /** Init the Paddle singleton with config fetched from the auth backend. */
  private async initPaddleSingleton(): Promise<void> {
    try {
      // Singleton already up — fast path.
      const existing = getPaddle()
      if (existing) {
        this.paddle = existing
        return
      }
      const config = await this.call('auth', 'getPaddleConfig').catch(() => null) as
        { clientToken: string | null; environment: 'sandbox' | 'production' } | null
      if (!config?.clientToken) {
        planManagerLogger.log('[PlanManager] No Paddle client token from auth — checkout will fall back to hosted URL.')
        // Remember why the inline SDK is unavailable so a later hosted-checkout
        // fallback can attribute itself (token/billing-config problem).
        this.lastPaddleInitIssue = 'config_missing'
        // Init only works once the user is logged in and the bearer token
        // successfully fetches billing/config. For an anonymous user this is
        // expected (config isn't fetched without a token), so we stay quiet.
        // The signal worth capturing is "authenticated but STILL no client
        // token" — that points at billing/config or the token itself failing.
        const isAuthenticated = this.store.getSnapshot().isAuthenticated
        if (isAuthenticated && !this.paddleConfigMissingReported) {
          this.paddleConfigMissingReported = true
          const token = await this.call('auth', 'getToken').catch(() => null)
          reportCheckoutTelemetry('paddle.config.missing', {
            message: token
              ? 'billing/config returned no Paddle client token'
              : 'Authenticated but no access token available',
            detail: {
              isAuthenticated,
              hasToken: !!token,
              configReturned: !!config,
              environment: config?.environment ?? null,
            },
          })
        }
        return
      }
      // Record the environment so every telemetry event is tagged sandbox/prod.
      setCheckoutTelemetryEnv(config.environment)
      this.paddle = await initPaddle(config.clientToken, config.environment)
      // Belt-and-suspenders: some ad/tracking blockers let init resolve but
      // strip the global, so the overlay can never render. Surface it now.
      if (!this.paddle && !getPaddle() && typeof (globalThis as any).Paddle === 'undefined' && !this.paddleBlockedReported) {
        this.lastPaddleInitIssue = 'script_blocked'
        this.paddleBlockedReported = true
        reportCheckoutTelemetry('script.blocked', {
          message: 'window.Paddle undefined after initPaddle resolved',
          paddleEnv: config.environment,
        })
      } else if ((this.paddle || getPaddle()) && !this.paddleInitOkReported) {
        // SDK is ready — the positive signal that the whole config→init chain
        // worked for this user. Absence of this (with config.missing or
        // script.blocked present) tells us where the funnel broke.
        this.paddleInitOkReported = true
        // A recovered init after a prior config.missing means a later login/
        // token succeeded — allow config.missing to report again if it breaks.
        this.paddleConfigMissingReported = false
        this.lastPaddleInitIssue = null
      }
    } catch (err) {
      planManagerLogger.warn('[PlanManager] Paddle init failed', err)
      // Init threw and Paddle is still not on the window → the CDN script was
      // blocked/failed. This is the single biggest silent "can't buy" cause.
      if (typeof (globalThis as any).Paddle === 'undefined' && !this.paddleBlockedReported) {
        this.lastPaddleInitIssue = 'script_blocked'
        this.paddleBlockedReported = true
        reportCheckoutTelemetry('script.blocked', {
          message: (err as any)?.message || 'Paddle.js failed to initialize',
          detail: { name: (err as any)?.name },
        })
      }
    }
  }

  private trackCheckout(action: CheckoutEvent['action'], name?: string, value?: string | number): void {
    trackMatomoEvent(this, { category: 'checkout', action, name, value, isClick: false })
  }

  /**
   * Shared checkout driver. Calls the supplied billing API method (which
   * must POST to the backend and receive `{ transactionId, checkoutUrl }`),
   * then opens Paddle. On API failure, dispatches CHECKOUT_ERROR; the
   * Paddle event handler takes it from there for the success path.
   */
  private async runCheckout(
    intent: CheckoutIntent,
    itemLabel: string,
    apiCall: (api: any) => Promise<{ ok: boolean; data?: { transactionId?: string; checkoutUrl?: string }; error?: string }>
  ): Promise<void> {
    // Auth gate — Paddle expects customData.userId, which the backend
    // attaches based on the bearer token.
    if (!this.store.getSnapshot().isAuthenticated) {
      try { await this.call('auth', 'login', 'github') } catch { /* user closed */ }
      this.trackCheckout('error', intent, 'not_authenticated')
      this.store.send({ type: 'CHECKOUT_ERROR', message: 'Please sign in to complete the purchase.' })
      return
    }
    try {
      const billingApi = await this.call('auth', 'getBillingApi').catch(() => null) as any
      if (!billingApi) {
        this.trackCheckout('error', intent, 'billing_unavailable')
        reportCheckoutTelemetry('transaction.error', {
          errorCode: 'billing_unavailable',
          message: 'Billing service is not available right now.',
          detail: { intent, itemLabel },
        })
        this.store.send({ type: 'CHECKOUT_ERROR', message: 'Billing service is not available right now.' })
        return
      }
      const response = await apiCall(billingApi)
      if (!response?.ok || !response.data) {
        this.trackCheckout('error', intent, response?.error || 'start_failed')
        reportCheckoutTelemetry('transaction.error', {
          errorCode: response?.error || 'start_failed',
          message: response?.error || 'Could not start checkout.',
          detail: { intent, itemLabel },
        })
        this.store.send({ type: 'CHECKOUT_ERROR', message: response?.error || 'Could not start checkout.' })
        return
      }
      const { transactionId, checkoutUrl } = response.data as { transactionId?: string; checkoutUrl?: string; immediate?: boolean }
      // Immediate-grant path (e.g. free plan via /products/purchase) — no
      // Paddle hand-off; the backend already granted the membership.
      if ((response.data as any).immediate === true) {
        this.trackCheckout('completed', intent, 'immediate')
        this.store.send({ type: 'CHECKOUT_COMPLETED' })
        // Trigger a fast refresh that ends with PURCHASE_CONFIRMED so the
        // result is promoted 'processing' → 'success' (a bare loadAccountData
        // would leave it stuck while the data region is already 'ready').
        setTimeout(() => { void this.completePurchaseRefresh() }, 250)
        return
      }
      if (!this.paddle && !getPaddle()) {
        await this.initPaddleSingleton()
      }
      const paddleInstance = this.paddle ?? getPaddle()
      if (paddleInstance && transactionId) {
        // Backend produced a transaction and Paddle is ready — record it so a
        // *missing* subsequent `checkout.loaded` reveals a silent overlay
        // failure (blocker that never throws).
        reportCheckoutTelemetry('transaction.created', {
          transactionId,
          detail: { intent, itemLabel, displayMode: 'inline' },
        })
        // Paddle.js inline checkout — renders inside .paddle-checkout-container
        openCheckoutWithTransaction(paddleInstance, transactionId, {
          settings: {
            displayMode: 'inline',
            theme: this.paddleTheme,
            variant: 'one-page',
            frameTarget: 'paddle-checkout-container',
            frameInitialHeight: 700,
            frameStyle: 'width: 100%; min-width: 312px; min-height: 700px; background-color: transparent; border: none;',
          }
        })
        // Arm the load watchdog: if checkout.loaded never fires the overlay
        // silently failed to render (blocker / init error that emits no usable
        // event). This is the single biggest "created a transaction but the
        // user never saw a form" signal.
        this.armCheckoutLoadWatchdog({ transactionId, intent, itemLabel })
        this.trackCheckout('opened', intent, transactionId)
        this.store.send({ type: 'CHECKOUT_OPENED' })
      } else if (checkoutUrl) {
        // Hosted-checkout fallback — we won't get Paddle events back, so
        // surface a "processing" state immediately and poll the backend
        // until the webhook lands.
        reportCheckoutTelemetry('checkout.hosted_fallback', {
          transactionId,
          message: 'Opened hosted checkout URL (no inline Paddle events).',
          detail: { intent, itemLabel, reason: this.lastPaddleInitIssue ?? 'no_inline_sdk' },
        })
        window.open(checkoutUrl, '_blank', 'noopener,noreferrer')
        this.trackCheckout('opened', intent, 'hosted_url')
        this.store.send({ type: 'CHECKOUT_COMPLETED', transactionId })
        planManagerLogger.log('[plan-manager:poll] triggered from hosted-url fallback', { intent, transactionId })
        void this.pollPaymentConfirmation(intent, transactionId)
      } else {
        this.trackCheckout('error', intent, 'no_checkout_reference')
        reportCheckoutTelemetry('transaction.error', {
          errorCode: 'no_checkout_reference',
          message: 'Backend returned no checkout reference.',
          detail: { intent, itemLabel },
        })
        this.store.send({ type: 'CHECKOUT_ERROR', message: 'Backend returned no checkout reference.' })
      }
    } catch (err: any) {
      planManagerLogger.error('[PlanManager] Checkout failed', err)
      this.trackCheckout('error', intent, err?.message || 'unexpected_error')
      reportCheckoutTelemetry('transaction.error', {
        errorCode: 'unexpected_error',
        message: err?.message || 'Unexpected checkout error.',
        detail: { intent, itemLabel, stack: err?.stack },
      })
      this.store.send({ type: 'CHECKOUT_ERROR', message: err?.message || 'Unexpected checkout error.' })
    }
    // Touch unused param to satisfy strict mode — `intent`/`itemLabel` are
    // already captured by CHECKOUT_INTENT before we get here. Keeping them
    // in the signature is forward-compat for richer error messages.
    void intent; void itemLabel
  }

  // ==================== Resume abandoned checkouts ====================

  /**
   * Fetch the signed-in user's unfinished checkouts and hand them to the
   * machine. Deliberately out-of-band from account data — the brief is
   * explicit that this must NOT be folded into /permissions. Fire-and-forget:
   * a failure just leaves the nudge hidden.
   */
  private async loadPendingCheckouts(): Promise<void> {
    if (!this.store.getSnapshot().isAuthenticated) return
    try {
      const checkoutsApi = await this.call('auth', 'getCheckoutsApi').catch(() => null) as any
      if (!checkoutsApi?.getPendingCheckouts) {
        planManagerLogger.warn('[PlanManager:resume] loadPendingCheckouts: checkoutsApi unavailable')
        return
      }
      const res = await checkoutsApi.getPendingCheckouts()
      planManagerLogger.log('[PlanManager:resume] loadPendingCheckouts response', { ok: res?.ok, count: Array.isArray(res?.data?.checkouts) ? res.data.checkouts.length : 'n/a', data: res?.data })
      if (!res?.ok || !res.data) return
      const checkouts: PendingCheckout[] = Array.isArray(res.data.checkouts) ? res.data.checkouts : []
      this.resumeCheckoutsLoaded = true
      this.store.send({ type: 'RESUME_CHECKOUTS_LOADED', checkouts })
    } catch (err) {
      planManagerLogger.warn('[PlanManager:resume] loadPendingCheckouts failed', err)
    }
  }

  /** User dismissed the resume nudge — hide it for the rest of the session. */
  dismissResumeNudge(): void {
    this.store.send({ type: 'RESUME_NUDGE_DISMISS' })
  }

  /**
   * Public getter for the signed-in user's unfinished checkouts. Lets other
   * plugins (e.g. the top-bar cart button) read the current list without
   * subscribing to the store; pair it with the `pendingCheckoutsChanged`
   * event for live updates.
   */
  getPendingCheckouts(): PendingCheckout[] {
    return this.store.getSnapshot().resumeCheckouts
  }

  /**
   * Discard an unfinished checkout: DELETE /checkouts/:transactionId, then
   * reload the pending list (which drops it from both the resume banner and
   * the top-bar cart button). Best-effort — a failure just leaves the entry
   * in place for the user to try again.
   */
  async discardCheckout(transactionId: string): Promise<void> {
    if (!transactionId) return
    try {
      const checkoutsApi = await this.call('auth', 'getCheckoutsApi').catch(() => null) as any
      if (!checkoutsApi?.deleteCheckout) {
        planManagerLogger.warn('[PlanManager:resume] discardCheckout: checkoutsApi unavailable')
        return
      }
      const res = await checkoutsApi.deleteCheckout(transactionId)
      planManagerLogger.log('[PlanManager:resume] discardCheckout response', { ok: res?.ok, transactionId })
      this.trackCheckout('discard', 'banner', transactionId)
      reportCheckoutTelemetry('checkout.discard', {
        transactionId,
        detail: { ok: !!res?.ok, status: res?.status },
      })
    } catch (err) {
      planManagerLogger.warn('[PlanManager:resume] discardCheckout failed', err)
    } finally {
      void this.loadPendingCheckouts()
    }
  }

  /**
   * Resume a previously abandoned checkout. Verifies ownership first (so a
   * stale transaction can't open someone else's checkout), then opens the
   * inline Paddle overlay for the transaction. Falls back to the hosted
   * `resume_link` when the inline SDK isn't available.
   */
  async resumeCheckout(transactionId: string, source: 'banner' | 'cart' = 'banner'): Promise<void> {
    planManagerLogger.log('[PlanManager:resume] resumeCheckout called', { transactionId, source })
    if (!transactionId) return
    if (!this.store.getSnapshot().isAuthenticated) {
      planManagerLogger.log('[PlanManager:resume] not authenticated — prompting login')
      try { await this.call('auth', 'login', 'github') } catch { /* user closed */ }
      return
    }

    // User acted on an unfinished checkout — record which surface drove it so
    // the admin viewer can compare resume-banner vs top-bar-cart conversion.
    this.trackCheckout('resume', source, transactionId)
    reportCheckoutTelemetry('checkout.resume', {
      transactionId,
      detail: { source },
    })

    // Ownership / existence check against the server (returns the checkout only
    // when it exists and belongs to the signed-in user).
    let checkout: PendingCheckout | null = null
    {
      const checkoutsApi = await this.call('auth', 'getCheckoutsApi').catch(() => null) as any
      if (!checkoutsApi?.verifyCheckout) {
        this.store.send({ type: 'CHECKOUT_ERROR', message: 'Billing service is not available right now.' })
        this.store.send({ type: 'OPEN_OVERLAY' })
        return
      }

      // 404 → unknown or not-yours (treated the same, by design).
      try {
        const res = await checkoutsApi.verifyCheckout(transactionId)
        planManagerLogger.log('[PlanManager:resume] verifyCheckout response', { ok: res?.ok, status: res?.status, hasCheckout: !!res?.data?.checkout, data: res?.data })
        if (res?.ok && res.data?.checkout) {
          checkout = res.data.checkout as PendingCheckout
          planManagerLogger.log('[PlanManager:resume] checkout verified', {
            product_slug: checkout.product_slug,
            product_kind: checkout.product_kind,
            product_name: checkout.product_name,
            line_items_count: Array.isArray(checkout.line_items) ? checkout.line_items.length : 'absent',
            line_items: checkout.line_items
          })
        } else {
          reportCheckoutTelemetry('transaction.error', {
            errorCode: 'resume_not_available',
            transactionId,
            message: 'Resume checkout not found or not owned by user.',
            detail: { status: res?.status },
          })
          this.store.send({
            type: 'CHECKOUT_ERROR',
            message: "This checkout isn't available anymore. Head to plans to start a new one.",
            transactionId
          })
          this.store.send({ type: 'OPEN_OVERLAY', intent: { initialSection: 'plans' } })
          return
        }
      } catch (err: any) {
        planManagerLogger.warn('[PlanManager] verifyCheckout failed', err)
        this.store.send({
          type: 'CHECKOUT_ERROR',
          message: "This checkout isn't available anymore. Head to plans to start a new one.",
          transactionId
        })
        this.store.send({ type: 'OPEN_OVERLAY', intent: { initialSection: 'plans' } })
        return
      }
    } // end: ownership verify

    const intent: CheckoutIntent = checkout.product_kind === 'subscription' ? 'subscription' : 'topup'
    const itemLabel = checkout.product_name ?? undefined
    // The inline summary aside renders the plan/package header (price, cadence,
    // launch-offer badge, included credits, free-gift rows) by looking the
    // product up in the catalog via `pending.productId`. Catalog items use
    // `id === slug` (see loadCatalog), so the resumed `product_slug` maps
    // straight onto it. Without this the aside falls back to "$0.00 one-time".
    const productId = checkout.product_slug ?? undefined

    // Reconstruct the cart from the transaction's raw Paddle line items so the
    // summary aside's "Also in this order" add-on rows render exactly like a
    // fresh checkout. The backend just dumps Paddle's line items verbatim; the
    // mapping onto our internal CartItem model lives here (single place that
    // knows the shape), keeping the API free of per-component data concerns.
    const reconstructedCart = this.buildCartFromLineItems(checkout)
    planManagerLogger.log('[PlanManager:resume] reconstructed cart', { items: reconstructedCart })
    this.store.send({ type: 'CART_CLEAR' })
    for (const item of reconstructedCart) {
      this.store.send({ type: 'CART_ADD', item })
    }

    // Drive the checkout region so the panel collapses to the inline frame,
    // exactly like a fresh purchase.
    this.store.send({ type: 'CHECKOUT_INTENT', intent, itemLabel, productId })
    this.store.send({ type: 'OPEN_OVERLAY' })
    // The nudge has served its purpose — hide it now the user acted.
    this.store.send({ type: 'RESUME_NUDGE_DISMISS' })

    try {
      if (!this.paddle && !getPaddle()) {
        await this.initPaddleSingleton()
      }
      const paddleInstance = this.paddle ?? getPaddle()
      if (paddleInstance) {
        // CHECKOUT_INTENT above asked React to render the inline
        // `.paddle-checkout-container`, but that render is async. A fresh
        // purchase gets away with opening straight after because the backend
        // POST awaits (yielding to React); resume has no such gap, so Paddle's
        // `appendChild` into the frame target would hit `undefined`. Wait for
        // the container to actually exist first.
        planManagerLogger.log('[PlanManager:resume] waiting for .paddle-checkout-container to mount…')
        const container = await this.waitForCheckoutContainer()
        planManagerLogger.log('[PlanManager:resume] waitForCheckoutContainer result', { found: !!container })
        if (!container) {
          if (checkout.resume_link) {
            reportCheckoutTelemetry('checkout.hosted_fallback', {
              transactionId,
              message: 'Inline container never mounted — opened hosted resume link.',
              detail: { intent, itemLabel, resumed: true, reason: 'container_missing' },
            })
            window.open(checkout.resume_link, '_blank', 'noopener,noreferrer')
            this.store.send({ type: 'CHECKOUT_COMPLETED', transactionId })
            void this.pollPaymentConfirmation(intent, transactionId)
            return
          }
          this.store.send({ type: 'CHECKOUT_ERROR', message: 'Could not reopen this checkout.', transactionId })
          return
        }
        reportCheckoutTelemetry('transaction.created', {
          transactionId,
          detail: { intent, itemLabel, displayMode: 'inline', resumed: true },
        })
        openCheckoutWithTransaction(paddleInstance, transactionId, {
          settings: {
            displayMode: 'inline',
            theme: this.paddleTheme,
            variant: 'one-page',
            frameTarget: 'paddle-checkout-container',
            frameInitialHeight: 700,
            frameStyle: 'width: 100%; min-width: 312px; min-height: 700px; background-color: transparent; border: none;',
          }
        })
        this.store.send({ type: 'CHECKOUT_OPENED' })
      } else if (checkout.resume_link) {
        // Inline SDK unavailable (blocked/desktop) — fall back to the hosted
        // resume link Paddle handed us.
        reportCheckoutTelemetry('checkout.hosted_fallback', {
          transactionId,
          message: 'Opened hosted resume link (no inline Paddle SDK).',
          detail: { intent, itemLabel, resumed: true },
        })
        window.open(checkout.resume_link, '_blank', 'noopener,noreferrer')
        this.store.send({ type: 'CHECKOUT_COMPLETED', transactionId })
        void this.pollPaymentConfirmation(intent, transactionId)
      } else {
        this.store.send({ type: 'CHECKOUT_ERROR', message: 'Could not reopen this checkout.', transactionId })
      }
    } catch (err: any) {
      planManagerLogger.error('[PlanManager] resumeCheckout failed', err)
      this.store.send({ type: 'CHECKOUT_ERROR', message: err?.message || 'Could not reopen this checkout.', transactionId })
    }
  }

  /**
   * Map the resumed transaction's raw Paddle line items onto our internal
   * `CartItem[]` so the summary aside can render "Also in this order" rows
   * identically to a fresh checkout. Rules:
   *   - Skip lines with no `customData.slug` (ad-hoc products with no Remix
   *     metadata — e.g. an intro free-gift) — the gift row is rendered from the
   *     plan's `introCreditPackages` instead, not from the cart.
   *   - Skip zero-priced lines so a $0 gift never shows as a paid add-on.
   *   - Money is in Paddle minor units (string) → parse to `priceCents`.
   * When the slug matches a catalog product the aside upgrades the row to the
   * visitor's localized price; otherwise it falls back to this USD `priceCents`.
   */
  private buildCartFromLineItems(checkout: PendingCheckout): CartItem[] {
    const lines = Array.isArray(checkout.line_items) ? checkout.line_items : []
    const cart: CartItem[] = []
    for (const li of lines) {
      const cd = li?.product?.customData
      const slug = cd?.slug
      if (!slug) continue
      const priceCents = Number(li?.totals?.subtotal ?? 0) || 0
      if (priceCents <= 0) continue
      const productType: CartItem['productType'] =
        cd?.product_type === 'subscription_plan' ? 'subscription_plan' : 'credit_package'
      const credits = Number(cd?.credits ?? 0) || undefined
      const item: CartItem = {
        slug,
        name: li?.product?.name ?? slug,
        productType,
        priceCents,
        credits
      }
      if (productType === 'subscription_plan') {
        item.billingInterval = cd?.billing_interval === 'year' ? 'year' : 'month'
      }
      cart.push(item)
    }
    return cart
  }

  /**
   * Resolve once the inline `.paddle-checkout-container` is mounted in the DOM
   * (polls on animation frames), or after `timeoutMs` with `null`. Paddle's
   * inline `open()` does an `appendChild` into this element, so it must exist
   * before we hand off — otherwise it throws "Cannot read properties of
   * undefined (reading 'appendChild')".
   */
  private waitForCheckoutContainer(timeoutMs = 4000): Promise<HTMLElement | null> {
    const selector = '.paddle-checkout-container'
    if (typeof document === 'undefined') return Promise.resolve(null)
    const existing = document.querySelector<HTMLElement>(selector)
    if (existing) return Promise.resolve(existing)
    return new Promise((resolve) => {
      const start = Date.now()
      const tick = () => {
        const el = document.querySelector<HTMLElement>(selector)
        if (el) { resolve(el); return }
        if (Date.now() - start >= timeoutMs) { resolve(null); return }
        window.requestAnimationFrame(tick)
      }
      window.requestAnimationFrame(tick)
    })
  }

  /** Translate Paddle SDK events into machine events. */
  private handlePaddleEvent(event: PaddleEventData): void {
    console.debug('[PlanManager] Paddle event', event.name, event.data)
    // Diagnostics: error/warning events often arrive with `data: undefined`,
    // hiding whatever Paddle actually put on the event. Dump the *entire*
    // event object (all keys, not just name+data) so we can see where the
    // validation payload lives. Note: the human-readable message a user sees
    // in the frame (e.g. "enter a valid postal code") is a console.error from
    // inside Paddle's cross-origin iframe — that specific string is NOT
    // accessible to us; we can only read what Paddle emits via this callback.
    const name = event?.name as string | undefined
    if (name === 'checkout.error' || name === 'checkout.warning' || name === ('checkout.payment.failed' as any) || name === ('checkout.payment.error' as any)) {
      let dump = ''
      try { dump = JSON.stringify(event, null, 2) } catch { dump = '(unserializable)' }
      planManagerLogger.log('[PlanManager:paddle-error] full event object', {
        name,
        keys: Object.keys(event || {}),
        error: (event as any)?.error,
        warning: (event as any)?.warning,
        data: (event as any)?.data,
        raw: event
      })
      planManagerLogger.log('[PlanManager:paddle-error] serialized', dump)
    }
    // Mirror every notable Paddle overlay event into checkout telemetry before
    // running the machine logic. This is the browser-side signal the billing
    // admin funnel keys off: overlay rendered (loaded) → completed, or a
    // closed/error/warning in between. `detail: d` keeps the full payload so
    // we still capture everything even if a specific field path shifts.
    this.reportPaddleTelemetry(event)
    const transactionId = (event as any)?.data?.transaction_id as string | undefined
    switch (event.name) {
    // Fired once when the checkout iframe loads, then on every change the
    // user makes (discount, country/VAT, payment method). Carries the full
    // financial breakdown Paddle calculated — surface it in our summary.
    case 'checkout.loaded' as any:
    case 'checkout.customer.updated' as any:
    case 'checkout.updated' as any: {
      console.log('[PlanManager] Paddle checkout update', event.name, event.data)
      // The very first event is the iframe finishing load — track it once as a
      // distinct funnel step; subsequent updates are price recalculations.
      if (event.name === ('checkout.loaded' as any)) {
        this.markCheckoutLoaded()
        this.trackCheckout('paddle_loaded', undefined, transactionId)
      }
      const breakdown = this.parseCheckoutBreakdown(event)
      if (breakdown) {
        this.trackCheckout('breakdown_updated', breakdown.currencyCode, breakdown.total)
        this.store.send({ type: 'CHECKOUT_BREAKDOWN', breakdown })
      }
      break
    }
    case 'checkout.completed': {
      this.clearCheckoutLoadWatchdog()
      const pendingIntent = this.store.getSnapshot().pendingCheckout?.intent ?? 'subscription'
      this.trackCheckout('completed', pendingIntent, transactionId)
      this.store.send({ type: 'CHECKOUT_COMPLETED', transactionId })
      planManagerLogger.log('[plan-manager:poll] triggered from paddle checkout.completed', { intent: pendingIntent, transactionId })
      // Poll our backend (never Paddle) until the webhook has been processed,
      // then promote 'processing' → 'success'.
      void this.pollPaymentConfirmation(pendingIntent, transactionId)
      break
    }
    case 'checkout.closed': {
      this.clearCheckoutLoadWatchdog()
      const pendingClose = this.store.getSnapshot().pendingCheckout
      if (pendingClose) this.trackCheckout('closed', pendingClose.intent, transactionId)
      this.store.send({ type: 'CHECKOUT_CLOSED' })
      break
    }
    // ─── OBSERVE-ONLY (intervention temporarily disabled) ───────────────
    // Paddle surfaces very different situations through the SAME event shape:
    // a field the user can fix in-frame (bad postal code) and a checkout that
    // could not open at all (bad transaction id, balance below minimum) BOTH
    // arrive as `checkout.error` with `type: 'api_error'`, `code: 'validation'`
    // — there's no reliable discriminator in the payload. And for the "can't
    // open" cases Paddle's iframe only shows a generic "Something went wrong /
    // Contact support", which would send users to Paddle instead of us.
    //
    // So we take a single general approach for every error/warning/payment
    // event: show a NON-destructive banner above the still-mounted iframe. We
    // never tear the checkout down (no CHECKOUT_ERROR result screen). If the
    // problem was a correctable field, Paddle keeps the frame usable and the
    // banner auto-clears on the next successful recalculation (CHECKOUT_BREAKDOWN);
    // if the checkout truly can't open, the banner stays with our own message.
    case 'checkout.warning' as any:
    case 'checkout.payment.failed' as any:
    case 'checkout.payment.error' as any: {
      const message = this.extractPaddleErrorMessage(event)
        || 'Something went wrong with this checkout. Please review your details and try again.'
      planManagerLogger.warn('[PlanManager:paddle-notice] showing in-frame banner', {
        name: event.name,
        message,
        data: (event as any)?.data
      })
      break
    }
    case 'checkout.error' as any: {
      const isWarning = event.name === ('checkout.warning' as any)
      this.clearCheckoutLoadWatchdog()
      const message = (event as any)?.error?.message
        || (event as any)?.data?.error?.message
        || 'Payment failed'
      this.trackCheckout('error', this.store.getSnapshot().pendingCheckout?.intent, message)
      this.store.send({ type: 'CHECKOUT_NOTICE', level: isWarning ? 'warning' : 'error', message })
      break
    }
    default:
      // Other events (loaded, customer.created, items.updated, etc.) are
      // not interesting for the panel right now.
      break
    }
  }

  /**
   * Best-effort extraction of a human-readable message from a Paddle
   * error/warning event. Paddle Billing has shifted these field paths between
   * versions, so we probe every known location. Returns null when nothing
   * usable is present (the caller supplies a fallback). The full raw event is
   * always dumped separately in handlePaddleEvent for deeper inspection.
   */
  private extractPaddleErrorMessage(event: PaddleEventData): string | null {
    const e: any = event
    const candidates: Array<unknown> = [
      e?.error?.detail,
      e?.error?.message,
      e?.error?.reason,
      e?.data?.error?.detail,
      e?.data?.error?.message,
      e?.warning?.detail,
      e?.warning?.message,
      e?.data?.warning?.detail,
      e?.data?.warning?.message,
      e?.detail,
      e?.message,
      // Some payloads carry an array of field errors.
      Array.isArray(e?.data?.errors) ? e.data.errors.map((x: any) => x?.detail || x?.message).filter(Boolean).join('; ') : null,
      Array.isArray(e?.errors) ? e.errors.map((x: any) => x?.detail || x?.message).filter(Boolean).join('; ') : null,
    ]
    for (const c of candidates) {
      if (typeof c === 'string' && c.trim()) return c.trim()
    }
    return null
  }

  /**
   * Map a Paddle SDK event onto the checkout-telemetry funnel. Only the exact
   * event names the billing admin viewer aggregates are reported; the runtime
   * `checkout.payment.failed` alias is folded into `checkout.error`. Field
   * paths inside `data` can vary by event, so we extract best-effort and dump
   * the full payload as `detail` (the server caps it) — nothing is lost.
   */
  private reportPaddleTelemetry(event: PaddleEventData): void {
    const name = event?.name as string | undefined
    if (!name) return
    const map: Record<string, string> = {
      'checkout.loaded': 'checkout.loaded',
      'checkout.payment.selected': 'checkout.payment.selected',
      'checkout.payment.initiated': 'checkout.payment.initiated',
      'checkout.completed': 'checkout.completed',
      'checkout.closed': 'checkout.closed',
      'checkout.error': 'checkout.error',
      'checkout.warning': 'checkout.warning',
      'checkout.payment.failed': 'checkout.error',
      'checkout.payment.error': 'checkout.error',
    }
    const reported = map[name]
    if (!reported) return
    const d: any = (event as any)?.data || {}
    const extractedMessage = this.extractPaddleErrorMessage(event)
    const isError = reported === 'checkout.error' || reported === 'checkout.warning'
    // Correlate back to the transaction we actually opened. Paddle's error
    // payload is frequently empty ({}), so without this the admin viewer shows
    // a "–" transaction and no way to tie the failure to a draft.
    const ctx = this.checkoutContext
    const transactionId = d.transaction_id || d.id || (isError ? ctx?.transactionId : undefined)
    // Dump the WHOLE event, not just event.data — Paddle sometimes carries the
    // error at the top level (event.error) while data is empty. For errors also
    // attach whether the overlay ever rendered and how long since we opened, so
    // "never loaded" is distinguishable from "loaded then failed".
    const detail: Record<string, unknown> = { name, data: d }
    if ((event as any)?.error !== undefined) detail.error = (event as any).error
    if (isError && ctx) {
      detail.loadedBefore = ctx.loaded
      detail.msSinceOpen = Date.now() - ctx.openedAt
      detail.intent = ctx.intent
      detail.itemLabel = ctx.itemLabel
    }
    reportCheckoutTelemetry(reported, {
      transactionId,
      paddleCustomerId: d.customer?.id,
      errorCode: d.error?.code || d.reason || (event as any)?.error?.code || (event as any)?.warning?.code,
      message: extractedMessage || (isError && ctx && !ctx.loaded ? 'Paddle error before overlay rendered (empty payload)' : name),
      detail: { data: d, error: (event as any)?.error, warning: (event as any)?.warning },
    })
  }

  /**
   * Arm the inline-overlay load watchdog. If `checkout.loaded` doesn't arrive
   * within `checkoutLoadTimeoutMs`, the overlay silently failed to render and
   * we emit `checkout.load_timeout` — the signal for "backend gave us a
   * transaction but the user never saw a payment form".
   */
  private armCheckoutLoadWatchdog(ctx: { transactionId?: string; intent?: string; itemLabel?: string }): void {
    this.clearCheckoutLoadWatchdog()
    this.checkoutContext = { ...ctx, openedAt: Date.now(), loaded: false }
    this.checkoutLoadWatchdog = window.setTimeout(() => {
      this.checkoutLoadWatchdog = null
      const c = this.checkoutContext
      if (!c || c.loaded) return
      // Probe the DOM the overlay renders into so the timeout event can tell
      // "Paddle never injected an iframe" (blocker / init failure) apart from
      // "iframe injected but never signalled loaded" (blank / cross-origin
      // render stall). `frameTarget` is the container class we passed to
      // Paddle.Checkout.open.
      const probe = this.probeCheckoutFrame('paddle-checkout-container')
      reportCheckoutTelemetry('checkout.load_timeout', {
        transactionId: c.transactionId,
        message: `Paddle checkout.loaded not received within ${this.checkoutLoadTimeoutMs}ms — overlay likely failed to render.`,
        detail: {
          intent: c.intent,
          itemLabel: c.itemLabel,
          waitedMs: this.checkoutLoadTimeoutMs,
          paddleGlobalPresent: typeof (globalThis as any).Paddle !== 'undefined',
          ...probe,
        },
      })
    }, this.checkoutLoadTimeoutMs)
  }

  /**
   * Inspect the checkout container to distinguish failure modes at timeout:
   *   - `containerFound=false`  → our render target is missing (panel closed /
   *     markup changed) — the overlay had nowhere to mount.
   *   - `iframeCount=0`         → Paddle never injected an iframe (blocker, CSP,
   *     or Paddle.Checkout.open silently no-op'd).
   *   - `iframeCount>0`         → iframe exists but never fired loaded — a blank
   *     / cross-origin-stalled render. `iframeVisible`/dimensions hint whether
   *     it's hidden vs zero-sized.
   * All reads are best-effort and never throw into the watchdog.
   */
  private probeCheckoutFrame(containerClass: string): Record<string, unknown> {
    try {
      if (typeof document === 'undefined') return { containerFound: false }
      const container = document.getElementsByClassName(containerClass)[0] as HTMLElement | undefined
      if (!container) return { containerFound: false }
      const iframes = container.getElementsByTagName('iframe')
      const first = iframes[0] as HTMLIFrameElement | undefined
      const rect = first?.getBoundingClientRect()
      return {
        containerFound: true,
        iframeCount: iframes.length,
        iframeSrcHost: first?.src ? (() => { try { return new URL(first.src).host } catch { return 'unparseable' } })() : null,
        iframeVisible: first ? (getComputedStyle(first).visibility !== 'hidden' && getComputedStyle(first).display !== 'none') : false,
        iframeWidth: rect ? Math.round(rect.width) : null,
        iframeHeight: rect ? Math.round(rect.height) : null,
      }
    } catch (e: any) {
      return { probeError: e?.message || 'probe_failed' }
    }
  }

  /** Mark the current checkout as rendered and stop the watchdog. */
  private markCheckoutLoaded(): void {
    if (this.checkoutContext) this.checkoutContext.loaded = true
    this.clearCheckoutLoadWatchdog()
  }

  /** Cancel a pending load watchdog (checkout reached a terminal state). */
  private clearCheckoutLoadWatchdog(): void {
    if (this.checkoutLoadWatchdog !== null) {
      window.clearTimeout(this.checkoutLoadWatchdog)
      this.checkoutLoadWatchdog = null
    }
  }

  /**
   * Pull the financial breakdown out of a Paddle `checkout.loaded` /
   * `checkout.updated` event. Money values are already in major units
   * (e.g. dollars) in the event payload. Returns null when the payload
   * doesn't carry usable totals yet.
   */
  private parseCheckoutBreakdown(event: PaddleEventData): CheckoutBreakdown | null {
    const data = (event as any)?.data
    const totals = data?.totals
    if (!data || !totals) return null

    const recurring = data.recurring_totals
      ? {
        subtotal: Number(data.recurring_totals.subtotal ?? 0),
        discount: Number(data.recurring_totals.discount ?? 0),
        tax: Number(data.recurring_totals.tax ?? 0),
        total: Number(data.recurring_totals.total ?? 0)
      }
      : null

    const firstItem = Array.isArray(data.items) ? data.items[0] : undefined
    const cycle = firstItem?.billing_cycle
    const billingCycle = cycle?.interval
      ? { interval: cycle.interval, frequency: Number(cycle.frequency ?? 1) }
      : null

    return {
      currencyCode: data.currency_code ?? 'USD',
      subtotal: Number(totals.subtotal ?? 0),
      discount: Number(totals.discount ?? 0),
      tax: Number(totals.tax ?? 0),
      total: Number(totals.total ?? 0),
      discountCode: data.discount?.code ?? null,
      recurring,
      billingCycle
    }
  }

  private async loadCatalog(): Promise<void> {
    try {
      const productsApi: any = await this.call('auth', 'getProductsApi').catch(() => null)
      if (!productsApi || typeof productsApi.getAvailableProducts !== 'function') {
        this.store.send({ type: 'CATALOG_FAILED', message: 'Products API unavailable' })
        return
      }
      // Unified catalog endpoint — one endpoint per product type, each
      // item carries the full multi-cadence `prices` array.
      const [plansResp, packagesResp] = await Promise.all([
        productsApi.getAvailableProducts({ type: 'subscription_plan' }),
        productsApi.getAvailableProducts({ type: 'credit_package' })
      ])
      if (!plansResp?.ok || !packagesResp?.ok) {
        this.store.send({
          type: 'CATALOG_FAILED',
          message: plansResp?.error || packagesResp?.error || 'Failed to load catalog'
        })
        return
      }

      const mapProviders = (raw: any[]): any[] => (raw ?? []).map((pr: any) => ({
        slug: pr.slug,
        name: pr.slug,
        priceId: pr.external_price_id ?? null,
        productId: pr.external_product_id ?? null,
        isActive: pr.is_active !== false,
        syncStatus: (pr.sync_status as any) ?? 'synced'
      }))

      const plans = (plansResp.data?.data ?? [])
        .filter((p: any) => p.product_type === 'subscription_plan')
        .map((p: any) => {
          // Pick the "default" price for the legacy single-price fields
          // so existing selectors keep working unchanged.
          const prices = Array.isArray(p.prices) ? p.prices : []
          const defaultPrice = prices.find((pr: any) => pr.is_default) || prices[0] || null
          const headlinePriceCents = defaultPrice?.price_cents ?? p.price_cents
          const headlineInterval = defaultPrice?.billing_interval ?? p.billing_interval
          const headlineCurrency = defaultPrice?.currency ?? p.currency
          // Top-level providers fall back to the default price's providers,
          // then to the legacy product-level fields.
          const topProviders = (p.providers && p.providers.length > 0)
            ? p.providers
            : (defaultPrice?.providers ?? (p.provider_slug ? [{
              slug: p.provider_slug,
              external_product_id: p.external_product_id ?? null,
              external_price_id: p.external_price_id ?? null,
              is_active: true,
              sync_status: 'synced'
            }] : []))
          return {
            id: p.slug,
            internalId: p.id,
            name: p.name,
            description: p.description ?? '',
            creditsPerMonth: p.credits_per_month,
            priceUsd: headlinePriceCents,
            currency: headlineCurrency,
            billingInterval: headlineInterval,
            features: p.features ?? [],
            featureGroupName: p.feature_group?.name ?? null,
            isPopular: p.is_popular === true,
            providers: mapProviders(topProviders),
            prices,
            introDiscounts: Array.isArray(p.intro_discounts) && p.intro_discounts.length > 0
              ? p.intro_discounts.map((d: any) => ({
                id: d.id,
                name: d.name,
                code: d.code,
                discountType: d.discount_type,
                amount: Number(d.amount) || 0,
                currency: d.currency ?? null,
                recur: d.recur === true,
                maxRecurringIntervals: d.max_recurring_intervals ?? null,
                // Paddle discount id + restriction info, used to reproduce the
                // checkout's localized/discounted totals via PricePreview.
                paddleDiscountId: d.paddle_raw?.id ?? null,
                restrictTo: d.paddle_raw?.restrictTo ?? d.paddle_raw?.restrict_to ?? null,
                paddleRaw: d.paddle_raw ?? null
              }))
              : [],
            introCreditPackages: Array.isArray(p.intro_credit_packages) && p.intro_credit_packages.length > 0
              ? p.intro_credit_packages.map((cp: any) => ({
                id: cp.id,
                slug: cp.slug,
                name: cp.name,
                credits: Number(cp.credits) || 0,
                quantity: Number(cp.quantity) || 1
              }))
              : []
          }
        })

      const packages = (packagesResp.data?.data ?? [])
        .filter((p: any) => p.product_type === 'credit_package')
        .map((p: any) => {
          const prices = Array.isArray(p.prices) ? p.prices : []
          const defaultPrice = prices.find((pr: any) => pr.is_default) || prices[0] || null
          const headlinePriceCents = defaultPrice?.price_cents ?? p.price_cents
          const headlineCurrency = defaultPrice?.currency ?? p.currency
          const topProviders = (p.providers && p.providers.length > 0)
            ? p.providers
            : (defaultPrice?.providers ?? (p.provider_slug ? [{
              slug: p.provider_slug,
              external_product_id: p.external_product_id ?? null,
              external_price_id: p.external_price_id ?? null,
              is_active: true,
              sync_status: 'synced'
            }] : []))
          return {
            id: p.slug,
            internalId: p.id,
            name: p.name,
            description: p.description ?? '',
            // Backend exposes credits-per-month for plans; for one-shot
            // packages this carries the bundled credit amount. Some payload
            // shapes use `credit_amount` / `credits` instead — fall back so
            // a renamed field can't crash the UI.
            credits: Number(
              p.credits_per_month
              ?? (p as any).credit_amount
              ?? (p as any).credits
              ?? 0
            ) || 0,
            priceUsd: Number(headlinePriceCents ?? 0) || 0,
            currency: headlineCurrency,
            // Backend curates merchandising via `is_popular`; the topup
            // card reads either `popular` or `isPopular`, so set both.
            popular: p.is_popular === true,
            isPopular: p.is_popular === true,
            providers: mapProviders(topProviders),
            prices
          }
        })

      this.trackCheckout('catalog_loaded', undefined, `plans:${plans.length}|pkgs:${packages.length}`)
      this.store.send({ type: 'CATALOG_LOADED', plans, packages })
    } catch (err: any) {
      this.store.send({ type: 'CATALOG_FAILED', message: err?.message ?? 'Catalog load failed' })
    }
  }

  /**
   * Poll our backend after the user finishes a Paddle checkout, until the
   * webhook has been processed. Per the brief: every 2s for the first 15s,
   * then every 5s up to a 60s soft cap. Hard ceiling at 5 minutes total.
   *
   * When a `transactionId` is available (all normal Paddle flows) we poll
   * `GET /billing/transaction/:txnId` for a terminal status — this works for
   * both credit topups and subscription purchases and confirms payment without
   * waiting for the subscription webhook to propagate. We fall back to
   * `GET /billing/subscription` only when there is no transactionId.
   *
   * On terminal failure (failed/canceled/refunded/disputed) we surface a
   * CHECKOUT_ERROR; on a soft-timeout we leave the result in 'processing' so
   * the user sees "Still processing — refresh in a minute" rather than an
   * incorrect failure.
   */
  private async pollPaymentConfirmation(intent: CheckoutIntent, transactionId?: string): Promise<void> {
    const LOG = '[plan-manager:poll]'
    const pollId = Math.random().toString(36).slice(2, 8)
    const tag = (m: string) => `${LOG} ${pollId} ${m}`

    planManagerLogger.log(tag('start'), { intent, transactionId })
    this.trackCheckout('polling_started', intent, transactionId)

    const billingApi: any = await this.call('auth', 'getBillingApi').catch(() => null)
    if (!billingApi) {
      planManagerLogger.warn(tag('abort: no billing api'))
      this.trackCheckout('error', intent, 'poll_no_billing_api')
      return
    }

    const start = Date.now()
    const SOFT_CAP_MS = 60_000
    const HARD_CAP_MS = 300_000
    const intervalAt = (elapsed: number) => (elapsed < 15_000 ? 2_000 : 5_000)

    // Use the transaction endpoint whenever we have a transactionId — it gives
    // a direct payment-confirmed signal for both topups and subscriptions,
    // without depending on the subscription webhook propagating first.
    // Only fall back to subscription polling when there's no transactionId
    // (shouldn't happen for normal Paddle flows).
    const useTransactionPoll = !!transactionId
    if (!useTransactionPoll && intent === 'topup') {
      planManagerLogger.warn(tag('topup poll without transactionId — single refresh fallback'))
      await this.completePurchaseRefresh()
      return
    }

    let tick = 0
    while (Date.now() - start < HARD_CAP_MS) {
      tick++
      const elapsed = Date.now() - start
      try {
        if (useTransactionPoll && transactionId) {
          const resp = await billingApi.getTransactionStatus(transactionId)
          const data: any = resp?.data
          const status = data?.status
          planManagerLogger.log(tag(`tick ${tick} transaction`), {
            elapsedMs: elapsed,
            httpOk: resp?.ok,
            httpStatus: resp?.status,
            txnStatus: status
          })
          this.trackCheckout('poll_tick', intent, status ?? 'pending')
          if (status && status !== 'pending') {
            if (status === 'completed') {
              planManagerLogger.log(tag('completed → refreshing account + permissions'))
              // completePurchaseRefresh emits the 'confirmed' success event.
              await this.completePurchaseRefresh()
            } else {
              const msg =
                status === 'failed' ? 'Payment failed.'
                  : status === 'canceled' ? 'Payment was canceled.'
                    : status === 'refunded' ? 'Payment was refunded.'
                      : status === 'disputed' ? 'Payment is under dispute.'
                        : `Payment ${status}.`
              planManagerLogger.warn(tag(`terminal failure: ${status}`))
              this.trackCheckout('error', intent, status)
              this.store.send({ type: 'CHECKOUT_ERROR', message: msg, transactionId })
            }
            return
          }
        } else {
          const resp = await billingApi.getSubscription()
          const hasActive = !!resp?.data?.hasActiveSubscription
          planManagerLogger.log(tag(`tick ${tick} subscription`), {
            elapsedMs: elapsed,
            httpOk: resp?.ok,
            httpStatus: resp?.status,
            hasActiveSubscription: hasActive,
            planSlug: resp?.data?.subscription?.planSlug ?? null
          })
          this.trackCheckout('poll_tick', intent, hasActive ? 'active' : 'pending')
          if (resp?.ok && hasActive) {
            planManagerLogger.log(tag('active subscription confirmed → refreshing account + permissions'))
            await this.completePurchaseRefresh()
            return
          }
        }
      } catch (err) {
        planManagerLogger.warn(tag(`tick ${tick} threw — keep polling`), err)
      }

      if (elapsed >= SOFT_CAP_MS) {
        planManagerLogger.warn(tag(`soft cap reached at ${elapsed}ms — UI stays in 'processing'`))
        this.trackCheckout('poll_tick', intent, 'soft_cap_timeout')
        return
      }
      const next = intervalAt(elapsed)
      planManagerLogger.debug(tag(`waiting ${next}ms before next tick`))
      await new Promise(r => setTimeout(r, next))
    }
    planManagerLogger.error(tag('hard cap reached without confirmation'))
    this.trackCheckout('error', intent, 'hard_cap_timeout')
  }

  /**
   * After a confirmed purchase / plan change / cancel, refresh everything the
   * user can see: local plan-manager data, the global access policy, the
   * permissions cache, and the credits counter. These drive the top-bar
   * avatar menu and feature-gated UI elsewhere in the IDE.
   */
  private async completePurchaseRefresh(): Promise<void> {
    const LOG = '[plan-manager:refresh]'
    planManagerLogger.log(LOG, 'start')
    await Promise.all([
      this.loadAccountData().catch(err => planManagerLogger.warn(LOG, 'loadAccountData failed', err)),
      this.call('auth', 'refreshAccessPolicy').catch(err => planManagerLogger.warn(LOG, 'refreshAccessPolicy failed', err))
    ])
    // Refresh permissions BEFORE credits. The credits-low nudge keys off the
    // `auth.creditsUpdated` event and checks whether the user now has quotas;
    // if credits refresh first, that check reads the *old* (quota-less) plan and
    // fires a "Running low" warning immediately after an upgrade. Sequencing the
    // permission refresh first ensures the new plan's quota is visible by then.
    await this.call('auth', 'refreshPermissions').catch(err => planManagerLogger.warn(LOG, 'refreshPermissions failed', err))
    await this.call('auth', 'refreshCredits').catch(err => planManagerLogger.warn(LOG, 'refreshCredits failed', err))
    // Promote 'processing' → 'success' in the panel. DATA_LOADED alone won't
    // do it because the data state is usually 'ready' (not 'refreshing') by
    // the time we get here; PURCHASE_CONFIRMED is handled at machine root.
    this.store.send({ type: 'PURCHASE_CONFIRMED' })
    const cr = this.store.getSnapshot().checkoutResult
    // Single source of truth for a fully-confirmed, account-refreshed purchase.
    this.trackCheckout('confirmed', cr?.intent, cr?.itemLabel)
    this.emit('purchaseConfirmed', { intent: cr?.intent, label: cr?.itemLabel })
    planManagerLogger.log(LOG, 'done')
  }

  private async loadAccountData(): Promise<void> {
    console.debug('[PlanManager] Loading account data')
    try {
      const [credits, subResp, permissions] = await Promise.all([
        this.call('auth', 'getCredits').catch(() => null) as Promise<any>,
        (async () => {
          const billingApi: any = await this.call('auth', 'getBillingApi').catch(() => null)
          if (!billingApi) return null
          const r = await billingApi.getSubscription()
          return r?.ok ? r.data : null
        })(),
        (async () => {
          const permissionsApi: any = await this.call('auth', 'getPermissionsApi').catch(() => null)
          if (!permissionsApi) return null
          const r = await permissionsApi.getPermissions()
          return r?.ok ? r.data : null
        })()
      ])
      this.store.send({
        type: 'DATA_LOADED',
        credits: credits ?? null,
        subscription: subResp?.subscription ?? null,
        permissions: permissions ?? null,
        // Backend exposes this top-level on the subscription response; defaults
        // to false when absent so the UI doesn't promise a trial we can't grant.
        isTrialEligible: !!subResp?.isTrialEligible
      })

      // Auto-open the panel to prompt email verification when:
      //   • the `ai:verified_accounts` feature is enabled (so the gate exists)
      //   • the user hasn't verified their email (or hasn't added one yet)
      //   • the panel isn't already open (avoid interrupting an active session)
      const gateEnabled = !!permissions && hasFeature(permissions, Features.AI_VERIFIED_ACCOUNTS)
      const emailMissing = permissions?.has_email === false
      const emailUnverified = permissions?.email_verified === false
      const panelAlreadyOpen = this.store.getSnapshot().isOpen
      const emailGateDiagnosis = !gateEnabled
        ? 'skip: ai:verified_accounts feature not enabled'
        : !emailMissing && !emailUnverified
          ? 'skip: email present and verified — no action needed'
          : panelAlreadyOpen
            ? 'skip: panel already open — not interrupting active session'
            : emailMissing
              ? 'FIRE: email not on file (has_email=false)'
              : 'FIRE: email present but unverified (email_verified=false)'
      planManagerLogger.log('[PlanManager:email-gate]', {
        diagnosis: emailGateDiagnosis,
        gateEnabled,
        has_email: permissions?.has_email,
        email_verified: permissions?.email_verified,
        emailMissing,
        emailUnverified,
        panelAlreadyOpen
      })
      if (gateEnabled && (emailMissing || emailUnverified) && !panelAlreadyOpen) {
        planManagerLogger.log('[PlanManager:email-gate] auto-opening panel → email-unverified')
        if (Math.random() < 0.60) {
          this.call('nudgePlugin', 'fire', 'app:time-to-promote-plans')
        }
        // Catalog wasn't loaded as part of this path — fetch it now so the
        // panel isn't empty when it opens on a fresh login.
        this.store.send({ type: 'CATALOG_LOAD' })
        void this.loadCatalog()
        this.call('menuicons', 'select', 'planManager').catch(() => { /* noop */ })
        return
      }

      // Auto-open to the Plans section for free-plan users so they see what's
      // available and are motivated to upgrade or top up. Only fires once per
      // session (not on every data refresh) and only when the plans surface is
      // enabled by the backend.
      const canShowPlans = hasFeature(permissions, Features.UI_SHOW_PLANS)
      const snap = this.store.getSnapshot()
      const planState = selectPlanState(snap)
      const isFreePlan = planState.kind === 'no_subscription'
      const freePlanGateDiagnosis = !canShowPlans
        ? 'skip: ui:show-plans feature not enabled'
        : !isFreePlan
          ? `skip: user has plan (kind=${planState.kind}, planId=${planState.planId ?? 'none'}) — no upgrade prompt`
          : this.freePlanAutoOpenFired
            ? 'skip: already fired once this session'
            : panelAlreadyOpen
              ? 'skip: panel already open — not interrupting active session'
              : 'FIRE: free plan user, panel not open, first time this session'
      planManagerLogger.log('[PlanManager:free-plan-gate]', {
        diagnosis: freePlanGateDiagnosis,
        canShowPlans,
        planKind: planState.kind,
        planId: planState.planId ?? null,
        isFreePlan,
        alreadyFired: this.freePlanAutoOpenFired,
        panelAlreadyOpen
      })
      if (canShowPlans && isFreePlan && !this.freePlanAutoOpenFired && !panelAlreadyOpen) {
        this.freePlanAutoOpenFired = true
        planManagerLogger.log('[PlanManager:free-plan-gate] auto-opening panel → free plan')
        if (Math.random() < 0.60) {
          this.call('nudgePlugin', 'fire', 'app:time-to-promote-plans')
        }
        // Catalog wasn't loaded as part of this path — fetch it now so plans
        // are visible immediately without having to close and reopen the panel.
        this.store.send({ type: 'CATALOG_LOAD' })
        void this.loadCatalog()
        this.call('menuicons', 'select', 'planManager').catch(() => { /* noop */ })
      }
    } catch (err: any) {
      this.store.send({ type: 'DATA_FAILED', message: err?.message ?? 'Failed to load account data' })
    }
  }

  setDispatch(dispatch: React.Dispatch<any>): void {
    this.dispatch = dispatch
    this.renderComponent()
  }

  renderComponent(): void {
    this.dispatch({ plugin: this })
  }

  updateComponent(state: any): JSX.Element {
    return <PlanManagerUI plugin={state.plugin || this} />
  }

  render(): JSX.Element {
    return (
      <div id="planManager" className="h-100">
        <PluginViewWrapper plugin={this} />
      </div>
    )
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   React glue
   ───────────────────────────────────────────────────────────────────────── */

/** Subscribe a component to the store via `useSyncExternalStore`. */
function useStoreSnapshot(plugin: PlanManagerPlugin): PlanManagerSnapshot {
  return useSyncExternalStore(
    plugin.store.subscribe,
    plugin.store.getSnapshot,
    plugin.store.getSnapshot
  )
}

const PlanManagerUI: React.FC<{ plugin: PlanManagerPlugin }> = ({ plugin }) => {
  const snap = useStoreSnapshot(plugin)
  if (!snap.isOpen) return <PlanManagerStub plugin={plugin} />
  return <PlanManagerOverlay plugin={plugin} snap={snap} />
}

const PlanManagerStub: React.FC<{ plugin: PlanManagerPlugin }> = ({ plugin }) => (
  <div className="plan-manager-stub">
    <div className="plan-manager-stub-glyph">
      <i className="fas fa-wallet"></i>
    </div>
    <h5>Plan & Credits</h5>
    <p>Compare plans, top up AI credits, and track your AI usage in one place.</p>
    <button
      data-id="planManagerStubOpenButton"
      className="plan-manager-stub-btn"
      onClick={() => plugin.open()}
    >
      Manage Plan & Credits
    </button>
  </div>
)

/* ─────────────────────────────────────────────────────────────────────────────
   Overlay
   ───────────────────────────────────────────────────────────────────────── */

const PlanManagerOverlay: React.FC<{
  plugin: PlanManagerPlugin
  snap: PlanManagerSnapshot
}> = ({ plugin, snap }) => {
  // 'credits' = default landing view (hero + quotas). Other tabs expand
  // their own section and collapse the credits view. null means no tab is
  // active (used internally when a feature is hidden by permissions).
  const [activeSection, setActiveSection] = React.useState<'credits' | 'plans' | 'topup' | 'usage' | null>('credits')

  // When a non-UI plugin opens us with an intent, follow its routing
  // hint. We track the intent identity (reference) so a fresh OPEN_OVERLAY
  // re-applies even if the user has since navigated away.
  const intent = snap.openIntent
  const lastIntentRef = React.useRef<OpenIntent | null>(null)
  // The section an external intent wants us to land on. Held in a ref so we
  // can (re)apply it once the backing permissions/catalog load. open() races
  // ahead of refreshOnOpen(), so when the intent first fires the target
  // section is still default-denied (permissions === null → hidden) and the
  // "keep activeSection honest" effect below would otherwise drop it, leaving
  // the panel blank with no way to recover the intent.
  const pendingSectionRef = React.useRef<'credits' | 'plans' | 'topup' | 'usage' | null>(null)
  useEffect(() => {
    if (!intent || intent === lastIntentRef.current) {
      planManagerLogger.log('[PlanManager:section] intent effect skipped', {
        hasIntent: !!intent,
        sameAsLast: intent === lastIntentRef.current,
        intent
      })
      return
    }
    lastIntentRef.current = intent
    let target: 'credits' | 'plans' | 'topup' | 'usage' | null = null
    if (intent.initialSection) {
      target = intent.initialSection
    } else if (intent.reason === 'feature-required' || intent.reason === 'quota-exhausted') {
      // Sensible defaults when the caller didn't pin a section.
      target = intent.reason === 'quota-exhausted' ? 'topup' : 'plans'
    }
    // Otherwise leave the section collapsed — the user opened the panel
    // from the menu icon and we don't want to push a particular screen.
    pendingSectionRef.current = target
    planManagerLogger.log('[PlanManager:section] intent effect applied', {
      intent,
      initialSection: intent.initialSection ?? null,
      reason: intent.reason ?? null,
      resolvedTarget: target
    })
    if (target) setActiveSection(target)
  }, [intent])

  // While a Paddle checkout is in flight (card entry or payment confirmation)
  // an accidental dismiss would abort the transaction, so we suppress the
  // backdrop-click and Escape shortcuts until it resolves. The explicit X /
  // cancel controls still work.
  const isCheckoutActive = (!!snap.pendingCheckout && !snap.checkoutResult) || (snap.checkoutResult?.kind === 'processing')

  // Close-on-Escape — UI concern, stays in React.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !isCheckoutActive) plugin.close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [plugin, isCheckoutActive])

  // Pure derivations — every render reads fresh from the snapshot.
  const planCtx = useMemo(() => selectPlanState(snap), [snap])
  const status = useMemo(() => selectCreditStatus(snap), [snap])
  const activeAlert: ActiveAlert = useMemo(() => selectActiveAlert(snap), [snap])
  const visiblePlans = useMemo(() => selectVisiblePlans(snap), [snap])
  const visiblePackages = useMemo(() => selectVisiblePackages(snap), [snap])
  const quotas = useMemo(() => selectQuotas(snap), [snap])
  const canUpgrade = useMemo(() => selectCanUpgrade(snap), [snap])
  const checkoutResult = selectCheckoutResult(snap)
  const purchasingProductId = selectPurchasingProductId(snap)

  // Localized list prices for the plan cards + top-up grid. One batched
  // Paddle PricePreview call covering every visible price; the cards fall
  // back to static USD until (and unless) this resolves.
  const [catalogPrices, setCatalogPrices] = useState<CatalogPricePreview | null>(null)
  const catalogPriceKey = useMemo(
    () => [...visiblePlans, ...visiblePackages].map((p: any) => p.id).join('|'),
    [visiblePlans, visiblePackages]
  )
  useEffect(() => {
    if (!snap.isOpen || !catalogPriceKey) return
    let cancelled = false
    void plugin.previewCatalogPrices().then(res => { if (!cancelled) setCatalogPrices(res) })
    return () => { cancelled = true }
  }, [plugin, snap.isOpen, snap.isAuthenticated, catalogPriceKey])

  // Section visibility — driven by `ui:show-*` features on /permissions.
  // When all are absent we collapse to a minimal "Signed in as <plan>"
  // identity card (PlanIdentityCard) below. See selectUiVisibility for
  // default-deny rationale.
  const ui: UiVisibility = useMemo(() => selectUiVisibility(snap), [snap])
  const requiresEmailVerification = !!snap.permissions
    && hasFeature(snap.permissions, Features.AI_VERIFIED_ACCOUNTS)
    && (snap.permissions.has_email === false || snap.permissions.email_verified === false)
  // Keep `activeSection` honest with permissions: if the user (or an
  // intent) selected a tab the backend has since hidden, drop the
  // selection so we don't render a section without its nav entry.
  useEffect(() => {
    // A pending intent section takes priority: re-apply it the moment its
    // visibility resolves (permissions arrive after the open()/refresh race),
    // and keep its tab selected meanwhile instead of collapsing to a blank
    // panel — the section renders its own loading/empty state until then.
    const pending = pendingSectionRef.current
    planManagerLogger.log('[PlanManager:section] reconcile effect run', {
      pending,
      activeSection,
      ui: {
        showCredits: ui.showCredits,
        showPlans: ui.showPlans,
        showTopUps: ui.showTopUps,
        showUsage: ui.showUsage,
        anyVisible: ui.anyVisible
      }
    })
    if (pending) {
      const pendingVisible =
        pending === 'credits' ? ui.showCredits :
          pending === 'plans' ? ui.showPlans :
            pending === 'topup' ? ui.showTopUps :
              pending === 'usage' ? ui.showUsage : false
      if (pendingVisible) {
        planManagerLogger.log('[PlanManager:section] pending section now visible — applying', { pending })
        setActiveSection(pending)
        pendingSectionRef.current = null
      } else {
        planManagerLogger.log('[PlanManager:section] pending section not yet visible — holding tab', { pending })
      }
      if (pending === activeSection) return
      // An intent still wants a (not-yet-visible) section — let it win;
      // don't fall back yet or we'd flicker through another tab first.
      if (pending) return
    }
    // Is the current selection still backed by a visible nav entry?
    const currentVisible =
      activeSection === 'credits' ? ui.showCredits :
        activeSection === 'plans' ? ui.showPlans :
          activeSection === 'topup' ? ui.showTopUps :
            activeSection === 'usage' ? ui.showUsage :
              false // null === nothing selected
    if (!currentVisible) {
      // The selected tab (or the default 'credits' landing) is hidden by
      // permissions. Rather than collapse to a blank panel, fall back to the
      // first visible section. This is what lands a free-tier user (no
      // `ui:show-credits` grant) on Plans automatically instead of a blank
      // body under visible tabs.
      const fallback: 'credits' | 'plans' | 'topup' | 'usage' | null =
        ui.showCredits ? 'credits' :
          ui.showPlans ? 'plans' :
            ui.showTopUps ? 'topup' :
              ui.showUsage ? 'usage' : null
      if (fallback !== activeSection) {
        planManagerLogger.log('[PlanManager:section] falling back to first visible section', {
          from: activeSection,
          to: fallback,
          ui: {
            showCredits: ui.showCredits,
            showPlans: ui.showPlans,
            showTopUps: ui.showTopUps,
            showUsage: ui.showUsage
          }
        })
        setActiveSection(fallback)
      }
    }
  }, [activeSection, ui.showCredits, ui.showPlans, ui.showTopUps, ui.showUsage])

  // ── Diagnostic: full picture on every meaningful change ──────────────────
  useEffect(() => {
    const p = snap.permissions as any
    const uiKeys = p
      ? Object.keys(p).filter(k => k.startsWith('ui:') || k.startsWith('ui_show') || k.includes('show'))
      : []
    planManagerLogger.log('[PlanManager:diag] state snapshot', {
      isOpen: snap.isOpen,
      isAuthenticated: snap.isAuthenticated,
      dataState: snap.dataState,
      openIntent: snap.openIntent,
      activeSection,
      pendingSection: pendingSectionRef.current,
      ui: {
        showCredits: ui.showCredits,
        showPlans: ui.showPlans,
        showTopUps: ui.showTopUps,
        showUsage: ui.showUsage,
        anyVisible: ui.anyVisible
      },
      catalogPlans: snap.catalogPlans?.length ?? 0,
      visiblePlans: visiblePlans.length,
      hasPermissions: !!snap.permissions,
      permissionUiKeys: uiKeys,
      requiresEmailVerification
    })
  }, [snap.isOpen, snap.isAuthenticated, snap.dataState, snap.openIntent, snap.permissions, snap.catalogPlans, activeSection, ui.showCredits, ui.showPlans, ui.showTopUps, ui.showUsage, visiblePlans.length, requiresEmailVerification])

  const refreshDate = formatDate(status.refreshDate)

  return (
    <div className="pm-backdrop" onClick={() => { if (!isCheckoutActive) plugin.close() }}>
      <div className={`pm-shell pm-shell--${status.state}`} onClick={(e) => e.stopPropagation()}>
        <div className="pm-atmosphere" aria-hidden>
          <div className="pm-atmosphere__orb pm-atmosphere__orb--a" />
          <div className="pm-atmosphere__orb pm-atmosphere__orb--b" />
          <div className="pm-atmosphere__orb pm-atmosphere__orb--c" />
          <div className="pm-atmosphere__grid" />
          <div className="pm-atmosphere__grain" />
        </div>

        <header className="pm-topbar">
          <div className="pm-topbar__brand">
            <span className="pm-topbar__dot" />
            <span className="pm-topbar__eyebrow">Account</span>
            <span className="pm-topbar__sep">/</span>
            <span className="pm-topbar__title">Plan&nbsp;&amp;&nbsp;Credits</span>
          </div>

          <DevSwitchers plugin={plugin} snap={snap} debug={plugin.debugUI} />

          <button
            data-id="planManagerCloseButton"
            className="pm-close"
            onClick={() => plugin.close()}
            aria-label="Close"
          >
            <i className="fas fa-times"></i>
          </button>
        </header>

        {checkoutResult && (
          <CheckoutResultScreen
            result={checkoutResult}
            onDismiss={() => plugin.setCheckoutResult(null)}
            onViewPlans={() => { plugin.setCheckoutResult(null); setActiveSection('plans') }}
            onViewTopUps={() => { plugin.setCheckoutResult(null); setActiveSection('topup') }}
          />
        )}

        {/*
          Auth gate. Remix AI requires an account, so when the user is not
          signed in we hide everything else (catalog, hero, alerts) and show
          a focused sign-up prompt. This takes precedence over the data state
          since none of the data-driven UI is meaningful without a user.
        */}
        {!checkoutResult && !snap.isAuthenticated && (
          <SignInPromptScreen plugin={plugin} />
        )}

        {!checkoutResult && snap.isAuthenticated && snap.dataState === 'loading' && <PlanManagerSkeleton />}
        {!checkoutResult && snap.isAuthenticated && snap.dataState === 'error' && (
          <PlanManagerError
            message={snap.errorMessage}
            onRetry={() => plugin.refresh()}
          />
        )}
        {/*
          Email verification gate. The backend now blocks AI access until the
          user has a confirmed email on file (so we don't burn included credits on
          burner addresses, and so SIWE-only accounts can recover their plan).
          When `email_verified` is false (or `has_email` is false for SIWE
          users) we hide the catalog/hero/alerts and show a focused verify
          flow. Re-fetching permissions after a successful verify naturally
          unlocks the rest of the UI.
        */}
        {!checkoutResult && snap.isAuthenticated && snap.dataState === 'ready'
          && requiresEmailVerification && (
          <EmailVerificationScreen
            plugin={plugin}
            permissions={snap.permissions}
          />
        )}
        {!checkoutResult && snap.isAuthenticated && snap.dataState === 'ready'
          && !requiresEmailVerification && (() => {
          // While the inline Paddle checkout is open we hide all the
          // surrounding context (hero, alerts, promo, quotas, nav) so the
          // user can focus on completing payment. The checkout panel
          // becomes the only thing in the main area. Same for the cart
          // upsell step — no need to show hero/alerts/nav behind it.
          const checkoutActive = (!!snap.pendingCheckout && !snap.checkoutResult)
            || (snap.cartItems.length > 0 && !snap.checkoutResult)
          // A nav section is open → collapse the landing content so the
          // selected section gets all the space.
          const sectionActive = activeSection !== null
          return <>

            {/*
            When the user has no `ui:show-*` features granted we collapse
            the overlay to a minimal identity card. Onboarding flows use
            this to confirm sign-in without exposing the (currently
            irrelevant) plans/credits/quotas surface.
          */}
            {!checkoutActive && !ui.anyVisible && (
              <PlanIdentityCard planCtx={planCtx} />
            )}

            {/* Resume nudge — surfaces an unfinished checkout the user can
              pick back up. Always shown while a pending checkout exists (and
              we're not already inside checkout), so it stays in lock-step
              with the top-bar cart button. Not dismissible by design. */}
            {!checkoutActive && snap.resumeCheckouts.length > 0 && (
              <ResumeCheckoutBanner
                checkout={snap.resumeCheckouts[0]}
                onResume={() => { void plugin.resumeCheckout(snap.resumeCheckouts[0].transaction_id) }}
                onDiscard={() => { void plugin.discardCheckout(snap.resumeCheckouts[0].transaction_id) }}
              />
            )}

            {/* Alerts are credit/plan-oriented — only meaningful when
              at least one of those surfaces is visible. Shown above nav
              so urgent warnings are never buried. */}
            {!checkoutActive && ui.anyVisible && activeAlert === 'beta-transition' && (
              <BetaTransitionAlert
                planCtx={planCtx}
                onUpgrade={() => setActiveSection('plans')}
                onTopUp={() => setActiveSection('topup')}
              />
            )}

            {!checkoutActive && ui.anyVisible && activeAlert === 'plan-lifecycle' && (
              <PlanLifecycleAlert
                planCtx={planCtx}
                onRenew={() => setActiveSection('plans')}
                onUpgrade={() => setActiveSection('plans')}
              />
            )}

            {!checkoutActive && ui.showCredits && activeAlert === 'credit' && (
              <CreditAlert
                status={status}
                refreshDate={refreshDate}
                canUpgrade={canUpgrade}
                onTopUp={() => setActiveSection('topup')}
                onUpgrade={() => setActiveSection('plans')}
              />
            )}

            {/* Nav tabs — placed right after alerts so they sit at a
              predictable position. Credits is always the first tab and
              shows the default landing view (hero + quotas). */}
            {!checkoutActive && (ui.showCredits || ui.showPlans || ui.showTopUps || ui.showUsage) && (
              <nav className="pm-nav">
                {([
                  { id: 'credits', label: 'Credits', icon: 'fas fa-coins', visible: ui.showCredits },
                  { id: 'plans', label: 'Plans', icon: 'fas fa-layer-group', visible: ui.showPlans },
                  { id: 'topup', label: 'Top up', icon: 'fas fa-bolt', visible: ui.showTopUps },
                  { id: 'usage', label: 'Usage breakdown', icon: 'fas fa-chart-bar', visible: ui.showUsage }
                ] as const).filter(s => s.visible).map(s => (
                  <button
                    key={s.id}
                    data-id={`planManagerNav-${s.id}`}
                    className={`pm-nav__item ${activeSection === s.id ? 'is-active' : ''}`}
                    // Click on the active tab collapses it — we want a calm
                    // landing view, so re-clicking the same tab returns to it.
                    onClick={() => setActiveSection(prev => prev === s.id ? null : s.id)}
                  >
                    <i className={s.icon}></i>
                    <span>{s.label}</span>
                  </button>
                ))}
              </nav>
            )}

            {/* Credits view — shown when the Credits tab is active. */}
            {!checkoutActive && activeSection === 'credits' && ui.showCredits && (
              <Hero
                status={status}
                refreshDate={refreshDate}
                planCtx={planCtx}
                heroCompact={activeAlert === 'beta-transition' || activeAlert === 'plan-lifecycle'}
                onTopUp={ui.showTopUps ? (() => setActiveSection('topup')) : undefined}
              />
            )}

            {/*
            Upgrade promo — only on the credits view, no alert already
            showing its own CTA.
          */}
            {!checkoutActive && activeSection === 'credits' && ui.showPlans && !activeAlert && canUpgrade && (
              <UpgradePromoBanner
                planCtx={planCtx}
                plans={visiblePlans}
                localizedPrices={catalogPrices?.byPaddlePriceId ?? null}
                onUpgrade={() => setActiveSection(s => s === 'plans' ? null : 'plans')}
              />
            )}

            {!checkoutActive && activeSection === 'credits' && ui.showQuotas && (
              <QuotasPanel
                quotas={quotas}
                aiModels={snap.permissions?.ai_models}
                paidCredits={snap.credits?.paid_credits ?? 0}
                canUpgrade={canUpgrade && ui.showPlans}
                onUpgrade={() => setActiveSection('plans')}
                onTopUp={() => setActiveSection('topup')}
              />
            )}

            <main className="pm-main">
              {/* Inline Paddle checkout container — visible while checkout is in progress */}
              {snap.pendingCheckout && !snap.checkoutResult && (() => {
                const pending = snap.pendingCheckout
                const plan = pending.intent !== 'topup'
                  ? snap.catalogPlans.find(p => p.id === pending.productId)
                  : null
                const pkg = pending.intent === 'topup'
                  ? snap.catalogPackages.find(p => p.id === pending.productId)
                  : null
                const productName = plan?.name ?? pkg?.name ?? pending.itemLabel ?? 'Your order'
                const priceCents = plan?.priceUsd ?? pkg?.priceUsd ?? 0
                // Localized headline price for this product (from the batched
                // catalog preview), matching the localized Paddle breakdown
                // below. Falls back to USD until/unless the preview resolves.
                const productObj: any = plan ?? pkg
                const productCartItem = snap.cartItems.find(i => i.slug === (plan?.id ?? pkg?.id))
                const productPrices: any[] = Array.isArray(productObj?.prices) ? productObj.prices : []
                const productSelectedPrice = (typeof productCartItem?.priceId === 'number'
                  ? productPrices.find((pr: any) => pr.id === productCartItem.priceId)
                  : null) ?? productPrices.find((pr: any) => pr.is_default) ?? productPrices[0] ?? null
                const productPaddleId = paddlePriceIdOf(productSelectedPrice, productObj)
                const productLocalized = productPaddleId ? catalogPrices?.byPaddlePriceId?.[productPaddleId] ?? null : null
                const priceFormatted = productLocalized ? productLocalized.formatted : `$${(priceCents / 100).toFixed(2)}`
                const billingLabel = plan
                  ? `per ${plan.billingInterval === 'year' ? 'year' : 'month'}`
                  : 'one-time'
                const features = plan?.features ?? []
                const credits = plan?.creditsPerMonth ?? pkg?.credits ?? null
                // Extra items in cart (credit add-ons bundled with the plan).
                const cartAddons = snap.cartItems.filter(i => i.productType === 'credit_package')
                // Intro credit packages auto-added by the backend (free gifts).
                const introCreditPkgs = plan?.introCreditPackages ?? []

                // Intro launch-offer banner — the same promo merchandised on
                // the plan cards, reinforced here so the user sees why their
                // "due today" is lower than the headline price.
                const introDiscount = (plan?.introDiscounts ?? [])[0] ?? null
                let introOfferLabel: string | null = null
                let discountedPriceFormatted: string | null = null
                if (introDiscount && priceCents > 0) {
                  const isPct = introDiscount.discountType === 'percentage'
                  // Localize the crossed price for percentage discounts (exact
                  // off the localized base). Fixed-amount discounts are USD, so
                  // when localized we keep the base price only (no currency mix).
                  if (productLocalized) {
                    if (isPct) {
                      const dm = Math.max(0, Math.floor(productLocalized.rawMinor * (1 - introDiscount.amount / 100)))
                      if (dm < productLocalized.rawMinor) discountedPriceFormatted = formatPaddleMinor(dm, productLocalized.currencyCode)
                    }
                  } else {
                    const discountedCents = isPct
                      ? Math.max(0, Math.floor(priceCents * (1 - introDiscount.amount / 100)))
                      : Math.max(0, priceCents - Math.round(introDiscount.amount * 100))
                    if (discountedCents < priceCents) {
                      discountedPriceFormatted = `$${(discountedCents / 100).toFixed(2)}`
                    }
                  }
                  const unit = plan?.billingInterval === 'year' ? 'year' : 'month'
                  const intervals = introDiscount.maxRecurringIntervals
                  const duration = !introDiscount.recur || !intervals || intervals === 1
                    ? `first ${unit}`
                    : `first ${intervals} ${unit}s`
                  introOfferLabel = isPct
                    ? `${Math.round(introDiscount.amount)}% off ${duration}`
                    : `$${introDiscount.amount.toFixed(2)} off ${duration}`
                }

                // Live breakdown from Paddle (totals are already in major units).
                const bd = snap.checkoutBreakdown
                const fmtMoney = (amount: number, currency = bd?.currencyCode ?? 'USD') => {
                  try {
                    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
                  } catch {
                    return `${currency} ${amount.toFixed(2)}`
                  }
                }
                const cadenceLabel = (cycle: CheckoutBreakdown['billingCycle']) => {
                  if (!cycle) return ''
                  const unit = cycle.interval
                  return cycle.frequency === 1
                    ? `per ${unit}`
                    : `every ${cycle.frequency} ${unit}s`
                }

                return (
                  <div className="pm-inline-checkout">
                    <div className="pm-inline-checkout__header">
                      <button
                        className="pm-inline-checkout__back"
                        onClick={() => plugin.cancelCheckout('back_to_plans')}
                      >
                        <i className="fas fa-arrow-left"></i>
                        <span>Back to plans</span>
                      </button>
                    </div>
                    <div className="pm-inline-checkout__body">
                      {/* Order summary side */}
                      <aside className="pm-inline-checkout__summary">
                        <h3 className="pm-inline-checkout__product-name">{productName}</h3>
                        <div className="pm-inline-checkout__price">
                          {discountedPriceFormatted && (
                            <span className="pm-inline-checkout__price-was">{priceFormatted}</span>
                          )}
                          <span className="pm-inline-checkout__price-amount">{discountedPriceFormatted ?? priceFormatted}</span>
                          <span className="pm-inline-checkout__price-period">{billingLabel}</span>
                        </div>
                        {credits !== null && credits > 0 && (
                          <div className="pm-inline-checkout__credits">
                            <i className="fas fa-bolt"></i>
                            <span>{credits.toLocaleString()} credits{plan ? ' / month' : ''}</span>
                          </div>
                        )}

                        {introOfferLabel && (
                          <div className="pm-inline-checkout__intro-offer" title={introDiscount?.name ?? undefined}>
                            <i className="fas fa-tags" aria-hidden></i>
                            <span>{introDiscount?.name ? `${introDiscount.name}` : introOfferLabel}</span>
                          </div>
                        )}

                        {/* Bundled credit add-ons from multi-item cart */}
                        {(cartAddons.length > 0 || introCreditPkgs.length > 0) && (
                          <div className="pm-inline-checkout__addons">
                            <div className="pm-inline-checkout__addons-label">Also in this order:</div>
                            {introCreditPkgs.map((cp: any) => (
                              <div key={cp.slug} className="pm-inline-checkout__addon-row pm-inline-checkout__addon-row--gift">
                                <span><i className="fas fa-gift"></i> {cp.name || `${(cp.credits * (cp.quantity || 1)).toLocaleString()} free AI credits`}</span>
                                <span className="pm-inline-checkout__addon-free">FREE</span>
                              </div>
                            ))}
                            {cartAddons.map(addon => {
                              const addonPkg: any = snap.catalogPackages.find(p => p.id === addon.slug)
                              const addonPrices: any[] = Array.isArray(addonPkg?.prices) ? addonPkg.prices : []
                              const addonPrice = (typeof addon.priceId === 'number'
                                ? addonPrices.find((pr: any) => pr.id === addon.priceId)
                                : null) ?? addonPrices.find((pr: any) => pr.is_default) ?? addonPrices[0] ?? null
                              const addonPaddleId = paddlePriceIdOf(addonPrice, addonPkg)
                              const addonLoc = addonPaddleId ? catalogPrices?.byPaddlePriceId?.[addonPaddleId] ?? null : null
                              return (
                                <div key={addon.slug} className="pm-inline-checkout__addon-row">
                                  <span><i className="fas fa-bolt"></i> {addon.name}</span>
                                  <span>{addonLoc ? addonLoc.formatted : `$${(addon.priceCents / 100).toFixed(2)}`}</span>
                                </div>
                              )
                            })}
                          </div>
                        )}

                        {/* Live price breakdown from Paddle — appears once the
                          checkout iframe loads and updates as the user enters
                          country/VAT or applies a discount. */}
                        {bd ? (
                          <div className="pm-inline-checkout__breakdown">
                            <div className="pm-inline-checkout__line">
                              <span>Subtotal</span>
                              <span>{fmtMoney(bd.subtotal)}</span>
                            </div>
                            {bd.discount > 0 && (
                              <div className="pm-inline-checkout__line pm-inline-checkout__line--discount">
                                <span>
                                Discount
                                  {bd.discountCode ? ` (${bd.discountCode})` : ''}
                                </span>
                                <span>-{fmtMoney(bd.discount)}</span>
                              </div>
                            )}
                            {bd.tax > 0 && (
                              <div className="pm-inline-checkout__line">
                                <span>VAT / Tax</span>
                                <span>{fmtMoney(bd.tax)}</span>
                              </div>
                            )}
                            <div className="pm-inline-checkout__line pm-inline-checkout__line--total">
                              <span>Due today</span>
                              <span>{fmtMoney(bd.total)}</span>
                            </div>

                            {bd.recurring && bd.billingCycle && (
                              <div className="pm-inline-checkout__renews">
                              Then {fmtMoney(bd.recurring.total)} {cadenceLabel(bd.billingCycle)}
                              </div>
                            )}
                            <span className="pm-inline-checkout__renews" >By completing your purchase, you agree to our </span><span><a href="https://remix.live/termsandconditions" target="_blank" rel="noreferrer"><strong>Terms and Conditions</strong></a></span>
                          </div>
                        ) : features.length > 0 && (
                          <ul className="pm-inline-checkout__features">
                            {features.map((f, i) => (
                              <li key={i}>
                                <i className="fas fa-check"></i>
                                <span>{f}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        <div className="pm-inline-checkout__secure">
                          <i className="fas fa-lock"></i>
                          <span>Secure checkout powered by Paddle</span>
                        </div>
                      </aside>
                      {/* Paddle inline frame */}
                      <div className="pm-inline-checkout__frame">
                        {snap.checkoutNotice && (
                          <div
                            className={`pm-inline-checkout__notice pm-inline-checkout__notice--${snap.checkoutNotice.level}`}
                            role="alert"
                          >
                            <i className={`fas ${snap.checkoutNotice.level === 'error' ? 'fa-circle-exclamation' : 'fa-triangle-exclamation'}`}></i>
                            <div className="pm-inline-checkout__notice-body">
                              <span>{snap.checkoutNotice.message}</span>
                              <span className="pm-inline-checkout__notice-help">
                                Having trouble?{' '}
                                <a href={DISCORD_URL} target="_blank" rel="noreferrer">
                                  <i className="fab fa-discord"></i> Reach out to us on Discord
                                </a>
                              </span>
                            </div>
                            <button
                              type="button"
                              className="pm-inline-checkout__notice-dismiss"
                              aria-label="Dismiss"
                              onClick={() => plugin.store.send({ type: 'CHECKOUT_NOTICE_DISMISS' })}
                            >
                              <i className="fas fa-times"></i>
                            </button>
                          </div>
                        )}
                        <div className="paddle-checkout-container" />
                      </div>
                    </div>
                  </div>
                )
              })()}
              {!(snap.pendingCheckout && !snap.checkoutResult) && snap.cartItems.length > 0 && !snap.checkoutResult && (
                <CartUpsellStep
                  cart={snap.cartItems}
                  packages={visiblePackages}
                  plans={visiblePlans}
                  plugin={plugin}
                />
              )}
              {!(snap.pendingCheckout && !snap.checkoutResult) && snap.cartItems.length === 0 && ui.showPlans && activeSection === 'plans' && (
                <PlansSection
                  plans={visiblePlans}
                  currentPlanId={planCtx.planId}
                  userFeatureGroups={snap.permissions?.feature_groups ?? []}
                  isTrialEligible={snap.isTrialEligible}
                  purchasingId={purchasingProductId}
                  requiredFeature={intent?.requiredFeature ?? null}
                  localizedPrices={catalogPrices?.byPaddlePriceId ?? null}
                  onSubscribe={(planId, priceId) => plugin.subscribeToPlan(planId, priceId)}
                  onCancel={() => plugin.cancelSubscription()}
                  onReactivate={() => plugin.reactivateSubscription()}
                  cancelledNotice={planCtx.kind === 'paid' && planCtx.isCancelled ? { expiresOn: planCtx.expiresOn } : null}
                />
              )}
              {!(snap.pendingCheckout && !snap.checkoutResult) && snap.cartItems.length === 0 && ui.showTopUps && activeSection === 'topup' && (
                <TopUpSection
                  packages={visiblePackages}
                  purchasingId={purchasingProductId}
                  localizedPrices={catalogPrices?.byPaddlePriceId ?? null}
                  onPurchase={(packageId) => plugin.purchaseCredits(packageId)}
                  totalAvailable={status.hasUnlimitedIncluded ? null : status.paidRemaining + status.includedRemaining}
                />
              )}
              {ui.showUsage && activeSection === 'usage' && <UsageSection plugin={plugin} />}
            </main>

          </>
        })()}

        <footer className="pm-footer">
          <div className="pm-footer__legal">
            {snap.isAuthenticated
              ? <>Signed in · billing data live</>
              : <>Catalog only. Sign in to manage your subscription.</>}
          </div>
          <div className="pm-footer__vat">All prices exclude VAT/tax where applicable</div>
          <div className="pm-footer__links">
            <a href="https://remix.live/termsandconditions" target="_blank" rel="noreferrer">Terms and Conditions</a>
            <a href="https://remix-ide.readthedocs.io/" target="_blank" rel="noreferrer">Docs</a>
            <a href={DISCORD_URL} target="_blank" rel="noreferrer">Support</a>
          </div>
        </footer>

        {snap.confirmDialog && (
          <ConfirmModal
            dialog={snap.confirmDialog}
            onResolve={(value) => plugin.resolveConfirm(value)}
          />
        )}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   QuotasPanel — per-(provider, model) usage caps tied to the active plan.

   The backend ships a normalized `quotas` array on the balance endpoint
   (when called with `?include=quotas`). Each row is one (provider, model,
   period) bucket the user is entitled to via their active feature groups.

   Rendering rules per QUOTAS_FRONTEND_BRIEF:
     - Sort comes pre-applied (amount ASC, tightest cap first).
     - `amount >= 1e15` → unlimited; show ∞ badge, no bar.
     - `amount === 0`   → quota disabled; filtered out in selectQuotas.
     - `provider/model === '*'` → "All providers" / "All models".
     - Bar colour by usedPct: <70 green, 70–89 amber, ≥90 red.
     - "Resets in 7h 12m" for daily, "Resets Mon, May 25" weekly,
       "Resets Jun 1, 2026" monthly.
     - Empty list → render nothing (no awkward "no quotas" copy).
   ───────────────────────────────────────────────────────────────────────── */

const UNLIMITED_THRESHOLD = 1e15

// `permissions.ai_models` shape — we only depend on these two fields so type
// it locally to avoid pulling the whole AccountPermissions surface.
type ModelLookup = ReadonlyArray<{ id: string; display_name?: string; provider?: string }> | undefined

function prettifyProvider(slug: string): string {
  if (slug === '*') return 'All providers'
  // 'mistralai' → 'Mistralai', 'anthropic' → 'Anthropic'. Backend slugs
  // are lowercase identifiers, not user-facing copy, so a simple cap is
  // good enough until we add a provider catalogue.
  if (!slug) return ''
  return slug.charAt(0).toUpperCase() + slug.slice(1)
}

function prettifyModel(slug: string, lookup: ModelLookup): string {
  if (slug === '*') return 'All models'
  const hit = lookup?.find(m => m.id === slug)
  if (hit?.display_name) return hit.display_name
  // Fallback: turn 'mistral-small-latest' → 'Mistral Small Latest'
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ')
}

function formatQuotaLabel(q: QuotaEntry, lookup: ModelLookup): string {
  const model = prettifyModel(q.model, lookup)
  const provider = prettifyProvider(q.provider)
  // When the model is wildcarded but the provider is concrete, lead with
  // the provider ("Mistralai · All models"). When both are wildcards we
  // get the catch-all "All providers · All models" which is honest.
  if (q.model === '*') return `${provider} · All models`
  // For named models, the provider is usually obvious from the model name
  // (e.g. "Claude Sonnet 4.6" is clearly Anthropic). Skip the provider
  // when the catalogue confirms the same provider, otherwise prepend it.
  const catalogProvider = lookup?.find(m => m.id === q.model)?.provider
  if (catalogProvider && catalogProvider === q.provider) return model
  if (q.provider === '*') return model
  return `${provider} · ${model}`
}

function formatPeriodWord(period: QuotaEntry['period']): string {
  if (period === 'day') return 'daily'
  if (period === 'week') return 'weekly'
  return 'monthly'
}

function pickBarTone(usedPct: number): 'ok' | 'warn' | 'crit' {
  if (usedPct >= 90) return 'crit'
  if (usedPct >= 70) return 'warn'
  return 'ok'
}

function formatResetTime(iso: string, period: QuotaEntry['period'], now: number = Date.now()): string {
  const ts = Date.parse(iso)
  if (!Number.isFinite(ts)) return ''
  if (ts <= now) return 'Resets shortly'
  const diffMs = ts - now

  if (period === 'day') {
    const totalMin = Math.round(diffMs / 60000)
    const h = Math.floor(totalMin / 60)
    const m = totalMin % 60
    if (h === 0) return `Resets in ${m}m`
    if (h < 24) return `Resets in ${h}h ${m}m`
    return `Resets in ${Math.round(h / 24)}d`
  }

  const d = new Date(ts)
  if (period === 'week') {
    // "Resets Mon, May 25"
    return `Resets ${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`
  }
  // month → "Resets Jun 1, 2026"
  return `Resets ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
}

const QuotasPanel: React.FC<{
  quotas: QuotaEntry[]
  aiModels: ModelLookup
  /** Paid balance available to spend AFTER the included quota is drained. */
  paidCredits: number
  canUpgrade: boolean
  onUpgrade: () => void
  onTopUp: () => void
}> = ({ quotas, aiModels, paidCredits, canUpgrade, onUpgrade, onTopUp }) => {
  const [expanded, setExpanded] = React.useState(false)

  if (!quotas || quotas.length === 0) return null

  const hasPaid = paidCredits > 0
  const totalCount = quotas.length

  // Pick the 1-2 quotas most worth showing inline when collapsed:
  //   1. exhausted finite quotas first (used >= amount)
  //   2. then highest used % (finite)
  //   3. then highest absolute used (catches "no usage yet" → biggest cap)
  // Unlimited quotas drop to the bottom — they're not the story.
  const previewQuotas = React.useMemo(() => {
    const ranked = [...quotas].sort((a, b) => {
      const aUnlim = a.amount >= UNLIMITED_THRESHOLD
      const bUnlim = b.amount >= UNLIMITED_THRESHOLD
      if (aUnlim !== bUnlim) return aUnlim ? 1 : -1
      const aExhausted = !aUnlim && a.remaining <= 0
      const bExhausted = !bUnlim && b.remaining <= 0
      if (aExhausted !== bExhausted) return aExhausted ? -1 : 1
      const aPct = aUnlim ? 0 : a.used / Math.max(1, a.amount)
      const bPct = bUnlim ? 0 : b.used / Math.max(1, b.amount)
      if (bPct !== aPct) return bPct - aPct
      return (b.used ?? 0) - (a.used ?? 0)
    })
    return ranked.slice(0, Math.min(2, ranked.length))
  }, [quotas])

  const visibleQuotas = expanded ? quotas : previewQuotas
  const hiddenCount = expanded ? 0 : Math.max(0, totalCount - visibleQuotas.length)

  return (
    <section
      className={`pm-quotas ${expanded ? 'pm-quotas--expanded' : 'pm-quotas--collapsed'}`}
      aria-label="Included AI usage with your plan"
    >
      <div className="pm-quotas__head">
        <div>
          <div className="pm-quotas__eyebrow">Included in your plan</div>
          <h3 className="pm-quotas__title">Included AI usage</h3>
        </div>
        <div className="pm-quotas__head-right">
          <div className="pm-quotas__hint">
            {hasPaid
              ? <>Paid credits keep working past these caps.</>
              : <>Top up or upgrade to keep using AI once a cap is hit.</>}
          </div>
          {totalCount > previewQuotas.length && (
            <button
              type="button"
              className="pm-quotas__toggle"
              onClick={() => setExpanded(v => !v)}
              aria-expanded={expanded}
            >
              {expanded
                ? <>Show less <i className="fas fa-chevron-up"></i></>
                : <>Show all {totalCount} <i className="fas fa-chevron-down"></i></>}
            </button>
          )}
        </div>
      </div>

      <div className="pm-quotas__list">
        {visibleQuotas.map(q => {
          const unlimited = q.amount >= UNLIMITED_THRESHOLD
          const usedPct = unlimited
            ? 0
            : Math.min(100, Math.max(0, (q.used / q.amount) * 100))
          const tone = pickBarTone(usedPct)
          const exhausted = !unlimited && q.remaining <= 0
          const label = formatQuotaLabel(q, aiModels)
          const periodWord = formatPeriodWord(q.period)
          const reset = formatResetTime(q.periodResetAt, q.period)
          const slugId = q.slug.replace(/[^a-zA-Z0-9_-]/g, '-')

          return (
            <article
              key={q.slug}
              data-id={`pm-quota-${slugId}`}
              data-quota-slug={q.slug}
              data-quota-provider={q.provider}
              data-quota-model={q.model}
              data-quota-period={q.period}
              data-quota-used={q.used}
              data-quota-amount={q.amount}
              data-quota-remaining={q.remaining}
              className={`pm-quota pm-quota--${tone} ${exhausted ? 'pm-quota--exhausted' : ''} ${unlimited ? 'pm-quota--unlimited' : ''}`}
            >
              <header className="pm-quota__head">
                <div className="pm-quota__label">
                  <span className="pm-quota__name" data-id={`pm-quota-${slugId}-name`}>{label}</span>
                  <span className="pm-quota__period">{periodWord} included</span>
                </div>
                {unlimited ? (
                  <span className="pm-quota__badge pm-quota__badge--unlimited" title="Unlimited included usage">∞ Unlimited</span>
                ) : (
                  <div className="pm-quota__counts">
                    <span className="pm-quota__used" data-id={`pm-quota-${slugId}-used`}>{q.used.toLocaleString()}</span>
                    <span className="pm-quota__sep">/</span>
                    <span className="pm-quota__cap" data-id={`pm-quota-${slugId}-cap`}>{q.amount.toLocaleString()} included</span>
                  </div>
                )}
              </header>

              {!unlimited && (
                <div className="pm-quota__bar" role="progressbar" aria-valuemin={0} aria-valuemax={q.amount} aria-valuenow={q.used}>
                  <div className="pm-quota__bar-fill" style={{ width: `${usedPct}%` }} />
                </div>
              )}

              <footer className="pm-quota__foot">
                <span className="pm-quota__reset">
                  {exhausted
                    ? (hasPaid
                      ? <>Included quota used — now drawing paid credits</>
                      : <>Included quota used — {reset.toLowerCase()}</>)
                    : reset}
                </span>
                {exhausted && !hasPaid && (
                  <button
                    className="pm-quota__cta"
                    onClick={canUpgrade ? onUpgrade : onTopUp}
                  >
                    {canUpgrade ? 'Upgrade plan' : 'Top up'}
                  </button>
                )}
              </footer>
            </article>
          )
        })}

        {hiddenCount > 0 && (
          <button
            type="button"
            className="pm-quota pm-quota--more"
            onClick={() => setExpanded(true)}
            aria-label={`Show ${hiddenCount} more model${hiddenCount === 1 ? '' : 's'}`}
          >
            <span className="pm-quota__more-num">+{hiddenCount}</span>
            <span className="pm-quota__more-label">more model{hiddenCount === 1 ? '' : 's'}</span>
            <span className="pm-quota__more-cta">View all <i className="fas fa-arrow-right"></i></span>
          </button>
        )}
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   Upgrade promo
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Upgrade promo banner. Shown when `selectCanUpgrade` is true.
 * Derives real pricing, discount, and free-credits data from the highest
 * (most expensive) plan in the catalogue so the copy always reflects what
 * the backend actually offers — no hardcoded strings.
 */
const UpgradePromoBanner: React.FC<{
  planCtx: ReturnType<typeof selectPlanState>
  plans: ReturnType<typeof selectVisiblePlans>
  onUpgrade: () => void
  /** Localized list prices keyed by Paddle price id; null = USD fallback. */
  localizedPrices: Record<string, LocalizedCatalogPrice> | null
}> = ({ planCtx, plans, onUpgrade, localizedPrices }) => {
  // Pick the top-tier plan (highest monthly price).
  const topPlan = React.useMemo(() => {
    if (!plans || plans.length === 0) return null
    return [...plans].sort((a, b) => b.priceUsd - a.priceUsd)[0]
  }, [plans])

  // ── Pricing ──────────────────────────────────────────────────────────
  const priceCents = topPlan?.priceUsd ?? 0
  // Localized list price for the top plan (batched Paddle PricePreview),
  // with USD fallback until it resolves / when Paddle is unavailable.
  const topPrices: any[] = Array.isArray(topPlan?.prices) ? topPlan.prices : []
  const topSelectedPrice = topPrices.find((pr: any) => pr.is_default) ?? topPrices[0] ?? null
  const topPaddleId = paddlePriceIdOf(topSelectedPrice, topPlan)
  const localized = topPaddleId ? localizedPrices?.[topPaddleId] ?? null : null

  const introDiscount = (topPlan?.introDiscounts ?? [])[0] ?? null
  let discountedPriceLabel: string | null = null
  let introOfferLabel: string | null = null
  if (introDiscount && priceCents > 0) {
    const isPct = introDiscount.discountType === 'percentage'
    // Localize the discounted price for percentage offers (exact off the
    // localized base). Fixed-amount discounts are USD, so when localized we
    // keep the base price only rather than mixing currencies.
    if (localized) {
      if (isPct) {
        const dm = Math.max(0, Math.floor(localized.rawMinor * (1 - introDiscount.amount / 100)))
        if (dm < localized.rawMinor) discountedPriceLabel = formatPaddleMinor(dm, localized.currencyCode)
      }
    } else {
      const dc = isPct
        ? Math.max(0, Math.floor(priceCents * (1 - introDiscount.amount / 100)))
        : Math.max(0, priceCents - Math.round(introDiscount.amount * 100))
      if (dc < priceCents) discountedPriceLabel = `$${(dc / 100).toFixed(2)}`
    }
    const unit = topPlan?.billingInterval === 'year' ? 'year' : 'month'
    const intervals = introDiscount.maxRecurringIntervals
    const duration = !introDiscount.recur || !intervals || intervals === 1
      ? `first ${unit}`
      : `first ${intervals} ${unit}s`
    introOfferLabel = isPct
      ? `${Math.round(introDiscount.amount)}% off ${duration}`
      : `$${introDiscount.amount.toFixed(2)} off ${duration}`

    introOfferLabel = introDiscount.name ? `${introDiscount.name}` : introOfferLabel
  }
  const fullPriceLabel = localized ? localized.formatted : (priceCents > 0 ? `$${(priceCents / 100).toFixed(2)}` : null)
  const cadence = topPlan?.billingInterval === 'year' ? 'per year' : 'per month'

  // ── Free credits ─────────────────────────────────────────────────────
  // Sum intro credit packages (free gifts bundled at sign-up).
  const introPkgs = topPlan?.introCreditPackages ?? []
  const freeCreditsTotal = introPkgs.reduce((sum, cp: any) => sum + (cp.credits ?? 0) * (cp.quantity ?? 1), 0)

  // ── Feature pills ────────────────────────────────────────────────────
  const features: string[] = topPlan?.features ?? []

  // ── Headlines ────────────────────────────────────────────────────────
  const planName = topPlan?.name ?? 'Pro'
  const isFree = planCtx.kind === 'no_subscription'
  const headline = isFree
    ? `Unlock ${planName}`
    : `Get more from Remix AI — upgrade from ${planCtx.planName} to ${planName}`

  return (
    <section className="pm-promo" aria-label="Upgrade your plan">
      <div className="pm-promo__glow" aria-hidden />

      <div className="pm-promo__body">
        <div className="pm-promo__eyebrow">
          <i className="fas fa-arrow-up-right-dots"></i>
          <span>Upgrade</span>
        </div>

        <h3 className="pm-promo__title">{headline}</h3>

        {/* Pricing row */}
        {fullPriceLabel && (
          <div className="pm-promo__price-row">
            {discountedPriceLabel ? (
              <>
                <span className="pm-promo__price-strike">{fullPriceLabel}</span>
                <span className="pm-promo__price-current">{discountedPriceLabel}</span>
              </>
            ) : (
              <span className="pm-promo__price-current">{fullPriceLabel}</span>
            )}
            <span className="pm-promo__price-cadence">{cadence}</span>
          </div>
        )}

        {/* Promo pills */}
        <div className="pm-promo__pills">
          {introOfferLabel && (
            <span className="pm-promo__pill pm-promo__pill--offer">
              <i className="fas fa-tag"></i>
              {introOfferLabel}
            </span>
          )}
          {freeCreditsTotal > 0 && (
            <span className="pm-promo__pill pm-promo__pill--credits">
              <i className="fas fa-gift"></i>
              {freeCreditsTotal.toLocaleString()} free AI credits
            </span>
          )}
          {features.slice(0, 100).map((f, i) => (
            <span key={i} className="pm-promo__pill pm-promo__pill--feature">
              <i className="fas fa-check"></i>
              {f}
            </span>
          ))}
        </div>
      </div>

      <button type="button" className="pm-promo__cta" onClick={onUpgrade}>
        See {planName} plans
        <i className="fas fa-arrow-right"></i>
      </button>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   Hero
   ───────────────────────────────────────────────────────────────────────── */

const Hero: React.FC<{
  status: CreditStatus
  refreshDate: string | null
  planCtx: ReturnType<typeof selectPlanState>
  heroCompact: boolean
  /** Omit to hide the Top up CTA — used when `ui:show-top-ups` is off. */
  onTopUp?: () => void
}> = ({ status, refreshDate, planCtx, heroCompact, onTopUp }) => {
  const { paidRemaining, total, state, includedRemaining, includedTotal, hasUnlimitedIncluded } = status
  const showIncluded = hasUnlimitedIncluded || includedTotal > 0
  // Total available = paid + included (what the CEO wants to see as the headline)
  const totalAvailable = hasUnlimitedIncluded ? null : paidRemaining + includedRemaining
  // Only show the blue paid chip when there are also *remaining* included credits
  // (or unlimited) — otherwise the total equals just the paid amount and the chip
  // would duplicate the headline number.
  const showPaidChip = paidRemaining > 0 && (includedRemaining > 0 || hasUnlimitedIncluded)

  // Credits don't expire and top-ups stack, so a "% of cycle" gauge would
  // misrepresent the model. We only surface a forward-looking line: when
  // does the next allowance land, or — for paid plans — when does the next
  // bill hit. `total` here is the per-cycle allowance from the subscription
  // (or the catalog plan it maps to). For free / beta / unknown we fall back
  // to a calmer copy that doesn't imply a quota the user can hit.
  const renderRenewal = (): React.ReactNode => {
    if (planCtx.kind === 'paid') {
      const planName = planCtx.planName
      if (planCtx.isCancelled && refreshDate) {
        return <><em>{planName}</em> ends <em>{refreshDate}</em> · won't renew</>
      }
      if (refreshDate && total > 0) {
        return <><em>{planName}</em> renews <em>{refreshDate}</em></>
      }
      if (refreshDate) return <><em>{planName}</em> renews <em>{refreshDate}</em></>
    }
    if (planCtx.kind === 'beta') {
      return planCtx.expiresOn
        ? <>Beta access · until <em>{formatDate(planCtx.expiresOn)}</em></>
        : <>Beta access</>
    }
    // Free tier / no subscription
    if (refreshDate && total > 0) {
      return <>Refills <em>{refreshDate}</em> · <em>+{total.toLocaleString()}</em> credits</>
    }
    return <>Free tier</>
  }

  return (
    <section className={`pm-hero pm-hero--${state} ${heroCompact ? 'pm-hero--compact' : ''}`}>
      <div className="pm-hero__left">
        <div className="pm-hero__eyebrow">Total AI credits available</div>
        <div className="pm-hero__balance-row">
          <div className="pm-hero__amount">
            {hasUnlimitedIncluded ? (
              <span className="pm-hero__num">∞</span>
            ) : (
              <span className="pm-hero__num">{totalAvailable!.toLocaleString()}</span>
            )}
          </div>
          {/* Paid credits chip — blue, only shown when there's a paid balance */}
          {showPaidChip && (
            <div className="pm-hero__included pm-hero__included--paid" aria-label="Paid AI credits">
              <span className="pm-hero__included-kicker">Paid credits</span>
              <span className="pm-hero__included-value">{paidRemaining.toLocaleString()}</span>
              <span className="pm-hero__included-label">credits</span>
            </div>
          )}
          {/* Included (free) credits chip */}
          {showIncluded && !hasUnlimitedIncluded && (
            <div className="pm-hero__included pm-hero__included--free" aria-label="Free included AI credits">
              <span className="pm-hero__included-kicker">Free included AI</span>
              <span className="pm-hero__included-value">
                {includedRemaining.toLocaleString()}
                {includedRemaining !== includedTotal && (
                  <><span>/</span>{includedTotal.toLocaleString()}</>
                )}
              </span>
              <span className="pm-hero__included-label">credits</span>
            </div>
          )}
          {hasUnlimitedIncluded && (
            <div className="pm-hero__included pm-hero__included--free" aria-label="Free included AI credits">
              <span className="pm-hero__included-kicker">Free included AI</span>
              <span className="pm-hero__included-value">Unlimited</span>
              <span className="pm-hero__included-label">credits</span>
            </div>
          )}
        </div>
        <div className="pm-hero__meta">
          {renderRenewal()}
        </div>
      </div>

      <div className="pm-hero__right">
        {onTopUp && (
          <button className="pm-cta" onClick={onTopUp}>
            <i className="fas fa-bolt"></i> Top&nbsp;up
          </button>
        )}
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   PlanIdentityCard — minimal "signed in as <plan>" view.

   Rendered when the user has none of the `ui:show-*` features granted, so
   none of the credits/plans/quotas/top-ups/usage panels should appear. We
   still want to confirm the sign-in and surface the plan label so the
   account-menu badge ("Free", "Pro", "Beta") has a corresponding view.
   ───────────────────────────────────────────────────────────────────────── */

const PlanIdentityCard: React.FC<{
  planCtx: ReturnType<typeof selectPlanState>
}> = ({ planCtx }) => {
  return (
    <section className="pm-hero pm-hero--healthy pm-hero--compact">
      <div className="pm-hero__left">
        <div className="pm-hero__eyebrow">Signed in</div>
        <div className="pm-hero__amount">
          <span className="pm-hero__num">{planCtx.planName}</span>
          <span className="pm-hero__unit">plan</span>
        </div>
        <div className="pm-hero__meta">
          <>You're all set.</>
        </div>
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   Dev switchers — inject scenarios via DEV_INJECT events
   ───────────────────────────────────────────────────────────────────────── */

const SCENARIOS = {
  credit: {
    label: 'Credits',
    icon: 'fas fa-coins',
    options: [
      { key: 'healthy', label: 'Healthy', credits: { balance: 800, free_credits: 800, paid_credits: 0 } },
      { key: 'low', label: 'Low (15%)', credits: { balance: 150, free_credits: 150, paid_credits: 0 } },
      { key: 'critical', label: 'Critical (1.8%)', credits: { balance: 18, free_credits: 18, paid_credits: 0 } },
      { key: 'empty', label: 'Empty', credits: { balance: 0, free_credits: 0, paid_credits: 0 } }
    ] as Array<{ key: string; label: string; credits: any }>
  },
  plan: {
    label: 'Plan',
    icon: 'fas fa-calendar-alt',
    options: [
      { key: 'beta-active', permissions: makeBetaPermissions(null), subscription: null },
      { key: 'beta-ending', permissions: makeBetaPermissions(daysFromNow(5)), subscription: null },
      { key: 'beta-ended', permissions: makeBetaPermissions(daysFromNow(-3)), subscription: null },
      { key: 'paid-active', permissions: { feature_groups: [], features: {} }, subscription: makeSub('active', 28, false) },
      { key: 'paid-expiring', permissions: { feature_groups: [], features: {} }, subscription: makeSub('active', 4, true) },
      { key: 'paid-expired', permissions: { feature_groups: [], features: {} }, subscription: makeSub('canceled', -2, true) }
    ] as Array<{ key: string; permissions: any; subscription: any }>
  }
}

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString()
}

function makeBetaPermissions(expiresAt: string | null) {
  return {
    user_id: 1, group_id: 1, is_authenticated: true, is_admin: false, is_blocked: false,
    feature_groups: [{
      name: 'beta', display_name: 'Beta Testers', description: 'Early access',
      priority: 5, source_type: 'admin_grant',
      starts_at: new Date(Date.now() - 30 * 86_400_000).toISOString(),
      expires_at: expiresAt, is_recurring: false, grant_reason: null,
      created_at: new Date(Date.now() - 30 * 86_400_000).toISOString()
    }],
    features: {}
  }
}

function makeSub(status: string, daysToEnd: number, cancelled: boolean) {
  const endsAt = daysFromNow(daysToEnd)
  return {
    id: 'sub_dev', status, customerId: 'cus_dev',
    currentBillingPeriod: { startsAt: daysFromNow(daysToEnd - 30), endsAt },
    scheduledChange: cancelled ? { action: 'cancel', effectiveAt: endsAt } : null,
    items: [{ priceId: 'pri_pro', productId: 'pro_pro', description: 'Pro plan',
      quantity: 1, unitPrice: { amount: '2900', currencyCode: 'USD' },
      billingCycle: { interval: 'month', frequency: 1 },
      product: { id: 'pro_pro', name: 'Pro', description: 'Builder', imageUrl: null }
    }],
    nextBilledAt: endsAt, createdAt: '', updatedAt: '', firstBilledAt: '',
    discount: null, collectionMode: 'automatic', billingDetails: null,
    currencyCode: 'USD', planId: 'pro', creditsPerMonth: 1000
  }
}

const DevSwitchers: React.FC<{ plugin: PlanManagerPlugin; snap: PlanManagerSnapshot; debug?: boolean }> = ({ plugin, snap, debug = false }) => {
  if (!debug) return null
  // Show the dev switchers only in non-production builds. The check is the
  // env hook used elsewhere in the project (NX_NODE_ENV / NODE_ENV).
  // Keep them on for now while we wire real flows; flip to a feature flag
  // once we ship.
  return (
    <div className="pm-scenario-stack">
      <div className="pm-scenario" title="Dev: inject credit scenario">
        <i className={SCENARIOS.credit.icon}></i>
        {SCENARIOS.credit.options.map(o => (
          <button
            key={o.key}
            className="pm-scenario__btn"
            onClick={() => plugin.store.send({ type: 'DEV_INJECT', partial: { credits: o.credits } })}
          >{o.label}</button>
        ))}
      </div>
      <div className="pm-scenario" title="Dev: inject plan scenario">
        <i className={SCENARIOS.plan.icon}></i>
        {SCENARIOS.plan.options.map(o => (
          <button
            key={o.key}
            className="pm-scenario__btn"
            onClick={() => plugin.store.send({
              type: 'DEV_INJECT',
              partial: { permissions: o.permissions, subscription: o.subscription }
            })}
          >{o.key}</button>
        ))}
      </div>
      <div className="pm-scenario" title="Dev: inject data state">
        <i className="fas fa-cloud-download-alt"></i>
        <button className="pm-scenario__btn" onClick={() => plugin.refresh()}>refresh</button>
        <button
          className="pm-scenario__btn"
          onClick={() => plugin.store.send({ type: 'DATA_FAILED', message: 'Simulated failure' })}
        >error</button>
      </div>
      <div className="pm-scenario" title="Dev: inject checkout result">
        <i className="fas fa-credit-card"></i>
        <button
          className={`pm-scenario__btn ${!snap.checkoutResult ? 'is-active' : ''}`}
          onClick={() => plugin.setCheckoutResult(null)}
        >none</button>
        {([
          { kind: 'processing', label: 'processing', intent: 'subscription', itemLabel: 'Builder plan' },
          { kind: 'success', label: 'success', intent: 'topup', itemLabel: '50,000 credits', transactionId: 'txn_01H8…' },
          { kind: 'closed', label: 'closed', intent: 'subscription', itemLabel: 'Builder plan' },
          { kind: 'error', label: 'error', intent: 'topup', itemLabel: '50,000 credits',
            errorMessage: 'Your card was declined (insufficient funds).', transactionId: 'txn_01H9…' }
        ] as const).map(s => (
          <button
            key={s.kind}
            className={`pm-scenario__btn ${snap.checkoutResult?.kind === s.kind ? 'is-active' : ''}`}
            onClick={() => plugin.setCheckoutResult({
              kind: s.kind, intent: s.intent, itemLabel: s.itemLabel,
              errorMessage: 'errorMessage' in s ? s.errorMessage : undefined,
              transactionId: 'transactionId' in s ? s.transactionId : undefined
            })}
          >{s.label}</button>
        ))}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   Sections
   ───────────────────────────────────────────────────────────────────────── */

// Pure helper — discount per plan = 1 − (yearly / (monthly × 12)).
function computeYearlySavings(p: any): { percent: number; monthsFree: number } | null {
  const prices: any[] = Array.isArray(p?.prices) ? p.prices : []
  const m = prices.find((pr: any) => pr.billing_interval === 'month' && pr.is_active !== false)
  const y = prices.find((pr: any) => pr.billing_interval === 'year' && pr.is_active !== false)
  if (!m || !y || !m.price_cents || !y.price_cents) return null
  const monthlyTotal = m.price_cents * 12
  if (monthlyTotal <= 0) return null
  const pct = Math.max(0, Math.round((1 - y.price_cents / monthlyTotal) * 100))
  const monthsFree = Math.max(0, Math.round((monthlyTotal - y.price_cents) / m.price_cents))
  return { percent: pct, monthsFree }
}

function normalizePlanKey(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

function findAccessGroupForPlan(plan: any, groups: FeatureGroup[]): FeatureGroup | null {
  const featureGroupName = normalizePlanKey(plan.featureGroupName)
  if (!featureGroupName) return null
  const matches = groups.filter(group => normalizePlanKey(group.name) === featureGroupName)
  if (matches.length === 0) return null
  return [...matches].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0]
}

function formatFeatureGroupSource(sourceType: string | null | undefined): string {
  if (sourceType === 'subscription') return 'subscription'
  if (sourceType === 'admin_grant') return 'admin grant'
  if (!sourceType) return 'access grant'
  return sourceType.replace(/_/g, ' ')
}

const PlanCard: React.FC<{
  plan: any
  isSubscriptionCurrent: boolean
  accessGroup: FeatureGroup | null
  isRecommended: boolean
  isPurchasing: boolean
  anyPurchasing: boolean
  isTrialEligible: boolean
  cancelledNotice: { expiresOn: string | null } | null
  onSubscribe: (planId: string, priceId?: number) => void
  onCancel: () => void
  onReactivate: () => void
  /** Localized list prices keyed by Paddle price id; null = USD fallback. */
  localizedPrices: Record<string, LocalizedCatalogPrice> | null
}> = ({ plan, isSubscriptionCurrent, accessGroup, isRecommended, isPurchasing, anyPurchasing, isTrialEligible, cancelledNotice, onSubscribe, onCancel, onReactivate, localizedPrices }) => {
  const pricesArr: any[] = Array.isArray(plan.prices) ? plan.prices : []
  const activePrices = pricesArr.filter((pr: any) => pr.is_active !== false)
  const hasMonthly = activePrices.some((pr: any) => pr.billing_interval === 'month')
  const hasYearly = activePrices.some((pr: any) => pr.billing_interval === 'year')
  const hasBothCadences = hasMonthly && hasYearly
  const [cadence, setCadence] = React.useState<'month' | 'year'>('month')
  const cadencePrice = activePrices.find((pr: any) => pr.billing_interval === cadence)
  const defaultPrice = activePrices.find((pr: any) => pr.is_default) || activePrices[0]
  const selectedPrice = cadencePrice || defaultPrice || null
  const selectedPriceCents: number = selectedPrice?.price_cents ?? plan.priceUsd ?? 0
  const selectedInterval: string = selectedPrice?.billing_interval ?? plan.billingInterval ?? 'month'
  const selectedPriceId: number | undefined = typeof selectedPrice?.id === 'number' ? selectedPrice.id : undefined

  // Localized list price for the selected cadence (from the batched Paddle
  // PricePreview). When absent we fall back to the static USD `price_cents`.
  const selectedPaddleId = paddlePriceIdOf(selectedPrice, plan)
  const localized = selectedPaddleId ? localizedPrices?.[selectedPaddleId] ?? null : null

  const planSavings = computeYearlySavings(plan)
  const monthlyPrice = activePrices.find((pr: any) => pr.billing_interval === 'month')
  const yearlyPrice = activePrices.find((pr: any) => pr.billing_interval === 'year')
  let savingsBadge: string | null = null
  if (planSavings && planSavings.percent > 0 && monthlyPrice && yearlyPrice && cadence === 'year') {
    // Prefer localized savings (both cadences localized) for currency
    // consistency; otherwise fall back to the USD computation.
    const mLoc = localizedPrices?.[paddlePriceIdOf(monthlyPrice, plan) ?? ''] ?? null
    const yLoc = localizedPrices?.[paddlePriceIdOf(yearlyPrice, plan) ?? ''] ?? null
    let dollarLabel: string | null = null
    if (mLoc && yLoc) {
      const savedMinor = Math.max(0, mLoc.rawMinor * 12 - yLoc.rawMinor)
      if (savedMinor > 0) dollarLabel = formatPaddleMinor(savedMinor, mLoc.currencyCode)
    } else {
      const dollarsSaved = Math.max(0, (monthlyPrice.price_cents * 12 - yearlyPrice.price_cents) / 100)
      if (dollarsSaved >= 1) dollarLabel = `$${dollarsSaved.toFixed(dollarsSaved % 1 === 0 ? 0 : 2)}`
    }
    const parts: string[] = []
    if (dollarLabel) parts.push(`Save ${dollarLabel} / yr`)
    else parts.push(`Save ${planSavings.percent}%`)
    if (planSavings.monthsFree > 0) parts.push(`${planSavings.monthsFree} months free`)
    savingsBadge = parts.join(' · ')
  }

  const priceLabel = selectedPriceCents === 0
    ? 'Free'
    : localized
      ? localized.formatted
      : `$${(selectedPriceCents / 100).toFixed(2)}`
  const cadenceLabel = selectedPriceCents === 0
    ? 'forever'
    : selectedInterval === 'year' ? 'per year' : 'per month'
  const isFree = selectedPriceCents === 0

  // Intro discount — launch promo (e.g. "60% off your first 3 months").
  // We compute the discounted headline price to entice, and surface the
  // offer name as a badge. The actual discount is applied by Paddle at
  // checkout via the prefilled discount code.
  const introDiscount = (plan.introDiscounts ?? [])[0] ?? null
  let discountedPriceLabel: string | null = null
  let introOfferLabel: string | null = null
  if (introDiscount && !isFree && selectedPriceCents > 0) {
    const isPct = introDiscount.discountType === 'percentage'
    // Localize the crossed price only for percentage discounts (exact off the
    // localized base). Fixed-amount discounts are USD-denominated, so when a
    // localized currency is in play we keep the base price localized and skip
    // the crossed price rather than mixing currencies.
    if (localized) {
      if (isPct) {
        const discountedMinor = Math.max(0, Math.floor(localized.rawMinor * (1 - introDiscount.amount / 100)))
        if (discountedMinor < localized.rawMinor) discountedPriceLabel = formatPaddleMinor(discountedMinor, localized.currencyCode)
      }
    } else {
      const discountedCents = isPct
        ? Math.max(0, Math.floor(selectedPriceCents * (1 - introDiscount.amount / 100)))
        : Math.max(0, selectedPriceCents - Math.round(introDiscount.amount * 100))
      if (discountedCents < selectedPriceCents) discountedPriceLabel = `$${(discountedCents / 100).toFixed(2)}`
    }
    if (discountedPriceLabel) {
      const intervals = introDiscount.maxRecurringIntervals
      const unit = selectedInterval === 'year' ? 'year' : 'month'
      const duration = !introDiscount.recur || !intervals
        ? `first ${unit}`
        : intervals === 1
          ? `first ${unit}`
          : `first ${intervals} ${unit}s`
      introOfferLabel = isPct
        ? `${Math.round(introDiscount.amount)}% off ${duration}`
        : `${discountedPriceLabel} off ${duration}`
    }
  }

  const isAccessActive = accessGroup !== null
  const isSubscriptionAccess = isAccessActive && accessGroup.source_type === 'subscription'
  const showUnifiedCurrent = isSubscriptionCurrent && isSubscriptionAccess
  const isPlanActive = isSubscriptionCurrent || isAccessActive
  const trialDays = Number(plan.trialPeriodDays) || 0
  const showTrial = trialDays > 0 && isTrialEligible && !isPlanActive && !isFree
  const trialCredits = Number(plan.trialCredits) || 0
  const disabled = isPlanActive || isFree || anyPurchasing

  return (
    <article
      className={`pm-plan ${isPlanActive ? 'is-current' : ''} ${isFree ? 'is-free' : ''} ${isSubscriptionCurrent ? 'is-subscription-current' : ''} ${isAccessActive ? 'is-access-current' : ''} ${isRecommended ? 'is-recommended' : ''} ${isPurchasing ? 'is-purchasing' : ''}`}
    >
      <div className="pm-plan__badges">
        {showUnifiedCurrent && <div className="pm-plan__current">Current</div>}
        {!showUnifiedCurrent && isSubscriptionCurrent && <div className="pm-plan__current pm-plan__current--subscription">Subscription</div>}
        {!showUnifiedCurrent && isAccessActive && (
          <div className="pm-plan__current pm-plan__current--access" title={`Access from ${formatFeatureGroupSource(accessGroup.source_type)}`}>
            {`You have access`}
          </div>
        )}
      </div>
      {showTrial && (
        <div className="pm-plan__trial-badge" title={trialCredits ? `${trialCredits} credits included` : undefined}>
          <i className="fas fa-gift"></i>
          <span>{trialDays}-day free trial</span>
        </div>
      )}

      {isRecommended && !isPlanActive && (
        <div className="pm-plan__ribbon">
          <i className="fas fa-star" aria-hidden></i> Recommended
        </div>
      )}

      <header className="pm-plan__head">
        <div className="pm-plan__name">{plan.name}</div>
        <div className="pm-plan__tag">{plan.description}</div>
      </header>

      {hasBothCadences && (
        <div className="pm-plans__cadence" role="tablist" aria-label="Billing cadence">
          <button
            type="button"
            role="tab"
            aria-selected={cadence === 'month'}
            className={`pm-plans__cadence-btn ${cadence === 'month' ? 'is-active' : ''}`}
            onClick={() => setCadence('month')}
          >Monthly</button>
          <button
            type="button"
            role="tab"
            aria-selected={cadence === 'year'}
            className={`pm-plans__cadence-btn ${cadence === 'year' ? 'is-active' : ''}`}
            onClick={() => setCadence('year')}
          >
            Yearly
            {planSavings && planSavings.percent > 0 && (
              <span className="pm-plans__cadence-hint">save {planSavings.percent}%</span>
            )}
          </button>
        </div>
      )}

      <div className="pm-plan__price">
        {discountedPriceLabel ? (
          <>
            <span className="pm-plan__price-was">{priceLabel}</span>
            <span className="pm-plan__price-num">{discountedPriceLabel}</span>
            <span className="pm-plan__price-cad">{cadenceLabel}</span>
          </>
        ) : (
          <>
            <span className="pm-plan__price-num">{priceLabel}</span>
            <span className="pm-plan__price-cad">{cadenceLabel}</span>
          </>
        )}
      </div>
      {introOfferLabel && (
        <div className="pm-plan__intro-offer" title={introDiscount?.name ?? undefined}>
          <i className="fas fa-tags" aria-hidden></i>
          <span>{introDiscount?.name ? `${introDiscount.name}` : introOfferLabel}</span>
        </div>
      )}
      {(plan.introCreditPackages ?? []).length > 0 && (
        <div className="pm-plan__intro-credits">
          <i className="fas fa-gift" aria-hidden></i>
          <span>
            {(plan.introCreditPackages ?? []).map((cp: any) =>
              `${(cp.credits * (cp.quantity || 1)).toLocaleString()} free AI credits`
            ).join(' + ')}
          </span>
        </div>
      )}
      {savingsBadge && (
        <div className="pm-plan__savings" title="Compared to paying month-to-month">
          <i className="fas fa-sparkles" aria-hidden></i>
          <span>{savingsBadge}</span>
        </div>
      )}

      <ul className="pm-plan__features">
        {(plan.features ?? []).map((f: string) => (
          <li key={f}>
            <i className="fas fa-check"></i>
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <button
        className={`pm-plan__btn ${disabled ? 'is-disabled' : ''} ${showTrial ? 'is-trial' : ''}`}
        disabled={disabled}
        onClick={() => { if (!disabled) onSubscribe(plan.id, selectedPriceId) }}
      >
        {isSubscriptionCurrent ? 'Active'
          : isPurchasing ? <><i className="fas fa-spinner fa-spin"></i> Opening checkout…</>
            : isAccessActive ? 'Access active'
              : isFree ? 'Always free'
                : showTrial
                  ? <><i className="fas fa-flask"></i> Start {trialDays}-day free trial</>
                  : `Switch to ${plan.name}`}
      </button>
      {/* Cancel affordance — only on the active *paid* plan. Free /
          beta have no subscription row to cancel. */}
      {isSubscriptionCurrent && !isFree && (
        <>
          {cancelledNotice && (
            <div className="pm-plan__cancel-notice" role="status">
              <i className="fas fa-circle-exclamation"></i>
              <span>
                {cancelledNotice.expiresOn
                  ? <>Active until {formatDate(cancelledNotice.expiresOn)} · will not renew</>
                  : <>Will not renew</>}
              </span>
            </div>
          )}
          {cancelledNotice ? (
            <button
              type="button"
              className="pm-plan__reactivate-link"
              onClick={() => onReactivate()}
              title="Remove the scheduled cancellation and keep your subscription"
            >
              <i className="fas fa-rotate-left" aria-hidden></i> Reactivate subscription
            </button>
          ) : (
            <button
              type="button"
              className="pm-plan__cancel-link"
              onClick={() => onCancel()}
              title="Cancel your subscription"
            >
              Cancel subscription
            </button>
          )}
        </>
      )}
    </article>
  )
}

/**
 * One line of a localized cart price preview (per Paddle line item).
 * Amounts are in the currency's minor units (e.g. cents); the `formatted*`
 * strings are localized for display.
 */
interface CartPreviewLine {
  paddlePriceId: string
  slug: string
  name: string
  quantity: number
  formattedSubtotal: string
  formattedDiscount: string
  formattedTotal: string
  rawSubtotal: number
  rawDiscount: number
  rawTotal: number
  hasDiscount: boolean
}

/** Aggregated, localized totals for the whole cart from Paddle PricePreview. */
interface CartPricePreview {
  currencyCode: string
  lineItems: CartPreviewLine[]
  rawSubtotal: number
  rawDiscount: number
  rawTax: number
  rawTotal: number
  formattedSubtotal: string
  formattedDiscount: string
  formattedTax: string
  formattedTotal: string
  hasDiscount: boolean
  hasTax: boolean
}

/**
 * Format an amount given in a currency's minor units (Paddle convention)
 * into a localized currency string. Reads the currency's fraction digits so
 * zero-decimal currencies (e.g. JPY) render correctly.
 */
function formatPaddleMinor(minor: number, currencyCode: string): string {
  try {
    const fmt = new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode })
    const digits = fmt.resolvedOptions().maximumFractionDigits ?? 2
    return fmt.format(minor / Math.pow(10, digits))
  } catch {
    return `${(minor / 100).toFixed(2)} ${currencyCode}`
  }
}

/** Human "2 days ago"-style label from an ISO timestamp. Empty on bad input. */
function relativeTimeFrom(iso: string | null | undefined): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const diffMs = Date.now() - t
  const mins = Math.round(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

/** A single product's localized list price from the batched catalog preview. */
interface LocalizedCatalogPrice {
  paddlePriceId: string
  /** Pre-tax subtotal in the currency's minor units. */
  rawMinor: number
  currencyCode: string
  /** Localized, formatted subtotal string for display. */
  formatted: string
}

/** Localized list prices for the whole catalog, keyed by Paddle price id. */
interface CatalogPricePreview {
  currencyCode: string
  byPaddlePriceId: Record<string, LocalizedCatalogPrice>
}

/** Extract a raw price object's Paddle external price id (falls back to the product's mapped top-level id). */
function paddlePriceIdOf(price: any, product: any): string | null {
  const fromPrice = price?.providers?.find((pr: any) => pr.slug === 'paddle')?.external_price_id
  if (fromPrice) return fromPrice
  return product?.providers?.find((pr: any) => pr.slug === 'paddle')?.priceId ?? null
}

/**
 * Normalize a raw Paddle PricePreview response into {@link CartPricePreview}.
 * Paddle returns per-line totals only, so the grand totals are summed from
 * the line items and formatted with {@link formatPaddleMinor}. `resolved`
 * maps each Paddle price id back to its cart item for display names.
 */
function normalizePricePreview(
  result: any,
  resolved: Array<{ item: CartItem; paddlePriceId: string | null }>
): CartPricePreview | null {
  const data = result?.data
  const lineItemsRaw: any[] = data?.details?.lineItems ?? []
  if (lineItemsRaw.length === 0) return null
  const currencyCode: string = data?.currencyCode ?? 'USD'

  const byPriceId = new Map<string, CartItem>()
  resolved.forEach(r => { if (r.paddlePriceId) byPriceId.set(r.paddlePriceId, r.item) })

  const lineItems: CartPreviewLine[] = lineItemsRaw.map((li: any) => {
    const priceId: string = li?.price?.id ?? ''
    const cartItem = byPriceId.get(priceId)
    const totals = li?.totals ?? {}
    const rawSubtotal = Number(totals.subtotal ?? 0) || 0
    const rawDiscount = Number(totals.discount ?? 0) || 0
    const rawTotal = Number(totals.total ?? 0) || 0
    return {
      paddlePriceId: priceId,
      slug: cartItem?.slug ?? priceId,
      name: cartItem?.name ?? li?.product?.name ?? li?.price?.name ?? 'Item',
      quantity: Number(li?.quantity ?? 1) || 1,
      // Format with Intl (not Paddle's `formattedTotals`) for currency-display
      // consistency and to avoid locale-ambiguous strings (e.g. CLP "$18.393").
      formattedSubtotal: formatPaddleMinor(rawSubtotal, currencyCode),
      formattedDiscount: formatPaddleMinor(rawDiscount, currencyCode),
      formattedTotal: formatPaddleMinor(rawTotal, currencyCode),
      rawSubtotal,
      rawDiscount,
      rawTotal,
      hasDiscount: rawDiscount > 0
    }
  })

  const rawSubtotal = lineItems.reduce((s, l) => s + l.rawSubtotal, 0)
  const rawDiscount = lineItems.reduce((s, l) => s + l.rawDiscount, 0)
  const rawTax = lineItemsRaw.reduce((s: number, li: any) => s + (Number(li?.totals?.tax ?? 0) || 0), 0)
  const rawTotal = lineItems.reduce((s, l) => s + l.rawTotal, 0)

  return {
    currencyCode,
    lineItems,
    rawSubtotal,
    rawDiscount,
    rawTax,
    rawTotal,
    formattedSubtotal: formatPaddleMinor(rawSubtotal, currencyCode),
    formattedDiscount: formatPaddleMinor(rawDiscount, currencyCode),
    formattedTax: formatPaddleMinor(rawTax, currencyCode),
    formattedTotal: formatPaddleMinor(rawTotal, currencyCode),
    hasDiscount: rawDiscount > 0,
    hasTax: rawTax > 0
  }
}

// ─── Cart upsell step ───────────────────────────────────────────────
// Shown after the user picks a paid plan. Offers credit packages to
// bundle into a single Paddle transaction (multi-item checkout).
const CartUpsellStep: React.FC<{
  cart: CartItem[]
  packages: any[]
  plans: any[]
  plugin: PlanManagerPlugin
}> = ({ cart, packages, plans, plugin }) => {
  const planItem = cart.find(i => i.productType === 'subscription_plan')
  const addedSlugs = new Set(cart.filter(i => i.productType === 'credit_package').map(i => i.slug))
  const cartTotal = cart.reduce((sum, item) => sum + item.priceCents, 0)

  // Look up intro discount from the plan catalog to merchandise the promo.
  const planObj = planItem ? plans.find((p: any) => p.id === planItem.slug) : null
  const introDiscount = (planObj?.introDiscounts ?? [])[0] ?? null

  // ── Static USD fallback ───────────────────────────────────────────────
  // Used while the localized Paddle preview is loading, or when Paddle is
  // unavailable. Mirrors the old hardcoded math so the cart is never blank.
  const planPriceCents = planItem?.priceCents ?? 0
  const nonPlanCents = cartTotal - planPriceCents
  let fallbackDiscountedCents: number | null = null
  if (introDiscount && planPriceCents > 0) {
    const isPct = introDiscount.discountType === 'percentage'
    const discountedPlanCents = isPct
      ? Math.max(0, Math.floor(planPriceCents * (1 - introDiscount.amount / 100)))
      : Math.max(0, planPriceCents - Math.round(introDiscount.amount * 100))
    if (discountedPlanCents < planPriceCents) {
      fallbackDiscountedCents = discountedPlanCents + nonPlanCents
    }
  }

  // ── Localized Paddle price preview ────────────────────────────────────
  // Re-fetched whenever the cart contents change. Gives us the exact
  // currency, discounts, and tax Paddle will charge at checkout.
  const [preview, setPreview] = useState<CartPricePreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  // Stable signature so the effect only fires on real cart changes.
  const cartKey = cart.map(i => `${i.slug}:${i.priceId ?? ''}`).join('|')
  useEffect(() => {
    let cancelled = false
    setPreviewLoading(true)
    plugin.previewCartPrices(cart)
      .then(res => { if (!cancelled) setPreview(res) })
      .catch(() => { if (!cancelled) setPreview(null) })
      .finally(() => { if (!cancelled) setPreviewLoading(false) })
    return () => { cancelled = true }
  }, [cartKey])

  // Localized per-package prices for the upsell grid (no discount applied).
  const [addonPrices, setAddonPrices] = useState<Record<string, string> | null>(null)
  const addonKey = packages.map((p: any) => p.id).join('|')
  useEffect(() => {
    let cancelled = false
    if (packages.length === 0) { setAddonPrices(null); return }
    plugin.previewProductPrices(
      packages.map((p: any) => ({ slug: p.id, productType: 'credit_package' as const }))
    )
      .then(res => { if (!cancelled) setAddonPrices(res) })
      .catch(() => { if (!cancelled) setAddonPrices(null) })
    return () => { cancelled = true }
  }, [addonKey])

  // Map preview lines back to slugs for per-row localized prices.
  const previewBySlug = new Map<string, CartPreviewLine>()
  preview?.lineItems.forEach(li => previewBySlug.set(li.slug, li))

  const localized = preview !== null
  const hasDiscount = localized
    ? preview!.hasDiscount
    : (fallbackDiscountedCents !== null && fallbackDiscountedCents < cartTotal)

  // Renewal note — after the discounted intervals the plan bills full price.
  let renewalLabel: string | null = null
  if (introDiscount && hasDiscount && planItem) {
    const interval = planItem.billingInterval ?? 'month'
    const intervals = introDiscount.maxRecurringIntervals
    const durationLabel = !introDiscount.recur || !intervals
      ? `first ${interval}`
      : intervals === 1 ? `first ${interval}` : `first ${intervals} ${interval}s`
    const planLine = previewBySlug.get(planItem.slug)
    const fullPlanPrice = planLine ? planLine.formattedSubtotal : `$${(planPriceCents / 100).toFixed(2)}`
    renewalLabel = `then ${fullPlanPrice}/${interval} after ${durationLabel}`
  }

  // Display strings — prefer localized, fall back to USD.
  const fmtItemSubtotal = (item: CartItem): string => {
    const li = previewBySlug.get(item.slug)
    return li ? li.formattedSubtotal : `$${(item.priceCents / 100).toFixed(2)}`
  }
  const subtotalStr = localized ? preview!.formattedSubtotal : `$${(cartTotal / 100).toFixed(2)}`
  const discountStr = localized
    ? preview!.formattedDiscount
    : `$${(((fallbackDiscountedCents !== null ? cartTotal - fallbackDiscountedCents : 0)) / 100).toFixed(2)}`
  const totalDueStr = localized
    ? preview!.formattedTotal
    : `$${((fallbackDiscountedCents ?? cartTotal) / 100).toFixed(2)}`
  const discountPctLabel = introDiscount && introDiscount.discountType === 'percentage'
    ? ` (${Math.round(introDiscount.amount)}%)`
    : ''

  const addPackage = (pkg: any) => {
    plugin.store.send({
      type: 'CART_ADD',
      item: {
        slug: pkg.id,
        name: pkg.name,
        productType: 'credit_package',
        priceCents: pkg.priceUsd ?? 0,
        credits: pkg.credits
      }
    })
  }

  const removePackage = (slug: string) => {
    plugin.store.send({ type: 'CART_REMOVE', slug })
  }

  const goBack = () => {
    plugin.store.send({ type: 'CART_CLEAR' })
  }

  const proceed = () => {
    void plugin.checkoutCart()
  }

  return (
    <div className="pm-cart-upsell">
      <div className="pm-cart-upsell__header">
        <button className="pm-cart-upsell__back" onClick={goBack}>
          <i className="fas fa-arrow-left"></i>
          <span>Back to plans</span>
        </button>
      </div>

      {/* Current cart summary */}
      <div className="pm-cart-upsell__summary">
        <h3 className="pm-cart-upsell__title">Your order</h3>
        <ul className="pm-cart-upsell__items">
          {cart.map(item => (
            <li key={item.slug} className="pm-cart-upsell__item">
              <div className="pm-cart-upsell__item-info">
                <span className="pm-cart-upsell__item-name">{item.name}</span>
                <span className="pm-cart-upsell__item-price">{fmtItemSubtotal(item)}</span>
              </div>
              {item.productType === 'credit_package' && (
                <button
                  className="pm-cart-upsell__item-remove"
                  onClick={() => removePackage(item.slug)}
                  title="Remove from cart"
                >
                  <i className="fas fa-times"></i>
                </button>
              )}
            </li>
          ))}
        </ul>

        {/* Price breakdown — mirrors what Paddle will charge */}
        {(hasDiscount || (localized && preview!.hasTax)) && (
          <div className="pm-cart-upsell__breakdown">
            {hasDiscount && (
              <div className="pm-cart-upsell__breakdown-row pm-cart-upsell__breakdown-row--discount">
                <span>Discount{discountPctLabel}</span>
                <span>−{discountStr}</span>
              </div>
            )}
            {localized && preview!.hasTax && (
              <div className="pm-cart-upsell__breakdown-row">
                <span>Tax</span>
                <span>{preview!.formattedTax}</span>
              </div>
            )}
          </div>
        )}

        <div className="pm-cart-upsell__total">
          <span>{hasDiscount ? 'Due today' : 'Total'}</span>
          <div className="pm-cart-upsell__total-right">
            {hasDiscount ? (
              <>
                <span className="pm-cart-upsell__total-original">{subtotalStr}</span>
                <span className="pm-cart-upsell__total-discounted">{totalDueStr}</span>
              </>
            ) : (
              <span>{totalDueStr}</span>
            )}
          </div>
        </div>

        {renewalLabel && (
          <div className="pm-cart-upsell__renewal-note">{renewalLabel}</div>
        )}
        By completing your purchase, you agree to our <span><a href="https://remix.live/termsandconditions" target="_blank" rel="noreferrer"><strong>Terms and Conditions</strong></a></span>
        {previewLoading && (
          <div className="pm-cart-upsell__price-loading">
            <i className="fas fa-spinner fa-spin"></i>
            <span>Updating prices…</span>
          </div>
        )}

        {/* Discount notice — names the promo; the breakdown above shows the math */}
        {introDiscount && (
          <div className="pm-cart-upsell__discount-notice">
            <i className="fas fa-tags"></i>
            <div>
              <strong>{introDiscount.name}</strong>

            </div>
          </div>
        )}

        {/* Bonus intro credits — also anchored in the summary block */}
        {(planObj?.introCreditPackages ?? []).length > 0 && (
          <div className="pm-cart-upsell__bonus-notice">
            <i className="fas fa-gift"></i>
            <div>
              <strong>Bonus included</strong>
              <span>
                {' — '}
                {(planObj.introCreditPackages ?? []).map((cp: any) =>
                  `${(cp.credits * (cp.quantity || 1)).toLocaleString()} free AI credits`
                ).join(' + ')}
                {' '}added to your account on sign-up
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Upsell: available credit packages */}
      {packages.length > 0 && (
        <div className="pm-cart-upsell__addons">
          <h4 className="pm-cart-upsell__addons-title">
            <i className="fas fa-bolt"></i>
            Add AI credits to your order
          </h4>
          <p className="pm-cart-upsell__addons-desc">
            Bundle AI credits with your subscription — one checkout, no extra transaction fees.
          </p>
          <div className="pm-cart-upsell__addons-grid">
            {packages.map((pkg: any) => {
              const isAdded = addedSlugs.has(pkg.id)
              return (
                <button
                  key={pkg.id}
                  className={`pm-cart-upsell__addon ${isAdded ? 'is-added' : ''}`}
                  onClick={() => isAdded ? removePackage(pkg.id) : addPackage(pkg)}
                >
                  <span className="pm-cart-upsell__addon-credits">
                    {(pkg.credits ?? 0).toLocaleString()}
                  </span>
                  <span className="pm-cart-upsell__addon-label">AI credits</span>
                  <span className="pm-cart-upsell__addon-price">
                    {addonPrices?.[pkg.id] ?? `$${((pkg.priceUsd ?? 0) / 100).toFixed(2)}`}
                  </span>
                  <span className="pm-cart-upsell__addon-action">
                    {isAdded ? <><i className="fas fa-check"></i> Added</> : <><i className="fas fa-plus"></i> Add</>}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Proceed to checkout */}
      <button className="pm-cart-upsell__checkout-btn" onClick={proceed}>
        <i className="fas fa-lock"></i>
        <span>Proceed to checkout — {totalDueStr}</span>
      </button>
      <div className="pm-cart-upsell__note">
        <i className="fas fa-info-circle"></i>
        <span>You'll complete payment securely via Paddle</span>
      </div>
    </div>
  )
}

const PlansSection: React.FC<{
  plans: any[]
  currentPlanId: string | null
  /** Feature groups currently granting access. Permissions and quotas follow these, not necessarily billing. */
  userFeatureGroups: FeatureGroup[]
  /** True when the user has never used a trial — enables "Start free trial" CTAs. */
  isTrialEligible: boolean
  purchasingId: string | null
  /** Feature key (e.g. 'ai:Anthropic') that triggered the open, if any. Surfaced as a banner. */
  requiredFeature: string | null
  onSubscribe: (planId: string, priceId?: number) => void
  /** Cancel the active paid subscription. Opens the in-panel chooser. */
  onCancel: () => void
  /** Reactivate a subscription scheduled to cancel (removes the scheduled cancellation). */
  onReactivate: () => void
  /** When the active paid sub is set to cancel, show "will not renew" copy. */
  cancelledNotice: { expiresOn: string | null } | null
  /** Localized list prices keyed by Paddle price id (from batched PricePreview); null = USD fallback. */
  localizedPrices: Record<string, LocalizedCatalogPrice> | null
}> = ({ plans, currentPlanId, userFeatureGroups, isTrialEligible, purchasingId, requiredFeature, onSubscribe, onCancel, onReactivate, cancelledNotice, localizedPrices }) => {
  if (plans.length === 0) {
    return (
      <div className="pm-empty">
        <p>No plans available right now.</p>
      </div>
    )
  }
  // Render in the order the API returned them — the backend curates the
  // sort (free → entry → pro …), so respecting it keeps merchandising in
  // one place. "Recommended" is now backend-driven via `is_popular`; we
  // fall back to the middle card only when no plan is flagged.
  const sorted = plans
  const popularPlan = sorted.find((p: any) => p.isPopular === true)
  const recommendedId = popularPlan
    ? popularPlan.id
    : (sorted.length >= 3 ? sorted[1].id : null)
  const anyPurchasing = purchasingId !== null
  const currentPlan = sorted.find(plan => plan.id === currentPlanId) ?? null
  const accessMatches = sorted
    .map(plan => ({ plan, group: findAccessGroupForPlan(plan, userFeatureGroups) }))
    .filter((entry): entry is { plan: any; group: FeatureGroup } => entry.group !== null)
  const primaryAccess = [...accessMatches].sort((a, b) => (b.group.priority ?? 0) - (a.group.priority ?? 0))[0] ?? null
  const accessDiffersFromSubscription = !!primaryAccess && (
    !currentPlan || primaryAccess.plan.id !== currentPlan.id || primaryAccess.group.source_type !== 'subscription'
  )

  return (
    <div className="pm-plans" data-id="pm-plans-view">
      {requiredFeature && (
        <div className="pm-plans__required" role="status" data-id="pm-plans-required-feature" data-required-feature={requiredFeature}>
          <i className="fas fa-bolt" aria-hidden></i>
          <span>
            Your current plan doesn't include <strong>{FEATURE_LABELS[requiredFeature as keyof typeof FEATURE_LABELS] ?? requiredFeature}</strong>.
            Choose a plan below that does to unlock it.
          </span>
        </div>
      )}
      {accessDiffersFromSubscription && (
        <div className="pm-plans__access-note" role="status">
          <i className="fas fa-key" aria-hidden></i>
          <span>
            Active subscription: <strong>{currentPlan?.name ?? 'None'}</strong>. Active access: <strong>{primaryAccess.plan.name}</strong>
          </span>
        </div>
      )}
      {sorted.map(plan => {
        const isSubscriptionCurrent = plan.id === currentPlanId
        const accessGroup = findAccessGroupForPlan(plan, userFeatureGroups)
        const isRecommended = plan.id === recommendedId
        const isPurchasing = purchasingId === plan.id
        return (
          <PlanCard
            key={plan.id}
            plan={plan}
            isSubscriptionCurrent={isSubscriptionCurrent}
            accessGroup={accessGroup}
            isRecommended={isRecommended}
            isPurchasing={isPurchasing}
            anyPurchasing={anyPurchasing}
            isTrialEligible={isTrialEligible}
            cancelledNotice={cancelledNotice}
            localizedPrices={localizedPrices}
            onSubscribe={onSubscribe}
            onCancel={onCancel}
            onReactivate={onReactivate}
          />
        )
      })}
      {/* Team / Enterprise contact strip — compact one-liner so it doesn't
          compete visually with the priced cards. */}
      <a
        className="pm-enterprise-strip"
        href="https://remix.live/contact"
        target="_blank"
        rel="noopener noreferrer"
      >
        <span className="pm-enterprise-strip__label">
          <i className="fas fa-building" aria-hidden></i>
          <strong>Team &amp; Enterprise</strong>
          <span className="pm-enterprise-strip__sub"></span>
        </span>
        <span className="pm-enterprise-strip__cta">
          Contact us <i className="fas fa-arrow-right" aria-hidden></i>
        </span>
      </a>
    </div>
  )
}

const TopUpSection: React.FC<{
  packages: any[]
  purchasingId: string | null
  onPurchase: (packageId: string) => void
  /** Localized list prices keyed by Paddle price id; null = USD fallback. */
  localizedPrices: Record<string, LocalizedCatalogPrice> | null
  /** Total spendable credits (included + paid); null means unlimited. */
  totalAvailable: number | null
}> = ({ packages, purchasingId, onPurchase, localizedPrices, totalAvailable }) => {
  if (packages.length === 0) {
    return (
      <div className="pm-empty">
        <p>No top-up packages available during the Free plan.</p>
      </div>
    )
  }
  const anyPurchasing = purchasingId !== null
  return (
    <div className="pm-topup">
      <div className="pm-topup__intro">
        <h3>One-off credits</h3>
        <p>Top up without changing your plan. Credits never expire.</p>
        <span className="pm-topup__total-num">
          Currently {totalAvailable === null ? '∞' : totalAvailable.toLocaleString()}
        </span>
        <span className="pm-topup__total-label"> Credits available</span>
      </div>
      <div className="pm-topup__grid">
        {packages.map(t => {
          // Defensive coercion — a missing/non-numeric `credits` or `priceUsd`
          // would otherwise throw in `.toLocaleString()` / division below and
          // take down the entire panel.
          const credits = Number(t?.credits) || 0
          const priceCents = Number(t?.priceUsd) || 0
          const isPopular = t.popular === true || t.popular === 1 || t.popular === '1'
          // Localized price for this package (batched Paddle PricePreview),
          // with USD fallback while it loads / when Paddle is unavailable.
          const pkgPrices: any[] = Array.isArray(t?.prices) ? t.prices : []
          const pkgPrice = pkgPrices.find((pr: any) => pr.is_default) ?? pkgPrices[0] ?? null
          const pkgPaddleId = paddlePriceIdOf(pkgPrice, t)
          const loc = pkgPaddleId ? localizedPrices?.[pkgPaddleId] ?? null : null
          const price = loc ? loc.formatted : `$${(priceCents / 100).toFixed(2)}`
          const perKLabel = credits <= 0
            ? 'Pricing unavailable'
            : loc
              ? `${formatPaddleMinor(loc.rawMinor / (credits / 1000), loc.currencyCode)} per 1k credits`
              : `$${((priceCents / 100) / (credits / 1000)).toFixed(2)} per 1k credits`
          const isPurchasing = purchasingId === t.id
          // Disable cards we can't price/buy meaningfully so the click handler
          // never sends a malformed purchase.
          const isUnavailable = credits <= 0 || priceCents <= 0
          const disabled = anyPurchasing || isUnavailable
          return (
            <button
              key={t.id}
              className={`pm-topup__card ${isPopular ? 'is-popular' : ''} ${isPurchasing ? 'is-purchasing' : ''}`}
              disabled={disabled}
              onClick={() => { if (!disabled) onPurchase(t.id) }}
              title={isUnavailable ? 'Pricing not available right now' : undefined}
            >
              {isPopular && (
                <div className="pm-topup__pop">
                  <i className="fas fa-star" aria-hidden></i> Best value
                </div>
              )}
              <div className="pm-topup__price">{price}</div>
              <div className="pm-topup__credits">
                <span className="pm-topup__credits-num">{credits.toLocaleString()}</span>
                <span className="pm-topup__credits-unit">credits</span>
              </div>
              <div className="pm-topup__perk">{perKLabel}</div>
              <span className="pm-topup__buy">
                {isPurchasing
                  ? <><i className="fas fa-spinner fa-spin"></i> Opening…</>
                  : isUnavailable
                    ? <>Unavailable</>
                    : <>Buy <i className="fas fa-arrow-right"></i></>}
              </span>
            </button>
          )
        })}
      </div>
      <div className="pm-topup__custom">
        <span>Need a custom amount?</span>
        <a href="https://remix.live/contact" target="_blank" rel="noopener noreferrer">Contact us</a>
      </div>
    </div>
  )
}

interface UsageDisplayRow {
  key: string
  model: string
  provider: string | null
  credits: number
  calls: number
  totalTokens: number
  costUsd: number
  sharePct: number
  barColor: string
}

const USAGE_RANGE_PRESETS = [7, 30, 90] as const
const DEFAULT_USAGE_RANGE_DAYS = 30

const UsageSection: React.FC<{ plugin: PlanManagerPlugin }> = ({ plugin }) => {
  const [report, setReport] = React.useState<UsageReport | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [reloadKey, setReloadKey] = React.useState(0)
  const [rangeDays, setRangeDays] = React.useState<number>(DEFAULT_USAGE_RANGE_DAYS)

  useEffect(() => {
    let cancelled = false

    const loadUsage = async () => {
      setLoading(true)
      setError(null)
      try {
        const creditsApi: any = await plugin.call('auth', 'getCreditsApi').catch(() => null)
        if (!creditsApi || typeof creditsApi.getUsageReport !== 'function') {
          throw new Error('Usage reporting is not available yet.')
        }

        const range = buildUsageRange(rangeDays)
        const query: CreditsUsageQuery = {
          from: range.from,
          to: range.to,
          groupBy: ['provider', 'model'],
          limit: 200
        }
        const resp = await creditsApi.getUsageReport(query)

        if (cancelled) return
        if (!resp?.ok || !resp.data) {
          throw new Error(resp?.error || 'Failed to load usage report.')
        }

        setReport(resp.data)
      } catch (err: any) {
        if (cancelled) return
        setReport(null)
        setError(err?.message || 'Failed to load usage report.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadUsage()
    return () => { cancelled = true }
  }, [plugin, reloadKey, rangeDays])

  const rows = useMemo(() => buildUsageRows(report), [report])

  const totals = useMemo(() => {
    const rowTotals = rows.reduce((acc, row) => {
      acc.credits += row.credits
      acc.calls += row.calls
      acc.totalTokens += row.totalTokens
      acc.costUsd += row.costUsd
      return acc
    }, { credits: 0, calls: 0, totalTokens: 0, costUsd: 0 })

    if (!report) return rowTotals

    return {
      credits: toFiniteNumber(report.totals?.credits) || rowTotals.credits,
      calls: toFiniteNumber(report.totals?.calls) || rowTotals.calls,
      totalTokens: toFiniteNumber(report.totals?.total_tokens) || rowTotals.totalTokens,
      costUsd: toFiniteNumber(report.totals?.cost_usd) || rowTotals.costUsd
    }
  }, [report, rows])

  const rangeLabel = useMemo(() => {
    if (!report?.range?.from || !report.range.to) return `Last ${rangeDays} days`
    const from = formatDate(report.range.from)
    const to = formatDate(report.range.to)
    return from && to ? `${from} - ${to}` : `Last ${rangeDays} days`
  }, [report, rangeDays])

  if (loading && !report) {
    return (
      <div className="pm-empty">
        <div className="pm-empty__icon">
          <i className="fas fa-spinner fa-spin"></i>
        </div>
        <div className="pm-empty__title">Loading usage breakdown</div>
        <p className="pm-empty__body">
          Pulling your latest per-model usage from billing.
        </p>
      </div>
    )
  }

  if (error && !report) {
    return (
      <div className="pm-empty pm-empty--error">
        <div className="pm-empty__icon">
          <i className="fas fa-cloud-exclamation"></i>
        </div>
        <div className="pm-empty__title">Could not load usage</div>
        <p className="pm-empty__body">{error}</p>
        <div className="pm-empty__actions">
          <button className="pm-empty__btn pm-empty__btn--primary" onClick={() => setReloadKey((v) => v + 1)}>
            <i className="fas fa-rotate-right"></i> Retry
          </button>
        </div>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="pm-empty">
        <div className="pm-empty__icon">
          <i className="fas fa-chart-line"></i>
        </div>
        <div className="pm-empty__title">No metered usage in this range</div>
        <p className="pm-empty__body">
          We will show per-model spend here as soon as your AI requests are billed.
        </p>
        <div className="pm-empty__actions">
          <button className="pm-empty__btn pm-empty__btn--ghost" onClick={() => setReloadKey((v) => v + 1)}>
            <i className="fas fa-rotate-right"></i> Refresh
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="pm-usage">
      <div className="pm-usage__intro">
        <div>
          <h3>Usage by model</h3>
          <p>{rangeLabel} | updates as soon as calls are metered.</p>
          <div className="pm-usage__presets" role="group" aria-label="Usage date range">
            {USAGE_RANGE_PRESETS.map((days) => {
              const isActive = days === rangeDays
              return (
                <button
                  key={days}
                  type="button"
                  className={`pm-usage__preset ${isActive ? 'is-active' : ''}`}
                  onClick={() => setRangeDays(days)}
                  aria-pressed={isActive}
                >
                  {days}d
                </button>
              )
            })}
          </div>
        </div>
        <div className="pm-usage__total">
          <div className="pm-usage__total-num">{formatCreditValue(totals.credits)}</div>
          <div className="pm-usage__total-lbl">credits used</div>
        </div>
      </div>

      <div className="pm-usage__tokens">
        {formatCompactNumber(totals.calls)} calls · {formatCompactNumber(totals.totalTokens)} tokens · {formatUsd(totals.costUsd)} provider cost
      </div>

      <div className="pm-usage__list">
        {rows.map((row) => {
          const shareLabel = row.sharePct > 0 && row.sharePct < 0.1 ? '<0.1%' : `${row.sharePct.toFixed(1)}%`
          return (
            <article key={row.key} className="pm-usage__row" style={{ '--pm-bar': row.barColor } as React.CSSProperties}>
              <div className="pm-usage__meta">
                <div className="pm-usage__model">
                  <span className="pm-usage__swatch" />
                  <span className="pm-usage__name">{row.model}</span>
                  {row.provider && <span className="pm-usage__vendor">{row.provider}</span>}
                </div>

                <div className="pm-usage__nums">
                  <span className="pm-usage__credits">{formatCreditValue(row.credits)}</span>
                  <span className="pm-usage__credits-lbl">credits</span>
                  <span className="pm-usage__share">{shareLabel}</span>
                </div>
              </div>

              <div className="pm-usage__bar">
                <div className="pm-usage__bar-fill" style={{ width: `${Math.min(100, Math.max(0, row.sharePct))}%` }} />
              </div>

              <div className="pm-usage__tokens">
                {formatCompactNumber(row.calls)} calls · {formatCompactNumber(row.totalTokens)} tokens · {formatUsd(row.costUsd)}
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   Alerts
   ───────────────────────────────────────────────────────────────────────── */

const ALERT_COPY: Record<Exclude<CreditState, 'healthy' | 'unknown'>, {
  eyebrow: string
  title: (n: number) => string
  body: (refresh: string | null) => string
  icon: string
}> = {
  low: {
    eyebrow: 'Running low',
    title: (n) => `${n.toLocaleString()} credits left`,
    body: (r) => `You'll likely run out${r ? ` before your refill on ${r}` : ''}. Top up or upgrade to keep your AI workflows uninterrupted.`,
    icon: 'fas fa-exclamation'
  },
  critical: {
    eyebrow: 'Almost out',
    title: (n) => `Only ${n.toLocaleString()} credits remain`,
    body: (r) => `Your next AI request may not complete. Add credits now or upgrade your plan${r ? ` — refill is on ${r}` : ''}.`,
    icon: 'fas fa-exclamation-triangle'
  },
  empty: {
    eyebrow: 'Out of credits',
    title: () => 'You\'ve used all your credits',
    body: (r) => `AI features are paused until you top up, upgrade your plan${r ? `, or your included allowance refills on ${r}` : ''}.`,
    icon: 'fas fa-bolt'
  }
}

const ResumeCheckoutBanner: React.FC<{
  checkout: PendingCheckout
  onResume: () => void
  onDiscard: () => void
}> = ({ checkout, onResume, onDiscard }) => {
  const isSub = checkout.product_kind === 'subscription'
  const name = checkout.product_name ?? (isSub ? 'your plan' : 'your credits')
  const title = isSub ? `Finish setting up ${name}` : `Pick up where you left off — ${name}`
  const price = (checkout.amount_total != null && checkout.currency)
    ? formatPaddleMinor(checkout.amount_total, checkout.currency)
    : null
  const started = relativeTimeFrom(checkout.last_event_at)
  const meta = [price, started ? `started ${started}` : null].filter(Boolean).join(' · ')

  return (
    <section className="pm-alert pm-alert--resume">
      <div className="pm-alert__glow" aria-hidden />
      <div className="pm-alert__icon">
        <i className={isSub ? 'fas fa-rotate-right' : 'fas fa-cart-arrow-down'}></i>
      </div>
      <div className="pm-alert__body">
        <div className="pm-alert__eyebrow">Unfinished checkout</div>
        <div className="pm-alert__title">{title}</div>
        <p className="pm-alert__desc">
          {meta ? `${meta}. ` : ''}Continue your purchase right where you left off.
        </p>
      </div>
      <div className="pm-alert__actions">
        <button
          className="pm-alert__btn pm-alert__btn--solid"
          onClick={onResume}
          data-id="resumeCheckoutButton"
        >
          <i className="fas fa-arrow-right"></i> Resume
        </button>
        <button
          className="pm-alert__btn pm-alert__btn--link"
          onClick={onDiscard}
          data-id="resumeCheckoutDiscard"
        >
          Discard
        </button>
      </div>
    </section>
  )
}

const CreditAlert: React.FC<{
  status: CreditStatus
  refreshDate: string | null
  canUpgrade: boolean
  onTopUp: () => void
  onUpgrade: () => void
}> = ({ status, refreshDate, canUpgrade, onTopUp, onUpgrade }) => {
  if (status.state === 'healthy' || status.state === 'unknown') return null
  const copy = ALERT_COPY[status.state]
  const remaining = status.availableRemaining

  return (
    <section className={`pm-alert pm-alert--${status.state}`}>
      <div className="pm-alert__glow" aria-hidden />
      <div className="pm-alert__icon">
        <i className={copy.icon}></i>
      </div>
      <div className="pm-alert__body">
        <div className="pm-alert__eyebrow">{copy.eyebrow}</div>
        <div className="pm-alert__title">{copy.title(remaining)}</div>
        <p className="pm-alert__desc">{copy.body(refreshDate)}</p>
      </div>
      <div className="pm-alert__actions">
        {canUpgrade && (
          <button className="pm-alert__btn pm-alert__btn--ghost" onClick={onUpgrade}>
            <i className="fas fa-arrow-up"></i> Upgrade plan
          </button>
        )}
        <button className="pm-alert__btn pm-alert__btn--solid" onClick={onTopUp}>
          <i className="fas fa-bolt"></i> Buy AI credits
        </button>
      </div>
    </section>
  )
}

const PLAN_ALERT_COPY: Record<Exclude<PlanLifecycle, 'active'>, {
  eyebrow: string
  title: (planName: string, days: number) => string
  body: (planName: string, days: number, isCancelled: boolean) => string
  icon: string
}> = {
  trial: {
    eyebrow: 'Free trial',
    title: (plan, days) =>
      days <= 0 ? `${plan} trial ends today`
        : days === 1 ? `${plan} trial ends tomorrow`
          : `${plan} trial — ${days} days left`,
    body: (plan, _days, isCancelled) =>
      isCancelled
        ? `Your ${plan} trial is set to end and won’t convert. Re-enable auto-renewal to keep your credits and features after the trial.`
        : `You're trying ${plan} on us. We’ll start billing automatically when the trial ends so you don’t lose access. Cancel any time before then — no charge.`,
    icon: 'fas fa-flask'
  },
  expiring: {
    eyebrow: 'Renewal needed',
    title: (plan, days) =>
      days <= 1 ? `${plan} ends tomorrow` : `${plan} ends in ${days} days`,
    body: (_plan, _days, isCancelled) =>
      isCancelled
        ? 'Your subscription is set to cancel. Renew now to keep your AI credits, project history, and team access without interruption.'
        : 'Your billing cycle is closing. Confirm your plan or step up to a higher tier before access pauses.',
    icon: 'fas fa-hourglass-half'
  },
  expired: {
    eyebrow: 'Plan expired',
    title: (plan, days) =>
      `${plan} ended ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`,
    body: () =>
      'AI features and premium tooling are paused. Renew to pick up where you left off, or upgrade to unlock more credits and capacity.',
    icon: 'fas fa-circle-exclamation'
  }
}

const PlanLifecycleAlert: React.FC<{
  planCtx: PlanState
  onRenew: () => void
  onUpgrade: () => void
}> = ({ planCtx, onRenew, onUpgrade }) => {
  if (planCtx.lifecycle === 'active') return null
  const copy = PLAN_ALERT_COPY[planCtx.lifecycle]
  const variant = planCtx.lifecycle
  const isTrial = variant === 'trial'
  // For trial conversions we use a dedicated days field if the backend
  // provided one (more accurate than the derived currentPeriodEnd diff).
  const daysShown = isTrial && typeof planCtx.trialDaysRemaining === 'number'
    ? planCtx.trialDaysRemaining
    : planCtx.daysUntilExpiry

  return (
    <section className={`pm-alert pm-alert--plan pm-alert--plan-${variant}`}>
      <div className="pm-alert__glow" aria-hidden />
      <div className="pm-alert__icon">
        <i className={copy.icon}></i>
      </div>
      <div className="pm-alert__body">
        <div className="pm-alert__eyebrow">{copy.eyebrow}</div>
        <div className="pm-alert__title">
          {copy.title(planCtx.planName, daysShown)}
        </div>
        <p className="pm-alert__desc">
          {copy.body(planCtx.planName, daysShown, planCtx.isCancelled)}
          {isTrial && planCtx.trialEndsOn && (
            <> <span className="pm-alert__meta">First charge on {formatDate(planCtx.trialEndsOn)}.</span></>
          )}
          {!isTrial && variant === 'expired' && planCtx.expiresOn && (
            <> <span className="pm-alert__meta">Expired on {formatDate(planCtx.expiresOn)}.</span></>
          )}
        </p>
      </div>
      <div className="pm-alert__actions">
        {isTrial ? <>
          <button className="pm-alert__btn pm-alert__btn--ghost" onClick={onUpgrade}>
            <i className="fas fa-layer-group"></i> See all plans
          </button>
          {/* Solid CTA only matters when the trial is set to cancel. */}
          {planCtx.isCancelled && (
            <button className="pm-alert__btn pm-alert__btn--solid" onClick={onRenew}>
              <i className="fas fa-rotate-right"></i> Keep subscription
            </button>
          )}
        </> : <>
          <button className="pm-alert__btn pm-alert__btn--ghost" onClick={onUpgrade}>
            <i className="fas fa-arrow-up"></i> Upgrade plan
          </button>
          <button className="pm-alert__btn pm-alert__btn--solid" onClick={onRenew}>
            <i className="fas fa-rotate-right"></i>
            {variant === 'expired' ? ' Renew plan' : ' Keep my plan'}
          </button>
        </>}
      </div>
    </section>
  )
}

const BETA_ALERT_COPY: Record<Exclude<PlanLifecycle, 'active' | 'trial'>, {
  eyebrow: string
  title: string
  lede: (days: number, expiresOn: string | null) => string
  body: string
  primary: string
  secondary: string
}> = {
  expiring: {
    eyebrow: 'Beta program',
    title: 'Thanks for shaping Remix.',
    lede: (days, expiresOn) =>
      `The free beta wraps up ${days <= 1 ? 'tomorrow' : `in ${days} days`}${expiresOn ? ` (${formatDate(expiresOn)})` : ''}. Your feedback got us here — now it's time to pick a plan that fits how you build.`,
    body: 'Pick any paid tier before your beta ends and your projects, history, and AI credits keep flowing without a hiccup. As a thank-you, your first month carries over a bonus credit pack.',
    primary: 'See paid plans',
    secondary: 'Top up AIcredits'
  },
  expired: {
    eyebrow: 'Beta has ended',
    title: 'You helped build this. Let\'s keep going.',
    lede: (days, expiresOn) =>
      `The beta ended ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago${expiresOn ? ` (${formatDate(expiresOn)})` : ''}. AI features are paused while you choose a plan — your workspaces and history are safe and waiting.`,
    body: 'Pick a paid plan to switch everything back on. Beta testers get a one-time bonus credit pack on their first paid month — our way of saying thanks for being early.',
    primary: 'Choose a plan',
    secondary: 'Top up AI credits'
  }
}

const BetaTransitionAlert: React.FC<{
  planCtx: PlanState
  onUpgrade: () => void
  onTopUp: () => void
}> = ({ planCtx, onUpgrade, onTopUp }) => {
  if (planCtx.lifecycle === 'active' || planCtx.lifecycle === 'trial') return null
  const copy = BETA_ALERT_COPY[planCtx.lifecycle]
  const variant = planCtx.lifecycle

  return (
    <section className={`pm-beta-alert pm-beta-alert--${variant}`}>
      <div className="pm-beta-alert__aurora" aria-hidden />
      <div className="pm-beta-alert__sparkles" aria-hidden>
        <span></span><span></span><span></span><span></span>
      </div>
      <div className="pm-beta-alert__inner">
        <div className="pm-beta-alert__badge">
          <i className="fas fa-seedling"></i>
          <span>{copy.eyebrow}</span>
        </div>
        <h2 className="pm-beta-alert__title">{copy.title}</h2>
        <p className="pm-beta-alert__lede">
          {copy.lede(planCtx.daysUntilExpiry, planCtx.expiresOn)}
        </p>
        <p className="pm-beta-alert__body">{copy.body}</p>
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   Loading + error
   ───────────────────────────────────────────────────────────────────────── */

const PlanManagerSkeleton: React.FC = () => (
  <div className="pm-skeleton" aria-busy="true" aria-label="Loading billing information">
    <div className="pm-skeleton__hero">
      <div className="pm-skel pm-skel--eyebrow" />
      <div className="pm-skel pm-skel--num" />
      <div className="pm-skel pm-skel--sub" />
      <div className="pm-skel pm-skel--bar" />
    </div>
    <div className="pm-skeleton__nav">
      <div className="pm-skel pm-skel--tab" />
      <div className="pm-skel pm-skel--tab" />
      <div className="pm-skel pm-skel--tab" />
    </div>
    <div className="pm-skeleton__cards">
      {[0, 1, 2].map(i => (
        <div key={i} className="pm-skeleton__card">
          <div className="pm-skel pm-skel--title" />
          <div className="pm-skel pm-skel--line" />
          <div className="pm-skel pm-skel--price" />
          <div className="pm-skel pm-skel--line pm-skel--short" />
          <div className="pm-skel pm-skel--line pm-skel--short" />
          <div className="pm-skel pm-skel--line pm-skel--short" />
          <div className="pm-skel pm-skel--btn" />
        </div>
      ))}
    </div>
  </div>
)

/**
 * Sign-in prompt shown when the user opens the panel without an account.
 * Remix AI now requires authentication, so the panel pivots from "manage
 * your plan" to "create your account" — anything plan- or catalog-related
 * is hidden by `PlanManagerOverlay` until `isAuthenticated` flips to true.
 *
 * Re-uses the same auth entry-point as the topbar Sign-In button:
 * `startSignInFlow` handles desktop (system browser) vs web (in-app modal),
 * and `LoginModal` is the shared provider-picker UI.
 */
const SignInPromptScreen: React.FC<{
  plugin: any
}> = ({ plugin }) => {
  const [showLoginModal, setShowLoginModal] = React.useState(false)
  const [pending, setPending] = React.useState(false)

  const handleSignIn = () => {
    setPending(true)
    Promise.resolve(startSignInFlow(plugin, () => setShowLoginModal(true), 'PlanManager Sign In'))
      .finally(() => setPending(false))
  }

  return (
    <>
      <section className="pm-signin">
        <div className="pm-signin__halo" aria-hidden />
        <div className="pm-signin__inner">
          <div className="pm-signin__badge">
            <i className="fas fa-sparkles"></i>
            <span>Account required</span>
          </div>
          <h2 className="pm-signin__title">Create a free account to use RemixAI</h2>

          <ul className="pm-signin__perks">
            <li><i className="fas fa-robot"></i> Solidity Assistant, Code Completion, and Security Audits</li>
            <li><i className="fas fa-lock"></i> Authorize via your existing identity — we never see your password.</li>
          </ul>

          <div className="pm-signin__actions">
            <button
              className="pm-signin__btn pm-signin__btn--primary"
              onClick={handleSignIn}
              disabled={pending}
              data-id="planManagerSignIn"
            >
              {pending
                ? <><i className="fas fa-spinner fa-spin"></i> Opening sign-in…</>
                : <><i className="fas fa-right-to-bracket"></i> Sign in to Remix</>}
            </button>
          </div>

          <p className="pm-signin__legal">
            By continuing, you agree to the&nbsp;
            <a href="https://remix-project.org/terms" target="_blank" rel="noreferrer">Terms of Service</a>
            &nbsp;and&nbsp;
            <a href="https://remix-project.org/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.
          </p>
        </div>
      </section>
      {showLoginModal && (
        <LoginModal onClose={() => setShowLoginModal(false)} plugin={plugin} />
      )}
    </>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   Email-verification gate
   ─────────────────────────────────────────────────────────────────────────────
   Two visual modes, decided from /permissions/:
     • has_email === false        → email input + "Send code" (SIWE users)
     • email_verified === false   → on-file email shown + "Send code" (SSO users)
   Both modes converge on the same OTP confirmation step.

   We talk straight to SSOApiService (auth.getSSOApi) — the same service the
   login modal uses — and on success ask the auth plugin to refresh
   permissions, which re-runs loadAccountData() and naturally hides this gate.
   ───────────────────────────────────────────────────────────────────────── */

type VerifyStep = 'request' | 'code'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const formatVerifyTimer = (seconds: number): string => {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

const EmailVerificationScreen: React.FC<{
  plugin: any
  permissions: { has_email?: boolean; email_verified?: boolean } | null
}> = ({ plugin, permissions }) => {
  // SSO users get `has_email: true` with a known address; SIWE users get
  // `has_email: false` and must supply one. We only consult `auth.getUser()`
  // for display when the address is on file — never echo a user-typed value
  // back as "your email".
  const isAddMode = permissions?.has_email === false

  const [onFileEmail, setOnFileEmail] = React.useState<string | null>(null)
  const [emailValue, setEmailValue] = React.useState('')
  const [step, setStep] = React.useState<VerifyStep>('request')
  const [otpDigits, setOtpDigits] = React.useState<string[]>(['', '', '', '', '', ''])
  const [sending, setSending] = React.useState(false)
  const [verifying, setVerifying] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [info, setInfo] = React.useState<string | null>(null)
  const [cooldown, setCooldown] = React.useState(0)
  const [expiresIn, setExpiresIn] = React.useState(0)
  const [attemptsRemaining, setAttemptsRemaining] = React.useState<number | null>(null)
  const otpRef = React.useRef<OtpDigitInputHandle>(null)
  const verifyingRef = React.useRef(false)

  // Pull the on-file email lazily so we can show "we'll send a code to alice@…"
  // before the first network round-trip.
  React.useEffect(() => {
    if (isAddMode) return
    let cancelled = false
    void (async () => {
      try {
        const user = await plugin.call('auth', 'getUser')
        if (!cancelled && user?.email) setOnFileEmail(user.email)
      } catch { /* getUser is best-effort here — the verify call itself doesn't need it */ }
    })()
    return () => { cancelled = true }
  }, [isAddMode, plugin])

  // Resend cooldown ticker — 60s per backend contract.
  React.useEffect(() => {
    if (cooldown <= 0) return
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000)
    return () => clearInterval(t)
  }, [cooldown])

  // Code expiry ticker — 10min per backend contract.
  React.useEffect(() => {
    if (expiresIn <= 0) return
    const t = setInterval(() => setExpiresIn((c) => Math.max(0, c - 1)), 1000)
    return () => clearInterval(t)
  }, [expiresIn])

  const targetEmail = isAddMode ? emailValue.trim() : onFileEmail
  const targetEmailMasked = (() => {
    if (!targetEmail) return ''
    const at = targetEmail.indexOf('@')
    if (at <= 0) return targetEmail
    const local = targetEmail.slice(0, at)
    const visible = local.slice(0, Math.min(2, local.length))
    return `${visible}***${targetEmail.slice(at)}`
  })()

  const handleSend = async (resend = false) => {
    setError(null)
    setInfo(null)
    if (sending || cooldown > 0) return

    if (isAddMode) {
      const email = emailValue.trim()
      if (!EMAIL_RE.test(email)) {
        setError('Please enter a valid email address')
        return
      }
    }

    setSending(true)
    try {
      const sso: any = await plugin.call('auth', 'getSSOApi')
      // Omit `email` for the on-file flow so the server uses the address it
      // already has — sending a stale value would risk a 409 race.
      const r = await sso.sendEmailVerification(isAddMode ? { email: emailValue.trim() } : {})

      if (r.ok) {
        if (r.data?.already_verified) {
          // Server says we're already done — just re-pull permissions and the
          // gate will close on the next render.
          setInfo('Your email is already verified.')
          await plugin.call('auth', 'refreshPermissions').catch(() => {})
          await plugin.refresh()
          return
        }
        setStep('code')
        setExpiresIn(r.data?.expires_in ?? 600)
        setCooldown(60)
        setOtpDigits(['', '', '', '', '', ''])
        setAttemptsRemaining(null)
        if (resend) setInfo('A new code is on its way.')
        setTimeout(() => otpRef.current?.focus(), 100)
        return
      }

      // Map known error codes to friendly copy.
      const code = r.error
      if (r.status === 429) {
        // Backend may include retry_after — but ApiResponse only surfaces the
        // error string. Fall back to 60s, which is the documented cooldown.
        setCooldown(60)
        setError('Please wait a moment before requesting another code.')
      } else if (code === 'EMAIL_IN_USE' || r.status === 409) {
        setError('That address is already linked to another account.')
      } else if (code === 'NO_EMAIL_ON_FILE') {
        setError('No email is on file for this account. Please enter one below.')
      } else if (code === 'Invalid email format') {
        setError('That email address looks invalid.')
      } else {
        setError(code || 'We couldn\'t send the verification code.')
      }
    } catch (e: any) {
      setError(e?.message || 'Network error — please try again.')
    } finally {
      setSending(false)
    }
  }

  const handleVerify = async (code?: string) => {
    if (verifyingRef.current) return
    const otp = code || otpDigits.join('')
    if (otp.length !== 6) return

    verifyingRef.current = true
    setVerifying(true)
    setError(null)
    setInfo(null)
    try {
      const sso: any = await plugin.call('auth', 'getSSOApi')
      const r = await sso.verifyEmailVerification(
        isAddMode ? { code: otp, email: emailValue.trim() } : { code: otp }
      )

      if (r.ok) {
        setInfo('Email verified — unlocking Remix AI…')
        // Per the backend brief the JWT is NOT refreshed; we MUST re-pull
        // /permissions/ so `email_verified` flips to true.
        await plugin.call('auth', 'refreshPermissions').catch(() => {})
        await plugin.refresh()
        return
      }

      const codeErr = r.error
      if (r.status === 429) {
        setError('Too many wrong attempts. Please request a new code.')
        setOtpDigits(['', '', '', '', '', ''])
        setAttemptsRemaining(0)
        setExpiresIn(0)
      } else if (r.status === 409 || codeErr === 'EMAIL_IN_USE') {
        setError('That address is already linked to another account.')
      } else if (codeErr?.toLowerCase().includes('expired')) {
        setError('Code expired — please request a new one.')
        setExpiresIn(0)
        setOtpDigits(['', '', '', '', '', ''])
      } else {
        // attempts_remaining isn't surfaced by ApiClient as a field; show the
        // best message we can. The user gets at most 5 tries server-side.
        setError(codeErr || 'Invalid code. Please try again.')
        setOtpDigits(['', '', '', '', '', ''])
        setTimeout(() => otpRef.current?.focus(), 100)
      }
    } catch (e: any) {
      setError(e?.message || 'Network error — please try again.')
    } finally {
      verifyingRef.current = false
      setVerifying(false)
    }
  }

  return (
    <section className="pm-verify pm-signin">
      <div className="pm-signin__halo" aria-hidden />
      <div className="pm-signin__inner">
        <div className="pm-signin__badge">
          <i className="fas fa-envelope-circle-check"></i>
          <span>Verify your email</span>
        </div>

        {step === 'request' && (
          <>
            <h2 className="pm-signin__title">
              {isAddMode
                ? 'Add an email to use Remix\u00a0AI'
                : 'Confirm your email to use Remix\u00a0AI'}
            </h2>
            <p className="pm-signin__lede">
              {isAddMode
                ? 'You signed in with a wallet, so we don\'t have an email on file. We need a verified address before unlocking AI features — it\'s how we keep included credits out of the hands of throwaway accounts and how you\'ll recover your plan if you ever lose your wallet.'
                : (<>
                  We\'ll email a 6-digit code to{' '}
                  <strong className="pm-verify__email">{targetEmailMasked || 'your address on file'}</strong>.
                  This is a one-time check to keep included credits out of throwaway accounts.
                </>)}
            </p>

            {isAddMode && (
              <div className="pm-verify__field">
                <label className="pm-verify__label" htmlFor="pm-verify-email">Email address</label>
                <input
                  id="pm-verify-email"
                  type="email"
                  className="pm-verify__input"
                  placeholder="you@example.com"
                  value={emailValue}
                  onChange={(e) => setEmailValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleSend() }}
                  autoComplete="email"
                  disabled={sending}
                />
              </div>
            )}

            {error && (
              <div className="pm-verify__alert pm-verify__alert--error" role="alert">
                <i className="fas fa-circle-exclamation"></i>{' '}{error}
              </div>
            )}
            {info && !error && (
              <div className="pm-verify__alert pm-verify__alert--info" role="status">
                <i className="fas fa-circle-info"></i>{' '}{info}
              </div>
            )}

            <div className="pm-signin__actions">
              <button
                className="pm-signin__btn pm-signin__btn--primary"
                onClick={() => void handleSend()}
                disabled={sending || cooldown > 0 || (isAddMode && !emailValue.trim())}
                data-id="planManagerSendVerification"
              >
                {sending
                  ? <><i className="fas fa-spinner fa-spin"></i> Sending…</>
                  : cooldown > 0
                    ? <><i className="fas fa-clock"></i> Resend in {cooldown}s</>
                    : <><i className="fas fa-paper-plane"></i> Send verification code</>}
              </button>
            </div>
          </>
        )}

        {step === 'code' && (
          <>
            <h2 className="pm-signin__title">Enter the 6-digit code</h2>
            <p className="pm-signin__lede">
              We sent it to <strong className="pm-verify__email">{targetEmailMasked}</strong>.
              The code expires in {formatVerifyTimer(expiresIn)}.
            </p>

            {error && (
              <div className="pm-verify__alert pm-verify__alert--error" role="alert">
                <i className="fas fa-circle-exclamation"></i>{' '}{error}
              </div>
            )}
            {info && !error && (
              <div className="pm-verify__alert pm-verify__alert--info" role="status">
                <i className="fas fa-circle-info"></i>{' '}{info}
              </div>
            )}

            <div className="pm-verify__otp">
              <OtpDigitInput
                ref={otpRef}
                value={otpDigits}
                onChange={setOtpDigits}
                onComplete={(c) => void handleVerify(c)}
                onSubmit={() => void handleVerify()}
                disabled={verifying}
              />
            </div>

            <div className="pm-signin__actions">
              <button
                className="pm-signin__btn pm-signin__btn--primary"
                onClick={() => void handleVerify()}
                disabled={verifying || otpDigits.join('').length !== 6}
                data-id="planManagerVerifyCode"
              >
                {verifying
                  ? <><i className="fas fa-spinner fa-spin"></i> Verifying…</>
                  : <><i className="fas fa-check"></i> Verify email</>}
              </button>
              <button
                className="pm-signin__btn pm-signin__btn--ghost"
                onClick={() => void handleSend(true)}
                disabled={sending || cooldown > 0}
              >
                {cooldown > 0
                  ? <>Resend in {cooldown}s</>
                  : <><i className="fas fa-rotate-right"></i> Resend code</>}
              </button>
              <button
                className="pm-signin__btn pm-signin__btn--ghost"
                onClick={() => {
                  setStep('request')
                  setOtpDigits(['', '', '', '', '', ''])
                  setError(null)
                  setInfo(null)
                  setExpiresIn(0)
                  setAttemptsRemaining(null)
                }}
                disabled={verifying}
              >
                <i className="fas fa-pen"></i> {isAddMode ? 'Change email' : 'Use a different email'}
              </button>
            </div>
          </>
        )}

        <p className="pm-signin__legal">
          We never share your email. By verifying you agree to the&nbsp;
          <a href="https://remix-project.org/terms" target="_blank" rel="noreferrer">Terms</a>
          &nbsp;and&nbsp;
          <a href="https://remix-project.org/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.
        </p>
      </div>
    </section>
  )
}

const PlanManagerError: React.FC<{ message?: string | null; onRetry: () => void }> = ({ message, onRetry }) => (
  <div className="pm-empty pm-empty--error">
    <div className="pm-empty__icon">
      <i className="fas fa-cloud-exclamation"></i>
    </div>
    <div className="pm-empty__title">We couldn't load your billing details</div>
    <p className="pm-empty__body">
      {message
        ? <>The billing service responded with: <code>{message}</code>. Your plan and credits are safe — this is just a display issue.</>
        : <>The billing service didn't respond. Your plan and credits are safe — this is just a display issue. Try again in a moment, or check your connection.</>}
    </p>
    <div className="pm-empty__actions">
      <button className="pm-empty__btn pm-empty__btn--primary" onClick={onRetry}>
        <i className="fas fa-rotate-right"></i> Try again
      </button>
      <a
        className="pm-empty__btn pm-empty__btn--ghost"
        href="https://status.remix-project.org"
        target="_blank"
        rel="noreferrer"
      >
        <i className="fas fa-arrow-up-right-from-square"></i> Service status
      </a>
    </div>
  </div>
)

/* ─────────────────────────────────────────────────────────────────────────────
   Checkout result screen
   ───────────────────────────────────────────────────────────────────────── */

const CHECKOUT_COPY: Record<CheckoutResultKind, {
  eyebrow: string
  icon: string
  title: (intent: string, itemLabel?: string, meta?: Record<string, string>) => string
  body: (intent: string, itemLabel?: string, meta?: Record<string, string>) => string
}> = {
  processing: {
    eyebrow: 'Processing',
    icon: 'fas fa-spinner fa-spin',
    title: (intent, item) => intent === 'cancel'
      ? `Cancelling ${item || 'your subscription'}…`
      : intent === 'reactivate'
        ? `Reactivating ${item || 'your subscription'}…`
        : 'Confirming your payment…',
    body: (intent, item) => intent === 'cancel'
      ? `We’re processing your cancellation${item ? ` of ${item}` : ''}. This usually takes just a moment.`
      : intent === 'reactivate'
        ? `We’re removing the scheduled cancellation${item ? ` for ${item}` : ''}. This usually takes just a moment.`
        : `We're waiting for confirmation from the payment processor${item ? ` for ${item}` : ''}. This usually takes a few seconds — feel free to keep this open or close it; we'll notify you when it lands.`
  },
  success: {
    eyebrow: 'Payment confirmed',
    icon: 'fas fa-check',
    title: (intent, item) =>
      intent === 'topup' ? `${item || 'Credits'} added to your account` :
        intent === 'subscription' ? `Welcome to ${/^remix/i.test(item || '') ? item : `Remix ${item || 'Pro'}`}!` :
          intent === 'cancel' ? `${item || 'Subscription'} cancelled` :
            intent === 'reactivate' ? `${item || 'Subscription'} reactivated` :
              'Purchase confirmed',
    body: (intent, _item, meta) =>
      intent === 'topup'
        ? 'Your balance has been updated. AI workflows are ready to go.'
        : intent === 'subscription'
          ? 'Your plan is active. New limits, integrations, and credits are available now.'
          : intent === 'cancel'
            ? (meta?.effectiveFrom === 'next_billing_period'
              ? `Your subscription will end${meta?.accessUntil ? ` on ${meta.accessUntil}` : ' at the end of your current billing period'}. Until then nothing changes — you keep every paid feature and credit.`
              : 'Your subscription has been cancelled and you’re back on the Free plan. Any unused paid credits stay in your account and keep working.')
            : intent === 'reactivate'
              ? 'Your subscription will renew as normal — the scheduled cancellation has been removed and you keep every paid feature and credit.'
              : 'You can start using your new entitlements right away.'
  },
  closed: {
    eyebrow: 'Checkout cancelled',
    icon: 'fas fa-arrow-left',
    title: () => 'No payment was made',
    body: (intent) =>
      intent === 'topup'
        ? 'You closed the checkout before completing the purchase. No card was charged. Pick a top-up amount whenever you\'re ready.'
        : 'You closed the checkout before completing the upgrade. Your current plan is unchanged. Take another look at the options below when you\'re ready.'
  },
  error: {
    eyebrow: 'Payment failed',
    icon: 'fas fa-circle-exclamation',
    title: (intent, item, meta) => {
      if (meta?.flow === 'plan-change-preview') {
        return meta?.errorCode === 'downgrade_not_supported'
          ? `Can't switch to ${item || 'that plan'} mid-cycle`
          : `Couldn't preview ${item || 'that plan'}`
      }
      return intent === 'cancel'
        ? 'We couldn’t cancel your subscription'
        : intent === 'reactivate'
          ? 'We couldn’t reactivate your subscription'
          : 'We couldn’t complete your payment'
    },
    body: (intent, _item, meta) => {
      if (meta?.flow === 'plan-change-preview') {
        return meta?.errorCode === 'downgrade_not_supported'
          ? 'Your current plan is unchanged. Cancel at period end, then choose the lower plan after this billing period expires.'
          : 'Your current plan is unchanged. Please try again in a moment.'
      }
      if (intent === 'topup') return 'Your top-up didn\'t go through. No credits were added and no card was charged.'
      if (intent === 'cancel') return 'Your cancellation request didn’t go through. Your subscription is unchanged. Please try again or contact support if the problem persists.'
      if (intent === 'reactivate') return 'Your reactivation request didn’t go through. The scheduled cancellation is still in place. Please try again or contact support if the problem persists.'
      return 'Your subscription change didn\'t go through. Your current plan is unchanged and no card was charged.'
    }
  }
}

const CheckoutResultScreen: React.FC<{
  result: CheckoutResult
  onDismiss: () => void
  onViewPlans: () => void
  onViewTopUps: () => void
}> = ({ result, onDismiss, onViewPlans, onViewTopUps }) => {
  const copy = CHECKOUT_COPY[result.kind]
  const isCancel = result.intent === 'cancel'
  const isUnsupportedDowngrade = result.kind === 'error' && result.meta?.errorCode === 'downgrade_not_supported'
  const tryAgain = isCancel || isUnsupportedDowngrade ? onViewPlans : (result.intent === 'topup' ? onViewTopUps : onViewPlans)
  const tryAgainLabel = isCancel || isUnsupportedDowngrade ? 'Back to plans' : (result.intent === 'topup' ? 'Choose a top-up' : 'Back to plans')
  const eyebrow = isCancel
    ? (result.kind === 'success' ? 'Cancellation confirmed'
      : result.kind === 'processing' ? 'Cancelling'
        : result.kind === 'error' ? 'Cancellation failed'
          : copy.eyebrow)
    : result.kind === 'error' && result.meta?.flow === 'plan-change-preview'
      ? 'Plan change unavailable'
      : copy.eyebrow

  return (
    <section className={`pm-result pm-result--${result.kind}`}>
      <div className={`pm-result__halo pm-result__halo--${result.kind}`} aria-hidden />

      <div className={`pm-result__icon pm-result__icon--${result.kind}`}>
        <i className={copy.icon}></i>
      </div>

      <div className="pm-result__eyebrow">{eyebrow}</div>
      <h2 className="pm-result__title">{copy.title(result.intent, result.itemLabel, result.meta)}</h2>
      <p className="pm-result__body">{copy.body(result.intent, result.itemLabel, result.meta)}</p>

      {result.kind === 'error' && result.errorMessage && (
        <div className="pm-result__detail">
          <i className="fas fa-info-circle"></i>
          <span>{result.errorMessage}</span>
        </div>
      )}

      {result.transactionId && (
        <div className="pm-result__txn">
          <span className="pm-result__txn-label">Reference</span>
          <code className="pm-result__txn-id">{result.transactionId}</code>
        </div>
      )}

      <div className="pm-result__actions">
        {result.kind === 'success' && (
          <button className="pm-result__btn pm-result__btn--primary" onClick={isCancel ? onViewPlans : onDismiss}>
            <i className={isCancel ? 'fas fa-arrow-left' : 'fas fa-arrow-right'}></i>{' '}
            {isCancel ? 'Back to plans' : 'Continue'}
          </button>
        )}

        {result.kind === 'closed' && (
          <>
            <button className="pm-result__btn pm-result__btn--primary" onClick={tryAgain}>
              <i className="fas fa-arrow-left"></i> {tryAgainLabel}
            </button>
            <button className="pm-result__btn pm-result__btn--ghost" onClick={onDismiss}>
              Dismiss
            </button>
          </>
        )}

        {result.kind === 'error' && (
          <>
            {!isCancel && (
              <button className="pm-result__btn pm-result__btn--primary" onClick={tryAgain}>
                <i className={isUnsupportedDowngrade ? 'fas fa-arrow-left' : 'fas fa-rotate-right'}></i> {isUnsupportedDowngrade ? tryAgainLabel : 'Try again'}
              </button>
            )}
            {isCancel && (
              <button className="pm-result__btn pm-result__btn--primary" onClick={onDismiss}>
                <i className="fas fa-arrow-left"></i> Back to account
              </button>
            )}
            {isUnsupportedDowngrade ? (
              <button className="pm-result__btn pm-result__btn--ghost" onClick={onDismiss}>
                Dismiss
              </button>
            ) : (
              <a
                className="pm-result__btn pm-result__btn--ghost"
                href={DISCORD_URL}
                target="_blank"
                rel="noreferrer"
              >
                <i className="fas fa-life-ring"></i> Contact support
              </a>
            )}
          </>
        )}

        {result.kind === 'processing' && (
          <button className="pm-result__btn pm-result__btn--ghost" onClick={onDismiss}>
            Close — I'll wait
          </button>
        )}
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   Helpers
   ───────────────────────────────────────────────────────────────────────── */

/**
 * In-panel confirm modal. Driven by `snap.confirmDialog` and resolved through
 * `plugin.resolveConfirm()`. Backdrop click and Escape both resolve to `null`.
 *
 * Declared as a `function` (not `const`) so the call site at the top of the
 * file resolves via hoisting \u2014 the modal lives next to the other helpers.
 */
function ConfirmModal({ dialog, onResolve }: {
  dialog: ConfirmDialog
  onResolve: (value: string | null) => void
}): JSX.Element {
  // ESC dismiss. Re-runs whenever the active dialog id changes.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onResolve(null)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
    // dialog.id intentionally in deps so each new dialog gets its own listener
  }, [dialog.id, onResolve])

  return (
    <div className="pm-modal__backdrop" onClick={() => onResolve(null)} role="presentation">
      <div
        className={`pm-modal pm-modal--${dialog.variant ?? 'default'}${dialog.icon ? ' pm-modal--with-icon' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${dialog.id}-title`}
        onClick={(e) => e.stopPropagation()}
        style={dialog.accent ? ({ ['--pm-modal-accent' as any]: dialog.accent } as React.CSSProperties) : undefined}
      >
        <div className="pm-modal__atmosphere" aria-hidden="true">
          <div className="pm-modal__atmosphere-orb"></div>
          <div className="pm-modal__atmosphere-grain"></div>
        </div>
        <div className="pm-modal__header">
          {dialog.icon && (
            <div className="pm-modal__icon" aria-hidden="true">
              <i className={dialog.icon}></i>
            </div>
          )}
          <div className="pm-modal__heading">
            {dialog.eyebrow && <div className="pm-modal__eyebrow">{dialog.eyebrow}</div>}
            <h3 className="pm-modal__title" id={`${dialog.id}-title`}>{dialog.title}</h3>
          </div>
          <button
            type="button"
            className="pm-modal__close"
            aria-label="Dismiss"
            onClick={() => onResolve(null)}
          >
            <i className="fas fa-times"></i>
          </button>
        </div>
        <div className="pm-modal__body">
          {dialog.message.split('\n').filter(Boolean).map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
        {dialog.highlights && dialog.highlights.length > 0 && (
          <div className="pm-modal__highlights" role="list">
            {dialog.highlights.map((h, i) => (
              <div
                key={`${h.label}-${i}`}
                role="listitem"
                className={`pm-modal__highlight pm-modal__highlight--${h.tone ?? 'default'}`}
              >
                <div className="pm-modal__highlight-label">{h.label}</div>
                <div className="pm-modal__highlight-value">{h.value}</div>
              </div>
            ))}
          </div>
        )}
        <div className={`pm-modal__actions pm-modal__actions--count-${dialog.actions.length}`}>
          {dialog.actions.map((action) => {
            const actionSlug = action.value.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/_/g, '-')
            return (
              <button
                key={action.value}
                type="button"
                className={`pm-modal__btn pm-modal__btn--${action.variant ?? 'primary'} pm-modal__btn--action-${actionSlug}`}
                onClick={() => onResolve(action.value)}
              >
                {action.icon && <i className={action.icon}></i>}
                <span>{action.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * Format a Paddle proration amount for display. Paddle returns minor units
 * (cents) as numbers OR strings (e.g. `"199"` for $1.99). Be lenient.
 */
function formatMoney(amount: unknown, currency: string = 'USD'): string {
  const n = typeof amount === 'string' ? parseFloat(amount) : Number(amount)
  if (!Number.isFinite(n)) return ''
  // Paddle minor units (cents). Negative values \u2014 e.g. credit \u2014 are surfaced
  // as their absolute amount; the surrounding copy already conveys the sign.
  const major = Math.abs(n) / 100
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(major)
  } catch {
    return `${currency} ${major.toFixed(2)}`
  }
}

function buildUsageRange(days: number): { from: string; to: string } {
  const to = new Date()
  const from = new Date(to.getTime())
  from.setUTCDate(from.getUTCDate() - Math.max(0, days - 1))
  return {
    from: toIsoDay(from),
    to: toIsoDay(to)
  }
}

function toIsoDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function toFiniteNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

const USAGE_ACCENTS = [
  'var(--custom-primary)',
  'var(--bs-success)',
  'var(--bs-warning)',
  'var(--bs-info)',
  'var(--bs-danger)',
]
function pickUsageAccent(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return USAGE_ACCENTS[h % USAGE_ACCENTS.length]
}

function buildUsageRows(report: UsageReport | null): UsageDisplayRow[] {
  if (!report?.rows?.length) return []

  const merged = new Map<string, Omit<UsageDisplayRow, 'key' | 'sharePct' | 'barColor'>>()
  for (const row of report.rows) {
    const model = (typeof row.model === 'string' && row.model.trim()) || 'Unknown model'
    const provider = (typeof row.provider === 'string' && row.provider.trim()) || null
    const key = `${provider || 'unknown'}:${model}`
    const prev = merged.get(key)
    if (prev) {
      prev.credits += toFiniteNumber(row.credits)
      prev.calls += toFiniteNumber(row.calls)
      prev.totalTokens += toFiniteNumber(row.total_tokens)
      prev.costUsd += toFiniteNumber(row.cost_usd)
      continue
    }
    merged.set(key, {
      model,
      provider,
      credits: toFiniteNumber(row.credits),
      calls: toFiniteNumber(row.calls),
      totalTokens: toFiniteNumber(row.total_tokens),
      costUsd: toFiniteNumber(row.cost_usd)
    })
  }

  const rawRows = Array.from(merged.entries()).map(([key, value]) => ({ key, ...value }))
  const usefulRows = rawRows.filter((row) => row.credits > 0 || row.calls > 0 || row.totalTokens > 0 || row.costUsd > 0)
  const totalCredits = usefulRows.reduce((sum, row) => sum + row.credits, 0)
  const totalTokens = usefulRows.reduce((sum, row) => sum + row.totalTokens, 0)
  const shareBase = totalCredits > 0 ? totalCredits : totalTokens

  return usefulRows
    .sort((a, b) => b.credits - a.credits || b.totalTokens - a.totalTokens || b.calls - a.calls)
    .map((row) => {
      const shareValue = totalCredits > 0 ? row.credits : row.totalTokens
      return {
        ...row,
        sharePct: shareBase > 0 ? (shareValue / shareBase) * 100 : 0,
        barColor: pickUsageAccent(row.key)
      }
    })
}

function formatCreditValue(value: number): string {
  if (!Number.isFinite(value)) return '0'
  const rounded = Math.round(value)
  if (Math.abs(value - rounded) < 0.01) return rounded.toLocaleString()
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) return '0'
  if (Math.abs(value) >= 10_000) {
    return new Intl.NumberFormat(undefined, {
      notation: 'compact',
      maximumFractionDigits: 1
    }).format(value)
  }
  return Math.round(value).toLocaleString()
}

function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return '$0.00'
  const abs = Math.abs(value)
  const fractionDigits = abs > 0 && abs < 0.01 ? 4 : 2
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: fractionDigits
  }).format(value)
}
