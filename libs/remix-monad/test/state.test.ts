import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { keccak256, ZeroHash } from 'ethers'
import init, { Engine } from 'monad-evm2js'
import { MonadProvider } from '../src/provider'
import { MONAD_FORKS } from '../src/forks'

await init({ module_or_path: readFileSync(new URL(await import.meta.resolve('monad-evm2js/wasm'))) })
const word = (value: number) => '0x' + value.toString(16).padStart(64, '0')
const rpc = (provider: MonadProvider, method: string, ...params: any[]) => provider.request({ method, params })

for (const fork of MONAD_FORKS) {
  test(`${fork}: save/reset/restore preserves accounts, state and execution history`, async context => {
    // A fixed block timestamp also checks that restored call IDs remain unique.
    context.mock.method(Date, 'now', () => 1_800_000_000_000)
    const engines: Engine[] = []
    const create = async (stateDb?: unknown) => {
      const engine = new Engine(fork, 1337)
      engines.push(engine)
      const local = new MonadProvider({ fork, stateDb }, engine)
      await local.init()
      return { engine, local }
    }
    try {
      const { engine, local } = await create()
      const [from] = await rpc(local, 'eth_accounts')
      const added = local.Accounts._addAccount('0x' + '11'.repeat(32), '0x123456')
      // Store calldata, hash it for preimage inspection, and emit it as a log.
      const runtime = '5f355f555f355f5260205f205060205fa000'
      const length = (runtime.length / 2).toString(16).padStart(2, '0')
      const deployment = await rpc(local, 'eth_sendTransaction', { from, gas: '0xf4240', data: `0x60${length}600c60003960${length}6000f3${runtime}` })
      const address = (await rpc(local, 'eth_getTransactionReceipt', deployment)).contractAddress
      const first = await rpc(local, 'eth_sendTransaction', { from, to: address, gas: '0xf4240', data: word(11) })
      const second = await rpc(local, 'eth_sendTransaction', { from, to: address, gas: '0xf4240', data: word(22) })
      await rpc(local, 'eth_registerCallId', 'saved-call')
      const beforeCall = engine.snapshot()
      await rpc(local, 'eth_call', { from, to: address, data: word(99) })
      assert.equal(engine.snapshot(), beforeCall)
      const call = await rpc(local, 'eth_getHashFromTagBySimulator', 'saved-call')
      const saved = await rpc(local, 'eth_getStateDb')
      const serialized = JSON.stringify(saved)
      assert.equal(saved.backend, 'monad-evm2')
      assert.equal(saved.version, 1)

      const fresh = await create()
      assert.equal(await rpc(fresh.local, 'eth_getCode', address), '0x')
      assert.equal(await rpc(fresh.local, 'eth_getTransactionCount', from), '0x0')
      assert.equal((await rpc(fresh.local, 'eth_accounts')).length, 5)
      assert.equal(await rpc(fresh.local, 'eth_getTransactionReceipt', first), null)

      const restored = await create(JSON.parse(serialized))
      assert.deepEqual(await rpc(restored.local, 'eth_getStateDb'), saved)
      assert.deepEqual(await rpc(restored.local, 'eth_accounts'), await rpc(local, 'eth_accounts'))
      assert.equal(await rpc(restored.local, 'eth_getBalance', added), '0x123456')
      assert.equal(await rpc(restored.local, 'eth_getStorageAt', address, '0x0'), word(22))
      assert.equal(await rpc(restored.local, 'eth_getStorageAt', address, '0x0', '0x2'), word(11))
      assert.equal(await rpc(restored.local, 'eth_getStorageAt', address, '0x0', 'earliest'), ZeroHash)
      assert.equal(await rpc(restored.local, 'eth_getHashFromTagBySimulator', 'saved-call'), call)
      for (const hash of [deployment, first, second, call]) {
        assert.deepEqual(await rpc(restored.local, 'eth_getTransactionReceipt', hash), await rpc(local, 'eth_getTransactionReceipt', hash))
        assert.deepEqual(await rpc(restored.local, 'debug_traceTransaction', hash), await rpc(local, 'debug_traceTransaction', hash))
      }
      assert.equal(await rpc(restored.local, 'debug_preimage', keccak256(word(11))), word(11).slice(2))
      const receipt = await rpc(restored.local, 'eth_getTransactionReceipt', second)
      const range = await rpc(restored.local, 'debug_storageRangeAt', receipt.blockHash, 0, address)
      assert.equal((Object.values(range.storage)[0] as any).value, word(11))
      await rpc(restored.local, 'eth_registerCallId', 'continued-call')
      await rpc(restored.local, 'eth_call', { from, to: address, data: word(99) })
      assert.notEqual(await rpc(restored.local, 'eth_getHashFromTagBySimulator', 'continued-call'), call)
      const next = await rpc(restored.local, 'eth_sendTransaction', { from, to: address, gas: '0xf4240', data: word(33) })
      assert.equal((await rpc(restored.local, 'eth_getTransactionReceipt', next)).status, '0x1')
      assert.equal(await rpc(restored.local, 'eth_getStorageAt', address, '0x0'), word(33))
      const again = await create(await rpc(restored.local, 'eth_getStateDb'))
      assert.deepEqual(await rpc(again.local, 'eth_getStateDb'), await rpc(restored.local, 'eth_getStateDb'))
      assert.equal(JSON.stringify(saved), serialized, 'continued execution does not mutate the exported state')
    } finally {
      for (const engine of engines) engine.free()
    }
  })

  test(`${fork}: incompatible and malformed saves fail without changing engine state`, async () => {
    const engine = new Engine(fork, 1337)
    const local = new MonadProvider({ fork }, engine)
    try {
      await local.init()
      const saved = await rpc(local, 'eth_getStateDb')
      for (const invalid of [
        { ...saved, backend: 'other' },
        { ...saved, version: 2 },
        { ...saved, spec: fork === 'monad-next' ? 'monad-ten' : 'monad-next' },
        { ...saved, engine: '{}' },
        { ...saved, tags: [['unknown', ZeroHash]]},
        { ...saved, callCounter: -1 }
      ]) {
        const rejected = new Engine(fork, 1337)
        try {
          const before = rejected.snapshot()
          await assert.rejects(new MonadProvider({ fork, stateDb: invalid }, rejected).init(), /Saved state|Invalid saved/)
          assert.equal(rejected.snapshot(), before)
        } finally { rejected.free() }
      }
    } finally { engine.free() }
  })
}
