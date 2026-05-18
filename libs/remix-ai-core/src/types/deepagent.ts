export type ModelProvider = 'anthropic' | 'mistralai' | 'openai' | 'ollama'

export interface ModelSelection {
  provider: ModelProvider
  modelId: string
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
  memoryBackend: 'state' | 'store'
  maxToolExecutions: number
  timeout: number
  enableSubagents: boolean
  enablePlanning: boolean
  autoMode?: IAutoModelConfig
}

/**
 * DeepAgent plan structure
 */
export interface IDeepAgentPlan {
  todos: IDeepAgentTodo[]
  createdAt: number
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
}

/**
 * Individual todo item in a DeepAgent plan
 */
export interface IDeepAgentTodo {
  id: string
  task: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  assignedTo?: string
  result?: string
  error?: string
}

/**
 * Subagent information
 */
export interface ISubagentInfo {
  id: string
  parentId: string
  task: string
  status: 'spawned' | 'running' | 'completed' | 'failed'
  startedAt: number
  completedAt?: number
  result?: any
  error?: string
}

/**
 * DeepAgent stream response
 */
export interface IDeepAgentStreamResponse {
  type: 'content' | 'tool_use' | 'plan' | 'subagent' | 'error'
  content?: string
  toolName?: string
  toolInput?: any
  toolOutput?: any
  plan?: IDeepAgentPlan
  subagent?: ISubagentInfo
  error?: string
}

/**
 * Task streaming event for tracking task progress
 */
export interface ITaskStreamEvent {
  id: string
  name: string
  description?: string
  status: 'started' | 'progress' | 'completed' | 'failed'
  progress?: number
}

/**
 * Subagent streaming event for tracking subagent execution
 */
export interface ISubagentStreamEvent {
  id: string
  name: string
  task?: string
  status: 'started' | 'running' | 'completed' | 'failed'
  duration?: number
}

/**
 * Content streaming event with intermediate/final distinction
 */
export interface IContentStreamEvent {
  content: string
  isIntermediate: boolean
  source?: string
}

/**
 * Tool call event for UI updates
 */
export interface IToolCallEvent {
  toolName: string
  toolInput: Record<string, any>
  toolUIString: string // User-friendly UI string for display
  status: 'start' | 'end'
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
