import { expect, Page, test } from '@playwright/test'

const baseURL = process.env.REMIX_BASE_URL || 'http://127.0.0.1:8080'
const pageErrors = new WeakMap<Page, string[]>()

test.use({ viewport: { width: 1600, height: 1000 }, actionTimeout: 20_000 })
test.setTimeout(90_000)

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  pageErrors.set(page, errors)
  page.on('pageerror', error => errors.push(error.message))
})

test.afterEach(async ({ page }, testInfo) => {
  await testInfo.attach('browser-errors', { body: (pageErrors.get(page) || []).join('\n'), contentType: 'text/plain' })
})

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    ;(window as any).__IS_E2E_TEST__ = true
    const state = { holdFork: '', holdInitFork: '', failFork: '', held: 0, initHeld: false, terminated: false, result: '' }
    ;(window as any).__vmSwitchTest = state
    const NativeWorker = window.Worker
    window.Worker = class extends NativeWorker {
      fork: string
      postMessage(message: any, options?: any) {
        if (message?.cmd === 'init') this.fork = message.fork
        if (message?.cmd === 'init' && this.fork === state.holdInitFork) {
          state.initHeld = true
          return
        }
        // Leave balance requests pending until this worker is replaced, without a timing-based delay.
        if (this.fork === state.holdFork && message?.query?.method === 'eth_getBalance') {
          state.held++
          return
        }
        if (this.fork === state.failFork && message?.query?.method === 'eth_getBalance') {
          queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', { data: {
            cmd: message.cmd + 'Result', stamp: message.stamp, error: new Error('Balance read failed')
          } })))
          return
        }
        super.postMessage(message, options)
      }
      terminate() {
        if (this.fork === state.holdFork) state.terminated = true
        super.terminate()
      }
    }
  })
  await page.route(/^https:\/\/(cdn\.paddle\.com|tally\.so)\//, route => route.fulfill({ body: '', contentType: 'application/javascript' }))
  await page.goto(`${baseURL}/#activate=udapp,filePanel`, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('[data-id="workspaceloaded"]')).toBeAttached({ timeout: 60_000 })
  await expect(page.locator('[data-id="apploaded"]')).toBeAttached()
  await page.locator('#icon-panel div[plugin="udapp"]').click()
  await expect(page.locator('[data-id="selected-provider-vm-osaka"]')).toBeVisible()
  await expect(page.locator('[data-id="runTabSelectAccount"]')).toContainText('ETH')
  await page.waitForFunction(() => !!(window as any).__remixVM_web3)
})

async function switchFork(page: Page, fork: string) {
  const previous = await page.evaluateHandle(() => (window as any).__remixVM_web3)
  try {
    await page.locator('[data-id="settingsSelectEnvCategoryOptions"]').click()
    await page.locator(`[data-id="dropdown-item-vm-${fork}"]`).click()
    await expect(page.locator(`[data-id="selected-provider-vm-${fork}"]`)).toBeVisible()
    await page.waitForFunction(previous => (window as any).__remixVM_web3 !== previous, previous)
  } finally {
    await previous.dispose()
  }
}

async function expectUsableVM(page: Page) {
  await expect(page.locator('[data-id="runTabSelectAccount"]')).toContainText('ETH')
  const result = await page.evaluate(async () => {
    const web3 = (window as any).__remixVM_web3
    const [from, to] = await web3.send('eth_accounts', [])
    const hash = await web3.send('eth_sendTransaction', [{ from, to, value: '0x1', gas: '0x5208' }])
    const receipt = await web3.send('eth_getTransactionReceipt', [hash])
    return { accounts: !!from && !!to, status: receipt.status }
  })
  expect(result).toEqual({ accounts: true, status: '0x1' })
}

test('switching forks settles an in-flight RPC and rejects the old provider', async ({ page }) => {
  await page.evaluate(async () => {
    const state = (window as any).__vmSwitchTest
    const old = (window as any).__remixVM_web3
    const [address] = await old.send('eth_accounts', [])
    state.old = old
    state.holdFork = 'osaka'
    old.send('eth_getBalance', [address, 'latest']).then(
      () => { state.result = 'unexpected success' }, error => { state.result = error.message }
    )
  })
  await page.waitForFunction(() => (window as any).__vmSwitchTest.held > 0)
  await switchFork(page, 'cancun')
  await expect.poll(() => page.evaluate(() => (window as any).__vmSwitchTest.result)).toMatch(/VM environment was reset|provider destroyed/)
  expect(await page.evaluate(() => (window as any).__vmSwitchTest.terminated)).toBe(true)
  const error = await page.evaluate(async () => {
    try { await (window as any).__vmSwitchTest.old.send('eth_blockNumber', []) } catch (error) { return error.message }
  })
  expect(error).toContain('provider destroyed')
  await expectUsableVM(page)
})

test('switching again during account loading does not block the new account list', async ({ page }) => {
  await page.evaluate(() => { (window as any).__vmSwitchTest.holdFork = 'cancun' })
  await switchFork(page, 'cancun')
  await page.waitForFunction(() => (window as any).__vmSwitchTest.held > 0)
  await switchFork(page, 'prague')
  expect(await page.evaluate(() => (window as any).__vmSwitchTest.terminated)).toBe(true)
  // Creating an account exercises the UI's account request queue after the interrupted refresh.
  await expect(page.locator('[data-id="runTabSelectAccount"]')).toContainText('ETH')
  const accounts = await page.evaluate(() => (window as any).__remixVM_web3.send('eth_accounts', []))
  await page.locator('[data-id="runTabSelectAccount"]').hover()
  await page.locator('[data-id="selected-account-kebab-menu"]').click()
  await page.locator('[data-id="newAccount"]').click()
  await expect.poll(() => page.evaluate(async () => (await (window as any).__remixVM_web3.send('eth_accounts', [])).length)).toBe(accounts.length + 1)
  const address = await page.evaluate(async () => (await (window as any).__remixVM_web3.send('eth_accounts', [])).at(-1))
  await page.locator('[data-id="runTabSelectAccount"]').click()
  await expect(page.locator(`[data-id="${address}"]`)).toContainText('ETH')
  await expectUsableVM(page)
  expect(pageErrors.get(page)).toEqual([])
})

test('balance errors from the active provider are still reported', async ({ page }) => {
  await page.evaluate(() => { (window as any).__vmSwitchTest.failFork = 'cancun' })
  await switchFork(page, 'cancun')
  await expect.poll(() => pageErrors.get(page)).toEqual(expect.arrayContaining([expect.stringContaining('Balance read failed')]))
})

test('switching during initialization abandons the old context cleanly', async ({ page }) => {
  await page.evaluate(() => { (window as any).__vmSwitchTest.holdInitFork = 'cancun' })
  await page.locator('[data-id="settingsSelectEnvCategoryOptions"]').click()
  await page.locator('[data-id="dropdown-item-vm-cancun"]').click()
  await page.waitForFunction(() => (window as any).__vmSwitchTest.initHeld)
  await switchFork(page, 'prague')
  await expectUsableVM(page)
  expect(pageErrors.get(page)).toEqual([])
})
