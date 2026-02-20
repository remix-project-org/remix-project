/**
 * S3 Storage Plugin for Remix IDE
 * Provides cloud storage functionality using S3-compatible storage via presigned URLs
 *
 * This plugin:
 * - Uses the auth plugin to get access tokens
 * - Talks to the storage API to get presigned URLs
 * - Uploads/downloads files directly to/from S3
 * - Provides an abstraction layer for future storage providers
 */

import { Plugin } from '@remixproject/engine'
import {
  ApiClient,
  StorageConfig,
  StorageFile,
  StorageFilesResponse,
  StorageListOptions,
  StorageApiService
} from '@remix-api'
import { endpointUrls } from '@remix-endpoints-helper'

import {
  IStorageProvider,
  UploadOptions,
  DownloadOptions,
  StorageEvents,
  getMimeType,
  joinPath
} from './types'
import { S3StorageProvider } from './s3-provider'
import {
  generateWorkspaceId,
  isValidWorkspaceId,
  RemixConfig,
  RemoteWorkspaceConfig
} from './workspace-id'
import JSZip from 'jszip'
import {
  encryptToBytes,
  decryptFromBytes,
  generatePassphrase,
  storePassphraseInSession,
  getPassphraseFromSession,
  clearPassphraseFromSession,
  isEncryptionEnabled,
  setEncryptionEnabled,
  hasPassphraseAvailable
} from './encryption'

const REMIX_CONFIG_FILE = 'remix.config.json'
const LOCK_FILE_NAME = 'session.lock'
const CONTENT_HASH_FILE_NAME = 'content-hash.json'
const GIT_BACKUP_INFO_FILE = '_git_backup_info.json'
const LOCK_EXPIRY_MS = 2 * 60 * 1000 // 2 minutes - lock expires if not refreshed
const SESSION_STORAGE_KEY = 'remix-cloud-session-id'

/**
 * Compute a SHA-256 hash of workspace files content
 * Sorts files by path for consistent ordering
 * Excludes remix.config.json from hash since it contains lastSaveTime which changes on every save
 */
async function computeWorkspaceHash(files: Array<{ path: string; content: string }>): Promise<string> {
  // Filter out remix.config.json - it changes on every save (lastSaveTime, lastBackupTime)
  // We still want to back it up, but it shouldn't affect the "has content changed" check
  const hashableFiles = files.filter(f => !f.path.endsWith('remix.config.json'))

  // Sort files by path for consistent ordering
  const sortedFiles = [...hashableFiles].sort((a, b) => a.path.localeCompare(b.path))

  // Create a concatenated string of path:content pairs
  const contentStr = sortedFiles.map(f => `${f.path}:${f.content}`).join('\n')

  // Compute SHA-256 hash using Web Crypto API
  const encoder = new TextEncoder()
  const data = encoder.encode(contentStr)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)

  // Convert to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

  return hashHex
}

/**
 * Content hash metadata stored in S3
 */
interface ContentHashInfo {
  hash: string
  updatedAt: string
  fileCount: number
}

/**
 * Get or create a session ID for this browser tab.
 * Uses sessionStorage so the ID survives page refreshes but is unique per tab.
 * When the tab is closed, sessionStorage is cleared so a new ID is generated.
 */
function getOrCreateSessionId(): string {
  try {
    let sessionId = sessionStorage.getItem(SESSION_STORAGE_KEY)
    if (!sessionId) {
      sessionId = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
      sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId)
    }
    return sessionId
  } catch (e) {
    // sessionStorage might not be available (e.g., private browsing)
    // Fall back to generating a new ID each time
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
  }
}

/**
 * Get browser/platform info for lock file metadata
 */
function getBrowserInfo(): { browser: string; platform: string } {
  const ua = navigator.userAgent
  let browser = 'Unknown'

  if (ua.includes('Firefox')) browser = 'Firefox'
  else if (ua.includes('Edg')) browser = 'Edge'
  else if (ua.includes('Chrome')) browser = 'Chrome'
  else if (ua.includes('Safari')) browser = 'Safari'

  const platform = navigator.platform || 'Unknown'

  return { browser, platform }
}

/**
 * Lock file structure stored in S3
 */
interface LockFile {
  sessionId: string
  lockedAt: string // ISO timestamp (UTC)
  browser: string
  platform: string
}

/**
 * Lock check result
 */
interface LockCheckResult {
  isLocked: boolean
  ownedByUs: boolean
  lockInfo: LockFile | null
  expired: boolean
}

// Folders/patterns to exclude from workspace backup
const EXCLUDED_PATTERNS = [
  '.deps', // npm dependencies cached by Remix
  'artifacts', // compiled contract artifacts
  'node_modules', // node modules (shouldn't exist but just in case)
  '.cache', // cache folders
]

// .git is handled separately with a size cap rather than blanket exclusion
// Shallow single-branch clones (the dgit default) are typically small and should be preserved
const MAX_GIT_FOLDER_SIZE = 5 * 1024 * 1024 // 5MB

const profile = {
  name: 's3Storage',
  displayName: 'Cloud Storage',
  description: 'Cloud storage service for Remix IDE files using S3',
  methods: [
    'upload',
    'download',
    'downloadBinary',
    'downloadToComputer',
    'delete',
    'list',
    'listWorkspaces',
    'exists',
    'getMetadata',
    'getConfig',
    'isHealthy',
    'getProviderName',
    'getWorkspaceRemoteId',
    'setWorkspaceRemoteId',
    'ensureWorkspaceRemoteId',
    'checkWorkspaceOwnership',
    'getWorkspaceOwnership',
    'linkWorkspaceToCurrentUser',
    'backupWorkspace',
    'restoreWorkspace',
    'restoreBackupToNewWorkspace',
    'getBackupInfo',
    'saveToCloud',
    'forceSaveToCloud',
    'saveToCloudWithConflictCheck',
    'checkForConflict',
    'getLastSaveTime',
    'getLastBackupTime',
    'isAutosaveEnabled',
    'setAutosaveEnabled',
    'startAutosave',
    'stopAutosave',
    // Encryption
    'isEncryptionEnabled',
    'enableEncryption',
    'disableEncryption',
    'setEncryptionPassphrase',
    'hasEncryptionPassphrase',
    'generateEncryptionPassphrase',
    'clearEncryptionPassphrase'
  ],
  events: [
    'fileUploaded',
    'fileDeleted',
    'fileDownloaded',
    'uploadProgress',
    'downloadProgress',
    'error',
    'configLoaded',
    'backupCompleted',
    'saveCompleted',
    'restoreCompleted',
    'autosaveChanged',
    'conflictDetected',
    'autosaveStarted',
    'encryptionChanged',
    'passphraseRequired'
  ]
}

export class S3StoragePlugin extends Plugin {
  private provider: IStorageProvider | null = null
  private apiClient: ApiClient | null = null
  private storageApi: StorageApiService | null = null
  private config: StorageConfig | null = null

  // Session ID for lock-based conflict detection
  // Persisted in sessionStorage - survives page refresh but unique per tab
  private readonly sessionId: string = getOrCreateSessionId()
  private readonly browserInfo = getBrowserInfo()

  // Content hash cache - tracks last saved hash per workspace to avoid unnecessary uploads
  private lastSavedHashCache: Map<string, string> = new Map()

  // Track auth state so we only do full init on real state changes (not token refreshes)
  private wasAuthenticated: boolean = false

  constructor() {
    super(profile)
    console.log('[S3StoragePlugin] Session ID:', this.sessionId)
  }

  async onActivation(): Promise<void> {
    console.log('[S3StoragePlugin] Activated')

    // Initialize API client and provider
    await this.initializeProvider()

    // Listen for auth state changes (login / logout — NOT token refreshes)
    this.on('auth', 'authStateChanged', async (state: { isAuthenticated: boolean; token?: string }) => {
      if (state.isAuthenticated) {
        if (this.wasAuthenticated) {
          // Already authenticated — this is a redundant emit, skip full reload
          console.log('[S3StoragePlugin] authStateChanged: already authenticated, skipping re-init')
          if (state.token && this.apiClient) {
            this.apiClient.setToken(state.token)
          }
          return
        }
        // Genuine login — do full initialization
        console.log('[S3StoragePlugin] authStateChanged: user logged in, initializing')
        this.wasAuthenticated = true
        if (state.token && this.apiClient) {
          this.apiClient.setToken(state.token)
        }
        await this.initializeProvider()
        await this.loadConfig()
        await this.startAutosaveIfEnabled()
      } else {
        // Logged out
        console.log('[S3StoragePlugin] authStateChanged: user logged out')
        this.wasAuthenticated = false
        this.config = null
        this.stopAutosave()
      }
    })

    // Listen for token refresh — just update the API client token, no re-init needed
    this.on('auth', 'tokenRefreshed', async (data: { token: string }) => {
      if (this.apiClient && data.token) {
        this.apiClient.setToken(data.token)
        console.log('[S3StoragePlugin] Token refreshed, API client updated (no re-init)')
      }
    })

    // Start autosave on activation if user is already logged in and setting is enabled
    await this.startAutosaveIfEnabled()

    // Track file save activity for idle detection
    this.on('fileManager', 'fileSaved', () => {
      this.lastFileActivityTime = Date.now()
    })
  }

  // ==================== Autosave Functionality ====================

  private autosaveIntervalId: ReturnType<typeof setInterval> | null = null
  private static readonly AUTOSAVE_BACKUP_NAME = 'autosave-backup.zip'
  private static readonly DEFAULT_AUTOSAVE_INTERVAL = 1 * 60 * 1000 // 1 minute
  private static readonly IDLE_TIME_BEFORE_AUTOSAVE = 30 * 1000 // 30 seconds of inactivity required

  /** Timestamp of last file save activity - used for idle detection */
  private lastFileActivityTime: number = 0

  /**
   * Check if autosave is enabled in settings
   */
  async isAutosaveEnabled(): Promise<boolean> {
    try {
      const enabled = await this.call('settings', 'get', 'settings/cloud-storage/autosave')
      return enabled === true
    } catch {
      return false
    }
  }

  /**
   * Set autosave enabled/disabled
   */
  async setAutosaveEnabled(enabled: boolean): Promise<void> {
    await this.call('settings', 'set', 'settings/cloud-storage/autosave', enabled)
    if (enabled) {
      await this.startAutosave()
    } else {
      this.stopAutosave()
    }
    this.emit('autosaveChanged', { enabled })
  }

  /**
   * Start autosave if enabled and user is authenticated
   */
  private async startAutosaveIfEnabled(): Promise<void> {
    try {
      const isAuth = await this.call('auth', 'isAuthenticated')
      if (!isAuth) {
        return
      }

      const enabled = await this.isAutosaveEnabled()
      if (enabled) {
        await this.startAutosave()
      }
    } catch (e) {
      console.error('[S3StoragePlugin] Failed to check autosave settings:', e)
    }
  }

  /**
   * Start the autosave interval
   */
  async startAutosave(): Promise<void> {
    // Stop any existing interval
    this.stopAutosave()

    console.log('[S3StoragePlugin] 🔄 Starting autosave (every 5 minutes)')

    // Don't run immediately - wait for the first interval
    // This avoids triggering conflict detection right when user enables autosave
    this.autosaveIntervalId = setInterval(async () => {
      await this.runAutosave()
    }, S3StoragePlugin.DEFAULT_AUTOSAVE_INTERVAL)
  }

  /**
   * Stop the autosave interval and release the lock
   */
  async stopAutosave(): Promise<void> {
    if (this.autosaveIntervalId) {
      clearInterval(this.autosaveIntervalId)
      this.autosaveIntervalId = null
      console.log('[S3StoragePlugin] ⏹️ Autosave stopped')

      // Release lock when autosave is disabled
      try {
        const workspaceRemoteId = await this.getWorkspaceRemoteId()
        if (workspaceRemoteId) {
          await this.releaseLock(workspaceRemoteId)
        }
      } catch (e) {
        console.warn('[S3StoragePlugin] Could not release lock on stop:', e)
      }
    }
  }

  // ==================== Encryption ====================

  /**
   * Check if encryption is enabled for cloud storage
   */
  isEncryptionEnabled(): boolean {
    return isEncryptionEnabled()
  }

  /**
   * Enable encryption for cloud storage
   * User must set a passphrase after enabling
   */
  enableEncryption(): void {
    setEncryptionEnabled(true)
    this.emit('encryptionChanged', { enabled: true })
    console.log('[S3StoragePlugin] 🔐 Encryption enabled')
  }

  /**
   * Disable encryption for cloud storage
   * WARNING: Future uploads will be unencrypted
   */
  disableEncryption(): void {
    setEncryptionEnabled(false)
    clearPassphraseFromSession()
    this.emit('encryptionChanged', { enabled: false })
    console.log('[S3StoragePlugin] 🔓 Encryption disabled')
  }

  /**
   * Set the encryption passphrase for this session
   * The passphrase is stored in sessionStorage (survives refresh, cleared on tab close)
   *
   * @param passphrase - The user's encryption passphrase
   */
  setEncryptionPassphrase(passphrase: string): void {
    if (!passphrase || passphrase.length < 8) {
      throw new Error('Passphrase must be at least 8 characters')
    }
    storePassphraseInSession(passphrase)
    console.log('[S3StoragePlugin] 🔑 Encryption passphrase set')
  }

  /**
   * Check if a passphrase is available in the current session
   */
  hasEncryptionPassphrase(): boolean {
    return hasPassphraseAvailable()
  }

  /**
   * Generate a random passphrase that users can save
   * Format: 6 random words separated by dashes (e.g., "alpha-coral-frost-lunar-storm-yacht")
   *
   * @returns A randomly generated passphrase
   */
  generateEncryptionPassphrase(): string {
    return generatePassphrase()
  }

  /**
   * Clear the passphrase from session storage
   * User will need to re-enter it to access encrypted data
   */
  clearEncryptionPassphrase(): void {
    clearPassphraseFromSession()
    console.log('[S3StoragePlugin] 🔑 Encryption passphrase cleared')
  }

  /**
   * Get the passphrase from session, or emit event if not available
   * @returns The passphrase or null if not available
   */
  private getPassphraseOrPrompt(): string | null {
    const passphrase = getPassphraseFromSession()
    if (!passphrase && isEncryptionEnabled()) {
      this.emit('passphraseRequired', {})
    }
    return passphrase
  }

  // ==================== Content Hash (Deduplication) ====================

  /**
   * Get the content hash for a workspace from S3
   * @param workspaceRemoteId - The workspace remote ID
   * @returns The stored hash info or null if not found
   */
  private async getRemoteContentHash(workspaceRemoteId: string): Promise<ContentHashInfo | null> {
    try {
      const provider = this.ensureProvider()
      const hashPath = joinPath(`${workspaceRemoteId}/autosave`, CONTENT_HASH_FILE_NAME)

      const content = await provider.download(hashPath)
      return JSON.parse(content) as ContentHashInfo
    } catch (e) {
      // File doesn't exist or couldn't be parsed - that's fine, just means no previous hash
      return null
    }
  }

  /**
   * Save the content hash for a workspace to S3
   * @param workspaceRemoteId - The workspace remote ID
   * @param hash - The computed content hash
   * @param fileCount - Number of files in the workspace
   */
  private async saveRemoteContentHash(workspaceRemoteId: string, hash: string, fileCount: number): Promise<void> {
    try {
      const provider = this.ensureProvider()
      const hashInfo: ContentHashInfo = {
        hash,
        updatedAt: new Date().toISOString(),
        fileCount
      }
      const hashPath = joinPath(`${workspaceRemoteId}/autosave`, CONTENT_HASH_FILE_NAME)
      await provider.upload(hashPath, JSON.stringify(hashInfo, null, 2), 'application/json')

      // Update local cache
      this.lastSavedHashCache.set(workspaceRemoteId, hash)
    } catch (e) {
      console.warn('[S3StoragePlugin] Could not save content hash:', e)
    }
  }

  /**
   * Check if workspace content has changed since last save
   * Uses both memory cache (fast) and S3 hash file (for cross-tab/refresh scenarios)
   *
   * @param workspaceRemoteId - The workspace remote ID
   * @param files - The current workspace files
   * @returns true if content has changed or hash is unknown, false if unchanged
   */
  private async hasContentChanged(
    workspaceRemoteId: string,
    files: Array<{ path: string; content: string }>
  ): Promise<{ changed: boolean; currentHash: string }> {
    const currentHash = await computeWorkspaceHash(files)

    // First check memory cache (fastest)
    const cachedHash = this.lastSavedHashCache.get(workspaceRemoteId)
    if (cachedHash === currentHash) {
      console.log('[S3StoragePlugin] 📋 Content unchanged (memory cache hit)')
      return { changed: false, currentHash }
    }

    // If not in memory cache, check S3 (for cross-tab or after refresh)
    const remoteHashInfo = await this.getRemoteContentHash(workspaceRemoteId)
    if (remoteHashInfo?.hash === currentHash) {
      // Update memory cache for future checks
      this.lastSavedHashCache.set(workspaceRemoteId, currentHash)
      console.log('[S3StoragePlugin] 📋 Content unchanged (S3 hash match)')
      return { changed: false, currentHash }
    }

    console.log('[S3StoragePlugin] 📝 Content has changed, will upload')
    return { changed: true, currentHash }
  }

  /**
   * Run a single autosave backup
   */
  private async runAutosave(): Promise<void> {
    try {
      // Check if user has been idle long enough
      // Don't autosave while user is actively editing - wait for idle time
      const timeSinceLastActivity = Date.now() - this.lastFileActivityTime
      if (this.lastFileActivityTime > 0 && timeSinceLastActivity < S3StoragePlugin.IDLE_TIME_BEFORE_AUTOSAVE) {
        console.log(`[S3StoragePlugin] ⏳ User active (${Math.round(timeSinceLastActivity / 1000)}s ago), deferring autosave`)
        return
      }

      // Check if user is still authenticated
      const isAuth = await this.call('auth', 'isAuthenticated')
      if (!isAuth) {
        this.stopAutosave()
        return
      }

      const workspaceRemoteId = await this.getWorkspaceRemoteId()
      if (!workspaceRemoteId) {
        console.log('[S3StoragePlugin] No workspace remote ID, skipping autosave')
        return
      }

      // Collect files first to check if content has changed
      const files = await this.collectWorkspaceFiles()

      // Check if content has actually changed since last save
      const { changed, currentHash } = await this.hasContentChanged(workspaceRemoteId, files)
      if (!changed) {
        console.log('[S3StoragePlugin] ⏭️ Skipping autosave - no content changes')
        return
      }

      // Check for lock conflicts before autosave
      const lockCheck = await this.checkLock(workspaceRemoteId)
      if (lockCheck.isLocked && !lockCheck.ownedByUs && !lockCheck.expired) {
        console.warn('[S3StoragePlugin] ⚠️ Workspace is locked by another session')
        this.emit('conflictDetected', {
          hasConflict: true,
          lockInfo: lockCheck.lockInfo,
          source: 'autosave'
        })
        return
      }

      // Get workspace name for filename
      let workspaceName = 'workspace'
      try {
        const currentWorkspace = await this.call('filePanel', 'getCurrentWorkspace')
        workspaceName = currentWorkspace?.name || 'workspace'
      } catch (e) {
        console.warn('[S3StoragePlugin] Could not get workspace name:', e)
      }

      console.log('[S3StoragePlugin] 💾 Running autosave backup...')
      this.emit('autosaveStarted', { workspaceRemoteId })

      // Acquire/refresh the lock
      await this.acquireLock(workspaceRemoteId)

      // Create backup with workspace name in filename (overwrites previous autosave)
      const sanitizedName = workspaceName.replace(/[^a-zA-Z0-9-_]/g, '-')
      const backupKey = await this.createBackupFromFiles(
        files,
        `${sanitizedName}-autosave.zip`,
        `${workspaceRemoteId}/autosave`
      )

      // Save the content hash to S3 (for cross-tab deduplication)
      await this.saveRemoteContentHash(workspaceRemoteId, currentHash, files.length)

      // Update last save time
      await this.updateLastSaveTime()
      this.emit('saveCompleted', { workspaceRemoteId })

      console.log(`[S3StoragePlugin] ✅ Autosave completed: ${backupKey}`)

    } catch (error) {
      console.error('[S3StoragePlugin] Autosave failed:', error)
      // Don't show error to user - autosave is background task
    }
  }

  /**
   * Create a backup with a specific filename
   * This is a helper used by both backupWorkspace and autosave
   * If encryption is enabled and passphrase is available, encrypts the backup
   */
  private async createBackup(filename: string, folder: string): Promise<string> {
    // Get all files in workspace (excluding .deps, artifacts, etc.)
    const files = await this.collectWorkspaceFiles()
    return this.createBackupFromFiles(files, filename, folder)
  }

  /**
   * Check if .git was excluded from collected files and prompt the user with a modal dialog.
   * Returns true if the user wants to proceed, false if they cancelled.
   * For autosave, this is skipped (returns true silently).
   */
  private async promptIfGitExcluded(
    files: Array<{ path: string; content: string }> & { gitIncluded?: boolean; gitExcludedReason?: string }
  ): Promise<boolean> {
    if (files.gitIncluded !== false || !files.gitExcludedReason) {
      // .git was included or doesn't exist — no prompt needed
      return true
    }

    // Collect git info for the dialog
    const gitInfo = await this.collectGitMetadata()
    const remoteUrl = gitInfo?.remotes?.find(r => r.name === 'origin')?.url
    const branch = gitInfo?.branch || 'unknown'

    const sizeParts = files.gitExcludedReason.match(/([\d.]+\s*[KMGT]?B)/gi)
    const sizeText = sizeParts?.[0] || 'too large'

    let message = `The .git folder in this workspace is ${sizeText} and exceeds the cloud backup size limit.\n\n`
    message += `Git history will NOT be included in this backup. Your source files will still be saved.\n\n`
    if (remoteUrl) {
      message += `Remote: ${remoteUrl}\nBranch: ${branch}\n\n`
      message += `To preserve git history, push your changes to the remote before backing up.`
    } else {
      message += `This workspace has no git remote configured. Add a remote and push to preserve git history.`
    }

    const result = await this.call('notification', 'modal', {
      id: 'gitExcludedFromBackup',
      title: '⚠️ Git History Too Large for Cloud Backup',
      message,
      okLabel: 'Continue without git history',
      cancelLabel: 'Cancel backup'
    })

    return result // true if OK, false/undefined if cancelled
  }

  /**
   * Collect git metadata (remotes, branch, commit hash) if workspace is a git repo.
   * Returns null if the workspace is not a git repo.
   */
  private async collectGitMetadata(): Promise<{
    isGitRepo: boolean;
    remotes: Array<{ name: string; url: string }>;
    branch: string | null;
    commitHash: string | null;
  } | null> {
    try {
      // Check if .git exists in the workspace
      const hasGit = await this.call('fileManager', 'exists', '.git')
      console.log('[S3StoragePlugin] 🔍 collectGitMetadata: .git exists =', hasGit)
      if (!hasGit) return null

      let remotes: Array<{ name: string; url: string }> = []
      let branch: string | null = null
      let commitHash: string | null = null

      try {
        const remotesList = await this.call('dgitApi', 'remotes')
        if (remotesList && Array.isArray(remotesList)) {
          remotes = remotesList.map((r: any) => ({ name: r.name, url: r.url }))
        }
      } catch (e) {
        console.warn('[S3StoragePlugin] Could not get git remotes:', e)
      }

      try {
        const branchInfo = await this.call('dgitApi', 'currentbranch', { checkout: true })
        if (branchInfo) {
          branch = branchInfo.name || null
        }
      } catch (e) {
        console.warn('[S3StoragePlugin] Could not get current branch:', e)
      }

      try {
        commitHash = await this.call('dgitApi', 'resolveref', { ref: 'HEAD' })
      } catch (e) {
        console.warn('[S3StoragePlugin] Could not get HEAD commit hash:', e)
      }

      console.log('[S3StoragePlugin] 🔍 collectGitMetadata result:', { isGitRepo: true, remotes, branch, commitHash })
      return { isGitRepo: true, remotes, branch, commitHash }
    } catch (e) {
      console.warn('[S3StoragePlugin] Error checking git status:', e)
      return null
    }
  }

  /**
   * Create a backup from pre-collected files
   * Used when files are already collected (e.g., for hash checking before upload)
   */
  private async createBackupFromFiles(
    files: Array<{ path: string; content: string }>,
    filename: string,
    folder: string
  ): Promise<string> {
    const provider = this.ensureProvider()

    // Get current workspace name for metadata
    let workspaceName = 'unknown'
    try {
      const currentWorkspace = await this.call('filePanel', 'getCurrentWorkspace')
      workspaceName = currentWorkspace?.name || 'unknown'
    } catch (e) {
      console.warn('[S3StoragePlugin] Could not get workspace name:', e)
    }

    // Create zip with compression
    const zip = new JSZip()

    const workspaceRemoteId = await this.getWorkspaceRemoteId()

    // Collect git metadata if this is a git repo
    const gitInfo = await this.collectGitMetadata()
    console.log('[S3StoragePlugin] 🔍 createBackupFromFiles: gitInfo =', gitInfo)

    // Check if .git was included in the files (collected by collectWorkspaceFiles)
    const filesWithGitInfo = files as Array<{ path: string; content: string }> & { gitIncluded?: boolean; gitExcludedReason?: string }
    const gitIncluded = filesWithGitInfo.gitIncluded === true
    const gitExcludedReason = filesWithGitInfo.gitExcludedReason
    console.log('[S3StoragePlugin] 🔍 createBackupFromFiles: gitIncluded =', gitIncluded, ', gitExcludedReason =', gitExcludedReason, ', filesWithGitInfo.gitIncluded =', filesWithGitInfo.gitIncluded)

    // Add metadata inside the zip (for when zip is downloaded/inspected)
    const zipMetadata = {
      createdAt: new Date().toISOString(),
      fileCount: files.length,
      workspaceRemoteId,
      workspaceName,
      isAutosave: folder.includes('autosave'),
      isGitRepo: !!gitInfo,
      gitIncluded
    }

    // Add all files to zip
    for (const file of files) {
      // Remove leading slash for zip path
      const zipPath = file.path.replace(/^\//, '')
      zip.file(zipPath, file.content)
    }

    // Add metadata file inside zip
    zip.file('_backup_metadata.json', JSON.stringify(zipMetadata, null, 2))

    // Add git metadata file only if .git was NOT included (as fallback info for restore)
    if (gitInfo && !gitIncluded) {
      const gitBackupInfo = {
        ...gitInfo,
        capturedAt: new Date().toISOString(),
        gitExcludedReason,
        note: 'The .git folder was too large to include in this backup. Use the remote URL to re-clone or re-initialize git after restoring.'
      }
      zip.file(GIT_BACKUP_INFO_FILE, JSON.stringify(gitBackupInfo, null, 2))
      console.log('[S3StoragePlugin] 📋 Git metadata captured (git folder excluded due to size):', gitBackupInfo)

      // Note: for manual saves/backups, the user was already prompted via promptIfGitExcluded()
      // For autosaves, we silently continue — the git metadata file preserves the info for restore
    } else if (gitInfo && gitIncluded) {
      console.log('[S3StoragePlugin] ✅ Git folder included in backup — no metadata fallback needed')
    }

    // Generate compressed zip
    let zipContent = await zip.generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    })

    // Check if encryption is enabled
    let finalFilename = filename
    let contentType = 'application/zip'

    if (isEncryptionEnabled()) {
      const passphrase = this.getPassphraseOrPrompt()
      if (passphrase) {
        console.log('[S3StoragePlugin] 🔐 Encrypting backup...')
        zipContent = await encryptToBytes(zipContent, passphrase)
        // Add .enc suffix to indicate encrypted
        finalFilename = filename.replace('.zip', '.zip.enc')
        contentType = 'application/octet-stream'
        console.log('[S3StoragePlugin] ✅ Backup encrypted')
      } else {
        // Encryption enabled but no passphrase - emit event and skip upload
        console.warn('[S3StoragePlugin] ⚠️ Encryption enabled but no passphrase available')
        throw new Error('Encryption is enabled but no passphrase is set. Please enter your passphrase.')
      }
    }

    // Upload to S3 with metadata
    const fullPath = joinPath(folder, finalFilename)
    const s3Metadata: Record<string, string> = {
      'workspace-name': workspaceName,
      'file-count': String(files.length),
      'is-encrypted': String(isEncryptionEnabled() && !!this.getPassphraseOrPrompt())
    }
    const key = await provider.upload(fullPath, zipContent, contentType, s3Metadata)

    return key
  }

  // ==================== Workspace Remote ID Management ====================

  /**
   * Get the current remix.config.json content
   */
  private async getRemixConfig(): Promise<RemixConfig | null> {
    try {
      const exists = await this.call('fileManager', 'exists', REMIX_CONFIG_FILE)
      if (!exists) {
        return null
      }

      const content = await this.call('fileManager', 'readFile', REMIX_CONFIG_FILE)
      return JSON.parse(content)
    } catch (error) {
      console.error('[S3StoragePlugin] Failed to read remix.config.json:', error)
      return null
    }
  }

  /**
   * Save remix.config.json
   */
  private async saveRemixConfig(config: RemixConfig): Promise<void> {
    await this.call('fileManager', 'writeFile', REMIX_CONFIG_FILE, JSON.stringify(config, null, 2))
  }

  /**
   * Get the workspace remote ID from remix.config.json
   * Returns null if not configured
   */
  async getWorkspaceRemoteId(): Promise<string | null> {
    const config = await this.getRemixConfig()
    return config?.['remote-workspace']?.remoteId || null
  }

  /**
   * Ensure the workspace has a remote ID, creating one if needed
   * @returns The workspace remote ID
   */
  async ensureWorkspaceRemoteId(): Promise<string> {
    // Check if we already have a remote ID
    let config = await this.getRemixConfig()

    if (config?.['remote-workspace']?.remoteId) {
      const existingId = config['remote-workspace'].remoteId
      // Accept any existing ID (don't validate format - user might have set their own)
      if (existingId && typeof existingId === 'string' && existingId.trim().length > 0) {
        console.log('[S3StoragePlugin] Using existing workspace remote ID:', existingId)
        return existingId
      }
    }

    // Generate a new remote ID
    const newRemoteId = generateWorkspaceId()
    console.log('[S3StoragePlugin] Generated new workspace remote ID:', newRemoteId)

    // Get current user ID to associate with this workspace
    let userId: string | undefined
    try {
      const user = await this.call('auth', 'getUser')
      userId = user?.sub
    } catch (e) {
      console.warn('[S3StoragePlugin] Could not get user ID:', e)
    }

    // Create or update config
    if (!config) {
      config = {}
    }

    config['remote-workspace'] = {
      remoteId: newRemoteId,
      userId,
      createdAt: new Date().toISOString()
    }

    // Save the config
    await this.saveRemixConfig(config)

    await this.call('notification', 'toast', `🔗 Workspace linked to cloud: ${newRemoteId}`)

    return newRemoteId
  }

  /**
   * Set a custom remote ID for the workspace
   * @param workspaceName - The local workspace name (not used if we're in the active workspace)
   * @param remoteId - The new remote ID to set
   */
  async setWorkspaceRemoteId(workspaceName: string, remoteId: string): Promise<void> {
    if (!remoteId || typeof remoteId !== 'string' || !remoteId.trim()) {
      throw new Error('Invalid remote ID')
    }

    const sanitizedId = remoteId.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-')

    // Get current user ID
    let userId: string | undefined
    try {
      const user = await this.call('auth', 'getUser')
      userId = user?.sub
    } catch (e) {
      console.warn('[S3StoragePlugin] Could not get user ID:', e)
    }

    let config = await this.getRemixConfig()
    if (!config) {
      config = {}
    }

    const existingConfig = config['remote-workspace'] as RemoteWorkspaceConfig | undefined

    // New remote ID means a fresh cloud link — clear stale timestamps
    config['remote-workspace'] = {
      remoteId: sanitizedId,
      userId,
      createdAt: new Date().toISOString()
    }

    await this.saveRemixConfig(config)
    console.log('[S3StoragePlugin] Updated workspace remote ID to:', sanitizedId)
  }

  /**
   * Check if the current user owns the workspace cloud link
   * @returns Object with ownership status and details
   */
  async checkWorkspaceOwnership(): Promise<{ isOwner: boolean; hasRemoteId: boolean; userId?: string }> {
    const config = await this.getRemixConfig()
    const remoteConfig = config?.['remote-workspace']

    if (!remoteConfig?.remoteId) {
      return { isOwner: true, hasRemoteId: false } // No remote ID = user can link it
    }

    // If no userId stored (legacy), consider it owned by current user
    if (!remoteConfig.userId) {
      return { isOwner: true, hasRemoteId: true }
    }

    // Check if current user matches
    try {
      const user = await this.call('auth', 'getUser')
      const currentUserId = user?.sub

      if (!currentUserId) {
        // Not logged in - can't determine ownership
        return { isOwner: false, hasRemoteId: true, userId: remoteConfig.userId }
      }

      const isOwner = currentUserId === remoteConfig.userId
      return { isOwner, hasRemoteId: true, userId: remoteConfig.userId }
    } catch (e) {
      console.warn('[S3StoragePlugin] Could not check ownership:', e)
      return { isOwner: false, hasRemoteId: true, userId: remoteConfig.userId }
    }
  }

  /**
   * Get workspace ownership details for UI display
   */
  async getWorkspaceOwnership(): Promise<{
    remoteId: string | null
    ownedByCurrentUser: boolean
    linkedToAnotherUser: boolean
    canSave: boolean
  }> {
    const ownership = await this.checkWorkspaceOwnership()

    return {
      remoteId: ownership.hasRemoteId ? (await this.getWorkspaceRemoteId()) : null,
      ownedByCurrentUser: ownership.isOwner && ownership.hasRemoteId,
      linkedToAnotherUser: !ownership.isOwner && ownership.hasRemoteId,
      canSave: ownership.isOwner // Can only save if owner or not linked
    }
  }

  /**
   * Link (or re-link) the workspace to the current user's cloud
   * Creates a new remote ID and associates it with the current user
   */
  async linkWorkspaceToCurrentUser(): Promise<string> {
    // Get current user
    const user = await this.call('auth', 'getUser')
    if (!user?.sub) {
      throw new Error('You must be logged in to link a workspace')
    }

    // Generate a new remote ID
    const newRemoteId = generateWorkspaceId()
    console.log('[S3StoragePlugin] Linking workspace to current user with new ID:', newRemoteId)

    let config = await this.getRemixConfig()
    if (!config) {
      config = {}
    }

    // Create fresh config for this user (don't carry over old timestamps)
    config['remote-workspace'] = {
      remoteId: newRemoteId,
      userId: user.sub,
      createdAt: new Date().toISOString()
    }

    await this.saveRemixConfig(config)

    await this.call('notification', 'toast', `🔗 Workspace linked to your cloud: ${newRemoteId}`)

    return newRemoteId
  }

  /**
   * Get the last save time for the current workspace
   */
  async getLastSaveTime(workspaceName?: string): Promise<string | null> {
    const config = await this.getRemixConfig()
    return config?.['remote-workspace']?.lastSaveAt || null
  }

  /**
   * Get the last backup time for the current workspace
   */
  async getLastBackupTime(workspaceName?: string): Promise<string | null> {
    const config = await this.getRemixConfig()
    return config?.['remote-workspace']?.lastBackupAt || null
  }

  /**
   * Update the last save time in config
   */
  private async updateLastSaveTime(): Promise<void> {
    const config = await this.getRemixConfig()
    if (!config || !config['remote-workspace']) return

    config['remote-workspace'].lastSaveAt = new Date().toISOString()
    await this.saveRemixConfig(config)
  }

  /**
   * Update the last backup time in config
   */
  private async updateLastBackupTime(): Promise<void> {
    const config = await this.getRemixConfig()
    if (!config || !config['remote-workspace']) return

    config['remote-workspace'].lastBackupAt = new Date().toISOString()
    await this.saveRemixConfig(config)
  }

  // ==================== Lock-based Conflict Detection ====================

  /**
   * Acquire or refresh the lock for this workspace
   * Updates the lock file with our session ID
   */
  private async acquireLock(workspaceRemoteId: string): Promise<void> {
    const provider = this.ensureProvider()

    const lockData: LockFile = {
      sessionId: this.sessionId,
      lockedAt: new Date().toISOString(),
      browser: this.browserInfo.browser,
      platform: this.browserInfo.platform
    }

    const lockPath = `${workspaceRemoteId}/${LOCK_FILE_NAME}`
    await provider.upload(lockPath, JSON.stringify(lockData, null, 2), 'application/json')
    console.log('[S3StoragePlugin] 🔒 Lock acquired/refreshed:', lockPath)
  }

  /**
   * Check if the workspace is locked by another session
   * Uses S3's lastModified timestamp (server time) to avoid clock skew issues
   */
  private async checkLock(workspaceRemoteId: string): Promise<LockCheckResult> {
    try {
      const folder = workspaceRemoteId
      const result = await this.list({ folder })
      const lockFile = result.files.find(f => f.filename === LOCK_FILE_NAME)

      if (!lockFile) {
        // No lock file exists
        return { isLocked: false, ownedByUs: false, lockInfo: null, expired: false }
      }

      // Check if lock is expired using S3's lastModified (server time)
      const lockTime = new Date(lockFile.lastModified || lockFile.uploadedAt).getTime()
      const now = Date.now()
      const expired = (now - lockTime) > LOCK_EXPIRY_MS

      // Download lock file to check session ID
      const provider = this.ensureProvider()
      const lockContent = await provider.download(`${workspaceRemoteId}/${LOCK_FILE_NAME}`)
      const lockInfo: LockFile = JSON.parse(lockContent)

      const ownedByUs = lockInfo.sessionId === this.sessionId

      console.log('[S3StoragePlugin] 🔍 Lock check:', {
        ownedByUs,
        expired,
        lockSessionId: lockInfo.sessionId,
        ourSessionId: this.sessionId,
        lockAge: Math.round((now - lockTime) / 1000) + 's'
      })

      return {
        isLocked: true,
        ownedByUs,
        lockInfo,
        expired
      }
    } catch (e) {
      // Error reading lock - treat as no lock
      console.log('[S3StoragePlugin] Could not read lock file, treating as unlocked:', e)
      return { isLocked: false, ownedByUs: false, lockInfo: null, expired: false }
    }
  }

  /**
   * Release the lock for this workspace
   * Called when autosave is disabled or on cleanup
   */
  private async releaseLock(workspaceRemoteId: string): Promise<void> {
    try {
      const provider = this.ensureProvider()
      await provider.delete(`${workspaceRemoteId}/${LOCK_FILE_NAME}`)
      console.log('[S3StoragePlugin] 🔓 Lock released')
    } catch (e) {
      console.warn('[S3StoragePlugin] Could not release lock:', e)
    }
  }

  /**
   * Check if there's a conflict with the remote version
   * Returns conflict info if workspace is locked by another session
   */
  async checkForConflict(): Promise<{ hasConflict: boolean; lockInfo: LockFile | null }> {
    const workspaceRemoteId = await this.getWorkspaceRemoteId()
    if (!workspaceRemoteId) {
      return { hasConflict: false, lockInfo: null }
    }

    const lockCheck = await this.checkLock(workspaceRemoteId)

    // Conflict if locked by another session and not expired
    const hasConflict = lockCheck.isLocked && !lockCheck.ownedByUs && !lockCheck.expired

    if (hasConflict) {
      console.warn('[S3StoragePlugin] ⚠️ Conflict detected! Workspace locked by:', lockCheck.lockInfo)
    }

    return { hasConflict, lockInfo: lockCheck.lockInfo }
  }

  /**
   * Save the current workspace to cloud (immediate save to autosave slot)
   * This is a manual trigger for the autosave functionality
   * Includes conflict detection - will emit conflictDetected event if remote was modified
   */
  async saveToCloud(): Promise<void> {
    console.log('[S3StoragePlugin] Manual save to cloud triggered')

    // Check ownership first
    const ownership = await this.checkWorkspaceOwnership()
    if (!ownership.isOwner && ownership.hasRemoteId) {
      throw new Error("This workspace is linked to another user's cloud storage. Use 'Link to my account' to create your own cloud link.")
    }

    const workspaceRemoteId = await this.ensureWorkspaceRemoteId()
    if (!workspaceRemoteId) {
      throw new Error('No workspace remote ID configured')
    }

    // Check for lock conflicts before saving
    const conflictInfo = await this.checkForConflict()
    if (conflictInfo.hasConflict) {
      console.warn('[S3StoragePlugin] ⚠️ Conflict detected on manual save')
      this.emit('conflictDetected', {
        ...conflictInfo,
        source: 'manual'
      })
      return // Don't save - let user resolve via modal
    }

    // Get workspace name for filename
    let workspaceName = 'workspace'
    try {
      const currentWorkspace = await this.call('filePanel', 'getCurrentWorkspace')
      workspaceName = currentWorkspace?.name || 'workspace'
    } catch (e) {
      console.warn('[S3StoragePlugin] Could not get workspace name:', e)
    }

    // Collect files for backup and hash
    const files = await this.collectWorkspaceFiles()

    // Prompt user if .git was excluded due to size
    const proceed = await this.promptIfGitExcluded(files)
    if (!proceed) {
      console.log('[S3StoragePlugin] Save cancelled by user (git exclusion dialog)')
      return
    }

    await this.call('notification', 'toast', '☁️ Saving to cloud...')

    const currentHash = await computeWorkspaceHash(files)

    // Acquire lock and save
    await this.acquireLock(workspaceRemoteId)

    const folder = `${workspaceRemoteId}/autosave`
    const sanitizedName = workspaceName.replace(/[^a-zA-Z0-9-_]/g, '-')
    const filename = `${sanitizedName}-autosave.zip`

    await this.createBackupFromFiles(files, filename, folder)

    // Save content hash for future deduplication
    await this.saveRemoteContentHash(workspaceRemoteId, currentHash, files.length)

    await this.updateLastSaveTime()

    console.log('[S3Storage] Emitting saveCompleted event', { workspaceRemoteId })
    this.emit('saveCompleted', { workspaceRemoteId })
    await this.call('notification', 'toast', '✅ Saved to cloud')
  }

  /**
   * Force save to cloud, bypassing conflict detection
   * Used when user explicitly chooses to overwrite remote (takes over the lock)
   */
  async forceSaveToCloud(): Promise<void> {
    console.log('[S3StoragePlugin] Force save to cloud (taking over lock)')

    const workspaceRemoteId = await this.ensureWorkspaceRemoteId()
    if (!workspaceRemoteId) {
      throw new Error('No workspace remote ID configured')
    }

    let workspaceName = 'workspace'
    try {
      const currentWorkspace = await this.call('filePanel', 'getCurrentWorkspace')
      workspaceName = currentWorkspace?.name || 'workspace'
    } catch (e) {
      console.warn('[S3StoragePlugin] Could not get workspace name:', e)
    }

    // Collect files for backup and hash
    const files = await this.collectWorkspaceFiles()

    // Prompt user if .git was excluded due to size
    const proceed = await this.promptIfGitExcluded(files)
    if (!proceed) {
      console.log('[S3StoragePlugin] Force save cancelled by user (git exclusion dialog)')
      return
    }

    await this.call('notification', 'toast', '☁️ Saving to cloud...')

    const currentHash = await computeWorkspaceHash(files)

    // Force acquire lock (takes over from other session)
    await this.acquireLock(workspaceRemoteId)

    const folder = `${workspaceRemoteId}/autosave`
    const sanitizedName = workspaceName.replace(/[^a-zA-Z0-9-_]/g, '-')
    const filename = `${sanitizedName}-autosave.zip`

    await this.createBackupFromFiles(files, filename, folder)

    // Save content hash for future deduplication
    await this.saveRemoteContentHash(workspaceRemoteId, currentHash, files.length)

    await this.updateLastSaveTime()

    this.emit('saveCompleted', { workspaceRemoteId })
    await this.call('notification', 'toast', '✅ Saved to cloud')
  }

  /**
   * Save to cloud with conflict detection
   * Returns true if saved successfully, false if conflict detected
   */
  async saveToCloudWithConflictCheck(): Promise<{ saved: boolean; conflict?: { lockInfo: LockFile | null } }> {
    // Check for conflicts first
    const conflictInfo = await this.checkForConflict()

    if (conflictInfo.hasConflict) {
      console.warn('[S3StoragePlugin] ⚠️ Conflict detected, not saving automatically')
      this.emit('conflictDetected', conflictInfo)
      return {
        saved: false,
        conflict: {
          lockInfo: conflictInfo.lockInfo
        }
      }
    }

    // No conflict, proceed with save
    await this.saveToCloud()
    return { saved: true }
  }

  onDeactivation(): void {
    console.log('[S3StoragePlugin] Deactivated')
    this.off('auth', 'authStateChanged')
    this.off('auth', 'tokenRefreshed')
    this.stopAutosave()
  }

  /**
   * Initialize the storage provider
   */
  private async initializeProvider(): Promise<void> {
    // Create API client for storage endpoint
    this.apiClient = new ApiClient(endpointUrls.storage)

    // Create storage API service
    this.storageApi = new StorageApiService(this.apiClient)

    // Set up token refresh callback via auth plugin
    this.apiClient.setTokenRefreshCallback(async () => {
      try {
        // Get fresh token from auth plugin
        const token = await this.call('auth', 'getToken')
        return token
      } catch (error) {
        console.error('[S3StoragePlugin] Token refresh failed:', error)
        return null
      }
    })

    // Create S3 provider with token getter
    this.provider = new S3StorageProvider(
      this.apiClient,
      async () => {
        try {
          return await this.call('auth', 'getToken')
        } catch {
          return null
        }
      }
    )

    console.log('[S3StoragePlugin] Provider initialized:', this.provider.name)
  }

  /**
   * Load storage configuration
   */
  private async loadConfig(): Promise<void> {
    if (!this.provider) {
      console.warn('[S3StoragePlugin] Provider not initialized')
      return
    }

    try {
      this.config = await this.provider.getConfig()
      if (this.config) {
        this.emit('configLoaded', this.config)
        console.log('[S3StoragePlugin] Config loaded:', this.config)
      }
    } catch (error) {
      console.error('[S3StoragePlugin] Failed to load config:', error)
    }
  }

  /**
   * Ensure provider is initialized
   */
  private ensureProvider(): IStorageProvider {
    if (!this.provider) {
      throw new Error('Storage provider not initialized. Please log in first.')
    }
    return this.provider
  }

  /**
   * Get the current storage provider name
   */
  async getProviderName(): Promise<string> {
    return this.provider?.name || 'none'
  }

  /**
   * Check if the storage service is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      const provider = this.ensureProvider()
      return await provider.isHealthy()
    } catch (error) {
      return false
    }
  }

  /**
   * Get storage configuration (limits, allowed types)
   */
  async getConfig(): Promise<StorageConfig | null> {
    // Return cached config if available
    if (this.config) {
      return this.config
    }

    try {
      const provider = this.ensureProvider()
      this.config = await provider.getConfig()
      return this.config
    } catch (error) {
      this.emitError('getConfig', '', error as Error)
      return null
    }
  }

  /**
   * Upload a file to cloud storage
   *
   * @param filename - Name of the file
   * @param content - File content as string or Uint8Array
   * @param options - Upload options (folder, contentType, onProgress)
   * @returns The storage key/path of the uploaded file
   *
   * @example
   * // Upload a Solidity file to contracts folder
   * const key = await s3Storage.upload('MyContract.sol', sourceCode, { folder: 'contracts' })
   *
   * @example
   * // Upload with explicit content type
   * const key = await s3Storage.upload('data.json', jsonString, {
   *   folder: 'artifacts',
   *   contentType: 'application/json'
   * })
   */
  async upload(
    filename: string,
    content: string | Uint8Array,
    options: UploadOptions = {}
  ): Promise<string> {
    const provider = this.ensureProvider()
    const fullPath = joinPath(options.folder, filename)
    const contentType = options.contentType || getMimeType(filename)

    try {
      console.log(`[S3StoragePlugin] Uploading: ${fullPath}`)

      const key = await provider.upload(fullPath, content, contentType)

      // Calculate size for event
      const size = typeof content === 'string'
        ? new Blob([content]).size
        : content.length

      this.emit('fileUploaded', { path: fullPath, size })
      console.log(`[S3StoragePlugin] Upload complete: ${key}`)

      return key
    } catch (error) {
      this.emitError('upload', fullPath, error as Error)
      throw error
    }
  }

  /**
   * Download a file from cloud storage as text
   *
   * @param filename - Name of the file
   * @param folder - Optional folder path
   * @returns File content as string
   *
   * @example
   * const content = await s3Storage.download('MyContract.sol', 'contracts')
   */
  async download(filename: string, folder?: string): Promise<string> {
    const provider = this.ensureProvider()
    const fullPath = joinPath(folder, filename)

    try {
      console.log(`[S3StoragePlugin] Downloading: ${fullPath}`)

      const content = await provider.download(fullPath)

      this.emit('fileDownloaded', { path: fullPath })
      console.log(`[S3StoragePlugin] Download complete: ${fullPath}`)

      return content
    } catch (error) {
      this.emitError('download', fullPath, error as Error)
      throw error
    }
  }

  /**
   * Download a file from cloud storage as binary
   *
   * @param filename - Name of the file
   * @param folder - Optional folder path
   * @returns File content as Uint8Array
   */
  async downloadBinary(filename: string, folder?: string): Promise<Uint8Array> {
    const provider = this.ensureProvider()
    const fullPath = joinPath(folder, filename)

    try {
      console.log(`[S3StoragePlugin] Downloading binary: ${fullPath}`)

      const content = await provider.downloadBinary(fullPath)

      this.emit('fileDownloaded', { path: fullPath })

      return content
    } catch (error) {
      this.emitError('downloadBinary', fullPath, error as Error)
      throw error
    }
  }

  /**
   * Download a file from cloud storage to user's computer
   * Triggers browser download
   * If the file is encrypted (.enc), it will be decrypted before download
   *
   * @param filename - Name of the file
   * @param folder - Folder path
   */
  async downloadToComputer(filename: string, folder: string): Promise<void> {
    try {
      console.log(`[S3StoragePlugin] Downloading to computer: ${folder}/${filename}`)

      let content = await this.downloadBinary(filename, folder)
      let downloadFilename = filename

      // Check if file is encrypted
      if (filename.endsWith('.enc')) {
        console.log('[S3StoragePlugin] 🔐 File is encrypted, decrypting...')

        const passphrase = this.getPassphraseOrPrompt()
        if (!passphrase) {
          throw new Error('Passphrase required to download encrypted file. Please set your encryption passphrase.')
        }

        try {
          content = await decryptFromBytes(content, passphrase)
          // Remove .enc from filename for download
          downloadFilename = filename.replace(/\.enc$/, '')
          console.log('[S3StoragePlugin] ✅ Decryption successful')
        } catch (decryptError) {
          console.error('[S3StoragePlugin] Decryption failed:', decryptError)
          throw new Error('Failed to decrypt file. Please check your passphrase.')
        }
      }

      // Create blob and trigger download
      const blob = new Blob([content.buffer as ArrayBuffer], { type: 'application/zip' })
      const url = URL.createObjectURL(blob)

      const a = document.createElement('a')
      a.href = url
      a.download = downloadFilename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)

      URL.revokeObjectURL(url)

      await this.call('notification', 'toast', `📥 Downloaded ${downloadFilename}`)
    } catch (error) {
      console.error('[S3StoragePlugin] Download to computer failed:', error)
      throw error
    }
  }

  /**
   * Delete a file from cloud storage
   *
   * @param filename - Name of the file
   * @param folder - Optional folder path
   *
   * @example
   * await s3Storage.delete('MyContract.sol', 'contracts')
   */
  async delete(filename: string, folder?: string): Promise<void> {
    const provider = this.ensureProvider()
    const fullPath = joinPath(folder, filename)

    try {
      console.log(`[S3StoragePlugin] Deleting: ${fullPath}`)

      await provider.delete(fullPath)

      this.emit('fileDeleted', { path: fullPath })
      console.log(`[S3StoragePlugin] Delete complete: ${fullPath}`)
    } catch (error) {
      this.emitError('delete', fullPath, error as Error)
      throw error
    }
  }

  /**
   * List files in cloud storage
   *
   * @param options - List options (folder, limit, cursor)
   * @returns List of files with metadata
   *
   * @example
   * // List all files
   * const { files, totalCount } = await s3Storage.list()
   *
   * @example
   * // List files in a specific folder
   * const { files } = await s3Storage.list({ folder: 'contracts' })
   *
   * @example
   * // Paginated list
   * const { files, nextCursor } = await s3Storage.list({ limit: 10 })
   * if (nextCursor) {
   *   const nextPage = await s3Storage.list({ limit: 10, cursor: nextCursor })
   * }
   */
  async list(options?: StorageListOptions): Promise<StorageFilesResponse> {
    const provider = this.ensureProvider()

    try {
      return await provider.list(options)
    } catch (error) {
      this.emitError('list', options?.folder || '', error as Error)
      throw error
    }
  }

  /**
   * List all remote workspaces for the current user with backup info
   *
   * @returns List of workspaces with their backup counts and last backup dates
   *
   * @example
   * const result = await s3Storage.listWorkspaces()
   * // { workspaces: [{ id: 'sage-lotus-uq4m', backupCount: 3, lastBackup: '2025-12-26...', totalSize: 26652 }] }
   */
  async listWorkspaces(): Promise<{ workspaces: { id: string; backupCount: number; lastBackup: string | null; totalSize: number }[] }> {
    this.ensureProvider()

    // Ensure storageApi is initialized
    if (!this.storageApi) {
      throw new Error('Storage API not initialized. Please log in first.')
    }

    // Check if user is authenticated
    const user = await this.call('auth', 'getUser')
    if (!user) {
      throw new Error('You must be logged in to list workspaces')
    }

    try {
      const response = await this.storageApi.getWorkspaces()

      if (!response.ok || !response.data) {
        throw new Error(response.error || 'Failed to list workspaces')
      }

      return response.data
    } catch (error) {
      this.emitError('listWorkspaces', '', error as Error)
      throw error
    }
  }

  /**
   * Check if a file exists in cloud storage
   *
   * @param filename - Name of the file
   * @param folder - Optional folder path
   * @returns true if file exists
   */
  async exists(filename: string, folder?: string): Promise<boolean> {
    const provider = this.ensureProvider()
    const fullPath = joinPath(folder, filename)

    try {
      return await provider.exists(fullPath)
    } catch (error) {
      // If we get an error checking existence, assume it doesn't exist
      return false
    }
  }

  /**
   * Get metadata for a specific file
   *
   * @param filename - Name of the file
   * @param folder - Optional folder path
   * @returns File metadata or null if not found
   */
  async getMetadata(filename: string, folder?: string): Promise<StorageFile | null> {
    const provider = this.ensureProvider()
    const fullPath = joinPath(folder, filename)

    try {
      return await provider.getMetadata(fullPath)
    } catch (error) {
      this.emitError('getMetadata', fullPath, error as Error)
      return null
    }
  }

  // ==================== Workspace Backup & Restore ====================

  /**
   * Check if a path should be excluded from backup
   */
  private shouldExclude(path: string): boolean {
    const normalizedPath = path.replace(/^\//, '').toLowerCase()

    for (const pattern of EXCLUDED_PATTERNS) {
      if (normalizedPath.startsWith(pattern.toLowerCase()) ||
          normalizedPath.includes('/' + pattern.toLowerCase())) {
        return true
      }
    }

    return false
  }

  /**
   * Wipe all user files in the current workspace.
   * Removes everything except excluded patterns (.deps, artifacts, etc.) and remix.config.json.
   * Used for clean restore to ensure the workspace matches the backup exactly.
   */
  private async wipeWorkspaceFiles(): Promise<void> {
    try {
      const entries = await this.call('fileManager', 'readdir', '/')
      for (const [entryPath] of Object.entries(entries)) {
        const normalized = entryPath.replace(/^\//, '')
        // Keep excluded folders (they're regeneratable and not in backups)
        if (this.shouldExclude(normalized)) {
          console.log(`[S3StoragePlugin] 🧹 Keeping excluded folder: ${normalized}`)
          continue
        }
        // Keep remix.config.json (cloud settings) — it's skipped during zip extraction anyway
        if (normalized === REMIX_CONFIG_FILE) continue
        try {
          await this.call('fileManager', 'remove', entryPath)
          console.log(`[S3StoragePlugin] 🧹 Removed: ${normalized}`)
        } catch (e) {
          console.warn(`[S3StoragePlugin] Could not remove ${normalized}:`, e)
        }
      }
    } catch (e) {
      console.error('[S3StoragePlugin] Error wiping workspace files:', e)
    }
  }

  /**
   * Recursively collect all files in the workspace.
   * .git folder is included if its total size is under MAX_GIT_FOLDER_SIZE,
   * otherwise it's excluded and gitExcludedReason is set.
   */
  private async collectWorkspaceFiles(
    basePath: string = '',
    _context?: { gitFiles: Array<{ path: string; content: string }>; gitSize: number }
  ): Promise<Array<{ path: string; content: string }> & { gitIncluded?: boolean; gitExcludedReason?: string }> {
    const isRoot = basePath === '' || basePath === '/'
    const context = _context || { gitFiles: [], gitSize: 0 }
    const files: Array<{ path: string; content: string }> = []

    try {
      const entries = await this.call('fileManager', 'readdir', basePath || '/')
      if (isRoot) {
        console.log('[S3StoragePlugin] 🔍 collectWorkspaceFiles: root entries =', Object.keys(entries))
      }

      for (const [entryPath, info] of Object.entries(entries)) {
        // Skip standard excluded patterns (not .git — that's handled separately)
        if (this.shouldExclude(entryPath)) {
          console.log(`[S3StoragePlugin] Skipping excluded path: ${entryPath}`)
          continue
        }

        const normalizedPath = entryPath.replace(/^\//, '').toLowerCase()
        const isGitPath = normalizedPath === '.git' || normalizedPath.startsWith('.git/')

        const entryInfo = info as { isDirectory: boolean }

        if (entryInfo.isDirectory) {
          // Recursively collect files from subdirectory
          const subFiles = await this.collectWorkspaceFiles(entryPath, context)
          // Separate git files from non-git files
          for (const f of subFiles) {
            const fNorm = f.path.replace(/^\//, '').toLowerCase()
            if (fNorm === '.git' || fNorm.startsWith('.git/')) {
              context.gitFiles.push(f)
            } else {
              files.push(f)
            }
          }
        } else {
          // Read file content
          try {
            const content = await this.call('fileManager', 'readFile', entryPath)
            if (isGitPath) {
              const size = new TextEncoder().encode(content).length
              context.gitSize += size
              context.gitFiles.push({ path: entryPath, content })
            } else {
              files.push({ path: entryPath, content })
            }
          } catch (err) {
            console.warn(`[S3StoragePlugin] Could not read file: ${entryPath}`, err)
          }
        }
      }
    } catch (err) {
      console.error(`[S3StoragePlugin] Error reading directory: ${basePath}`, err)
    }

    // At the root level, decide whether to include .git
    if (isRoot) {
      console.log('[S3StoragePlugin] 🔍 collectWorkspaceFiles root decision: gitFiles.length =', context.gitFiles.length, ', gitSize =', context.gitSize, 'bytes, MAX_GIT_FOLDER_SIZE =', MAX_GIT_FOLDER_SIZE, 'bytes')
      const result = files as Array<{ path: string; content: string }> & { gitIncluded?: boolean; gitExcludedReason?: string }
      if (context.gitFiles.length > 0) {
        if (context.gitSize <= MAX_GIT_FOLDER_SIZE) {
          // .git is small enough — include it
          result.push(...context.gitFiles)
          result.gitIncluded = true
          const sizeMB = (context.gitSize / (1024 * 1024)).toFixed(1)
          console.log(`[S3StoragePlugin] ✅ Including .git folder (${sizeMB} MB, ${context.gitFiles.length} files)`)
        } else {
          // .git is too large — skip it
          result.gitIncluded = false
          const sizeMB = (context.gitSize / (1024 * 1024)).toFixed(1)
          const limitMB = (MAX_GIT_FOLDER_SIZE / (1024 * 1024)).toFixed(0)
          result.gitExcludedReason = `Git folder is ${sizeMB} MB (limit: ${limitMB} MB). Push to GitHub to preserve git history.`
          console.log(`[S3StoragePlugin] ⚠️ Excluding .git folder: ${sizeMB} MB exceeds ${limitMB} MB limit`)
        }
      }
      return result
    }

    return files
  }

  /**
   * Backup the entire workspace to S3 as a compressed zip
   *
   * @returns The S3 key of the uploaded backup
   *
   * @example
   * const backupKey = await s3Storage.backupWorkspace()
   * console.log('Backup saved to:', backupKey)
   */
  async backupWorkspace(): Promise<string> {
    // Check if user is authenticated
    const user = await this.call('auth', 'getUser')
    if (!user) {
      throw new Error('You must be logged in to backup your workspace')
    }

    // Check ownership first
    const ownership = await this.checkWorkspaceOwnership()
    if (!ownership.isOwner && ownership.hasRemoteId) {
      throw new Error("This workspace is linked to another user's cloud storage. Use 'Link to my account' to create your own cloud link.")
    }

    // Get or create workspace remote ID
    const workspaceRemoteId = await this.ensureWorkspaceRemoteId()

    // Get workspace name for filename
    let workspaceName = 'workspace'
    try {
      const currentWorkspace = await this.call('filePanel', 'getCurrentWorkspace')
      workspaceName = currentWorkspace?.name || 'workspace'
    } catch (e) {
      console.warn('[S3StoragePlugin] Could not get workspace name:', e)
    }

    console.log(`[S3StoragePlugin] 📦 Starting workspace backup for: ${workspaceRemoteId}`)

    // Collect files first so we can check git exclusion before uploading
    const files = await this.collectWorkspaceFiles()

    // Prompt user if .git was excluded due to size
    const proceed = await this.promptIfGitExcluded(files)
    if (!proceed) {
      console.log('[S3StoragePlugin] Backup cancelled by user (git exclusion dialog)')
      throw new Error('Backup cancelled')
    }

    // Use the createBackup helper which handles encryption
    const sanitizedName = workspaceName.replace(/[^a-zA-Z0-9-_]/g, '-')
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupFilename = `${sanitizedName}-${timestamp}.zip`
    const folder = `${workspaceRemoteId}/backups`

    const key = await this.createBackupFromFiles(files, backupFilename, folder)

    console.log(`[S3StoragePlugin] ✅ Backup complete: ${key}`)

    // Update the last backup time in config
    await this.updateLastBackupTime()

    this.emit('backupCompleted', {
      key,
      fileCount: files.length,
      workspaceRemoteId
    })

    await this.call('notification', 'toast', `☁️ Workspace backed up (${files.length} files)`)

    return key
  }

  /**
   * Restore workspace from a backup zip
   *
   * @param backupKey - The S3 key of the backup to restore (optional, uses latest if not provided)
   * @param options - Optional settings
   * @param options.cleanRestore - If true, wipe existing files before restoring (except excluded/regeneratable folders)
   *
   * @example
   * await s3Storage.restoreWorkspace()  // Restores latest backup
   * await s3Storage.restoreWorkspace('backups/backup-2025-12-26.zip', { cleanRestore: true })
   */
  async restoreWorkspace(backupKey?: string, options?: { cleanRestore?: boolean }): Promise<void> {
    const provider = this.ensureProvider()

    // Check if user is authenticated
    const user = await this.call('auth', 'getUser')
    if (!user) {
      throw new Error('You must be logged in to restore your workspace')
    }

    const workspaceRemoteId = await this.getWorkspaceRemoteId()
    if (!workspaceRemoteId) {
      throw new Error('No workspace remote ID found. This workspace has no cloud backups.')
    }

    // Variables to track the backup path
    let backupFolder: string
    let backupFilename: string

    // If no backup key provided, list backups and get the latest
    if (!backupKey) {
      const backups = await this.list({ folder: `${workspaceRemoteId}/backups` })
      if (!backups.files || backups.files.length === 0) {
        throw new Error('No backups found for this workspace')
      }

      // Sort by date (newest first) and get the latest
      const sortedBackups = backups.files.sort((a, b) =>
        new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
      )

      // Use folder and filename from the API response, not the key
      const latestBackup = sortedBackups[0]
      backupFolder = latestBackup.folder
      backupFilename = latestBackup.filename
    } else {
      // Parse the provided backup key into folder and filename
      const lastSlashIndex = backupKey.lastIndexOf('/')
      if (lastSlashIndex === -1) {
        backupFolder = `${workspaceRemoteId}/backups`
        backupFilename = backupKey
      } else {
        backupFolder = backupKey.substring(0, lastSlashIndex)
        backupFilename = backupKey.substring(lastSlashIndex + 1)
      }
    }

    console.log(`[S3StoragePlugin] 📥 Downloading backup: ${backupFolder}/${backupFilename}`)

    // Download the backup using folder and filename
    let content = await this.downloadBinary(backupFilename, backupFolder)

    console.log(`[S3StoragePlugin] Downloaded ${(content.length / 1024).toFixed(2)} KB`)

    // Check if the file is encrypted (ends with .enc)
    if (backupFilename.endsWith('.enc')) {
      console.log('[S3StoragePlugin] 🔐 Backup is encrypted, decrypting...')
      const passphrase = this.getPassphraseOrPrompt()
      if (!passphrase) {
        throw new Error('This backup is encrypted. Please enter your encryption passphrase.')
      }
      try {
        content = await decryptFromBytes(content, passphrase)
        console.log('[S3StoragePlugin] ✅ Backup decrypted')
      } catch (e) {
        throw new Error('Failed to decrypt backup. Wrong passphrase or corrupted data.')
      }
    }

    // Unzip
    const zip = await JSZip.loadAsync(content)

    // Read metadata
    let backupMetadata: any = null
    const metadataFile = zip.file('_backup_metadata.json')
    if (metadataFile) {
      const metadataStr = await metadataFile.async('string')
      backupMetadata = JSON.parse(metadataStr)
      console.log('[S3StoragePlugin] Backup metadata:', backupMetadata)
    }

    // Check for git metadata
    let gitBackupInfo: any = null
    const gitInfoFile = zip.file(GIT_BACKUP_INFO_FILE)
    if (gitInfoFile) {
      try {
        const gitInfoStr = await gitInfoFile.async('string')
        gitBackupInfo = JSON.parse(gitInfoStr)
        console.log('[S3StoragePlugin] 📋 Backup contains git metadata:', gitBackupInfo)
      } catch (e) {
        console.warn('[S3StoragePlugin] Could not parse git backup info:', e)
      }
    }

    // Extract and write files
    let restoredCount = 0
    const filePromises: Promise<void>[] = []

    // Check if backup contains .git files
    const backupHasGit = zip.file(/^\.git[/]/).length > 0 || zip.file('.git') !== null

    // Clean restore: wipe existing files first
    if (options?.cleanRestore) {
      console.log('[S3StoragePlugin] 🧹 Clean restore: wiping existing workspace files')
      await this.wipeWorkspaceFiles()
    } else if (backupHasGit) {
      // Even in merge mode, wipe local .git if backup contains .git to prevent corruption
      try {
        const localGitExists = await this.call('fileManager', 'exists', '.git')
        if (localGitExists) {
          console.log('[S3StoragePlugin] 🗑️ Wiping local .git folder before restoring backup .git')
          await this.call('fileManager', 'remove', '.git')
        }
      } catch (e) {
        console.warn('[S3StoragePlugin] Could not wipe local .git folder:', e)
      }
    }

    zip.forEach((relativePath, zipEntry) => {
      // Skip metadata, directories, git backup info, and remix.config.json (preserve local cloud settings)
      if (relativePath === '_backup_metadata.json' || relativePath === GIT_BACKUP_INFO_FILE || relativePath === REMIX_CONFIG_FILE || zipEntry.dir) {
        return
      }

      filePromises.push((async () => {
        try {
          const content = await zipEntry.async('string')
          await this.call('fileManager', 'writeFile', relativePath, content)
          restoredCount++
        } catch (err) {
          console.warn(`[S3StoragePlugin] Failed to restore file: ${relativePath}`, err)
        }
      })())
    })

    await Promise.all(filePromises)

    console.log(`[S3StoragePlugin] ✅ Restored ${restoredCount} files`)

    // Update last save/backup timestamp in remix.config.json based on what was restored
    try {
      const backupTimestamp = backupMetadata?.createdAt || new Date().toISOString()
      const isAutosaveRestore = `${backupFolder}/${backupFilename}`.includes('/autosave/')
      const config = await this.getRemixConfig()
      if (config && config['remote-workspace']) {
        if (isAutosaveRestore) {
          config['remote-workspace'].lastSaveAt = backupTimestamp
        } else {
          config['remote-workspace'].lastBackupAt = backupTimestamp
        }
        await this.saveRemixConfig(config)
        console.log(`[S3StoragePlugin] Updated ${isAutosaveRestore ? 'lastSaveAt' : 'lastBackupAt'} to ${backupTimestamp}`)
      }
    } catch (e) {
      console.warn('[S3StoragePlugin] Could not update restore timestamp:', e)
    }

    // Notify user about git repo info if present
    if (gitBackupInfo?.isGitRepo) {
      const remoteUrl = gitBackupInfo.remotes?.find((r: any) => r.name === 'origin')?.url
      if (remoteUrl) {
        await this.call('notification', 'alert', {
          id: 'gitBackupInfoAlert',
          title: 'Git Repository Info',
          message: `This workspace was a git repo cloned from ${remoteUrl} (branch: ${gitBackupInfo.branch || 'unknown'}, commit: ${gitBackupInfo.commitHash?.substring(0, 8) || 'unknown'}). ` +
            `Git history was not included in this backup because it exceeded the size limit. ` +
            `You can re-clone from the git plugin to restore git functionality.`
        })
      } else {
        await this.call('notification', 'alert', {
          id: 'gitBackupInfoAlert',
          title: 'Git Repository Info',
          message: 'This workspace was a git repo. Git history was not included in this backup because it exceeded the size limit. ' +
            'You can re-initialize git from the git plugin.'
        })
      }
    }

    this.emit('restoreCompleted', {
      backupPath: `${backupFolder}/${backupFilename}`,
      fileCount: restoredCount,
      workspaceRemoteId,
      gitBackupInfo
    })

    await this.call('notification', 'toast', `☁️ Workspace restored (${restoredCount} files)`)
  }

  /**
   * Get metadata information from a backup without fully restoring it
   * Useful for determining workspace name before restore
   * @param backupPath - Full path like "workspace-id/backups/backup-123.zip"
   * @returns Backup metadata including original workspace name
   */
  async getBackupInfo(backupPath: string): Promise<{
    workspaceName: string;
    createdAt: string | null;
    fileCount: number;
    isEncrypted: boolean;
    remoteWorkspaceId: string;
    isGitRepo: boolean;
    gitInfo: { remotes: Array<{ name: string; url: string }>; branch: string | null; commitHash: string | null } | null;
  }> {
    const provider = this.ensureProvider()

    // Parse the backup path into folder and filename
    const lastSlashIndex = backupPath.lastIndexOf('/')
    if (lastSlashIndex === -1) {
      throw new Error('Invalid backup path format')
    }

    const backupFolder = backupPath.substring(0, lastSlashIndex)
    const backupFilename = backupPath.substring(lastSlashIndex + 1)
    const remoteWorkspaceId = backupPath.split('/')[0]
    const isEncrypted = backupFilename.endsWith('.enc')

    // Try to get S3 metadata first (faster, doesn't require download)
    try {
      const s3Metadata = await provider.getMetadata(backupPath)
      if (s3Metadata?.metadata?.['workspace-name']) {
        return {
          workspaceName: s3Metadata.metadata['workspace-name'],
          createdAt: s3Metadata.lastModified || null,
          fileCount: parseInt(s3Metadata.metadata['file-count'] || '0', 10),
          isEncrypted,
          remoteWorkspaceId,
          isGitRepo: false, // Not available from S3 metadata, need full download to check
          gitInfo: null
        }
      }
    } catch (e) {
      console.warn('[S3StoragePlugin] Could not get S3 metadata, will download backup:', e)
    }

    // Fallback: Download and extract metadata from zip
    let content = await this.downloadBinary(backupFilename, backupFolder)

    if (isEncrypted) {
      const passphrase = this.getPassphraseOrPrompt()
      if (!passphrase) {
        throw new Error('This backup is encrypted. Please enter your encryption passphrase.')
      }
      content = await decryptFromBytes(content, passphrase)
    }

    const zip = await JSZip.loadAsync(content)
    const metadataFile = zip.file('_backup_metadata.json')

    let workspaceName = 'restored-workspace'
    let createdAt: string | null = null
    let fileCount = 0

    if (metadataFile) {
      try {
        const metadataStr = await metadataFile.async('string')
        const metadata = JSON.parse(metadataStr)
        workspaceName = metadata.workspaceName || workspaceName
        createdAt = metadata.createdAt || null
        fileCount = metadata.fileCount || 0
      } catch (e) {
        console.warn('[S3StoragePlugin] Could not parse backup metadata:', e)
      }
    }

    // Check for git backup info (only exists when .git was excluded due to size)
    let isGitRepo = false
    let gitInfo: { remotes: Array<{ name: string; url: string }>; branch: string | null; commitHash: string | null } | null = null
    const gitInfoFile = zip.file(GIT_BACKUP_INFO_FILE)
    if (gitInfoFile) {
      try {
        const gitInfoStr = await gitInfoFile.async('string')
        const parsedGitInfo = JSON.parse(gitInfoStr)
        isGitRepo = parsedGitInfo.isGitRepo || false
        gitInfo = {
          remotes: parsedGitInfo.remotes || [],
          branch: parsedGitInfo.branch || null,
          commitHash: parsedGitInfo.commitHash || null
        }
      } catch (e) {
        console.warn('[S3StoragePlugin] Could not parse git backup info:', e)
      }
    }

    // Also check if .git folder is directly in the zip (included because it was under size limit)
    if (!isGitRepo) {
      const gitFilesInZip = zip.file(/^\\.git[\\/]/)
      if (gitFilesInZip.length > 0) {
        isGitRepo = true
      }
    }

    return {
      workspaceName,
      createdAt,
      fileCount,
      isEncrypted,
      remoteWorkspaceId,
      isGitRepo,
      gitInfo
    }
  }

  /**
   * Restore a backup to a NEW workspace
   * Creates a new workspace and restores the backup content to it
   * @param backupPath - Full path like "workspace-id/backups/backup-123.zip" or "workspace-id/autosave/autosave-backup.zip"
   * @param options - Optional settings for restore
   * @param options.targetWorkspaceName - Name for the new workspace (if not provided, uses metadata name or generates one)
   * @param options.overwriteIfExists - If true and workspace exists, overwrite it; if false, fail
   */
  async restoreBackupToNewWorkspace(
    backupPath: string,
    options?: { targetWorkspaceName?: string; overwriteIfExists?: boolean; keepRemoteId?: boolean; cleanRestore?: boolean }
  ): Promise<void> {
    const provider = this.ensureProvider()

    // Check if user is authenticated
    const user = await this.call('auth', 'getUser')
    if (!user) {
      throw new Error('You must be logged in to restore a backup')
    }

    // Parse the backup path into folder and filename
    const lastSlashIndex = backupPath.lastIndexOf('/')
    if (lastSlashIndex === -1) {
      throw new Error('Invalid backup path format')
    }

    const backupFolder = backupPath.substring(0, lastSlashIndex)
    const backupFilename = backupPath.substring(lastSlashIndex + 1)

    // Extract the remote workspace ID from the path (first segment)
    const remoteWorkspaceId = backupPath.split('/')[0]

    console.log(`[S3StoragePlugin] 📥 Downloading backup for new workspace: ${backupPath}`)

    // Download the backup using folder and filename
    let content = await this.downloadBinary(backupFilename, backupFolder)

    console.log(`[S3StoragePlugin] Downloaded ${(content.length / 1024).toFixed(2)} KB`)

    // Check if the file is encrypted (ends with .enc)
    if (backupFilename.endsWith('.enc')) {
      console.log('[S3StoragePlugin] 🔐 Backup is encrypted, decrypting...')
      const passphrase = this.getPassphraseOrPrompt()
      if (!passphrase) {
        throw new Error('This backup is encrypted. Please enter your encryption passphrase.')
      }
      try {
        content = await decryptFromBytes(content, passphrase)
        console.log('[S3StoragePlugin] ✅ Backup decrypted')
      } catch (e) {
        throw new Error('Failed to decrypt backup. Wrong passphrase or corrupted data.')
      }
    }

    // Unzip to get metadata for workspace name
    const zip = await JSZip.loadAsync(content)

    // Read metadata to get original workspace name
    let originalWorkspaceName = 'restored-workspace'
    let backupMetadata: any = null
    const metadataFile = zip.file('_backup_metadata.json')
    if (metadataFile) {
      try {
        const metadataStr = await metadataFile.async('string')
        backupMetadata = JSON.parse(metadataStr)
        if (backupMetadata.workspaceName) {
          originalWorkspaceName = backupMetadata.workspaceName
        }
      } catch (e) {
        console.warn('[S3StoragePlugin] Could not parse backup metadata:', e)
      }
    }

    // Determine the target workspace name
    let newWorkspaceName: string

    if (options?.targetWorkspaceName) {
      // Use the provided target name
      newWorkspaceName = options.targetWorkspaceName
    } else {
      // Default: use original name if available
      newWorkspaceName = originalWorkspaceName
    }

    // Check if workspace already exists
    const workspaceExists = await this.call('filePanel', 'workspaceExists', newWorkspaceName)

    if (workspaceExists) {
      if (options?.overwriteIfExists) {
        // Delete the existing workspace first
        console.log(`[S3StoragePlugin] Overwriting existing workspace: ${newWorkspaceName}`)
        await this.call('filePanel', 'deleteWorkspace', newWorkspaceName)
      } else if (!options?.targetWorkspaceName) {
        // No explicit target given, so auto-generate a unique name
        newWorkspaceName = await this.call('filePanel', 'getAvailableWorkspaceName', originalWorkspaceName)
      } else {
        // Explicit target given but exists and overwrite not allowed - error
        throw new Error(`Workspace "${newWorkspaceName}" already exists. Use overwriteIfExists option or choose a different name.`)
      }
    }

    // Create the new workspace (blank template, no need for git)
    await this.call('filePanel', 'createWorkspace', newWorkspaceName, 'blank')

    console.log(`[S3StoragePlugin] Created new workspace: ${newWorkspaceName}`)

    // Check for git metadata
    let gitBackupInfo: any = null
    const gitInfoFile = zip.file(GIT_BACKUP_INFO_FILE)
    if (gitInfoFile) {
      try {
        const gitInfoStr = await gitInfoFile.async('string')
        gitBackupInfo = JSON.parse(gitInfoStr)
        console.log('[S3StoragePlugin] 📋 Backup contains git metadata:', gitBackupInfo)
      } catch (e) {
        console.warn('[S3StoragePlugin] Could not parse git backup info:', e)
      }
    }

    // Extract and write files to the new workspace
    let restoredCount = 0
    const filePromises: Promise<void>[] = []

    // Check if backup contains .git files
    const backupHasGit = zip.file(/^\.git[/]/).length > 0 || zip.file('.git') !== null

    // Clean restore: wipe existing files first (relevant when overwriting an existing workspace)
    if (options?.cleanRestore) {
      console.log('[S3StoragePlugin] 🧹 Clean restore: wiping existing workspace files')
      await this.wipeWorkspaceFiles()
    } else if (backupHasGit) {
      // Even in merge mode, wipe local .git if backup contains .git to prevent corruption
      try {
        const localGitExists = await this.call('fileManager', 'exists', '.git')
        if (localGitExists) {
          console.log('[S3StoragePlugin] 🗑️ Wiping local .git folder in new workspace before restoring backup .git')
          await this.call('fileManager', 'remove', '.git')
        }
      } catch (e) {
        console.warn('[S3StoragePlugin] Could not wipe local .git folder:', e)
      }
    }

    zip.forEach((relativePath, zipEntry) => {
      // Skip metadata, directories, git backup info, and remix.config.json (to avoid inheriting remoteId)
      if (relativePath === '_backup_metadata.json' || relativePath === GIT_BACKUP_INFO_FILE || relativePath === REMIX_CONFIG_FILE || zipEntry.dir) {
        return
      }

      filePromises.push((async () => {
        try {
          const content = await zipEntry.async('string')
          await this.call('fileManager', 'writeFile', relativePath, content)
          restoredCount++
        } catch (err) {
          console.warn(`[S3StoragePlugin] Failed to restore file: ${relativePath}`, err)
        }
      })())
    })

    await Promise.all(filePromises)

    // Decide whether to keep the original remoteId or assign a fresh one
    const keepRemoteId = options?.keepRemoteId !== false // Default to true for backward compatibility
    const assignedRemoteId = keepRemoteId ? remoteWorkspaceId : generateWorkspaceId()

    const remixConfig: RemixConfig = {
      'remote-workspace': {
        remoteId: assignedRemoteId,
        userId: user?.sub,
        createdAt: new Date().toISOString(),
        // Carry over the backup's timestamp so "Saved" / "Backup" shows correctly
        ...(backupPath.includes('/autosave/')
          ? { lastSaveAt: backupMetadata?.createdAt || new Date().toISOString() }
          : { lastBackupAt: backupMetadata?.createdAt || new Date().toISOString() }
        )
      }
    }
    await this.call('fileManager', 'writeFile', REMIX_CONFIG_FILE, JSON.stringify(remixConfig, null, 2))

    if (keepRemoteId) {
      console.log(`[S3StoragePlugin] ✅ Restored ${restoredCount} files to new workspace: ${newWorkspaceName} (linked to ${remoteWorkspaceId})`)
    } else {
      console.log(`[S3StoragePlugin] ✅ Restored ${restoredCount} files to new workspace: ${newWorkspaceName} (fresh ID: ${assignedRemoteId}, original was ${remoteWorkspaceId})`)
    }

    // Notify user about git repo info if present
    if (gitBackupInfo?.isGitRepo) {
      const remoteUrl = gitBackupInfo.remotes?.find((r: any) => r.name === 'origin')?.url
      if (remoteUrl) {
        await this.call('notification', 'alert', {
          id: 'gitBackupInfoAlert',
          title: 'Git Repository Info',
          message: `This workspace was a git repo cloned from ${remoteUrl} (branch: ${gitBackupInfo.branch || 'unknown'}, commit: ${gitBackupInfo.commitHash?.substring(0, 8) || 'unknown'}). ` +
            `Git history was not included in this backup because it exceeded the size limit. ` +
            `You can re-clone from the git plugin to restore git functionality.`
        })
      } else {
        await this.call('notification', 'alert', {
          id: 'gitBackupInfoAlert',
          title: 'Git Repository Info',
          message: 'This workspace was a git repo. Git history was not included in this backup because it exceeded the size limit. ' +
            'You can re-initialize git from the git plugin.'
        })
      }
    }

    this.emit('restoreCompleted', {
      backupPath,
      fileCount: restoredCount,
      workspaceRemoteId: assignedRemoteId,
      originalRemoteId: remoteWorkspaceId,
      keepRemoteId,
      newWorkspaceName,
      gitBackupInfo
    })

    const idNote = keepRemoteId ? '' : ' (separate copy)'
    await this.call('notification', 'toast', `☁️ Restored to new workspace: ${newWorkspaceName} (${restoredCount} files)${idNote}`)
  }

  /**
   * Emit an error event
   */
  private emitError(operation: string, path: string, error: Error): void {
    console.error(`[S3StoragePlugin] ${operation} error for ${path}:`, error)
    this.emit('error', { operation, path, error })
  }
}
