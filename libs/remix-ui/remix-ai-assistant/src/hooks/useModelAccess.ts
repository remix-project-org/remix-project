import { useState, useEffect } from 'react'
import { remixAILogger } from '@remix/remix-ai-core'
import { Features } from '@remix-api'

interface AssistantStatePluginCaller {
  call: (pluginName: string, method: string, ...args: any[]) => Promise<any>
}

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
export function useModelAccess(plugin?: AssistantStatePluginCaller): ModelAccess {
  const [allowedMcps, setAllowedMcps] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchModelAccess = async () => {
    setIsLoading(true)
    setError(null)

    try {
      if (!plugin?.call) {
        setAllowedMcps([])
        return
      }

      const snap: any = await plugin.call('assistantState', 'getSnapshot')
      if (!snap?.isAuthenticated || !snap?.permissions) {
        setAllowedMcps([])
        return
      }

      const allowedMcpsFea: string[] = []
      if (snap.permissions?.features?.[Features.MCP_BASIC_EXTERNAL]?.is_enabled) {
        allowedMcpsFea.push('mcpBasicExternal')
      }
      setAllowedMcps(allowedMcpsFea)
    } catch (err) {
      remixAILogger.error('Failed to read MCP access from assistantState:', err)
      setAllowedMcps([])
      setError('Failed to load MCP access')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchModelAccess()
  }, [plugin])

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
