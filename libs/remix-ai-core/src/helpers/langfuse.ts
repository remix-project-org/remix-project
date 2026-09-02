import { remixAILogger } from './logger'
import { endpointUrls } from '@remix-endpoints-helper'

/**
 * Simple Langfuse integration for the Remix AI DeepAgent.
 */
const LANGFUSE_PROXY_PUBLIC_KEY = 'proxy-handled'
const LANGFUSE_PROXY_SECRET_KEY = 'proxy-handled'

/** localStorage flag that turns tracing off without a rebuild. */
const LANGFUSE_DISABLED_KEY = 'AI_TRACING_DISABLED'

export interface LangfuseConfig {
  enabled: boolean
  baseUrl: string
  publicKey: string
  secretKey: string
}

/**
 * Tuning for the ingestion client. The SDK defaults (5s request timeout, 3
 * retries) turn a slow proxy response into four aborted POSTs and four
 * `console.error` lines per batch, which is pure noise for a feature the user
 * never sees. Trace delivery is best-effort: wait longer, retry once.
 */
const LANGFUSE_CLIENT_OPTIONS = {
  requestTimeout: 15000,
  fetchRetryCount: 1,
  fetchRetryDelay: 2000,
  flushAt: 50
}

/** Resolve the current Langfuse configuration (routes through the AI proxy). */
export function getLangfuseConfig(): LangfuseConfig {
  let enabled = true
  try {
    if (typeof window !== 'undefined' && window.localStorage?.getItem(LANGFUSE_DISABLED_KEY) === 'true') {
      enabled = false
    }
  } catch { /* storage unavailable — keep tracing on */ }

  return {
    enabled,
    baseUrl: endpointUrls.langfuse,
    publicKey: LANGFUSE_PROXY_PUBLIC_KEY,
    secretKey: LANGFUSE_PROXY_SECRET_KEY
  }
}

export function getLangfuseUserId(): string {
  try {
    if (typeof window === 'undefined') return 'anonymous'

    const userStr = window.localStorage?.getItem('remix_user')
    if (userStr) {
      const user = JSON.parse(userStr)
      const name = user?.name || user?.email || user?.sub
      if (name) return String(name)
    }

    // Anonymous fallback — reuse the random session id from token tracking.
    let sessionId = window.sessionStorage?.getItem('remix_random_session_id')
    if (!sessionId) {
      sessionId = `random_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`
      window.sessionStorage?.setItem('remix_random_session_id', sessionId)
    }
    return sessionId
  } catch {
    return 'anonymous'
  }
}

/**
 * The CallbackHandler builds a whole Langfuse client — queue, flush timer and
 * all — whenever it is constructed with credentials, and nothing ever collects
 * it. Building one per agent run leaked a client (and its 10s flush timer) per
 * prompt, so every run multiplied the ingestion traffic and the SDK's retry
 * logging. One handler is kept for the page instead; the per-run fields it
 * reads (sessionId / userId / metadata) are refreshed on the way out.
 */
let cachedHandler: any | null = null
let cachedBaseUrl: string | null = null

/**
 * Build a LangChain-compatible Langfuse callback handler
 */
export async function getLangfuseCallbackHandler(
  options?: { sessionId?: string; userId?: string; metadata?: Record<string, any> }
): Promise<any | null> {
  const config = getLangfuseConfig()
  if (!config.enabled) return null

  try {
    const userId = options?.userId ?? getLangfuseUserId()

    // A changed baseUrl (endpoint discovery) invalidates the cached client.
    if (cachedHandler && cachedBaseUrl !== config.baseUrl) {
      await shutdownLangfuse()
    }

    if (!cachedHandler) {
      const { CallbackHandler } = await import('langfuse-langchain')
      cachedHandler = new CallbackHandler({
        publicKey: config.publicKey,
        secretKey: config.secretKey,
        baseUrl: config.baseUrl,
        ...LANGFUSE_CLIENT_OPTIONS
      })
      cachedBaseUrl = config.baseUrl
      remixAILogger.log('[Langfuse] tracing enabled →', config.baseUrl)
    }

    // Re-point the shared handler at this run.
    cachedHandler.sessionId = options?.sessionId
    cachedHandler.userId = userId
    cachedHandler.metadata = options?.metadata

    remixAILogger.log('[Langfuse] trace | user:', userId, '| session:', options?.sessionId)
    return cachedHandler
  } catch (error) {
    remixAILogger.warn('[Langfuse] failed to initialize callback handler:', error)
    return null
  }
}

/**
 * Push whatever is still queued. Call at the end of a run: the SDK only drains
 * `flushAt` events per tick, so without this the tail of every trace sits in
 * memory until some later run happens to trigger a flush.
 */
export async function flushLangfuse(): Promise<void> {
  if (!cachedHandler) return
  try {
    await cachedHandler.flushAsync()
  } catch (error) {
    remixAILogger.warn('[Langfuse] flush failed:', error)
  }
}

/** Drain and drop the shared client (endpoint change / teardown). */
export async function shutdownLangfuse(): Promise<void> {
  if (!cachedHandler) return
  const handler = cachedHandler
  cachedHandler = null
  cachedBaseUrl = null
  try {
    await handler.shutdownAsync()
  } catch (error) {
    remixAILogger.warn('[Langfuse] shutdown failed:', error)
  }
}
