import React from 'react'
import { endpointUrls } from '@remix-endpoints-helper'

export interface LinkedAccount {
  id: number
  user_id: string
  provider: string
  name?: string
  picture?: string
  isPrimary: boolean
  isLinked: boolean
  has_access_token?: boolean
  created_at: string
  last_login_at?: string
}

export interface AccountsResponse {
  primary: LinkedAccount
  accounts: LinkedAccount[]
}

export const getProviderIcon = (provider: string) => {
  switch (provider) {
  case 'github':
    return <i className="fab fa-github"></i>
  case 'google':
    return <i className="fab fa-google"></i>
  case 'discord':
    return <i className="fab fa-discord"></i>
  case 'siwe':
    return <i className="fab fa-ethereum"></i>
  default:
    return <i className="fas fa-sign-in-alt"></i>
  }
}

export const getProviderColor = (provider: string) => {
  switch (provider) {
  case 'github':
    return 'bg-secondary text-white'
  case 'google':
    return 'bg-primary text-white'
  case 'discord':
    return 'bg-info text-white'
  case 'siwe':
    return 'bg-warning text-dark'
  default:
    return 'bg-dark text-white'
  }
}

export const loadAccountsFromAPI = async (): Promise<AccountsResponse> => {
  const token = localStorage.getItem('remix_access_token')
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(`${endpointUrls.sso}/accounts`, {
    credentials: 'include',
    headers
  })

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Not logged in. Please log in with Google, GitHub, Discord, or wallet to manage accounts.')
    }
    throw new Error('Failed to load accounts')
  }

  return await response.json()
}

export const linkAccountProvider = async (plugin: any, provider: string): Promise<void> => {
  await plugin.call('auth', 'linkAccount', provider)
}
