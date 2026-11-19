import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { hexlify, Transaction, Wallet } from 'ethers'
import { initSync } from 'monad-evm2js'
import { MonadProvider } from '../../libs/remix-monad/src/provider'
import type { MonadSpec } from '../../libs/remix-monad/src/types'
import { readState } from '../../libs/remix-monad/src/state'

initSync({ module: readFileSync('node_modules/monad-evm2js/dist/monad_evm2js_bg.wasm') })

const rpc = (provider: MonadProvider, method: string, ...params: any[]) => provider.request({ method, params })
// Deploy a runtime that returns CHAINID as a 32-byte word.
const deployment = '0x6009600c60003960096000f34660005260206000f3'

async function createProvider(fork: MonadSpec, stateDb?: unknown) {
  const provider = new MonadProvider({ fork, stateDb })
  await provider.init()
  return provider
}

async function deploy(provider: MonadProvider) {
  const hash = await rpc(provider, 'eth_sendTransaction', { data: deployment, gas: '0x186a0' })
  return (await rpc(provider, 'eth_getTransactionReceipt', hash)).contractAddress
}

for (const fork of ['monad-eight', 'monad-nine', 'monad-ten', 'monad-next'] as const) {
  test(`${fork}: RPC, CHAINID, local signatures and debugger traces use chain 143`, async () => {
    const provider = await createProvider(fork)
    assert.equal(await rpc(provider, 'eth_chainId'), '0x8f')
    assert.equal(await rpc(provider, 'net_version'), '143')
    const [from] = await rpc(provider, 'eth_accounts')
    const to = await deploy(provider)
    assert.equal(BigInt(await rpc(provider, 'eth_call', { from, to }, 'latest')), 143n)

    for (const type of [0, 2]) {
      const fees = type === 0 ? { gasPrice: '0x3b9aca00' } : { maxFeePerGas: '0x3b9aca00', maxPriorityFeePerGas: '0x3b9aca00' }
      const hash = await rpc(provider, 'eth_sendTransaction', { from, to, type, gas: '0x186a0', ...fees })
      const transaction = await rpc(provider, 'eth_getTransactionByHash', hash)
      assert.equal(transaction.chainId, '0x8f')
      const signed = Transaction.from({
        to, type, chainId: 143, nonce: Number(BigInt(transaction.nonce)), gasLimit: 100_000, ...fees,
        signature: { r: transaction.r, s: transaction.s, v: Number(BigInt(transaction.v)) }
      })
      assert.equal(signed.hash, hash)
      assert.equal(signed.from, from)
      const parity = BigInt(signed.signature.yParity)
      assert.equal(BigInt(transaction.v), type === 0 ? 143n * 2n + 35n + parity : parity)
      const trace = await rpc(provider, 'debug_traceTransaction', hash)
      assert.equal(trace.failed, false)
      assert.equal(BigInt(trace.returnValue), 143n)
      const index = trace.structLogs.findIndex(step => step.op === 'CHAINID')
      assert.ok(index >= 0)
      assert.equal(BigInt('0x' + trace.structLogs[index + 1].stack.at(-1)), 143n)
    }
  })

  test(`${fork}: signed transactions accept 143 and reject other chain IDs without changing state`, async () => {
    const provider = await createProvider(fork)
    const [from, to] = await rpc(provider, 'eth_accounts')
    const wallet = new Wallet(hexlify(await rpc(provider, 'eth_getPKey', from)))
    for (const type of [0, 2]) {
      const nonce = Number(BigInt(await rpc(provider, 'eth_getTransactionCount', from, 'latest')))
      const fees = type === 0 ? { gasPrice: '0x3b9aca00' } : { maxFeePerGas: '0x3b9aca00', maxPriorityFeePerGas: '0x3b9aca00' }
      const input = { to, type, nonce, gasLimit: 21_000, ...fees }
      const before = await rpc(provider, 'eth_getStateDb')
      for (const chainId of [1, 1337, 10143]) {
        await assert.rejects(rpc(provider, 'eth_sendTransaction', { ...input, from, chainId }), /Incorrect local chain ID/)
        const raw = await wallet.signTransaction({ ...input, chainId })
        await assert.rejects(rpc(provider, 'eth_sendRawTransaction', raw), /Incorrect local chain ID/)
        assert.deepEqual(await rpc(provider, 'eth_getStateDb'), before)
      }
      const raw = await wallet.signTransaction({ ...input, chainId: 143 })
      const hash = await rpc(provider, 'eth_sendRawTransaction', raw)
      const signed = Transaction.from(raw)
      assert.equal(hash, signed.hash)
      const transaction = await rpc(provider, 'eth_getTransactionByHash', hash)
      assert.equal(transaction.chainId, '0x8f')
      assert.equal(BigInt(transaction.v), type === 0 ? signed.signature.networkV : BigInt(signed.signature.yParity))
      assert.equal((await rpc(provider, 'eth_getTransactionReceipt', hash)).status, '0x1')
    }
  })

  test(`${fork}: save/restore preserves chain 143 and rejects mismatched execution history`, async () => {
    const provider = await createProvider(fork)
    const to = await deploy(provider)
    const hash = await rpc(provider, 'eth_sendTransaction', { to, gas: '0x186a0' })
    const trace = await rpc(provider, 'debug_traceTransaction', hash)
    const state = await rpc(provider, 'eth_getStateDb')
    assert.equal(JSON.parse(state.engine).chainId, 143)
    for (const [, record] of state.executions) {
      assert.equal(record.tx.chainId, '0x8f')
      assert.equal(JSON.parse(record.before).chainId, 143)
      assert.equal(JSON.parse(record.after).chainId, 143)
    }
    const restored = await createProvider(fork, state)
    assert.deepEqual(await rpc(restored, 'eth_getStateDb'), state)
    assert.equal(await rpc(restored, 'eth_chainId'), '0x8f')
    assert.equal(await rpc(restored, 'net_version'), '143')
    assert.deepEqual(await rpc(restored, 'debug_traceTransaction', hash), trace)
    assert.equal(BigInt(await rpc(restored, 'eth_call', { to }, 'latest')), 143n)
    assert.equal(BigInt(await rpc(restored, 'eth_call', { to }, '0x1')), 143n)

    for (const chainId of [1, 1337, 10143]) {
      for (const field of ['engine', 'before', 'after', 'transaction']) {
        const invalid = structuredClone(state)
        const record = invalid.executions[0][1]
        if (field === 'transaction') record.tx.chainId = '0x' + chainId.toString(16)
        else {
          const target = field === 'engine' ? invalid : record
          target[field] = JSON.stringify({ ...JSON.parse(target[field]), chainId })
        }
        assert.throws(() => readState(invalid, fork), /chain ID/)
      }
    }
  })
}
