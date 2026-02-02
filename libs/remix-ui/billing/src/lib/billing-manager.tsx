import React, { useState, useEffect, useCallback } from 'react'
import { BillingManagerProps, CreditPackage, SubscriptionPlan, UserSubscription, Credits, FeatureAccessProduct, UserFeatureMembership } from './types'
import { BillingApiService, ApiClient } from '@remix-api'
import { endpointUrls } from '@remix-endpoints-helper'
import { CreditPackagesView } from './components/credit-packages-view'
import { SubscriptionPlansView } from './components/subscription-plans-view'
import { FeatureAccessProductsView } from './components/feature-access-products-view'
import { CurrentSubscription } from './components/current-subscription'
import { initPaddle, getPaddle, openCheckoutWithTransaction, onPaddleEvent, offPaddleEvent } from './paddle-singleton'
import type { Paddle, PaddleEventData } from '@paddle/paddle-js'

type TabType = 'features' | 'credits' | 'subscription'

/**
 * Main Billing Manager component
 * Handles credit packages, subscription plans, and Paddle checkout integration
 */
export const BillingManager: React.FC<BillingManagerProps> = ({
  plugin,
  paddleClientToken,
  paddleEnvironment = 'sandbox',
  onPurchaseComplete,
  onSubscriptionChange
}) => {
  // Billing API client
  const [billingApi] = useState(() => {
    const client = new ApiClient(endpointUrls.billing)
    // Set up token refresh callback
    client.setTokenRefreshCallback(async () => {
      const token = localStorage.getItem('remix_access_token')
      return token
    })
    return new BillingApiService(client)
  })

  // UI State
  const [activeTab, setActiveTab] = useState<TabType>('features')
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  // Feature Access Products state
  const [featureProducts, setFeatureProducts] = useState<FeatureAccessProduct[]>([])
  const [featureProductsLoading, setFeatureProductsLoading] = useState(true)
  const [featureProductsError, setFeatureProductsError] = useState<string | null>(null)
  const [featureMemberships, setFeatureMemberships] = useState<UserFeatureMembership[]>([])

  // Credit packages state
  const [packages, setPackages] = useState<CreditPackage[]>([])
  const [packagesLoading, setPackagesLoading] = useState(true)
  const [packagesError, setPackagesError] = useState<string | null>(null)

  // Subscription plans state
  const [plans, setPlans] = useState<SubscriptionPlan[]>([])
  const [plansLoading, setPlansLoading] = useState(true)
  const [plansError, setPlansError] = useState<string | null>(null)

  // User data state
  const [credits, setCredits] = useState<Credits | null>(null)
  const [subscription, setSubscription] = useState<UserSubscription | null>(null)
  const [userLoading, setUserLoading] = useState(true)

  // Purchase state
  const [purchasing, setPurchasing] = useState(false)
  const [subscribing, setSubscribing] = useState(false)
  const [purchasingFeature, setPurchasingFeature] = useState(false)

  // Paddle state
  const [paddle, setPaddle] = useState<Paddle | null>(null)
  const [paddleLoading, setPaddleLoading] = useState(false)
  const [paddleError, setPaddleError] = useState<string | null>(null)

  // Initialize Paddle
  useEffect(() => {
    if (!paddleClientToken) {
      console.log('[BillingManager] No Paddle client token provided')
      return
    }

    let mounted = true
    setPaddleLoading(true)

    initPaddle(paddleClientToken, paddleEnvironment)
      .then((instance) => {
        if (mounted) {
          setPaddle(instance)
          setPaddleError(null)
        }
      })
      .catch((err) => {
        if (mounted) {
          setPaddleError(err.message || 'Failed to initialize payment system')
          console.error('[BillingManager] Paddle init error:', err)
        }
      })
      .finally(() => {
        if (mounted) setPaddleLoading(false)
      })

    return () => { mounted = false }
  }, [paddleClientToken, paddleEnvironment])

  // Listen for Paddle checkout events
  useEffect(() => {
    const handlePaddleEvent = (event: PaddleEventData) => {
      if (event.name === 'checkout.completed') {
        console.log('[BillingManager] Checkout completed')
        setPurchasing(false)
        setSubscribing(false)
        setPurchasingFeature(false)
        // Refresh user data
        setTimeout(() => {
          loadUserData()
          onPurchaseComplete?.()
          onSubscriptionChange?.()
        }, 1500) // Give webhook time to process
      } else if (event.name === 'checkout.closed') {
        console.log('[BillingManager] Checkout closed')
        setPurchasing(false)
        setSubscribing(false)
        setPurchasingFeature(false)
      }
    }

    onPaddleEvent(handlePaddleEvent)
    return () => offPaddleEvent(handlePaddleEvent)
  }, [onPurchaseComplete, onSubscriptionChange])

  // Check authentication status
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const user = await plugin?.call('auth', 'getUser')
        setIsAuthenticated(!!user)

        // Set token for billing API
        const token = localStorage.getItem('remix_access_token')
        if (token) {
          billingApi.setToken(token)
        }
      } catch (err) {
        setIsAuthenticated(false)
      }
    }

    checkAuth()

    // Listen for auth changes
    const handleAuthChange = (authState: { isAuthenticated: boolean }) => {
      setIsAuthenticated(authState.isAuthenticated)
      if (authState.isAuthenticated) {
        const token = localStorage.getItem('remix_access_token')
        if (token) billingApi.setToken(token)
        loadUserData()
      } else {
        setCredits(null)
        setSubscription(null)
      }
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
  }, [plugin, billingApi])

  // Load public data (packages and plans)
  useEffect(() => {
    loadPublicData()
  }, [])

  // Load user data when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      loadUserData()
    }
  }, [isAuthenticated])

  const loadPublicData = async () => {
    // Load feature access products
    setFeatureProductsLoading(true)
    try {
      const response = await billingApi.getFeatureAccessProducts()
      if (response.ok && response.data) {
        setFeatureProducts(response.data.products || [])
        setFeatureProductsError(null)
      } else {
        setFeatureProductsError(response.error || 'Failed to load feature products')
      }
    } catch (err) {
      setFeatureProductsError('Failed to load feature products')
    } finally {
      setFeatureProductsLoading(false)
    }

    // Load credit packages
    setPackagesLoading(true)
    try {
      const response = await billingApi.getCreditPackages()
      if (response.ok && response.data) {
        // Filter to only show packages with active Paddle provider
        const availablePackages = BillingApiService.filterByActiveProvider(response.data.packages, 'paddle')
        setPackages(availablePackages)
        setPackagesError(null)
      } else {
        setPackagesError(response.error || 'Failed to load credit packages')
      }
    } catch (err) {
      setPackagesError('Failed to load credit packages')
    } finally {
      setPackagesLoading(false)
    }

    // Load subscription plans
    setPlansLoading(true)
    try {
      const response = await billingApi.getSubscriptionPlans()
      if (response.ok && response.data) {
        // Filter to only show plans with active Paddle provider
        const availablePlans = BillingApiService.filterByActiveProvider(response.data.plans, 'paddle')
        setPlans(availablePlans)
        setPlansError(null)
      } else {
        setPlansError(response.error || 'Failed to load subscription plans')
      }
    } catch (err) {
      setPlansError('Failed to load subscription plans')
    } finally {
      setPlansLoading(false)
    }
  }

  const loadUserData = useCallback(async () => {
    if (!isAuthenticated) return

    setUserLoading(true)
    try {
      // Load credits
      const creditsResponse = await billingApi.getCredits()
      if (creditsResponse.ok && creditsResponse.data) {
        setCredits(creditsResponse.data)
      }

      // Load subscription
      const subResponse = await billingApi.getSubscription()
      if (subResponse.ok && subResponse.data) {
        setSubscription(subResponse.data.subscription)
      }

      // Load feature memberships
      const membershipsResponse = await billingApi.getFeatureMemberships()
      if (membershipsResponse.ok && membershipsResponse.data) {
        setFeatureMemberships(membershipsResponse.data.memberships || [])
      }
    } catch (err) {
      console.error('[BillingManager] Failed to load user data:', err)
    } finally {
      setUserLoading(false)
    }
  }, [isAuthenticated, billingApi])

  const handlePurchaseCredits = async (packageId: string, priceId: string | null) => {
    if (!isAuthenticated) {
      // Prompt login
      try {
        await plugin?.call('auth', 'login', 'github')
        return
      } catch {
        console.error('[BillingManager] Login failed')
        return
      }
    }

    if (!priceId) {
      console.error('[BillingManager] No price ID for package:', packageId)
      return
    }

    setPurchasing(true)
    try {
      // Always call backend API first to create transaction with customData (userId)
      const response = await billingApi.purchaseCredits(packageId, 'paddle')
      if (!response.ok || !response.data) {
        console.error('[BillingManager] Failed to create checkout:', response.error)
        return
      }

      const { transactionId, checkoutUrl } = response.data

      // Use Paddle.js overlay if available and we have a transactionId
      const paddleInstance = paddle || getPaddle()
      if (paddleInstance && transactionId) {
        openCheckoutWithTransaction(paddleInstance, transactionId, {
          settings: {
            displayMode: 'overlay',
            theme: 'light'
          }
        })
      } else if (checkoutUrl) {
        // Fallback to redirect checkout URL
        window.open(checkoutUrl, '_blank')
        setPurchasing(false)
      } else {
        console.error('[BillingManager] No transactionId or checkoutUrl returned')
      }
    } catch (err) {
      console.error('[BillingManager] Purchase error:', err)
      setPurchasing(false)
    }
  }

  const handleSubscribe = async (planId: string, priceId: string | null) => {
    if (!isAuthenticated) {
      try {
        await plugin?.call('auth', 'login', 'github')
        return
      } catch {
        console.error('[BillingManager] Login failed')
        return
      }
    }

    if (!priceId) {
      console.error('[BillingManager] No price ID for plan:', planId)
      return
    }

    setSubscribing(true)
    try {
      // Always call backend API first to create transaction with customData (userId)
      const response = await billingApi.subscribe(planId, 'paddle')
      if (!response.ok || !response.data) {
        console.error('[BillingManager] Failed to create checkout:', response.error)
        return
      }

      const { transactionId, checkoutUrl } = response.data

      // Use Paddle.js overlay if available and we have a transactionId
      const paddleInstance = paddle || getPaddle()
      if (paddleInstance && transactionId) {
        openCheckoutWithTransaction(paddleInstance, transactionId, {
          settings: {
            displayMode: 'overlay',
            theme: 'light'
          }
        })
      } else if (checkoutUrl) {
        // Fallback to redirect checkout URL
        window.open(checkoutUrl, '_blank')
        setSubscribing(false)
      } else {
        console.error('[BillingManager] No transactionId or checkoutUrl returned')
      }
    } catch (err) {
      console.error('[BillingManager] Subscribe error:', err)
      setSubscribing(false)
    }
  }

  const handlePurchaseFeatureAccess = async (productSlug: string, priceId: string | null) => {
    if (!isAuthenticated) {
      try {
        await plugin?.call('auth', 'login', 'github')
        return
      } catch {
        console.error('[BillingManager] Login failed')
        return
      }
    }

    if (!priceId) {
      console.error('[BillingManager] No price ID for product:', productSlug)
      return
    }

    setPurchasingFeature(true)
    try {
      // Call backend API to create transaction
      const response = await billingApi.purchaseFeatureAccess(productSlug, 'paddle')
      if (!response.ok || !response.data) {
        console.error('[BillingManager] Failed to create checkout:', response.error)
        setPurchasingFeature(false)
        return
      }

      const { transactionId, checkoutUrl } = response.data

      // Use Paddle.js overlay if available
      const paddleInstance = paddle || getPaddle()
      if (paddleInstance && transactionId) {
        openCheckoutWithTransaction(paddleInstance, transactionId, {
          settings: {
            displayMode: 'overlay',
            theme: 'light'
          }
        })
      } else if (checkoutUrl) {
        // Fallback to redirect checkout URL
        window.open(checkoutUrl, '_blank')
        setPurchasingFeature(false)
      } else {
        console.error('[BillingManager] No transactionId or checkoutUrl returned')
        setPurchasingFeature(false)
      }
    } catch (err) {
      console.error('[BillingManager] Feature access purchase error:', err)
      setPurchasingFeature(false)
    }
  }

  const handleManageSubscription = () => {
    // Open Paddle customer portal or custom management page
    console.log('[BillingManager] Manage subscription')
    // TODO: Implement subscription management
  }

  return (
    <div className="billing-manager">
      {/* Header with credits balance */}
      {isAuthenticated && credits && (
        <div className="p-3 border-bottom d-flex justify-content-between align-items-center">
          <div>
            <i className="fas fa-wallet me-2"></i>
            <strong>Your Balance</strong>
          </div>
          <div className="h5 mb-0">
            <span className="badge bg-primary">
              <i className="fas fa-coins me-1"></i>
              {credits.balance.toLocaleString()} credits
            </span>
          </div>
        </div>
      )}

      {/* Paddle status warning */}
      {paddleError && (
        <div className="alert alert-warning m-3 mb-0">
          <i className="fas fa-exclamation-triangle me-2"></i>
          {paddleError}
        </div>
      )}

      {/* Login prompt */}
      {!isAuthenticated && (
        <div className="alert alert-info m-3">
          <i className="fas fa-info-circle me-2"></i>
          <a href="#" onClick={(e) => { e.preventDefault(); plugin?.call('auth', 'login', 'github') }}>
            Sign in
          </a> to purchase credits or manage your subscription.
        </div>
      )}

      {/* Current subscription */}
      {isAuthenticated && (
        <div className="p-3 border-bottom">
          <CurrentSubscription
            subscription={subscription}
            loading={userLoading}
            onManage={handleManageSubscription}
          />
        </div>
      )}

      {/* Tabs */}
      <ul className="nav nav-tabs px-3 pt-3">
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === 'features' ? 'active' : ''}`}
            onClick={() => setActiveTab('features')}
          >
            <i className="fas fa-unlock-alt me-2"></i>
            Feature Access
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === 'credits' ? 'active' : ''}`}
            onClick={() => setActiveTab('credits')}
          >
            <i className="fas fa-coins me-2"></i>
            Credit Packages
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === 'subscription' ? 'active' : ''}`}
            onClick={() => setActiveTab('subscription')}
          >
            <i className="fas fa-sync-alt me-2"></i>
            Subscription Plans
          </button>
        </li>
      </ul>

      {/* Tab content */}
      <div className="p-3">
        {activeTab === 'features' && (
          <FeatureAccessProductsView
            products={featureProducts}
            loading={featureProductsLoading}
            error={featureProductsError}
            memberships={featureMemberships}
            onPurchase={handlePurchaseFeatureAccess}
            purchasing={purchasingFeature}
          />
        )}

        {activeTab === 'credits' && (
          <CreditPackagesView
            packages={packages}
            loading={packagesLoading}
            error={packagesError}
            currentBalance={credits?.balance}
            onPurchase={handlePurchaseCredits}
            purchasing={purchasing}
          />
        )}

        {activeTab === 'subscription' && (
          <SubscriptionPlansView
            plans={plans}
            loading={plansLoading}
            error={plansError}
            currentSubscription={subscription}
            onSubscribe={handleSubscribe}
            subscribing={subscribing}
          />
        )}
      </div>
    </div>
  )
}
