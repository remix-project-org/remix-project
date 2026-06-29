import type { IOAdapter } from '../adapters/io-adapter'
import { DependencyResolver } from '../resolvers/dependency-resolver'
import { normalizeRemappings, parseRemappingsFileContent, Remapping } from '../utils/remappings'
import { Logger } from '../utils/logger'
import { ImportPatterns } from '../constants/import-patterns'

export interface FlattenResult {
  entry: string
  order: string[]
  sources: Map<string, string>
  flattened: string
}

export interface FlattenOptions {
  remappings?: Array<string | Remapping>
  remappingsFile?: string
  pragma?: string // e.g., "^0.8.26" to override header pragma
}

export class SourceFlattener {
  private logger: Logger

  constructor(private io: IOAdapter, private debug = false) {
    this.logger = new Logger(undefined, debug)
  }

  private log(...args: unknown[]) {
    this.logger.logIf('sourceFlattener', '[SourceFlattener]', ...args)
  }

  public async flatten(entryFile: string, opts?: FlattenOptions): Promise<FlattenResult> {
    const dep = new DependencyResolver(this.io, entryFile, this.debug)
    if (opts?.remappingsFile) {
      try {
        const content = await this.io.readFile(opts.remappingsFile)
        const remaps = parseRemappingsFileContent(content)
        dep.setRemappings(remaps)
      } catch (e) {
        this.log('Failed to read remappings file:', opts.remappingsFile, e)
      }
    } else if (opts?.remappings && opts.remappings.length) {
      dep.setRemappings(normalizeRemappings(opts.remappings))
    }
    await dep.buildDependencyTree(entryFile)
    await dep.saveResolutionIndex()

    const graph = dep.getImportGraph()
    const bundle = dep.getSourceBundle()
    const visited = new Set<string>()
    const order: string[] = []

    const visit = (file: string) => {
      if (visited.has(file)) return
      visited.add(file)
      const imports = graph.get(file)
      if (imports) {
        for (const imp of imports) {
          let key = imp
          if (graph.has(imp)) key = imp
          visit(key)
        }
      }
      order.push(file)
    }

    if (!graph.has(entryFile)) order.push(entryFile)
    else visit(entryFile)

    let firstPragma: string | null = null
    let firstSpdx: string | null = null
    const seen = new Set<string>()
    const parts: string[] = []

    const stripImports = (src: string) => src.replace(/\n?\s*import\s+[^;]+;\s*\n?/g, '\n')

    for (const file of order) {
      if (seen.has(file)) continue
      seen.add(file)
      const content = bundle.get(file) || ''
      if (!content) continue

      const lines = content.split(/\r?\n/)
      const kept: string[] = []
      for (const line of lines) {
        const spdxMatch = line.match(ImportPatterns.SPDX_LICENSE)
        if (spdxMatch) { if (!firstSpdx) firstSpdx = line.trim(); continue }
        const pragmaMatch = line.match(ImportPatterns.PRAGMA_SOLIDITY)
        if (pragmaMatch) { if (!firstPragma) firstPragma = pragmaMatch[0]; continue }
        kept.push(line)
      }

      const withoutImports = stripImports(kept.join('\n')).trim()

      // Prefer versioned path for comment if it exists in the bundle
      // e.g., @openzeppelin/contracts@5.4.0/... instead of @openzeppelin/contracts/...
      let displayPath = file
      if (file.startsWith('@') && !file.match(ImportPatterns.VERSIONED_PATH_SEMVER)) {
        // File is an unversioned external import, check if versioned version exists
        const versionedKeys = Array.from(bundle.keys()).filter(k => {
          // Match the pattern: @scope/package@version/path matches @scope/package/path
          const versionedPattern = k.match(ImportPatterns.VERSIONED_SCOPED_PATH)
          if (!versionedPattern) return false
          const [, pkgBase, , pkgPath] = versionedPattern
          return file === `${pkgBase}/${pkgPath}`
        })
        if (versionedKeys.length > 0) {
          displayPath = versionedKeys[0] // Use the first (and typically only) versioned match
        }
      }

      this.log('Adding file to flat:', displayPath)
      parts.push(`\n\n// File: ${displayPath}\n\n${withoutImports}`)
    }

    const header: string[] = []
    if (firstSpdx) header.push(firstSpdx)
    if (opts?.pragma) {
      header.push(`pragma solidity ${opts.pragma};`)
    } else if (firstPragma) {
      header.push(firstPragma)
    }

    const flattened = [header.join('\n'), ...parts].filter(Boolean).join('\n')
    return { entry: entryFile, order, sources: bundle, flattened }
  }

  public async flattenToFile(entryFile: string, outFile: string, opts?: FlattenOptions & { overwrite?: boolean }): Promise<FlattenResult & { outFile: string }> {
    const result = await this.flatten(entryFile, opts)
    const dir = outFile.split('/').slice(0, -1).join('/')
    if (dir) await this.io.mkdir(dir)
    await this.io.writeFile(outFile, result.flattened)
    return { ...result, outFile }
  }
}
