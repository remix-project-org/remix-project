'use strict'
import { helpers, util } from '@remix-project/remix-lib'
const { toHexPaddedString } = util
const { ui } = helpers

// vmTraceIndex has to point to a CALL, CODECALL, ...
export function resolveCalledAddress (vmTraceIndex, trace) {
  const step = trace[vmTraceIndex]
  if (isCreateInstruction(step)) {
    return contractCreationToken(vmTraceIndex)
  } else if (isCallInstruction(step)) {
    const stack = step.stack // callcode, delegatecall, ...
    return ui.normalizeHexAddress(toHexPaddedString(stack[stack.length - 2]))
  }
  return undefined
}

export function isCallInstruction (step) {
  return ['CALL', 'STATICCALL', 'CALLCODE', 'CREATE', 'DELEGATECALL', 'CREATE2'].includes(step.op)
}

export function isStaticCallInstruction (step) {
  return ['STATICCALL'].includes(step.op)
}

export function isCreateInstruction (step) {
  return step.op === 'CREATE' || step.op === 'CREATE2'
}

export function isReturnInstruction (step) {
  return step.op === 'RETURN'
}

export function isJumpDestInstruction (step) {
  return step.op === 'JUMPDEST'
}

export function isStopInstruction (step) {
  return step.op === 'STOP'
}

export function isRevertInstruction (step) {
  return step.op === 'REVERT'
}

export function isSSTOREInstruction (step) {
  return step.op === 'SSTORE'
}

export function isSHA3Instruction (step) {
  return step.op === 'SHA3' || step.op === 'KECCAK256'
}

export function newContextStorage (step) {
  return step.op === 'CREATE' || step.op === 'CALL' || step.op === 'CREATE2'
}

export function isCallToPrecompiledContract (index, trace) {
  // if stack empty => this is not a precompiled contract
  const step = trace[index]
  if (isCallInstruction(step)) {
    return index + 1 < trace.length && trace[index + 1].stack.length !== 0
  }
  return false
}

export function contractCreationToken (index) {
  return '(Contract Creation - Step ' + index + ')'
}

export function isContractCreation (address) {
  return address.indexOf('(Contract Creation - Step') !== -1
}
