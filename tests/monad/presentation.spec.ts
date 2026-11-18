import { expect, Page } from '@playwright/test'
import { id } from 'ethers'
import { test, selectEnvironment, deploy, openContract, transact, waitForIde, debugTransaction, showOpcodes, currentOpcode } from './helpers'

const rpc = (page: Page, method: string, ...params: any[]) => page.evaluate(
  ({ method, params }) => (window as any).__remixVM_web3.send(method, params), { method, params }
)

const badges = {
  'monad-eight': 'Monad VM (Eight)', 'monad-nine': 'Monad VM (Nine)',
  'monad-ten': 'Monad VM (Ten)', 'monad-next': 'Monad VM (Next)', 'osaka': 'Remix VM osaka'
}

async function unit(page: Page, id: string, denomination: string, label: string) {
  await page.locator(`[data-id="${id}"]`).click()
  const option = page.locator(`[data-id="${id}-${denomination}"]`)
  await expect(option).toHaveText(label)
  await option.click()
}

for (const fork of ['monad-eight', 'monad-nine', 'monad-ten', 'monad-next', 'osaka'] as const) {
  test(`${fork}: badges and currency match the selected VM and retain exact values`, async ({ page }) => {
    const monad = fork !== 'osaka'
    await selectEnvironment(page, fork)
    expect(await rpc(page, 'eth_chainId')).toBe(monad ? '0x8f' : '0x539')
    expect(String(await rpc(page, 'net_version'))).toBe(monad ? '143' : '1337')
    await page.getByRole('tab', { name: 'Deploy', exact: true }).click()
    await expect(page.locator('[data-id="deploy-widget-header"] .badge')).toHaveText(badges[fork])
    await unit(page, 'deployValueUnit', 'wei', 'wei')
    await unit(page, 'deployValueUnit', 'ether', monad ? 'MON' : 'ether')
    if (monad) await unit(page, 'deployValueUnit', 'gwei', 'gwei')
    await page.locator('[data-id="udapp_value"]').fill(monad ? '1000000000' : '1')
    const deploymentButton = await deploy(page)
    const hash = deploymentButton.replace('txLoggerDebugButton', '')
    const receipt = await rpc(page, 'eth_getTransactionReceipt', hash)
    const address = receipt.contractAddress
    expect(BigInt(await rpc(page, 'eth_getBalance', address))).toBe(10n ** 18n)
    if (monad) {
      expect((await rpc(page, 'eth_getTransactionByHash', hash)).chainId).toBe('0x8f')
      expect(BigInt(await rpc(page, 'eth_call', { to: address, data: id('chainId()').slice(0, 10) }, 'latest'))).toBe(143n)
    }

    const deploymentLog = page.locator(`[id="tx${hash}"]`)
    const expectedValue = monad ? '1.0 MON' : '1000000000000000000 wei'
    await expect(deploymentLog.locator('.remix_ui_terminal_log')).toContainText(expectedValue)
    await deploymentLog.locator('.remix_ui_terminal_log').click()
    await expect(page.locator(`[data-id="txLoggerTable${hash}"]`)).toContainText(expectedValue)
    await openContract(page)
    const contract = page.locator('[data-id="deployedContractItem-0"]')
    await expect(contract.locator('.badge.text-info')).toHaveText(monad ? badges[fork] : 'Remix VM')
    await expect(page.locator('[data-id="deployedContractBal"]')).toContainText(monad ? '1.0 MON' : '1.0 ETH')
    await unit(page, 'contractItem-valueUnit-0', 'finney', monad ? 'mMON' : 'finney')
    await page.locator('[data-id="contractItem-sendValue-0"]').fill('1')
    const depositButton = await transact(page, 'deposit')
    await expect.poll(async () => BigInt(await rpc(page, 'eth_getBalance', address))).toBe(1_001_000_000_000_000_000n)
    await expect(page.locator('[data-id="deployedContractBal"]')).toContainText(monad ? '1.001 MON' : '1.001 ETH')
    const depositHash = depositButton.replace('txLoggerDebugButton', '')
    const depositLog = page.locator(`[id="tx${depositHash}"]`)
    await expect(depositLog.locator('.remix_ui_terminal_log')).toContainText(monad ? '0.001 MON' : '1000000000000000 wei')
    await debugTransaction(page, depositButton)
    await showOpcodes(page)
    await expect(page.locator('.opcodes-container')).toContainText('CHAINID')
    await expect(currentOpcode(page)).not.toContainText('INVALID')
    await page.getByRole('button', { name: 'Stop debugging', exact: true }).click()

    await openContract(page)
    let balance = 1_001_000_000_000_000_000n
    for (const [denomination, amount, value, formatted] of [
      ['wei', '1', 1n, '0.000000000000000001 MON'],
      ['gwei', '1', 1_000_000_000n, '0.000000001 MON']
    ] as const) {
      await unit(page, 'contractItem-valueUnit-0', denomination, denomination)
      await page.locator('[data-id="contractItem-sendValue-0"]').fill(amount)
      await expect(page.locator('[data-id="contractItem-sendValue-0"]')).toHaveValue(amount)
      const button = await transact(page, 'deposit')
      const txHash = button.replace('txLoggerDebugButton', '')
      expect(BigInt((await rpc(page, 'eth_getTransactionByHash', txHash)).value)).toBe(value)
      balance += value
      await expect.poll(async () => BigInt(await rpc(page, 'eth_getBalance', address))).toBe(balance)
      await expect(page.locator(`[id="tx${txHash}"] .remix_ui_terminal_log`)).toContainText(monad ? formatted : `${value} wei`)
    }

    // Historical terminal entries keep the currency of their execution environment.
    await selectEnvironment(page, monad ? 'osaka' : 'monad-ten')
    await page.getByRole('tab', { name: 'Deploy', exact: true }).click()
    await expect(page.locator('[data-id="deploy-widget-header"] .badge')).toHaveText(badges[monad ? 'osaka' : 'monad-ten'])
    await expect(deploymentLog.locator('.remix_ui_terminal_log')).toContainText(expectedValue)
    await expect(page.locator(`[data-id="txLoggerTable${hash}"]`)).toContainText(expectedValue)
  })
}

async function rename(page: Page, name: string) {
  const account = page.locator('[data-id="runTabSelectAccount"]')
  await account.locator('.fa-pen').click()
  const input = account.locator('input.edit-account-input')
  await input.fill(name)
  await input.press('Enter')
  await expect(account).toContainText(name)
}

test('account aliases stay separate between Ethereum and Monad across hardforks and reload', async ({ page }) => {
  const account = page.locator('[data-id="runTabSelectAccount"]')
  await selectEnvironment(page, 'osaka')
  const [ethereumAddress] = await rpc(page, 'eth_accounts')
  await rename(page, 'Ethereum account')
  await selectEnvironment(page, 'monad-eight')
  expect((await rpc(page, 'eth_accounts'))[0]).toBe(ethereumAddress)
  await expect(account).not.toContainText('Ethereum account')
  await rename(page, 'Monad account')
  for (const fork of ['osaka', 'monad-nine', 'monad-ten', 'monad-next', 'osaka'] as const) {
    await selectEnvironment(page, fork)
    await expect(account).toContainText(fork === 'osaka' ? 'Ethereum account' : 'Monad account')
  }
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForIde(page)
  await selectEnvironment(page, 'monad-ten')
  await expect(account).toContainText('Monad account')
  await selectEnvironment(page, 'osaka')
  await expect(account).toContainText('Ethereum account')
})
