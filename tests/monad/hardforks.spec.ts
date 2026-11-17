import { expect } from '@playwright/test'
import { test, showOpcodes, currentOpcode, jumpToStep } from './helpers'
import { rpc, chooseEnvironment } from './persistence-helpers'

for (const fork of ['monad-eight', 'monad-nine', 'monad-ten', 'monad-next'] as const) {
  test(`${fork}: inspect opcode activation and failed execution`, async ({ page }) => {
    await chooseEnvironment(page, fork)
    const [from] = await rpc(page, 'eth_accounts')
    for (const runtime of ['60011e5f5260205ff3', 'ae005f5260205ff3']) {
      const clz = runtime.startsWith('6001')
      const success = clz ? fork !== 'monad-eight' : fork === 'monad-next'
      const opcode = success ? (clz ? 'CLZ' : 'CALLSTACKDEPTH') : 'INVALID'
      const length = (runtime.length / 2).toString(16).padStart(2, '0')
      const deployment = await rpc(page, 'eth_sendTransaction', { from, gas: '0xf4240', data: `0x60${length}600c60003960${length}6000f3${runtime}` })
      const address = (await rpc(page, 'eth_getTransactionReceipt', deployment)).contractAddress
      const hash = await rpc(page, 'eth_sendTransaction', { from, to: address, gas: '0xf4240' })
      const trace = await rpc(page, 'debug_traceTransaction', hash)
      expect(trace.fork).toBe(fork)
      expect(trace.structLogs[clz ? 1 : 0].op).toBe(opcode)
      expect((await rpc(page, 'eth_getTransactionReceipt', hash)).status).toBe(success ? '0x1' : '0x0')

      const input = page.locator('[data-id="debuggerTransactionInput"]')
      if (!await input.isVisible()) await page.locator('#icon-panel div[plugin="debugger"]').click()
      await input.fill(hash)
      await page.getByRole('button', { name: 'Start debugging', exact: true }).click()
      await expect(page.locator('[data-id="txStatus"]')).toHaveText(success ? 'Success' : 'Failed')
      await showOpcodes(page)
      await jumpToStep(page, clz ? 1 : 0)
      await expect(currentOpcode(page)).toHaveText(new RegExp(`^\\s*0*${clz ? 2 : 0}\\s+${opcode}\\s*$`))
      if (success) {
        expect(BigInt(trace.returnValue)).toBe(clz ? 255n : 0n)
        await jumpToStep(page, clz ? 2 : 1)
        await page.locator('[data-id="stack-expand-icon"]').click()
        await expect(page.locator('[data-id="stack-json-nested"]')).toContainText((clz ? 'ff' : '0').padStart(64, '0'))
      }
      await page.getByRole('button', { name: 'Stop debugging', exact: true }).click()
    }
  })
}
