import { expect, test } from '@playwright/test'
import { build } from 'esbuild'

let client: string

test.beforeAll(async () => {
  client = (await build({
    bundle: true, write: false, platform: 'browser', format: 'esm',
    plugins: [{
      name: 'simulator-fixture',
      setup(plugin) {
        plugin.onResolve({ filter: /^@remix-project\/remix-simulator$/ }, () => ({ path: 'simulator', namespace: 'fixture' }))
        plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const extendProvider = () => {}' }))
      }
    }],
    stdin: {
      resolveDir: process.cwd(), loader: 'ts', contents: `
        import { VMProvider } from './apps/remix-ide/src/blockchain/providers/vm'
        const workers = []
        class TestWorker extends EventTarget {
          messages = []
          terminated = false
          constructor() { super(); workers.push(this) }
          postMessage(message) { this.messages.push(message) }
          terminate() { this.terminated = true }
          reply(data) { this.dispatchEvent(new MessageEvent('message', { data })) }
        }
        window.Worker = TestWorker
        const fixture = { workers, context: 'vm-osaka', installed: [], unhandled: [] }
        window.addEventListener('unhandledrejection', event => fixture.unhandled.push(event.reason.message))
        fixture.vm = new VMProvider({
          getProviderObject: () => ({ options: {} }),
          getCurrentFork: () => fixture.context.replace('vm-', ''),
          getProvider: () => fixture.context,
          setWeb3: (context, web3) => fixture.installed.push({ context, web3 })
        })
        fixture.reset = async () => {
          const reset = fixture.vm.resetEnvironment()
          workers.at(-1).reply({ cmd: 'initiateResult' })
          await reset
          return workers.at(-1)
        }
        window.fixture = fixture
      `
    }
  })).outputFiles[0].text
})

test.beforeEach(async ({ page }) => {
  await page.route('http://vm-lifecycle.test/**', route => route.fulfill({
    contentType: route.request().url().endsWith('.js') ? 'application/javascript' : 'text/html',
    body: route.request().url().endsWith('.js') ? client : '<script type="module" src="/client.js"></script>'
  }))
  await page.goto('http://vm-lifecycle.test')
  await page.waitForFunction(() => !!(window as any).fixture)
})

test('switching rejects pending RPC promises and the replacement serves requests', async ({ page }) => {
  await page.evaluate(async () => {
    const f = (window as any).fixture
    await f.reset()
    f.results = []
    for (const method of ['request', 'sendAsync']) {
      f.vm.provider[method]({ method: 'eth_getBalance', params: []}).then(
        () => f.results.push('unexpected success'), error => f.results.push(error.message)
      )
    }
    const worker = await f.reset()
    const balance = f.vm.provider.request({ method: 'eth_getBalance', params: []})
    worker.reply({ cmd: 'requestResult', stamp: worker.messages.at(-1).stamp, result: '0x42' })
    f.balance = await balance
  })
  await expect.poll(() => page.evaluate(() => (window as any).fixture.results)).toEqual([
    'VM environment was reset', 'VM environment was reset'
  ])
  expect(await page.evaluate(() => ({
    balance: (window as any).fixture.balance,
    terminated: (window as any).fixture.workers[0].terminated
  }))).toEqual({ balance: '0x42', terminated: true })
})

test('switching settles callbacks once without unhandled promise rejections', async ({ page }) => {
  await page.evaluate(async () => {
    const f = (window as any).fixture
    const worker = await f.reset()
    f.results = []
    f.vm.provider.sendAsync({ method: 'eth_getBalance', params: []}, error => f.results.push(['rpc', error?.message]))
    f.vm.newAccount(null, error => f.results.push(['account', error?.message]))
    const pending = worker.messages.slice(1)
    await f.reset()
    for (const message of pending) worker.reply({
      cmd: message.cmd === 'newAccount' ? 'newAccountResult' : 'sendAsyncResult', stamp: message.stamp, result: 'late'
    })
  })
  await expect.poll(() => page.evaluate(() => (window as any).fixture.results)).toEqual([
    ['rpc', 'VM environment was reset'], ['account', 'VM environment was reset']
  ])
  expect(await page.evaluate(() => (window as any).fixture.unhandled)).toEqual([])
})

test('old provider references reject without sending requests to either worker', async ({ page }) => {
  await page.evaluate(async () => {
    const f = (window as any).fixture
    await f.reset()
    const old = f.vm.provider
    await f.reset()
    f.results = []
    old.request({ method: 'eth_sendTransaction', params: []}).catch(error => f.results.push(error.message))
    old.sendAsync({ method: 'eth_accounts', params: []}, error => f.results.push(error?.message))
  })
  await expect.poll(() => page.evaluate(() => (window as any).fixture.results)).toEqual([
    'VM environment was reset', 'VM environment was reset'
  ])
  expect(await page.evaluate(() => (window as any).fixture.workers.map(worker => worker.messages.map(message => message.cmd)))).toEqual([
    ['init'], ['init']
  ])
})

test('an overlapping reset cancels initialization and ignores stale replies', async ({ page }) => {
  await page.evaluate(async () => {
    const f = (window as any).fixture
    f.results = []
    f.vm.resetEnvironment().then(() => f.results.push('unexpected success'), error => f.results.push(error.message))
    const oldWorker = f.workers[0]
    f.context = 'vm-cancun'
    await f.reset()
    const provider = f.vm.provider
    oldWorker.reply({ cmd: 'initiateResult' })
    f.sameProvider = f.vm.provider === provider
  })
  await expect.poll(() => page.evaluate(() => (window as any).fixture.results)).toEqual(['VM environment was reset'])
  expect(await page.evaluate(() => ({
    contexts: (window as any).fixture.installed.map(({ context }) => context),
    sameProvider: (window as any).fixture.sameProvider
  }))).toEqual({ contexts: ['vm-cancun'], sameProvider: true })
})

test('initialization installs web3 only for the context that started it', async ({ page }) => {
  const contexts = await page.evaluate(async () => {
    const f = (window as any).fixture
    const reset = f.vm.resetEnvironment()
    f.context = 'injected'
    f.workers[0].reply({ cmd: 'initiateResult' })
    await reset
    return f.installed.map(({ context }) => context)
  })
  expect(contexts).toEqual(['vm-osaka'])
})

test('completed requests and account callbacks are removed before another reset', async ({ page }) => {
  const results = await page.evaluate(async () => {
    const f = (window as any).fixture
    const worker = await f.reset()
    const results = []
    f.vm.provider.sendAsync({ method: 'eth_accounts', params: []}, (error, result) => results.push({ error: error?.message, result }))
    const rpc = { cmd: 'sendAsyncResult', stamp: worker.messages.at(-1).stamp, result: ['0x1234']}
    worker.reply(rpc)
    worker.reply(rpc)
    f.vm.newAccount(null, (error, result) => results.push({ error: error?.message, result }))
    worker.reply({ cmd: 'newAccountResult', stamp: worker.messages.at(-1).stamp, result: '0x5678' })
    await f.reset()
    return results
  })
  expect(results).toEqual([{ error: undefined, result: ['0x1234']}, { error: undefined, result: '0x5678' }])
})

test('a stale reply cannot settle a request in the replacement worker', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const f = (window as any).fixture
    const oldWorker = await f.reset()
    const worker = await f.reset()
    const pending = f.vm.provider.request({ method: 'eth_blockNumber', params: []})
    const stamp = worker.messages.at(-1).stamp
    oldWorker.reply({ cmd: 'requestResult', stamp, result: 'stale' })
    worker.reply({ cmd: 'requestResult', stamp, result: '0x1' })
    return pending
  })
  expect(result).toBe('0x1')
})

test('worker errors settle each request once and leave later requests usable', async ({ page }) => {
  const results = await page.evaluate(async () => {
    const f = (window as any).fixture
    const worker = await f.reset()
    const results = []
    for (const method of ['request', 'sendAsync']) {
      const pending = f.vm.provider[method]({ method: 'eth_call', params: []}).catch(error => results.push(error.message))
      worker.reply({ cmd: method + 'Result', stamp: worker.messages.at(-1).stamp, error: new Error('execution reverted') })
      await pending
    }
    f.vm.provider.sendAsync({ method: 'eth_call', params: []}, error => results.push(error.message))
    worker.reply({ cmd: 'sendAsyncResult', stamp: worker.messages.at(-1).stamp, error: new Error('callback error') })
    f.vm.newAccount(null, error => results.push(error.message))
    worker.reply({ cmd: 'newAccountResult', stamp: worker.messages.at(-1).stamp, error: new Error('account error') })
    const pending = f.vm.provider.request({ method: 'eth_blockNumber', params: []}).then(value => results.push(value))
    worker.reply({ cmd: 'requestResult', stamp: worker.messages.at(-1).stamp, result: '0x1' })
    await pending
    await f.reset()
    return results
  })
  expect(results).toEqual(['execution reverted', 'execution reverted', 'callback error', 'account error', '0x1'])
})

test('a failed postMessage rejects without leaving a callback pending on reset', async ({ page }) => {
  const results = await page.evaluate(async () => {
    const f = (window as any).fixture
    const worker = await f.reset()
    worker.postMessage = () => { throw new Error('Message could not be cloned') }
    const results = []
    await f.vm.provider.request({ method: 'eth_call', params: []}).catch(error => results.push(error.message))
    f.vm.provider.sendAsync({ method: 'eth_call', params: []}, error => results.push(error.message))
    await f.reset()
    return results
  })
  expect(results).toEqual(['Message could not be cloned', 'Message could not be cloned'])
})

test('switching destroys the previous ethers provider and cancels queued RPCs', async ({ page }) => {
  await page.evaluate(async () => {
    const f = (window as any).fixture
    const worker = await f.reset()
    f.oldWeb3 = f.vm.web3
    f.result = ''
    f.oldWeb3.send('eth_blockNumber', []).then(
      () => { f.result = 'unexpected success' }, error => { f.result = error.message }
    )
    f.oldWorker = worker
  })
  await page.waitForFunction(() => (window as any).fixture.oldWorker.messages.some(message => message.query?.method === 'eth_chainId'))
  await page.evaluate(() => (window as any).fixture.reset())
  await expect.poll(() => page.evaluate(() => (window as any).fixture.result)).toMatch(/VM environment was reset|provider destroyed/)
  expect(await page.evaluate(() => (window as any).fixture.oldWeb3.destroyed)).toBe(true)
})

for (const operation of ['gas price', 'signer lookup']) {
  test(`switching settles the pending ${operation} callback`, async ({ page }) => {
    await page.evaluate(async operation => {
      const f = (window as any).fixture
      await f.reset()
      f.errors = []
      const callback = error => f.errors.push(error?.message)
      if (operation === 'gas price') f.vm.getGasPrice(callback)
      else f.vm.signMessage('hello', '0x0000000000000000000000000000000000000001', null, callback)
      await f.reset()
    }, operation)
    await expect.poll(() => page.evaluate(() => (window as any).fixture.errors)).toEqual([
      expect.stringMatching(/VM environment was reset|provider destroyed/)
    ])
    expect(await page.evaluate(() => (window as any).fixture.unhandled)).toEqual([])
  })
}
