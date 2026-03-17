/**
 * Typed SSO API service
 * Provides strongly-typed methods for all SSO/Auth endpoints
 */

import { IApiClient, ApiResponse } from './api-client'
import {
  Credits,
  LinkedAccount,
  AccountsResponse,
  LinkAccountRequest,
  LinkAccountResponse,
  GitHubLinkRequest,
  GitHubLinkResponse,
  GitHubTokenResponse,
  SiweVerifyRequest,
  SiweVerifyResponse,
  VerifyResponse,
  ProvidersResponse,
  GenericSuccessResponse,
  CreditTransaction,
  RefreshTokenResponse,
  RegistrationModeResponse,
  LoginModeResponse,
  AccessPolicyResponse,
  StorageHealthResponse,
  StorageConfig,
  PresignUploadRequest,
  PresignUploadResponse,
  PresignDownloadRequest,
  PresignDownloadResponse,
  StorageFile,
  StorageFilesResponse,
  StorageListOptions,
  WorkspacesResponse,
  PermissionsResponse,
  FeatureCheckResponse,
  MultiFeatureCheckResponse,
  CategoryFeaturesResponse,
  CreditPackage,
  SubscriptionPlan,
  ProductProvider,
  CreditPackagesResponse,
  SubscriptionPlansResponse,
  UserSubscriptionResponse,
  PurchaseCreditsRequest,
  PurchaseCreditsResponse,
  SubscribeRequest,
  SubscribeResponse,
  BillingConfigResponse,
  FeatureAccessProduct,
  FeatureAccessProductsResponse,
  FeatureAccessPurchaseRequest,
  FeatureAccessPurchaseResponse,
  UserMembershipsResponse,
  FeatureAccessCheckResponse,
  InviteValidateResponse,
  InviteRedeemRequest,
  InviteRedeemResponse,
  InviteRedemptionsResponse,
  UserTagsResponse,
  PoolCheckoutResponse,
  PoolReleaseResponse,
  PoolStatusResponse,
  PoolAccountsResponse,
  PoolReleaseAllResponse
} from './api-types'

/**
 * SSO API Service - All SSO/Auth endpoints with full TypeScript typing
 */
export class SSOApiService {
  constructor(private apiClient: IApiClient) {}

  /**
   * Set the authentication token for API requests
   */
  setToken(token: string): void {
    this.apiClient.setToken(token)
  }
  
  // ==================== Authentication ====================
  
  /**
   * Verify current authentication status
   */
  async verify(): Promise<ApiResponse<VerifyResponse>> {
    return this.apiClient.get<VerifyResponse>('/verify')
  }
  
  /**
   * Logout current user
   */
  async logout(): Promise<ApiResponse<GenericSuccessResponse>> {
    return this.apiClient.post<GenericSuccessResponse>('/logout')
  }
  
  /**
   * Refresh access token using refresh token.
   * Uses skipTokenRefresh to prevent recursive auto-refresh on 401.
   */
  async refreshToken(refreshToken: string): Promise<ApiResponse<RefreshTokenResponse>> {
    return this.apiClient.post<RefreshTokenResponse>('/refresh', { refresh_token: refreshToken }, { skipTokenRefresh: true })
  }
  
  /**
   * Get list of enabled auth providers
   */
  async getProviders(): Promise<ApiResponse<ProvidersResponse>> {
    return this.apiClient.get<ProvidersResponse>('/providers')
  }

  /**
   * Get current registration mode (no auth required)
   * Returns 'open', 'existing_only', or 'invite_only'
   */
  async getRegistrationMode(): Promise<ApiResponse<RegistrationModeResponse>> {
    return this.apiClient.get<RegistrationModeResponse>('/registration-mode')
  }

  /**
   * Get current login access control mode (no auth required).
   * Returns 'open', 'feature_group', 'admins_only', or 'closed'.
   * The `message` field contains an admin-customisable denial message.
   */
  async getLoginMode(): Promise<ApiResponse<LoginModeResponse>> {
    return this.apiClient.get<LoginModeResponse>('/login-mode')
  }

  /**
   * Get the unified access policy (no auth required).
   * Replaces the separate login-mode + registration-mode endpoints.
   * Returns policy, message, allows_registration, requires_invite.
   */
  async getAccessPolicy(): Promise<ApiResponse<AccessPolicyResponse>> {
    return this.apiClient.get<AccessPolicyResponse>('/access-policy')
  }
  
  // ==================== SIWE ====================
  
  /**
   * Get nonce for SIWE message signing
   */
  async getSiweNonce(): Promise<ApiResponse<string>> {
    return this.apiClient.get<string>('/siwe/nonce')
  }
  
  /**
   * Verify SIWE signature and get JWT
   */
  async verifySiwe(request: SiweVerifyRequest): Promise<ApiResponse<SiweVerifyResponse>> {
    return this.apiClient.post<SiweVerifyResponse>('/siwe/verify', request)
  }
  
  // ==================== Linked Accounts ====================
  
  /**
   * Get all linked accounts for authenticated user
   */
  async getAccounts(): Promise<ApiResponse<AccountsResponse>> {
    return this.apiClient.get<AccountsResponse>('/accounts')
  }
  
  /**
   * Link a new provider account to current user
   */
  async linkAccount(provider: string, request: LinkAccountRequest): Promise<ApiResponse<LinkAccountResponse>> {
    return this.apiClient.post<LinkAccountResponse>(`/accounts/link/${provider}`, request)
  }
  
  /**
   * Unlink a provider account
   */
  async unlinkAccount(userId: number): Promise<ApiResponse<GenericSuccessResponse>> {
    return this.apiClient.delete<GenericSuccessResponse>(`/accounts/${userId}`)
  }
  
  /**
   * Link GitHub account (special endpoint)
   */
  async linkGitHub(request: GitHubLinkRequest): Promise<ApiResponse<GitHubLinkResponse>> {
    return this.apiClient.post<GitHubLinkResponse>('/github/link', request)
  }
  
  /**
   * Get stored GitHub OAuth token for authenticated user
   */
  async getGitHubToken(): Promise<ApiResponse<GitHubTokenResponse>> {
    return this.apiClient.get<GitHubTokenResponse>('/accounts/github/token')
  }
  
  /**
   * Link SIWE account (special endpoint)
   */
  async linkSiwe(request: SiweVerifyRequest): Promise<ApiResponse<SiweVerifyResponse>> {
    return this.apiClient.post<SiweVerifyResponse>('/siwe/link', request)
  }
}

/**
 * Credits API Service - All credit-related endpoints with full TypeScript typing
 */
export class CreditsApiService {
  constructor(private apiClient: IApiClient) {}

  /**
   * Set the authentication token for API requests
   */
  setToken(token: string): void {
    this.apiClient.setToken(token)
  }
  
  /**
   * Get current credit balance
   */
  async getBalance(): Promise<ApiResponse<Credits>> {
    return this.apiClient.get<Credits>('/balance')
  }
  
  /**
   * Get credit transaction history
   */
  async getTransactions(limit?: number, offset?: number): Promise<ApiResponse<{ transactions: CreditTransaction[], total: number }>> {
    const params = new URLSearchParams()
    if (limit !== undefined) params.set('limit', limit.toString())
    if (offset !== undefined) params.set('offset', offset.toString())
    
    const query = params.toString()
    return this.apiClient.get(`/transactions${query ? '?' + query : ''}`)
  }
}

/**
 * Storage API Service - All storage-related endpoints with full TypeScript typing
 * Provides an abstraction layer for cloud storage operations (S3, etc.)
 */
export class StorageApiService {
  constructor(private apiClient: IApiClient) {}
  
  /**
   * Get the underlying API client
   */
  getApiClient(): IApiClient {
    return this.apiClient
  }
  
  // ==================== Health & Config ====================
  
  /**
   * Check storage service health
   */
  async health(): Promise<ApiResponse<StorageHealthResponse>> {
    return this.apiClient.get<StorageHealthResponse>('/health')
  }
  
  /**
   * Get storage configuration (limits, allowed types)
   */
  async getConfig(): Promise<ApiResponse<StorageConfig>> {
    return this.apiClient.get<StorageConfig>('/config')
  }
  
  // ==================== Presigned URLs ====================
  
  /**
   * Get a presigned URL for uploading a file
   * @param request - Upload request with filename, folder, and content type
   * @returns Presigned URL and headers to use for direct S3 upload
   */
  async getUploadUrl(request: PresignUploadRequest): Promise<ApiResponse<PresignUploadResponse>> {
    return this.apiClient.post<PresignUploadResponse>('/presign/upload', request)
  }
  
  /**
   * Get a presigned URL for downloading a file
   * @param request - Download request with filename and optional folder
   * @returns Presigned URL for direct S3 download
   */
  async getDownloadUrl(request: PresignDownloadRequest): Promise<ApiResponse<PresignDownloadResponse>> {
    return this.apiClient.post<PresignDownloadResponse>('/presign/download', request)
  }
  
  // ==================== File Management ====================
  
  /**
   * List user's files
   * @param options - Optional filtering and pagination
   */
  async listFiles(options?: StorageListOptions): Promise<ApiResponse<StorageFilesResponse>> {
    const params = new URLSearchParams()
    if (options?.folder) params.set('folder', options.folder)
    if (options?.limit !== undefined) params.set('limit', options.limit.toString())
    if (options?.cursor) params.set('cursor', options.cursor)
    
    const query = params.toString()
    return this.apiClient.get<StorageFilesResponse>(`/files${query ? '?' + query : ''}`)
  }
  
  /**
   * Get metadata for a specific file
   * @param filename - The filename (can include folder path)
   */
  async getFileMetadata(filename: string): Promise<ApiResponse<StorageFile>> {
    return this.apiClient.get<StorageFile>(`/files/${encodeURIComponent(filename)}`)
  }
  
  /**
   * Delete a file
   * @param filename - The filename to delete (can include folder path)
   */
  async deleteFile(filename: string): Promise<ApiResponse<GenericSuccessResponse>> {
    return this.apiClient.delete<GenericSuccessResponse>(`/files/${encodeURIComponent(filename)}`)
  }

  /**
   * Get list of user's remote workspaces with backup info
   */
  async getWorkspaces(): Promise<ApiResponse<WorkspacesResponse>> {
    return this.apiClient.get<WorkspacesResponse>('/workspaces')
  }
}

/**
 * Permissions API Service - Query user feature permissions
 */
export class PermissionsApiService {
  constructor(private apiClient: IApiClient) {}

  /**
   * Set the authentication token for API requests
   */
  setToken(token: string): void {
    this.apiClient.setToken(token)
  }
  
  /**
   * Check if user is authenticated
   */
  async isAuthenticated(): Promise<ApiResponse<{ authenticated: boolean }>> {
    return this.apiClient.get<{ authenticated: boolean }>('/validate')
  }
  
  /**
   * Get all permissions for the current user
   */
  async getPermissions(): Promise<ApiResponse<PermissionsResponse>> {
    return this.apiClient.get<PermissionsResponse>('/')
  }
  
  /**
   * Check if a single feature is allowed
   * @param feature - Feature name (e.g., 'ai:gpt-4', 'storage:50gb')
   */
  async checkFeature(feature: string): Promise<ApiResponse<FeatureCheckResponse>> {
    return this.apiClient.post<FeatureCheckResponse>('/check', { feature })
  }
  
  /**
   * Check multiple features at once
   * @param features - Array of feature names
   */
  async checkFeatures(features: string[]): Promise<ApiResponse<MultiFeatureCheckResponse>> {
    return this.apiClient.post<MultiFeatureCheckResponse>('/check-multiple', { features })
  }
  
  /**
   * Get all features in a category
   * @param category - Category name (e.g., 'ai', 'storage', 'wallet')
   */
  async getFeaturesInCategory(category: string): Promise<ApiResponse<CategoryFeaturesResponse>> {
    return this.apiClient.get<CategoryFeaturesResponse>(`/category/${category}`)
  }
  
  /**
   * Helper method to check if a feature is allowed (returns boolean directly)
   * @param feature - Feature name to check
   */
  async hasFeature(feature: string): Promise<boolean> {
    try {
      const response = await this.checkFeature(feature)
      return response.ok && response.data?.allowed === true
    } catch {
      return false
    }
  }
  
  /**
   * Helper method to get the limit for a feature
   * @param feature - Feature name to check
   */
  async getFeatureLimit(feature: string): Promise<{ limit: number | undefined; unit: string | undefined }> {
    try {
      const response = await this.checkFeature(feature)
      if (response.ok && response.data) {
        return {
          limit: response.data.limit_value,
          unit: response.data.limit_unit
        }
      }
      return { limit: undefined, unit: undefined }
    } catch {
      return { limit: undefined, unit: undefined }
    }
  }
}

/**
 * Billing API Service - Credit packages, subscription plans, and purchases
 */
export class BillingApiService {
  constructor(private apiClient: IApiClient) {}

  /**
   * Set the authentication token for API requests
   */
  setToken(token: string): void {
    this.apiClient.setToken(token)
  }

  // ==================== Public Endpoints (No Auth Required) ====================

  /**
   * Get available credit packages for purchase
   */
  async getCreditPackages(): Promise<ApiResponse<CreditPackagesResponse>> {
    return this.apiClient.get<CreditPackagesResponse>('/credit-packages')
  }

  /**
   * Get available subscription plans
   */
  async getSubscriptionPlans(): Promise<ApiResponse<SubscriptionPlansResponse>> {
    return this.apiClient.get<SubscriptionPlansResponse>('/subscription-plans')
  }

  // ==================== Authenticated Endpoints ====================

  /**
   * Get billing configuration (Paddle token, environment, etc.)
   * Requires authentication
   */
  async getConfig(): Promise<ApiResponse<BillingConfigResponse>> {
    return this.apiClient.get<BillingConfigResponse>('/config')
  }

  /**
   * Get user's current credit balance
   */
  async getCredits(): Promise<ApiResponse<Credits>> {
    return this.apiClient.get<Credits>('/credits')
  }

  /**
   * Get user's credit transaction history
   */
  async getCreditHistory(limit?: number, offset?: number): Promise<ApiResponse<{ transactions: CreditTransaction[], total: number }>> {
    const params = new URLSearchParams()
    if (limit !== undefined) params.set('limit', limit.toString())
    if (offset !== undefined) params.set('offset', offset.toString())
    
    const query = params.toString()
    return this.apiClient.get(`/credits/history${query ? '?' + query : ''}`)
  }

  /**
   * Get user's active subscription
   */
  async getSubscription(): Promise<ApiResponse<UserSubscriptionResponse>> {
    return this.apiClient.get<UserSubscriptionResponse>('/subscription')
  }

  /**
   * Purchase a credit package - returns checkout URL for the specified provider
   * @param packageId - Package slug (e.g., "starter", "pro")
   * @param provider - Provider slug (default: "paddle")
   * @param returnUrl - URL to redirect after checkout
   */
  async purchaseCredits(packageId: string, provider: string = 'paddle', returnUrl?: string): Promise<ApiResponse<PurchaseCreditsResponse>> {
    const body: { packageId: string; provider: string; returnUrl?: string } = { packageId, provider }
    if (returnUrl) body.returnUrl = returnUrl
    return this.apiClient.post<PurchaseCreditsResponse>('/purchase-credits', body)
  }

  /**
   * Subscribe to a plan - returns checkout URL for the specified provider
   * @param planId - Plan slug (e.g., "pro", "team")
   * @param provider - Provider slug (default: "paddle")
   * @param returnUrl - URL to redirect after checkout
   */
  async subscribe(planId: string, provider: string = 'paddle', returnUrl?: string): Promise<ApiResponse<SubscribeResponse>> {
    const body: { planId: string; provider: string; returnUrl?: string } = { planId, provider }
    if (returnUrl) body.returnUrl = returnUrl
    return this.apiClient.post<SubscribeResponse>('/subscribe', body)
  }

  // ==================== Helper Methods ====================

  /**
   * Format price from cents to display string
   */
  static formatPrice(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`
  }

  /**
   * Check if a package has an active provider
   * @param pkg - Credit package to check
   * @param providerSlug - Provider to check for (default: "paddle")
   */
  static hasActiveProvider(pkg: CreditPackage | SubscriptionPlan, providerSlug: string = 'paddle'): boolean {
    return pkg.providers?.some(p => p.slug === providerSlug && p.isActive && p.syncStatus === 'synced') ?? false
  }

  /**
   * Get the active provider for a package/plan
   * @param pkg - Credit package or subscription plan
   * @param providerSlug - Provider to get (default: "paddle")
   */
  static getActiveProvider(pkg: CreditPackage | SubscriptionPlan, providerSlug: string = 'paddle'): ProductProvider | undefined {
    return pkg.providers?.find(p => p.slug === providerSlug && p.isActive && p.syncStatus === 'synced')
  }

  /**
   * Filter packages to only those with an active provider
   * @param packages - Array of credit packages
   * @param providerSlug - Provider to filter by (default: "paddle")
   */
  static filterByActiveProvider<T extends CreditPackage | SubscriptionPlan>(items: T[], providerSlug: string = 'paddle'): T[] {
    return items.filter(item => BillingApiService.hasActiveProvider(item, providerSlug))
  }

  /**
   * Check if user has enough credits for an operation
   */
  async hasEnoughCredits(requiredCredits: number): Promise<boolean> {
    try {
      const response = await this.getCredits()
      if (response.ok && response.data) {
        return response.data.balance >= requiredCredits
      }
      return false
    } catch {
      return false
    }
  }

  // ==================== Feature Access Products ====================

  /**
   * Get available feature access products (passes and subscriptions)
   * @param recurring - Optional filter: true = subscriptions only, false = one-time passes only
   */
  async getFeatureAccessProducts(recurring?: boolean): Promise<ApiResponse<FeatureAccessProductsResponse>> {
    const params = new URLSearchParams()
    if (recurring !== undefined) params.set('recurring', recurring.toString())
    const query = params.toString()
    return this.apiClient.get<FeatureAccessProductsResponse>(`/feature-access/products${query ? '?' + query : ''}`)
  }

  /**
   * Get a single feature access product by slug
   * @param slug - Product slug
   */
  async getFeatureAccessProduct(slug: string): Promise<ApiResponse<FeatureAccessProduct>> {
    return this.apiClient.get<FeatureAccessProduct>(`/feature-access/products/${slug}`)
  }

  /**
   * Purchase a feature access product - returns checkout URL
   * @param productSlug - Product slug to purchase
   * @param provider - Provider slug (default: "paddle")
   * @param returnUrl - URL to redirect after checkout
   */
  async purchaseFeatureAccess(productSlug: string, provider: string = 'paddle', returnUrl?: string): Promise<ApiResponse<FeatureAccessPurchaseResponse>> {
    const body: FeatureAccessPurchaseRequest = { productSlug, provider }
    if (returnUrl) body.returnUrl = returnUrl
    return this.apiClient.post<FeatureAccessPurchaseResponse>('/feature-access/purchase', body)
  }

  /**
   * Get user's active feature group memberships
   * @param includeExpired - Include expired memberships
   */
  async getFeatureMemberships(includeExpired: boolean = false): Promise<ApiResponse<UserMembershipsResponse>> {
    const params = includeExpired ? '?includeExpired=true' : ''
    return this.apiClient.get<UserMembershipsResponse>(`/feature-access/memberships${params}`)
  }

  /**
   * Check if user has access to a specific feature group
   * @param featureGroup - Feature group slug (e.g., "ai-pro")
   */
  async checkFeatureAccess(featureGroup: string): Promise<ApiResponse<FeatureAccessCheckResponse>> {
    return this.apiClient.get<FeatureAccessCheckResponse>(`/feature-access/check/${featureGroup}`)
  }

  /**
   * Helper: Check if user has access to a feature group (returns boolean)
   * @param featureGroup - Feature group slug
   */
  async hasFeatureAccess(featureGroup: string): Promise<boolean> {
    try {
      const response = await this.checkFeatureAccess(featureGroup)
      return response.ok && response.data?.hasAccess === true
    } catch {
      return false
    }
  }

  /**
   * Helper: Format duration for display
   */
  static formatDuration(durationType: string, durationValue: number): string {
    if (durationType === 'unlimited') return 'Unlimited'
    const unit = durationValue === 1 ? durationType.slice(0, -1) : durationType
    return `${durationValue} ${unit}`
  }

  /**
   * Helper: Format billing interval for display
   */
  static formatBillingInterval(interval: string | null): string {
    if (!interval) return ''
    return `/${interval}`
  }

  /**
   * Filter feature access products by recurring status
   */
  static filterFeatureProducts(products: FeatureAccessProduct[], recurring: boolean): FeatureAccessProduct[] {
    return products.filter(p => p.isRecurring === recurring)
  }
}

/**
 * Invite API Service - Invite token endpoints with full TypeScript typing
 */
export class InviteApiService {
  constructor(private apiClient: IApiClient) {}

  /**
   * Set the authentication token for API requests
   */
  setToken(token: string): void {
    this.apiClient.setToken(token)
  }

  // ==================== Token Validation ====================

  /**
   * Validate an invite token (no auth required)
   * @param token - The invite token string
   */
  async validateToken(token: string): Promise<ApiResponse<InviteValidateResponse>> {
    return this.apiClient.get<InviteValidateResponse>(`/validate/${token}`)
  }

  /**
   * Helper: Check if a token is valid
   */
  async isTokenValid(token: string): Promise<boolean> {
    try {
      const response = await this.validateToken(token)
      return response.ok && response.data?.valid === true
    } catch {
      return false
    }
  }

  // ==================== Token Redemption ====================

  /**
   * Redeem an invite token (auth required)
   * @param token - The invite token string
   */
  async redeemToken(token: string): Promise<ApiResponse<InviteRedeemResponse>> {
    return this.apiClient.post<InviteRedeemResponse>('/redeem', { token })
  }

  // ==================== User Redemptions ====================

  /**
   * Get all tokens redeemed by the current user (auth required)
   */
  async getMyRedemptions(): Promise<ApiResponse<InviteRedemptionsResponse>> {
    return this.apiClient.get<InviteRedemptionsResponse>('/my-redemptions')
  }

  // ==================== User Tags ====================

  /**
   * Get all tags for the current user (auth required)
   */
  async getMyTags(): Promise<ApiResponse<UserTagsResponse>> {
    return this.apiClient.get<UserTagsResponse>('/my-tags')
  }

  // ==================== Helpers ====================

  /**
   * Format token action for display
   */
  static formatActionType(type: string): string {
    switch (type) {
      case 'add_to_feature_group':
        return 'Feature Access'
      case 'grant_credits':
        return 'Credits'
      case 'grant_product':
        return 'Product'
      case 'add_tag':
        return 'Badge/Tag'
      default:
        return type
    }
  }

  /**
   * Get icon for action type
   */
  static getActionIcon(type: string): string {
    switch (type) {
      case 'add_to_feature_group':
        return 'fa-star'
      case 'grant_credits':
        return 'fa-coins'
      case 'grant_product':
        return 'fa-gift'
      case 'add_tag':
        return 'fa-tag'
      default:
        return 'fa-check'
    }
  }
}

/**
 * E2E Test Account Pool API Service
 *
 * Manages a pool of 20 rotating test accounts for E2E tests.
 * Each test run checks out an exclusive account, receives JWT tokens,
 * runs tests, then releases the account (wiping all data).
 *
 * All endpoints require an API key via `Authorization: Bearer rmx_<key>`.
 * Base URL: `{ssoBaseUrl}/test/pool/*`
 */
export class TestPoolApiService {
  private baseUrl: string
  private apiKey: string

  /**
   * @param ssoBaseUrl - The SSO base URL (e.g. https://auth.api.remix.live:8443/sso)
   * @param apiKey - The test-account-access API key (e.g. rmx_abc123...)
   */
  constructor(ssoBaseUrl: string, apiKey: string) {
    this.baseUrl = `${ssoBaseUrl}/test/pool`
    this.apiKey = apiKey
  }

  private async request<T>(endpoint: string, options: { method?: string; body?: unknown } = {}): Promise<ApiResponse<T>> {
    const { method = 'GET', body } = options
    try {
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${this.apiKey}`,
        'Accept': 'application/json',
      }
      if (body) {
        headers['Content-Type'] = 'application/json'
      }

      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      })

      const data = await response.json().catch(() => null)

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          error: data?.error || data?.message || `Pool request failed: ${response.status}`,
        }
      }

      return { ok: true, status: response.status, data: data as T }
    } catch (error: any) {
      return { ok: false, status: 0, error: error.message || 'Network error' }
    }
  }

  /**
   * Acquire an exclusive test account from the pool.
   * Returns JWT tokens ready for use in tests.
   *
   * @param featureGroups - Feature groups to assign (must include one with login:allowed, e.g. 'beta')
   * @returns Session info with tokens, userId, accountId
   * @throws 503 POOL_EXHAUSTED when all 20 accounts are locked
   * @throws 403 API_KEY_FORBIDDEN when API key is invalid
   * @throws 403 LOGIN_FEATURE_GROUP_REQUIRED when no group with login:allowed is included
   * @throws 400 INVALID_FEATURE_GROUPS when group names don't exist
   */
  async checkout(featureGroups: string[] = ['beta'], inviteToken?: string): Promise<ApiResponse<PoolCheckoutResponse>> {
    console.log(`[TestPoolLogin] Checking out test account with feature groups: ${featureGroups.join(', ')}${inviteToken ? ' and invite token' : ''}`)
    return this.request<PoolCheckoutResponse>('/checkout', {
      method: 'POST',
      body: { featureGroups, ...(inviteToken && { invite_token: inviteToken }) },
    })
  }

  /**
   * Release a test account and wipe all data (DB, S3, Redis).
   * **Must be called after every test run.**
   *
   * @param sessionId - The sessionId from checkout
   * @throws 404 SESSION_NOT_FOUND when sessionId is unknown or lock expired
   */
  async release(sessionId: string): Promise<ApiResponse<PoolReleaseResponse>> {
    return this.request<PoolReleaseResponse>('/release', {
      method: 'POST',
      body: { sessionId },
    })
  }

  /**
   * Get current pool state. Useful for debugging CI hangs.
   */
  async status(): Promise<ApiResponse<PoolStatusResponse>> {
    return this.request<PoolStatusResponse>('/status')
  }

  /**
   * List all 20 pool account definitions (id, name, email).
   */
  async accounts(): Promise<ApiResponse<PoolAccountsResponse>> {
    return this.request<PoolAccountsResponse>('/accounts')
  }

  /**
   * Emergency: force-release every account and wipe all test data.
   * Use when CI is stuck with stale locks.
   */
  async releaseAll(): Promise<ApiResponse<PoolReleaseAllResponse>> {
    return this.request<PoolReleaseAllResponse>('/release-all', { method: 'POST' })
  }
}
