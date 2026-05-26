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
import React, { useEffect, useMemo, useSyncExternalStore } from 'react'
import { PluginViewWrapper } from '@remix-ui/helper'
// Paddle singleton lives next to this plugin now — `@remix-ui/billing` was
// removed when Plan Manager became the sole billing surface.
import { initPaddle, getPaddle, openCheckoutWithTransaction, onPaddleEvent, offPaddleEvent } from './paddle-singleton'
import type { Paddle, PaddleEventData } from '@paddle/paddle-js'
import type { CreditsUsageQuery, UsageReport } from '@remix-api'
import * as packageJson from '../../../../../package.json'

import {
  PlanManagerStore,
  type PlanManagerSnapshot,
  type CheckoutResult,
  type CheckoutResultKind,
  type CheckoutIntent,
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
  type QuotaEntry,
  type UiVisibility
} from './plan-manager-machine'
import { LoginModal, startSignInFlow, OtpDigitInput, OtpDigitInputHandle } from '@remix-ui/login'

import './plan-manager.css'

const PLAN_ICON = 'data:image/svg+xml;base64,' + btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#a2a3bd" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 4 6v6c0 5 3.4 9.5 8 10 4.6-.5 8-5 8-10V6l-8-4z"/><path d="M9 12l2 2 4-4"/></svg>`)

const profile = {
  name: 'planManager',
  displayName: 'Plan & Credits',
  description: 'Manage your subscription, top up credits and review AI usage',
  methods: ['open', 'close', 'toggle', 'setCheckoutResult', 'reportCreditsExhausted', 'refresh', 'purchaseCredits', 'subscribeToPlan', 'changePlan', 'cancelSubscription', 'resolveConfirm'],
  events: ['opened', 'closed', 'checkoutResultChanged'],
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
  // Paddle wiring is owned by the plugin so the panel can drive checkout
  // end-to-end without a host shell. The Paddle singleton lives in
  // ./paddle-singleton (formerly @remix-ui/billing).
  private paddle: Paddle | null = null
  private paddleEventHandler: ((e: PaddleEventData) => void) | null = null

  constructor() {
    super(profile)
    // Dev-only UI controls are hidden by default. Flip this to `true`
    // locally when you want scenario switchers + machine debug traces.
    this.debugUI = false
    this.store = new PlanManagerStore({ debug: this.debugUI })

    // Surface checkout results as a plugin event so external listeners
    // (e.g. analytics) can react without subscribing to the store.
    let lastResult: CheckoutResult | null = null
    this.store.subscribe(() => {
      const next = this.store.getSnapshot().checkoutResult
      if (next !== lastResult) {
        lastResult = next
        this.emit('checkoutResultChanged', next)
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
  }

  async onActivation(): Promise<void> {
    this.renderComponent()

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

    // Bridge auth events. Re-fired on token refresh so we tolerate noise.
    const onAuthChange = (s: { isAuthenticated: boolean; token?: string; user?: { id?: number } }) => {
      const sig = `${s.isAuthenticated}|${s.token ?? ''}`
      if (sig === this.lastAuthSig) return
      this.lastAuthSig = sig
      this.store.send({
        type: 'AUTH_CHANGED',
        isAuthenticated: !!s.isAuthenticated,
        token: s.token ?? null,
        userId: s.user?.id ?? null
      })
      if (s.isAuthenticated) void this.loadAccountData()
    }
    try {
      this.on('auth', 'authStateChanged', onAuthChange as any)
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
      console.warn('[PlanManager] auth bridge failed', err)
    }
  }

  onDeactivation(): void {
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
  async open(intent?: OpenIntent): Promise<void> {
    this.store.send({ type: 'OPEN_OVERLAY', intent })
    // Refresh on every open — catalog (plans/packages) and, when signed
    // in, account-scoped data (credits/quotas, subscription, permissions).
    // This keeps the panel consistent with the API instead of relying on
    // whatever was loaded at login.
    this.refreshOnOpen()
    try {
      await this.call('menuicons', 'select', 'planManager')
    } catch { /* noop */ }
  }

  close(): void {
    this.store.send({ type: 'CLOSE_OVERLAY' })
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
    this.store.send({ type: 'CATALOG_LOAD' })
    void this.loadCatalog()
    const snap = this.store.getSnapshot()
    if (snap.isAuthenticated) {
      this.store.send({ type: 'REFRESH' })
      void this.loadAccountData()
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
      // Trigger a refresh so 'processing' promotes to 'success' once data
      // confirms (the machine handles the promotion in its DATA_LOADED action).
      void this.loadAccountData()
      break
    case 'closed':
      this.store.send({ type: 'CHECKOUT_CLOSED' })
      break
    case 'error':
      this.store.send({
        type: 'CHECKOUT_ERROR',
        message: result.errorMessage,
        transactionId: result.transactionId
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
    const snap = this.store.getSnapshot()
    const pkg = snap.catalogPackages.find(p => p.id === packageId)
    const itemLabel = pkg ? `${pkg.credits.toLocaleString()} credits${pkg.name ? ` (${pkg.name})` : ''}` : packageId
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
    if (planState.kind === 'paid' && !targetIsFree && planState.planId !== planId) {
      await this.changePlan(planId, resolvedPriceId)
      return
    }

    this.store.send({ type: 'CHECKOUT_INTENT', intent: 'subscription', itemLabel, productId: planId })
    await this.runCheckout('subscription', itemLabel, async () => {
      const productsApi: any = await this.call('auth', 'getProductsApi').catch(() => null)
      if (!productsApi) return { ok: false, error: 'Products API unavailable' }
      const req: any = { slug: planId, provider: 'paddle' }
      if (typeof resolvedPriceId === 'number') req.price_id = resolvedPriceId
      const resp = await productsApi.purchaseProduct(req)
      if (!resp?.ok) {
        const err = (resp?.data as any)?.error || resp?.error
        if (err === 'ALREADY_SUBSCRIBED') {
          // Defensive fallback — the pre-flight above should normally have
          // routed us already, but the user's local snapshot might be stale.
          void this.changePlan(planId, resolvedPriceId)
          return { ok: false, error: 'You already have an active paid subscription. Switching to the change-plan flow…' }
        }
        return { ok: false, error: resp?.error || 'Could not start purchase.' }
      }
      const data: any = resp.data
      // Free / immediate-grant path — no checkout, just refresh.
      if (data?.immediate === true) {
        return { ok: true, data: { immediate: true, message: data.message } as any }
      }
      // Paid path — standard checkout payload.
      return { ok: true, data: { transactionId: data?.transactionId, checkoutUrl: data?.checkoutUrl } }
    })
  }

  /**
   * Change the active paid subscription to a different paid plan.
   * Flow: POST /billing/subscription/preview-change → in-panel confirm with
   * proration totals → PATCH /billing/subscription → refresh account data.
   * Proration is always immediate; on payment failure the change is rejected.
   * Not for switching to free — use cancelSubscription() instead.
   */
  async changePlan(planId: string, priceId?: number): Promise<void> {
    const snap = this.store.getSnapshot()
    const plan = snap.catalogPlans.find(p => p.id === planId)
    const itemLabel = plan?.name ?? planId
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

      // 1. Preview proration. Best-effort — if it fails (e.g. provider quirk)
      //    we still let the user attempt the PATCH; the backend will reject
      //    if it really can't apply.
      let confirmMessage = `Switch your subscription to ${itemLabel}?`
      let chargeCentsNum: number | null = null
      let creditCentsNum: number | null = null
      let switchCurrency = 'USD'
      try {
        const previewReq: any = { planSlug: planId, prorationBillingMode: PRORATION }
        if (externalPriceId) previewReq.priceId = externalPriceId
        const preview = await billingApi.previewSubscriptionChange(previewReq)
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
      } catch { /* fall through to plain confirm */ }

      const choice = await this.requestConfirm({
        title: `Switch to ${itemLabel}`,
        message: confirmMessage,
        eyebrow: 'Plan switch',
        icon: 'fas fa-arrow-right-arrow-left',
        accent: pickAccent(planId),
        highlights: this.buildSwitchHighlights({
          fromPlanName: selectPlanState(snap).planName,
          toPlanName: itemLabel,
          toPlanCents: typeof plan?.priceUsd === 'number' ? plan.priceUsd : null,
          chargeCents: chargeCentsNum,
          creditCents: creditCentsNum,
          currency: switchCurrency
        }),
        actions: [
          { value: 'cancel', label: 'Keep current plan', variant: 'ghost' },
          { value: 'confirm', label: `Switch to ${itemLabel}`, variant: 'primary', icon: 'fas fa-arrow-right' }
        ]
      })
      if (choice !== 'confirm') {
        this.store.send({ type: 'CHECKOUT_CLOSED' })
        return
      }

      // 2. Commit.
      const changeReq: any = { planSlug: planId, prorationBillingMode: PRORATION, onPaymentFailure: ON_FAILURE }
      if (externalPriceId) changeReq.priceId = externalPriceId
      const resp = await billingApi.changeSubscription(changeReq)
      if (!resp?.ok) {
        this.store.send({ type: 'CHECKOUT_ERROR', message: resp?.error || 'Could not change plan.' })
        return
      }

      // 3. PATCH response already reflects new state — mark complete and refresh.
      this.store.send({ type: 'CHECKOUT_COMPLETED' })
      setTimeout(() => { void this.loadAccountData() }, 250)
    } catch (err: any) {
      console.error('[PlanManager] Plan change failed', err)
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
        message: 'Pick when the cancellation should take effect. After cancellation you\u2019ll keep the Free plan automatically \u2014 no action needed on your part.',
        variant: 'danger',
        eyebrow: 'Cancel subscription',
        icon: 'fas fa-circle-xmark',
        accent: '#e75b89',
        highlights: [
          { label: 'Current plan', value: planState.planName, tone: 'default' },
          ...(periodEndDate ? [{ label: 'Access until', value: periodEndDate, tone: 'positive' as const }] : []),
          { label: 'After cancellation', value: 'Free plan', tone: 'muted' as const }
        ],
        actions: [
          { value: 'keep', label: 'Keep subscription', variant: 'ghost' },
          { value: 'immediately', label: 'Cancel immediately', variant: 'danger', icon: 'fas fa-bolt' },
          { value: 'next_billing_period', label: periodEndLabel, variant: 'primary', icon: 'fas fa-calendar-check' }
        ]
      })
      if (choice !== 'immediately' && choice !== 'next_billing_period') return
      chosen = choice
    }

    // Route through the same checkout-result UI as purchases so the user
    // gets explicit confirmation, error states, and the data refresh that
    // flips the plan card to "Free" in real time.
    const planName = planState.planName
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
      // The data refresh promotes the result from 'processing' → 'success'.
      setTimeout(() => { void this.loadAccountData() }, 250)
    } catch (err: any) {
      console.error('[PlanManager] Cancel subscription failed', err)
      this.store.send({ type: 'CHECKOUT_ERROR', message: err?.message || 'Unexpected error during cancellation.' })
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
        console.log('[PlanManager] No Paddle client token from auth — checkout will fall back to hosted URL.')
        return
      }
      this.paddle = await initPaddle(config.clientToken, config.environment)
    } catch (err) {
      console.warn('[PlanManager] Paddle init failed', err)
    }
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
      this.store.send({ type: 'CHECKOUT_ERROR', message: 'Please sign in to complete the purchase.' })
      return
    }
    try {
      const billingApi = await this.call('auth', 'getBillingApi').catch(() => null) as any
      if (!billingApi) {
        this.store.send({ type: 'CHECKOUT_ERROR', message: 'Billing service is not available right now.' })
        return
      }
      const response = await apiCall(billingApi)
      if (!response?.ok || !response.data) {
        this.store.send({ type: 'CHECKOUT_ERROR', message: response?.error || 'Could not start checkout.' })
        return
      }
      const { transactionId, checkoutUrl } = response.data as { transactionId?: string; checkoutUrl?: string; immediate?: boolean }
      // Immediate-grant path (e.g. free plan via /products/purchase) — no
      // Paddle hand-off; the backend already granted the membership.
      if ((response.data as any).immediate === true) {
        this.store.send({ type: 'CHECKOUT_COMPLETED' })
        // Trigger a fast data refresh so the UI reflects the new plan.
        setTimeout(() => { void this.loadAccountData() }, 250)
        return
      }
      const paddleInstance = this.paddle ?? getPaddle()
      if (paddleInstance && transactionId) {
        // Paddle.js overlay — events come back via the singleton handler.
        openCheckoutWithTransaction(paddleInstance, transactionId, {
          settings: { displayMode: 'overlay', theme: 'light' }
        })
        this.store.send({ type: 'CHECKOUT_OPENED' })
      } else if (checkoutUrl) {
        // Hosted-checkout fallback — we won't get Paddle events back, so
        // surface a "processing" state immediately and poll the backend
        // until the webhook lands.
        window.open(checkoutUrl, '_blank', 'noopener,noreferrer')
        this.store.send({ type: 'CHECKOUT_COMPLETED', transactionId })
        console.log('[plan-manager:poll] triggered from hosted-url fallback', { intent, transactionId })
        void this.pollPaymentConfirmation(intent, transactionId)
      } else {
        this.store.send({ type: 'CHECKOUT_ERROR', message: 'Backend returned no checkout reference.' })
      }
    } catch (err: any) {
      console.error('[PlanManager] Checkout failed', err)
      this.store.send({ type: 'CHECKOUT_ERROR', message: err?.message || 'Unexpected checkout error.' })
    }
    // Touch unused param to satisfy strict mode — `intent`/`itemLabel` are
    // already captured by CHECKOUT_INTENT before we get here. Keeping them
    // in the signature is forward-compat for richer error messages.
    void intent; void itemLabel
  }

  /** Translate Paddle SDK events into machine events. */
  private handlePaddleEvent(event: PaddleEventData): void {
    const transactionId = (event as any)?.data?.transaction_id as string | undefined
    switch (event.name) {
    case 'checkout.completed': {
      const pendingIntent = this.store.getSnapshot().pendingCheckout?.intent ?? 'subscription'
      this.store.send({ type: 'CHECKOUT_COMPLETED', transactionId })
      console.log('[plan-manager:poll] triggered from paddle checkout.completed', { intent: pendingIntent, transactionId })
      // Poll our backend (never Paddle) until the webhook has been processed,
      // then promote 'processing' → 'success'.
      void this.pollPaymentConfirmation(pendingIntent, transactionId)
      break
    }
    case 'checkout.closed':
      this.store.send({ type: 'CHECKOUT_CLOSED' })
      break
    // Paddle uses dot-separated names in TS, but the runtime payload may
    // also be `checkout.payment.failed`; handle both spellings.
    case 'checkout.payment.failed' as any:
    case 'checkout.error' as any: {
      const message = (event as any)?.error?.message
        || (event as any)?.data?.error?.message
        || 'Payment failed'
      this.store.send({ type: 'CHECKOUT_ERROR', message, transactionId })
      break
    }
    default:
      // Other events (loaded, customer.created, items.updated, etc.) are
      // not interesting for the panel right now.
      break
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
            prices
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
   * For subscriptions we poll `GET /billing/subscription` for
   * `hasActiveSubscription === true`. For credit packages (which never appear
   * in /billing/subscription) we poll `GET /billing/transaction/:txnId` and
   * stop on a terminal status. The 404 + `{ status: 'pending' }` body is the
   * documented "keep polling" signal — *not* an error.
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

    console.log(tag('start'), { intent, transactionId })

    const billingApi: any = await this.call('auth', 'getBillingApi').catch(() => null)
    if (!billingApi) {
      console.warn(tag('abort: no billing api'))
      return
    }

    const start = Date.now()
    const SOFT_CAP_MS = 60_000
    const HARD_CAP_MS = 300_000
    const intervalAt = (elapsed: number) => (elapsed < 15_000 ? 2_000 : 5_000)

    // Subscriptions are confirmed via /billing/subscription. Credit topups
    // *require* the transactionId since they never appear there.
    const useTransactionPoll = intent === 'topup'
    if (useTransactionPoll && !transactionId) {
      console.warn(tag('topup poll without transactionId — single refresh fallback'))
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
          console.log(tag(`tick ${tick} transaction`), {
            elapsedMs: elapsed,
            httpOk: resp?.ok,
            httpStatus: resp?.status,
            txnStatus: status
          })
          if (status && status !== 'pending') {
            if (status === 'completed') {
              console.log(tag('completed → refreshing account + permissions'))
              await this.completePurchaseRefresh()
            } else {
              const msg =
                status === 'failed' ? 'Payment failed.'
                  : status === 'canceled' ? 'Payment was canceled.'
                    : status === 'refunded' ? 'Payment was refunded.'
                      : status === 'disputed' ? 'Payment is under dispute.'
                        : `Payment ${status}.`
              console.warn(tag(`terminal failure: ${status}`))
              this.store.send({ type: 'CHECKOUT_ERROR', message: msg, transactionId })
            }
            return
          }
        } else {
          const resp = await billingApi.getSubscription()
          const hasActive = !!resp?.data?.hasActiveSubscription
          console.log(tag(`tick ${tick} subscription`), {
            elapsedMs: elapsed,
            httpOk: resp?.ok,
            httpStatus: resp?.status,
            hasActiveSubscription: hasActive,
            planSlug: resp?.data?.subscription?.planSlug ?? null
          })
          if (resp?.ok && hasActive) {
            console.log(tag('active subscription confirmed → refreshing account + permissions'))
            await this.completePurchaseRefresh()
            return
          }
        }
      } catch (err) {
        console.warn(tag(`tick ${tick} threw — keep polling`), err)
      }

      if (elapsed >= SOFT_CAP_MS) {
        console.warn(tag(`soft cap reached at ${elapsed}ms — UI stays in 'processing'`))
        return
      }
      const next = intervalAt(elapsed)
      console.debug(tag(`waiting ${next}ms before next tick`))
      await new Promise(r => setTimeout(r, next))
    }
    console.error(tag('hard cap reached without confirmation'))
  }

  /**
   * After a confirmed purchase / plan change / cancel, refresh everything the
   * user can see: local plan-manager data, the global access policy, the
   * permissions cache, and the credits counter. These drive the top-bar
   * avatar menu and feature-gated UI elsewhere in the IDE.
   */
  private async completePurchaseRefresh(): Promise<void> {
    const LOG = '[plan-manager:refresh]'
    console.log(LOG, 'start')
    await Promise.all([
      this.loadAccountData().catch(err => console.warn(LOG, 'loadAccountData failed', err)),
      this.call('auth', 'refreshPermissions').catch(err => console.warn(LOG, 'refreshPermissions failed', err)),
      this.call('auth', 'refreshCredits').catch(err => console.warn(LOG, 'refreshCredits failed', err)),
      this.call('auth', 'refreshAccessPolicy').catch(err => console.warn(LOG, 'refreshAccessPolicy failed', err))
    ])
    // Promote 'processing' → 'success' in the panel. DATA_LOADED alone won't
    // do it because the data state is usually 'ready' (not 'refreshing') by
    // the time we get here; PURCHASE_CONFIRMED is handled at machine root.
    this.store.send({ type: 'PURCHASE_CONFIRMED' })
    this.emit('purchaseConfirmed')
    console.log(LOG, 'done')
  }

  private async loadAccountData(): Promise<void> {
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
    <p>Compare plans, top up credits, and track your AI usage in one place.</p>
    <button className="plan-manager-stub-btn" onClick={() => plugin.open()}>
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
  // null = no expanded section (Plans / Top up / Usage all collapsed). The
  // panel landing view is intentionally quiet: hero + a summary of free
  // quotas + (when relevant) an upgrade promo. Tabs only expand on demand
  // OR when another plugin opens us with a routing intent (see effect below).
  const [activeSection, setActiveSection] = React.useState<'plans' | 'topup' | 'usage' | null>(null)

  // When a non-UI plugin opens us with an intent, follow its routing
  // hint. We track the intent identity (reference) so a fresh OPEN_OVERLAY
  // re-applies even if the user has since navigated away.
  const intent = snap.openIntent
  const lastIntentRef = React.useRef<OpenIntent | null>(null)
  useEffect(() => {
    if (!intent || intent === lastIntentRef.current) return
    lastIntentRef.current = intent
    if (intent.initialSection) {
      setActiveSection(intent.initialSection)
    } else if (intent.reason === 'feature-required' || intent.reason === 'quota-exhausted') {
      // Sensible defaults when the caller didn't pin a section.
      setActiveSection(intent.reason === 'quota-exhausted' ? 'topup' : 'plans')
    }
    // Otherwise leave the section collapsed — the user opened the panel
    // from the menu icon and we don't want to push a particular screen.
  }, [intent])

  // Close-on-Escape — UI concern, stays in React.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') plugin.close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [plugin])

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

  // Section visibility — driven by `ui:show-*` features on /permissions.
  // When all are absent we collapse to a minimal "Signed in as <plan>"
  // identity card (PlanIdentityCard) below. See selectUiVisibility for
  // default-deny rationale.
  const ui: UiVisibility = useMemo(() => selectUiVisibility(snap), [snap])
  // Keep `activeSection` honest with permissions: if the user (or an
  // intent) selected a tab the backend has since hidden, drop the
  // selection so we don't render a section without its nav entry.
  useEffect(() => {
    if (activeSection === 'plans' && !ui.showPlans) setActiveSection(null)
    else if (activeSection === 'topup' && !ui.showTopUps) setActiveSection(null)
    else if (activeSection === 'usage' && !ui.showUsage) setActiveSection(null)
  }, [activeSection, ui.showPlans, ui.showTopUps, ui.showUsage])

  const refreshDate = formatDate(status.refreshDate)

  return (
    <div className="pm-backdrop" onClick={() => plugin.close()}>
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

          <button className="pm-close" onClick={() => plugin.close()} aria-label="Close">
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
          user has a confirmed email on file (so we don't burn free credits on
          burner addresses, and so SIWE-only accounts can recover their plan).
          When `email_verified` is false (or `has_email` is false for SIWE
          users) we hide the catalog/hero/alerts and show a focused verify
          flow. Re-fetching permissions after a successful verify naturally
          unlocks the rest of the UI.
        */}
        {!checkoutResult && snap.isAuthenticated && snap.dataState === 'ready'
          && snap.permissions
          && (snap.permissions.has_email === false || snap.permissions.email_verified === false) && (
          <EmailVerificationScreen
            plugin={plugin}
            permissions={snap.permissions}
          />
        )}
        {!checkoutResult && snap.isAuthenticated && snap.dataState === 'ready'
          && (!snap.permissions
            || (snap.permissions.has_email !== false && snap.permissions.email_verified !== false)) && <>

          {/*
            When the user has no `ui:show-*` features granted we collapse
            the overlay to a minimal identity card. Onboarding flows use
            this to confirm sign-in without exposing the (currently
            irrelevant) plans/credits/quotas surface.
          */}
          {!ui.anyVisible && (
            <PlanIdentityCard planCtx={planCtx} />
          )}

          {/* Alerts are credit/plan-oriented — only meaningful when
              at least one of those surfaces is visible. */}
          {ui.anyVisible && activeAlert === 'beta-transition' && (
            <BetaTransitionAlert
              planCtx={planCtx}
              onUpgrade={() => setActiveSection('plans')}
              onTopUp={() => setActiveSection('topup')}
            />
          )}

          {ui.anyVisible && activeAlert === 'plan-lifecycle' && (
            <PlanLifecycleAlert
              planCtx={planCtx}
              onRenew={() => setActiveSection('plans')}
              onUpgrade={() => setActiveSection('plans')}
            />
          )}

          {ui.showCredits && activeAlert === 'credit' && (
            <CreditAlert
              status={status}
              refreshDate={refreshDate}
              canUpgrade={canUpgrade}
              onTopUp={() => setActiveSection('topup')}
              onUpgrade={() => setActiveSection('plans')}
            />
          )}

          {ui.showCredits && (
            <Hero
              status={status}
              refreshDate={refreshDate}
              planCtx={planCtx}
              heroCompact={activeAlert === 'beta-transition' || activeAlert === 'plan-lifecycle'}
              onTopUp={ui.showTopUps ? (() => setActiveSection('topup')) : undefined}
            />
          )}

          {/*
            Upgrade promo. Surfaced when the user has headroom in the
            catalog (free / starter-tier paid / etc.) and no higher-priority
            alert is showing — alerts already drive their own CTA, no
            point doubling up. Sits above the quotas so it gets attention
            before the user dives into per-model details. Requires the
            Plans surface — there's nowhere to send the user otherwise.
          */}
          {ui.showPlans && !activeAlert && canUpgrade && (
            <UpgradePromoBanner
              planCtx={planCtx}
              onUpgrade={() => setActiveSection(s => s === 'plans' ? null : 'plans')}
            />
          )}

          {ui.showQuotas && (
            <QuotasPanel
              quotas={quotas}
              aiModels={snap.permissions?.ai_models}
              planLabel={planCtx.planName}
              paidCredits={snap.credits?.paid_credits ?? 0}
              canUpgrade={canUpgrade && ui.showPlans}
              onUpgrade={() => setActiveSection('plans')}
              onTopUp={() => setActiveSection('topup')}
            />
          )}

          {(ui.showPlans || ui.showTopUps || ui.showUsage) && (
            <nav className="pm-nav">
              {([
                { id: 'plans', label: 'Plans', icon: 'fas fa-layer-group', visible: ui.showPlans },
                { id: 'topup', label: 'Top up', icon: 'fas fa-bolt', visible: ui.showTopUps },
                { id: 'usage', label: 'Usage breakdown', icon: 'fas fa-chart-bar', visible: ui.showUsage }
              ] as const).filter(s => s.visible).map(s => (
                <button
                  key={s.id}
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

          <main className="pm-main">
            {ui.showPlans && activeSection === 'plans' && (
              <PlansSection
                plans={visiblePlans}
                currentPlanId={planCtx.planId}
                userFeatureGroupNames={snap.permissions?.feature_groups?.map(g => g.name) ?? []}
                isTrialEligible={snap.isTrialEligible}
                purchasingId={purchasingProductId}
                requiredFeature={intent?.requiredFeature ?? null}
                onSubscribe={(planId, priceId) => plugin.subscribeToPlan(planId, priceId)}
                onCancel={() => plugin.cancelSubscription()}
                cancelledNotice={planCtx.kind === 'paid' && planCtx.isCancelled ? { expiresOn: planCtx.expiresOn } : null}
              />
            )}
            {ui.showTopUps && activeSection === 'topup' && (
              <TopUpSection
                packages={visiblePackages}
                purchasingId={purchasingProductId}
                onPurchase={(packageId) => plugin.purchaseCredits(packageId)}
              />
            )}
            {ui.showUsage && activeSection === 'usage' && <UsageSection plugin={plugin} />}
          </main>

        </>}

        <footer className="pm-footer">
          <div className="pm-footer__legal">
            {snap.isAuthenticated
              ? <>Signed in · billing data live</>
              : <>Catalog only · sign in to manage your subscription</>}
          </div>
          <div className="pm-footer__links">
            <a href="https://remix-ide.readthedocs.io/" target="_blank" rel="noreferrer">Docs</a>
            <a href="https://discord.gg/TWfKkZVwJW" target="_blank" rel="noreferrer">Support</a>
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
  planLabel: string
  /** Paid balance available to spend AFTER the free quota is drained. */
  paidCredits: number
  canUpgrade: boolean
  onUpgrade: () => void
  onTopUp: () => void
}> = ({ quotas, aiModels, planLabel, paidCredits, canUpgrade, onUpgrade, onTopUp }) => {
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
      aria-label="Free AI usage included with your plan"
    >
      <div className="pm-quotas__head">
        <div>
          <div className="pm-quotas__eyebrow">Free with {planLabel}</div>
          <h3 className="pm-quotas__title">Free AI usage included</h3>
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

          return (
            <article
              key={q.slug}
              className={`pm-quota pm-quota--${tone} ${exhausted ? 'pm-quota--exhausted' : ''} ${unlimited ? 'pm-quota--unlimited' : ''}`}
            >
              <header className="pm-quota__head">
                <div className="pm-quota__label">
                  <span className="pm-quota__name">{label}</span>
                  <span className="pm-quota__period">{periodWord} free</span>
                </div>
                {unlimited ? (
                  <span className="pm-quota__badge pm-quota__badge--unlimited" title="Unlimited free usage">∞ Unlimited</span>
                ) : (
                  <div className="pm-quota__counts">
                    <span className="pm-quota__used">{q.used.toLocaleString()}</span>
                    <span className="pm-quota__sep">/</span>
                    <span className="pm-quota__cap">{q.amount.toLocaleString()} free</span>
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
                      ? <>Free quota used — now drawing paid credits</>
                      : <>Free quota used — {reset.toLowerCase()}</>)
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
 * Lightweight "you can move up" banner. Shown when `selectCanUpgrade` is
 * true and no higher-priority alert is on screen. Copy adapts to the
 * user's current plan kind so we don't tell a paid user about "starting".
 */
const UpgradePromoBanner: React.FC<{
  planCtx: ReturnType<typeof selectPlanState>
  onUpgrade: () => void
}> = ({ planCtx, onUpgrade }) => {
  const isFree = planCtx.kind === 'no_subscription'
  const headline = isFree
    ? 'Unlock more credits and advanced models'
    : `Get more from Remix AI — upgrade from ${planCtx.planName}`
  const sub = isFree
    ? 'Higher daily caps, full model lineup, and paid credits that never expire.'
    : 'Bigger free quotas across every model, plus priority access on new releases.'

  return (
    <section className="pm-promo" aria-label="Upgrade your plan">
      <div className="pm-promo__glow" aria-hidden />
      <div className="pm-promo__body">
        <div className="pm-promo__eyebrow">
          <i className="fas fa-arrow-up-right-dots"></i>
          <span>Upgrade</span>
        </div>
        <h3 className="pm-promo__title">{headline}</h3>
        <p className="pm-promo__sub">{sub}</p>
      </div>
      <button type="button" className="pm-promo__cta" onClick={onUpgrade}>
        See plans
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
  const { remaining, total, state } = status

  // Credits don't expire and top-ups stack, so a "% of cycle" gauge would
  // misrepresent the model. We only surface a forward-looking line: when
  // does the next allowance land, or — for paid plans — when does the next
  // bill hit. `total` here is the per-cycle allowance from the subscription
  // (or the catalog plan it maps to). For free / beta / unknown we fall back
  // to a calmer copy that doesn't imply a quota the user can hit.
  const renderRenewal = (): React.ReactNode => {
    if (planCtx.kind === 'paid') {
      if (planCtx.isCancelled && refreshDate) {
        return <>Ends <em>{refreshDate}</em> · won't renew</>
      }
      if (refreshDate && total > 0) {
        return <>Renews <em>{refreshDate}</em> · <em>+{total.toLocaleString()}</em> credits</>
      }
      if (refreshDate) return <>Renews <em>{refreshDate}</em></>
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
        <div className="pm-hero__eyebrow">Credit balance</div>
        <div className="pm-hero__amount">
          <span className="pm-hero__num">{remaining.toLocaleString()}</span>
          <span className="pm-hero__unit">credits</span>
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
      { key: 'healthy',  label: 'Healthy',         credits: { balance: 800,  free_credits: 800,  paid_credits: 0 } },
      { key: 'low',      label: 'Low (15%)',       credits: { balance: 150,  free_credits: 150,  paid_credits: 0 } },
      { key: 'critical', label: 'Critical (1.8%)', credits: { balance: 18,   free_credits: 18,   paid_credits: 0 } },
      { key: 'empty',    label: 'Empty',           credits: { balance: 0,    free_credits: 0,    paid_credits: 0 } }
    ] as Array<{ key: string; label: string; credits: any }>
  },
  plan: {
    label: 'Plan',
    icon: 'fas fa-calendar-alt',
    options: [
      { key: 'beta-active',    permissions: makeBetaPermissions(null), subscription: null },
      { key: 'beta-ending',    permissions: makeBetaPermissions(daysFromNow(5)), subscription: null },
      { key: 'beta-ended',     permissions: makeBetaPermissions(daysFromNow(-3)), subscription: null },
      { key: 'paid-active',    permissions: { feature_groups: [], features: {} }, subscription: makeSub('active', 28, false) },
      { key: 'paid-expiring',  permissions: { feature_groups: [], features: {} }, subscription: makeSub('active', 4, true) },
      { key: 'paid-expired',   permissions: { feature_groups: [], features: {} }, subscription: makeSub('canceled', -2, true) }
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
          { kind: 'success',    label: 'success',    intent: 'topup',        itemLabel: '50,000 credits', transactionId: 'txn_01H8…' },
          { kind: 'closed',     label: 'closed',     intent: 'subscription', itemLabel: 'Builder plan' },
          { kind: 'error',      label: 'error',      intent: 'topup',        itemLabel: '50,000 credits',
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

const PlanCard: React.FC<{
  plan: any
  isCurrent: boolean
  isRecommended: boolean
  isPurchasing: boolean
  anyPurchasing: boolean
  isTrialEligible: boolean
  cancelledNotice: { expiresOn: string | null } | null
  onSubscribe: (planId: string, priceId?: number) => void
  onCancel: () => void
}> = ({ plan, isCurrent, isRecommended, isPurchasing, anyPurchasing, isTrialEligible, cancelledNotice, onSubscribe, onCancel }) => {
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

  const planSavings = computeYearlySavings(plan)
  const monthlyPrice = activePrices.find((pr: any) => pr.billing_interval === 'month')
  const yearlyPrice = activePrices.find((pr: any) => pr.billing_interval === 'year')
  let savingsBadge: string | null = null
  if (planSavings && planSavings.percent > 0 && monthlyPrice && yearlyPrice && cadence === 'year') {
    const dollarsSaved = Math.max(0, (monthlyPrice.price_cents * 12 - yearlyPrice.price_cents) / 100)
    const dollarLabel = dollarsSaved >= 1 ? `$${dollarsSaved.toFixed(dollarsSaved % 1 === 0 ? 0 : 2)}` : null
    const parts: string[] = []
    if (dollarLabel) parts.push(`Save ${dollarLabel} / yr`)
    else parts.push(`Save ${planSavings.percent}%`)
    if (planSavings.monthsFree > 0) parts.push(`${planSavings.monthsFree} months free`)
    savingsBadge = parts.join(' · ')
  }

  const priceLabel = selectedPriceCents === 0 ? 'Free' : `$${(selectedPriceCents / 100).toFixed(2)}`
  const cadenceLabel = selectedPriceCents === 0
    ? 'forever'
    : selectedInterval === 'year' ? 'per year' : 'per month'
  const isFree = selectedPriceCents === 0
  const trialDays = Number(plan.trialPeriodDays) || 0
  const showTrial = trialDays > 0 && isTrialEligible && !isCurrent && !isFree
  const trialCredits = Number(plan.trialCredits) || 0
  const disabled = isCurrent || isFree || anyPurchasing
  const accent = pickAccent(plan.id)

  return (
    <article
      className={`pm-plan ${isCurrent ? 'is-current' : ''} ${isRecommended ? 'is-recommended' : ''} ${isPurchasing ? 'is-purchasing' : ''}`}
      style={{ '--pm-accent': accent } as React.CSSProperties}
    >
      {isRecommended && !isCurrent && <div className="pm-plan__ribbon">Recommended</div>}
      {isCurrent && <div className="pm-plan__current">Current</div>}
      {showTrial && (
        <div className="pm-plan__trial-badge" title={trialCredits ? `${trialCredits} credits included` : undefined}>
          <i className="fas fa-gift"></i>
          <span>{trialDays}-day free trial</span>
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
        <span className="pm-plan__price-num">{priceLabel}</span>
        <span className="pm-plan__price-cad">{cadenceLabel}</span>
      </div>
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
        {isCurrent ? 'Active'
          : isPurchasing ? <><i className="fas fa-spinner fa-spin"></i> Opening checkout…</>
            : isFree ? 'Always free'
              : showTrial
                ? <><i className="fas fa-flask"></i> Start {trialDays}-day free trial</>
                : `Switch to ${plan.name}`}
      </button>
      {/* Cancel affordance — only on the active *paid* plan. Free /
          beta have no subscription row to cancel. */}
      {isCurrent && !isFree && (
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
          <button
            type="button"
            className="pm-plan__cancel-link"
            onClick={() => onCancel()}
            title="Cancel your subscription"
          >
            {cancelledNotice ? 'Manage cancellation' : 'Cancel subscription'}
          </button>
        </>
      )}
    </article>
  )
}

const PlansSection: React.FC<{
  plans: any[]
  currentPlanId: string | null
  /** Feature group names the user already has (from permissions). Used to detect
   * "current" when the subscription record is absent but a feature group was
   * granted directly (e.g. after purchasing via /products/available). */
  userFeatureGroupNames: string[]
  /** True when the user has never used a trial — enables "Start free trial" CTAs. */
  isTrialEligible: boolean
  purchasingId: string | null
  /** Feature key (e.g. 'ai:Anthropic') that triggered the open, if any. Surfaced as a banner. */
  requiredFeature: string | null
  onSubscribe: (planId: string, priceId?: number) => void
  /** Cancel the active paid subscription. Opens the in-panel chooser. */
  onCancel: () => void
  /** When the active paid sub is set to cancel, show "will not renew" copy. */
  cancelledNotice: { expiresOn: string | null } | null
}> = ({ plans, currentPlanId, userFeatureGroupNames, isTrialEligible, purchasingId, requiredFeature, onSubscribe, onCancel, cancelledNotice }) => {
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

  return (
    <div className="pm-plans">
      {requiredFeature && (
        <div className="pm-plans__required" role="status">
          <i className="fas fa-bolt" aria-hidden></i>
          <span>
            Your current plan doesn't include <code>{requiredFeature}</code>.
            Choose a plan below that does to unlock it.
          </span>
        </div>
      )}
      {sorted.map(plan => {
        const isCurrent = plan.id === currentPlanId ||
          (plan.featureGroupName != null && userFeatureGroupNames.includes(plan.featureGroupName))
        const isRecommended = plan.id === recommendedId
        const isPurchasing = purchasingId === plan.id
        return (
          <PlanCard
            key={plan.id}
            plan={plan}
            isCurrent={isCurrent}
            isRecommended={isRecommended}
            isPurchasing={isPurchasing}
            anyPurchasing={anyPurchasing}
            isTrialEligible={isTrialEligible}
            cancelledNotice={cancelledNotice}
            onSubscribe={onSubscribe}
            onCancel={onCancel}
          />
        )
      })}
      {/* Team / Enterprise contact strip — compact one-liner so it doesn't
          compete visually with the priced cards. */}
      <a
        className="pm-enterprise-strip"
        href="mailto:sales@remix.live?subject=Remix%20Team%20%2F%20Enterprise%20enquiry"
        target="_blank"
        rel="noopener noreferrer"
      >
        <span className="pm-enterprise-strip__label">
          <i className="fas fa-building" aria-hidden></i>
          <strong>Team &amp; Enterprise</strong>
          <span className="pm-enterprise-strip__sub">SSO, pooled credits, custom quotas</span>
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
}> = ({ packages, purchasingId, onPurchase }) => {
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
      </div>
      <div className="pm-topup__grid">
        {packages.map(t => {
          // Defensive coercion — a missing/non-numeric `credits` or `priceUsd`
          // would otherwise throw in `.toLocaleString()` / division below and
          // take down the entire panel.
          const credits = Number(t?.credits) || 0
          const priceCents = Number(t?.priceUsd) || 0
          const isPopular = t.popular === true || t.popular === 1 || t.popular === '1'
          const price = `$${(priceCents / 100).toFixed(2)}`
          const perK = credits > 0 ? ((priceCents / 100) / (credits / 1000)).toFixed(2) : '—'
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
              {isPopular ? <div className="pm-topup__pop">Best value</div> : null}
              <div className="pm-topup__credits">
                <span className="pm-topup__credits-num">{credits.toLocaleString()}</span>
                <span className="pm-topup__credits-unit">credits</span>
              </div>
              <div className="pm-topup__price">{price}</div>
              <div className="pm-topup__perk">{credits > 0 ? `$${perK} per 1k credits` : 'Pricing unavailable'}</div>
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
        <a href="mailto:remix@ethereum.org">Contact us</a>
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
          <div className="pm-usage__total-lbl">credits billed</div>
        </div>
      </div>

      <div className="pm-usage__tokens">
        {formatCompactNumber(totals.calls)} calls | {formatCompactNumber(totals.totalTokens)} tokens | {formatUsd(totals.costUsd)} provider cost
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
                {formatCompactNumber(row.calls)} calls | {formatCompactNumber(row.totalTokens)} tokens | {formatUsd(row.costUsd)}
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
    body: (r) => `AI features are paused until you top up, upgrade your plan${r ? `, or your free allowance refills on ${r}` : ''}.`,
    icon: 'fas fa-bolt'
  }
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

  return (
    <section className={`pm-alert pm-alert--${status.state}`}>
      <div className="pm-alert__glow" aria-hidden />
      <div className="pm-alert__icon">
        <i className={copy.icon}></i>
      </div>
      <div className="pm-alert__body">
        <div className="pm-alert__eyebrow">{copy.eyebrow}</div>
        <div className="pm-alert__title">{copy.title(status.remaining)}</div>
        <p className="pm-alert__desc">{copy.body(refreshDate)}</p>
      </div>
      <div className="pm-alert__actions">
        {canUpgrade && (
          <button className="pm-alert__btn pm-alert__btn--ghost" onClick={onUpgrade}>
            <i className="fas fa-arrow-up"></i> Upgrade plan
          </button>
        )}
        <button className="pm-alert__btn pm-alert__btn--solid" onClick={onTopUp}>
          <i className="fas fa-bolt"></i> Buy credits
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
    secondary: 'Top up credits'
  },
  expired: {
    eyebrow: 'Beta has ended',
    title: 'You helped build this. Let\'s keep going.',
    lede: (days, expiresOn) =>
      `The beta ended ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago${expiresOn ? ` (${formatDate(expiresOn)})` : ''}. AI features are paused while you choose a plan — your workspaces and history are safe and waiting.`,
    body: 'Pick a paid plan to switch everything back on. Beta testers get a one-time bonus credit pack on their first paid month — our way of saying thanks for being early.',
    primary: 'Choose a plan',
    secondary: 'Top up credits'
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
          <h2 className="pm-signin__title">Create a free account to use Remix&nbsp;AI</h2>

          <ul className="pm-signin__perks">
            <li><i className="fas fa-robot"></i> Solidity assistant, completions &amp; security audit</li>
            <li><i className="fas fa-lock"></i> Auth via your existing identity — we never see your password</li>
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
            By continuing you agree to the&nbsp;
            <a href="https://remix-project.org/terms" target="_blank" rel="noreferrer">Terms</a>
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
                ? 'You signed in with a wallet, so we don\'t have an email on file. We need a verified address before unlocking AI features — it\'s how we keep free credits out of the hands of throwaway accounts and how you\'ll recover your plan if you ever lose your wallet.'
                : (<>
                  We\'ll email a 6-digit code to{' '}
                  <strong className="pm-verify__email">{targetEmailMasked || 'your address on file'}</strong>.
                  This is a one-time check to keep free credits out of throwaway accounts.
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
  title: (intent: string, itemLabel?: string) => string
  body: (intent: string, itemLabel?: string, meta?: Record<string, string>) => string
}> = {
  processing: {
    eyebrow: 'Processing',
    icon: 'fas fa-spinner fa-spin',
    title: (intent, item) => intent === 'cancel'
      ? `Cancelling ${item || 'your subscription'}…`
      : 'Confirming your payment…',
    body: (intent, item) => intent === 'cancel'
      ? `We’re processing your cancellation${item ? ` of ${item}` : ''}. This usually takes just a moment.`
      : `We're waiting for confirmation from the payment processor${item ? ` for ${item}` : ''}. This usually takes a few seconds — feel free to keep this open or close it; we'll notify you when it lands.`
  },
  success: {
    eyebrow: 'Payment confirmed',
    icon: 'fas fa-check',
    title: (intent, item) =>
      intent === 'topup' ? `${item || 'Credits'} added to your account` :
        intent === 'subscription' ? `Welcome to ${item || 'your new plan'}` :
          intent === 'cancel' ? `${item || 'Subscription'} cancelled` :
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
    title: (intent) => intent === 'cancel'
      ? 'We couldn’t cancel your subscription'
      : 'We couldn’t complete your payment',
    body: (intent) =>
      intent === 'topup'
        ? 'Your top-up didn\'t go through. No credits were added and no card was charged.'
        : intent === 'cancel'
          ? 'Your cancellation request didn’t go through. Your subscription is unchanged. Please try again or contact support if the problem persists.'
          : 'Your subscription change didn\'t go through. Your current plan is unchanged and no card was charged.'
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
  const tryAgain = isCancel ? onViewPlans : (result.intent === 'topup' ? onViewTopUps : onViewPlans)
  const tryAgainLabel = isCancel ? 'Back to plans' : (result.intent === 'topup' ? 'Choose a top-up' : 'Back to plans')
  const eyebrow = isCancel
    ? (result.kind === 'success' ? 'Cancellation confirmed'
      : result.kind === 'processing' ? 'Cancelling'
        : result.kind === 'error' ? 'Cancellation failed'
          : copy.eyebrow)
    : copy.eyebrow

  return (
    <section className={`pm-result pm-result--${result.kind}`}>
      <div className={`pm-result__halo pm-result__halo--${result.kind}`} aria-hidden />

      <div className={`pm-result__icon pm-result__icon--${result.kind}`}>
        <i className={copy.icon}></i>
      </div>

      <div className="pm-result__eyebrow">{eyebrow}</div>
      <h2 className="pm-result__title">{copy.title(result.intent, result.itemLabel)}</h2>
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
                <i className="fas fa-rotate-right"></i> Try again
              </button>
            )}
            {isCancel && (
              <button className="pm-result__btn pm-result__btn--primary" onClick={onDismiss}>
                <i className="fas fa-arrow-left"></i> Back to account
              </button>
            )}
            <a
              className="pm-result__btn pm-result__btn--ghost"
              href="https://discord.gg/TWfKkZVwJW"
              target="_blank"
              rel="noreferrer"
            >
              <i className="fas fa-life-ring"></i> Contact support
            </a>
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
        <button
          type="button"
          className="pm-modal__close"
          aria-label="Dismiss"
          onClick={() => onResolve(null)}
        >
          <i className="fas fa-times"></i>
        </button>
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
        <div className="pm-modal__actions">
          {dialog.actions.map((action) => (
            <button
              key={action.value}
              type="button"
              className={`pm-modal__btn pm-modal__btn--${action.variant ?? 'primary'}`}
              onClick={() => onResolve(action.value)}
            >
              {action.icon && <i className={action.icon}></i>}
              <span>{action.label}</span>
            </button>
          ))}
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

const PLAN_ACCENTS = ['#2fbfb1', '#5b9cf5', '#9b7dff', '#f59f5b', '#e75b89']
function pickAccent(planId: string): string {
  let h = 0
  for (let i = 0; i < planId.length; i++) h = (h * 31 + planId.charCodeAt(i)) >>> 0
  return PLAN_ACCENTS[h % PLAN_ACCENTS.length]
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

function pickUsageAccent(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return PLAN_ACCENTS[h % PLAN_ACCENTS.length]
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
