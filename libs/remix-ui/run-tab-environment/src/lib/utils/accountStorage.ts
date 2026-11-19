// Utility functions for managing account preferences in localStorage

const ACCOUNT_PREFERENCES_KEY = 'remix-account-preferences'

const storageKey = (scope?: string) => scope ? `${ACCOUNT_PREFERENCES_KEY}:${scope}` : ACCOUNT_PREFERENCES_KEY

export interface AccountPreferences {
  aliases: { [address: string]: string }
  deletedAccounts: string[]
}

export function getAccountPreferences(scope?: string): AccountPreferences {
  try {
    const stored = localStorage.getItem(storageKey(scope))
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (e) {
    console.error('Error reading account preferences from localStorage:', e)
  }
  return {
    aliases: {},
    deletedAccounts: []
  }
}

export function saveAccountPreferences(preferences: AccountPreferences, scope?: string): void {
  try {
    localStorage.setItem(storageKey(scope), JSON.stringify(preferences))
  } catch (e) {
    console.error('Error saving account preferences to localStorage:', e)
  }
}

export function setAccountAlias(address: string, alias: string, scope?: string): void {
  const preferences = getAccountPreferences(scope)
  preferences.aliases[address.toLowerCase()] = alias
  saveAccountPreferences(preferences, scope)
}

export function getAccountAlias(address: string, scope?: string): string | null {
  const preferences = getAccountPreferences(scope)
  return preferences.aliases[address.toLowerCase()] || null
}

export function deleteAccount(address: string, scope?: string): void {
  const preferences = getAccountPreferences(scope)
  if (!preferences.deletedAccounts.includes(address.toLowerCase())) {
    preferences.deletedAccounts.push(address.toLowerCase())
  }
  saveAccountPreferences(preferences, scope)
}

export function restoreAccount(address: string, scope?: string): void {
  const preferences = getAccountPreferences(scope)
  preferences.deletedAccounts = preferences.deletedAccounts.filter(
    addr => addr.toLowerCase() !== address.toLowerCase()
  )
  saveAccountPreferences(preferences, scope)
}

export function isAccountDeleted(address: string, scope?: string): boolean {
  const preferences = getAccountPreferences(scope)
  return preferences.deletedAccounts.includes(address.toLowerCase())
}

export function clearAccountPreferences(scope?: string): void {
  try {
    localStorage.removeItem(storageKey(scope))
  } catch (e) {
    console.error('Error clearing account preferences from localStorage:', e)
  }
}

export function getNextAvailableAccountNumber(scope?: string): number {
  const preferences = getAccountPreferences(scope)
  const usedNumbers = new Set<number>()

  Object.values(preferences.aliases).forEach(alias => {
    const match = alias.match(/^Account (\d+)$/)
    if (match) {
      usedNumbers.add(parseInt(match[1], 10))
    }
  })

  let nextNumber = 1
  while (usedNumbers.has(nextNumber)) {
    nextNumber++
  }

  return nextNumber
}
