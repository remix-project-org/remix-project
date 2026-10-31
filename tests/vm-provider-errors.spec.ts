import { test, expect } from '@playwright/test'
import { build } from 'esbuild'

// Keep execution deterministic while exercising the production provider and worker transport.
const simulator = `
export const extendProvider = () => {}
export class Provider {
  constructor(options) { this.options = options }
  async init() {
    if (this.options.fork === 'init-error') throw new Error('VM initialization failed')
  }
  async request(query) {
    if (query.method === 'string-error') throw 'Request failed'
    throw Object.assign(new Error('execution reverted'), { code: -32015, data: '0xdeadbeef' })
  }
  sendAsync(query, callback) {
    this.request(query).then(result => callback(null, result), error => callback(error, null))
  }
}
`

let client: string
let worker: string

test.beforeAll(async () => {
  const options = {
    bundle: true, write: false, platform: 'browser' as const,
    plugins: [{
      name: 'test-simulator',
      setup(plugin) {
        plugin.onResolve({ filter: /^@remix-project\/remix-simulator$/ }, () => ({ path: 'simulator', namespace: 'fixture' }))
        plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: simulator, loader: 'js' }))
      }
    }]
  }
  client = (await build({
    ...options, format: 'esm',
    stdin: {
      resolveDir: process.cwd(), loader: 'ts', contents: `
        import { VMProvider } from './apps/remix-ide/src/blockchain/providers/vm'
        const fixture = { fork: 'cancun', vm: null }
        fixture.vm = new VMProvider({
          getProviderObject: () => ({ options: {} }),
          getCurrentFork: () => fixture.fork,
          getProvider: () => 'vm-cancun',
          setWeb3: () => {}
        })
        window.fixture = fixture
      `
    }
  })).outputFiles[0].text
  worker = (await build({
    ...options, format: 'iife', entryPoints: ['apps/remix-ide/src/blockchain/providers/worker-vm.ts']
  })).outputFiles[0].text
})

test.beforeEach(async ({ page }) => {
  await page.route('http://vm-provider.test/**', route => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname === '/client.js') return route.fulfill({ body: client, contentType: 'application/javascript' })
    if (pathname === '/worker-vm') return route.fulfill({ body: worker, contentType: 'application/javascript' })
    return route.fulfill({ body: '<script type="module" src="/client.js"></script>', contentType: 'text/html' })
  })
  await page.goto('http://vm-provider.test')
  await page.waitForFunction(() => !!(window as any).fixture)
})

test('request errors retain their message, RPC code and revert data across the worker boundary', async ({ page }) => {
  const error = await page.evaluate(async () => {
    const { vm } = (window as any).fixture
    await vm.resetEnvironment()
    try { await vm.provider.request({ method: 'eth_call', params: []}) } catch (error) {
      return { message: error.message, code: error.code, data: error.data }
    }
  })
  expect(error).toEqual({ message: 'execution reverted', code: -32015, data: '0xdeadbeef' })
})

test('sendAsync errors retain RPC details across the worker boundary', async ({ page }) => {
  const error = await page.evaluate(async () => {
    const { vm } = (window as any).fixture
    await vm.resetEnvironment()
    return new Promise(resolve => vm.provider.sendAsync({ method: 'eth_call', params: []}, error => {
      resolve({ message: error.message, code: error.code, data: error.data })
    }))
  })
  expect(error).toEqual({ message: 'execution reverted', code: -32015, data: '0xdeadbeef' })
})

test('string failures have a usable message and fallback JSON-RPC code', async ({ page }) => {
  const error = await page.evaluate(async () => {
    const { vm } = (window as any).fixture
    await vm.resetEnvironment()
    try { await vm.provider.request({ method: 'string-error', params: []}) } catch (error) {
      return { message: error.message, code: error.code }
    }
  })
  expect(error).toEqual({ message: 'Request failed', code: -32603 })
})

test('worker initialization failures preserve their original message', async ({ page }) => {
  const message = await page.evaluate(async () => {
    const fixture = (window as any).fixture
    fixture.fork = 'init-error'
    try { await fixture.vm.resetEnvironment() } catch (error) { return error.message }
  })
  expect(message).toBe('VM initialization failed')
})

test('invalid saved JSON rejects initialization and a subsequent reset can succeed', async ({ page }) => {
  test.setTimeout(10_000)
  const result = await page.evaluate(async () => {
    const { vm } = (window as any).fixture
    let rejected = false
    try { await vm.resetEnvironment('{invalid') } catch (error) { rejected = error instanceof SyntaxError }
    await vm.resetEnvironment()
    return { rejected, initialized: !!vm.web3 }
  })
  expect(result).toEqual({ rejected: true, initialized: true })
})
