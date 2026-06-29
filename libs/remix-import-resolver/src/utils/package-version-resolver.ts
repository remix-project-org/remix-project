import type { IOAdapter } from '../adapters/io-adapter'
import { Logger } from './logger'
import type { IVersionResolutionStrategy, VersionResolutionContext, ResolvedVersion } from './version-resolution-strategies'
import {
  WorkspaceResolutionStrategy,
  ParentDependencyStrategy,
  LockFileStrategy,
  NpmFetchStrategy
} from './version-resolution-strategies'

export type { ResolvedVersion } from './version-resolution-strategies'

/**
 * PackageVersionResolver
 *
 * Resolves a concrete version for a package using pluggable strategies with precedence:
 * 1) Workspace resolutions/overrides and aliases (priority: 100)
 * 2) Parent package.json dependencies (priority: 75)
 * 3) Lockfiles - yarn.lock, package-lock.json (priority: 50)
 * 4) Fetched package.json from npm (priority: 0)
 *
 * Uses the Strategy Pattern to allow easy extension and testing of resolution logic.
 */
export class PackageVersionResolver {
  private strategies: IVersionResolutionStrategy[]
  private logger: Logger
  private initialized = false

  // Keep references to specific strategies for backwards compatibility
  private workspaceStrategy: WorkspaceResolutionStrategy
  private lockFileStrategy: LockFileStrategy

  constructor(private io: IOAdapter, private debug = false) {
    this.logger = new Logger(undefined, debug)

    // Initialize default strategies
    this.workspaceStrategy = new WorkspaceResolutionStrategy(io, this.logger)
    this.lockFileStrategy = new LockFileStrategy(io, this.logger)

    this.strategies = [
      this.workspaceStrategy,
      new ParentDependencyStrategy(io, this.logger),
      this.lockFileStrategy,
      new NpmFetchStrategy(io, this.logger)
    ]

    // Sort by priority (highest first)
    this.strategies.sort((a, b) => b.priority - a.priority)
  }

  private log(msg: string, ...args: any[]) {
    this.logger.logIf('packageVersionResolver', msg, ...args)
  }

  // --- Backwards compatibility accessors ---

  public getWorkspaceResolutions(): ReadonlyMap<string, string> {
    return this.workspaceStrategy.getAll()
  }

  public hasWorkspaceResolution(name: string): boolean {
    return this.workspaceStrategy.has(name)
  }

  public getWorkspaceResolution(name: string): string | undefined {
    return this.workspaceStrategy.get(name)
  }

  public hasLockFileVersion(name: string): boolean {
    return this.lockFileStrategy.has(name)
  }

  public getLockFileVersion(name: string): string | undefined {
    return this.lockFileStrategy.get(name)
  }

  /** Clear cached workspace resolutions to force reload on next access. */
  public clearWorkspaceResolutions(): void {
    this.workspaceStrategy.clear()
    this.initialized = false
  }

  /** Clear cached lockfile versions to force reload on next access. */
  public clearLockFileVersions(): void {
    this.lockFileStrategy.clear()
    this.initialized = false
  }

  /** Load workspace resolutions (resolutions/overrides, deps incl. npm: aliases). */
  public async loadWorkspaceResolutions(): Promise<void> {
    await this.workspaceStrategy.initialize()
  }

  /** Parse lockfiles once to populate exact versions. */
  public async loadLockFileVersions(): Promise<void> {
    await this.lockFileStrategy.initialize()
  }

  /**
   * Initialize all strategies.
   * Called automatically on first resolution, but can be called explicitly.
   */
  public async initializeStrategies(): Promise<void> {
    if (this.initialized) return

    this.log(`[PkgVer] Initializing ${this.strategies.length} resolution strategies...`)

    await Promise.all(
      this.strategies.map(strategy => strategy.initialize())
    )

    this.initialized = true
    this.log(`[PkgVer] All strategies initialized`)
  }

  /**
   * Add a custom resolution strategy.
   * Strategies are sorted by priority after adding.
   */
  public addStrategy(strategy: IVersionResolutionStrategy): void {
    this.strategies.push(strategy)
    this.strategies.sort((a, b) => b.priority - a.priority)
    this.log(`[PkgVer] Added strategy: ${strategy.name} (priority: ${strategy.priority})`)
  }

  /**
   * Remove a strategy by name.
   */
  public removeStrategy(name: string): boolean {
    const index = this.strategies.findIndex(s => s.name === name)
    if (index !== -1) {
      this.strategies.splice(index, 1)
      this.log(`[PkgVer] Removed strategy: ${name}`)
      return true
    }
    return false
  }

  /** Resolve a version for a package given optional parent dependency context. */
  public async resolveVersion(
    packageName: string,
    parentDeps?: Map<string, string>,
    parentPackage?: string
  ): Promise<ResolvedVersion> {
    this.log(`[PkgVer] 🔍 Resolving version for: ${packageName}`)

    // Ensure all strategies are initialized
    await this.initializeStrategies()

    const context: VersionResolutionContext = {
      packageName,
      parentDeps,
      parentPackage
    }

    // Try each strategy in priority order
    for (const strategy of this.strategies) {
      // Quick check if strategy can potentially resolve
      if (!strategy.canResolve(context)) {
        this.log(`[PkgVer] ⏭️ ${strategy.name}: skipped (canResolve=false)`)
        continue
      }

      const result = await strategy.resolve(context)
      if (result && result.version !== null) {
        return result
      }

      this.log(`[PkgVer] ⏭️ ${strategy.name}: not found`)
    }

    // No strategy could resolve
    this.log(`[PkgVer] ⚠️ No strategy could resolve: ${packageName}`)
    return { version: null, source: 'unresolved' }
  }
}
