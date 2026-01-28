import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@remix-ui/app'
import { FormattedMessage } from 'react-intl'
import { ProfileSection, ConnectedAccounts, CreditsBalance } from '@remix-ui/settings'
import { BillingManager } from '@remix-ui/billing'
import './account-overlay.css'

// Tab type
type AccountTab = 'profile' | 'credits' | 'billing' | 'accounts'

export interface AccountOverlayProps {
  plugin: any
}

export const AccountOverlay: React.FC<AccountOverlayProps> = ({ plugin }) => {
  const { isAuthenticated, user, credits, refreshCredits } = useAuth()
  const [activeTab, setActiveTab] = useState<AccountTab>('profile')
  const [loading, setLoading] = useState(false)
  const [paddleConfig, setPaddleConfig] = useState<{ clientToken: string | null; environment: 'sandbox' | 'production' } | null>(null)

  useEffect(() => {
    if (isAuthenticated) {
      refreshCredits()
    }
  }, [isAuthenticated])

  // Load Paddle configuration
  useEffect(() => {
    const loadPaddleConfig = async () => {
      try {
        const config = await plugin?.call('auth', 'getPaddleConfig')
        setPaddleConfig(config)
      } catch (err) {
        console.log('[AccountOverlay] Could not load Paddle config:', err)
      }
    }
    loadPaddleConfig()
  }, [plugin])

  const tabs: { id: AccountTab; label: string; icon: string }[] = [
    { id: 'profile', label: 'Profile', icon: 'fa-user' },
    { id: 'credits', label: 'Credits', icon: 'fa-coins' },
    { id: 'billing', label: 'Billing', icon: 'fa-credit-card' },
    { id: 'accounts', label: 'Connected Accounts', icon: 'fa-link' }
  ]

  if (!isAuthenticated) {
    return (
      <div className="account-overlay d-flex flex-column align-items-center justify-content-center h-100 p-4">
        <i className="fas fa-user-circle fa-4x mb-3 text-muted"></i>
        <h4 className="mb-3">
          <FormattedMessage id="account.notLoggedIn" defaultMessage="Not Logged In" />
        </h4>
        <p className="text-muted text-center mb-4">
          <FormattedMessage 
            id="account.loginPrompt" 
            defaultMessage="Please log in to access your account settings, credits, and billing information."
          />
        </p>
        <button 
          className="btn btn-primary"
          onClick={() => plugin.call('overlay', 'hideOverlay')}
        >
          <FormattedMessage id="account.close" defaultMessage="Close" />
        </button>
      </div>
    )
  }

  const getUserDisplayName = () => {
    if (!user) return 'Unknown'
    if (user.name) return user.name
    if (user.email) return user.email
    return user.sub
  }

  return (
    <div className="account-overlay d-flex h-100">
      {/* Sidebar Navigation */}
      <div className="account-sidebar border-end d-flex flex-column" style={{ width: '220px', minWidth: '220px' }}>
        <div className="p-3 border-bottom">
          <div className="d-flex align-items-center">
            {user?.picture ? (
              <img 
                src={user.picture} 
                alt={user.name || user.email} 
                className="rounded-circle mr-2"
                style={{ width: '40px', height: '40px' }}
              />
            ) : (
              <div 
                className="rounded-circle bg-secondary d-flex align-items-center justify-content-center mr-2"
                style={{ width: '40px', height: '40px' }}
              >
                <i className="fas fa-user text-white"></i>
              </div>
            )}
            <div className="ml-2 overflow-hidden">
              <div className="font-weight-bold text-truncate" style={{ maxWidth: '140px' }}>
                {getUserDisplayName()}
              </div>
              <small className="text-muted text-truncate d-block" style={{ maxWidth: '140px' }}>
                {user?.email}
              </small>
            </div>
          </div>
        </div>

        {/* Credit Balance Summary */}
        <div className="p-3 border-bottom" style={{ background: 'var(--bs-secondary-bg)' }}>
          <div className="d-flex align-items-center justify-content-between">
            <span className="text-muted small">Credits</span>
            <span className="font-weight-bold">
              🪙 {credits?.balance?.toLocaleString() || 0}
            </span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex-grow-1 overflow-auto py-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`account-nav-item d-flex align-items-center w-100 border-0 px-3 py-2 ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              style={{ background: 'transparent', textAlign: 'left' }}
            >
              <i className={`fas ${tab.icon} mr-2`} style={{ width: '20px' }}></i>
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Footer with logout */}
        <div className="p-3 border-top">
          <button
            className="btn btn-outline-secondary btn-sm w-100"
            onClick={() => {
              plugin.call('auth', 'logout')
              plugin.call('overlay', 'hideOverlay')
            }}
          >
            <i className="fas fa-sign-out-alt mr-2"></i>
            Logout
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="account-content flex-grow-1 overflow-auto p-4">
        {activeTab === 'profile' && (
          <div className="account-section">
            <h3 className="mb-4">
              <i className="fas fa-user mr-2"></i>
              Profile
            </h3>
            <ProfileSection plugin={plugin} />
          </div>
        )}

        {activeTab === 'credits' && (
          <div className="account-section">
            <h3 className="mb-4">
              <i className="fas fa-coins mr-2"></i>
              Credits Balance
            </h3>
            <CreditsBalance plugin={plugin} />
          </div>
        )}

        {activeTab === 'billing' && (
          <div className="account-section">
            <h3 className="mb-4">
              <i className="fas fa-credit-card mr-2"></i>
              Billing & Subscriptions
            </h3>
            <BillingManager 
              plugin={plugin}
              paddleClientToken={paddleConfig?.clientToken || undefined}
              paddleEnvironment={paddleConfig?.environment || 'sandbox'}
              onPurchaseComplete={() => refreshCredits()}
            />
          </div>
        )}

        {activeTab === 'accounts' && (
          <div className="account-section">
            <h3 className="mb-4">
              <i className="fas fa-link mr-2"></i>
              Connected Accounts
            </h3>
            <p className="text-muted mb-4">
              Link multiple authentication providers to access your account from anywhere. 
              All linked accounts share the same credits and subscriptions.
            </p>
            <ConnectedAccounts plugin={plugin} />
          </div>
        )}
      </div>
    </div>
  )
}

export default AccountOverlay
