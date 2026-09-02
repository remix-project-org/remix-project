/**
 * The transports that actually carry a request. Exactly three: OpenRouter
 * routes every hosted model, Bedrock is BYOK-direct, Ollama is local.
 */
export type ModelTransport = 'openrouter' | 'bedrock' | 'ollama'

/**
 * @deprecated Alias of {@link ModelTransport}, kept so existing call sites keep
 * compiling. The vendor brands ('anthropic' | 'mistralai' | 'openai' |
 * 'moonshot') are gone: every hosted model reaches us through OpenRouter, so
 * there is nothing left for a brand to select. Prefer `ModelTransport`.
 */
export type ModelProvider = ModelTransport

export interface ModelSelection {
  /** Display brand. */
  provider: ModelProvider
  modelId: string
  /** The transport that carries the request; wins over `provider`. */
  routeProvider?: ModelTransport
}

/**
 * User API key configuration for direct API access
 */
export interface IUserApiKeyConfig {
  useOwnKeys: boolean
  openrouterApiKey?: string
  bedrockBearerToken?: string
}

export function isUsingOwnKeyForProvider(
  provider: ModelProvider | string,
  keys?: IUserApiKeyConfig
): boolean {
  if (!keys) return false
  switch (provider) {
  case 'bedrock':
    return !!keys.bedrockBearerToken
  case 'openrouter':
    return !!(keys.useOwnKeys && keys.openrouterApiKey)
  default:
    return false
  }
}

/**
 * DeepAgent configuration interface
 */
export interface IDeepAgentConfig {
  enabled: boolean
  apiKey: string // Automatically set to 'proxy-handled' - proxy server manages the real API key
  userApiKeys?: IUserApiKeyConfig // User-provided API keys for direct API access
  memoryBackend: 'state' | 'store'
  maxToolExecutions: number
  timeout: number
  enableSubagents: boolean
  enablePlanning: boolean
}

/**
 * DeepAgent error types
 */
export enum DeepAgentErrorType {
  CONTEXT_LENGTH_EXCEEDED = 'context_length_exceeded',
  TOOL_EXECUTION_FAILED = 'tool_execution_failed',
  API_KEY_INVALID = 'api_key_invalid',
  INITIALIZATION_FAILED = 'initialization_failed',
  NETWORK_ERROR = 'network_error',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  SERVER_ERROR = 'server_error',
  SERVICE_UNAVAILABLE = 'service_unavailable',
  REQUEST_TIMEOUT = 'request_timeout',
  INVALID_REQUEST = 'invalid_request',
  AUTHENTICATION_FAILED = 'authentication_failed',
  QUOTA_EXCEEDED = 'quota_exceeded',
  MODEL_OVERLOADED = 'model_overloaded',
  CONTENT_BLOCKED = 'content_blocked',
  TOOL_USE_UNSUPPORTED = 'tool_use_unsupported',
  UNKNOWN = 'unknown'
}

/**
 * DeepAgent error class
 */
export class DeepAgentError extends Error {
  type: DeepAgentErrorType
  details?: any

  constructor(message: string, type: DeepAgentErrorType, details?: any) {
    super(message)
    this.name = 'DeepAgentError'
    this.type = type
    this.details = details
  }
}

export interface ApiKeyErrorEvent {
  provider: ModelProvider
  errorType: 'invalid' | 'expired' | 'quota_exceeded' | 'rate_limited' | 'authentication_failed'
  message: string
  canFallbackToProxy: boolean
  originalError?: string
  timestamp: number
}
