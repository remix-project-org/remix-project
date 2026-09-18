/* eslint-env mocha */
const assert = require('assert')
const { RemixEngine } = require('./remixEngine')

describe('RemixEngine.setPluginOption', () => {
  it('gives the starknet plugin a queueTimeout longer than the 10s default so its permission modal survives', () => {
    const option = new RemixEngine().setPluginOption({ name: 'starknet' })
    assert.ok(option.queueTimeout > 10000, `starknet queueTimeout ${option.queueTimeout} should exceed the 10s default`)
  })

  it('gives starknet the same queueTimeout as the hardhat and truffle plugins', () => {
    const engine = new RemixEngine()
    const starknet = engine.setPluginOption({ name: 'starknet' }).queueTimeout
    const hardhat = engine.setPluginOption({ name: 'hardhat' }).queueTimeout
    assert.strictEqual(starknet, hardhat)
  })
})
