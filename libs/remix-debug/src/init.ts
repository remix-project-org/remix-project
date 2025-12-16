'use strict'
import { toNumber, ethers } from 'ethers'

export function loadWeb3 (url = 'http://localhost:8545') {
  const provider = new ethers.JsonRpcProvider(url)
  extendProvider(provider)
  return provider
}

export function web3DebugNode (networkid: string) {
  const web3DebugNodes = {
    1: 'https://go.getblock.us/1552e4e35bcf4efe8a78897cba5557f9',
    11155111: 'https://go.getblock.io/7fbe62b139884d2c9c1616ca0de8b5b2',
    42161: 'https://go.getblock.io/d8fb0ccf25a646edaaf777d8abb10a62',
    10: 'https://go.getblock.io/7ab36af4c9c346bbabab70e9c54d9c6c'
  }
  if (web3DebugNodes[networkid]) {
    return loadWeb3(web3DebugNodes[networkid])
  }
  return null
}

export function extendProvider (provider) { // Provider should be ethers.js provider

  if (!provider.debug) provider.debug = {}

  provider.debug.preimage = (key, cb) => {
    provider.send('debug_preimage', [key])
      .then(result => cb(null, result))
      .catch(error => cb(error))
  }

  provider.debug.traceTransaction = (txHash, options, cb) => {
    provider.send('debug_traceTransaction', [txHash, options])
      .then(result => cb(null, result))
      .catch(error => cb(error))
  }

  provider.debug.storageRangeAt = (txBlockHash, txIndex, address, start, maxSize, cb) => {
    provider.send('debug_storageRangeAt', [txBlockHash, toNumber(txIndex), address, start, maxSize])
      .then(result => cb(null, result))
      .catch(error => cb(error))
  }
}
