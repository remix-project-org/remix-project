import { remixAILogger, IUserApiKeyConfig } from '@remix/remix-ai-core'

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
      const hasPermission = permissions?.features['ai:api-key']?.is_enabled === true
      remixAILogger.log('[ApiKeySettingsHelper] API keys permission check:', {
        hasPermission,
      })
      return hasPermission
    } catch (error) {
      remixAILogger.warn('[ApiKeySettingsHelper] Failed to check API keys permission:', error)
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
      remixAILogger.warn('[ApiKeySettingsHelper] Failed to read setting:', key, error)
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
      remixAILogger.warn('[ApiKeySettingsHelper] Failed to write setting:', key, error)
    }
  }

  /**
   * Get the complete user API keys configuration
   */
  async getUserApiKeysConfig(): Promise<IUserApiKeyConfig | undefined> {
    try {
      // Whether the user may swap the Remix proxy for their own keys on the
      // proxy-backed providers (anthropic / mistral / openai / moonshot).
      const hasPermission = await this.canUseOwnApiKeys()

      // Read settings via plugin calls (parallel for performance). We read the
      // Bedrock API key regardless of `hasPermission`, because Bedrock has no
      // Remix proxy: if the user entered a key it must be used, there's no
      // proxy alternative to gate it against. The permission flag only governs
      // the proxy-backed providers below.
      const [
        useOwnKeysValue,
        anthropicApiKey,
        mistralApiKey,
        openaiApiKey,
        moonshotApiKey,
        bedrockBearerToken
      ] = await Promise.all([
        this.getSetting('deepagent-api-keys-config'),
        this.getSetting('deepagent-anthropic-api-key'),
        this.getSetting('deepagent-mistral-api-key'),
        this.getSetting('deepagent-openai-api-key'),
        this.getSetting('deepagent-moonshot-api-key'),
        this.getSetting('deepagent-bedrock-bearer-token')
      ])

      const useOwnKeys = useOwnKeysValue === 'true' || useOwnKeysValue === true

      const hasBedrockKey = !!bedrockBearerToken

      // Proxy-provider own keys are gated behind the permission; the Bedrock
      // key is not (see above).
      const anthropic = hasPermission ? String(anthropicApiKey || '') : ''
      const mistral = hasPermission ? String(mistralApiKey || '') : ''
      const openai = hasPermission ? String(openaiApiKey || '') : ''
      const moonshot = hasPermission ? String(moonshotApiKey || '') : ''
      const hasAnyProxyKey = !!(anthropic || mistral || openai || moonshot)

      // Debug logging
      remixAILogger.log('[ApiKeySettingsHelper] Reading API keys from settings:', {
        hasPermission,
        useOwnKeys,
        hasAnyProxyKey,
        hasBedrockKey
      })

      // Nothing to contribute → callers fall back to the proxy.
      //  - No Bedrock key AND no proxy-provider own keys in play.
      if (!hasBedrockKey && !hasAnyProxyKey && !(useOwnKeys && hasPermission)) {
        return undefined
      }

      return {
        useOwnKeys: (useOwnKeys && hasPermission) || hasAnyProxyKey || hasBedrockKey,
        anthropicApiKey: anthropic,
        mistralApiKey: mistral,
        openaiApiKey: openai,
        moonshotApiKey: moonshot,
        bedrockBearerToken: String(bedrockBearerToken || '')
      }
    } catch (error) {
      remixAILogger.warn('[ApiKeySettingsHelper] Failed to read user API keys config:', error)
      return undefined
    }
  }

  /**
   * Check if using own API key for a specific provider
   */
  async isUsingOwnApiKeyForProvider(provider: string): Promise<boolean> {
    try {
      // Bedrock has no proxy — it's always "own key" when a Bedrock API key is
      // present, independent of the proxy-vs-own-key toggle.
      if (provider === 'bedrock') {
        return !!(await this.getSetting('deepagent-bedrock-bearer-token'))
      }

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
      remixAILogger.warn('[ApiKeySettingsHelper] Failed to check if using own API key:', error)
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
