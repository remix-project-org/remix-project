'use strict'
import { Web3, Web3PluginBase } from 'web3'
import { toNumber } from 'web3-utils'

export function extendWeb3 (web3) {
  if (!web3.debug){
    web3.registerPlugin(new Web3DebugPlugin())
  }
}

export function loadWeb3 (url) {
  if (!url) url = 'http://localhost:8545'
  const web3 = new Web3()
  web3.setProvider(new Web3.providers.HttpProvider(url))
  extendWeb3(web3)
  return web3
}

export function setProvider (web3, url) {
  web3.setProvider(new web3.providers.HttpProvider(url))
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

class Web3DebugPlugin extends Web3PluginBase {
  public pluginNamespace = 'debug'

  public preimage(key, cb) {
    this.requestManager.send({
      method: 'debug_preimage',
      params: [key]
    })
      .then(result => cb(null, result))
      .catch(error => cb(error))
  }

  public traceTransaction(txHash, options, cb) {
    this.requestManager.send({
      method: 'debug_traceTransaction',
      params: [txHash, options]
    })
      .then(result => cb(null, result))
      .catch(error => cb(error))
  }

  public storageRangeAt(txBlockHash, txIndex, address, start, maxSize, cb) {
    this.requestManager.send({
      method: 'debug_storageRangeAt',
      params: [txBlockHash, toNumber(txIndex), address, start, maxSize]
    })
      .then(result => cb(null, result))
      .catch(error => cb(error))
  }
}
