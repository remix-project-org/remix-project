import React, { useState, useEffect, useContext } from 'react'
import { LoginMode } from '@remix-api'
import { LinkedAccount, loadAccountsFromAPI, linkAccountProvider, getProviderIcon, getProviderColor } from './account-utils'
import { AppContext } from '@remix-ui/app'

interface ConnectedAccountsProps {
  plugin: any
}

export const ConnectedAccounts: React.FC<ConnectedAccountsProps> = ({ plugin }) => {
  const appContext = useContext(AppContext)
  const [accounts, setAccounts] = useState<LinkedAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loginEnabled, setLoginEnabled] = useState<boolean>(false)
  const configEnabled = appContext?.appConfig?.['auth.link_accounts_enabled'] !== false

  const loadAccounts = async () => {
    try {
      setLoading(true)
      setError(null)

      const data = await loadAccountsFromAPI()
      setAccounts(data.accounts)
    } catch (err: any) {
      console.error('Error loading accounts:', err)
      setError(err.message || 'Failed to load accounts')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const fetchLoginMode = async () => {
      try {
        const response = await plugin.call('auth', 'getLoginMode')
        const mode: LoginMode = response?.mode || 'open'
        setLoginEnabled(mode !== 'closed')
      } catch {
        setLoginEnabled(localStorage.getItem('enableLogin') === 'true')
      }
    }
    fetchLoginMode()

    loadAccounts()

    const onAuthStateChanged = async (_payload: any) => {
      await loadAccounts()
    }

    const handleLoginModeChanged = (response: { mode: LoginMode; message: string }) => {
      if (response?.mode) {
        setLoginEnabled(response.mode !== 'closed')
      }
    }

    try {
      plugin.on('auth', 'authStateChanged', onAuthStateChanged)
      plugin.on('auth', 'loginModeChanged', handleLoginModeChanged)
    } catch (e) {
      // noop
    }

    return () => {
      try {
        plugin.off('auth', 'authStateChanged')
        plugin.off('auth', 'loginModeChanged')
      } catch (e) {
        // ignore
      }
    }
  }, [])

  const handleLinkProvider = async (provider: string) => {
    try {
      await linkAccountProvider(plugin, provider)
      await loadAccounts()
    } catch (error: any) {
      console.error('Failed to link account:', error)
      alert(`Failed to link ${provider}: ${error.message}`)
    }
  }

  const handleLinkGitHub = () => handleLinkProvider('github')
  const handleLinkGoogle = () => handleLinkProvider('google')
  const handleLinkDiscord = () => handleLinkProvider('discord')
  const handleLinkSIWE = () => handleLinkProvider('siwe')

  if (!loginEnabled || !configEnabled) {
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
        <p className="text-gray-500 dark:text-gray-400">No accounts found. Please log in first.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="list-group mb-3">
        {accounts.map((account) => (
          <div
            key={account.id}
            className={`list-group-item`}
          >
            <div className="flex items-start gap-3 mt-1">
              <div className={`badge ${getProviderColor(account.provider)} flex items-center justify-center rounded-full flex-shrink-0`} style={{ width: '40px', height: '40px', fontSize: '1.2em' }}>
                {getProviderIcon(account.provider)}
              </div>
              <div className="flex-grow-1">
                <div className="flex items-center mb-1">
                  <span className="font-weight-bold capitalize">{account.provider}</span>
                  {account.isPrimary && (
                    <span className="badge bg-primary ml-2">Primary</span>
                  )}
                  {account.has_access_token && (
                    <span className="badge bg-success ml-2">
                      <i className="fas fa-key mr-1"></i>Token Stored
                    </span>
                  )}
                </div>
                {account.name && (
                  <div className="small text-gray-500 dark:text-gray-400" style={{ fontSize: '0.75rem' }}>{account.name}</div>
                )}
              </div>
              <div className="flex flex-col items-end">
                {account.picture && (
                  <img
                    src={account.picture}
                    alt={account.name || 'Profile'}
                    className="rounded-full"
                    style={{ width: '40px', height: '40px' }}
                  />
                )}
              </div>
            </div>
            <div className="mt-2">
              <span className="text-gray-500 dark:text-gray-400" style={{ fontSize: '0.75rem' }}>
                <i className="fas fa-link mr-1" style={{ fontSize: '0.65rem' }}></i>
                Connected: {new Date(account.created_at).toLocaleDateString()}
              </span>
              {account.last_login_at && (
                <span className="text-gray-500 dark:text-gray-400" style={{ fontSize: '0.75rem', float: 'right' }}>
                  <i className="fas fa-clock mr-1" style={{ fontSize: '0.65rem' }}></i>
                  Last login: {new Date(account.last_login_at).toLocaleString()}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mb-2">
        <h6 className="mb-2">
          Link Additional Accounts
        </h6>
        <p className="text-gray-500 dark:text-gray-400 mb-2" style={{ fontSize: '0.85rem' }}>
          Connect more authentication providers to your account. Accounts with matching emails are automatically linked.
        </p>
        <div className="flex flex-col gap-2">
          {!accounts.some(a => a.provider === 'github') && (
            <button
              className="inline-flex items-center px-4 py-2 bg-light text-dark rounded-md hover:bg-light/90 transition-colors border-0 w-full flex items-center justify-center py-2"
              onClick={handleLinkGitHub}
            >
              <span className="mr-2 fs-medium">
                <i className="fab fa-github"></i>
              </span>
              <span className="fs-medium">Connect with GitHub</span>
            </button>
          )}
          {!accounts.some(a => a.provider === 'google') && (
            <button
              className="inline-flex items-center px-4 py-2 bg-light text-dark rounded-md hover:bg-light/90 transition-colors border-0 w-full flex items-center justify-center py-2"
              onClick={handleLinkGoogle}
            >
              <span className="mr-2 fs-medium">
                <i className="fab fa-google"></i>
              </span>
              <span className="fs-medium">Continue with Google</span>
            </button>
          )}
          {!accounts.some(a => a.provider === 'discord') && (
            <button
              className="inline-flex items-center px-4 py-2 bg-light text-dark rounded-md hover:bg-light/90 transition-colors border-0 w-full flex items-center justify-center py-2"
              onClick={handleLinkDiscord}
            >
              <span className="mr-2 fs-medium">
                <i className="fab fa-discord"></i>
              </span>
              <span className="fs-medium">Connect with Discord</span>
            </button>
          )}
          {!accounts.some(a => a.provider === 'siwe') && (
            <button
              className="inline-flex items-center px-4 py-2 bg-light text-dark rounded-md hover:bg-light/90 transition-colors border-0 w-full flex items-center justify-center py-2"
              onClick={handleLinkSIWE}
            >
              <span className="mr-2 fs-medium">
                <i className="fab fa-ethereum"></i>
              </span>
              <span className="fs-medium">Connect Ethereum Wallet (SIWE)</span>
            </button>
          )}
        </div>
      </div>

      <div className="alert alert-info mt-2" role="alert">
        <div className="flex items-start">
          <i className="fas fa-info-circle mr-1 mt-1"></i>
          <div>
            <strong>Automatic Linking</strong><br />
            When you log in with a new provider using the same email, accounts are automatically linked!
          </div>
        </div>
      </div>
    </div>
  )
}
