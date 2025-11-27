'use strict'
import { hash } from '@remix-project/remix-lib'
import { setLengthLeft, toBytes, addHexPrefix } from '@ethereumjs/util'
import stringSimilarity from 'string-similarity'
import { BN } from 'bn.js'

/*
 contains misc util: @TODO should be split
  - hex conversion
  - binary search
  - CALL related look up
  - sha3 calculation
  - swarm hash extraction
  - bytecode comparison
*/
/*
    ints: IntArray
  */

/**
   * Converts a hex string to an array of integers.
   */
export function hexToIntArray (hexString) {
  if (hexString.slice(0, 2) === '0x') {
    hexString = hexString.slice(2)
  }
  const integers = []
  for (let i = 0; i < hexString.length; i += 2) {
    integers.push(parseInt(hexString.slice(i, i + 2), 16))
  }
  return integers
}

/*
    ints: list of BNs
  */
export function hexListFromBNs (bnList) {
  const ret = []
  for (const k in bnList) {
    const v = bnList[k].toString(16)
    ret.push('0x' + v.padStart(64, '0'))
  }
  return ret
}

export function toHexPaddedString(v: bigint | string): string {
  if (v) {
    if (typeof v === 'string') {
      return v.startsWith('0x') ? v : '0x' + v
    } else {
      return '0x' + v.toString(16).padStart(64, '0')
    }
  }
  else
    return '0x' + '0'.padStart(64, '0')
}

const hexByByte = Array.from({ length: 256 }, (v, i) => i.toString(16).padStart(2, '0'))
export function bytesToHex (bytes: Uint8Array): any {
  let hex = `0x`
  if (bytes === undefined || bytes.length === 0) return hex
  for (const byte of bytes) {
    hex = `${hex}${hexByByte[byte]}`
  }
  return hex
}

export function padHexToEven(hex: string): string {
  hex = hex.replace('0x', '')
  // Check if the length of the hex string is odd
  if (hex.length % 2 !== 0) {
    // Add a leading zero
    hex = '0' + hex;
  }
  return '0x' + hex;
}

/*
  ints: ints: IntArray
*/
export function formatMemory (mem) {
  const hexMem = bytesToHex(mem).substr(2)
  const ret = []
  for (let k = 0; k < hexMem.length; k += 32) {
    const row = hexMem.substr(k, 32)
    ret.push(row)
  }
  return ret
}

/*
  Binary Search:
  Assumes that @arg array is sorted increasingly
  return largest i such that array[i] <= target; return -1 if array[0] > target || array is empty
*/
export function findLowerBound (target, array) {
  let start = 0
  let length = array.length
  while (length > 0) {
    const half = length >> 1
    const middle = start + half
    if (array[middle] <= target) {
      length = length - 1 - half
      start = middle + 1
    } else {
      length = half
    }
  }
  return start - 1
}

/*
  Binary Search:
  Assumes that @arg array is sorted increasingly
  return largest array[i] such that array[i] <= target; return null if array[0] > target || array is empty
*/
export function findLowerBoundValue (target, array) {
  const index = findLowerBound(target, array)
  return index >= 0 ? array[index] : null
}

/*
  Binary Search:
  Assumes that @arg array is sorted increasingly
  return Return i such that |array[i] - target| is smallest among all i and -1 for an empty array.
  Returns the smallest i for multiple candidates.
*/
export function findClosestIndex (target, array): number {
  if (array.length === 0) {
    return -1
  }
  const index = findLowerBound(target, array)
  if (index < 0) {
    return 0
  } else if (index >= array.length - 1) {
    return array.length - 1
  } else {
    const middle = (array[index] + array[index + 1]) / 2
    return target <= middle ? index : index + 1
  }
}

/**
  * Find the call from @args rootCall which contains @args index (recursive)
  *
  * @param {Int} index - index of the vmtrace
  * @param {Object} rootCall  - call tree, built by the trace analyser
  * @return {Object} - return the call which include the @args index
  */
export function findCall (index, rootCall) {
  const ret = buildCallPath(index, rootCall)
  return ret[ret.length - 1]
}

/**
  * Find calls path from @args rootCall which leads to @args index (recursive)
  *
  * @param {Int} index - index of the vmtrace
  * @param {Object} rootCall  - call tree, built by the trace analyser
  * @return {Array} - return the calls path to @args index
  */
export function buildCallPath (index, rootCall) {
  const ret = []
  findCallInternal(index, rootCall, ret)
  return ret
}

/**
  * sha3 the given @arg value (left pad to 32 bytes)
  *
  * @param {String} value - value to sha3
  * @return {Object} - return sha3ied value
  */
// eslint-disable-next-line camelcase
export function sha3_256 (value) {
  if ((value.constructor && value.constructor.name === 'BigNumber') || BN.isBN(value) || (typeof value === 'bigint')) {
    value = value.toString(16)
  }
  if (typeof value === 'number') {
    value = value.toString(16)
  }
  value = toBytes(addHexPrefix(value))
  const retInBuffer: Uint8Array = hash.keccak(Buffer.from(setLengthLeft(value, 32)))
  return bytesToHex(retInBuffer)
}

/**
  * return a regex which extract the swarmhash from the bytecode.
  *
  * @return {RegEx}
  */
export function swarmHashExtraction () {
  return /a165627a7a72305820([0-9a-f]{64})0029$/
}

/**
  * return a regex which extract the swarmhash from the bytecode, from POC 0.3
  *
  * @return {RegEx}
  */
export function swarmHashExtractionPOC31 () {
  return /a265627a7a72315820([0-9a-f]{64})64736f6c6343([0-9a-f]{6})0032$/
}

/**
  * return a regex which extract the swarmhash from the bytecode, from POC 0.3
  *
  * @return {RegEx}
  */
export function swarmHashExtractionPOC32 () {
  return /a265627a7a72305820([0-9a-f]{64})64736f6c6343([0-9a-f]{6})0032$/
}

/**
  * return a regex which extract the cbor encoded metadata : {"ipfs": <IPFS hash>, "solc": <compiler version>} from the bytecode.
  * ref https://docs.soliditylang.org/en/v0.6.6/metadata.html?highlight=ipfs#encoding-of-the-metadata-hash-in-the-bytecode
  * @return {RegEx}
  */
export function cborEncodedValueExtraction () {
  return /64697066735822([0-9a-f]{68})64736f6c6343([0-9a-f]{6})0033$/
}

/**
  * return a regex which extract the input parameters from the bytecode
  *
  * @return {RegEx}
  */
export function inputParametersExtraction () {
  return /64697066735822[0-9a-f]{68}64736f6c6343[0-9a-f]{6}0033(.*)$/
}

export function extractcborMetadata (value) {
  const cbor = value.match(cborEncodedValueExtraction())
  if (cbor && cbor[0]) value = value.replace(cbor[0], '')
  return value
}

export function extractSwarmHash (value) {
  value = value.replace(swarmHashExtraction(), '')
  value = value.replace(swarmHashExtractionPOC31(), '')
  value = value.replace(swarmHashExtractionPOC32(), '')
  return value
}

export function extractinputParameters (value) {
  const inputsParam = getinputParameters(value)
  if (inputsParam) value = value.replace(inputsParam, '')
  return value
}

export function getinputParameters (value) {
  const regex = value.match(inputParametersExtraction())
  if (regex && regex[1]) {
    return regex[1]
  } else
    return ''
}

/**
  * Compare bytecode. return true if the code is equal (handle swarm hash and library references)
  * @param {String} code1 - the bytecode that is actually deployed (contains resolved library reference and a potentially different swarmhash)
  * @param {String} code2 - the bytecode generated by the compiler (contains unresolved library reference and a potentially different swarmhash)
                            this will return false if the generated bytecode is empty (abstract contract cannot be deployed)
  *
  * @return {bool}
  */
export function compareByteCode (code1, code2) {
  if (code1 === code2) return true
  if (code2 === '0x') return false // abstract contract. see comment
  if (code1 === '0x00' || code2 === '0x00' && code1 !== code2) return false // // This can be removed some time once YUL returns correct bytecode

  if (code2.substr(2, 46) === '7300000000000000000000000000000000000000003014') {
    // testing the following signature: PUSH20 00..00 ADDRESS EQ
    // in the context of a library, that slot contains the address of the library (pushed by the compiler to avoid calling library other than with a DELEGATECALL)
    // if code2 is not a library, well we still suppose that the comparison remain relevant even if we remove some information from `code1`
    code1 = replaceLibReference(code1, 4)
  }
  let pos = -1
  while ((pos = code2.search(/__(.*)__/)) !== -1) {
    code2 = replaceLibReference(code2, pos)
    code1 = replaceLibReference(code1, pos)
  }

  code1 = removeImmutableReference(code1, code2)
  code1 = extractinputParameters(code1)
  code1 = extractSwarmHash(code1)
  code1 = extractcborMetadata(code1)
  code2 = extractinputParameters(code2)
  code2 = extractSwarmHash(code2)
  code2 = extractcborMetadata(code2)

  if (code1 && code2) {
    if (code1.length !== code2.length) {
      // if the length isn't the same, we have an issue with extracting the metadata hash.
      const minLength = code1.length > code2.length ? code2.length: code1.length
      code1 = code1.substr(0, minLength - 10)
      code2 = code2.substr(0, minLength - 10)
    }
    const compare = stringSimilarity.compareTwoStrings(code1, code2)
    return compare == 1
  }

  return false
}
/* util extracted out from remix-ide. @TODO split this file, cause it mix real util fn with solidity related stuff ... */
export function groupBy (arr, key) {
  return arr.reduce((sum, item) => {
    const groupByVal = item[key]
    const groupedItems = sum[groupByVal] || []
    groupedItems.push(item)
    sum[groupByVal] = groupedItems
    return sum
  }, {})
}

export function concatWithSeparator (list, separator) {
  return list.reduce((sum, item) => sum + item + separator, '').slice(0, -separator.length)
}

export function escapeRegExp (str) {
  return str.replace(/[-[\]/{}()+?.\\^$|]/g, '\\$&')
}

function replaceLibReference (code, pos) {
  return code.substring(0, pos) + '0000000000000000000000000000000000000000' + code.substring(pos + 40)
}

function removeByIndex (code, index, length, emptyRef) {
  if (!code) return code
  return code.slice(0, index) + emptyRef + code.slice(index + length)
}

function removeImmutableReference (code1, code2) {
  try {
    const refOccurrence = code2.match(/7f0000000000000000000000000000000000000000000000000000000000000000/g)
    if (!refOccurrence) return code1
    let offset = 0
    refOccurrence.map((value) => {
      offset = code2.indexOf(value, offset)
      code1 = removeByIndex(code1, offset, value.length, '7f0000000000000000000000000000000000000000000000000000000000000000')
      offset = offset + 1
    })
  } catch (e) {
    console.log('error removeImmutableReference', e)
  }
  return code1
}

function findCallInternal (index, rootCall, callsPath) {
  const calls = Object.keys(rootCall.calls)
  const ret = rootCall
  callsPath.push(rootCall)
  for (const k in calls) {
    const subCall = rootCall.calls[calls[k]]
    if (index >= subCall.start && index <= subCall.return) {
      findCallInternal(index, subCall, callsPath)
      break
    }
  }
  return ret
}
