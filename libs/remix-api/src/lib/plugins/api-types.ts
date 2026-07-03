/**
 * Typed API definitions for SSO/Auth endpoints
 * All types match the backend API contract
 */

import { AuthUser, AuthProvider } from './sso-api'
import { NotificationItem } from './notification-center-api'

// ==================== Credits ====================

/**
 * Per-(provider, model) usage cap entitled by an active feature group.
 * Returned by `GET /credits/balance?include=quotas`. Sorted by `amount ASC`
 * so the tightest cap (which is also drained first) appears first.
 *
 * Wildcards: `provider === '*'` and/or `model === '*'` means the cap applies
 * across the whole provider catalog or to any model. Render as
 * "All providers" / "All models".
 *
 * Special amounts:
 *   - `amount >= 1e15` → treat as unlimited (∞ badge)
 *   - `amount === 0`   → quota is effectively disabled; hide the row
 */
export interface QuotaEntry {
  /** Stable backend slug, e.g. `q:free:mistral-small:day`. Never show to end users. */
  slug: string
  provider: string  // 'mistralai', 'anthropic', '*', …
  model: string     // 'mistral-small-latest', '*', …
  period: 'day' | 'week' | 'month'
  amount: number    // cap in credits
  used: number      // credits drained this period
  remaining: number // max(0, amount - used)
  periodStart: string    // 'YYYY-MM-DD'
  periodResetAt: string  // ISO datetime when the bucket resets
}

export interface Credits {
  balance: number
  free_credits: number
  paid_credits: number
  /**
   * Active per-(provider, model) quotas for this user. Only present when
   * the balance call was made with `?include=quotas`. Empty array when the
   * user has no active entitlements.
   */
  quotas?: QuotaEntry[]
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

export interface GitHubTokenResponse {
  access_token: string
  login?: string
  avatar_url?: string
  scopes?: string[]
}

// ==================== App Configuration ====================

/**
 * Public app configuration fetched from the backend.
 * Keys use dot-notation categories (e.g. 'cloud.enabled').
 * Known keys are typed explicitly; unknown keys are also accessible.
 */
export interface AppConfig {
  // App
  'app.supportenabled'?: boolean

  // Auth
  'auth.login_mode'?: string
  'auth.login_mode_message'?: string
  'auth.registration_mode'?: string
  'auth.link_accounts_enabled'?: boolean
  'auth.email_sign_in_enabled'?: boolean
  'auth.sign_in_button_mode'?: 'default' | 'beta' | 'hidden'
  
  // Billing
  'billing.enable_subscriptions'?: boolean
  'billing.credits_enabled'?: boolean

  // Cloud
  'cloud.enabled'?: boolean
  'cloud.button_visibility'?: 'off' | 'authenticated_users' | 'all_users'

  // Notifications
  'notifications.mode'?: 'off' | 'authenticated_users' | 'all_users'

  // Features
  'features.ai_enabled'?: boolean

  // Limits
  'limits.max_file_size_mb'?: number

  // Settings
  'settings.account_management'?: boolean

  // Storage
  'storage.max_backup_size_mb'?: number
  'storage.max_workspaces'?: number

  // UI flags
  'show_beta_test_register_widget'?: boolean
  'show_join_beta_top_button'?: boolean

  // Allow unknown keys
  [key: string]: string | number | boolean | undefined
}

/** Response from GET /sso/config (public, no auth required) */
export type AppConfigResponse = AppConfig

/**
 * A single feature entry as exposed by the public plans catalog
 * (`GET /config/public/plans`). Mirrors the permissions feature shape.
 */
export interface PublicPlanFeature {
  feature_name: string
  feature_display_name?: string
  category?: string
  is_enabled?: boolean
  limit_value?: number | null
  limit_unit?: string | null
  source_feature_group?: string
  priority?: number
}

/**
 * A plan/tier from the public catalog (`GET /config/public/plans`).
 * No authentication required — used to map a missing feature to the
 * cheapest plan that grants it so the UI can label upsell CTAs
 * (e.g. "Pro") instead of a generic "Upgrade".
 */
export interface PublicPlan {
  id: number
  name: string
  display_name: string
  description?: string
  /** Higher = better tier. Used to find the lowest tier granting a feature. */
  priority: number
  is_active?: number | boolean
  is_default?: number | boolean
  features: PublicPlanFeature[]
}

/** Response from GET /config/public/plans (public, no auth required) */
export type PublicPlansResponse = PublicPlan[]

// ==================== Registration Mode ====================

export type RegistrationMode = 'open' | 'existing_only' | 'invite_only'

export interface RegistrationModeResponse {
  mode: RegistrationMode
}

// ==================== Login Access Control (ACL) ====================

/** Login mode values — controls who can log in (independent of registration mode) */
export type LoginMode = 'open' | 'feature_group' | 'admins_only' | 'closed'

/** Response from GET /sso/login-mode */
export interface LoginModeResponse {
  mode: LoginMode
  message: string  // empty string when mode is 'open'
}

/** Login ACL denial codes (subset of postMessage error codes) */
export type LoginDenialCode =
  | 'LOGIN_CLOSED'
  | 'LOGIN_ADMINS_ONLY'
  | 'LOGIN_FEATURE_GROUP_REQUIRED'

/** All login-related error codes that can come from the server */
export const LOGIN_ACL_ERROR_CODES: string[] = [
  'LOGIN_CLOSED',
  'LOGIN_ADMINS_ONLY',
  'LOGIN_FEATURE_GROUP_REQUIRED',
  'LOGIN_LOCKED',
  'LOGIN_MEMBERS_ONLY'
]

// ==================== Unified Access Policy ====================

/** Access policy values — single axis replacing login_mode + registration_mode */
export type AccessPolicy = 'open' | 'invite_only' | 'members_only' | 'admins_only' | 'locked'

/** Response from GET /sso/access-policy */
export interface AccessPolicyResponse {
  policy: AccessPolicy
  message: string
  allows_registration: boolean
  requires_invite: boolean
}

/** All access-policy denial codes from the server */
export const ACCESS_POLICY_ERROR_CODES: string[] = [
  'LOGIN_LOCKED',
  'LOGIN_ADMINS_ONLY',
  'LOGIN_MEMBERS_ONLY',
  'INVITE_REQUIRED',
  'INVITE_INVALID',
  'REGISTRATION_CLOSED',
  'ACCOUNT_BLOCKED'
]

// ==================== SIWE ====================

export interface SiweVerifyRequest {
  message: string
  signature: string
  invite_token?: string
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

// ==================== Storage ====================

/**
 * Storage health check response
 */
export interface StorageHealthResponse {
  ok: boolean
  provider: string
  message?: string
}

/**
 * Storage configuration (limits and allowed types)
 */
export interface StorageConfig {
  maxFileSize: number
  maxTotalStorage: number
  allowedMimeTypes: string[]
  allowedExtensions: string[]
}

/**
 * Request for presigned upload URL
 */
export interface PresignUploadRequest {
  filename: string
  folder?: string
  contentType: string
  fileSize?: number
  /** Optional metadata to store with the file (e.g., workspaceName, userId) */
  metadata?: Record<string, string>
}

/**
 * Response with presigned upload URL
 */
export interface PresignUploadResponse {
  url: string
  headers: Record<string, string>
  expiresAt: string
  key: string
}

/**
 * Request for presigned download URL
 */
export interface PresignDownloadRequest {
  filename: string
  folder?: string
}

/**
 * Response with presigned download URL
 */
export interface PresignDownloadResponse {
  url: string
  expiresAt: string
}

/**
 * File metadata stored in the system
 */
export interface StorageFile {
  filename: string
  folder: string
  key: string
  contentType: string
  size: number
  uploadedAt: string
  lastModified: string
  etag?: string
  /** S3 object metadata (workspaceName, userId, etc.) */
  metadata?: Record<string, string>
}

/**
 * List of user's files
 */
export interface StorageFilesResponse {
  files: StorageFile[]
  totalSize: number
  totalCount: number
  nextCursor?: string
}

/**
 * File list request options
 */
export interface StorageListOptions {
  folder?: string
  limit?: number
  cursor?: string
}

/**
 * Summary of a remote workspace
 */
export interface WorkspaceSummary {
  id: string
  backupCount: number
  lastBackup: string | null
  totalSize: number
  /** Original workspace name from the most recent backup metadata */
  workspaceName?: string
  /** User ID who owns this remote workspace */
  userId?: string
  /** Names of local workspaces on this device that are linked to this remote ID */
  localWorkspaceNames?: string[]
}

/**
 * List of user's remote workspaces
 */
export interface WorkspacesResponse {
  workspaces: WorkspaceSummary[]
}
// ==================== Permissions ====================

export interface Permission {
  feature_name: string
  allowed: boolean
  limit_value?: number
  limit_unit?: string
  category?: string
}

export interface FeatureGroup {
  name: string
  display_name: string
  description: string
  priority: number
  source_type: string
  starts_at: string
  expires_at: string | null
  is_recurring: boolean
  grant_reason: string | null
  created_at: string
}

export interface PermissionsResponse {
  user_id?: number
  group_id?: number
  is_authenticated?: boolean
  is_blocked?: boolean
  is_admin?: boolean
  feature_groups?: FeatureGroup[]
  features: Permission[] | Record<string, any>
  /** True when the user has a confirmed email address on file. */
  email_verified?: boolean
  /** ISO timestamp of when the email was verified, or null if never verified. */
  email_verified_date?: string | null
  /** True when the user has any email address on file (verified or not). */
  has_email?: boolean
  /** Per-user AI model catalogue with availability + locking metadata. */
  ai_models?: Array<{
    id: string
    provider: string
    display_name: string
    description?: string
    category?: string
    capabilities?: string[]
    is_default?: boolean
    requires_auth?: boolean
    required_feature?: string | null
    available?: boolean
    reason?: string
    sort_order?: number
  }>
  /**
   * Per-task model assignments. The backend tells the client which model to
   * use for each named task — there are NO client-side defaults. Examples:
   *   { dapp_generator: 'claude-sonnet-4-5', dapp_generator_max_tokens: 16384 }
   * Numeric task hints (max_tokens, temperature) live in `task_params`.
   * Callers must throw if the requested task is missing — never fall back
   * to a hardcoded model id.
   */
  task_models?: Record<string, string>
  /** Per-task numeric/boolean parameter overrides (max_tokens, temperature, …). */
  task_params?: Record<string, Record<string, number | string | boolean>>
}

/** Request body for POST /sso/email/send-verification. Omit `email` to verify the on-file address. */
export interface SendEmailVerificationRequest {
  email?: string
}

/** Response from POST /sso/email/send-verification. */
export interface SendEmailVerificationResponse {
  success: true
  /** Code TTL in seconds (typically 600). Absent when `already_verified` is true. */
  expires_in?: number
  /** Returned when the supplied email is already verified for this account \u2014 no code was sent. */
  already_verified?: true
}

/** Request body for POST /sso/email/verify-verification. */
export interface VerifyEmailVerificationRequest {
  code: string
  email?: string
}

/** Response from POST /sso/email/verify-verification on success. */
export interface VerifyEmailVerificationResponse {
  success: true
  email_verified: true
  email_verified_date: string
  email: string
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
  /**
   * All billable prices for this package. Today credit packages are
   * single-price, but the unified API may surface alternates (e.g.
   * promo SKUs); kept optional for forward-compat.
   */
  prices?: AvailableProductPrice[]
}

/**
 * Feature group associated with an available product (from /api/products/available)
 */
export interface AvailableProductFeatureGroup {
  id: number
  name: string
  display_name: string
  description: string
}

/**
 * Per-provider linkage for a single price (e.g. one Paddle price ID per
 * billing interval). Returned inside `AvailableProductPrice.providers`
 * and mirrored at the product level under `AvailableProduct.providers`.
 */
export interface AvailableProductPriceProvider {
  slug: string
  external_product_id: string | null
  external_price_id: string | null
  is_active: boolean
  sync_status: 'pending' | 'synced' | 'error' | string
}

/**
 * A single billable price for an `AvailableProduct`. Subscription plans
 * may expose multiple prices (e.g. monthly + yearly); credit packages
 * usually expose a single default price.
 */
export interface AvailableProductPrice {
  id: number
  billing_interval: 'month' | 'year' | 'one_time' | string
  price_cents: number
  currency: string
  description?: string | null
  is_default: boolean
  is_active: boolean
  providers: AvailableProductPriceProvider[]
}

/**
 * A product returned by /api/products/available (subscription plans and
 * credit packages unified under one endpoint).
 */
export interface AvailableProduct {
  id: number
  product_code: string
  name: string
  slug: string
  description: string
  product_type: 'subscription_plan' | 'credit_package' | string
  price_cents: number
  currency: string
  provider_slug: string | null
  external_product_id: string | null
  external_price_id: string | null
  /** All available prices for this product (multi-cadence support). */
  prices?: AvailableProductPrice[]
  /** Top-level provider linkage (mirrors the default price's providers). */
  providers?: AvailableProductPriceProvider[]
  feature_group: AvailableProductFeatureGroup | null
  credits_per_month: number
  billing_interval: 'month' | 'year'
  features: string[]
}

export interface AvailableProductsMeta {
  user_id: number | null
  provider_filter: string | null
  type_filter: string | null
  total: number
}

export interface AvailableProductsResponse {
  data: AvailableProduct[]
  meta: AvailableProductsMeta
}

/**
 * Request body for POST /products/checkout — multi-item checkout.
 * Bundles a subscription + credit packages into one Paddle transaction.
 */
export interface MultiItemCheckoutRequest {
  items: Array<{ slug: string; price_id?: number }>
  provider: 'paddle' | 'crypto'
  returnUrl?: string
}

export interface MultiItemCheckoutResponse {
  checkoutUrl: string
  transactionId: string
  provider: string
  items: Array<{
    id: number
    slug: string
    name: string
    product_type: 'subscription_plan' | 'credit_package'
    price_cents: number
  }>
}

/**
 * Request body for POST /products/purchase — the unified purchase
 * endpoint for plans, packages, and free-tier grants.
 */
export interface PurchaseProductRequest {
  /** Either slug, product_id, or product_code (one of). */
  slug?: string
  product_id?: number
  product_code?: string
  /**
   * Optional internal price id (`prices[].id`) — required for products
   * exposing multiple cadences (e.g. monthly vs yearly subscription).
   * Omit to fall back to the product's default price.
   */
  price_id?: number
  /** "paddle" (default) or "crypto". */
  provider?: 'paddle' | 'crypto'
  returnUrl?: string
}

/** Successful checkout-redirect response (paid plans / packages). */
export interface PurchaseProductCheckoutResponse {
  checkoutUrl: string
  transactionId: string
  provider?: string
}

/** Immediate-grant response (free plans — no checkout needed). */
export interface PurchaseProductImmediateResponse {
  ok: true
  immediate: true
  plan: string
  productId: number
  membershipId: number
  isExtension?: boolean
  message?: string
}

/** 409 ALREADY_SUBSCRIBED response (must use PATCH instead). */
export interface PurchaseProductAlreadySubscribedResponse {
  error: 'ALREADY_SUBSCRIBED'
  message: string
  existingSubscription: {
    id: number
    providerSlug: string
    providerSubscriptionId: string
    status: string
    currentPeriodEnd: string
  }
  hint?: string
}

export type PurchaseProductResponse =
  | PurchaseProductCheckoutResponse
  | PurchaseProductImmediateResponse
  | PurchaseProductAlreadySubscribedResponse

// ===== Plan change / cancel (POST /billing/subscription/preview-change,
//        PATCH /billing/subscription, POST /billing/subscription/cancel) =====

export type ProrationBillingMode =
  | 'prorated_immediately'
  | 'prorated_next_billing_period'
  | 'full_immediately'
  | 'full_next_billing_period'
  | 'do_not_bill'

export type OnPaymentFailure = 'prevent_change' | 'apply_change'

export interface PreviewSubscriptionChangeRequest {
  /** One of these three is required. */
  planSlug?: string
  productCode?: string
  priceId?: string
  prorationBillingMode?: ProrationBillingMode
}

export interface PreviewSubscriptionChangeResponse {
  ok: true
  prorationBillingMode: ProrationBillingMode
  targetPriceId: string
  items: any[]
  /** Provider-specific proration breakdown (Paddle preview payload). */
  preview: any
}

export interface ChangeSubscriptionRequest {
  planSlug?: string
  productCode?: string
  priceId?: string
  prorationBillingMode?: ProrationBillingMode
  onPaymentFailure?: OnPaymentFailure
}

export interface ChangeSubscriptionResponse {
  ok: true
  prorationBillingMode: ProrationBillingMode
  subscription: {
    id: string
    status: string
    nextBilledAt: string | null
    scheduledChange: any | null
    items: any[]
    currencyCode: string
  }
}

export interface CancelSubscriptionRequest {
  /** Defaults to 'next_billing_period' if omitted. */
  effectiveFrom?: 'next_billing_period' | 'immediately'
}

export interface CancelSubscriptionResponse {
  ok: true
  effectiveFrom: 'next_billing_period' | 'immediately'
  subscription: {
    id: string
    status: string
    scheduledChange: any | null
    nextBilledAt: string | null
  }
}

/**
 * Response for POST /billing/subscription/reactivate — removes a pending
 * scheduled cancellation (un-cancel). The returned subscription reflects the
 * cleared scheduledChange eagerly.
 */
export interface ReactivateSubscriptionResponse {
  ok: true
  subscription: {
    id: string
    status: string
    scheduledChange: any | null
    nextBilledAt: string | null
  }
}

// ===== Transaction polling (GET /billing/transaction/:providerTransactionId) ====

/**
 * Terminal states stop polling. `pending` is the only non-terminal state —
 * it's surfaced as HTTP 404 + body with this shape.
 */
export type TransactionStatus =
  | 'pending'
  | 'completed'
  | 'failed'
  | 'canceled'
  | 'refunded'
  | 'disputed'

/** 404 response body — "webhook hasn't fired yet, keep polling". */
export interface TransactionPendingResponse {
  status: 'pending'
  provider: string
  providerTransactionId: string
  message?: string
}

/** 200 response body — webhook has been processed. */
export interface TransactionCompletedResponse {
  status: Exclude<TransactionStatus, 'pending'>
  provider: string
  providerTransactionId: string
  providerSubscriptionId?: string | null
  transactionType?: string
  productType?: string
  productId?: number
  productSlug?: string
  productName?: string
  currency?: string
  amountGross?: number
  amountNet?: number
  creditsDelivered?: number
  completedAt?: string
  createdAt?: string
}

export type TransactionStatusResponse = TransactionPendingResponse | TransactionCompletedResponse

// ===== Usage reporting (GET /billing/credits/usage) ==========================

export type UsageGroupByDimension = 'day' | 'service' | 'provider' | 'model' | 'user'

export interface CreditsUsageQuery {
  from?: string
  to?: string
  groupBy?: UsageGroupByDimension[]
  service?: string
  provider?: string
  limit?: number
}

export interface UsageTotals {
  calls: number
  prompt_tokens: number
  completion_tokens: number
  cache_creation_tokens: number
  cache_creation_1h_tokens: number
  cache_read_tokens: number
  total_tokens: number
  cost_usd: number
  credits: number
}

export interface UsageRow extends UsageTotals {
  day?: string
  service?: string
  provider?: string
  model?: string
  user_id?: number
}

export interface UsageReport {
  range: {
    from: string
    to: string
  }
  group_by: UsageGroupByDimension[]
  rows: UsageRow[]
  totals: UsageTotals
}

/**
 * Promotional intro discount attached to a subscription plan (from
 * /api/products/available `intro_discount`). Used to merchandise launch
 * offers — e.g. "60% off your first 3 months". Maps to a Paddle discount.
 */
export interface IntroDiscount {
  id: number
  /** Display name, e.g. "60% OFF LAUNCH OFFER". */
  name: string
  /** Discount code applied at checkout, e.g. "60PERCENTOFF". */
  code: string
  discountType: 'percentage' | 'flat' | string
  /** Percentage (e.g. 60) or flat amount, as a number. */
  amount: number
  currency: string | null
  /** Whether the discount recurs on subsequent billing periods. */
  recur: boolean
  /** How many billing intervals the discount applies for (null = forever). */
  maxRecurringIntervals: number | null
  /**
   * Paddle discount id (`dsc_...`) to pass as `discountId` in a Paddle
   * `PricePreview` request so the in-app cart can show the same localized,
   * discounted totals the hosted checkout will charge.
   */
  paddleDiscountId?: string | null
  /**
   * Paddle product/price IDs (`pro_...` / `pri_...`) the discount is
   * restricted to. When populated the discount only applies to those line
   * items (e.g. the subscription); `null`/empty means it applies to the
   * whole cart. Informational only — Paddle applies the restriction itself
   * when we pass `discountId` to PricePreview.
   */
  restrictTo?: string[] | null
  /** Raw Paddle discount object as synced from the backend, when available. */
  paddleRaw?: IntroDiscountPaddleRaw | null
}

/**
 * Raw Paddle discount payload echoed by the backend under
 * `intro_discounts[].paddle_raw`. Only the fields we read are typed; the
 * rest is preserved via the index signature.
 */
export interface IntroDiscountPaddleRaw {
  id: string
  type?: string
  amount?: string
  currencyCode?: string | null
  recur?: boolean
  maximumRecurringIntervals?: number | null
  restrictTo?: string[] | null
  enabledForCheckout?: boolean
  [key: string]: unknown
}

/**
 * Intro credit package bundled with a subscription plan as a sign-up
 * incentive (e.g. "20,000 Free AI Credits"). Auto-added to the checkout
 * transaction by the backend.
 */
export interface IntroCreditPackage {
  id: number
  slug: string
  name: string
  credits: number
  /** How many of this package are included (usually 1). */
  quantity: number
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
  /** Feature group name this plan grants — from /api/products/available. */
  featureGroupName?: string | null
  /** Length of the free trial. 0 / null → plan has no trial. */
  trialPeriodDays?: number | null
  trialPeriodFrequency?: number | null
  trialPeriodInterval?: 'day' | 'week' | 'month' | 'year' | null
  /** Credits granted up-front for the trial. */
  trialCredits?: number | null
  defaultProrationBillingMode?: string
  providers: ProductProvider[]  // Available payment providers
  paddlePriceId?: string | null // Legacy: prefer providers array
  source?: 'database' | 'config' | 'provider'
  /**
   * All billable prices for this plan, e.g. monthly + yearly. The UI
   * uses this to render the cadence toggle and pass the user's chosen
   * `price_id` through to `/products/purchase`.
   */
  prices?: AvailableProductPrice[]
  /** Promotional intro discounts (launch offers). An array — multiple
   *  discounts may apply (e.g. percentage + flat combined). */
  introDiscounts?: IntroDiscount[]
  /** Free/bonus credit packages included with sign-up (intro gift). */
  introCreditPackages?: IntroCreditPackage[]
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
  customerId?: string
  currentBillingPeriod?: {
    startsAt: string
    endsAt: string
  }
  scheduledChange: {
    action: string
    effectiveAt: string
  } | null
  items?: SubscriptionItem[]
  nextBilledAt: string | null
  createdAt: string
  updatedAt?: string
  firstBilledAt?: string
  discount?: unknown | null
  collectionMode?: string
  billingDetails?: unknown | null
  currencyCode?: string
  // Backend-flattened fields (from /billing/subscription)
  productId?: number
  planSlug?: string
  planName?: string
  priceCents?: number
  currency?: string
  billingInterval?: 'month' | 'year'
  creditsPerPeriod?: number
  startedAt?: string
  pausedAt?: string | null
  // Trial fields
  trialStart?: string | null
  trialEnd?: string | null
  isInTrial?: boolean
  trialDaysRemaining?: number | null
  trialTotalDays?: number | null
  // Legacy fields for backwards compatibility
  planId?: string
  creditsPerMonth?: number
  currentPeriodStart?: string
  currentPeriodEnd?: string
  cancelAtPeriodEnd?: boolean | 0 | 1
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
  /** True when the user has never used a free trial and is eligible for one. */
  isTrialEligible?: boolean
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

// ==================== Invite Tokens ====================

/**
 * Action that will be performed when a token is redeemed
 */
export interface InviteTokenAction {
  type: 'add_to_feature_group' | 'grant_credits' | 'grant_product' | 'add_tag' | 'walkthrough' | 'membership_request'
  description: string
  config?: Record<string, unknown>
  walkthrough_slug?: string
  auto_trigger?: boolean
  /** membership_request action fields */
  feature_group_id?: number
  feature_group_name?: string
  feature_group_display_name?: string
}

/**
 * Token info returned from validation
 */
export interface InviteTokenInfo {
  name: string
  description: string
  expires_at: string | null
  remaining_uses: number | null
}

/**
 * Response from validate token endpoint
 */
export interface InviteValidateResponse {
  valid: boolean
  token_id?: number
  name?: string
  description?: string
  invite_type?: 'default' | 'beta_program' | 'request' | string
  expires_at?: string | null
  uses_remaining?: number | null
  already_redeemed?: boolean
  redeemed_at?: string | null
  actions?: InviteTokenAction[]
  content?: any[]
  error?: string
  error_code?: 'NOT_FOUND' | 'INACTIVE' | 'EXPIRED' | 'NOT_STARTED' | 'EXHAUSTED' | 'MAX_USES_REACHED'
}

/**
 * Request to redeem a token
 */
export interface InviteRedeemRequest {
  token: string
}

/**
 * Action result after redemption
 */
export interface InviteActionResult {
  type: string
  success: boolean
  details?: Record<string, unknown>
  error?: string
}

/**
 * Response from redeem token endpoint
 */
export interface InviteRedeemResponse {
  success: boolean
  message?: string
  error?: string
  error_code?: 'NOT_FOUND' | 'INACTIVE' | 'EXPIRED' | 'NOT_STARTED' | 'EXHAUSTED' | 'ALREADY_REDEEMED'
  redeemed_at?: string
  actions_applied?: InviteActionResult[]
  redemption?: {
    id: number
    redeemed_at: string
  }
}

/**
 * A redemption record
 */
export interface InviteRedemption {
  id: number
  token_name: string
  token_description: string
  redeemed_at: string
  actions: InviteTokenAction[]
}

/**
 * Response from my-redemptions endpoint
 */
export interface InviteRedemptionsResponse {
  redemptions: InviteRedemption[]
}

/**
 * A user tag
 */
export interface UserTag {
  tag: string
  source: 'invite_token' | 'admin' | 'system'
  created_at: string
}

/**
 * Response from my-tags endpoint
 */
export interface UserTagsResponse {
  tags: UserTag[]
}

// ==================== Anonymous Membership Requests ====================

export interface MembershipGroup {
  id: number
  name: string
  display_name: string
  description: string
}

export interface MembershipGroupsResponse {
  groups: MembershipGroup[]
}

export interface MembershipSubmitRequest {
  feature_group_id: number
  nickname?: string
  email?: string
  comment?: string
}

export interface MembershipSubmitResponse {
  claim_token: string
  request_id: number
}

export interface MembershipStatusRequest {
  id: number
  status: 'pending' | 'approved' | 'rejected' | 'expired'
  nickname: string | null
  comment: string | null
  resolution_note: string | null
  created_at: string
  resolved_at: string | null
  feature_group_name: string
  feature_group_display_name: string
}

export interface MembershipStatusResponse {
  request: MembershipStatusRequest
  notifications: NotificationItem[]
}

// ==================== E2E Test Account Pool ====================

/**
 * User info returned from pool checkout
 */
export interface PoolUser {
  id: number
  name: string
  email: string
  is_admin: boolean
  group_id: number
}

/**
 * Request body for POST /sso/test/pool/checkout
 */
export interface PoolCheckoutRequest {
  featureGroups: string[]
}

/**
 * Response from POST /sso/test/pool/checkout
 */
export interface PoolCheckoutResponse {
  sessionId: string
  accountId: string
  userId: number
  groupId: number
  featureGroups: string[]
  access_token: string
  refresh_token: string
  user: PoolUser
}

/**
 * Cleanup details returned on pool release
 */
export interface PoolCleanupDetails {
  db: { nonCascadeDeleted: number; accountGroupDeleted: boolean }
  s3: { workspaceObjects: number; avatarObjects: number; walletObjects: number }
  redis: { keysDeleted: number }
}

/**
 * Response from POST /sso/test/pool/release
 */
export interface PoolReleaseResponse {
  ok: boolean
  accountId: string
  cleaned: PoolCleanupDetails
}

/**
 * A single account lock entry in pool status
 */
export interface PoolAccountStatus {
  accountId: string
  locked: boolean
  sessionId?: string
  lockedAt?: string
  expiresAt?: string
}

/**
 * Response from GET /sso/test/pool/status
 */
export interface PoolStatusResponse {
  total: number
  available: number
  locked: number
  accounts: PoolAccountStatus[]
}

/**
 * A pool account definition
 */
export interface PoolAccountDefinition {
  id: string
  name: string
  email: string
}

/**
 * Response from GET /sso/test/pool/accounts
 */
export interface PoolAccountsResponse {
  accounts: PoolAccountDefinition[]
}

/**
 * Response from POST /sso/test/pool/release-all
 */
export interface PoolReleaseAllResponse {
  ok: boolean
  released: number
}

// ==================== Eth Skills ====================

/**
 * Summary entry from GET /ethskills/skills.
 */
export interface EthSkillSummary {
  id: string
  name: string
  description: string
}

/**
 * Full skill payload from GET /ethskills/skills/:id.
 * `resources` maps relative filename → file content.
 */
export interface EthSkillDetail {
  id: string
  name: string
  description: string
  content: string
  resources: Record<string, string>
}

/**
 * Response shape for GET /ethskills/skills.
 */
export interface EthSkillsListResponse {
  skills: EthSkillSummary[]
}

