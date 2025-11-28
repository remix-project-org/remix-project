'use strict'
import { AstWalker } from '@remix-project/remix-astwalker'
import { nodesAtPosition } from '../source/sourceMappingDecoder'
import { SourceLocationTracker } from '../source/sourceLocationTracker'
import { EventManager } from '../eventManager'

export type StepDetail = {
  depth: number,
  gas: number | string,
  gasCost: number,
  memory: number[],
  op: string,
  pc: number,
  stack: number[],
}

export type Scope = {
  firstStep: number,
  gasCost: number,
  isCreation: boolean,
  lastStep: number,
  locals: Array<any>
}

/**
 * Tree representing internal jump into function.
 * Triggers `callTreeReady` event when tree is ready
 * Triggers `callTreeBuildFailed` event when tree fails to build
 * This use:
 *  - compilationResult.data.contracts['contracts/1_Storage.sol'].Storage.evm.deployedBytecode.functionDebugData
 *  - AST scope id
 */
export class InternalCallTree {
  includeLocalVariables
  debugWithGeneratedSources
  event
  solidityProxy
  traceManager
  sourceLocationTracker
  scopes
  scopeStarts
  functionCallStack
  functionDefinitionsByScope
  variableDeclarationByFile
  functionDefinitionByFile
  astWalker
  reducedTrace
  locationAndOpcodePerVMTraceIndex: {
    [Key: number]: any
  }
  gasCostPerLine
  offsetToLineColumnConverter
  pendingConstructorExecutionAt: number
  pendingConstructorId: number
  pendingConstructor
  constructorsStartExecution
  variables: {
    [Key: number]: any
  }

  scopesMapping: {
    [Key: number]: any
  }

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
    this.includeLocalVariables = opts.includeLocalVariables
    this.debugWithGeneratedSources = opts.debugWithGeneratedSources
    this.event = new EventManager()
    this.solidityProxy = solidityProxy
    this.traceManager = traceManager
    this.offsetToLineColumnConverter = offsetToLineColumnConverter
    this.sourceLocationTracker = new SourceLocationTracker(codeManager, { debugWithGeneratedSources: opts.debugWithGeneratedSources })
    debuggerEvent.register('newTraceLoaded', async (trace) => {})
  }

  /**
    * reset tree
    *
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
    this.pendingConstructor = null
    this.variables = {}

    this.scopesMapping = {}
  }

  /**
    * find the scope given @arg vmTraceIndex
    *
    * @param {Int} vmtraceIndex  - index on the vm trace
    */
  async findScope (vmtraceIndex): Promise<Scope> {
    const address = this.traceManager.getCurrentCalledAddressAt(vmtraceIndex)
    const sourceLocation = await this.extractSourceLocation(vmtraceIndex, address)
    const contractObj = await this.solidityProxy.contractObjectAtAddress(address)
    // this doesn't yet handle generated sources
    // const variables = await resolveVariableDeclaration(this, sourceLocation, null, address)
    const ast = await this.solidityProxy.ast(sourceLocation, null, address)
    const nodes = nodesAtPosition(null, sourceLocation, ast)
    const node = nodes[nodes.length - 1]
    const nodesForScope = getAllItemByScope(this, ast, this.astWalker, node.scope)
    const locals = getVariableDeclarationForScope(nodesForScope)
    return {
      firstStep: 0,
      isCreation: false,
      gasCost: 0,
      lastStep: 0,
      locals
    }
  }

  async extractSourceLocation (step: number, address?: string) {
    try {
      if (!address) address = this.traceManager.getCurrentCalledAddressAt(step)
      const compilationResult = await this.solidityProxy.compilationResult(address)
      return await this.sourceLocationTracker.getSourceLocationFromVMTraceIndex(address, step, compilationResult.data.contracts)
    } catch (error) {
      throw new Error('InternalCallTree - Cannot retrieve sourcelocation for step ' + step + ' ' + error)
    }
  }

  async extractValidSourceLocation (step: number, address?: string) {
    try {
      if (!address) address = this.traceManager.getCurrentCalledAddressAt(step)
      const compilationResult = await this.solidityProxy.compilationResult(address)
      return await this.sourceLocationTracker.getValidSourceLocationFromVMTraceIndex(address, step, compilationResult.data.contracts)
    } catch (error) {
      throw new Error('InternalCallTree - Cannot retrieve valid sourcelocation for step ' + step + ' ' + error)
    }
  }

  async getValidSourceLocationFromVMTraceIndexFromCache (address: string, step: number, contracts: any) {
    return await this.sourceLocationTracker.getValidSourceLocationFromVMTraceIndexFromCache(address, step, contracts, this.locationAndOpcodePerVMTraceIndex)
  }

  async getGasCostPerLine(file: number, line: number) {
    if (this.gasCostPerLine[file] && this.gasCostPerLine[file][line]) {
      return this.gasCostPerLine[file][line]
    }
    throw new Error('Could not find gas cost per line')
  }

  getLocalVariableById (id: number) {
    return this.variables[id]
  }  
}

function getGeneratedSources (tree, scopeId, contractObj) {
  if (tree.debugWithGeneratedSources && contractObj && tree.scopes[scopeId]) {
    return tree.scopes[scopeId].isCreation ? contractObj.contract.evm.bytecode.generatedSources : contractObj.contract.evm.deployedBytecode.generatedSources
  }
  return null
}

// this extract all the variable declaration for a given ast and file
// and keep this in a cache
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

function getAllItemByScope (tree, ast, astWalker, scope) {
  const ret = {}
  astWalker.walkFull(ast, (node) => {
    if (!tree.scopeMapping[node.scope]) tree.scopeMapping[node.scope] = []
    tree.scopesMapping[node.scope].push(node)
    
  })
  return ret
}

function getVariableDeclarationForScope (nodes) {
  const ret = []
  nodes.filter((node) => {
    if (node.nodeType === 'VariableDeclaration' || node.nodeType === 'YulVariableDeclaration') {
      ret.push(node)
    }
    const hasChild = node.initialValue && (node.nodeType === 'VariableDeclarationStatement' || node.nodeType === 'YulVariableDeclarationStatement')
    if (hasChild) ret.push(node.declarations)
  })
  return ret 
}
