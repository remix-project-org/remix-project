import { test as base, expect, Page } from '@playwright/test'
import solc from 'solc'

const compiler = `soljson-v${solc.version().split('.Emscripten')[0]}.js`
export type Fork = 'monad-eight' | 'monad-nine' | 'monad-next' | 'monad-ten' | 'osaka'

export const test = base.extend<{ diagnostics: void; ide: void }>({
  diagnostics: [async ({ page }, use, testInfo) => {
    const messages: string[] = []
    page.on('console', message => {
      if (['warning', 'error'].includes(message.type()) && messages.length < 200) messages.push(`${message.type()}: ${message.text()}`)
    })
    page.on('pageerror', error => messages.push(`pageerror: ${error.stack}`))
    await use()
    await testInfo.attach('browser-diagnostics', { body: messages.join('\n'), contentType: 'text/plain' })
  }, { auto: true }],
  ide: [async ({ page, diagnostics }, use) => {
    await prepareIde(page)
    await use()
  }, { auto: true }]
})

async function prepareIde(page: Page) {
  await page.addInitScript(() => {
    ;(window as any).__IS_E2E_TEST__ = true
    ;(window as any).__REMIX_COMPILER_URLS__ = {
      binURL: `${location.origin}/__monad-tests__`, wasmURL: `${location.origin}/__monad-tests__`
    }
  })
  await page.route('https://binaries.soliditylang.org/**/list.json', route => route.fulfill({
    path: 'dist/apps/remix-ide/__monad-tests__/list.json', contentType: 'application/json'
  }))
  // Keep local VM startup independent of the optional payment and survey scripts.
  await page.route(/^https:\/\/(cdn\.paddle\.com|tally\.so)\//, route => route.fulfill({ body: '', contentType: 'application/javascript' }))
  await page.goto(`/#activate=solidity,udapp,debugger,filePanel&version=${compiler}`, { waitUntil: 'domcontentloaded' })
  await waitForIde(page)
  await expect(page.locator('[data-id="treeViewUltreeViewMenu"]')).toBeVisible()
  await page.locator('[data-id="fileExplorerLocalFileSystemUpload"]').setInputFiles('libs/remix-monad/examples/MonadDemo.sol')
  await page.locator('[data-id="treeViewLitreeViewItemMonadDemo.sol"]').click()
  await page.locator('#icon-panel div[plugin="solidity"]').click()
  await expect(page.locator('[data-id="compilerloaded"]')).toBeAttached({ timeout: 60_000 })
  await page.locator('[data-id="scConfigExpander"]').click()
  await page.locator('#evmVersionSelector').click()
  await page.locator('[data-id="evmVersionSelector-cancun"]').click()
  await page.locator('[data-id="compilerContainerCompileBtn"]').click()
  await expect(page.locator('[data-id="compiledContracts"]')).toContainText('MonadDemo')
}

export async function waitForIde(page: Page) {
  // Reapply after reload: document styles do not survive navigation.
  // Keep the resize handle aligned when debugging expands the panel; hover help must not cover controls.
  await page.addStyleTag({ content: `
    #side-panel { transition: none !important; }
    [role="tooltip"] { pointer-events: none !important; }
  ` })
  await expect(page.locator('[data-id="workspaceloaded"]')).toBeAttached({ timeout: 60_000 })
  await expect(page.locator('[data-id="apploaded"]')).toBeAttached()
}

export async function selectEnvironment(page: Page, fork: Fork) {
  const selector = page.locator('[data-id="settingsSelectEnvOptions"]')
  if (!await selector.isVisible()) await page.locator('#icon-panel div[plugin="udapp"]').click()
  const category = fork === 'osaka' ? 'Remix VM' : 'Monad VM'
  if ((await selector.innerText()).trim() !== category) {
    await selector.click()
    await page.locator(`[data-id="dropdown-item-${category.replace(/ /g, '_')}"]`).click()
    await expect(selector).toHaveText(category)
  }
  const selected = page.locator(`[data-id="selected-provider-vm-${fork}"]`)
  if (!await selected.isVisible()) {
    await page.locator('[data-id="settingsSelectEnvCategoryOptions"]').click()
    await page.locator(`[data-id="dropdown-item-vm-${fork}"]`).click()
  }
  await expect(selected).toBeVisible()
  await expect(page.locator('[data-id="runTabSelectAccount"]')).toContainText(fork === 'osaka' ? 'ETH' : 'MON', { timeout: 60_000 })
}

export async function deploy(page: Page, contract = 'MonadDemo') {
  await page.getByRole('tab', { name: 'Deploy', exact: true }).click()
  await page.locator('[data-id="contractDropdownToggle"]').click()
  await page.locator(`[data-id="contractDropdownItem-${contract}"]`).click()
  await page.locator('[data-id="deployButton"]').click()
  await expect(page.locator('[data-id="deployedContractsBadge"]')).toHaveText('1')
  if (!await page.locator('[data-id="terminalJournal"]').isVisible()) {
    await page.locator('[data-id="toggleBottomPanelIcon"]').click()
  }
  return page.locator('[data-shared="txLoggerDebugButton"]').last().getAttribute('data-id')
}

export async function debugTransaction(page: Page, buttonId: string, status = 'Success') {
  await page.locator(`[data-id="${buttonId}"]`).click()
  await expect(page.locator('[data-id="txStatus"]')).toHaveText(status)
  // Wait for source loading to position the debugger at the function entry.
  await expect(page.locator('[data-id="btnStepBack"]')).toBeEnabled()
}

export async function showOpcodes(page: Page) {
  await page.getByRole('button', { name: 'Stack & Memory', exact: true }).click()
  if (!await page.locator('.opcodes-container').isVisible()) {
    await page.locator('.json-line').filter({ has: page.locator('.json-key', { hasText: /^opcode$/ }) }).locator('i').click()
  }
  await expect(page.locator('.opcodes-container')).toBeVisible()
}

export const currentOpcode = (page: Page) => page.locator('.opcodes-container .opcode-item[style*="background-color"]')

export async function seekOpcode(page: Page, opcode: string) {
  const header = page.locator('[data-id="callTraceHeader"]')
  const current = Number((await header.innerText()).match(/Step: (\d+) /)[1])
  const hash = await page.locator('[data-id="debuggerTransactionInput"]').inputValue()
  const target = await page.evaluate(async ({ hash, current, opcode }) => {
    const trace = await (window as any).__remixVM_web3.send('debug_traceTransaction', [hash])
    return trace.structLogs.findIndex((entry: { op: string }, index: number) => index >= current && entry.op === opcode)
  }, { hash, current, opcode })
  expect(target, `${opcode} at or after trace step ${current} in ${hash}`).toBeGreaterThanOrEqual(current)
  await jumpToStep(page, target)
  await expect(currentOpcode(page)).toContainText(new RegExp(`\\b${opcode}\\b`))
  return target
}

export async function jumpToStep(page: Page, index: number) {
  // Use Remix's existing trace-navigation hook to inspect a recorded instruction.
  await page.evaluate(index => (window as any).jumpToDebuggerStep(index), index)
  await expect(page.locator('[data-id="callTraceHeader"]')).toHaveText(new RegExp(`\\(Step: ${index} / \\d+\\)`))
}

export async function openContract(page: Page) {
  if (!await page.getByRole('tab', { name: /^Deployed Contracts\b/ }).isVisible()) {
    await page.locator('#icon-panel div[plugin="udapp"]').click()
  }
  await page.getByRole('tab', { name: /^Deployed Contracts\b/ }).click()
  if (!await page.locator('[data-id="functionList-0"]').isVisible()) {
    await page.locator('[data-id="deployedContractItem-0"]').click()
  }
}

export function contractFunction(page: Page, name: string) {
  return page.locator('[data-id^="deployedContractItem-0-function-"]').filter({ has: page.locator(`[title="${name}"]`) })
}

export async function transact(page: Page, name: string, argument?: string) {
  const buttons = page.locator('[data-shared="txLoggerDebugButton"]')
  const count = await buttons.count()
  const row = contractFunction(page, name)
  if (argument !== undefined) await row.locator('input').fill(argument)
  await row.getByRole('button', { name: 'Transact', exact: true }).click()
  await expect(buttons).toHaveCount(count + 1)
  return buttons.last().getAttribute('data-id')
}

export async function readValue(page: Page, value: number) {
  const row = contractFunction(page, 'value')
  await row.getByRole('button', { name: 'Call', exact: true }).click()
  await expect(row.locator('[data-id="udapp_tree_value"]')).toContainText(new RegExp(`uint256: ${value}\\b`))
}
