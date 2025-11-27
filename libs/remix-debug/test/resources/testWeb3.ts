'use strict'
import { init } from '../init'
const web3Override: any = {}
web3Override.debug = {}
let data = init.readFile(require('path').resolve(__dirname, 'testWeb3.json'), null)
data = JSON.parse(data)

const traceWithABIEncoder = init.readFile(require('path').resolve(__dirname, 'traceWithABIEncoder.json'), null)

data.testTraces['0x20ef65b8b186ca942fcccd634f37074dde49b541c27994fc7596740ef44cfd53'] = JSON.parse(traceWithABIEncoder)
web3Override.getCode = function (address, callback) {
  if (callback) {
    callback(null, data.testCodes[address])
  } else {
    return data.testCodes[address]
  }
}

web3Override.debug.traceTransaction = function (txHash, options, callback) {
  callback(null, data.testTraces[txHash])
}

web3Override.debug.storageRangeAt = function (blockNumber, txIndex, address, start, maxSize, callback) {
  callback(null, { storage: {}, complete: true })
}

web3Override.getTransaction = function (txHash, callback) {
  if (callback) {
    callback(null, data.testTxs[txHash])
  } else {
    return data.testTxs[txHash]
  }
}

web3Override.getTransactionFromBlock = function (blockNumber, txIndex, callback) {
  if (callback) {
    callback(null, data.testTxsByBlock[blockNumber + '-' + txIndex])
  } else {
    return data.testTxsByBlock[blockNumber + '-' + txIndex]
  }
}

web3Override.getBlockNumber = function (callback) { callback('web3 modified testing purposes :)') }

web3Override.providers = { 'HttpProvider': function (url) {} }

if (typeof (module) !== 'undefined' && typeof (module.exports) !== 'undefined') {
  module.exports = web3Override
}
