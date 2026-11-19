import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EventManager } from '../../libs/remix-lib/src/eventManager'
import { TxListener } from '../../libs/remix-lib/src/execution/txListener'
import { MONAD_CURRENCY, formatMonadValue, isMonadCurrency } from '../../libs/remix-monad/src/presentation'
import { initListeningOnNetwork } from '../../libs/remix-ui/terminal/src/lib/actions/terminalAction'

const ETH_CURRENCY = { name: 'Ether', symbol: 'ETH', decimals: 18 }
const ADDRESS = '0x0000000000000000000000000000000000000001'
const HASH = '0x' + '1'.repeat(64)
const VALUE = 10n ** 18n

function deferred<T>() {
  let resolve: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve: (value: T) => resolve(value) }
}

function setup(sourceCurrency: typeof MONAD_CURRENCY, known: boolean) {
  let currency = sourceCurrency
  const udapp = new EventManager()
  const resolving = deferred<void>()
  const resume = deferred<void>()
  const logged = deferred<void>()
  const actions: any[] = []
  const transaction = { hash: HASH, to: ADDRESS, from: ADDRESS, data: '0x', value: VALUE }
  const web3 = {
    getTransaction: async () => transaction,
    getCode: async () => '0x',
    getBlock: async (_number: number, _prefetch: boolean) => ({ prefetchedTransactions: [transaction]})
  }
  const executionContext = {
    event: new EventManager(),
    isVM: () => false,
    getProvider: () => 'injected-MetaMask',
    web3: () => web3
  }
  const listener = new TxListener({
    event: { udapp },
    api: {
      getNetworkCurrency: () => currency,
      contracts: async () => {
        resolving.resolve()
        await resume.promise
        return {}
      },
      resolveReceipt: (tx, callback) => callback(null, { status: 1, transactionHash: tx.hash })
    }
  }, executionContext)
  if (known) {
    listener._resolvedContracts[ADDRESS] = {
      name: 'Payable',
      object: { abi: [{ type: 'receive', stateMutability: 'payable' }], evm: { methodIdentifiers: {} } }
    }
  }
  listener.startListening()
  initListeningOnNetwork({
    txListener: listener,
    blockchain: { getProvider: executionContext.getProvider, getCurrentNetworkCurrency: () => currency },
    _deps: {
      fileManager: { getCurrentFile: () => undefined },
      compilersArtefacts: { get: () => ({ getContracts: async () => ({}) }) }
    },
    eventsDecoder: { parseLogs: (_tx, _name, _contracts, callback) => callback(null, { decoded: [], raw: []}) }
  }, action => {
    actions.push(action)
    logged.resolve()
  })
  return {
    listener, udapp, web3, transaction, resolving, resume, logged, actions,
    switchCurrency: (next: typeof MONAD_CURRENCY) => {
      currency = next
      // Wallet chain changes retain the same provider name.
      executionContext.event.trigger('contextChanged', ['injected-MetaMask'])
    }
  }
}

for (const [source, destination] of [[ETH_CURRENCY, MONAD_CURRENCY], [MONAD_CURRENCY, ETH_CURRENCY]]) {
  for (const kind of ['unknown transaction', 'known transaction', 'call'] as const) {
    test(`${kind} retains ${source.symbol} when switching to ${destination.symbol} during resolution`, { timeout: 2000 }, async t => {
      const state = setup(source, kind !== 'unknown transaction')
      t.after(() => state.listener.stopListening())
      const result = { transactionHash: HASH, receipt: { status: 1 }, tx: {}, result: '0x' }
      state.udapp.trigger(kind === 'call' ? 'callExecuted' : 'transactionExecuted', [
        null, ADDRESS, ADDRESS, '0x', kind === 'call', result
      ])

      await state.resolving.promise
      state.switchCurrency(destination)
      state.resume.resolve()
      await state.logged.promise

      assert.equal(state.actions.length, 1)
      const { type, payload } = state.actions[0]
      assert.equal(type, kind === 'unknown transaction' ? 'unknownTransaction' : 'knownTransaction')
      assert.equal(payload.provider, 'injected-MetaMask')
      assert.deepEqual(payload.currency, source)
      assert.equal(Boolean(payload.message[0].tx.isCall), kind === 'call')
      if (kind !== 'call') {
        const value = payload.message[0].tx.value
        assert.equal(isMonadCurrency(payload.currency) ? formatMonadValue(value) : `${value} wei`,
          source.symbol === 'MON' ? '1.0 MON' : '1000000000000000000 wei')
      }
    })
  }
}

test('a polled block retains MON for every transaction after a network switch', { timeout: 2000 }, async t => {
  const state = setup(MONAD_CURRENCY, false)
  t.after(() => state.listener.stopListening())
  const blockRequested = deferred<void>()
  const blockReady = deferred<void>()
  state.web3.getBlock = async () => {
    blockRequested.resolve()
    await blockReady.promise
    const transactions = [state.transaction, { ...state.transaction, hash: '0x' + '2'.repeat(64) }]
    return { prefetchedTransactions: transactions, transactions }
  }
  const loading = state.listener._manageBlock(1)
  await blockRequested.promise
  state.switchCurrency(ETH_CURRENCY)
  blockReady.resolve()
  state.resume.resolve()
  await loading
  assert.equal(state.actions.length, 2)
  for (const { payload } of state.actions) {
    assert.deepEqual(payload.currency, MONAD_CURRENCY)
    assert.equal(payload.provider, 'injected-MetaMask')
  }
})
