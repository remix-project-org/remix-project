import React, { createContext, useContext, useReducer, useEffect, useState, ReactNode } from 'react'
import { AuthUser, AuthProvider as AuthProviderType, FeatureGroup } from '@remix-api'
import { Profile } from '@remixproject/plugin-utils'

/** Set to true to enable verbose console.log output for debugging */
const DEBUG = false
const log = (...args: any[]) => { if (DEBUG) console.log(...args) }

export interface Credits {
  balance: number
  free_credits: number
  paid_credits: number
}

export interface AuthState {
  isAuthenticated: boolean
  user: AuthUser | null
  token: string | null
  credits: Credits | null
  featureGroups: FeatureGroup[]
  loading: boolean
  error: string | null
}

type AuthAction =
  | { type: 'AUTH_START' }
  | { type: 'AUTH_SUCCESS'; payload: { user: AuthUser; token: string } }
  | { type: 'AUTH_FAILURE'; payload: string }
  | { type: 'UPDATE_CREDITS'; payload: Credits }
  | { type: 'UPDATE_FEATURE_GROUPS'; payload: FeatureGroup[] }
  | { type: 'TOKEN_REFRESHED'; payload: string }
  | { type: 'LOGOUT' }
  | { type: 'CLEAR_ERROR' }

interface AuthContextValue extends AuthState {
  login: (provider: AuthProviderType) => Promise<void>
  logout: () => Promise<void>
  refreshCredits: () => Promise<void>
  dispatch: React.Dispatch<AuthAction>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const authReducer = (state: AuthState, action: AuthAction): AuthState => {
  switch (action.type) {
  case 'AUTH_START':
    return { ...state, loading: true, error: null }
  case 'AUTH_SUCCESS':
    return {
      ...state,
      loading: false,
      isAuthenticated: true,
      user: action.payload.user,
      token: action.payload.token,
      error: null
    }
  case 'AUTH_FAILURE':
    return {
      ...state,
      loading: false,
      error: action.payload
    }
  case 'UPDATE_CREDITS':
    return {
      ...state,
      credits: action.payload
    }
  case 'UPDATE_FEATURE_GROUPS':
    return {
      ...state,
      featureGroups: action.payload
    }
  case 'TOKEN_REFRESHED':
    return {
      ...state,
      token: action.payload
    }
  case 'LOGOUT':
    return {
      isAuthenticated: false,
      user: null,
      token: null,
      credits: null,
      featureGroups: [],
      loading: false,
      error: null
    }
  case 'CLEAR_ERROR':
    return { ...state, error: null }
  default:
    return state
  }
}

const initialState: AuthState = {
  isAuthenticated: false,
  user: null,
  token: null,
  credits: null,
  featureGroups: [],
  loading: false,
  error: null
}

interface AuthProviderProps {
  children: ReactNode
  plugin: any
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children, plugin }) => {
  const [state, dispatch] = useReducer(authReducer, initialState)
  const [isReady, setIsReady] = useState(false)

  // Wait for plugin to be ready
  useEffect(() => {
    if (!plugin) return

    // Poll for auth plugin activation
    const checkInterval = setInterval(async () => {
      try {
        const isActive = await plugin.call('manager', 'isActive', 'auth')
        if (isActive) {
          setIsReady(true)
          clearInterval(checkInterval)
        }
      } catch (error) {
        // Plugin manager not ready yet, keep polling
      }
    }, 500)

    return () => clearInterval(checkInterval)
  }, [plugin])

  // Initialize auth state on mount
  useEffect(() => {
    if (!isReady || !plugin) return

    // Session restoration is handled by the AuthPlugin's validateAndRestoreSession()
    // which runs during plugin activation (before isReady becomes true).
    // By this point, localStorage has already been validated/cleaned by the server.
    // We just read the validated state — no separate API call needed here.
    const initAuth = async () => {
      try {
        const token = await plugin.getToken()
        if (!token) {
          // No token after validation means user is not authenticated
          return
        }
        const user = await plugin.getUser()
        if (user) {
          dispatch({ type: 'AUTH_SUCCESS', payload: { user, token } })

          // Fetch credits
          const credits = await plugin.getCredits()
          if (credits) {
            dispatch({ type: 'UPDATE_CREDITS', payload: credits })
          }

          // Fetch feature groups from permissions
          try {
            const permissions = await plugin.call('auth', 'getAllPermissions')
            if (permissions && permissions.feature_groups) {
              dispatch({ type: 'UPDATE_FEATURE_GROUPS', payload: permissions.feature_groups })
              // Update Matomo custom dimension with feature group names
              try {
                const groupNames = permissions.feature_groups.map((fg: any) => fg.name)
                await plugin.call('matomo', 'updateFeatureGroups', groupNames)
              } catch (matomoErr) {
                console.warn('[AuthContext] Failed to update Matomo feature groups:', matomoErr)
              }
            }
          } catch (permErr) {
            console.warn('[AuthContext] Failed to fetch feature groups:', permErr)
          }
        }
      } catch (error) {
        console.error('[AuthContext] Failed to restore session:', error)
      }
    }

    initAuth()

    // Listen to auth plugin events
    const handleAuthStateChanged = async (authState: any) => {
      log('[AuthContext] Auth state changed:', authState)
      if (authState.isAuthenticated && authState.user) {
        dispatch({
          type: 'AUTH_SUCCESS',
          payload: { user: authState.user, token: authState.token || null }
        })
        // Fetch feature groups on auth change
        try {
          const permissions = await plugin.call('auth', 'getAllPermissions')
          if (permissions && permissions.feature_groups) {
            dispatch({ type: 'UPDATE_FEATURE_GROUPS', payload: permissions.feature_groups })
            // Update Matomo custom dimension with feature group names
            try {
              const groupNames = permissions.feature_groups.map((fg: any) => fg.name)
              await plugin.call('matomo', 'updateFeatureGroups', groupNames)
            } catch (matomoErr) {
              console.warn('[AuthContext] Failed to update Matomo feature groups:', matomoErr)
            }
          }
        } catch (permErr) {
          console.warn('[AuthContext] Failed to fetch feature groups on auth change:', permErr)
        }
      } else {
        dispatch({ type: 'LOGOUT' })
        // Clear Matomo feature groups dimension on logout
        try {
          await plugin.call('matomo', 'clearFeatureGroups')
        } catch (matomoErr) {
          console.warn('[AuthContext] Failed to clear Matomo feature groups:', matomoErr)
        }
      }
    }

    const handleCreditsUpdated = (credits: Credits) => {
      log('[AuthContext] Credits updated:', credits)
      dispatch({ type: 'UPDATE_CREDITS', payload: credits })
    }

    const handleTokenRefreshed = (data: { token: string }) => {
      log('[AuthContext] Token refreshed')
      dispatch({ type: 'TOKEN_REFRESHED', payload: data.token })
    }

    log('[AuthContext] Setting up event listeners, plugin.on exists:', typeof plugin.on)
    plugin.call('manager', 'isActive', 'auth').then((result) => {
      if (result) {
        plugin.on('auth', 'authStateChanged', handleAuthStateChanged)
        plugin.on('auth', 'creditsUpdated', handleCreditsUpdated)
        plugin.on('auth', 'tokenRefreshed', handleTokenRefreshed)
      } else {
        plugin.on('manager', 'activate', (profile: Profile) => {
          switch (profile.name) {
          case 'auth':
            plugin.on('auth', 'authStateChanged', handleAuthStateChanged)
            plugin.on('auth', 'creditsUpdated', handleCreditsUpdated)
            plugin.on('auth', 'tokenRefreshed', handleTokenRefreshed)
            break
          }
        })
      }
    })
    log('[AuthContext] Event listeners registered')

    return () => {
      plugin.off('auth', 'authStateChanged', handleAuthStateChanged)
      plugin.off('auth', 'creditsUpdated', handleCreditsUpdated)
      plugin.off('auth', 'tokenRefreshed', handleTokenRefreshed)
    }
  }, [plugin, isReady])

  const login = async (provider: AuthProviderType) => {
    if (!isReady || !plugin) {
      dispatch({ type: 'AUTH_FAILURE', payload: 'Authentication system not ready' })
      throw new Error('Authentication system not ready')
    }

    try {
      dispatch({ type: 'AUTH_START' })
      await plugin.login(provider)
    } catch (error: any) {
      dispatch({ type: 'AUTH_FAILURE', payload: error.message || 'Login failed' })
      throw error
    }
  }

  const logout = async () => {
    if (!isReady || !plugin) return

    try {
      await plugin.logout()
      dispatch({ type: 'LOGOUT' })
    } catch (error) {
      console.error('[AuthContext] Logout failed:', error)
    }
  }

  const refreshCredits = async () => {
    if (!plugin) return
    const credits = await plugin.refreshCredits()
    if (credits) {
      dispatch({ type: 'UPDATE_CREDITS', payload: credits })
    }
  }

  const value: AuthContextValue = {
    ...state,
    login,
    logout,
    refreshCredits,
    dispatch
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
