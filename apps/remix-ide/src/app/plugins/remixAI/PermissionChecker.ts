import { remixAILogger } from '@remix/remix-ai-core'
import { endpointUrls } from '@remix-endpoints-helper'
import { Features } from '@remix-api'
import type { MCPAccessResult } from './types'
import type { IRemixAIPlugin } from './types'

/**
 * Thin adapter over the assistantState plugin's cached /permissions
 * snapshot. We do NOT re-fetch /permissions here — that's owned by
 * assistantState and re-routing through it gives us a single source of
 * truth (and cuts a duplicate network call on every auth change).
 *
 * `getModelAccess()` still hits /sso/accounts because that endpoint is
 * separate from /permissions; nothing to consolidate there yet.
 */
export class PermissionChecker {
  private plugin: IRemixAIPlugin

  constructor(plugin: IRemixAIPlugin) {
    this.plugin = plugin
  }

  async checkMCPAccess(): Promise<MCPAccessResult> {
    try {
      // Pull the cached snapshot from assistantState. It's already
      // populated by the time auth has flipped, so this is sync-cheap.
      const snap: any = await this.plugin.call('assistantState' as any, 'getSnapshot')
      if (!snap || !snap.isAuthenticated || !snap.permissions) {
        return { hasBasicMcp: false, hasWebSearch: false, isBetaUser: false }
      }
      const features = snap.permissions.features as Record<string, { is_enabled?: boolean }> | undefined
      const groups = snap.permissions.feature_groups as Array<{ name?: string }> | undefined
      const hasBasicMcp = features?.[Features.MCP_BASIC_EXTERNAL]?.is_enabled === true
      const hasWebSearch = features?.[Features.MCP_WEB_SEARCH]?.is_enabled === true
      const isBetaUser = Array.isArray(groups) && groups.some((g) => g?.name === 'beta')
      return { hasBasicMcp, hasWebSearch, isBetaUser }
    } catch (error) {
      remixAILogger.error('[RemixAI Plugin] Failed to read MCP access from assistantState:', error)
      return { hasBasicMcp: false, hasWebSearch: false, isBetaUser: false }
    }
  }

  async getModelAccess(): Promise<string[]> {
    try {
      const token = localStorage.getItem('remix_access_token')
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {}

      const response = await fetch(`${endpointUrls.sso}/accounts`, {
        credentials: 'include',
        headers
      })

      if (response.ok) {
        const data = await response.json()
        return data.allowed_models || []
      }
    } catch (err) {
      remixAILogger.error('Failed to fetch model access:', err)
    }

    return []
  }
}
