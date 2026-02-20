// Utility functions for managing account preferences in localStorage

const ACCOUNT_PREFERENCES_KEY = 'remix-account-preferences'

export interface AccountPreferences {
  aliases: { [address: string]: string }
  deletedAccounts: string[]
}

export function getAccountPreferences(): AccountPreferences {
  try {
    const stored = localStorage.getItem(ACCOUNT_PREFERENCES_KEY)
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

export function saveAccountPreferences(preferences: AccountPreferences): void {
  try {
    localStorage.setItem(ACCOUNT_PREFERENCES_KEY, JSON.stringify(preferences))
  } catch (e) {
    console.error('Error saving account preferences to localStorage:', e)
  }
}

export function setAccountAlias(address: string, alias: string): void {
  const preferences = getAccountPreferences()
  preferences.aliases[address.toLowerCase()] = alias
  saveAccountPreferences(preferences)
}

export function getAccountAlias(address: string): string | null {
  const preferences = getAccountPreferences()
  return preferences.aliases[address.toLowerCase()] || null
}

export function deleteAccount(address: string): void {
  const preferences = getAccountPreferences()
  if (!preferences.deletedAccounts.includes(address.toLowerCase())) {
    preferences.deletedAccounts.push(address.toLowerCase())
  }
  saveAccountPreferences(preferences)
}

export function restoreAccount(address: string): void {
  const preferences = getAccountPreferences()
  preferences.deletedAccounts = preferences.deletedAccounts.filter(
    addr => addr.toLowerCase() !== address.toLowerCase()
  )
  saveAccountPreferences(preferences)
}

export function isAccountDeleted(address: string): boolean {
  const preferences = getAccountPreferences()
  return preferences.deletedAccounts.includes(address.toLowerCase())
}

export function clearAccountPreferences(): void {
  try {
    localStorage.removeItem(ACCOUNT_PREFERENCES_KEY)
  } catch (e) {
    console.error('Error clearing account preferences from localStorage:', e)
  }
}
