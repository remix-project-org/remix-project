import React, { useState, useEffect, useContext } from 'react'
import { LoginMode } from '@remix-api'
import { BillingManager } from '@remix-ui/billing'
import { AppContext } from '@remix-ui/app'

interface BillingSectionProps {
  plugin: any
}

export const BillingSection: React.FC<BillingSectionProps> = ({ plugin }) => {
  const appContext = useContext(AppContext)
  const [paddleConfig, setPaddleConfig] = useState<{ clientToken: string | null; environment: 'sandbox' | 'production' } | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [loginEnabled, setLoginEnabled] = useState(false)
  const configEnabled = appContext?.appConfig?.['billing.enable_subscriptions'] !== false

  useEffect(() => {
    // Fetch login mode from auth plugin
    const fetchLoginMode = async () => {
      try {
        const response = await plugin?.call('auth', 'getLoginMode')
        const mode: LoginMode = response?.mode || 'open'
        setLoginEnabled(mode !== 'closed')
      } catch {
        // Fallback to localStorage for backwards compatibility
        setLoginEnabled(localStorage.getItem('enableLogin') === 'true')
      }
    }
    fetchLoginMode()

    // Listen for login mode changes
    const handleLoginModeChanged = (response: { mode: LoginMode; message: string }) => {
      if (response?.mode) {
        setLoginEnabled(response.mode !== 'closed')
      }
    }
    try {
      plugin?.on('auth', 'loginModeChanged', handleLoginModeChanged)
    } catch { /* ignore */ }

    // Get Paddle configuration
    const loadPaddleConfig = async () => {
      try {
        const config = await plugin?.call('auth', 'getPaddleConfig')
        setPaddleConfig(config)
      } catch (err) {
        console.log('[BillingSection] Could not load Paddle config:', err)
      }
    }
    loadPaddleConfig()

    // Check auth status
    const checkAuth = async () => {
      try {
        const user = await plugin?.call('auth', 'getUser')
        setIsAuthenticated(!!user)
      } catch {
        setIsAuthenticated(false)
      }
    }
    checkAuth()

    // Listen for auth changes
    const handleAuthChange = (authState: { isAuthenticated: boolean }) => {
      setIsAuthenticated(authState.isAuthenticated)
    }

    try {
      plugin?.on('auth', 'authStateChanged', handleAuthChange)
    } catch {
      // Ignore if plugin not available
    }

    return () => {
      try {
        plugin?.off('auth', 'authStateChanged')
        plugin?.off('auth', 'loginModeChanged')
      } catch {
        // Ignore
      }
    }
  }, [plugin])

  if (!loginEnabled || !configEnabled) {
    return null
  }

  const handlePurchaseComplete = async () => {
    // Refresh credits after purchase
    try {
      await plugin?.call('auth', 'refreshCredits')
    } catch (err) {
      console.error('[BillingSection] Failed to refresh credits:', err)
    }
  }

  return (
    <div className="billing-section">
      <BillingManager
        plugin={plugin}
        paddleClientToken={paddleConfig?.clientToken || undefined}
        paddleEnvironment={paddleConfig?.environment || 'sandbox'}
        onPurchaseComplete={handlePurchaseComplete}
      />
    </div>
  )
}
