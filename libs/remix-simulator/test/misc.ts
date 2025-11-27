/* global describe, before, it */
import { Provider } from '../src/index'
import * as assert from 'assert'
import { ethers, BrowserProvider } from "ethers"

describe('Misc', () => {
  let ethersProvider: BrowserProvider
  before(async () => {
    const provider = new Provider()
    await provider.init()
    ethersProvider = new ethers.BrowserProvider(provider as any)
  })

  describe('web3_clientVersion', () => {
    it('should get correct remix simulator version', async () => {
      const version = await ethersProvider.send("web3_clientVersion", [])
      const remixVersion = require('../package.json').version
      assert.equal(version, 'Remix Simulator/' + remixVersion)
    })
  })

  describe('eth_protocolVersion', () => {
    it('should get protocol version', async () => {
      const result = await ethersProvider.send("eth_protocolVersion", [])
      assert.equal(result, '0x3f')
    })
  })

  describe('eth_syncing', () => {
    it('should get if is syncing', async () => {
      const isSyncing = await ethersProvider.send("eth_syncing", [])
      assert.equal(isSyncing, false)
    })
  })

  describe('eth_mining', () => {
    it('should get if is mining', async () => {
      const isMining = await ethersProvider.send("eth_mining", [])
      assert.equal(isMining, false)
    })
  })

  describe('eth_hashrate', () => {
    it('should get hashrate', async () => {
      const hashrate = await ethersProvider.send("eth_hashrate", [])
      assert.equal(hashrate, 0)
    })
  })

  describe('web3_sha3', () => {
    it('should get result of a sha3', async () => {
      const result = await ethersProvider.send("web3_sha3", ['0x68656c6c6f20776f726c64'])
      assert.equal(result, '0x47173285a8d7341e5e972fc677286384f802f8ef42a5ec5f03bbfa254cb01fad')
    })
  })

  describe('eth_getCompilers', () => {
    it('should get list of compilers', async () => {
      const result = await ethersProvider.send("eth_getCompilers", [])
      assert.equal(result, 0)
    })
  })

  describe('eth_compileSolidity', () => {
    it('get unsupported result when requesting solidity compiler', async () => {
      const result = await ethersProvider.send("eth_compileSolidity", [])
      assert.equal(result, 'unsupported')
    })
  })

  describe('eth_compileLLL', () => {
    it('get unsupported result when requesting LLL compiler', async () => {
      const result = await ethersProvider.send("eth_compileLLL", [])
      assert.equal(result, 'unsupported')
    })
  })

  describe('eth_compileSerpent', () => {
    it('get unsupported result when requesting serpent compiler', async () => {
      const result = await ethersProvider.send("eth_compileSerpent", [])
      assert.equal(result, 'unsupported')
    })
  })
})
