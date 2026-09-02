import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { IUserApiKeyConfig, ModelTransport, ModelSelection } from '../../../types/deepagent'
import { ResolvedModelParams } from '../modelParams'

export interface ProviderCapabilities {
  /** Tool calling — the agent cannot run without it. */
  tools: boolean
  streaming: boolean
  reasoning: boolean
  injectableFetch: boolean
}

export interface CreateModelArgs {
  selection: ModelSelection
  params: ResolvedModelParams
  userApiKeys?: IUserApiKeyConfig
  /** `transport/modelId`, used for logs and telemetry grouping. */
  label: string
}

export interface ProviderAdapter {
  id: ModelTransport
  capabilities: ProviderCapabilities
  create(args: CreateModelArgs): Promise<BaseChatModel>
}
