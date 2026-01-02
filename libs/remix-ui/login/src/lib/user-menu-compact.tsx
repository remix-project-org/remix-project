import React, { useState, useEffect } from 'react'
import { AuthUser, AuthProvider, LinkedAccount, AccountsResponse } from '@remix-api'
import type { Credits } from '../../../app/src/lib/remix-app/context/auth-context'

interface UserMenuCompactProps {
  user: AuthUser
  credits: Credits | null
  showCredits: boolean
  className?: string
  onLogout: () => void
  onLinkProvider?: (provider: AuthProvider) => void
  onManageAccounts?: () => void
  getProviderDisplayName: (provider: string) => string
  getUserDisplayName: () => string
  getLinkedAccounts?: () => Promise<AccountsResponse | null>
}

const getProviderIcon = (provider: AuthProvider | string) => {
  console.log('getProviderIcon', provider)
  switch (provider) {
  case 'google': return 'fab fa-google'
  case 'github': return 'fab fa-github'
  case 'discord': return 'fab fa-discord'
  case 'siwe': return 'fab fa-ethereum'
  default: return 'fas fa-sign-in-alt'
  }
}

export const UserMenuCompact: React.FC<UserMenuCompactProps> = ({
  user,
  credits,
  showCredits,
  className,
  onLogout,
  onLinkProvider,
  onManageAccounts,
  getProviderDisplayName,
  getUserDisplayName,
  getLinkedAccounts
}) => {
  const [showDropdown, setShowDropdown] = useState(false)

  // All available providers including GitHub
  const allProviders: AuthProvider[] = ['google', 'github', 'discord', 'siwe']

  return (
    <div className={`position-relative ${className}`}>
      <button
        className="btn btn-sm btn-success d-flex flex-nowrap align-items-center"
        onClick={() => setShowDropdown(!showDropdown)}
        data-id="user-menu-compact"
        title={getUserDisplayName()}
      >
        <span>{getUserDisplayName()}</span>
        {user.picture && (
          <img
            src={user.picture}
            alt="Avatar"
            className="ms-1"
            style={{
              width: '25px',
              height: '25px',
              borderRadius: '50%',
              objectFit: 'cover',
            }}
          />
        )}
      </button>
      {showDropdown && (
        <>
          <div
            className="dropdown-menu dropdown-menu-end show user-menu-dropdown"
            style={{
              position: 'absolute',
              right: 0,
              top: '100%',
              minWidth: '240px',
              zIndex: 2000,
              backgroundColor: 'var(--bs-secondary-bg, #333446)',
              border: '1px solid var(--bs-border-color, #444)',
              borderRadius: '8px',
              boxShadow: '0 8px 16px rgba(0, 0, 0, 0.3)',
              padding: '0'
            }}
          >
            <div
              className="dropdown-header"
              style={{
                backgroundColor: 'var(--bs-primary, #007aa6)',
                color: 'white',
                padding: '12px 16px',
                borderRadius: '8px 8px 0 0',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
              }}
            >
              {user.picture && (
                <div className="d-flex justify-content-center mb-2">
                  <img
                    src={user.picture}
                    alt="Avatar"
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '50%',
                      objectFit: 'cover',
                      border: '2px solid rgba(255, 255, 255, 0.3)'
                    }}
                  />
                </div>
              )}
              <div style={{ textAlign: 'center', fontWeight: 600, fontSize: '0.95rem' }}>
                {getUserDisplayName()}
              </div>
            </div>

            {/* Connected Account */}
            {user.provider && (
              <div
                className="dropdown-item-text small text-muted"
                style={{
                  padding: '8px 16px',
                  backgroundColor: 'var(--bs-body-bg, #222336)',
                  borderBottom: '1px solid var(--bs-border-color, #444)'
                }}
              >
                <i className={`${getProviderIcon(user.provider)} me-2`}></i>
                {getProviderDisplayName(user.provider)}
              </div>
            )}

            {/* Menu Items */}
            <div style={{ padding: '4px 0' }}>
              {/* Account Settings */}
              {onManageAccounts && (
                <button
                  className="dropdown-item"
                  onClick={() => {
                    onManageAccounts()
                    setShowDropdown(false)
                  }}
                  style={{
                    padding: '8px 12px',
                    color: 'var(--bs-body-color, #a2a3bd)',
                    display: 'flex',
                    alignItems: 'center',
                    border: 'none',
                    backgroundColor: 'transparent',
                    width: '100%',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bs-body-bg, #222336)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <i className="fas fa-user-cog me-3" style={{ width: '16px', textAlign: 'center' }}></i>
                  Account Settings
                </button>
              )}

              {/* Credits */}
              {credits && showCredits && (
                <div
                  className="dropdown-item"
                  style={{
                    padding: '8px 12px',
                    color: 'var(--bs-body-color, #a2a3bd)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'default',
                    backgroundColor: 'transparent',
                    transition: 'background-color 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bs-body-bg, #222336)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <i className="fas fa-coins me-3" style={{ width: '16px', textAlign: 'center', color: 'var(--bs-warning, #f39c12)' }}></i>
                    <span>Credits</span>
                  </div>
                  <strong style={{ color: 'var(--bs-warning, #f39c12)', fontSize: '0.95rem' }}>
                    {credits.balance.toLocaleString()}
                  </strong>
                </div>
              )}

              <div className="dropdown-divider" style={{ margin: '8px 0', borderColor: 'var(--bs-border-color, #444)' }}></div>

              {/* Report a Bug */}
              <button
                className="dropdown-item"
                onClick={() => {
                  window.open('https://github.com/ethereum/remix-project/issues/new?template=bug_report.md', '_blank')
                  setShowDropdown(false)
                }}
                style={{
                  padding: '8px 12px',
                  color: 'var(--bs-body-color, #a2a3bd)',
                  display: 'flex',
                  alignItems: 'center',
                  border: 'none',
                  backgroundColor: 'transparent',
                  width: '100%',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bs-body-bg, #222336)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <i className="fas fa-bug me-3" style={{ width: '16px', textAlign: 'center', color: 'var(--bs-danger, #e74c3c)' }}></i>
                Report a Bug
              </button>

              {/* Request a Feature */}
              <button
                className="dropdown-item"
                onClick={() => {
                  window.open('https://github.com/ethereum/remix-project/issues/new?template=feature_request.md', '_blank')
                  setShowDropdown(false)
                }}
                style={{
                  padding: '8px 12px',
                  color: 'var(--bs-body-color, #a2a3bd)',
                  display: 'flex',
                  alignItems: 'center',
                  border: 'none',
                  backgroundColor: 'transparent',
                  width: '100%',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bs-body-bg, #222336)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <i className="fas fa-lightbulb me-3" style={{ width: '16px', textAlign: 'center', color: 'var(--bs-info, #3498db)' }}></i>
                Request a Feature
              </button>

              {/* Get Support */}
              <button
                className="dropdown-item"
                onClick={() => {
                  window.open('https://remix-ide.readthedocs.io/en/latest/', '_blank')
                  setShowDropdown(false)
                }}
                style={{
                  padding: '8px 12px',
                  color: 'var(--bs-body-color, #a2a3bd)',
                  display: 'flex',
                  alignItems: 'center',
                  border: 'none',
                  backgroundColor: 'transparent',
                  width: '100%',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bs-body-bg, #222336)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <i className="fas fa-question-circle me-3" style={{ width: '16px', textAlign: 'center', color: 'var(--bs-success, #00bc8c)' }}></i>
                Get Support
              </button>

              <div className="dropdown-divider" style={{ margin: '8px 0', borderColor: 'var(--bs-border-color, #444)' }}></div>

              {/* Sign Out */}
              <button
                className="dropdown-item"
                onClick={onLogout}
                style={{
                  padding: '8px 12px',
                  color: 'var(--bs-danger, #e74c3c)',
                  display: 'flex',
                  alignItems: 'center',
                  border: 'none',
                  backgroundColor: 'transparent',
                  width: '100%',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s',
                  fontWeight: 500
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bs-body-bg, #222336)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <i className="fas fa-sign-out-alt me-3" style={{ width: '16px', textAlign: 'center' }}></i>
                Sign Out
              </button>
            </div>
          </div>
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 1999
            }}
            onClick={() => setShowDropdown(false)}
          />
        </>
      )}
    </div>
  )
}
