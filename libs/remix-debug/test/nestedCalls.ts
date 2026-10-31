import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import tape from 'tape'
import solc from 'solc'
import { BrowserProvider, Contract, ContractFactory, Interface, ZeroHash } from 'ethers'
import { Provider } from '@remix-project/remix-simulator'
import path from 'node:path'
import { extendProvider } from '../src/init'
import { Ethdebugger } from '../src/Ethdebugger'
import { CompilerAbstract } from '@remix-project/remix-solidity'
import { convertOffsetToLineColumn, getLinebreakPositions } from '../src/source/sourceMappingDecoder'

const source = readFileSync(path.join(__dirname, 'resources/nestedCalls.sol'), 'utf8')
const compiled = JSON.parse(solc.compile(JSON.stringify({
  language: 'Solidity', sources: { 'NestedCalls.sol': { content: source } },
  settings: { evmVersion: 'cancun', outputSelection: { '*': { '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode'], '': ['ast']} } }
})))
assert.deepEqual((compiled.errors || []).filter(error => error.severity === 'error'), [])
const artifacts = compiled.contracts['NestedCalls.sol']
const fault = new Interface(['error NestedFailure(uint256 value)']).encodeErrorResult('NestedFailure', [20])

async function fixture() {
  const local = new Provider({ fork: 'cancun' })
  await local.init()
  await local.Accounts.resetAccounts()
  const web3 = new BrowserProvider(local, undefined, { cacheTimeout: -1 })
  extendProvider(web3)
  const signer = await web3.getSigner()
  const from = await signer.getAddress()
  const artifact = artifacts.NestedCalls
  const root = await new ContractFactory(artifact.abi, artifact.evm.bytecode.object, signer).deploy()
  await root.waitForDeployment()
  const address = await root.getAddress()
  const callee = new Contract(await (root as any).callee(), artifacts.NestedCallee.abi, signer)
  const leaf = new Contract(await callee.leaf(), artifacts.NestedLeaf.abi, signer)
  const probe = await (root as any).probe()
  const send = async (name: string, args: any[] = [], withSources = false, prepareTrace?: (steps: any[]) => void) => {
    const hash = await local.request({ id: 1, jsonrpc: '2.0', method: 'eth_sendTransaction', params: [{
      from, to: address, data: root.interface.encodeFunctionData(name, args), gas: '0xf4240'
    }]})
    const receipt = await local.request({ id: 1, jsonrpc: '2.0', method: 'eth_getTransactionReceipt', params: [hash]})
    const trace = await local.request({ id: 1, jsonrpc: '2.0', method: 'debug_traceTransaction', params: [hash]})
    prepareTrace?.(trace.structLogs)
    const costs = trace.structLogs.map(step => step.gasCost)
    const compilation = new CompilerAbstract('json', compiled, { target: 'NestedCalls.sol', sources: { 'NestedCalls.sol': { content: source } } })
    const debug = new Ethdebugger({ web3, getCache: async () => trace,
      compilationResult: async (address?: string) => withSources && address?.toLowerCase() !== probe.toLowerCase() ? compilation : null,
      offsetToLineColumnConverter: { offsetToLineColumn: async location => convertOffsetToLineColumn(location, getLinebreakPositions(source)) }
    })
    const treeReady = withSources && new Promise<void>((resolve, reject) => {
      debug.callTree.event.register('callTreeReady', () => resolve())
      debug.callTree.event.register('callTreeBuildFailed', reject)
      debug.callTree.event.register('callTreeNotReady', reject)
    })
    await debug.debug((await web3.getTransaction(hash)).toJSON())
    if (treeReady) await treeReady
    return { hash, receipt, trace, debug, costs }
  }
  return { local, web3, from, root, address, callee, leaf, probe, send,
    close: () => { web3.destroy() } }
}

async function slot(debug: Ethdebugger, index: number, address: string) {
  return new Promise<bigint>((resolve, reject) => {
    debug.storageViewAt(index, address).storageSlot(ZeroHash, (error, value) => error ? reject(error) : resolve(BigInt(value?.value || 0)))
  })
}
const hexWord = (value: string | bigint) => typeof value === 'bigint' ? value : BigInt('0x' + value)

test('nested STATICCALL decodes calldata and return words at each frame', async () => {
  const f = await fixture()
  try {
    const { debug } = await f.send('staticRead', [99])
    const steps = debug.getTrace()
    for (const [index, step] of steps.entries()) {
      if (step.op === 'STATICCALL') {
        assert.equal(debug.traceManager.getCallDataAt(index + 1)[0], f.callee.interface.encodeFunctionData('read', [99]).slice(2))
      }
      if (step.op === 'RETURN') {
        assert.deepEqual(debug.traceManager.traceCache.returnValues[index], ['0x' + (99n).toString(16).padStart(64, '0')])
      }
    }
  } finally { f.close() }
})

test('source call trees retain raw-bytecode children and frame gas costs', async () => {
  const f = await fixture()
  try {
    const { debug, costs } = await f.send('inspect', [1], true, steps => {
      // RPC trace providers may supply costs, including zero, across frame boundaries.
      steps.find(step => step.op === 'CALL').gasCost = 2600
      steps.find(step => step.op === 'STATICCALL').gasCost = 0
    })
    const flatten = scopes => scopes.flatMap(scope => [scope, ...flatten(scope.children)])
    const external = flatten(debug.callTree.getScopesAsNestedJSON('call'))
    assert.deepEqual(external.map(scope => scope.opcodeInfo.op), ['CALL', 'STATICCALL'])
    assert.equal(external[1].address.toLowerCase(), f.probe.toLowerCase())
    const merged = flatten(debug.callTree.getScopesAsNestedJSON('nojump'))
    assert.ok(merged.some(scope => scope.opcodeInfo.op === 'STATICCALL'))
    const steps = debug.getTrace()
    costs.forEach((cost, index) => {
      if (cost !== undefined) assert.equal(steps[index].gasCost, Number(cost), 'preserves explicit RPC gas costs')
      else if (steps[index + 1] && steps[index + 1].depth !== steps[index].depth) {
        assert.equal(steps[index].gasCost, 0, 'does not subtract gas across frame boundaries')
      }
    })
  } finally { f.close() }
})

test('Ethereum storage and memory costs survive source analysis', async () => {
  const f = await fixture()
  try {
    const { debug, costs } = await f.send('delegateStore', [], true)
    const steps = debug.getTrace()
    const measured = steps.flatMap((step, index) => ['SSTORE', 'MSTORE'].includes(step.op) ? [index] : [])
    assert.ok(measured.length > 0)
    for (const index of measured) {
      const step = steps[index]
      assert.equal(steps[index + 1].depth, step.depth)
      const consumed = BigInt(step.gas) - BigInt(steps[index + 1].gas)
      assert.ok(consumed > 0n)
      assert.equal(BigInt(costs[index]), consumed, `${step.op}: RPC trace includes dynamic gas`)
      assert.equal(BigInt(step.gasCost), consumed, `${step.op}: source analysis preserves that gas cost`)
    }
  } finally { f.close() }
})

test('delegate storage survives a nested call and returns to the caller storage context', async () => {
  const f = await fixture()
  try {
    const { receipt, debug } = await f.send('delegateStore', [], true)
    assert.equal(receipt.status, '0x1')
    assert.equal(await (f.root as any).value(), 43n)
    assert.equal(await f.callee.value(), 0n)
    assert.equal(await f.leaf.value(), 7n)
    const stores = debug.getTrace().flatMap((step, index) => step.op === 'SSTORE' ? [{ step, index }] : [])
    assert.deepEqual(stores.map(({ step }) => hexWord(step.stack[step.stack.length - 2])), [10n, 41n, 7n, 42n, 43n])
    const owners = [f.address, f.address, await f.leaf.getAddress(), f.address, f.address]
    const before = [0n, 10n, 0n, 41n, 42n]
    for (const [i, { step, index }] of stores.entries()) {
      assert.equal(await slot(debug, index, owners[i]), before[i], `storage before SSTORE ${i}`)
      assert.equal(await slot(debug, index + 1, owners[i]), hexWord(step.stack[step.stack.length - 2]), `storage after SSTORE ${i}`)
      const decoded = await debug.decodeStateAt(index + 1, await debug.extractStateAt(index + 1)) as Record<string, { value: string }>
      assert.equal(BigInt(decoded.value.value), hexWord(step.stack[step.stack.length - 2]), `decoded state after SSTORE ${i}`)
    }
  } finally { f.close() }
})

test('caught parent reverts discard successful descendant writes and logs in debugger history', async () => {
  const f = await fixture()
  try {
    const { receipt, debug } = await f.send('caughtRevert', [], true)
    assert.equal(receipt.status, '0x1')
    assert.equal(receipt.logs.length, 1)
    assert.equal(f.root.interface.parseLog(receipt.logs[0]).args[0], fault)
    assert.equal(await (f.root as any).value(), 11n)
    assert.equal(await f.callee.value(), 0n)
    assert.equal(await f.leaf.value(), 0n)
    const steps = debug.getTrace()
    const leafStore = steps.findIndex(step => step.op === 'SSTORE' && step.depth === 3)
    assert.equal(await slot(debug, leafStore + 1, await f.leaf.getAddress()), 30n)
    const reverted = steps.findIndex(step => step.op === 'REVERT' && step.depth === 2)
    const calls = debug.callTree.getScopesAsNestedJSON('call')
    assert.equal(calls[0].lastStep, reverted, 'call-tree end matches the actual frame revert')
    assert.equal(await slot(debug, reverted, await f.leaf.getAddress()), 30n)
    assert.equal(await slot(debug, reverted + 1, await f.leaf.getAddress()), 0n)
    assert.equal(await slot(debug, reverted + 1, await f.callee.getAddress()), 0n)
    assert.equal(debug.traceManager.getCallDataAt(reverted + 1)[0].replace(/^0x/, ''), f.root.interface.encodeFunctionData('caughtRevert').slice(2))
    assert.equal(await slot(debug, steps.length - 1, f.address), 11n)
    assert.equal(await slot(debug, leafStore + 1, await f.leaf.getAddress()), 30n, 'backward navigation retains the pre-revert write')
  } finally { f.close() }
})

test('calls without a traced child do not create a source call frame', async () => {
  const f = await fixture()
  try {
    const { receipt, debug } = await f.send('catchHalt', [f.from], true)
    assert.equal(receipt.status, '0x1')
    assert.ok(debug.getTrace().some(step => step.op === 'CALL'))
    assert.ok(debug.getTrace().every(step => step.depth === 1))
    assert.deepEqual(debug.callTree.getScopesAsNestedJSON('call'), [])
    assert.equal(await slot(debug, debug.getTrace().length - 1, f.address), 14n)
  } finally { f.close() }
})

function test(name: string, run: () => Promise<void>) {
  tape(name, async t => {
    try { await run(); t.pass(name) } catch (error) { t.fail(error.stack || String(error)) }
    finally { t.end() }
  })
}
