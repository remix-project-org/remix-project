import { useState, useEffect } from 'react'
import { endpointUrls } from '@remix-endpoints-helper'
import { getDefaultModel, AVAILABLE_MODELS } from '@remix/remix-ai-core'

export interface ModelAccess {
  allowedModels: string[]
  isLoading: boolean
  error: string | null
  checkAccess: (modelId: string) => boolean
  refreshAccess: () => Promise<void>
}

export function useModelAccess(): ModelAccess {
  const [allowedModels, setAllowedModels] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchModelAccess = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const token = localStorage.getItem('remix_access_token')
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {}

      const response = await fetch(`${endpointUrls.permissions}`, {
        credentials: 'include',
        headers
      })
      if (response.ok) {
        const data = await response.json()
        console.log('Permission response:', data)

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
        }

        // Start with default model and ollama (always available)
        const defaultModel = getDefaultModel()
        const allowedModelIds: string[] = [defaultModel.id, 'ollama']

        // Add models from API-enabled providers
        AVAILABLE_MODELS.forEach(model => {
          // Skip if already added (default or ollama)
          if (allowedModelIds.includes(model.id)) {
            return
          }

          // Only add models from enabled providers
          if (model.requiresAuth && enabledProviders.has(model.provider)) {
            allowedModelIds.push(model.id)
          }
        })

        console.log('Enabled providers:', Array.from(enabledProviders))
        console.log('Allowed models:', allowedModelIds)

        setAllowedModels(allowedModelIds)
      } else {
        // Fallback to default model and ollama only
        const defaultModel = getDefaultModel()
        setAllowedModels([defaultModel.id, 'ollama'])
      }
    } catch (err) {
      console.error('Failed to fetch model access:', err)
      const defaultModel = getDefaultModel()
      setAllowedModels([defaultModel.id, 'ollama'])
      setError('Failed to load model access')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchModelAccess()
  }, [])

  const checkAccess = (modelId: string) => {
    console.log('checking  model access', allowedModels)

    return allowedModels.includes(modelId)
  }

  return {
    allowedModels,
    isLoading,
    error,
    checkAccess,
    refreshAccess: fetchModelAccess
  }
}
