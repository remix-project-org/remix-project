/**
 * EXAMPLE: How to use the Symbolic Stack feature
 *
 * This file demonstrates how to use the symbolic stack functionality
 * that has been integrated into InternalCallTree.
 */

/*
 * Basic Usage Example
 * ===================
 *
 * The symbolic stack tracks what each EVM stack position represents
 * throughout execution. This is useful for:
 *
 * 1. Understanding which variables are on the stack at any given step
 * 2. Tracking how values are derived from variables through operations
 * 3. Debugging complex stack manipulations
 * 4. Building better debugging UIs
 */

// Example 1: Getting the symbolic stack at a specific step
// ----------------------------------------------------------
function exampleGetSymbolicStack(internalCallTree: any, vmTraceStep: number) {
  // Get the symbolic stack state at this step
  const symbolicStack = internalCallTree.getSymbolicStackAtStep(vmTraceStep)

  console.log(`Symbolic Stack at step ${vmTraceStep}:`)
  symbolicStack.forEach((slot: any, index: number) => {
    console.log(`  [${index}] ${slot.kind}:`, {
      name: slot.variableName || 'N/A',
      type: slot.variableType?.typeName || 'N/A',
      originOp: slot.originOp,
      isParameter: slot.isParameter
    })
  })

  return symbolicStack
}

// Example 2: Finding all variables on the stack
// -----------------------------------------------
function exampleGetVariablesOnStack(internalCallTree: any, vmTraceStep: number) {
  const variablesOnStack = internalCallTree.getVariablesOnStackAtStep(vmTraceStep)

  console.log(`Variables on stack at step ${vmTraceStep}:`)
  variablesOnStack.forEach(({ slot, position }: any) => {
    console.log(`  Position ${position}: ${slot.variableName} (${slot.isParameter ? 'parameter' : 'local variable'})`)
  })

  return variablesOnStack
}

// Example 3: Tracing a variable through execution
// ------------------------------------------------
function exampleTraceVariable(internalCallTree: any, variableName: string, startStep: number, endStep: number) {
  console.log(`Tracing variable "${variableName}" from step ${startStep} to ${endStep}:`)

  for (let step = startStep; step <= endStep; step++) {
    const variablesOnStack = internalCallTree.getVariablesOnStackAtStep(step)
    const foundVar = variablesOnStack.find((v: any) => v.slot.variableName === variableName)

    if (foundVar) {
      const opcode = internalCallTree.locationAndOpcodePerVMTraceIndex[step]?.stepDetail?.op
      console.log(`  Step ${step} (${opcode}): ${variableName} at position ${foundVar.position}`)
    }
  }
}

// Example 4: Detecting when a variable goes out of scope
// --------------------------------------------------------
function exampleFindVariableLifetime(internalCallTree: any, variableName: string, scopeId: string) {
  const scope = internalCallTree.scopes[scopeId]
  if (!scope) {
    console.log(`Scope ${scopeId} not found`)
    return null
  }

  let firstSeen = null
  let lastSeen = null

  for (let step = scope.firstStep; step <= scope.lastStep; step++) {
    const variablesOnStack = internalCallTree.getVariablesOnStackAtStep(step)
    const foundVar = variablesOnStack.find((v: any) => v.slot.variableName === variableName)

    if (foundVar) {
      if (firstSeen === null) firstSeen = step
      lastSeen = step
    }
  }

  console.log(`Variable "${variableName}" lifetime:`)
  console.log(`  First seen: step ${firstSeen}`)
  console.log(`  Last seen: step ${lastSeen}`)
  console.log(`  Lifetime: ${lastSeen - firstSeen + 1} steps`)

  return { firstSeen, lastSeen, lifetime: lastSeen - firstSeen + 1 }
}

// Example 5: Understanding value derivation
// ------------------------------------------
function exampleTraceValueDerivation(internalCallTree: any, vmTraceStep: number, stackPosition: number) {
  const symbolicStack = internalCallTree.getSymbolicStackAtStep(vmTraceStep)

  if (stackPosition >= symbolicStack.length) {
    console.log(`Stack position ${stackPosition} out of bounds`)
    return null
  }

  const slot = symbolicStack[stackPosition]

  console.log(`Value at position ${stackPosition} (step ${vmTraceStep}):`)
  console.log(`  Kind: ${slot.kind}`)
  console.log(`  Origin: step ${slot.originStep}, opcode ${slot.originOp}`)

  if (slot.variableName) {
    console.log(`  Variable: ${slot.variableName}`)
  }

  if (slot.derivedFrom && slot.derivedFrom.length > 0) {
    console.log(`  Derived from stack positions: ${slot.derivedFrom.join(', ')}`)

    // Recursively trace derivation
    console.log(`  Tracing derivation chain:`)
    traceDerivedFromChain(internalCallTree, slot.originStep - 1, slot.derivedFrom, 1)
  }

  return slot
}

function traceDerivedFromChain(internalCallTree: any, step: number, positions: number[], depth: number) {
  if (depth > 5) {
    console.log(`    ${'  '.repeat(depth)}... (chain too deep)`)
    return
  }

  const symbolicStack = internalCallTree.getSymbolicStackAtStep(step)

  positions.forEach((pos: number) => {
    if (pos < symbolicStack.length) {
      const slot = symbolicStack[pos]
      const indent = '  '.repeat(depth)

      if (slot.variableName) {
        console.log(`    ${indent}└─ ${slot.variableName} (${slot.kind})`)
      } else {
        console.log(`    ${indent}└─ ${slot.kind} from ${slot.originOp} at step ${slot.originStep}`)

        if (slot.derivedFrom && slot.derivedFrom.length > 0) {
          traceDerivedFromChain(internalCallTree, slot.originStep - 1, slot.derivedFrom, depth + 1)
        }
      }
    }
  })
}

/*
 * Real-World Usage in Debugger UI
 * ================================
 *
 * In the Remix debugger UI, you could use this to:
 *
 * 1. Show variable names next to stack values in the stack viewer
 * 2. Highlight which stack positions correspond to the current function's variables
 * 3. Show a "variable lifetime" visualization
 * 4. Display derivation chains when hovering over stack values
 * 5. Warn users when they're about to step out of a variable's scope
 */

// Example 6: Enhanced stack viewer data
// --------------------------------------
function exampleEnhancedStackViewer(internalCallTree: any, vmTraceStep: number) {
  const symbolicStack = internalCallTree.getSymbolicStackAtStep(vmTraceStep)
  const actualStack = internalCallTree.traceManager.getStackAt(vmTraceStep)

  const enhancedStack = actualStack.map((value: any, index: number) => {
    const symbolicSlot = symbolicStack[index]

    return {
      position: index,
      value: value,
      variableName: symbolicSlot?.variableName || null,
      variableType: symbolicSlot?.variableType?.typeName || null,
      kind: symbolicSlot?.kind || 'unknown',
      isParameter: symbolicSlot?.isParameter || false,
      derivedFrom: symbolicSlot?.derivedFrom || []
    }
  })

  console.log('Enhanced Stack View:')
  enhancedStack.reverse().forEach((item: any, displayIndex: number) => {
    const actualIndex = enhancedStack.length - 1 - displayIndex
    const label = item.variableName
      ? `${item.variableName} (${item.variableType})`
      : `<${item.kind}>`

    console.log(`  [${actualIndex}] ${item.value} ${label}`)
  })

  return enhancedStack
}

export {
  exampleGetSymbolicStack,
  exampleGetVariablesOnStack,
  exampleTraceVariable,
  exampleFindVariableLifetime,
  exampleTraceValueDerivation,
  exampleEnhancedStackViewer
}
