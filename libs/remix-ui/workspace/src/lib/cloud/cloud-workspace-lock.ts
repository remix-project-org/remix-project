/**
 * Cloud Workspace Lock — Client
 *
 * Coordinates multi-device access using a Redis-backed lock with TTL.
 * Only one device at a time can hold the lock for a workspace.
 *
 * Endpoints:
 *   POST   /workspace-lock/api/workspaces/:uuid/lock    — acquire
 *   PUT    /workspace-lock/api/workspaces/:uuid/lock    — heartbeat
 *   DELETE /workspace-lock/api/workspaces/:uuid/lock    — release
 *   POST   /workspace-lock/api/workspaces/:uuid/unlock  — release (beacon-friendly)
 */

import { endpointUrls } from '@remix-endpoints-helper'

const LOCK_TTL = 60 // seconds
const HEARTBEAT_INTERVAL = 20_000 // 20s

const lockBase = () => endpointUrls.workspaceLock
// e.g. "https://auth.api.remix.live:8443/workspace-lock"

// ── Device ID ──────────────────────────────────────────────

/**
 * Get or create a unique device ID for this browser session.
 * Stored in sessionStorage so each tab gets its own identity.
 */
export function getDeviceId(): string {
  const key = 'remix_device_id'
  let id = sessionStorage.getItem(key)
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem(key, id)
  }
  return id
}

// ── Auth helper ────────────────────────────────────────────

function getAccessToken(): string | null {
  return localStorage.getItem('remix_access_token')
}

function authHeaders(): Record<string, string> {
  const token = getAccessToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

// ── Response types ─────────────────────────────────────────

export interface LockAcquireResult {
  acquired: true
  deviceId: string
  ttl: number
}

export interface LockDeniedResult {
  acquired: false
  holder: string // device_id of current lock holder
  ttlRemaining: number
}

export interface LockHeartbeatResult {
  ok: true
  ttl: number
}

export interface LockStolenResult {
  ok: false
  reason: 'stolen' | 'expired'
  holder?: string
  ttlRemaining?: number
}

export class WorkspaceLockedError extends Error {
  readonly holder: string
  readonly ttlRemaining: number
  constructor(holder: string, ttlRemaining: number) {
    super(`Workspace is locked by another device (${holder})`)
    this.name = 'WorkspaceLockedError'
    this.holder = holder
    this.ttlRemaining = ttlRemaining
  }
}

export class LockStolenError extends Error {
  readonly holder: string
  constructor(holder: string) {
    super(`Lock was taken by another device (${holder})`)
    this.name = 'LockStolenError'
    this.holder = holder
  }
}

export class LockExpiredError extends Error {
  constructor() {
    super('Lock expired (no active lock on server)')
    this.name = 'LockExpiredError'
  }
}

// ── API calls ──────────────────────────────────────────────

/**
 * Acquire the lock for a workspace.
 * Returns the lock info on success, throws WorkspaceLockedError on 409.
 *
 * @param force  If true, steal the lock from the current holder.
 *               The backend overwrites the existing lock so the old
 *               holder's next heartbeat will get 409 "stolen".
 */
export async function acquireLock(workspaceUuid: string, opts?: { force?: boolean }): Promise<LockAcquireResult> {
  const deviceId = getDeviceId()
  const force = opts?.force ?? false
  console.log(`[CloudLock:acquireLock] workspace=${workspaceUuid} deviceId=${deviceId} force=${force}`)

  const res = await fetch(`${lockBase()}/api/workspaces/${workspaceUuid}/lock`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ device_id: deviceId, ttl: LOCK_TTL, force }),
  })

  if (res.status === 409) {
    const data = await res.json()
    const holder = data.lock?.device_id || 'unknown'
    const ttlRemaining = data.lock?.ttl_remaining ?? LOCK_TTL
    console.warn(`[CloudLock] ✗ LOCKED by ${holder} (ttl_remaining=${ttlRemaining}s)`)
    throw new WorkspaceLockedError(holder, ttlRemaining)
  }

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Lock acquire failed (${res.status}): ${body}`)
  }

  const data = await res.json()
  return {
    acquired: true,
    deviceId,
    ttl: data.lock?.ttl || LOCK_TTL,
  }
}

/**
 * Send a heartbeat to keep the lock alive.
 * Returns ok=true on success, throws on 409 (stolen) or 404 (expired).
 */
export async function heartbeatLock(workspaceUuid: string): Promise<LockHeartbeatResult> {
  const deviceId = getDeviceId()

  const res = await fetch(`${lockBase()}/api/workspaces/${workspaceUuid}/lock`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ device_id: deviceId }),
  })

  if (res.status === 409) {
    const data = await res.json()
    const holder = data.lock?.device_id || 'unknown'
    console.error(`[CloudLock] ✗ LOCK STOLEN by ${holder}`)
    throw new LockStolenError(holder)
  }

  if (res.status === 404) {
    console.warn(`[CloudLock] ✗ Lock expired (404)`)
    throw new LockExpiredError()
  }

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Lock heartbeat failed (${res.status}): ${body}`)
  }

  const data = await res.json()
  return { ok: true, ttl: data.lock?.ttl || LOCK_TTL }
}

/**
 * Release the lock for a workspace.
 * Best-effort — failures are non-fatal (the lock will expire on its own).
 */
export async function releaseLock(workspaceUuid: string): Promise<void> {
  const deviceId = getDeviceId()

  try {
    await fetch(`${lockBase()}/api/workspaces/${workspaceUuid}/lock`, {
      method: 'DELETE',
      headers: authHeaders(),
      body: JSON.stringify({ device_id: deviceId }),
    })
  } catch (err) {
    console.warn('[CloudLock] Release failed (non-fatal):', (err as any).message || err)
  }
}

/**
 * Release lock via sendBeacon — used in beforeunload where fetch may be cancelled.
 * Falls back to the POST /unlock alias since sendBeacon only sends POST.
 */
export function releaseLockBeacon(workspaceUuid: string): void {
  const deviceId = getDeviceId()
  const url = `${lockBase()}/api/workspaces/${workspaceUuid}/unlock`
  const body = JSON.stringify({ device_id: deviceId })

  // sendBeacon doesn't support custom headers, but the session cookie is
  // included automatically via credentials. For Bearer token auth, we pass
  // it as a query param that the backend can also accept.
  const token = getAccessToken()
  const urlWithAuth = token ? `${url}?token=${encodeURIComponent(token)}` : url

  const sent = navigator.sendBeacon(urlWithAuth, new Blob([body], { type: 'application/json' }))
  if (!sent) {
    console.warn('[CloudLock] sendBeacon failed — lock will expire naturally')
  }
}

// ── Heartbeat Manager ──────────────────────────────────────

/**
 * Manages the heartbeat interval for a locked workspace.
 * Starts/stops the heartbeat timer and handles lock loss.
 */
export class LockHeartbeatManager {
  private timer: ReturnType<typeof setInterval> | null = null
  private workspaceUuid: string | null = null
  private onLockLost: ((reason: 'stolen' | 'expired' | 'error') => void) | null = null

  /**
   * Start sending heartbeats for the given workspace.
   *
   * @param workspaceUuid  Workspace that is locked
   * @param onLockLost     Called when the lock is lost (stolen, expired, or error)
   */
  start(workspaceUuid: string, onLockLost: (reason: 'stolen' | 'expired' | 'error') => void): void {
    this.stop()
    this.workspaceUuid = workspaceUuid
    this.onLockLost = onLockLost

    this.timer = setInterval(() => {
      this.sendHeartbeat()
    }, HEARTBEAT_INTERVAL)
  }

  /** Stop the heartbeat timer. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.workspaceUuid = null
    this.onLockLost = null
  }

  /** Whether the heartbeat is currently running. */
  get isRunning(): boolean {
    return this.timer !== null
  }

  /**
   * Send a heartbeat immediately (e.g. on tab focus).
   * Background tabs may throttle setInterval, so the lock could be
   * close to expiry when the user returns. This ensures a timely renewal.
   */
  sendImmediate(): void {
    if (this.workspaceUuid) {
      this.sendHeartbeat()
    }
  }

  private async sendHeartbeat(): Promise<void> {
    if (!this.workspaceUuid) return

    try {
      const result = await heartbeatLock(this.workspaceUuid)
    } catch (err) {
      // Save callback before stop() nulls it out
      const callback = this.onLockLost

      if (err instanceof LockStolenError) {
        console.error(`[CloudLock:heartbeat] ✗ Lock stolen — stopping heartbeat`)
        this.stop()
        callback?.('stolen')
      } else if (err instanceof LockExpiredError) {
        console.warn(`[CloudLock:heartbeat] ✗ Lock expired — attempting re-acquire`)
        // Try to re-acquire instead of immediately giving up
        try {
          await acquireLock(this.workspaceUuid!)
        } catch (reacquireErr) {
          if (reacquireErr instanceof WorkspaceLockedError) {
            console.error(`[CloudLock:heartbeat] ✗ Re-acquire failed — someone else has it`)
            this.stop()
            callback?.('stolen')
          } else {
            console.error(`[CloudLock:heartbeat] ✗ Re-acquire failed:`, (reacquireErr as any).message)
            this.stop()
            callback?.('error')
          }
        }
      } else {
        // Network error — log but don't immediately give up.
        // The lock has a 60s TTL, so a few missed heartbeats are OK.
        console.warn(`[CloudLock:heartbeat] ✗ Heartbeat failed (non-fatal):`, (err as any).message || err)
      }
    }
  }
}
