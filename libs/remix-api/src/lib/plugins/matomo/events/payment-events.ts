/**
 * Checkout / Payment Events — Plan Manager billing funnel tracking
 *
 * This file contains all Matomo events for the subscription / credit
 * purchase flow driven by `PlanManagerPlugin` (+ Paddle). They let us
 * measure the full checkout funnel: intent → catalog → Paddle → completion
 * → backend-confirmed success, plus drop-off (closed) and failure (error)
 * outcomes and the plan-change / cancel / reactivate lifecycle.
 *
 * STANDARDIZED PATTERN:
 * - category: 'checkout' (always)
 * - action: specific funnel step (type-safe)
 * - name: optional sub-qualifier (e.g. the intent or item label)
 * - value: a metric or status string (e.g. txn status, total, reason)
 */

import { MatomoEventBase } from '../core/base-types';

export interface CheckoutEvent extends MatomoEventBase {
  category: 'checkout';
  action:
    // Funnel — happy path
    | 'intent'            // user initiated a checkout (name = intent: topup|subscription|free)
    | 'catalog_loaded'    // plans/packages fetched (value = 'plans:N|pkgs:M')
    | 'cart_add'          // a product was added to the upsell cart
    | 'cart_remove'       // a product was removed from the cart
    | 'paddle_loaded'     // Paddle inline checkout iframe loaded
    | 'breakdown_updated' // Paddle recalculated totals (value = total)
    | 'opened'            // checkout surface opened (CHECKOUT_OPENED)
    | 'completed'         // Paddle reported checkout.completed (payment submitted)
    | 'polling_started'   // began polling backend for webhook confirmation
    | 'poll_tick'         // a single poll iteration (value = txn status)
    | 'confirmed'         // backend-confirmed + account refreshed — SUCCESS
    // Outcomes / lifecycle
    | 'error'             // any checkout failure (value = reason)
    | 'closed'            // user closed the checkout without completing
    | 'change_plan'       // switched an existing subscription to another plan
    | 'cancel'            // cancelled a subscription (value = effectiveFrom)
    | 'reactivate'        // un-cancelled a pending cancellation
    | 'desktop_handoff';  // redirected to the web IDE because Paddle can't run in Electron
}
