'use strict'

import { ICompletions,
  IParams, ChatEntry, AIRequestType, IRemoteModel } from './types/types'
import { ModelType } from './types/constants'
import { InsertionParams, CompletionParams, GenerationParams, AssistantParams, AIModel, ANONYMOUS_FALLBACK_MODELS, ANONYMOUS_PLACEHOLDER_MODEL, OLLAMA_MODEL, getModelById, parseAIModelsFromPermissions } from './types/models'
import { buildChatPrompt } from './prompts/promptBuilder'
import { RemoteInferencer } from './inferencers/remote/remoteInference'
import { OllamaInferencer } from './inferencers/local/ollamaInferencer'
import { MCPInferencer } from './inferencers/mcp/mcpInferencer'
import { DeepAgentInferencer } from './inferencers/deepagent/DeepAgentInferencer'
import { RemixMCPServer, createRemixMCPServer } from './remix-mcp-server'
import { isOllamaAvailable, getBestAvailableModel, listModels, discoverOllamaHost, resetOllamaHostOnSettingsChange, getModelCapabilities, modelSupportsTools, modelSupportsThinking, listToolCapableModels } from './inferencers/local/ollama'
import { FIMModelManager, FIMModelConfig, FIM_MODEL_CONFIGS } from './inferencers/local/fimModelConfig'
import { ChatHistory } from './prompts/chat'
import { ChatCommandParser } from './helpers/chatCommandParser'
import { mcpDefaultServersConfig, mcpBasicServersConfig, mcpWebSearchServersConfig } from './config/mcpDefaultServers'
import { ChatHistoryStorageManager } from './storage/storageManager'
import { IndexedDBChatHistoryBackend } from './storage/indexedDBBackend'
import { WeightedToolSelector, IChatMessage } from './services/weightedToolSelector'
import { remixAILogger, setRemixAILoggingEnabled, isRemixAILoggingEnabled } from './helpers/logger'
export {
  ChatCommandParser,
  ModelType, ICompletions, IParams, IRemoteModel, buildChatPrompt,
  RemoteInferencer, OllamaInferencer, MCPInferencer, DeepAgentInferencer, RemixMCPServer, isOllamaAvailable, getBestAvailableModel, listModels, discoverOllamaHost,
  getModelCapabilities, modelSupportsTools, modelSupportsThinking, listToolCapableModels,
  FIMModelManager, FIMModelConfig, FIM_MODEL_CONFIGS, createRemixMCPServer,
  InsertionParams, CompletionParams, GenerationParams, AssistantParams,
  ChatEntry, AIRequestType, ChatHistory, resetOllamaHostOnSettingsChange,
  mcpDefaultServersConfig, mcpBasicServersConfig, mcpWebSearchServersConfig,
  AIModel, ANONYMOUS_FALLBACK_MODELS, ANONYMOUS_PLACEHOLDER_MODEL, OLLAMA_MODEL, getModelById, parseAIModelsFromPermissions,
  ChatHistoryStorageManager, IndexedDBChatHistoryBackend,
  WeightedToolSelector, IChatMessage,
  remixAILogger, setRemixAILoggingEnabled, isRemixAILoggingEnabled
}

export * from './types/types'
export * from './types/mcp'
export * from './helpers/streamHandler'
export * from './helpers/apiKeyValidator'
export * from './helpers/logger'
export * from './agents/codeExplainAgent'
export * from './agents/completionAgent'
export * from './agents/securityAgent'
export * from './agents/contractAgent'
export * from './agents/workspaceAgent'
export * from './storage'
export * from './state/assistant-machine'
export * from './state/ai-error'
export * from './inferencers/deepagent'
export { onDeepAgentApiKeysChanged, onApiKeysChange } from './inferencers/deepagent/deepAgentSettingsEvents'
export * from './types/deepagent'
export * from './types/humanInTheLoop'
export * from './remix-mcp-server/prompts/quickDappTheGraphPrompts'
