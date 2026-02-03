'use strict'
import { EventManager } from '../eventManager'
import { isContractCreation } from '../trace/traceHelper'
import { atIndex } from './sourceMappingDecoder'
import { util } from '@remix-project/remix-lib'

/**
 * Process the source code location for the current executing bytecode
 */
export class SourceLocationTracker {
  opts
  codeManager
  event
  sourceMapByAddress

  constructor (_codeManager, { debugWithGeneratedSources }) {
    this.opts = {
      debugWithGeneratedSources: debugWithGeneratedSources || false
    }
    this.codeManager = _codeManager
    this.event = new EventManager()
    this.sourceMapByAddress = {}
  }

  /**
   * Return the source location associated with the given @arg index (instruction index)
   *
   * @param {String} address - contract address from which the source location is retrieved
   * @param {Int} index - index in the instruction list from where the source location is retrieved
   * @param {Object} contractDetails - AST of compiled contracts
   */
  async getSourceLocationFromInstructionIndex (address, index, contracts) {
    const sourceMap = await this.extractSourceMap(this, this.codeManager, address, contracts)
    return atIndex(index, sourceMap['map'])
  }

  /**
   * Return the source location associated with the given @arg vmTraceIndex
   *
   * @param {String} address - contract address from which the source location is retrieved
   * @param {Int} vmtraceStepIndex - index of the current code in the vmtrace
   * @param {Object} contractDetails - AST of compiled contracts
   */
  async getSourceLocationFromVMTraceIndex (address, vmtraceStepIndex, contracts) {
    const sourceMap = await this.extractSourceMap(this, this.codeManager, address, contracts)
    const index = this.codeManager.getInstructionIndex(address, vmtraceStepIndex)
    return atIndex(index, sourceMap['map'])
  }

  /**
   * Returns the generated sources from a specific @arg address
   *
   * @param {String} address - contract address from which has generated sources
   * @param {Object} generatedSources - Object containing the sourceid, ast and the source code.
   */
  getGeneratedSourcesFromAddress (address) {
    if (!this.opts.debugWithGeneratedSources) return null
    if (this.sourceMapByAddress[address]) return this.sourceMapByAddress[address].generatedSources
    return null
  }

  /**
   * Returns the total amount of sources from a specific @arg address and @arg contracts
   *
   * @param {String} address - contract address from which has generated sources
   * @param {Object} contracts - AST of compiled contracts
   */
  getTotalAmountOfSources (address, contracts) {
    let sourcesLength = Object.keys(contracts).length
    const generatedSources = this.getGeneratedSourcesFromAddress(address)
    if (generatedSources) sourcesLength = sourcesLength + Object.keys(generatedSources).length
    return sourcesLength
  }

  /**
   * Return a valid source location associated with the given @arg vmTraceIndex
   *
   * @param {String} address - contract address from which the source location is retrieved
   * @param {Int} vmtraceStepIndex - index of the current code in the vmtrace
   * @param {Object} contractDetails - AST of compiled contracts
   */
  async getValidSourceLocationFromVMTraceIndex (address, vmtraceStepIndex, contracts) {
    const amountOfSources = this.getTotalAmountOfSources(address, contracts)
    let map: Record<string, number> = { file: -1 }
    /*
      (map.file === -1) this indicates that it isn't associated with a known source code
      (map.file > amountOfSources - 1) this indicates the current file index exceed the total number of files.
                                              this happens when generated sources should not be considered.
    */
    while (vmtraceStepIndex >= 0 && this.isInvalidSourceLocation(map, amountOfSources)) {
      map = await this.getSourceLocationFromVMTraceIndex(address, vmtraceStepIndex, contracts)
      vmtraceStepIndex = vmtraceStepIndex - 1
    }
    return map
  }

  isInvalidSourceLocation (sourceLocation, amountOfSources) {
    return sourceLocation.file === -1 || sourceLocation.file > amountOfSources - 1
  }

  async getValidSourceLocationFromVMTraceIndexFromCache (address: string, vmtraceStepIndex: number, contracts: any, cache: { [Key: number]: any }) {
    const amountOfSources = this.getTotalAmountOfSources(address, contracts)
    let map: any = { file: -1 }
    /*
      (map.file === -1) this indicates that it isn't associated with a known source code
      (map.file > amountOfSources - 1) this indicates the current file index exceed the total number of files.
                                              this happens when generated sources should not be considered.
    */
    const originStep = cache[vmtraceStepIndex]
    while (vmtraceStepIndex >= 0 && (map.file === -1 || map.file > amountOfSources - 1)) {
      map = cache[vmtraceStepIndex].sourceLocation
      vmtraceStepIndex = vmtraceStepIndex - 1
      originStep.sourceLocation = map
    }
    return originStep
  }

  clearCache () {
    this.sourceMapByAddress = {}
  }

  private getSourceMap (address, code, contracts) {
    const isCreation = isContractCreation(address)
    let bytes
    for (const file in contracts) {
      for (const contract in contracts[file]) {
        const bytecode = contracts[file][contract].evm.bytecode
        const deployedBytecode = contracts[file][contract].evm.deployedBytecode
        if (!deployedBytecode) continue

        bytes = isCreation ? bytecode.object : deployedBytecode.object
        if (util.compareByteCode(code, '0x' + bytes)) {
          const generatedSources = isCreation ? bytecode.generatedSources : deployedBytecode.generatedSources
          const map = isCreation ? bytecode.sourceMap : deployedBytecode.sourceMap
          return { generatedSources, map }
        }
      }
    }
    return null
  }

  private extractSourceMap (self, codeManager, address, contracts) {
    return new Promise((resolve, reject) => {
      if (self.sourceMapByAddress[address]) return resolve(self.sourceMapByAddress[address])

      codeManager.getCode(address).then((result) => {
        const sourceMap = this.getSourceMap(address, result.bytecode, contracts)
        if (sourceMap) {
          if (!isContractCreation(address)) self.sourceMapByAddress[address] = sourceMap
          return resolve(sourceMap)
        }
        reject(new Error('no sourcemap associated with the code ' + address))
      }).catch(reject)
    })
  }
}
