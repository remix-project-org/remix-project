'use strict'
import { AstWalker } from '@remix-project/remix-astwalker'
import { util } from '@remix-project/remix-lib'
import { SourceLocationTracker } from '../source/sourceLocationTracker'
import { EventManager } from '../eventManager'
import { parseType } from './decodeInfo'
import { isContractCreation, isCallInstruction, isCreateInstruction, isJumpDestInstruction, isRevertInstruction, isStopInstruction, isReturnInstruction } from '../trace/traceHelper'
import { extractLocationFromAstVariable } from './types/util'
import { findSafeStepForVariable } from './variableInitializationHelper'
import { SymbolicStackManager, SymbolicStackSlot } from './symbolicStack'
import { updateSymbolicStack } from './opcodeStackHandler'
import { nodesAtPosition } from '../source/sourceMappingDecoder'

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
  solidityProxy
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
  /** VM trace index where pending constructor execution is expected to start */
  pendingConstructorExecutionAt: number
  /** AST node ID of the pending constructor */
  pendingConstructorId: number
  /** Pending constructor function definition waiting for execution */
  pendingConstructor
  /** Pending constructor entry stack index */
  pendingConstructorEntryStackIndex
  /** Map tracking which constructors have started execution and at what source location offset */
  constructorsStartExecution
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
    this.debug = false
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
    this.pendingConstructorExecutionAt = -1
    this.pendingConstructorId = -1
    this.constructorsStartExecution = {}
    this.pendingConstructorEntryStackIndex = -1
    this.pendingConstructor = null
    this.variables = {}
    this.symbolicStackManager.reset()
    this.mergedScope = {}
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
    console.log(this.scopes)
    let scopeId = this.findScopeId(vmtraceIndex)
    if (scopeId !== '' && !scopeId) return null
    let scope = this.scopes[scopeId]
    while (scope.lastStep && scope.lastStep < vmtraceIndex && scope.firstStep > 0) {
      scopeId = this.parentScope(scopeId)
      scope = this.scopes[scopeId]
    }
    console.log(scope)
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
    console.log(this.gasCostPerLine)
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
   * @param {boolean} mergeLowLevelScope - If true, merges low-level scopes with their parent (except for call instructions)
   * @returns {NestedScope[]} Array of nested scopes with children as arrays
   */
  getScopesAsNestedJSON (mergeLowLevelScope: boolean = false): NestedScope[] {
    const scopeMap = new Map<string, NestedScope>()
    
    // Create NestedScope objects for all scopes
    for (const [scopeId, scope] of Object.entries(this.scopes)) {
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
      if (parentScopeId === '') {
        // This is a root scope
        rootScopes.push(nestedScope)
      } else {
        // Check if this scope should be merged with its parent
        const shouldMerge = mergeLowLevelScope && 
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
async function buildTree (tree: InternalCallTree, step, scopeId, isCreation, functionDefinition?, contractObj?, sourceLocation?, validSourceLocation?, parentScopeId?, isConstructor?) {
  let subScope = 1
  const address = tree.traceManager.getCurrentCalledAddressAt(step)
  tree.scopes[scopeId].address = address
  if (functionDefinition) {    
    await registerFunctionParameters(tree, functionDefinition, step, scopeId, contractObj, validSourceLocation, address)
  }

  /**
   * Checks if the call depth changes between consecutive steps.
   *
   * @param {number} step - Current step index
   * @param {Array} trace - The VM trace array
   * @returns {boolean} True if depth changes between current and next step
   */
  function callDepthChange (step, trace) {
    if (step + 1 < trace.length) {
      return trace[step].depth !== trace[step + 1].depth
    }
    return false
  }

  /**
   * Checks if we're exiting a constructor based on stack depth.
   * For constructors (especially in inheritance), the stack depth returning to entry level
   * indicates the end of that constructor's execution.
   *
   * @param {InternalCallTree} tree - The call tree instance
   * @param {string} scopeId - Current scope identifier
   * @param {number} initialEntrystackIndex - Stack depth at constructor entry
   * @param {StepDetail} stepDetail - Current step details with stack info
   * @returns {boolean} True if exiting a constructor scope
   */
  function isConstructorExit (tree, scopeId, initialEntrystackIndex, stepDetail, isConstructor) {
    if (!isConstructor) return false // we are not in a constructor anyway
    const scope = tree.scopes[scopeId]
    if (scope.firstStep === step) {
      // we are just entering the constructor
      return false
    }
    if (!scope || !scope.functionDefinition || scope.functionDefinition.kind !== 'constructor') {
      return false
    }
    // Check if stack has returned to entry depth (or below, in case of cleanup)
    if (initialEntrystackIndex !== undefined && stepDetail.stack.length <= initialEntrystackIndex) {
      console.log('Exiting constructor scope ', scopeId, ' at step ', step)
      return true
    }
    return false
  }

  /**
   * Checks if one source location is completely included within another.
   *
   * @param {Object} source - Outer source location to check against
   * @param {Object} included - Inner source location to check
   * @returns {boolean} True if included is completely within source
   */
  function includedSource (source, included) {
    return (included.start !== -1 &&
      included.length !== -1 &&
      included.file !== -1 &&
      included.start >= source.start &&
      included.start + included.length <= source.start + source.length &&
      included.file === source.file)
  }

  /**
   * Compare 2 source locations
   *
   * @param {Object} source - Outer source location to check against
   * @param {Object} included - Inner source location to check
   * @returns {boolean} True if included is completely within source
   */
  function compareSource (source, included) {
    return (included.start === source.start &&
      included.length === source.length &&
      included.file === source.file &&
      included.start === source.start)
  }

  let currentSourceLocation = sourceLocation || { start: -1, length: -1, file: -1, jump: '-' }
  let previousSourceLocation = currentSourceLocation
  let previousValidSourceLocation = validSourceLocation || currentSourceLocation
  let compilationResult
  let currentAddress = ''
  while (step < tree.traceManager.trace.length) {
    let sourceLocation
    let validSourceLocation
    let address

    try {
      address = tree.traceManager.getCurrentCalledAddressAt(step)
      sourceLocation = await tree.extractSourceLocation(step, address)
      
      currentSourceLocation = sourceLocation
      if (currentAddress !== address) {
        compilationResult = await tree.solidityProxy.compilationResult(address)
        currentAddress = address
      }
      const amountOfSources = tree.sourceLocationTracker.getTotalAmountOfSources(address, compilationResult.data.contracts)
      if (tree.sourceLocationTracker.isInvalidSourceLocation(currentSourceLocation, amountOfSources)) { // file is -1 or greater than amount of sources
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
    if (tree.offsetToLineColumnConverter) {
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

    // Update symbolic stack based on opcode execution
    const previousSymbolicStack = tree.symbolicStackManager.getStackAtStep(step)
    if (stepDetail.stack.length !== previousSymbolicStack.length) {
      console.warn('STACK SIZE MISMATCH at step ', step, ' opcode ', stepDetail.op, ' symbolic stack size ', previousSymbolicStack.length, ' actual stack size ', stepDetail.stack.length )
    }

    // if have to  use that stack to update the context after we get out of the call
    const newSymbolicStack = updateSymbolicStack(previousSymbolicStack, stepDetail.op, step)
    // if it's call with have to reset the symbolic stack
    // step + 1 because the symbolic stack represents the state AFTER the opcode execution
    tree.symbolicStackManager.setStackAtStep(step + 1, isInternalTxInstrn || isCreateInstrn ? [] : newSymbolicStack)
        
    
    // check if there is a function at destination
    const contractObj = await tree.solidityProxy.contractObjectAtAddress(address)
    const generatedSources = getGeneratedSources(tree, scopeId, contractObj)
    const { nodes, blocksDefinition } = await resolveNodesAtSourceLocation(tree, sourceLocation, generatedSources, address)
    tree.locationAndOpcodePerVMTraceIndex[step].blocksDefinition = blocksDefinition
    functionDefinition = await resolveFunctionDefinition(tree, sourceLocation, generatedSources, address)
    if (functionDefinition && !tree.scopes[scopeId].functionDefinition) {
      tree.scopes[scopeId].functionDefinition = functionDefinition
      tree.scopes[scopeId].lowLevelScope = false
      await registerFunctionParameters(tree, functionDefinition, step, scopeId, contractObj, validSourceLocation, address)
    }

    const isRevert = isRevertInstruction(stepDetail)
    const constructorExecutionStarts = tree.pendingConstructorExecutionAt > -1 && tree.pendingConstructorExecutionAt < validSourceLocation.start
    if (functionDefinition && functionDefinition.kind === 'constructor' && tree.pendingConstructorExecutionAt === -1 && !tree.constructorsStartExecution[functionDefinition.id]) {
      tree.pendingConstructorExecutionAt = validSourceLocation.start
      tree.pendingConstructorId = functionDefinition.id
      tree.pendingConstructor = functionDefinition
      tree.pendingConstructorEntryStackIndex = stepDetail.stack.length
      // from now on we'll be waiting for a change in the source location which will mark the beginning of the constructor execution.
      // constructorsStartExecution allows to keep track on which constructor has already been executed.
      console.log('Pending constructor execution at ', tree.pendingConstructorExecutionAt, ' for constructor id ', tree.pendingConstructorId)
    }
    const internalfunctionCall = /*functionDefinition &&*/ (sourceLocation && sourceLocation.jump === 'i') /*&& functionDefinition.kind !== 'constructor'*/
    const isJumpOutOfFunction = /*functionDefinition &&*/ (sourceLocation && sourceLocation.jump === 'o') /*&& functionDefinition.kind !== 'constructor'*/

    if (constructorExecutionStarts || isInternalTxInstrn || internalfunctionCall) {
      try {
        previousSourceLocation = null
        const newScopeId = scopeId === '' ? subScope.toString() : scopeId + '.' + subScope
        console.log('Entering new scope at step ', step, newScopeId, constructorExecutionStarts, isInternalTxInstrn, internalfunctionCall)
        tree.scopeStarts[step] = newScopeId
        const startExecutionLine = lineColumnPos && lineColumnPos.start ? lineColumnPos.start.line + 1 : undefined
        tree.scopes[newScopeId] = { firstStep: step, locals: {}, isCreation, gasCost: 0, startExecutionLine, functionDefinition, opcodeInfo: stepDetail, stackBeforeJumping: newSymbolicStack, lowLevelScope: true }
        addReducedTrace(tree, step)
        // for the ctor we are at the start of its trace, we have to replay this step in order to catch all the locals:
        const nextStep = constructorExecutionStarts ? step : step + 1
        let isConstructor = false
        if (constructorExecutionStarts) {
          isConstructor = true
          tree.constructorsStartExecution[tree.pendingConstructorId] = tree.pendingConstructorExecutionAt
          tree.pendingConstructorExecutionAt = -1
          tree.pendingConstructorId = -1
          await registerFunctionParameters(tree, tree.pendingConstructor, step, newScopeId, contractObj, previousValidSourceLocation, address)
          tree.pendingConstructor = null
        }
        let externalCallResult
        try {
          externalCallResult = await buildTree(tree, nextStep, newScopeId, isCreateInstrn, functionDefinition, contractObj, sourceLocation, validSourceLocation, scopeId, isConstructor)
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
    } else if (callDepthChange(step, tree.traceManager.trace) || isStopInstruction(stepDetail) || isReturnInstruction(stepDetail) || isJumpOutOfFunction || isRevert || isConstructorExit(tree, scopeId, tree.pendingConstructorEntryStackIndex, stepDetail, isConstructor)) {
      console.log('Exiting scope ', scopeId, 'at step ', step, callDepthChange(step, tree.traceManager.trace), isJumpOutOfFunction, isRevert, isConstructorExit(tree, scopeId, tree.pendingConstructorEntryStackIndex, stepDetail, isConstructor))
      
      // Count consecutive POP opcodes before getting out of scope
      const popCount = countConsecutivePopOpcodes(tree.traceManager.trace, step)
      console.log('POP count before exiting scope:', popCount)
      
      const origin = tree.scopes[scopeId].opcodeInfo
      // if not, we might be returning from a CALL or internal function. This is what is checked here.
      // For constructors in inheritance chains, we also check if stack depth has returned to entry level
      if ((isStopInstruction(stepDetail)) || isReturnInstruction(stepDetail) && (isCallInstruction(origin) || isCreateInstruction(origin))) {
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
      // if not, we are in the current scope.
      // We check in `includeVariableDeclaration` if there is a new local variable in scope for this specific `step`
      if (tree.includeLocalVariables) {
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
  }
  return { outStep: step }
}

/**
 * Adds a VM trace index to the reduced trace.
 * The reduced trace contains only indices where the source location changes.
 *
 * @param {InternalCallTree} tree - The call tree instance
 * @param {number} index - VM trace step index to add
 */
function addReducedTrace (tree, index) {
  if (tree.reducedTrace.includes(index)) return
  // Find the correct position to insert the index to maintain sorted order
  let insertPos = 0
  while (insertPos < tree.reducedTrace.length && tree.reducedTrace[insertPos] < index) {
    insertPos++
  }
  tree.reducedTrace.splice(insertPos, 0, index)
}

/**
 * Retrieves compiler-generated sources (e.g., Yul IR) for a given scope if debugging with generated sources is enabled.
 *
 * @param {InternalCallTree} tree - The call tree instance
 * @param {string} scopeId - Scope identifier
 * @param {Object} contractObj - Contract object containing bytecode and deployment data
 * @returns {Array|null} Array of generated source objects, or null if not available
 */
function getGeneratedSources (tree, scopeId, contractObj) {
  if (tree.debugWithGeneratedSources && contractObj && tree.scopes[scopeId]) {
    return tree.scopes[scopeId].isCreation ? contractObj.contract.evm.bytecode.generatedSources : contractObj.contract.evm.deployedBytecode.generatedSources
  }
  return null
}

/**
 * Registers function parameters and return parameters in the scope's locals.
 * Extracts parameter types from the function definition and maps them to stack positions.
 *
 * @param {InternalCallTree} tree - The call tree instance
 * @param {Object} functionDefinition - AST function definition node
 * @param {number} step - VM trace step index at function entry
 * @param {string} scopeId - Scope identifier for this function
 * @param {Object} contractObj - Contract object with ABI
 * @param {Object} sourceLocation - Source location of the function
 * @param {string} address - Contract address
 */
async function registerFunctionParameters (tree, functionDefinition, step, scopeId, contractObj, sourceLocation, address) {
  tree.functionCallStack.push(step)
  const functionDefinitionAndInputs = { functionDefinition, inputs: []}
  // means: the previous location was a function definition && JUMPDEST
  // => we are at the beginning of the function and input/output are setup
  try {
    const stack = tree.traceManager.getStackAt(step)
    const states = await tree.solidityProxy.extractStatesDefinitions(address)
    
    console.log(`[registerFunctionParameters] Function ${functionDefinition.name} at step ${step}, stack length: ${stack.length}`)
    
    // Debug function entry
    if (tree.debug) {
      debugVariableTracking(tree, step, scopeId, `Function ${functionDefinition.name} entry`)
    }
    
    if (functionDefinition.parameters) {
      const inputs = functionDefinition.parameters
      const outputs = functionDefinition.returnParameters
      
      // input params - they are at the bottom of the stack at function entry
      if (inputs && inputs.parameters && inputs.parameters.length > 0) {
        functionDefinitionAndInputs.inputs = addInputParams(step, functionDefinition, inputs, tree, scopeId, states, contractObj, sourceLocation, stack.length)
      }
      
      // return params - register them but they're not yet on the stack
      if (outputs && outputs.parameters && outputs.parameters.length > 0) {
        addReturnParams(step, functionDefinition, outputs, tree, scopeId, states, contractObj, sourceLocation)
      }
    }
  } catch (error) {
    console.error('Error in registerFunctionParameters:', error)
  }

  tree.functionDefinitionsByScope[scopeId] = functionDefinitionAndInputs
}

/**
 * Includes variable declarations in the current scope if a new local variable is encountered at this step.
 * Checks the AST for variable declarations at the current source location and adds them to scope locals.
 *
 * @param {InternalCallTree} tree - The call tree instance
 * @param {number} step - Current VM trace step index
 * @param {Object} sourceLocation - Current source location
 * @param {string} scopeId - Current scope identifier
 * @param {Object} contractObj - Contract object with name and ABI
 * @param {Array} generatedSources - Compiler-generated sources
 * @param {string} address - Contract address
 */
async function includeVariableDeclaration (tree: InternalCallTree, step, sourceLocation, scopeId, contractObj, generatedSources, address, blocksDefinition) {
  if (!contractObj) {
    console.warn('No contract object found while adding variable declarations')
    return
  }
  let states = null
  // Use enhanced variable discovery with scope filtering
  const variableDeclarations = await resolveVariableDeclarationEnhanced(tree, sourceLocation, generatedSources, address, scopeId)
  
  if (variableDeclarations && variableDeclarations.length > 0) {
    console.log(`[includeVariableDeclaration] Found ${variableDeclarations.length} variable declarations at step ${step}`)
    debugVariableTracking(tree, step, scopeId, 'Before variable declaration')
  }
  // using the vm trace step, the current source location and the ast,
  // we check if the current vm trace step target a new ast node of type VariableDeclaration
  // that way we know that there is a new local variable from here.
  if (variableDeclarations && variableDeclarations.length) {
    for (const variableDeclaration of variableDeclarations) {
      if (variableDeclaration) {
        try {
          const stack = tree.traceManager.getStackAt(step)
          // the stack length at this point is where the value of the new local variable will be stored.
          // so, either this is the direct value, or the offset in memory. That depends on the type.
          if (variableDeclaration.name !== '') {
            // Check if this is actually a return parameter being declared
            const existingReturnParam = tree.variables[variableDeclaration.id]
            const isReturnParamDeclaration = existingReturnParam && existingReturnParam.isReturnParameter
            
            states = await tree.solidityProxy.extractStatesDefinitions(address)
            let location = extractLocationFromAstVariable(variableDeclaration)
            location = location === 'default' ? 'storage' : location

            // Determine when the variable is safe to decode
            // For complex types (structs, arrays, etc.), this may be several steps after declaration
            const safeStep = await findSafeStepForVariable(
              tree,
              step,
              variableDeclaration,
              sourceLocation,
              address
            )

            // we push the new local variable in our tree
            const newVar = {
              name: variableDeclaration.name,
              type: parseType(variableDeclaration.typeDescriptions.typeString, states, contractObj.name, location),
              stackIndex: stack.length,
              sourceLocation: sourceLocation,
              declarationStep: step,
              safeToDecodeAtStep: safeStep,
              id: variableDeclaration.id,
              isParameter: false,
              isReturnParameter: isReturnParamDeclaration,
              scope: getCurrentScopeId(blocksDefinition)
            }
            
            // Update existing return parameter with stack information
            if (isReturnParamDeclaration) {
              existingReturnParam.stackIndex = stack.length
              existingReturnParam.safeToDecodeAtStep = safeStep
              existingReturnParam.declarationStep = step
              tree.scopes[scopeId].locals[variableDeclaration.name] = existingReturnParam
              console.log(`[includeVariableDeclaration] Return parameter ${variableDeclaration.name} now on stack at index ${stack.length}`)
            } else {
              tree.scopes[scopeId].locals[variableDeclaration.name] = newVar
              tree.variables[variableDeclaration.id] = newVar
              console.log(`[includeVariableDeclaration] Local variable ${variableDeclaration.name} declared at stack index ${stack.length}`)
            }

            addReducedTrace(tree, safeStep)

            // Bind variable to symbolic stack with appropriate lifecycle
            const variable = isReturnParamDeclaration ? existingReturnParam : newVar
            tree.symbolicStackManager.bindVariableWithLifecycle(
              step + 1, 
              variable, 
              stack.length, 
              isReturnParamDeclaration ? 'assigned' : 'declared',
              scopeId
            )
            
            // Debug the variable tracking after binding
            if (tree.debug) {
              debugVariableTracking(tree, step + 1, scopeId, `After binding ${variable.name}`)
              validateStackConsistency(tree, step + 1, scopeId)
            }
          }
        } catch (error) {
          console.error('Error in includeVariableDeclaration:', error)
        }
      }
    }
  }
}

/**
 * Enhanced variable declaration resolution with better AST analysis and scope filtering.
 * Returns the variable declaration(s) matching the given source location and current scope.
 *
 * @param {InternalCallTree} tree - The call tree instance
 * @param {Object} sourceLocation - Source location to resolve
 * @param {Array} generatedSources - Compiler-generated sources
 * @param {string} address - Contract address
 * @param {string} scopeId - Current scope identifier
 * @returns {Promise<Array|null>} Array of variable declaration nodes, or null if AST is unavailable
 */
async function resolveVariableDeclarationEnhanced (tree, sourceLocation, generatedSources, address, scopeId) {
  if (!tree.variableDeclarationByFile[sourceLocation.file]) {
    const ast = await tree.solidityProxy.ast(sourceLocation, generatedSources, address)
    if (ast) {
      tree.variableDeclarationByFile[sourceLocation.file] = extractVariableDeclarations(ast, tree.astWalker)
    } else {
      return null
    }
  }
  
  const declarations = tree.variableDeclarationByFile[sourceLocation.file][sourceLocation.start + ':' + sourceLocation.length + ':' + sourceLocation.file]
  
  if (!declarations) {
    return null
  }
  
  // Filter declarations that are actually in the current scope
  const currentScope = tree.scopes[scopeId]
  if (currentScope && currentScope.functionDefinition) {
    return declarations.filter(decl => isWithinScope(decl, currentScope.functionDefinition))
  }
  
  return declarations
}

/**
 * Legacy function for backward compatibility
 */
async function resolveVariableDeclaration (tree, sourceLocation, generatedSources, address) {
  if (!tree.variableDeclarationByFile[sourceLocation.file]) {
    const ast = await tree.solidityProxy.ast(sourceLocation, generatedSources, address)
    if (ast) {
      tree.variableDeclarationByFile[sourceLocation.file] = extractVariableDeclarations(ast, tree.astWalker)
    } else {
      return null
    }
  }
  return tree.variableDeclarationByFile[sourceLocation.file][sourceLocation.start + ':' + sourceLocation.length + ':' + sourceLocation.file]
}

/**
 * Extracts all function definitions for a given AST and file, caching the results.
 * Returns the function definition matching the given source location.
 *
 * @param {InternalCallTree} tree - The call tree instance
 * @param {Object} sourceLocation - Source location to resolve
 * @param {Array} generatedSources - Compiler-generated sources
 * @param {string} address - Contract address
 * @returns {Promise<Object|null>} Function definition node, or null if AST is unavailable
 */
async function resolveFunctionDefinition (tree, sourceLocation, generatedSources, address) {
  if (!tree.functionDefinitionByFile[sourceLocation.file]) {
    const ast = await tree.solidityProxy.ast(sourceLocation, generatedSources, address)
    if (ast) {
      tree.functionDefinitionByFile[sourceLocation.file] = extractFunctionDefinitions(ast, tree.astWalker)
    } else {
      return null
    }
  }
  return tree.functionDefinitionByFile[sourceLocation.file][sourceLocation.start + ':' + sourceLocation.length + ':' + sourceLocation.file]
}

/**
 * Walks the AST and extracts all variable declarations, indexing them by source location.
 * Handles both Solidity and Yul variable declarations.
 *
 * @param {Object} ast - Abstract Syntax Tree to walk
 * @param {AstWalker} astWalker - AST walker instance
 * @returns {Object} Map of source locations to variable declaration nodes
 */
function extractVariableDeclarations (ast, astWalker) {
  const ret = {}
  astWalker.walkFull(ast, (node) => {
    if (node.nodeType === 'VariableDeclaration' || node.nodeType === 'YulVariableDeclaration') {
      ret[node.src] = [node]
    }
    const hasChild = node.initialValue && (node.nodeType === 'VariableDeclarationStatement' || node.nodeType === 'YulVariableDeclarationStatement')
    if (hasChild) ret[node.initialValue.src] = node.declarations
  })
  return ret
}

/**
 * Walks the AST and extracts all function definitions, indexing them by source location.
 * Handles both Solidity and Yul function definitions.
 *
 * @param {Object} ast - Abstract Syntax Tree to walk
 * @param {AstWalker} astWalker - AST walker instance
 * @returns {Object} Map of source locations to function definition nodes
 */
function extractFunctionDefinitions (ast, astWalker) {
  const ret = {}
  astWalker.walkFull(ast, (node) => {
    if (node.nodeType === 'FunctionDefinition' || node.nodeType === 'YulFunctionDefinition') {
      ret[node.src] = node
    }
  })
  return ret
}

/**
 * Adds function input parameters to the scope's locals.
 * Input parameters are at the bottom of the stack when entering a function.
 *
 * @param {number} step - current step
 * @param {Object} functionDefinition - FunctionDefinition
 * @param {Object} parameterList - Input parameter list from function AST node
 * @param {InternalCallTree} tree - The call tree instance
 * @param {string} scopeId - Current scope identifier
 * @param {Object} states - State variable definitions
 * @param {Object} contractObj - Contract object with name and ABI
 * @param {Object} sourceLocation - Source location of the parameter
 * @param {number} stackLength - Current stack depth at function entry
 * @returns {Array<string>} Array of parameter names added to the scope
 */
function addInputParams (step, functionDefinition, parameterList, tree: InternalCallTree, scopeId, states, contractObj, sourceLocation, stackLength) {
  if (!contractObj) {
    console.warn('No contract object found while adding input params')
    return []
  }
  
  const contractName = contractObj.name
  const params = []
  const paramCount = parameterList.parameters.length
  
  console.log(`[addInputParams] Adding ${paramCount} input parameters for function ${functionDefinition.name}`)
  
  for (let i = 0; i < paramCount; i++) {
    const param = parameterList.parameters[i]
    // Input parameters are at the bottom of the stack: stackLength - paramCount + i
    const stackIndex = stackLength - paramCount + i
    
    let location = extractLocationFromAstVariable(param)
    location = location === 'default' ? 'memory' : location
    const attributesName = param.name === '' ? `$input_${i}` : param.name
    
    const newParam = {
      name: attributesName,
      type: parseType(param.typeDescriptions.typeString, states, contractName, location),
      stackIndex: stackIndex,
      sourceLocation: sourceLocation,
      abi: contractObj.contract.abi,
      isParameter: true,
      isReturnParameter: false,
      declarationStep: step,
      safeToDecodeAtStep: step,
      scope: functionDefinition.body?.id,
      id: param.id
    }
    
    tree.scopes[scopeId].locals[attributesName] = newParam
    params.push(attributesName)
    if (!tree.variables[param.id]) tree.variables[param.id] = newParam

    // Bind parameter to symbolic stack with lifecycle tracking
    tree.symbolicStackManager.bindVariableWithLifecycle(step, newParam, stackIndex, 'assigned', scopeId)
    
    console.log(`[addInputParams] Added input parameter: ${attributesName} at stack index ${stackIndex}`)
  }
  
  return params
}

/**
 * Adds function return parameters to the scope's locals.
 * Return parameters are declared but not initially on the stack.
 *
 * @param {number} step - current step
 * @param {Object} functionDefinition - FunctionDefinition
 * @param {Object} parameterList - Return parameter list from function AST node
 * @param {InternalCallTree} tree - The call tree instance
 * @param {string} scopeId - Current scope identifier
 * @param {Object} states - State variable definitions
 * @param {Object} contractObj - Contract object with name and ABI
 * @param {Object} sourceLocation - Source location of the parameter
 */
function addReturnParams (step, functionDefinition, parameterList, tree: InternalCallTree, scopeId, states, contractObj, sourceLocation) {
  if (!contractObj) {
    console.warn('No contract object found while adding return params')
    return
  }
  
  const contractName = contractObj.name
  const paramCount = parameterList.parameters.length
  
  console.log(`[addReturnParams] Adding ${paramCount} return parameters for function ${functionDefinition.name}`)
  
  for (let i = 0; i < paramCount; i++) {
    const param = parameterList.parameters[i]
    
    let location = extractLocationFromAstVariable(param)
    location = location === 'default' ? 'memory' : location
    const attributesName = param.name === '' ? `$return_${i}` : param.name
    
    const newReturnParam = {
      name: attributesName,
      type: parseType(param.typeDescriptions.typeString, states, contractName, location),
      stackIndex: -1, // Not yet on stack
      sourceLocation: sourceLocation,
      abi: contractObj.contract.abi,
      isParameter: false,
      isReturnParameter: true,
      declarationStep: step,
      safeToDecodeAtStep: -1, // Will be set when actually assigned
      scope: functionDefinition.body?.id,
      id: param.id
    }
    
    // Don't add to locals yet - will be added when actually declared in the function body
    if (!tree.variables[param.id]) tree.variables[param.id] = newReturnParam
    
    console.log(`[addReturnParams] Registered return parameter: ${attributesName} (not yet on stack)`)
  }
}

/**
 * Counts the number of consecutive POP opcodes that occur just before the current step.
 * If the previous opcode isn't a POP, the count is 0. Otherwise, counts backwards until
 * a non-POP opcode is found.
 *
 * @param {Array} trace - The VM execution trace
 * @param {number} currentStep - Current step index
 * @returns {number} Number of consecutive POP opcodes before current step
 */
function countConsecutivePopOpcodes(trace: StepDetail[], currentStep: number): number {
  let popCount = 0
  let stepIndex = currentStep - 1
  
  // Count backwards from the current step
  while (stepIndex >= 0) {
    const step = trace[stepIndex]
    if (step && step.op === 'POP') {
      popCount++
      stepIndex--
    } else {
      break
    }
  }
  
  return popCount
}

/**
 * Gets the current scope ID from blocks definition hierarchy.
 * Finds the innermost scope that can contain variables.
 *
 * @param {Array} blocksDefinition - Array of block/function definition nodes
 * @returns {number|undefined} Scope ID of the innermost block or function
 */
function getCurrentScopeId(blocksDefinition) {
  if (!blocksDefinition || blocksDefinition.length === 0) {
    return undefined
  }
  
  // Find the innermost scope that can contain variables
  // Prefer Block nodes over FunctionDefinition nodes for local scope
  const blockNode = blocksDefinition.find(block => 
    block.nodeType === 'Block'
  )
  
  if (blockNode) {
    return blockNode.id
  }
  
  // Fallback to function definition
  const functionNode = blocksDefinition.find(block => 
    block.nodeType === 'FunctionDefinition' || 
    block.nodeType === 'YulFunctionDefinition'
  )
  
  return functionNode ? functionNode.id : blocksDefinition[blocksDefinition.length - 1].id
}

/**
 * Checks if a variable declaration is within the current function/block scope.
 *
 * @param {Object} declaration - Variable declaration AST node
 * @param {Object} functionDefinition - Current function definition
 * @returns {boolean} True if declaration is within the scope
 */
function isWithinScope(declaration, functionDefinition) {
  if (!declaration || !functionDefinition) {
    return true // Default to including if we can't determine scope
  }
  
  // Simple check: if the declaration's source location is within the function's source location
  const declStart = parseInt(declaration.src.split(':')[0])
  const declLength = parseInt(declaration.src.split(':')[1])
  const funcStart = parseInt(functionDefinition.src.split(':')[0])
  const funcLength = parseInt(functionDefinition.src.split(':')[1])
  
  return declStart >= funcStart && (declStart + declLength) <= (funcStart + funcLength)
}

/**
 * Validates stack consistency for debugging purposes.
 * Checks if the symbolic stack matches the actual EVM stack.
 *
 * @param {InternalCallTree} tree - The call tree instance
 * @param {number} step - Current VM trace step
 * @param {string} scopeId - Current scope identifier
 */
function validateStackConsistency(tree: InternalCallTree, step: number, scopeId: string) {
  try {
    const actualStack = tree.traceManager.getStackAt(step)
    const symbolicStack = tree.symbolicStackManager.getStackAtStep(step)
    
    if (actualStack.length !== symbolicStack.length) {
      console.warn(`[validateStackConsistency] Stack size mismatch at step ${step}: actual=${actualStack.length}, symbolic=${symbolicStack.length}`)
    }
    
    const variables = tree.symbolicStackManager.getAllVariablesAtStep(step)
    console.log(`[validateStackConsistency] Step ${step}, Scope ${scopeId}: Stack size ${actualStack.length}, Variables on stack: ${variables.length}`)
    
    variables.forEach(({ slot, position }) => {
      if (position >= actualStack.length) {
        console.error(`[validateStackConsistency] Variable ${slot.variableName} at position ${position} exceeds actual stack size ${actualStack.length}`)
      }
    })
  } catch (error) {
    console.error(`[validateStackConsistency] Error at step ${step}:`, error)
  }
}

/**
 * Comprehensive debugging function for variable and parameter tracking.
 *
 * @param {InternalCallTree} tree - The call tree instance
 * @param {number} step - Current VM trace step
 * @param {string} scopeId - Current scope identifier
 * @param {string} context - Context description for logging
 */
function debugVariableTracking(tree: InternalCallTree, step: number, scopeId: string, context: string = '') {
  try {
    const scope = tree.scopes[scopeId]
    const actualStack = tree.traceManager.getStackAt(step)
    const symbolicStack = tree.symbolicStackManager.getStackAtStep(step)
    const stepDetail = tree.traceManager.trace[step]
    
    console.log(`\n=== DEBUG VARIABLE TRACKING [${context}] ===`)
    console.log(`Step: ${step}, Opcode: ${stepDetail?.op}, ScopeId: ${scopeId}`)
    console.log(`Actual stack size: ${actualStack.length}`)
    console.log(`Symbolic stack size: ${symbolicStack.length}`)
    
    if (scope) {
      const localVarNames = Object.keys(scope.locals)
      console.log(`Local variables in scope: [${localVarNames.join(', ')}]`)
      
      localVarNames.forEach(varName => {
        const variable = scope.locals[varName]
        console.log(`  - ${varName}: stackIndex=${variable.stackIndex}, isParam=${variable.isParameter}, isReturn=${variable.isReturnParameter}`)
      })
      
      if (scope.functionDefinition) {
        console.log(`Function: ${scope.functionDefinition.name}`)
        if (scope.functionDefinition.parameters?.parameters) {
          console.log(`  Input params: ${scope.functionDefinition.parameters.parameters.length}`)
        }
        if (scope.functionDefinition.returnParameters?.parameters) {
          console.log(`  Return params: ${scope.functionDefinition.returnParameters.parameters.length}`)
        }
      }
    }
    
    const variables = tree.symbolicStackManager.getAllVariablesAtStep(step)
    console.log(`Variables on symbolic stack: ${variables.length}`)
    variables.forEach(({ slot, position }) => {
      console.log(`  [${position}] ${slot.variableName} (${slot.kind}, lifecycle: ${slot.lifecycle})`)
    })
    
    console.log('=== END DEBUG ===\n')
  } catch (error) {
    console.error(`[debugVariableTracking] Error at step ${step}:`, error)
  }
}

async function resolveNodesAtSourceLocation (tree, sourceLocation, generatedSources, address) {
  const ast = await tree.solidityProxy.ast(sourceLocation, generatedSources, address)
  let funcDef
  let blocksDef = []
  if (ast) {
    const nodes = nodesAtPosition(null, sourceLocation.start, { ast })
    
    // Loop from the end of the array to search for FunctionDefinition or YulFunctionDefinition
    if (nodes && nodes.length > 0) {
      for (let i = nodes.length - 1; i >= 0; i--) {
        const node = nodes[i]
        if (node &&
            (node.nodeType === 'FunctionDefinition' ||
            node.nodeType === 'YulFunctionDefinition') ||
            node.nodeType === 'Block') {
          funcDef = node
          blocksDef.push(node)
        }
      }
    }
    
    return { nodes, functionDefinition: funcDef, blocksDefinition: blocksDef }
  } else {
    return { nodes: [], functionDefinition: null, blocksDefinition: []}
  }
}
