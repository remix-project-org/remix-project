import { ChatBedrockConverse } from '@langchain/aws'
import { remixAILogger } from '../../helpers/logger'
import { AIRequestType, ICompletions, IGeneration, IParams } from '../../types/types'
import { CompletionParams, GenerationParams } from '../../types/models'
import { buildChatPrompt } from '../../prompts/promptBuilder'
import { ChatHistory } from '../../prompts/chat'
import { RemoteInferencer } from '../remote/remoteInference'
import type { IUserApiKeyConfig } from '../../types/deepagent'
import {
  CONTRACT_PROMPT,
  WORKSPACE_PROMPT,
  CHAT_PROMPT,
  CODE_GENERATION_PROMPT,
  CODE_EXPLANATION_PROMPT,
  ERROR_EXPLANATION_PROMPT,
  SECURITY_ANALYSIS_PROMPT
} from '../local/systemPrompts'

const defaultErrorMessage = `Unable to get a response from AWS Bedrock`

export class BedrockInferencer extends RemoteInferencer implements ICompletions, IGeneration {
  private bedrockModel: ChatBedrockConverse
  readonly bedrockModelId: string

  constructor(modelId: string, userApiKeys: IUserApiKeyConfig) {
    super()
    this.bedrockModelId = modelId
    this.bedrockModel = new ChatBedrockConverse({
      model: modelId,
      region: userApiKeys.awsRegion ?? 'us-east-1',
      credentials: {
        accessKeyId: userApiKeys.awsAccessKeyId!,
        secretAccessKey: userApiKeys.awsSecretAccessKey!,
        ...(userApiKeys.awsSessionToken ? { sessionToken: userApiKeys.awsSessionToken } : {})
      },
      streaming: true,
    })
  }

  private extractChunkText(chunk: any): string {
    if (typeof chunk.content === 'string') return chunk.content
    if (Array.isArray(chunk.content)) {
      return chunk.content
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text ?? '')
        .join('')
    }
    return ''
  }

  private buildMessages(prompt: string, systemPrompt?: string, history?: Array<{ role: string; content: string }>): Array<[string, string]> {
    const messages: Array<[string, string]> = []
    if (systemPrompt) messages.push(['system', systemPrompt])
    if (history) {
      for (const entry of history) {
        messages.push([entry.role === 'assistant' ? 'ai' : 'human', entry.content])
      }
    }
    messages.push(['human', prompt])
    return messages
  }

  override async _makeRequest(payload: any, _rType: AIRequestType): Promise<any> {
    this.event.emit('onInference')
    try {
      const messages = payload.messages ?? this.buildMessages(payload.prompt || '')
      const result = await this.bedrockModel.invoke(messages)
      return this.extractChunkText(result)
    } catch (e: any) {
      remixAILogger.error('[BedrockInferencer] invoke error:', e?.message ?? e)
      return defaultErrorMessage
    } finally {
      this.event.emit('onInferenceDone')
    }
  }

  override async _streamInferenceRequest(payload: any, _rType: AIRequestType): Promise<any> {
    this.event.emit('onInference')
    const messages = payload.messages ?? this.buildMessages(payload.prompt || '')
    const historyPrompt = payload.originalPrompt || payload.prompt

    if (payload.return_stream_response) {
      // Return a synthetic Response whose body emits { generatedText } JSON chunks so that
      // HandleStreamResponse in the UI can consume it identically to the proxy format.
      const bedrockModel = this.bedrockModel
      const extractText = this.extractChunkText.bind(this)
      const onDone = () => this.event.emit('onInferenceDone')
      this.currentAbortController = new AbortController()
      const signal = this.currentAbortController.signal

      const readable = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder()
          let resultText = ''
          try {
            const stream = await bedrockModel.stream(messages, { signal } as any)
            for await (const chunk of stream) {
              if (signal.aborted) break
              const text = extractText(chunk)
              if (text) {
                resultText += text
                controller.enqueue(encoder.encode(JSON.stringify({ generatedText: text, isGenerating: true })))
              }
            }
            ChatHistory.pushHistory(historyPrompt, resultText)
          } catch (e: any) {
            if (!signal.aborted) {
              controller.enqueue(encoder.encode(JSON.stringify({ generatedText: defaultErrorMessage, isGenerating: true })))
            }
          } finally {
            controller.close()
            onDone()
          }
        }
      })
      return new Response(readable)
    }

    // Non-stream-response path: accumulate inline, emit events, return full text
    let resultText = ''
    try {
      this.currentAbortController = new AbortController()
      const stream = await this.bedrockModel.stream(messages, { signal: this.currentAbortController.signal } as any)
      for await (const chunk of stream) {
        if (this.currentAbortController?.signal.aborted) break
        const text = this.extractChunkText(chunk)
        if (text) {
          resultText += text
          this.event.emit('onStreamResult', text)
        }
      }
      if (resultText) ChatHistory.pushHistory(historyPrompt, resultText)
      return resultText
    } catch (e: any) {
      if (e?.name === 'AbortError') return resultText
      remixAILogger.error('[BedrockInferencer] stream error:', e?.message ?? e)
      return defaultErrorMessage
    } finally {
      this.currentAbortController = null
      this.event.emit('onInferenceDone')
    }
  }

  async answer(prompt: string, options: IParams = GenerationParams): Promise<any> {
    const history = buildChatPrompt(ChatHistory.queueSize)
    const messages = this.buildMessages(prompt, CHAT_PROMPT, history)
    const payload = { messages, originalPrompt: prompt, ...options }
    if (options.stream_result) return this._streamInferenceRequest(payload, AIRequestType.GENERAL)
    return this._makeRequest(payload, AIRequestType.GENERAL)
  }

  async code_generation(prompt: string, options: IParams = GenerationParams): Promise<any> {
    const messages = this.buildMessages(prompt, CODE_GENERATION_PROMPT)
    const payload = { messages, ...options }
    if (options.stream_result) return this._streamInferenceRequest(payload, AIRequestType.GENERAL)
    return this._makeRequest(payload, AIRequestType.GENERAL)
  }

  async generate(userPrompt: string, options: IParams = GenerationParams): Promise<any> {
    const messages = this.buildMessages(userPrompt, CONTRACT_PROMPT)
    const payload = { messages, ...options }
    if (options.stream_result) return this._streamInferenceRequest(payload, AIRequestType.GENERAL)
    return this._makeRequest(payload, AIRequestType.GENERAL)
  }

  async generateWorkspace(userPrompt: string, options: IParams = GenerationParams): Promise<any> {
    const messages = this.buildMessages(userPrompt, WORKSPACE_PROMPT)
    const payload = { messages, ...options }
    if (options.stream_result) return this._streamInferenceRequest(payload, AIRequestType.GENERAL)
    return this._makeRequest(payload, AIRequestType.GENERAL)
  }

  async code_explaining(prompt: string, context: string = '', options: IParams = GenerationParams): Promise<any> {
    const userContent = context ? `${prompt}\n\nContext:\n\`\`\`\n${context}\n\`\`\`` : prompt
    const messages = this.buildMessages(userContent, CODE_EXPLANATION_PROMPT)
    const payload = { messages, ...options }
    if (options.stream_result) return this._streamInferenceRequest(payload, AIRequestType.GENERAL)
    return this._makeRequest(payload, AIRequestType.GENERAL)
  }

  async error_explaining(prompt: string, options: IParams = GenerationParams): Promise<any> {
    const messages = this.buildMessages(prompt, ERROR_EXPLANATION_PROMPT)
    const payload = { messages, ...options }
    if (options.stream_result) return this._streamInferenceRequest(payload, AIRequestType.GENERAL)
    return this._makeRequest(payload, AIRequestType.GENERAL)
  }

  async vulnerability_check(prompt: string, options: IParams = GenerationParams): Promise<any> {
    const messages = this.buildMessages(prompt, SECURITY_ANALYSIS_PROMPT)
    const payload = { messages, ...options }
    if (options.stream_result) return this._streamInferenceRequest(payload, AIRequestType.GENERAL)
    return this._makeRequest(payload, AIRequestType.GENERAL)
  }

  async code_completion(prompt: string, _promptAfter: string, _ctxFiles: any, _fileName: any, options: IParams = CompletionParams): Promise<any> {
    const messages = this.buildMessages(prompt, 'Complete the code at the cursor. Return only the completion without any explanation.')
    const payload = { messages, ...options }
    return this._makeRequest(payload, AIRequestType.COMPLETION)
  }

  async code_insertion(msg_pfx: string, msg_sfx: string, ctxFiles: any, fileName: any, options: IParams = GenerationParams): Promise<any> {
    return this.code_completion(msg_pfx, msg_sfx, ctxFiles, fileName, options)
  }
}
