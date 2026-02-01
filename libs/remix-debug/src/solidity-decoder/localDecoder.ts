'use strict'

export async function solidityLocals (vmtraceIndex, internalTreeCall, stack, memory, storageResolver, calldata, currentSourceLocation, cursor) {
  const scope = internalTreeCall.findScope(vmtraceIndex)
  if (!scope) {
    const error = { message: 'Can\'t display locals. reason: compilation result might not have been provided' }
    throw error
  }
  if (scope.firstStep === vmtraceIndex) return {}
  const locals = {}
  memory = formatMemory(memory)
  let anonymousIncr = 1
  for (const local in scope.locals) {
    const variable = scope.locals[local]

    // Check if the variable is safe to decode at this VM trace index
    // For complex types (structs, arrays, etc.), we need to wait until initialization is complete
    const isSafeToDecode = !variable.safeToDecodeAtStep || vmtraceIndex >= variable.safeToDecodeAtStep

    // Get the current stack position from symbolic stack
    // This tracks where the variable actually is after DUP, SWAP, etc.
    const currentStackIndex = findVariableStackPosition(internalTreeCall, vmtraceIndex, variable)

    if (isSafeToDecode) {
      let name = variable.name
      if (name.indexOf('$') !== -1) {
        name = '<' + anonymousIncr + '>'
        anonymousIncr++
      }
      try {
        locals[name] = await variable.type.decodeFromStack(currentStackIndex, stack, memory, storageResolver, calldata, cursor, variable)
      } catch (e) {
        console.log(e)
        locals[name] = { error: '<decoding failed - ' + e.message + '>', type: variable && variable.type && variable.type.typeName || 'unknown' }
      }
    }
  }
  return locals
}

/**
 * Finds the current stack position of a variable at a given VM trace step.
 * Uses the symbolic stack to track where variables have moved due to stack operations.
 *
 * @param internalTreeCall - InternalCallTree instance
 * @param vmtraceIndex - Current VM trace step
 * @param variable - Variable metadata
 * @returns Current stack depth (position) of the variable
 */
export function findVariableStackPosition(internalTreeCall: any, vmtraceIndex: number, variable: any) {
  // Try to find the variable in the symbolic stack
  const variablesOnStack = internalTreeCall.getVariablesOnStackAtStep(vmtraceIndex)

  // Look for our variable by ID (most reliable) or by name
  const foundVar = variablesOnStack.find((v: any) =>
    (variable.id && v.slot.variableId === variable.id) ||
    (v.slot.variableName === variable.name)
  )

  if (foundVar) {
    return foundVar.position
  }

  console.warn(`Variable ${variable.name} (ID: ${variable.id}) not found in symbolic stack at step ${vmtraceIndex}. Falling back to original stackIndex.`);
  // Fallback to original stackIndex if not found in symbolic stack
  // This handles cases where symbolic stack might not be fully populated
  return variable.stackIndex
}

function formatMemory (memory: any) {
  if (memory instanceof Array) {
    memory = memory.join('').replace(/0x/g, '')
  }
  return memory
}
