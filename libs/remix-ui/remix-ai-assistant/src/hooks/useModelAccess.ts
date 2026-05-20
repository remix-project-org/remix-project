import { useState, useEffect } from 'react'
import { endpointUrls } from '@remix-endpoints-helper'
import { getDefaultModel, AVAILABLE_MODELS } from '@remix/remix-ai-core'
import { all } from 'axios'

export interface ModelAccess {
  allowedMcps: string[]
  allowedModels: string[]
  isLoading: boolean
  error: string | null
  requiresLogin: boolean
  checkAccess: (modelId: string) => boolean
  refreshAccess: () => Promise<void>
}

export function useModelAccess(): ModelAccess {
  const [allowedModels, setAllowedModels] = useState<string[]>([])
  const [allowedMcps, setAllowedMcps] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [requiresLogin, setRequiresLogin] = useState(false)

  const fetchModelAccess = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const token = localStorage.getItem('remix_access_token')
      if (!token) {
        // User must be logged in to access AI
        setAllowedModels([])
        setAllowedMcps([])
        setRequiresLogin(true)
        return
      }
      setRequiresLogin(false)
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {}

      const response = await fetch(`${endpointUrls.permissions}`, {
        credentials: 'include',
        headers
      })
      if (response.ok) {
        const data = await response.json()

        // Parse enabled AI features from backend response
        const enabledProviders = new Set<string>()

        if (data.features) {
          // Check each AI feature and map to provider
          if (data.features['ai:Anthropic']?.is_enabled) {
            enabledProviders.add('anthropic')
          }
          if (data.features['ai:OpenAI']?.is_enabled) {
            enabledProviders.add('openai')
          }
          if (data.features['ai:Mistral']?.is_enabled) {
            enabledProviders.add('mistralai')
          }
          if (data.features['ai:Moonshot']?.is_enabled) {
            enabledProviders.add('moonshot')
          }
        }

        const allowedMcpsFea = []
        if (data.features) {
          // Check each AI feature and map to provider
          if (data.features['mcp:basicExternal']?.is_enabled) {
            allowedMcpsFea.push('mcpBasicExternal')
          }
        }

        // Start with default model and ollama (always available)
        const defaultModel = getDefaultModel()
        const allowedModelIds: string[] = [defaultModel.id, 'ollama']

        // Add models based on access rights
        AVAILABLE_MODELS.forEach(model => {
          // Skip if already added (default or ollama)
          if (allowedModelIds.includes(model.id)) {
            return
          }

          // Free models (requiresAuth: false) - always add for logged-in users
          if (!model.requiresAuth) {
            allowedModelIds.push(model.id)
            return
          }

          // Premium models (requiresAuth: true) - only add if provider is enabled
          if (enabledProviders.has(model.provider)) {
            allowedModelIds.push(model.id)
          }
        })

        setAllowedModels(allowedModelIds)
        setAllowedMcps(allowedMcpsFea)
      } else {
        // API request failed - require login
        setAllowedModels([])
        setAllowedMcps([])
        setRequiresLogin(true)
      }
    } catch (err) {
      console.error('Failed to fetch model access:', err)
      setAllowedModels([])
      setAllowedMcps([])
      setRequiresLogin(true)
      setError('Failed to load model access')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchModelAccess()
  }, [])

  const checkAccess = (modelId: string) => {
    return allowedModels.includes(modelId)
  }

  return {
    allowedMcps,
    allowedModels,
    isLoading,
    error,
    requiresLogin,
    checkAccess,
    refreshAccess: fetchModelAccess
  }
}
