/**
 * Cloud Workspace API Client
 *
 * Talks to the Workspace REST API endpoints:
 *   GET    /storage/api/workspaces          — list workspaces
 *   POST   /storage/api/workspaces          — create workspace
 *   GET    /storage/api/workspaces/:uuid    — get workspace metadata
 *   PATCH  /storage/api/workspaces/:uuid    — rename / update stats
 *   DELETE /storage/api/workspaces/:uuid    — delete workspace (DB + S3)
 *   POST   /storage/api/workspaces/:uuid/credentials — get scoped STS token
 *
 * Also fetches the root STS token from POST /storage/sts/token.
 */

import { endpointUrls } from '@remix-endpoints-helper'
import { STSToken, CloudWorkspace, SyncManifest, ManifestVerifyResponse } from './types'

const storageBase = () => endpointUrls.storage // e.g. "https://auth.api.remix.live:8443/storage"

/** Get the current access token from localStorage (set by AuthPlugin) */
function getAccessToken(): string | null {
  return localStorage.getItem('remix_access_token')
}

/** Build common headers for authenticated requests */
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

// ── STS Token ─────────────────────────────────────────────

/**
 * Fetch a root-level STS token scoped to users/{userId}/.
 * Used for listing across all workspaces.
 */
export async function fetchSTSToken(): Promise<STSToken> {
  const res = await fetch(`${storageBase()}/sts/token`, {
    method: 'POST',
    credentials: 'include',
    headers: authHeaders(),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`STS token request failed (${res.status}): ${body}`)
  }
  return res.json()
}

/**
 * Fetch a workspace-scoped STS token for a specific workspace.
 * Scoped to users/{userId}/{workspaceUuid}/.
 */
export async function fetchWorkspaceSTS(workspaceUuid: string): Promise<STSToken> {
  const res = await fetch(`${storageBase()}/api/workspaces/${workspaceUuid}/credentials`, {
    method: 'POST',
    credentials: 'include',
    headers: authHeaders(),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Workspace STS token request failed (${res.status}): ${body}`)
  }
  return res.json()
}

// ── Workspace CRUD ────────────────────────────────────────

/**
 * List all cloud workspaces for the authenticated user.
 */
export async function listCloudWorkspaces(): Promise<CloudWorkspace[]> {
  const res = await fetch(`${storageBase()}/api/workspaces`, {
    method: 'GET',
    credentials: 'include',
    headers: authHeaders(),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`List workspaces failed (${res.status}): ${body}`)
  }
  const data = await res.json()
  return data.workspaces || data
}

/**
 * Create a new cloud workspace.
 */
export async function createCloudWorkspace(name: string, migratedFromLocal = false): Promise<CloudWorkspace> {
  const res = await fetch(`${storageBase()}/api/workspaces`, {
    method: 'POST',
    credentials: 'include',
    headers: authHeaders(),
    body: JSON.stringify({ name, migrated_from_local: migratedFromLocal }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Create workspace failed (${res.status}): ${body}`)
  }
  return res.json()
}

/**
 * Get metadata for a specific workspace.
 */
export async function getCloudWorkspace(uuid: string): Promise<CloudWorkspace> {
  const res = await fetch(`${storageBase()}/api/workspaces/${uuid}`, {
    method: 'GET',
    credentials: 'include',
    headers: authHeaders(),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Get workspace failed (${res.status}): ${body}`)
  }
  return res.json()
}

/**
 * Update workspace metadata (rename, update stats).
 *
 * If `expected_version` is provided, the backend performs an optimistic
 * concurrency check: UPDATE … WHERE version = expected_version.
 * On mismatch the API returns 409 and we throw a VersionConflictException
 * that callers can catch to trigger a pull.
 */
export async function updateCloudWorkspace(uuid: string, updates: {
  name?: string
  file_count?: number
  total_size?: number
  expected_version?: number
}): Promise<CloudWorkspace> {
  const res = await fetch(`${storageBase()}/api/workspaces/${uuid}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: authHeaders(),
    body: JSON.stringify(updates),
  })
  if (res.status === 409) {
    const conflict = await res.json()
    const err = new VersionConflictException(
      conflict.message || 'Workspace was modified on another device',
      conflict.current_version ?? 0,
    )
    throw err
  }
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Update workspace failed (${res.status}): ${body}`)
  }
  return res.json()
}

/**
 * Typed error thrown when the version check fails (409 Conflict).
 */
export class VersionConflictException extends Error {
  readonly currentVersion: number
  constructor(message: string, currentVersion: number) {
    super(message)
    this.name = 'VersionConflictException'
    this.currentVersion = currentVersion
  }
}

/**
 * Verify a sync manifest against actual S3 state.
 *
 * Sends the browser's manifest to the backend which LISTs the real S3
 * objects and diffs them. Returns phantoms (in manifest, not on S3),
 * missing (on S3, not in manifest), and mismatched (ETag differs).
 *
 * Intended for E2E tests and debugging — not called in production.
 */
export async function verifyManifest(uuid: string, manifest: SyncManifest): Promise<ManifestVerifyResponse> {
  const res = await fetch(`${storageBase()}/api/workspaces/${uuid}/verify-manifest`, {
    method: 'POST',
    credentials: 'include',
    headers: authHeaders(),
    body: JSON.stringify({ manifest }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Verify manifest failed (${res.status}): ${body}`)
  }
  return res.json()
}

/**
 * Delete a cloud workspace (DB record + all S3 files).
 */
export async function deleteCloudWorkspace(uuid: string): Promise<void> {
  const res = await fetch(`${storageBase()}/api/workspaces/${uuid}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: authHeaders(),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Delete workspace failed (${res.status}): ${body}`)
  }
}
