import { parseType } from '../decodeInfo'
import { nodesAtPosition } from '../../source/sourceMappingDecoder'
import { extractLocationFromAstVariable } from '../types/util'
import { findSafeStepForVariable } from './variableInitializationHelper'
import type { InternalCallTree, StepDetail } from "../internalCallTree"

/**
   * Checks if the call depth changes between consecutive steps.
   *
   * @param {number} step - Current step index
   * @param {Array} trace - The VM trace array
   * @returns {boolean} True if depth changes between current and next step
   */
export function callDepthChange (step, trace) {
  if (step + 1 < trace.length) {
    return trace[step].depth !== trace[step + 1].depth
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
export function includedSource (source, included) {
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
export function compareSource (source, included) {
  return (included.start === source.start &&
      included.length === source.length &&
      included.file === source.file &&
      included.start === source.start)
}

/**
 * Adds a VM trace index to the reduced trace.
 * The reduced trace contains only indices where the source location changes.
 *
 * @param {InternalCallTree} tree - The call tree instance
 * @param {number} index - VM trace step index to add
 */
export function addReducedTrace (tree, index) {
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
export function getGeneratedSources (tree, scopeId, contractObj) {
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
 * @param {Object} contractDefinition - AST function definition node
 * @param {number} step - VM trace step index at function entry
 * @param {string} scopeId - Scope identifier for this function
 * @param {Object} contractObj - Contract object with ABI
 * @param {Object} sourceLocation - Source location of the function
 * @param {string} address - Contract address
 */
export async function registerFunctionParameters (tree: InternalCallTree, functionDefinition, contractDefinition, step, scopeId, contractObj, sourceLocation, address) {
  if (!sourceLocation) return
  // if (sourceLocation.jump !== 'i') return
  tree.functionCallStack.push(step)
  const functionDefinitionAndInputs = { functionDefinition, inputs: []}
  // means: the previous location was a function definition && JUMPDEST
  // => we are at the beginning of the function and input/output are setup
  try {
    const stack = tree.traceManager.getStackAt(step + 1)
    const states = await tree.solidityProxy.extractStatesDefinitions(address)

    // Debug function entry before parameter binding
    if (tree.debug) {
      console.log(`[registerFunctionParameters] Function ${functionDefinition.name} at step ${step}, stack length: ${stack.length}`)
      debugVariableTracking(tree, step, scopeId, `Function ${functionDefinition.name} entry - before parameter binding`)
    }

    let stackPosOnCtor = 0
    if (functionDefinition.kind === 'constructor') {
      if (!tree.ctorLayout[functionDefinition.id]) {
        const baseContracts = await tree.solidityProxy.getLinearizedBaseContracts(address, contractDefinition.id)
        // baseContracts = baseContracts.filter((contract => contract.id !== contractDefinition.id))
        // Find constructors in inherited contracts
        for (const baseContract of baseContracts) {
          if (baseContract.nodes) {
            const constructor = baseContract.nodes.find(node =>
              node.nodeType === 'FunctionDefinition' && node.kind === 'constructor'
            )
            if (constructor && constructor.parameters && constructor.parameters.parameters.length) {
              stackPosOnCtor += constructor.parameters.parameters.length
              if (!tree.ctorLayout[constructor.id]) tree.ctorLayout[constructor.id] = stackPosOnCtor
            }
          }
        }
      }
      stackPosOnCtor = tree.ctorLayout[functionDefinition.id]
    }

    if (functionDefinition.parameters) {
      const inputs = functionDefinition.parameters
      const outputs = functionDefinition.returnParameters

      // input params - they are at the bottom of the stack at function entry
      let availableSlot = stack.length
      if (inputs && inputs.parameters && inputs.parameters.length > 0) {
        const { params, freeStackIndex } = addInputParams(step, functionDefinition, inputs, tree, scopeId, states, contractObj, sourceLocation, stack.length, stackPosOnCtor)
        if (freeStackIndex != null) availableSlot = freeStackIndex
        functionDefinitionAndInputs.inputs = params
      }

      // return params - register them but they're not yet on the stack
      if (outputs && outputs.parameters && outputs.parameters.length > 0) {
        addReturnParams(step, availableSlot, functionDefinition, outputs, tree, scopeId, states, contractObj, sourceLocation)
      }
    }

    // Debug function entry after parameter binding
    if (tree.debug) {
      debugVariableTracking(tree, step + 1, scopeId, `Function ${functionDefinition.name} entry - after parameter binding`)
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
export async function includeVariableDeclaration (tree: InternalCallTree, step, sourceLocation, scopeId, contractObj, generatedSources, address, blocksDefinition) {
  if (!contractObj) {
    console.warn('No contract object found while adding variable declarations')
    return
  }
  let states = null
  // Use enhanced variable discovery with scope filtering
  const variableDeclarations = await resolveVariableDeclaration(tree, sourceLocation, generatedSources, address)

  if (variableDeclarations && variableDeclarations.length > 0) {
    if (tree.debug) {
      console.log(`[includeVariableDeclaration] Found ${variableDeclarations.length} variable declarations at step ${step}`)
      debugVariableTracking(tree, step, scopeId, 'Before variable declaration')
    }
  }
  // using the vm trace step, the current source location and the ast,
  // we check if the current vm trace step target a new ast node of type VariableDeclaration
  // that way we know that there is a new local variable from here.
  if (variableDeclarations && variableDeclarations.length) {
    for (const variableDeclaration of variableDeclarations) {
      if (variableDeclaration) {
        try {
          // check if already processed
          if (tree.scopes[scopeId] && tree.scopes[scopeId].locals && tree.scopes[scopeId].locals[variableDeclaration.name]) continue

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
              if (tree.debug) console.log(`[includeVariableDeclaration] Return parameter ${variableDeclaration.name} now on stack at index ${stack.length}`)
            } else {
              tree.scopes[scopeId].locals[variableDeclaration.name] = newVar
              tree.variables[variableDeclaration.id] = newVar
              if (tree.debug) console.log(`[includeVariableDeclaration] Local variable ${variableDeclaration.name} declared at stack index ${stack.length}`)
            }

            addReducedTrace(tree, safeStep)

            const stackIndex = stack.length

            // Bind variable to symbolic stack with appropriate lifecycle
            const variable = isReturnParamDeclaration ? existingReturnParam : newVar
            tree.symbolicStackManager.bindVariableWithLifecycle(
              step + 1,
              variable,
              stackIndex,
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
export async function resolveVariableDeclarationEnhanced (tree, sourceLocation, generatedSources, address, scopeId) {
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
export async function resolveVariableDeclaration (tree, sourceLocation, generatedSources, address) {
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
export async function resolveFunctionDefinition (tree, sourceLocation, generatedSources, address) {
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
export function extractVariableDeclarations (ast, astWalker) {
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
export function extractFunctionDefinitions (ast, astWalker) {
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
export function addInputParams (step, functionDefinition, parameterList, tree: InternalCallTree, scopeId, states, contractObj, sourceLocation, stackLength, forceFreeSlot) {
  if (!contractObj) {
    console.warn('No contract object found while adding input params')
    return { params: [], freeStackIndex: null }
  }

  const contractName = contractObj.name
  const params = []
  const paramCount = parameterList.parameters.length
  if (tree.debug) {
    console.log(`[addInputParams] Adding ${paramCount} input parameters for function ${functionDefinition.name}`)
    console.log(`  - scopeId: ${scopeId}`)
    console.log(`  - stackLength: ${stackLength}, paramCount: ${paramCount}`)
  }

  const stackLengthAtStart = functionDefinition.kind === 'constructor' ? forceFreeSlot : stackLength
  let lastStackIndex = stackLengthAtStart
  for (let i = 0; i < paramCount; i++) {
    const param = parameterList.parameters[i]

    // Calculate stack index based on call type
    let stackIndex = stackLengthAtStart - paramCount + i
    // Ensure stack index is valid
    if (stackIndex < 0 || stackIndex >= stackLength) {
      if (tree.debug) console.warn(`[addInputParams] Invalid stack index ${stackIndex} for parameter ${param.name} (stackLength: ${stackLength}), using fallback positioning`)
      stackIndex = Math.max(0, Math.min(i, stackLength - 1))
    }

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
    // Use step + 1 because the symbolic stack represents the state AFTER the opcode execution
    tree.symbolicStackManager.bindVariableWithLifecycle(step + 1, newParam, stackIndex, 'assigned', scopeId)
    lastStackIndex = stackIndex
    if (tree.debug) console.log(`[addInputParams] Bound parameter: ${attributesName} at stack index ${stackIndex}`)
  }
  return { params, freeStackIndex: lastStackIndex + 1 }
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
export function addReturnParams (step, availableSlot, functionDefinition, parameterList, tree: InternalCallTree, scopeId, states, contractObj, sourceLocation) {
  if (!contractObj) {
    console.warn('No contract object found while adding return params')
    return
  }

  const contractName = contractObj.name
  const paramCount = parameterList.parameters.length

  if (tree.debug) console.log(`[addReturnParams] Adding ${paramCount} return parameters for function ${functionDefinition.name}`)

  for (let i = 0; i < paramCount; i++) {
    const param = parameterList.parameters[i]

    // Calculate stack index based on call type
    const stackIndex = availableSlot + i

    let location = extractLocationFromAstVariable(param)
    location = location === 'default' ? 'memory' : location
    const attributesName = param.name === '' ? `$return_${i}` : param.name

    const newReturnParam = {
      name: attributesName,
      type: parseType(param.typeDescriptions.typeString, states, contractName, location),
      stackIndex,
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

    // Bind parameter to symbolic stack with lifecycle tracking
    // Use step + 1 because the symbolic stack represents the state AFTER the opcode execution
    tree.symbolicStackManager.bindVariableWithLifecycle(step + 1, newReturnParam, stackIndex, 'assigned', scopeId)

    if (tree.debug) console.log(`[addReturnParams] Registered return parameter: ${attributesName}`)
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
export function countConsecutivePopOpcodes(trace: StepDetail[], currentStep: number): number {
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
export function getCurrentScopeId(blocksDefinition) {
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
export function isWithinScope(declaration, functionDefinition) {
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
export function validateStackConsistency(tree: InternalCallTree, step: number, scopeId: string) {
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
export function debugVariableTracking(tree: InternalCallTree, step: number, scopeId: string, context: string = '') {
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

export async function resolveNodesAtSourceLocation (tree, sourceLocation, generatedSources, address) {
  const ast = await tree.solidityProxy.ast(sourceLocation, generatedSources, address)
  let funcDef
  let contractDef
  const blocksDef = []
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
        if (node && node.nodeType === 'ContractDefinition') {
          contractDef = node
        }
      }
    }

    return { nodes, functionDefinitionInScope: funcDef, contractDefinition: contractDef, blocksDefinition: blocksDef }
  } else {
    return { nodes: [], functionDefinitionInScope: null, contractDefinition: null, blocksDefinition: []}
  }
}

