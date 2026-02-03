'use strict'

/**
 * Helper module for tracking when variables are safe to decode.
 * Complex types (structs, arrays, mappings, etc.) may take several VM steps to initialize,
 * so we need to detect when initialization is complete before attempting to decode them.
 */

/**
 * Determines if a type can be safely decoded immediately upon declaration.
 * Simple value types (uint, int, bool, address, fixed-size bytes) are safe to decode immediately.
 * Complex types (structs, arrays, mappings, strings, dynamic bytes) need initialization tracking.
 *
 * @param {string} typeString - Type string from AST (e.g., "uint256", "struct MyStruct memory")
 * @returns {boolean} True if the type is safe to decode immediately
 */
export function isSimpleType(typeString: string): boolean {
  // Remove location qualifiers (memory, storage, calldata) and any trailing text
  const baseType = typeString.replace(/ (memory|storage|calldata).*$/g, '').trim()

  // Check for simple value types
  // uint/int (with optional size), bool, address, fixed-size bytes (bytes1-bytes32)
  const simpleTypePattern = /^(uint\d*|int\d*|bool|address|bytes([1-9]|[12]\d|3[0-2])(?!\d)|fixed\d*x\d*|ufixed\d*x\d*)$/

  return simpleTypePattern.test(baseType)
}

/**
 * Returns a complexity score for a type, used as a fallback heuristic
 * to estimate how many VM steps initialization might take.
 *
 * @param {string} typeString - Type string from AST
 * @returns {number} Estimated number of VM steps needed for initialization
 */
export function getTypeComplexityScore(typeString: string): number {
  // Mappings are just slot references, typically initialized quickly
  if (typeString.includes('mapping')) return 1

  // Dynamic arrays need length setup + potential memory allocation
  if (typeString.includes('[]')) return 5

  // Fixed-size arrays need multiple element initializations
  if (typeString.match(/\[\d+\]/)) return 3

  // Structs need multiple field initializations
  if (typeString.includes('struct')) return 4

  // Dynamic bytes and strings need length + data setup
  if (typeString.includes('string') || typeString === 'bytes' || typeString.startsWith('bytes ')) {
    // Distinguish from bytesX (fixed size)
    if (!typeString.match(/bytes\d+/)) return 3
  }

  // Default for other complex types
  return 2
}

/**
 * Finds the VM trace step at which a variable is safe to decode by detecting
 * when execution moves past the variable declaration's source code range.
 *
 * This is the most reliable method because the compiler generates all initialization
 * code within the declaration's source location range. Once execution moves to the
 * next statement, initialization is complete.
 *
 * @param {Object} tree - InternalCallTree instance
 * @param {number} declarationStep - VM trace step where variable was declared
 * @param {Object} variableDeclaration - AST node for the variable declaration
 * @param {Object} currentSourceLocation - Source location of the declaration
 * @param {string} address - Contract address
 * @returns {Promise<number>} VM trace step at which variable is safe to decode
 */
export async function findSafeStepForVariable(
  tree: any,
  declarationStep: number,
  variableDeclaration: any,
  currentSourceLocation: any,
  address: string
): Promise<number> {
  const typeString = variableDeclaration.typeDescriptions?.typeString

  if (!typeString) {
    // No type info, use declaration step as safe fallback
    return declarationStep
  }

  // Simple types are immediately safe to decode
  if (isSimpleType(typeString)) {
    return declarationStep
  }

  // For complex types, look ahead to find when we exit the declaration's source range
  const declarationEnd = currentSourceLocation.start + currentSourceLocation.length
  const maxLookAhead = 20 // Safety limit to avoid excessive processing

  try {
    for (let step = declarationStep + 1;
      step < tree.traceManager.trace.length &&
         step <= declarationStep + maxLookAhead;
      step++) {
      try {
        const nextSourceLocation = await tree.extractSourceLocation(step, address)

        // Check if we've moved past the declaration in source code
        // This happens when:
        // 1. We're in a different file
        // 2. We've moved to a source location beyond the declaration's end
        if (nextSourceLocation.file !== currentSourceLocation.file ||
            nextSourceLocation.start >= declarationEnd) {
          // Previous step was the last initialization step
          return step - 1
        }

        // Still within declaration range, keep looking
      } catch (e) {
        // Can't get source location for this step, stop looking
        break
      }
    }
  } catch (e) {
    console.log('Error in findSafeStepForVariable:', e)
  }

  // Fallback: use type-based heuristic if source location method didn't work
  const estimatedSteps = getTypeComplexityScore(typeString)
  return declarationStep + estimatedSteps
}

/**
 * Alternative method: Finds safe step by detecting when the stack value at the
 * variable's position stops changing. This is less reliable than source location
 * tracking but can be used as a fallback.
 *
 * @param {Object} tree - InternalCallTree instance
 * @param {number} declarationStep - VM trace step where variable was declared
 * @param {number} stackIndex - Stack index where variable value is stored
 * @param {number} maxLookAhead - Maximum steps to look ahead (default 10)
 * @returns {number} VM trace step at which stack value stabilized
 */
export function findSafeStepByStackStability(
  tree: any,
  declarationStep: number,
  stackIndex: number,
  maxLookAhead: number = 10
): number {
  try {
    // Get the initial stack value at the declaration step
    const initialStack = tree.traceManager.getStackAt(declarationStep)
    if (stackIndex >= initialStack.length) {
      return declarationStep // Invalid stack index
    }

    let lastChangedStep = declarationStep
    let previousValue = initialStack[stackIndex]

    for (let step = declarationStep + 1;
      step <= declarationStep + maxLookAhead &&
         step < tree.traceManager.trace.length;
      step++) {
      try {
        const currentStack = tree.traceManager.getStackAt(step)

        // Stack depth might change due to pushes/pops
        if (stackIndex >= currentStack.length) {
          continue
        }

        const currentValue = currentStack[stackIndex]
        if (currentValue !== previousValue) {
          lastChangedStep = step
          previousValue = currentValue
        }
      } catch (e) {
        // Error getting stack, stop looking
        break
      }
    }

    // Return the step after last change
    return lastChangedStep
  } catch (e) {
    console.log('Error in findSafeStepByStackStability:', e)
    return declarationStep
  }
}
