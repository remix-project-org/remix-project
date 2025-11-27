'use strict'

import { StorageViewer } from './storage/storageViewer'
import { StorageResolver } from './storage/storageResolver'
import { TraceManager } from './trace/traceManager'
import { CodeManager } from './code/codeManager'
import { contractCreationToken } from './trace/traceHelper'
import { EventManager } from './eventManager'
import { SolidityProxy, stateDecoder, localDecoder, InternalCallTree } from './solidity-decoder'

/**
  * Ethdebugger is a wrapper around a few classes that helps debug a transaction
  *
  * - TraceManager - Load / Analyze the trace and retrieve details of specific test
  * - CodeManager - Retrieve loaded byte code and help to resolve AST item from vmtrace index
  * - SolidityProxy - Basically used to extract state variable from AST
  * - Breakpoint Manager - Used to add / remove / jump to breakpoint
  * - InternalCallTree - Used to retrieve local variables
  * - StorageResolver - Help resolving the storage across different steps
  *
  * @param {Map} opts  -  { function compilationResult } //
  */
export class Ethdebugger {
  compilationResult
  web3
  opts
  event
  tx
  traceManager
  codeManager
  solidityProxy
  storageResolver
  callTree
  breakpointManager
  offsetToLineColumnConverter

  constructor (opts) {
    this.compilationResult = opts.compilationResult || function (contractAddress) { return null }
    this.offsetToLineColumnConverter = opts.offsetToLineColumnConverter
    this.web3 = opts.web3
    this.opts = opts

    this.event = new EventManager()
    this.traceManager = new TraceManager({ web3: this.web3 })
    this.codeManager = new CodeManager(this.traceManager)
    this.solidityProxy = new SolidityProxy({
      getCurrentCalledAddressAt: this.traceManager.getCurrentCalledAddressAt.bind(this.traceManager),
      getCode: this.codeManager.getCode.bind(this.codeManager),
      compilationResult: this.compilationResult
    })
    this.storageResolver = null

    const includeLocalVariables = true
    this.callTree = new InternalCallTree(this.event,
      this.traceManager,
      this.solidityProxy,
      this.codeManager,
      { ...opts, includeLocalVariables },
      this.offsetToLineColumnConverter)
  }

  setManagers () {
    this.traceManager = new TraceManager({ web3: this.web3 })
    this.codeManager = new CodeManager(this.traceManager)
    this.solidityProxy = new SolidityProxy({
      getCurrentCalledAddressAt: this.traceManager.getCurrentCalledAddressAt.bind(this.traceManager),
      getCode: this.codeManager.getCode.bind(this.codeManager),
      compilationResult: this.compilationResult
    })
    this.storageResolver = null
    const includeLocalVariables = true

    this.callTree = new InternalCallTree(this.event,
      this.traceManager,
      this.solidityProxy,
      this.codeManager,
      { ...this.opts, includeLocalVariables },
      this.offsetToLineColumnConverter)
  }

  resolveStep (index) {
    this.codeManager.resolveStep(index, this.tx)
  }

  async sourceLocationFromVMTraceIndex (address, stepIndex) {
    const compilationResult = await this.compilationResult(address)
    return this.callTree.sourceLocationTracker.getSourceLocationFromVMTraceIndex(address, stepIndex, compilationResult.data.contracts)
  }

  async getValidSourceLocationFromVMTraceIndex (address, stepIndex) {
    const compilationResult = await this.compilationResult(address)
    return this.callTree.sourceLocationTracker.getValidSourceLocationFromVMTraceIndex(address, stepIndex, compilationResult.data.contracts)
  }

  async sourceLocationFromInstructionIndex (address, instIndex, callback) {
    const compilationResult = await this.compilationResult(address)
    return this.callTree.sourceLocationTracker.getSourceLocationFromInstructionIndex(address, instIndex, compilationResult.data.contracts)
  }

  /* breakpoint */
  setBreakpointManager (breakpointManager) {
    this.breakpointManager = breakpointManager
  }

  /* decode locals */
  extractLocalsAt (step) {
    return this.callTree.findScope(step)
  }

  async decodeLocalVariableByIdAtCurrentStep (step: number, id: number) {
    const variable = this.callTree.getLocalVariableById(id)
    if (!variable) return null
    const stack = this.traceManager.getStackAt(step)
    const memory = this.traceManager.getMemoryAt(step)
    const address = this.traceManager.getCurrentCalledAddressAt(step)
    const calldata = this.traceManager.getCallDataAt(step)
    const storageViewer = new StorageViewer({ stepIndex: step, tx: this.tx, address: address }, this.storageResolver, this.traceManager)
    return await variable.type.decodeFromStack(variable.stackDepth, stack, memory, storageViewer, calldata, null, variable)
  }

  async decodeStateVariableByIdAtCurrentStep (step: number, id: number) {
    const stateVars = await this.solidityProxy.extractStateVariablesAt(step)
    const variable = stateVars.filter((el) => el.variable.id === id)
    if (variable && variable.length) {
      const state = await this.decodeStateAt(step, variable)
      return state[variable[0].name]
    }
    return null
  }

  async decodeLocalsAt (step, sourceLocation, callback) {
    try {
      const stack = this.traceManager.getStackAt(step)
      const memory = this.traceManager.getMemoryAt(step)
      const address = this.traceManager.getCurrentCalledAddressAt(step)
      const calldata = this.traceManager.getCallDataAt(step)
      try {
        const storageViewer = new StorageViewer({ stepIndex: step, tx: this.tx, address: address }, this.storageResolver, this.traceManager)
        const locals = await localDecoder.solidityLocals(step, this.callTree, stack, memory, storageViewer, calldata, sourceLocation, null)
        if (locals['error']) {
          return callback(locals['error'])
        }
        return callback(null, locals)
      } catch (e) {
        callback(e.message)
      }
    } catch (error) {
      callback(error)
    }
  }

  /* decode state */
  async extractStateAt (step) {
    return await this.solidityProxy.extractStateVariablesAt(step)
  }

  async decodeStateAt (step, stateVars, callback?) {
    try {
      callback = callback || (() => {})
      const address = this.traceManager.getCurrentCalledAddressAt(step)
      const storageViewer = new StorageViewer({ stepIndex: step, tx: this.tx, address: address }, this.storageResolver, this.traceManager)
      const result = await stateDecoder.decodeState(stateVars, storageViewer)
      callback(result)
      return result
    } catch (error) {
      callback(error)
    }
  }

  storageViewAt (step, address) {
    return new StorageViewer({ stepIndex: step, tx: this.tx, address: address }, this.storageResolver, this.traceManager)
  }

  updateWeb3 (web3) {
    this.web3 = web3
    this.setManagers()
  }

  unLoad () {
    this.traceManager.init()
    this.codeManager.clear()
    this.solidityProxy.reset()
    this.event.trigger('traceUnloaded')
  }

  async debug (tx) {
    if (this.traceManager.isLoading) {
      return
    }
    tx.to = tx.to || contractCreationToken('0')
    this.tx = tx

    await this.traceManager.resolveTrace(tx)
    this.event.trigger('newTraceLoaded', [this.traceManager.trace])
    if (this.breakpointManager && this.breakpointManager.hasBreakpoint()) {
      this.breakpointManager.jumpNextBreakpoint(false)
    }
    this.storageResolver = new StorageResolver({ web3: this.traceManager.web3 })
  }
}
