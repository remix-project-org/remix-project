import React, { useState, useEffect } from 'react'
import { BillingManager } from '@remix-ui/billing'

interface BillingSectionProps {
  plugin: any
}

export const BillingSection: React.FC<BillingSectionProps> = ({ plugin }) => {
  const [paddleConfig, setPaddleConfig] = useState<{ clientToken: string | null; environment: 'sandbox' | 'production' } | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [enableLogin, setEnableLogin] = useState(false)

  useEffect(() => {
    // Check if login is enabled
    const enabled = localStorage.getItem('enableLogin') === 'true'
    setEnableLogin(enabled)

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
      } catch {
        // Ignore
      }
    }
  }, [plugin])

  if (!enableLogin) {
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
