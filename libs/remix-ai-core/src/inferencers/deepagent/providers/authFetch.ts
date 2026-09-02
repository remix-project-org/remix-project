import { getRemixAuthHeader } from '../../auth'
import { withRetryingFetch } from '../retryTransport'

/**
 * fetch wrapper that injects the user's Remix bearer token on every request.
 * Reads the token fresh from localStorage so login/logout takes effect
 * without rebuilding the cached model instance.
 */
export const authedFetch: typeof fetch = (input, init = {}) => {
  const headers = new Headers(init.headers || {})
  const auth = getRemixAuthHeader()
  if (auth.Authorization) {
    headers.set('Authorization', auth.Authorization)
  }
  return fetch(input as any, { ...init, headers })
}

/** The proxy transport every hosted provider shares: auth + retry. */
export function proxyFetch(label: string): typeof fetch {
  return withRetryingFetch(authedFetch, label)
}
