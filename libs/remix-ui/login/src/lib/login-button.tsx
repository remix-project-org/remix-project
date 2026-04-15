import React, { useState, useEffect, useContext } from 'react'
import { useAuth } from '../../../app/src/lib/remix-app/context/auth-context'
import { AppContext } from '../../../app/src/lib/remix-app/context/context'
import { LoginModal } from './modals/login-modal'
import { UserBadge } from './user-badge'
import { UserMenuCompact } from './user-menu-compact'
import { UserMenuFull } from './user-menu-full'
import { AuthProviderType } from '@remix-ui/app'

interface LoginButtonProps {
  className?: string
  showCredits?: boolean
  variant?: 'button' | 'badge' | 'compact'
  plugin?: any
  cloneGitRepository?: () => void
  publishToGist?: () => void
}

export const LoginButton: React.FC<LoginButtonProps> = ({
  className = '',
  showCredits = true,
  variant = 'button',
  plugin,
  cloneGitRepository,
  publishToGist
}) => {
  const appContext = useContext(AppContext)
  const { isAuthenticated, user, credits, logout, login } = useAuth()
  const [showModal, setShowModal] = useState(false)
  const [themes, setThemes] = useState<Array<{ name: string; quality: string }>>([])
  const [currentTheme, setCurrentTheme] = useState<string>('')
  const signInButtonMode = appContext?.appConfig?.['auth.sign_in_button_mode'] || 'hidden'

  useEffect(() => {
    if (plugin && typeof plugin.call === 'function') {
      (async () => {
        try {
          const themeModule = await plugin.call('theme', 'getThemes')
          if (themeModule) {
            setThemes(themeModule)
          }
          const active = await plugin.call('theme', 'currentTheme')
          if (active) {
            setCurrentTheme(active.name)
          }
        } catch (err) {
          console.log('[LoginButton] Theme module not available:', err)
        }
      })()
    }
  }, [plugin])

  const pollForCurrentTheme = async () => {
    const active = await plugin.call('theme', 'currentTheme')
    if (active) {
      setCurrentTheme(active.name)
    }
  }

  const handleLogout = async () => {
    await logout()
    if (plugin && typeof plugin.call === 'function') {
      plugin.call('matomo', 'trackEvent', 'auth', 'logout', 'Sign Out', undefined).catch(() => {})
    }
  }

  const handleManageAccounts = () => {
    // Open Account overlay
    if (plugin && typeof plugin.call === 'function') {
      plugin.call('matomo', 'trackEvent', 'userMenu', 'manageAccounts', 'Manage Accounts', undefined).catch(() => {})
      ;(async () => {
        try {
          await plugin.call('account', 'open')
        } catch (err) {
          console.error('[LoginButton] Failed to open Account overlay:', err)
          // Fallback to settings if account plugin is not available
          try {
            //const isActive = await plugin.call('manager', 'isActive', 'settings')
            //if (!isActive) await plugin.call('manager', 'activatePlugin', 'settings')
            //await plugin.call('tabs', 'focus', 'settings')
            //await plugin.call('settings', 'showSection', 'account')
          } catch (settingsErr) {
            //console.error('[LoginButton] Failed to open Settings:', settingsErr)
          }
        }
      })()
    }
  }

  const formatAddress = (address: string) => {
    if (!address) return ''
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`
  }

  const getProviderDisplayName = (provider: string) => {
    const providerNames: Record<string, string> = {
      'google': 'Google',
      'github': 'GitHub',
      'apple': 'Apple',
      'discord': 'Discord',
      'coinbase': 'Coinbase Wallet',
      'siwe': 'Ethereum',
      'base': 'Base'
    }
    return providerNames[provider] || provider
  }

  const getUserDisplayName = () => {
    if (!user) return 'Unknown'
    if (user.name) return user.name
    if (user.email) return user.email
    if (user.address) return formatAddress(user.address)
    return user.sub
  }

  const handleThemeChange = async (themeName: string) => {
    if (plugin && typeof plugin.call === 'function') {
      try {
        await plugin.call('theme', 'switchTheme', themeName)
        setCurrentTheme(themeName)
      } catch (err) {
        console.error('[LoginButton] Failed to switch theme:', err)
      }
    }
  }

  if (!isAuthenticated) {
    if (signInButtonMode === 'hidden') return null

    return (
      <>
        <button
          className={`btn btn-sm btn-primary ${className}`}
          style={{ whiteSpace: 'nowrap' }}
          onClick={() => {
            setShowModal(true)
            if (plugin && typeof plugin.call === 'function') {
              plugin.call('matomo', 'trackEvent', 'auth', 'openLoginModal', 'Sign In', undefined).catch(() => {})
            }
          }}
          data-id="login-button"
        >
          <span className="d-inline-flex align-items-center">
            <span className="me-1">Sign In</span>
            {signInButtonMode === 'beta' && (
              <span className="ms-2 user-menu-compact-beta-tag">BETA</span>
            )}
          </span>
        </button>
        {showModal && <LoginModal onClose={() => setShowModal(false)} plugin={plugin} />}
      </>
    )
  }

  if (variant === 'badge') {
    return (
      <UserBadge
        user={user}
        credits={credits}
        showCredits={showCredits}
        className={className}
        onLogout={handleLogout}
        formatAddress={formatAddress}
        getProviderDisplayName={getProviderDisplayName}
        getUserDisplayName={getUserDisplayName}
      />
    )
  }

  if (variant === 'compact') {
    return (
      <UserMenuCompact
        user={user}
        credits={credits}
        showCredits={showCredits}
        className={className}
        onLogout={handleLogout}
        onManageAccounts={handleManageAccounts}
        getProviderDisplayName={getProviderDisplayName}
        getUserDisplayName={getUserDisplayName}
        themes={themes}
        currentTheme={currentTheme}
        onThemeChange={handleThemeChange}
        plugin={plugin}
        cloneGitRepository={cloneGitRepository}
        publishToGist={publishToGist}
        pollForCurrentTheme={pollForCurrentTheme}
      />
    )
  }

  return (
    <UserMenuFull
      user={user}
      credits={credits}
      showCredits={showCredits}
      className={className}
      onLogout={handleLogout}
      formatAddress={formatAddress}
      getProviderDisplayName={getProviderDisplayName}
      getUserDisplayName={getUserDisplayName}
    />
  )
}
