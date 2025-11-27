'use strict'
import { toNumber, ethers } from 'ethers'

export function loadWeb3 (url = 'http://localhost:8545') {
  const provider = new ethers.JsonRpcProvider(url)
  extendProvider(provider)
  return provider
}

export function web3DebugNode (network) {
  const web3DebugNodes = {
    Main: 'https://go.getblock.us/1552e4e35bcf4efe8a78897cba5557f9',
    Sepolia: 'https://go.getblock.io/7fbe62b139884d2c9c1616ca0de8b5b2'
  }
  if (web3DebugNodes[network]) {
    return loadWeb3(web3DebugNodes[network])
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
