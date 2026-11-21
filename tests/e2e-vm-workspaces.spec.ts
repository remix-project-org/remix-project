import { test, expect, Page } from '@playwright/test'
import solc from 'solc'

const baseURL = process.env.REMIX_BASE_URL || 'http://127.0.0.1:8080'
const version = solc.version().split('.Emscripten')[0]
const compilerFile = `soljson-v${version}.js`
const source = 'pragma solidity ^0.8.24; contract WorkspaceContract { function value() external pure returns (uint256) { return 17; } }'

test.use({ actionTimeout: 20_000, viewport: { width: 1600, height: 1000 } })

async function rpc(page: Page, method: string, ...params: any[]) {
  return page.evaluate(({ method, params }) => (window as any).__remixVM_web3.send(method, params), { method, params })
}

async function switchWorkspace(page: Page, name: string, create = false) {
  const previous = await page.evaluateHandle(() => (window as any).__remixVM_web3)
  try {
    if (!await page.locator('[data-id="treeViewUltreeViewMenu"]').isVisible()) {
      await page.locator('#icon-panel div[plugin="filePanel"]').click()
    }
    await page.locator('[data-id="workspacesSelect"]').click()
    if (create) {
      await page.locator('[data-id="workspacecreate"]').click()
      await page.locator('[data-id="create-blank-workspace-topcard"]').click()
      await page.locator('[data-id="workspace-name-blank-input"]').fill(name)
      await page.locator('[data-id="initializeAsGitRepo-blank"]').uncheck()
      await page.locator('[data-id="validate-blankworkspace-button"]').click()
    } else {
      await page.locator(`[data-id="dropdown-item-${name}"]`).click()
    }
    await expect(page.locator('[data-id="workspacesSelect-togglerText"]')).toHaveText(name)
    // Wait until initialization publishes the replacement provider before making RPC requests.
    await page.waitForFunction(previous => (window as any).__remixVM_web3 !== previous, previous)
  } finally {
    await previous.dispose()
  }
}

test('Ethereum VM workspaces reset fresh state and restore their own saved contracts', async ({ page }) => {
  test.setTimeout(180_000)
  await page.addInitScript(() => { (window as any).__IS_E2E_TEST__ = true })
  // Use the installed compiler so this VM regression does not depend on compiler downloads.
  await page.route('https://binaries.soliditylang.org/**/list.json', route => route.fulfill({
    json: { builds: [{ path: compilerFile, version: version.split('+')[0], longVersion: version }], releases: { [version.split('+')[0]]: compilerFile }, latestRelease: version.split('+')[0] },
    headers: { 'access-control-allow-origin': '*' }
  }))
  await page.route('https://binaries.soliditylang.org/**/soljson*.js', route => route.fulfill({
    path: require.resolve('solc/soljson.js'), contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' }
  }))
  await page.goto(`${baseURL}/#activate=solidity,udapp,filePanel&version=${compilerFile}`, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('[data-id="workspaceloaded"]')).toBeAttached({ timeout: 60_000 })
  await expect(page.locator('[data-id="apploaded"]')).toBeAttached()
  await page.addStyleTag({ content: '[role="tooltip"] { pointer-events: none !important; }' })
  await page.locator('[data-id="fileExplorerLocalFileSystemUpload"]').setInputFiles({ name: 'WorkspaceContract.sol', mimeType: 'text/plain', buffer: Buffer.from(source) })
  await page.locator('[data-id="treeViewLitreeViewItemWorkspaceContract.sol"]').click()
  await page.locator('#icon-panel div[plugin="solidity"]').click()
  await expect(page.locator('[data-id="compilerloaded"]')).toBeAttached({ timeout: 60_000 })
  await page.locator('[data-id="scConfigExpander"]').click()
  await page.locator('#evmVersionSelector').selectOption('cancun')
  await page.locator('[data-id="compilerContainerCompileBtn"]').click()
  await expect(page.locator('[data-id="compiledContracts"]')).toContainText('WorkspaceContract')
  await page.locator('#icon-panel div[plugin="udapp"]').click()
  await expect(page.locator('[data-id="selected-provider-vm-osaka"]')).toBeVisible()
  await expect(page.locator('[data-id="runTabSelectAccount"]')).toContainText('ETH')
  const [from] = await rpc(page, 'eth_accounts')
  await page.getByRole('tab', { name: 'Deploy', exact: true }).click()
  await page.locator('[data-id="contractDropdownToggle"]').click()
  await page.locator('[data-id="contractDropdownItem-WorkspaceContract"]').click()
  await page.locator('[data-id="deployButton"]').click()
  await expect(page.locator('[data-id="deployedContractsBadge"]')).toHaveText('1')

  if (!await page.locator('[data-id="terminalJournal"]').isVisible()) {
    await page.locator('[data-id="toggleBottomPanelIcon"]').click()
  }
  const deployment = (await page.locator('[data-shared="txLoggerDebugButton"]').last().getAttribute('data-id')).replace('txLoggerDebugButton', '')
  const receipt = await rpc(page, 'eth_getTransactionReceipt', deployment)
  const height = BigInt(await rpc(page, 'eth_blockNumber'))
  const address = receipt.contractAddress
  const code = await rpc(page, 'eth_getCode', address, 'latest')
  const nonce = await rpc(page, 'eth_getTransactionCount', from, 'latest')
  expect(code).not.toBe('0x')
  expect(BigInt(nonce)).toBe(1n)
  await expect.poll(() => page.evaluate(async () => {
    const fs = (window as any).remixFileSystem
    const path = '.workspaces/default_workspace/.states/vm-osaka/state.json'
    return await fs.exists(path) ? BigInt(JSON.parse(await fs.readFile(path, 'utf8')).latestBlockNumber) : null
  }), { timeout: 20_000 }).toBe(height)

  await switchWorkspace(page, 'isolated-ethereum', true)
  await expect.poll(() => rpc(page, 'eth_getCode', address, 'latest'), { timeout: 20_000 }).toBe('0x')
  expect(BigInt(await rpc(page, 'eth_getTransactionCount', from, 'latest'))).toBe(0n)
  await switchWorkspace(page, 'default_workspace')
  await expect.poll(() => rpc(page, 'eth_getCode', address, 'latest'), { timeout: 20_000 }).toBe(code)
  expect(await rpc(page, 'eth_getTransactionCount', from, 'latest')).toBe(nonce)
})
