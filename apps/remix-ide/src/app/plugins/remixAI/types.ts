import type { DeepAgentInferencer, IMCPServer, IMCPConnectionStatus } from '@remix/remix-ai-core'
import type EventEmitter from 'events'

// Chat request buffer type
export type ChatRequestBuffer<T> = {
  [key in keyof T]: T[key]
}

// Stream result data from DeepAgent
export interface StreamResultData {
  content: string
  isIntermediate: boolean
  source?: string
  isSubagent?: boolean
  subagentName?: string
}

// Tool call event data
export interface ToolCallData {
  toolName: string
  toolInput?: any
  toolOutput?: any
  toolUIString?: string
  status: 'start' | 'end'
}

// Subagent event data
export interface SubagentStartData {
  id: string
  name: string
  task: string
  status: string
}

export interface SubagentCompleteData {
  id: string
  name: string
  status: string
  duration: number
}

// Task event data
export interface TaskData {
  id: string
  name: string
  status: string
}

// Todo update data
export interface TodoUpdateData {
  todos: any[]
  currentTodoIndex?: number
  timestamp: number
}

// Error event data
export interface AgentErrorData {
  message: string
  timestamp: number
  type: string
}

export interface TodoErrorData {
  error: string
  timestamp: number
}

export interface ApiErrorData {
  type: string
  message: string
  retryable: boolean
  retryAfter?: number
  originalError?: string
  timestamp: number
}

// Tool approval request
export interface ToolApprovalRequest {
  requestId: string
  toolName: string
  toolInput: any
  toolUIString?: string
}

export interface ToolApprovalResponse {
  requestId: string
  approved: boolean
  modifiedArgs?: Record<string, any>
}

// MCP access result
export interface MCPAccessResult {
  hasBasicMcp: boolean
  isBetaUser: boolean
}

// Plugin interface for dependency injection
export interface IRemixAIPlugin {
  emit(event: string, data?: any): void
  call(plugin: string, method: string, ...args: any[]): Promise<any>
  on(plugin: string, event: string, handler: (...args: any[]) => void): void
  isInferencing: boolean
  mcpServers: IMCPServer[]
  mcpInferencer: any
  mcpEnabled: boolean
  remixMCPServer: any
  remoteInferencer: any
  deepAgentInferencer: DeepAgentInferencer | null
  deepAgentEnabled: boolean
  selectedModel: any
  selectedModelId: string
  // Additional properties needed by managers
  allowedModels: string[]
  assistantThreadId: string
  pendingDeepAgentThreadId: string | null
}

// Re-export commonly used types
export type { IMCPServer, IMCPConnectionStatus, DeepAgentInferencer }
