'use strict'

import { Plugin } from '@remixproject/engine'
import type { IResolutionIndex } from '../resolution-index/base-resolution-index'
import { ResolutionIndex } from '../resolution-index/resolution-index'
import { IImportResolver } from './import-resolver-interface'
import { normalizeGithubBlobUrl, normalizeIpfsUrl, normalizeRawGithubUrl, normalizeSwarmUrl, rewriteNpmCdnUrl } from '../utils/url-normalizer'
import { extractPackageName as parsePkgName, extractVersion as parseVersion, extractRelativePath as parseRelPath } from '../utils/parser-utils'
import { routeUrl } from '../utils/url-request-router'
import { isBreakingVersionConflict, isPotentialVersionConflict } from '../utils/semver-utils'
import { PackageVersionResolver } from '../utils/package-version-resolver'
import { Logger } from '../utils/logger'
import { WarningSystem } from '../utils/warning-system'
import { ContentFetcher, FetchResult } from '../utils/content-fetcher'
import { DependencyStore } from '../utils/dependency-store'
import { ConflictChecker } from '../utils/conflict-checker'
import { PackageMapper } from '../utils/package-mapper'
import type { IOAdapter } from '../adapters/io-adapter'
import { RemixPluginAdapter } from '../adapters/remix-plugin-adapter'
import { FileResolutionIndex } from '../resolution-index/file-resolution-index'
import { ImportHandlerRegistry } from '../handlers/import-handler-registry'
import type { ImportHandlerContext } from '../handlers/import-handler-interface'
import { RemixTestLibsHandler } from '../handlers/remix-test-libs-handler'
import { isPlugin, PartialPackageJson } from '../types'
import {
  DEPS_DIR,
  DEPS_NPM_DIR,
  DEPS_GITHUB_DIR,
  DEPS_HTTP_DIR,
  isDepsPath,
  isHttpUrl,
  ImportPatterns,
  ensureNpmDepsPrefix,
  sanitizeUrlToPath
} from '../constants/import-patterns'

/**
 * ImportResolver
 *
 * Orchestrates import resolution for Solidity and package.json files with adapterized I/O.
 * Responsibilities:
 * - Normalize and route external URLs (CDN, GitHub, IPFS, Swarm)
 * - Resolve npm package versions with precedence (workspace → parent deps → lockfile → npm)
 * - Map packages to isolated versioned namespaces and persist real package.json for transitive deps
 * - Fetch content and save to deterministic paths; record original → resolved mappings
 * - Persist mappings to a resolution index to power IDE features like Go-to-Definition
 */
export class ImportResolver implements IImportResolver {
  private importMappings: Map<string, string>
  private pluginApi: Plugin | null
  private targetFile: string
  private resolutions: Map<string, string> = new Map()
  private packageVersionResolver: PackageVersionResolver
  private contentFetcher: ContentFetcher
  private dependencyStore: DependencyStore
  private logger: Logger
  private conflictChecker: ConflictChecker
  private io: IOAdapter
  private importedFiles: Map<string, string> = new Map()
  private packageSources: Map<string, string> = new Map()
  private debug: boolean = false
  private cacheEnabled: boolean = true
  private packageMapper: PackageMapper
  // Cache to avoid refetching the same GitHub package.json multiple times per session
  private fetchedGitHubPackages: Set<string> = new Set()
  private warnings: WarningSystem

  private resolutionIndex: IResolutionIndex | null = null
  private resolutionIndexInitialized: boolean = false
  private handlerRegistry: ImportHandlerRegistry

  /**
   * Create a resolver for a given target file. The target file name scopes the resolution index.
   *
   * Inputs:
   * - pluginApi or io: Remix plugin API or Node IO adapter
   * - targetFile: the file whose imports are being resolved (used for index scoping)
   * - debug: when true, emits verbose logs to aid debugging
   * - options: { registerDefaultHandlers?: boolean } - auto-register common handlers like RemixTestLibsHandler (defaults to true)
   */
  constructor(pluginApi: Plugin, targetFile: string, debug?: boolean, options?: { registerDefaultHandlers?: boolean })
  constructor(io: IOAdapter, targetFile: string, debug?: boolean, options?: { registerDefaultHandlers?: boolean })
  constructor(pluginOrIo: Plugin | IOAdapter, targetFile: string, debug: boolean = false, options: { registerDefaultHandlers?: boolean } = { registerDefaultHandlers: true }) {
    const pluginDetected = isPlugin(pluginOrIo)
    this.pluginApi = pluginDetected ? (pluginOrIo as Plugin) : null
    this.targetFile = targetFile
    this.debug = debug
    this.importMappings = new Map()
    this.resolutions = new Map()
    this.importedFiles = new Map()
    this.packageSources = new Map()
    this.io = pluginDetected ? new RemixPluginAdapter(this.pluginApi!) : (pluginOrIo as IOAdapter)
    this.packageVersionResolver = new PackageVersionResolver(this.io, debug)
    this.logger = new Logger(this.pluginApi || undefined, debug)
    this.contentFetcher = new ContentFetcher(this.io, debug)
    this.contentFetcher.setCacheEnabled(true)
    this.dependencyStore = new DependencyStore()
    this.conflictChecker = new ConflictChecker({
      logger: this.logger,
      versionResolver: this.packageVersionResolver,
      depStore: this.dependencyStore,
      getImportMapping: (key: string) => this.importMappings.get(key)
    })
    this.packageMapper = new PackageMapper({
      importMappings: this.importMappings,
      packageSources: this.packageSources,
      dependencyStore: this.dependencyStore,
      packageVersionResolver: this.packageVersionResolver,
      contentFetcher: this.contentFetcher,
      logger: this.logger,
      resolvePackageVersion: this.resolvePackageVersion.bind(this),
      conflictChecker: this.conflictChecker
    })
    this.resolutionIndex = null
    this.resolutionIndexInitialized = false
    this.fetchedGitHubPackages = new Set()
    this.warnings = new WarningSystem(this.logger, { verbose: !!debug })
    this.handlerRegistry = new ImportHandlerRegistry(debug)

    // Auto-register default handlers (enabled by default)
    if (options.registerDefaultHandlers !== false) {
      this.registerDefaultHandlers().catch(err => {
        this.log('[ImportResolver] Failed to register default handlers:', err)
      })
    }
  }

  /**
   * Register commonly used handlers like RemixTestLibsHandler
   */
  private async registerDefaultHandlers(): Promise<void> {
    const testLibHandler = new RemixTestLibsHandler({
      pluginApi: this.pluginApi as Plugin,
      io: this.io,
      debug: this.debug
    })
    this.handlerRegistry.register(testLibHandler)

    if (this.debug) {
      this.log('[ImportResolver] Registered default handlers')
    }
  }

  private log(message: string, ...args: any[]): void {
    this.logger.logIf('importResolver', message, ...args)
  }

  /**
   * Set the current package context for dependency-aware resolution.
   * Pass a versioned package (e.g., "@openzeppelin/contracts@4.9.6") to influence child resolves.
   */
  public setPackageContext(context: string | null): void {
    if (context) this.importMappings.set('__CONTEXT__', context)
    else this.importMappings.delete('__CONTEXT__')
  }

  /** Log current package and import mappings for this resolver's session. */
  public logMappings(): void {
    this.log(`[ImportResolver] 📊 Current import mappings for: "${this.targetFile}"`)
    if (this.importMappings.size === 0) this.log(`[ImportResolver] ℹ️  No mappings defined`)
    else this.importMappings.forEach((value, key) => this.log(`[ImportResolver]   ${key} → ${value}`))
  }

  /** Enable or disable cache usage for this resolver session. */
  public setCacheEnabled(enabled: boolean): void {
    this.cacheEnabled = !!enabled
    try { this.contentFetcher.setCacheEnabled(this.cacheEnabled) } catch {}
  }

  /** Get access to the import handler registry for registering custom handlers */
  public getHandlerRegistry(): ImportHandlerRegistry {
    return this.handlerRegistry
  }

  /** Ensure the dependency graph for a versioned package context is loaded from its package.json. */
  public async ensurePackageContextLoaded(context: string): Promise<void> {
    try {
      if (!context) return
      if (this.dependencyStore.hasParent(context)) return
      const m = context.match(/^(@?[^@]+)@(.+)$/)
      if (!m) return
      const packageName = m[1]
      const version = m[2]
      const pkgJsonPath = `${DEPS_NPM_DIR}${packageName}@${version}/package.json`
      // If already present on disk, read and use it; otherwise fetch and persist
      let packageJson: PartialPackageJson
      if (await this.contentFetcher.exists(pkgJsonPath)) {
        const existing = await this.contentFetcher.readFile(pkgJsonPath)
        packageJson = JSON.parse(existing) as PartialPackageJson
        this.log(`[ImportResolver] 📦 Using cached context package.json → ${pkgJsonPath}`)
      } else {
        const packageJsonUrl = `${packageName}@${version}/package.json`
        const content: FetchResult = await this.contentFetcher.resolve(packageJsonUrl)
        packageJson = JSON.parse(content.content) as PartialPackageJson
        await this.contentFetcher.setFile(pkgJsonPath, JSON.stringify(packageJson, null, 2))
        this.log(`[ImportResolver] 💾 Loaded context package.json → ${pkgJsonPath}`)
      }
      this.dependencyStore.storePackageDependencies(context, packageJson)
    } catch (err) {
      this.log(`[ImportResolver] ℹ️  Could not load package.json for context ${context}:`, err)
    }
  }

  // Removed an unused checkDependencyConflict method; conflict detection lives in ConflictChecker

  private findParentPackageContext(): string | null {
    const explicitContext = this.importMappings.get('__CONTEXT__')
    if (explicitContext && this.dependencyStore.hasParent(explicitContext)) {
      this.log(`[ImportResolver]    📍 Using explicit context: ${explicitContext}`)
      return explicitContext
    }
    const mappedPackages = Array.from(this.importMappings.values())
      .filter(v => v !== explicitContext && v.includes('@'))
      .map(v => { const match = v.match(/^(@?[^@]+)@(.+)$/); return match ? `${match[1]}@${match[2]}` : null })
      .filter(Boolean) as string[]
    for (let i = mappedPackages.length - 1; i >= 0; i--) {
      const pkg = mappedPackages[i]
      if (pkg && this.dependencyStore.hasParent(pkg)) return pkg
    }
    return null
  }

  private checkForConflictingParentDependencies(packageName: string): void {
    const conflictingParents: Array<{ parent: string, version: string }> = []
    for (const [parentPkg, deps] of this.dependencyStore.entries()) {
      if (deps.has(packageName)) {
        conflictingParents.push({ parent: parentPkg, version: deps.get(packageName)! })
      }
    }
    if (conflictingParents.length >= 2) {
      const uniqueVersions = new Set(conflictingParents.map(p => p.version))
      if (uniqueVersions.size > 1) {
        this.warnings.emitMultiParentConflictWarn(packageName, conflictingParents)
      }
    }
  }

  /**
   * Ensure a versioned npm package has its real package.json fetched and saved under .deps.
   * Idempotent: skips if already captured in the dependency store.
   */
  private async ensurePackageJsonSaved(versionedPackageName: string): Promise<void> {
    if (this.dependencyStore.hasParent(versionedPackageName) && this.cacheEnabled) return
    try {
      const pkgJsonPath = `${DEPS_NPM_DIR}${versionedPackageName}/package.json`
      let packageJson: PartialPackageJson
      if (this.cacheEnabled && await this.contentFetcher.exists(pkgJsonPath)) {
        const existing = await this.contentFetcher.readFile(pkgJsonPath)
        packageJson = JSON.parse(existing) as PartialPackageJson
        this.log(`[ImportResolver] 📦 Using cached package.json: ${pkgJsonPath}`)
      } else {
        const packageJsonUrl = `${versionedPackageName}/package.json`
        const content: FetchResult = await this.contentFetcher.resolve(packageJsonUrl)
        packageJson = JSON.parse(content.content) as PartialPackageJson

        // Extract expected version from versionedPackageName (e.g., "@openzeppelin/contracts@5.4.0" -> "5.4.0")
        const match = versionedPackageName.match(/@([^@]+)$/)
        const expectedVersion = match ? match[1] : null
        const fetchedVersion = packageJson.version

        // Validate version match to prevent overwriting wrong package.json files
        // Allow semver ranges: @5 resolves to 5.x.x, @5.0 resolves to 5.0.x, @5.0.0 must match exactly
        if (expectedVersion && fetchedVersion && fetchedVersion !== expectedVersion) {
          // Check if expectedVersion is a semver range (e.g., "5" or "5.0")
          const expectedParts = expectedVersion.split('.')
          const fetchedParts = fetchedVersion.split('.')

          // Validate that fetched version matches the specified range
          let isValidRange = true
          for (let i = 0; i < expectedParts.length && i < fetchedParts.length; i++) {
            if (expectedParts[i] !== fetchedParts[i]) {
              isValidRange = false
              break
            }
          }

          if (!isValidRange) {
            this.log(`[ImportResolver] ⚠️  Version mismatch: expected ${expectedVersion}, got ${fetchedVersion}`)
            throw new Error(`Version mismatch: fetched ${fetchedVersion} but expected ${expectedVersion} for ${versionedPackageName}`)
          }
        }

        await this.contentFetcher.setFile(pkgJsonPath, JSON.stringify(packageJson, null, 2))
        this.log(`[ImportResolver] 💾 Saved package.json to: ${pkgJsonPath}`)
      }
      this.dependencyStore.storePackageDependencies(versionedPackageName, packageJson)
    } catch (err) {
      this.log(`[ImportResolver] ⚠️  Failed to fetch/save package.json:`, err)
    }
  }

  /**
   * Handle an unversioned npm import by mapping it to the isolated versioned namespace and recursing.
   * Returns string content if it performed a remap (early return path), otherwise null to continue.
   */
  private async mapUnversionedImport(
    url: string,
    packageName: string,
    originalUrl: string,
    targetPath?: string
  ): Promise<string | null> {
    const mappingKey = `__PKG__${packageName}`
    if (!this.importMappings.has(mappingKey)) {
      this.log(`[ImportResolver] 🔍 First import from ${packageName}, resolving version...`)
      await this.packageMapper.fetchAndMapPackage(packageName)
    }
    if (this.importMappings.has(mappingKey)) {
      const versionedPackageName = this.importMappings.get(mappingKey)!
      const mappedUrl = url.replace(packageName, versionedPackageName)
      this.log(`[ImportResolver] 🔀 Mapped: ${packageName} → ${versionedPackageName}`)
      if (!this.resolutions.has(originalUrl)) this.resolutions.set(originalUrl, mappedUrl)
      return this.resolveAndSave(mappedUrl, targetPath, true)
    } else {
      this.log(`[ImportResolver] ❌ Failed to resolve package version for ${packageName}`)
      throw new Error(`File not found: ${originalUrl}\nCould not resolve package version for "${packageName}". Package may not exist or version could not be determined.`)
    }
  }

  /**
   * For explicit versioned imports where a workspace/global mapping exists, reconcile versions and recurse if needed.
   * Returns string content if it performed a remap (early return path), otherwise null to continue.
   */
  private async handleExplicitVersionWithMapping(
    url: string,
    packageName: string,
    requestedVersion: string,
    mappedVersionedPackageName: string,
    originalUrl: string,
    targetPath?: string
  ): Promise<string | null> {
    const resolvedVersion = parseVersion(mappedVersionedPackageName)!
    if (requestedVersion && resolvedVersion && requestedVersion !== resolvedVersion) {
      // Detect and warn on duplicate file across versions, and track the chosen version per file
      const relativePath = parseRelPath(url, packageName)
      const fileKey = relativePath ? `${packageName}/${relativePath}` : null
      const previousVersion = fileKey ? this.importedFiles.get(fileKey) : null
      if (previousVersion && previousVersion !== requestedVersion) {
        await this.warnings.emitDuplicateFileError({
          packageName,
          relativePath,
          previousVersion,
          requestedVersion
        })
      }
      if (fileKey) {
        this.importedFiles.set(fileKey, requestedVersion)
        this.log(`[ImportResolver] 📝 Tracking: ${fileKey} @ ${requestedVersion}`)
      }
      this.log(`[ImportResolver] ✅ Explicit version: ${packageName}@${requestedVersion}`)
      const versionedPackageName = `${packageName}@${requestedVersion}`
      await this.ensurePackageJsonSaved(versionedPackageName)
      if (!this.resolutions.has(originalUrl)) this.resolutions.set(originalUrl, url)
      return this.resolveAndSave(url, targetPath, true)
    } else if (requestedVersion && resolvedVersion && requestedVersion === resolvedVersion) {
      // Normalize any import to the canonical mapped namespace if different in string form
      const mappedUrl = url.replace(`${packageName}@${requestedVersion}`, mappedVersionedPackageName)
      if (mappedUrl !== url) {
        if (!this.resolutions.has(originalUrl)) this.resolutions.set(originalUrl, mappedUrl)
        return this.resolveAndSave(mappedUrl, targetPath, true)
      }
    }
    return null
  }

  private async resolvePackageVersion(packageName: string): Promise<{ version: string | null, source: string }> {
    this.log(`[ImportResolver] 🔍 Resolving version for: ${packageName}`)
    this.checkForConflictingParentDependencies(packageName)
    const parentPackage = this.findParentPackageContext()
    const parentDeps = parentPackage ? this.dependencyStore.getParentPackageDeps(parentPackage) : undefined
    return await this.packageVersionResolver.resolveVersion(packageName, parentDeps, parentPackage || undefined)
  }

  private async fetchGitHubPackageJson(owner: string, repo: string, ref: string): Promise<void> {
    try {
      const key = `${owner}/${repo}@${ref}`
      const targetPath = `${DEPS_GITHUB_DIR}${owner}/${repo}@${ref}/package.json`

      // Skip if we already processed this repo/ref in this session
      if (this.cacheEnabled && this.fetchedGitHubPackages.has(key)) {
        this.log(`[ImportResolver] 📦 Skipping GitHub package.json fetch (cached): ${key}`)
        return
      }

      // If file already exists on disk, don't refetch; load into store once
      if (this.cacheEnabled && await this.contentFetcher.exists(targetPath)) {
        this.fetchedGitHubPackages.add(key)
        try {
          if (!this.dependencyStore.hasParent(key)) {
            const existing = await this.contentFetcher.readFile(targetPath)
            const pkg = JSON.parse(existing)
            if (pkg && pkg.name) this.dependencyStore.storePackageDependencies(key, pkg)
          }
        } catch {}
        this.log(`[ImportResolver] 📦 GitHub package.json already present: ${targetPath}`)
        return
      }

      const packageJsonUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/package.json`
      this.log(`[ImportResolver] 📦 Attempting to fetch GitHub package.json: ${packageJsonUrl}`)
      const content: FetchResult = await this.contentFetcher.resolve(packageJsonUrl)
      const packageJson = JSON.parse(content.content) as PartialPackageJson
      if (packageJson && packageJson.name) {
        await this.contentFetcher.setFile(targetPath, JSON.stringify(packageJson, null, 2))
        if (this.cacheEnabled) this.fetchedGitHubPackages.add(key)
        this.log(`[ImportResolver] ✅ Saved GitHub package.json to: ${targetPath}`)
        this.log(`[ImportResolver]    Package: ${packageJson.name}@${packageJson.version || 'unknown'}`)
        if (packageJson.version) {
          this.dependencyStore.storePackageDependencies(key, packageJson)
        }
      }
    } catch (err) {
      this.log(`[ImportResolver] ℹ️  No package.json found for ${owner}/${repo}@${ref} (this is normal for non-npm repos)`)
    }
  }

  // Package mapping/version logic moved to PackageMapper

  /**
   * Resolve an import and save its content to a deterministic path.
   *
   * Inputs:
   * - url: original import (npm path, CDN URL, GitHub URL, ipfs://, etc.)
   * - targetPath: optional override for where to save the content
   * - skipResolverMappings: internal flag to avoid infinite remap recursion
   *
   * Output: string content of the fetched file (throws on invalid import types)
   */
  public async resolveAndSave(url: string, targetPath?: string, skipResolverMappings = false): Promise<string> {
    const originalUrl = url
    if (!url.endsWith('.sol') && !url.endsWith('package.json')) {
      this.log(`[ImportResolver] ❌ Invalid import: "${url}" does not end with .sol extension`)
      throw new Error(`Invalid import: "${url}" does not end with .sol extension`)
    }

    // Try registered import handlers first (e.g., remix_tests.sol generation)
    const handlerContext: ImportHandlerContext = {
      importPath: url,
      targetFile: this.targetFile,
      targetPath
    }
    const handlerResult = await this.handlerRegistry.tryHandle(handlerContext)
    if (handlerResult?.handled) {
      this.log(`[ImportResolver] ✅ Import handled by custom handler: ${url}`)
      if (handlerResult.resolvedPath && !this.resolutions.has(originalUrl)) {
        this.resolutions.set(originalUrl, handlerResult.resolvedPath)
      }
      return handlerResult.content!
    }

    // Delegate URL handling and normalization to the router
    const routed = await routeUrl(originalUrl, url, targetPath, {
      contentFetcher: this.contentFetcher,
      logger: this.logger,
      resolutions: this.resolutions,
      fetchGitHubPackageJson: this.fetchGitHubPackageJson.bind(this)
    })
    if (routed.action === 'content') return routed.content
    if (routed.action === 'rewrite') url = routed.url

    // Ensure workspace resolutions (including npm alias keys) are loaded before extracting package names
    try { await this.packageVersionResolver.loadWorkspaceResolutions() } catch {}

    const packageName = parsePkgName(url, this.packageVersionResolver.getWorkspaceResolutions())
    if (!skipResolverMappings && packageName) {
      const hasVersion = url.includes(`${packageName}@`)

      if (!hasVersion) {
        const res = await this.mapUnversionedImport(url, packageName, originalUrl, targetPath)
        if (typeof res === 'string') return res
      } else {
        const requestedVersion = parseVersion(url)
        const mappingKey = `__PKG__${packageName}`
        if (this.importMappings.has(mappingKey) && requestedVersion) {
          const versionedPackageName = this.importMappings.get(mappingKey)!
          const res = await this.handleExplicitVersionWithMapping(
            url,
            packageName,
            requestedVersion,
            versionedPackageName,
            originalUrl,
            targetPath
          )
          if (typeof res === 'string') return res
        } else if (requestedVersion) {
          const versionedPackageName = `${packageName}@${requestedVersion}`
          this.importMappings.set(mappingKey, versionedPackageName)
          await this.ensurePackageJsonSaved(versionedPackageName)
        }
      }
    }

    this.log(`[ImportResolver] 📥 Fetching: ${url} and save in ${targetPath}`)
    const content = await this.contentFetcher.resolveAndSave(url, targetPath, true)
    if (!skipResolverMappings || originalUrl === url) {
      if (!this.resolutions.has(originalUrl)) this.resolutions.set(originalUrl, url)
    }
    return content
  }

  /** Persist the original → resolved mappings for this target file into the resolution index. */
  public async saveResolutionsToIndex(): Promise<void> {
    this.log(`[ImportResolver] 💾 Saving ${this.resolutions.size} resolution(s) to index for: ${this.targetFile}`)
    if (!this.resolutionIndex) {
      this.resolutionIndex = this.pluginApi
        ? new ResolutionIndex(this.pluginApi, this.debug)
        : (new FileResolutionIndex(this.io, this.debug) as unknown as ResolutionIndex)
    }
    if (!this.resolutionIndexInitialized) { await this.resolutionIndex.load(); this.resolutionIndexInitialized = true }
    this.resolutionIndex.clearFileResolutions(this.targetFile)
    this.resolutions.forEach((resolvedPath, originalImport) => {
      // Store a concrete on-disk path in the index so IDE lookups can open files directly.
      const localPath = this.toLocalPath(resolvedPath)
      this.resolutionIndex!.recordResolution(this.targetFile, originalImport, localPath)
    })
    await this.resolutionIndex.save()
  }

  /** Return the target file this resolver is associated with. */
  public getTargetFile(): string { return this.targetFile }
  /** Lookup an original import and return its resolved path, if recorded in this session. */
  public getResolution(originalImport: string): string | null { return this.resolutions.get(originalImport) || null }

  /**
   * Translate a resolved import URL/path to a deterministic local workspace path under .deps.
   * - npm-like paths (e.g., "@scope/pkg@ver/path") → .deps/npm/<same>
   * - http(s) URLs → .deps/http/<host>/<pathname>
   * - already-scoped paths under .deps are returned as-is
   */
  private toLocalPath(resolved: string, targetPath?: string): string {
    if (!resolved) return resolved
    // If a specific targetPath was provided and is already rooted under .deps, respect it
    if (targetPath && isDepsPath(targetPath)) return targetPath
    // If it already points under .deps, return as-is
    if (isDepsPath(resolved)) return resolved
    // If a specific targetPath was provided but not rooted, root it now
    if (targetPath) return isDepsPath(targetPath) ? targetPath : `${DEPS_DIR}${targetPath}`
    // Derive from the resolved string
    if (isHttpUrl(resolved)) {
      try {
        const u = new URL(resolved)
        const cleanPath = u.pathname.startsWith('/') ? u.pathname.slice(1) : u.pathname
        return `${DEPS_HTTP_DIR}${u.hostname}/${cleanPath}`
      } catch {
        const safe = sanitizeUrlToPath(resolved)
        return `${DEPS_HTTP_DIR}${safe}`
      }
    }
    // Canonical alias families used by the router
    if (resolved.startsWith('github/')) return `${DEPS_DIR}${resolved}`
    if (resolved.startsWith('ipfs/')) return `${DEPS_DIR}${resolved}`
    if (resolved.startsWith('swarm/')) return `${DEPS_DIR}${resolved}`
    // Treat non-HTTP as npm-like canonical path
    return `${DEPS_NPM_DIR}${resolved}`
  }
}
