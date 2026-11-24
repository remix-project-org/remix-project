import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import solc from 'solc'
import { BrowserProvider, Contract, Interface, concat, getAddress, parseEther, toBeHex, toQuantity, ZeroHash } from 'ethers'
import * as ethers from 'ethers'
import { Engine, initSync, type MonadSpec } from 'monad-evm2js'
import { MonadProvider } from '../../libs/remix-monad/src/provider'
import { extendProvider } from '../../libs/remix-debug/src/init'
import { Ethdebugger } from '../../libs/remix-debug/src/Ethdebugger'
import { CompilerAbstract } from '@remix-project/remix-solidity'
import { convertOffsetToLineColumn, getLinebreakPositions } from '../../libs/remix-debug/src/source/sourceMappingDecoder'
import { DebuggerStepManager } from '../../libs/remix-debug/src/debugger/stepManager'

initSync({ module: readFileSync('node_modules/monad-evm2js/dist/monad_evm2js_bg.wasm') })
const file = 'StakingDemo.sol'
const source = readFileSync(`libs/remix-monad/examples/${file}`, 'utf8')
const compiled = JSON.parse(solc.compile(JSON.stringify({
  language: 'Solidity', sources: { [file]: { content: source } },
  settings: { evmVersion: 'cancun', outputSelection: { '*': { '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode'], '': ['ast']} } }
})))
assert.deepEqual((compiled.errors || []).filter(error => error.severity === 'error'), [])
const artifact = compiled.contracts[file].StakingDemo
const script = readFileSync('libs/remix-monad/examples/staking-workflow.js', 'utf8').replace("import { ethers } from 'ethers'", '')
const staking = '0x0000000000000000000000000000000000001000'
const stake = parseEther('10000000')
const funded = parseEther('30000000')
const abi = new Interface([
  'function addValidator(bytes,bytes,bytes) returns (uint64)',
  'function getEpoch() returns (uint64,bool)',
  'function delegate(uint64) returns (bool)',
  'function syscallSnapshot()',
  'event Delegate(uint64 indexed validatorId,address indexed delegator,uint256 amount,uint64 activationEpoch)',
  'event ValidatorRewarded(uint64 indexed validatorId,address indexed from,uint256 amount,uint64 epoch)',
  'event Withdraw(uint64 indexed validatorId,address indexed delegator,uint8 withdrawId,uint256 amount,uint64 epoch)'
])

async function provider(fork: MonadSpec, stateDb?: unknown) {
  const engine = new Engine(fork, 143)
  const local = new MonadProvider({ fork, stateDb }, engine)
  await local.init()
  const web3 = new BrowserProvider(local, undefined, { cacheTimeout: -1 })
  extendProvider(web3)
  const request = (method: string, ...params: any[]) => local.request({ method, params })
  const [from] = await request('eth_accounts')
  const send = async (to: string, data: string, value = 0n) => {
    const hash = await request('eth_sendTransaction', { from, to, data, value: toQuantity(value), gas: '0x2dc6c0' })
    return { hash, receipt: await request('eth_getTransactionReceipt', hash), trace: await request('debug_traceTransaction', hash) }
  }
  const debug = async (hash: string) => {
    const compilation = new CompilerAbstract('json', compiled, { target: file, sources: { [file]: { content: source } } })
    const instance = new Ethdebugger({ web3, compilationResult: async () => compilation,
      offsetToLineColumnConverter: { offsetToLineColumn: async location => convertOffsetToLineColumn(location, getLinebreakPositions(source)) }
    })
    const ready = new Promise<void>((resolve, reject) => {
      instance.callTree.event.register('callTreeReady', () => resolve())
      instance.callTree.event.register('callTreeBuildFailed', reject)
      instance.callTree.event.register('callTreeNotReady', reject)
    })
    await instance.debug((await web3.getTransaction(hash)).toJSON())
    await ready
    return instance
  }
  return { engine, local, web3, request, from, send, debug,
    transition: (action: any) => request('monad_stakingTransition', action),
    close: () => { web3.destroy(); engine.free() } }
}

async function fixture(fork: MonadSpec) {
  const f = await provider(fork)
  await f.request('monad_setBalance', f.from, toQuantity(funded))
  assert.equal(BigInt(await f.request('eth_getBalance', f.from, '0x0')), funded)
  const payload = concat(['0x02' + '11'.repeat(32), '0x' + '22'.repeat(48), f.from, toBeHex(stake, 32), ZeroHash])
  const registration = await f.send(staking, abi.encodeFunctionData('addValidator', [payload, '0x' + '00'.repeat(64), '0x' + '00'.repeat(96)]), stake)
  assert.equal(registration.receipt.status, '0x1')
  const deployment = await f.send(null, '0x' + artifact.evm.bytecode.object)
  assert.equal(deployment.receipt.status, '0x1')
  const address = getAddress(deployment.receipt.contractAddress)
  const contract = new Contract(address, artifact.abi, f.web3)
  return { ...f, address, contract,
    invoke: (method: string, args: any[] = [], value = 0n) => f.send(address, contract.interface.encodeFunctionData(method, args), value) }
}

async function slot(debug: Ethdebugger, index: number, address: string) {
  return new Promise<bigint>((resolve, reject) => {
    debug.storageViewAt(index, address).storageSlot(ZeroHash, (error, value) => error ? reject(error) : resolve(BigInt(value?.value || 0)))
  })
}

async function inspect(f: Awaited<ReturnType<typeof provider>>, hash: string, address: string, success: boolean, before: bigint, after: bigint) {
  const debug = await f.debug(hash)
  const steps = debug.getTrace()
  const call = steps.findIndex(step => step.op === 'CALL')
  assert.ok(call > 0)
  assert.equal(BigInt('0x' + steps[call].stack.at(-2)), 0x1000n)
  assert.equal(BigInt('0x' + steps[call + 1].stack.at(-1)), BigInt(success))
  assert.ok(steps.every(step => step.depth === 1), 'staking has no EVM bytecode frame')
  assert.deepEqual(debug.callTree.getScopesAsNestedJSON('call'), [])
  const location = await debug.callTree.extractSourceLocation(call) as { start: number; length: number }
  assert.match(source.slice(location.start, location.start + location.length), /STAKING\.call/)
  const manager = new DebuggerStepManager(debug, debug.traceManager)
  manager.traceLength = steps.length
  const visited: number[] = []
  manager.event.register('stepChanged', visited, index => visited.push(index))
  manager.jumpTo(call)
  manager.stepIntoForward(false)
  manager.stepIntoBack(false)
  assert.deepEqual(visited, [call, call + 1, call], 'instruction stepping crosses the precompile without an EVM child frame')
  const store = steps.findIndex(step => step.op === 'SSTORE')
  assert.equal(await slot(debug, store, address), before)
  assert.equal(await slot(debug, call, address), 99n)
  assert.equal(await slot(debug, steps.length - 1, address), after)
  assert.equal(await slot(debug, store, address), before, 'backward navigation restores previous caller storage')
  const decoded = await debug.decodeStateAt(steps.length - 1, await debug.extractStateAt(steps.length - 1)) as any
  assert.equal(BigInt(decoded.value.value), after)
  const event = steps.findIndex(step => step.op === 'LOG1')
  if (after !== 99n) {
    assert.ok(event > call, 'the caller emits StakingCall after updating its state')
    const location = await debug.callTree.extractSourceLocation(event) as { start: number; length: number }
    assert.match(source.slice(location.start, location.start + location.length), /^StakingCall\(bytes4\(input\), success, output\)$/)
    for (const [index, value] of [[call, 99n], [event, after], [call, 99n], [event, after]] as const) {
      manager.jumpTo(index)
      assert.equal(manager.currentStepIndex, index)
      const decoded = await debug.decodeStateAt(index, await debug.extractStateAt(index)) as any
      assert.equal(BigInt(decoded.value.value), value, `decoded caller state at trace step ${index}`)
    }
  } else assert.equal(event, -1, 'a required staking failure reverts before emitting the caller event')
}

for (const fork of ['monad-eight', 'monad-nine', 'monad-ten', 'monad-next'] as const) {
  test(`${fork}: staking transactions and system blocks preserve event filters across restore`, async () => {
    const f = await fixture(fork)
    let restored: Awaited<ReturnType<typeof provider>>
    try {
      const query = { fromBlock: toQuantity(BigInt(await f.request('eth_blockNumber')) + 1n), address: [staking, f.address]}
      const logs = await f.request('eth_newFilter', query)
      const blocks = await f.request('eth_newBlockFilter')
      const staked = await f.invoke('stake', [1], parseEther('1'))
      assert.equal(staked.receipt.logs.length, 2, 'both precompile and caller events are recorded')
      const snapshot = await f.transition({ kind: 'snapshot' })
      const changed = await f.transition({ kind: 'epochChange', epoch: '0x1' })
      const reward = await f.transition({ kind: 'reward', author: f.from, amount: toQuantity(parseEther('2')) })
      assert.ok(reward.logs.length > 0)
      const rejected = await f.invoke('rejectAfterStake', [1], parseEther('1'))
      assert.equal(rejected.receipt.status, '0x0')
      assert.deepEqual(rejected.receipt.logs, [])
      assert.deepEqual(await f.request('eth_getFilterChanges', blocks), [staked.receipt.blockHash, snapshot.blockHash, changed.blockHash, reward.blockHash, rejected.receipt.blockHash])
      assert.deepEqual(await f.request('eth_getFilterChanges', logs), staked.receipt.logs)
      assert.deepEqual(await f.request('eth_getFilterLogs', logs), staked.receipt.logs)
      assert.deepEqual(await f.request('eth_getLogs', query), staked.receipt.logs)
      for (const block of [snapshot, changed, reward]) {
        assert.deepEqual(await f.request('eth_getLogs', { blockHash: block.blockHash }), [], 'system blocks contain no transaction receipts')
      }
      const saved = await f.request('eth_getStateDb')
      await assert.rejects(f.transition({ kind: 'epochChange', epoch: '0x1' }))
      assert.deepEqual(await f.request('eth_getStateDb'), saved)
      for (const id of [logs, blocks]) assert.deepEqual(await f.request('eth_getFilterChanges', id), [], 'a failed transition publishes nothing')

      restored = await provider(fork, saved)
      assert.deepEqual(await restored.request('eth_getLogs', query), staked.receipt.logs)
      for (const id of [logs, blocks]) await assert.rejects(restored.request('eth_getFilterChanges', id), /Filter not found/)
      const restoredLogs = await restored.request('eth_newFilter', query)
      const restoredBlocks = await restored.request('eth_newBlockFilter')
      const nextSnapshot = await restored.transition({ kind: 'snapshot' })
      const nextStake = await restored.send(f.address, f.contract.interface.encodeFunctionData('stake', [1]), parseEther('1'))
      assert.equal(nextStake.receipt.status, '0x1')
      assert.deepEqual(await restored.request('eth_getFilterChanges', restoredBlocks), [nextSnapshot.blockHash, nextStake.receipt.blockHash])
      assert.deepEqual(await restored.request('eth_getFilterChanges', restoredLogs), nextStake.receipt.logs)
      assert.deepEqual(await restored.request('eth_getLogs', query), [...staked.receipt.logs, ...nextStake.receipt.logs])
      assert.deepEqual(await restored.request('eth_getFilterChanges', restoredLogs), [])
    } finally { restored?.close(); f.close() }
  })

  test(`${fork}: staking rewards, withdrawal, historical blocks and restored debugging`, { timeout: 60_000 }, async () => {
    const f = await fixture(fork)
    let restored: Awaited<ReturnType<typeof provider>>
    try {
      const registered = await f.request('eth_getStateDb')
      await assert.rejects(f.transition({ kind: 'reward', author: f.from, amount: toQuantity((1n << 256n) - 1n) }), /overflow/i)
      assert.deepEqual(await f.request('eth_getStateDb'), registered, 'overflow cannot mint a backing reward balance')
      const input = { from: f.from, to: f.address, data: f.contract.interface.encodeFunctionData('stake', [1]), value: toQuantity(stake) }
      const before = f.engine.snapshot()
      await f.request('eth_call', input)
      await f.request('eth_estimateGas', input)
      assert.equal(f.engine.snapshot(), before, 'simulation and estimation do not stake')
      const staked = await f.invoke('stake', [1], stake)
      assert.equal(staked.receipt.status, '0x1')
      const delegated = abi.parseLog(staked.receipt.logs[0])
      assert.equal(delegated.name, 'Delegate')
      assert.deepEqual(Array.from(delegated.args), [1n, f.address, stake, 1n])
      const snapshot = await f.transition({ kind: 'snapshot' })
      assert.deepEqual(Array.from(await f.contract.epoch.staticCall()), [0n, true])
      const saved = await f.request('eth_getStateDb')
      restored = await provider(fork, saved)
      assert.deepEqual(await restored.request('eth_getStateDb'), saved)
      await restored.transition({ kind: 'epochChange', epoch: '0x1' })
      const nonce = await restored.request('eth_getTransactionCount', f.from)
      const balance = await restored.request('eth_getBalance', f.from)
      const reward = await restored.transition({ kind: 'reward', author: f.from, amount: toQuantity(parseEther('10')) })
      assert.equal(await restored.request('eth_getTransactionCount', f.from), nonce)
      assert.equal(await restored.request('eth_getBalance', f.from), balance, 'system operations charge no user fee')
      assert.equal(BigInt(await restored.request('eth_getBalance', staking, snapshot.blockNumber)), stake * 2n)
      assert.equal(BigInt(await restored.request('eth_getBalance', staking, reward.blockNumber)), stake * 2n + parseEther('10'))
      assert.equal(BigInt(await restored.request('eth_getBalance', f.from, '0x0')), funded, 'funded genesis survives restore')
      assert.equal(abi.parseLog(reward.logs[0]).name, 'ValidatorRewarded')
      const block = await restored.request('eth_getBlockByHash', reward.blockHash, true)
      assert.deepEqual(block.transactions, [])
      assert.equal(block.gasUsed, '0x0')
      assert.equal(await restored.request('eth_getTransactionReceipt', reward.blockHash), null)
      await assert.rejects(restored.request('debug_traceTransaction', reward.blockHash), /Unknown local transaction/)
      const invoke = (method: string, args: any[]) => restored.send(f.address, f.contract.interface.encodeFunctionData(method, args))
      await invoke('claim', [1])
      assert.equal(BigInt(await restored.request('eth_getBalance', f.address)), parseEther('5'))
      await invoke('unstake', [1, stake, 7])
      const early = await invoke('withdraw', [1, 7])
      assert.equal(early.receipt.status, '0x1', 'the Solidity caller catches the precompile failure')
      assert.equal(early.receipt.logs.length, 1)
      assert.equal(f.contract.interface.parseLog(early.receipt.logs[0]).args.success, false)
      for (const epoch of ['0x2', '0x3']) {
        await restored.transition({ kind: 'snapshot' })
        await restored.transition({ kind: 'epochChange', epoch })
      }
      const withdrawn = await invoke('withdraw', [1, 7])
      assert.equal(withdrawn.receipt.status, '0x1')
      assert.equal(abi.parseLog(withdrawn.receipt.logs[0]).args.amount, stake)
      assert.equal(BigInt(await restored.request('eth_getBalance', f.address)), stake + parseEther('5'))
      assert.equal(BigInt(await restored.request('eth_getBalance', staking)), stake + parseEther('5'))
      await inspect(restored, staked.hash, f.address, true, 0n, 42n)
      await inspect(restored, early.hash, f.address, false, 42n, 11n)
      await inspect(restored, withdrawn.hash, f.address, true, 11n, 42n)
      const reset = await provider(fork)
      try {
        assert.equal(await reset.request('eth_getBalance', staking), '0x0')
        assert.deepEqual((await reset.request('eth_getStateDb')).stakingTransitions, [])
      } finally { reset.close() }
    } finally { restored?.close(); f.close() }
  })

  test(`${fork}: staking failure and caller rollback retain source debugging`, { timeout: 60_000 }, async () => {
    const f = await fixture(fork)
    try {
      await f.invoke('stake', [1], parseEther('10'))
      const before = f.engine.account(staking)
      const rejected = await f.invoke('rejectAfterStake', [1], parseEther('1'))
      assert.equal(rejected.receipt.status, '0x0')
      assert.deepEqual(rejected.receipt.logs, [])
      assert.equal(rejected.trace.returnValue, f.contract.interface.encodeErrorResult('CallerReverted'))
      assert.equal(f.engine.account(staking), before, 'caller revert rolls back staking storage and transferred value')
      assert.equal(await f.contract.value(), 42n)
      await inspect(f, rejected.hash, f.address, true, 42n, 42n)
      const failed = await f.invoke('stake', [999], parseEther('1'))
      assert.equal(failed.receipt.status, '0x0')
      assert.deepEqual(failed.receipt.logs, [])
      assert.equal(f.engine.account(staking), before)
      assert.equal(await f.contract.value(), 42n)
      await inspect(f, failed.hash, f.address, false, 42n, 99n)
      const unauthorized = await f.send(staking, abi.encodeFunctionData('syscallSnapshot'))
      assert.equal(unauthorized.receipt.status, '0x0')
      assert.equal(f.engine.account(staking), before)
    } finally { f.close() }
  })

  test(`${fork}: local staking controls validate, serialize and persist atomically`, { timeout: 30_000 }, async () => {
    const f = await provider(fork)
    try {
      for (const balance of ['-1', '1', '0x' + 'f'.repeat(65)]) await assert.rejects(f.request('monad_setBalance', f.from, balance))
      await assert.rejects(f.request('monad_setBalance', staking, '0x1'), /Unknown local account/)
      await f.request('monad_setBalance', f.from, toQuantity(funded))
      const before = await f.request('eth_getStateDb')
      for (const action of [null, {}, { kind: 'call', to: f.from }, { kind: 'snapshot', amount: '0x1' },
        { kind: 'epochChange', epoch: '1' }, { kind: 'epochChange', epoch: '0xffffffffffffffff' },
        { kind: 'reward', author: f.from, amount: '-1' }, { kind: 'reward', author: 'invalid', amount: '0x1' },
        { kind: 'reward', author: f.from, amount: '0x1' }]) {
        await assert.rejects(f.transition(action))
        assert.deepEqual(await f.request('eth_getStateDb'), before)
      }
      await f.transition({ kind: 'snapshot' })
      const boundary = await f.request('eth_getStateDb')
      await assert.rejects(f.transition({ kind: 'snapshot' }))
      assert.deepEqual(await f.request('eth_getStateDb'), boundary)
      const results = await Promise.allSettled([f.transition({ kind: 'epochChange', epoch: '0x1' }), f.transition({ kind: 'epochChange', epoch: '0x1' })])
      assert.deepEqual(results.map(result => result.status), ['fulfilled', 'rejected'])
      const action = { kind: 'epochChange', epoch: '0x2' }
      const output = await f.transition(action)
      action.epoch = '0xff'
      output.logs[0].data = '0x'
      const saved = await f.request('eth_getStateDb')
      assert.equal(saved.stakingTransitions.length, 3)
      assert.equal(saved.stakingTransitions[2][1].action.epoch, '0x2')
      assert.notEqual(saved.stakingTransitions[2][1].result.logs[0].data, '0x')
      await assert.rejects(f.request('monad_setBalance', f.from, '0x1'), /before the first execution/)
      for (const mutate of [
        state => { state.stakingTransitions = [] },
        state => { state.stakingTransitions = null },
        state => { state.stakingTransitions.push(state.stakingTransitions[0]) },
        state => { state.stakingTransitions[0][0] = ZeroHash },
        state => { state.stakingTransitions[0][0] = state.blocks[0].hash },
        state => { state.stakingTransitions[0][1].action.kind = 'call' },
        state => { state.stakingTransitions[0][1].action = { kind: 'epochChange', epoch: '0xffffffffffffffff' } },
        state => { state.stakingTransitions[0][1].action = { kind: 'reward', author: f.from, amount: '1' } },
        state => { state.stakingTransitions[0][1].result.success = false },
        state => { state.stakingTransitions[0][1].result.error = 'failed' },
        state => { state.stakingTransitions[0][1].result.returnValue = '0x1' },
        state => { state.stakingTransitions[0][1].result.gasSpent = -1 },
        state => { state.stakingTransitions[0][1].result.logs = [{ address: 'bad' }] },
        state => { state.stakingTransitions[0][1].result.logs = [{ address: staking, topics: ['0x1'], data: '0x' }] },
        state => { state.stakingTransitions[0][1].before = '{}' },
        state => { state.stakingTransitions[0][1].after = '{}' },
        state => { state.blocks[1].transactions = [ZeroHash] },
        state => { state.blocks[1].gasUsed = '0x1' }
      ]) {
        const corrupt = structuredClone(saved)
        mutate(corrupt)
        const engine = new Engine(fork, 143)
        const initial = engine.snapshot()
        try {
          await assert.rejects(new MonadProvider({ fork, stateDb: corrupt }, engine).init(), /saved Monad state/)
          assert.equal(engine.snapshot(), initial)
        } finally { engine.free() }
      }
      const restored = await provider(fork, saved)
      saved.stakingTransitions[0][1].action.kind = 'corrupt'
      try {
        await restored.transition({ kind: 'snapshot' })
        assert.equal((await restored.request('eth_getStateDb')).stakingTransitions.length, 4)
      } finally { restored.close() }
    } finally { f.close() }
  })

  test(`${fork}: funding is restricted to local setup and preserves existing version 1 saves`, async () => {
    const f = await provider(fork)
    let restored: Awaited<ReturnType<typeof provider>>
    try {
      const initial = await f.request('eth_getStateDb')
      for (const params of [[], [f.from], [f.from, '0x1', 'extra'], [null, '0x1'], ['bad', '0x1'], [f.from, 1], [f.from, '0x'], [f.from, toQuantity(1n << 256n)]]) {
        await assert.rejects(f.request('monad_setBalance', ...params))
        assert.deepEqual(await f.request('eth_getStateDb'), initial)
      }
      for (const params of [[], [{ kind: 'snapshot' }, 'extra']]) await assert.rejects(f.request('monad_stakingTransition', ...params))
      for (const action of [[{ kind: 'snapshot' }], { kind: 'epochChange', epoch: -1 }, { kind: 'epochChange', epoch: 1 },
        { kind: 'reward', author: f.from, amount: 1 }, { kind: 'reward', author: f.from, amount: toQuantity(1n << 256n) }]) {
        await assert.rejects(f.transition(action))
        assert.deepEqual(await f.request('eth_getStateDb'), initial)
      }
      for (const amount of [0n, (1n << 256n) - 1n, funded]) {
        assert.equal(await f.request('monad_setBalance', f.from.toLowerCase(), toQuantity(amount)), true)
        assert.equal(BigInt(await f.request('eth_getBalance', f.from)), amount)
        assert.equal(await f.request('eth_getTransactionCount', f.from), '0x0')
        assert.equal(await f.request('eth_blockNumber'), '0x0')
      }
      await f.request('eth_call', { from: f.from, to: f.from, data: '0x' })
      const executed = await f.request('eth_getStateDb')
      await assert.rejects(f.request('monad_setBalance', f.from, '0x1'), /before the first execution/)
      assert.deepEqual(await f.request('eth_getStateDb'), executed)
      const previousVersion = structuredClone(executed)
      delete previousVersion.stakingTransitions
      restored = await provider(fork, previousVersion)
      assert.deepEqual(await restored.request('eth_getStateDb'), executed)
      await restored.transition({ kind: 'snapshot' })
      assert.equal((await restored.request('eth_getStateDb')).stakingTransitions.length, 1)
    } finally { restored?.close(); f.close() }
  })

  test(`${fork}: historical staking reads include genesis and empty transition blocks after restore`, async () => {
    const f = await provider(fork)
    let restored: Awaited<ReturnType<typeof provider>>
    try {
      await f.request('monad_setBalance', f.from, toQuantity(funded))
      assert.equal(await f.request('eth_getTransactionCount', staking), '0x0')
      const snapshot = await f.transition({ kind: 'snapshot' })
      assert.equal(await f.request('eth_getTransactionCount', staking), '0x1')
      assert.equal(await f.request('eth_getBalance', staking), '0x0', 'staking initialization adds no funds')
      const changed = await f.transition({ kind: 'epochChange', epoch: '0x1' })
      const queued = await Promise.all([
        f.transition({ kind: 'snapshot' }),
        f.request('eth_call', { from: f.from, to: staking, data: abi.encodeFunctionData('getEpoch') }),
        f.transition({ kind: 'epochChange', epoch: '0x2' })
      ])
      assert.deepEqual(Array.from(abi.decodeFunctionResult('getEpoch', queued[1])), [1n, true])
      restored = await provider(fork, await f.request('eth_getStateDb'))
      const live = restored.engine.snapshot()
      for (const [block, epoch, delay] of [['0x0', 0n, false], [snapshot.blockNumber, 0n, true], [changed.blockNumber, 1n, false], [queued[0].blockNumber, 1n, true], ['latest', 2n, false]] as const) {
        const selected = await restored.request('eth_getBlockByNumber', block, false)
        assert.deepEqual(selected.transactions, [])
        const parent = block === '0x0' ? null : await restored.request('eth_getBlockByNumber', toQuantity(BigInt(selected.number) - 1n), false)
        if (parent) assert.equal(selected.parentHash, parent.hash)
        for (const selector of [block, { blockNumber: selected.number }, { blockHash: selected.hash, requireCanonical: true }]) {
          const output = await restored.request('eth_call', { from: f.from, to: staking, data: abi.encodeFunctionData('getEpoch') }, selector)
          assert.deepEqual(Array.from(abi.decodeFunctionResult('getEpoch', output)), [epoch, delay])
          assert.equal(BigInt(await restored.request('eth_getBalance', f.from, selector)), funded)
          assert.equal(await restored.request('eth_getTransactionCount', f.from, selector), '0x0')
          assert.equal(restored.engine.snapshot(), live, 'historical calls restore live staking state and block hashes')
        }
      }
      await restored.transition({ kind: 'snapshot' })
      await restored.transition({ kind: 'epochChange', epoch: '0x3' })
      assert.equal(await restored.request('eth_blockNumber'), '0x6')
    } finally { restored?.close(); f.close() }
  })

  test(`${fork}: transition errors roll back engine mutations before publishing history`, async () => {
    const f = await provider(fork)
    const transition = f.engine.staking_transition.bind(f.engine)
    const setHash = f.engine.set_block_hash.bind(f.engine)
    try {
      const before = await f.request('eth_getStateDb')
      f.engine.staking_transition = input => { transition(input); throw new Error('transition transport failed') }
      await assert.rejects(f.transition({ kind: 'snapshot' }), /transition transport failed/)
      assert.deepEqual(await f.request('eth_getStateDb'), before)
      f.engine.staking_transition = transition
      f.engine.set_block_hash = (number, hash) => { setHash(number, hash); throw new Error('block recording failed') }
      await assert.rejects(f.transition({ kind: 'snapshot' }), /block recording failed/)
      assert.deepEqual(await f.request('eth_getStateDb'), before)
      f.engine.set_block_hash = setHash
      await f.transition({ kind: 'snapshot' })
      await f.transition({ kind: 'epochChange', epoch: '0x1' })
      const committed = await f.request('eth_getStateDb')
      await assert.rejects(f.transition({ kind: 'epochChange', epoch: '0x1' }))
      assert.deepEqual(await f.request('eth_getStateDb'), committed)
      const transaction = await f.send(f.from, '0x')
      assert.equal(transaction.receipt.status, '0x1', 'a rejected transition does not strand the request queue')
      assert.equal(transaction.receipt.blockNumber, '0x3')
    } finally { f.engine.staking_transition = transition; f.engine.set_block_hash = setHash; f.close() }
  })

  test(`${fork}: the Ethers example uses the selected account and produces debuggable staking transactions`, { timeout: 60_000 }, async () => {
    const f = await provider(fork)
    try {
      const [, selected] = await f.request('eth_accounts')
      const messages: string[] = []
      await runInNewContext(`(async () => { ${script} })()`, {
        ethers, web3Provider: f.local,
        remix: { call: async (plugin: string, method: string, path?: string) => {
          if (plugin === 'udappEnv') {
            assert.equal(method, 'getSelectedAccount')
            return selected.toLowerCase()
          }
          assert.deepEqual([plugin, method, path], ['fileManager', 'readFile', 'artifacts/StakingDemo.json'])
          return JSON.stringify({ abi: artifact.abi, data: { bytecode: artifact.evm.bytecode } })
        } },
        console: { log: (message: string) => messages.push(message) }
      })
      assert.equal(messages.length, 1)
      const [marker, address, staked, early, withdrawn, rejected] = messages[0].split(' ')
      assert.equal(marker, 'staking-workflow-ok')
      assert.equal(BigInt(await f.request('eth_getBalance', address)), stake + parseEther('5'))
      assert.equal(await f.request('eth_getTransactionCount', f.from), '0x0', 'the first account was not used')
      assert.equal(await f.request('eth_getTransactionCount', selected), '0x8')
      assert.equal((await f.request('eth_getStateDb')).stakingTransitions.length, 7)
      for (const [hash, status, success, before, after] of [
        [staked, '0x1', true, 0n, 42n], [early, '0x1', false, 42n, 11n],
        [withdrawn, '0x1', true, 11n, 42n], [rejected, '0x0', true, 42n, 42n]
      ] as const) {
        const receipt = await f.request('eth_getTransactionReceipt', hash)
        assert.equal(receipt.from, selected)
        assert.equal(receipt.status, status)
        await inspect(f, hash, address, success, before, after)
      }
    } finally { f.close() }
  })
}
