/**
 * Cloud Storage React Context
 *
 * Wraps the module-level `cloudStore` singleton so that:
 *  1. The workspace React tree wires auth plugin events to cloud state.
 *  2. On login: marks the user as authenticated (enables cloud toggle).
 *  3. On logout: disables cloud and restores the original WorkspaceFileProvider.
 *
 * Cloud mode is NOT auto-enabled on login or page load.  The user must
 * explicitly click the cloud toggle to enter cloud mode.
 *
 * IMPORTANT: The `cloudStore` singleton is the source of truth. Components
 * in other React trees (e.g. the topbar) can use `useCloudStore()` directly
 * from `./cloud-store` without needing React Context.
 */

import React, { useEffect, useRef } from 'react'
import { cloudStore, useCloudStore } from './cloud-store'
import {
  disableCloud,
} from './cloud-workspace-actions'

// ── Provider ─────────────────────────────────────────────────

interface CloudProviderProps {
  children: React.ReactNode
  plugin: any // the filePanel plugin, needed to listen for auth events
  debug?: boolean
}

/**
 * Wires the auth plugin events to the cloud store.
 * Place this high in the workspace React tree (e.g. around FileSystemProvider).
 */
export const CloudProvider: React.FC<CloudProviderProps> = ({ children, plugin, debug = false }) => {
  const pluginRef = useRef(plugin)
  pluginRef.current = plugin
  const debugRef = useRef(debug)
  debugRef.current = debug

  // ── Listen for auth state changes ──

  useEffect(() => {
    if (!pluginRef.current) return

    const handleAuthStateChanged = async (authState: { isAuthenticated: boolean; user: any; token: string }) => {
      if (debugRef.current) console.log('[CloudProvider:handleAuthStateChanged] isAuthenticated=', authState.isAuthenticated, 'isCloudMode=', cloudStore.isCloudMode)
      if (authState.isAuthenticated) {
        // Mark as authenticated so the cloud toggle becomes enabled.
        // Cloud mode is NOT activated here — the user must click the toggle.
        cloudStore.setAuthenticated(true)
      } else {
        // Logout: disable cloud if it was on, then fully reset auth state
        try {
          await disableCloud()
        } catch (err) {
          if (debugRef.current) console.error('[CloudProvider] Failed to disable cloud on logout:', err)
        }
        cloudStore.exitCloudMode() // full reset including isAuthenticated
      }
    }

    pluginRef.current.on('auth', 'authStateChanged', handleAuthStateChanged)

    // Check initial auth state — just sets the authenticated flag
    ;(async () => {
      try {
        const isAuth = await pluginRef.current.call('auth', 'isAuthenticated')
        if (debugRef.current) console.log('[CloudProvider] Initial isAuthenticated =', isAuth)
        if (isAuth) {
          cloudStore.setAuthenticated(true)
        }
      } catch (e) {
        // auth plugin may not be activated yet — that's fine
      }
    })()

    return () => {
      try {
        pluginRef.current?.off('auth', 'authStateChanged')
      } catch { /* ignore cleanup errors */ }
    }
  }, [])

  return <>{children}</>
}

// ── Convenience Hook ─────────────────────────────────────────

/**
 * Re-export useCloudStore for backward compat.
 * Components in the workspace tree can use this OR import useCloudStore directly.
 */
export { useCloudStore as useCloudState }
