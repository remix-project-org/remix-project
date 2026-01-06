import React, { useState, useEffect } from 'react'
import { LinkedAccount, loadAccountsFromAPI, linkAccountProvider, getProviderIcon, getProviderColor } from './account-utils'

interface ConnectedAccountsProps {
  plugin: any
}

export const ConnectedAccounts: React.FC<ConnectedAccountsProps> = ({ plugin }) => {
  const [accounts, setAccounts] = useState<LinkedAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [enableLogin, setEnableLogin] = useState<boolean>(false)

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

  if (!enableLogin) {
    return null
  }

  if (loading) {
    return (
      <div className="p-3">
        <div className="spinner-border spinner-border-sm" role="status">
          <span className="sr-only">Loading...</span>
        </div>
        <span className="ms-2">Loading accounts...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="alert alert-warning p-3" role="alert">
        <i className="fas fa-exclamation-triangle me-2"></i>
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
      <div className="list-group mb-3">
        {accounts.map((account) => (
          <div
            key={account.id}
            className={`list-group-item`}
          >
            <div className="d-flex align-items-start gap-3 mt-1">
              <div className={`badge ${getProviderColor(account.provider)} d-flex align-items-center justify-content-center rounded-circle flex-shrink-0`} style={{ width: '40px', height: '40px', fontSize: '1.2em' }}>
                {getProviderIcon(account.provider)}
              </div>
              <div className="flex-grow-1">
                <div className="d-flex align-items-center mb-1">
                  <span className="font-weight-bold text-capitalize">{account.provider}</span>
                  {account.isPrimary && (
                    <span className="badge bg-primary ms-2">Primary</span>
                  )}
                  {account.has_access_token && (
                    <span className="badge bg-success ms-2">
                      <i className="fas fa-key mr-1"></i>Token Stored
                    </span>
                  )}
                </div>
                {account.name && (
                  <div className="small text-muted" style={{ fontSize: '0.75rem' }}>{account.name}</div>
                )}
              </div>
              <div className="d-flex flex-column align-items-end">
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
            <div className="mt-2">
              <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                Connected: {new Date(account.created_at).toLocaleDateString()}
              </span>
              {account.last_login_at && (
                <span className="text-muted" style={{ fontSize: '0.75rem', float: 'right' }}>
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
        <p className="text-muted mb-2" style={{ fontSize: '0.85rem' }}>
          Connect more authentication providers to your account. Accounts with matching emails are automatically linked.
        </p>
        <div className="d-flex flex-column gap-2">
          {!accounts.some(a => a.provider === 'github') && (
            <button
              className="btn btn-light border-0 w-100 d-flex align-items-center justify-content-center py-2"
              onClick={handleLinkGitHub}
            >
              <span className="me-2 fs-medium">
                <i className="fab fa-github"></i>
              </span>
              <span className="fs-medium">Connect with GitHub</span>
            </button>
          )}
          {!accounts.some(a => a.provider === 'google') && (
            <button
              className="btn btn-light border-0 w-100 d-flex align-items-center justify-content-center py-2"
              onClick={handleLinkGoogle}
            >
              <span className="me-2 fs-medium">
                <i className="fab fa-google"></i>
              </span>
              <span className="fs-medium">Continue with Google</span>
            </button>
          )}
          {!accounts.some(a => a.provider === 'discord') && (
            <button
              className="btn btn-light border-0 w-100 d-flex align-items-center justify-content-center py-2"
              onClick={handleLinkDiscord}
            >
              <span className="me-2 fs-medium">
                <i className="fab fa-discord"></i>
              </span>
              <span className="fs-medium">Connect with Discord</span>
            </button>
          )}
          {!accounts.some(a => a.provider === 'siwe') && (
            <button
              className="btn btn-light border-0 w-100 d-flex align-items-center justify-content-center py-2"
              onClick={handleLinkSIWE}
            >
              <span className="me-2 fs-medium">
                <i className="fab fa-ethereum"></i>
              </span>
              <span className="fs-medium">Connect Ethereum Wallet (SIWE)</span>
            </button>
          )}
        </div>
      </div>

      <div className="alert alert-info mt-2" role="alert">
        <div className="d-flex align-items-start">
          <i className="fas fa-info-circle me-1 mt-1"></i>
          <div>
            <strong>Automatic Linking</strong><br />
            When you log in with a new provider using the same email, accounts are automatically linked!
          </div>
        </div>
      </div>
    </div>
  )
}
