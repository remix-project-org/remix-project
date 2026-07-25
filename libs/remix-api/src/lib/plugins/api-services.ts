/**
 * Typed SSO API service
 * Provides strongly-typed methods for all SSO/Auth endpoints
 */

import { IApiClient, ApiResponse } from './api-client'
import {
  AI_MISTRAL_SMALL,
  AI_MISTRAL_MEDIUM,
  AI_CODESTRAL,
  AI_SONNET_4_6,
  AI_OPUS_4_6,
} from './features'
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
  AvailableProductsResponse,
  PurchaseProductRequest,
  PurchaseProductResponse,
  MultiItemCheckoutRequest,
  MultiItemCheckoutResponse,
  PreviewSubscriptionChangeRequest,
  PreviewSubscriptionChangeResponse,
  ChangeSubscriptionRequest,
  ChangeSubscriptionResponse,
  CancelSubscriptionRequest,
  CancelSubscriptionResponse,
  ReactivateSubscriptionResponse,
  TransactionStatusResponse,
  PendingCheckoutsResponse,
  VerifyCheckoutResponse,
  CreditsUsageQuery,
  UsageReport,
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
  PoolReleaseAllResponse,
  SendEmailVerificationRequest,
  SendEmailVerificationResponse,
  VerifyEmailVerificationRequest,
  VerifyEmailVerificationResponse,
  EthSkillDetail,
  EthSkillsListResponse
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

  // ==================== Email Verification ====================
  // These endpoints gate access to features (e.g. Remix AI) by requiring a
  // confirmed email address on the account. Distinct from /email/send-code +
  // /email/verify-code which are the OTP-login flow on /sso/email/.
  //
  // Server constants: 6-digit numeric code, 10-min TTL, 60s resend cooldown,
  // 5 max wrong attempts (then code is invalidated and user must request new).
  // After a successful verify, the caller MUST refetch /permissions/ \u2014 the
  // JWT is not refreshed.

  /**
   * Send a verification code to the user's email.
   *  \u2022 Omit `email` to verify the on-file address (SSO users).
   *  \u2022 Provide `email` to add a new address (SIWE users) or change the existing one.
   *
   * Possible non-2xx responses:
   *  \u2022 400 Invalid email format / NO_EMAIL_ON_FILE
   *  \u2022 409 EMAIL_IN_USE
   *  \u2022 429 cooldown active \u2014 inspect `retry_after` (seconds)
   */
  async sendEmailVerification(
    request: SendEmailVerificationRequest = {}
  ): Promise<ApiResponse<SendEmailVerificationResponse>> {
    return this.apiClient.post<SendEmailVerificationResponse>('/email/send-verification', request)
  }

  /**
   * Confirm the verification code emailed to the user.
   *
   * Possible non-2xx responses:
   *  \u2022 400 Invalid code (response includes `attempts_remaining`) or expired
   *  \u2022 409 EMAIL_IN_USE (race condition with another account)
   *  \u2022 429 too many wrong attempts \u2014 code invalidated, user must request a new one
   *
   * On success, the caller should call PermissionsApiService.getPermissions()
   * to refresh `email_verified` / `email_verified_date` / `has_email`.
   */
  async verifyEmailVerification(
    request: VerifyEmailVerificationRequest
  ): Promise<ApiResponse<VerifyEmailVerificationResponse>> {
    return this.apiClient.post<VerifyEmailVerificationResponse>('/email/verify-verification', request)
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
   * Get current credit balance.
   * @param options.includeQuotas When true, the response also contains a
   *   `quotas` array (per-model entitlements). The endpoint stays
   *   backwards-compatible — old callers see no payload change.
   */
  async getBalance(options?: { includeQuotas?: boolean }): Promise<ApiResponse<Credits>> {
    const qs = options?.includeQuotas ? '?include=quotas' : ''
    return this.apiClient.get<Credits>(`/balance${qs}`)
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

  /**
   * Get aggregated AI usage for the authenticated user.
   * Endpoint is served by the credits service under /credits/usage.
   */
  async getUsageReport(query: CreditsUsageQuery = {}): Promise<ApiResponse<UsageReport>> {
    const params = new URLSearchParams()
    if (query.from) params.set('from', query.from)
    if (query.to) params.set('to', query.to)
    if (query.groupBy && query.groupBy.length > 0) params.set('group_by', query.groupBy.join(','))
    if (query.service) params.set('service', query.service)
    if (query.provider) params.set('provider', query.provider)
    if (query.limit !== undefined) params.set('limit', query.limit.toString())

    const qs = params.toString()
    return this.apiClient.get<UsageReport>(`/usage${qs ? '?' + qs : ''}`)
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
// TEMP: hardcoded ai_models catalogue. Backend doesn't currently surface
// this for all users on /permissions; remove once it does.
const HARDCODED_AI_MODELS: NonNullable<PermissionsResponse['ai_models']> = [
  {
    id: 'mistral-small-latest',
    provider: 'mistralai',
    display_name: 'Mistral Small',
    description: 'Fast and efficient for basic tasks',
    category: 'general',
    capabilities: ['chat', 'code'],
    is_default: true,
    requires_auth: true,
    required_feature: AI_MISTRAL_SMALL,
    available: true,
    sort_order: 10
  },
  {
    id: 'mistral-medium-latest',
    provider: 'mistralai',
    display_name: 'Mistral Medium',
    description: 'Fast and efficient for basic tasks',
    category: 'general',
    capabilities: ['chat', 'code'],
    is_default: false,
    requires_auth: true,
    required_feature: AI_MISTRAL_MEDIUM,
    available: true,
    sort_order: 20
  },
  {
    id: 'codestral-latest',
    provider: 'mistralai',
    display_name: 'Codestral',
    description: 'Specialized for code generation',
    category: 'coding',
    capabilities: ['code', 'completion'],
    is_default: false,
    requires_auth: true,
    required_feature: AI_CODESTRAL,
    available: true,
    sort_order: 30
  },
  {
    id: 'claude-sonnet-4-6',
    provider: 'anthropic',
    display_name: 'Claude Sonnet 4.6',
    description: 'Balanced performance and speed',
    category: 'coding',
    capabilities: ['chat', 'code', 'completion'],
    is_default: false,
    requires_auth: true,
    required_feature: AI_SONNET_4_6,
    available: true,
    sort_order: 40
  },
  {
    id: 'claude-opus-4-6',
    provider: 'anthropic',
    display_name: 'Claude Opus 4.6',
    description: 'Best for complex web3 contracts',
    category: 'coding',
    capabilities: ['chat', 'code', 'completion'],
    is_default: false,
    requires_auth: true,
    required_feature: AI_OPUS_4_6,
    available: true,
    sort_order: 50
  },
  {
    id: 'ministral-3b-latest',
    display_name: 'Mistral 3B',
    provider: 'mistralai',
    description: 'Lightning fast and efficient for basic tasks',
    requires_auth: true,
    required_feature: AI_MISTRAL_SMALL,
    is_default: false,
    available: true,
    category: 'general',
    capabilities: ['chat', 'code', 'completion'],
    sort_order: 60
  },
  {
    id: 'ministral-8b-latest',
    display_name: 'Mistral 8B',
    provider: 'mistralai',
    description: 'Fast and efficient for basic tasks',
    requires_auth: true,
    required_feature: AI_MISTRAL_SMALL,
    available: true,
    is_default: false,
    category: 'general',
    capabilities: ['chat', 'code', 'completion'],
    sort_order: 70
  }
]

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
    const res = await this.apiClient.get<PermissionsResponse>('/')
    // TEMP: backfill ai_models from the hardcoded catalogue ONLY when the
    // backend hasn't shipped one yet for this user. Once /permissions returns
    // a non-empty array we honour it verbatim so new server-side rows
    // (additional providers, model swaps, etc.) show up without a client
    // release. Remove the hardcoded list entirely once every tier returns
    // ai_models server-side.
    if (res?.ok && res.data) {
      const existing = res.data.ai_models
      if (!Array.isArray(existing) || existing.length === 0) {
        console.log('[PermissionsApiService] Backfilling ai_models:', res.data.ai_models)
        res.data.ai_models = HARDCODED_AI_MODELS
      }
    }
    return res
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

  /**
   * Preview proration for a plan change BEFORE committing it.
   * POST /billing/subscription/preview-change
   *
   * Use the returned `preview` object to show "you'll be charged $X.XX now
   * (prorated)" or "you'll receive a $Y.YY credit" before the user confirms.
   * Returns 404 `no_active_subscription` if the user has no paid sub — in
   * that case fall back to POST /products/purchase.
   */
  async previewSubscriptionChange(
    request: PreviewSubscriptionChangeRequest
  ): Promise<ApiResponse<PreviewSubscriptionChangeResponse>> {
    return this.apiClient.post<PreviewSubscriptionChangeResponse>('/subscription/preview-change', request)
  }

  /**
   * Commit a plan change (upgrade or downgrade between paid plans).
   * PATCH /billing/subscription
   *
   * Backend revokes the old feature-group membership and grants the new one.
   * The PATCH response already reflects the new state — safe to update the UI
   * optimistically. Not for switching to free; use cancel() instead.
   */
  async changeSubscription(
    request: ChangeSubscriptionRequest
  ): Promise<ApiResponse<ChangeSubscriptionResponse>> {
    return this.apiClient.request<ChangeSubscriptionResponse>('/subscription', { method: 'PATCH', body: request })
  }

  /**
   * Cancel the active subscription.
   * POST /billing/subscription/cancel
   *
   * 'next_billing_period' (default) keeps access until period end.
   * 'immediately' cancels now — webhook auto-grants the free plan as a fallback.
   */
  async cancelSubscription(
    request: CancelSubscriptionRequest = {}
  ): Promise<ApiResponse<CancelSubscriptionResponse>> {
    return this.apiClient.post<CancelSubscriptionResponse>('/subscription/cancel', request)
  }

  /**
   * Reactivate (un-cancel) a subscription that is scheduled to cancel.
   * POST /billing/subscription/reactivate
   *
   * Removes the pending scheduled cancellation. Returns 409
   * `no_scheduled_cancellation` if there is nothing to undo, or 501
   * `reactivate_not_supported` if the provider can't remove scheduled changes.
   * The returned subscription reflects the cleared scheduledChange eagerly.
   */
  async reactivateSubscription(): Promise<ApiResponse<ReactivateSubscriptionResponse>> {
    return this.apiClient.post<ReactivateSubscriptionResponse>('/subscription/reactivate', {})
  }

  /**
   * Poll a specific checkout's status.
   * GET /billing/transaction/:providerTransactionId
   *
   * Use after `POST /products/purchase` returns a `transactionId` — most
   * importantly for credit packages, which never appear in /billing/subscription.
   *
   * Note: while the webhook hasn't fired the backend returns HTTP 404 with a
   * body of `{ status: 'pending', … }`. The ApiClient surfaces this as
   * `{ ok: false, status: 404, data: { status: 'pending' } }` — callers should
   * treat "404 + status:'pending'" as "keep polling", not as an error.
   *
   * Terminal statuses to stop on: completed | failed | canceled | refunded | disputed.
   */
  async getTransactionStatus(
    providerTransactionId: string,
    provider?: string
  ): Promise<ApiResponse<TransactionStatusResponse>> {
    const qs = provider ? `?provider=${encodeURIComponent(provider)}` : ''
    return this.apiClient.get<TransactionStatusResponse>(`/transaction/${encodeURIComponent(providerTransactionId)}${qs}`)
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
 * Checkouts API Service — served from its own `/checkouts` base URL (NOT under
 * `/billing`). Powers the "resume your abandoned checkout" flow.
 */
export class CheckoutsApiService {
  constructor(private apiClient: IApiClient) {}

  setToken(token: string): void {
    this.apiClient.setToken(token)
  }

  /**
   * List the authenticated user's unfinished checkouts (most recent first).
   * GET /checkouts/pending
   *
   * Deliberately small — not completed, not canceled, last 7 days, capped at
   * 5. Use to render a "resume your checkout" nudge. Empty state is
   * `{ checkouts: [] }`. Fire in parallel with /permissions — never merge it
   * into the (hot, cached) authz payload.
   */
  async getPendingCheckouts(): Promise<ApiResponse<PendingCheckoutsResponse>> {
    return this.apiClient.get<PendingCheckoutsResponse>('/pending')
  }

  /**
   * Verify the logged-in user owns a given transaction before booting Paddle
   * for it. GET /checkouts/:transactionId
   *
   * Returns the checkout only if it belongs to the user; `404` otherwise
   * (unknown vs not-yours are intentionally indistinguishable). Call this
   * before opening a checkout from a `transaction_id`/`_ptxn` you didn't just
   * create in-session (e.g. a deep link or resume link).
   */
  async verifyCheckout(transactionId: string): Promise<ApiResponse<VerifyCheckoutResponse>> {
    return this.apiClient.get<VerifyCheckoutResponse>(`/${encodeURIComponent(transactionId)}`)
  }

  /**
   * Discard an unfinished checkout so it no longer shows up in the resume
   * nudge / cart. DELETE /checkouts/:transactionId
   *
   * Only affects the caller's own pending checkout; safe to call for a
   * transaction that's already gone (backend treats it idempotently).
   */
  async deleteCheckout(transactionId: string): Promise<ApiResponse<GenericSuccessResponse>> {
    return this.apiClient.delete<GenericSuccessResponse>(`/${encodeURIComponent(transactionId)}`)
  }
}

/**
 * Invite API Service - Invite token endpoints with full TypeScript typing
 */
/**
 * Products API Service — served from the /products base URL
 */
export class ProductsApiService {
  constructor(private apiClient: IApiClient) {}

  setToken(token: string): void {
    this.apiClient.setToken(token)
  }

  /**
   * List products of any type from the unified catalog.
   * GET /products/available?type=&provider=
   *
   * Replaces the legacy `getAvailableSubscriptions()` / billing
   * `getCreditPackages()` helpers — both `subscription_plan` and
   * `credit_package` products come from the same endpoint, and each
   * item carries the full multi-cadence `prices` array.
   */
  async getAvailableProducts(filters: {
    type?: 'subscription_plan' | 'credit_package' | string
    provider?: 'paddle' | 'crypto' | string
  } = {}): Promise<ApiResponse<AvailableProductsResponse>> {
    const params = new URLSearchParams()
    if (filters.type) params.set('type', filters.type)
    if (filters.provider) params.set('provider', filters.provider)
    const qs = params.toString()
    return this.apiClient.get<AvailableProductsResponse>(`/available${qs ? '?' + qs : ''}`)
  }

  /**
   * List subscription plans the user can purchase.
   * GET /products/available/subscriptions
   *
   * @deprecated Use `getAvailableProducts({ type: 'subscription_plan' })`.
   *   The unified `/products/available` endpoint returns the full
   *   multi-price catalog and is the path forward.
   */
  async getAvailableSubscriptions(): Promise<ApiResponse<AvailableProductsResponse>> {
    return this.apiClient.get<AvailableProductsResponse>('/available/subscriptions')
  }

  /**
   * Unified purchase endpoint — buys a plan or package (free or paid).
   * Returns either a checkout URL (paid) or an immediate-grant payload (free).
   * On 409 ALREADY_SUBSCRIBED the response.data carries the existing
   * subscription and the caller must route to PATCH /billing/subscription.
   * POST /products/purchase
   */
  async purchaseProduct(request: PurchaseProductRequest): Promise<ApiResponse<PurchaseProductResponse>> {
    return this.apiClient.post<PurchaseProductResponse>('/purchase', request)
  }

  /**
   * Multi-item checkout — bundles multiple products (e.g. subscription +
   * credit packages) into a single Paddle transaction.
   * POST /products/checkout
   */
  async checkoutProducts(request: MultiItemCheckoutRequest): Promise<ApiResponse<MultiItemCheckoutResponse>> {
    return this.apiClient.post<MultiItemCheckoutResponse>('/checkout', request)
  }
}

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
   * @param ssoBaseUrl - The SSO base URL (e.g. https://api.remix.live/sso)
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

/**
 * Eth Skills API Service - Lists and fetches skills from the
 * `ethskills` backend (served via the MCP CORS proxy).
 *
 * All requests carry the authenticated user's Bearer token through the
 * shared ApiClient so the backend can enforce per-user access and quotas.
 */
export class EthSkillsApiService {
  constructor(private apiClient: IApiClient) {}

  /**
   * Set the authentication token for API requests.
   */
  setToken(token: string): void {
    this.apiClient.setToken(token)
  }

  /**
   * List all skills available to the authenticated user.
   * GET /ethskills/skills
   */
  async listSkills(): Promise<ApiResponse<EthSkillsListResponse>> {
    return this.apiClient.get<EthSkillsListResponse>('/skills')
  }

  /**
   * Fetch a single skill (with its resources) by id.
   * GET /ethskills/skills/:id
   */
  async getSkill(skillId: string): Promise<ApiResponse<EthSkillDetail>> {
    return this.apiClient.get<EthSkillDetail>(`/skills/${encodeURIComponent(skillId)}`)
  }
}
