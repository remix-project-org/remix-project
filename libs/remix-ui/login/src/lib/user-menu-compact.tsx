import React, { useState, useEffect, useContext } from 'react'
import { AuthUser, AuthProvider, LinkedAccount, AccountsResponse, FeatureGroup } from '@remix-api'
import type { Credits } from '../../../app/src/lib/remix-app/context/auth-context'
import { useAuth } from '../../../app/src/lib/remix-app/context/auth-context'
import { ToggleSwitch } from '@remix-ui/toggle'
import { AppContext } from '@remix-ui/app'
import { FeatureBadges } from './feature-badges'
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
  plugin?: any
  cloneGitRepository?: () => void
  publishToGist?: () => void
  pollForCurrentTheme?: () => Promise<void>
}

const getProviderIcon = (provider: AuthProvider | string) => {
  console.log('getProviderIcon', provider)
  switch (provider) {
  case 'google': return 'fab fa-google'
  case 'github': return 'fab fa-github'
  case 'discord': return 'fab fa-discord'
  case 'siwe': return 'fab fa-ethereum'
  case 'base': return 'base-icon' // Custom handling for Base icon
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
  onThemeChange,
  plugin,
  cloneGitRepository,
  publishToGist,
  pollForCurrentTheme

}) => {
  const [showDropdown, setShowDropdown] = useState(false)
  const { featureGroups } = useAuth()
  const appContext = useContext(AppContext)
  const gitHubUser = appContext?.appState?.gitHubUser
  const isGitHubConnected = gitHubUser?.isConnected

  const trackEvent = (action: string, name?: string) => {
    if (plugin && typeof plugin.call === 'function') {
      plugin.call('matomo', 'trackEvent', 'userMenu', action, name || '', undefined).catch(() => {})
    }
  }

  const hasBeta = featureGroups?.some(fg => fg.name === 'beta')
  const buttonClass = `btn btn-sm d-flex flex-nowrap align-items-center user-menu-compact-button ${
    hasBeta ? 'user-menu-compact-button--beta' : 'btn-success'
  }`

  return (
    <div className={`position-relative ${className}`}>
      <button
        className={buttonClass}
        onClick={async () => {
          const willOpen = !showDropdown
          await pollForCurrentTheme?.()
          setShowDropdown(willOpen)
          if (willOpen) trackEvent('openDropdown')
        }}
        data-id="user-menu-compact"
        title={getUserDisplayName()}
      >
        {user.picture && (
          <div className={`user-menu-compact-avatar-wrap ${hasBeta ? 'user-menu-compact-avatar-wrap--beta' : ''}`}>
            <img
              src={user.picture}
              alt="Avatar"
              className="user-menu-compact-avatar"
            />
          </div>
        )}
        {!user.picture && (
          <div className="user-menu-compact-info">
            <span className="user-menu-compact-name">{getUserDisplayName()}</span>
          </div>
        )}
        {hasBeta && (
          <span className="user-menu-compact-beta-tag">BETA</span>
        )}
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
              {/* Feature Badges */}
              <FeatureBadges plugin={plugin} onClose={() => setShowDropdown(false)} />

              {/* Account Settings - temporarily hidden */}
              {/* {onManageAccounts && (
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
              )} */}

              {/* Credits - temporarily hidden */}
              {/* {credits && showCredits && (
                <div className="dropdown-item user-menu-credits-item">
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <i className="fas fa-coins user-menu-credits-icon"></i>
                    <span>Credits</span>
                  </div>
                  <strong className="user-menu-credits-balance">
                    {credits.balance.toLocaleString()}
                  </strong>
                </div>
              )} */}

              <div className="dropdown-divider user-menu-divider"></div>

              {/* GitHub / Git Section */}
              <div className="user-menu-git-section">
                {isGitHubConnected ? (
                  <>
                    <div className="dropdown-item-text small text-muted d-flex align-items-center">
                      <i className="fab fa-github me-2"></i>
                      <span>{gitHubUser.login}</span>
                      {gitHubUser.avatar_url && (
                        <img
                          src={gitHubUser.avatar_url}
                          alt=""
                          className="ms-auto"
                          style={{ width: '20px', height: '20px', borderRadius: '50%' }}
                        />
                      )}
                    </div>
                    {cloneGitRepository && (
                      <button
                        className="dropdown-item user-menu-item"
                        onClick={() => {
                          cloneGitRepository()
                          trackEvent('cloneGitRepository')
                          setShowDropdown(false)
                        }}
                      >
                        <i className="fas fa-clone user-menu-item-icon"></i>
                        Clone
                      </button>
                    )}
                    {publishToGist && (
                      <button
                        className="dropdown-item user-menu-item"
                        onClick={() => {
                          publishToGist()
                          trackEvent('publishToGist')
                          setShowDropdown(false)
                        }}
                      >
                        <i className="fab fa-github user-menu-item-icon"></i>
                        Publish to Gist
                      </button>
                    )}
                    <button
                      className="dropdown-item user-menu-item text-danger"
                      onClick={async () => {
                        if (plugin) {
                          await plugin.call('auth', 'disconnectGitHub')
                        }
                        trackEvent('disconnectGitHub')
                        setShowDropdown(false)
                      }}
                    >
                      <i className="fas fa-unlink user-menu-item-icon"></i>
                      Disconnect GitHub
                    </button>
                  </>
                ) : (
                  <>
                    {cloneGitRepository && (
                      <button
                        className="dropdown-item user-menu-item"
                        onClick={() => {
                          cloneGitRepository()
                          trackEvent('cloneGitRepository')
                          setShowDropdown(false)
                        }}
                      >
                        <i className="fas fa-clone user-menu-item-icon"></i>
                        Clone
                      </button>
                    )}
                    <button
                      className="dropdown-item user-menu-item"
                      onClick={async () => {
                        if (plugin) {
                          try {
                            await plugin.call('auth', 'linkAccount', 'github')
                          } catch (error) {
                            console.error('Failed to connect GitHub:', error)
                          }
                        }
                        trackEvent('connectGitHub')
                        setShowDropdown(false)
                      }}
                    >
                      <i className="fab fa-github user-menu-item-icon"></i>
                      Connect GitHub
                    </button>
                  </>
                )}
              </div>

              <div className="dropdown-divider user-menu-divider"></div>

              {/* Report a Bug */}
              <button
                className="dropdown-item user-menu-item"
                onClick={() => {
                  window.open('https://github.com/ethereum/remix-project/issues/new?template=bug_report.md', '_blank')
                  trackEvent('reportBug')
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
                  trackEvent('requestFeature')
                  setShowDropdown(false)
                }}
              >
                <i className="fas fa-lightbulb user-menu-item-icon"></i>
                Request a Feature
              </button>

              {/* Documentation */}
              <button
                className="dropdown-item user-menu-item"
                onClick={() => {
                  window.open('https://remix-ide.readthedocs.io/', '_blank')
                  trackEvent('documentation')
                  setShowDropdown(false)
                }}
              >
                <i className="fas fa-book user-menu-item-icon"></i>
                Documentation
              </button>

              {/* Help & Guides */}
              <button
                className="dropdown-item user-menu-item"
                onClick={async () => {
                  if (plugin) {
                    try {
                      await plugin.call('menuicons', 'select', 'helpPlugin')
                    } catch (error) {
                      console.error('Failed to open Help & Guides:', error)
                    }
                  }
                  trackEvent('openHelpGuides')
                  setShowDropdown(false)
                }}
              >
                <i className="fas fa-circle-question user-menu-item-icon"></i>
                Help &amp; Guides
              </button>

              {/* Beta Discord Channel */}
              {hasBeta && (
                <button
                  className="dropdown-item user-menu-item user-menu-item--discord"
                  onClick={() => {
                    window.open('https://discord.gg/TWfKkZVwJW', '_blank')
                    trackEvent('betaDiscord')
                    setShowDropdown(false)
                  }}
                >
                  <i className="fab fa-discord user-menu-item-icon" style={{ color: '#5865F2' }}></i>
                  Beta Feedback Channel
                </button>
              )}

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
                          trackEvent('themeToggle', 'light')
                        } else if (!isDarkMode && darkTheme) {
                          onThemeChange(darkTheme.name)
                          trackEvent('themeToggle', 'dark')
                        }
                      }}
                    />
                  </div>
                )
              })()}

              <div className="dropdown-divider user-menu-divider"></div>

              {/* Sign Out */}
              <button
                data-id="user-menu-sign-out"
                className="dropdown-item user-menu-item-danger"
                onClick={() => { trackEvent('signOut'); onLogout() }}
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
