/**
 * Workspace Migration Service
 *
 * Handles the migration of workspaces from the legacy `.workspaces/{name}` structure
 * to the new `.cloud-workspaces/{uuid}` structure for cloud storage.
 *
 * Migration is non-destructive: the original `.workspaces/` directory stays intact.
 * The user continues using the IDE transparently — they see display names,
 * but internally the system uses UUIDs.
 */

/**
 * Generate a v4 UUID using the Web Crypto API.
 * Falls back to Math.random if crypto.randomUUID is not available.
 */
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
import {
  CLOUD_WORKSPACES_PATH,
  WorkspaceRegistryManager,
  WorkspaceRegistryEntry,
  createWorkspaceRegistryManager
} from './workspace-registry'

// ==================== Types ====================

export interface MigrationProgress {
  /** Total number of workspaces to migrate */
  total: number
  /** Number of workspaces completed so far */
  completed: number
  /** Currently migrating workspace name */
  currentWorkspace: string
  /** Current phase: 'scanning' | 'copying' | 'registering' | 'verifying' | 'done' */
  phase: 'scanning' | 'copying' | 'registering' | 'verifying' | 'done'
  /** Any errors encountered (non-fatal per workspace) */
  errors: Array<{ workspace: string; error: string }>
}

export interface MigrationResult {
  /** Whether the migration completed successfully */
  success: boolean
  /** Number of workspaces migrated */
  migratedCount: number
  /** Number of workspaces skipped (already migrated) */
  skippedCount: number
  /** Errors encountered */
  errors: Array<{ workspace: string; error: string }>
  /** Map of workspace display name -> new UUID */
  mappings: Record<string, string>
}

export interface MigrationStatus {
  /** Whether any cloud workspaces exist */
  hasCloudWorkspaces: boolean
  /** Whether there are legacy workspaces that haven't been migrated yet */
  hasUnmigratedWorkspaces: boolean
  /** Names of unmigrated workspaces */
  unmigratedWorkspaces: string[]
  /** Names of already-migrated workspaces */
  migratedWorkspaces: string[]
  /** Total workspace count */
  totalLegacyWorkspaces: number
}

// ==================== Migration Service ====================

export class WorkspaceMigrationService {
  private registry: WorkspaceRegistryManager
  private fs: any // remixFileSystem

  constructor() {
    this.fs = (window as any).remixFileSystem
    this.registry = createWorkspaceRegistryManager()
  }

  /**
   * Check the current migration status without making any changes
   */
  async getMigrationStatus(): Promise<MigrationStatus> {
    const result: MigrationStatus = {
      hasCloudWorkspaces: false,
      hasUnmigratedWorkspaces: false,
      unmigratedWorkspaces: [],
      migratedWorkspaces: [],
      totalLegacyWorkspaces: 0
    }

    // Check if cloud workspaces directory exists
    try {
      result.hasCloudWorkspaces = await this.fs.exists('/' + CLOUD_WORKSPACES_PATH)
    } catch (e) {
      result.hasCloudWorkspaces = false
    }

    // List legacy workspaces
    let legacyWorkspaces: string[] = []
    try {
      if (await this.fs.exists('/.workspaces')) {
        legacyWorkspaces = await this.fs.readdir('/.workspaces')
        // Filter out non-directories and special entries
        legacyWorkspaces = legacyWorkspaces.filter(name =>
          name && name !== 'null' && name !== '.' && name !== '..'
        )
      }
    } catch (e) {
      console.warn('[Migration] Failed to list legacy workspaces:', e)
    }

    result.totalLegacyWorkspaces = legacyWorkspaces.length

    // Check which are already migrated (have a matching entry in the registry)
    if (result.hasCloudWorkspaces) {
      const allEntries = await this.registry.getAll()
      const migratedNames = new Set(
        allEntries
          .filter(e => e.migratedFrom)
          .map(e => e.migratedFrom!)
      )

      for (const name of legacyWorkspaces) {
        if (migratedNames.has(name)) {
          result.migratedWorkspaces.push(name)
        } else {
          result.unmigratedWorkspaces.push(name)
        }
      }
    } else {
      result.unmigratedWorkspaces = legacyWorkspaces
    }

    result.hasUnmigratedWorkspaces = result.unmigratedWorkspaces.length > 0
    return result
  }

  /**
   * Migrate all legacy workspaces to the cloud workspace structure.
   * Non-destructive: original .workspaces/ stays intact.
   *
   * @param onProgress - Callback for progress updates
   * @returns Migration result
   */
  async migrateAll(
    onProgress?: (progress: MigrationProgress) => void
  ): Promise<MigrationResult> {
    const result: MigrationResult = {
      success: true,
      migratedCount: 0,
      skippedCount: 0,
      errors: [],
      mappings: {}
    }

    // Get status to know what needs migration
    const status = await this.getMigrationStatus()

    if (status.unmigratedWorkspaces.length === 0) {
      console.log('[Migration] No workspaces need migration')
      return result
    }

    const progress: MigrationProgress = {
      total: status.unmigratedWorkspaces.length,
      completed: 0,
      currentWorkspace: '',
      phase: 'scanning',
      errors: []
    }

    onProgress?.(progress)

    // Ensure the cloud workspaces root directory exists
    try {
      if (!await this.fs.exists('/' + CLOUD_WORKSPACES_PATH)) {
        await this.fs.mkdir('/' + CLOUD_WORKSPACES_PATH)
      }
    } catch (e) {
      // may already exist
    }

    // Migrate each workspace
    for (const workspaceName of status.unmigratedWorkspaces) {
      progress.currentWorkspace = workspaceName
      progress.phase = 'copying'
      onProgress?.(progress)

      try {
        const uuid = await this.migrateWorkspace(workspaceName)
        result.mappings[workspaceName] = uuid
        result.migratedCount++
      } catch (e) {
        const error = { workspace: workspaceName, error: e.message || String(e) }
        result.errors.push(error)
        progress.errors.push(error)
        console.error(`[Migration] Failed to migrate workspace "${workspaceName}":`, e)
      }

      progress.completed++
      onProgress?.(progress)
    }

    progress.phase = 'done'
    onProgress?.(progress)

    result.success = result.errors.length === 0
    console.log('[Migration] Complete:', result)
    return result
  }

  /**
   * Migrate a single workspace from .workspaces/{name} to .cloud-workspaces/{uuid}
   *
   * @param workspaceName - The legacy workspace name (directory name in .workspaces/)
   * @returns The UUID of the new workspace
   */
  async migrateWorkspace(workspaceName: string): Promise<string> {
    console.log(`[Migration] Migrating workspace: "${workspaceName}"`)

    const sourcePath = `/.workspaces/${workspaceName}`
    const uuid = generateUUID()
    const targetPath = `/${CLOUD_WORKSPACES_PATH}/${uuid}`

    // 1. Verify source exists
    if (!await this.fs.exists(sourcePath)) {
      throw new Error(`Source workspace not found: ${sourcePath}`)
    }

    // 2. Create target directory
    await this.fs.mkdir(targetPath)

    // 3. Read existing remix.config.json for remoteId etc.
    let existingRemoteId: string | undefined
    let existingConfig: any = null
    try {
      const configPath = `${sourcePath}/remix.config.json`
      if (await this.fs.exists(configPath)) {
        const raw = await this.fs.readFile(configPath, 'utf8')
        existingConfig = JSON.parse(raw)
        existingRemoteId = existingConfig?.['remote-workspace']?.remoteId
      }
    } catch (e) {
      console.warn(`[Migration] Could not read remix.config.json for "${workspaceName}":`, e)
    }

    // 4. Check git status
    let isGitRepo = false
    let hasGitSubmodules = false
    try {
      isGitRepo = await this.fs.exists(`${sourcePath}/.git`)
      hasGitSubmodules = await this.fs.exists(`${sourcePath}/.gitmodules`)
    } catch (e) {
      // ignore
    }

    // 5. Recursively copy all files
    await this.copyDirectory(sourcePath, targetPath)

    // 6. Update remix.config.json in the target to include the UUID mapping
    try {
      const newConfig = existingConfig || {}
      if (!newConfig['remote-workspace']) {
        newConfig['remote-workspace'] = {}
      }
      // Use existing remoteId if present, otherwise use UUID as the remoteId
      if (!newConfig['remote-workspace'].remoteId) {
        newConfig['remote-workspace'].remoteId = uuid
      }
      newConfig['cloud-workspace'] = {
        uuid,
        migratedFrom: workspaceName,
        migratedAt: new Date().toISOString()
      }
      await this.fs.writeFile(
        `${targetPath}/remix.config.json`,
        JSON.stringify(newConfig, null, 2),
        'utf8'
      )
    } catch (e) {
      console.warn(`[Migration] Could not write remix.config.json for "${workspaceName}":`, e)
    }

    // 7. Register in the workspace registry
    await this.registry.registerWithId(uuid, workspaceName, {
      migratedFrom: workspaceName,
      remoteId: existingRemoteId || uuid,
      isGitRepo,
      hasGitSubmodules,
      isGist: this.extractGistId(workspaceName)
    })

    // 8. Verify the copy by counting files
    const sourceFiles = await this.countFiles(sourcePath)
    const targetFiles = await this.countFiles(targetPath)
    console.log(`[Migration] "${workspaceName}" → ${uuid}: ${sourceFiles} source files, ${targetFiles} target files`)

    if (targetFiles < sourceFiles) {
      console.warn(`[Migration] Warning: target has fewer files than source for "${workspaceName}"`)
    }

    return uuid
  }

  /**
   * Migrate a single workspace by name (convenience wrapper for UI)
   */
  async migrateSingleWorkspace(workspaceName: string): Promise<{ uuid: string; displayName: string }> {
    const uuid = await this.migrateWorkspace(workspaceName)
    return { uuid, displayName: workspaceName }
  }

  // ==================== File Copy Helpers ====================

  /**
   * Recursively copy a directory in the virtual filesystem
   */
  private async copyDirectory(source: string, target: string): Promise<void> {
    const entries = await this.fs.readdir(source)

    for (const entry of entries) {
      if (!entry || entry === '.' || entry === '..') continue

      const sourcePath = `${source}/${entry}`
      const targetPath = `${target}/${entry}`

      try {
        const stat = await this.fs.stat(sourcePath)

        if (stat.isDirectory()) {
          // Create directory and recurse
          try {
            await this.fs.mkdir(targetPath)
          } catch (e) {
            // may already exist
          }
          await this.copyDirectory(sourcePath, targetPath)
        } else {
          // Copy file
          // Try binary first, fall back to text
          try {
            const content = await this.fs.readFile(sourcePath, 'utf8')
            await this.fs.writeFile(targetPath, content, 'utf8')
          } catch (e) {
            console.warn(`[Migration] Failed to copy file ${sourcePath}:`, e)
          }
        }
      } catch (e) {
        console.warn(`[Migration] Failed to stat ${sourcePath}:`, e)
      }
    }
  }

  /**
   * Count files recursively in a directory
   */
  private async countFiles(dirPath: string): Promise<number> {
    let count = 0
    try {
      const entries = await this.fs.readdir(dirPath)
      for (const entry of entries) {
        if (!entry || entry === '.' || entry === '..') continue
        const fullPath = `${dirPath}/${entry}`
        try {
          const stat = await this.fs.stat(fullPath)
          if (stat.isDirectory()) {
            count += await this.countFiles(fullPath)
          } else {
            count++
          }
        } catch (e) {
          // skip
        }
      }
    } catch (e) {
      // skip
    }
    return count
  }

  /**
   * Check if a workspace name looks like a gist workspace
   */
  private extractGistId(workspaceName: string): string | null {
    if (workspaceName.startsWith('gist ')) {
      return workspaceName.split(' ')[1] || null
    }
    return null
  }

  /**
   * Get the registry manager (for external access)
   */
  getRegistry(): WorkspaceRegistryManager {
    return this.registry
  }
}

/**
 * Create a workspace migration service instance
 */
export function createWorkspaceMigrationService(): WorkspaceMigrationService {
  return new WorkspaceMigrationService()
}
