import React, { useState, useEffect } from 'react'
import { useAuth } from '../../../app/src/lib/remix-app/context/auth-context'
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
}

export const LoginButton: React.FC<LoginButtonProps> = ({
  className = '',
  showCredits = true,
  variant = 'button',
  plugin
}) => {
  const { isAuthenticated, user, credits, logout, login } = useAuth()
  const [showModal, setShowModal] = useState(false)
  const [themes, setThemes] = useState<Array<{ name: string; quality: string }>>([])
  const [currentTheme, setCurrentTheme] = useState<string>('')

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

  const handleLogout = async () => {
    await logout()
  }

  const handleManageAccounts = () => {
    // Open Account overlay
    if (plugin && typeof plugin.call === 'function') {
      (async () => {
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
      'siwe': 'Ethereum'
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
    return (
      <>
        <button
          className={`btn btn-sm btn-primary ${className}`}
          onClick={() => setShowModal(true)}
          data-id="login-button"
        >
          Sign In
        </button>
        {showModal && <LoginModal onClose={() => setShowModal(false)} />}
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
