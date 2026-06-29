'use strict'
import { Plugin } from '@remixproject/engine'

const profile = {
  name: 'resolutionIndex',
  displayName: 'resolution index',
  version: '0.0.1',
  methods: ['resolveImportFromIndex', 'resolvePath', 'refresh', 'resolveActualPath']
}

type Index = Record<string, Record<string, string>>

export class ResolutionIndexPlugin extends Plugin {
  private index: Index = {}
  private readonly indexPath = '.deps/npm/.resolution-index.json'
  private debug: boolean = false

  constructor() {
    super(profile)
  }

  private log(...args: any[]): void {
    if (this.debug) {
      console.log(...args)
    }
  }

  onActivation() {
    // Prime the in-memory index and keep it in sync
    this.loadIndex().catch(() => {})
    this.on('filePanel', 'setWorkspace', () => this.loadIndex())
    this.on('fileManager', 'fileAdded', (file: string) => { if (file === this.indexPath) this.loadIndex() })
    this.on('fileManager', 'fileChanged', (file: string) => { if (file === this.indexPath) this.loadIndex() })
    this.on('fileManager', 'fileRemoved', (file: string) => { if (file === this.indexPath) this.index = {} })
  }

  /**
   * Reload the resolution index from disk.
   * Call this when you know the .resolution-index.json file has been updated externally.
   */
  async refresh() {
    await this.loadIndex()
  }

  private async loadIndex() {
    try {
      const exists = await this.call('fileManager', 'exists', this.indexPath)
      if (!exists) {
        this.index = {}
        return
      }
      const content = await this.call('fileManager', 'readFile', this.indexPath)
      const parsed = JSON.parse(content)
      if (parsed && typeof parsed === 'object') {
        this.index = parsed as Index
      } else {
        this.index = {}
      }
    } catch (e) {
      this.index = {}
    }
  }

  /**
   * Resolve an import path using the in-memory resolution index.
   *
   * PURPOSE: Navigate dependencies during development/editing.
   * This method looks up where an import statement should resolve to based on the
   * resolution index created during compilation. It handles various import formats
   * (npm packages, GitHub URLs, local paths) and normalizes them.
   *
   * USE CASE: When a user clicks on an import statement to "Go to Definition"
   * or when the IDE needs to resolve where `import "@openzeppelin/..."` points to.
   *
   * DOES NOT: Consider which specific version was used in a particular compilation.
   * It finds *a* valid resolution, but not necessarily the one from a specific build.
   *
   * @param sourceFile - The file containing the import statement
   * @param importPath - The import path to resolve (e.g., "@openzeppelin/contracts/token/ERC20/ERC20.sol")
   * @returns The resolved local filesystem path, or null if not found
   *
   * @example
   * // Resolving an OpenZeppelin import from MyToken.sol
   * await resolveImportFromIndex(
   *   'contracts/MyToken.sol',
   *   '@openzeppelin/contracts/token/ERC20/ERC20.sol'
   * )
   * // Returns: '.deps/npm/@openzeppelin/contracts@5.0.2/token/ERC20/ERC20.sol'
   */
  async resolveImportFromIndex(sourceFile: string, importPath: string): Promise<string | null> {
    this.log('[ResolutionIndexPlugin] resolveImportFromIndex', { sourceFile, importPath })
    const candidates = this.buildCandidates(importPath)
    this.log('[ResolutionIndexPlugin] candidates:', candidates)
    const isLocalPath = (val?: string) => true// !!val && !/^https?:\/\//.test(val) && !val.startsWith('github/')
    this.log('[ResolutionIndexPlugin] isLocalPath check:', candidates.map(c => ({ candidate: c, isLocal: isLocalPath(this.index[sourceFile]?.[c]) })))
    this.log('[ResolutionIndexPlugin] full index snapshot for sourceFile:', this.index[sourceFile])
    this.log('[ResolutionIndexPlugin] full index snapshot:', this.index)
    // 1) Direct lookup by candidates for the given sourceFile
    for (const cand of candidates) {
      const val = this.index[sourceFile]?.[cand]
      if (isLocalPath(val)) return val as string
    }
    // 2) Fallback: search across all base files for any candidate
    for (const file in this.index) {
      for (const cand of candidates) {
        const val = this.index[file]?.[cand]
        if (isLocalPath(val)) return val as string
      }
    }
    // 3) Last chance: fuzzy match by resolved path suffix (handles alias like github/<o>/<r>@<ref>/rest)
    const suffixes = candidates.map((c) => this.toSuffix(c)).filter(Boolean) as string[]
    const hit = this.findByResolvedSuffix(suffixes)
    if (isLocalPath(hit || undefined)) return hit
    return null
  }

  /**
   * Resolve a path (import or external path) to an internal file path for navigation.
   *
   * PURPOSE: High-level navigation helper that wraps resolveImportFromIndex.
   * This is a convenience method that always returns a path (falling back to the input
   * path if no resolution is found).
   *
   * USE CASE: When you need to normalize a path for file opening but don't want to
   * handle null returns. The editor can then check if the returned path exists.
   *
   * DIFFERENCE FROM resolveImportFromIndex: Always returns a string (never null).
   * If resolution fails, returns the original inputPath as-is.
   *
   * @param sourceFile - The file containing the reference
   * @param inputPath - The path to resolve
   * @returns The resolved path, or inputPath if resolution fails
   */
  async resolvePath(sourceFile: string, inputPath: string): Promise<string> {
    // Try exact mapping from the index (using normalization and fallback logic)
    const mapped = await this.resolveImportFromIndex(sourceFile, inputPath)
    if (mapped) return mapped

    // Return the original path as a last resort (renderer will guard with exists)
    return inputPath
  }

  /**
   * Resolve the actual filesystem path for a file within a SPECIFIC compilation's context.
   *
   * PURPOSE: Find the EXACT version/location of a file that was used when a specific
   * contract was compiled. This is critical for debugging because you need to see the
   * exact source code that produced the bytecode being debugged.
   *
   * USE CASE: When debugging a contract and stepping through dependencies, you need
   * to see the exact version of ERC20.sol that was compiled into this contract.
   * If you have both @openzeppelin/contracts@4.8.0 and @5.0.2 installed, this method
   * ensures you see the right one.
   *
   * HOW IT WORKS:
   * 1. Looks up the __sources__ bundle saved when originContract was compiled
   * 2. Finds the requestedPath in that bundle to get the resolved path
   * 3. Uses .raw_paths.json to map URL imports to their actual filesystem location
   * 4. Returns the exact file that was included in the compilation
   *
   * DIFFERENCE FROM resolveImportFromIndex:
   * - resolveImportFromIndex: Finds *any* valid resolution (version-agnostic)
   * - resolveActualPath: Finds the *specific* file used in a particular compilation
   *
   * DIFFERENCE FROM resolvePath:
   * - resolvePath: General navigation, no compilation context
   * - resolveActualPath: Context-aware, uses compilation metadata (__sources__)
   *
   * @param originContract - The main contract that was compiled (entry point)
   *                         This identifies WHICH compilation context to use
   * @param requestedPath - The path being requested (e.g., from debugger sources)
   *                        This is the key to look up in the __sources__ bundle
   * @returns The actual filesystem path where the file is located, or null if not found
   *
   * @example
   * // During debugging of MyToken.sol, find the actual ERC20.sol that was compiled
   * await resolveActualPath(
   *   'contracts/MyToken.sol',
   *   '@openzeppelin/contracts/token/ERC20/ERC20.sol'
   * )
   * // Returns: '.deps/npm/@openzeppelin/contracts@5.0.2/token/ERC20/ERC20.sol'
   * // (the exact version MyToken.sol was compiled with)
   */
  async resolveActualPath(originContract: string, requestedPath: string): Promise<string | null> {
    this.log('[ResolutionIndexPlugin] 🔍 resolveActualPath CALLED')
    this.log('[ResolutionIndexPlugin]   ➡️  originContract:', originContract)
    this.log('[ResolutionIndexPlugin]   ➡️  requestedPath:', requestedPath)

    try {
      // Normalize origin contract path (strip .deps/npm/ prefix if present)
      const normalizedOrigin = this.normalizeSourceFile(originContract)
      this.log('[ResolutionIndexPlugin]   📝 Normalized origin:', normalizedOrigin)

      // Check if index has this origin
      this.log('[ResolutionIndexPlugin]   📊 Index keys:', Object.keys(this.index))
      this.log('[ResolutionIndexPlugin]   🔎 Has normalized origin?', normalizedOrigin in this.index)

      if (!this.index[normalizedOrigin]) {
        this.log('[ResolutionIndexPlugin]   ❌ Origin not found in index')
        return null
      }

      this.log('[ResolutionIndexPlugin]   📋 Origin entry keys:', Object.keys(this.index[normalizedOrigin]))
      this.log('[ResolutionIndexPlugin]   🔎 Has __sources__?', '__sources__' in this.index[normalizedOrigin])

      if (!this.index[normalizedOrigin]['__sources__']) {
        this.log('[ResolutionIndexPlugin]   ❌ No __sources__ found for:', normalizedOrigin)
        return null
      }

      const sources = this.index[normalizedOrigin]['__sources__'] as any
      this.log('[ResolutionIndexPlugin]   📦 __sources__ keys:', Object.keys(sources))
      this.log('[ResolutionIndexPlugin]   🔎 Looking for requestedPath in sources:', requestedPath)

      // Find matching source in __sources__
      let resolvedPath: string | null = null
      if (sources[requestedPath]) {
        this.log('[ResolutionIndexPlugin]   ✅ Found requestedPath in sources')
        this.log('[ResolutionIndexPlugin]   📄 Source entry:', JSON.stringify(sources[requestedPath], null, 2))
        if (sources[requestedPath].file) {
          resolvedPath = sources[requestedPath].file
          this.log('[ResolutionIndexPlugin]   📍 Extracted resolved path:', resolvedPath)
        } else {
          this.log('[ResolutionIndexPlugin]   ⚠️  Source entry has no .file property')
        }
      } else {
        this.log('[ResolutionIndexPlugin]   ⚠️  requestedPath NOT found in sources')
      }

      if (!resolvedPath) {
        this.log('[ResolutionIndexPlugin]   ❌ No match in __sources__ for:', requestedPath)
        return null
      }

      this.log('[ResolutionIndexPlugin]   📂 Resolved path from __sources__:', resolvedPath)

      // Check if it's a local workspace file (no @ version, not a URL)
      const isLocalFile = !resolvedPath.includes('@') && !resolvedPath.startsWith('http')
      this.log('[ResolutionIndexPlugin]   📁 Is local file?', isLocalFile)

      if (isLocalFile) {
        this.log('[ResolutionIndexPlugin]   ✅ Local file, returning as-is:', resolvedPath)
        return resolvedPath
      }

      // For external dependencies, look up in .raw_paths.json to find actual FS location
      this.log('[ResolutionIndexPlugin]   🌐 External dependency, looking up in .raw_paths.json')
      try {
        const rawPathsContent = await this.call('fileManager', 'readFile', '.deps/.raw_paths.json')
        this.log('[ResolutionIndexPlugin]   ✅ Successfully read .raw_paths.json')
        const rawPaths = JSON.parse(rawPathsContent)
        this.log('[ResolutionIndexPlugin]   📋 .raw_paths.json has', Object.keys(rawPaths).length, 'entries')

        // Look through all entries to find where this file was saved
        for (const [url, fsPath] of Object.entries(rawPaths)) {
          this.log('[ResolutionIndexPlugin]   🔎 Checking:', { url, fsPath, resolvedPath })
          // The fsPath should contain our resolved path
          if (typeof fsPath === 'string' && fsPath.includes(resolvedPath)) {
            this.log('[ResolutionIndexPlugin]   ✅ MATCH FOUND!')
            this.log('[ResolutionIndexPlugin]   🔗 Original URL:', url)
            this.log('[ResolutionIndexPlugin]   📁 Actual FS Path:', fsPath)
            return fsPath
          }
        }

        this.log('[ResolutionIndexPlugin]   ⚠️  No match found in .raw_paths.json')
        this.log('[ResolutionIndexPlugin]   ✅ RETURNING resolved path as-is:', resolvedPath)
        return resolvedPath
      } catch (e) {
        this.log('[ResolutionIndexPlugin]   ⚠️  .raw_paths.json error:', e)
        this.log('[ResolutionIndexPlugin]   ✅ RETURNING resolved path as-is:', resolvedPath)
        return resolvedPath
      }
    } catch (e) {
      this.log('[ResolutionIndexPlugin]   ❌ ERROR in resolveActualPath:', e)
      return null
    }
  }

  private normalizeSourceFile(path: string): string {
    if (!path) return path
    // Strip .deps/npm/, .deps/github/, .deps/http/ prefixes to get canonical package path
    if (path.startsWith('.deps/npm/')) return path.substring('.deps/npm/'.length)
    if (path.startsWith('.deps/github/')) return path.substring('.deps/github/'.length)
    if (path.startsWith('.deps/http/')) {
      // For HTTP paths, keep them as http URLs would be stored
      return path
    }
    return path
  }

  // Helpers
  private buildCandidates(inputPath: string): string[] {
    const out = new Set<string>()
    if (inputPath) out.add(inputPath)
    const gh = this.githubAliasToRaw(inputPath)
    if (gh) out.add(gh)
    const ghBlob = this.githubBlobToRaw(inputPath)
    if (ghBlob) out.add(ghBlob)
    return Array.from(out)
  }

  private githubAliasToRaw(p: string): string | null {
    // github/<owner>/<repo>@<ref>/<rest> -> https://raw.githubusercontent.com/<owner>/<repo>/<ref>/<rest>
    const m = typeof p === 'string' ? p.match(/^github\/([^/]+)\/([^@]+)@([^/]+)\/(.*)$/) : null
    if (!m) return null
    const [, owner, repo, ref, rest] = m
    return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${rest}`
  }

  private githubBlobToRaw(p: string): string | null {
    // https://github.com/<o>/<r>/blob/<ref>/<rest> -> https://raw.githubusercontent.com/<o>/<r>/<ref>/<rest>
    const m = typeof p === 'string' ? p.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.*)$/) : null
    if (!m) return null
    const [, owner, repo, ref, rest] = m
    return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${rest}`
  }

  private toSuffix(p: string): string {
    // we want to match values like ".deps/github/<o>/<r>@<ref>/<rest>" by suffix "github/<o>/<r>@<ref>/<rest>"
    // if p is already an alias, keep it; if p is a raw URL, convert to alias-ish suffix
    const alias = this.rawToGithubAlias(p)
    return alias ? alias : p
  }

  private rawToGithubAlias(p: string): string | null {
    const m = typeof p === 'string' ? p.match(/^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.*)$/) : null
    if (!m) return null
    const [, owner, repo, ref, rest] = m
    return `github/${owner}/${repo}@${ref}/${rest}`
  }

  private findByResolvedSuffix(suffixes: string[]): string | null {
    for (const file in this.index) {
      const map = this.index[file]
      for (const key in map) {
        const value = map[key]
        for (const s of suffixes) {
          if (value.endsWith(s)) return value
        }
      }
    }
    return null
  }

  private externalToDepsPath(p: string): string | null {
    // github alias or raw/blob urls → .deps/github/<owner>/<repo>@<ref>/<rest>
    const alias = this.rawToGithubAlias(p) || this.aliasFromGithubBlob(p) || this.aliasFromGithubAlias(p)
    if (alias) return `.deps/${alias}`
    return null
  }

  private aliasFromGithubAlias(p: string): string | null {
    const m = typeof p === 'string' ? p.match(/^github\/([^/]+)\/([^@]+)@([^/]+)\/(.*)$/) : null
    if (!m) return null
    const [, owner, repo, ref, rest] = m
    return `github/${owner}/${repo}@${ref}/${rest}`
  }

  private aliasFromGithubBlob(p: string): string | null {
    const m = typeof p === 'string' ? p.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.*)$/) : null
    if (!m) return null
    const [, owner, repo, ref, rest] = m
    return `github/${owner}/${repo}@${ref}/${rest}`
  }
}
