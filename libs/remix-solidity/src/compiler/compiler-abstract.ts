'use strict'
import helper from './helper'
import { CompilationResult, CompilerInput, CompilationSourceCode } from './types'
import { Plugin } from '@remixproject/engine'

export class CompilerAbstract {
  languageversion: string
  data: CompilationResult
  source: CompilationSourceCode
  input: CompilerInput
  mapFilePaths: Record<string, string>
  constructor (languageversion: string, data: CompilationResult, source: CompilationSourceCode, input?: CompilerInput, plugin?: Plugin) {
    this.languageversion = languageversion
    this.data = data
    this.source = source // source code
    this.input = input
    if (plugin) {
      this.resolvePaths(plugin).then((mapFilePaths) => {
        this.mapFilePaths = mapFilePaths
      }).catch((e) => {
        console.warn('Failed to resolve paths:', e)
      })
    }
  }

  static fromBulk (bulk: any[]): CompilerAbstract {
    return new CompilerAbstract(bulk[0], bulk[1], bulk[2], bulk[3], bulk[4])
  }

  getActualFilePath (file) {
    return this.mapFilePaths && this.mapFilePaths[file] ? this.mapFilePaths[file] : file
  }

  getBulk () {
    return [
      this.languageversion,
      this.data,
      this.source,
      this.input
    ]
  }

  getContracts () {
    return this.data.contracts || {}
  }

  getContract (name) {
    return helper.getContract(name, this.data.contracts)
  }

  visitContracts (callback) {
    return helper.visitContracts(this.data.contracts, callback)
  }

  getData () {
    return this.data
  }

  getInput () {
    return this.input
  }

  getAsts () {
    return this.data.sources // ast
  }

  getSourceName (fileIndex) {
    if (this.data && this.data.sources) {
      return Object.keys(this.data.sources)[fileIndex]
    } else if (Object.keys(this.source.sources).length === 1) {
      // if we don't have ast, we return the only one filename present.
      const sourcesArray = Object.keys(this.source.sources)
      return sourcesArray[0]
    }
    return null
  }

  getSourceCode () {
    return this.source
  }

  getErrors (includeWarnings: boolean = false) {
    const errors = []
    if (this.data.error) {
      if (includeWarnings || this.data.error.severity !== 'warning') {
        errors.push(this.data.error)
      }
    }
    if (this.data.errors) {
      if (includeWarnings) {
        errors.push(...this.data.errors)
      } else {
        errors.push(...this.data.errors.filter(error => error.severity !== 'warning'))
      }
    }
    return errors
  }

  private async resolvePaths (plugin: Plugin) {
    const mapFilePaths = {}
    try {
      const originPath = Object.keys(this.source.sources)[0]
      for (const filePath in this.source.sources) {
        const resolved = await plugin.call('resolutionIndex', 'resolveActualPath', originPath, filePath)
        if (resolved) {
          mapFilePaths[filePath] = resolved
        } else {
          // Fall back to regular resolution
          const fallback = await plugin.call('resolutionIndex', 'resolvePath', originPath, filePath)
          mapFilePaths[filePath] = fallback || filePath
        }
      }
    } catch (e) {
      console.log('Resolution failed, using provided path:', e)
    }
    return mapFilePaths
  }
}
