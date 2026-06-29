'use strict'

import { Plugin } from '@remixproject/engine'
import { Logger } from '../utils/logger'
import { BaseResolutionIndex, SourcesBundle } from './base-resolution-index'
import { DEPS_DIR, DEPS_NPM_DIR, isDepsPath } from '../constants/import-patterns'

/**
 * ResolutionIndex (Remix Plugin)
 *
 * Browser/Plugin implementation of the resolution index that persists mappings via
 * the Remix fileManager API under .deps/npm/.resolution-index.json.
 */
export class ResolutionIndex extends BaseResolutionIndex {
  private pluginApi: Plugin
  private debug: boolean

  constructor(pluginApi: Plugin, debug: boolean = false) {
    super(new Logger(pluginApi, debug))
    this.pluginApi = pluginApi
    this.debug = true
  }

  protected log(message: string, ...args: unknown[]): void {
    this.logger.logIf('resolutionIndex', `[ResolutionIndex] ${message}`, ...args)
  }

  /** Load index from the workspace once per session (idempotent). */
  async load(): Promise<void> {
    if (this.loadPromise) return this.loadPromise
    if (this.isLoaded) return Promise.resolve()
    this.loadPromise = (async () => {
      try {
        const exists = await this.pluginApi.call('fileManager', 'exists', this.indexPath)
        if (exists) {
          const content = await this.pluginApi.call('fileManager', 'readFile', this.indexPath)
          this.index = JSON.parse(content)
          this.log(`📖 Loaded index with ${Object.keys(this.index).length} source files`)
        } else {
          this.log(`📝 No existing index found, starting fresh`)
          this.index = {}
        }
        this.isLoaded = true
      } catch (err) {
        this.log(`⚠️  Failed to load index:`, err)
        this.index = {}
        this.isLoaded = true
      }
    })()
    return this.loadPromise
  }

  /** Drop cached state and reload from storage. */
  async reload(): Promise<void> {
    this.log(`🔄 Reloading index (workspace changed)`)
    this.index = {}
    this.isDirty = false
    this.isLoaded = false
    this.loadPromise = null
    await this.load()
  }

  /** Record a mapping for a source file if it changed since last write. */
  recordResolution(sourceFile: string, originalImport: string, resolvedPath: string): void {
    this.log(`➡️  Recording resolution: ${sourceFile} | ${originalImport} → ${resolvedPath}`)
    super.recordResolution(sourceFile, originalImport, resolvedPath)
  }

  /**
   * Resolve the actual filesystem path for a requested file within a compiled contract's context.
   * This uses the __sources__ bundle and .raw_paths.json to find the exact file that was used.
   *
   * @param originContract - The main contract that was compiled (entry point)
   * @param requestedPath - The path being requested (e.g., from debugger sources)
   * @returns The actual filesystem path where the file is located, or null if not found
   */
  async resolveActualPath(originContract: string, requestedPath: string): Promise<string | null> {
    try {
      // Normalize origin contract path (strip .deps/npm/ prefix if present)
      const normalizedOrigin = this.normalizeSourceFile(originContract)
      const sources: SourcesBundle | undefined = this.index[normalizedOrigin]?.['__sources__']

      if (!sources) {
        this.log(`No __sources__ found for: ${normalizedOrigin}`)
        return null
      }

      // Find matching source in __sources__
      const sourceEntry = sources[requestedPath]
      const resolvedPath = sourceEntry?.file ?? null

      if (!resolvedPath) {
        this.log(`No match in __sources__ for: ${requestedPath}`)
        return null
      }

      // If it's an external dependency, look up actual FS path in .raw_paths.json
      if (isDepsPath(resolvedPath)) {
        try {
          const rawPathsContent = await this.pluginApi.call('fileManager', 'readFile', `${DEPS_DIR}.raw_paths.json`)
          const rawPaths = JSON.parse(rawPathsContent)

          // Find matching entry in raw paths
          for (const [url, fsPath] of Object.entries(rawPaths)) {
            if (fsPath === resolvedPath) {
              this.log(`Resolved via .raw_paths.json: ${requestedPath} → ${fsPath}`)
              return fsPath as string
            }
          }
          // If not found in raw paths, return the resolved path as-is
          this.log(`Using resolved path (not in .raw_paths.json): ${resolvedPath}`)
        } catch (e) {
          // .raw_paths.json might not exist, use resolvedPath as-is
          this.log(`.raw_paths.json not available, using: ${resolvedPath}`)
        }
      }

      return resolvedPath
    } catch (e) {
      this.log(`resolveActualPath error:`, e)
      return null
    }
  }

  /** Record the complete source bundle for a compiled file. */
  recordSources(sourceFile: string, sources: SourcesBundle): void {
    const normalizedSource = this.normalizeSourceFile(sourceFile)
    this.log(`📦 Recording sources for: ${normalizedSource}`)
    if (!this.index[normalizedSource]) this.index[normalizedSource] = {}
    this.index[normalizedSource]['__sources__'] = sources
    this.isDirty = true
    this.log(`📝 Recorded ${Object.keys(sources).length} source files for: ${normalizedSource}`)
  }

  /** Persist index to workspace storage if it changed. */
  async save(): Promise<void> {
    try {
      const directory = DEPS_NPM_DIR.slice(0, -1) // Remove trailing slash
      try {
        const exists = await this.pluginApi.call('fileManager', 'exists', directory)
        if (!exists) {
          await this.pluginApi.call('fileManager', 'mkdir', directory)
          this.log(`📁 Created directory: ${directory}`)
        }
      } catch (dirErr) {
        this.log(`⚠️  Could not ensure directory exists:`, dirErr)
      }
      const content = JSON.stringify(this.index, null, 2)
      await this.pluginApi.call('fileManager', 'writeFile', this.indexPath, content)
      this.isDirty = false
      this.log(`💾 Saved index with ${Object.keys(this.index).length} source files to: ${this.indexPath}`)
    } catch (err) {
      this.log(`❌ Failed to save index:`, err)
    }
  }
}
