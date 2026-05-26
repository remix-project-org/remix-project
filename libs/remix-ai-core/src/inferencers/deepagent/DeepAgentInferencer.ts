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
import { IDeepAgentConfig, DeepAgentError, DeepAgentErrorType, ModelSelection, IUserApiKeyConfig, ApiKeyErrorEvent } from '../../types/deepagent'
import { ToolRegistry } from '../../remix-mcp-server/types/mcpTools'
import { classifyApiError, getErrorMessage } from './ApiErrorHandler'
import { aiErrorFromException } from '../../state/ai-error'
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
import { CONVERSATION_THREAD_PREFIX, DAPP_MAX_TOKENS } from '@remix/remix-ai-core'

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
  private userApiKeys?: IUserApiKeyConfig

  private static generateThreadId(): string {
    return CONVERSATION_THREAD_PREFIX + `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
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

    // The model selection MUST come from the caller (resolved from
    // /permissions \u2014 either the user's pick or assistantState.getDefaultModel()).
    // No literal fallback: if it's missing we have a wiring bug, not a
    // recoverable situation. Throw loudly so the regression is visible.
    if (!modelSelection || !modelSelection.provider || !modelSelection.modelId) {
      throw new Error(
        '[DeepAgentInferencer] modelSelection is required. ' +
        'Resolve it from assistantState.getDefaultModel() (or the user\'s explicit pick) ' +
        'after /permissions has loaded \u2014 no literal model defaults are allowed.'
      )
    }
    this.modelSelection = modelSelection

    // Default configuration (API key handled by proxy)
    this.config = {
      enabled: true,
      apiKey: 'proxy-handled', // Proxy server handles the API key
      userApiKeys: config?.userApiKeys,
      memoryBackend: config?.memoryBackend || 'store',
      maxToolExecutions: config?.maxToolExecutions || 10,
      timeout: config?.timeout || 300000, // 5 minutes
      enableSubagents: config?.enableSubagents !== false,
      enablePlanning: config?.enablePlanning !== false,
      // Auto Mode: caller decides on/off based on assistantState.isAutoModeEnabled().
      // No fallbackModel field \u2014 selectOptimalModel uses the current selection
      // and the structural Sonnet-substitution safety net in answer().
      autoMode: config?.autoMode || { enabled: false }
    }

    // Store user API keys for model creation
    this.userApiKeys = config?.userApiKeys

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

      this.model = createModelInstance(this.modelSelection, DAPP_MAX_TOKENS, this.userApiKeys)

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

  private emitApiKeyError(errorType: DeepAgentErrorType, error: any): void {
    if (!this.userApiKeys?.useOwnKeys) {
      return
    }

    let apiKeyErrorType: ApiKeyErrorEvent['errorType'] = 'invalid'
    switch (errorType) {
    case DeepAgentErrorType.AUTHENTICATION_FAILED:
      apiKeyErrorType = 'authentication_failed'
      break
    case DeepAgentErrorType.API_KEY_INVALID:
      apiKeyErrorType = 'invalid'
      break
    case DeepAgentErrorType.QUOTA_EXCEEDED:
      apiKeyErrorType = 'quota_exceeded'
      break
    case DeepAgentErrorType.RATE_LIMIT_EXCEEDED:
      apiKeyErrorType = 'rate_limited'
      break
    default:
      return // Don't emit for non-API key errors
    }

    const apiKeyError: ApiKeyErrorEvent = {
      provider: this.modelSelection.provider,
      errorType: apiKeyErrorType,
      message: getErrorMessage(errorType, error),
      canFallbackToProxy: true,
      originalError: error?.message,
      timestamp: Date.now()
    }

    console.log('[DeepAgentInferencer] Emitting API key error:', apiKeyError)
    this.event.emit('onApiKeyError', apiKeyError)
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

      // Resolve the live, backend-driven list of model ids the user is
      // allowed to use. Source of truth is the assistantState plugin's
      // `getAvailableModels()` (which reads `permissions.ai_models`).
      // The legacy `plugin.getAllowedModels()` reads `this.modelAccess`,
      // which nothing in the codebase ever populates — querying it returns
      // [] and makes us misclassify users as "no Anthropic permitted".
      const resolveAllowedIds = async (): Promise<string[]> => {
        try {
          const models = await (this.plugin as any).call?.('assistantState', 'getAvailableModels')
          if (Array.isArray(models)) {
            return models.filter((m: any) => m?.available).map((m: any) => m.id)
          }
        } catch { /* assistantState not active — fall through */ }
        // Last-resort legacy path. Almost certainly returns [].
        return (this.plugin as any).getAllowedModels?.() || []
      }

      if (this.config.autoMode?.enabled) {
        const allowed = await resolveAllowedIds()
        console.log('[DeepAgent.answer] autoMode=ENABLED', {
          currentModelSelection: this.modelSelection,
          allowedModels: allowed,
          allowedCount: allowed.length,
          allowedHasSonnet: allowed.some((m: string) => m.includes('sonnet'))
        })
        const optimalModel = selectOptimalModel(prompt, context, this.config.autoMode, this.modelSelection, allowed)
        console.log('[DeepAgent.answer] selectOptimalModel →', optimalModel)
        await this.updateAgentModel(optimalModel)
        console.log('[DeepAgent.answer] after updateAgentModel, this.modelSelection=', this.modelSelection)
      } else {
        console.log('[DeepAgent.answer] autoMode=DISABLED, using static model:', this.modelSelection)
      }

      // Structural safety net: the deepagents middleware injects content blocks
      // (memory, skills, filesystem state, optional cache_control breakpoints)
      // into every model call. ChatMistralAI's converter throws on any block
      // whose `type` is not "text" or "image_url" — manifesting as:
      //   `Mistral only supports types "text" or "image_url" for complex
      //    message types.`
      // So Mistral is structurally incompatible with the agent flow, regardless
      // of whether Auto Mode is on. If the active agent model is Mistral but
      // Sonnet (or any Anthropic model) is permitted for this user, swap to it
      // *before* runAgent fires the first model invocation.
      if (this.modelSelection.provider === 'mistralai') {
        const allowed = await resolveAllowedIds()
        const sonnetId = allowed.find((m: string) => m.includes('sonnet'))
          || allowed.find((m: string) => m.includes('claude'))
        if (sonnetId) {
          console.warn(
            `[DeepAgent.answer] Mistral cannot run with deepagents middleware; substituting Anthropic ${sonnetId}`
          )
          await this.updateAgentModel({ provider: 'anthropic', modelId: sonnetId })
        } else {
          // Hard-fail rather than burning tokens on a request that will stall
          // mid-stream when ChatMistralAI's converter trips on the first
          // non-text content block.
          throw new DeepAgentError(
            'DeepAgent requires an Anthropic model. The currently selected Mistral model cannot run the agent flow, and no Anthropic model is permitted for your plan. Please switch to a Claude model or disable DeepAgent.',
            DeepAgentErrorType.INVALID_REQUEST
          )
        }
      }

      const mcpContext = await this.gatherMCPResourcesContext(prompt)
      const enrichedContext = mcpContext
        ? (context ? `${mcpContext}\n\n${context}` : mcpContext)
        : context
      const messages = [
        { role: 'user', content: enrichedContext ? `Context:\n${enrichedContext}\n\nQuestion: ${prompt}` : prompt }
      ]

      // We MUST await runAgent so withAssistantGate sees rejections (and
      // gets the AIError envelope routed to assistantState → cooldown
      // banner / plan-manager / notice strip). Previous fire-and-forget
      // pattern emitted onApiError + onAgentError directly, which painted
      // the chat bubble twice and bypassed every gate.
      try {
        const response = await this.runAgent(messages, params)
        this.event.emit('onStreamComplete', response)
        this.event.emit('onInferenceDone')
        return response
      } catch (error: any) {
        this.event.emit('onInferenceDone')
        if (error?.name === 'AbortError' || error?.message?.includes('cancelled')) {
          console.log('[DeepAgentInferencer] Answer request was cancelled')
          return ''
        }
        console.error('[DeepAgentInferencer] Answer error:', error)

        // If the error carries a structured AIError envelope (or one
        // can be parsed out of it), stamp it on and propagate so
        // withAssistantGate can route through assistantState. NEVER emit
        // onApiError/onAgentError for envelope errors — those are owned
        // by the cooldown banner / plan-manager / notice strip.
        const envelope = aiErrorFromException(error)
        if (envelope && envelope.code !== 'INTERNAL_ERROR' && envelope.status > 0) {
          try {
            error.aiError = envelope
            if (!error.response) {
              error.response = { status: envelope.status, data: { error: envelope } }
            }
            if (typeof error.status !== 'number') error.status = envelope.status
            if (typeof error.message === 'string' && /^\d{3}\s+\{|API error occurred|Status\s+\d{3}[\s\S]*Body\s*:/i.test(error.message.trim())) {
              error.message = envelope.message
            }
          } catch { /* ignore */ }
          throw error
        }

        // Truly unstructured error — fall through to legacy UI handlers.
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
        this.emitErrorToTodos(new Error(userMessage))
        throw error
      }
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

      // If the error carries a backend AIError envelope, propagate it
      // unchanged so withAssistantGate / assistantState can route it
      // (notice strip + plan-manager hand-off). DO NOT emit onApiError —
      // that would cause the UI to dump the raw body into the chat bubble.
      const envelope = aiErrorFromException(error)
      if (envelope && envelope.code !== 'INTERNAL_ERROR' && envelope.status > 0) {
        try {
          error.aiError = envelope
          if (!error.response) {
            error.response = { status: envelope.status, data: { error: envelope } }
          }
          if (typeof error.status !== 'number') error.status = envelope.status
          if (typeof error.message === 'string' && /^\d{3}\s+\{|API error occurred|Status\s+\d{3}[\s\S]*Body\s*:/i.test(error.message.trim())) {
            error.message = envelope.message
          }
        } catch { /* ignore */ }
        throw error
      }

      // Classify and handle API errors
      const { type: errorType, retryable, retryAfter } = classifyApiError(error)
      const userMessage = getErrorMessage(errorType, error, retryAfter)

      console.error(`[DeepAgentInferencer] Error during agent execution: ${errorType}`, error)
      console.error('[DeepAgentInferencer] Original error message:', error)

      // Emit API error event for UI handling
      this.event.emit('onApiError', {
        type: errorType,
        message: userMessage,
        retryable,
        retryAfter,
        originalError: error?.message,
        timestamp: Date.now()
      })

      // Emit API key specific error for UI handling
      if (errorType === DeepAgentErrorType.AUTHENTICATION_FAILED ||
          errorType === DeepAgentErrorType.API_KEY_INVALID ||
          errorType === DeepAgentErrorType.QUOTA_EXCEEDED ||
          errorType === DeepAgentErrorType.RATE_LIMIT_EXCEEDED) {
        this.emitApiKeyError(errorType, error)
      }

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
      const hasSkillsPermission = await this.plugin.call('auth', 'hasPermission', 'ai:skills')
      // Create agent configuration with selected tools
      // Cast tools and model to any to handle @langchain/core version mismatch between root and deepagents
      const agentConfig: CreateDeepAgentParams = {
        backend: this.filesystemBackend as any,
        tools: [],
        model: this.model,
        systemPrompt: REMIX_DEEPAGENT_SYSTEM_PROMPT,
        skills: hasSkillsPermission ? ["skills/"] : [],
        checkpointer,
        middleware: [new RemixDeepAgentMiddleware(this.plugin)]
      }

      if (this.config.enableSubagents && this.model) {
        agentConfig.subagents = await buildSubagentConfigs(
          this.tools,
          this.model,
          this.filesystemBackend
        )
      }

      if (this.memoryBackend) {
        agentConfig.store = this.memoryBackend as any
      }

      // Cast result to any to handle @langchain/core version mismatch between root and deepagents
      this.agent = await createDeepAgent(agentConfig as any) as any

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
    this.model = createModelInstance(selectedModel, DAPP_MAX_TOKENS, this.userApiKeys)

    if (!this.agent) await this.createAgentWithTools(this.tools)
    else {
      this.agent.options.model = this.model
    }
  }

  /**
   * Handle errors with fallback strategy.
   *
   * IMPORTANT: when the underlying error is a backend AIError envelope
   * (FEATURE_DENIED / PROVIDER_DENIED / EMAIL_NOT_VERIFIED / RATE_LIMITED /
   * IP_BLOCKED / ABUSE_BLOCKED / BAD_REQUEST / ...), we MUST NOT
   *   - emit `onApiError` (UI handler would dump the raw body into the chat bubble), or
   *   - fall back to RemoteInferencer (it will hit the same envelope error again).
   * Instead we re-throw the error with the envelope stamped on it so
   * `withAssistantGate` can route it through assistantState and the
   * notice strip / plan-manager hand-off render the right thing.
   */
  private async handleError(error: any, method: string, prompt: string, params: IParams): Promise<string> {
    console.error(`[DeepAgentInferencer] Error in ${method}:`, error)

    // Try to extract a structured AIError envelope first.
    const envelope = aiErrorFromException(error)
    const isBackendEnvelope = envelope && envelope.code && envelope.code !== 'INTERNAL_ERROR' && envelope.status > 0
    if (isBackendEnvelope) {
      try {
        error.aiError = envelope
        if (!error.response) {
          error.response = { status: envelope.status, data: { error: envelope } }
        }
        if (typeof error.status !== 'number') error.status = envelope.status
        // Replace the noisy "<status> {body}" message with the envelope's message.
        // Also matches Mistral SDK's "API error occurred: Status NNN ... Body: {json}" shape.
        if (typeof error.message === 'string' && /^\d{3}\s+\{|API error occurred|Status\s+\d{3}[\s\S]*Body\s*:/i.test(error.message.trim())) {
          error.message = envelope.message
        }
      } catch { /* read-only error object — ignore */ }
      throw error
    }

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

    // Emit API key specific error for UI handling
    if (errorType === DeepAgentErrorType.AUTHENTICATION_FAILED ||
        errorType === DeepAgentErrorType.API_KEY_INVALID ||
        errorType === DeepAgentErrorType.QUOTA_EXCEEDED ||
        errorType === DeepAgentErrorType.RATE_LIMIT_EXCEEDED) {
      this.emitApiKeyError(errorType, error)
    }

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
        // If the fallback failed with a backend envelope, propagate it so the
        // gate can react instead of dumping the raw body into the chat.
        const fbEnvelope = aiErrorFromException(fallbackError)
        if (fbEnvelope && fbEnvelope.code !== 'INTERNAL_ERROR' && fbEnvelope.status > 0) {
          try {
            fallbackError.aiError = fbEnvelope
            if (!fallbackError.response) {
              fallbackError.response = { status: fbEnvelope.status, data: { error: fbEnvelope } }
            }
            if (typeof fallbackError.message === 'string' && /^\d{3}\s+\{|API error occurred|Status\s+\d{3}[\s\S]*Body\s*:/i.test(fallbackError.message.trim())) {
              fallbackError.message = fbEnvelope.message
            }
          } catch { /* ignore */ }
          throw fallbackError
        }
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

      // Reset QuickDapp dashboard processing state on cancellation.
      // Without this, cancelling mid-generation leaves the dashboard spinner stuck.
      try {
        this.plugin.emit('generationProgress', null)
        this.plugin.emit('dappGenerationError', {
          slug: undefined,
          error: 'Generation cancelled by user'
        })
      } catch (_) { /* best-effort cleanup */ }
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
