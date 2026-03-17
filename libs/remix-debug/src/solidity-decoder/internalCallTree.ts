'use strict'
import { AstWalker } from '@remix-project/remix-astwalker'
import { util } from '@remix-project/remix-lib'
import { SourceLocationTracker } from '../source/sourceLocationTracker'
import { EventManager } from '../eventManager'
import { isContractCreation, isCallInstruction, isCreateInstruction, isRevertInstruction, isStopInstruction, isReturnInstruction } from '../trace/traceHelper'
import { SymbolicStackManager, SymbolicStackSlot } from './symbolicStack'
import { updateSymbolicStack } from './opcodeStackHandler'
import { includedSource, callDepthChange, addReducedTrace, getGeneratedSources, resolveNodesAtSourceLocation, registerFunctionParameters, countConsecutivePopOpcodes, includeVariableDeclaration } from './helpers/callTreeHelper'
import type { SolidityProxy } from './solidityProxy'
import { CompilerAbstract } from '@remix-project/remix-solidity'

/**
 * Represents detailed information about a single step in the VM execution trace.
 */
export type StepDetail = {
  /** Call depth in the execution stack (0 for top-level, increases with each call) */
  depth: number,
  /** Remaining gas at this step (can be number or string representation) */
  gas: number | string,
  /** Gas consumed by this specific operation */
  gasCost: number,
  /** Memory state as an array of bytes */
  memory: number[],
  /** EVM opcode name (e.g., 'PUSH1', 'ADD', 'CALL') */
  op: string,
  /** Program counter - position in the bytecode */
  pc: number,
  /** EVM stack state as an array of values */
  stack: number[],
}

/**
 * Represents a local variable or parameter with its metadata.
 */
export interface LocalVariable {
  /** Variable name */
  name: string
  /** Parsed type information */
  type: any
  /** Stack position where the variable is stored */
  stackIndex: number
  /** Source location where the variable is declared */
  sourceLocation: any
  /** VM trace step where the variable is declared */
  declarationStep: number
  /** VM trace step where it's safe to decode this variable */
  safeToDecodeAtStep: number
  /** AST node ID of the variable */
  id: number
  /** ABI information (for parameters) */
  abi?: any
  /** Whether this is a function parameter */
  isParameter?: boolean
  /** Whether this is a return parameter */
  isReturnParameter?: boolean
}

export type ScopeFilterMode = 'all' | 'call' | 'nojump'

export interface NestedScope extends Scope {
  scopeId: string
  children: NestedScope[]
}
/**
 * Represents a scope in the call tree with execution details.
 */
export interface Scope {
  /** First VM trace step index where this scope starts */
  firstStep: number
  /** Last VM trace step index where this scope ends (optional) */
  lastStep?: number
  /** Last safe VM trace step index where this scope ends (optional) */
  lastSafeStep?: number
  /** Map of local variables in this scope by name */
  locals: { [name: string]: LocalVariable }
  /** Whether this scope represents contract creation */
  isCreation: boolean
  /** Total gas cost for this scope */
  gasCost: number
  /** Source line where execution starts (optional) */
  startExecutionLine?: number
  /** Source line where execution ends (optional) */
  endExecutionLine?: number
  /** Function definition AST node if this scope represents a function */
  functionDefinition?: FunctionDefinition
  /** Information about revert if scope was reverted */
  reverted?: {
    step: StepDetail
    line?: number
  }
  /** Opcode */
  opcodeInfo: StepDetail,
  /** Opcode */
  lastOpcodeInfo?: StepDetail,
  /** Address */
  address?: string,
  /** Stack */
  stackBeforeJumping?: Array<SymbolicStackSlot>
  /** Only low level jump  **/
  lowLevelScope: boolean
  /** ASt Nodes **/
  astNodes?: Array<any>
}

/**
 * Represents an AST function definition node from Solidity compiler.
 */
export interface FunctionDefinition {
  /** Unique identifier for the function in the AST */
  id: number
  /** Function name */
  name: string
  /** Function kind (function, constructor, fallback, receive, etc.) */
  kind: string
  /** Source location string (start:length:file) */
  src: string
  /** Input parameters */
  parameters?: {
    parameters: any[]
  }
  /** Return parameters */
  returnParameters?: {
    parameters: any[]
  }
  /** Function visibility (public, private, internal, external) */
  visibility?: string
  /** State mutability (pure, view, payable, nonpayable) */
  stateMutability?: string
  /** Whether function is virtual */
  virtual?: boolean
  /** Function modifiers */
  modifiers?: any[]
  /** Function body (block statement) */
  body?: any
}

/**
 * Represents a function definition with its inputs for a specific scope.
 */
export interface FunctionDefinitionWithInputs {
  /** AST function definition node */
  functionDefinition: FunctionDefinition
  /** Array of input parameter names */
  inputs: string[]
}

/**
 * Return type for the getScopes method containing all scope-related data.
 */
export interface ScopesData {
  /** Map of scopeIds to their scope details */
  scopes: { [scopeId: string]: Scope }
  /** Map of VM trace indices to scopeIds representing scope starts */
  scopeStarts: { [stepIndex: number]: string }
  /** Map of scopeIds to function definitions with their inputs */
  functionDefinitionsByScope: { [scopeId: string]: FunctionDefinitionWithInputs }
  /** Stack of VM trace step indices where function calls occur */
  functionCallStack: number[]
}

/**
 * Tree representing internal jump into function.
 * Triggers `callTreeReady` event when tree is ready
 * Triggers `callTreeBuildFailed` event when tree fails to build
 */
export class InternalCallTree {
  /** Flag to indicate whether to include local variables in the call tree analysis */
  includeLocalVariables
  /** Flag to enable debugging with compiler-generated sources (e.g., Yul intermediate representation) */
  debugWithGeneratedSources
  /** Event manager for emitting call tree lifecycle events */
  event
  /** Proxy for interacting with Solidity compilation results and AST */
  solidityProxy: SolidityProxy
  /** Manager for accessing and navigating the execution trace */
  traceManager
  /** Tracker for mapping VM trace indices to source code locations */
  sourceLocationTracker: SourceLocationTracker
  /** Map of scopes defined by range in the VM trace. Keys are scopeIds, values contain firstStep, lastStep, locals, isCreation, gasCost */
  scopes: { [scopeId: string]: Scope }
  /** Map of low level scope that has been merged to their parent */
  mergedScope: { [scopeId: string]: string }
  /** Map of VM trace indices to scopeIds, representing the start of each scope */
  scopeStarts: { [stepIndex: number]: string }
  /** Stack of VM trace step indices where function calls occur */
  functionCallStack: number[]
  /** Map of scopeIds to function definitions with their inputs */
  functionDefinitionsByScope: { [scopeId: string]: FunctionDefinitionWithInputs }
  /** Cache of variable declarations indexed by file and source location */
  variableDeclarationByFile
  /** Cache of function definitions indexed by file and source location */
  functionDefinitionByFile
  /** AST walker for traversing Abstract Syntax Trees */
  astWalker
  /** Optimized trace containing only steps with new source locations */
  reducedTrace
  /** Map of VM trace indices to their corresponding source location, step details, line/column position, and contract address */
  locationAndOpcodePerVMTraceIndex: {
    [Key: number]: any
  }
  /** Map of gas costs aggregated by file and line number */
  gasCostPerLine
  /** Converter for transforming source offsets to line/column positions */
  offsetToLineColumnConverter
  /** Map of variable IDs to their metadata (name, type, stackIndex, sourceLocation, declarationStep, safeToDecodeAtStep) */
  variables: {
    [Key: number]: any
  }
  handledPendingConstructorExecution: {
    [Key: number]: any
  }
  /** Symbolic stack manager for tracking variable bindings and stack state throughout execution */
  symbolicStackManager: SymbolicStackManager
  /** Debug mode */
  debug: boolean
  /** get from cache */
  getCache: (key: string) => Promise<any>
  /** fn entry location */
  fnJumpDest: {
    [Key: string]: number
  }
  /** keep track of ctor params position */
  ctorLayout: {
    [id: number]: number
  }
  /** last valid BlocksDefinition */
  lastValidBlocksDefinition: any

  /**
    * constructor
    *
    * @param {Object} debuggerEvent  - event declared by the debugger (EthDebugger)
    * @param {Object} traceManager  - trace manager
    * @param {Object} solidityProxy  - solidity proxy
    * @param {Object} codeManager  - code manager
    * @param {Object} opts  - { includeLocalVariables, debugWithGeneratedSources }
    */
  constructor (debuggerEvent, traceManager, solidityProxy, codeManager, opts, offsetToLineColumnConverter?) {
    this.debug = opts.debug || false
    this.getCache = opts.getCache
    this.includeLocalVariables = opts.includeLocalVariables
    this.debugWithGeneratedSources = opts.debugWithGeneratedSources
    this.event = new EventManager()
    this.solidityProxy = solidityProxy
    this.traceManager = traceManager
    this.offsetToLineColumnConverter = offsetToLineColumnConverter
    this.sourceLocationTracker = new SourceLocationTracker(codeManager, { debugWithGeneratedSources: opts.debugWithGeneratedSources })
    this.symbolicStackManager = new SymbolicStackManager()
    debuggerEvent.register('newTraceLoaded', async (trace) => {
      const time = Date.now()
      this.reset()
      // each recursive call to buildTree represent a new context (either call, delegatecall, internal function)
      const calledAddress = traceManager.getCurrentCalledAddressAt(0)
      const isCreation = isContractCreation(calledAddress)

      const scopeId = '1'
      this.scopeStarts[0] = scopeId
      this.scopes[scopeId] = { firstStep: 0, locals: {}, isCreation, gasCost: 0, opcodeInfo: this.traceManager.trace[0], lowLevelScope: false }

      const compResult = await this.solidityProxy.compilationResult(calledAddress)
      this.symbolicStackManager.setStackAtStep(0, [])
      if (!compResult) {
        this.event.trigger('noCallTreeAvailable', [])
      } else {
        try {
          buildTree(this, 0, scopeId, isCreation).then((result) => {
            if (result.error) {
              console.error('analyzing trace fails ' + result.error)
              this.event.trigger('callTreeBuildFailed', [result.error])
            } else {
              addReducedTrace(this, traceManager.trace.length - 1)
              console.log('call tree build lasts ', (Date.now() - time) / 1000)
              this.event.trigger('callTreeReady', [this.scopes, this.scopeStarts, this])
            }
          }, (reason) => {
            console.log('analyzing trace falls ' + reason)
            this.event.trigger('callTreeNotReady', [reason])
          })
        } catch (e) {
          console.log(e)
        }
      }
    })
  }

  /**
    * Resets the call tree to its initial state, clearing all caches and data structures.
    * Initializes empty maps for scopes, scope starts, variable/function declarations, and other tracking data.
    */
  reset () {
    /*
      scopes: map of scopes defined by range in the vmtrace {firstStep, lastStep, locals}.
      Keys represent the level of deepness (scopeId)
      scopeId : <currentscope_id>.<sub_scope_id>.<sub_sub_scope_id>
    */
    this.scopes = {}
    /*
      scopeStart: represent start of a new scope. Keys are index in the vmtrace, values are scopeId
    */
    this.sourceLocationTracker.clearCache()
    this.functionCallStack = []
    this.functionDefinitionsByScope = {}
    this.scopeStarts = {}
    this.gasCostPerLine = {}
    this.variableDeclarationByFile = {}
    this.functionDefinitionByFile = {}
    this.astWalker = new AstWalker()
    this.reducedTrace = []
    this.locationAndOpcodePerVMTraceIndex = {}
    this.variables = {}
    this.symbolicStackManager.reset()
    this.mergedScope = {}
    this.fnJumpDest = {}
    this.ctorLayout = {}
    this.lastValidBlocksDefinition
  }

  /**
   * Retrieves all scope-related data structures.
   *
   * @returns {ScopesData} Object containing scopes, scopeStarts, functionDefinitionsByScope, and functionCallStack
   */
  getScopes (): ScopesData {
    return { scopes: this.scopes, scopeStarts: this.scopeStarts, functionDefinitionsByScope: this.functionDefinitionsByScope, functionCallStack: this.functionCallStack }
  }

  /**
    * Finds the scope that contains the given VM trace index.
    * If the scope's lastStep is before the given index, traverses up to parent scopes.
    *
    * @param {number} vmtraceIndex - Index in the VM trace
    * @returns {Object|null} Scope object containing firstStep, lastStep, locals, isCreation, and gasCost, or null if not found
    */
  findScope (vmtraceIndex) {
    let scopeId = this.findScopeId(vmtraceIndex)
    if (scopeId !== '' && !scopeId) return null
    let scope = this.scopes[scopeId]
    while (scope.lastStep && scope.lastStep < vmtraceIndex && scope.firstStep > 0) {
      scopeId = this.parentScope(scopeId)
      scope = this.scopes[scopeId]
    }
    return scope
  }

  /**
   * Returns the parent scope ID by removing the last sub-scope level.
   * For example, "1.2.3" becomes "1.2", and "1" becomes "".
   *
   * @param {string} scopeId - Scope identifier in dotted notation (e.g., "1.2.3")
   * @returns {string} Parent scope ID, or empty string if no parent exists
   */
  parentScope (scopeId) {
    if (scopeId.indexOf('.') === -1) return ''
    return scopeId.replace(/(\.\d+)$/, '')
  }

  /**
   * Finds the scope ID that is active at the given VM trace index.
   * Uses binary search to find the nearest scope start that is <= vmtraceIndex.
   *
   * @param {number} vmtraceIndex - Index in the VM trace
   * @returns {string|null} Scope ID string, or null if no scopes exist
   */
  findScopeId (vmtraceIndex) {
    const scopes = Object.keys(this.scopeStarts)
    if (!scopes.length) return null
    const scopeStart = util.findLowerBoundValue(vmtraceIndex, scopes)
    const scopeId = this.scopeStarts[scopeStart]
    if (this.mergedScope[scopeId]) return this.mergedScope[scopeId]
    return scopeId
  }

  /**
   * Retrieves the stack of function definitions from the root scope to the scope containing the given VM trace index.
   * Each function entry includes the function definition merged with scope details (firstStep, lastStep, locals, etc.).
   *
   * @param {number} vmtraceIndex - Index in the VM trace
   * @returns {Array<Object>} Array of function objects, ordered from innermost to outermost scope
   * @throws {Error} If recursion depth exceeds 1000 levels
   */
  retrieveFunctionsStack (vmtraceIndex) {
    const scope = this.findScope(vmtraceIndex)
    if (!scope) return []
    let scopeId = this.scopeStarts[scope.firstStep]
    const functions = []
    if (!scopeId) return functions
    let i = 0
    // eslint-disable-next-line no-constant-condition
    while (true) {
      i += 1
      if (i > 1000) throw new Error('retrieFunctionStack: recursion too deep')
      const functionDefinition = this.functionDefinitionsByScope[scopeId]
      const scopeDetail = this.scopes[scopeId]
      if (functionDefinition !== undefined) {
        functions.push({ ...functionDefinition, ...scopeDetail })
      }
      const parent = this.parentScope(scopeId)
      if (!parent) break
      else scopeId = parent
    }
    return functions
  }

  /**
   * Extracts the source location corresponding to a specific VM trace step.
   * Retrieves the contract address and compilation result, then maps the step to source code position.
   *
   * @param {number} step - VM trace step index
   * @param {string} [address] - Contract address (optional, defaults to address at current step)
   * @returns {Promise<Object>} Source location object with start, length, file, and jump properties
   * @throws {Error} If source location cannot be retrieved
   */
  async extractSourceLocation (step: number, address?: string) {
    try {
      if (!address) address = this.traceManager.getCurrentCalledAddressAt(step)
      const compilationResult = await this.solidityProxy.compilationResult(address)
      if (!compilationResult) {
        throw new Error('No compilation result available for address ' + address)
      }
      return await this.sourceLocationTracker.getSourceLocationFromVMTraceIndex(address, step, compilationResult.data.contracts)
    } catch (error) {
      throw new Error('InternalCallTree - Cannot retrieve sourcelocation for step ' + step + ' ' + error)
    }
  }

  /**
   * Extracts a valid source location for a specific VM trace step, handling invalid or out-of-range locations.
   * Falls back to previous valid location if current location is invalid.
   *
   * @param {number} step - VM trace step index
   * @param {string} [address] - Contract address (optional, defaults to address at current step)
   * @returns {Promise<Object>} Valid source location object
   * @throws {Error} If valid source location cannot be retrieved
   */
  async extractValidSourceLocation (step: number, address?: string) {
    try {
      if (!address) address = this.traceManager.getCurrentCalledAddressAt(step)
      const compilationResult = await this.solidityProxy.compilationResult(address)
      return await this.sourceLocationTracker.getValidSourceLocationFromVMTraceIndex(address, step, compilationResult.data.contracts)
    } catch (error) {
      throw new Error('InternalCallTree - Cannot retrieve valid sourcelocation for step ' + step + ' ' + error)
    }
  }

  /**
   * Retrieves a source location from the cache using VM trace index.
   * Uses the locationAndOpcodePerVMTraceIndex cache to avoid redundant lookups.
   *
   * @param {string} address - Contract address
   * @param {number} step - VM trace step index
   * @param {any} contracts - Contracts object from compilation result
   * @returns {Promise<Object>} Valid source location from cache
   */
  async getSourceLocationFromVMTraceIndexFromCache (step: number) {
    return this.locationAndOpcodePerVMTraceIndex[step]
  }

  /**
   * Retrieves a valid source location from the cache using VM trace index.
   * Uses the locationAndOpcodePerVMTraceIndex cache to avoid redundant lookups.
   *
   * @param {string} address - Contract address
   * @param {number} step - VM trace step index
   * @param {any} contracts - Contracts object from compilation result
   * @returns {Promise<Object>} Valid source location from cache
   */
  async getValidSourceLocationFromVMTraceIndexFromCache (address: string, step: number, contracts: any) {
    return await this.sourceLocationTracker.getValidSourceLocationFromVMTraceIndexFromCache(address, step, contracts, this.locationAndOpcodePerVMTraceIndex)
  }

  /**
   * Retrieves the aggregated gas cost for a specific file and line number.
   *
   * @param {number} file - File index
   * @param {number} line - Line number
   * @returns {Promise<Object>} Object containing gasCost (total gas) and indexes (array of VM trace steps)
   * @throws {Error} If gas cost data is not available for the specified file and line
   */
  async getGasCostPerLine(file: number, line: number, scopeId: string) {
    if (this.gasCostPerLine[file] && this.gasCostPerLine[file][scopeId] && this.gasCostPerLine[file][scopeId][line]) {
      return this.gasCostPerLine[file][scopeId][line]
    }
    throw new Error('Could not find gas cost per line')
  }

  /**
   * Retrieves a local variable's metadata by its AST node ID.
   *
   * @param {number} id - AST node ID of the variable
   * @returns {Object|undefined} Variable metadata object with name, type, stackIndex, and sourceLocation, or undefined if not found
   */
  getLocalVariableById (id: number) {
    return this.variables[id]
  }

  /**
   * Retrieves the symbolic stack state at a specific VM trace step.
   * The symbolic stack tracks what each stack position represents (variables, parameters, intermediate values).
   *
   * @param {number} step - VM trace step index
   * @returns {Array} Array of symbolic stack slots representing the stack state at that step
   */
  getSymbolicStackAtStep (step: number) {
    return this.symbolicStackManager.getStackAtStep(step)
  }

  /**
   * Gets all variables currently on the symbolic stack at a given step.
   *
   * @param {number} step - VM trace step index
   * @returns {Array} Array of variables with their stack positions
   */
  getVariablesOnStackAtStep (step: number) {
    return this.symbolicStackManager.getAllVariablesAtStep(step)
  }

  /**
   * Converts the flat scopes structure to a nested JSON structure.
   * Transforms scopeIds like "1", "1.1", "1.2", "1.1.1" into a hierarchical tree.
   *
   * @param {ScopeFilterMode} filterMode - Filtering mode: 'all' (no filtering), 'call' (only keep CALLs), 'nojump' (merge low-level scopes)
   * @param {string} rootScopeId - Optional scope ID to use as root. If specified, builds tree from this scope instead of actual roots
   * @returns {NestedScope[]} Array of nested scopes with children as arrays
   */
  getScopesAsNestedJSON (filterMode: ScopeFilterMode = 'all', rootScopeId?: string): NestedScope[] {
    const scopeMap = new Map<string, NestedScope>()

    // Helper function to check if a scope or its children contain external calls
    const containsExternalCall = (scopeId: string): boolean => {
      // Check all scopes to see if any are descendants and contain external calls
      for (const [checkScopeId, checkScope] of Object.entries(this.scopes)) {
        // Check if this scope is a descendant of the given scopeId
        const isDescendant = checkScopeId.startsWith(scopeId + '.') || checkScopeId === scopeId

        if (isDescendant) {
          // Check if this descendant scope is an external call
          // External calls have CALL instruction and lowLevelScope = false
          if (isCallInstruction(checkScope.opcodeInfo) && !checkScope.lowLevelScope) {
            return true
          }
        }
      }

      return false
    }

    // Create NestedScope objects for scopes, filtering based on mode and rootScopeId
    for (const [scopeId, scope] of Object.entries(this.scopes)) {
      // If rootScopeId is specified, only include that scope and its descendants
      if (rootScopeId && scopeId !== rootScopeId && !scopeId.startsWith(rootScopeId + '.')) {
        continue
      }

      // Filter scopes based on filterMode
      if (filterMode === 'call') {
        // For 'call' mode: include external CALLs OR internal functions that contain external calls
        const isExternalCall = isCallInstruction(scope.opcodeInfo) && !scope.lowLevelScope
        const hasExternalCallsInside = !isExternalCall && containsExternalCall(scopeId)

        if (!isExternalCall && !hasExternalCallsInside) {
          continue
        }
      }

      scopeMap.set(scopeId, {
        ...scope,
        scopeId,
        children: []
      })
    }

    const rootScopes: NestedScope[] = []

    // Build the tree structure
    for (const [scopeId, nestedScope] of scopeMap) {
      const parentScopeId = this.parentScope(scopeId)
      const isRootLevel = rootScopeId ? scopeId === rootScopeId : parentScopeId === ''

      if (isRootLevel) {
        // This is a root scope (either actual root or specified rootScopeId)
        rootScopes.push(nestedScope)
      } else {
        // Check if this scope should be merged with its parent
        const shouldMerge = (filterMode === 'nojump' || filterMode === 'call') &&
                           nestedScope.lowLevelScope &&
                           !isCallInstruction(nestedScope.opcodeInfo)

        if (shouldMerge) {
          // Merge this scope with its parent
          const parentScope = scopeMap.get(parentScopeId)
          if (parentScope) {
            // Merge locals
            Object.assign(parentScope.locals, nestedScope.locals)
            // Update last step if this scope's last step is later
            if (nestedScope.lastStep && (!parentScope.lastStep || nestedScope.lastStep > parentScope.lastStep)) {
              parentScope.lastStep = nestedScope.lastStep
              parentScope.lastSafeStep = nestedScope.lastSafeStep
              parentScope.lastOpcodeInfo = nestedScope.lastOpcodeInfo
            }
            // Add gas cost
            parentScope.gasCost += nestedScope.gasCost
            // Keep any revert information
            if (nestedScope.reverted) {
              parentScope.reverted = nestedScope.reverted
            }
            // Merge children into parent
            parentScope.children.push(...nestedScope.children)
            this.mergedScope[nestedScope.scopeId] = parentScope.scopeId
          }
        } else {
          // This is a child scope, add it to its parent normally
          const parentScope = scopeMap.get(parentScopeId)
          if (parentScope) {
            parentScope.children.push(nestedScope)
          }
        }
      }
    }

    // Sort root scopes and all children recursively
    const sortScopes = (scopes: NestedScope[]) => {
      scopes.sort((a, b) => {
        const aParts = a.scopeId.split('.').map(Number)
        const bParts = b.scopeId.split('.').map(Number)

        for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
          const aVal = aParts[i] || 0
          const bVal = bParts[i] || 0
          if (aVal !== bVal) return aVal - bVal
        }
        return 0
      })

      // Recursively sort children
      scopes.forEach(scope => sortScopes(scope.children))
    }

    sortScopes(rootScopes)

    return rootScopes
  }
}

/**
 * Recursively builds the call tree by analyzing the VM trace.
 * Creates scopes for function calls, internal functions, and constructors.
 * Tracks local variables, gas costs, and source locations for each step.
 *
 * @param {InternalCallTree} tree - The call tree instance being built
 * @param {number} step - Current VM trace step index
 * @param {string} scopeId - Current scope identifier in dotted notation
 * @param {boolean} isCreation - Whether this is a contract creation context
 * @param {Object} [functionDefinition] - AST function definition node if entering a function
 * @param {Object} [contractObj] - Contract object with ABI and compilation data
 * @param {Object} [sourceLocation] - Current source location {start, length, file, jump}
 * @param {Object} [validSourceLocation] - Last valid source location
 * @returns {Promise<Object>} Object with outStep (next step to process) and optional error message
 */
async function buildTree (tree: InternalCallTree, step, scopeId, isCreation, sourceLocation?, validSourceLocation?, parentScopeId?) {
  let subScope = 1
  const address = tree.traceManager.getCurrentCalledAddressAt(step)
  tree.scopes[scopeId].address = address

  let currentSourceLocation = sourceLocation || { start: -1, length: -1, file: -1, jump: '-' }
  let previousSourceLocation = currentSourceLocation
  let previousValidSourceLocation = validSourceLocation || currentSourceLocation
  let compilationResult: CompilerAbstract
  let currentAddress = ''
  let firstExecutionStep = true
  while (step < tree.traceManager.trace.length) {
    let sourceLocation
    let validSourceLocation
    let address
    let isInvalidSource = false

    try {
      address = tree.traceManager.getCurrentCalledAddressAt(step)
      sourceLocation = await tree.extractSourceLocation(step, address)

      currentSourceLocation = sourceLocation
      if (currentAddress !== address) {
        compilationResult = await tree.solidityProxy.compilationResult(address)
        currentAddress = address
        const contractName = tree.getCache && await tree.getCache(`nameof-${currentAddress}`)
        const contract = compilationResult.getContract(contractName)
        if (contract) {
          tree.sourceLocationTracker.sourceMapByAddress[currentAddress] = isCreation ? contract.object.evm.bytecode.sourceMap : contract.object.evm.deployedBytecode.sourceMap
        }
      }
      const amountOfSources = tree.sourceLocationTracker.getTotalAmountOfSources(address, compilationResult.data.contracts)
      isInvalidSource = tree.sourceLocationTracker.isInvalidSourceLocation(currentSourceLocation, amountOfSources)
      if (isInvalidSource) { // file is -1 or greater than amount of sources
        validSourceLocation = previousValidSourceLocation
      } else
        validSourceLocation = currentSourceLocation

      if (!includedSource(validSourceLocation, previousValidSourceLocation)) {
        addReducedTrace(tree, step)
      }
    } catch (e) {
      console.warn(e)
      sourceLocation = previousSourceLocation
      validSourceLocation = previousValidSourceLocation
      // return { outStep: step, error: 'InternalCallTree - Error resolving source location. ' + step + ' ' + e }
    }
    if (!sourceLocation) {
      return { outStep: step, error: 'InternalCallTree - No source Location. ' + step }
    }
    const stepDetail: StepDetail = tree.traceManager.trace[step]
    const nextStepDetail: StepDetail = tree.traceManager.trace[step + 1]
    if (stepDetail && nextStepDetail) {
      // for complicated opcodes which don't have a static gas cost:
      stepDetail.gasCost = parseInt(stepDetail.gas as string) - parseInt(nextStepDetail.gas as string)
    } else {
      stepDetail.gasCost = parseInt(stepDetail.gasCost as unknown as string)
    }

    // gas per line
    let lineColumnPos
    if (tree.offsetToLineColumnConverter && compilationResult) {
      try {
        const generatedSources = tree.sourceLocationTracker.getGeneratedSourcesFromAddress(address)
        const astSources = Object.assign({}, compilationResult.data.sources)
        const sources = Object.assign({}, compilationResult.source.sources)
        if (generatedSources) {
          for (const genSource of generatedSources) {
            astSources[genSource.name] = { id: genSource.id, ast: genSource.ast }
            sources[genSource.name] = { content: genSource.contents }
          }
        }

        lineColumnPos = await tree.offsetToLineColumnConverter.offsetToLineColumn(validSourceLocation, validSourceLocation.file, sources, astSources)
        if (!tree.gasCostPerLine[validSourceLocation.file]) tree.gasCostPerLine[validSourceLocation.file] = {}
        if (!tree.gasCostPerLine[validSourceLocation.file][scopeId]) tree.gasCostPerLine[validSourceLocation.file][scopeId] = {}
        if (!tree.gasCostPerLine[validSourceLocation.file][scopeId][lineColumnPos.start.line]) {
          tree.gasCostPerLine[validSourceLocation.file][scopeId][lineColumnPos.start.line] = {
            gasCost: 0,
            indexes: []
          }
        }
        tree.gasCostPerLine[validSourceLocation.file][scopeId][lineColumnPos.start.line].gasCost += stepDetail.gasCost
        tree.gasCostPerLine[validSourceLocation.file][scopeId][lineColumnPos.start.line].indexes.push(step)
      } catch (e) {
        console.warn(e)
      }
    }
    if (tree.locationAndOpcodePerVMTraceIndex[step]) {
      console.warn('Duplicate entry for step ', step)
    }
    tree.locationAndOpcodePerVMTraceIndex[step] = { sourceLocation, stepDetail, lineColumnPos, contractAddress: address, scopeId }
    tree.scopes[scopeId].gasCost += stepDetail.gasCost

    const isInternalTxInstrn = isCallInstruction(stepDetail)
    const isCreateInstrn = isCreateInstruction(stepDetail)

    // check if there is a function at destination - but only for AST node resolution
    const contractObj = await tree.solidityProxy.contractObjectAtAddress(address)
    const generatedSources = getGeneratedSources(tree, scopeId, contractObj)
    const { nodes, blocksDefinition, functionDefinitionInScope, contractDefinition } = await resolveNodesAtSourceLocation(tree, sourceLocation, generatedSources, address)
    if (blocksDefinition && blocksDefinition.length) tree.lastValidBlocksDefinition = blocksDefinition
    const functionisLeaf = functionDefinitionInScope && nodes && nodes.length && nodes[nodes.length - 1] && nodes[nodes.length - 1].id === functionDefinitionInScope.id

    const functionDefinition = functionDefinitionInScope

    let functionPointer
    if (functionDefinition) {
      functionPointer = currentAddress + ' ' + functionDefinition.id
    }
    // registering function definition whose src location is available when hitting JUMPDEST
    if (!tree.scopes[scopeId].functionDefinition && stepDetail.op === 'JUMPDEST' && functionDefinition && functionisLeaf && functionDefinition.kind !== 'constructor' && tree.scopes[scopeId].firstStep === step - 1) {
      tree.fnJumpDest[functionPointer] = nextStepDetail && nextStepDetail.pc
      tree.scopes[scopeId].functionDefinition = functionDefinition
      tree.scopes[scopeId].lowLevelScope = false
      await registerFunctionParameters(tree, functionDefinition, contractDefinition, step - 1, scopeId, contractObj, previousSourceLocation, address)
    }

    // if the first step of the execution leads to invalid source (generated code), we consider it a low level scope.
    if (firstExecutionStep && isInvalidSource) {
      tree.scopes[scopeId].lowLevelScope = true
    }

    // registering constructors
    const executionInFunctionBody = functionDefinition && nodes && nodes.length && nodes[nodes.length - 1].id !== functionDefinition.id
    if (executionInFunctionBody && functionDefinition && functionDefinition.kind === 'constructor' && !tree.fnJumpDest[functionPointer] && !isInvalidSource) {
      tree.fnJumpDest[functionPointer] = nextStepDetail && nextStepDetail.pc
      tree.scopes[scopeId].functionDefinition = functionDefinition
      tree.scopes[scopeId].lowLevelScope = false
      await registerFunctionParameters(tree, functionDefinition, contractDefinition, step - 1, scopeId, contractObj, previousSourceLocation, address)
    }

    // Update symbolic stack based on opcode execution
    const previousSymbolicStack = tree.symbolicStackManager.getStackAtStep(step)
    if (tree.debug && stepDetail.stack.length !== previousSymbolicStack.length) {
      console.warn('STACK SIZE MISMATCH at step ', step, ' opcode ', stepDetail.op, ' symbolic stack size ', previousSymbolicStack.length, ' actual stack size ', stepDetail.stack.length )
    }

    // if have to  use that stack to update the context after we get out of the call
    const newSymbolicStack = updateSymbolicStack(previousSymbolicStack, stepDetail.op, step)
    // if it's call with have to reset the symbolic stack
    // step + 1 because the symbolic stack represents the state AFTER the opcode execution
    const zeroTheStack = (isInternalTxInstrn || isCreateInstrn) //  && !isStaticCallInstruction(stepDetail)
    tree.symbolicStackManager.setStackAtStep(step + 1, zeroTheStack ? [] : newSymbolicStack)
    // verify that some registered variable are now present on stack
    tree.symbolicStackManager.checkRegisteredVariables(step + 1, newSymbolicStack.length)

    tree.locationAndOpcodePerVMTraceIndex[step].blocksDefinition = tree.lastValidBlocksDefinition

    const isRevert = isRevertInstruction(stepDetail)

    const internalfunctionCall = /*functionDefinition &&*/ (sourceLocation && sourceLocation.jump === 'i') /*&& functionDefinition.kind !== 'constructor'*/
    const isJumpOutOfFunction = /*functionDefinition &&*/ (sourceLocation && sourceLocation.jump === 'o') /*&& functionDefinition.kind !== 'constructor'*/

    if (stepDetail.op === 'JUMP' && functionDefinition && functionDefinition.kind !== 'constructor' && functionisLeaf && internalfunctionCall && !tree.fnJumpDest[functionPointer]) {
      // record entry point for that function
      tree.fnJumpDest[functionPointer] = nextStepDetail && nextStepDetail.pc // JUMPDEST
    }

    const currentStepIsFunctionEntryPoint = functionDefinition && nextStepDetail && nextStepDetail.pc === tree.fnJumpDest[functionPointer]
    let lowLevelScope = internalfunctionCall // by default assume it's a low level scope
    if (isInternalTxInstrn) lowLevelScope = false
    if (currentStepIsFunctionEntryPoint) lowLevelScope = false

    const origin = tree.scopes[scopeId].opcodeInfo
    const originIsCall = (isCallInstruction(origin) || isCreateInstruction(origin))

    /*
      Start a new scope when:
        - current step is a CALL, CREATE, DELEGATECALL, STATICCALL, CREATE2
        - source location is marked with "i" and is not a constructor
        - is a low level scope (JUMP marked with "i") but no high level function
    */
    if (isInternalTxInstrn || (internalfunctionCall && functionDefinition && functionDefinition.kind !== 'constructor') || lowLevelScope) {
      try {
        previousSourceLocation = null
        const newScopeId = scopeId === '' ? subScope.toString() : scopeId + '.' + subScope
        if (tree.debug) console.log('Entering new scope at step ', step, newScopeId, isInternalTxInstrn, internalfunctionCall)
        tree.scopeStarts[step] = newScopeId
        const startExecutionLine = lineColumnPos && lineColumnPos.start ? lineColumnPos.start.line + 1 : undefined
        tree.scopes[newScopeId] = { firstStep: step, locals: {}, isCreation, gasCost: 0, startExecutionLine, functionDefinition: null, opcodeInfo: stepDetail, stackBeforeJumping: newSymbolicStack, lowLevelScope: true }
        addReducedTrace(tree, step)
        // for the ctor we are at the start of its trace, we have to replay this step in order to catch all the locals:
        const nextStep = step + 1

        /*
          try to associate a solidity function when:
          - not a CALL, CREATE, DELEGATECALL, STATICCALL, CREATE2
          - entire function is selected in the source map (functionisLeaf)
          - not a low level scope.
        */
        if (!lowLevelScope && functionDefinition && internalfunctionCall && !isInternalTxInstrn && functionisLeaf) {
          /*
          Not used anymore. see line 767. keeping this code anyway for the record
          tree.scopes[newScopeId].functionDefinition = functionDefinition
          tree.scopes[newScopeId].lowLevelScope = false
          // Register function parameters when entering new function scope (internal calls or external calls)
          await registerFunctionParameters(tree, functionDefinition, contractDefinition, step, newScopeId, contractObj, sourceLocation, address)
          */
        }
        let externalCallResult
        try {
          externalCallResult = await buildTree(tree, nextStep, newScopeId, isCreateInstrn, sourceLocation, validSourceLocation, scopeId)
        } catch (e) {
          console.error(e)
          return { outStep: step, error: 'InternalCallTree - ' + e.message }
        }

        try {
          if (!tree.scopes[newScopeId].lowLevelScope) {
            tree.scopes[scopeId].lowLevelScope = false
          }
        } catch (e) {
          console.warn('unable to set scope low level property', e.message)
        }

        if (externalCallResult.error) {
          return { outStep: step, error: 'InternalCallTree - ' + externalCallResult.error }
        } else {
          step = externalCallResult.outStep
          subScope++
        }
      } catch (e) {
        console.error(e)
        return { outStep: step, error: 'InternalCallTree - ' + e.message }
      }
    } else if (callDepthChange(step, tree.traceManager.trace) || isStopInstruction(stepDetail) || isReturnInstruction(stepDetail) || isRevert || (isJumpOutOfFunction && (!tree.scopes[scopeId].functionDefinition || tree.scopes[scopeId].functionDefinition.kind !== 'constructor'))) {
      /*
        return from execution when:
          - call depth change is declared in the trace
          - current is STOP, RETURN, REVERT
          - the current scope is either:
              - a low level scope (no associated function definition)
              - has an associated function definition which isn't a constructor
      */
      const popCount = countConsecutivePopOpcodes(tree.traceManager.trace, step)
      // if not, we might be returning from a CALL or internal function. This is what is checked here.
      // For constructors in inheritance chains, we also check if stack depth has returned to entry level
      if ((isStopInstruction(stepDetail) || isReturnInstruction(stepDetail) || isRevert) && originIsCall) {
        // giving back the stack to the parent
        const stack = tree.scopes[scopeId].stackBeforeJumping
        tree.symbolicStackManager.setStackAtStep(step + 1, stack)
      }
      tree.scopes[scopeId].stackBeforeJumping = undefined
      tree.scopes[scopeId].lastStep = step
      tree.scopes[scopeId].lastSafeStep = step - popCount
      tree.scopes[scopeId].lastOpcodeInfo = stepDetail

      if (isRevert) {
        const revertLine = lineColumnPos && lineColumnPos.start ? lineColumnPos.start.line + 1 : undefined
        tree.scopes[scopeId].reverted = {
          step: stepDetail,
          line: revertLine
        }
      }

      addReducedTrace(tree, step)
      tree.scopes[scopeId].endExecutionLine = lineColumnPos && lineColumnPos.end ? lineColumnPos.end.line + 1 : undefined
      return { outStep: step + 1 }
    } else {
      if (tree.includeLocalVariables && stepDetail.op && (stepDetail.op.startsWith('PUSH') || stepDetail.op.startsWith('DUP'))) {
        try {
          await includeVariableDeclaration(tree, step, sourceLocation, scopeId, contractObj, generatedSources, address, blocksDefinition)
        } catch (e) {
          console.error('includeVariableDeclaration error at step ', step, e)
        }
      }
      previousSourceLocation = sourceLocation
      previousValidSourceLocation = validSourceLocation
      step++
    }
    if (firstExecutionStep) firstExecutionStep = false
  }
  return { outStep: step }
}
