import { DeepAgentErrorType } from '../../types/deepagent'

export interface ApiErrorClassification {
  type: DeepAgentErrorType
  retryable: boolean
  retryAfter?: number
}

/**
 * Classify an API error into a DeepAgentErrorType
 */
export function classifyApiError(error: any): ApiErrorClassification {
  const message = error?.message?.toLowerCase() || ''
  const status = error?.status || error?.response?.status || error?.statusCode

  if (status === 429 || message.includes('rate limit') || message.includes('rate_limit') ||
      message.includes('too many requests') || message.includes('throttl')) {
    const retryAfter = extractRetryAfter(error)
    return { type: DeepAgentErrorType.RATE_LIMIT_EXCEEDED, retryable: true, retryAfter }
  }

  if (message.includes('quota') || message.includes('billing') || message.includes('credits') ||
      message.includes('exceeded your current') || message.includes('insufficient_quota')) {
    return { type: DeepAgentErrorType.QUOTA_EXCEEDED, retryable: false }
  }

  if (status === 503 || message.includes('overloaded') || message.includes('capacity') ||
      message.includes('temporarily unavailable')) {
    return { type: DeepAgentErrorType.MODEL_OVERLOADED, retryable: true, retryAfter: 30 }
  }

  if (status === 503 || status === 502 || status === 504 || message.includes('service unavailable') ||
      message.includes('bad gateway') || message.includes('gateway timeout')) {
    return { type: DeepAgentErrorType.SERVICE_UNAVAILABLE, retryable: true, retryAfter: 10 }
  }

  if (status >= 500 && status < 600) {
    return { type: DeepAgentErrorType.SERVER_ERROR, retryable: true, retryAfter: 5 }
  }

  if (status === 401 || message.includes('unauthorized') || message.includes('invalid api key') ||
      message.includes('authentication') || message.includes('invalid_api_key')) {
    return { type: DeepAgentErrorType.AUTHENTICATION_FAILED, retryable: false }
  }

  if (status === 403 || message.includes('forbidden') || message.includes('permission denied')) {
    return { type: DeepAgentErrorType.API_KEY_INVALID, retryable: false }
  }

  if (status === 400 || message.includes('bad request') || message.includes('invalid_request') ||
      message.includes('malformed')) {
    return { type: DeepAgentErrorType.INVALID_REQUEST, retryable: false }
  }

  if (message.includes('context_length_exceeded') || message.includes('maximum context') ||
      message.includes('token limit') || message.includes('too long')) {
    return { type: DeepAgentErrorType.CONTEXT_LENGTH_EXCEEDED, retryable: false }
  }

  if (message.includes('tool_execution_failed') || message.includes('tool error')) {
    return { type: DeepAgentErrorType.TOOL_EXECUTION_FAILED, retryable: false }
  }

  if (message.includes('timeout') || message.includes('timed out') || message.includes('ETIMEDOUT') ||
      message.includes('ESOCKETTIMEDOUT') || error?.code === 'ETIMEDOUT') {
    return { type: DeepAgentErrorType.REQUEST_TIMEOUT, retryable: true, retryAfter: 5 }
  }

  if (message.includes('network') || message.includes('fetch') || message.includes('ECONNREFUSED') ||
      message.includes('ENOTFOUND') || message.includes('ECONNRESET') || message.includes('socket') ||
      error?.code === 'ECONNREFUSED' || error?.code === 'ENOTFOUND') {
    return { type: DeepAgentErrorType.NETWORK_ERROR, retryable: true, retryAfter: 5 }
  }

  return { type: DeepAgentErrorType.UNKNOWN, retryable: false }
}

/**
 * Extract retry-after value from error response
 */
export function extractRetryAfter(error: any): number {
  const retryAfterHeader = error?.response?.headers?.['retry-after'] ||
                           error?.headers?.['retry-after'] ||
                           error?.retryAfter

  if (retryAfterHeader) {
    const seconds = parseInt(retryAfterHeader, 10)
    if (!isNaN(seconds)) return seconds
  }

  const errorBody = error?.response?.data || error?.body || error?.error
  if (errorBody?.retry_after) {
    return errorBody.retry_after
  }

  return 60
}

export function getErrorMessage(errorType: DeepAgentErrorType, error: any, retryAfter?: number): string {
  switch (errorType) {
  case DeepAgentErrorType.RATE_LIMIT_EXCEEDED:
    return retryAfter
      ? `Rate limit exceeded. Please wait ${retryAfter} seconds before trying again.`
      : 'Rate limit exceeded. Please wait a moment before trying again.'

  case DeepAgentErrorType.QUOTA_EXCEEDED:
    return 'API quota exceeded. Please check your billing settings or wait for quota reset.'

  case DeepAgentErrorType.MODEL_OVERLOADED:
    return 'The AI model is currently overloaded. Please try again in a few moments.'

  case DeepAgentErrorType.SERVICE_UNAVAILABLE:
    return 'The AI service is temporarily unavailable. Please try again shortly.'

  case DeepAgentErrorType.SERVER_ERROR:
    return 'Server error occurred. Please try again.'

  case DeepAgentErrorType.AUTHENTICATION_FAILED:
    return 'Authentication failed. Please check your API key configuration.'

  case DeepAgentErrorType.API_KEY_INVALID:
    return 'Invalid or expired API key. Please update your credentials.'

  case DeepAgentErrorType.INVALID_REQUEST:
    return `Invalid request: ${error?.message || 'Please check your input and try again.'}`

  case DeepAgentErrorType.CONTEXT_LENGTH_EXCEEDED:
    return 'The conversation is too long. Please start a new conversation or reduce the context.'

  case DeepAgentErrorType.TOOL_EXECUTION_FAILED:
    return `Tool execution failed: ${error?.message || 'An error occurred while running a tool.'}`

  case DeepAgentErrorType.REQUEST_TIMEOUT:
    return 'Request timed out. Please try again.'

  case DeepAgentErrorType.NETWORK_ERROR:
    return 'Network error. Please check your connection and try again.'

  default:
    return error?.message || 'An unexpected error occurred.'
  }
}
