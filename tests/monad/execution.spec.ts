import { expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { test, deploy, debugTransaction, showOpcodes, currentOpcode, openContract, transact, readValue, seekOpcode, jumpToStep } from './helpers'
import { chooseEnvironment } from './persistence-helpers'

const source = readFileSync('libs/remix-monad/examples/MonadDemo.sol', 'utf8')
const storeLine = source.split('\n').findIndex(line => line.includes('value = newValue;')) + 1

for (const fork of ['monad-eight', 'monad-nine', 'monad-ten', 'monad-next', 'osaka'] as const) {
  test(`${fork}: deploy, call and inspect storage through the IDE`, async ({ page }) => {
    await chooseEnvironment(page, fork)
    await debugTransaction(page, await deploy(page))
    await showOpcodes(page)
    await expect(currentOpcode(page)).not.toContainText('INVALID')
    await page.getByRole('button', { name: 'Stop debugging', exact: true }).click()

    await openContract(page)
    const transaction = await transact(page, 'store', '42')
    await readValue(page, 42)
    await debugTransaction(page, transaction)
    await showOpcodes(page)
    const store = await seekOpcode(page, 'SSTORE')
    await expect(page.locator(`#editorView .highlightLine${storeLine}`).first()).toBeVisible()
    await jumpToStep(page, store + 1)
    await page.getByRole('button', { name: 'State & Locals', exact: true }).click()
    const state = page.locator('[data-id="solidityState"]')
    await state.locator('[data-id="state-expand-icon"]').click()
    await state.locator('[data-id="value-expand-icon"]').click()
    await expect(state.locator('[data-id="value-json-nested"] [data-id="value-json-value"]')).toHaveText('"42"')
    await page.getByRole('button', { name: 'Stop debugging', exact: true }).click()

    if (fork === 'monad-next') {
      await openContract(page)
      await debugTransaction(page, await transact(page, 'recordDepth'))
      await showOpcodes(page)
      const depth = await seekOpcode(page, 'CALLSTACKDEPTH')
      await expect(currentOpcode(page)).toHaveText(/^\s*0+\s+CALLSTACKDEPTH\s*$/)
      await jumpToStep(page, depth + 1)
      await expect(currentOpcode(page)).toHaveText(/^\s*0*2\s+PUSH0(?:\s+0x)?\s*$/)
      await page.locator('[data-id="stack-expand-icon"]').click()
      await expect(page.locator('[data-id="stack-json-nested"]')).toContainText('1'.padStart(64, '0'))
      await jumpToStep(page, depth)
      await expect(currentOpcode(page)).toContainText('CALLSTACKDEPTH')
    }
  })
}
