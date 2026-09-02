import { ModelTransport } from '../types/deepagent'

/**
 * BYOK key validation.
 *
 * Only the transports that can run on a user's own key are handled: OpenRouter
 * and Bedrock (Ollama needs none). The settings panel offers exactly those two
 * keys, so the anthropic / openai / mistral / moonshot validators here were
 * unreachable — and the Anthropic one posted the key straight to
 * api.anthropic.com from the browser, which is not something dead code should
 * be able to do.
 */
export interface ApiKeyValidationResult {
  isValid: boolean
  provider: ModelTransport
  error?: string
}

export function validateApiKeyFormat(provider: ModelTransport, apiKey: string): ApiKeyValidationResult {
  if (!apiKey || apiKey.trim().length === 0) {
    return {
      isValid: false,
      provider,
      error: 'API key cannot be empty'
    }
  }

  const trimmedKey = apiKey.trim()

  switch (provider) {

  case 'openrouter':
    if (!trimmedKey.startsWith('sk-or-')) {
      return {
        isValid: false,
        provider,
        error: 'OpenRouter API key should start with "sk-or-"'
      }
    }
    break

  case 'bedrock':
    if (trimmedKey.length < 20) {
      return {
        isValid: false,
        provider,
        error: 'AWS Bedrock API key appears to be too short'
      }
    }
    break

  case 'ollama':
    return {
      isValid: true,
      provider
    }

  default:
    break
  }

  return {
    isValid: true,
    provider
  }
}

export async function testApiKey(provider: ModelTransport, apiKey: string): Promise<ApiKeyValidationResult> {
  const formatValidation = validateApiKeyFormat(provider, apiKey)
  if (!formatValidation.isValid) {
    return formatValidation
  }

  const trimmedKey = apiKey.trim()

  try {
    switch (provider) {
    case 'openrouter':
      return await testOpenRouterKey(trimmedKey)

    case 'bedrock':
      return await testBedrockKey(trimmedKey)

    case 'ollama':
      return { isValid: true, provider }

    default:
      return { isValid: true, provider }
    }
  } catch (error: any) {
    return {
      isValid: false,
      provider,
      error: error?.message || 'Failed to test API key'
    }
  }
}

async function testOpenRouterKey(apiKey: string): Promise<ApiKeyValidationResult> {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/key', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    })

    if (response.ok) {
      return { isValid: true, provider: 'openrouter' }
    }

    if (response.status === 401) {
      return {
        isValid: false,
        provider: 'openrouter',
        error: 'Invalid API key - authentication failed'
      }
    }

    if (response.status === 429) {
      // Rate limited but key is valid
      return { isValid: true, provider: 'openrouter' }
    }

    const errorData = await response.json().catch(() => ({}))
    return {
      isValid: false,
      provider: 'openrouter',
      error: errorData?.error?.message || `API returned status ${response.status}`
    }
  } catch (error: any) {
    return {
      isValid: false,
      provider: 'openrouter',
      error: error?.message || 'Network error testing API key'
    }
  }
}

async function testBedrockKey(apiKey: string): Promise<ApiKeyValidationResult> {
  const region = 'us-east-1'
  const modelId = 'amazon.nova-micro-v1:0'
  try {
    const response = await fetch(
      `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(modelId)}/converse`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: [{ text: 'ping' }]}],
          inferenceConfig: { maxTokens: 1 }
        })
      }
    )

    // Authenticated and served.
    if (response.ok) {
      return { isValid: true, provider: 'bedrock' }
    }

    // Bad / expired / unrecognized token.
    if (response.status === 401 || response.status === 403) {
      const errorData = await response.json().catch(() => ({} as any))
      return {
        isValid: false,
        provider: 'bedrock',
        error: errorData?.message || errorData?.Message || 'Invalid API key - authentication failed'
      }
    }

    if (response.status === 429 || response.status === 400) {
      return { isValid: true, provider: 'bedrock' }
    }

    const errorData = await response.json().catch(() => ({} as any))
    return {
      isValid: false,
      provider: 'bedrock',
      error: errorData?.message || errorData?.Message || `API returned status ${response.status}`
    }
  } catch (error: any) {
    return {
      isValid: false,
      provider: 'bedrock',
      error: error?.message || 'Network error testing API key'
    }
  }
}

export function getProviderFromSettingKey(settingKey: string): ModelTransport | null {
  if (settingKey.includes('bedrock')) return 'bedrock'
  if (settingKey.includes('openrouter')) return 'openrouter'
  return null
}
