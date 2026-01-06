import React, { useState, useEffect } from 'react'
import { ProfileSection } from './profile-section'
import { ConnectedAccounts } from './connected-accounts'
import { CreditsBalance } from './credits-balance'

interface AccountManagerProps {
  plugin: any
}

export const AccountManager: React.FC<AccountManagerProps> = ({ plugin }) => {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkLoginStatus = async () => {
      try {
        const user = await plugin.call('auth', 'getUser')
        setIsLoggedIn(!!user)
      } catch (err) {
        setIsLoggedIn(false)
      } finally {
        setLoading(false)
      }
    }

    checkLoginStatus()

    const onAuthStateChanged = async (_payload: any) => {
      await checkLoginStatus()
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

  if (loading) {
    return (
      <div className="p-3">
        <div className="spinner-border spinner-border-sm" role="status">
          <span className="sr-only">Loading...</span>
        </div>
        <span className="ms-2">Loading...</span>
      </div>
    )
  }

  if (!isLoggedIn) {
    return (
      <div className="alert alert-warning p-3" role="alert">
        <i className="fas fa-exclamation-triangle me-2"></i>
        Not logged in. Please log in with Google, GitHub, Discord, or wallet to manage accounts.
      </div>
    )
  }

  return (
    <div className="account-manager">
      <div className="mb-4">
        <h5 style={{ fontSize: '1.2rem' }}>Profile</h5>
        <ProfileSection plugin={plugin} />
      </div>
      <div className="mb-4">
        <h5 style={{ fontSize: '1.2rem' }}>Credits Balance</h5>
        <CreditsBalance plugin={plugin} />
      </div>
      <div className="mb-4">
        <h5 style={{ fontSize: '1.2rem' }}>Connected Accounts</h5>
        <p className="text-muted mb-3" style={{ fontSize: '0.85rem' }}>
          Link multiple authentication providers to access your account from anywhere. All linked accounts share the same credits and subscriptions.
        </p>
        <ConnectedAccounts plugin={plugin} />
      </div>
    </div>
  )
}
