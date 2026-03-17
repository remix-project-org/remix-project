/**
 * Cloud Store — Module-level singleton for cloud state.
 *
 * Because the topbar and workspace panels are rendered in SEPARATE
 * React trees (each plugin has its own root), React Context cannot
 * bridge them. This module provides a simple observable store that
 * any part of the application can subscribe to — regardless of which
 * React tree it lives in.
 *
 * Usage (React hook):
 *   const { isCloudMode, cloudWorkspaces, ... } = useCloudStore()
 *
 * Usage (imperative):
 *   cloudStore.getState()
 *   cloudStore.enterCloudMode(workspaces, stsToken)
 */

import { EventEmitter } from 'events'
import {
  CloudState,
  CloudMode,
  CloudWorkspace,
  WorkspaceSyncStatus,
  STSToken,
} from './types'

// ── State ─────────────────────────────────────────────────

const initialState: CloudState = {
  mode: 'legacy',
  userId: null,
  loading: false,
  cloudWorkspaces: [],
  activeWorkspaceId: null,
  isAuthenticated: false,
  stsToken: null,
  syncStatus: {},
  error: null,
  workspaceQueueBusy: false,
}

class CloudStore extends EventEmitter {
  private state: CloudState = { ...initialState }

  getState(): Readonly<CloudState> {
    return this.state
  }

  get isCloudMode(): boolean {
    return this.state.mode === 'cloud'
  }

  // ── Mutations (each emits 'change') ─────────────────────

  private setState(partial: Partial<CloudState>) {
    this.state = { ...this.state, ...partial }
    this.emit('change', this.state)
  }

  /** Get the user ID from localStorage (AuthUser.sub) */
  private extractUserId(): string | null {
    try {
      const userStr = localStorage.getItem('remix_user')
      if (!userStr) return null
      const user = JSON.parse(userStr)
      return user?.sub ? String(user.sub) : null
    } catch {
      return null
    }
  }

  /** Get the current user ID (null when not authenticated) */
  get userId(): string | null {
    return this.state.userId
  }

  /** Activate cloud mode after successful auth + workspace fetch */
  enterCloudMode(workspaces: CloudWorkspace[], stsToken: STSToken) {
    const userId = this.extractUserId()
    // Restore persisted sync status so workspaces show last-known state
    // instead of all turning blue after a page reload.
    const restored = this._restoreSyncStatus(userId, workspaces)
    this.state = {
      ...this.state,
      mode: 'cloud',
      userId,
      isAuthenticated: true,
      loading: false,
      cloudWorkspaces: workspaces,
      stsToken,
      syncStatus: restored,
      error: null,
    }
    this.emit('change', this.state)
  }

  /** Deactivate cloud mode (logout — resets everything) */
  exitCloudMode() {
    this.state = { ...initialState }
    this.emit('change', this.state)
  }

  /** Deactivate cloud mode but keep auth state (toggle off) */
  disableCloud() {
    this.state = {
      ...initialState,
      isAuthenticated: this.state.isAuthenticated,
    }
    this.emit('change', this.state)
  }

  /** Signal that auth is present but we're still loading cloud data */
  setLoading(loading: boolean) {
    this.setState({ loading })
  }

  setAuthenticated(isAuthenticated: boolean) {
    this.setState({ isAuthenticated })
  }

  /** Replace the full cloud workspace list */
  setCloudWorkspaces(workspaces: CloudWorkspace[]) {
    this.setState({ cloudWorkspaces: workspaces })
  }

  /** Add a single newly-created workspace */
  addCloudWorkspace(workspace: CloudWorkspace) {
    this.setState({ cloudWorkspaces: [...this.state.cloudWorkspaces, workspace]})
  }

  /** Remove a workspace by UUID */
  removeCloudWorkspace(uuid: string) {
    this.setState({
      cloudWorkspaces: this.state.cloudWorkspaces.filter(w => w.uuid !== uuid),
      activeWorkspaceId: this.state.activeWorkspaceId === uuid ? null : this.state.activeWorkspaceId,
    })
  }

  /** Update a workspace's metadata */
  updateCloudWorkspace(workspace: CloudWorkspace) {
    this.setState({
      cloudWorkspaces: this.state.cloudWorkspaces.map(w =>
        w.uuid === workspace.uuid ? workspace : w
      ),
    })
  }

  /** Set the currently active cloud workspace UUID */
  setActiveCloudWorkspace(uuid: string | null) {
    this.setState({ activeWorkspaceId: uuid })
  }

  /** Update sync status for a workspace */
  updateSyncStatus(workspaceId: string, status: WorkspaceSyncStatus) {
    this.setState({
      syncStatus: { ...this.state.syncStatus, [workspaceId]: status },
    })
    // Persist the last-known "good" status so it survives page reloads.
    // Only persist idle states — transient states (loading/syncing/pushing)
    // shouldn't be restored because they'd be stale.
    if (status.status === 'idle' && status.lastSync) {
      this._persistSyncStatus(workspaceId, status)
    }
  }

  // ── Sync status persistence helpers ──────────────────────
  private _syncStatusKey(): string {
    const uid = this.state.userId
    return uid ? `cloud_syncStatus_user_${uid}` : 'cloud_syncStatus'
  }

  private _persistSyncStatus(workspaceId: string, status: WorkspaceSyncStatus) {
    try {
      const key = this._syncStatusKey()
      const existing = JSON.parse(localStorage.getItem(key) || '{}')
      existing[workspaceId] = {
        status: 'idle',
        lastSync: status.lastSync,
        pendingChanges: 0,
      }
      localStorage.setItem(key, JSON.stringify(existing))
    } catch { /* localStorage full or unavailable — ignore */ }
  }

  private _restoreSyncStatus(
    userId: string | null,
    workspaces: CloudWorkspace[],
  ): Record<string, WorkspaceSyncStatus> {
    try {
      const key = userId ? `cloud_syncStatus_user_${userId}` : 'cloud_syncStatus'
      const stored = JSON.parse(localStorage.getItem(key) || '{}')
      const result: Record<string, WorkspaceSyncStatus> = {}
      // Only restore statuses for workspaces that still exist
      for (const ws of workspaces) {
        if (stored[ws.uuid]) {
          result[ws.uuid] = stored[ws.uuid]
        }
      }
      return result
    } catch {
      return {}
    }
  }

  /** Update the STS token */
  refreshStsToken(token: STSToken) {
    this.setState({ stsToken: token })
  }

  /** Set an error */
  setError(error: string | null) {
    this.setState({ error })
  }

  /** Signal whether the workspace operation queue is busy */
  setWorkspaceQueueBusy(busy: boolean) {
    this.setState({ workspaceQueueBusy: busy })
  }

  /** Reset to initial state */
  reset() {
    this.state = { ...initialState }
    this.emit('change', this.state)
  }
}

/** The singleton */
export const cloudStore = new CloudStore()

// ── React Hook ────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react'

/**
 * React hook that subscribes to the cloud store.
 * Re-renders whenever the cloud state changes.
 *
 * Can be used from ANY React tree (topbar, workspace, etc.)
 */
export function useCloudStore() {
  const [state, setState] = useState<CloudState>(cloudStore.getState())

  useEffect(() => {
    const handler = (newState: CloudState) => setState({ ...newState })
    cloudStore.on('change', handler)
    // Sync in case state changed between render and effect
    setState({ ...cloudStore.getState() })
    return () => { cloudStore.off('change', handler) }
  }, [])

  return {
    ...state,
    isCloudMode: state.mode === 'cloud',
    store: cloudStore,
  }
}
