/**
 * Checkout telemetry reporter.
 *
 * Fire-and-forget sink that POSTs client-side checkout lifecycle events to the
 * billing service (`POST {billing}/checkout-telemetry`). The endpoint is
 * lenient: it always returns 204, every field except `event` is optional, and
 * strings are clamped server-side. This lets us answer "why can't users buy?"
 * from the admin Checkout Telemetry viewer — including the cases where the
 * Paddle overlay never renders (ad/tracking blockers) or the backend never
 * hands us a transaction to open.
 *
 * Rules:
 *   - MUST NEVER throw into the checkout flow (every call is wrapped).
 *   - MUST NEVER block the UI — the fetch is fired with `keepalive` so it
 *     survives navigation / tab close and we never await it.
 *   - Auth is optional; when we have a JWT we attach it so the admin viewer
 *     can filter by user. When we don't, the event is still recorded.
 */

import { endpointUrls } from '@remix-endpoints-helper'
import { planManagerLogger } from './plan-manager-logger'

/**
 * Event names. The first block MUST match the names the billing admin funnel
 * keys off — keep them exact. The `*` entries are Remix-specific additions the
 * server stores verbatim (queryable by the admin `event` filter / search) that
 * give us visibility into the steps that happen *before* Paddle ever runs.
 */
export type CheckoutTelemetryEvent =
  | 'script.blocked' // Paddle.js failed to load (adblock / CSP / tracking-protection)
  | 'paddle.init.ok' // * Paddle SDK initialized successfully (config fetched + SDK ready)
  | 'paddle.config.missing' // * getPaddleConfig returned no clientToken (no token / billing config call failing)
  | 'checkout.loaded' // Paddle overlay actually rendered
  | 'checkout.payment.selected' // user picked a payment method
  | 'checkout.payment.initiated' // user submitted payment (clicked "Pay")
  | 'checkout.completed' // Paddle reported success
  | 'checkout.closed' // user dismissed the overlay (abandonment signal)
  | 'checkout.error' // Paddle reported an error
  | 'checkout.warning' // Paddle reported a warning
  | 'open.error' // our own Paddle.Checkout.open(...) threw
  | 'transaction.created' // * backend returned a transactionId, about to open Paddle
  | 'transaction.error' // * backend never produced a checkout ref — overlay never shown
  | 'checkout.hosted_fallback' // * opened the hosted URL instead of the inline overlay
  | 'checkout.load_timeout' // * overlay never fired checkout.loaded within the watchdog window
  | 'checkout.abandoned' // * user closed the Remix modal hosting the Paddle frame
  | 'checkout.resume' // * user reopened an unfinished checkout (resume banner / top-bar cart)
  | 'checkout.discard' // * user discarded an unfinished checkout

export interface CheckoutTelemetryFields {
  message?: string
  errorCode?: string
  transactionId?: string
  paddleCustomerId?: string
  paddleEnv?: string
  detail?: unknown
}

// Module-level context so callers deep in the checkout flow (the Paddle
// singleton, the event callback) don't have to thread the token/env through.
let accessToken: string | null = null
let paddleEnv: string | undefined

/** Update the bearer token used to attribute telemetry to a user. */
export function setCheckoutTelemetryToken(token: string | null): void {
  accessToken = token || null
}

/** Record the resolved Paddle environment (`sandbox` | `production`). */
export function setCheckoutTelemetryEnv(env: string | undefined): void {
  paddleEnv = env
}

/**
 * Emit a single telemetry event. Safe to call from anywhere in the checkout
 * flow — it never throws and never blocks.
 */
export function reportCheckoutTelemetry(
  event: CheckoutTelemetryEvent | string,
  fields: CheckoutTelemetryFields = {}
): void {
  try {
    const url = `${endpointUrls.billing}/checkout-telemetry`
    const payload: Record<string, unknown> = {
      event,
      paddleEnv: fields.paddleEnv ?? paddleEnv,
      pageUrl: typeof location !== 'undefined' ? location.href : undefined,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    }
    if (fields.message !== undefined) payload.message = fields.message
    if (fields.errorCode !== undefined) payload.errorCode = fields.errorCode
    if (fields.transactionId !== undefined) payload.transactionId = fields.transactionId
    if (fields.paddleCustomerId !== undefined) payload.paddleCustomerId = fields.paddleCustomerId
    if (fields.detail !== undefined) payload.detail = fields.detail

    planManagerLogger.log('[checkout-telemetry]', event, fields)

    void fetch(url, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(payload),
    }).catch(() => { /* telemetry must never surface into the checkout flow */ })
  } catch {
    /* swallow — a broken telemetry call must never break checkout */
  }
}
