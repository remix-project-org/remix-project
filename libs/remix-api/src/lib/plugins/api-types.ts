/**
 * Typed API definitions for SSO/Auth endpoints
 * All types match the backend API contract
 */

import { AuthUser, AuthProvider } from './sso-api'
import { NotificationItem } from './notification-center-api'

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

