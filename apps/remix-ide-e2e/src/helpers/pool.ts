/**
 * E2E Test Account Pool Helper
 *
 * Manages exclusive test account checkout/release against the Remix SSO pool API.
 * Each test shard checks out a unique account, receives JWT tokens, and releases
 * the account (with full data wipe) when done.
 *
 * Environment variables:
 *   E2E_POOL_API_KEY  - Required. The test-account-access API key (rmx_...).
 *   REMIX_API_URL     - Optional. Base URL for the auth service.
 *                       Defaults to https://auth.api.remix.live:8443
 *
 * Usage from shell (browser_test.sh):
 *   export POOL_SESSION=$(npx ts-node apps/remix-ide-e2e/src/helpers/pool.ts checkout)
 *   # ... run tests ...
 *   npx ts-node apps/remix-ide-e2e/src/helpers/pool.ts release "$POOL_SESSION"
 *
 * Usage from Nightwatch globals or beforeAll:
 *   import { checkoutAccount, releaseAccount, getActiveSession } from './pool'
 */

require('dotenv').config()

const API_URL = process.env.REMIX_API_URL || 'https://auth.api.remix.live:8443'
const API_KEY = process.env.E2E_POOL_API_KEY || ''
const POOL_BASE = `${API_URL}/sso/test/pool`

export interface PoolSession {
  sessionId: string
  accountId: string
  userId: number
  groupId: number
  accessToken: string
  refreshToken: string
  user: {
    id: number
    name: string
    email: string
    is_admin: boolean
    group_id: number
  }
}

let _activeSession: PoolSession | null = null

function getHeaders(withBody = false): Record<string, string> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${API_KEY}`,
    'Accept': 'application/json',
  }
  if (withBody) {
    headers['Content-Type'] = 'application/json'
  }
  return headers
}

/**
 * Checkout an exclusive test account from the pool.
 * Stores the session in module state for later release.
 *
 * @param featureGroups - Feature groups to assign. Must include one with login:allowed (e.g. 'beta').
 */
export async function checkoutAccount(featureGroups: string[] = ['beta']): Promise<PoolSession> {
  if (!API_KEY) {
    throw new Error(
      'E2E_POOL_API_KEY is not set. ' +
      'Set it in .env or as an environment variable to use the test account pool.'
    )
  }

  const response = await fetch(`${POOL_BASE}/checkout`, {
    method: 'POST',
    headers: getHeaders(true),
    body: JSON.stringify({ featureGroups }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Unknown', message: response.statusText }))
    throw new Error(`Pool checkout failed (${response.status}): ${err.error} — ${err.message}`)
  }

  const data = await response.json()
  const session: PoolSession = {
    sessionId: data.sessionId,
    accountId: data.accountId,
    userId: data.userId,
    groupId: data.groupId,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    user: data.user,
  }

  _activeSession = session
  console.log(`[Pool] Checked out account: ${session.accountId} (session: ${session.sessionId})`)
  return session
}

/**
 * Release a pool session and wipe all test data (DB, S3, Redis).
 * If no sessionId is provided, releases the active session.
 *
 * **Must be called after every test run, even on failure.**
 */
export async function releaseAccount(sessionId?: string): Promise<void> {
  const sid = sessionId || _activeSession?.sessionId
  if (!sid) {
    console.warn('[Pool] No active session to release — skipping')
    return
  }

  if (!API_KEY) {
    console.warn('[Pool] E2E_POOL_API_KEY not set — cannot release')
    return
  }

  try {
    const response = await fetch(`${POOL_BASE}/release`, {
      method: 'POST',
      headers: getHeaders(true),
      body: JSON.stringify({ sessionId: sid }),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: response.statusText }))
      console.error(`[Pool] Release failed (${response.status}):`, err.error || err.message)
      return
    }

    const data = await response.json()
    console.log(`[Pool] Released account: ${data.accountId}`)
    if (data.cleaned) {
      console.log(`[Pool] Cleanup: DB=${data.cleaned.db?.nonCascadeDeleted || 0} rows, S3=${data.cleaned.s3?.workspaceObjects || 0} objects, Redis=${data.cleaned.redis?.keysDeleted || 0} keys`)
    }
  } catch (error: any) {
    console.error('[Pool] Release error:', error.message)
  } finally {
    _activeSession = null
  }
}

/**
 * Get the currently active pool session (if any).
 */
export function getActiveSession(): PoolSession | null {
  return _activeSession
}

/**
 * Get pool status — useful for debugging exhausted pools in CI.
 */
export async function getPoolStatus(): Promise<any> {
  if (!API_KEY) throw new Error('E2E_POOL_API_KEY not set')

  const response = await fetch(`${POOL_BASE}/status`, {
    headers: getHeaders(),
  })

  if (!response.ok) {
    throw new Error(`Pool status failed: ${response.status}`)
  }

  return response.json()
}

/**
 * Emergency release-all — force-release every account and wipe data.
 */
export async function releaseAllAccounts(): Promise<void> {
  if (!API_KEY) throw new Error('E2E_POOL_API_KEY not set')

  const response = await fetch(`${POOL_BASE}/release-all`, {
    method: 'POST',
    headers: getHeaders(),
  })

  if (!response.ok) {
    throw new Error(`Pool release-all failed: ${response.status}`)
  }

  const data = await response.json()
  console.log(`[Pool] Emergency release-all: ${data.released} accounts released`)
  _activeSession = null
}

// ─── CLI Mode ───────────────────────────────────────────────────────────────
// When invoked directly from the command line:
//   node pool.js checkout          → prints JSON session
//   node pool.js release <id>      → releases session
//   node pool.js status            → prints pool status
//   node pool.js release-all       → emergency release
if (require.main === module) {
  const [,, command, ...args] = process.argv

  ;(async () => {
    try {
      switch (command) {
        case 'checkout': {
          // Optional: pass feature groups as comma-separated arg, e.g. `checkout beta,storage`
          const groups = args[0] ? args[0].split(',') : ['beta']
          const session = await checkoutAccount(groups)
          // Output JSON to stdout for shell capture
          process.stdout.write(JSON.stringify(session))
          break
        }
        case 'release': {
          const sessionId = args[0]
          if (!sessionId) {
            console.error('Usage: pool.ts release <sessionId>')
            process.exit(1)
          }
          await releaseAccount(sessionId)
          break
        }
        case 'status': {
          const status = await getPoolStatus()
          console.log(JSON.stringify(status, null, 2))
          break
        }
        case 'release-all': {
          await releaseAllAccounts()
          break
        }
        default:
          console.error('Usage: pool.ts <checkout|release|status|release-all>')
          process.exit(1)
      }
    } catch (error: any) {
      console.error(`[Pool] Error: ${error.message}`)
      process.exit(1)
    }
  })()
}
