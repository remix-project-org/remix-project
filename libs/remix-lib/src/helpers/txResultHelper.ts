'use strict'
import { bytesToHex } from '@ethereumjs/util'
import { isHexString } from 'ethjs-util'
import { BN } from 'bn.js'

function convertToPrefixedHex (input) {
  if (input === undefined || input === null || isHexString(input)) {
    return input
  }
  if ((input.constructor && input.constructor.name === 'BigNumber')
      || BN.isBN(input)
      || (typeof input === 'bigint')
      || typeof input === 'number') {
    return '0x' + input.toString(16)
  }

  try {
    return bytesToHex(input)
  } catch (e) {
    console.log(e)
  }

  try {
    // BigNumber
    return '0x' + input.toString(16)
  } catch (e) {
    console.log(e)
  }

  return input
}

/*
 txResult.result can be 3 different things:
 - VM call or tx: ethereumjs-vm result object
 - Node transaction: object returned from eth.getTransactionReceipt()
 - Node call: return value from function call (not an object)

 Also, VM results use BN and Buffers, Node results use hex strings/ints,
 So we need to normalize the values to prefixed hex strings
*/
export function resultToRemixTx (txResult, execResult?) {
  const { receipt, transactionHash, result } = txResult
  const { status, gasUsed, contractAddress } = receipt
  let returnValue, errorMessage

  if (isHexString(result)) {
    returnValue = result
  } else if (execResult !== undefined) {
    returnValue = execResult.returnValue
    errorMessage = execResult.exceptionError
  }

  return {
    transactionHash,
    status: convertToPrefixedHex(status),
    gasUsed: convertToPrefixedHex(gasUsed),
    error: errorMessage,
    return: returnValue ? convertToPrefixedHex(returnValue) : undefined,
    createdAddress: convertToPrefixedHex(contractAddress)
  }
}
