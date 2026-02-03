'use strict'

import { StorageViewer } from './storage/storageViewer'
import { StorageResolver } from './storage/storageResolver'
import { TraceManager } from './trace/traceManager'
import { CodeManager } from './code/codeManager'
import { contractCreationToken } from './trace/traceHelper'
import { EventManager } from './eventManager'
import { SolidityProxy, stateDecoder, localDecoder, InternalCallTree } from './solidity-decoder'
import { type BreakpointManager } from './code/breakpointManager'
import { CompilerAbstract } from '@remix-project/remix-solidity'
import { BrowserProvider } from 'ethers'
import type { OffsetToLineColumnConverterFn } from './types'
import { findVariableStackPosition } from './solidity-decoder/localDecoder'

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
  compilationResult: (contractAddress: string) => Promise<CompilerAbstract>
  web3: BrowserProvider
  opts
  event: EventManager
  tx
  traceManager: TraceManager
  codeManager: CodeManager
  solidityProxy: SolidityProxy
  storageResolver: StorageResolver
  callTree: InternalCallTree
  breakpointManager: BreakpointManager
  offsetToLineColumnConverter: OffsetToLineColumnConverterFn

  /**
   * Creates a new Ethdebugger instance with the specified options.
   * Initializes all necessary managers for debugging including TraceManager, CodeManager,
   * SolidityProxy, and InternalCallTree.
   *
   * @param {Object} opts - Configuration options
   * @param {Function} opts.compilationResult - Function to retrieve compilation results for a contract address
   * @param {Object} opts.offsetToLineColumnConverter - Converter for source code positions
   * @param {Object} opts.web3 - Web3 instance for blockchain interaction
   */
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

  /**
   * Reinitializes all manager instances with current web3 provider.
   * This resets TraceManager, CodeManager, SolidityProxy, InternalCallTree, and StorageResolver.
   * Typically called when the web3 provider changes.
   */
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

  /**
   * resolve the code of the given @arg stepIndex and trigger appropriate event
   *
   * @param {String} stepIndex - vm trace step
   */
  resolveStep (index) {
    this.codeManager.resolveStep(index, this.tx)
  }

  /**
   * Retrieves the source location (file, line, column) from a VM trace step index.
   *
   * @param {String} address - Contract address
   * @param {Number} stepIndex - VM trace step index
   * @returns {Promise<Object>} Source location object with file, start, and length information
   */
  async sourceLocationFromVMTraceIndex (address, stepIndex) {
    const compilationResult = await this.compilationResult(address)
    return this.callTree.sourceLocationTracker.getSourceLocationFromVMTraceIndex(address, stepIndex, compilationResult.data.contracts)
  }

  /**
   * Retrieves a valid source location from a VM trace step index.
   * Similar to sourceLocationFromVMTraceIndex but ensures the location is valid (non-empty).
   *
   * @param {String} address - Contract address
   * @param {Number} stepIndex - VM trace step index
   * @returns {Promise<Object>} Valid source location object with file, start, and length information
   */
  async getValidSourceLocationFromVMTraceIndex (address, stepIndex) {
    const compilationResult = await this.compilationResult(address)
    return this.callTree.sourceLocationTracker.getValidSourceLocationFromVMTraceIndex(address, stepIndex, compilationResult.data.contracts)
  }

  /**
   * Retrieves the source location from an instruction index (bytecode position).
   *
   * @param {String} address - Contract address
   * @param {Number} instIndex - Instruction index in the bytecode
   * @returns {Promise<Object>} Source location object with file, start, and length information
   */
  async sourceLocationFromInstructionIndex (address, instIndex) {
    const compilationResult = await this.compilationResult(address)
    return this.callTree.sourceLocationTracker.getSourceLocationFromInstructionIndex(address, instIndex, compilationResult.data.contracts)
  }

  /**
   * Sets the breakpoint manager for debugging sessions.
   *
   * @param {Object} breakpointManager - Breakpoint manager instance to handle breakpoints
   */
  setBreakpointManager (breakpointManager) {
    this.breakpointManager = breakpointManager
  }

  /**
   * Extracts the scope information (local variables context) at a specific execution step.
   *
   * @param {Number} step - Execution step index
   * @returns {Object} Scope information containing local variables for the given step
   */
  extractLocalsAt (step) {
    return this.callTree.findScope(step)
  }

  /**
   * Decodes a local variable by its ID at a specific execution step.
   * Retrieves the variable from the call tree and decodes its value from the EVM stack and memory.
   *
   * @param {number} step - Execution step index
   * @param {number} id - Unique identifier of the local variable
   * @returns {Promise<any|null>} Decoded variable value, or null if variable not found
   */
  async decodeLocalVariableById (step: number, id: number) {
    const variable = this.callTree.getLocalVariableById(id)
    if (!variable) return null
    const stack = this.traceManager.getStackAt(step)
    const memory = this.traceManager.getMemoryAt(step)
    const address = this.traceManager.getCurrentCalledAddressAt(step)
    const calldata = this.traceManager.getCallDataAt(step)
    const storageViewer = new StorageViewer({ stepIndex: step, tx: this.tx, address: address }, this.storageResolver, this.traceManager)
    const currentStackIndex = findVariableStackPosition(this.callTree, step, variable)
    return await variable.type.decodeFromStack(currentStackIndex, stack, memory, storageViewer, calldata, null, variable)
  }

  /**
   * Decodes a state variable by its ID at a specific execution step.
   * Retrieves the state variable and decodes its value from contract storage.
   *
   * @param {number} step - Execution step index
   * @param {number} id - Unique identifier of the state variable
   * @returns {Promise<any|null>} Decoded variable value, or null if variable not found
   */
  async decodeStateVariableById (step: number, id: number) {
    const stateVars = await this.solidityProxy.extractStateVariablesAt(step)
    const variable = stateVars.filter((el) => el.variable.id === id)
    if (variable && variable.length) {
      const state = await this.decodeStateAt(step, variable)
      return state[variable[0].name]
    }
    return null
  }

  /**
   * Decodes all local variables at a specific execution step and source location.
   * Uses the EVM stack, memory, storage, and calldata to reconstruct variable values.
   *
   * @param {Number} step - Execution step index
   * @param {Object} sourceLocation - Source code location for context
   * @param {Function} callback - Callback function with signature (error, locals)
   * @returns {Promise<void>} Calls callback with decoded locals or error
   */
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

  /**
   * Extracts all state variables at a specific execution step.
   * Returns metadata about the state variables without decoding their values.
   *
   * @param {Number} step - Execution step index
   * @returns {Promise<Array>} Array of state variable metadata objects
   */
  async extractStateAt (step) {
    return await this.solidityProxy.extractStateVariablesAt(step)
  }

  /**
   * Decodes the values of specified state variables at a specific execution step.
   * Retrieves values from contract storage and decodes them according to their types.
   *
   * @param {Number} step - Execution step index
   * @param {Array} stateVars - Array of state variable metadata to decode
   * @param {Function} [callback] - Optional callback function receiving the result or error
   * @returns {Promise<Object>} Object mapping variable names to their decoded values
   */
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

  /**
   * Creates a StorageViewer instance for inspecting contract storage at a specific step.
   *
   * @param {Number} step - Execution step index
   * @param {String} address - Contract address whose storage to view
   * @returns {StorageViewer} StorageViewer instance configured for the given step and address
   */
  storageViewAt (step, address) {
    return new StorageViewer({ stepIndex: step, tx: this.tx, address: address }, this.storageResolver, this.traceManager)
  }

  /**
   * Updates the Web3 provider and reinitializes all managers.
   * Call this when switching networks or providers.
   *
   * @param {Object} web3 - New Web3 instance
   */
  updateWeb3 (web3) {
    this.web3 = web3
    this.setManagers()
  }

  /**
   * Unloads the current debugging session and clears all cached data.
   * Resets the trace manager, code manager, and solidity proxy to their initial states.
   * Triggers a 'traceUnloaded' event.
   */
  unLoad () {
    this.traceManager.init()
    this.codeManager.clear()
    this.solidityProxy.reset()
    this.event.trigger('traceUnloaded', {})
  }

  /**
   * Starts debugging a transaction by loading and analyzing its execution trace.
   * Resolves the trace, triggers events, handles breakpoints, and initializes storage resolution.
   *
   * @param {Object} tx - Transaction object to debug
   * @param {String} tx.hash - Transaction hash
   * @param {String} [tx.to] - Recipient address (defaults to contract creation token if not provided)
   * @returns {Promise<void>} Resolves when trace is loaded and ready for debugging
   */
  async debug (tx: any) {
    if (this.traceManager.isLoading) {
      return
    }
    tx.to = tx.to || contractCreationToken('0')
    this.tx = tx

    await this.traceManager.resolveTrace(tx)
    this.event.trigger('newTraceLoaded', [this.traceManager.trace])
    if (this.breakpointManager && this.breakpointManager.hasBreakpoint()) {
      this.breakpointManager.jumpNextBreakpoint(false, false)
    }
    this.storageResolver = new StorageResolver({ web3: this.traceManager.web3 })
  }

  /**
   * Retrieves the currently loaded execution trace.
   *
   * @returns {Array|undefined} The execution trace array, or undefined if no trace is loaded
   */
  getTrace () {
    return this.traceManager?.trace
  }
}
