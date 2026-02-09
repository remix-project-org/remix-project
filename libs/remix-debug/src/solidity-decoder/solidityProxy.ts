'use strict'
import { util } from '@remix-project/remix-lib'
import { isContractCreation } from '../trace/traceHelper'
import { extractStateVariables } from './stateDecoder'
import { extractContractDefinitions, extractStatesDefinitions } from './astHelper'

export class SolidityProxy {
  cache
  getCurrentCalledAddressAt
  getCode
  sources
  contracts
  compilationResult
  sourcesCode

  constructor ({ getCurrentCalledAddressAt, getCode, compilationResult }) {
    this.cache = new Cache()
    this.getCurrentCalledAddressAt = getCurrentCalledAddressAt
    this.getCode = getCode
    this.compilationResult = compilationResult
  }

  /**
    * reset the cache and apply a new @arg compilationResult
    *
    */
  reset () {
    this.cache.reset()
  }

  /**
    * retrieve the compiled contract name at the @arg vmTraceIndex (cached)
    *
    * @param {Int} vmTraceIndex  - index in the vm trace where to resolve the executed contract name
    * @return {Object} a contract object
    */
  async contractObjectAt (vmTraceIndex: number) {
    const address = this.getCurrentCalledAddressAt(vmTraceIndex)
    return this.contractObjectAtAddress(address)
  }

  /**
    * retrieve the compiled contract name at the @arg address (cached)
    *
    * @param {String} address  - address of a contract
    * @return {Object} a contract object
    */
  async contractObjectAtAddress (address: string) {
    if (this.cache.contractObjectByAddress[address]) {
      return this.cache.contractObjectByAddress[address]
    }
    const code = await this.getCode(address)
    const compilationResult = await this.compilationResult(address)
    let contract
    if (compilationResult && compilationResult.data && compilationResult.data.contracts) {
      contract = contractObjectFromCode(compilationResult.data.contracts, code.bytecode, address)
      this.cache.contractObjectByAddress[address] = contract
    }
    return contract
  }

  /**
    * extract the state variables of the given compiled @arg address (cached)
    *
    * @param {String} address - address of the contract to retrieve state variables from
    * @return {Object} - returns state variables of @args address
    */
  async extractStatesDefinitions (address: string) {
    const compilationResult = await this.compilationResult(address)
    if (!compilationResult || !compilationResult.data) return null
    if (!this.cache.contractDeclarations[address]) {
      this.cache.contractDeclarations[address] = extractContractDefinitions(compilationResult.data.sources)
    }
    if (!this.cache.statesDefinitions[address]) {
      this.cache.statesDefinitions[address] = extractStatesDefinitions(compilationResult.data.sources, this.cache.contractDeclarations[address])
    }
    return this.cache.statesDefinitions[address]
  }

  /**
    * extract the state variables of the given compiled @arg contractName (cached)
    *
    * @param {String} contractName  - name of the contract to retrieve state variables from
    * @param {String} address  - contract address
    * @return {Object} - returns state variables of @args contractName
    */
  async extractStateVariables (contractName: string, address: string) {
    if (!this.cache.stateVariablesByContractName[contractName]) {
      const compilationResult = await this.compilationResult(address)
      this.cache.stateVariablesByContractName[contractName] = extractStateVariables(contractName, compilationResult.data.sources)
    }
    return this.cache.stateVariablesByContractName[contractName]
  }

  /**
    * extract the state variables of the given compiled @arg vmtraceIndex (cached)
    *
    * @param {Int} vmTraceIndex  - index in the vm trace where to resolve the state variables
    * @param {String} address  - contract address
    * @return {Object} - returns state variables of @args vmTraceIndex
    */
  async extractStateVariablesAt (vmtraceIndex: number, address?: string) {
    const contract = await this.contractObjectAt(vmtraceIndex)
    return await this.extractStateVariables(contract.name, address)
  }

  /**
    * get the AST of the file declare in the @arg sourceLocation
    *
    * @param {Object} sourceLocation  - source location containing the 'file' to retrieve the AST from
    * @param {Object} generatedSources  - compiler generated sources
    * @param {String} address  - contract address
    * @return {Object} - AST of the current file
    */
  async ast (sourceLocation, generatedSources, address) {
    const compilationResult = await this.compilationResult(address)
    if (!compilationResult || !compilationResult.data) return null
    const file = this.fileNameFromIndex(sourceLocation.file, compilationResult.data)
    if (!file && generatedSources && generatedSources.length) {
      for (const source of generatedSources) {
        if (source.id === sourceLocation.file) return source.ast
      }
    } else if (compilationResult.data.sources && compilationResult.data.sources[file]) {
      return compilationResult.data.sources[file].ast
    }
    return null
  }

  /**
   * get the filename referring to the index from the compilation result
   *
   * @param {Int} index  - index of the filename
   * @param {Object} compilationResult  - current compilation result
   * @return {String} - filename
   */
  fileNameFromIndex (index, compilationResult) {
    return Object.keys(compilationResult.contracts)[index]
  }
}

function contractObjectFromCode (contracts, code, address) {
  const isCreation = isContractCreation(address)
  for (const file in contracts) {
    for (const contract in contracts[file]) {
      const bytecode = isCreation ? contracts[file][contract].evm.bytecode.object : contracts[file][contract].evm.deployedBytecode.object
      if (util.compareByteCode(code, '0x' + bytecode)) {
        return { name: contract, contract: contracts[file][contract] }
      }
    }
  }
  return null
}

class Cache {
  contractObjectByAddress
  stateVariablesByContractName
  contractDeclarations
  statesDefinitions

  constructor () {
    this.reset()
  }

  reset () {
    this.contractObjectByAddress = {}
    this.stateVariablesByContractName = {}
    this.contractDeclarations = {}
    this.statesDefinitions = {}
  }
}
