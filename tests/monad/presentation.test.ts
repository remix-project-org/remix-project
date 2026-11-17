import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseUnits } from 'ethers'
import { isMonadProvider, monadUnitLabel, formatMonadValue } from '../../libs/remix-monad/src/presentation'
import { clearAccountPreferences, deleteAccount, getAccountAlias, getNextAvailableAccountNumber, isAccountDeleted, restoreAccount, setAccountAlias } from '../../libs/remix-ui/run-tab-environment/src/lib/utils/accountStorage'

test('Monad unit labels preserve ethers denominations and exact 18-decimal values', () => {
  assert.equal(monadUnitLabel('ether'), 'MON')
  assert.equal(monadUnitLabel('finney'), 'mMON')
  assert.equal(monadUnitLabel('gwei'), 'gwei')
  assert.equal(monadUnitLabel('wei'), 'wei')
  assert.equal(formatMonadValue(parseUnits('1', 'ether')), '1.0 MON')
  assert.equal(formatMonadValue(parseUnits('1', 'finney')), '0.001 MON')
  assert.equal(formatMonadValue('10'), '0.00000000000000001 MON')
  assert.equal(formatMonadValue('9123456789012345678'), '9.123456789012345678 MON')
  assert.equal(formatMonadValue('0x0'), '0.0 MON')
})

test('only the four supported Monad providers use MON transaction formatting', () => {
  for (const fork of ['eight', 'nine', 'ten', 'next']) assert.equal(isMonadProvider(`vm-monad-${fork}`), true)
  for (const provider of ['vm-osaka', 'vm-prague', 'vm-monad-future', 'injected', null, undefined]) {
    assert.equal(isMonadProvider(provider), false)
  }
})

test('Monad aliases, deleted accounts and reset are isolated from existing preferences', context => {
  const values = new Map<string, string>()
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key)
  } })
  context.after(() => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous)
    else delete globalThis.localStorage
  })
  const account = '0x5b38da6a701c568545dcfcb03fcb875f56beddc4'
  values.set('remix-account-preferences', JSON.stringify({ aliases: { [account]: 'Ethereum account' }, deletedAccounts: []}))
  assert.equal(getAccountAlias(account), 'Ethereum account')
  assert.equal(getAccountAlias(account, 'monad'), null)
  setAccountAlias(account.toUpperCase(), 'Monad account', 'monad')
  assert.equal(getAccountAlias(account, 'monad'), 'Monad account')
  assert.equal(getAccountAlias(account), 'Ethereum account')
  setAccountAlias('second', 'Account 1', 'monad')
  assert.equal(getNextAvailableAccountNumber('monad'), 2)
  assert.equal(getNextAvailableAccountNumber(), 1)
  deleteAccount(account, 'monad')
  assert.equal(isAccountDeleted(account, 'monad'), true)
  assert.equal(isAccountDeleted(account), false)
  restoreAccount(account, 'monad')
  assert.equal(isAccountDeleted(account, 'monad'), false)
  clearAccountPreferences('monad')
  assert.equal(getAccountAlias(account, 'monad'), null)
  assert.equal(getAccountAlias(account), 'Ethereum account')
  setAccountAlias(account, 'New Monad account', 'monad')
  clearAccountPreferences()
  assert.equal(getAccountAlias(account, 'monad'), 'New Monad account')
})
