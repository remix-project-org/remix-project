'use strict'
import { util } from '@remix-project/remix-lib'
const { toHexPaddedString } = util
// eslint-disable-next-line camelcase
const { sha3_256 } = util

export class TraceCache {
  returnValues
  stopIndexes
  outofgasIndexes
  currentCall
  callsTree
  callsData
  contractCreation
  steps
  addresses
  callDataChanges
  memoryChanges
  storageChanges
  sstore
  formattedMemory

  constructor () {
    this.init()
  }

  init () {
    // ...Changes contains index in the vmtrace of the corresponding changes

    this.returnValues = {}
    this.stopIndexes = []
    this.outofgasIndexes = []
    this.currentCall = null
    this.callsTree = null
    this.callsData = {}
    this.contractCreation = {}
    this.steps = {}
    this.addresses = []
    this.callDataChanges = []
    this.memoryChanges = []
    this.formattedMemory = {}
    this.storageChanges = []
    this.sstore = {} // all sstore occurrences in the trace
  }

  getAll () {
    return {
      returnValues: this.returnValues,
      stopIndexes: this.stopIndexes,
      outofgasIndexes: this.outofgasIndexes,
      callsTree: this.callsTree,
      callsData: this.callsData,
      contractCreation: this.contractCreation,
      // steps: this.steps,
      addresses: this.addresses,
      callDataChanges: this.callDataChanges,
      memoryChanges: this.memoryChanges,
      storageChanges: this.storageChanges,
      sstore: this.sstore
    }
  }

  pushSteps (index, currentCallIndex) {
    this.steps[index] = currentCallIndex
  }

  pushCallDataChanges (value, calldata) {
    this.callDataChanges.push(value)
    this.callsData[value] = calldata
  }

  pushMemoryChanges (value) {
    this.memoryChanges.push(value)
  }

  setFormattedMemory (stepIndex, memory) {
    this.formattedMemory[stepIndex] = memory
  }

  // outOfGas has been removed because gas left logging is apparently made differently
  // in the vm/geth/eth. TODO add the error property (with about the error in all clients)
  pushCall (step, index, address, callStack, reverted) {
    const validReturnStep = step.op === 'RETURN' || step.op === 'STOP'
    if ((validReturnStep || reverted) && (this.currentCall)) {
      this.currentCall.call.return = index - 1
      if (!validReturnStep) {
        this.currentCall.call.reverted = reverted
      }
      const parent = this.currentCall.parent
      if (parent) this.currentCall = { call: parent.call, parent: parent.parent }
      return
    }
    const call = {
      op: step.op,
      address: address,
      callStack: callStack,
      calls: {},
      start: index
    }
    this.addresses.push(address)
    if (this.currentCall) {
      this.currentCall.call.calls[index] = call
    } else {
      this.callsTree = { call: call }
    }
    this.currentCall = { call: call, parent: this.currentCall }
  }

  pushOutOfGasIndex (index, address) {
    this.outofgasIndexes.push({ index, address })
  }

  pushStopIndex (index, address) {
    this.stopIndexes.push({ index, address })
  }

  pushReturnValue (step, value) {
    this.returnValues[step] = value
  }

  pushContractCreationFromMemory (index, token, trace, lastMemoryChange) {
    const toHexString = arr => Array.from(arr, i => (i as any).toString(16).padStart(2, "0")).join("")
    const memory = trace[lastMemoryChange].memory
    const stack = trace[index].stack
    const offset = 2 * parseInt(toHexPaddedString(stack[stack.length - 2]), 16)
    const size = 2 * parseInt(toHexPaddedString(stack[stack.length - 3]), 16)
    const memoryHex = toHexString(memory)
    this.contractCreation[token] = '0x' + memoryHex.substr(offset, size)
  }

  pushContractCreation (token, code) {
    this.contractCreation[token] = code
  }

  resetStoreChanges (index, address, key, value) {
    this.sstore = {}
    this.storageChanges = []
  }

  pushStoreChanges (index, address, key, value) {
    this.sstore[index] = {
      address: address,
      key: key,
      value: value,
      hashedKey: key && sha3_256(key),
      contextCall: this.currentCall
    }
    this.storageChanges.push(index)
  }

  accumulateStorageChanges (index, address, storage) {
    const ret = Object.assign({}, storage)
    for (const k in this.storageChanges) {
      const changesIndex = this.storageChanges[k]
      if (changesIndex > index) {
        return ret
      }
      const sstore = this.sstore[changesIndex]
      if (sstore.address?.toLowerCase() === address?.toLowerCase() && sstore.key) {
        if (sstore.contextCall?.call?.return < index && sstore.contextCall?.call?.reverted) {
          // this is a previous call which has reverted. state changes aren't kept.
          continue
        } else {
          ret[sstore.hashedKey] = {
            key: sstore.key,
            value: sstore.value
          }
        }
      }
    }
    return ret
  }
}
