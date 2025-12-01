'use strict'

import { ICompletions,
  IParams, ChatEntry, AIRequestType, IRemoteModel } from './types/types'
import { ModelType } from './types/constants'
import { InsertionParams, CompletionParams, GenerationParams, AssistantParams } from './types/models'
import { buildChatPrompt } from './prompts/promptBuilder'
import { RemoteInferencer } from './inferencers/remote/remoteInference'
import { OllamaInferencer } from './inferencers/local/ollamaInferencer'
import { MCPInferencer } from './inferencers/mcp/mcpInferencer'
import { RemixMCPServer, createRemixMCPServer } from './remix-mcp-server'
import { isOllamaAvailable, getBestAvailableModel, listModels, discoverOllamaHost, resetOllamaHostOnSettingsChange } from './inferencers/local/ollama'
import { FIMModelManager, FIMModelConfig, FIM_MODEL_CONFIGS } from './inferencers/local/fimModelConfig'
import { ChatHistory } from './prompts/chat'
import { ChatCommandParser } from './helpers/chatCommandParser'
import { mcpDefaultServersConfig } from './config/mcpDefaultServers'
export {
  ChatCommandParser,
  ModelType, ICompletions, IParams, IRemoteModel, buildChatPrompt,
  RemoteInferencer, OllamaInferencer, MCPInferencer, RemixMCPServer, isOllamaAvailable, getBestAvailableModel, listModels, discoverOllamaHost,
  FIMModelManager, FIMModelConfig, FIM_MODEL_CONFIGS, createRemixMCPServer,
  InsertionParams, CompletionParams, GenerationParams, AssistantParams,
  ChatEntry, AIRequestType, ChatHistory, resetOllamaHostOnSettingsChange,
  mcpDefaultServersConfig
}

export * from './types/types'
export * from './types/mcp'
export * from './helpers/streamHandler'
export * from './agents/codeExplainAgent'
export * from './agents/completionAgent'
export * from './agents/securityAgent'
export * from './agents/contractAgent'
export * from './agents/workspaceAgent'
