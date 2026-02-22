/**
 * File Change Tracker Plugin
 *
 * Tracks all file mutations (write, add, remove, rename) under `.cloud-workspaces/`
 * and maintains a persistent index in IndexedDB so the change log survives page reloads.
 *
 * The index maps each file path → last-modified timestamp + action type.
 * This allows the S3 sync layer to upload only changed files instead of
 * re-uploading a full workspace zip on every save/autosave.
 *
 * How tracking works:
 *   - Intercepts `remixFileSystem.writeFile`, `unlink`, and `rename` at the
 *     lowest level so ALL writes are captured, even those bypassing fileManager.
 *   - The intercepted paths are full FS paths (e.g. `.cloud-workspaces/uuid/contracts/Token.sol`),
 *     making workspace UUID extraction reliable.
 *   - Also listens to `fileManager` events as a secondary source, resolving
 *     workspace-relative paths to the current cloud workspace UUID.
 *
 * Design decisions:
 *   - Always tracks, even when the user is not logged in or cloud mode is off,
 *     because other processes (compiler, git, templates) may write files at any time.
 *   - Uses a dedicated IndexedDB object store (not the generic cache plugin)
 *     to avoid TTL expiry and to support efficient per-workspace queries.
 *   - Exposes a flush() API that returns the current batch and marks it synced,
 *     so the S3 plugin can call it on interval or on-demand.
 */

import { Plugin } from '@remixproject/engine'
import { Registry } from '@remix-project/remix-lib'

// ==================== Constants ====================

const CLOUD_WORKSPACES_ROOT = '.cloud-workspaces'

const DB_NAME = 'RemixFileChangeTracker'
const DB_VERSION = 2
const STORE_NAME = 'changes'

/** Files to ignore (meta / registry files, not user content) */
const IGNORED_FILES = new Set(['.registry.json'])

// ==================== Types ====================

export type ChangeAction = 'modified' | 'added' | 'removed' | 'renamed'

/**
 * A single tracked file change.
 * The `key` is the composite `workspaceId + '::' + path` for uniqueness.
 */
export interface FileChangeEntry {
  /** Composite key: `{workspaceId}::{relativePath}` */
  key: string
  /** UUID of the workspace under .cloud-workspaces/ */
  workspaceId: string
  /** Path relative to the workspace root (e.g. `contracts/Token.sol`) */
  path: string
  /** What happened */
  action: ChangeAction
  /** Unix timestamp (ms) of when the change was recorded */
  timestamp: number
  /** Whether this entry has been successfully synced to remote (0 = unsynced, 1 = synced). Stored as number because IndexedDB cannot index booleans. */
  synced: number
  /** For renames: the previous path */
  oldPath?: string
}

/**
 * Summary returned by `getChangesSummary()` for quick inspection.
 */
export interface ChangesSummary {
  workspaceId: string
  total: number
  unsynced: number
  byAction: Record<ChangeAction, number>
}

// ==================== Plugin Profile ====================

const profile = {
  name: 'fileChangeTracker',
  displayName: 'File Change Tracker',
  description: 'Tracks file mutations in cloud workspaces for incremental S3 sync',
  methods: [
    'getUnsynced',
    'getChangesSummary',
    'markSynced',
    'markAllSynced',
    'flush',
    'clearWorkspace',
    'clearAll',
    'getAll',
    'recordChange'
  ],
  events: ['changeRecorded', 'changesFlushed'],
  kind: 'none' as const,
  version: '1.0.0'
}

// ==================== Plugin Class ====================

export class FileChangeTrackerPlugin extends Plugin {
  private db: IDBDatabase | null = null
  private dbReady: Promise<void>
  private resolveDbReady!: () => void

  /** Whether we've already monkey-patched remixFileSystem */
  private fsIntercepted = false

  constructor() {
    super(profile)
    this.dbReady = new Promise((resolve) => {
      this.resolveDbReady = resolve
    })
    this._openDatabase()
  }

  // ==================== Lifecycle ====================

  async onActivation(): Promise<void> {
    console.log('[FileChangeTracker] Activated — listening for file events')

    // Wait for DB to be ready before setting up listeners
    await this.dbReady

    // PRIMARY: Intercept remixFileSystem at the lowest level.
    // This catches ALL writes, even those not going through fileManager.
    this._interceptFileSystem()

    // SECONDARY: Listen to fileManager events as well.
    // These emit workspace-relative paths (e.g. "contracts/Token.sol"),
    // so we need to resolve the current cloud workspace UUID.
    this.on('fileManager', 'fileChanged', (path: string) => {
      this._handleFileManagerEvent(path, 'modified')
    })

    this.on('fileManager', 'fileAdded', (path: string) => {
      this._handleFileManagerEvent(path, 'added')
    })

    this.on('fileManager', 'fileRemoved', (path: string) => {
      this._handleFileManagerEvent(path, 'removed')
    })

    this.on('fileManager', 'fileRenamed', (oldPath: string, newPath: string) => {
      this._handleFileManagerEvent(oldPath, 'removed')
      this._handleFileManagerEvent(newPath, 'added')
    })

    // Listen for workspace deletion events so we can clean up tracking data
    this.on('filePanel', 'workspaceDeleted', (workspaceName: string) => {
      // We can't easily map workspace display name → UUID here,
      // but the s3Storage plugin can call clearWorkspace() explicitly.
    })
  }

  onDeactivation(): void {
    console.log('[FileChangeTracker] Deactivated')
    this.off('fileManager', 'fileChanged')
    this.off('fileManager', 'fileAdded')
    this.off('fileManager', 'fileRemoved')
    this.off('fileManager', 'fileRenamed')
  }

  // ==================== Public API ====================

  /**
   * Get all unsynced changes for a workspace, ordered by timestamp.
   * This is the primary method the S3 sync layer calls before uploading.
   *
   * @param workspaceId - UUID of the cloud workspace
   * @returns Array of unsynced file change entries
   */
  async getUnsynced(workspaceId: string): Promise<FileChangeEntry[]> {
    await this.dbReady
    return this._queryByWorkspace(workspaceId, false)
  }

  /**
   * Get a summary of changes for a workspace (counts by action, synced vs unsynced).
   */
  async getChangesSummary(workspaceId: string): Promise<ChangesSummary> {
    await this.dbReady
    const all = await this._queryByWorkspace(workspaceId)
    const unsynced = all.filter(e => e.synced === 0)

    const byAction: Record<ChangeAction, number> = {
      modified: 0,
      added: 0,
      removed: 0,
      renamed: 0
    }
    for (const entry of unsynced) {
      byAction[entry.action] = (byAction[entry.action] || 0) + 1
    }

    return {
      workspaceId,
      total: all.length,
      unsynced: unsynced.length,
      byAction
    }
  }

  /**
   * Mark specific file paths as synced for a workspace.
   * Call this after successfully uploading the files to S3.
   *
   * @param workspaceId - UUID of the cloud workspace
   * @param paths - Array of relative file paths that were synced
   */
  async markSynced(workspaceId: string, paths: string[]): Promise<void> {
    await this.dbReady
    const store = this._getStore('readwrite')
    const pathSet = new Set(paths)

    return new Promise((resolve, reject) => {
      const index = store.index('workspaceId')
      const request = index.openCursor(IDBKeyRange.only(workspaceId))

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
        if (!cursor) {
          resolve()
          return
        }

        const entry = cursor.value as FileChangeEntry
        if (pathSet.has(entry.path) && entry.synced === 0) {
          entry.synced = 1
          cursor.update(entry)
        }
        cursor.continue()
      }

      request.onerror = () => reject(new Error('Failed to mark entries as synced'))
    })
  }

  /**
   * Mark ALL unsynced changes for a workspace as synced.
   * Use this after a full workspace upload (e.g. manual backup).
   */
  async markAllSynced(workspaceId: string): Promise<void> {
    await this.dbReady
    const store = this._getStore('readwrite')

    return new Promise((resolve, reject) => {
      const index = store.index('workspaceId')
      const request = index.openCursor(IDBKeyRange.only(workspaceId))

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
        if (!cursor) {
          resolve()
          return
        }

        const entry = cursor.value as FileChangeEntry
        if (entry.synced === 0) {
          entry.synced = 1
          cursor.update(entry)
        }
        cursor.continue()
      }

      request.onerror = () => reject(new Error('Failed to mark all entries as synced'))
    })
  }

  /**
   * Flush unsynced changes for a workspace: returns the entries and marks them synced.
   * This is the atomic "get + mark" operation the S3 sync layer should use.
   *
   * @param workspaceId - UUID of the cloud workspace
   * @returns Array of file change entries that were flushed
   */
  async flush(workspaceId: string): Promise<FileChangeEntry[]> {
    await this.dbReady
    const unsynced = await this._queryByWorkspace(workspaceId, false)

    if (unsynced.length === 0) return []

    // Mark them all synced
    const paths = unsynced.map(e => e.path)
    await this.markSynced(workspaceId, paths)

    this.emit('changesFlushed', { workspaceId, count: unsynced.length })
    return unsynced
  }

  /**
   * Remove all tracked changes for a workspace (e.g. after workspace deletion).
   */
  async clearWorkspace(workspaceId: string): Promise<void> {
    await this.dbReady
    const store = this._getStore('readwrite')

    return new Promise((resolve, reject) => {
      const index = store.index('workspaceId')
      const request = index.openCursor(IDBKeyRange.only(workspaceId))

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
        if (!cursor) {
          resolve()
          return
        }
        cursor.delete()
        cursor.continue()
      }

      request.onerror = () => reject(new Error('Failed to clear workspace changes'))
    })
  }

  /**
   * Remove all tracked changes across all workspaces.
   */
  async clearAll(): Promise<void> {
    await this.dbReady
    const store = this._getStore('readwrite')

    return new Promise((resolve, reject) => {
      const request = store.clear()
      request.onsuccess = () => resolve()
      request.onerror = () => reject(new Error('Failed to clear all changes'))
    })
  }

  /**
   * Get all changes for a workspace (both synced and unsynced).
   * Useful for debugging / inspection.
   */
  async getAll(workspaceId: string): Promise<FileChangeEntry[]> {
    await this.dbReady
    return this._queryByWorkspace(workspaceId)
  }

  /**
   * Manually record a change. Useful for plugins that write directly
   * to the filesystem and want to ensure tracking.
   */
  async recordChange(workspaceId: string, path: string, action: ChangeAction): Promise<void> {
    await this.dbReady
    await this._putEntry(workspaceId, path, action)
  }

  // ==================== Internal: FS Interception ====================

  /**
   * Monkey-patch `window.remixFileSystem` to intercept all writes at the
   * lowest level. This is the most reliable approach because:
   *   - fileProvider.set() → remixFileSystem.writeFile()
   *   - fileProvider.remove() → remixFileSystem.unlink()
   *   - fileProvider.rename() → remixFileSystem.rename()
   *   - Direct FS writes from any plugin also go through remixFileSystem
   *
   * The intercepted paths are absolute FS paths (e.g. `/.cloud-workspaces/uuid/contracts/Token.sol`)
   * which makes workspace UUID extraction trivial and reliable.
   */
  private _interceptFileSystem(): void {
    if (this.fsIntercepted) return

    const fs = (window as any).remixFileSystem
    if (!fs) {
      console.warn('[FileChangeTracker] remixFileSystem not available — FS interception disabled')
      return
    }

    const self = this

    // --- Intercept writeFile ---
    const originalWriteFile = fs.writeFile.bind(fs)
    fs.writeFile = async function (...args: any[]) {
      const result = await originalWriteFile(...args)
      const path = args[0] as string
      self._handleFsWrite(path, 'modified')
      return result
    }

    // --- Intercept unlink (used for both file and directory removal) ---
    const originalUnlink = fs.unlink.bind(fs)
    fs.unlink = async function (...args: any[]) {
      const result = await originalUnlink(...args)
      const path = args[0] as string
      self._handleFsWrite(path, 'removed')
      return result
    }

    // --- Intercept rename ---
    const originalRename = fs.rename.bind(fs)
    fs.rename = async function (...args: any[]) {
      const result = await originalRename(...args)
      const oldPath = args[0] as string
      const newPath = args[1] as string
      self._handleFsWrite(oldPath, 'removed')
      self._handleFsWrite(newPath, 'added')
      return result
    }

    // --- Intercept mkdir (track new directories as structural changes) ---
    const originalMkdir = fs.mkdir.bind(fs)
    fs.mkdir = async function (...args: any[]) {
      const result = await originalMkdir(...args)
      // We don't track directory creation itself — only file content matters for sync
      return result
    }

    this.fsIntercepted = true
    console.log('[FileChangeTracker] remixFileSystem intercepted — all writes are tracked')
  }

  /**
   * Handle a write from remixFileSystem interception.
   * The path is an absolute FS path like `/.cloud-workspaces/uuid/contracts/Token.sol`.
   */
  private _handleFsWrite(fsPath: string, action: ChangeAction): void {
    const parsed = this._parseCloudPath(fsPath)
    if (!parsed) return

    // Fire-and-forget — don't await to avoid slowing down FS operations
    this._putEntry(parsed.workspaceId, parsed.relativePath, action).catch(e => {
      console.warn('[FileChangeTracker] Failed to record FS change:', fsPath, e)
    })
  }

  // ==================== Internal: fileManager Event Handling ====================

  /**
   * Handle a fileManager event.
   * fileManager events emit workspace-relative paths (e.g. "contracts/Token.sol"),
   * so we need to resolve the current workspace UUID from the workspace file provider.
   *
   * This is a secondary tracking source — the FS interception is primary.
   * The _putEntry call is idempotent (same key = upsert), so duplicates don't matter.
   */
  private async _handleFileManagerEvent(path: string, action: ChangeAction): Promise<void> {
    // First try to parse as a full cloud path (some events may include the full path)
    const parsed = this._parseCloudPath(path)
    if (parsed) {
      try {
        await this._putEntry(parsed.workspaceId, parsed.relativePath, action)
      } catch (e) {
        console.warn('[FileChangeTracker] Failed to record change:', path, e)
      }
      return
    }

    // If it's a relative path, resolve the current workspace UUID
    const workspaceId = this._getCurrentCloudWorkspaceId()
    if (!workspaceId) return // Not in a cloud workspace

    // Strip any leading slash from the relative path
    const relativePath = path.replace(/^\/+/, '')
    if (!relativePath) return

    // Skip meta files
    if (IGNORED_FILES.has(relativePath)) return

    try {
      await this._putEntry(workspaceId, relativePath, action)
    } catch (e) {
      console.warn('[FileChangeTracker] Failed to record change:', path, e)
    }
  }

  /**
   * Get the UUID of the currently active cloud workspace.
   * Returns null if cloud mode is off or no workspace is active.
   */
  private _getCurrentCloudWorkspaceId(): string | null {
    try {
      // Check cloud mode via Registry
      const cloudState = Registry.getInstance().get('cloudState')
      if (!cloudState?.api?.active) return null

      // Get the workspace file provider's workspaceId
      const fileProviders = Registry.getInstance().get('fileproviders')
      if (!fileProviders?.api?.workspace) return null

      const wsProvider = fileProviders.api.workspace
      return wsProvider.getWorkspaceId?.() || null
    } catch (e) {
      return null
    }
  }

  // ==================== Internal: Path Parsing ====================

  /**
   * Parse a full file path to extract the workspace UUID and relative path.
   * Returns null if the path is not under .cloud-workspaces/.
   *
   * Handles these formats:
   *   - `/.cloud-workspaces/abc-123/contracts/Token.sol`  (absolute FS path)
   *   - `.cloud-workspaces/abc-123/contracts/Token.sol`   (no leading /)
   *   - `/abc-123/contracts/Token.sol` when inside .cloud-workspaces context
   *
   * Returns null for:
   *   - `.workspaces/default/foo.sol` (legacy workspace)
   *   - `contracts/Token.sol` (relative workspace path — needs UUID resolution)
   */
  private _parseCloudPath(fullPath: string): { workspaceId: string; relativePath: string } | null {
    // Normalize: remove leading slash
    let normalized = fullPath.replace(/^\/+/, '')

    if (!normalized.startsWith(CLOUD_WORKSPACES_ROOT)) {
      return null
    }

    // Strip the root prefix: ".cloud-workspaces/"
    const rest = normalized.substring(CLOUD_WORKSPACES_ROOT.length + 1) // +1 for /
    if (!rest) return null

    const slashIdx = rest.indexOf('/')
    if (slashIdx === -1) {
      // It's the workspace directory itself, not a file inside it
      return null
    }

    const workspaceId = rest.substring(0, slashIdx)
    const relativePath = rest.substring(slashIdx + 1)

    if (!workspaceId || !relativePath) return null

    // Skip meta files at workspace root
    if (IGNORED_FILES.has(relativePath)) return null

    return { workspaceId, relativePath }
  }

  // ==================== Internal: IndexedDB Operations ====================

  /**
   * Open (or create) the IndexedDB database.
   */
  private _openDatabase(): void {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = (event) => {
        console.error('[FileChangeTracker] Failed to open IndexedDB:', event)
        // Resolve anyway so the plugin doesn't hang — it'll just not persist
        this.resolveDbReady()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        // v2 migration: synced field changed from boolean → number (0/1)
        // because IndexedDB cannot use booleans as index keys.
        // Easiest fix: drop and recreate the store (this is a cache, not user data).
        if (db.objectStoreNames.contains(STORE_NAME)) {
          db.deleteObjectStore(STORE_NAME)
        }

        const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' })
        // Index by workspaceId for efficient per-workspace queries
        store.createIndex('workspaceId', 'workspaceId', { unique: false })
        // Index by synced flag (0 = unsynced, 1 = synced) for quick filtering
        store.createIndex('synced', 'synced', { unique: false })
        // Compound index for workspace + synced (both are valid IDB key types: string + number)
        store.createIndex('workspaceId_synced', ['workspaceId', 'synced'], { unique: false })
        // Index by timestamp for ordering
        store.createIndex('timestamp', 'timestamp', { unique: false })
      }

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result
        console.log('[FileChangeTracker] IndexedDB ready')
        this.resolveDbReady()
      }
    } catch (e) {
      console.error('[FileChangeTracker] IndexedDB not available:', e)
      this.resolveDbReady()
    }
  }

  /**
   * Get an object store from the database.
   */
  private _getStore(mode: IDBTransactionMode = 'readonly'): IDBObjectStore {
    if (!this.db) {
      throw new Error('IndexedDB not available')
    }
    const tx = this.db.transaction([STORE_NAME], mode)
    return tx.objectStore(STORE_NAME)
  }

  /**
   * Insert or update a change entry.
   * Uses upsert semantics: if an entry for the same workspace+path already exists,
   * the timestamp and action are updated and synced is reset to false.
   * This means "latest write wins" — which is exactly what we want for sync.
   */
  private async _putEntry(
    workspaceId: string,
    path: string,
    action: ChangeAction,
    oldPath?: string
  ): Promise<void> {
    if (!this.db) return

    const key = `${workspaceId}::${path}`
    const entry: FileChangeEntry = {
      key,
      workspaceId,
      path,
      action,
      timestamp: Date.now(),
      synced: 0,
      ...(oldPath ? { oldPath } : {})
    }

    return new Promise((resolve, reject) => {
      try {
        const store = this._getStore('readwrite')
        const request = store.put(entry)

        request.onsuccess = () => {
          this.emit('changeRecorded', { workspaceId, path, action, timestamp: entry.timestamp })
          resolve()
        }

        request.onerror = () => {
          console.warn('[FileChangeTracker] Failed to write entry:', key)
          reject(new Error(`Failed to write entry: ${key}`))
        }
      } catch (e) {
        reject(e)
      }
    })
  }

  /**
   * Query all entries for a workspace, optionally filtering by synced status.
   * Results are sorted by timestamp (oldest first).
   */
  private async _queryByWorkspace(
    workspaceId: string,
    syncedFilter?: boolean
  ): Promise<FileChangeEntry[]> {
    if (!this.db) return []

    return new Promise((resolve, reject) => {
      try {
        const store = this._getStore('readonly')
        let request: IDBRequest

        if (syncedFilter !== undefined) {
          // Use composite index for workspace + synced
          // Convert boolean API → numeric key (IndexedDB cannot index booleans)
          const index = store.index('workspaceId_synced')
          request = index.getAll(IDBKeyRange.only([workspaceId, syncedFilter ? 1 : 0]))
        } else {
          // Use workspace index for all entries
          const index = store.index('workspaceId')
          request = index.getAll(IDBKeyRange.only(workspaceId))
        }

        request.onsuccess = () => {
          const entries = (request.result as FileChangeEntry[]) || []
          // Sort by timestamp ascending
          entries.sort((a, b) => a.timestamp - b.timestamp)
          resolve(entries)
        }

        request.onerror = () => reject(new Error('Failed to query changes'))
      } catch (e) {
        reject(e)
      }
    })
  }
}
