import { Plugin } from '@remixproject/engine'
import { AuthUser, AuthProvider as AuthProviderType, ApiClient, SSOApiService, CreditsApiService, PermissionsApiService, BillingApiService, InviteApiService, TestPoolApiService, Credits, InviteValidateResponse, InviteRedeemResponse, RegistrationMode, RegistrationModeResponse, LoginMode, LoginModeResponse, ACCESS_POLICY_ERROR_CODES, AccessPolicy, AccessPolicyResponse, AppConfig, PoolCheckoutResponse, PoolReleaseResponse, PoolStatusResponse } from '@remix-api'
import { endpointUrls } from '@remix-endpoints-helper'
import { QueryParams } from '@remix-project/remix-lib'
import { getAddress } from 'ethers'
import { SiweMessage } from 'siwe'

const profile = {
  name: 'auth',
  displayName: 'Authentication',
  description: 'Handles SSO authentication and credits',
  methods: ['login', 'logout', 'getUser', 'getCredits', 'refreshCredits', 'linkAccount', 'getLinkedAccounts', 'unlinkAccount', 'getApiClient', 'getSSOApi', 'getCreditsApi', 'getPermissionsApi', 'getBillingApi', 'checkPermission', 'hasPermission', 'getAllPermissions', 'refreshPermissions', 'checkPermissions', 'getFeaturesByCategory', 'getFeatureLimit', 'getPaddleConfig', 'fetchGitHubToken', 'disconnectGitHub', 'getInviteApi', 'validateInviteToken', 'redeemInviteToken', 'getPendingInviteToken', 'setPendingInviteToken', 'setPendingInviteValidation', 'clearPendingInviteToken', 'getPendingInviteValidation', 'isAuthenticated', 'getToken', 'getRegistrationMode', 'getLoginMode', 'refreshLoginMode', 'getAccessPolicy', 'refreshAccessPolicy', 'notifyEmailOtpLogin', 'getAppConfig', 'refreshAppConfig', 'getAppConfigValue', 'poolCheckout', 'poolRelease', 'poolStatus', 'poolReleaseAll', 'isPoolAvailable'],
  events: ['authStateChanged', 'creditsUpdated', 'accountLinked', 'gitHubTokenReady', 'inviteTokenDetected', 'inviteTokenRedeemed', 'registrationModeChanged', 'loginModeChanged', 'accessPolicyChanged', 'appConfigChanged']
}

export class AuthPlugin extends Plugin {
  /** Set to true to enable verbose console.log output for debugging */
  private static DEBUG = false

  private apiClient: ApiClient
  private ssoApi: SSOApiService
  private creditsApi: CreditsApiService
  private permissionsApi: PermissionsApiService
  private billingApi: BillingApiService
  private inviteApi: InviteApiService
  private testPoolApi: TestPoolApiService | null = null
  private activePoolSession: { sessionId: string; accountId: string } | null = null
  private refreshTimer: number | null = null
  private pendingInviteToken: string | null = null
  private cachedRegistrationMode: RegistrationMode | null = null
  private cachedLoginMode: LoginMode | null = null
  private cachedLoginMessage: string = ''
  private cachedAccessPolicy: AccessPolicyResponse | null = null
  private cachedAppConfig: AppConfig | null = null

  /** Debug-gated logger – silent when DEBUG is false */
  private log(...args: any[]) {
    if (AuthPlugin.DEBUG) console.log(...args)
  }

  constructor() {
    super(profile)

    // Initialize API clients
    this.apiClient = new ApiClient(endpointUrls.sso)
    this.ssoApi = new SSOApiService(this.apiClient)

    // Credits API uses different base URL
    const creditsClient = new ApiClient(endpointUrls.credits)
    this.creditsApi = new CreditsApiService(creditsClient)

    // Permissions API
    const permissionsClient = new ApiClient(endpointUrls.permissions)
    this.permissionsApi = new PermissionsApiService(permissionsClient)

    // Billing API
    const billingClient = new ApiClient(endpointUrls.billing)
    this.billingApi = new BillingApiService(billingClient)

    // Invite API (no auth required for validation, but needed for redemption)
    const inviteClient = new ApiClient(endpointUrls.invite)
    this.inviteApi = new InviteApiService(inviteClient)

    // Set up token refresh callback for auto-renewal
    this.apiClient.setTokenRefreshCallback(() => this.refreshAccessToken())
    creditsClient.setTokenRefreshCallback(() => this.refreshAccessToken())
    permissionsClient.setTokenRefreshCallback(() => this.refreshAccessToken())
    billingClient.setTokenRefreshCallback(() => this.refreshAccessToken())
    inviteClient.setTokenRefreshCallback(() => this.refreshAccessToken())
  }

  private clearRefreshTimer() {
    if (this.refreshTimer) {
      window.clearTimeout(this.refreshTimer)
      this.refreshTimer = null
    }
  }

  private getTokenExpiryMs(token: string): number | null {
    try {
      const parts = token.split('.')
      if (parts.length !== 3) return null
      const payload = JSON.parse(atob(parts[1]))
      if (!payload.exp) return null
      return payload.exp * 1000
    } catch {
      return null
    }
  }

  private scheduleRefresh(accessToken: string) {
    const expMs = this.getTokenExpiryMs(accessToken)
    if (!expMs) return

    // Don’t schedule if we don’t have a refresh token available
    const hasRefresh = !!localStorage.getItem('remix_refresh_token')
    if (!hasRefresh) return

    const now = Date.now()
    // Refresh 90s before expiry (min 5s)
    const delay = Math.max(expMs - now - 90_000, 5_000)

    this.clearRefreshTimer()
    this.refreshTimer = window.setTimeout(() => {
      this.refreshAccessToken().catch(() => {/* handled in method */ })
    }, delay)
  }

  /**
   * Get the generic API client (for SSO endpoints)
   */
  async getApiClient(): Promise<ApiClient> {
    return this.apiClient
  }

  /**
   * Get the typed SSO API service
   */
  async getSSOApi(): Promise<SSOApiService> {
    return this.ssoApi
  }

  /**
   * Get the typed Credits API service
   */
  async getCreditsApi(): Promise<CreditsApiService> {
    return this.creditsApi
  }

  /**
   * Get the typed Permissions API service
   */
  async getPermissionsApi(): Promise<PermissionsApiService> {
    return this.permissionsApi
  }

  /**
   * Get the typed Billing API service
   */
  async getBillingApi(): Promise<BillingApiService> {
    return this.billingApi
  }

  /**
   * Get Paddle configuration for checkout (fetched from backend)
   */
  async getPaddleConfig(): Promise<{ clientToken: string | null; environment: 'sandbox' | 'production' }> {
    try {
      // Ensure we have a token set
      await this.getToken()

      const response = await this.billingApi.getConfig()
      if (response.ok && response.data?.paddle) {
        return {
          clientToken: response.data.paddle.token,
          environment: response.data.paddle.environment
        }
      }

      console.warn('[AuthPlugin] Failed to fetch Paddle config:', response.error)
      return { clientToken: null, environment: 'sandbox' }
    } catch (error) {
      console.error('[AuthPlugin] Error fetching Paddle config:', error)
      return { clientToken: null, environment: 'sandbox' }
    }
  }

  /**
   * Check if user has a specific permission/feature
   * @param feature - Feature name (e.g., 'ai:gpt-4', 'wallet:mainnet')
   * @returns Object with allowed status and optional limits
   */
  async checkPermission(feature: string): Promise<{ allowed: boolean; limit?: number; unit?: string }> {
    try {
      const response = await this.permissionsApi.checkFeature(feature)
      if (response.ok && response.data) {
        return {
          allowed: response.data.allowed,
          limit: response.data.limit_value,
          unit: response.data.limit_unit
        }
      }
      return { allowed: false }
    } catch (error) {
      console.error('[AuthPlugin] Permission check failed:', error)
      return { allowed: false }
    }
  }

  /**
   * Simple boolean check for a feature permission
   * @param feature - Feature name to check
   * @returns true if feature is allowed
   */
  async hasPermission(feature: string): Promise<boolean> {
    const { allowed } = await this.checkPermission(feature)
    return allowed
  }

  /**
   * Get all permissions for the current user
   * @returns Full permissions response including feature_groups
   */
  async getAllPermissions(): Promise<any> {
    try {
      const response = await this.permissionsApi.getPermissions()
      if (response.ok && response.data) {
        return response.data
      }
      return { features: []}
    } catch (error) {
      console.error('[AuthPlugin] Get all permissions failed:', error)
      return { features: []}
    }
  }

  /**
   * Re-emit authStateChanged so consumers (e.g. AuthContext) refetch
   * permissions / feature groups. Call after invite redemption, plan
   * changes, or anything that mutates the user's entitlements.
   */
  async refreshPermissions(): Promise<void> {
    const user = await this.getUser()
    const token = await this.getToken()
    if (user && token) {
      this.log('[AuthPlugin] refreshPermissions – re-emitting authStateChanged')
      this.emit('authStateChanged', {
        isAuthenticated: true,
        user,
        token
      })
    }
  }

  /**
   * Check multiple features at once
   * @param features - Array of feature names to check
   * @returns Map of feature names to their permission status
   */
  async checkPermissions(features: string[]): Promise<Record<string, { allowed: boolean; limit_value?: number; limit_unit?: string }>> {
    try {
      const response = await this.permissionsApi.checkFeatures(features)
      if (response.ok && response.data) {
        return response.data.results
      }
      return {}
    } catch (error) {
      console.error('[AuthPlugin] Check permissions failed:', error)
      return {}
    }
  }

  /**
   * Get all features in a category
   * @param category - Category name (e.g., 'ai', 'storage', 'wallet')
   * @returns Array of features in the category
   */
  async getFeaturesByCategory(category: string): Promise<{ feature_name: string; allowed: boolean; limit_value?: number; limit_unit?: string }[]> {
    try {
      const response = await this.permissionsApi.getFeaturesInCategory(category)
      if (response.ok && response.data) {
        return response.data.features
      }
      return []
    } catch (error) {
      console.error('[AuthPlugin] Get features by category failed:', error)
      return []
    }
  }

  /**
   * Get the limit for a specific feature
   * @param feature - Feature name to check
   * @returns Object with limit value and unit
   */
  async getFeatureLimit(feature: string): Promise<{ limit?: number; unit?: string }> {
    try {
      const response = await this.permissionsApi.checkFeature(feature)
      if (response.ok && response.data) {
        return {
          limit: response.data.limit_value,
          unit: response.data.limit_unit
        }
      }
      return {}
    } catch (error) {
      console.error('[AuthPlugin] Get feature limit failed:', error)
      return {}
    }
  }

  /**
   * Check if the E2E test account pool is available.
   * Returns true if a pool API key is configured (via URL param or env).
   */
  async isPoolAvailable(): Promise<{ available: boolean; reason?: string }> {
    try {
      // Check for API key in URL params (hash-based) first, then check pool endpoint
      const queryParams = new QueryParams()
      const allParams = queryParams.get() as Record<string, string>
      const apiKey = allParams.e2e_pool_key

      if (!apiKey) {
        // Fall back to checking the old test/available endpoint
        const response = await fetch(`${endpointUrls.sso}/test/available`, {
          credentials: 'include'
        })
        if (response.ok) {
          const data = await response.json()
          return { available: data.available === true, reason: data.reason }
        }
        return { available: false, reason: 'No pool API key provided' }
      }

      // Verify the key works by checking pool status
      const poolApi = new TestPoolApiService(endpointUrls.sso, apiKey)
      const statusRes = await poolApi.status()
      if (statusRes.ok && statusRes.data) {
        this.testPoolApi = poolApi
        return {
          available: statusRes.data.available > 0,
          reason: statusRes.data.available > 0
            ? `${statusRes.data.available} of ${statusRes.data.total} accounts available`
            : 'All pool accounts are currently in use'
        }
      }
      return { available: false, reason: statusRes.error || 'Pool status check failed' }
    } catch (error: any) {
      console.log('[AuthPlugin] Pool availability check failed:', error)
      return { available: false, reason: error.message || 'Network error' }
    }
  }

  /**
   * Get the current registration mode from the server.
   * Returns 'open', 'existing_only', or 'invite_only'.
   * No authentication required.
   */
  async getRegistrationMode(): Promise<RegistrationMode> {
    try {
      // Return cached value if available (mode rarely changes)
      if (this.cachedRegistrationMode) {
        return this.cachedRegistrationMode
      }

      const response = await this.ssoApi.getRegistrationMode()
      if (response.ok && response.data) {
        this.cachedRegistrationMode = response.data.mode
        return response.data.mode
      }

      // Default to 'open' if endpoint not available
      console.warn('[AuthPlugin] Failed to fetch registration mode, defaulting to open')
      return 'open'
    } catch (error) {
      console.warn('[AuthPlugin] Error fetching registration mode:', error)
      return 'open'
    }
  }

  /**
   * Get the current login access control mode from the server.
   * Returns { mode, message } where mode is 'open', 'feature_group', 'admins_only', or 'closed'.
   * No authentication required.
   */
  async getLoginMode(): Promise<LoginModeResponse> {
    try {
      // Return cached value if available
      if (this.cachedLoginMode) {
        return { mode: this.cachedLoginMode, message: this.cachedLoginMessage }
      }

      const response = await this.ssoApi.getLoginMode()
      if (response.ok && response.data) {
        this.cachedLoginMode = response.data.mode
        this.cachedLoginMessage = response.data.message || ''
        this.log('[AuthPlugin] Login mode:', this.cachedLoginMode, 'message:', this.cachedLoginMessage)
        return { mode: this.cachedLoginMode, message: this.cachedLoginMessage }
      }

      // Default to 'open' if endpoint not available
      console.warn('[AuthPlugin] Failed to fetch login mode, defaulting to open')
      return { mode: 'open', message: '' }
    } catch (error) {
      console.warn('[AuthPlugin] Error fetching login mode:', error)
      return { mode: 'open', message: '' }
    }
  }

  /**
   * Force re-fetch of login mode from the server (cache-busting).
   * Emits 'loginModeChanged' if the mode or message changed.
   */
  async refreshLoginMode(): Promise<LoginModeResponse> {
    const oldMode = this.cachedLoginMode
    const oldMessage = this.cachedLoginMessage
    this.cachedLoginMode = null
    this.cachedLoginMessage = ''

    const result = await this.getLoginMode()
    if (result.mode !== oldMode || result.message !== oldMessage) {
      this.emit('loginModeChanged', result)
    }
    return result
  }

  /**
   * Get the unified access policy from the server.
   * Replaces the separate login-mode + registration-mode endpoints.
   * No authentication required.
   */
  async getAccessPolicy(): Promise<AccessPolicyResponse> {
    try {
      if (this.cachedAccessPolicy) {
        return this.cachedAccessPolicy
      }

      const response = await this.ssoApi.getAccessPolicy()
      if (response.ok && response.data) {
        this.cachedAccessPolicy = response.data
        this.log('[AuthPlugin] Access policy:', response.data.policy)
        return response.data
      }

      console.warn('[AuthPlugin] Failed to fetch access policy, defaulting to open')
      return { policy: 'open', message: '', allows_registration: true, requires_invite: false }
    } catch (error) {
      console.warn('[AuthPlugin] Error fetching access policy:', error)
      return { policy: 'open', message: '', allows_registration: true, requires_invite: false }
    }
  }

  /**
   * Force re-fetch of access policy from the server (cache-busting).
   * Emits 'accessPolicyChanged' if the policy changed.
   */
  async refreshAccessPolicy(): Promise<AccessPolicyResponse> {
    const oldPolicy = this.cachedAccessPolicy?.policy
    this.cachedAccessPolicy = null

    const result = await this.getAccessPolicy()
    if (result.policy !== oldPolicy) {
      this.emit('accessPolicyChanged', result)
    }
    return result
  }

  /**
   * Get the public app configuration from the server.
   * Returns all public settings (cached after first fetch).
   * No authentication required.
   */
  async getAppConfig(): Promise<AppConfig> {
    try {
      if (this.cachedAppConfig) {
        this.log('[AuthPlugin] Returning cached app config', this.cachedAppConfig)
        return this.cachedAppConfig
      }

      // Config endpoint is at the auth server root: /config/public
      const authBaseUrl = endpointUrls.sso.replace(/\/sso\/?$/, '')
      const queryParams = new QueryParams()
      const allParams = queryParams.get() as Record<string, string>
      const apiKey = allParams.e2e_pool_key
      const headers: Record<string, string> = {
        'Accept': 'application/json'
      }
      if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`
      }

      const response = await fetch(`${authBaseUrl}/config/public`, { headers })
      if (response.ok) {
        const data: AppConfig = await response.json()
        this.cachedAppConfig = data
        this.log('[AuthPlugin] App config loaded:', Object.keys(data).length, 'keys')
        return data
      }

      console.warn('[AuthPlugin] Failed to fetch app config, status:', response.status)
      return {}
    } catch (error) {
      console.warn('[AuthPlugin] Error fetching app config:', error)
      return {}
    }
  }

  /**
   * Force re-fetch of app configuration from the server (cache-busting).
   * Emits 'appConfigChanged' with the new config.
   */
  async refreshAppConfig(): Promise<AppConfig> {
    this.cachedAppConfig = null
    const config = await this.getAppConfig()
    this.emit('appConfigChanged', config)
    return config
  }

  /**
   * Get a single config value with a typed default fallback.
   * @param key - Config key (e.g. 'cloud.enabled')
   * @param defaultValue - Value to return if key is missing
   */
  async getAppConfigValue<T extends string | number | boolean>(key: string, defaultValue: T): Promise<T> {
    const config = await this.getAppConfig()
    let val: any
    if (Array.isArray(config)) {
      const entry = (config as any[]).find((c) => c && c.key === key)
      val = entry?.value
    } else if (config && typeof config === 'object') {
      val = (config as any)[key]
    }
    return (val !== undefined && val !== null ? val : defaultValue) as T
  }

  async login(provider: AuthProviderType): Promise<void> {
    try {
      this.log('[AuthPlugin] Starting popup-based login for:', provider)

      // Get pending invite token to pass through login flow
      const inviteToken = this.getPendingInviteToken()

      // SIWE requires special handling (client-side wallet signature)
      if (provider === 'siwe') {
        await this.loginWithSIWE(inviteToken || undefined)
        return
      }

      // Base Account uses Base SDK for SIWE-based authentication
      if (provider === 'base') {
        await this.loginWithBase(inviteToken || undefined)
        return
      }

      // Build login URL - test provider uses pool checkout (no popup needed)
      if (provider === 'test') {
        await this.loginWithPool(inviteToken || undefined)
        return
      }

      // Build popup URL with invite_token if present
      let loginUrl = `${endpointUrls.sso}/login/${provider}?mode=popup&origin=${encodeURIComponent(window.location.origin)}`
      if (inviteToken) {
        loginUrl += `&invite_token=${encodeURIComponent(inviteToken)}`
      }

      // Open popup directly (must be in user click event)
      const popup = window.open(
        loginUrl,
        'RemixLogin',
        'width=500,height=600,menubar=no,toolbar=no,location=no,status=no'
      )

      if (!popup) {
        throw new Error('Popup was blocked. Please allow popups for this site.')
      }

      // Wait for message from popup
      const result = await new Promise<{ user: AuthUser; accessToken: string; refreshToken: string; providerToken?: string }>((resolve, reject) => {
        const timeout = setTimeout(() => {
          cleanup()
          reject(new Error('Login timeout'))
        }, 5 * 60 * 1000) // 5 minute timeout

        // Poll to detect if popup is closed
        const pollInterval = setInterval(() => {
          if (popup && popup.closed) {
            cleanup()
            reject(new Error('Login cancelled - popup was closed'))
          }
        }, 500) // Check every 500ms

        const handleMessage = (event: MessageEvent) => {
          this.log('[AuthPlugin] Received message event:', event)
          // Verify origin
          if (event.origin !== new URL(endpointUrls.sso).origin) {
            return
          }

          if (event.data.type === 'sso-auth-success') {
            this.log('[AuthPlugin] Received auth success from popup')
            this.log('[AuthPlugin] User data from popup:', event.data)
            this.log('[AuthPlugin] User provider field:', event.data.user?.provider)
            cleanup()
            resolve({
              user: event.data.user,
              accessToken: event.data.accessToken,
              refreshToken: event.data.refreshToken,
              providerToken: event.data.providerToken
            })
          } else if (event.data.type === 'sso-auth-error') {
            cleanup()
            const errorCode = event.data.error || ''
            let errorMsg: string

            // Map known error codes to user-friendly messages
            if (ACCESS_POLICY_ERROR_CODES.includes(errorCode)) {
              // Use the server message if available, then cached admin message, then map the code
              const serverMsg = event.data.message
              const adminMsg = this.cachedAccessPolicy?.message || this.cachedLoginMessage
              switch (errorCode) {
              case 'LOGIN_LOCKED':
                errorMsg = serverMsg || adminMsg || 'Login is currently disabled. Please try again later.'
                break
              case 'LOGIN_ADMINS_ONLY':
                errorMsg = serverMsg || adminMsg || 'Login is restricted to administrators.'
                break
              case 'LOGIN_MEMBERS_ONLY':
                errorMsg = serverMsg || adminMsg || 'Only existing members can sign in at this time.'
                break
              case 'INVITE_REQUIRED':
                errorMsg = serverMsg || 'An invite code is required to register.'
                break
              case 'INVITE_INVALID':
                errorMsg = serverMsg || 'Your invite code is invalid or expired.'
                break
              case 'LOGIN_CLOSED':
                errorMsg = serverMsg || adminMsg || 'Login is currently disabled. Please try again later.'
                break
              case 'LOGIN_FEATURE_GROUP_REQUIRED':
                errorMsg = serverMsg || adminMsg || 'Your account does not have login access. Contact an administrator.'
                break
              default:
                errorMsg = serverMsg || adminMsg || 'Login is currently restricted.'
              }
              // Refresh access policy since the server just told us access is restricted
              this.refreshAccessPolicy().catch(() => {})
            } else if (errorCode === 'REGISTRATION_CLOSED') {
              errorMsg = 'Registration is currently closed. Only existing users can sign in.'
            } else if (errorCode === 'ACCOUNT_BLOCKED') {
              errorMsg = 'Your account has been blocked.'
            } else {
              errorMsg = errorCode || 'Login failed'
            }
            reject(new Error(errorMsg))
          }
        }

        const cleanup = () => {
          clearTimeout(timeout)
          clearInterval(pollInterval)
          window.removeEventListener('message', handleMessage)
          if (popup && !popup.closed) {
            popup.close()
          }
        }

        window.addEventListener('message', handleMessage)
      })

      // Store tokens in localStorage
      this.log(result)
      this.log('[AuthPlugin] Storing user in localStorage:', result.user)
      this.log('[AuthPlugin] User has provider field:', result.user.provider)
      localStorage.setItem('remix_access_token', result.accessToken)
      localStorage.setItem('remix_refresh_token', result.refreshToken)
      localStorage.setItem('remix_user', JSON.stringify(result.user))
      this.log('[AuthPlugin] Stored user JSON:', localStorage.getItem('remix_user'))

      // Schedule proactive refresh based on access token expiry
      this.scheduleRefresh(result.accessToken)

      // Emit auth state change
      this.emit('authStateChanged', {
        isAuthenticated: true,
        user: result.user,
        token: result.accessToken
      })
      this.call('nudgePlugin', 'fire', 'user:logged_in')

      // If logged in via GitHub, bridge the provider token to dgit config
      if (result.user.provider === 'github' && result.providerToken) {
        this.log('[AuthPlugin] GitHub provider detected, bridging token to dgit')
        await this.bridgeGitHubToken(result.providerToken)
      }

      // Fetch credits after successful login
      this.refreshCredits().catch(console.error)

      this.log('[AuthPlugin] Login successful')
    } catch (error) {
      console.error('[AuthPlugin] Login failed:', error)
      throw error
    }
  }

  async logout(): Promise<void> {
    try {
      // Call backend logout endpoint
      await fetch(`${endpointUrls.sso}/logout`, {
        method: 'POST',
        credentials: 'include'
      })

      // Clear stored auth data
      this.clearStoredAuth()

      // Emit auth state change
      this.emit('authStateChanged', {
        isAuthenticated: false,
        user: null,
        token: null
      })

      this.log('[AuthPlugin] Logout successful')
    } catch (error) {
      console.error('[AuthPlugin] Logout failed:', error)
    }
  }

  async linkAccount(provider: AuthProviderType): Promise<void> {
    try {
      this.log('[AuthPlugin] Starting account linking for:', provider)

      // Check if already logged in and save current session
      const currentToken = await this.getToken()
      const currentUserStr = localStorage.getItem('remix_user')
      const currentUser = currentUserStr ? JSON.parse(currentUserStr) : null

      if (!currentToken || !currentUser) {
        throw new Error('You must be logged in to link additional accounts')
      }

      this.log('[AuthPlugin] Current user:', currentUser.sub)

      // SIWE linking
      if (provider === 'siwe') {
        await this.linkSIWEAccount()
        return
      }

      // Base wallet linking
      if (provider === 'base') {
        await this.linkBaseAccount()
        return
      }

      // OAuth providers - open popup for linking
      const popup = window.open(
        `${endpointUrls.sso}/login/${provider}?mode=popup&link=true&origin=${encodeURIComponent(window.location.origin)}`,
        'RemixLinkAccount',
        'width=500,height=600,menubar=no,toolbar=no,location=no,status=no'
      )

      if (!popup) {
        throw new Error('Popup was blocked. Please allow popups for this site.')
      }

      // Wait for message from popup
      const result = await new Promise<{ user: AuthUser; accessToken: string; providerToken?: string }>((resolve, reject) => {
        const timeout = setTimeout(() => {
          cleanup()
          reject(new Error('Account linking timeout'))
        }, 5 * 60 * 1000)

        // Poll to detect if popup is closed
        const pollInterval = setInterval(() => {
          if (popup && popup.closed) {
            cleanup()
            reject(new Error('Account linking cancelled - popup was closed'))
          }
        }, 500) // Check every 500ms

        const handleMessage = (event: MessageEvent) => {
          if (event.origin !== new URL(endpointUrls.sso).origin) {
            return
          }

          const data = event.data
          if (data.type === 'sso-auth-success') {
            cleanup()
            resolve(data)
          } else if (data.type === 'sso-auth-error') {
            cleanup()
            reject(new Error(data.error || 'Account linking failed'))
          }
        }

        const cleanup = () => {
          clearTimeout(timeout)
          clearInterval(pollInterval)
          window.removeEventListener('message', handleMessage)
        }

        window.addEventListener('message', handleMessage)
      })

      this.log('[AuthPlugin] Got new account info:', result.user.sub)

      // DON'T update localStorage - keep the original session!
      // We're linking, not switching accounts

      // Call backend to link the accounts using CURRENT user's token
      const linkResponse = await fetch(`${endpointUrls.sso}/accounts/link/${provider}`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentToken}` // Use original token, not new one
        },
        body: JSON.stringify({
          user_id: result.user.sub // This is already a numeric ID from JWT
        })
      })

      if (!linkResponse.ok) {
        const error = await linkResponse.json().catch(() => ({ error: 'Failed to link account' }))
        throw new Error(error.error || 'Account linking failed')
      }

      this.log('[AuthPlugin] Account linked successfully! Keeping original session.')
      this.emit('accountLinked', { provider })

      // Restore original session in case popup response tried to change it
      localStorage.setItem('remix_access_token', currentToken)
      localStorage.setItem('remix_user', JSON.stringify(currentUser))

      // If linking GitHub, bridge the provider token to dgit config
      if (provider === 'github' && result.providerToken) {
        this.log('[AuthPlugin] GitHub linked, bridging token to dgit')
        await this.bridgeGitHubToken(result.providerToken)
      }

    } catch (error: any) {
      console.error('[AuthPlugin] Account linking failed:', error)
      throw error
    }
  }

  /**
   * Bridge a GitHub OAuth token to the dgit plugin config.
   * Saves the token and emits an event so git listeners can update state.
   */
  private async bridgeGitHubToken(token: string): Promise<void> {
    try {
      await this.call('config' as any, 'setAppParameter', 'settings/gist-access-token', token)
      this.emit('gitHubTokenReady' as any, { token })
      this.log('[AuthPlugin] GitHub token bridged to dgit config')
    } catch (error) {
      console.error('[AuthPlugin] Failed to bridge GitHub token:', error)
    }
  }

  /**
   * Fetch the stored GitHub OAuth token from the SSO backend.
   * Use this when a non-GitHub SSO user links GitHub later,
   * or to re-fetch after session restore.
   */
  async fetchGitHubToken(): Promise<string | null> {
    try {
      const token = await this.getToken()
      if (!token) return null

      const response = await fetch(`${endpointUrls.sso}/accounts/github/token`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        },
        credentials: 'include'
      })

      if (!response.ok) {
        this.log('[AuthPlugin] No GitHub token available from backend:', response.status)
        return null
      }

      const data = await response.json()
      if (data.access_token) {
        await this.bridgeGitHubToken(data.access_token)
        return data.access_token
      }
      return null
    } catch (error) {
      console.error('[AuthPlugin] Failed to fetch GitHub token:', error)
      return null
    }
  }

  /**
   * Disconnect GitHub from dgit. Clears the stored GitHub token
   * but does NOT affect SSO login state.
   */
  async disconnectGitHub(): Promise<void> {
    try {
      await this.call('config' as any, 'setAppParameter', 'settings/gist-access-token', '')
      this.emit('gitHubTokenReady' as any, { token: null })
      this.log('[AuthPlugin] GitHub disconnected from dgit')
    } catch (error) {
      console.error('[AuthPlugin] Failed to disconnect GitHub:', error)
    }
  }

  async getUser(): Promise<AuthUser | null> {
    try {
      const userStr = localStorage.getItem('remix_user')
      return userStr ? JSON.parse(userStr) : null
    } catch (error) {
      console.error('[AuthPlugin] Get user failed:', error)
      return null
    }
  }

  async isAuthenticated(): Promise<boolean> {
    return !!localStorage.getItem('remix_access_token')
  }

  async getToken(): Promise<string | null> {
    const token = localStorage.getItem('remix_access_token')

    // Update API clients with current token
    if (token) {
      this.applyAuthTokenToApiClients(token)
    } else {
      // Keep in-memory clients in sync with storage so stale Bearer headers
      // are never sent after logout or manual token removal.
      this.clearAuthTokenFromApiClients()
    }

    return token
  }

  private applyAuthTokenToApiClients(token: string): void {
    this.apiClient.setToken(token)
    this.creditsApi.setToken(token)
    this.permissionsApi.setToken(token)
    this.billingApi.setToken(token)
    this.inviteApi.setToken(token)
  }

  private clearAuthTokenFromApiClients(): void {
    this.apiClient.setToken(null)
    // Api service wrappers expose setToken(string). Empty string clears
    // Authorization because ApiClient only sends Bearer when token is truthy.
    this.creditsApi.setToken('')
    this.permissionsApi.setToken('')
    this.billingApi.setToken('')
    this.inviteApi.setToken('')
  }

  /**
   * Refresh access token using refresh token
   * Called automatically by API client on 401 errors
   */
  private async refreshAccessToken(): Promise<string | null> {
    try {
      const refreshToken = localStorage.getItem('remix_refresh_token')
      if (!refreshToken) {
        console.warn('[AuthPlugin] No refresh token available, logging out')
        // Only call logout if we still have stored auth data to clear,
        // otherwise we'd re-emit authStateChanged and trigger listeners again
        const hasStoredAuth = !!localStorage.getItem('remix_access_token') || !!localStorage.getItem('remix_user')
        if (hasStoredAuth) {
          await this.logout()
        }
        return null
      }

      this.log('[AuthPlugin] Refreshing access token...')

      const response = await this.ssoApi.refreshToken(refreshToken)

      if (response.ok && response.data) {
        const newAccessToken = response.data.access_token

        // Update localStorage
        localStorage.setItem('remix_access_token', newAccessToken)

        // If new refresh token provided, update it too
        if (response.data.refresh_token) {
          localStorage.setItem('remix_refresh_token', response.data.refresh_token)
        }

        // Update all API clients
        this.apiClient.setToken(newAccessToken)
        this.creditsApi.setToken(newAccessToken)
        this.permissionsApi.setToken(newAccessToken)
        this.billingApi.setToken(newAccessToken)
        this.inviteApi.setToken(newAccessToken)

        this.log('[AuthPlugin] Access token refreshed successfully')
        // Reschedule next proactive refresh
        this.scheduleRefresh(newAccessToken)

        // Notify all listeners about the new token
        // Only emit tokenRefreshed — NOT authStateChanged.
        // The user hasn't changed, only the token was refreshed.
        // Emitting authStateChanged here would cause all consumers to re-initialize
        // (reload configs, re-read S3 data, etc.) for no reason.
        this.emit('tokenRefreshed', { token: newAccessToken })

        return newAccessToken
      }

      console.warn('[AuthPlugin] Token refresh failed:', response.error)

      // Any failed refresh means tokens are no longer usable — log out
      await this.logout()

      return null
    } catch (error) {
      console.error('[AuthPlugin] Token refresh error:', error)
      return null
    }
  }

  async getCredits(): Promise<Credits | null> {
    try {
      // Ensure token is set
      await this.getToken()

      this.log('[AuthPlugin] Fetching credits using typed API')

      const response = await this.creditsApi.getBalance()

      if (response.ok && response.data) {
        return response.data
      }

      if (response.status === 401) {
        console.warn('[AuthPlugin] Not authenticated for credits')
      } else if (response.error) {
        console.error('[AuthPlugin] Credits API error:', response.error)
      }

      return null
    } catch (error) {
      console.error('[AuthPlugin] Failed to fetch credits:', error)
      return null
    }
  }

  async refreshCredits(): Promise<Credits | null> {
    const credits = await this.getCredits()
    if (credits) {
      this.emit('creditsUpdated', credits)
    }
    return credits
  }

  /**
   * Get all linked accounts using typed API
   */
  async getLinkedAccounts() {
    try {
      await this.getToken() // Ensure token is set
      const response = await this.ssoApi.getAccounts()

      if (response.ok && response.data) {
        return response.data
      }

      if (response.error) {
        console.error('[AuthPlugin] Failed to get linked accounts:', response.error)
      }

      return null
    } catch (error) {
      console.error('[AuthPlugin] Failed to get linked accounts:', error)
      return null
    }
  }

  /**
   * Unlink an account using typed API
   */
  async unlinkAccount(userId: number) {
    try {
      await this.getToken() // Ensure token is set
      const response = await this.ssoApi.unlinkAccount(userId)

      if (response.ok) {
        return response.data
      }

      throw new Error(response.error || 'Failed to unlink account')
    } catch (error) {
      console.error('[AuthPlugin] Failed to unlink account:', error)
      throw error
    }
  }

  async onActivation(): Promise<void> {
    this.log('[AuthPlugin] Activated - using popup + localStorage mode')

    // Fetch access policy, login mode, and app config early (non-blocking) so UI can adapt immediately
    this.getAccessPolicy().then((accessPolicy) => {
      this.emit('accessPolicyChanged', accessPolicy)
    }).catch(() => {})

    this.getLoginMode().then((loginMode) => {
      this.emit('loginModeChanged', loginMode)
    }).catch(() => {})

    this.getAppConfig().then((config) => {
      this.emit('appConfigChanged', config)
    }).catch(() => {})

    // Validate existing token with the API on load
    // Awaited so that plugin activation only completes after validation.
    // This ensures AuthContext (which polls for activation) never sees
    // stale/unvalidated tokens in localStorage.
    await this.validateAndRestoreSession()
  }

  /**
   * Called by the email OTP flow in the LoginModal after it verifies the code
   * and stores tokens in localStorage. The OTP flow bypasses `login()` and its
   * popup-based message exchange, so we need a dedicated entry-point to:
   *   1. Schedule proactive token refresh
   *   2. Emit `authStateChanged` so CloudProvider (and others) react
   *   3. Fetch credits
   */
  async notifyEmailOtpLogin(user: any, accessToken: string): Promise<void> {
    this.scheduleRefresh(accessToken)

    this.emit('authStateChanged', {
      isAuthenticated: true,
      user,
      token: accessToken
    })

    this.refreshCredits().catch(console.error)
  }

  /**
   * Validate stored token with the API and restore session if valid
   * This ensures tokens can't be forged and catches expired/revoked tokens
   */
  private async validateAndRestoreSession(): Promise<void> {
    const token = localStorage.getItem('remix_access_token')
    if (!token) {
      this.log('[AuthPlugin] No stored token found')
      return
    }

    this.log('[AuthPlugin] Validating stored token with API...')

    try {
      // First check if token is expired locally (quick check)
      const expMs = this.getTokenExpiryMs(token)
      if (expMs && expMs < Date.now()) {
        this.log('[AuthPlugin] Token expired, attempting refresh...')
        const refreshed = await this.refreshAccessToken()
        if (!refreshed) {
          this.log('[AuthPlugin] Refresh failed, clearing session')
          this.clearStoredAuth()
          this.emit('authStateChanged', {
            isAuthenticated: false,
            user: null,
            token: null
          })
          return
        }
        // Refresh succeeded — emit authenticated state with refreshed data
        const refreshedToken = localStorage.getItem('remix_access_token')
        const userStr = localStorage.getItem('remix_user')
        const user = userStr ? JSON.parse(userStr) : null
        if (user && refreshedToken) {
          this.emit('authStateChanged', {
            isAuthenticated: true,
            user,
            token: refreshedToken
          })
          this.refreshCredits().catch(console.error)
        }
        return
      }

      // Verify token with the API
      const response = await this.ssoApi.verify()

      if (response.ok && response.data?.authenticated) {
        this.log('[AuthPlugin] Token verified successfully')

        // Update user data from API response if available
        let user = response.data.user
        if (!user) {
          // Fallback to stored user data
          const userStr = localStorage.getItem('remix_user')
          if (userStr) {
            user = JSON.parse(userStr)
          }
        } else {
          // Update stored user with fresh data from API
          localStorage.setItem('remix_user', JSON.stringify(user))
        }

        if (user) {
          this.emit('authStateChanged', {
            isAuthenticated: true,
            user,
            token
          })

          // Auto-refresh credits
          this.refreshCredits().catch(console.error)

          // Schedule proactive token refresh
          this.scheduleRefresh(token)
        }
      } else {
        this.log('[AuthPlugin] Token validation failed, attempting refresh...')
        // Token is invalid, try to refresh
        const refreshed = await this.refreshAccessToken()
        if (refreshed) {
          // Refresh succeeded — emit authenticated state so cloud plugins activate
          const refreshedToken = localStorage.getItem('remix_access_token')
          const userStr = localStorage.getItem('remix_user')
          const user = userStr ? JSON.parse(userStr) : null
          if (user && refreshedToken) {
            this.emit('authStateChanged', {
              isAuthenticated: true,
              user,
              token: refreshedToken
            })
            this.refreshCredits().catch(console.error)
          }
        } else {
          this.log('[AuthPlugin] Refresh failed, clearing session')
          this.clearStoredAuth()
          this.emit('authStateChanged', {
            isAuthenticated: false,
            user: null,
            token: null
          })
        }
      }
    } catch (error) {
      console.error('[AuthPlugin] Session validation error:', error)
      // Network error — cannot verify token, clear session to be safe.
      // An unverifiable token should not grant access.
      this.log('[AuthPlugin] Cannot reach auth server, clearing session')
      this.clearStoredAuth()
      this.emit('authStateChanged', {
        isAuthenticated: false,
        user: null,
        token: null
      })
    }
  }

  /**
   * Clear all stored authentication data
   */
  private clearStoredAuth(): void {
    localStorage.removeItem('remix_access_token')
    localStorage.removeItem('remix_refresh_token')
    localStorage.removeItem('remix_user')
    this.clearAuthTokenFromApiClients()
    this.clearRefreshTimer()
  }

  // Convert address to EIP-55 checksum format using ethers
  private toChecksumAddress(address: string): string {
    try {
      return getAddress(address)
    } catch (error) {
      throw new Error(`Invalid Ethereum address: ${address}`)
    }
  }

  private async linkSIWEAccount(): Promise<void> {
    try {
      // Check if wallet is available
      if (!(window as any).ethereum) {
        throw new Error('No wallet detected. Please install MetaMask or another Web3 wallet.')
      }

      const ethereum = (window as any).ethereum
      const token = await this.getToken()

      // Request account access
      this.log('[SIWE Link] Requesting wallet accounts...')
      const accounts = await ethereum.request({ method: 'eth_requestAccounts' })
      if (!accounts || accounts.length === 0) {
        throw new Error('No wallet accounts available')
      }

      const rawAddress = accounts[0].toLowerCase()
      const address = this.toChecksumAddress(rawAddress)
      this.log('[SIWE Link] Using checksummed address:', address)

      // Get chain ID
      const chainId = await ethereum.request({ method: 'eth_chainId' })
      const chainIdNumber = parseInt(chainId, 16)

      // Get nonce
      const nonceResponse = await fetch(`${endpointUrls.sso}/siwe/nonce`, {
        credentials: 'include'
      })

      if (!nonceResponse.ok) {
        throw new Error('Failed to fetch nonce from server')
      }

      const nonce = await nonceResponse.text()

      // Create SIWE message using the siwe library
      const siweMessage = new SiweMessage({
        domain: window.location.host,
        address: address,
        statement: 'Link this Ethereum account to your Remix account',
        uri: window.location.origin,
        version: '1',
        chainId: chainIdNumber,
        nonce: nonce,
        issuedAt: new Date().toISOString()
      })
      const message = siweMessage.prepareMessage()

      // Request signature
      this.log('[SIWE Link] Requesting signature...')
      const signature = await ethereum.request({
        method: 'personal_sign',
        params: [message, address]
      })

      // Verify and get user_id
      this.log('[SIWE Link] Verifying signature...')
      const verifyResponse = await fetch(`${endpointUrls.sso}/siwe/verify`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message,
          signature
        })
      })

      if (!verifyResponse.ok) {
        const error = await verifyResponse.json().catch(() => ({ error: 'Verification failed' }))
        throw new Error(error.error || error.message || 'SIWE verification failed')
      }

      const result = await verifyResponse.json()

      // Link the accounts
      const linkResponse = await fetch(`${endpointUrls.sso}/accounts/link/siwe`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          user_id: result.user.sub
        })
      })

      if (!linkResponse.ok) {
        const error = await linkResponse.json().catch(() => ({ error: 'Failed to link account' }))
        throw new Error(error.error || 'Account linking failed')
      }

      this.log('[SIWE Link] Account linked successfully!')
      this.emit('accountLinked', { provider: 'siwe' })

    } catch (error: any) {
      console.error('[SIWE Link] Failed:', error)
      throw error
    }
  }

  /**
   * Link Base wallet to existing account
   */
  private async linkBaseAccount(): Promise<void> {
    try {
      console.log('[Base Link] Starting Base Account linking...')

      const token = await this.getToken()
      if (!token) {
        throw new Error('You must be logged in to link a Base account')
      }

      // Dynamically import the Base Account SDK
      const { createBaseAccountSDK } = await import('@base-org/account')

      // Initialize the SDK
      const sdk = createBaseAccountSDK({
        appName: 'Remix IDE',
      })
      const provider = sdk.getProvider()

      // Get nonce from Base-specific endpoint
      console.log('[Base Link] Fetching nonce from backend...')
      const nonceResponse = await fetch(`${endpointUrls.sso}/base/nonce`, {
        credentials: 'include'
      })

      if (!nonceResponse.ok) {
        throw new Error('Failed to fetch nonce from server')
      }

      const nonce = await nonceResponse.text()
      console.log('[Base Link] Got nonce:', nonce.substring(0, 10) + '...')

      // Base Mainnet chain ID
      const BASE_MAINNET_CHAIN_ID = '0x2105' // 8453

      // Switch to Base chain
      console.log('[Base Link] Switching to Base chain...')
      try {
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: BASE_MAINNET_CHAIN_ID }],
        })
      } catch (switchError: any) {
        console.log('[Base Link] Chain switch response:', switchError)
      }

      // Connect wallet and sign SIWE message
      console.log('[Base Link] Connecting wallet with SIWE...')
      const connectResult = await provider.request({
        method: 'wallet_connect',
        params: [{
          version: '1',
          capabilities: {
            signInWithEthereum: {
              version: '1',
              domain: window.location.host,
              uri: window.location.origin,
              nonce,
              chainId: BASE_MAINNET_CHAIN_ID,
              statement: 'Link this Base account to your Remix account',
              issuedAt: new Date().toISOString(),
            },
          },
        }],
      }) as { accounts: Array<{ address: string; capabilities: { signInWithEthereum: { message: string; signature: string } } }> }

      const { address } = connectResult.accounts[0]
      const { message, signature } = connectResult.accounts[0].capabilities.signInWithEthereum

      console.log('[Base Link] Got address:', address)
      console.log('[Base Link] Got message:', message)
      console.log('[Base Link] Got signature:', signature.substring(0, 20) + '...')

      // Link the Base account using the dedicated endpoint
      console.log('[Base Link] Linking Base account...')
      const linkResponse = await fetch(`${endpointUrls.sso}/base/link`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          message,
          signature
        })
      })

      if (!linkResponse.ok) {
        const error = await linkResponse.json().catch(() => ({ error: 'Failed to link account' }))
        throw new Error(error.error || 'Base account linking failed')
      }

      console.log('[Base Link] Account linked successfully!')
      this.emit('accountLinked', { provider: 'base' })

    } catch (error: any) {
      console.error('[Base Link] Failed:', error)
      throw error
    }
  }

  private async loginWithSIWE(inviteToken?: string): Promise<void> {
    try {
      // Check if wallet is available
      if (!(window as any).ethereum) {
        throw new Error('No wallet detected. Please install MetaMask or another Web3 wallet.')
      }

      const ethereum = (window as any).ethereum

      // Request account access
      this.log('[SIWE] Requesting wallet accounts...')
      const accounts = await ethereum.request({ method: 'eth_requestAccounts' })
      if (!accounts || accounts.length === 0) {
        throw new Error('No wallet accounts available')
      }

      // Convert address to EIP-55 checksum format
      const rawAddress = accounts[0].toLowerCase()
      const address = this.toChecksumAddress(rawAddress)
      this.log('[SIWE] Using checksummed address:', address)

      // Get chain ID
      const chainId = await ethereum.request({ method: 'eth_chainId' })
      const chainIdNumber = parseInt(chainId, 16)
      this.log('[SIWE] Chain ID:', chainIdNumber)

      // Get nonce from backend
      this.log('[SIWE] Fetching nonce from backend...')
      const nonceResponse = await fetch(`${endpointUrls.sso}/siwe/nonce`, {
        credentials: 'include'
      })

      if (!nonceResponse.ok) {
        throw new Error('Failed to fetch nonce from server')
      }

      const nonce = await nonceResponse.text()
      this.log('[SIWE] Got nonce:', nonce.substring(0, 10) + '...')

      // Create SIWE message using the siwe library
      const siweMessage = new SiweMessage({
        domain: window.location.host,
        address: address,
        statement: 'Sign in to Remix IDE with your Ethereum account',
        uri: window.location.origin,
        version: '1',
        chainId: chainIdNumber,
        nonce: nonce,
        issuedAt: new Date().toISOString()
      })
      const message = siweMessage.prepareMessage()

      this.log('[SIWE] Message to sign:', message)

      // Request signature from wallet
      this.log('[SIWE] Requesting signature from wallet...')
      const signature = await ethereum.request({
        method: 'personal_sign',
        params: [message, address]
      })

      this.log('[SIWE] Got signature:', signature.substring(0, 20) + '...')

      // Send to backend for verification
      this.log('[SIWE] Verifying signature with backend...')
      const verifyBody: Record<string, string> = { message, signature }
      if (inviteToken) {
        verifyBody.invite_token = inviteToken
      }
      const verifyResponse = await fetch(`${endpointUrls.sso}/siwe/verify`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(verifyBody)
      })

      if (!verifyResponse.ok) {
        const error = await verifyResponse.json().catch(() => ({ error: 'Verification failed' }))
        if (verifyResponse.status === 403) {
          const errCode = error.error || ''
          if (ACCESS_POLICY_ERROR_CODES.includes(errCode)) {
            this.refreshAccessPolicy().catch(() => {})
            throw new Error(error.message || this.cachedAccessPolicy?.message || this.cachedLoginMessage || 'Login is currently restricted.')
          }
          if (errCode === 'REGISTRATION_CLOSED') {
            throw new Error('Registration is currently closed. Only existing users can sign in.')
          }
          if (errCode === 'ACCOUNT_BLOCKED') {
            throw new Error('Your account has been blocked.')
          }
        }
        throw new Error(error.error || error.message || 'SIWE verification failed')
      }

      const result = await verifyResponse.json()
      this.log('[SIWE] Verification successful!')

      // Store tokens and user info
      localStorage.setItem('remix_access_token', result.token)
      if (result.refreshToken) {
        localStorage.setItem('remix_refresh_token', result.refreshToken)
      }
      if (result.user) {
        localStorage.setItem('remix_user', JSON.stringify(result.user))
      }

      this.log('[SIWE] Login successful!')

      // Schedule proactive token refresh
      this.scheduleRefresh(result.token)

      // Emit auth state changed
      this.emit('authStateChanged', {
        isAuthenticated: true,
        user: result.user,
        token: result.token
      })

      // Auto-refresh credits
      this.refreshCredits().catch(console.error)

    } catch (error: any) {
      console.error('[SIWE] Login failed:', error)
      throw error
    }
  }

  /**
   * Login with Base Account SDK
   * Uses Base's smart wallet and SIWE-based authentication
   */
  private async loginWithBase(inviteToken?: string): Promise<void> {
    try {
      console.log('[Base] Starting Base Account authentication...')

      // Dynamically import the Base Account SDK
      const { createBaseAccountSDK } = await import('@base-org/account')

      // Initialize the SDK
      const sdk = createBaseAccountSDK({
        appName: 'Remix IDE',
      })
      const provider = sdk.getProvider()

      // Get nonce from Base-specific endpoint
      console.log('[Base] Fetching nonce from backend...')
      const nonceResponse = await fetch(`${endpointUrls.sso}/base/nonce`, {
        credentials: 'include'
      })

      if (!nonceResponse.ok) {
        throw new Error('Failed to fetch nonce from server')
      }

      const nonce = await nonceResponse.text()
      console.log('[Base] Got nonce:', nonce.substring(0, 10) + '...')

      // Base Mainnet chain ID
      const BASE_MAINNET_CHAIN_ID = '0x2105' // 8453

      // Switch to Base chain
      console.log('[Base] Switching to Base chain...')
      try {
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: BASE_MAINNET_CHAIN_ID }],
        })
      } catch (switchError: any) {
        console.log('[Base] Chain switch response:', switchError)
        // Some wallets might throw even on success, continue if it's not a real error
      }

      // Connect wallet and sign SIWE message using Base's wallet_connect method
      console.log('[Base] Connecting wallet with SIWE...')
      const connectResult = await provider.request({
        method: 'wallet_connect',
        params: [{
          version: '1',
          capabilities: {
            signInWithEthereum: {
              version: '1',
              domain: window.location.host,
              uri: window.location.origin,
              nonce,
              chainId: BASE_MAINNET_CHAIN_ID,
              statement: 'Sign in to Remix IDE with your Base account',
              issuedAt: new Date().toISOString(),
            },
          },
        }],
      }) as { accounts: Array<{ address: string; capabilities: { signInWithEthereum: { message: string; signature: string } } }> }

      const { address } = connectResult.accounts[0]
      const { message, signature } = connectResult.accounts[0].capabilities.signInWithEthereum

      console.log('[Base] Got address:', address)
      console.log('[Base] Got message:', message)
      console.log('[Base] Got signature:', signature.substring(0, 20) + '...')

      // Verify with Base-specific endpoint
      console.log('[Base] Verifying signature with backend...')
      const verifyBody: Record<string, string> = { message, signature }
      if (inviteToken) {
        verifyBody.invite_token = inviteToken
      }
      const verifyResponse = await fetch(`${endpointUrls.sso}/base/verify`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(verifyBody)
      })

      if (!verifyResponse.ok) {
        const error = await verifyResponse.json().catch(() => ({ error: 'Verification failed' }))
        if (verifyResponse.status === 403) {
          const errCode = error.error || ''
          if (ACCESS_POLICY_ERROR_CODES.includes(errCode)) {
            this.refreshAccessPolicy().catch(() => {})
            throw new Error(error.message || this.cachedAccessPolicy?.message || this.cachedLoginMessage || 'Login is currently restricted.')
          }
          if (errCode === 'REGISTRATION_CLOSED') {
            throw new Error('Registration is currently closed. Only existing users can sign in.')
          }
          if (errCode === 'ACCOUNT_BLOCKED') {
            throw new Error('Your account has been blocked.')
          }
        }
        throw new Error(error.error || error.message || 'Base account verification failed')
      }

      const result = await verifyResponse.json()
      console.log('[Base] Verification successful!')

      // Store tokens and user info
      localStorage.setItem('remix_access_token', result.token)
      if (result.user) {
        // Ensure provider is set to 'base'
        result.user.provider = 'base'
        localStorage.setItem('remix_user', JSON.stringify(result.user))
      }

      console.log('[Base] Login successful!')

      // Emit auth state changed
      this.emit('authStateChanged', {
        isAuthenticated: true,
        user: result.user,
        token: result.token
      })

      // Auto-refresh credits
      this.refreshCredits().catch(console.error)

    } catch (error: any) {
      console.error('[Base] Login failed:', error)
      throw error
    }
  }

  // ==================== Invite Token Methods ====================

  /**
   * Get the Invite API service
   */
  getInviteApi(): InviteApiService {
    return this.inviteApi
  }

  /**
   * Validate an invite token (no auth required)
   * @param token - The invite token string
   */
  async validateInviteToken(token: string): Promise<InviteValidateResponse> {
    const response = await this.inviteApi.validateToken(token)
    if (!response.ok) {
      return {
        valid: false,
        error: response.error || 'Failed to validate token',
        error_code: 'NOT_FOUND'
      }
    }
    return response.data!
  }

  /**
   * Redeem an invite token (auth required)
   * @param token - The invite token string
   */
  async redeemInviteToken(token: string): Promise<InviteRedeemResponse> {
    const response = await this.inviteApi.redeemToken(token)
    if (!response.ok) {
      return {
        success: false,
        error: response.error || 'Failed to redeem token',
        error_code: 'NOT_FOUND'
      }
    }

    const result = response.data!

    // If redemption was successful, emit event and refresh relevant data
    if (result.success) {
      this.emit('inviteTokenRedeemed', {
        token,
        actions: result.actions_applied
      })

      // Refresh credits and permissions as they may have changed
      this.refreshCredits().catch(console.error)
    }

    return result
  }

  /**
   * Get the pending invite token (if any)
   */
  getPendingInviteToken(): string | null {
    // Check session storage first, then instance variable
    const sessionToken = sessionStorage.getItem('remix_pending_invite')
    return sessionToken || this.pendingInviteToken
  }

  /**
   * Get the pending invite validation result (if any)
   */
  getPendingInviteValidation(): { token: string; validation: InviteValidateResponse } | null {
    const stored = sessionStorage.getItem('remix_pending_invite_validation')
    if (stored) {
      try {
        return JSON.parse(stored)
      } catch {
        return null
      }
    }
    return null
  }

  /**
   * Set a pending invite token
   */
  setPendingInviteToken(token: string): void {
    this.pendingInviteToken = token
    sessionStorage.setItem('remix_pending_invite', token)
  }

  /**
   * Store the pending invite validation for retrieval by UI
   */
  setPendingInviteValidation(token: string, validation: InviteValidateResponse): void {
    sessionStorage.setItem('remix_pending_invite_validation', JSON.stringify({ token, validation }))
  }

  /**
   * Clear the pending invite token
   */
  clearPendingInviteToken(): void {
    this.pendingInviteToken = null
    sessionStorage.removeItem('remix_pending_invite')
    sessionStorage.removeItem('remix_pending_invite_validation')
  }

  // ==================== E2E Test Account Pool ====================

  /**
   * Ensure the TestPoolApiService is initialized.
   * Looks for the API key in URL params (?e2e_pool_key=...) or
   * falls back to a previously initialized instance.
   */
  private ensurePoolApi(): TestPoolApiService {
    if (this.testPoolApi) return this.testPoolApi

    const queryParams = new QueryParams()
    const allParams = queryParams.get() as Record<string, string>
    const apiKey = allParams.e2e_pool_key
    if (!apiKey) {
      throw new Error('No pool API key. Pass #e2e_pool_key=rmx_... in the URL or call poolCheckout from the test runner.')
    }

    this.testPoolApi = new TestPoolApiService(endpointUrls.sso, apiKey)
    return this.testPoolApi
  }

  /**
   * Login using the E2E test account pool.
   * Checks out an exclusive account and logs in with the returned JWT tokens.
   * No popup required — tokens come directly from the pool API.
   */
  private async loginWithPool(inviteToken?: string): Promise<void> {
    this.log('[AuthPlugin] Starting pool-based test login')

    const poolApi = this.ensurePoolApi()
    const allParams = new QueryParams().get() as Record<string, string>
    const groups = allParams.e2e_feature_groups ? allParams.e2e_feature_groups.split(',') : []
    console.log('[AuthPlugin] Requesting pool checkout with groups:', groups)
    const result = await poolApi.checkout(groups, inviteToken)

    if (!result.ok || !result.data) {
      throw new Error(`Pool checkout failed: ${result.error || 'Unknown error'}`)
    }

    const { sessionId, accountId, userId, access_token, refresh_token, user } = result.data

    // Track the active session so we can release it later
    this.activePoolSession = { sessionId, accountId }

    // Build AuthUser from pool user data
    const authUser: AuthUser = {
      sub: String(userId),
      email: user.email,
      name: user.name,
      provider: 'test'
    }

    // Store tokens in localStorage (same as OAuth flow)
    localStorage.setItem('remix_access_token', access_token)
    localStorage.setItem('remix_refresh_token', refresh_token)
    localStorage.setItem('remix_user', JSON.stringify(authUser))

    // Store pool session info so release can happen even after page reload
    sessionStorage.setItem('remix_pool_session', JSON.stringify(this.activePoolSession))

    // Schedule proactive refresh
    this.scheduleRefresh(access_token)

    // Emit auth state change
    this.emit('authStateChanged', {
      isAuthenticated: true,
      user: authUser,
      token: access_token
    })
    this.call('nudgePlugin', 'fire', 'user:logged_in')

    // Fetch credits after login
    this.refreshCredits().catch(console.error)

    this.log(`[AuthPlugin] Pool login successful: ${accountId} (session: ${sessionId})`)
  }

  /**
   * Checkout an exclusive test account from the pool.
   * Returns the full checkout response including JWT tokens.
   *
   * Prefer using `login('test')` from the UI, or call this directly
   * from E2E test scripts that need the raw session data.
   */
  async poolCheckout(featureGroups: string[] = ['beta']): Promise<PoolCheckoutResponse> {
    const poolApi = this.ensurePoolApi()
    const result = await poolApi.checkout(featureGroups)

    if (!result.ok || !result.data) {
      throw new Error(`Pool checkout failed: ${result.error || 'Unknown error'}`)
    }

    this.activePoolSession = {
      sessionId: result.data.sessionId,
      accountId: result.data.accountId
    }
    sessionStorage.setItem('remix_pool_session', JSON.stringify(this.activePoolSession))

    return result.data
  }

  /**
   * Release the current (or specified) pool session and wipe all data.
   * **Must be called after every test run.**
   *
   * @param sessionId - Optional. Uses active session if not provided.
   */
  async poolRelease(sessionId?: string): Promise<PoolReleaseResponse> {
    const sid = sessionId
      || this.activePoolSession?.sessionId
      || (() => {
        const stored = sessionStorage.getItem('remix_pool_session')
        return stored ? JSON.parse(stored).sessionId : null
      })()

    if (!sid) {
      throw new Error('No active pool session to release')
    }

    const poolApi = this.ensurePoolApi()
    const result = await poolApi.release(sid)

    if (!result.ok || !result.data) {
      throw new Error(`Pool release failed: ${result.error || 'Unknown error'}`)
    }

    // Clean up local state
    this.activePoolSession = null
    sessionStorage.removeItem('remix_pool_session')

    // Also clear auth state
    this.clearStoredAuth()
    this.emit('authStateChanged', {
      isAuthenticated: false,
      user: null,
      token: null
    })

    this.log(`[AuthPlugin] Pool session released: ${sid}`)
    return result.data
  }

  /**
   * Get current pool status (available accounts, locks, etc.)
   */
  async poolStatus(): Promise<PoolStatusResponse> {
    const poolApi = this.ensurePoolApi()
    const result = await poolApi.status()

    if (!result.ok || !result.data) {
      throw new Error(`Pool status failed: ${result.error || 'Unknown error'}`)
    }

    return result.data
  }

  /**
   * Emergency: force-release all pool accounts and wipe all test data.
   */
  async poolReleaseAll(): Promise<void> {
    const poolApi = this.ensurePoolApi()
    const result = await poolApi.releaseAll()

    if (!result.ok) {
      throw new Error(`Pool release-all failed: ${result.error || 'Unknown error'}`)
    }

    this.activePoolSession = null
    sessionStorage.removeItem('remix_pool_session')

    this.log(`[AuthPlugin] All pool sessions released`)
  }
}
