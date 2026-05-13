import { ChatAnthropic } from '@langchain/anthropic'
import { ChatMistralAI } from '@langchain/mistralai'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { endpointUrls } from '@remix-endpoints-helper'
import { ModelSelection } from '../../types/deepagent'
import { DAPP_MAX_TOKENS } from './constants'

export function createModelInstance(
  modelSelection: ModelSelection,
  maxTokens: number = DAPP_MAX_TOKENS
): BaseChatModel {
  const { provider, modelId } = modelSelection

  switch (provider) {
  case 'mistralai': {
    console.log(`[ModelFactory] Creating MistralAI model: ${modelId}`)
    return new ChatMistralAI({
      apiKey: 'proxy-handled',
      model: modelId,
      temperature: 0.7,
      maxTokens: maxTokens,
      streaming: true,
      serverURL: `${endpointUrls.langchain}/mistral`
    })
  }

  case 'anthropic':
  default: {
    console.log(`[ModelFactory] Creating Anthropic model: ${modelId}`)
    return new ChatAnthropic({
      apiKey: 'proxy-handled',
      model: modelId,
      temperature: 0.7,
      maxTokens: maxTokens,
      streaming: true,
      clientOptions: {
        baseURL: endpointUrls.langchain
      }
    })
  }
  }
}
