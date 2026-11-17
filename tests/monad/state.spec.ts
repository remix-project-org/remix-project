import { expect } from '@playwright/test'
import { test, transact, readValue, showOpcodes, seekOpcode } from './helpers'
import { rpc, chooseEnvironment, saving, deployAndStore, observeState, waitForSaved, savedFile, reload, compileExisting, attach } from './persistence-helpers'

for (const fork of ['monad-eight', 'monad-nine', 'monad-ten', 'monad-next'] as const) {
  test(`${fork}: save, reload and debug retained transactions`, async ({ page }) => {
    await chooseEnvironment(page, fork)
    await saving(page, true)
    const contract = await deployAndStore(page, 42)
    await readValue(page, 42)
    const before = await observeState(page, contract)
    const trace = await rpc(page, 'debug_traceTransaction', contract.stored)
    const receipt = await rpc(page, 'eth_getTransactionReceipt', contract.stored)
    await waitForSaved(page, fork)
    const file = JSON.parse(await savedFile(page, fork))
    expect(file.db.backend).toBe('monad-evm2')
    expect(file.db.spec).toBe(fork)

    await reload(page, fork)
    expect(await observeState(page, contract)).toEqual(before)
    const restored = await rpc(page, 'eth_getStateDb')
    expect(restored.keys).toEqual(file.db.keys)
    for (const [id, record] of file.db.executions) {
      expect(restored.executions.find(([hash]) => hash === id)?.[1]).toEqual(record)
    }
    expect(await rpc(page, 'eth_getTransactionReceipt', contract.stored)).toEqual(receipt)
    expect(await rpc(page, 'debug_traceTransaction', contract.stored)).toEqual(trace)

    await compileExisting(page)
    await page.locator('#icon-panel div[plugin="debugger"]').click()
    await page.locator('[data-id="debuggerTransactionInput"]').fill(contract.stored)
    await page.getByRole('button', { name: 'Start debugging', exact: true }).click()
    await expect(page.locator('[data-id="txStatus"]')).toHaveText('Success')
    await showOpcodes(page)
    await seekOpcode(page, 'SSTORE')
    await page.getByRole('button', { name: 'Stop debugging', exact: true }).click()
    await attach(page, contract.address)
    await transact(page, 'store', '43')
    await readValue(page, 43)
    await waitForSaved(page, fork)
  })
}
