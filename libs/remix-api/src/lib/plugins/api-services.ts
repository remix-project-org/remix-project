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
  CategoryFeaturesResponse
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
