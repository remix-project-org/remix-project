'use strict'
import helper from './helper'
import { CompilationResult, CompilerInput, CompilationSourceCode } from './types'

export class CompilerAbstract {
  languageversion: string
  data: CompilationResult
  source: CompilationSourceCode
  input: CompilerInput
  constructor (languageversion: string, data: CompilationResult, source: CompilationSourceCode, input?: CompilerInput) {
    this.languageversion = languageversion
    this.data = data
    this.source = source // source code
    this.input = input
  }

  static fromBulk (bulk: any[]): CompilerAbstract {
    return new CompilerAbstract(bulk[0], bulk[1], bulk[2], bulk[3])
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
}
