/**
 * Types for the Billing UI components
 */

import { CreditPackage, SubscriptionPlan, UserSubscription, Credits, FeatureAccessProduct, UserFeatureMembership } from '@remix-api'

export interface BillingManagerProps {
  /** Auth plugin instance for making API calls */
  plugin: any
  /** Paddle client token for checkout initialization */
  paddleClientToken?: string
  /** Paddle environment */
  paddleEnvironment?: 'sandbox' | 'production'
  /** Callback when purchase is completed */
  onPurchaseComplete?: () => void
  /** Callback when subscription is updated */
  onSubscriptionChange?: () => void
}

export interface CreditPackagesViewProps {
  /** Available credit packages */
  packages: CreditPackage[]
  /** Whether packages are loading */
  loading?: boolean
  /** Error message if loading failed */
  error?: string | null
  /** User's current credit balance */
  currentBalance?: number
  /** Callback when user clicks to purchase a package */
  onPurchase: (packageId: string, priceId: string | null) => void
  /** Whether purchase is in progress */
  purchasing?: boolean
}

export interface SubscriptionPlansViewProps {
  /** Available subscription plans */
  plans: SubscriptionPlan[]
  /** Whether plans are loading */
  loading?: boolean
  /** Error message if loading failed */
  error?: string | null
  /** User's current subscription */
  currentSubscription?: UserSubscription | null
  /** Callback when user clicks to subscribe */
  onSubscribe: (planId: string, priceId: string | null) => void
  /** Whether subscription action is in progress */
  subscribing?: boolean
}

export interface CurrentSubscriptionProps {
  /** User's current subscription */
  subscription: UserSubscription | null
  /** Whether subscription is loading */
  loading?: boolean
  /** Callback to manage subscription */
  onManage?: () => void
  /** Callback to cancel subscription */
  onCancel?: () => void
}

export interface PurchaseButtonProps {
  /** Label for the button */
  label: string
  /** Paddle price ID */
  priceId: string | null
  /** Whether the button is disabled */
  disabled?: boolean
  /** Whether purchase is in progress */
  loading?: boolean
  /** Click handler */
  onClick: () => void
  /** Button variant */
  variant?: 'primary' | 'secondary' | 'outline'
  /** Additional CSS classes */
  className?: string
  /** Whether priceId is required for the button to be enabled (default: true) */
  requirePriceId?: boolean
}

export interface FeatureAccessProductsViewProps {
  /** Available feature access products */
  products: FeatureAccessProduct[]
  /** Whether products are loading */
  loading?: boolean
  /** Error message if loading failed */
  error?: string | null
  /** User's current feature memberships */
  memberships?: UserFeatureMembership[]
  /** Callback when user clicks to purchase a product */
  onPurchase: (productSlug: string, priceId: string | null) => void
  /** Whether purchase is in progress */
  purchasing?: boolean
  /** Filter: show only subscriptions (true) or one-time passes (false) or all (undefined) */
  filterRecurring?: boolean
}

export type { CreditPackage, SubscriptionPlan, UserSubscription, Credits, FeatureAccessProduct, UserFeatureMembership }
