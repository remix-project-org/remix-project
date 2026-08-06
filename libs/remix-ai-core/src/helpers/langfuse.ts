import { remixAILogger } from './logger'
import { endpointUrls } from '@remix-endpoints-helper'

/**
 * Simple Langfuse integration for the Remix AI DeepAgent.
 */
const LANGFUSE_PROXY_PUBLIC_KEY = 'proxy-handled'
const LANGFUSE_PROXY_SECRET_KEY = 'proxy-handled'

export interface LangfuseConfig {
  enabled: boolean
  baseUrl: string
  publicKey: string
  secretKey: string
}

/** Resolve the current Langfuse configuration (routes through the AI proxy). */
export function getLangfuseConfig(): LangfuseConfig {
  return {
    enabled: true,
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
 * Build a LangChain-compatible Langfuse callback handler
 */
export async function getLangfuseCallbackHandler(
  options?: { sessionId?: string; userId?: string; metadata?: Record<string, any> }
): Promise<any | null> {
  const config = getLangfuseConfig()
  if (!config.enabled) return null

  try {
    const { CallbackHandler } = await import('langfuse-langchain')
    const userId = options?.userId ?? getLangfuseUserId()
    const handler = new CallbackHandler({
      publicKey: config.publicKey,
      secretKey: config.secretKey,
      baseUrl: config.baseUrl,
      ...(userId ? { userId } : {}),
      ...(options?.sessionId ? { sessionId: options.sessionId } : {}),
      ...(options?.metadata ? { metadata: options.metadata } : {})
    })
    remixAILogger.log('[Langfuse] tracing enabled →', config.baseUrl, '| user:', userId, '| session:', options?.sessionId)
    return handler
  } catch (error) {
    remixAILogger.warn('[Langfuse] failed to initialize callback handler:', error)
    return null
  }
}
