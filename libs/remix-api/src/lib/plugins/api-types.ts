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
