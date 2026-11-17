import { expect, Page } from '@playwright/test'
import { waitForIde, selectEnvironment, deploy, openContract, transact, Fork } from './helpers'

export const rpc = (page: Page, method: string, ...params: any[]) => page.evaluate(
  ({ method, params }) => (window as any).__remixVM_web3.send(method, params), { method, params }
)

export async function showDeploy(page: Page) {
  if (!await page.locator('[data-id="settingsSelectEnvCategoryOptions"]').isVisible()) {
    await page.locator('#icon-panel div[plugin="udapp"]').click()
  }
}

export async function changeProvider(page: Page, action: () => Promise<void>) {
  const previous = await page.evaluateHandle(() => (window as any).__remixVM_web3)
  try {
    await action()
    await page.waitForFunction(previous => (window as any).__remixVM_web3 !== previous, previous)
  } finally { await previous.dispose() }
}

export async function chooseEnvironment(page: Page, fork: Fork) {
  await showDeploy(page)
  if (!await page.locator(`[data-id="selected-provider-vm-${fork}"]`).isVisible()) {
    await changeProvider(page, () => selectEnvironment(page, fork))
  }
  await page.waitForFunction(() => !!(window as any).__remixVM_web3)
  await expect(page.locator('[data-id="runTabSelectAccount"]')).toContainText(fork === 'osaka' ? 'ETH' : 'MON')
  if (fork === 'osaka') {
    expect(await rpc(page, 'web3_clientVersion')).toMatch(/^Remix Simulator\//)
  } else {
    expect(await rpc(page, 'web3_clientVersion')).toContain('monad-evm2-wasm')
    expect((await rpc(page, 'eth_getStateDb')).spec).toBe(fork)
  }
}

export async function saving(page: Page, enabled: boolean) {
  await page.locator('[data-id="topbar-settingsIcon"]').click()
  await page.locator('[data-id="settings-sidebar-general"]').click()
  const toggle = page.locator('[data-id="save-evm-stateSwitch"]')
  await expect(toggle).toBeVisible()
  if ((await toggle.getAttribute('aria-checked')) !== String(enabled)) await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', String(enabled))
  await showDeploy(page)
}

export async function compileExisting(page: Page) {
  if (!await page.locator('[data-id="treeViewUltreeViewMenu"]').isVisible()) await page.locator('#icon-panel div[plugin="filePanel"]').click()
  await page.locator('[data-id="treeViewLitreeViewItemMonadDemo.sol"]').click()
  await page.locator('#icon-panel div[plugin="solidity"]').click()
  await expect(page.locator('[data-id="compilerloaded"]')).toBeAttached({ timeout: 60_000 })
  await page.locator('[data-id="compilerContainerCompileBtn"]').click()
  await expect(page.locator('[data-id="compiledContracts"]')).toContainText('MonadDemo')
}

export async function reload(page: Page, fork: Fork) {
  // LightningFS releases its Web Lock after flushing its debounced directory cache to IndexedDB.
  // An in-memory read of state.json alone does not confirm that the file will survive navigation.
  await expect.poll(() => page.evaluate(async () =>
    (await navigator.locks.query()).held.some(lock => lock.name === 'RemixFileSystem_lock')
  )).toBe(false)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForIde(page)
  await chooseEnvironment(page, fork)
}

export async function savedFile(page: Page, fork: Fork, workspace = 'default_workspace'): Promise<string | null> {
  // Observe the existing filesystem; writes and restores must come from Remix's UI lifecycle.
  return page.evaluate(async path => {
    const fs = (window as any).remixFileSystem
    return await fs.exists(path) ? fs.readFile(path, 'utf8') : null
  }, `.workspaces/${workspace}/.states/vm-${fork}/state.json`)
}

export async function waitForSaved(page: Page, fork: Fork, workspace = 'default_workspace') {
  const height = BigInt(await rpc(page, 'eth_blockNumber'))
  await expect.poll(async () => {
    const file = await savedFile(page, fork, workspace)
    return file && BigInt(JSON.parse(file).latestBlockNumber)
  }).toBe(height)
}

export async function attach(page: Page, address: string) {
  await showDeploy(page)
  await page.getByRole('tab', { name: 'Deploy', exact: true }).click()
  await page.locator('[data-id="contractDropdownToggle"]').click()
  await page.locator('[data-id="contractDropdownItem-MonadDemo"]').click()
  await page.getByRole('tab', { name: /^Deployed Contracts\b/ }).click()
  await page.locator('[data-id="addDeployedContract"]').click()
  await page.locator('[data-id="deployedContractAddressInput"]').fill(address)
  await page.locator('[data-id="addDeployedContractButton"]').click()
  await expect(page.locator('[data-id="deployedContractsBadge"]')).toHaveText('1')
  await openContract(page)
}

export async function deployAndStore(page: Page, value: number) {
  await showDeploy(page)
  const deployment = (await deploy(page)).replace('txLoggerDebugButton', '')
  const address = (await rpc(page, 'eth_getTransactionReceipt', deployment)).contractAddress
  await openContract(page)
  const stored = (await transact(page, 'store', String(value))).replace('txLoggerDebugButton', '')
  expect(BigInt(await rpc(page, 'eth_getStorageAt', address, '0x0', 'latest'))).toBe(BigInt(value))
  return { address, deployment, stored }
}

export async function observeState(page: Page, contract: Awaited<ReturnType<typeof deployAndStore>>) {
  const accounts: string[] = await rpc(page, 'eth_accounts')
  return {
    accounts,
    balances: await Promise.all(accounts.map(address => rpc(page, 'eth_getBalance', address, 'latest'))),
    nonces: await Promise.all(accounts.map(address => rpc(page, 'eth_getTransactionCount', address, 'latest'))),
    code: await rpc(page, 'eth_getCode', contract.address, 'latest'),
    storage: await rpc(page, 'eth_getStorageAt', contract.address, '0x0', 'latest'),
    height: await rpc(page, 'eth_blockNumber')
  }
}
