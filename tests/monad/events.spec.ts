import { expect, Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { Interface } from 'ethers'
import { test, selectEnvironment, showOpcodes, currentOpcode, seekOpcode, jumpToStep } from './helpers'

test.use({ contractFile: 'libs/remix-monad/examples/EventQueries.sol', scriptRunner: true })
test.describe.configure({ timeout: 180_000 })
const source = readFileSync('libs/remix-monad/examples/EventQueries.sol', 'utf8')
const abi = new Interface(['event Updated(address indexed sender,uint256 indexed key,uint256 value,string note)'])
const rpc = (page: Page, method: string, ...params: any[]) => page.evaluate(
  ({ method, params }) => (window as any).__remixVM_web3.send(method, params), { method, params }
)

async function inspect(page: Page, hash: string, failed: boolean) {
  const input = page.locator('[data-id="debuggerTransactionInput"]')
  if (!await input.isVisible()) await page.locator('#icon-panel div[plugin="debugger"]').click()
  await input.fill(hash)
  await page.getByRole('button', { name: 'Start debugging', exact: true }).click()
  await expect(page.locator('[data-id="txStatus"]')).toHaveText(failed ? 'Failed' : 'Success')
  await expect(page.locator('[data-id="btnStepBack"]')).toBeEnabled()
  await showOpcodes(page)
  const eventStep = await seekOpcode(page, 'LOG3')
  const fragment = failed ? 'emit Updated(msg.sender, key, 99' : 'emit Updated(msg.sender, key, next'
  const line = source.split('\n').findIndex(line => line.includes(fragment)) + 1
  await expect(page.locator(`#editorView .highlightLine${line}`).first()).toBeVisible()
  await page.getByRole('button', { name: 'State & Locals', exact: true }).click()
  const state = page.locator('[data-id="solidityState"]')
  for (const key of ['state', 'value']) {
    const toggle = state.locator(`[data-id="${key}-expand-icon"]`)
    await expect(toggle).toBeVisible()
    if ((await toggle.getAttribute('class')).includes('fa-plus-square')) await toggle.click()
  }
  await expect(state.locator('[data-id="value-json-nested"] [data-id="value-json-value"]')).toHaveText(failed ? '"99"' : '"11"')
  await showOpcodes(page)
  await jumpToStep(page, eventStep + 1)
  await jumpToStep(page, eventStep)
  await expect(currentOpcode(page)).toContainText('LOG3')
  await expect(page.locator(`#editorView .highlightLine${line}`).first()).toBeVisible()
  await page.getByRole('button', { name: 'Stop debugging', exact: true }).click()
}

for (const fork of ['monad-eight', 'monad-nine', 'monad-ten', 'monad-next'] as const) {
  test(`${fork}: script listeners, event queries and successful/reverted event debugging`, async ({ page }) => {
    await selectEnvironment(page, fork)
    const query = { fromBlock: 'earliest', topics: [abi.getEvent('Updated').topicHash]}
    const filter = await rpc(page, 'eth_newFilter', query)
    const blocks = await rpc(page, 'eth_newBlockFilter')
    await page.locator('#icon-panel div[plugin="filePanel"]').click()
    await page.locator('[data-id="fileExplorerLocalFileSystemUpload"]').setInputFiles('libs/remix-monad/examples/event-listeners.js')
    await page.locator('[data-id="treeViewLitreeViewItemevent-listeners.js"]').click()
    await page.locator('[data-id="run-script-dropdown-trigger"]').click()
    await page.locator('[data-id="run-with-ethers6-menu-item"]').click()
    const terminal = page.locator('[data-id="terminalJournal"]')
    if (!await terminal.isVisible()) await page.locator('[data-id="toggleBottomPanelIcon"]').click()
    const output = /events-workflow-ok\s+(0x[\da-fA-F]{40})\s+(0x[\da-fA-F]{64})\s+(0x[\da-fA-F]{64})/
    await expect(terminal).toContainText(output, { timeout: 90_000 })
    const [, address, success, failed] = (await terminal.innerText()).match(output)
    const logs = await rpc(page, 'eth_getLogs', { ...query, address })
    expect(logs.map(log => abi.parseLog(log).args.value)).toEqual([11n, 22n, 33n])
    expect(await rpc(page, 'eth_getFilterLogs', filter)).toEqual(logs)
    expect(await rpc(page, 'eth_getFilterChanges', filter)).toEqual(logs)
    expect(await rpc(page, 'eth_getFilterChanges', filter)).toEqual([])
    expect(await rpc(page, 'eth_getFilterChanges', blocks)).toHaveLength(5)
    for (const id of [filter, blocks]) expect(await rpc(page, 'eth_uninstallFilter', id)).toBe(true)
    await inspect(page, success, false)
    await inspect(page, failed, true)
    expect((await rpc(page, 'eth_getTransactionReceipt', failed)).logs).toEqual([])
    expect(BigInt(await rpc(page, 'eth_getStorageAt', address, '0x0'))).toBe(33n)
  })
}
