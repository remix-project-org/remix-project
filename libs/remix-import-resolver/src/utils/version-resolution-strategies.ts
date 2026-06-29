import type { IOAdapter } from '../adapters/io-adapter'
import { Logger } from './logger'
import { isNpmProtocol, NPM_PROTOCOL, ALIAS_PREFIX, ImportPatterns } from '../constants/import-patterns'

// =============================================================================
// LOCKFILE TYPES
// =============================================================================

/**
 * Entry in a package-lock.json dependencies or packages section
 */
interface PackageLockEntry {
  version?: string
  resolved?: string
  integrity?: string
  dependencies?: Record<string, string>
}

/**
 * Structure of a package-lock.json file (npm lockfile v1 and v2)
 */
interface PackageLockJson {
  name?: string
  version?: string
  lockfileVersion?: number
  dependencies?: Record<string, PackageLockEntry>
  packages?: Record<string, PackageLockEntry>
}

// =============================================================================
// STRATEGY TYPES
// =============================================================================

/**
 * Result of a version resolution attempt
 */
export interface ResolvedVersion {
  version: string | null
  source: string
}

/**
 * Context passed to version resolution strategies
 */
export interface VersionResolutionContext {
  packageName: string
  parentDeps?: Map<string, string>
  parentPackage?: string
}

/**
 * Interface for version resolution strategies
 *
 * Each strategy implements one approach to resolving a package version.
 * Strategies are tried in priority order until one succeeds.
 */
export interface IVersionResolutionStrategy {
  /** Human-readable name for logging */
  readonly name: string

  /** Priority level (higher = tried first) */
  readonly priority: number

  /**
   * Initialize the strategy (load data if needed)
   * Called once before resolution begins
   */
  initialize(): Promise<void>

  /**
   * Check if this strategy can potentially resolve the package
   * Fast check before attempting resolution
   */
  canResolve(context: VersionResolutionContext): boolean

  /**
   * Attempt to resolve the version
   * Returns resolved version or null if strategy doesn't apply
   */
  resolve(context: VersionResolutionContext): Promise<ResolvedVersion | null>

  /**
   * Clear any cached data
   */
  clear(): void
}

/**
 * Abstract base class for version resolution strategies
 */
export abstract class BaseVersionStrategy implements IVersionResolutionStrategy {
  abstract readonly name: string
  abstract readonly priority: number

  protected logger: Logger
  protected io: IOAdapter

  constructor(io: IOAdapter, logger: Logger) {
    this.io = io
    this.logger = logger
  }

  protected log(msg: string, ...args: any[]): void {
    this.logger.logIf('packageVersionResolver', msg, ...args)
  }

  async initialize(): Promise<void> {
    // Default: no initialization needed
  }

  canResolve(_context: VersionResolutionContext): boolean {
    return true // Default: always try
  }

  abstract resolve(context: VersionResolutionContext): Promise<ResolvedVersion | null>

  clear(): void {
    // Default: nothing to clear
  }
}

/**
 * Strategy 1: Workspace Resolutions
 *
 * Resolves from package.json resolutions/overrides and npm: aliases.
 * Highest priority - workspace config always wins.
 */
export class WorkspaceResolutionStrategy extends BaseVersionStrategy {
  readonly name = 'workspace-resolution'
  readonly priority = 100

  private resolutions: Map<string, string> = new Map()
  private initialized = false

  async initialize(): Promise<void> {
    if (this.initialized) return
    this.resolutions.clear()

    try {
      const exists = await this.io.exists('package.json')
      if (!exists) {
        this.initialized = true
        return
      }

      const content = await this.io.readFile('package.json')
      const packageJson = JSON.parse(content)

      // Load resolutions/overrides
      const resolutions = packageJson.resolutions || packageJson.overrides || {}
      for (const [pkg, version] of Object.entries(resolutions)) {
        if (typeof version === 'string') {
          this.resolutions.set(pkg, version)
          this.log(`[PkgVer] 📌 Workspace resolution: ${pkg} → ${version}`)
        }
      }

      // Load npm: aliases from dependencies
      const allDeps = {
        ...(packageJson.dependencies || {}),
        ...(packageJson.peerDependencies || {}),
        ...(packageJson.devDependencies || {})
      }

      for (const [pkg, versionRange] of Object.entries(allDeps)) {
        if (!this.resolutions.has(pkg) && typeof versionRange === 'string') {
          if (isNpmProtocol(versionRange)) {
            const npmAlias = versionRange.substring(NPM_PROTOCOL.length)
            const match = npmAlias.match(ImportPatterns.VERSIONED_PACKAGE)
            if (match) {
              const [, realPackage, version] = match
              this.resolutions.set(pkg, `${ALIAS_PREFIX}${realPackage}@${version}`)
              this.log(`[PkgVer] 🔗 NPM alias: ${pkg} → ${realPackage}@${version}`)
            }
          } else if (versionRange.match(ImportPatterns.EXACT_SEMVER)) {
            this.resolutions.set(pkg, versionRange)
            this.log(`[PkgVer] 📦 Workspace dependency (exact): ${pkg} → ${versionRange}`)
          }
        }
      }

      this.initialized = true
    } catch {
      this.log(`[PkgVer] ℹ️ No workspace package.json or resolutions`)
      this.initialized = true
    }
  }

  canResolve(context: VersionResolutionContext): boolean {
    return this.resolutions.has(context.packageName)
  }

  async resolve(context: VersionResolutionContext): Promise<ResolvedVersion | null> {
    const { packageName } = context

    if (!this.resolutions.has(packageName)) {
      return null
    }

    const resolution = this.resolutions.get(packageName)!

    // Handle alias resolution
    if (resolution.startsWith('alias:')) {
      const aliasTarget = resolution.substring(6)
      const match = aliasTarget.match(/^(@?[^@]+)@(.+)$/)
      if (match) {
        const [, realPackage, version] = match
        this.log(`[PkgVer] ✅ Workspace alias: ${packageName} → ${realPackage}@${version}`)
        return { version, source: `alias:${packageName}→${realPackage}` }
      }
    }

    this.log(`[PkgVer] ✅ Workspace resolution: ${packageName} → ${resolution}`)
    return { version: resolution, source: 'workspace-resolution' }
  }

  clear(): void {
    this.resolutions.clear()
    this.initialized = false
    this.log(`[PkgVer] 🗑️ Cleared workspace resolutions cache`)
  }

  // Expose for compatibility
  has(name: string): boolean { return this.resolutions.has(name) }
  get(name: string): string | undefined { return this.resolutions.get(name) }
  getAll(): ReadonlyMap<string, string> { return this.resolutions }
}

/**
 * Strategy 2: Parent Dependencies
 *
 * Resolves from the parent package's dependencies.
 * Used for transitive dependency resolution.
 */
export class ParentDependencyStrategy extends BaseVersionStrategy {
  readonly name = 'parent-dependency'
  readonly priority = 75

  canResolve(context: VersionResolutionContext): boolean {
    return !!(context.parentDeps && context.parentDeps.has(context.packageName))
  }

  async resolve(context: VersionResolutionContext): Promise<ResolvedVersion | null> {
    const { packageName, parentDeps, parentPackage } = context

    if (!parentDeps || !parentDeps.has(packageName)) {
      return null
    }

    const version = parentDeps.get(packageName)!
    this.log(`[PkgVer] ✅ Parent dependency: ${packageName} → ${version}${parentPackage ? ` (from ${parentPackage})` : ''}`)
    return {
      version,
      source: parentPackage ? `parent-${parentPackage}` : 'parent'
    }
  }
}

/**
 * Strategy 3: Lock File
 *
 * Resolves from yarn.lock or package-lock.json.
 * Provides deterministic versions from project lockfile.
 */
export class LockFileStrategy extends BaseVersionStrategy {
  readonly name = 'lock-file'
  readonly priority = 50

  private versions: Map<string, string> = new Map()
  private initialized = false

  async initialize(): Promise<void> {
    if (this.initialized || this.versions.size > 0) return

    // Try yarn.lock first
    try {
      if (await this.io.exists('yarn.lock')) {
        await this.parseYarnLock()
        this.initialized = true
        return
      }
    } catch {}

    // Fallback to package-lock.json
    try {
      if (await this.io.exists('package-lock.json')) {
        await this.parsePackageLock()
        this.initialized = true
        return
      }
    } catch {}

    this.initialized = true
  }

  private async parseYarnLock(): Promise<void> {
    try {
      const content = await this.io.readFile('yarn.lock')
      const lines = content.split('\n')
      let currentPackage: string | null = null

      for (const line of lines) {
        const packageMatch = line.match(/^"?(@?[^"@]+(?:\/[^"@]+)?)@[^"]*"?:/)
        if (packageMatch) currentPackage = packageMatch[1]

        const versionMatch = line.match(/^\s+version\s+"([^"]+)"/)
        if (versionMatch && currentPackage) {
          this.versions.set(currentPackage, versionMatch[1])
          currentPackage = null
        }
      }

      this.log(`[PkgVer] 🔒 Loaded ${this.versions.size} versions from yarn.lock`)
    } catch (err) {
      this.log(`[PkgVer] ⚠️ Failed to parse yarn.lock:`, err)
    }
  }

  private async parsePackageLock(): Promise<void> {
    try {
      const content = await this.io.readFile('package-lock.json')
      const lockData = JSON.parse(content) as PackageLockJson

      if (lockData.dependencies) {
        for (const [pkg, data] of Object.entries(lockData.dependencies)) {
          if (data?.version) {
            this.versions.set(pkg, data.version)
          }
        }
      }

      if (lockData.packages) {
        for (const [path, data] of Object.entries(lockData.packages)) {
          if (data?.version) {
            if (path === '') continue
            const pkg = path.replace(/^node_modules\//, '')
            if (pkg) this.versions.set(pkg, data.version)
          }
        }
      }

      this.log(`[PkgVer] 🔒 Loaded ${this.versions.size} versions from package-lock.json`)
    } catch (err) {
      this.log(`[PkgVer] ⚠️ Failed to parse package-lock.json:`, err)
    }
  }

  canResolve(context: VersionResolutionContext): boolean {
    return this.versions.has(context.packageName)
  }

  async resolve(context: VersionResolutionContext): Promise<ResolvedVersion | null> {
    const { packageName } = context

    if (!this.versions.has(packageName)) {
      return null
    }

    const version = this.versions.get(packageName)!
    this.log(`[PkgVer] ✅ Lock file: ${packageName} → ${version}`)
    return { version, source: 'lock-file' }
  }

  clear(): void {
    this.versions.clear()
    this.initialized = false
    this.log(`[PkgVer] 🗑️ Cleared lockfile versions cache`)
  }

  // Expose for compatibility
  has(name: string): boolean { return this.versions.has(name) }
  get(name: string): string | undefined { return this.versions.get(name) }
}

/**
 * Strategy 4: NPM Fetch
 *
 * Fetches package.json from npm as a last resort.
 * Lowest priority - used when no local version info is available.
 */
export class NpmFetchStrategy extends BaseVersionStrategy {
  readonly name = 'npm-fetch'
  readonly priority = 0

  async resolve(context: VersionResolutionContext): Promise<ResolvedVersion | null> {
    const { packageName } = context

    this.log(`[PkgVer] 🌐 Fetching package.json: ${packageName}`)

    try {
      const packageJsonUrl = `${packageName}/package.json`
      const content = await this.io.fetch(packageJsonUrl)
      const packageJson = JSON.parse(content)
      const version = packageJson.version || null

      this.log(`[PkgVer] ✅ NPM fetch: ${packageName} → ${version}`)
      return { version, source: 'package-json' }
    } catch (err) {
      this.log(`[PkgVer] ⚠️ Failed to fetch package.json for ${packageName}:`, err)
      return { version: null, source: 'fetched' }
    }
  }
}
