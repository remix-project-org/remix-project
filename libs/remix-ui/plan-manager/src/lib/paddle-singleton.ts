/**
 * Paddle.js Singleton
 *
 * Ensures only one Paddle instance is initialized across the application.
 * Provides event subscription mechanism for checkout events.
 */

import { initializePaddle, Paddle, PaddleEventData, CheckoutEventNames } from '@paddle/paddle-js'

type Environment = 'sandbox' | 'production'

interface PaddleCache {
  instance?: Paddle
  promise?: Promise<Paddle>
  key?: string
  listeners: Array<(event: PaddleEventData) => void>
}

// Global singleton storage
const globalRef = globalThis as unknown as { __paddleSingleton?: PaddleCache }
if (!globalRef.__paddleSingleton) {
  globalRef.__paddleSingleton = { listeners: []}
}
const cache = globalRef.__paddleSingleton

/**
 * Build unique cache key from environment and token
 */
const buildKey = (env: Environment, token: string) =>
  `${String(env).toLowerCase().trim()}:${String(token).trim()}`

/**
 * Get current Paddle instance if initialized
 */
export function getPaddle(): Paddle | undefined {
  return cache.instance
}

/**
 * Get current Paddle promise if initialization is in progress
 */
export function getPaddlePromise(): Promise<Paddle> | undefined {
  return cache.promise
}

/**
 * Subscribe to Paddle events (checkout.completed, checkout.closed, etc.)
 */
export function onPaddleEvent(listener: (event: PaddleEventData) => void): void {
  if (!cache.listeners) cache.listeners = []
  cache.listeners.push(listener)
}

/**
 * Unsubscribe from Paddle events
 */
export function offPaddleEvent(listener: (event: PaddleEventData) => void): void {
  if (!cache.listeners) return
  cache.listeners = cache.listeners.filter((l) => l !== listener)
}

/**
 * Debug: Log current Paddle script tags in document
 */
function logPaddleScriptTags(): void {
  try {
    const scripts = Array.from(document.getElementsByTagName('script'))
    const paddleScripts = scripts.filter(s => (s.src || '').toLowerCase().includes('paddle'))
    console.log(`[Paddle] script tags found: ${paddleScripts.length}`)
    paddleScripts.forEach((s, i) => console.log(`  [${i}]`, s.src))
  } catch {
    // Ignore if document not available (SSR)
  }
}

/**
 * Debug: Log current Paddle state
 */
function debugPaddleStatus(): void {
  const w = globalThis as { Paddle?: Paddle }
  const hasGlobal = !!w.Paddle
  console.log('[Paddle][debug] key:', cache.key,
    'hasInstance:', !!cache.instance,
    'hasPromise:', !!cache.promise,
    'globalThis.Paddle:', hasGlobal)
  logPaddleScriptTags()
}

// Expose debug function globally for troubleshooting
;(globalThis as { __paddleDebug?: () => void }).__paddleDebug = debugPaddleStatus

/**
 * Wait for Paddle to be available on globalThis
 * Used as fallback when initializePaddle returns undefined
 */
function waitForPaddle(timeoutMs = 10000, intervalMs = 50): Promise<Paddle> {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const tick = () => {
      const w = globalThis as unknown as { Paddle?: Paddle }
      if (w.Paddle) return resolve(w.Paddle)
      if (Date.now() - start >= timeoutMs) {
        return reject(new Error('Paddle.js not available after timeout'))
      }
      setTimeout(tick, intervalMs)
    }
    tick()
  })
}

/**
 * Initialize Paddle with the given client token
 *
 * @param token - Paddle client-side token
 * @param environment - 'sandbox' for testing, 'production' for live
 * @returns Promise resolving to Paddle instance
 */
export async function initPaddle(
  token: string,
  environment: Environment = 'sandbox'
): Promise<Paddle> {
  if (!token) {
    throw new Error('Missing Paddle client token')
  }

  const key = buildKey(environment, token)

  // Return existing instance if same configuration
  if (cache.instance && cache.key === key) {
    return cache.instance
  }
  if (cache.promise && cache.key === key) {
    return cache.promise
  }

  // Store the key (allows re-init if env/token changes)
  cache.key = key
  console.log('[Paddle] Initializing singleton for key:', key)
  debugPaddleStatus()

  cache.promise = initializePaddle({
    environment,
    token,
    eventCallback: (event: PaddleEventData) => {
      // Fan-out events to all subscribers
      try {
        cache.listeners?.forEach((listener) => listener(event))
      } catch (e) {
        console.error('[Paddle] Event listener error:', e)
      }

      // Log notable events
      if (event.name === CheckoutEventNames.CHECKOUT_COMPLETED) {
        console.log('[Paddle] ✅ Checkout completed')
      } else if (event.name === CheckoutEventNames.CHECKOUT_CLOSED) {
        console.log('[Paddle] 🚪 Checkout closed')
      } else if (event.name === CheckoutEventNames.CHECKOUT_PAYMENT_FAILED) {
        console.warn('[Paddle] ❌ Payment failed:', event.data)
      }
    }
  })
    .then(async (instance) => {
      // Handle case where initializePaddle returns undefined
      const resolved = instance ?? (await waitForPaddle().catch(() => undefined))
      if (!resolved) {
        throw new Error('Paddle.js not available')
      }
      cache.instance = resolved
      console.log('[Paddle] ✅ Instance ready')
      return resolved
    })
    .catch((e) => {
      // Clear promise to allow retry on next call
      cache.promise = undefined
      console.error('[Paddle] Init failed:', e)
      throw e
    })

  return cache.promise
}

/**
 * Open Paddle checkout overlay with a transaction ID
 *
 * The transactionId should be obtained from your backend API which creates
 * the transaction with customData (userId, etc.) already set.
 *
 * @param paddle - Paddle instance
 * @param transactionId - Transaction ID from backend (e.g., "txn_01abc123...")
 * @param options - Additional checkout options
 */
export function openCheckoutWithTransaction(
  paddle: Paddle,
  transactionId: string,
  options?: {
    settings?: {
      displayMode?: 'overlay' | 'inline'
      theme?: 'light' | 'dark'
      locale?: string
    }
  }
): void {
  if (!paddle) {
    console.error('[Paddle] Cannot open checkout - Paddle not initialized')
    return
  }

  if (!transactionId) {
    console.error('[Paddle] Cannot open checkout - No transaction ID provided')
    return
  }

  console.log('[Paddle] Opening checkout for transaction:', transactionId)

  paddle.Checkout.open({
    transactionId,
    settings: {
      displayMode: options?.settings?.displayMode || 'overlay',
      theme: options?.settings?.theme || 'light',
      locale: options?.settings?.locale || 'en',
      allowLogout: false,
    }
  })
}

/**
 * Open Paddle checkout overlay with a price ID (direct checkout)
 *
 * NOTE: This bypasses the backend and won't include customData like userId.
 * Prefer using openCheckoutWithTransaction() with a backend-created transaction.
 *
 * @param paddle - Paddle instance
 * @param priceId - Paddle price ID (e.g., "pri_01abc123...")
 * @param options - Additional checkout options
 * @deprecated Use openCheckoutWithTransaction for proper customData handling
 */
export function openCheckout(
  paddle: Paddle,
  priceId: string,
  options?: {
    customData?: Record<string, unknown>
    successUrl?: string
    settings?: {
      displayMode?: 'overlay' | 'inline'
      theme?: 'light' | 'dark'
      locale?: string
    }
  }
): void {
  if (!paddle) {
    console.error('[Paddle] Cannot open checkout - Paddle not initialized')
    return
  }

  if (!priceId) {
    console.error('[Paddle] Cannot open checkout - No price ID provided')
    return
  }

  console.log('[Paddle] Opening checkout for price:', priceId)

  paddle.Checkout.open({
    items: [{ priceId, quantity: 1 }],
    customData: options?.customData,
    settings: {
      displayMode: options?.settings?.displayMode || 'overlay',
      theme: options?.settings?.theme || 'light',
      locale: options?.settings?.locale || 'en',
      allowLogout: false,
      successUrl: options?.successUrl,
    }
  })
}

/**
 * Check if Paddle is initialized and ready
 */
export function isPaddleReady(): boolean {
  return !!cache.instance
}

/**
 * Reset Paddle singleton (useful for testing)
 */
export function resetPaddle(): void {
  cache.instance = undefined
  cache.promise = undefined
  cache.key = undefined
  cache.listeners = []
}
