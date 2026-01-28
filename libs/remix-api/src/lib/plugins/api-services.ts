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
  SiweVerifyRequest,
  SiweVerifyResponse,
  VerifyResponse,
  ProvidersResponse,
  GenericSuccessResponse,
  CreditTransaction,
  RefreshTokenResponse,
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
  FeatureAccessCheckResponse
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
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken: string): Promise<ApiResponse<RefreshTokenResponse>> {
    return this.apiClient.post<RefreshTokenResponse>('/refresh', { refresh_token: refreshToken })
  }
  
  /**
   * Get list of enabled auth providers
   */
  async getProviders(): Promise<ApiResponse<ProvidersResponse>> {
    return this.apiClient.get<ProvidersResponse>('/providers')
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
