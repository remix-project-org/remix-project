/**
 * E2E Cloud Sync Verification Helper
 *
 * Reads the sync manifest from the browser's IndexedDB (via the
 * CloudSyncEngine singleton) and posts it to the backend's
 * verify-manifest endpoint. The backend LISTs the real S3 objects
 * and diffs them against what the browser thinks is synced.
 *
 * Use this after any cloud-workspace E2E scenario to assert that
 * the local sync state matches the remote S3 reality.
 *
 * Usage in a Nightwatch test:
 *
 *   import { assertCloudSyncIntegrity } from '../helpers/cloud-sync-verify'
 *
 *   'Should have consistent sync state #group2': function (browser) {
 *     assertCloudSyncIntegrity(browser, { allowMissing: 0, allowPhantoms: 0 })
 *   }
 */

import { NightwatchBrowser } from 'nightwatch'

require('dotenv').config()

const API_URL = process.env.REMIX_API_URL || 'https://auth.api.remix.live:8443'

export interface SyncVerifyResult {
  ok: boolean
  manifestFileCount: number
  remoteFileCount: number
  phantoms: Array<{ key: string; localEtag?: string }>
  missing: Array<{ key: string; remoteEtag?: string }>
  mismatched: Array<{ key: string; localEtag?: string; remoteEtag?: string }>
}

export interface SyncVerifyOptions {
  /** Max allowed phantom files (in manifest but not on S3). Default: 0 */
  allowPhantoms?: number
  /** Max allowed missing files (on S3 but not in manifest). Default: 0 */
  allowMissing?: number
  /** Max allowed mismatched files (ETag differs). Default: 0 */
  allowMismatched?: number
  /** Timeout in ms to wait for sync engine to be active. Default: 10000 */
  timeout?: number
}

/**
 * Extract the sync manifest and workspace UUID from the browser's
 * running CloudSyncEngine instance. Returns null if the engine isn't active.
 */
function readManifestFromBrowser(browser: NightwatchBrowser): Promise<{ manifest: any; workspaceUuid: string } | null> {
  return new Promise((resolve) => {
    browser.execute(
      function () {
        // cloudSyncEngine is the singleton exported from cloud-sync-engine.ts
        // It's accessible on window via the webpack bundle
        const engine = (window as any).cloudSyncEngine
        if (!engine || !engine.isActive) return null
        return {
          manifest: engine.getManifest(),
          workspaceUuid: engine.getWorkspaceUuid(),
        }
      },
      [],
      (result: any) => {
        resolve(result?.value || null)
      },
    )
  })
}

/**
 * Read the access token from the browser's localStorage so we can
 * make authenticated API calls from the Node.js test process.
 */
function readAccessToken(browser: NightwatchBrowser): Promise<string | null> {
  return new Promise((resolve) => {
    browser.execute(
      function () {
        return localStorage.getItem('remix_access_token')
      },
      [],
      (result: any) => {
        resolve(result?.value || null)
      },
    )
  })
}

/**
 * Call the verify-manifest endpoint from Node.js.
 */
async function callVerifyManifest(
  workspaceUuid: string,
  manifest: any,
  accessToken: string,
): Promise<SyncVerifyResult> {
  const url = `${API_URL}/storage/api/workspaces/${workspaceUuid}/verify-manifest`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ manifest }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`verify-manifest API failed (${res.status}): ${body}`)
  }

  return res.json() as Promise<SyncVerifyResult>
}

/**
 * Verify that the browser's sync manifest matches the real S3 state.
 *
 * Reads the manifest from the live CloudSyncEngine, posts it to
 * the backend, and asserts that phantoms/missing/mismatched are
 * within the allowed thresholds.
 *
 * @param browser  Nightwatch browser instance
 * @param options  Tolerance thresholds (all default to 0)
 * @returns The full verification result for further inspection
 */
export async function assertCloudSyncIntegrity(
  browser: NightwatchBrowser,
  options: SyncVerifyOptions = {},
): Promise<SyncVerifyResult> {
  const {
    allowPhantoms = 0,
    allowMissing = 0,
    allowMismatched = 0,
  } = options

  // 1. Read manifest + workspace UUID from the browser
  const browserData = await readManifestFromBrowser(browser)
  if (!browserData) {
    throw new Error('[SyncVerify] CloudSyncEngine is not active — cannot read manifest')
  }
  if (!browserData.manifest || !browserData.workspaceUuid) {
    throw new Error('[SyncVerify] Manifest or workspaceUuid is null')
  }

  // 2. Read the auth token from the browser
  const accessToken = await readAccessToken(browser)
  if (!accessToken) {
    throw new Error('[SyncVerify] No access token in localStorage — user not logged in?')
  }

  console.log(
    `[SyncVerify] Verifying workspace ${browserData.workspaceUuid} ` +
    `(${Object.keys(browserData.manifest.files || {}).length} files in manifest)`
  )

  // 3. Call the backend verification endpoint
  const result = await callVerifyManifest(
    browserData.workspaceUuid,
    browserData.manifest,
    accessToken,
  )

  // 4. Log the result
  if (result.ok) {
    console.log(
      `[SyncVerify] ✓ OK — manifest: ${result.manifestFileCount} files, ` +
      `remote: ${result.remoteFileCount} files`
    )
  } else {
    console.error(`[SyncVerify] ✗ MISMATCH detected:`)
    if (result.phantoms.length > 0) {
      console.error(`  Phantoms (in manifest, not on S3): ${result.phantoms.map(p => p.key).join(', ')}`)
    }
    if (result.missing.length > 0) {
      console.error(`  Missing (on S3, not in manifest): ${result.missing.map(m => m.key).join(', ')}`)
    }
    if (result.mismatched.length > 0) {
      console.error(`  Mismatched ETags: ${result.mismatched.map(m => `${m.key} (local=${m.localEtag} remote=${m.remoteEtag})`).join(', ')}`)
    }
  }

  // 5. Assert within thresholds
  browser.assert.ok(
    result.phantoms.length <= allowPhantoms,
    `Phantom files: ${result.phantoms.length} (allowed: ${allowPhantoms})`
  )
  browser.assert.ok(
    result.missing.length <= allowMissing,
    `Missing files: ${result.missing.length} (allowed: ${allowMissing})`
  )
  browser.assert.ok(
    result.mismatched.length <= allowMismatched,
    `Mismatched files: ${result.mismatched.length} (allowed: ${allowMismatched})`
  )

  return result
}
 
/**
 * Wait until the cloud sync engine is active, idle, and has zero pending changes.
 *
 * Use this instead of arbitrary `pause()` calls after file operations or
 * workspace creation.  Polls every 500ms and resolves once the engine
 * reports `{ status: 'idle', pendingChanges: 0 }`.
 *
 * After a workspace switch the engine is briefly still "active + idle" for
 * the *old* workspace before it deactivates and reactivates for the new one.
 * To handle this, we wait to see the engine go through a non-idle or inactive
 * state (a "transition") before accepting an idle result.  If no transition
 * is observed within 3 seconds the idle state is accepted as genuine.
 *
 * @param browser   Nightwatch browser instance
 * @param timeoutMs Max time to wait (default 30 000 ms)
 */
export async function waitForSyncIdle(
  browser: NightwatchBrowser,
  timeoutMs = 30_000,
): Promise<void> {
  const start = Date.now()
  const transitionGrace = 3_000 // max time to wait for a transition before accepting idle
  let sawTransition = false
  let ready = false

  while (Date.now() - start < timeoutMs && !ready) {
    const state = await new Promise<{ isActive: boolean; isIdle: boolean }>((resolve) => {
      browser.execute(
        function () {
          const engine = (window as any).cloudSyncEngine
          if (!engine || !engine.isActive) return { isActive: false, isIdle: false }
          const s = engine.status
          return { isActive: true, isIdle: s.status === 'idle' && s.pendingChanges === 0 }
        },
        [],
        (result: any) => resolve(result?.value || { isActive: false, isIdle: false }),
      )
    })

    if (!state.isActive || !state.isIdle) {
      sawTransition = true
    }

    if (state.isActive && state.isIdle) {
      if (sawTransition || Date.now() - start >= transitionGrace) {
        ready = true
      }
    }

    if (!ready) {
      await new Promise((r) => setTimeout(r, 500))
    }
  }

  if (!ready) {
    console.warn(`[waitForSyncIdle] Timed out after ${timeoutMs}ms`)
  }
}

/**
 * Convenience: wait for sync engine to be idle (pendingChanges === 0),
 * then verify. Useful after a sequence of file operations.
 *
 * @param browser  Nightwatch browser instance
 * @param waitMs   Max time to wait for flush to complete. Default: 30000
 * @param options  Verification thresholds
 */
export async function waitAndVerifySync(
  browser: NightwatchBrowser,
  waitMs = 30_000,
  options: SyncVerifyOptions = {},
): Promise<SyncVerifyResult> {
  await waitForSyncIdle(browser, waitMs)
  return assertCloudSyncIntegrity(browser, options)
}
