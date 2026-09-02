import { ModelTransport } from '../../../types/deepagent'
import { bedrockAdapter } from './bedrock'
import { ollamaAdapter } from './ollama'
import { openrouterAdapter } from './openrouter'
import { ProviderAdapter } from './types'

export const PROVIDER_ADAPTERS: Record<ModelTransport, ProviderAdapter> = {
  openrouter: openrouterAdapter,
  bedrock: bedrockAdapter,
  ollama: ollamaAdapter
}

export const SUPPORTED_TRANSPORTS = Object.keys(PROVIDER_ADAPTERS) as ModelTransport[]

export function isSupportedTransport(provider: string | undefined): provider is ModelTransport {
  return !!provider && provider in PROVIDER_ADAPTERS
}

export function getProviderAdapter(provider: string | undefined): ProviderAdapter {
  if (!isSupportedTransport(provider)) {
    throw new Error(
      `[ModelFactory] '${provider ?? 'undefined'}' is not a transport. ` +
      `Supported: ${SUPPORTED_TRANSPORTS.join(', ')}. ` +
      'Vendor brands (anthropic, openai, mistralai, moonshot) reach us through OpenRouter — ' +
      'the catalogue row needs `routeProvider: "openrouter"`.'
    )
  }
  return PROVIDER_ADAPTERS[provider]
}

export function getProviderCapabilities(provider: string | undefined) {
  return getProviderAdapter(provider).capabilities
}

export * from './types'
export { resolveBedrockModelId, ensureToolDescriptions, geoForRegion, DEFAULT_BEDROCK_REGION } from './bedrock'
