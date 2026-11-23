import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { AbiCoder, id, ZeroHash } from 'ethers'
import { Engine, initSync } from 'monad-evm2js'
import { MonadProvider } from '../../libs/remix-monad/src/provider'
import { decodeConsoleCalls } from '../../libs/remix-monad/src/console'

initSync({ module: readFileSync('node_modules/monad-evm2js/dist/monad_evm2js_bg.wasm') })
const payload = (signature: string, values: any[]) => id(`log${signature}`).slice(0, 10) + AbiCoder.defaultAbiCoder().encode(signature.slice(1, -1).split(',').filter(Boolean), values).slice(2)
const consoleCall = '365f5f375f5f365f73000000000000000000636f6e736f6c652e6c6f675afa50'

test('console decoding supports current and legacy signatures and ignores malformed calls', () => {
  const address = '0x1111111111111111111111111111111111111111'
  assert.deepEqual(decodeConsoleCalls([
    payload('()', []), payload('(string,uint256,bool,address)', ['message', 42n, true, address]),
    payload('(int256)', [-7n]), payload('(bytes)', ['0xabcdef']), payload('(bytes32)', [ZeroHash]),
    payload('(uint)', [99n]), payload('(int)', [-9n]),
    '0x', '0x12345678', id('log(string)').slice(0, 10) + '00'
  ]), [[], ['message', '42', true, address], ['-7'], ['0xabcdef'], [ZeroHash], ['99'], ['-9']])
})

for (const fork of ['monad-eight', 'monad-nine', 'monad-ten', 'monad-next'] as const) {
  test(`${fork}: transaction, call and reverted console output survives save and restore`, async () => {
    const engine = new Engine(fork, 143)
    const restoredEngine = new Engine(fork, 143)
    const local = new MonadProvider({ fork }, engine)
    await local.init()
    const request = (method: string, ...params: any[]) => local.request({ method, params })
    try {
      const [from] = await request('eth_accounts')
      const results: string[] = []
      for (const [suffix, status] of [['00', '0x1'], ['5f5ffd', '0x0']]) {
        const runtime = consoleCall + suffix
        const length = (runtime.length / 2).toString(16).padStart(2, '0')
        const deployment = await request('eth_sendTransaction', { from, data: `0x60${length}600c60003960${length}6000f3${runtime}`, gas: '0xf4240' })
        const to = (await request('eth_getTransactionReceipt', deployment)).contractAddress
        const data = payload('(string,uint256)', ['diagnostic', 42n])
        const hash = await request('eth_sendTransaction', { from, to, data, gas: '0xf4240' })
        results.push(hash)
        assert.equal((await request('eth_getTransactionReceipt', hash)).status, status)
        const before = engine.snapshot()
        await request('eth_registerCallId', 'console-call')
        if (status === '0x1') await request('eth_call', { from, to, data })
        else await assert.rejects(request('eth_call', { from, to, data }), /revert/)
        results.push(await request('eth_getHashFromTagBySimulator', 'console-call'))
        assert.equal(engine.snapshot(), before)
      }
      const restored = new MonadProvider({ fork, stateDb: await request('eth_getStateDb') }, restoredEngine)
      await restored.init()
      for (const hash of results) {
        for (const provider of [local, restored]) {
          const logs = await provider.request({ method: 'eth_getHHLogsForTx', params: [hash]})
          assert.deepEqual(logs, [['diagnostic', '42']])
          logs[0][0] = 'changed'
          assert.deepEqual(await provider.request({ method: 'eth_getHHLogsForTx', params: [hash]}), [['diagnostic', '42']])
        }
      }
      assert.deepEqual(await request('eth_getHHLogsForTx', ZeroHash), [])
    } finally { engine.free(); restoredEngine.free() }
  })
}

test('console output remains available after the instruction trace is truncated', async () => {
  const engine = new Engine('monad-next', 143)
  const local = new MonadProvider({ fork: 'monad-next' }, engine)
  await local.init()
  const request = (method: string, ...params: any[]) => local.request({ method, params })
  try {
    const [from] = await request('eth_accounts')
    const runtime = '614e205b600190038060035750' + consoleCall + '00'
    const length = (runtime.length / 2).toString(16).padStart(2, '0')
    const deployment = await request('eth_sendTransaction', { from, data: `0x60${length}600c60003960${length}6000f3${runtime}`, gas: '0xf4240' })
    const to = (await request('eth_getTransactionReceipt', deployment)).contractAddress
    const hash = await request('eth_sendTransaction', { from, to, data: payload('(string)', ['after loop']), gas: '0xf4240' })
    assert.equal((await request('eth_getTransactionReceipt', hash)).status, '0x1')
    await assert.rejects(request('debug_traceTransaction', hash), /Trace exceeded/)
    assert.deepEqual(await request('eth_getHHLogsForTx', hash), [['after loop']])
  } finally { engine.free() }
})
