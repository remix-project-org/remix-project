/**
 * Workspace Registry
 *
 * Manages the mapping between workspace UUIDs and display names.
 * When cloud storage is active, workspaces are stored in `.cloud-workspaces/{uuid}/`
 * instead of `.workspaces/{display-name}/`. This registry maintains the translation.
 *
 * The registry itself is stored as `.cloud-workspaces/.registry.json` in the virtual filesystem.
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

// ==================== Constants ====================

/** Root directory for UUID-based cloud workspaces */
export const CLOUD_WORKSPACES_PATH = '.cloud-workspaces'

/** Registry file within the cloud workspaces directory */
export const REGISTRY_FILE = '.cloud-workspaces/.registry.json'

// ==================== Types ====================

/**
 * Individual workspace entry in the registry
 */
export interface WorkspaceRegistryEntry {
  /** UUID - the directory name under .cloud-workspaces/ */
  id: string

  /** Display name shown to the user (e.g. "ERC20", "My Project") */
  displayName: string

  /** The original workspace name from .workspaces/ (for traceability) */
  migratedFrom?: string

  /** S3 remote ID for cloud sync (replaces the remoteId in remix.config.json) */
  remoteId?: string

  /** ISO timestamp of when this workspace was created/migrated */
  createdAt: string

  /** ISO timestamp of last modification */
  updatedAt: string

  /** Whether the workspace is a git repo */
  isGitRepo?: boolean

  /** Whether the workspace has git submodules */
  hasGitSubmodules?: boolean

  /** Whether the workspace is a gist (and the gist ID if so) */
  isGist?: string | null
}

/**
 * The full registry structure
 */
export interface WorkspaceRegistry {
  /** Schema version for forward compatibility */
  version: 1

  /** Map of UUID -> workspace entry */
  workspaces: Record<string, WorkspaceRegistryEntry>

  /** ISO timestamp of last registry update */
  updatedAt: string
}

// ==================== Registry Manager ====================

/**
 * Manages the workspace registry file.
 * Requires a filesystem abstraction (the remixFileSystem global).
 */
export class WorkspaceRegistryManager {
  private cache: WorkspaceRegistry | null = null

  constructor(
    private fs: {
      exists: (path: string) => Promise<boolean>
      readFile: (path: string, encoding: string) => Promise<string>
      writeFile: (path: string, content: string, encoding: string) => Promise<void>
      mkdir: (path: string) => Promise<void>
    }
  ) {}

  // ==================== Core CRUD ====================

  /**
   * Load the registry from disk, or create a new empty one
   */
  async load(): Promise<WorkspaceRegistry> {
    if (this.cache) return this.cache

    try {
      const exists = await this.fs.exists('/' + REGISTRY_FILE)
      if (exists) {
        const raw = await this.fs.readFile('/' + REGISTRY_FILE, 'utf8')
        this.cache = JSON.parse(raw) as WorkspaceRegistry
        return this.cache
      }
    } catch (e) {
      console.warn('[WorkspaceRegistry] Failed to load registry, creating new:', e)
    }

    // Create empty registry
    this.cache = {
      version: 1,
      workspaces: {},
      updatedAt: new Date().toISOString()
    }
    return this.cache
  }

  /**
   * Persist the registry to disk
   */
  async save(): Promise<void> {
    if (!this.cache) return

    this.cache.updatedAt = new Date().toISOString()

    // Ensure the cloud workspaces directory exists
    try {
      const dirExists = await this.fs.exists('/' + CLOUD_WORKSPACES_PATH)
      if (!dirExists) {
        await this.fs.mkdir('/' + CLOUD_WORKSPACES_PATH)
      }
    } catch (e) {
      // mkdir might throw if it exists already
    }

    await this.fs.writeFile(
      '/' + REGISTRY_FILE,
      JSON.stringify(this.cache, null, 2),
      'utf8'
    )
  }

  /**
   * Invalidate the in-memory cache so the next load() reads from disk
   */
  invalidateCache(): void {
    this.cache = null
  }

  // ==================== Workspace Operations ====================

  /**
   * Register a new workspace entry
   * @returns The generated UUID
   */
  async register(displayName: string, opts?: Partial<WorkspaceRegistryEntry>): Promise<string> {
    const registry = await this.load()
    const id = generateUUID()
    const now = new Date().toISOString()

    registry.workspaces[id] = {
      id,
      displayName,
      createdAt: now,
      updatedAt: now,
      ...opts
    }

    // Ensure the id field is correct even if opts tried to override
    registry.workspaces[id].id = id

    await this.save()
    return id
  }

  /**
   * Register with a specific UUID (used during migration when we want to control the id)
   */
  async registerWithId(id: string, displayName: string, opts?: Partial<WorkspaceRegistryEntry>): Promise<void> {
    const registry = await this.load()
    const now = new Date().toISOString()

    registry.workspaces[id] = {
      id,
      displayName,
      createdAt: now,
      updatedAt: now,
      ...opts
    }

    await this.save()
  }

  /**
   * Get a workspace entry by UUID
   */
  async getById(id: string): Promise<WorkspaceRegistryEntry | null> {
    const registry = await this.load()
    return registry.workspaces[id] || null
  }

  /**
   * Get a workspace entry by display name
   * If multiple workspaces have the same name, returns the first match
   */
  async getByDisplayName(displayName: string): Promise<WorkspaceRegistryEntry | null> {
    const registry = await this.load()
    for (const entry of Object.values(registry.workspaces)) {
      if (entry.displayName === displayName) return entry
    }
    return null
  }

  /**
   * Get all workspace entries
   */
  async getAll(): Promise<WorkspaceRegistryEntry[]> {
    const registry = await this.load()
    return Object.values(registry.workspaces)
  }

  /**
   * Update a workspace entry (partial update)
   */
  async update(id: string, updates: Partial<WorkspaceRegistryEntry>): Promise<void> {
    const registry = await this.load()
    if (!registry.workspaces[id]) {
      throw new Error(`Workspace ${id} not found in registry`)
    }

    registry.workspaces[id] = {
      ...registry.workspaces[id],
      ...updates,
      id, // don't allow overriding the id
      updatedAt: new Date().toISOString()
    }

    await this.save()
  }

  /**
   * Remove a workspace entry
   */
  async remove(id: string): Promise<void> {
    const registry = await this.load()
    delete registry.workspaces[id]
    await this.save()
  }

  /**
   * Rename a workspace (change display name only, UUID stays the same)
   */
  async rename(id: string, newDisplayName: string): Promise<void> {
    await this.update(id, { displayName: newDisplayName })
  }

  // ==================== Lookup Helpers ====================

  /**
   * Resolve a display name to a UUID
   * Returns null if not found
   */
  async resolveDisplayNameToId(displayName: string): Promise<string | null> {
    const entry = await this.getByDisplayName(displayName)
    return entry?.id || null
  }

  /**
   * Resolve a UUID to a display name  
   * Returns null if not found
   */
  async resolveIdToDisplayName(id: string): Promise<string | null> {
    const entry = await this.getById(id)
    return entry?.displayName || null
  }

  /**
   * Check if a UUID exists in the registry
   */
  async exists(id: string): Promise<boolean> {
    const registry = await this.load()
    return id in registry.workspaces
  }

  /**
   * Check if a display name is already used
   */
  async displayNameExists(displayName: string): Promise<boolean> {
    const entry = await this.getByDisplayName(displayName)
    return entry !== null
  }

  /**
   * Get a non-clashing display name (like "ERC20 - 1", "ERC20 - 2")
   */
  async getAvailableDisplayName(baseName: string): Promise<string> {
    const registry = await this.load()
    const names = new Set(Object.values(registry.workspaces).map(w => w.displayName))

    if (!names.has(baseName)) return baseName

    let index = 1
    while (names.has(`${baseName} - ${index}`)) {
      index++
    }
    return `${baseName} - ${index}`
  }

  /**
   * Get the remote ID for a workspace (for S3 sync)
   * This is the ID used as the S3 prefix
   */
  async getRemoteId(id: string): Promise<string | null> {
    const entry = await this.getById(id)
    // If no explicit remoteId, use the workspace UUID itself
    return entry?.remoteId || entry?.id || null
  }
}

/**
 * Create a workspace registry manager using the global remixFileSystem
 */
export function createWorkspaceRegistryManager(): WorkspaceRegistryManager {
  const fs = (window as any).remixFileSystem
  if (!fs) {
    throw new Error('remixFileSystem not available')
  }
  return new WorkspaceRegistryManager(fs)
}
