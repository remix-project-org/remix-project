'use strict'
import { Interface, AbiCoder } from 'ethers'

export function makeFullTypeDefinition (typeDef) {
  if (typeDef && typeDef.type.indexOf('tuple') === 0 && typeDef.components) {
    const innerTypes = typeDef.components.map((innerType) => { return makeFullTypeDefinition(innerType) })
    return `tuple(${innerTypes.join(',')})${extractSize(typeDef.type)}`
  }
  return typeDef.type
}

export function encodeParams (funABI, args) {
  const types = []
  if (funABI.inputs && funABI.inputs.length) {
    for (let i = 0; i < funABI.inputs.length; i++) {
      const type = funABI.inputs[i].type
      if (type === 'bool') {
        if (args[i] === false || args[i] === 'false' || args[i] === '0' || args[i] === 0) args[i] = false
        else if (args[i] === true || args[i] === 'true' || args[i] === '1' || args[i] === 1) args[i] = true
        else throw new Error(`provided value for boolean is invalid: ${args[i]}`)
      }
      types.push(type.indexOf('tuple') === 0 ? makeFullTypeDefinition(funABI.inputs[i]) : type)
      if (args.length < types.length) {
        args.push('')
      }
    }
  }

  // NOTE: the caller will concatenate the bytecode and this
  //       it could be done here too for consistency
  const abiCoder = new AbiCoder()
  return abiCoder.encode(types, args)
}

export function encodeFunctionId (funABI) {
  if (funABI.type === 'fallback' || funABI.type === 'receive') return '0x'
  const abi = new Interface([funABI])
  return abi.getFunction(funABI.name).selector
}

export function getFunctionFragment (funABI): Interface {
  if (funABI.type === 'fallback' || funABI.type === 'receive') return null
  return new Interface([funABI])
}

export function sortAbiFunction (contractabi) {
  // Check if function is constant (introduced with Solidity 0.6.0)
  const isConstant = ({ stateMutability }) => stateMutability === 'view' || stateMutability === 'pure'
  // Sorts the list of ABI entries. Constant functions will appear first,
  // followed by non-constant functions. Within those two groupings, functions
  // will be sorted by their names.
  return contractabi.sort(function (a, b) {
    if (isConstant(a) && !isConstant(b)) {
      return 1
    } else if (isConstant(b) && !isConstant(a)) {
      return -1
    }
    // If we reach here, either a and b are both constant or both not; sort by name then
    // special case for fallback, receive and constructor function
    if (a.type === 'function' && typeof a.name !== 'undefined') {
      return a.name.localeCompare(b.name)
    } else if (a.type === 'constructor' || a.type === 'fallback' || a.type === 'receive') {
      return 1
    }
  })
}

export function getConstructorInterface (abi) {
  const funABI = { name: '', inputs: [], type: 'constructor', payable: false, outputs: [], stateMutability: null }
  if (typeof abi === 'string') {
    try {
      abi = JSON.parse(abi)
    } catch (e) {
      console.log('exception retrieving ctor abi ' + abi)
      return funABI
    }
  }

  for (let i = 0; i < abi.length; i++) {
    if (abi[i].type === 'constructor') {
      funABI.inputs = abi[i].inputs || []
      funABI.payable = abi[i].payable
      funABI.stateMutability = abi[i].stateMutability
      break
    }
  }

  return funABI
}

export function serializeInputs (fnAbi) {
  let serialized = '('
  if (fnAbi.inputs && fnAbi.inputs.length) {
    serialized += fnAbi.inputs.map((input) => { return input.type }).join(',')
  }
  serialized += ')'
  return serialized
}

export function extractSize (type) {
  const size = type.match(/([a-zA-Z0-9])(\[.*\])/)
  return size ? size[2] : ''
}

export function getFunctionLiner (fn, detailTuple: boolean = true) {
  /*
    if detailsTuple is True, this will return something like fnName((uint, string))
    if detailsTuple is False, this will return something like fnName(tuple)
  */
  return fn.name + '(' + fn.inputs.map((value) => {
    if (detailTuple && value.components) {
      const fullType = makeFullTypeDefinition(value)
      return fullType.replace(/tuple/g, '') // return of makeFullTypeDefinition might contain `tuple`, need to remove it cause `methodIdentifier` (fnName) does not include `tuple` keyword
    } else {
      return value.type
    }
  }).join(',') + ')'
}

export function getFunction (abi, fnName) {
  for (let i = 0; i < abi.length; i++) {
    const fn = abi[i]
    if (fn.type === 'function' && (fnName === getFunctionLiner(fn, true) || fnName === getFunctionLiner(fn, false))) {
      return fn
    }
  }
  return null
}

export function getFallbackInterface (abi) {
  for (let i = 0; i < abi.length; i++) {
    if (abi[i].type === 'fallback') {
      return abi[i]
    }
  }
}

export function getReceiveInterface (abi) {
  for (let i = 0; i < abi.length; i++) {
    if (abi[i].type === 'receive') {
      return abi[i]
    }
  }
}

/**
  * return the contract obj of the given @arg name. Uses last compilation result.
  * return null if not found
  * @param {String} name    - contract name
  * @returns contract obj and associated file: { contract, file } or null
  */
export function getContract (contractName, contracts) {
  for (const file in contracts) {
    if (contracts[file][contractName]) {
      return { object: contracts[file][contractName], file: file }
    }
  }
  return null
}

/**
  * call the given @arg cb (function) for all the contracts. Uses last compilation result
  * stop visiting when cb return true
  * @param {Function} cb    - callback
  */
export function visitContracts (contracts, cb) {
  for (const file in contracts) {
    for (const name in contracts[file]) {
      if (cb({ name: name, object: contracts[file][name], file: file })) return
    }
  }
}

export function inputParametersDeclarationToString (abiinputs) {
  const inputs = (abiinputs || []).map((inp) => inp.type + ' ' + inp.name)
  return inputs.join(', ')
}
