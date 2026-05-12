/**
 * DeepAgent Inferencer for Remix IDE
 * Integrates LangChain DeepAgent with Remix's AI system
 */

import { createDeepAgent, CreateDeepAgentParams } from 'deepagents'
import { ICompletions, IGeneration, IParams } from '../../types/types'
import { Plugin } from '@remixproject/engine'
import EventEmitter from 'events'
import { RemixFilesystemBackend } from './RemixFilesystemBackend'
import { createRemixTools, ToolApprovalGate } from './tools'
import {
  REMIX_DEEPAGENT_SYSTEM_PROMPT,
  SOLIDITY_CODE_GENERATION_PROMPT,
  SECURITY_ANALYSIS_PROMPT,
  CODE_EXPLANATION_PROMPT
} from '../deepagent/prompts/system/lightPrompts'
import { DeepAgentMemoryBackend } from '../../storage/deepAgentMemoryBackend'
import { IDeepAgentConfig, DeepAgentError, DeepAgentErrorType, ModelSelection } from '../../types/deepagent'
import { ToolRegistry } from '../../remix-mcp-server/types/mcpTools'
import { classifyApiError, getErrorMessage } from './ApiErrorHandler'
import { HumanMessage, AIMessage } from '@langchain/core/messages'
import type { DynamicStructuredTool } from '@langchain/core/tools'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { selectOptimalModel } from './helpers/modelSelection'
import { IndexedDBCheckpointSaver } from '../../storage/IndexedDBCheckpointSaver'
import { filterOutSpecialistTools, filterOutFileOperationTools } from './helpers/subagentToolFilters'
import type { DeepAgent } from 'deepagents'
import { RemixDeepAgentMiddleware } from './deepAgentMiddleWare'

import './AsyncLocalStorageInit'
import { createModelInstance } from './ModelFactory'
import { buildSubagentConfigs } from './SubagentConfig'
import { StreamEventHandler } from './StreamEventHandler'
import { langSmithTracing } from './LangSmithTracing'

export class DeepAgentInferencer implements ICompletions, IGeneration {
  private plugin: Plugin
  private config: IDeepAgentConfig
  private event: EventEmitter
  private agent: DeepAgent | null = null
  private filesystemBackend: RemixFilesystemBackend
  private memoryBackend: DeepAgentMemoryBackend | null = null
  private tools: DynamicStructuredTool[] = []
  private approvalGate: ToolApprovalGate | undefined
  private currentAbortController: AbortController | null = null
  private fallbackInferencer: any = null
  private model: BaseChatModel | null = null
  private modelSelection: ModelSelection
  private mcpInferencer: any = null
  private allowedModels: string[] = []
  private sessionThreadId: string = DeepAgentInferencer.generateThreadId()
  private streamEventHandler: StreamEventHandler

  private static generateThreadId(): string {
    return `remix-session-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
  }

  private resetSessionThread(): void {
    const oldId = this.sessionThreadId
    this.sessionThreadId = DeepAgentInferencer.generateThreadId()
    console.log('[DeepAgent-Thread] resetSessionThread:', this.sessionThreadId, '(was:', oldId, ')')
  }

  setSessionThreadId(threadId: string): void {
    console.log('[DeepAgent-Thread] setSessionThreadId:', threadId, '(was:', this.sessionThreadId, ')')
    this.sessionThreadId = threadId
  }

  getSessionThreadId(): string {
    return this.sessionThreadId
  }

  setAllowedModels(models: string[]): void {
    this.allowedModels = models
  }

  constructor(
    plugin: Plugin,
    toolRegistry: ToolRegistry,
    config?: Partial<IDeepAgentConfig>,
    fallbackInferencer?: any,
    mcpInferencer?: any,
    modelSelection?: ModelSelection
  ) {
    this.plugin = plugin
    this.event = new EventEmitter()
    this.fallbackInferencer = fallbackInferencer
    this.streamEventHandler = new StreamEventHandler(this.event)

    // Store model selection (default to mistral-medium-latest which is the system default)
    this.modelSelection = modelSelection || {
      provider: 'mistralai',
      modelId: 'mistral-medium-latest'
    }

    // Default configuration (API key handled by proxy)
    this.config = {
      enabled: true,
      apiKey: 'proxy-handled', // Proxy server handles the API key
      memoryBackend: config?.memoryBackend || 'store',
      maxToolExecutions: config?.maxToolExecutions || 10,
      timeout: config?.timeout || 300000, // 5 minutes
      enableSubagents: config?.enableSubagents !== false,
      enablePlanning: config?.enablePlanning !== false,
      autoMode: config?.autoMode || {
        enabled: false,
        fallbackModel: {
          provider: 'mistralai',
          modelId: 'mistral-medium-latest'
        }
      }
    }

    // Initialize filesystem backend with shared EventEmitter for approval
    this.filesystemBackend = new RemixFilesystemBackend(plugin, this.event) as any

    // Store MCP inferencer for resource access
    this.mcpInferencer = mcpInferencer

    // Initialize tools with approval gate
    this.approvalGate = new ToolApprovalGate(plugin, this.event, 'ask_risky')
    this.initializeTools(toolRegistry, mcpInferencer)
  }

  async initialize(): Promise<void> {
    try {
      console.log('[DeepAgentInferencer] Initializing DeepAgent...')
      console.log('[DeepAgentInferencer] Initializing DeepAgent with config:', this.config)
      console.log('[DeepAgentInferencer] Model selection:', this.modelSelection)

      this.model = createModelInstance(this.modelSelection)

      console.log(`[DeepAgentInferencer] Created ${this.modelSelection.provider} model: ${this.modelSelection.modelId}`)

      if (this.config.memoryBackend === 'store') {
        this.memoryBackend = new DeepAgentMemoryBackend('remix-deepagent-memory')
        await this.memoryBackend.init()
      }

      await this.createAgentWithTools(this.tools)
      await langSmithTracing.initialize('Remix-IDE')
    } catch (error: any) {
      console.error('[DeepAgentInferencer] Initialization failed:', error)
      throw new DeepAgentError(
        `Failed to initialize DeepAgent: ${error?.message || error}`,
        DeepAgentErrorType.INITIALIZATION_FAILED,
        error
      )
    }
  }

  private async initializeTools(toolRegistry: ToolRegistry, mcpInferencer?: any): Promise<void> {
    try {
      this.tools = await createRemixTools(this.plugin, toolRegistry, mcpInferencer, this.approvalGate)
      console.log(`[DeepAgentInferencer] Initialized ${this.tools.length} tools`)
    } catch (error) {
      console.warn('[DeepAgentInferencer] Failed to initialize tools:', error)
      this.tools = []
    }
  }

  private async gatherMCPResourcesContext(prompt?: string): Promise<string> {
    return ''
    if (!this.mcpInferencer || !prompt) {
      return ''
    }

    try {
      const connectedServers = this.mcpInferencer.getConnectedServers()
      if (!connectedServers || connectedServers.length === 0) {
        return ''
      }

      const mcpParams = {
        mcpServers: connectedServers,
        enableIntentMatching: true,
        maxResources: 5,
        selectionStrategy: 'hybrid'
      }
      const mcpContext = await this.mcpInferencer.intelligentResourceSelection(prompt, mcpParams)

      if (mcpContext) {
        console.log(`[DeepAgentInferencer] Gathered MCP resources context using intelligentResourceSelection`)
      }

      return mcpContext
    } catch (error) {
      console.warn('[DeepAgentInferencer] Failed to gather MCP resources:', error)
      return ''
    }
  }

  private emitErrorToTodos(error: any): void {
    const errorMessage = error?.message || String(error) || 'Unknown error'

    this.event.emit('onAgentError', {
      message: errorMessage,
      timestamp: Date.now(),
      type: error?.name || 'Error'
    })

    this.event.emit('onTodoError', {
      error: errorMessage,
      timestamp: Date.now()
    })

    console.log('[DeepAgentInferencer] Emitted error to todos:', errorMessage)
  }

  async code_generation(prompt: string, params: IParams): Promise<string> {
    this.event.emit('onInference')

    try {
      if (!this.agent) {
        throw new DeepAgentError(
          'DeepAgent not initialized',
          DeepAgentErrorType.INITIALIZATION_FAILED
        )
      }

      // Gather MCP resources context
      const mcpContext = await this.gatherMCPResourcesContext(prompt)
      const enrichedPrompt = mcpContext ? `${mcpContext}\n\n${prompt}` : prompt

      // Build messages
      const messages = [
        { role: 'system', content: REMIX_DEEPAGENT_SYSTEM_PROMPT + '\n\n' + SOLIDITY_CODE_GENERATION_PROMPT },
        { role: 'user', content: enrichedPrompt }
      ]

      // Run the agent
      const response = await this.runAgent(messages, params)

      this.event.emit('onInferenceDone')
      return response
    } catch (error) {
      this.event.emit('onInferenceDone')
      return await this.handleError(error, 'code_generation', prompt, params)
    }
  }

  async code_explaining(prompt: string, context: string, params: IParams): Promise<string> {
    this.event.emit('onInference')

    try {
      if (!this.agent) {
        throw new DeepAgentError(
          'DeepAgent not initialized',
          DeepAgentErrorType.INITIALIZATION_FAILED
        )
      }

      // Gather MCP resources context
      const mcpContext = await this.gatherMCPResourcesContext(prompt)
      const enrichedContext = mcpContext ? `${mcpContext}\n\n${context}` : context

      const messages = [
        { role: 'system', content: REMIX_DEEPAGENT_SYSTEM_PROMPT + '\n\n' + CODE_EXPLANATION_PROMPT },
        { role: 'user', content: `Context:\n${enrichedContext}\n\nQuestion: ${prompt}` }
      ]

      const response = await this.runAgent(messages, params)

      this.event.emit('onInferenceDone')
      return response
    } catch (error) {
      this.event.emit('onInferenceDone')
      return await this.handleError(error, 'code_explaining', prompt, params)
    }
  }

  async answer(prompt: string, params: IParams, context?: string): Promise<string> {
    this.event.emit('onInference')

    try {
      if (!this.agent) {
        console.error('[DeepAgent] answer() FAILED: agent is null/undefined!')
        throw new DeepAgentError(
          'DeepAgent not initialized',
          DeepAgentErrorType.INITIALIZATION_FAILED
        )
      }

      if (this.config.autoMode?.enabled) {
        const optimalModel = selectOptimalModel(prompt, context, this.config.autoMode, this.modelSelection, (this.plugin as any).getAllowedModels())
        await this.updateAgentModel(optimalModel)
      }

      const mcpContext = await this.gatherMCPResourcesContext(prompt)
      const enrichedContext = mcpContext
        ? (context ? `${mcpContext}\n\n${context}` : mcpContext)
        : context
      const messages = [
        { role: 'user', content: enrichedContext ? `Context:\n${enrichedContext}\n\nQuestion: ${prompt}` : prompt }
      ]
      const responsePromise = this.runAgent(messages, params)

      responsePromise.then(response => {
        this.event.emit('onStreamComplete', response)
        this.event.emit('onInferenceDone')
      }).catch(error => {
        if (error?.name === 'AbortError' || error?.message?.includes('cancelled')) {
          console.log('[DeepAgentInferencer] Answer request was cancelled')
        } else {
          console.error('[DeepAgentInferencer] Answer error:', error)
          const { type: errorType, retryable, retryAfter } = classifyApiError(error)
          const userMessage = getErrorMessage(errorType, error, retryAfter)

          this.event.emit('onApiError', {
            type: errorType,
            message: userMessage,
            retryable,
            retryAfter,
            originalError: error?.message,
            timestamp: Date.now()
          })

          // Emit error to update todo list with failed status
          this.emitErrorToTodos(new Error(userMessage))
        }
        this.event.emit('onInferenceDone')
      })

      return ''
    } catch (error) {
      this.event.emit('onInferenceDone')
      console.error(`[DeepAgentInferencer] Error in answer method:`, error)
      return await this.handleError(error, 'answer', prompt, params)
    }
  }

  async generate(prompt: string, params: IParams): Promise<string> {
    return this.code_generation(prompt, params)
  }

  async generateWorkspace(prompt: string, params: IParams): Promise<string> {
    return this.code_generation(prompt, params)
  }

  async error_explaining(prompt: string, params: IParams): Promise<string> {
    return this.answer(prompt, params, '')
  }

  async vulnerability_check(prompt: string, params: IParams): Promise<string> {
    this.event.emit('onInference')

    try {
      if (!this.agent) {
        throw new DeepAgentError(
          'DeepAgent not initialized',
          DeepAgentErrorType.INITIALIZATION_FAILED
        )
      }

      // Gather MCP resources context
      const mcpContext = await this.gatherMCPResourcesContext(prompt)
      const enrichedPrompt = mcpContext ? `${mcpContext}\n\n${prompt}` : prompt

      const messages = [
        { role: 'system', content: REMIX_DEEPAGENT_SYSTEM_PROMPT + '\n\n' + SECURITY_ANALYSIS_PROMPT },
        { role: 'user', content: enrichedPrompt }
      ]

      const response = await this.runAgent(messages, params)

      this.event.emit('onInferenceDone')
      return response
    } catch (error) {
      this.event.emit('onInferenceDone')
      return await this.handleError(error, 'vulnerability_check', prompt, params)
    }
  }

  /**
   * Answer with a custom system prompt - used for specialized generation like DApps.
   * Creates a dedicated model instance with higher token limit (16384) to avoid
   * truncation in large code generation tasks. Streams the response so the user
   * gets real-time feedback during generation. Returns the full concatenated result
   * for the caller to parse.
   */
  async answerWithCustomSystemPrompt(
    prompt: string,
    systemPrompt: string,
    params: IParams,
    imageBase64?: string
  ): Promise<string> {
    this.event.emit('onInference')
    this.currentAbortController = new AbortController()

    try {
      if (!this.model) {
        throw new DeepAgentError(
          'DeepAgent not initialized',
          DeepAgentErrorType.INITIALIZATION_FAILED
        )
      }

      const dappModel = createModelInstance(this.modelSelection)
      const fullPrompt = `${systemPrompt}\n\n---\n\nUser Request:\n${prompt}`

      let langchainMessages: any[]

      if (imageBase64) {
        langchainMessages = [
          new HumanMessage({
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: imageBase64.startsWith('data:') ? imageBase64 : `data:image/png;base64,${imageBase64}`
                }
              },
              { type: 'text', text: fullPrompt }
            ]
          })
        ]
      } else {
        langchainMessages = [new HumanMessage(fullPrompt)]
      }

      const timeoutMs = 120_000
      const timeoutSignal = AbortSignal.timeout(timeoutMs)
      const combinedController = this.currentAbortController!
      timeoutSignal.addEventListener('abort', () => combinedController.abort(), { once: true })

      const stream = await dappModel.stream(langchainMessages, {
        signal: combinedController.signal
      })

      let result = ''
      for await (const chunk of stream) {
        if (combinedController.signal.aborted) break

        let delta = ''
        if (typeof chunk.content === 'string') {
          delta = chunk.content
        } else if (Array.isArray(chunk.content)) {
          delta = chunk.content
            .map((c: any) => (typeof c === 'string' ? c : c.text || ''))
            .join('')
        }

        if (delta) {
          result += delta
          this.event.emit('onStreamResult', delta)
        }
      }

      this.event.emit('onInferenceDone')
      return result
    } catch (error: any) {
      this.event.emit('onInferenceDone')
      if (error?.name === 'AbortError' || this.currentAbortController?.signal.aborted) {
        return ''
      }
      console.error('[DeepAgent] answerWithCustomSystemPrompt error:', error?.message || error)
      throw error
    } finally {
      this.currentAbortController = null
    }
  }

  /**
   * Code completion method (not supported by DeepAgent, falls back)
   */
  async code_completion(prompt: string, context: string, ctxFiles: any, fileName: string, params: IParams): Promise<any> {
    console.warn('[DeepAgentInferencer] code_completion not supported, using fallback')
    if (this.fallbackInferencer) {
      return this.fallbackInferencer.code_completion(prompt, context, ctxFiles, fileName, params)
    }
    return ''
  }

  async code_insertion(msg_pfx: string, msg_sfx: string, ctxFiles: any, fileName: string, params: IParams): Promise<any> {
    console.warn('[DeepAgentInferencer] code_insertion not supported, using fallback')
    if (this.fallbackInferencer) {
      return this.fallbackInferencer.code_insertion(msg_pfx, msg_sfx, ctxFiles, fileName, params)
    }
    return ''
  }

  private async runAgent(messages: any[], _params: IParams): Promise<string> {
    this.currentAbortController = new AbortController()
    let fullResponse = ''

    // Filter out system messages - they're already set during agent creation
    const langchainMessages = messages
      .filter(msg => msg.role !== 'system')
      .map(msg => {
        if (msg.role === 'user') return new HumanMessage(msg.content)
        if (msg.role === 'assistant') return new AIMessage(msg.content)
        return new HumanMessage(msg.content)
      })

    try {
      // Reset stream event handler for new request
      this.streamEventHandler.reset()
      this.streamEventHandler.startInactivityTracking()

      // https://docs.langchain.com/oss/python/deepagents/streaming
      console.log('[DeepAgent-Thread] ▶ runAgent called | thread_id:', this.sessionThreadId, '| message:', String(langchainMessages[0]?.content || '').substring(0, 60) + '...')

      if (!this.agent) {
        throw new DeepAgentError(
          'DeepAgent not initialized',
          DeepAgentErrorType.INITIALIZATION_FAILED
        )
      }

      // Get LangSmith tracing callbacks if enabled
      const tracingCallbacks = langSmithTracing.getCallbacks()
      if (tracingCallbacks.length > 0) {
        console.log('[DeepAgent] LangSmith tracing enabled, adding callbacks')
      }

      const eventStream = this.agent.streamEvents(
        {
          messages: langchainMessages
        },
        {
          version: 'v2',
          configurable: {
            thread_id: this.sessionThreadId
          },
          subgraphs: true,
          signal: this.currentAbortController?.signal,
          callbacks: tracingCallbacks
        }
      )

      let finalMessageFromChain = ''
      for await (const event of eventStream) {
        if (this.currentAbortController?.signal.aborted) {
          this.event.emit('onStreamComplete', fullResponse)
          break
        }

        const result = this.streamEventHandler.processEvent(event)
        fullResponse += result.content
        if (result.finalMessage) {
          finalMessageFromChain = result.finalMessage
        }
      }

      // Use final message from chain if available and longer than accumulated chunks
      // This handles cases where streaming might miss some content
      if (finalMessageFromChain && finalMessageFromChain.length > fullResponse.length) {
        console.log('[DeepAgentInferencer] Using chain final message as it is more complete')
        fullResponse = finalMessageFromChain
      }

      // Flush any pending edit batches — this triggers the HITL modal immediately
      // after the agent finishes, so the user sees the combined diff right away
      await (this.filesystemBackend as any).flushAllPendingBatches()

      // Log final token usage summary
      this.streamEventHandler.logTokenSummary()

      console.log('[DeepAgentInferencer] Full response length:', fullResponse.length)
      return fullResponse
    } catch (error: any) {
      if (error?.name === 'AbortError' || this.currentAbortController?.signal.aborted) {
        console.log('[DeepAgentInferencer] Request cancelled by user')
        return fullResponse
      }

      // If ToolInputParsingException (stale multi-turn state), reset session and retry once
      if (error?.message?.includes('ToolInputParsingException') || error?.message?.includes('did not match expected schema')) {
        console.warn('[DeepAgentInferencer] Tool input schema error detected — resetting session thread and retrying...')
        console.warn('[DeepAgentInferencer] Error details:', error?.message)
        console.warn('[DeepAgentInferencer] Error cause:', error?.cause?.message || error?.cause)
        console.warn('[DeepAgentInferencer] Thread ID was:', this.sessionThreadId)
        this.resetSessionThread()

        // Retry with fresh thread_id (only once — if it fails again, propagate the error)
        try {
          this.currentAbortController = new AbortController()
          fullResponse = ''

          if (!this.agent) {
            throw new DeepAgentError(
              'DeepAgent not initialized',
              DeepAgentErrorType.INITIALIZATION_FAILED
            )
          }

          const retryStream = this.agent.streamEvents(
            { messages: langchainMessages },
            {
              version: 'v2',
              configurable: { thread_id: this.sessionThreadId },
              subgraphs: true,
              signal: this.currentAbortController?.signal,
              callbacks: langSmithTracing.getCallbacks()
            }
          )
          for await (const event of retryStream) {
            if (this.currentAbortController?.signal.aborted) break
            if (event.event === 'on_chat_model_stream' && event.data?.chunk?.content) {
              const content = typeof event.data.chunk.content === 'string'
                ? event.data.chunk.content
                : event.data.chunk.content.map((c: any) => c.text || '').join('')
              if (content) {
                fullResponse += content
                this.event.emit('onStreamResult', { content, isIntermediate: false, source: 'retry' })
              }
            }
          }
          await (this.filesystemBackend as any).flushAllPendingBatches()
          return fullResponse
        } catch (retryError: any) {
          console.error('[DeepAgentInferencer] Retry also failed:', retryError)
          throw retryError
        }
      }

      // Classify and handle API errors
      const { type: errorType, retryable, retryAfter } = classifyApiError(error)
      const userMessage = getErrorMessage(errorType, error, retryAfter)

      console.error(`[DeepAgentInferencer] Error during agent execution: ${errorType}`, error)

      // Emit API error event for UI handling
      this.event.emit('onApiError', {
        type: errorType,
        message: userMessage,
        retryable,
        retryAfter,
        originalError: error?.message,
        timestamp: Date.now()
      })

      // For recoverable errors, emit a friendly stream message and return
      if (errorType === DeepAgentErrorType.RATE_LIMIT_EXCEEDED ||
          errorType === DeepAgentErrorType.QUOTA_EXCEEDED ||
          errorType === DeepAgentErrorType.MODEL_OVERLOADED) {
        const errorMessage = `\n\n${userMessage}`
        this.event.emit('onStreamResult', {
          content: errorMessage,
          isIntermediate: false,
          source: 'error'
        })
        fullResponse += errorMessage
        return fullResponse
      }

      throw error
    } finally {
      this.streamEventHandler.stopInactivityTracking()
      this.currentAbortController = null
      this.event.emit('onToolCall', { toolName: '', toolInput: '', toolUIString: '', status: 'end' })
    }
  }

  private async createAgentWithTools(selectedTools: DynamicStructuredTool[]): Promise<void> {
    try {
      if (!this.model) {
        throw new DeepAgentError(
          'Model not initialized',
          DeepAgentErrorType.INITIALIZATION_FAILED
        )
      }

      const checkpointer = new IndexedDBCheckpointSaver()
      const generalTools = filterOutFileOperationTools(filterOutSpecialistTools(this.tools)) 

      // Create agent configuration with selected tools
      const agentConfig: CreateDeepAgentParams = {
        backend: this.filesystemBackend as any,
        tools: generalTools,
        model: this.model,
        systemPrompt: REMIX_DEEPAGENT_SYSTEM_PROMPT,
        skills: ["skills/"],
        checkpointer,
        middleware: [new RemixDeepAgentMiddleware()]
      }

      if (this.config.enableSubagents && this.model) {
        agentConfig.subagents = buildSubagentConfigs(
          this.tools,
          this.model,
          this.filesystemBackend
        )
      }

      if (this.memoryBackend) {
        agentConfig.store = this.memoryBackend as any
      }

      this.agent = await createDeepAgent(agentConfig as any)

      console.log(`[DeepAgentInferencer] Recreated agent with ${selectedTools.length} selected tools`)
    } catch (error) {
      console.error('[DeepAgentInferencer] Failed to recreate agent with selected tools:', error)
    }
  }

  /**
   * Update agent model based on auto selection
   */
  private async updateAgentModel(selectedModel: ModelSelection): Promise<void> {
    // Only recreate if the model has changed
    if (this.modelSelection.provider === selectedModel.provider &&
        this.modelSelection.modelId === selectedModel.modelId) {
      return
    }

    console.log(`[DeepAgentInferencer] Switching from ${this.modelSelection.provider}:${this.modelSelection.modelId} to ${selectedModel.provider}:${selectedModel.modelId}`)

    // Update current model selection
    this.modelSelection = selectedModel

    // Create new model instance
    this.model = createModelInstance(selectedModel)

    if (!this.agent) await this.createAgentWithTools(this.tools)
    else {
      this.agent.options.model = this.model
    }
  }

  /**
   * Handle errors with fallback strategy
   */
  private async handleError(error: any, method: string, prompt: string, params: IParams): Promise<string> {
    console.error(`[DeepAgentInferencer] Error in ${method}:`, error)

    const { type: errorType, retryable, retryAfter } = classifyApiError(error)
    const userMessage = getErrorMessage(errorType, error, retryAfter)

    console.log(`[DeepAgentInferencer] Error classified as: ${errorType}, retryable: ${retryable}, retryAfter: ${retryAfter}`)

    this.event.emit('onApiError', {
      type: errorType,
      message: userMessage,
      retryable,
      retryAfter,
      originalError: error?.message,
      timestamp: Date.now()
    })

    if (errorType === DeepAgentErrorType.RATE_LIMIT_EXCEEDED ||
        errorType === DeepAgentErrorType.QUOTA_EXCEEDED) {
      return `${userMessage}`
    }

    // Try fallback to RemoteInferencer for other errors
    if (this.fallbackInferencer) {
      console.log(`[DeepAgentInferencer] Falling back to RemoteInferencer for ${method}`)
      this.event.emit('deepAgentFallback', { method, error: error.message, errorType })

      try {
        switch (method) {
        case 'code_generation':
          return await this.fallbackInferencer.code_generation(prompt, params)
        case 'code_explaining':
          return await this.fallbackInferencer.code_explaining(prompt, '', params)
        case 'answer':
          return await this.fallbackInferencer.answer(prompt, params)
        case 'vulnerability_check':
          return await this.fallbackInferencer.vulnerability_check(prompt, params)
        default:
          return await this.fallbackInferencer.generate(prompt, params)
        }
      } catch (fallbackError: any) {
        console.error('[DeepAgentInferencer] Fallback also failed:', fallbackError)
        const fallbackClassification = classifyApiError(fallbackError)
        const fallbackMessage = getErrorMessage(fallbackClassification.type, fallbackError, fallbackClassification.retryAfter)
        return `${fallbackMessage}`
      }
    }

    return `${userMessage}`
  }

  cancelRequest(): void {
    if (this.currentAbortController) {
      console.log('[DeepAgentInferencer] Cancelling request...')
      this.resetSessionThread()
      this.currentAbortController.abort()
      this.currentAbortController = null
      this.event.emit('onInferenceDone')
    }
  }

  async close(): Promise<void> {
    if (this.memoryBackend) {
      this.memoryBackend.close()
    }
    if (this.approvalGate) {
      this.approvalGate.dispose()
      this.approvalGate = undefined
    }
    this.agent = null
    this.model = null
  }

  getEventEmitter(): EventEmitter {
    return this.event
  }

  isReady(): boolean {
    return this.agent !== null
  }

  setAutoMode(enabled: boolean): void {
    if (this.config.autoMode) {
      this.config.autoMode.enabled = enabled
      console.log(`[DeepAgentInferencer] Auto mode ${enabled ? 'enabled' : 'disabled'}`)
    }
  }

  isAutoModeEnabled(): boolean {
    return this.config.autoMode?.enabled || false
  }

  getCurrentModelInfo(): ModelSelection & { autoModeEnabled: boolean } {
    return {
      ...this.modelSelection,
      autoModeEnabled: this.isAutoModeEnabled()
    }
  }
}
