'use strict'

import type { Plugin } from '@remixproject/engine'
import { ImportResolver } from './import-resolver'
import type { IImportResolver } from './import-resolver-interface'
import { hasCacheControl, hasPackageContextLoading } from './import-resolver-interface'
import type { IOAdapter } from '../adapters/io-adapter'
import { hasLocalhostSupport, hasNormalizedNameSupport } from '../adapters/io-adapter'
import { RemixPluginAdapter } from '../adapters/remix-plugin-adapter'
import type { IResolutionIndex } from '../resolution-index/base-resolution-index'
import { hasRecordSources } from '../resolution-index/base-resolution-index'
import { ResolutionIndex } from '../resolution-index/resolution-index'
import { FileResolutionIndex } from '../resolution-index/file-resolution-index'
import { resolveRelativeImport, applyRemappings, extractImports, extractUrlContext, extractPackageContext } from '../utils/dependency-helpers'
import { Logger } from '../utils/logger'
import { WarningSystem } from '../utils/warning-system'
import { isPlugin } from '../types'
import {
  ImportPatterns,
  isHttpUrl,
  isNpmProtocol,
  isDepsPath,
  isRelativeImport,
  DEPS_DIR
} from '../constants/import-patterns'

/**
 * Solidity compiler input format
 */
export type CompilerInputDepedencyResolver = {
  [fileName: string]: {
    content: string
    file?: string // The resolved file path where content was retrieved from
  }
}

/**
 * Special npm imports that don't follow standard scoped package patterns.
 * Maps import path patterns to their source key formats.
 */
const SPECIAL_NPM_IMPORTS: Array<{
  pattern: RegExp
  isNpmImport: (path: string) => boolean
  getSourceKey: (path: string) => string
  getUnversionedKey: (path: string) => string
}> = [
  {
    // hardhat/console.sol → hardhat@X.Y.Z/console.sol (versioned) + hardhat/console.sol (unversioned)
    pattern: /^hardhat\//,
    isNpmImport: (path: string) => path.startsWith('hardhat/'),
    getSourceKey: (path: string) => path, // Store under unversioned key (hardhat/console.sol)
    getUnversionedKey: (path: string) => path // Already unversioned
  }
]

/**
 * Debug configuration options for DependencyResolver
 */
export interface DependencyResolverDebugConfig {
  enabled?: boolean // Master switch - if false, all logging disabled
  tree?: boolean // Dependency tree building logs
  fileProcessing?: boolean // Individual file processing logs
  imports?: boolean // Import extraction and resolution logs
  storage?: boolean // Source file storage logs (keys, aliases)
  localhost?: boolean // Localhost/remixd resolution logs
  packageContext?: boolean // Package context tracking logs
  resolutionIndex?: boolean // Resolution index operations logs
}

/**
 * Result of resolving a file's content
 */
interface FileResolutionResult {
  content: string
  actualPath: string // Where we actually read from (might be localhost/...)
  resolvedPath: string // The canonical versioned path
}

/**
 * Pre-compilation dependency tree builder (Node-focused)
 *
 * Walks the Solidity import graph BEFORE compilation, tracking which file requests which import.
 * Context-aware resolution enables correct handling of multiple package versions.
 */
export class DependencyResolver {
  private pluginApi: Plugin | null
  private io: IOAdapter
  private resolver: ImportResolver
  private sourceFiles: Map<string, string> = new Map()
  // Map aliases (resolved/versioned/actual FS paths) → original import spec keys
  private aliasToSpec: Map<string, string> = new Map()
  // Map import spec → actual resolved file path where content was retrieved from
  private specToResolvedPath: Map<string, string> = new Map()
  private processedFiles: Set<string> = new Set()
  private importGraph: Map<string, Set<string>> = new Map()
  private fileToPackageContext: Map<string, string> = new Map()
  private debugConfig: DependencyResolverDebugConfig
  private remappings: Array<{ from: string; to: string }> = []
  private resolutionIndex: IResolutionIndex | null = null
  private resolutionIndexInitialized: boolean = false
  private logger: Logger
  private warnings: WarningSystem

  /**
   * Create a DependencyResolver
   *
   * Inputs:
   * - pluginApi or io: Remix plugin API or IOAdapter implementation
   * - targetFile: path used for resolution index scoping
   * - debug: enable verbose logs (boolean for backwards compat, or object for granular control)
   */
  constructor(pluginApi: Plugin, targetFile: string, debug?: boolean | DependencyResolverDebugConfig)
  constructor(io: IOAdapter, targetFile: string, debug?: boolean | DependencyResolverDebugConfig)
  constructor(pluginOrIo: Plugin | IOAdapter, targetFile: string, debug: boolean | DependencyResolverDebugConfig = false) {
    const pluginDetected = isPlugin(pluginOrIo)
    this.pluginApi = pluginDetected ? (pluginOrIo as Plugin) : null
    this.io = pluginDetected ? new RemixPluginAdapter(this.pluginApi!) : (pluginOrIo as IOAdapter)

    // Handle both boolean (backwards compat) and object debug config
    if (typeof debug === 'boolean') {
      this.debugConfig = {
        enabled: debug,
        tree: debug,
        fileProcessing: debug,
        imports: debug,
        storage: debug,
        localhost: debug,
        packageContext: debug,
        resolutionIndex: debug
      }
    } else {
      this.debugConfig = {
        enabled: debug.enabled ?? false,
        tree: debug.tree ?? debug.enabled ?? false,
        fileProcessing: debug.fileProcessing ?? debug.enabled ?? false,
        imports: debug.imports ?? debug.enabled ?? false,
        storage: debug.storage ?? debug.enabled ?? false,
        localhost: debug.localhost ?? debug.enabled ?? false,
        packageContext: debug.packageContext ?? debug.enabled ?? false,
        resolutionIndex: debug.resolutionIndex ?? debug.enabled ?? false
      }
    }

    const legacyDebug = this.debugConfig.enabled || false
    this.logger = new Logger(this.pluginApi || undefined, legacyDebug)
    this.warnings = new WarningSystem(this.logger, { verbose: !!legacyDebug })
    if (pluginDetected) {
      this.resolver = new ImportResolver(this.pluginApi!, targetFile, legacyDebug)
    } else {
      this.resolver = new ImportResolver(this.io, targetFile, legacyDebug)
    }
  }

  /**
   * Set import remappings, e.g. [ { from: 'oz/', to: '@openzeppelin/contracts@5.4.0/' } ]
   */
  public setRemappings(remaps: Array<{ from: string; to: string }>) {
    this.remappings = remaps || []
  }

  /** Enable or disable caching for this resolver session. */
  public setCacheEnabled(enabled: boolean): void {
    if (hasCacheControl(this.resolver)) {
      this.resolver.setCacheEnabled(enabled)
    }
  }

  private log(message: string, ...args: any[]): void {
    if (!this.debugConfig.enabled) return
    console.log(message, ...args)
  }

  private logIf(category: keyof DependencyResolverDebugConfig, message: string, ...args: any[]): void {
    if (!this.debugConfig.enabled) return
    if (this.debugConfig[category]) console.log(message, ...args)
  }

  /**
   * Build the dependency tree starting from an entry file and return a bundle of sources
   * Output: Map<originalImportPath, content>
   */
  public async buildDependencyTree(entryFile: string): Promise<Map<string, string>> {
    this.logIf('tree', `[DependencyResolver] 🌳 Building dependency tree from: ${entryFile}`)
    this.sourceFiles.clear()
    this.aliasToSpec.clear()
    this.specToResolvedPath.clear()
    this.processedFiles.clear()
    this.importGraph.clear()
    this.fileToPackageContext.clear()
    // Ensure resolution index is loaded so we can record per-file mappings
    if (!this.resolutionIndex) {
      this.resolutionIndex = this.pluginApi
        ? new ResolutionIndex(this.pluginApi, this.debugConfig.enabled || false)
        : (new FileResolutionIndex(this.io, this.debugConfig.enabled || false) as unknown as ResolutionIndex)
    }
    if (!this.resolutionIndexInitialized) {
      await this.resolutionIndex.load()
      this.resolutionIndexInitialized = true
    }
    try {
      await this.processFile(entryFile, null)
      this.logIf('tree', `[DependencyResolver] ✅ Built source bundle with ${this.sourceFiles.size} files`)
      return this.sourceFiles
    } catch (err) {
      this.logIf('tree', `[DependencyResolver] ❌ Failed to build dependency tree from ${entryFile}:`, err)
      throw err
    }
  }

  private isLocalFile(path: string): boolean {
    // External schemes are never local
    if (isHttpUrl(path) || isNpmProtocol(path)) return false
    // Treat on-disk cached deps as local (they are already materialized in workspace)
    if (isDepsPath(path)) return path.endsWith('.sol')
    // Check special npm imports (e.g., hardhat/console.sol)
    if (SPECIAL_NPM_IMPORTS.some(spec => spec.isNpmImport(path))) return false
    // Everything else that is a .sol path in the workspace (including relative paths) is local
    return path.endsWith('.sol') && !path.includes('@') // && !path.includes('node_modules')
  }

  /**
   * Try to find a file in localhost (remixd) paths when it's not in the workspace.
   * Checks in order: installed_contracts/, node_modules/, .deps/remix-tests/
   */
  private async tryLocalhostPaths(importPath: string): Promise<{ path: string; content: string } | null> {
    // Check if localhost is connected using the IOAdapter interface
    let isConnected = false
    try {
      if (hasLocalhostSupport(this.io)) {
        isConnected = await this.io.isLocalhostConnected()
      }
    } catch (err) {
      this.logIf('localhost', `[DependencyResolver]   ⚠️  Error checking localhost connection:`, err)
      isConnected = false
    }

    if (!isConnected) {
      this.logIf('localhost', `[DependencyResolver]   ℹ️  Localhost not connected, skipping remixd paths`)
      return null
    }

    this.logIf('localhost', `[DependencyResolver]   🔌 Localhost connected, trying remixd paths...`)

    // Build candidate paths in order of importance
    const candidatePaths = [
      `localhost/installed_contracts/${importPath}`,
      `localhost/node_modules/${importPath}`,
      `localhost/${DEPS_DIR}remix-tests/${importPath}`
    ]

    // Try each path in order
    for (const candidatePath of candidatePaths) {
      try {
        this.logIf('localhost', `[DependencyResolver]   🔍 Trying: ${candidatePath}`)
        const content = await this.io.readFile(candidatePath)
        if (content) {
          this.logIf('localhost', `[DependencyResolver]   ✅ Found at: ${candidatePath}`)
          // Record normalized name for IDE features
          try {
            if (hasNormalizedNameSupport(this.io)) {
              await this.io.addNormalizedName(candidatePath, importPath)
            }
          } catch { }
          return { path: candidatePath, content }
        }
      } catch {
        // File not found at this path, try next
        continue
      }
    }

    this.logIf('localhost', `[DependencyResolver]   ❌ Not found in any localhost paths`)
    return null
  }

  // moved to utils/dependency-helpers

  /**
   * Main file processing orchestrator - delegates to focused helper methods
   */
  private async processFile(importPath: string, requestingFile: string | null, packageContext?: string): Promise<void> {
    // 1. Validate and check if already processed
    if (!this.validateImportPath(importPath)) return
    if (this.processedFiles.has(importPath)) {
      this.logIf('fileProcessing', `[DependencyResolver]   ⏭️  Already processed: ${importPath}`)
      return
    }

    this.logIf('fileProcessing', `[DependencyResolver] 📄 Processing: ${importPath}`)
    this.logIf('fileProcessing', `[DependencyResolver]   📍 Requested by: ${requestingFile || 'entry point'}`)

    // 2. Setup package context if provided
    await this.setupPackageContext(importPath, packageContext)
    this.processedFiles.add(importPath)

    try {
      // 3. Resolve file content (local, localhost, handler, or external)
      const resolution = await this.resolveFileContent(importPath)
      if (!resolution) return

      // 4. Store the resolved file under appropriate keys/aliases
      this.storeResolvedFile(importPath, resolution)

      // 5. Update package context based on resolved path
      await this.updateFilePackageContext(importPath, resolution.resolvedPath)

      // 6. Process child imports recursively
      await this.processChildImports(importPath, resolution)

    } catch (err) {
      this.logIf('fileProcessing', `[DependencyResolver] ❌ Error processing ${importPath}:`, err)
      try { await this.warnings.emitProcessingError(importPath, err) } catch { }
      console.error(err)
      throw err
    }
  }

  /**
   * Validate that the import path is a valid Solidity file
   */
  private validateImportPath(importPath: string): boolean {
    if (!importPath.endsWith('.sol')) {
      this.logIf('fileProcessing', `[DependencyResolver] ❌ Invalid import: "${importPath}" does not end with .sol extension`)
      this.warnings.emitInvalidSolidityImport(importPath).catch(() => {})
      throw new Error(`Invalid import: "${importPath}" does not end with .sol extension`)
    }
    return true
  }

  /**
   * Setup package context for the import resolver
   */
  private async setupPackageContext(importPath: string, packageContext?: string): Promise<void> {
    if (!packageContext) return

    this.logIf('packageContext', `[DependencyResolver]   📦 Package context: ${packageContext}`)
    this.fileToPackageContext.set(importPath, packageContext)
    this.resolver.setPackageContext(packageContext)

    // Ensure the parent's package.json is loaded so its declared deps influence child resolution
    if (hasPackageContextLoading(this.resolver)) {
      await this.resolver.ensurePackageContextLoaded(packageContext)
    }
  }

  /**
   * Resolve file content using the appropriate strategy:
   * 1. Local file (direct read)
   * 2. Localhost/remixd paths
   * 3. Handler system (e.g., remix_tests.sol)
   * 4. External import (npm, GitHub, etc.)
   */
  private async resolveFileContent(importPath: string): Promise<{ content: string; actualPath: string; resolvedPath: string } | null> {
    const isLocal = this.isLocalFile(importPath)
    this.logIf('fileProcessing', `[DependencyResolver]   🔍 isLocalFile("${importPath}") = ${isLocal}`)

    let content: string
    let actualPath = importPath

    if (isLocal) {
      let localResult = null
      try {
        localResult = await this.resolveLocalFile(importPath)
      } catch (err) {
        this.logIf('fileProcessing', `[DependencyResolver]   ⚠️  Local resolution failed for ${importPath}:`, err)
      }

      if (localResult) {
        content = localResult.content
        actualPath = localResult.actualPath
      } else {
        this.logIf('fileProcessing', `[DependencyResolver]   🌐 Probable external import detected, delegating to ImportResolver`)
        content = await this.resolver.resolveAndSave(importPath, undefined, false)
      }
    } else {
      this.logIf('fileProcessing', `[DependencyResolver]   🌐 External import detected, delegating to ImportResolver`)
      content = await this.resolver.resolveAndSave(importPath, undefined, false)
    }

    // Validate content was resolved
    if (!content) {
      if (content === '') return null // Empty file is valid
      this.logIf('fileProcessing', `[DependencyResolver] ⚠️  Failed to resolve: ${importPath}`)
      try { await this.warnings.emitFailedToResolve(importPath) } catch { }
      throw new Error(`File not found: ${importPath}`)
    }

    const resolvedPath = isLocal ? importPath : this.getResolvedPath(importPath)
    return { content, actualPath, resolvedPath }
  }

  /**
   * Resolve a local file with fallback chain:
   * 1. Direct workspace read
   * 2. Localhost/remixd paths (node_modules, installed_contracts)
   * 3. Handler system (remix_tests.sol, etc.)
   */
  private async resolveLocalFile(importPath: string): Promise<{ content: string; actualPath: string } | null> {
    this.logIf('fileProcessing', `[DependencyResolver]   📁 Local file detected, reading directly`, importPath)

    // Try direct read first
    try {
      const content = await this.io.readFile(importPath)
      return { content, actualPath: importPath }
    } catch {
      // Continue to fallbacks
    }

    // Try localhost/remixd paths
    this.logIf('fileProcessing', `[DependencyResolver]   🔄 Local file not found, checking localhost paths...`)
    const localhostResult = await this.tryLocalhostPaths(importPath)
    if (localhostResult) {
      this.logIf('fileProcessing', `[DependencyResolver]   ✅ Found at: ${localhostResult.path}`)
      return { content: localhostResult.content, actualPath: localhostResult.path }
    }

    // Try handler system (e.g., remix_tests.sol)
    this.logIf('fileProcessing', `[DependencyResolver]   🔄 Not in localhost, trying handler system...`)
    const handlerResult = await this.tryHandlerSystem(importPath)
    if (handlerResult) {
      return { content: handlerResult, actualPath: importPath }
    }

    // All fallbacks failed
    this.logIf('fileProcessing', `[DependencyResolver]   ⚠️  Local resolution failed for ${importPath}`)
    try { await this.warnings.emitFailedToResolve(importPath) } catch { }
    throw new Error(`File not found: ${importPath}`)
  }

  /**
   * Try to resolve using the handler system (e.g., remix_tests.sol)
   */
  private async tryHandlerSystem(importPath: string): Promise<string | null> {
    try {
      const handler = this.resolver.getHandlerRegistry?.()
      if (!handler?.tryHandle) {
        return null
      }

      const ctx = {
        importPath,
        targetFile: this.resolver.getTargetFile(),
        targetPath: undefined
      }
      const res = await handler.tryHandle(ctx)

      if (res?.handled && typeof res.content === 'string') {
        return res.content
      }
    } catch {
      // Handler failed
    }
    return null
  }

  /**
   * Store the resolved file under appropriate keys and aliases
   */
  private storeResolvedFile(
    importPath: string,
    resolution: { content: string; actualPath: string; resolvedPath: string }
  ): void {
    const { content, actualPath, resolvedPath } = resolution

    this.logIf('storage', `[DependencyResolver]   📥 Resolved path: ${resolvedPath}`)
    this.logIf('storage', `[DependencyResolver]   📝 Actual path: ${actualPath}`)
    this.logIf('storage', `[DependencyResolver]   📄 Import spec key: ${importPath}`)

    // Always store under the ORIGINAL IMPORT SPEC (compiler will request this)
    this.sourceFiles.set(importPath, content)
    this.specToResolvedPath.set(importPath, resolvedPath)
    this.logIf('storage', `[DependencyResolver]   ✅ Stored under spec key: ${importPath}`)

    // Also store under the versioned resolvedPath for navigation and debugging
    if (resolvedPath !== importPath) {
      this.specToResolvedPath.set(resolvedPath, resolvedPath)
      this.logIf('storage', `[DependencyResolver]   ✅ Also stored under versioned path: ${resolvedPath}`)
    }

    // Maintain alias mappings for navigation/internal lookups
    this.registerAliases(importPath, actualPath, resolvedPath)
  }

  /**
   * Register alias mappings for navigation and internal lookups
   */
  private registerAliases(importPath: string, actualPath: string, resolvedPath: string): void {
    // Map resolvedPath → original import spec
    if (resolvedPath !== importPath) {
      this.aliasToSpec.set(resolvedPath, importPath)
    }

    // Map actualPath (e.g., localhost/...) → original import spec
    if (actualPath !== importPath && actualPath !== resolvedPath) {
      this.aliasToSpec.set(actualPath, importPath)
    }

    // Special-case npm imports like hardhat/console.sol
    const specialImport = SPECIAL_NPM_IMPORTS.find(spec => spec.isNpmImport(importPath))
    if (specialImport && resolvedPath !== importPath) {
      this.aliasToSpec.set(resolvedPath, importPath)
      this.logIf('storage', `[DependencyResolver]   🔄 Special alias: ${resolvedPath} → ${importPath}`)
    }

    // For scoped packages with versions, create unversioned alias
    if (!this.isLocalFile(resolvedPath) && resolvedPath.includes('@') && resolvedPath.match(/@[^@]+@\d+\.\d+\.\d+\//)) {
      const unversionedPath = resolvedPath.replace(/(@[^@]+)@\d+\.\d+\.\d+\//, '$1/')
      if (unversionedPath !== importPath) {
        this.aliasToSpec.set(unversionedPath, importPath)
        this.logIf('storage', `[DependencyResolver]   🔄 Alias (unversioned): ${unversionedPath} → ${importPath}`)
      }
    }
  }

  /**
   * Update file package context based on the resolved path
   */
  private async updateFilePackageContext(importPath: string, resolvedPath: string): Promise<void> {
    const logFn = (msg: string, ...args: unknown[]) => this.logIf('packageContext', msg, ...args)
    const filePackageContext = extractPackageContext(importPath) ||
      (!this.isLocalFile(importPath) ? extractUrlContext(importPath, logFn) : null)

    if (filePackageContext) {
      this.fileToPackageContext.set(resolvedPath, filePackageContext)
      this.resolver.setPackageContext(filePackageContext)
      if (hasPackageContextLoading(this.resolver)) {
        await this.resolver.ensurePackageContextLoaded(filePackageContext)
      }
      this.logIf('packageContext', `[DependencyResolver]   📦 File belongs to: ${filePackageContext}`)
    }
  }

  /**
   * Process child imports from the resolved file
   */
  private async processChildImports(
    importPath: string,
    resolution: { content: string; actualPath: string; resolvedPath: string }
  ): Promise<void> {
    const { content, resolvedPath } = resolution

    // Clear any prior index entries for fresh mappings
    if (this.resolutionIndex) {
      try { this.resolutionIndex.clearFileResolutions(resolvedPath) } catch { }
    }

    // Extract imports from content
    const logFn = (msg: string, ...args: any[]) => this.logIf('imports', msg, ...args)
    const imports = extractImports(content, logFn)

    if (imports.length === 0) return

    this.logIf('imports', `[DependencyResolver]   🔗 Found ${imports.length} imports`)
    const resolvedImports = new Set<string>()

    // Determine current file's package context for child resolution
    const pkgLogFn = (msg: string, ...args: any[]) => this.logIf('packageContext', msg, ...args)
    const currentFilePackageContext = extractPackageContext(importPath) ||
      (!this.isLocalFile(importPath) ? extractUrlContext(importPath, pkgLogFn) : null)

    for (const importedPath of imports) {
      const childResult = await this.processChildImport(
        importPath,
        resolvedPath,
        importedPath,
        currentFilePackageContext
      )
      if (childResult) {
        resolvedImports.add(childResult.childPath)
      }
    }

    this.importGraph.set(importPath, resolvedImports)
  }

  /**
   * Process a single child import
   */
  private async processChildImport(
    parentImportPath: string,
    parentResolvedPath: string,
    importedPath: string,
    packageContext: string | null
  ): Promise<{ childPath: string; wasRemapped: boolean } | null> {
    this.logIf('imports', `[DependencyResolver]   ➡️  Processing import: "${importedPath}"`)

    let nextPath = importedPath

    // Resolve relative paths
    if (isRelativeImport(importedPath)) {
      const relLogFn = (msg: string, ...args: any[]) => this.logIf('imports', msg, ...args)
      nextPath = resolveRelativeImport(parentImportPath, importedPath, relLogFn)
      this.logIf('imports', `[DependencyResolver]   🔗 Resolved relative: "${importedPath}" → "${nextPath}"`)
    }

    // Apply remappings
    const remapLogFn = (msg: string, ...args: any[]) => this.logIf('imports', msg, ...args)
    const beforeRemap = nextPath
    nextPath = applyRemappings(nextPath, this.remappings, remapLogFn)
    const wasRemapped = beforeRemap !== nextPath

    // Recursively process the child
    await this.processFile(nextPath, parentResolvedPath, packageContext || undefined)

    // Record in resolution index
    this.recordChildResolution(parentImportPath, parentResolvedPath, importedPath, nextPath, wasRemapped)

    return { childPath: nextPath, wasRemapped }
  }

  /**
   * Record child import resolution in the resolution index
   */
  private recordChildResolution(
    parentImportPath: string,
    parentResolvedPath: string,
    importedPath: string,
    nextPath: string,
    wasRemapped: boolean
  ): void {
    if (!this.resolutionIndex) return

    try {
      const childResolved = this.isLocalFile(nextPath) ? nextPath : this.getResolvedPath(nextPath)

      // Record under the original unversioned import path
      this.resolutionIndex.recordResolution(parentImportPath, importedPath, childResolved)
      this.logIf('resolutionIndex', `[DependencyResolver]   📝 Recorded: ${parentImportPath} | ${importedPath} → ${childResolved}`)

      // Also record under the versioned resolved path for external files
      if (parentResolvedPath !== parentImportPath) {
        this.resolutionIndex.recordResolution(parentResolvedPath, importedPath, childResolved)
        this.logIf('resolutionIndex', `[DependencyResolver]   📝 Recorded (versioned): ${parentResolvedPath} | ${importedPath} → ${childResolved}`)
      }

      // If remapped, record the remapped path as well
      if (wasRemapped) {
        this.resolutionIndex.recordResolution(parentImportPath, nextPath, childResolved)
        this.logIf('resolutionIndex', `[DependencyResolver]   📝 Recorded remapped: ${parentImportPath} | ${nextPath} → ${childResolved}`)

        if (parentResolvedPath !== parentImportPath) {
          this.resolutionIndex.recordResolution(parentResolvedPath, nextPath, childResolved)
          this.logIf('resolutionIndex', `[DependencyResolver]   📝 Recorded remapped (versioned): ${parentResolvedPath} | ${nextPath} → ${childResolved}`)
        }
      }
    } catch { }
  }

  private getResolvedPath(importPath: string): string {
    const resolved = this.resolver.getResolution(importPath)
    return resolved || importPath
  }

  /** Return the collected source bundle after buildDependencyTree. */
  public getSourceBundle(): Map<string, string> {
    return this.sourceFiles
  }

  /** Return the import graph (file -> set of direct imports). */
  public getImportGraph(): Map<string, Set<string>> {
    return this.importGraph
  }

  /** Retrieve the package context associated with a resolved file. */
  public getPackageContext(filePath: string): string | null {
    return this.fileToPackageContext.get(filePath) || null
  }

  /** Convert the bundle to Solidity compiler input shape. */
  public toCompilerInput(): CompilerInputDepedencyResolver {
    const sources: CompilerInputDepedencyResolver = {}
    for (const [path, content] of this.sourceFiles.entries()) {
      sources[path] = { content }
    }
    return sources
  }

  /** Convert the bundle to Solidity compiler input shape. */
  public toResolutionFileInput(): CompilerInputDepedencyResolver {
    const sources: CompilerInputDepedencyResolver = {}
    for (const [path, content] of this.sourceFiles.entries()) {
      const resolvedPath = this.specToResolvedPath.get(path)
      sources[path] = { content, file: resolvedPath }
    }
    return sources
  }

  /** Persist the resolution index for this session. */
  public async saveResolutionIndex(): Promise<void> {
    this.logIf('resolutionIndex', `[DependencyResolver] 💾 Saving resolution index...`)
    if (this.resolutionIndex) {
      try { await this.resolutionIndex.save() } catch { }
    }
  }

  /** Save the complete source bundle to the resolution index for a given entry file. */
  public async saveSourcesBundle(entryFile: string): Promise<void> {
    this.logIf('resolutionIndex', `[DependencyResolver] 📦 Saving sources bundle for: ${entryFile}`)
    if (this.resolutionIndex) {
      try {
        const sources = this.toResolutionFileInput()
        if (hasRecordSources(this.resolutionIndex)) {
          this.resolutionIndex.recordSources(entryFile, sources)
        }
      } catch (err) {
        this.logIf('resolutionIndex', `[DependencyResolver] ⚠️  Failed to save sources bundle:`, err)
      }
    }
  }
}
