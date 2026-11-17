import { expect } from '@playwright/test'
import { test } from './helpers'
import { chooseEnvironment } from './persistence-helpers'

test('VM categories show only their own hardforks and select the matching engine', async ({ page }) => {
  const category = page.locator('[data-id="settingsSelectEnvOptions"]')
  const hardfork = page.locator('[data-id="settingsSelectEnvCategoryOptions"]')
  const options = page.locator('.env-subcategory-wrapper .dropdown-menu.show [data-id^="dropdown-item-"]')
  const ethereumForks = ['Osaka', 'Prague', 'Cancun', 'Shanghai', 'Paris', 'London', 'Berlin']

  await chooseEnvironment(page, 'osaka')
  await expect(category).toHaveText('Remix VM')
  await category.click()
  await expect(page.locator('[data-id="dropdown-item-Monad_VM"]')).toHaveText('Monad VM')
  await category.click()
  await hardfork.click()
  await expect(options).toHaveText(ethereumForks)
  await hardfork.click()

  for (const fork of ['monad-eight', 'monad-nine', 'monad-ten', 'monad-next'] as const) {
    await chooseEnvironment(page, fork)
    await expect(category).toHaveText('Monad VM')
    await hardfork.click()
    await expect(options).toHaveText(['Monad Ten', 'Monad Nine', 'Monad Eight', 'Monad Next (experimental)'])
    await hardfork.click()
  }

  await chooseEnvironment(page, 'osaka')
  await expect(category).toHaveText('Remix VM')
  await hardfork.click()
  await expect(options).toHaveText(ethereumForks)
})
