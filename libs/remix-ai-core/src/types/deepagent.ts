export type ModelProvider = 'anthropic' | 'mistralai' | 'openai' | 'moonshot' | 'ollama'

export interface ModelSelection {
  provider: ModelProvider
  modelId: string
}

/**
 * User API key configuration for direct API access
 */
export interface IUserApiKeyConfig {
  useOwnKeys: boolean
  anthropicApiKey?: string
  mistralApiKey?: string
  openaiApiKey?: string
  moonshotApiKey?: string
}

/**
 * Auto model selection configuration
 */
export interface IAutoModelConfig {
  enabled: boolean
  fallbackModel?: {
    provider: ModelProvider
    modelId: string
  }
  securityKeywords?: string[]
  complexityThreshold?: number
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
  autoMode?: IAutoModelConfig
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
