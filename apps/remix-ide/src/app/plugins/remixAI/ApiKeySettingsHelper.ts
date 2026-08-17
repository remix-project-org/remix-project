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
      // proxy-backed providers (openrouter).
      const hasPermission = await this.canUseOwnApiKeys()

      // Read settings via plugin calls (parallel for performance). We read the
      // Bedrock API key regardless of `hasPermission`: a present key means the
      // user wants direct access, which must be honoured. When absent, Bedrock
      // falls back to the Remix proxy (handled in the ModelFactory). The
      // permission flag only governs own-key access on the proxy-backed
      // providers below.
      const [
        useOwnKeysValue,
        openrouterApiKey,
        bedrockBearerToken
      ] = await Promise.all([
        this.getSetting('deepagent-api-keys-config'),
        this.getSetting('deepagent-openrouter-api-key'),
        this.getSetting('deepagent-bedrock-bearer-token')
      ])

      const useOwnKeys = useOwnKeysValue === 'true' || useOwnKeysValue === true

      const hasBedrockKey = !!bedrockBearerToken

      // Proxy-provider own keys are gated behind the permission; the Bedrock
      // key is not (see above).
      const openrouter = hasPermission ? String(openrouterApiKey || '') : ''
      const hasAnyProxyKey = !!openrouter

      // Debug logging
      remixAILogger.log('[ApiKeySettingsHelper] Reading API keys from settings:', {
        hasPermission,
        useOwnKeys,
        hasOpenrouterKey: !!openrouterApiKey,
        hasBedrockKey: !!hasBedrockKey
      })

      // Auto-enable if any API key is set
      const hasAnyKey = openrouterApiKey
      if (!hasBedrockKey && !hasAnyProxyKey && !(useOwnKeys && hasPermission)) {
        return undefined
      }

      return {
        useOwnKeys: useOwnKeys || !!hasAnyKey,
        openrouterApiKey: String(openrouterApiKey || ''),
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
      // A present Bedrock API key means direct ("own key") access, independent
      // of the proxy-vs-own-key toggle; without one we route through the proxy.
      if (provider === 'bedrock') {
        return !!(await this.getSetting('deepagent-bedrock-bearer-token'))
      }

      const useOwnKeysValue = await this.getSetting('deepagent-api-keys-config')
      const useOwnKeys = useOwnKeysValue === 'true' || useOwnKeysValue === true

      if (!useOwnKeys) return false

      let apiKey: string | boolean = ''
      switch (provider) {
      case 'openrouter':
        apiKey = await this.getSetting('deepagent-openrouter-api-key')
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
