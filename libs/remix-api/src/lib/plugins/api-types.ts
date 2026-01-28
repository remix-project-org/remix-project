/**
 * Typed API definitions for SSO/Auth endpoints
 * All types match the backend API contract
 */

import { AuthUser, AuthProvider } from './sso-api'

// ==================== Credits ====================

export interface Credits {
  balance: number
  free_credits: number
  paid_credits: number
}

export interface CreditTransaction {
  id: number
  group_id: number
  user_id: number
  amount: number
  type: 'credit' | 'debit'
  reason: string
  metadata: Record<string, unknown> | null
  created_at: string
}

// ==================== Linked Accounts ====================

export interface LinkedAccount {
  id: number
  provider: AuthProvider
  provider_user_id: string
  name: string | null
  picture: string | null
  isPrimary: boolean
  isLinked: boolean
  created_at: string
  last_login_at: string | null
}

export interface AccountsResponse {
  primary: LinkedAccount | null
  accounts: LinkedAccount[]
}

// ==================== Link Account ====================

export interface LinkAccountRequest {
  user_id: number
}

export interface LinkAccountResponse {
  ok: boolean
  message: string
  primary: number
}

// ==================== GitHub Link ====================

export interface GitHubLinkRequest {
  access_token: string
}

export interface GitHubLinkResponse {
  ok: boolean
  message: string
  github_user: {
    id: number
    login: string
    name: string | null
    avatar_url: string | null
  }
}

// ==================== SIWE ====================

export interface SiweVerifyRequest {
  message: string
  signature: string
}

export interface SiweVerifyResponse {
  token: string
  user: {
    id: number
    address: string
    chainId: number
  }
}

// ==================== Auth Verification ====================

export interface VerifyResponse {
  authenticated: boolean
  user?: {
    id: number
    email: string | null
    name: string | null
  }
}

// ==================== Providers ====================

export interface ProvidersResponse {
  providers: AuthProvider[]
}

// ==================== Generic Success ====================

export interface GenericSuccessResponse {
  ok: boolean
  message: string
}

// ==================== Token Refresh ====================

export interface RefreshTokenResponse {
  access_token: string
  refresh_token?: string
}

// ==================== Permissions ====================

export interface Permission {
  feature_name: string
  allowed: boolean
  limit_value?: number
  limit_unit?: string
  category?: string
}

export interface PermissionsResponse {
  features: Permission[]
}

export interface FeatureCheckRequest {
  feature: string
}

export interface FeatureCheckResponse {
  allowed: boolean
  limit_value?: number
  limit_unit?: string
}

export interface MultiFeatureCheckRequest {
  features: string[]
}

export interface MultiFeatureCheckResponse {
  results: Record<string, { allowed: boolean; limit_value?: number; limit_unit?: string }>
}

export interface CategoryFeaturesResponse {
  features: Permission[]
}

// ==================== Billing ====================

/**
 * Payment provider configuration for a product
 */
export interface ProductProvider {
  slug: string              // Provider identifier (e.g., "paddle")
  name: string              // Display name
  priceId: string | null    // Provider's external price ID
  productId: string | null  // Provider's external product ID
  isActive: boolean
  syncStatus: 'pending' | 'synced' | 'error'
}

/**
 * Credit package - one-time purchasable bundle of credits
 */
export interface CreditPackage {
  id: string
  internalId: number
  name: string
  description: string
  credits: number
  priceUsd: number  // Price in cents (500 = $5.00)
  currency: string
  popular?: boolean
  savings?: string | null
  providers: ProductProvider[]  // Available payment providers
  paddlePriceId?: string | null // Legacy: prefer providers array
  source?: 'database' | 'config' | 'provider'
}

/**
 * Subscription plan - recurring monthly credit allocation
 */
export interface SubscriptionPlan {
  id: string
  internalId: number
  name: string
  description: string
  creditsPerMonth: number
  priceUsd: number  // Price in cents
  currency: string
  billingInterval: 'month' | 'year'
  features: string[]
  popular?: boolean
  providers: ProductProvider[]  // Available payment providers
  paddlePriceId?: string | null // Legacy: prefer providers array
  source?: 'database' | 'config' | 'provider'
}

/**
 * Subscription item from Paddle
 */
export interface SubscriptionItem {
  priceId: string
  productId: string
  description: string
  quantity: number
  unitPrice: {
    amount: string
    currencyCode: string
  }
  billingCycle: {
    interval: 'month' | 'year'
    frequency: number
  }
  product: {
    id: string
    name: string
    description: string
    imageUrl: string | null
  }
}

/**
 * User's active subscription (Paddle format)
 */
export interface UserSubscription {
  id: string
  status: 'active' | 'paused' | 'canceled' | 'past_due' | 'trialing'
  customerId: string
  currentBillingPeriod: {
    startsAt: string
    endsAt: string
  }
  scheduledChange: {
    action: string
    effectiveAt: string
  } | null
  items: SubscriptionItem[]
  nextBilledAt: string | null
  createdAt: string
  updatedAt: string
  firstBilledAt: string
  discount: unknown | null
  collectionMode: string
  billingDetails: unknown | null
  currencyCode: string
  // Legacy fields for backwards compatibility
  planId?: string
  creditsPerMonth?: number
  currentPeriodStart?: string
  currentPeriodEnd?: string
  cancelAtPeriodEnd?: boolean
}

/**
 * Response from credit packages endpoint
 */
export interface CreditPackagesResponse {
  packages: CreditPackage[]
}

/**
 * Response from subscription plans endpoint
 */
export interface SubscriptionPlansResponse {
  plans: SubscriptionPlan[]
}

/**
 * Response from user subscription endpoint
 */
export interface UserSubscriptionResponse {
  userId: number
  hasActiveSubscription: boolean
  subscription: UserSubscription | null
}

/**
 * Request to purchase credits
 */
export interface PurchaseCreditsRequest {
  packageId: string
  provider?: string   // Provider slug (default: "paddle")
  returnUrl?: string  // Redirect URL after checkout
}

/**
 * Response from purchase credits endpoint
 */
export interface PurchaseCreditsResponse {
  checkoutUrl: string
  transactionId: string
  provider: string
  package: {
    id: string
    name: string
    credits: number
    price: number  // In cents
  }
}

/**
 * Request to subscribe to a plan
 */
export interface SubscribeRequest {
  planId: string
  provider?: string   // Provider slug (default: "paddle")
  returnUrl?: string  // Redirect URL after checkout
}

/**
 * Response from subscribe endpoint
 */
export interface SubscribeResponse {
  checkoutUrl: string
  transactionId: string
  provider: string
}

/**
 * Response from billing config endpoint
 */
export interface BillingConfigResponse {
  paddle: {
    environment: 'sandbox' | 'production'
    token: string
  }
}

// ==================== Feature Access Products ====================

/**
 * Feature group info included in product response
 */
export interface FeatureGroupInfo {
  id: number
  name: string              // Feature group slug (e.g., "ai-pro")
  displayName: string       // Human-readable name (e.g., "AI Pro")
  description: string | null
  priority: number          // Display priority (higher = more prominent)
}

/**
 * Feature access product - time-based pass or subscription for feature groups
 */
export interface FeatureAccessProduct {
  id: number
  slug: string
  name: string
  description: string
  featureGroup: string           // Primary feature group (legacy, single value)
  featureGroups: FeatureGroupInfo[]  // All feature groups this product grants
  durationType: 'days' | 'months' | 'years' | 'unlimited'
  durationValue: number          // How many units of duration
  isRecurring: boolean           // true for subscriptions
  billingInterval: 'day' | 'week' | 'month' | 'year' | null
  priceCents: number
  currency: string
  isPopular: boolean
  providers?: ProductProvider[]  // Available payment providers
}

/**
 * Response from feature access products endpoint
 */
export interface FeatureAccessProductsResponse {
  products: FeatureAccessProduct[]
}

/**
 * Request to purchase feature access
 */
export interface FeatureAccessPurchaseRequest {
  productSlug?: string       // Product slug to purchase
  productId?: number         // Or product ID
  provider?: string          // Provider slug (default: "paddle")
  returnUrl?: string         // Redirect URL after checkout
}

/**
 * Response from feature access purchase endpoint
 */
export interface FeatureAccessPurchaseResponse {
  checkoutUrl: string
  transactionId: string
  provider: string
  product: {
    id: number
    slug: string
    name: string
    featureGroup: string
    durationType: string
    durationValue: number
    isRecurring: boolean
    priceCents: number
  }
}

/**
 * User's active feature group membership
 */
export interface UserFeatureMembership {
  id: number
  featureGroup: string
  startsAt: string            // ISO date
  expiresAt: string | null    // ISO date, null = never expires
  status: 'active' | 'expired' | 'canceled' | 'revoked'
  isRecurring: boolean
  sourceType: 'purchase' | 'subscription' | 'admin_grant' | 'promo' | 'trial'
  renewalCount: number
}

/**
 * Response from user memberships endpoint
 */
export interface UserMembershipsResponse {
  userId: number
  memberships: UserFeatureMembership[]
}

/**
 * Response from feature access check endpoint
 */
export interface FeatureAccessCheckResponse {
  userId: number
  featureGroup: string
  hasAccess: boolean
}
