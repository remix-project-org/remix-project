import React, { useState, useEffect } from 'react'
import { endpointUrls } from '@remix-endpoints-helper'

interface LinkedAccount {
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

interface AccountsResponse {
  primary: LinkedAccount
  accounts: LinkedAccount[]
}

const getProviderIcon = (provider: string) => {
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

const getProviderColor = (provider: string) => {
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

interface ConnectedAccountsProps {
  plugin: any
}

export const ConnectedAccounts: React.FC<ConnectedAccountsProps> = ({ plugin }) => {
  const [accounts, setAccounts] = useState<LinkedAccount[]>([])
  const [primary, setPrimary] = useState<LinkedAccount | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [enableLogin, setEnableLogin] = useState<boolean>(false)

  const loadAccounts = async () => {
    try {
      setLoading(true)
      setError(null)

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
          setError('Not logged in. Please log in with Google, GitHub, Discord, or wallet to manage accounts.')
          return
        }
        throw new Error('Failed to load accounts')
      }

      const data: AccountsResponse = await response.json()
      setPrimary(data.primary)
      setAccounts(data.accounts)
    } catch (err: any) {
      console.error('Error loading accounts:', err)
      setError(err.message || 'Failed to load accounts')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const checkLoginEnabled = () => {
      const enabled = localStorage.getItem('enableLogin') === 'true'
      setEnableLogin(enabled)
    }
    checkLoginEnabled()

    loadAccounts()

    const onAuthStateChanged = async (_payload: any) => {
      await loadAccounts()
      checkLoginEnabled()
    }

    try {
      plugin.on('auth', 'authStateChanged', onAuthStateChanged)
    } catch (e) {
      // noop
    }

    return () => {
      try {
        plugin.off('auth', 'authStateChanged')
      } catch (e) {
        // ignore
      }
    }
  }, [])

  const handleLinkProvider = async (provider: string) => {
    try {
      await plugin.call('auth', 'linkAccount', provider)
      await loadAccounts()
    } catch (error: any) {
      console.error('Failed to link account:', error)
      alert(`Failed to link ${provider}: ${error.message}`)
    }
  }

  const handleLinkGitHub = () => {
    handleLinkProvider('github')
  }

  const handleLinkGoogle = () => {
    handleLinkProvider('google')
  }

  const handleLinkDiscord = () => {
    handleLinkProvider('discord')
  }

  const handleLinkSIWE = () => {
    handleLinkProvider('siwe')
  }

  if (!enableLogin) {
    return null
  }

  if (loading) {
    return (
      <div className="p-3">
        <div className="spinner-border spinner-border-sm" role="status">
          <span className="sr-only">Loading...</span>
        </div>
        <span className="ml-2">Loading accounts...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="alert alert-warning p-3" role="alert">
        <i className="fas fa-exclamation-triangle mr-2"></i>
        {error}
      </div>
    )
  }

  if (!accounts || accounts.length === 0) {
    return (
      <div className="p-3">
        <p className="text-muted">No accounts found. Please log in first.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="list-group mb-4">
        {accounts.map((account) => (
          <div
            key={account.id}
            className={`list-group-item ${account.isPrimary ? 'border-primary border-2' : ''}`}
          >
            <div className="d-flex align-items-start">
              <div className={`badge ${getProviderColor(account.provider)} mr-3 p-2`} style={{ fontSize: '1.2em' }}>
                {getProviderIcon(account.provider)}
              </div>
              <div className="flex-grow-1">
                <div className="d-flex align-items-center mb-1">
                  <span className="font-weight-bold text-capitalize">{account.provider}</span>
                  {account.isPrimary && (
                    <span className="badge badge-primary ml-2">Primary</span>
                  )}
                  {account.has_access_token && (
                    <span className="badge badge-success ml-2">
                      <i className="fas fa-key mr-1"></i>Token Stored
                    </span>
                  )}
                </div>
                {account.name && (
                  <div className="small text-muted">{account.name}</div>
                )}
                <div className="small text-muted">
                  Connected: {new Date(account.created_at).toLocaleDateString()}
                </div>
                {account.last_login_at && (
                  <div className="small text-muted">
                    Last login: {new Date(account.last_login_at).toLocaleString()}
                  </div>
                )}
              </div>
              {account.picture && (
                <img
                  src={account.picture}
                  alt={account.name || 'Profile'}
                  className="rounded-circle"
                  style={{ width: '40px', height: '40px' }}
                />
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="card bg-light mb-3">
        <div className="card-body">
          <h6 className="card-title">
            <i className="fas fa-plus-circle mr-2"></i>
            Link Additional Accounts
          </h6>
          <p className="card-text small text-muted mb-3">
            Connect more authentication providers to your account. Accounts with matching emails are automatically linked.
          </p>
          <div className="btn-group btn-group-sm" role="group">
            {!accounts.some(a => a.provider === 'github') && (
              <button
                className="btn btn-outline-secondary"
                onClick={handleLinkGitHub}
              >
                <i className="fab fa-github mr-1"></i>
                GitHub
              </button>
            )}
            {!accounts.some(a => a.provider === 'google') && (
              <button
                className="btn btn-outline-primary"
                onClick={handleLinkGoogle}
              >
                <i className="fab fa-google mr-1"></i>
                Google
              </button>
            )}
            {!accounts.some(a => a.provider === 'discord') && (
              <button
                className="btn btn-outline-info"
                onClick={handleLinkDiscord}
              >
                <i className="fab fa-discord mr-1"></i>
                Discord
              </button>
            )}
            {!accounts.some(a => a.provider === 'siwe') && (
              <button
                className="btn btn-outline-warning"
                onClick={handleLinkSIWE}
              >
                <i className="fas fa-wallet mr-1"></i>
                Ethereum (SIWE)
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="alert alert-info" role="alert">
        <i className="fas fa-info-circle mr-2"></i>
        <strong>Automatic Linking:</strong> When you log in with a new provider using the same email, accounts are automatically linked!
      </div>
    </div>
  )
}
