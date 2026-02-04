import React, { useState, useEffect, useCallback } from 'react'
import { BillingManagerProps, Credits, EligibleProduct } from './types'
import { BillingApiService, ApiClient, ActiveEntitlement } from '@remix-api'
import { endpointUrls } from '@remix-endpoints-helper'
import { AvailableProductsView } from './components/available-products-view'
import { ActiveEntitlements } from './components/active-entitlements'
import { FreePaddleCheckoutOverlay } from './components/freepaddle-checkout-overlay'
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
    
    // Create a separate client for /products endpoints (different base URL)
    const productsClient = new ApiClient(endpointUrls.products)
    productsClient.setTokenRefreshCallback(async () => {
      const token = localStorage.getItem('remix_access_token')
      return token
    })
    
    const api = new BillingApiService(client, productsClient)
    return api
  })

  // UI State
  const [activeTab, setActiveTab] = useState<TabType>('features')
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  // Available Products state - all products from /products/available
  const [availableProducts, setAvailableProducts] = useState<EligibleProduct[]>([])
  const [availableProductsLoading, setAvailableProductsLoading] = useState(true)
  const [availableProductsError, setAvailableProductsError] = useState<string | null>(null)

  // Active Entitlements state - all active subscriptions and feature access from /products/active
  const [activeEntitlements, setActiveEntitlements] = useState<ActiveEntitlement[]>([])
  const [entitlementsLoading, setEntitlementsLoading] = useState(true)
  const [entitlementsError, setEntitlementsError] = useState<string | null>(null)

  // User data state
  const [credits, setCredits] = useState<Credits | null>(null)
  const [userLoading, setUserLoading] = useState(true)

  // Purchase state
  const [purchasing, setPurchasing] = useState(false)

  // FreePaddle checkout overlay state
  const [freepaddleCheckout, setFreepaddleCheckout] = useState<{
    isOpen: boolean
    checkoutUrl: string
    transactionId: string
    product: EligibleProduct
  } | null>(null)

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
        // Refresh user data
        setTimeout(() => {
          loadUserData()
          loadPublicData()
          onPurchaseComplete?.()
          onSubscriptionChange?.()
        }, 1500) // Give webhook time to process
      } else if (event.name === 'checkout.closed') {
        console.log('[BillingManager] Checkout closed')
        setPurchasing(false)
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
        setActiveEntitlements([])
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
    // Load all available products from unified API
    // The API decides what products the user can see based on eligibility rules
    setAvailableProductsLoading(true)
    try {
      const response = await billingApi.getAvailableProducts()
      if (response.ok && response.data) {
        setAvailableProducts(response.data.data || [])
        setAvailableProductsError(null)
      } else {
        setAvailableProductsError(response.error || 'Failed to load products')
      }
    } catch (err) {
      setAvailableProductsError('Failed to load products')
    } finally {
      setAvailableProductsLoading(false)
    }
  }

  const loadUserData = useCallback(async () => {
    if (!isAuthenticated) return

    setUserLoading(true)
    setEntitlementsLoading(true)
    
    try {
      // Load credits
      const creditsResponse = await billingApi.getCredits()
      if (creditsResponse.ok && creditsResponse.data) {
        setCredits(creditsResponse.data)
      }

      // Load active entitlements (subscriptions + feature access)
      const entitlementsResponse = await billingApi.getActiveEntitlements()
      if (entitlementsResponse.ok && entitlementsResponse.data) {
        setActiveEntitlements(entitlementsResponse.data.data || [])
        setEntitlementsError(null)
      } else {
        setEntitlementsError(entitlementsResponse.error || 'Failed to load subscriptions')
      }
    } catch (err) {
      console.error('[BillingManager] Failed to load user data:', err)
      setEntitlementsError('Failed to load subscriptions')
    } finally {
      setUserLoading(false)
      setEntitlementsLoading(false)
    }
  }, [isAuthenticated, billingApi])

  /**
   * Handle purchase from the unified available products view
   * Uses the product's product_code and provider_slug for the purchase endpoint
   */
  const handlePurchaseProduct = async (product: EligibleProduct) => {
    if (!isAuthenticated) {
      try {
        await plugin?.call('auth', 'login', 'github')
        return
      } catch {
        console.error('[BillingManager] Login failed')
        return
      }
    }

    // Validate product has required fields
    if (!product.product_code) {
      console.error('[BillingManager] Product does not have a product_code:', product.slug)
      return
    }
    if (!product.provider_slug) {
      console.error('[BillingManager] Product does not have a provider configured:', product.slug)
      return
    }

    setPurchasing(true)
    try {
      // Use the unified /products/purchase endpoint
      const response = await billingApi.purchaseProduct(product)
      
      if (!response.ok || !response.data) {
        console.error('[BillingManager] Failed to create checkout:', response.error)
        setPurchasing(false)
        return
      }

      const { transactionId, checkoutUrl } = response.data
      const provider = product.provider_slug

      // For freepaddle, use the overlay checkout experience
      if (provider === 'freepaddle') {
        if (checkoutUrl && transactionId) {
          console.log('[BillingManager] Opening FreePaddle checkout overlay:', checkoutUrl)
          setFreepaddleCheckout({
            isOpen: true,
            checkoutUrl,
            transactionId,
            product
          })
        } else {
          console.error('[BillingManager] Missing checkoutUrl or transactionId for FreePaddle')
        }
        setPurchasing(false)
        return
      }

      // For Paddle, use Paddle.js overlay
      if (provider === 'paddle') {
        const paddleInstance = paddle || getPaddle()
        if (paddleInstance && transactionId) {
          openCheckoutWithTransaction(paddleInstance, transactionId, {
            settings: {
              displayMode: 'overlay',
              theme: 'light'
            }
          })
        } else if (checkoutUrl) {
          window.open(checkoutUrl, '_blank')
          setPurchasing(false)
        } else {
          console.error('[BillingManager] No transactionId or checkoutUrl returned')
          setPurchasing(false)
        }
        return
      }

      // For other providers, redirect to checkout URL
      if (checkoutUrl) {
        console.log('[BillingManager] Redirecting to checkout URL for provider:', provider)
        window.location.href = checkoutUrl
      }
      setPurchasing(false)
    } catch (err) {
      console.error('[BillingManager] Purchase error:', err)
      setPurchasing(false)
    }
  }

  const handleManageSubscription = (entitlement: ActiveEntitlement) => {
    // Open Paddle customer portal or custom management page
    console.log('[BillingManager] Manage subscription:', entitlement.productSlug)
    // TODO: Implement subscription management - could open Paddle portal or custom UI
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
          <ActiveEntitlements
            entitlements={activeEntitlements}
            loading={entitlementsLoading}
            error={entitlementsError}
            onManage={handleManageSubscription}
            compact={true}
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
          <AvailableProductsView
            products={availableProducts}
            loading={availableProductsLoading}
            error={availableProductsError}
            activeEntitlements={activeEntitlements}
            onPurchase={handlePurchaseProduct}
            purchasing={purchasing}
            filterType="feature_access"
          />
        )}

        {activeTab === 'credits' && (
          <AvailableProductsView
            products={availableProducts}
            loading={availableProductsLoading}
            error={availableProductsError}
            activeEntitlements={activeEntitlements}
            onPurchase={handlePurchaseProduct}
            purchasing={purchasing}
            filterType="credit_package"
          />
        )}

        {activeTab === 'subscription' && (
          <AvailableProductsView
            products={availableProducts}
            loading={availableProductsLoading}
            error={availableProductsError}
            activeEntitlements={activeEntitlements}
            onPurchase={handlePurchaseProduct}
            purchasing={purchasing}
            filterType="subscription_plan"
          />
        )}
      </div>

      {/* FreePaddle Checkout Overlay */}
      {freepaddleCheckout && (
        <FreePaddleCheckoutOverlay
          isOpen={freepaddleCheckout.isOpen}
          checkoutUrl={freepaddleCheckout.checkoutUrl}
          transactionId={freepaddleCheckout.transactionId}
          product={freepaddleCheckout.product}
          onComplete={() => {
            console.log('[BillingManager] FreePaddle checkout completed')
            setFreepaddleCheckout(null)
            // Refresh user data and available products after successful purchase
            loadUserData()
            loadPublicData()
          }}
          onClose={() => {
            console.log('[BillingManager] FreePaddle checkout closed')
            setFreepaddleCheckout(null)
          }}
        />
      )}
    </div>
  )
}
