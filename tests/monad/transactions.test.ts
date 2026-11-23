import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { ethers } from 'ethers'
import solc from 'solc'
import { BrowserProvider, Interface, Transaction, Wallet, concat, decodeRlp, encodeRlp, hexlify, keccak256, parseEther, toBeArray, toQuantity, ZeroAddress, ZeroHash } from 'ethers'
import { Engine, initSync, type MonadSpec } from 'monad-evm2js'
import { MonadProvider } from '../../libs/remix-monad/src/provider'
import { extendProvider, getTransactionForDebugging } from '../../libs/remix-debug/src/init'
import { Ethdebugger } from '../../libs/remix-debug/src/Ethdebugger'
import { CompilerAbstract } from '@remix-project/remix-solidity'
import { convertOffsetToLineColumn, getLinebreakPositions } from '../../libs/remix-debug/src/source/sourceMappingDecoder'
import { authorizeDelegation, loadAllDelegations } from '../../libs/remix-ui/run-tab-environment/src/lib/actions'

initSync({ module: readFileSync('node_modules/monad-evm2js/dist/monad_evm2js_bg.wasm') })
const file = 'DelegatedAccount.sol'
const source = readFileSync(`libs/remix-monad/examples/${file}`, 'utf8')
const compiled = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources: { [file]: { content: source } },
  settings: { evmVersion: 'cancun', outputSelection: { '*': { '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode'], '': ['ast']} } }
})))
assert.deepEqual((compiled.errors || []).filter(error => error.severity === 'error'), [])
const artifact = compiled.contracts[file].DelegatedAccount
const abi = new Interface(artifact.abi)

async function fixture(fork: MonadSpec, stateDb?: any) {
  const engine = new Engine(fork, 143)
  const local = new MonadProvider({ fork, stateDb }, engine)
  await local.init()
  const web3 = new BrowserProvider(local, undefined, { cacheTimeout: -1 })
  extendProvider(web3)
  const request = (method: string, ...params: any[]) => local.request({ method, params })
  const [payer, authority, recipient] = await request('eth_accounts')
  const wallet = new Wallet(hexlify(await request('eth_getPKey', authority)))
  const payerWallet = new Wallet(hexlify(await request('eth_getPKey', payer)))
  const nonce = async address => Number(BigInt(await request('eth_getTransactionCount', address)))
  const send = async (tx: any) => {
    const hash = await request('eth_sendTransaction', { from: payer, gas: '0x2dc6c0', ...tx })
    return { hash, receipt: await request('eth_getTransactionReceipt', hash), trace: await request('debug_traceTransaction', hash) }
  }
  const authorize = async (address: string, options = {}) => wallet.authorize({ chainId: 143, address, nonce: await nonce(authority), ...options })
  const debug = async hash => {
    const compilation = new CompilerAbstract('json', compiled, { target: file, sources: { [file]: { content: source } } })
    const instance = new Ethdebugger({ web3, compilationResult: async () => compilation,
      offsetToLineColumnConverter: { offsetToLineColumn: async location => convertOffsetToLineColumn(location, getLinebreakPositions(source)) } })
    const ready = new Promise<void>((resolve, reject) => {
      instance.callTree.event.register('callTreeReady', () => resolve())
      instance.callTree.event.register('callTreeBuildFailed', reject)
      instance.callTree.event.register('callTreeNotReady', reject)
    })
    await instance.debug((await getTransactionForDebugging(web3, hash)).toJSON())
    await ready
    return instance
  }
  return { engine, local, web3, request, payer, authority, recipient, wallet, payerWallet, nonce, send, authorize, debug,
    deploy: async () => (await send({ data: '0x' + artifact.evm.bytecode.object })).receipt.contractAddress as string,
    close: () => { web3.destroy(); engine.free() } }
}

async function inspectStore(f: Awaited<ReturnType<typeof fixture>>, hash: string, expected: number) {
  const debug = await f.debug(hash)
  const steps = debug.getTrace()
  const index = steps.findIndex(step => step.op === 'SSTORE')
  assert.ok(index >= 0)
  assert.equal(debug.traceManager.getCurrentCalledAddressAt(index).toLowerCase(), f.authority.toLowerCase())
  const location = await debug.callTree.extractSourceLocation(index) as { start: number; length: number }
  assert.match(source.slice(location.start, location.start + location.length), /value = newValue/)
  const decoded = await debug.decodeStateAt(index + 1, await debug.extractStateAt(index + 1)) as any
  assert.equal(BigInt(decoded.value.value), BigInt(expected))
  assert.equal(steps[index].op, 'SSTORE')
  return debug
}

test('the Monad debugger transaction fallback preserves errors from other providers', async () => {
  const error = Object.assign(new Error('Invalid authorization format'), { code: 'BAD_DATA', value: { type: '0x4', authorizationList: []} })
  const provider = { getTransaction: async () => { throw error }, send: async method => {
    assert.equal(method, 'web3_clientVersion')
    return 'Ethereum/test-client'
  } }
  await assert.rejects(getTransactionForDebugging(provider, ZeroHash), caught => caught === error)
  provider.send = async () => { throw new Error('Unsupported RPC method') }
  await assert.rejects(getTransactionForDebugging(provider, ZeroHash), caught => caught === error)
})

for (const fork of ['monad-eight', 'monad-nine', 'monad-ten', 'monad-next'] as const) {
  test(`${fork}: access lists warm storage and retain signed type-1/type-2 envelopes`, async () => {
    const f = await fixture(fork)
    try {
      const target = await f.deploy()
      const accessList = [{ address: ethers.getAddress(target), storageKeys: [ZeroHash]}]
      for (const type of [1, 2]) {
        const fees = type === 1 ? { gasPrice: 1_000_000_000 } : { maxFeePerGas: 2_000_000_000, maxPriorityFeePerGas: 1_000_000_000 }
        const input = { to: target, type, chainId: 143, data: abi.encodeFunctionData('store', [42]), gasLimit: 500_000, accessList, ...fees }
        const raw = await f.payerWallet.signTransaction({ ...input, nonce: await f.nonce(f.payer) })
        const rawHash = await f.request('eth_sendRawTransaction', raw)
        assert.equal(rawHash, keccak256(raw))
        const local = await f.send({ ...input, gas: input.gasLimit })
        for (const hash of [rawHash, local.hash]) {
          const tx = await f.request('eth_getTransactionByHash', hash)
          assert.deepEqual(tx.accessList, accessList)
          assert.equal(tx.type, toQuantity(type))
          assert.ok(tx.v === '0x0' || tx.v === '0x1')
          const reconstructed = Transaction.from({ ...input, gasLimit: tx.gas, nonce: Number(BigInt(tx.nonce)),
            signature: { r: tx.r, s: tx.s, v: Number(BigInt(tx.v)) } })
          assert.equal(reconstructed.hash, hash)
          assert.equal(reconstructed.from, f.payer)
          assert.equal((await f.request('eth_getTransactionReceipt', hash)).status, '0x1')
        }
      }
      const before = f.engine.snapshot()
      const costs: number[] = []
      for (const list of [[], accessList]) {
        await f.request('eth_registerCallId', 'access-list-read')
        const result = await f.request('eth_call', { to: target, type: 1, data: abi.encodeFunctionData('value'), accessList: list })
        assert.equal(BigInt(result), 42n)
        const hash = await f.request('eth_getHashFromTagBySimulator', 'access-list-read')
        const trace = await f.request('debug_traceTransaction', hash)
        costs.push(trace.structLogs.find(step => step.op === 'SLOAD').gasCost)
      }
      // Monad charges 8,100 for a cold storage read and 100 for a warm one.
      assert.deepEqual(costs, [8100, 100])
      assert.equal(f.engine.snapshot(), before)
    } finally { f.close() }
  })

  test(`${fork}: authorization chain and nonce checks survive saving an active delegation`, async () => {
    const f = await fixture(fork)
    let restored: Awaited<ReturnType<typeof fixture>>
    try {
      const target = await f.deploy()
      for (const options of [{ chainId: 1 }, { nonce: 1 }]) {
        const skipped = await f.send({ to: f.authority, type: 4, authorizationList: [await f.authorize(target, options)]})
        assert.equal(skipped.receipt.status, '0x1')
        assert.equal(await f.request('eth_getCode', f.authority), '0x')
        assert.equal(await f.nonce(f.authority), 0)
      }
      // Chain ID zero is valid for the existing account-menu delegation workflow.
      const delegated = await f.send({ to: f.authority, authorizationList: [await f.authorize(target, { chainId: 0 })],
        data: abi.encodeFunctionData('store', [42]) })
      assert.equal(delegated.receipt.status, '0x1')
      const state = await f.request('eth_getStateDb')
      restored = await fixture(fork, state)
      assert.deepEqual(await restored.request('eth_getStateDb'), state)
      assert.equal(await restored.nonce(f.authority), 1)
      assert.equal(await restored.request('eth_getCode', f.authority), '0xef0100' + target.slice(2).toLowerCase())
      assert.equal(BigInt(await restored.request('eth_getStorageAt', f.authority, ZeroHash)), 42n)
      await inspectStore(restored, delegated.hash, 42)
      const next = await restored.send({ to: f.authority, data: abi.encodeFunctionData('store', [77]) })
      await inspectStore(restored, next.hash, 77)
      await restored.send({ to: f.authority, authorizationList: [await restored.authorize(ZeroAddress)]})
      assert.equal(await restored.request('eth_getCode', f.authority), '0x')
      await inspectStore(restored, delegated.hash, 42)
      const nonce = await restored.nonce(f.authority)
      const self = await restored.send({ from: f.authority, to: f.authority,
        authorizationList: [await restored.authorize(target, { nonce: nonce + 1 })], data: abi.encodeFunctionData('store', [88]) })
      assert.equal(self.receipt.status, '0x1')
      assert.equal(await restored.nonce(f.authority), nonce + 2)
      await inspectStore(restored, self.hash, 88)
    } finally { restored?.close(); f.close() }
  })

  test(`${fork}: malformed lists and incompatible transaction fields leave state unchanged`, async () => {
    const f = await fixture(fork)
    try {
      const target = await f.deploy()
      const auth = await f.authorize(target)
      const tuple = { chainId: '0x8f', address: target, nonce: '0x0', yParity: auth.signature.yParity, r: auth.signature.r, s: auth.signature.s }
      const before = await f.request('eth_getStateDb')
      const invalid = [
        { type: 4, authorizationList: []}, { type: 4, to: null, authorizationList: [tuple]},
        { type: 4, authorizationList: {} }, { type: 4, authorizationList: [null]},
        { type: 1, authorizationList: [tuple]}, { type: 0, accessList: [{ address: target, storageKeys: []}]},
        { type: 1, accessList: [{ address: target, storageKeys: ['0x1']}]},
        { type: 1, accessList: [{ address: 'invalid', storageKeys: []}]},
        { type: 1, maxFeePerGas: '0x1' }, { type: 4, gasPrice: '0x1', authorizationList: [tuple]},
        { type: 3 }, { type: 2, blobVersionedHashes: []}
      ]
      for (const fields of [
        { nonce: -1 }, { nonce: '0x10000000000000000' }, { nonce: Number.MAX_SAFE_INTEGER + 1 },
        { chainId: -1 }, { chainId: '0x1' + '00'.repeat(32) }, { chainId: Number.MAX_SAFE_INTEGER + 1 },
        { yParity: 256 }, { r: '0x1' + '00'.repeat(32) }, { s: '-1' }
      ]) invalid.push({ type: 4, authorizationList: [{ ...tuple, ...fields }]})
      for (const input of invalid) {
        await assert.rejects(f.request('eth_sendTransaction', { from: f.payer, to: f.authority, ...input }))
        assert.deepEqual(await f.request('eth_getStateDb'), before)
      }
      const raw = await f.payerWallet.signTransaction({ type: 4, chainId: 1, nonce: await f.nonce(f.payer), to: f.authority,
        gasLimit: 100_000, maxFeePerGas: 1_000_000_000, maxPriorityFeePerGas: 1_000_000_000, authorizationList: [auth]})
      await assert.rejects(f.request('eth_sendRawTransaction', raw), /chain ID/i)
      assert.deepEqual(await f.request('eth_getStateDb'), before)
    } finally { f.close() }
  })

  test(`${fork}: account-menu actions authorize, restore and revoke delegation`, { timeout: 30_000 }, async () => {
    const f = await fixture(fork)
    let restored: Awaited<ReturnType<typeof fixture>>
    try {
      const target = await f.deploy()
      const accounts = [f.payer, f.authority].map(account => ({ account })) as any
      const actions: any[] = []
      const added: string[] = []
      let active = f
      const plugin = { call: async (name: string, method: string, ...params: any[]) => {
        if (name === 'terminal' || name === 'matomo') return
        if (name === 'web3Provider') return active.local.sendAsync(params[0])
        if (name === 'blockchain') {
          if (method === 'web3') return active.web3
          if (method === 'getCurrentFork') return fork
          assert.equal(method, 'dumpState')
          return active.request('eth_getStateDb')
        }
        if (name === 'compilerArtefacts') {
          if (method === 'getContractDataFromAddress') return { name: 'DelegatedAccount', file, contract: artifact }
          if (method === 'getCompilerAbstract') return { getContracts: () => compiled.contracts }
          assert.equal(method, 'addResolvedContract')
          return
        }
        assert.equal(name, 'udappDeployedContracts')
        assert.equal(method, 'addInstance')
        added.push(params[0])
      } } as any
      await authorizeDelegation(target, plugin, f.authority, accounts, action => actions.push(action))
      assert.deepEqual(added, [f.authority])
      assert.ok(actions.some(action => action.type === 'SET_DELEGATION' && action.payload.address.toLowerCase() === target.toLowerCase()))
      restored = await fixture(fork, await f.request('eth_getStateDb'))
      active = restored
      for (const name of [`vm-${fork}`, 'vm-fs-saved-monad']) {
        actions.length = 0
        await loadAllDelegations(plugin, accounts, name, action => actions.push(action))
        assert.equal(actions.length, 1)
        assert.equal(actions[0].payload.account, f.authority)
        assert.equal(actions[0].payload.address.toLowerCase(), target.toLowerCase())
      }
      await authorizeDelegation(ZeroAddress, plugin, f.authority, accounts, action => actions.push(action))
      assert.equal(await restored.request('eth_getCode', f.authority), '0x')
      assert.ok(actions.some(action => action.type === 'REMOVE_DELEGATION' && action.payload === f.authority))
    } finally { restored?.close(); f.close() }
  })

  test(`${fork}: the example executes access lists and delegation, then debugs after revocation`, { timeout: 30_000 }, async () => {
    const f = await fixture(fork)
    const providers: BrowserProvider[] = []
    try {
      const files = new Map([['artifacts/DelegatedAccount.json', JSON.stringify({ abi: artifact.abi, data: { bytecode: artifact.evm.bytecode } })]])
      const messages: string[] = []
      const script = readFileSync('libs/remix-monad/examples/delegated-transactions.js', 'utf8').replace("import { ethers } from 'ethers'", '')
      await runInNewContext(`(async () => { ${script} })()`, {
        ethers: { ...ethers, BrowserProvider: class extends BrowserProvider {
          constructor(...args: ConstructorParameters<typeof BrowserProvider>) { super(...args); this.pollingInterval = 10; providers.push(this) }
        } },
        web3Provider: f.local,
        remix: { call: async (name: string, method: string, path: string, content?: string) => {
          assert.equal(name, 'fileManager')
          if (method === 'writeFile') { files.set(path, content); return }
          assert.equal(method, 'readFile')
          assert.ok(files.has(path))
          return files.get(path)
        } },
        console: { log: (message: string) => messages.push(message) }
      })
      const result = JSON.parse(files.get('MonadDelegation.json'))
      assert.equal(result.authority, f.authority)
      assert.equal(await f.request('eth_getCode', f.authority), '0x')
      assert.equal(BigInt(await f.request('eth_getStorageAt', f.authority, ZeroHash)), 77n)
      for (const [hash, value, type] of [[result.delegation, 42, '0x4'], [result.access, 77, '0x1']]) {
        assert.equal((await f.request('eth_getTransactionByHash', hash)).type, type)
        assert.ok(messages.some(message => message.includes(hash)))
        await inspectStore(f, hash, value)
      }
    } finally { providers.forEach(provider => provider.destroy()); f.close() }
  })

  test(`${fork}: invalid authorization signatures are skipped without rejecting signed or unlocked transactions`, async () => {
    const f = await fixture(fork)
    try {
      const target = await f.deploy()
      for (const raw of [true, false]) {
        const authorization = await f.authorize(target)
        const valid = { chainId: toQuantity(authorization.chainId), address: authorization.address, nonce: toQuantity(authorization.nonce),
          yParity: authorization.signature.yParity, r: authorization.signature.r, s: authorization.signature.s }
        const highS = '0x' + 'ff'.repeat(32)
        const authorizations = [{ ...valid, yParity: 2 }, { ...valid, s: highS }, valid]
        const input = { to: f.authority, type: 4, data: abi.encodeFunctionData('store', [42]), gasLimit: 30_000_000,
          chainId: 143, nonce: await f.nonce(f.payer), maxFeePerGas: 1_000_000_000, maxPriorityFeePerGas: 1_000_000_000 }
        const before = f.engine.snapshot()
        await f.request('eth_call', { ...input, from: f.payer, authorizationList: authorizations })
        await assert.rejects(f.request('eth_sendTransaction', { ...input, from: f.payer, authorizationList: [{ ...valid, yParity: 256 }]}), /authorization quantity/)
        assert.equal(f.engine.snapshot(), before)
        let hash: string
        if (raw) {
          // Sign the envelope independently: ethers rejects these inner signatures before Rust sees them.
          const tx = Transaction.from({ ...input, authorizationList: [authorization]})
          const fields = decodeRlp('0x' + tx.unsignedSerialized.slice(4)) as any[]
          const quantity = value => hexlify(toBeArray(value))
          fields[9] = authorizations.map(auth => [quantity(auth.chainId), auth.address, quantity(auth.nonce), quantity(auth.yParity), quantity(auth.r), quantity(auth.s)])
          const signature = f.payerWallet.signingKey.sign(keccak256(concat(['0x04', encodeRlp(fields)])))
          const encoded = concat(['0x04', encodeRlp([...fields, quantity(signature.yParity), quantity(signature.r), quantity(signature.s)])])
          const noncanonical = concat(['0x04', encodeRlp(['0x008f', ...fields.slice(1), quantity(signature.yParity), quantity(signature.r), quantity(signature.s)])])
          await assert.rejects(f.request('eth_sendRawTransaction', noncanonical), /Noncanonical/)
          await assert.rejects(f.request('eth_sendRawTransaction', tx.unsignedSerialized), /Invalid signed/)
          hash = await f.request('eth_sendRawTransaction', encoded)
          assert.equal(hash, keccak256(encoded))
        } else {
          hash = await f.request('eth_sendTransaction', { ...input, from: f.payer, authorizationList: authorizations })
        }
        assert.equal((await f.request('eth_getTransactionReceipt', hash)).status, '0x1')
        const tx = await f.request('eth_getTransactionByHash', hash)
        assert.equal(tx.authorizationList[0].yParity, '0x2')
        assert.equal(tx.authorizationList[1].s, highS)
        assert.equal(tx.authorizationList.length, 3)
        assert.deepEqual((await getTransactionForDebugging(f.web3, hash)).toJSON().authorizationList, tx.authorizationList)
        assert.equal(await f.nonce(f.authority), raw ? 1 : 2)
        assert.equal(await f.request('eth_getCode', f.authority), '0xef0100' + target.slice(2).toLowerCase())
        await inspectStore(f, hash, 42)
      }
    } finally { f.close() }
  })

  test(`${fork}: typed calls, signed transactions, delegation and historical source debugging`, { timeout: 30_000 }, async () => {
    const f = await fixture(fork)
    let restored: Awaited<ReturnType<typeof fixture>>
    try {
      const target = await f.deploy()
      const auth = await f.authorize(target)
      const input = { from: f.payer, to: f.authority, type: 4, data: abi.encodeFunctionData('store', [42]), authorizationList: [auth],
        accessList: [{ address: f.authority, storageKeys: [ZeroHash]}], maxFeePerGas: '0x77359400', maxPriorityFeePerGas: '0x3b9aca00', gas: '0x2dc6c0' }
      const before = f.engine.snapshot()
      await f.request('eth_registerCallId', 'delegation-simulation')
      await f.request('eth_call', input)
      const simulationHash = await f.request('eth_getHashFromTagBySimulator', 'delegation-simulation')
      await inspectStore(f, simulationHash, 42)
      const gas = await f.request('eth_estimateGas', input)
      assert.ok(BigInt(gas) > 21000n)
      assert.equal(f.engine.snapshot(), before)
      const raw = await f.payerWallet.signTransaction({ ...input, gasLimit: input.gas, chainId: 143, nonce: await f.nonce(f.payer) })
      const hash = await f.request('eth_sendRawTransaction', raw)
      const tx = await f.request('eth_getTransactionByHash', hash)
      const receipt = await f.request('eth_getTransactionReceipt', hash)
      assert.equal(tx.type, '0x4')
      assert.equal(tx.authorizationList.length, 1)
      assert.equal(BigInt(tx.authorizationList[0].chainId), 143n)
      assert.deepEqual(tx.accessList, input.accessList)
      assert.equal(receipt.status, '0x1')
      assert.equal(BigInt(receipt.gasUsed), 3_000_000n)
      assert.equal(receipt.effectiveGasPrice, '0x3b9aca00')
      assert.equal(await f.nonce(f.authority), 1)
      assert.equal(await f.request('eth_getCode', f.authority), '0xef0100' + target.slice(2).toLowerCase())
      assert.equal(BigInt(await f.request('eth_getStorageAt', f.authority, ZeroHash)), 42n)
      assert.equal(BigInt(await f.request('eth_getStorageAt', target, ZeroHash)), 0n)
      assert.equal(receipt.logs[0].address.toLowerCase(), f.authority.toLowerCase())
      await inspectStore(f, hash, 42)
      for (const type of [1, 2]) {
        const request = { to: f.authority, type, data: abi.encodeFunctionData('store', [40 + type]), accessList: input.accessList }
        const sent = await f.send(request)
        assert.equal(sent.receipt.status, '0x1')
        assert.deepEqual((await f.request('eth_getTransactionByHash', sent.hash)).accessList, input.accessList)
        await inspectStore(f, sent.hash, 40 + type)
      }
      const revoked = await f.send({ to: f.authority, type: 4, authorizationList: [await f.authorize(ZeroAddress)]})
      assert.equal(revoked.receipt.status, '0x1')
      assert.equal(await f.request('eth_getCode', f.authority), '0x')
      // Inspect an earlier transaction after its executing account has lost its code.
      await inspectStore(f, hash, 42)
      restored = await fixture(fork, await f.request('eth_getStateDb'))
      assert.equal(await restored.request('eth_getCode', f.authority), '0x')
      await inspectStore(restored, hash, 42)
      const state = restored.engine.snapshot()
      await assert.rejects(restored.request('eth_sendTransaction', { to: f.authority, type: 4, authorizationList: []}), /nonempty/)
      await assert.rejects(restored.request('eth_sendTransaction', { to: f.authority, type: 3 }), /unsupported/)
      assert.equal(restored.engine.snapshot(), state)
    } finally { restored?.close(); f.close() }
  })

  test(`${fork}: authorizations survive caller failure and reserve rules use saved block participants`, { timeout: 30_000 }, async () => {
    const f = await fixture(fork)
    let restored: Awaited<ReturnType<typeof fixture>>
    try {
      const target = await f.deploy()
      const failed = await f.send({ to: f.authority, type: 4, authorizationList: [await f.authorize(target)], data: abi.encodeFunctionData('reject') })
      assert.equal(failed.receipt.status, '0x0')
      assert.deepEqual(failed.receipt.logs, [])
      assert.equal(await f.nonce(f.authority), 1)
      assert.equal(await f.request('eth_getCode', f.authority), '0xef0100' + target.slice(2).toLowerCase())
      assert.equal(BigInt(await f.request('eth_getStorageAt', f.authority, ZeroHash)), 0n)
      const debug = await f.debug(failed.hash)
      const steps = debug.getTrace()
      assert.equal(steps.at(-1).op, 'REVERT')
      const decoded = await debug.decodeStateAt(steps.length - 1, await debug.extractStateAt(steps.length - 1)) as any
      assert.equal(BigInt(decoded.value.value), 99n)
      for (const method of ['createChild', 'createChild2']) {
        const transaction = await f.send({ to: f.authority, data: abi.encodeFunctionData(method) })
        assert.equal(transaction.receipt.status, '0x0')
        assert.ok(transaction.trace.structLogs.some(step => step.op === (method.endsWith('2') ? 'CREATE2' : 'CREATE')))
      }
      f.engine.fund(f.authority, toQuantity(parseEther('12')))
      const recipientBefore = await f.request('eth_getBalance', f.recipient)
      const reserve = await f.send({ to: f.authority, data: abi.encodeFunctionData('transfer', [f.recipient, parseEther('4')]) })
      assert.equal(reserve.receipt.status, '0x0')
      assert.equal(await f.request('eth_getBalance', f.recipient), recipientBefore)
      await f.send({ to: f.authority, type: 4, authorizationList: [await f.authorize(ZeroAddress)]})
      restored = await fixture(fork, await f.request('eth_getStateDb'))
      const spend = { from: f.authority, to: f.recipient, value: toQuantity(parseEther('4')), gasPrice: '0x0' }
      const rejected = await restored.send(spend)
      assert.equal(rejected.receipt.status, '0x0', 'revoked authority remains protected in recent block history')
      assert.equal(await restored.request('eth_getBalance', f.recipient), recipientBefore)
      await restored.send({ to: f.payer })
      await restored.send({ to: f.payer })
      const allowed = await restored.send(spend)
      assert.equal(allowed.receipt.status, '0x1', 'undelegated sender may spend after two intervening blocks')
      assert.equal(BigInt(await restored.request('eth_getBalance', f.authority)), parseEther('8'))
    } finally { restored?.close(); f.close() }
  })
}
