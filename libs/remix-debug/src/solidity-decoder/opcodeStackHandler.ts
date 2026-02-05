'use strict'
import { SymbolicStackSlot } from './symbolicStack'
import getOpcodes from '../code/opcodes'

/**
 * Opcode metadata including stack effects
 */
type OpcodeInfo = {
  name: string
  in: number // Number of items popped from stack
  out: number // Number of items pushed to stack
}

/**
 * Maps opcode names to their bytecode values for lookup
 */
const OPCODE_NAME_TO_BYTECODE: { [name: string]: number } = {
  'STOP': 0x00,
  'ADD': 0x01, 'MUL': 0x02, 'SUB': 0x03, 'DIV': 0x04,
  'SDIV': 0x05, 'MOD': 0x06, 'SMOD': 0x07, 'ADDMOD': 0x08, 'MULMOD': 0x09,
  'EXP': 0x0a, 'SIGNEXTEND': 0x0b,
  'LT': 0x10, 'GT': 0x11, 'SLT': 0x12, 'SGT': 0x13, 'EQ': 0x14,
  'ISZERO': 0x15, 'AND': 0x16, 'OR': 0x17, 'XOR': 0x18, 'NOT': 0x19,
  'BYTE': 0x1a, 'SHL': 0x1b, 'SHR': 0x1c, 'SAR': 0x1d, 'CLZ': 0x1e,
  'SHA3': 0x20, 'KECCAK256': 0x20,
  'ADDRESS': 0x30, 'BALANCE': 0x31, 'ORIGIN': 0x32, 'CALLER': 0x33,
  'CALLVALUE': 0x34, 'CALLDATALOAD': 0x35, 'CALLDATASIZE': 0x36, 'CALLDATACOPY': 0x37,
  'CODESIZE': 0x38, 'CODECOPY': 0x39, 'GASPRICE': 0x3a, 'EXTCODESIZE': 0x3b,
  'EXTCODECOPY': 0x3c, 'RETURNDATASIZE': 0x3d, 'RETURNDATACOPY': 0x3e, 'EXTCODEHASH': 0x3f,
  'BLOCKHASH': 0x40, 'COINBASE': 0x41, 'TIMESTAMP': 0x42, 'NUMBER': 0x43,
  'DIFFICULTY': 0x44, 'GASLIMIT': 0x45, 'CHAINID': 0x46, 'SELFBALANCE': 0x47,
  'BASEFEE': 0x48, 'BLOBHASH': 0x49, 'BLOBBASEFEE': 0x4a,
  'POP': 0x50, 'MLOAD': 0x51, 'MSTORE': 0x52, 'MSTORE8': 0x53,
  'SLOAD': 0x54, 'SSTORE': 0x55, 'JUMP': 0x56, 'JUMPI': 0x57,
  'PC': 0x58, 'MSIZE': 0x59, 'GAS': 0x5a, 'JUMPDEST': 0x5b,
  'TLOAD': 0x5c, 'TSTORE': 0x5d, 'MCOPY': 0x5e,
  'LOG0': 0xa0, 'LOG1': 0xa1, 'LOG2': 0xa2, 'LOG3': 0xa3, 'LOG4': 0xa4,
  'CREATE': 0xf0, 'CALL': 0xf1, 'CALLCODE': 0xf2, 'RETURN': 0xf3,
  'DELEGATECALL': 0xf4, 'CREATE2': 0xf5, 'STATICCALL': 0xfa,
  'REVERT': 0xfd, 'INVALID': 0xfe, 'SELFDESTRUCT': 0xff
}

/**
 * Retrieves opcode metadata (stack effects) from opcode name
 *
 * @param opcodeName - Name of the opcode (e.g., 'ADD', 'PUSH1', 'DUP1')
 * @returns Opcode information including pops and pushes
 */
export function getOpcodeInfo(opcodeName: string): OpcodeInfo {
  // Handle PUSH opcodes
  if (opcodeName.startsWith('PUSH')) {
    const num = parseInt(opcodeName.slice(4))
    if (!isNaN(num) && num >= 0 && num <= 32) {
      const info = getOpcodes(0x5f + num, false)
      return { name: info.name, in: info.in, out: info.out }
    }
  }

  // Handle DUP opcodes
  if (opcodeName.startsWith('DUP')) {
    const num = parseInt(opcodeName.slice(3))
    if (!isNaN(num) && num >= 1 && num <= 16) {
      const info = getOpcodes(0x7f + num, false)
      return { name: info.name, in: info.in, out: info.out }
    }
  }

  // Handle SWAP opcodes
  if (opcodeName.startsWith('SWAP')) {
    const num = parseInt(opcodeName.slice(4))
    if (!isNaN(num) && num >= 1 && num <= 16) {
      const info = getOpcodes(0x8f + num, false)
      return { name: info.name, in: info.in, out: info.out }
    }
  }

  // Look up standard opcodes
  const bytecode = OPCODE_NAME_TO_BYTECODE[opcodeName]
  if (bytecode !== undefined) {
    const info = getOpcodes(bytecode, false)
    return { name: info.name, in: info.in, out: info.out }
  }

  // Unknown opcode
  console.warn(`Unknown opcode: ${opcodeName}`)
  return { name: 'UNKNOWN', in: 0, out: 0 }
}

/**
 * Handles DUP operations (DUP1-DUP16)
 * DUPn duplicates the nth stack item from the top
 *
 * Note: DUP creates a copy/reference, not a duplicate variable declaration.
 * Only the original slot should maintain variable identity.
 *
 * @param stack - Current symbolic stack
 * @param opcode - DUP opcode name (e.g., 'DUP1')
 * @param step - Current VM trace step
 * @returns Updated symbolic stack
 */
function handleDup(
  stack: SymbolicStackSlot[],
  opcode: string,
  step: number
): SymbolicStackSlot[] {
  const newStack = [...stack]
  const dupDepth = parseInt(opcode.slice(3))

  if (newStack.length >= dupDepth) {
    const sourceIdx = newStack.length - dupDepth
    const dupSlot = newStack[sourceIdx]

    // Create a reference to the duplicated value, not a duplicate variable declaration
    // This prevents having the same variable appear at multiple stack positions
    const duplicatedSlot: SymbolicStackSlot = {
      kind: 'intermediate', // Mark as intermediate, not as a variable declaration
      derivedFrom: [sourceIdx],
      originStep: step,
      originOp: opcode
    }

    // If the source was a variable, add a reference note but don't copy variable identity
    // This preserves the connection for debugging without creating duplicate declarations
    if (dupSlot.kind === 'variable' || dupSlot.kind === 'parameter') {
      duplicatedSlot.referencesVariable = {
        variableId: dupSlot.variableId,
        variableName: dupSlot.variableName,
        variableType: dupSlot.variableType,
        sourceStackIndex: sourceIdx
      }
    }

    newStack.push(duplicatedSlot)
  } else {
    // Stack underflow - should not happen in valid bytecode
    console.warn(`${opcode} at step ${step} but stack only has ${newStack.length} items`)
    newStack.push({
      kind: 'unknown',
      originStep: step,
      originOp: opcode
    })
  }

  return newStack
}

/**
 * Handles SWAP operations (SWAP1-SWAP16)
 * SWAPn swaps the top stack item with the (n+1)th stack item
 *
 * Special handling for variable declarations: when swapping, we need to preserve
 * the variable binding semantics, not just swap the positions blindly.
 *
 * @param stack - Current symbolic stack
 * @param opcode - SWAP opcode name (e.g., 'SWAP1')
 * @param step - Current VM trace step
 * @returns Updated symbolic stack
 */
function handleSwap(
  stack: SymbolicStackSlot[],
  opcode: string,
  step: number,
): SymbolicStackSlot[] {
  const newStack = [...stack]
  const swapDepth = parseInt(opcode.slice(4))

  if (newStack.length > swapDepth) {
    const top = newStack.length - 1
    const swapIdx = top - swapDepth

    const topSlot = newStack[top]
    const swapSlot = newStack[swapIdx]

    // Check if either slot is a variable declaration that needs special handling
    const isVariableDeclarationPattern =
      (topSlot.kind === 'variable' || topSlot.kind === 'parameter') ||
      (swapSlot.kind === 'variable' || swapSlot.kind === 'parameter')

    if (isVariableDeclarationPattern) {
      // For variable declarations, we need to be more careful about swapping
      // In the PUSH0, PUSH1, SWAP, POP pattern:
      // - PUSH0 creates the variable slot reference
      // - PUSH1 pushes the value
      // - SWAP1 should logically move the value to where the variable slot is
      // - POP removes the temporary value position

      // Instead of blind swapping, preserve the variable declaration in its logical position
      if (topSlot.kind === 'intermediate' && (swapSlot.kind === 'variable' || swapSlot.kind === 'parameter')) {
        // Top is a value, swap position is a variable - this is likely the PUSH0, PUSH1, SWAP pattern
        // The value should be associated with the variable, not just swapped
        newStack[swapIdx] = {
          ...swapSlot, // Keep variable metadata
          // Mark that this variable now has a value associated with it
          derivedFrom: [top], // The value came from the top of the stack
          originStep: step,
          originOp: opcode
        }

        // The top position gets a reference to the original variable slot
        newStack[top] = {
          kind: 'intermediate',
          originStep: step,
          originOp: opcode,
          referencesVariable: swapSlot.kind === 'variable' || swapSlot.kind === 'parameter' ? {
            variableId: swapSlot.variableId,
            variableName: swapSlot.variableName,
            variableType: swapSlot.variableType,
            sourceStackIndex: swapIdx
          } : undefined
        }
      } else if ((topSlot.kind === 'variable' || topSlot.kind === 'parameter') && swapSlot.kind === 'intermediate') {
        // Variable is on top, value is below - reverse case
        newStack[top] = {
          ...topSlot, // Keep variable metadata
          derivedFrom: [swapIdx],
          originStep: step,
          originOp: opcode
        }

        newStack[swapIdx] = {
          kind: 'intermediate',
          originStep: step,
          originOp: opcode,
          referencesVariable: {
            variableId: topSlot.variableId,
            variableName: topSlot.variableName,
            variableType: topSlot.variableType,
            sourceStackIndex: top
          }
        }
      } else {
        // Both are variables or parameters - simple swap
        const temp = newStack[top]
        newStack[top] = newStack[swapIdx]
        newStack[swapIdx] = temp
      }
    } else {
      // No variables involved - simple swap
      const temp = newStack[top]
      newStack[top] = newStack[swapIdx]
      newStack[swapIdx] = temp
    }
  } else {
    console.warn(`${opcode} at step ${step} but stack only has ${newStack.length} items`)
  }

  return newStack
}

/**
 * Handles MLOAD operation specially to preserve memory address information
 * MLOAD pops a memory address and pushes the loaded value, but we need to preserve
 * the connection between the address and the loaded value for variable tracking
 *
 * @param stack - Current symbolic stack
 * @param step - Current VM trace step
 * @returns Updated symbolic stack
 */
function handleMLoad(
  stack: SymbolicStackSlot[],
  step: number
): SymbolicStackSlot[] {
  const newStack = [...stack]

  if (newStack.length > 0) {
    const addressSlot = newStack[newStack.length - 1]
    newStack.pop()

    // Push the loaded value, preserving information about what memory address it came from
    const loadedSlot: SymbolicStackSlot = {
      kind: addressSlot.kind === 'variable' || addressSlot.kind === 'parameter'
        ? addressSlot.kind
        : 'intermediate',
      originStep: step,
      originOp: 'MLOAD',
      derivedFrom: [newStack.length] // The popped address was at this index
    }

    // If the address slot was tracking a variable, preserve that information
    if (addressSlot.variableId) {
      loadedSlot.variableId = addressSlot.variableId
      loadedSlot.variableName = addressSlot.variableName
      loadedSlot.variableType = addressSlot.variableType
      loadedSlot.isParameter = addressSlot.isParameter
    }

    newStack.push(loadedSlot)
  } else {
    console.warn(`MLOAD at step ${step} but stack is empty`)
    newStack.push({
      kind: 'unknown',
      originStep: step,
      originOp: 'MLOAD'
    })
  }

  return newStack
}

/**
 * Handles POP operation with special awareness of variable declarations
 * POP should not remove actual variable declarations, only temporary values
 *
 * @param stack - Current symbolic stack
 * @param step - Current VM trace step
 * @returns Updated symbolic stack
 */
function handlePop(
  stack: SymbolicStackSlot[],
  step: number
): SymbolicStackSlot[] {
  const newStack = [...stack]

  if (newStack.length > 0) {
    const topSlot = newStack[newStack.length - 1]

    // Check if we're about to pop a variable declaration
    if (topSlot.kind === 'variable' || topSlot.kind === 'parameter') {
      // This should not happen in normal code generation, but if it does,
      // we should preserve the variable information somehow
      console.warn(`POP at step ${step} is removing a variable declaration: ${topSlot.variableName}`)

      // If this is a reference to a variable (created by SWAP), it's safe to remove
      if (topSlot.referencesVariable && topSlot.originOp?.startsWith('SWAP')) {
        newStack.pop()
      } else {
        // This is an actual variable declaration being removed - very unusual
        // Remove it but log for debugging
        console.warn(`Removing actual variable declaration ${topSlot.variableName} at step ${step}`)
        newStack.pop()
      }
    } else {
      // Normal case - removing intermediate value or reference
      newStack.pop()
    }
  } else {
    console.warn(`POP at step ${step} but stack is empty`)
  }

  return newStack
}

/**
 * Applies generic stack effects for most opcodes
 * Pops the specified number of items and pushes new ones
 *
 * @param stack - Current symbolic stack
 * @param pops - Number of items to pop from stack
 * @param pushes - Number of items to push to stack
 * @param opcode - Opcode name
 * @param step - Current VM trace step
 * @returns Updated symbolic stack
 */
function applyStackEffect(
  stack: SymbolicStackSlot[],
  pops: number,
  pushes: number,
  opcode: string,
  step: number
): SymbolicStackSlot[] {
  const newStack = [...stack]

  // Special handling for POP opcode
  if (opcode === 'POP' && pops === 1 && pushes === 0) {
    return handlePop(newStack, step)
  }

  // Collect indices of popped values for derivation tracking
  const poppedIndices: number[] = []
  for (let i = 0; i < pops; i++) {
    if (newStack.length > 0) {
      poppedIndices.push(newStack.length - 1)
      newStack.pop()
    } else {
      console.warn(`Stack underflow at step ${step} for opcode ${opcode}`)
    }
  }

  // Push new values
  for (let i = 0; i < pushes; i++) {
    const newSlot: SymbolicStackSlot = {
      kind: 'intermediate',
      originStep: step,
      originOp: opcode
    }

    // Track which stack positions this value was derived from
    if (pops > 0 && poppedIndices.length > 0) {
      newSlot.derivedFrom = poppedIndices
    }

    newStack.push(newSlot)
  }

  return newStack
}

/**
 * Updates the symbolic stack based on an opcode execution
 * Main entry point for stack manipulation
 *
 * @param previousStack - Symbolic stack state before this step
 * @param opcode - Opcode being executed
 * @param step - Current VM trace step index
 * @returns Updated symbolic stack after opcode execution
 */
export function updateSymbolicStack(
  previousStack: SymbolicStackSlot[],
  opcode: string,
  step: number
): SymbolicStackSlot[] {
  // Special handling for stack manipulation opcodes
  if (opcode.startsWith('DUP')) {
    return handleDup(previousStack, opcode, step)
  }

  if (opcode.startsWith('SWAP')) {
    return handleSwap(previousStack, opcode, step)
  }

  // Special handling for MLOAD to preserve memory address information
  if (opcode === 'MLOAD') {
    return handleMLoad(previousStack, step)
  }

  // For all other opcodes, use generic stack effect handling
  const opcodeInfo = getOpcodeInfo(opcode)

  return applyStackEffect(
    previousStack,
    opcodeInfo.in,
    opcodeInfo.out,
    opcode,
    step
  )
}
