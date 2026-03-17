/**
 * Cloud Workspace Actions
 *
 * Orchestrates cloud workspace operations using the CloudWorkspaceFileProvider.
 *
 * The provider handles the name↔UUID translation internally.
 * These actions handle:
 *   - Provider swap (enter/exit cloud mode)
 *   - Cloud API calls (rename, delete, refresh)
 *   - Sync engine activation
 *   - File change tracking
 */

import { cloudSyncEngine, CloudSyncEngine } from './cloud-sync-engine'
import { cloudStore } from './cloud-store'
import {
  createCloudWorkspace as apiCreate,
  updateCloudWorkspace as apiUpdate,
  deleteCloudWorkspace as apiDelete,
  listCloudWorkspaces as apiList,
  fetchSTSToken,
  fetchWorkspaceSTS,
} from './cloud-workspace-api'
import { WorkspaceLockedError } from './cloud-workspace-lock'
import { CloudWorkspace, WorkspaceSyncStatus } from './types'
import { S3Client } from './s3-client'
import JSZip from 'jszip'
import {
  setCurrentWorkspace,
  setMode,
  setReadOnlyMode,
  setWorkspaces,
} from '../actions/payload'
import { createWorkspace, getWorkspaces, fetchWorkspaceDirectory } from '../actions/workspace'
import {
  enableCloudFSObserver,
  disableCloudFSObserver,
  onCloudFSWrite,
  clearCloudFSListeners,
  extractCloudWorkspaceUuid,
  extractRelativePath,
  FSWriteOperation,
} from './cloud-fs-observer'
// eslint-disable-next-line @nrwl/nx/enforce-module-boundaries
import CloudWorkspaceFileProvider from '../../../../../../apps/remix-ide/src/app/files/cloudWorkspaceFileProvider'

// ── Plugin References ────────────────────────────────────────

let _plugin: any = null
let _dispatch: React.Dispatch<any> = null
let _fsObserverUnsub: (() => void) | null = null // FS observer subscription
let _fileOpenListenerActive = false // whether we're listening to currentFileChanged

/** Debounce timer for file explorer refresh triggered by raw FS writes */
let _refreshTimer: ReturnType<typeof setTimeout> | null = null
const REFRESH_DEBOUNCE_MS = 600

/**
 * Debounce timer for proactive version check on first user write.
 * When the user starts typing after being away, we check the remote
 * version once (debounced) to catch conflicts early — before the
 * next flush cycle tries to push and gets a 409.
 */
let _versionCheckTimer: ReturnType<typeof setTimeout> | null = null
const VERSION_CHECK_DEBOUNCE_MS = 2_000 // 2s after first write activity

/**
 * Build a user-scoped localStorage key.
 * E.g. cloudLocalKey('lastCloudWorkspace') → 'lastCloudWorkspace_user_42'
 * Falls back to the unscoped key if no userId is available yet.
 */
export function cloudLocalKey(key: string): string {
  const uid = cloudStore.userId
  return uid ? `${key}_user_${uid}` : key
}

/**
 * Callback registered by workspace.ts to create a default workspace with
 * template files.  This avoids a circular import — cloud-workspace-actions
 * can't import createWorkspace directly.
 */
let _createDefaultWorkspaceFn: ((name: string, template: string) => Promise<void>) | null = null

export function setCreateDefaultCloudWorkspaceFn(fn: (name: string, template: string) => Promise<void>) {
  _createDefaultWorkspaceFn = fn
}

export function setCloudPlugin(plugin: any, dispatch: React.Dispatch<any>) {
  _plugin = plugin
  _dispatch = dispatch
}

// ── Provider Swap ────────────────────────────────────────────

/**
 * Enter cloud mode: create a CloudWorkspaceFileProvider and activate it
 * on the workspace provider proxy.
 *
 * The proxy (installed once at app boot) never changes identity — only its
 * internal delegate switches.  This means every consumer that already holds
 * a reference to `fileProviders.workspace` automatically gets the new
 * behaviour without any race conditions.
 *
 * @returns The CloudWorkspaceFileProvider instance
 */
export function enterCloudProvider(workspaces: CloudWorkspace[]): CloudWorkspaceFileProvider {
  if (!_plugin) throw new Error('Cloud plugin not initialized')

  const proxy = _plugin.fileProviders.workspace

  // Create cloud provider
  const cloudProvider = new CloudWorkspaceFileProvider()

  // Populate name↔UUID mappings
  cloudProvider.setWorkspaceMappings(workspaces)

  // Inject the API create function so createWorkspace can auto-register
  cloudProvider.setApiCreate(apiCreate)

  // Activate on the proxy — atomically routes all I/O to the cloud provider.
  // The proxy also pins the EventManager so fileManager subscriptions survive.
  proxy.setCloudProvider(cloudProvider)

  // ── Enable FS observer for raw write detection ──────────
  enableCloudFSObserver()
  _fsObserverUnsub = onCloudFSWrite((op: FSWriteOperation) => {
    handleRawFSWrite(op, cloudProvider)
  })

  // ── Listen to file open events for proactive version checks ──
  if (!_fileOpenListenerActive) {
    _plugin.on('fileManager', 'currentFileChanged', _onCurrentFileChanged)
    _fileOpenListenerActive = true
  }

  return cloudProvider
}

/**
 * Exit cloud mode: tell the proxy to route I/O back to the local provider.
 *
 * No object references are swapped — the proxy's identity stays the same.
 */
export function exitCloudProvider(): void {
  if (!_plugin) return

  // Disable FS observer and clean up subscription
  if (_fsObserverUnsub) {
    _fsObserverUnsub()
    _fsObserverUnsub = null
  }
  clearCloudFSListeners()
  disableCloudFSObserver()
  if (_refreshTimer) {
    clearTimeout(_refreshTimer)
    _refreshTimer = null
  }
  if (_versionCheckTimer) {
    clearTimeout(_versionCheckTimer)
    _versionCheckTimer = null
  }

  // Remove fileManager listener
  if (_fileOpenListenerActive && _plugin) {
    try {
      _plugin.off('fileManager', 'currentFileChanged')
    } catch { /* plugin may already be gone */ }
    _fileOpenListenerActive = false
  }

  // Deactivate cloud — atomically routes all I/O back to the local provider.
  const proxy = _plugin.fileProviders.workspace
  proxy.clearCloudProvider()
}

// ── Cloud Toggle ─────────────────────────────────────────────

/**
 * Enable cloud mode for an already-authenticated user.
 *
 * Fetches workspaces + STS token, swaps the provider, enters cloud mode,
 * and switches to the last-active (or first) cloud workspace.
 */
export async function enableCloud(): Promise<void> {
  console.log('[enableCloud] called, isCloudMode=', cloudStore.isCloudMode, 'stack=', new Error().stack?.split('\n').slice(1, 4).join(' | '))
  if (!_plugin) throw new Error('Cloud plugin not initialized')
  if (cloudStore.isCloudMode) { console.log('[enableCloud] already in cloud mode — returning early'); return }

  // Remember the current local workspace so we can restore it on disable
  const currentLocal = localStorage.getItem('currentWorkspace')
  if (currentLocal) localStorage.setItem('lastLocalWorkspace', currentLocal)
  // Note: lastLocalWorkspace is NOT user-scoped because it stores which
  // local (legacy) workspace to return to — that's independent of cloud user.

  cloudStore.setLoading(true)
  try {
    // Close all files BEFORE swapping the provider — tab-proxy builds tab
    // names from the current workspace, so files opened under the local
    // workspace name must be closed while the local provider is still active.
    await _plugin.fileManager.closeAllFiles()

    const [workspaces, stsToken] = await Promise.all([
      apiList(),
      fetchSTSToken(),
    ])

    enterCloudProvider(workspaces)
    cloudStore.enterCloudMode(workspaces, stsToken)

    if (workspaces.length > 0) {
      const lastCloudName = localStorage.getItem(cloudLocalKey('lastCloudWorkspace'))
      const targetWs = workspaces.find(w => w.name === lastCloudName) || workspaces[0]
      console.log('[enableCloud] switching to cloud workspace:', targetWs.name, 'uuid=', targetWs.uuid)
      try {
        await switchToCloudWorkspace(targetWs, (status) => {
          cloudStore.updateSyncStatus(targetWs.uuid, status)
        })
        cloudStore.setActiveCloudWorkspace(targetWs.uuid)
        const workspaceProvider = _plugin.fileProviders?.workspace
        if (workspaceProvider) {
          startFileChangeTracking(workspaceProvider, targetWs.uuid)
        }
        // Dispatch Redux state so the workspace panel UI updates
        _dispatch(setMode('browser'))
        _dispatch(setCurrentWorkspace({ name: targetWs.name, isGitRepo: false }))
        _dispatch(setReadOnlyMode(false))
        localStorage.setItem(cloudLocalKey('lastCloudWorkspace'), targetWs.name)
      } catch (err) {
        console.error('[enableCloud] Failed to switch to cloud workspace:', err)
      }
    } else {
      // No cloud workspaces yet — create a default one.
      cloudStore.setLoading(false)
      if (_createDefaultWorkspaceFn) {
        try {
          await _createDefaultWorkspaceFn('cloud workspace', 'remixDefault')
        } catch (err) {
          console.error('[enableCloud] Failed to create default cloud workspace:', err)
        }
      } else {
        console.error('[enableCloud] _createDefaultWorkspaceFn not registered — cannot create default workspace')
      }
    }
  } catch (err) {
    console.error('[enableCloud] Failed to enable cloud:', err)
    cloudStore.setError(err.message)
    cloudStore.setLoading(false)
    throw err
  }
}

/**
 * Disable cloud mode without logging out.
 *
 * Deactivates sync, restores the original provider, updates the store,
 * and switches back to a legacy workspace.
 */
export async function disableCloud(): Promise<void> {
  if (!_plugin) throw new Error('Cloud plugin not initialized')
  if (!cloudStore.isCloudMode) { console.log('[disableCloud] already off, skipping'); return }

  console.log('[disableCloud] starting...')

  // Remember the current cloud workspace for when the user re-enables
  const activeId = cloudStore.getState().activeWorkspaceId
  const activeWs = cloudStore.getState().cloudWorkspaces.find(w => w.uuid === activeId)
  if (activeWs) localStorage.setItem(cloudLocalKey('lastCloudWorkspace'), activeWs.name)

  const proxy = _plugin.fileProviders.workspace

  // 1. Close all files BEFORE switching the provider delegate — tab names
  //    are resolved via the current workspace, so close while cloud is active.
  await _plugin.fileManager.closeAllFiles()

  // 2. Deactivate sync engine (flush completes before tearing down)
  await cloudSyncEngine.deactivate()

  // 3. Switch the proxy's delegate back to the local provider.
  //    From this point, ALL I/O routes through the local WorkspaceFileProvider.
  //    The proxy's identity is unchanged — no stale references anywhere.
  exitCloudProvider()

  // 4. Update store — keeps isAuthenticated = true
  cloudStore.disableCloud()

  // 5. Switch to the last used local workspace
  try {
    const lastLocal = localStorage.getItem('lastLocalWorkspace') || localStorage.getItem('currentWorkspace')

    let targetLocal = lastLocal
    if (targetLocal) {
      try {
        await (window as any).remixFileSystem.stat(`/.workspaces/${targetLocal}`)
      } catch {
        targetLocal = null
      }
    }

    // Scan for any existing workspace if the saved one is gone
    if (!targetLocal) {
      try {
        const entries = await (window as any).remixFileSystem.readdir('/.workspaces')
        for (const e of entries) {
          try {
            const s = await (window as any).remixFileSystem.stat(`/.workspaces/${e}`)
            if (s.isDirectory()) { targetLocal = e; break }
          } catch { /* skip */ }
        }
      } catch { /* /.workspaces may not exist */ }
    }

    if (targetLocal) {
      proxy.setWorkspace(targetLocal)
      await _plugin.setWorkspace({ name: targetLocal, isLocalhost: false })
      _dispatch(setMode('browser'))
      _dispatch(setCurrentWorkspace({ name: targetLocal, isGitRepo: false }))
      _dispatch(setReadOnlyMode(false))
    } else {
      // No local workspaces at all — create a default one
      _plugin.call('notification', 'toast', 'No local workspace found — creating default workspace…')
      await createWorkspace('default_workspace', 'remixDefault')
    }

    // 6. Refresh workspace list and file tree with local data
    const localWorkspaces = await getWorkspaces()
    if (localWorkspaces) {
      await _plugin.setWorkspaces(localWorkspaces)
      _dispatch(setWorkspaces(localWorkspaces))
    }
    await fetchWorkspaceDirectory('/')
  } catch (err) {
    console.error('[disableCloud] Failed to switch to local workspace:', err)
  }
}

/**
 * Get the current workspace provider (may be cloud or legacy).
 */
export function getWorkspaceProvider(): any {
  return _plugin?.fileProviders?.workspace
}

/**
 * Check if the workspace provider proxy is currently in cloud mode.
 */
export function isCloudProvider(): boolean {
  return _plugin?.fileProviders?.workspace?.isCloudActive === true
}

// ── Cloud Workspace Operations ───────────────────────────────

/**
 * Switch to a cloud workspace by display name.
 *
 * 1. Sets workspace in the provider (name → UUID internally)
 * 2. Ensures the local directory exists
 * 3. Activates sync engine → pulls files from S3
 */
export async function switchToCloudWorkspace(
  cloudWorkspace: CloudWorkspace,
  onSyncStatus?: (status: WorkspaceSyncStatus) => void,
): Promise<void> {
  console.log('[switchToCloudWorkspace] called for', cloudWorkspace.name, 'uuid=', cloudWorkspace.uuid, 'stack=', new Error().stack?.split('\n').slice(1, 4).join(' | '))
  if (!_plugin) throw new Error('Cloud plugin not initialized')

  const provider = _plugin.fileProviders.workspace

  await _plugin.fileManager.closeAllFiles()

  // Set workspace — provider translates display name → UUID
  provider.setWorkspace(cloudWorkspace.name)

  // Ensure local cloud workspace directory exists
  const uuid = provider.resolveDisplayName?.(cloudWorkspace.name) || cloudWorkspace.uuid
  const wsPath = `/${provider.workspacesPath}/${uuid}`
  const fs = (window as any).remixFileSystem
  try {
    await fs.stat(wsPath)
  } catch {
    await provider.createWorkspace(cloudWorkspace.name)
  }

  // Broadcast display name to other plugins
  await _plugin.setWorkspace({ name: cloudWorkspace.name, isLocalhost: false })

  // Signal loading state before pull
  onSyncStatus?.({ status: 'loading', lastSync: null, pendingChanges: 0 })

  try {
    // Activate sync engine and pull from S3
    // acquireLock() inside activate() will throw WorkspaceLockedError if
    // another device/tab already holds the lock.
    await cloudSyncEngine.activate(uuid, onSyncStatus, async () => {
      // Called when a version conflict is detected — close all editor tabs
      // so Remix autosave stops writing stale content, and notify the user.
      try {
        await _plugin.fileManager.closeAllFiles()
      } catch (err) {
        console.warn('[CloudSync:version] Failed to close editors:', err)
      }
      _plugin.call('notification', 'toast', 'Workspace updated on another device — pulling latest changes…')
    }, async () => {
      // Non-blocking prompt: remote _git.zip changed, ask user if they want to
      // replace their local .git with the remote version.  This callback is
      // fired as fire-and-forget from the sync engine, so the modal doesn't
      // block the sync flow.
      const result = await _plugin.call('notification', 'modal', {
        id: 'cloud-git-conflict',
        title: 'Git History Updated',
        message: 'The git history for this workspace was updated on another device. Do you want to replace your local git history with the remote version?',
        okLabel: 'Replace with Remote',
        cancelLabel: 'Keep Local',
      })
      if (result) {
        _plugin.call('notification', 'toast', 'Updating git history from remote…')
        await cloudSyncEngine.pullGitSnapshot(true)
        _plugin.call('notification', 'toast', 'Git history updated from remote.')
      }
    }, (message: string) => {
      _plugin.call('notification', 'toast', message)
    }, async (reason: 'stolen' | 'expired' | 'error') => {
      // Lock lost — close the cloud workspace and switch back to legacy.
      const reasonText = reason === 'stolen'
        ? 'Another device opened this workspace.'
        : reason === 'expired'
          ? 'The workspace lock expired.'
          : 'Lost connection to the workspace lock server.'
      console.warn(`[CloudSync:lock] Lock lost (${reason}) — disabling cloud`)
      _plugin.call('notification', 'modal', {
        id: 'cloud-lock-lost',
        title: 'Workspace Closed',
        message: `${reasonText} The workspace has been closed to prevent conflicts. Any unsaved changes have been preserved locally.`,
        okLabel: 'OK',
      })
      try {
        await disableCloud()
      } catch (err) {
        console.error('[CloudSync:lock] disableCloud after lock loss failed:', err)
      }
    })
  } catch (err) {
    if (err instanceof WorkspaceLockedError) {
      // Workspace is locked by another device — offer to take over
      console.warn(`[CloudSync:lock] Workspace locked by ${err.holder} (ttl=${err.ttlRemaining}s) — asking user`, 'stack=', new Error().stack?.split('\n').slice(1, 6).join(' | '))
      onSyncStatus?.({ status: 'error', lastSync: null, pendingChanges: 0, error: 'Workspace is in use on another device' })
      const takeOver = await _plugin.call('notification', 'modal', {
        id: 'cloud-workspace-locked',
        title: 'Workspace In Use',
        message: 'This workspace is currently open on another device or browser tab. Do you want to take over? The other session will be closed.',
        okLabel: 'Take Over',
        cancelLabel: 'Cancel',
      })
      if (takeOver) {
        // Force-acquire the lock — the old holder's heartbeat will get
        // 409 "stolen" and trigger its onLockLost → disableCloud.
        onSyncStatus?.({ status: 'loading', lastSync: null, pendingChanges: 0 })
        await cloudSyncEngine.activate(uuid, onSyncStatus, async () => {
          try { await _plugin.fileManager.closeAllFiles() } catch (e) { /* */ }
          _plugin.call('notification', 'toast', 'Workspace updated on another device — pulling latest changes…')
        }, async () => {
          const result = await _plugin.call('notification', 'modal', {
            id: 'cloud-git-conflict',
            title: 'Git History Updated',
            message: 'The git history for this workspace was updated on another device. Do you want to replace your local git history with the remote version?',
            okLabel: 'Replace with Remote',
            cancelLabel: 'Keep Local',
          })
          if (result) {
            _plugin.call('notification', 'toast', 'Updating git history from remote…')
            await cloudSyncEngine.pullGitSnapshot(true)
            _plugin.call('notification', 'toast', 'Git history updated from remote.')
          }
        }, (message: string) => {
          _plugin.call('notification', 'toast', message)
        }, async (reason: 'stolen' | 'expired' | 'error') => {
          const reasonText = reason === 'stolen'
            ? 'Another device opened this workspace.'
            : reason === 'expired'
              ? 'The workspace lock expired.'
              : 'Lost connection to the workspace lock server.'
          console.warn(`[CloudSync:lock] Lock lost (${reason}) — disabling cloud`)
          _plugin.call('notification', 'modal', {
            id: 'cloud-lock-lost',
            title: 'Workspace Closed',
            message: `${reasonText} The workspace has been closed to prevent conflicts. Any unsaved changes have been preserved locally.`,
            okLabel: 'OK',
          })
          try { await disableCloud() } catch (e) { console.error('[CloudSync:lock] disableCloud after lock loss failed:', e) }
        }, true /* forceLock */)
        // Fall through to the pull logic below
      } else {
        // User cancelled — switch back to a legacy workspace
        try {
          await disableCloud()
        } catch (disableErr) {
          console.error('[CloudSync:lock] disableCloud after lock denied failed:', disableErr)
        }
        return
      }
    } else {
      throw err // re-throw non-lock errors
    }
  }

  // Capture the git ETag BEFORE the initial pull — it will be null on fresh
  // activate.  After pullWorkspace() the engine will have the remote ETag.
  // Comparing them lets us detect that the remote _git.zip has changed since
  // this device last synced (i.e. another device pushed a new commit).
  const gitEtagBeforePull = cloudSyncEngine.lastGitZipEtag

  await cloudSyncEngine.pullWorkspace()

  // Restore .git from S3 if the local copy is missing (fresh device, cleared storage)
  await cloudSyncEngine.pullGitSnapshot()

  // If the remote _git.zip changed compared to what we knew before the pull,
  // AND pullGitSnapshot skipped (because local .git/ already exists), then
  // the user has a stale local .git/.  Prompt them about it.
  const gitEtagAfterPull = cloudSyncEngine.lastGitZipEtag
  if (gitEtagBeforePull !== gitEtagAfterPull && gitEtagAfterPull) {
    cloudSyncEngine.notifyIfGitZipChanged(gitEtagBeforePull)
  }
}

/**
 * Rename a cloud workspace.
 * Only the API name is changed + the provider's mapping is updated.
 * No local FS rename needed (directory stays as UUID).
 */
export async function renameCloudWorkspaceAction(
  cloudWorkspace: CloudWorkspace,
  newName: string,
): Promise<CloudWorkspace> {
  if (!_plugin) throw new Error('Cloud plugin not initialized')

  const updated = await apiUpdate(cloudWorkspace.uuid, { name: newName })

  // Update the provider's name↔UUID mapping
  const provider = _plugin.fileProviders.workspace
  if (provider.renameWorkspaceMapping) {
    provider.renameWorkspaceMapping(cloudWorkspace.name, newName)
  }

  return updated
}

/**
 * Delete a cloud workspace.
 *
 * 1. Deactivates sync if active
 * 2. Deletes on the API
 * 3. Removes the local directory
 * 4. Removes from provider mapping
 */
export async function deleteCloudWorkspaceAction(cloudWorkspace: CloudWorkspace): Promise<void> {
  if (!_plugin) throw new Error('Cloud plugin not initialized')

  // Stop sync if this workspace is active
  if (cloudSyncEngine.isActive) {
    await cloudSyncEngine.deactivate()
  }

  // Delete on API
  await apiDelete(cloudWorkspace.uuid)

  // Remove local directory
  await _plugin.fileManager.closeAllFiles()
  const provider = _plugin.fileProviders.workspace
  const localPath = provider.workspacesPath + '/' + cloudWorkspace.uuid
  try {
    await _plugin.fileProviders.browser.remove(localPath)
  } catch {
    // Directory may not exist locally — that's fine
  }

  // Remove from provider mapping
  if (provider.removeWorkspaceMapping) {
    provider.removeWorkspaceMapping(cloudWorkspace.name)
  }
}

/**
 * Refresh the cloud workspace list from the API, update provider mappings,
 * and update the reactive cloud store so the UI re-renders.
 */
export async function refreshCloudWorkspaces(): Promise<CloudWorkspace[]> {
  const workspaces = await apiList()
  const provider = _plugin?.fileProviders?.workspace
  if (provider?.setWorkspaceMappings) {
    provider.setWorkspaceMappings(workspaces)
  }
  // Update the reactive store so dropdown / UI picks up new workspaces
  cloudStore.setCloudWorkspaces(workspaces)
  return workspaces
}

// ── File Change Tracking ─────────────────────────────────────

/** Stores the cleanup function from the previous startFileChangeTracking call */
let _cleanupTracking: (() => void) | null = null

/**
 * Hook into workspace file provider events to track changes for sync.
 * Automatically cleans up listeners from any previous call.
 *
 * @param workspaceProvider  The workspace file provider
 * @param workspaceUuid      The UUID of the current cloud workspace
 * @returns Cleanup function to remove all listeners
 */
export function startFileChangeTracking(workspaceProvider: any, workspaceUuid: string): () => void {
  // Clean up previous listeners first
  if (_cleanupTracking) {
    _cleanupTracking()
    _cleanupTracking = null
  }

  const listeners: Array<{ event: string; handler: (...args: any[]) => void }> = []

  const addListener = (event: string, handler: (...args: any[]) => void) => {
    workspaceProvider.event.on(event, handler)
    listeners.push({ event, handler })
  }

  const shouldTrack = (relativePath: string) =>
    relativePath &&
    !relativePath.startsWith('.git/') &&
    !relativePath.endsWith(CloudSyncEngine.MANIFEST_FILENAME)

  addListener('fileAdded', (path: string) => {
    const relativePath = stripWorkspacePrefix(path, workspaceUuid, workspaceProvider.workspacesPath)
    if (shouldTrack(relativePath)) {
      cloudSyncEngine.trackChange({ path: relativePath, type: 'add', timestamp: Date.now() })
    }
  })

  addListener('fileChanged', (path: string) => {
    const relativePath = stripWorkspacePrefix(path, workspaceUuid, workspaceProvider.workspacesPath)
    if (shouldTrack(relativePath)) {
      cloudSyncEngine.trackChange({ path: relativePath, type: 'change', timestamp: Date.now() })
    }
  })

  addListener('fileRemoved', (path: string) => {
    const relativePath = stripWorkspacePrefix(path, workspaceUuid, workspaceProvider.workspacesPath)
    if (shouldTrack(relativePath)) {
      cloudSyncEngine.trackChange({ path: relativePath, type: 'delete', timestamp: Date.now() })
    }
  })

  addListener('fileRenamed', (oldPath: string, newPath: string) => {
    const relativeOld = stripWorkspacePrefix(oldPath, workspaceUuid, workspaceProvider.workspacesPath)
    const relativeNew = stripWorkspacePrefix(newPath, workspaceUuid, workspaceProvider.workspacesPath)
    if (shouldTrack(relativeNew)) {
      cloudSyncEngine.trackChange({ path: relativeNew, type: 'rename', oldPath: relativeOld, timestamp: Date.now() })
    }
  })

  const cleanup = () => {
    for (const { event, handler } of listeners) {
      try {
        workspaceProvider.event.off(event, handler)
      } catch { /* ignore */ }
    }
    _cleanupTracking = null
  }

  _cleanupTracking = cleanup
  return cleanup
}

/**
 * Proactive version check when the user opens/switches a file.
 * Catches the "come back to device A" scenario immediately on file open,
 * rather than waiting for the next write or 10s flush cycle.
 */
function _onCurrentFileChanged(_file: string): void {
  if (!cloudSyncEngine.isActive) return
  cloudSyncEngine.checkRemoteVersion().catch(() => {})
}

/**
 * Handle a raw FS write detected by the CloudFSObserver.
 *
 * This fires for ALL writes to cloud workspace paths — including ones
 * from the provider itself.  That's fine because:
 *   - Sync engine's trackChange de-duplicates by path
 *
 * File explorer refresh is only emitted during a pull (isPulling=true),
 * because that's when new/changed files arrive from S3 and the tree
 * needs updating.  Local edits already reflect in the UI — refreshing
 * on every push-bound write would cause an unnecessary tree flicker.
 */
function handleRawFSWrite(op: FSWriteOperation, provider: any): void {
  const uuid = extractCloudWorkspaceUuid(op.path)
  if (!uuid) return

  // Only act on the currently active workspace
  if (!cloudSyncEngine.isActive) return

  const relativePath = extractRelativePath(op.path)
  if (!relativePath) return

  // Skip sync manifest and snapshot ZIPs — internal engine files
  if (relativePath === CloudSyncEngine.MANIFEST_FILENAME) return
  if (relativePath === '_workspace.zip') return
  if (relativePath === '_git.zip') return

  // .git writes: don't sync individually (fragile), but schedule an
  // atomic _git.zip push so the full git state is backed up to S3.
  if (relativePath === '.git' || relativePath.startsWith('.git/')) {
    if (!cloudSyncEngine.isPulling && op.type !== 'mkdir' && op.type !== 'rmdir') {
      cloudSyncEngine.scheduleGitSnapshotUpdate()
    }
    return
  }

  // 1) Feed into sync engine for S3 push — but NOT for mkdir/rmdir,
  //    and NOT while the engine is pulling (writes from S3→local should
  //    not be re-pushed back to S3).
  if (op.type !== 'mkdir' && op.type !== 'rmdir' && !cloudSyncEngine.isPulling) {
    const changeType = op.type === 'writeFile' ? 'change'
      : op.type === 'unlink' ? 'delete'
        : op.type === 'rename' ? 'rename'
          : 'change'

    // For renames:  op.path = old path,  op.newPath = new path
    // The tracked change should have path = new (what to upload) and oldPath = old (what to delete).
    const changePath = (op.type === 'rename' && op.newPath)
      ? extractRelativePath(op.newPath)!
      : relativePath
    const changeOldPath = op.type === 'rename' ? relativePath : undefined

    if (!changePath) return // safety — newPath outside cloud workspace

    cloudSyncEngine.trackChange({
      path: changePath,
      type: changeType as any,
      oldPath: changeOldPath,
      timestamp: Date.now(),
    })

    // Proactive version check: on the first write activity, debounce a
    // remote version check so we catch conflicts before the next flush.
    // This way when the user comes back to device A and starts editing,
    // we detect that device B pushed in the meantime within ~2s instead
    // of waiting for the full 10s flush cycle to hit a 409.
    if (!_versionCheckTimer) {
      _versionCheckTimer = setTimeout(() => {
        _versionCheckTimer = null
        cloudSyncEngine.checkRemoteVersion().catch(() => {})
      }, VERSION_CHECK_DEBOUNCE_MS)
    }
  }

  // 2) Debounce file explorer refresh — but ONLY during a pull.
  //    When the user edits locally the tree already reflects the change;
  //    refreshing on every push-bound write causes an unnecessary flicker.
  if (cloudSyncEngine.isPulling) {
    if (_refreshTimer) clearTimeout(_refreshTimer)
    _refreshTimer = setTimeout(() => {
      _refreshTimer = null
      try {
        // The 'refresh' event on the provider triggers fetchWorkspaceDirectory('/')
        // in events.ts, which reloads the entire file tree.
        provider?.event?.emit?.('refresh')
      } catch (e) {
        console.warn('[CloudFSObserver] Failed to emit refresh:', e)
      }
    }, REFRESH_DEBOUNCE_MS)
  }
}

/**
 * Download all backup snapshots for the active cloud workspace.
 *
 * Lists `_workspace_backup_*.zip` objects on S3, downloads each one,
 * bundles them into a single zip, and triggers a browser download.
 *
 * @returns The number of snapshots downloaded, or 0 if none found.
 */
export async function downloadBackupSnapshots(): Promise<number> {
  const state = cloudStore.getState()
  const uuid = state.activeWorkspaceId
  if (!uuid) throw new Error('No active cloud workspace')

  // Get a workspace-scoped STS token and create an S3 client
  const token = await fetchWorkspaceSTS(uuid)
  const s3 = new S3Client(token)

  // List all objects and filter for backup zips
  const allObjects = await s3.listObjects()
  const backups = allObjects.filter(obj => {
    const key = obj.key
    // key is relative to prefix, e.g. "_workspace_backup_1709912345678.zip"
    return key.startsWith('_workspace_backup_') && key.endsWith('.zip')
  })

  if (backups.length === 0) return 0

  // Sort by key (timestamp is embedded) — newest first
  backups.sort((a, b) => b.key.localeCompare(a.key))

  const bundle = new JSZip()

  // Download each backup and add to the bundle
  for (const backup of backups) {
    const data = await s3.getObjectBinary(backup.key)
    if (data) {
      // Extract timestamp from key for a friendly name
      const match = backup.key.match(/_workspace_backup_(\d+)\.zip/)
      const ts = match ? new Date(Number(match[1])) : new Date()
      const label = ts.toISOString().replace(/[:.]/g, '-')
      bundle.file(`snapshot_${label}.zip`, data)
    }
  }

  // Find workspace name for the download filename
  const ws = state.cloudWorkspaces.find(w => w.uuid === uuid)
  const wsName = ws?.name || uuid

  const blob = await bundle.generateAsync({ type: 'blob' })
  // Trigger browser download
  const a = document.createElement('a')
  a.download = `${wsName}-cloud-snapshots.zip`
  a.rel = 'noopener'
  a.href = URL.createObjectURL(blob)
  setTimeout(() => URL.revokeObjectURL(a.href), 40_000)
  a.dispatchEvent(new MouseEvent('click'))

  return backups.length
}

/**
 * Strip workspace prefix from a path.
 *
 * Paths from the workspace provider may come as:
 *   - "contracts/Token.sol"  (already relative)
 *   - ".cloud-workspaces/<uuid>/contracts/Token.sol"
 *   - ".workspaces/<name>/contracts/Token.sol"  (legacy)
 */
function stripWorkspacePrefix(path: string, workspaceId: string, workspacesPath: string): string {
  let p = path.startsWith('/') ? path.slice(1) : path
  const prefix = `${workspacesPath}/${workspaceId}/`
  if (p.startsWith(prefix)) {
    p = p.slice(prefix.length)
  }
  return p
}
