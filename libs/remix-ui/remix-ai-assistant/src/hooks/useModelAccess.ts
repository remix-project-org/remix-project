import { useState, useEffect } from 'react'
import { endpointUrls } from '@remix-endpoints-helper'

export interface ModelAccess {
  allowedMcps: string[]
  /** @deprecated The model catalogue now lives on the assistantState plugin
   *  (`getAvailableModels()`). This field is kept as an empty array purely
   *  for legacy callers and will be removed once those are migrated. */
  allowedModels: string[]
  isLoading: boolean
  error: string | null
  /** @deprecated Use `model.available` from `getAvailableModels()` instead. */
  checkAccess: (modelId: string) => boolean
  refreshAccess: () => Promise<void>
}

/**
 * Hook for MCP feature gating only. Model access is now handled by the
 * assistantState plugin (`getAvailableModels()`), which derives every
 * picker entry from the backend's `permissions.ai_models` array.
 */
export function useModelAccess(): ModelAccess {
  const [allowedMcps, setAllowedMcps] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchModelAccess = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const token = localStorage.getItem('remix_access_token')
      if (!token) { setAllowedMcps([]); return }
      const headers = { 'Authorization': `Bearer ${token}` }

      const response = await fetch(`${endpointUrls.permissions}`, {
        credentials: 'include',
        headers
      })
      if (response.ok) {
        const data = await response.json()
        const allowedMcpsFea: string[] = []
        if (data.features?.['mcp:basicExternal']?.is_enabled) {
          allowedMcpsFea.push('mcpBasicExternal')
        }
        setAllowedMcps(allowedMcpsFea)
      } else {
        setAllowedMcps([])
      }
    } catch (err) {
      console.error('Failed to fetch MCP access:', err)
      setAllowedMcps([])
      setError('Failed to load MCP access')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchModelAccess()
  }, [])

  const checkAccess = (_modelId: string) => true

  return {
    allowedMcps,
    allowedModels: [],
    isLoading,
    error,
    checkAccess,
    refreshAccess: fetchModelAccess
  }
}
