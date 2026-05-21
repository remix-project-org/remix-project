import { IUserApiKeyConfig, API_KEYS_ALLOWED_PLANS } from '@remix/remix-ai-core'

export interface IPluginWithCalls {
  call(plugin: string, method: string, ...args: any[]): Promise<any>
}

/**
 * Shared helper for API key settings management.
 * Used by both ModelManager and DeepAgentManager to avoid code duplication.
 */
export class ApiKeySettingsHelper {
  private plugin: IPluginWithCalls

  constructor(plugin: IPluginWithCalls) {
    this.plugin = plugin
  }

  /**
   * Check if user has permission to use own API keys based on their plan
   */
  async canUseOwnApiKeys(): Promise<boolean> {
    try {
      const permissions = await this.plugin.call('auth', 'getAllPermissions')
      const featureGroups = permissions?.feature_groups || []
      const hasPermission = featureGroups.some((fg: any) =>
        API_KEYS_ALLOWED_PLANS.includes(fg.name)
      )
      console.log('[ApiKeySettingsHelper] API keys permission check:', {
        hasPermission,
        featureGroups: featureGroups.map((fg: any) => fg.name)
      })
      return hasPermission
    } catch (error) {
      console.warn('[ApiKeySettingsHelper] Failed to check API keys permission:', error)
      return false
    }
  }

  /**
   * Get a setting value via plugin call
   */
  async getSetting(key: string): Promise<string | boolean> {
    try {
      const value = await this.plugin.call('settings' as any, 'get', `settings/${key}`)
      return value !== undefined ? value : ''
    } catch (error) {
      console.warn('[ApiKeySettingsHelper] Failed to read setting:', key, error)
      return ''
    }
  }

  /**
   * Set a setting value via plugin call
   */
  async setSetting(key: string, value: string | boolean): Promise<void> {
    try {
      await this.plugin.call('config' as any, 'setAppParameter', `settings/${key}`, value)
    } catch (error) {
      console.warn('[ApiKeySettingsHelper] Failed to write setting:', key, error)
    }
  }

  /**
   * Get the complete user API keys configuration
   */
  async getUserApiKeysConfig(): Promise<IUserApiKeyConfig | undefined> {
    try {
      // First check if user has permission to use own API keys
      const hasPermission = await this.canUseOwnApiKeys()
      if (!hasPermission) {
        console.log('[ApiKeySettingsHelper] User does not have permission to use own API keys')
        return undefined
      }

      // Read settings via plugin calls (parallel for performance)
      const [useOwnKeysValue, anthropicApiKey, mistralApiKey, openaiApiKey, moonshotApiKey] = await Promise.all([
        this.getSetting('deepagent-api-keys-config'),
        this.getSetting('deepagent-anthropic-api-key'),
        this.getSetting('deepagent-mistral-api-key'),
        this.getSetting('deepagent-openai-api-key'),
        this.getSetting('deepagent-moonshot-api-key')
      ])

      const useOwnKeys = useOwnKeysValue === 'true' || useOwnKeysValue === true

      // Debug logging
      console.log('[ApiKeySettingsHelper] Reading API keys from settings:', {
        useOwnKeys,
        hasAnthropicKey: !!anthropicApiKey,
        hasMistralKey: !!mistralApiKey,
        hasOpenaiKey: !!openaiApiKey,
        hasMoonshotKey: !!moonshotApiKey
      })

      // Auto-enable if any API key is set
      const hasAnyKey = anthropicApiKey || mistralApiKey || openaiApiKey || moonshotApiKey
      if (!useOwnKeys && !hasAnyKey) {
        return undefined
      }

      return {
        useOwnKeys: useOwnKeys || !!hasAnyKey,
        anthropicApiKey: String(anthropicApiKey || ''),
        mistralApiKey: String(mistralApiKey || ''),
        openaiApiKey: String(openaiApiKey || ''),
        moonshotApiKey: String(moonshotApiKey || '')
      }
    } catch (error) {
      console.warn('[ApiKeySettingsHelper] Failed to read user API keys config:', error)
      return undefined
    }
  }

  /**
   * Check if using own API key for a specific provider
   */
  async isUsingOwnApiKeyForProvider(provider: string): Promise<boolean> {
    try {
      const useOwnKeysValue = await this.getSetting('deepagent-api-keys-config')
      const useOwnKeys = useOwnKeysValue === 'true' || useOwnKeysValue === true

      if (!useOwnKeys) return false

      let apiKey: string | boolean = ''
      switch (provider) {
      case 'anthropic':
        apiKey = await this.getSetting('deepagent-anthropic-api-key')
        break
      case 'openai':
        apiKey = await this.getSetting('deepagent-openai-api-key')
        break
      case 'mistralai':
        apiKey = await this.getSetting('deepagent-mistral-api-key')
        break
      case 'moonshot':
        apiKey = await this.getSetting('deepagent-moonshot-api-key')
        break
      default:
        return false
      }
      return !!apiKey
    } catch (error) {
      console.warn('[ApiKeySettingsHelper] Failed to check if using own API key:', error)
      return false
    }
  }

  /**
   * Disable own API keys (for fallback to proxy)
   */
  async disableOwnApiKeys(): Promise<void> {
    await this.setSetting('deepagent-api-keys-config', false)
  }
}
