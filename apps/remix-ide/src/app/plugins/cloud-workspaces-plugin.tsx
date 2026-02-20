import React from 'react'
import { ViewPlugin } from '@remixproject/engine-web'
import { PluginViewWrapper } from '@remix-ui/helper'
import * as packageJson from '../../../../../package.json'
import { RemixUICloudWorkspaces } from '@remix-ui/cloud-workspaces'
import { WorkspaceSummary, StorageFile } from '@remix-api'

const profile = {
  name: 'cloudWorkspaces',
  displayName: 'Cloud Workspaces',
  methods: [
    'getWorkspaces',
    'getBackups',
    'refresh',
    'updateStatus',
    'saveToCloud',
    'createBackup',
    'restoreAutosave',
    'linkToCurrentUser',
    'updateWorkspaceRemoteId'
  ],
  events: ['workspacesLoaded', 'backupsLoaded', 'statusChanged'],
  icon: 'assets/img/cloud.svg',
  description: 'View and manage your cloud workspaces and backups',
  kind: 'storage',
  location: 'sidePanel',
  documentation: '',
  version: packageJson.version,
  maintainedBy: 'Remix'
}

// Badge status types for the sidebar icon
export type CloudStatusKey = 'none' | 'login' | 'cloud-off' | 'syncing' | 'synced' | 'autosave' | 'error'

interface CloudStatus {
  key: CloudStatusKey | number
  title: string
  type: 'warning' | 'success' | 'info' | 'error' | ''
}

// Current workspace cloud status - tracks sync state of the active workspace
export interface CurrentWorkspaceCloudStatus {
  workspaceName: string
  remoteId: string | null
  lastSaved: string | null
  lastBackup: string | null
  autosaveEnabled: boolean
  isSaving: boolean
  isBackingUp: boolean
  isRestoring: boolean
  isLinking: boolean
  ownedByCurrentUser: boolean
  linkedToAnotherUser: boolean
  canSave: boolean
  hasConflict: boolean
  // Encryption state
  encryptionEnabled: boolean
  hasEncryptionPassphrase: boolean
}

const defaultWorkspaceStatus: CurrentWorkspaceCloudStatus = {
  workspaceName: '',
  remoteId: null,
  lastSaved: null,
  lastBackup: null,
  autosaveEnabled: false,
  isSaving: false,
  isBackingUp: false,
  isRestoring: false,
  isLinking: false,
  ownedByCurrentUser: true,
  linkedToAnotherUser: false,
  canSave: true,
  hasConflict: false,
  encryptionEnabled: false,
  hasEncryptionPassphrase: false
}

// Per-workspace backup data structure
export interface WorkspaceBackupData {
  backups: StorageFile[]
  autosave: StorageFile | null
  loading: boolean
  error: string | null
  loaded: boolean
}

export interface CloudWorkspacesState {
  workspaces: WorkspaceSummary[]
  selectedWorkspace: string | null
  // Map of workspaceId -> backup data (cached per workspace)
  workspaceBackups: Record<string, WorkspaceBackupData>
  // Set of currently expanded workspace IDs
  expandedWorkspaces: Set<string>
  loading: boolean
  error: string | null
  isAuthenticated: boolean
  currentStatus: CloudStatus
  currentWorkspaceStatus: CurrentWorkspaceCloudStatus
}

export class CloudWorkspacesPlugin extends ViewPlugin {
  dispatch: React.Dispatch<any> = () => {}
  private state: CloudWorkspacesState = {
    workspaces: [],
    selectedWorkspace: null,
    workspaceBackups: {},
    expandedWorkspaces: new Set(),
    loading: false,
    error: null,
    isAuthenticated: false,
    currentStatus: { key: 'none', title: '', type: '' },
    currentWorkspaceStatus: { ...defaultWorkspaceStatus }
  }

  constructor() {
    super(profile)
  }

  // ==================== Status Badge Management ====================

  /**
   * Update the sidebar badge status based on current state
   */
  async updateStatus(): Promise<void> {
    const status = await this.computeCurrentStatus()
    console.log('[CloudWorkspaces] Computed status:', status)

    if (status.key !== this.state.currentStatus.key) {
      console.log('[CloudWorkspaces] Status changed from', this.state.currentStatus.key, 'to', status.key)
      this.state.currentStatus = status
      console.log('[CloudWorkspaces] Emitting statusChanged:', status)
      this.emit('statusChanged', status)
    } else {
      console.log('[CloudWorkspaces] Status unchanged:', status.key)
    }
  }

  private async computeCurrentStatus(): Promise<CloudStatus> {
    console.log('[CloudWorkspaces] computeCurrentStatus - isAuthenticated:', this.state.isAuthenticated)

    // Check if there's a conflict - highest priority
    const status = this.state.currentWorkspaceStatus
    if (status.hasConflict) {
      return {
        key: 'error',
        title: 'Sync conflict - cloud was modified elsewhere',
        type: 'error'
      }
    }

    // Check if any remote activity is in progress
    if (status.isSaving || status.isBackingUp || status.isRestoring || status.isLinking) {
      const activity = status.isSaving ? 'Saving' :
        status.isBackingUp ? 'Backing up' :
          status.isRestoring ? 'Restoring' : 'Linking'
      return {
        key: 'syncing',
        title: `${activity} to cloud...`,
        type: 'info'
      }
    }

    // Check if there's an error
    if (this.state.error) {
      return {
        key: 'error',
        title: this.state.error,
        type: 'error'
      }
    }

    // Check if user is logged in
    if (!this.state.isAuthenticated) {
      console.log('[CloudWorkspaces] Not authenticated, returning login status')
      return {
        key: 'login',
        title: 'Login to sync workspaces to cloud',
        type: 'warning'
      }
    }

    // Check if there's a current workspace
    try {
      const currentWorkspace = await this.call('filePanel', 'getCurrentWorkspace')
      console.log('[CloudWorkspaces] Current workspace:', currentWorkspace)
      if (!currentWorkspace || !currentWorkspace.name) {
        console.log('[CloudWorkspaces] No workspace open')
        return { key: 'none', title: '', type: '' }
      }

      // Check if workspace is linked to cloud
      const ownership = await this.call('s3Storage', 'getWorkspaceOwnership')
      console.log('[CloudWorkspaces] Ownership:', ownership)

      if (!ownership.remoteId) {
        return {
          key: 'cloud-off',
          title: 'Enable cloud backup for this workspace',
          type: 'info'
        }
      }

      // Check if workspace is owned by another user
      if (!ownership.ownedByCurrentUser) {
        return {
          key: 'error',
          title: 'Workspace linked to another account',
          type: 'error'
        }
      }

      // Check if autosave is enabled and running
      const autosaveEnabled = await this.call('s3Storage', 'isAutosaveEnabled')
      if (autosaveEnabled) {
        return {
          key: 'autosave',
          title: 'Autosave enabled - syncing to cloud',
          type: 'success'
        }
      }

      // Workspace is linked but autosave is off
      return {
        key: 'synced',
        title: 'Workspace linked to cloud',
        type: 'success'
      }
    } catch (e) {
      console.warn('[CloudWorkspacesPlugin] Could not compute status:', e)
      return { key: 'none', title: '', type: '' }
    }
  }

  // ==================== Lifecycle ====================

  async onActivation(): Promise<void> {
    console.log('[CloudWorkspaces] Plugin activated')

    // Check auth status and load workspaces
    await this.checkAuthAndLoad()

    // Listen for auth state changes (login / logout — NOT token refreshes)
    this.on('auth', 'authStateChanged', async (state: { isAuthenticated: boolean }) => {
      const wasAuthenticated = this.state.isAuthenticated
      this.state.isAuthenticated = state.isAuthenticated

      if (state.isAuthenticated) {
        if (wasAuthenticated) {
          // Already authenticated — skip full workspace reload
          console.log('[CloudWorkspaces] authStateChanged: already authenticated, skipping reload')
          return
        }
        console.log('[CloudWorkspaces] authStateChanged: user logged in, loading workspaces')
        await this.loadWorkspaces()
      } else {
        console.log('[CloudWorkspaces] authStateChanged: user logged out')
        this.state.workspaces = []
        this.state.workspaceBackups = {}
        this.state.selectedWorkspace = null
        this.state.currentWorkspaceStatus = { ...defaultWorkspaceStatus }
        this.renderComponent()
      }
      await this.loadCurrentWorkspaceStatus()
      await this.updateStatus()
    })

    // Listen for workspace changes
    this.on('filePanel', 'setWorkspace', async () => {
      console.log('[CloudWorkspaces] setWorkspace event received')
      await this.loadCurrentWorkspaceStatus()
      await this.updateStatus()
    })

    // Listen for backup events from s3Storage
    this.on('s3Storage', 'backupCompleted', async () => {
      console.log('[CloudWorkspaces] backupCompleted event received')
      await this.refresh()
      await this.loadCurrentWorkspaceStatus()
      await this.updateStatus()
    })

    // Listen for save events from s3Storage
    this.on('s3Storage', 'saveCompleted', async (data) => {
      console.log('[CloudWorkspaces] saveCompleted event received!', data)
      // Reset the saving flag that was set by autosaveStarted
      this.state.currentWorkspaceStatus = { ...this.state.currentWorkspaceStatus, isSaving: false }
      await this.refresh()
      await this.loadCurrentWorkspaceStatus()
      await this.updateStatus()
    })

    // Listen for autosave starting (syncing indicator)
    this.on('s3Storage', 'autosaveStarted', async () => {
      console.log('[CloudWorkspaces] autosaveStarted event received')
      // Temporarily set syncing state for the badge
      this.state.currentWorkspaceStatus = { ...this.state.currentWorkspaceStatus, isSaving: true }
      await this.updateStatus()
    })

    // Listen for autosave setting changes
    this.on('s3Storage', 'autosaveChanged', async () => {
      console.log('[CloudWorkspaces] autosaveChanged event received')
      await this.loadCurrentWorkspaceStatus()
      await this.updateStatus()
    })

    // Listen for conflict detection
    this.on('s3Storage', 'conflictDetected', async (conflictInfo: { hasConflict: boolean; lockInfo?: { sessionId: string; browser: string; platform: string; lockedAt: string } | null; source?: string }) => {
      console.warn('[CloudWorkspaces] Conflict detected!', conflictInfo)
      // Set conflict flag in state
      this.state.currentWorkspaceStatus = { ...this.state.currentWorkspaceStatus, hasConflict: true }
      this.renderComponent()
      await this.updateStatus()
      // Show modal
      await this.showConflictResolutionModal(conflictInfo)
    })

    // Initial status update
    console.log('[CloudWorkspaces] Calling initial updateStatus')
    await this.loadCurrentWorkspaceStatus()
    await this.updateStatus()
  }

  async onDeactivation(): Promise<void> {
    this.off('auth', 'authStateChanged')
    this.off('filePanel', 'setWorkspace')
    this.off('s3Storage', 'backupCompleted')
    this.off('s3Storage', 'saveCompleted')
    this.off('s3Storage', 'autosaveStarted')
    this.off('s3Storage', 'autosaveChanged')
    this.off('s3Storage', 'conflictDetected')
  }

  /**
   * Show conflict resolution modal when workspace is locked by another session
   */
  private async showConflictResolutionModal(conflictInfo: { lockInfo?: { sessionId: string; browser: string; platform: string; lockedAt: string } | null }): Promise<void> {
    const lockInfo = conflictInfo.lockInfo
    const lockedAt = lockInfo?.lockedAt
      ? new Date(lockInfo.lockedAt).toLocaleString()
      : 'unknown time'
    const lockedBy = lockInfo
      ? `${lockInfo.browser} on ${lockInfo.platform}`
      : 'another session'

    const clearConflictFlag = async () => {
      this.state.currentWorkspaceStatus = { ...this.state.currentWorkspaceStatus, hasConflict: false }
      this.renderComponent()
      await this.updateStatus()
    }

    const modal = {
      id: 'cloudConflictModal',
      title: '⚠️ Cloud Sync Conflict',
      message: `This workspace is being edited by ${lockedBy} (last active: ${lockedAt}).\n\nIf this is you in another tab, you can close that tab first. Or take over the session here.`,
      modalType: 'modal',
      okLabel: 'Take Over Session',
      cancelLabel: 'Cancel',
      okFn: async () => {
        // Take over: force acquire lock and save
        try {
          await clearConflictFlag()
          await this.call('s3Storage', 'forceSaveToCloud')
          await this.call('notification', 'toast', '✅ Session taken over - now syncing from this browser')
        } catch (e) {
          console.error('[CloudWorkspaces] Take over failed:', e)
          await this.call('notification', 'toast', `❌ Take over failed: ${e.message}`)
        }
      },
      cancelFn: async () => {
        // Cancel: just clear the flag, sync will retry on next interval or manual save
        await clearConflictFlag()
        await this.call('notification', 'toast', 'ℹ️ Sync paused - close other sessions or try again later')
      },
      hideFn: async () => {
        // User dismissed modal (X button) - same as cancel
        await clearConflictFlag()
        console.log('[CloudWorkspaces] Conflict modal dismissed - sync paused until next action')
      }
    }

    await this.call('notification', 'modal', modal)
  }

  private async checkAuthAndLoad(): Promise<void> {
    try {
      const isAuth = await this.call('auth', 'isAuthenticated')
      this.state.isAuthenticated = isAuth
      if (isAuth) {
        await this.loadWorkspaces()
      } else {
        this.renderComponent()
      }
    } catch (e) {
      console.error('[CloudWorkspacesPlugin] Auth check failed:', e)
      this.state.isAuthenticated = false
      this.renderComponent()
    }
  }

  // ==================== Current Workspace Status ====================

  /**
   * Load the current workspace's cloud status
   */
  private async loadCurrentWorkspaceStatus(): Promise<void> {
    console.log('[CloudWorkspaces] loadCurrentWorkspaceStatus called')

    if (!this.state.isAuthenticated) {
      this.state.currentWorkspaceStatus = { ...defaultWorkspaceStatus }
      this.renderComponent()
      return
    }

    try {
      const currentWorkspace = await this.call('filePanel', 'getCurrentWorkspace')
      if (!currentWorkspace || !currentWorkspace.name) {
        this.state.currentWorkspaceStatus = { ...defaultWorkspaceStatus }
        this.renderComponent()
        return
      }

      const remoteId = await this.call('s3Storage', 'getWorkspaceRemoteId', currentWorkspace.name)
      const lastSaved = await this.call('s3Storage', 'getLastSaveTime', currentWorkspace.name)
      const lastBackup = await this.call('s3Storage', 'getLastBackupTime', currentWorkspace.name)
      const autosaveEnabled = await this.call('s3Storage', 'isAutosaveEnabled')
      const ownership = await this.call('s3Storage', 'getWorkspaceOwnership')

      // Get encryption status
      const encryptionEnabled = await this.call('s3Storage', 'isEncryptionEnabled')
      const hasEncryptionPassphrase = await this.call('s3Storage', 'hasEncryptionPassphrase')

      console.log('[CloudWorkspaces] Ownership result:', ownership)

      this.state.currentWorkspaceStatus = {
        workspaceName: currentWorkspace.name,
        remoteId,
        lastSaved,
        lastBackup,
        autosaveEnabled,
        ownedByCurrentUser: ownership.ownedByCurrentUser,
        linkedToAnotherUser: ownership.linkedToAnotherUser,
        canSave: ownership.canSave,
        // Reset all action flags when loading fresh status
        isSaving: false,
        isBackingUp: false,
        isRestoring: false,
        isLinking: false,
        // Preserve conflict flag - only cleared by explicit resolution
        hasConflict: this.state.currentWorkspaceStatus.hasConflict,
        // Encryption state
        encryptionEnabled,
        hasEncryptionPassphrase
      }

      console.log('[CloudWorkspaces] Current workspace status loaded:', this.state.currentWorkspaceStatus)
      console.log('[CloudWorkspaces] canSave:', this.state.currentWorkspaceStatus.canSave)

      // Load backups for current workspace if it's connected to cloud
      if (remoteId) {
        // Fire and forget - don't block on this
        this.loadBackups(remoteId)
      }

      this.renderComponent()
    } catch (e) {
      console.error('[CloudWorkspacesPlugin] Failed to load workspace status:', e)
    }
  }

  // ==================== Current Workspace Actions ====================

  /**
   * Save current workspace to cloud
   */
  async saveToCloud(): Promise<void> {
    this.state.currentWorkspaceStatus = { ...this.state.currentWorkspaceStatus, isSaving: true }
    this.state.error = null
    this.renderComponent()
    await this.updateStatus()

    try {
      await this.call('s3Storage', 'saveToCloud')
      await this.loadCurrentWorkspaceStatus()
      await this.updateStatus()
    } catch (e) {
      this.state.error = e.message || 'Save failed'
      this.state.currentWorkspaceStatus = { ...this.state.currentWorkspaceStatus, isSaving: false }
      this.renderComponent()
      await this.updateStatus()
      throw e
    }
  }

  /**
   * Create a backup of current workspace
   */
  async createBackup(): Promise<void> {
    this.state.currentWorkspaceStatus = { ...this.state.currentWorkspaceStatus, isBackingUp: true }
    this.state.error = null
    this.renderComponent()
    await this.updateStatus()

    try {
      await this.call('s3Storage', 'backupWorkspace')
      await this.loadCurrentWorkspaceStatus()
      await this.updateStatus()
    } catch (e) {
      this.state.error = e.message || 'Backup failed'
      this.state.currentWorkspaceStatus = { ...this.state.currentWorkspaceStatus, isBackingUp: false }
      this.renderComponent()
      await this.updateStatus()
      throw e
    }
  }

  /**
   * Restore from autosave
   */
  async restoreAutosave(): Promise<void> {
    const remoteId = this.state.currentWorkspaceStatus.remoteId
    const workspaceName = this.state.currentWorkspaceStatus.workspaceName
    if (!remoteId || !workspaceName) return

    this.state.currentWorkspaceStatus = { ...this.state.currentWorkspaceStatus, isRestoring: true }
    this.state.error = null
    this.renderComponent()
    await this.updateStatus()

    try {
      // Build the autosave filename using the same sanitization as saveToCloud
      const sanitizedName = workspaceName.replace(/[^a-zA-Z0-9-_]/g, '-')
      const autosavePath = `${remoteId}/autosave/${sanitizedName}-autosave.zip`
      await this.call('s3Storage', 'restoreWorkspace', autosavePath)
      await this.loadCurrentWorkspaceStatus()
      await this.updateStatus()
    } catch (e) {
      this.state.error = e.message || 'Restore failed'
      this.state.currentWorkspaceStatus = { ...this.state.currentWorkspaceStatus, isRestoring: false }
      this.renderComponent()
      await this.updateStatus()
      throw e
    }
  }

  /**
   * Link workspace to current user
   */
  async linkToCurrentUser(): Promise<void> {
    this.state.currentWorkspaceStatus = { ...this.state.currentWorkspaceStatus, isLinking: true }
    this.state.error = null
    this.renderComponent()
    await this.updateStatus()

    try {
      await this.call('s3Storage', 'linkWorkspaceToCurrentUser')
      await this.loadCurrentWorkspaceStatus()
      await this.updateStatus()
    } catch (e) {
      this.state.error = e.message || 'Link failed'
      this.state.currentWorkspaceStatus = { ...this.state.currentWorkspaceStatus, isLinking: false }
      this.renderComponent()
      await this.updateStatus()
      throw e
    }
  }

  /**
   * Enable cloud for workspace - one click action that:
   * 1. Links workspace to user's cloud
   * 2. Runs first save
   * 3. Enables autosave
   */
  async enableCloud(): Promise<void> {
    this.state.currentWorkspaceStatus = { ...this.state.currentWorkspaceStatus, isLinking: true }
    this.state.error = null
    this.renderComponent()
    await this.updateStatus()

    try {
      // Step 1: Link workspace to cloud
      await this.call('s3Storage', 'linkWorkspaceToCurrentUser')

      // Step 2: Run first save
      this.state.currentWorkspaceStatus = { ...this.state.currentWorkspaceStatus, isLinking: false, isSaving: true }
      this.renderComponent()
      await this.updateStatus()
      await this.call('s3Storage', 'saveToCloud')

      // Step 3: Enable autosave
      await this.call('s3Storage', 'setAutosaveEnabled', true)

      await this.loadCurrentWorkspaceStatus()
      await this.updateStatus()

      await this.call('notification', 'toast', '☁️ Cloud backup enabled!')
    } catch (e) {
      this.state.error = e.message || 'Failed to enable cloud'
      this.state.currentWorkspaceStatus = {
        ...this.state.currentWorkspaceStatus,
        isLinking: false,
        isSaving: false
      }
      this.renderComponent()
      await this.updateStatus()
      throw e
    }
  }

  /**
   * Toggle autosave on/off
   * This syncs with the settings plugin via s3Storage
   */
  async toggleAutosave(enabled: boolean): Promise<void> {
    try {
      await this.call('s3Storage', 'setAutosaveEnabled', enabled)
      // The autosaveChanged event will trigger loadCurrentWorkspaceStatus
    } catch (e) {
      this.state.error = e.message || 'Failed to toggle autosave'
      this.renderComponent()
    }
  }

  // ==================== Encryption Actions ====================

  /**
   * Toggle cloud encryption on/off
   */
  async toggleEncryption(enabled: boolean): Promise<void> {
    try {
      if (enabled) {
        await this.call('s3Storage', 'enableEncryption')
      } else {
        await this.call('s3Storage', 'disableEncryption')
      }
      await this.loadCurrentWorkspaceStatus()
    } catch (e) {
      this.state.error = e.message || 'Failed to toggle encryption'
      this.renderComponent()
    }
  }

  /**
   * Set the encryption passphrase
   * @returns true if passphrase was set successfully
   */
  async setEncryptionPassphrase(passphrase: string): Promise<boolean> {
    try {
      await this.call('s3Storage', 'setEncryptionPassphrase', passphrase)
      await this.loadCurrentWorkspaceStatus()
      return true
    } catch (e) {
      this.state.error = e.message || 'Failed to set passphrase'
      this.renderComponent()
      return false
    }
  }

  /**
   * Generate a new random passphrase
   * @returns the generated passphrase
   */
  async generateNewPassphrase(): Promise<string> {
    try {
      return await this.call('s3Storage', 'generateEncryptionPassphrase')
    } catch (e) {
      this.state.error = e.message || 'Failed to generate passphrase'
      this.renderComponent()
      return ''
    }
  }

  /**
   * Clear the stored encryption passphrase
   */
  async clearEncryptionPassphrase(): Promise<void> {
    try {
      await this.call('s3Storage', 'clearEncryptionPassphrase')
      await this.loadCurrentWorkspaceStatus()
    } catch (e) {
      this.state.error = e.message || 'Failed to clear passphrase'
      this.renderComponent()
    }
  }

  /**
   * Update workspace remote ID (rename in cloud)
   */
  async updateWorkspaceRemoteId(workspaceName: string, remoteId: string): Promise<void> {
    this.state.error = null

    try {
      await this.call('s3Storage', 'setWorkspaceRemoteId', workspaceName, remoteId)
      await this.loadCurrentWorkspaceStatus()
      await this.updateStatus()
      await this.loadWorkspaces()
    } catch (e) {
      this.state.error = e.message || 'Failed to rename'
      this.renderComponent()
      throw e
    }
  }

  // ==================== Public API ====================
  async getWorkspaces(): Promise<WorkspaceSummary[]> {
    return this.state.workspaces
  }

  /**
   * Get backups for a specific workspace
   */
  async getBackups(workspaceId: string): Promise<StorageFile[]> {
    const backupData = this.state.workspaceBackups[workspaceId]
    if (backupData?.loaded) {
      return backupData.backups
    }
    await this.loadBackups(workspaceId)
    return this.state.workspaceBackups[workspaceId]?.backups || []
  }

  /**
   * Refresh the workspace list - reloads only currently expanded workspaces
   */
  async refresh(): Promise<void> {
    // Get list of currently expanded workspaces (only reload those)
    const expandedIds = Array.from(this.state.expandedWorkspaces)

    // Mark expanded workspaces as needing reload
    for (const workspaceId of expandedIds) {
      if (this.state.workspaceBackups[workspaceId]) {
        this.state.workspaceBackups[workspaceId] = {
          ...this.state.workspaceBackups[workspaceId],
          loaded: false
        }
      }
    }

    await this.loadWorkspaces()

    // Reload backups for currently expanded workspaces only (fire and forget, parallel)
    for (const workspaceId of expandedIds) {
      this.loadBackups(workspaceId)
    }
  }

  /**
   * Scan all local workspaces' remix.config.json to build a map of remoteId -> local workspace names.
   * Uses the raw filesystem to read across workspaces without switching the active one.
   */
  private async scanLocalRemoteIds(): Promise<Map<string, string[]>> {
    const remoteIdToLocal = new Map<string, string[]>()
    try {
      const fs = (window as any).remixFileSystem
      if (!fs || !await fs.exists('/.workspaces')) {
        return remoteIdToLocal
      }

      const workspaceNames = await fs.readdir('/.workspaces')
      for (const wsName of workspaceNames) {
        const configPath = `/.workspaces/${wsName}/remix.config.json`
        try {
          if (!await fs.exists(configPath)) continue
          const raw = await fs.readFile(configPath, 'utf8')
          const config = JSON.parse(raw)
          const remoteId = config?.['remote-workspace']?.remoteId
          if (remoteId) {
            const existing = remoteIdToLocal.get(remoteId) || []
            existing.push(wsName)
            remoteIdToLocal.set(remoteId, existing)
          }
        } catch (e) {
          // Skip workspaces with unreadable configs
        }
      }
    } catch (e) {
      console.warn('[CloudWorkspacesPlugin] Failed to scan local remote IDs:', e)
    }
    return remoteIdToLocal
  }

  private async loadWorkspaces(): Promise<void> {
    this.state.loading = true
    this.state.error = null
    this.renderComponent()

    try {
      const [result, localRemoteIds] = await Promise.all([
        this.call('s3Storage', 'listWorkspaces'),
        this.scanLocalRemoteIds()
      ])

      // Enrich each remote workspace with local presence info
      const workspaces = (result.workspaces || []).map(ws => ({
        ...ws,
        localWorkspaceNames: localRemoteIds.get(ws.id) || []
      }))

      this.state.workspaces = workspaces
      this.emit('workspacesLoaded', this.state.workspaces)
    } catch (e) {
      console.error('[CloudWorkspacesPlugin] Failed to load workspaces:', e)
      this.state.error = e.message || 'Failed to load workspaces'
    } finally {
      this.state.loading = false
      this.renderComponent()
    }
  }

  private async loadBackups(workspaceId: string): Promise<void> {
    // Initialize workspace backup data if not exists
    if (!this.state.workspaceBackups[workspaceId]) {
      this.state.workspaceBackups[workspaceId] = {
        backups: [],
        autosave: null,
        loading: false,
        error: null,
        loaded: false
      }
    }

    const workspaceData = this.state.workspaceBackups[workspaceId]

    // Skip if already loading
    if (workspaceData.loading) {
      return
    }

    // Set loading state for this specific workspace
    this.state.workspaceBackups[workspaceId] = {
      ...workspaceData,
      loading: true,
      error: null
    }
    this.renderComponent()

    try {
      // Load both backups and autosave in parallel
      const [backupsResult, autosaveResult] = await Promise.all([
        this.call('s3Storage', 'list', { folder: `${workspaceId}/backups` }),
        this.call('s3Storage', 'list', { folder: `${workspaceId}/autosave` })
      ])

      const backups = backupsResult.files || []
      const allAutosaveFiles = autosaveResult.files || []

      // Filter to only actual backup files (.zip or .zip.enc)
      // The autosave folder also contains content-hash.json and session.lock which are not backups
      const autosaveFiles = allAutosaveFiles.filter(f =>
        f.filename.endsWith('.zip') || f.filename.endsWith('.zip.enc')
      )

      // Find the latest autosave
      // Sort by lastModified descending and take the first one
      let autosave = null
      if (autosaveFiles.length > 0) {
        const sortedAutosaves = [...autosaveFiles].sort((a, b) => {
          const dateA = new Date(a.lastModified).getTime()
          const dateB = new Date(b.lastModified).getTime()
          return dateB - dateA // Descending order (latest first)
        })
        autosave = sortedAutosaves[0]
      }

      // Update this workspace's backup data
      this.state.workspaceBackups[workspaceId] = {
        backups,
        autosave,
        loading: false,
        error: null,
        loaded: true
      }

      this.emit('backupsLoaded', { workspaceId, backups, autosave })
    } catch (e) {
      console.error('[CloudWorkspacesPlugin] Failed to load backups:', e)
      this.state.workspaceBackups[workspaceId] = {
        ...this.state.workspaceBackups[workspaceId],
        loading: false,
        error: e.message || 'Failed to load backups',
        loaded: false
      }
    } finally {
      this.renderComponent()
    }
  }

  // Action handlers - will be called from UI
  async selectWorkspace(workspaceId: string): Promise<void> {
    this.state.selectedWorkspace = workspaceId
    // Track as expanded
    this.state.expandedWorkspaces.add(workspaceId)
    // Fire and forget - don't await so UI can be responsive
    this.loadBackups(workspaceId)
  }

  /**
   * Collapse a workspace (remove from expanded set)
   */
  collapseWorkspace(workspaceId: string): void {
    this.state.expandedWorkspaces.delete(workspaceId)
    this.renderComponent()
  }

  async restoreBackup(backupFolder: string, backupFilename: string): Promise<void> {
    try {
      // Construct the relative path (without users/X prefix)
      const backupPath = `${backupFolder}/${backupFilename}`

      // Extract the remote workspace ID from the backup path (first segment)
      const backupRemoteId = backupFolder.split('/')[0]

      // Check if current workspace has the same remote ID
      const currentRemoteId = await this.call('s3Storage', 'getWorkspaceRemoteId')
      const canRestoreToCurrent = currentRemoteId && currentRemoteId === backupRemoteId

      // Scan all local workspaces to find any already linked to this remote ID
      const localRemoteIds = await this.scanLocalRemoteIds()
      const localWorkspacesWithSameId = localRemoteIds.get(backupRemoteId) || []

      console.log('[CloudWorkspaces] 🔄 restoreBackup called:', {
        backupPath,
        backupRemoteId,
        currentRemoteId,
        canRestoreToCurrent,
        localWorkspacesWithSameId
      })

      if (canRestoreToCurrent) {
        console.log('[CloudWorkspaces] 🔄 Path: canRestoreToCurrent — showing Restore/Copy modal')
        // Current workspace owns this remote — offer restore to current or create a separate copy
        const restoreModal = {
          id: 'restoreBackupModal',
          title: 'Restore Backup',
          message: 'How would you like to restore this backup?',
          modalType: 'modal',
          okLabel: 'Restore to Current Workspace',
          cancelLabel: 'Create Separate Copy',
          okFn: async () => {
            console.log('[CloudWorkspaces] 🔄 User chose: Restore to Current Workspace')
            await this.promptCleanOrMergeRestore(backupPath)
          },
          cancelFn: async () => {
            console.log('[CloudWorkspaces] 🔄 User chose: Create Separate Copy')
            // Separate copy — prompt for workspace name
            await this.promptAndRestoreToNewWorkspace(backupPath, { keepRemoteId: false })
          },
          hideFn: () => {
            console.log('[CloudWorkspaces] 🔄 Restore modal dismissed (hideFn)')
          }
        }
        await this.call('notification', 'modal', restoreModal)
      } else if (localWorkspacesWithSameId.length > 0) {
        console.log('[CloudWorkspaces] 🔄 Path: localWorkspacesWithSameId — showing conflict modal')
        // Another local workspace already syncs to this remote — warn the user
        const existingNames = localWorkspacesWithSameId.join(', ')
        const restoreModal = {
          id: 'restoreBackupConflictModal',
          title: 'Remote Already on This Device',
          message: `The workspace "${existingNames}" on this device is already syncing to this cloud workspace. ` +
            `You can restore into that existing workspace or create a separate copy with its own cloud identity.`,
          modalType: 'modal',
          okLabel: `Restore to "${localWorkspacesWithSameId[0]}"`,
          cancelLabel: 'Create Separate Copy',
          okFn: async () => {
            try {
              console.log('[CloudWorkspaces] 🔄 User chose: Restore to existing local workspace:', localWorkspacesWithSameId[0])
              // Switch to that workspace (full switch including file provider root)
              await this.switchToWorkspaceAndWait(localWorkspacesWithSameId[0])
              console.log('[CloudWorkspaces] 🔄 Switched to workspace:', localWorkspacesWithSameId[0])
              await this.promptCleanOrMergeRestore(backupPath)
            } catch (e) {
              console.error('[CloudWorkspacesPlugin] Restore to existing local failed:', e)
              await this.call('notification', 'alert', {
                id: 'restoreError',
                title: 'Restore Failed',
                message: e.message || 'Failed to restore backup'
              })
            }
          },
          cancelFn: async () => {
            console.log('[CloudWorkspaces] 🔄 User chose: Create Separate Copy (from conflict modal)')
            // Separate copy — prompt for workspace name
            await this.promptAndRestoreToNewWorkspace(backupPath, { keepRemoteId: false })
          },
          hideFn: () => {
            console.log('[CloudWorkspaces] 🔄 Conflict modal dismissed (hideFn)')
          }
        }
        await this.call('notification', 'modal', restoreModal)
      } else {
        console.log('[CloudWorkspaces] 🔄 Path: remote not on device — restoring with keepRemoteId=true')
        // Remote is NOT on this device — this is the "moved to another computer" case
        // Keep the remoteId so the user continues syncing to the same cloud
        await this.promptAndRestoreToNewWorkspace(backupPath, { keepRemoteId: true })
      }
    } catch (e) {
      console.error('[CloudWorkspacesPlugin] Restore failed:', e)
      throw e
    }
  }

  /**
   * Properly switch to a workspace and wait for the switch to complete.
   * filePanel.setWorkspace only updates metadata — it does NOT change the file provider root.
   * filePanel.switchToWorkspace emits an event that triggers the full switch asynchronously.
   *
   * IMPORTANT: We fire switchToWorkspace without await because the plugin engine
   * waits for ALL event listeners to complete (including our own setWorkspace handler
   * which runs loadCurrentWorkspaceStatus + updateStatus). Awaiting would block the
   * polling loop from ever starting, causing a deadlock when the modal closes.
   */
  private async switchToWorkspaceAndWait(workspaceName: string, timeoutMs = 10000): Promise<void> {
    console.log('[CloudWorkspaces] 🔄 switchToWorkspaceAndWait: switching to', workspaceName)

    // Check if we're already on this workspace
    const current = await this.call('filePanel', 'getCurrentWorkspace')
    if (current?.name === workspaceName) {
      console.log('[CloudWorkspaces] 🔄 switchToWorkspaceAndWait: already on', workspaceName)
      return
    }

    // Fire and forget — do NOT await. The plugin engine's emit waits for all listeners
    // (including our own setWorkspace handler), so awaiting would block the poll loop below.
    this.call('filePanel', 'switchToWorkspace', { name: workspaceName }).catch(e => {
      console.error('[CloudWorkspaces] 🔄 switchToWorkspaceAndWait: switchToWorkspace call failed:', e)
    })

    // Poll until getCurrentWorkspace reflects the new workspace
    const startTime = Date.now()
    while (Date.now() - startTime < timeoutMs) {
      await new Promise(r => setTimeout(r, 200))

      try {
        const ws = await this.call('filePanel', 'getCurrentWorkspace')
        if (ws?.name === workspaceName) {
          console.log('[CloudWorkspaces] 🔄 switchToWorkspaceAndWait: workspace is now', ws.name)
          return
        }
        console.log('[CloudWorkspaces] 🔄 switchToWorkspaceAndWait: still waiting... current:', ws?.name)
      } catch (e) {
        console.log('[CloudWorkspaces] 🔄 switchToWorkspaceAndWait: still waiting... (error:', e.message, ')')
      }
    }

    throw new Error(`Timed out waiting for workspace switch to "${workspaceName}"`)
  }

  /**
   * Refresh the full UI after a restore operation completes.
   * Called explicitly at the end of each restore code path (after all modals are resolved).
   */
  private async refreshAfterRestore(): Promise<void> {
    console.log('[CloudWorkspaces] 🔄 refreshAfterRestore: START')
    try {
      console.log('[CloudWorkspaces] 🔄 refreshAfterRestore: calling refresh() (reloads remote list + localWorkspaceNames)')
      await this.refresh()
      console.log('[CloudWorkspaces] 🔄 refreshAfterRestore: calling loadCurrentWorkspaceStatus()')
      await this.loadCurrentWorkspaceStatus()
      console.log('[CloudWorkspaces] 🔄 refreshAfterRestore: calling updateStatus()')
      await this.updateStatus()
      console.log('[CloudWorkspaces] 🔄 refreshAfterRestore: DONE ✅')
    } catch (e) {
      console.error('[CloudWorkspaces] 🔄 refreshAfterRestore: ERROR', e)
    }
  }

  /**
   * Prompt user to choose between clean restore and merge restore,
   * then execute the restore on the current workspace.
   */
  private async promptCleanOrMergeRestore(backupPath: string): Promise<void> {
    console.log('[CloudWorkspaces] 🔄 promptCleanOrMergeRestore called, backupPath:', backupPath)
    const restoreModeModal = {
      id: 'restoreModeModal',
      title: 'Restore Mode',
      message: 'This workspace has existing files. How should they be handled?',
      modalType: 'modal',
      okLabel: 'Clean Restore',
      cancelLabel: 'Merge',
      okFn: async () => {
        try {
          console.log('[CloudWorkspaces] 🔄 User chose: Clean Restore — calling s3Storage.restoreWorkspace')
          await this.call('s3Storage', 'restoreWorkspace', backupPath, { cleanRestore: true })
          console.log('[CloudWorkspaces] 🔄 Clean restore completed, now refreshing UI...')
          await this.refreshAfterRestore()
        } catch (e) {
          console.error('[CloudWorkspacesPlugin] Clean restore failed:', e)
          await this.call('notification', 'alert', {
            id: 'restoreError',
            title: 'Restore Failed',
            message: e.message || 'Failed to restore backup'
          })
        }
      },
      cancelFn: async () => {
        try {
          console.log('[CloudWorkspaces] 🔄 User chose: Merge — calling s3Storage.restoreWorkspace')
          await this.call('s3Storage', 'restoreWorkspace', backupPath, { cleanRestore: false })
          console.log('[CloudWorkspaces] 🔄 Merge restore completed, now refreshing UI...')
          await this.refreshAfterRestore()
        } catch (e) {
          console.error('[CloudWorkspacesPlugin] Merge restore failed:', e)
          await this.call('notification', 'alert', {
            id: 'restoreError',
            title: 'Restore Failed',
            message: e.message || 'Failed to restore backup'
          })
        }
      },
      hideFn: () => {
        console.log('[CloudWorkspaces] 🔄 Clean/Merge modal dismissed (hideFn)')
      }
    }
    console.log('[CloudWorkspaces] 🔄 Showing Clean/Merge modal...')
    await this.call('notification', 'modal', restoreModeModal)
    console.log('[CloudWorkspaces] 🔄 Clean/Merge modal call returned')
  }

  /**
   * Prompt the user for a workspace name and then restore the backup.
   * Pre-fills the input with the original workspace name from the backup metadata.
   * If a workspace with the chosen name already exists, offers to overwrite or try a different name.
   */
  private async promptAndRestoreToNewWorkspace(
    backupPath: string,
    options: { keepRemoteId: boolean }
  ): Promise<void> {
    console.log('[CloudWorkspaces] 🔄 promptAndRestoreToNewWorkspace called:', { backupPath, keepRemoteId: options.keepRemoteId })
    try {
      // Get backup metadata to find the original workspace name
      const backupInfo = await this.call('s3Storage', 'getBackupInfo', backupPath)
      const suggestedName = backupInfo.workspaceName || 'restored-workspace'
      console.log('[CloudWorkspaces] 🔄 Backup info:', { suggestedName, backupInfo })

      // Show prompt modal asking for workspace name
      const nameModal = {
        id: 'restoreWorkspaceNameModal',
        title: 'Choose Workspace Name',
        message: 'Enter a name for the restored workspace:',
        modalType: 'prompt' as any,
        okLabel: 'Restore',
        cancelLabel: 'Cancel',
        defaultValue: suggestedName,
        okFn: async (workspaceName: string) => {
          console.log('[CloudWorkspaces] 🔄 User entered workspace name:', workspaceName)
          if (!workspaceName || !workspaceName.trim()) {
            await this.call('notification', 'alert', {
              id: 'restoreError',
              title: 'Invalid Name',
              message: 'Workspace name cannot be empty.'
            })
            return
          }
          const trimmedName = workspaceName.trim()

          // Check if workspace already exists
          const workspaceExists = await this.call('filePanel', 'workspaceExists', trimmedName)
          console.log('[CloudWorkspaces] 🔄 Workspace exists check:', { trimmedName, workspaceExists })

          if (!workspaceExists) {
            // Doesn't exist — restore directly
            try {
              console.log('[CloudWorkspaces] 🔄 Workspace does not exist — calling restoreBackupToNewWorkspace')
              await this.call('s3Storage', 'restoreBackupToNewWorkspace', backupPath, {
                targetWorkspaceName: trimmedName,
                keepRemoteId: options.keepRemoteId
              })
              console.log('[CloudWorkspaces] 🔄 restoreBackupToNewWorkspace completed, now refreshing UI...')
              await this.refreshAfterRestore()
            } catch (e) {
              console.error('[CloudWorkspacesPlugin] Restore failed:', e)
              await this.call('notification', 'alert', {
                id: 'restoreError',
                title: 'Restore Failed',
                message: e.message || 'Failed to restore backup'
              })
            }
          } else {
            console.log('[CloudWorkspaces] 🔄 Workspace exists — showing overwrite modal')
            // Already exists — ask to overwrite or pick another name
            const overwriteModal = {
              id: 'restoreWorkspaceOverwriteModal',
              title: 'Workspace Already Exists',
              message: `A workspace named "${trimmedName}" already exists. Overwrite it?`,
              modalType: 'modal',
              okLabel: 'Overwrite',
              cancelLabel: 'Cancel',
              okFn: async () => {
                try {
                  console.log('[CloudWorkspaces] 🔄 User chose: Overwrite — calling restoreBackupToNewWorkspace')
                  await this.call('s3Storage', 'restoreBackupToNewWorkspace', backupPath, {
                    targetWorkspaceName: trimmedName,
                    overwriteIfExists: true,
                    keepRemoteId: options.keepRemoteId
                  })
                  console.log('[CloudWorkspaces] 🔄 Overwrite restore completed, now refreshing UI...')
                  await this.refreshAfterRestore()
                } catch (e) {
                  console.error('[CloudWorkspacesPlugin] Restore with overwrite failed:', e)
                  await this.call('notification', 'alert', {
                    id: 'restoreError',
                    title: 'Restore Failed',
                    message: e.message || 'Failed to restore backup'
                  })
                }
              },
              cancelFn: () => {
                console.log('[CloudWorkspaces] 🔄 User cancelled overwrite — re-prompting')
                // User cancelled overwrite — re-prompt with a different name
                this.promptAndRestoreToNewWorkspace(backupPath, options)
              },
              hideFn: () => {
                console.log('[CloudWorkspaces] 🔄 Overwrite modal dismissed (hideFn)')
              }
            }
            await this.call('notification', 'modal', overwriteModal)
          }
        },
        hideFn: () => {
          console.log('[CloudWorkspaces] 🔄 Name prompt modal dismissed (hideFn)')
        }
      }
      console.log('[CloudWorkspaces] 🔄 Showing name prompt modal...')
      await this.call('notification', 'modal', nameModal)
      console.log('[CloudWorkspaces] 🔄 Name prompt modal call returned')
    } catch (e) {
      console.error('[CloudWorkspacesPlugin] Restore to new workspace failed:', e)
      await this.call('notification', 'alert', {
        id: 'restoreError',
        title: 'Restore Failed',
        message: e.message || 'Failed to restore backup to new workspace'
      })
    }
  }

  async deleteBackup(backupFolder: string, backupFilename: string): Promise<void> {
    try {
      // Extract workspace ID from the backup folder path (first segment)
      const workspaceId = backupFolder.split('/')[0]

      await this.call('s3Storage', 'delete', backupFilename, backupFolder)

      // Invalidate cache and reload backups for this workspace
      if (workspaceId && this.state.workspaceBackups[workspaceId]) {
        // Mark as not loaded to force reload
        this.state.workspaceBackups[workspaceId] = {
          ...this.state.workspaceBackups[workspaceId],
          loaded: false
        }
        await this.loadBackups(workspaceId)
      }
    } catch (e) {
      console.error('[CloudWorkspacesPlugin] Delete failed:', e)
      throw e
    }
  }

  async downloadBackup(backupFolder: string, backupFilename: string): Promise<void> {
    try {
      await this.call('s3Storage', 'downloadToComputer', backupFilename, backupFolder)
    } catch (e) {
      console.error('[CloudWorkspacesPlugin] Download failed:', e)
      await this.call('notification', 'toast', `❌ Download failed: ${e.message}`)
      throw e
    }
  }

  setDispatch(dispatch: React.Dispatch<any>): void {
    this.dispatch = dispatch
    this.renderComponent()
  }

  render(): JSX.Element {
    return (
      <div id="cloudWorkspaces" className="h-100">
        <PluginViewWrapper plugin={this} />
      </div>
    )
  }

  updateComponent(state: CloudWorkspacesState): JSX.Element {
    return (
      <RemixUICloudWorkspaces
        plugin={this}
        workspaces={state.workspaces}
        selectedWorkspace={state.selectedWorkspace}
        workspaceBackups={state.workspaceBackups}
        expandedWorkspaces={state.expandedWorkspaces}
        loading={state.loading}
        error={state.error}
        isAuthenticated={state.isAuthenticated}
        currentWorkspaceStatus={state.currentWorkspaceStatus}
        onSelectWorkspace={(id) => this.selectWorkspace(id)}
        onCollapseWorkspace={(id) => this.collapseWorkspace(id)}
        onRestoreBackup={(folder, filename) => this.restoreBackup(folder, filename)}
        onDeleteBackup={(folder, filename) => this.deleteBackup(folder, filename)}
        onDownloadBackup={(folder, filename) => this.downloadBackup(folder, filename)}
        onRefresh={() => this.refresh()}
        onSaveToCloud={() => this.saveToCloud()}
        onCreateBackup={() => this.createBackup()}
        onRestoreAutosave={() => this.restoreAutosave()}
        onLinkToCurrentUser={() => this.linkToCurrentUser()}
        onEnableCloud={() => this.enableCloud()}
        onToggleAutosave={(enabled) => this.toggleAutosave(enabled)}
        onUpdateRemoteId={(workspaceName, remoteId) => this.updateWorkspaceRemoteId(workspaceName, remoteId)}
        onToggleEncryption={(enabled) => this.toggleEncryption(enabled)}
        onSetEncryptionPassphrase={(passphrase) => this.setEncryptionPassphrase(passphrase)}
        onGeneratePassphrase={() => this.generateNewPassphrase()}
        onClearPassphrase={() => this.clearEncryptionPassphrase()}
      />
    )
  }

  renderComponent(): void {
    this.dispatch({ ...this.state, expandedWorkspaces: new Set(this.state.expandedWorkspaces) })
  }
}
