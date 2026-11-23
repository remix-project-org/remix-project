import { StatusEvents } from "@remixproject/plugin-utils"
import type { SameEmailOverviewResponse } from "./api-types"

export interface AuthUser {
  sub: string
  email?: string
  name?: string
  picture?: string
  address?: string
  chainId?: number
  provider?: 'google' | 'github' | 'apple' | 'discord' | 'coinbase' | 'siwe' | 'email' | 'test' | 'base'
}

export interface AuthState {
  isAuthenticated: boolean
  user: AuthUser | null
  token: string | null
}

export type AuthProvider = 'google' | 'github' | 'apple' | 'discord' | 'coinbase' | 'siwe' | 'email' | 'test' | 'base' 

export interface ISSOApi {
  events: {
    authStateChanged: (authState: AuthState) => void
    loginSuccess: (data: { user: AuthUser }) => void
    loginError: (data: { provider: AuthProvider; error: string }) => void
    logout: () => void
    tokenRefreshed: (data: { token: string }) => void
    openWindow: (data: { url: string; id: string }) => void
    gitHubTokenReady: (data: { token: string | null }) => void
    /** Fired when the same-email accounts overview changes; null when unavailable (signed out / no verified email). */
    sameEmailAccountsChanged: (overview: SameEmailOverviewResponse | null) => void
  } & StatusEvents
  methods: {
    login(provider: AuthProvider): Promise<void>
    logout(): Promise<void>
    getToken(): Promise<string | null>
    getUser(): Promise<AuthUser | null>
    isAuthenticated(): Promise<boolean>
    refreshToken(): Promise<void>
    fetchGitHubToken(): Promise<string | null>
    disconnectGitHub(): Promise<void>
    getSameEmailAccounts(forceRefresh?: boolean): Promise<SameEmailOverviewResponse | null>
    handlePopupResult(result: {
      id: string
      success: boolean
      user?: AuthUser
      accessToken?: string
      error?: string
    }): Promise<void>
  }
}
