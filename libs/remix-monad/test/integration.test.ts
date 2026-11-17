import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import solc from 'solc'
import { BrowserProvider, ContractFactory, getBytes, hexlify, Wallet, ZeroHash } from 'ethers'
import init, { Engine, type MonadSpec } from 'monad-evm2js'
import { MonadProvider } from '../src/provider'
/* eslint-disable @nrwl/nx/enforce-module-boundaries -- Exercise debugger internals without exposing them as production package exports. */
import { extendProvider } from '../../remix-debug/src/init'
import { Ethdebugger } from '../../remix-debug/src/Ethdebugger'
import { nameOpCodes, parseCode } from '../../remix-debug/src/code/codeUtils'
import { atIndex } from '../../remix-debug/src/source/sourceMappingDecoder'
import { getOpcodeInfo, updateSymbolicStack } from '../../remix-debug/src/solidity-decoder/opcodeStackHandler'
/* eslint-enable @nrwl/nx/enforce-module-boundaries */

await init({ module_or_path: readFileSync(new URL(await import.meta.resolve('monad-evm2js/wasm'))) })
const source = readFileSync('libs/remix-monad/examples/MonadDemo.sol', 'utf8')
const compiled = JSON.parse(solc.compile(JSON.stringify({
  language: 'Solidity', sources: { 'MonadDemo.sol': { content: source } },
  settings: { evmVersion: 'cancun', outputSelection: { '*': { '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode'], '': ['ast']} } }
})))
assert.deepEqual((compiled.errors || []).filter(error => error.severity === 'error'), [])
const artifact = compiled.contracts['MonadDemo.sol'].MonadDemo

async function provider(fork: MonadSpec = 'monad-next', stateDb?: any) {
  const engine = new Engine(fork, 1337)
  const local = new MonadProvider({ fork, stateDb }, engine)
  await local.init()
  const web3 = new BrowserProvider(local, undefined, { cacheTimeout: -1 })
  extendProvider(web3)
  const [from] = await local.request({ method: 'eth_accounts' })
  return { engine, local, web3, from }
}

async function deploy(local: MonadProvider, from: string, runtime: string) {
  const len = (runtime.length / 2).toString(16).padStart(2, '0')
  const hash = await local.request({ method: 'eth_sendTransaction', params: [{ from, gas: '0xf4240', data: `0x60${len}600c60003960${len}6000f3${runtime}` }]})
  const receipt = await local.request({ method: 'eth_getTransactionReceipt', params: [hash]})
  assert.equal(receipt.status, '0x1')
  return receipt.contractAddress
}

test('deploy Solidity, commit storage, execute Monad opcode and load the Remix debugger', async () => {
  const { engine, local, web3, from } = await provider()
  try {
    const signer = await web3.getSigner(from)
    const contract = await new ContractFactory(artifact.abi, artifact.evm.bytecode.object, signer).deploy()
    await contract.waitForDeployment()
    const address = await contract.getAddress()
    const deployment = await contract.deploymentTransaction().wait()
    assert.equal(deployment.status, 1)
    const store = await (await (contract as any).store(42)).wait()
    assert.equal(await (contract as any).value(), 42n)
    assert.equal(store.logs.length, 1)
    const depth = await (await (contract as any).recordDepth()).wait()
    assert.equal(await (contract as any).value(), 1n)

    const debuggerInstance = new Ethdebugger({ web3, compilationResult: async () => null })
    for (const receipt of [deployment, store, depth]) {
      const transaction = await web3.getTransaction(receipt.hash)
      await debuggerInstance.debug(transaction.toJSON())
      assert.equal(debuggerInstance.traceManager.getCurrentFork(), 'monad-next')
      const trace = debuggerInstance.getTrace()
      assert.ok(trace.length > 0)
      for (let index = 0; index < trace.length; index++) {
        const executingAddress = debuggerInstance.traceManager.getCurrentCalledAddressAt(index)
        const code = await debuggerInstance.codeManager.getCode(executingAddress)
        assert.notEqual(code.instructionsIndexByBytesOffset[trace[index].pc], undefined, `Unmapped PC ${trace[index].pc} at step ${index}`)
        debuggerInstance.traceManager.getStackAt(index)
        debuggerInstance.traceManager.getMemoryAt(index)
      }
      if (receipt.hash === store.hash) {
        const step = trace.findIndex(step => step.op === 'SSTORE')
        const instruction = debuggerInstance.codeManager.getInstructionIndex(address, step)
        const location = atIndex(instruction, artifact.evm.deployedBytecode.sourceMap) as { start: number; length: number }
        assert.ok(source.slice(location.start, location.start + location.length).includes('value = newValue'))
        const readSlot = (index: number): Promise<any> => new Promise((resolve, reject) => {
          debuggerInstance.storageViewAt(index, address).storageSlot(ZeroHash, (error, slot) => error ? reject(error) : resolve(slot))
        })
        assert.equal(BigInt((await readSlot(step))?.value || 0), 0n)
        assert.equal(BigInt((await readSlot(step + 1)).value), 42n)
      }
      if (receipt.hash === depth.hash) {
        const step = trace.findIndex(step => step.op === 'CALLSTACKDEPTH')
        assert.ok(step >= 0)
        assert.equal(trace[step].depth, 2)
        assert.equal(trace[step].pc, 0)
        assert.equal(trace[step + 1].pc, 2)
        assert.equal(BigInt('0x' + trace[step + 1].stack.at(-1)), 1n)
        const oracle = await (contract as any).depthOracle()
        const code = await debuggerInstance.codeManager.getCode(oracle)
        assert.match(code.instructions[0], /CALLSTACKDEPTH/)
        assert.equal(code.instructionsIndexByBytesOffset[1], undefined)
        const range = await local.request({ method: 'debug_storageRangeAt', params: [depth.blockHash, 0, address, ZeroHash, 100]})
        assert.equal(BigInt((Object.values(range.storage)[0] as any).value), 42n)
      }
    }
    const state = await local.request({ method: 'eth_getStateDb' })
    const restored = await provider('monad-next', state)
    try {
      const value = await restored.local.request({ method: 'eth_getStorageAt', params: [address, '0x0', 'latest']})
      assert.equal(BigInt(value), 1n)
      assert.ok((await restored.local.request({ method: 'debug_traceTransaction', params: [depth.hash]})).structLogs.length > 0)
    } finally { restored.web3.destroy(); restored.engine.free() }
  } finally { web3.destroy(); engine.free() }
})

test('simulation and estimation leave state unchanged; minimum successful gas is executable', async () => {
  const { engine, local, web3, from } = await provider()
  try {
    const address = await deploy(local, from, '602a5f555f545f5260205ff3')
    const before = engine.snapshot()
    const estimate = await local.request({ method: 'eth_estimateGas', params: [{ from, to: address }]})
    assert.equal(engine.snapshot(), before)
    await local.request({ method: 'eth_registerCallId', params: ['call-1']})
    assert.equal(BigInt(await local.request({ method: 'eth_call', params: [{ from, to: address }, 'latest']})), 42n)
    assert.equal(engine.snapshot(), before)
    const callHash = await local.request({ method: 'eth_getHashFromTagBySimulator', params: ['call-1']})
    assert.ok((await local.request({ method: 'debug_traceTransaction', params: [callHash]})).structLogs.length > 0)
    const callReceipt = await web3.getTransactionReceipt(callHash)
    const callBlock = await web3.getBlock(callReceipt.blockHash, true)
    assert.equal(callBlock.prefetchedTransactions[0].hash, callHash)
    const debuggerInstance = new Ethdebugger({ web3, compilationResult: async () => null })
    await debuggerInstance.debug((await web3.getTransaction(callHash)).toJSON())
    assert.ok(debuggerInstance.getTrace().some(step => step.op === 'SSTORE'))
    const hash = await local.request({ method: 'eth_sendTransaction', params: [{ from, to: address, gas: estimate }]})
    const receipt = await local.request({ method: 'eth_getTransactionReceipt', params: [hash]})
    assert.equal(receipt.status, '0x1')
    assert.equal(receipt.gasUsed, estimate)
    assert.equal(BigInt(await local.request({ method: 'eth_getStorageAt', params: [address, '0x0']})), 42n)
  } finally { web3.destroy(); engine.free() }
})

test('Monad Ten rejects extension execution and has separate decoder behavior', async () => {
  const { engine, local, web3, from } = await provider('monad-ten')
  try {
    const address = await deploy(local, from, 'ae005f5260205ff3')
    const hash = await local.request({ method: 'eth_sendTransaction', params: [{ from, to: address, gas: '0xf4240' }]})
    const receipt = await local.request({ method: 'eth_getTransactionReceipt', params: [hash]})
    assert.equal(receipt.status, '0x0')
    const trace = await local.request({ method: 'debug_traceTransaction', params: [hash]})
    assert.equal(trace.structLogs[0].op, 'INVALID')
    assert.equal(trace.fork, 'monad-ten')
    await assert.rejects(local.request({ method: 'eth_call', params: [{ from, to: address }]}))
  } finally { web3.destroy(); engine.free() }
  const raw = getBytes('0xae005fae0160aeae5b00')
  const [names, map] = nameOpCodes(raw, 'monad-next')
  assert.match(names[0], /CALLSTACKDEPTH/)
  assert.equal(map[1], undefined)
  assert.equal(map[4], undefined)
  assert.notEqual(map[8], undefined, 'JUMPDEST remains addressable after an invalid extension prefix')
  assert.equal(parseCode(raw, 'monad-next')[2].name, 'CALLERN')
  assert.deepEqual(parseCode(raw, 'monad-ten').map(opcode => opcode.name),
    ['INVALID', 'STOP', 'PUSH0', 'INVALID', 'ADD', 'PUSH1', 'INVALID', 'JUMPDEST', 'STOP'])
  const [tenNames, tenMap] = nameOpCodes(raw, 'monad-ten')
  assert.match(tenNames[0], /INVALID/)
  assert.notEqual(tenMap[1], undefined, 'Monad Ten does not consume an extension selector')
  assert.notEqual(tenMap[4], undefined, 'Monad Ten decodes the CALLERN selector as a separate byte')
  assert.match(nameOpCodes(raw, 'osaka')[0][0], /INVALID/)
  assert.deepEqual(getOpcodeInfo('CALLSTACKDEPTH'), { name: 'CALLSTACKDEPTH', in: 0, out: 1 })
  assert.deepEqual(getOpcodeInfo('CALLERN'), { name: 'CALLERN', in: 1, out: 1 })
  let stack = updateSymbolicStack([], 'CALLSTACKDEPTH', 0)
  assert.equal(stack.length, 1)
  stack = updateSymbolicStack(stack, 'CALLERN', 1)
  assert.equal(stack.length, 1)
  stack = updateSymbolicStack(stack, 'PUSH0', 2)
  assert.equal(updateSymbolicStack(stack, 'MSTORE', 3).length, 0)
})

test('Monad Nine, Ten and Next use the Osaka opcode baseline in both decoders', () => {
  const raw = getBytes('0x1e5f5500')
  const expected = ['CLZ', 'PUSH0', 'SSTORE', 'STOP']
  for (const hardfork of ['monad-nine', 'monad-ten', 'monad-next', 'osaka']) {
    const [names] = nameOpCodes(raw, hardfork)
    assert.deepEqual((names as string[]).map(instruction => instruction.trim().split(' ')[1]), expected, hardfork)
    assert.deepEqual(parseCode(raw, hardfork).map(opcode => opcode.name), expected, hardfork)
  }
})

test('Prague and earlier opcode availability follows the requested hardfork in both decoders', () => {
  const raw = getBytes('0x1e5f5e00')
  const cases = [
    { hardfork: 'london', expected: ['INVALID', 'INVALID', 'INVALID', 'STOP']},
    { hardfork: 'shanghai', expected: ['INVALID', 'PUSH0', 'INVALID', 'STOP']},
    { hardfork: 'cancun', expected: ['INVALID', 'PUSH0', 'MCOPY', 'STOP']},
    { hardfork: 'monad-eight', expected: ['INVALID', 'PUSH0', 'MCOPY', 'STOP']},
    { hardfork: 'prague', expected: ['INVALID', 'PUSH0', 'MCOPY', 'STOP']}
  ]
  for (const { hardfork, expected } of cases) {
    const [names] = nameOpCodes(raw, hardfork)
    assert.deepEqual((names as string[]).map(instruction => instruction.trim().split(' ')[1]), expected, hardfork)
    assert.deepEqual(parseCode(raw, hardfork).map(opcode => opcode.name), expected, hardfork)
  }
})

test('unsupported hardfork names are rejected by both opcode decoders', () => {
  const raw = getBytes('0x1e00')
  for (const hardfork of ['monad-seven', 'monad-future', 'monad-next-typo', 'unknown']) {
    for (const decode of [nameOpCodes, parseCode]) {
      assert.throws(() => decode(raw, hardfork), /Hardfork with name .* not supported/, `${decode.name}: ${hardfork}`)
    }
  }
})

test('CALLERN, rollback, signed EIP-1559 transactions and request sequencing', async () => {
  const { engine, local, web3, from } = await provider()
  try {
    const caller = await deploy(local, from, '5fae015f5260205ff3')
    const value = await local.request({ method: 'eth_call', params: [{ from, to: caller }]})
    assert.equal(BigInt(value), BigInt(from))
    const reverter = await deploy(local, from, '602a5f555f5ffd')
    const failed = await local.request({ method: 'eth_sendTransaction', params: [{ from, to: reverter, gas: '0xf4240' }]})
    assert.equal((await local.request({ method: 'eth_getTransactionReceipt', params: [failed]})).status, '0x0')
    assert.equal(await local.request({ method: 'eth_getStorageAt', params: [reverter, '0x0']}), ZeroHash)
    const privateKey = await local.request({ method: 'eth_getPKey', params: [from]})
    const wallet = new Wallet(hexlify(privateKey))
    const nonce = await local.request({ method: 'eth_getTransactionCount', params: [from]})
    const signed = await wallet.signTransaction({ chainId: 1337, nonce: Number(BigInt(nonce)), to: caller,
      type: 2, maxFeePerGas: 2_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n, gasLimit: 100_000 })
    const hash = await local.request({ method: 'eth_sendRawTransaction', params: [signed]})
    assert.equal((await local.request({ method: 'eth_getTransactionReceipt', params: [hash]})).status, '0x1')
    const hashes = await Promise.all([0, 1].map(() => local.request({ method: 'eth_sendTransaction', params: [{ from, to: caller, gas: '0x186a0' }]})))
    const transactions = await Promise.all(hashes.map(hash => local.request({ method: 'eth_getTransactionByHash', params: [hash]})))
    assert.equal(BigInt(transactions[1].nonce), BigInt(transactions[0].nonce) + 1n)
  } finally { web3.destroy(); engine.free() }
})

test('large traces fail explicitly without affecting transaction completion', async () => {
  const { engine, local, web3, from } = await provider()
  try {
    const loop = await deploy(local, from, '5b5f56')
    const hash = await local.request({ method: 'eth_sendTransaction', params: [{ from, to: loop, gas: '0x2dc6c0' }]})
    assert.equal((await local.request({ method: 'eth_getTransactionReceipt', params: [hash]})).status, '0x0')
    await assert.rejects(local.request({ method: 'debug_traceTransaction', params: [hash]}), /Trace exceeded/)
  } finally { web3.destroy(); engine.free() }
})

for (const fork of ['monad-eight', 'monad-nine', 'monad-ten', 'monad-next'] as const) {
  test(`${fork}: debugger preserves fork, code and CLZ activation after restoration`, async () => {
    const f = await provider(fork)
    try {
      const address = await deploy(f.local, f.from, '60011e5f5260205ff3')
      const hash = await f.local.request({ method: 'eth_sendTransaction', params: [{ from: f.from, to: address, gas: '0xf4240' }]})
      const receipt = await f.local.request({ method: 'eth_getTransactionReceipt', params: [hash]})
      assert.equal(receipt.status, fork === 'monad-eight' ? '0x0' : '0x1')
      const saved = await f.local.request({ method: 'eth_getStateDb' })
      const restored = await provider(fork, saved)
      try {
        const debug = new Ethdebugger({ web3: restored.web3, compilationResult: async () => null })
        await debug.debug((await restored.web3.getTransaction(hash)).toJSON())
        assert.equal(debug.traceManager.getCurrentFork(), fork)
        assert.equal(debug.traceManager.monadCodeByAddress[address.toLowerCase()], '0x60011e5f5260205ff3')
        assert.equal(debug.getTrace()[1].pc, 2)
        assert.equal(debug.getTrace()[1].op, fork === 'monad-eight' ? 'INVALID' : 'CLZ')
        const trace = await restored.local.request({ method: 'debug_traceTransaction', params: [hash]})
        if (fork !== 'monad-eight') assert.equal(BigInt(trace.returnValue), 255n)
      } finally { restored.web3.destroy(); restored.engine.free() }
    } finally { f.web3.destroy(); f.engine.free() }
  })
}
