/**
 * Cloud Storage Types
 *
 * Shared types for the S3 cloud storage integration.
 * Maps to the STS Storage Token API and Workspace API contracts.
 */

// ── STS Token from POST /storage/sts/token or POST /storage/api/workspaces/:uuid/credentials ──
export interface STSToken {
  accessKeyId: string
  secretAccessKey: string
  sessionToken: string
  expiration: string // ISO 8601
  durationSeconds: number
  bucket: string
  prefix: string // e.g. "users/42/" or "users/42/a1b2c3d4-.../"
  region: string
}

// ── Workspace record from the Workspace API ──
export interface CloudWorkspace {
  uuid: string
  user_id: number
  name: string
  created_at: string // ISO 8601
  last_modified: string
  file_count: number
  total_size: number // bytes
  migrated_from_local: boolean
  version: number // optimistic concurrency counter
}

// ── Version conflict from PATCH /api/workspaces/:uuid ──
export interface VersionConflictError {
  error: 'VERSION_CONFLICT'
  message: string
  current_version: number
}

// ── Sync state for a given file ──
export type FileSyncStatus = 'synced' | 'modified' | 'uploading' | 'error'

// ── Per-file change record tracked by the change tracker ──
export interface FileChangeRecord {
  path: string // workspace-relative path
  type: 'add' | 'change' | 'delete' | 'rename'
  timestamp: number
  oldPath?: string // only for renames
  _retryCount?: number // internal: number of times this change has been re-queued
}

// ── Overall cloud state exposed via React context ──
export type CloudMode = 'cloud' | 'legacy'

export interface CloudState {
  /** Whether the user is authenticated and cloud mode is active */
  mode: CloudMode
  /** Numeric user ID extracted from the STS token prefix (e.g. "users/42/" → "42") */
  userId: string | null
  /** True while the initial cloud workspace list is loading */
  loading: boolean
  /** Cloud Workspaces retrieved from the Workspace API */
  cloudWorkspaces: CloudWorkspace[]
  /** UUID of the currently active cloud workspace (null in legacy mode) */
  activeWorkspaceId: string | null
  /** Auth token present */
  isAuthenticated: boolean
  /** Current STS token (null when not authenticated) */
  stsToken: STSToken | null
  /** Sync status per workspace */
  syncStatus: Record<string, WorkspaceSyncStatus>
  /** Error message if something went wrong */
  error: string | null
  /** True while the workspace operation queue is processing (blocks UI interactions) */
  workspaceQueueBusy: boolean
}

export interface WorkspaceSyncStatus {
  /** 'idle' | 'syncing' | 'pushing' | 'loading' | 'error' */
  status: 'idle' | 'syncing' | 'pushing' | 'loading' | 'error'
  /** Last successful sync timestamp */
  lastSync: number | null
  /** Pending changes count */
  pendingChanges: number
  /** Error message if status is 'error' */
  error?: string
}

// ── S3 object metadata ──
export interface S3Object {
  key: string
  lastModified: Date
  size: number
  etag?: string
}

// ── Sync manifest stored in IndexedDB per workspace ──
// Tracks the S3 ETag of every file so we only pull what changed.
// Stored at: /.cloud-workspaces/<uuid>/.sync-manifest.json
export interface SyncManifest {
  version: 1
  /** Timestamp (ms) of the last successful sync */
  lastSyncTimestamp: number
  /** Map of workspace-relative key → metadata from S3 */
  files: Record<string, SyncManifestEntry>
  /** Last known S3 ETag of _git.zip — persisted so we don't prompt on every load */
  lastGitZipEtag?: string
}

export interface SyncManifestEntry {
  /** S3 ETag (MD5 hash of content, without quotes) */
  etag: string
  /** ISO 8601 last-modified from S3 */
  lastModified: string
  /** Size in bytes */
  size: number
}

// ── Manifest verification (E2E / debugging) ──
// POST /storage/api/workspaces/:uuid/verify-manifest
export interface ManifestVerifyRequest {
  manifest: SyncManifest
}

export interface ManifestFileDiff {
  key: string
  localEtag?: string
  remoteEtag?: string
  localSize?: number
  remoteSize?: number
}

export interface ManifestVerifyResponse {
  ok: boolean
  /** Number of files the browser claims to have synced */
  manifestFileCount: number
  /** Number of real objects on S3 (excluding _workspace.zip, _git.zip, dirs) */
  remoteFileCount: number
  /** Files in manifest but not on S3 */
  phantoms: ManifestFileDiff[]
  /** Files on S3 but not in manifest */
  missing: ManifestFileDiff[]
  /** Files in both but ETags differ */
  mismatched: ManifestFileDiff[]
}

// ── Mapping between local workspace name and cloud UUID ──
export interface WorkspaceMapping {
  localName: string
  cloudId: string
  cloudName: string
  lastSync: number
}
