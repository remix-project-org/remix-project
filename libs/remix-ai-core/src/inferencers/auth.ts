/**
 * Shared auth helpers for AI inference calls.
 *
 * Every request the IDE makes to the Remix-hosted AI proxy (solcoder, the
 * langchain proxy, dapp/figma generators…) MUST carry the user's bearer
 * token so the backend can authenticate the user, evaluate feature flags
 * and meter quotas. Historically the solcoder client read the token from
 * localStorage; the langchain clients added later forgot to do this, which
 * caused authenticated users to look anonymous to the backend.
 *
 * Read the token at REQUEST time (not at client construction time) so that
 * login/logout takes effect without rebuilding cached model instances.
 */

const TOKEN_KEY = 'remix_access_token'

export function getRemixAccessToken(): string | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    return window.localStorage?.getItem(TOKEN_KEY) || undefined
  } catch {
    return undefined
  }
}

export function getRemixAuthHeader(): Record<string, string> {
  const token = getRemixAccessToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}
