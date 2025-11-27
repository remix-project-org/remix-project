import { keccak256 } from 'ethers'
const version = require('../../package.json').version

export function methods () {
  return {
    web3_clientVersion: web3_clientVersion,
    eth_protocolVersion: eth_protocolVersion,
    eth_syncing: eth_syncing,
    eth_mining: eth_mining,
    eth_hashrate: eth_hashrate,
    web3_sha3: web3_sha3,
    eth_getCompilers: eth_getCompilers,
    eth_compileSolidity: eth_compileSolidity,
    eth_compileLLL: eth_compileLLL,
    eth_compileSerpent: eth_compileSerpent
  }
}

export function web3_clientVersion (payload, cb) {
  cb(null, 'Remix Simulator/' + version)
}

export function eth_protocolVersion (payload, cb) {
  cb(null, '0x3f')
}

export function eth_syncing (payload, cb) {
  cb(null, false)
}

export function eth_mining (payload, cb) {
  // TODO: should depend on the state
  cb(null, false)
}

export function eth_hashrate (payload, cb) {
  cb(null, '0x0')
}

export function web3_sha3 (payload, cb) {
  const str: string = payload.params[0]
  cb(null, keccak256(str))
}

export function eth_getCompilers (payload, cb) {
  cb(null, [])
}

export function eth_compileSolidity (payload, cb) {
  cb(null, 'unsupported')
}

export function eth_compileLLL (payload, cb) {
  cb(null, 'unsupported')
}

export function eth_compileSerpent (payload, cb) {
  cb(null, 'unsupported')
}
