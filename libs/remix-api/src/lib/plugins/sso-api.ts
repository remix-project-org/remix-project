import { StatusEvents } from "@remixproject/plugin-utils"

export interface AuthUser {
  sub: string
  email?: string
  name?: string
  picture?: string
  address?: string
  chainId?: number
  provider?: 'google' | 'github' | 'apple' | 'discord' | 'coinbase' | 'siwe' | 'email'
}

export interface AuthState {
  isAuthenticated: boolean
  user: AuthUser | null
  token: string | null
}

export type AuthProvider = 'google' | 'github' | 'apple' | 'discord' | 'coinbase' | 'siwe' | 'email' 

export interface ISSOApi {
  events: {
    authStateChanged: (authState: AuthState) => void
    loginSuccess: (data: { user: AuthUser }) => void
    loginError: (data: { provider: AuthProvider; error: string }) => void
    logout: () => void
    tokenRefreshed: (data: { token: string }) => void
    openWindow: (data: { url: string; id: string }) => void
  } & StatusEvents
  methods: {
    login(provider: AuthProvider): Promise<void>
    logout(): Promise<void>
    getToken(): Promise<string | null>
    getUser(): Promise<AuthUser | null>
    isAuthenticated(): Promise<boolean>
    refreshToken(): Promise<void>
    handlePopupResult(result: {
      id: string
      success: boolean
      user?: AuthUser
      accessToken?: string
      error?: string
    }): Promise<void>
  }
}
