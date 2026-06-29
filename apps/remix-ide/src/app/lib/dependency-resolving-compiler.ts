'use strict'

import { Plugin } from '@remixproject/engine'
import { Compiler, Source } from '@remix-project/remix-solidity'
import { DependencyResolver, CompilerInputDepedencyResolver } from '@remix-project/import-resolver'

let resolvedSources: CompilerInputDepedencyResolver
let debugEnabled = false

const customImportCallback = (url: string, cb: (err: any, result?: any) => void): void => {
  if (debugEnabled) console.log(`[DependencyResolvingCompiler] 🔍 Import callback invoked for URL: ${url}`)
  // look up the source from resolvedSources
  if (resolvedSources && url in resolvedSources) {
    if (debugEnabled) console.log(`[DependencyResolvingCompiler] ✅ Found resolved source for URL: ${url}`)
    return cb(null, resolvedSources[url].content)
  } else {
    if (debugEnabled) console.log(`[DependencyResolvingCompiler] ❌ No resolved source found for URL: ${url}`)
    cb(`❌ No resolved source found for URL: ${url}`)
  }
  return

}
/**
 * DependencyResolvingCompiler - A wrapper around the standard Compiler that automatically
 * handles dependency resolution before compilation.
 *
 * This class exposes the exact same interface as Compiler but adds intelligent
 * pre-compilation dependency resolution using DependencyResolver.
 */
export class DependencyResolvingCompiler extends Compiler {
  private pluginApi: Plugin
  private debug: boolean = false

  constructor(
    pluginApi: Plugin,
    importCallback?: (url: string, cb: (err: any, result?: any) => void) => void,
    _importResolverFactory?: (target: string) => any,
    debug: boolean = false
  ) {
    super(customImportCallback)
    this.pluginApi = pluginApi
    this.debug = debug
    debugEnabled = this.debug

    this.log(`[DependencyResolvingCompiler] 🧠 Created smart compiler wrapper`)
  }

  private log(...args: any[]): void {
    if (this.debug) {
      console.log(...args)
    }
  }

  public compile(sources: Source, target: string): void {
    this.log(`[DependencyResolvingCompiler] 🚀 Starting smart compilation for: ${target}`, sources)
    this.performSmartCompilation(sources, target).catch(error => {

      this.log(`[DependencyResolvingCompiler] ❌ Smart compilation failed:`, error)
      // Don't fall back to normal compilation - emit the error through the proper channel
      // This ensures errors are displayed in the compiler output just like normal import errors
      this.state.lastCompilationResult = null
      this.event.trigger('compilationFinished', [
        false,
        { error: { formattedMessage: error.message || String(error), severity: 'error' } },
        { sources, target },
        null,
        this.state.currentVersion
      ])

    }).then(() => {
      this.log(`[DependencyResolvingCompiler] ✅ Smart compilation finished`)
      this.log(resolvedSources)
    })
  }

  private async performSmartCompilation(sources: Source, target: string): Promise<void> {
    // For Yul files, skip dependency resolution and pass sources as-is
    if (target.endsWith('.yul')) {
      this.log(`[DependencyResolvingCompiler] 🔧 Yul file detected, skipping dependency resolution`)
      super.compile(sources, target)
      return
    }

    // 1) Build deps
    this.log(`[DependencyResolvingCompiler] 🌳 Building dependency tree...`, sources, target)
    const depResolver = new DependencyResolver(this.pluginApi as any, target, {
      enabled: false
    })
    depResolver.setCacheEnabled(true)

    // Load remappings from remappings.txt if it exists
    try {
      const plugin = this.pluginApi as Plugin
      const remappingsAggregate: Array<{ from: string, to: string }> = []
      const remappingsTxtExists = await plugin.call('fileManager', 'exists', 'remappings.txt')
      if (remappingsTxtExists) {
        const remappingsContent = await plugin.call('fileManager', 'readFile', 'remappings.txt')
        const remappingLines = remappingsContent.split('\n').filter(Boolean)
        const remappings = remappingLines.map(line => {
          const [from, to] = line.split('=')
          return { from: from?.trim(), to: to?.trim() }
        }).filter((r: { from: any; to: any }) => r.from && r.to)

        this.log(`[DependencyResolvingCompiler] 📋 Loaded ${remappings.length} remappings from remappings.txt:`)
        remappings.forEach((r: { from: any; to: any }) => this.log(`[DependencyResolvingCompiler]    ${r.from} => ${r.to}`))
        remappingsAggregate.push(...remappings)
      } else {
        this.log(`[DependencyResolvingCompiler] ℹ️  No remappings.txt found`)
      }

      // Load remappings from remix.config.json if present
      const remixConfigExists = await plugin.call('fileManager', 'exists', 'remix.config.json')
      const state = await plugin.call('solidity', 'getCompilerState')
      if (remixConfigExists && state.useFileConfiguration) {
        try {
          const remixConfigContent = await plugin.call('fileManager', 'readFile', 'remix.config.json')
          const cfg = JSON.parse(remixConfigContent)
          const arr: string[] = cfg?.['solidity-compiler']?.settings?.remappings || []
          if (Array.isArray(arr) && arr.length > 0) {
            const configRemaps = arr.map((line: string) => {
              const [from, to] = String(line).split('=')
              return { from: from?.trim(), to: to?.trim() }
            }).filter(r => r.from && r.to)
            this.log(`[DependencyResolvingCompiler] 📋 Loaded ${configRemaps.length} remappings from remix.config.json:`)
            configRemaps.forEach(r => this.log(`[DependencyResolvingCompiler]    ${r.from} => ${r.to}`))
            // Merge: config remaps should augment existing remappings
            remappingsAggregate.push(...configRemaps)
          }
        } catch (e) {
          this.log(`[DependencyResolvingCompiler] ⚠️  Failed to parse remix.config.json remappings:`, e)
        }
      }
      if (remappingsAggregate.length > 0) {
        depResolver.setRemappings(remappingsAggregate)
      }
    } catch (err) {
      this.log(`[DependencyResolvingCompiler] ⚠️  Failed to load remappings:`, err)
    }

    let sourceBundle: Map<string, string>
    try {
      sourceBundle = await depResolver.buildDependencyTree(target)
    } catch (err) {
      this.log(`[DependencyResolvingCompiler] ❌ Dependency resolution failed:`, err)
      throw new Error(`Dependency resolution failed: ${(err as Error).message}`)
    }
    this.log(`[DependencyResolvingCompiler] ✅ Dependency tree built successfully`)
    this.log(`[DependencyResolvingCompiler] 📦 Source bundle contains ${sourceBundle.size} files`)

    // 2) Save resolution index
    await depResolver.saveSourcesBundle(target)
    await depResolver.saveResolutionIndex()

    // 3) Optional debug: import graph
    const importGraph = depResolver.getImportGraph()
    if (importGraph.size > 0) {
      this.log(`[DependencyResolvingCompiler] 📊 Import graph:`)
      importGraph.forEach((imports, file) => {
        this.log(`[DependencyResolvingCompiler]   ${file}`)
        imports.forEach(imp => this.log(`[DependencyResolvingCompiler]     → ${imp}`))
      })
    }

    // 4) Convert bundle to compiler input
    resolvedSources = depResolver.toCompilerInput()

    this.log('toResolutionFileInput', depResolver.toResolutionFileInput())

    // 5) Ensure entry file present
    if (!resolvedSources[target] && sources[target]) {
      resolvedSources[target] = sources[target]
    }

    this.log(`[DependencyResolvingCompiler] 🔨 Passing ${Object.keys(resolvedSources).length} files to underlying compiler`)
    Object.keys(resolvedSources).forEach((filePath, index) => {
      this.log(`[DependencyResolvingCompiler]   ${index + 1}. ${filePath}`)
    })
    this.log(`[DependencyResolvingCompiler] ⚡ Starting compilation with resolved sources...`, resolvedSources)

    this.log(resolvedSources)
    // 6) Delegate to base compiler
    //super.compile(resolvedSources, target)
    super.compile(resolvedSources, target)
  }
}
