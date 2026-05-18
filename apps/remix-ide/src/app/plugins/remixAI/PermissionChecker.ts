import { endpointUrls } from '@remix-endpoints-helper'
import type { MCPAccessResult } from './types'

export class PermissionChecker {
  async checkMCPAccess(): Promise<MCPAccessResult> {
    try {
      const token = localStorage.getItem('remix_access_token')
      if (!token) return { hasBasicMcp: false, isBetaUser: false }

      const headers = { 'Authorization': `Bearer ${token}` }
      const response = await fetch(`${endpointUrls.permissions}`, {
        credentials: 'include',
        headers
      })

      if (response.ok) {
        const data = await response.json()

        const hasBasicMcp = data.features?.['mcp:basicExternal']?.is_enabled || false
        const isBetaUser = data.feature_groups?.some((group: any) => group.name === 'beta') || false

        return { hasBasicMcp, isBetaUser }
      }
      return { hasBasicMcp: false, isBetaUser: false }
    } catch (error) {
      console.error('[RemixAI Plugin] Failed to check MCP access:', error)
      return { hasBasicMcp: false, isBetaUser: false }
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
      console.error('Failed to fetch model access:', err)
    }

    return []
  }
}
