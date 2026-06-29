import { ModelProvider } from '../types/deepagent'

export interface ApiKeyValidationResult {
  isValid: boolean
  provider: ModelProvider
  error?: string
}

export function validateApiKeyFormat(provider: ModelProvider, apiKey: string): ApiKeyValidationResult {
  if (!apiKey || apiKey.trim().length === 0) {
    return {
      isValid: false,
      provider,
      error: 'API key cannot be empty'
    }
  }

  const trimmedKey = apiKey.trim()

  switch (provider) {
  case 'anthropic':
    if (!trimmedKey.startsWith('sk-ant-')) {
      return {
        isValid: false,
        provider,
        error: 'Anthropic API key should start with "sk-ant-"'
      }
    }
    if (trimmedKey.length < 40) {
      return {
        isValid: false,
        provider,
        error: 'Anthropic API key appears to be too short'
      }
    }
    break

  case 'openai':
    if (!trimmedKey.startsWith('sk-') || trimmedKey.startsWith('sk-ant-')) {
      return {
        isValid: false,
        provider,
        error: 'OpenAI API key should start with "sk-"'
      }
    }
    if (trimmedKey.length < 40) {
      return {
        isValid: false,
        provider,
        error: 'OpenAI API key appears to be too short'
      }
    }
    break

  case 'mistralai':
    if (trimmedKey.length < 20) {
      return {
        isValid: false,
        provider,
        error: 'MistralAI API key appears to be too short'
      }
    }
    break

  case 'moonshot':
    if (!trimmedKey.startsWith('sk-')) {
      return {
        isValid: false,
        provider,
        error: 'Moonshot API key should start with "sk-"'
      }
    }
    if (trimmedKey.length < 20) {
      return {
        isValid: false,
        provider,
        error: 'Moonshot API key appears to be too short'
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

export async function testApiKey(provider: ModelProvider, apiKey: string): Promise<ApiKeyValidationResult> {
  const formatValidation = validateApiKeyFormat(provider, apiKey)
  if (!formatValidation.isValid) {
    return formatValidation
  }

  const trimmedKey = apiKey.trim()

  try {
    switch (provider) {
    case 'anthropic':
      return await testAnthropicKey(trimmedKey)

    case 'openai':
      return await testOpenAIKey(trimmedKey)

    case 'mistralai':
      return await testMistralKey(trimmedKey)

    case 'moonshot':
      return await testMoonshotKey(trimmedKey)

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

async function testAnthropicKey(apiKey: string): Promise<ApiKeyValidationResult> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'test' }]
      })
    })

    // 200 means key is valid (we'll get a response)
    // 400 could mean invalid request but key is valid
    if (response.ok || response.status === 400) {
      return { isValid: true, provider: 'anthropic' }
    }

    if (response.status === 401) {
      return {
        isValid: false,
        provider: 'anthropic',
        error: 'Invalid API key - authentication failed'
      }
    }

    if (response.status === 403) {
      return {
        isValid: false,
        provider: 'anthropic',
        error: 'API key does not have permission to access this resource'
      }
    }

    const errorData = await response.json().catch(() => ({}))
    return {
      isValid: false,
      provider: 'anthropic',
      error: errorData?.error?.message || `API returned status ${response.status}`
    }
  } catch (error: any) {
    return {
      isValid: false,
      provider: 'anthropic',
      error: error?.message || 'Network error testing API key'
    }
  }
}

async function testOpenAIKey(apiKey: string): Promise<ApiKeyValidationResult> {
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    })

    if (response.ok) {
      return { isValid: true, provider: 'openai' }
    }

    if (response.status === 401) {
      return {
        isValid: false,
        provider: 'openai',
        error: 'Invalid API key - authentication failed'
      }
    }

    if (response.status === 429) {
      // Rate limited but key is valid
      return { isValid: true, provider: 'openai' }
    }

    const errorData = await response.json().catch(() => ({}))
    return {
      isValid: false,
      provider: 'openai',
      error: errorData?.error?.message || `API returned status ${response.status}`
    }
  } catch (error: any) {
    return {
      isValid: false,
      provider: 'openai',
      error: error?.message || 'Network error testing API key'
    }
  }
}

async function testMistralKey(apiKey: string): Promise<ApiKeyValidationResult> {
  try {
    const response = await fetch('https://api.mistral.ai/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    })

    if (response.ok) {
      return { isValid: true, provider: 'mistralai' }
    }

    if (response.status === 401) {
      return {
        isValid: false,
        provider: 'mistralai',
        error: 'Invalid API key - authentication failed'
      }
    }

    if (response.status === 429) {
      // Rate limited but key is valid
      return { isValid: true, provider: 'mistralai' }
    }

    const errorData = await response.json().catch(() => ({}))
    return {
      isValid: false,
      provider: 'mistralai',
      error: errorData?.message || `API returned status ${response.status}`
    }
  } catch (error: any) {
    return {
      isValid: false,
      provider: 'mistralai',
      error: error?.message || 'Network error testing API key'
    }
  }
}

/**
 * Test Moonshot API key with a minimal models list request
 */
async function testMoonshotKey(apiKey: string): Promise<ApiKeyValidationResult> {
  try {
    const response = await fetch('https://api.moonshot.cn/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    })

    if (response.ok) {
      return { isValid: true, provider: 'moonshot' }
    }

    if (response.status === 401) {
      return {
        isValid: false,
        provider: 'moonshot',
        error: 'Invalid API key - authentication failed'
      }
    }

    if (response.status === 429) {
      return { isValid: true, provider: 'moonshot' }
    }

    const errorData = await response.json().catch(() => ({}))
    return {
      isValid: false,
      provider: 'moonshot',
      error: errorData?.error?.message || `API returned status ${response.status}`
    }
  } catch (error: any) {
    return {
      isValid: false,
      provider: 'moonshot',
      error: error?.message || 'Network error testing API key'
    }
  }
}

export function getProviderFromSettingKey(settingKey: string): ModelProvider | null {
  if (settingKey.includes('anthropic')) return 'anthropic'
  if (settingKey.includes('openai')) return 'openai'
  if (settingKey.includes('mistral')) return 'mistralai'
  if (settingKey.includes('moonshot')) return 'moonshot'
  return null
}
