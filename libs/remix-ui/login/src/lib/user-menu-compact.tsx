import React, { useState, useEffect } from 'react'
import { AuthUser, AuthProvider, LinkedAccount, AccountsResponse } from '@remix-api'
import type { Credits } from '../../../app/src/lib/remix-app/context/auth-context'
import { ToggleSwitch } from '@remix-ui/toggle'
import './user-menu-compact.css'

interface Theme {
  name: string
  quality: string
}

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
  themes?: Theme[]
  currentTheme?: string
  onThemeChange?: (themeName: string) => void
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
  getLinkedAccounts,
  themes,
  currentTheme,
  onThemeChange
}) => {
  const [showDropdown, setShowDropdown] = useState(false)

  return (
    <div className={`position-relative ${className}`}>
      <button
        className="btn btn-sm btn-success d-flex flex-nowrap align-items-center user-menu-compact-button"
        onClick={() => setShowDropdown(!showDropdown)}
        data-id="user-menu-compact"
        title={getUserDisplayName()}
      >
        {user.picture && (
          <img
            src={user.picture}
            alt="Avatar"
            className="user-menu-compact-avatar"
          />
        )}
        <div className="user-menu-compact-info">
          <span className="user-menu-compact-name">{getUserDisplayName()}</span>
        </div>
      </button>
      {showDropdown && (
        <>
          <div className="dropdown-menu dropdown-menu-end show user-menu-dropdown">
            <div className="dropdown-header user-menu-dropdown-header">
              {user.picture && (
                <img
                  src={user.picture}
                  alt="Avatar"
                  className="user-menu-dropdown-avatar"
                />
              )}
              <div className="user-menu-dropdown-name">
                {getUserDisplayName()}
              </div>
            </div>

            {/* Connected Account */}
            {user.provider && (
              <div className="dropdown-item-text small text-muted user-menu-provider">
                <i className={`${getProviderIcon(user.provider)} me-2`}></i>
                {getProviderDisplayName(user.provider)}
              </div>
            )}

            {/* Menu Items */}
            <div className="user-menu-items-container">
              {/* Account Settings */}
              {onManageAccounts && (
                <button
                  className="dropdown-item user-menu-item"
                  onClick={() => {
                    onManageAccounts()
                    setShowDropdown(false)
                  }}
                >
                  <i className="fas fa-user-cog user-menu-item-icon"></i>
                  Account Settings
                </button>
              )}

              {/* Credits */}
              {credits && showCredits && (
                <div className="dropdown-item user-menu-credits-item">
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <i className="fas fa-coins user-menu-credits-icon"></i>
                    <span>Credits</span>
                  </div>
                  <strong className="user-menu-credits-balance">
                    {credits.balance.toLocaleString()}
                  </strong>
                </div>
              )}

              <div className="dropdown-divider user-menu-divider"></div>

              {/* Report a Bug */}
              <button
                className="dropdown-item user-menu-item"
                onClick={() => {
                  window.open('https://github.com/ethereum/remix-project/issues/new?template=bug_report.md', '_blank')
                  setShowDropdown(false)
                }}
              >
                <i className="fas fa-bug user-menu-item-icon"></i>
                Report a Bug
              </button>

              {/* Request a Feature */}
              <button
                className="dropdown-item user-menu-item"
                onClick={() => {
                  window.open('https://github.com/ethereum/remix-project/issues/new?template=feature_request.md', '_blank')
                  setShowDropdown(false)
                }}
              >
                <i className="fas fa-lightbulb user-menu-item-icon"></i>
                Request a Feature
              </button>

              {/* Get Support */}
              <button
                className="dropdown-item user-menu-item"
                onClick={() => {
                  window.open('https://discord.gg/qhpCQGWkmf', '_blank')
                  setShowDropdown(false)
                }}
              >
                <i className="fas fa-question-circle user-menu-item-icon"></i>
                Get Support
              </button>

              <div className="dropdown-divider user-menu-divider"></div>

              {/* Theme Selection */}
              {themes && themes.length > 0 && onThemeChange && (() => {
                // Find dark and light themes
                const darkTheme = themes.find(t => t.quality.toLowerCase() === 'dark')
                const lightTheme = themes.find(t => t.quality.toLowerCase() === 'light')
                const isDarkMode = currentTheme && darkTheme && currentTheme.toLowerCase() === darkTheme.name.toLowerCase()

                return (
                  <div className="user-menu-item user-menu-theme-toggle">
                    <i className="fas fa-palette user-menu-item-icon"></i>
                    <span className="flex-grow-1">{isDarkMode ? 'Dark Mode' : 'Light Mode'}</span>
                    <ToggleSwitch
                      id="user-menu-theme-toggle"
                      isOn={isDarkMode}
                      size="lg"
                      onClick={() => {
                        if (isDarkMode && lightTheme) {
                          onThemeChange(lightTheme.name)
                        } else if (!isDarkMode && darkTheme) {
                          onThemeChange(darkTheme.name)
                        }
                      }}
                    />
                  </div>
                )
              })()}

              <div className="dropdown-divider user-menu-divider"></div>

              {/* Sign Out */}
              <button
                className="dropdown-item user-menu-item-danger"
                onClick={onLogout}
              >
                <i className="fas fa-sign-out-alt user-menu-item-icon"></i>
                Sign Out
              </button>
            </div>
          </div>
          <div
            className="user-menu-backdrop"
            onClick={() => setShowDropdown(false)}
          />
        </>
      )}
    </div>
  )
}
