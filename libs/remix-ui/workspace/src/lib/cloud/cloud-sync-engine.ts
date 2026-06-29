/* eslint-disable @typescript-eslint/no-non-null-assertion */
/**
 * Cloud Sync Engine — Hybrid ZIP + Incremental
 *
 * Responsible for:
 *  1. Pulling workspace files from S3 into the local IndexedDB filesystem
 *  2. Tracking local file changes and pushing them to S3
 *  3. Periodic flush of pending changes
 *  4. Maintaining a workspace.zip snapshot for fast bulk loads
 *
 * Pull strategy — **hybrid ZIP + ETag-based diffing**:
 *
 *  On workspace open we check for a local sync manifest:
 *
 *  A) **No manifest (first load on this device)**:
 *     1. GET `_workspace.zip` from S3          (1 request)
 *     2. Extract into IndexedDB                (local, fast)
 *     3. LIST objects on S3 to build manifest   (1 request)
 *     → Total: 2 requests regardless of workspace size
 *
 *  B) **Manifest exists (returning visit)**:
 *     1. LIST objects on S3                     (1 request)
 *     2. Diff ETags: manifest vs. LIST
 *     3. GET only files whose ETag changed       (N requests, usually 0)
 *     → Total: 1 LIST + N GETs
 *
 *  Result: first-time load of a 200-file workspace costs 2 requests (ZIP+LIST),
 *  not 201 (LIST + 200 GETs).  Return visits cost 1 LIST + 0-few GETs.
 *
 * Push strategy:
 *  - Individual file PUTs every 10s (batch flush) — immediate, granular
 *  - After each flush, a debounced snapshot re-zips the workspace and
 *    PUTs `_workspace.zip` so the next fresh client gets a fast bulk load.
 *
 * This does NOT attempt real-time conflict resolution (not Google Docs collab).
 * It's single-user cloud backup keeping the remote in sync with the local.
 */

import { S3Client } from './s3-client'
import { FileChangeRecord, WorkspaceSyncStatus, STSToken, S3Object, SyncManifest } from './types'
import { fetchWorkspaceSTS, getCloudWorkspace, updateCloudWorkspace, VersionConflictException } from './cloud-workspace-api'
import { packWorkspace, unpackWorkspace, WORKSPACE_ZIP_KEY, packGitDir, unpackGitDir, GIT_ZIP_KEY } from './cloud-workspace-zip'
import { cloudStore } from './cloud-store'
import { LockHeartbeatManager, acquireLock, releaseLock, releaseLockBeacon } from './cloud-workspace-lock'

const SYNC_INTERVAL_MS = 10_000 // flush pending changes every 10s
const TOKEN_REFRESH_BUFFER_MS = 60_000 // refresh STS token 60s before expiry
const MANIFEST_FILENAME = '.sync-manifest.json'
const SNAPSHOT_DEBOUNCE_MS = 30_000 // re-zip 30s after last push flush
const GIT_SNAPSHOT_DEBOUNCE_MS = 60_000 // re-zip .git 60s after last .git write
const PARALLEL_CONCURRENCY = 6 // max parallel S3 requests (browser limit per origin)

export class CloudSyncEngine {
  private s3: S3Client | null = null
  private workspaceUuid: string | null = null
  private pendingChanges: FileChangeRecord[] = []
  private syncTimer: ReturnType<typeof setInterval> | null = null
  private tokenRefreshTimer: ReturnType<typeof setTimeout> | null = null
  private snapshotTimer: ReturnType<typeof setTimeout> | null = null
  private gitSnapshotTimer: ReturnType<typeof setTimeout> | null = null
  private _status: WorkspaceSyncStatus = { status: 'idle', lastSync: null, pendingChanges: 0 }
  private onStatusChange: ((status: WorkspaceSyncStatus) => void) | null = null
  private isSyncing = false

  /**
   * Tracks the in-progress flushChanges() promise so that deactivate()
   * can await it even if the flush was already started by the periodic timer.
   */
  private _flushPromise: Promise<void> | null = null

  /** ETag of the last _git.zip we pushed or saw — used to detect remote changes */
  private _lastGitZipEtag: string | null = null

  /**
   * When true, the FS observer should NOT queue writes as pending changes.
   * Set during pullWorkspace() so that files downloaded from S3 and written
   * to IndexedDB don't get immediately re-pushed back.
   */
  private _isPulling = false

  /** Public check used by handleRawFSWrite to skip change tracking during pull */
  get isPulling(): boolean {
    return this._isPulling
  }

  /** Public read-only access to the last known _git.zip ETag from S3 */
  get lastGitZipEtag(): string | null {
    return this._lastGitZipEtag
  }

  /** In-memory copy of the manifest, loaded on activate and kept in sync */
  private manifest: SyncManifest | null = null

  // ── Version-based conflict detection ──────────────────────

  /**
   * The workspace version known to this device. Loaded from the API on
   * activate and updated after each successful PATCH. Used as
   * `expected_version` in the pre-push PATCH call.
   */
  private _localVersion: number = 0

  /** Read the current local version (for debugging / UI) */
  get localVersion(): number {
    return this._localVersion
  }

  /** Bound handlers for visibility / online events so we can remove them */
  private _onVisibilityChange: (() => void) | null = null
  private _onOnline: (() => void) | null = null

  /**
   * Called when a version conflict is detected, BEFORE pulling remote state.
   * The host (cloud-workspace-actions) uses this to close all open editor
   * tabs so that Remix's autosave doesn't keep writing stale content and
   * creating an update-fight loop.
   */
  private _onConflictDetected: (() => Promise<void>) | null = null

  /**
   * Non-blocking callback fired when the remote `_git.zip` has changed
   * and local `.git/` exists.  The callback is responsible for showing
   * a modal and calling `pullGitSnapshot(true)` if the user accepts.
   * Fired as fire-and-forget — the sync flow does NOT await this.
   */
  private _onGitConflictPrompt: (() => Promise<void>) | null = null

  /**
   * Non-blocking notification callback (toast). Used to inform the user
   * about sync events (e.g. "Workspace updated from another device").
   */
  private _onToast: ((message: string) => void) | null = null

  // ── Lock coordination ─────────────────────────────────────

  /** Heartbeat manager — sends periodic PUTs to keep the workspace lock alive */
  private _lockHeartbeat = new LockHeartbeatManager()

  /** Callback when the lock is lost (stolen by another device, expired, or error) */
  private _onLockLost: ((reason: 'stolen' | 'expired' | 'error') => void) | null = null

  /** beforeunload handler — releases lock via sendBeacon */
  private _onBeforeUnload: (() => void) | null = null

  /** offline handler — triggers lock loss so the workspace is closed */
  private _onOffline: (() => void) | null = null

  /**
   * True while we're resolving a conflict — suppresses trackChange() so
   * autosave writes from stale editor buffers are silently dropped.
   */
  private _isResolvingConflict = false

  /** Reference to the local filesystem (window.remixFileSystem) */
  private get fs(): any {
    return (window as any).remixFileSystem
  }

  /** Absolute path to workspace files in local FS: /.cloud-workspaces/<uuid> */
  private localWorkspacePath: string | null = null

  /** Public name so external code (change tracking) can filter it out */
  static readonly MANIFEST_FILENAME = MANIFEST_FILENAME

  /**
   * Return a deep copy of the current in-memory manifest.
   * Used by E2E tests to post to the verify-manifest endpoint.
   * Returns null if the engine is not active.
   */
  getManifest(): SyncManifest | null {
    if (!this.manifest) return null
    return JSON.parse(JSON.stringify(this.manifest))
  }

  /**
   * Return the workspace UUID the engine is currently bound to.
   * Used by E2E tests alongside getManifest() for the verify call.
   */
  getWorkspaceUuid(): string | null {
    return this.workspaceUuid
  }

  // ── Lifecycle ─────────────────────────────────────────────

  /**
   * Initialize the sync engine for a cloud workspace.
   * Fetches workspace-scoped STS and starts the change push timer.
   *
   * @param workspaceUuid  The cloud workspace UUID (also used as local dir name under /.cloud-workspaces/)
   * @param onStatusChange Optional callback for sync status updates
   */
  async activate(
    workspaceUuid: string,
    onStatusChange?: (s: WorkspaceSyncStatus) => void,
    onConflictDetected?: () => Promise<void>,
    onGitConflictPrompt?: () => Promise<void>,
    onToast?: (message: string) => void,
    onLockLost?: (reason: 'stolen' | 'expired' | 'error') => void,
    forceLock?: boolean,
  ): Promise<void> {
    await this.deactivate()
    this.workspaceUuid = workspaceUuid
    this.localWorkspacePath = `/.cloud-workspaces/${workspaceUuid}`
    this.onStatusChange = onStatusChange || null
    this._onConflictDetected = onConflictDetected || null
    this._onGitConflictPrompt = onGitConflictPrompt || null
    this._onToast = onToast || null
    this._onLockLost = onLockLost || null
    this.pendingChanges = []

    // ── Acquire workspace lock ─────────────────────────────
    // Throws WorkspaceLockedError if another device holds the lock.
    // Must be before STS / S3 — no point setting up sync if locked out.
    // If forceLock is true, we steal the lock from the current holder.
    console.log(`[CloudSync:activate] Acquiring lock for workspace ${workspaceUuid}, forceLock=${forceLock}`)
    await acquireLock(workspaceUuid, { force: forceLock })
    console.log(`[CloudSync:activate] Lock acquired for workspace ${workspaceUuid}`)

    // Start heartbeat to keep the lock alive (20s interval, 60s TTL)
    this._lockHeartbeat.start(workspaceUuid, (reason) => {
      this._onLockLost?.(reason)
    })

    // beforeunload → release lock via sendBeacon (POST /unlock)
    this._onBeforeUnload = () => releaseLockBeacon(workspaceUuid)
    window.addEventListener('beforeunload', this._onBeforeUnload)

    // offline → trigger lock loss so the workspace is closed
    this._onOffline = () => {
      this._onLockLost?.('error')
    }
    window.addEventListener('offline', this._onOffline)

    // Get workspace-scoped STS
    const token = await fetchWorkspaceSTS(workspaceUuid)
    this.s3 = new S3Client(token)
    this.scheduleTokenRefresh(token)

    // Load existing manifest (or create empty one)
    this.manifest = await this.loadManifest()

    // Restore persisted _git.zip ETag so we don't false-positive on every load
    this._lastGitZipEtag = this.manifest.lastGitZipEtag || null

    // Load current workspace version from the API for conflict detection.
    // The version is already in the cloudStore if we just fetched the list,
    // but re-fetching ensures we have the latest value.
    try {
      const ws = await getCloudWorkspace(workspaceUuid)
      this._localVersion = ws.version ?? 0
    } catch (err) {
      console.warn('[CloudSync:version] Could not fetch workspace version, defaulting to 0:', err.message || err)
      this._localVersion = 0
    }

    // Start periodic flush
    this.syncTimer = setInterval(() => this.flushChanges(), SYNC_INTERVAL_MS)

    // Install visibility listener — send immediate heartbeat on tab focus.
    // Background tabs may throttle setInterval (Chrome ≥ 1min), so the lock
    // could be close to expiry when the user returns.
    this._onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        this._lockHeartbeat.sendImmediate()
      }
    }
    document.addEventListener('visibilitychange', this._onVisibilityChange)

    this.updateStatus({ status: 'idle', lastSync: null, pendingChanges: 0 })
  }

  /**
   * Stop the sync engine, cancel timers.
   * Call this when switching workspaces or logging out.
   *
   * Flushes any pending changes first so nothing is lost on workspace switch.
   */
  async deactivate(): Promise<void> {
    // If a flush is already in progress (e.g. from the periodic timer),
    // wait for it to finish before tearing down state.
    if (this._flushPromise) {
      try {
        await this._flushPromise
      } catch (err) {
        console.warn('[CloudSync] In-progress flush failed during deactivate:', err.message || err)
      }
    }

    // Flush any remaining pending changes before tearing down
    if (this.pendingChanges.length > 0 && this.s3 && this.workspaceUuid) {
      try {
        await this.flushChanges()
      } catch (err) {
        console.warn('[CloudSync] Flush on deactivate failed:', err.message || err)
      }
    }

    // ── Stop lock heartbeat and release lock ──
    this._lockHeartbeat.stop()
    if (this.workspaceUuid) {
      // Best-effort release — don't await. Lock will expire naturally if this fails.
      releaseLock(this.workspaceUuid)
    }

    if (this.syncTimer) clearInterval(this.syncTimer)
    if (this.tokenRefreshTimer) clearTimeout(this.tokenRefreshTimer)
    if (this.snapshotTimer) clearTimeout(this.snapshotTimer)
    if (this.gitSnapshotTimer) clearTimeout(this.gitSnapshotTimer)
    this.syncTimer = null
    this.tokenRefreshTimer = null
    this.snapshotTimer = null
    this.gitSnapshotTimer = null

    // Remove visibility listener
    if (this._onVisibilityChange) {
      document.removeEventListener('visibilitychange', this._onVisibilityChange)
      this._onVisibilityChange = null
    }
    // Remove beforeunload listener
    if (this._onBeforeUnload) {
      window.removeEventListener('beforeunload', this._onBeforeUnload)
      this._onBeforeUnload = null
    }
    // Remove offline listener
    if (this._onOffline) {
      window.removeEventListener('offline', this._onOffline)
      this._onOffline = null
    }
    // Legacy: remove _onOnline if still present
    if (this._onOnline) {
      window.removeEventListener('online', this._onOnline)
      this._onOnline = null
    }

    this.s3 = null
    this.workspaceUuid = null
    this.localWorkspacePath = null
    this.pendingChanges = []
    this.isSyncing = false
    this._flushPromise = null
    this._isResolvingConflict = false
    this.onStatusChange = null
    this._onConflictDetected = null
    this._onGitConflictPrompt = null
    this._onToast = null
    this._onLockLost = null
    this.manifest = null
    this._localVersion = 0
    this._lastGitZipEtag = null
  }

  get isActive(): boolean {
    return this.s3 !== null && this.workspaceUuid !== null
  }

  get status(): WorkspaceSyncStatus {
    return { ...this._status }
  }

  // ── Pull: S3 → Local (hybrid ZIP + incremental) ────────

  /**
   * Hybrid pull:
   *
   * A) No manifest (first load) → GET _workspace.zip, extract, LIST to build manifest
   * B) Manifest exists → LIST + ETag diff, GET only changed files
   *
   * @returns Stats about what happened
   */
  async pullWorkspace(): Promise<{ downloaded: number; skipped: number; deleted: number }> {
    if (!this.s3 || !this.workspaceUuid || !this.localWorkspacePath) {
      console.log('[CloudSync:pull] Skipped — engine not active (s3/uuid/path missing)')
      return { downloaded: 0, skipped: 0, deleted: 0 }
    }
    console.log(`[CloudSync:pull] Starting pull for workspace ${this.workspaceUuid}, S3 prefix: ${this.s3.prefix}`)
    this.updateStatus({ ...this._status, status: 'syncing' })

    try {
      const manifest = this.manifest!
      const isFreshLoad = Object.keys(manifest.files).length === 0
      console.log(`[CloudSync:pull] Strategy: ${isFreshLoad ? 'A (ZIP bulk load — fresh manifest)' : `B (incremental — manifest has ${Object.keys(manifest.files).length} files)`}`)

      // ── Suppress change tracking for all writes during pull ──
      this._isPulling = true

      if (isFreshLoad) {
        // ── Strategy A: ZIP-based bulk load ──────────────────
        const stats = await this.pullViaZip(manifest)
        this._isPulling = false
        console.log(`[CloudSync:pull] ZIP strategy result: ${JSON.stringify(stats)}`)
        return stats
      } else {
        // ── Strategy B: Incremental ETag-based diff ──────────
        const stats = await this.pullIncremental(manifest)
        this._isPulling = false
        console.log(`[CloudSync:pull] Incremental strategy result: ${JSON.stringify(stats)}`)
        return stats
      }
    } catch (error) {
      this._isPulling = false
      console.error('[CloudSync] Pull failed:', error)
      this.updateStatus({ status: 'error', lastSync: this._status.lastSync, pendingChanges: this._status.pendingChanges, error: error.message })
      throw error
    }
  }

  /**
   * Strategy A: Download _workspace.zip, extract all files, then LIST
   * to populate manifest ETags for future incremental syncs.
   */
  private async pullViaZip(manifest: SyncManifest): Promise<{ downloaded: number; skipped: number; deleted: number }> {
    console.log(`[CloudSync:pullViaZip] Fetching ${WORKSPACE_ZIP_KEY} from S3...`)
    const zipData = await this.s3!.getObjectBinary(WORKSPACE_ZIP_KEY)
    console.log(`[CloudSync:pullViaZip] ZIP result: ${zipData ? `${zipData.byteLength} bytes` : 'null (404/403 — no ZIP exists)'}`)

    if (zipData) {
      // ── 1. Extract ZIP into local FS ──
      const { manifest: zipManifest, fileCount } = await unpackWorkspace(
        zipData,
        this.localWorkspacePath!,
        this.fs,
      )

      // ── 2. LIST to get real ETags for the manifest ──
      const remoteObjects = await this.s3!.listObjects('')
      const extraDownloads: S3Object[] = []
      for (const obj of remoteObjects) {
        if (obj.key.endsWith('/')) continue // skip dir markers
        if (obj.key === WORKSPACE_ZIP_KEY) continue // skip the zip itself
        if (obj.key.startsWith('_workspace_backup_')) continue // skip snapshot backups
        if (obj.key === GIT_ZIP_KEY) {
          const oldEtag = this._lastGitZipEtag
          this._lastGitZipEtag = obj.etag || null
          continue
        }
        if (obj.key === '.git' || obj.key.startsWith('.git/')) continue // skip .git internals
        if (zipManifest.files[obj.key]) {
          // Overwrite with real S3 ETag so incremental diff works next time
          zipManifest.files[obj.key].etag = obj.etag || ''
          zipManifest.files[obj.key].lastModified = obj.lastModified.toISOString()
          zipManifest.files[obj.key].size = obj.size
        } else {
          // File on S3 but not in ZIP (added after last snapshot) — download later
          extraDownloads.push(obj)
        }
      }

      // Download extra files in parallel
      if (extraDownloads.length > 0) {
        await parallelMap(extraDownloads, async (obj) => {
          const localPath = `${this.localWorkspacePath}/${obj.key}`
          const parentDir = localPath.substring(0, localPath.lastIndexOf('/'))
          await this.ensureDir(parentDir)

          const content = await this.s3!.getObject(obj.key)
          if (content !== null) {
            await this.fs.writeFile(localPath, content, 'utf8')
            zipManifest.files[obj.key] = {
              etag: obj.etag || '',
              lastModified: obj.lastModified.toISOString(),
              size: obj.size,
            }
          }
        }, PARALLEL_CONCURRENCY)
      }

      // ── 3. Adopt the zip manifest as our manifest ──
      Object.assign(manifest, { files: zipManifest.files, lastSyncTimestamp: Date.now() })
      await this.saveManifest(manifest)

      const downloaded = fileCount
      console.log(`[CloudSync:pullViaZip] ZIP extracted: ${downloaded} files, ${extraDownloads.length} extra downloads from S3`)
      this.updateStatus({ status: 'idle', lastSync: Date.now(), pendingChanges: this._status.pendingChanges })
      return { downloaded, skipped: 0, deleted: 0 }
    } else {
      // No ZIP exists yet — fall back to incremental (downloads every file one by one)
      console.log(`[CloudSync:pullViaZip] No ZIP on S3 — falling back to incremental pull`)
      return this.pullIncremental(manifest)
    }
  }

  /**
   * Strategy B: LIST + ETag diff, GET only changed files.
   * This is the original smart-pull logic.
   */
  private async pullIncremental(manifest: SyncManifest): Promise<{ downloaded: number; skipped: number; deleted: number }> {
    const manifestFileCount = Object.keys(manifest.files).length
    console.log(`[CloudSync:pullIncremental] Starting incremental pull for workspace ${this.workspaceUuid}`)
    console.log(`[CloudSync:pullIncremental] Local manifest has ${manifestFileCount} files, S3 prefix: ${this.s3!.prefix}`)

    // ── 1. LIST request to get all remote objects + their ETags ──
    const remoteObjects = await this.s3!.listObjects('')
    console.log(`[CloudSync:pullIncremental] S3 LIST returned ${remoteObjects.length} raw objects`)

    const remoteMap = new Map<string, S3Object>()
    let remoteGitZipEtag: string | null = null
    for (const obj of remoteObjects) {
      if (obj.key === GIT_ZIP_KEY) {
        remoteGitZipEtag = obj.etag || null
        continue
      }
      if (!obj.key.endsWith('/') && obj.key !== WORKSPACE_ZIP_KEY
        && !obj.key.startsWith('_workspace_backup_')
        && obj.key !== '.git' && !obj.key.startsWith('.git/')) {
        remoteMap.set(obj.key, obj)
      }
    }
    console.log(`[CloudSync:pullIncremental] After filtering: ${remoteMap.size} remote files (excluded dirs, ZIP, .git)`)

    // Store the latest _git.zip ETag we saw on S3
    const oldGitEtag = this._lastGitZipEtag
    if (remoteGitZipEtag !== null) this._lastGitZipEtag = remoteGitZipEtag

    // ── 2. Diff against manifest ──
    const toDownload: S3Object[] = []
    const toDelete: string[] = []
    let skipped = 0

    for (const [key, obj] of remoteMap) {
      const entry = manifest.files[key]
      if (entry && entry.etag && entry.etag === obj.etag) {
        skipped++
      } else {
        toDownload.push(obj)
        console.log(`[CloudSync:pullIncremental] Will download: ${obj.key} (etag changed: ${manifest.files[obj.key]?.etag || 'none'} → ${obj.etag})`)
      }
    }

    for (const key of Object.keys(manifest.files)) {
      if (!remoteMap.has(key)) {
        toDelete.push(key)
      }
    }

    console.log(`[CloudSync:pullIncremental] Diff result: ${toDownload.length} to download, ${skipped} skipped (unchanged), ${toDelete.length} to delete`)

    // ── SAFETY CHECK: refuse to delete all local files when remote is empty ──
    // If the remote has ZERO files but the local manifest has files, something
    // is wrong (e.g. wrong S3 prefix, transient S3 issue, workspace not yet
    // populated). Deleting everything would cause data loss.
    if (remoteMap.size === 0 && manifestFileCount > 0) {
      console.error(
        `[CloudSync:pullIncremental] ⚠️ SAFETY BLOCK: Remote S3 is empty (0 files) but local manifest has ${manifestFileCount} files. ` +
        `Refusing to delete all local files. This could indicate a wrong S3 prefix, a transient S3 issue, or a new workspace. ` +
        `S3 prefix: ${this.s3!.prefix}, workspace: ${this.workspaceUuid}`
      )
      this.updateStatus({ status: 'idle', lastSync: this._status.lastSync, pendingChanges: this._status.pendingChanges })
      return { downloaded: 0, skipped: 0, deleted: 0 }
    }

    if (toDelete.length > 0) {
      console.warn(`[CloudSync:pullIncremental] About to delete ${toDelete.length} local files not found on remote:`)
      for (const key of toDelete) {
        console.warn(`[CloudSync:pullIncremental]   DELETE: ${key}`)
      }
    }

    // ── 3. Short-circuit if nothing to do ──
    if (toDownload.length === 0 && toDelete.length === 0) {
      console.log(`[CloudSync:pullIncremental] Nothing to do, manifest up to date`)
      manifest.lastSyncTimestamp = Date.now()
      await this.saveManifest(manifest)
      this.updateStatus({ status: 'idle', lastSync: Date.now(), pendingChanges: this._status.pendingChanges })
      return { downloaded: 0, skipped, deleted: 0 }
    }

    // ── 4. Ensure workspace root exists ──
    await this.ensureDir(this.localWorkspacePath!)

    // ── 5. Download changed / new files (parallel) ──
    await parallelMap(toDownload, async (obj) => {
      const localPath = `${this.localWorkspacePath}/${obj.key}`
      const parentDir = localPath.substring(0, localPath.lastIndexOf('/'))
      await this.ensureDir(parentDir)

      // Send If-None-Match with the old ETag we have locally — S3 returns
      // 304 if the file was reverted between LIST and GET, saving bandwidth.
      const localEtag = manifest.files[obj.key]?.etag
      const content = await this.s3!.getObject(obj.key, localEtag || undefined)
      if (content !== null) {
        console.log(`[CloudSync:pullIncremental] Downloaded: ${obj.key} (${content.length} bytes)`)
        await this.fs.writeFile(localPath, content, 'utf8')
        manifest.files[obj.key] = {
          etag: obj.etag || '',
          lastModified: obj.lastModified.toISOString(),
          size: obj.size,
        }
      } else {
        console.log(`[CloudSync:pullIncremental] Skipped download (304 Not Modified): ${obj.key}`)
      }
    }, PARALLEL_CONCURRENCY)

    // ── 6. Delete files removed on remote (parallel) ──
    await parallelMap(toDelete, async (key) => {
      const localPath = `${this.localWorkspacePath}/${key}`
      try {
        await this.fs.unlink(localPath)
        console.log(`[CloudSync:pullIncremental] Deleted local file: ${key}`)
      } catch (err) {
        console.log(`[CloudSync:pullIncremental] Delete skipped (already gone): ${key}`)
      }
      delete manifest.files[key]
    }, PARALLEL_CONCURRENCY)

    // ── 7. Persist updated manifest ──
    manifest.lastSyncTimestamp = Date.now()
    await this.saveManifest(manifest)

    console.log(`[CloudSync:pullIncremental] Pull complete: ${toDownload.length} downloaded, ${skipped} unchanged, ${toDelete.length} deleted`)
    this.updateStatus({ status: 'idle', lastSync: Date.now(), pendingChanges: this._status.pendingChanges })
    return { downloaded: toDownload.length, skipped, deleted: toDelete.length }
  }

  /**
   * Force a full re-download by clearing the manifest first.
   * Use when user explicitly requests a full resync.
   */
  async forcePull(): Promise<{ downloaded: number; skipped: number; deleted: number }> {
    if (this.manifest) {
      this.manifest.files = {}
      this.manifest.lastSyncTimestamp = 0
    }
    return this.pullWorkspace()
  }

  // ── Push: Local → S3 ─────────────────────────────────────

  /**
   * Record a local file change to be pushed to S3.
   * Call this from the file provider event handlers.
   */
  trackChange(change: FileChangeRecord): void {
    if (!this.isActive) return

    // During conflict resolution, drop all incoming changes — the editors
    // are being closed and the files are about to be overwritten by the pull.
    if (this._isResolvingConflict) {
      return
    }

    // Never track the manifest file itself
    if (change.path === MANIFEST_FILENAME || change.path.endsWith('/' + MANIFEST_FILENAME)) return

    // Never track the snapshot ZIP (managed by the engine, not user files)
    if (change.path === WORKSPACE_ZIP_KEY || change.path.endsWith('/' + WORKSPACE_ZIP_KEY)) return

    // Never sync .git internals — managed locally by isomorphic-git
    if (change.path === '.git' || change.path.startsWith('.git/')) return

    // De-duplicate: if there's already a pending change for this path, update it
    const existingIdx = this.pendingChanges.findIndex(c => c.path === change.path)
    if (existingIdx >= 0) {
      // If we have add then delete, they cancel out
      const existing = this.pendingChanges[existingIdx]
      if (existing.type === 'add' && change.type === 'delete') {
        this.pendingChanges.splice(existingIdx, 1)
      } else {
        this.pendingChanges[existingIdx] = change
      }
    } else {
      this.pendingChanges.push(change)
    }

    this.updateStatus({ ...this._status, pendingChanges: this.pendingChanges.length })
  }

  /**
   * Flush all pending changes to S3. Called periodically and on-demand.
   *
   * Uses optimistic concurrency: before pushing files to S3 we PATCH
   * the workspace with `expected_version`. If another device pushed
   * since our last pull the API returns 409 and we pull instead.
   *
   * Stores the active promise in `_flushPromise` so that `deactivate()`
   * can await an in-progress flush even if it was started by the periodic timer.
   */
  async flushChanges(): Promise<void> {
    if (!this.isActive || this.isSyncing || this.pendingChanges.length === 0) return

    const promise = this._doFlush()
    this._flushPromise = promise
    try {
      await promise
    } finally {
      // Clear the reference only if it's still OUR promise (not a newer one)
      if (this._flushPromise === promise) this._flushPromise = null
    }
  }

  /**
   * Internal flush implementation.
   */
  private async _doFlush(): Promise<void> {

    this.isSyncing = true
    this.updateStatus({ ...this._status, status: 'pushing' })
    const changes = [...this.pendingChanges]
    this.pendingChanges = []

    try {
      // ── Version check: claim the next version before pushing files ──
      if (this.workspaceUuid) {
        try {
          const updated = await updateCloudWorkspace(this.workspaceUuid, {
            expected_version: this._localVersion,
          })
          const previousVersion = this._localVersion
          // Store the bumped version for next push
          this._localVersion = updated.version ?? (this._localVersion + 1)
          // Keep cloudStore in sync so the UI reflects the new version
          cloudStore.updateCloudWorkspace(updated)
        } catch (err) {
          if (err instanceof VersionConflictException) {
            console.warn(`[CloudSync:version] ✗ VERSION CONFLICT! local=${this._localVersion}, remote=${err.currentVersion}. Re-queuing ${changes.length} changes and pulling remote state.`)
            // Re-queue the changes — they'll be retried after pull
            this.pendingChanges.push(...changes)
            this.isSyncing = false
            // Pull the latest workspace from S3
            await this.handleVersionConflict(err.currentVersion)
            return
          }
          // Non-version error (network, auth, etc.) — re-queue and bail
          console.error(`[CloudSync:version] ✗ Version check failed (non-conflict):`, err.message || err)
          this.pendingChanges.push(...changes)
          this.updateStatus({ status: 'error', lastSync: this._status.lastSync, pendingChanges: this.pendingChanges.length, error: err.message })
          this.isSyncing = false
          return
        }
      }

      // ── Push files to S3 ──
      await parallelMap(changes, async (change) => {
        try {
          await this.pushChange(change)
        } catch (err) {
          const retries = (change._retryCount || 0) + 1
          if (retries < 5) {
            console.warn(`[CloudSync] Failed to push change ${change.type} ${change.path} (retry ${retries}/5):`, err.message || err)
            this.pendingChanges.push({ ...change, _retryCount: retries })
          } else {
            console.error(`[CloudSync] Giving up on ${change.type} ${change.path} after 5 retries:`, err.message || err)
          }
        }
      }, PARALLEL_CONCURRENCY)

      // Persist manifest after batch (captures all new ETags from PUT responses)
      // Guard: manifest may have been nulled by a concurrent deactivate
      if (this.manifest) {
        await this.saveManifest(this.manifest)
      }

      this.updateStatus({
        status: this.pendingChanges.length > 0 ? 'error' : 'idle',
        lastSync: Date.now(),
        pendingChanges: this.pendingChanges.length,
        error: this.pendingChanges.length > 0 ? 'Some changes failed to sync' : undefined,
      })

      // Schedule a debounced snapshot update so the next fresh client
      // gets a ZIP that includes these changes.
      this.scheduleSnapshotUpdate()
    } catch (error) {
      console.error('[CloudSync] Flush failed:', error)
      // Re-queue all changes
      this.pendingChanges.push(...changes)
      this.updateStatus({ status: 'error', lastSync: this._status.lastSync, pendingChanges: this.pendingChanges.length, error: error.message })
    } finally {
      this.isSyncing = false
    }
  }

  /**
   * Push a single file change to S3 and update the in-memory manifest.
   */
  private async pushChange(change: FileChangeRecord): Promise<void> {
    if (!this.s3 || !this.localWorkspacePath || !this.manifest) return

    switch (change.type) {
    case 'add':
    case 'change': {
      const localPath = `${this.localWorkspacePath}/${change.path}`
      try {
        // Check if this is a directory — S3 uses key prefixes, not real dirs.
        // Directories should never be pushed as file objects.
        const stat = await this.fs.stat(localPath)
        if (stat.isDirectory()) return

        const content = await this.fs.readFile(localPath, 'utf8')
        if (content == null) return // guard against undefined readFile results
        const etag = await this.s3.putObject(change.path, content)
        if (!etag) return // guard against missing ETag (shouldn't happen)
        // Capture the ETag from S3's response so the next pull recognises
        // this file as already-synced and skips the GET.
        // Guard: manifest may have been nulled by a concurrent deactivate
        if (!this.manifest) return
        this.manifest.files[change.path] = {
          etag,
          lastModified: new Date().toISOString(),
          size: typeof content === 'string' ? new TextEncoder().encode(content).byteLength : (content as any).length ?? 0,
        }
      } catch (err) {
        // File may have been deleted between tracking and flushing
        if (err.code === 'ENOENT') return
        throw err
      }
      break
    }
    case 'delete':
      try {
        await this.s3.deleteObject(change.path)
      } catch (err) {
        // CORS / network errors on DELETE should not block the sync engine.
        // The file will be cleaned up on the next full sync or stay as orphan.
        console.warn(`[CloudSync] DELETE ${change.path} failed (non-fatal):`, err.message || err)
      }
      if (this.manifest) delete this.manifest.files[change.path]
      break
    case 'rename':
      if (change.oldPath) {
        // Upload the new file FIRST — PUTs are reliable.
        const localPath = `${this.localWorkspacePath}/${change.path}`
        try {
          const stat = await this.fs.stat(localPath)
          if (stat.isDirectory()) return

          const content = await this.fs.readFile(localPath, 'utf8')
          if (content == null) return
          const etag = await this.s3.putObject(change.path, content)
          if (!etag) return
          // Guard: manifest may have been nulled by a concurrent deactivate
          if (!this.manifest) return
          this.manifest.files[change.path] = {
            etag,
            lastModified: new Date().toISOString(),
            size: typeof content === 'string' ? new TextEncoder().encode(content).byteLength : (content as any).length ?? 0,
          }
        } catch (err) {
          if (err.code === 'ENOENT') return
          throw err
        }
        // Best-effort delete old key.  If CORS blocks DELETE, the orphan
        // will be cleaned up on next full sync.  Don't let it block the rename.
        try {
          await this.s3.deleteObject(change.oldPath)
        } catch (err) {
          console.warn(`[CloudSync] DELETE old key ${change.oldPath} failed (non-fatal):`, err.message || err)
        }
        delete this.manifest.files[change.oldPath]
      }
      break
    }
  }

  /**
   * Force an immediate sync of all pending changes.
   */
  async forcePush(): Promise<void> {
    await this.flushChanges()
  }

  // ── Version conflict handling ─────────────────────────────

  /**
   * Proactively check if the remote workspace version has advanced
   * past our local version. Called on tab-focus and online events.
   *
   * If the remote is ahead we pull automatically. This catches the
   * common multi-device scenario: user edits on Device B, comes back
   * to Device A, and the tab-focus fires before they start editing.
   */
  async checkRemoteVersion(): Promise<void> {
    if (!this.workspaceUuid || !this.isActive) {
      return
    }
    if (this._isResolvingConflict) {
      return
    }
    try {
      const ws = await getCloudWorkspace(this.workspaceUuid)
      const remoteVersion = ws.version ?? 0
      if (remoteVersion > this._localVersion) {
        await this.handleVersionConflict(remoteVersion)
      } else {
        // Versions are equal — backend may not be incrementing versions yet.
        // Do a lightweight incremental pull (LIST + ETag diff) so that
        // changes made on another device are still picked up on tab-focus.
        await this.pullIfChanged()
      }
    } catch (err) {
      // Non-fatal — we'll catch it on the next push via 409 anyway
      console.warn('[CloudSync:version] Remote version check failed:', err.message || err)
    }
  }

  /**
   * Lightweight incremental pull: LIST remote objects, compare ETags
   * against local manifest, download only changed files.
   *
   * Used as a fallback when version numbers are equal (e.g. backend
   * hasn't implemented version increments yet) so that tab-focus
   * still picks up changes made on other devices.
   */
  private async pullIfChanged(): Promise<void> {
    if (!this.s3 || !this.localWorkspacePath || !this.manifest) {
      return
    }
    if (this.isSyncing || this._isResolvingConflict) {
      return
    }

    try {
      const previousGitEtag = this._lastGitZipEtag
      this._isPulling = true
      const result = await this.pullIncremental(this.manifest)
      this._isPulling = false

      if (result.downloaded > 0 || result.deleted > 0) {
        await this.saveManifest(this.manifest)
        this._onToast?.(`Pulled ${result.downloaded} updated file${result.downloaded !== 1 ? 's' : ''} from another device.`)
      }

      // Non-blocking: prompt user if remote _git.zip changed
      this.notifyIfGitZipChanged(previousGitEtag)
    } catch (err) {
      this._isPulling = false
      console.warn('[CloudSync] Incremental pull on focus failed (non-fatal):', err.message || err)
    }
  }

  /**
   * Handle a version conflict: the remote workspace has been updated
   * by another device. We pull the full remote state, update local
   * version, and let pending changes retry on the next flush cycle.
   */
  private async handleVersionConflict(remoteVersion: number): Promise<void> {
    // Prevent re-entry (e.g. from concurrent checkRemoteVersion / flushChanges)
    if (this._isResolvingConflict) {
      return
    }

    const previousVersion = this._localVersion

    // ── 1. Freeze: block new changes from autosave / editor writes ──
    this._isResolvingConflict = true
    const previousGitEtag = this._lastGitZipEtag

    // ── 2. Close all editor tabs so autosave stops firing ──
    if (this._onConflictDetected) {
      try {
        await this._onConflictDetected()
      } catch (err) {
        console.warn('[CloudSync:version] onConflictDetected callback error (non-fatal):', err)
      }
    }

    // ── 3. Discard all pending changes — they're from the old version ──
    const discarded = this.pendingChanges.length
    this.pendingChanges = []

    this.updateStatus({ ...this._status, status: 'syncing', pendingChanges: 0 })

    try {
      // ── 4. Pull latest from S3 (overwrites local files with remote state) ──
      const result = await this.pullWorkspace()

      // Adopt the remote version
      this._localVersion = remoteVersion

      // Keep local .git/ as-is — automatic conflict resolution should not
      // block on user input. The git snapshot will be pulled only when
      // .git/ is missing (fresh device). On next push the local git state
      // will be snapshotted to S3 again automatically.

      // Non-blocking: prompt user if remote _git.zip changed
      this.notifyIfGitZipChanged(previousGitEtag)

      // Update the workspace record in the cloud store
      const ws = cloudStore.getState().cloudWorkspaces.find(w => w.uuid === this.workspaceUuid)
      if (ws) {
        cloudStore.updateCloudWorkspace({ ...ws, version: remoteVersion })
      }

      this.updateStatus({
        status: 'idle',
        lastSync: Date.now(),
        pendingChanges: this.pendingChanges.length,
      })

      // ── 5. Unfreeze: allow new changes to be tracked again ──
      this._isResolvingConflict = false

      // ── 6. Notify user that the pull completed ──
      if (result.downloaded > 0 || result.deleted > 0) {
        this._onToast?.(`Pulled ${result.downloaded} updated file${result.downloaded !== 1 ? 's' : ''} from another device.`)
      }

    } catch (err) {
      this._isResolvingConflict = false
      console.error(`[CloudSync:version] ✗ Conflict resolution FAILED:`, err.message || err)
      this.updateStatus({
        status: 'error',
        lastSync: this._status.lastSync,
        pendingChanges: this.pendingChanges.length,
        error: 'Failed to pull remote changes after version conflict',
      })
    }
  }

  // ── Snapshot ZIP ──────────────────────────────────────────

  /**
   * Schedule a debounced re-zip of the workspace.
   * Called after each successful flush so the _workspace.zip stays
   * roughly up-to-date without zipping on every single file save.
   */
  private scheduleSnapshotUpdate(): void {
    if (this.snapshotTimer) clearTimeout(this.snapshotTimer)
    this.snapshotTimer = setTimeout(() => {
      this.snapshotTimer = null
      this.pushSnapshot().catch(err => {
        console.warn('[CloudSync] Snapshot update failed (non-fatal):', err.message || err)
      })
    }, SNAPSHOT_DEBOUNCE_MS)
  }

  /**
   * Re-zip the entire workspace and PUT _workspace.zip to S3.
   * This is a background operation — failure is non-fatal.
   */
  private async pushSnapshot(): Promise<void> {
    if (!this.s3 || !this.localWorkspacePath) return

    // Back up the current _workspace.zip before overwriting (copy-on-write).
    // The backup key includes a timestamp so multiple versions accumulate.
    // Failure is non-fatal — we still push the new snapshot.
    try {
      const backupKey = `_workspace_backup_${Date.now()}.zip`
      const copied = await this.s3.copyObject(WORKSPACE_ZIP_KEY, backupKey, 'lifecycle=expire-7d')
      if (copied) {
        console.log(`[CloudSync:snapshot] Backed up ${WORKSPACE_ZIP_KEY} → ${backupKey}`)
      }
    } catch (err) {
      console.warn('[CloudSync:snapshot] Backup copy failed (non-fatal):', err.message || err)
    }

    const zipData = await packWorkspace(this.localWorkspacePath, this.fs)

    await this.s3.putObject(WORKSPACE_ZIP_KEY, zipData, 'application/zip')
  }

  /**
   * Force an immediate snapshot push (e.g. on workspace close or logout).
   */
  async forceSnapshot(): Promise<void> {
    if (this.snapshotTimer) {
      clearTimeout(this.snapshotTimer)
      this.snapshotTimer = null
    }
    await this.pushSnapshot()
  }

  // ── Git Snapshot ZIP ──────────────────────────────────────

  /**
   * Schedule a debounced push of `_git.zip` after a `.git/` write.
   * Called from the FS observer when it detects a write to `.git/`.
   *
   * The heavy debounce (60s) avoids constant re-zipping during a
   * `git commit` which writes many objects in rapid succession.
   */
  scheduleGitSnapshotUpdate(): void {
    const wasScheduled = !!this.gitSnapshotTimer
    if (this.gitSnapshotTimer) clearTimeout(this.gitSnapshotTimer)
    this.gitSnapshotTimer = setTimeout(() => {
      this.gitSnapshotTimer = null
      this.pushGitSnapshot().catch(err => {
        console.warn('[CloudGitZip] Git snapshot push failed (non-fatal):', err.message || err)
      })
    }, GIT_SNAPSHOT_DEBOUNCE_MS)
  }

  /**
   * ZIP the `.git/` directory and PUT it to S3 as `_git.zip`.
   * Atomic: one PUT, one S3 object. No partial state.
   */
  async pushGitSnapshot(): Promise<void> {
    if (!this.s3 || !this.localWorkspacePath) {
      return
    }

    const previousEtag = this._lastGitZipEtag
    const startTime = Date.now()

    const zipData = await packGitDir(this.localWorkspacePath, this.fs)
    if (!zipData) {
      return
    }

    const etag = await this.s3.putObject(GIT_ZIP_KEY, zipData, 'application/zip')
    // Store the real S3 ETag so that the next pullIfChanged() LIST won't
    // falsely detect our own push as a remote change.
    this._lastGitZipEtag = etag || `local-push-${Date.now()}`

    // Persist the new ETag to disk so it survives page reloads
    if (this.manifest) {
      this.manifest.lastGitZipEtag = this._lastGitZipEtag
      await this.saveManifest(this.manifest)
    }
  }

  /**
   * If no local `.git/` exists, download `_git.zip` from S3 and extract it.
   *
   * Called after pulling workspace files. Only runs when `.git/` is missing
   * (fresh device, cleared IndexedDB, etc.). If `.git/` already exists
   * locally, we leave it alone — the local git state is the source of truth.
   *
   * @param force  When true, overwrite any existing local `.git/` with the
   *               remote snapshot. Used during conflict resolution when the
   *               user explicitly chooses to accept the remote git history.
   */
  async pullGitSnapshot(force = false): Promise<void> {
    if (!this.s3 || !this.localWorkspacePath) {
      return
    }

    const gitPath = `${this.localWorkspacePath}/.git`

    // Check if local .git already exists
    try {
      const stat = await this.fs.stat(gitPath)
      if (stat.isDirectory()) {
        if (!force) {
          return
        }
      }
    } catch (e) {
      void e
    }

    try {
      const zipData = await this.s3.getObjectBinary(GIT_ZIP_KEY)
      if (!zipData) {
        return
      }

      // Suppress change tracking during extraction
      this._isPulling = true
      try {
        const fileCount = await unpackGitDir(zipData, this.localWorkspacePath, this.fs)
        void fileCount
      } finally {
        this._isPulling = false
      }

      // After a successful pull, persist the current ETag so we don't re-prompt
      if (this.manifest && this._lastGitZipEtag) {
        this.manifest.lastGitZipEtag = this._lastGitZipEtag
        await this.saveManifest(this.manifest)
      }
    } catch (err) {
      console.warn('[CloudGitZip:pull] ❌ Failed to restore .git from S3:', err.message || err)
    }
  }

  /**
   * Force an immediate git snapshot push (e.g. on workspace close or logout).
   */
  async forceGitSnapshot(): Promise<void> {
    if (this.gitSnapshotTimer) {
      clearTimeout(this.gitSnapshotTimer)
      this.gitSnapshotTimer = null
    }
    await this.pushGitSnapshot()
  }

  /**
   * Non-blocking check: has the remote `_git.zip` changed since we last
   * pushed or acknowledged it?  If yes AND local `.git/` exists, fire the
   * `_onGitConflictPrompt` callback (which shows a non-blocking modal).
   *
   * The callback is responsible for calling `pullGitSnapshot(true)` if the
   * user accepts.  We intentionally do NOT await the callback — the sync
   * flow continues while the modal is visible.
   */
  notifyIfGitZipChanged(previousEtag: string | null): void {
    if (!this._onGitConflictPrompt || !this.localWorkspacePath) {
      return
    }

    const currentEtag = this._lastGitZipEtag
    // No remote _git.zip, or ETag hasn't changed → nothing to do
    if (!currentEtag) {
      return
    }
    if (currentEtag === previousEtag) {
      return
    }
    const gitPath = `${this.localWorkspacePath}/.git`
    this.fs.stat(gitPath).then((stat: any) => {
      if (!stat.isDirectory()) {
        return
      }
      // Fire-and-forget: don't block the sync flow
      this._onGitConflictPrompt!().catch((err: any) => {
        console.warn('[CloudGitZip:notify] Git conflict prompt error (non-fatal):', err.message || err)
      })
    }).catch(() => {})
  }

  // ── Manifest persistence ──────────────────────────────────

  private get manifestPath(): string {
    return `${this.localWorkspacePath}/${MANIFEST_FILENAME}`
  }

  /**
   * Load the sync manifest from IndexedDB.
   * Returns a fresh empty manifest if none exists or it's corrupt.
   */
  private async loadManifest(): Promise<SyncManifest> {
    try {
      const raw = await this.fs.readFile(this.manifestPath, 'utf8')
      const data = JSON.parse(raw) as SyncManifest
      if (data.version === 1 && data.files) return data
    } catch {
      // No manifest or invalid JSON — treat as first sync
    }
    return { version: 1, lastSyncTimestamp: 0, files: {} }
  }

  /**
   * Persist the in-memory manifest to IndexedDB.
   */
  private async saveManifest(manifest: SyncManifest): Promise<void> {
    if (!this.localWorkspacePath) return
    // Always persist the latest git ETag into the manifest
    if (this._lastGitZipEtag) {
      manifest.lastGitZipEtag = this._lastGitZipEtag
    }
    try {
      await this.ensureDir(this.localWorkspacePath)
      await this.fs.writeFile(this.manifestPath, JSON.stringify(manifest), 'utf8')
    } catch (err) {
      console.error('[CloudSync] Failed to save manifest:', err)
    }
  }

  // ── Helpers ───────────────────────────────────────────────

  private async ensureDir(path: string): Promise<void> {
    try {
      await this.fs.stat(path)
    } catch {
      // Create directory recursively
      const parts = path.split('/').filter(Boolean)
      let current = ''
      for (const part of parts) {
        current += '/' + part
        try {
          await this.fs.stat(current)
        } catch {
          try {
            await this.fs.mkdir(current)
          } catch (mkdirErr: any) {
            // Ignore EEXIST — another operation may have created the dir concurrently
            if (mkdirErr?.code !== 'EEXIST' && mkdirErr?.message !== 'EEXIST' && !String(mkdirErr).includes('EEXIST')) {
              throw mkdirErr
            }
          }
        }
      }
    }
  }

  private scheduleTokenRefresh(token: STSToken): void {
    if (this.tokenRefreshTimer) clearTimeout(this.tokenRefreshTimer)
    const expiresAt = new Date(token.expiration).getTime()
    const refreshIn = Math.max(expiresAt - Date.now() - TOKEN_REFRESH_BUFFER_MS, 5000)

    this.tokenRefreshTimer = setTimeout(async () => {
      try {
        if (!this.workspaceUuid) return
        const newToken = await fetchWorkspaceSTS(this.workspaceUuid)
        this.s3?.updateToken(newToken)
        this.scheduleTokenRefresh(newToken)
      } catch (err) {
        console.error('[CloudSync] Token refresh failed:', err)
        // Retry in 30s
        this.tokenRefreshTimer = setTimeout(() => this.scheduleTokenRefresh(token), 30_000)
      }
    }, refreshIn)
  }

  private updateStatus(status: WorkspaceSyncStatus): void {
    this._status = status
    this.onStatusChange?.(status)
  }
}

// ── Concurrency helper ──────────────────────────────────────

/**
 * Process items in parallel with a concurrency limit.
 * Like Promise.all but runs at most `concurrency` tasks at a time.
 */
async function parallelMap<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  concurrency: number,
): Promise<void> {
  if (items.length === 0) return
  const limit = Math.min(concurrency, items.length)
  let idx = 0

  async function worker() {
    while (idx < items.length) {
      const i = idx++
      await fn(items[i])
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()))
}

// Singleton
export const cloudSyncEngine = new CloudSyncEngine()

// Expose on window for E2E tests (verify-manifest, debugging)
if (typeof window !== 'undefined') {
  ;(window as any).cloudSyncEngine = cloudSyncEngine
}
