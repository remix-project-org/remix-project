import { remixAILogger } from '../../helpers/logger'
/**
 * DeepAgent Inferencer for Remix IDE
 * Integrates LangChain DeepAgent with Remix's AI system
 */

import { createDeepAgent, createPatchToolCallsMiddleware, CreateDeepAgentParams } from 'deepagents'
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
import { HumanMessage, AIMessage, SystemMessage, BaseMessage } from '@langchain/core/messages'
import type { DynamicStructuredTool } from '@langchain/core/tools'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { IndexedDBCheckpointSaver } from '../../storage/IndexedDBCheckpointSaver'
import type { DeepAgent } from 'deepagents'
import { RemixDeepAgentMiddleware } from './deepAgentMiddleWare'

import './AsyncLocalStorageInit'
import { createModelInstance } from './ModelFactory'
import { syncModelCatalog } from './helpers/modelCatalog'
import { z } from 'zod'
import { generateStructured, StructuredOutputOptions } from '../../helpers/structuredOutput'
import { SecurityCheckSchema } from '../../types/schemas'
import { getLangfuseCallbackHandler, flushLangfuse } from '../../helpers/langfuse'
import { setCurrentSessionId } from './helpers/runContext'
import { setResolvedModelListener } from './helpers/resolvedModel'
import { buildSubagentConfigs } from './SubagentConfig'
import { resolveHarnessProfile, applyHarnessToolRules } from './harnessProfiles'
import { StreamEventHandler } from './StreamEventHandler'
import { InactivityTimeoutManager } from './InactivityTimeoutManager'
import { CONVERSATION_THREAD_PREFIX, DAPP_MAX_TOKENS } from '@remix/remix-ai-core'
import { Features } from '@remix-api'
import { flattenJSON, renderTree, toAbsolutePath } from './helpers/project'
import { clearAllQuickDappWorkspaceLocks } from '@remix-ui/helper'
import { clearAllQuickDappGenerationContexts } from '../../helpers/quickDappGenerationContext'
import { clearQuickDappDocsContext } from '../../helpers/quickDappDocsContext'

/**
 * Whether a model is fit for code generation is now read from the backend
 * catalogue's `capabilities` array via `modelSupportsCodeGeneration`, and the
 * replacement model from `permissions.task_models` — see
 * `helpers/modelCatalog`. The previous client-side family blacklist
 * (`notSuitableForCodeGeneration`) went stale on every catalogue change and
 * treated each newly added weak model as suitable until someone noticed.
 */

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
  /** Model-independent agent pieces, built once and reused across model swaps. */
  private checkpointer: IndexedDBCheckpointSaver | null = null
  private hasSkillsPermission: boolean | null = null
  private fallbackInferencer: any = null
  private model: BaseChatModel | null = null
  private modelSelection: ModelSelection
  private mcpInferencer: any = null
  private allowedModels: string[] = []
  private sessionThreadId: string = DeepAgentInferencer.generateThreadId()
  private streamEventHandler: StreamEventHandler
  /** Last model reported to the UI; `auto` can change it between requests. */
  private lastReportedModel: string | null = null
  private userApiKeys?: IUserApiKeyConfig
  // Conversation history to seed into the agent on the next answer() call.
  // Used after a cancel-and-reinitialize so the brand-new LangGraph thread
  // still has the prior user/assistant turns as context — otherwise the
  // model loses all memory whenever the user clicks Stop.
  private pendingHistoryMessages: Array<{ role: 'user' | 'assistant'; content: string }> | null = null

  private static generateThreadId(): string {
    return CONVERSATION_THREAD_PREFIX + `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
  }

  // ───────────────────────────────────────────────────────────────────────
  // TEMP GC PROBE — remove after investigation.
  // Tracks how many instances are alive vs. finalized so we can see whether
  // old instances are actually reclaimed after enable()/reinitialize() swaps.
  // Set to true to enable [DeepAgent-GC] console lines (instance lifecycle tracing).
  static __gcLogging = false

  private static __instanceSeq = 0
  private static __liveCount = 0
  private static __finalizedCount = 0
  private static readonly __FinalizationRegistryCtor: any = (globalThis as any).FinalizationRegistry
  private static readonly __finalizationRegistry =
    DeepAgentInferencer.__FinalizationRegistryCtor
      ? new DeepAgentInferencer.__FinalizationRegistryCtor((label: string) => {
        DeepAgentInferencer.__finalizedCount++
        DeepAgentInferencer.__liveCount--
        // eslint-disable-next-line no-console
        if (DeepAgentInferencer.__gcLogging) console.log(
          `[DeepAgent-GC] ♻️ FINALIZED ${label} | live=${DeepAgentInferencer.__liveCount} finalized=${DeepAgentInferencer.__finalizedCount}`
        )
      })
      : null

  private __instanceId = ++DeepAgentInferencer.__instanceSeq
  private __closed = false

  /** TEMP: read current live/finalized counts from the console. */
  static __gcStats(): { live: number; finalized: number; created: number } {
    return {
      live: DeepAgentInferencer.__liveCount,
      finalized: DeepAgentInferencer.__finalizedCount,
      created: DeepAgentInferencer.__instanceSeq
    }
  }

  // To inspect GC stats from DevTools, run:
  //   import('@remix/remix-ai-core').then(m => m.DeepAgentInferencer.__gcStats())
  // or temporarily set DeepAgentInferencer.__gcLogging = true in the console.

  private resetSessionThread(): void {
    const oldId = this.sessionThreadId
    this.sessionThreadId = DeepAgentInferencer.generateThreadId()
    remixAILogger.log('[DeepAgent-Thread] resetSessionThread:', this.sessionThreadId, '(was:', oldId, ')')
  }

  setSessionThreadId(threadId: string): void {
    remixAILogger.log('[DeepAgent-Thread] setSessionThreadId:', threadId, '(was:', this.sessionThreadId, ')')
    this.sessionThreadId = threadId
  }

  /**
   * Stash a list of user/assistant messages to be prepended on the next
   * answer() call. Used by the cancel-and-reinit flow so a freshly-built
   * LangGraph thread still has the prior conversation context even though
   * its checkpointer is empty (the old, possibly-mid-stream checkpoint
   * was discarded along with the previous inferencer instance).
   *
   * One-shot: cleared as soon as it's consumed by answer().
   */
  setPendingHistoryMessages(messages: Array<{ role: 'user' | 'assistant'; content: string }> | null): void {
    if (!messages || messages.length === 0) {
      this.pendingHistoryMessages = null
      return
    }
    // Defensive copy + filter to the only two roles the graph accepts.
    this.pendingHistoryMessages = messages
      .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim().length > 0)
      .map(m => ({ role: m.role, content: m.content }))
    remixAILogger.log('[DeepAgentInferencer] setPendingHistoryMessages: queued', this.pendingHistoryMessages.length, 'messages for next turn')
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
    this.streamEventHandler = new StreamEventHandler(this.event, () => this.sessionThreadId)

    // The OpenRouter transport reports the model that actually served each
    // request — the only way to know what `auto` picked.
    setResolvedModelListener(model => {
      if (model === this.lastReportedModel) return
      this.lastReportedModel = model
      this.event.emit('onModelUsed', { model, threadId: this.sessionThreadId })
    })

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

    // TEMP GC PROBE — register this instance so we get a console line when
    // the GC actually reclaims it. The held value is just a string label
    // (must NOT reference `this`, or it would keep the instance alive).
    const label = `#${this.__instanceId} thread=${this.sessionThreadId}`
    DeepAgentInferencer.__liveCount++
    DeepAgentInferencer.__finalizationRegistry?.register(this, label, this)
    // eslint-disable-next-line no-console
    if (DeepAgentInferencer.__gcLogging) console.log(`[DeepAgent-GC] 🆕 CREATED ${label} | live=${DeepAgentInferencer.__liveCount} created=${DeepAgentInferencer.__instanceSeq}`)
  }

  async initialize(): Promise<void> {
    try {
      await this.logInitDiagnostics()

      // Mirror the backend catalogue before building anything — it carries
      // each model's token budget / temperature, which ModelFactory reads.
      await syncModelCatalog(this.plugin)
      this.model = await createModelInstance(this.modelSelection, DAPP_MAX_TOKENS, this.userApiKeys)

      if (this.config.memoryBackend === 'store') {
        this.memoryBackend = new DeepAgentMemoryBackend('remix-deepagent-memory')
        await this.memoryBackend.init()
      }

      await this.createAgentWithTools(this.tools)
    } catch (error: any) {
      remixAILogger.error('[DeepAgentInferencer] Initialization failed:', error)
      throw new DeepAgentError(
        `Failed to initialize DeepAgent: ${error?.message || error}`,
        DeepAgentErrorType.INITIALIZATION_FAILED,
        error
      )
    }
  }

  private async logInitDiagnostics(): Promise<void> {
    try {
      const pluginAny = this.plugin as any
      const snapshot = await pluginAny.call?.('assistantState', 'getSnapshot')
      const features = snapshot?.permissions?.features as Record<string, { is_enabled?: boolean }> | undefined

      const hasBasicMcp = features?.[Features.MCP_BASIC_EXTERNAL]?.is_enabled === true
      const configuredServers = Array.isArray(pluginAny?.mcpServers)
        ? pluginAny.mcpServers.map((s: any) => s?.name).filter(Boolean)
        : []
      const connectedServers = this.mcpInferencer?.getConnectedServers?.() || []

      let availableExternalToolCount = -1
      if (this.mcpInferencer?.getAvailableToolsForLLM) {
        try {
          const externalTools = await this.mcpInferencer.getAvailableToolsForLLM()
          availableExternalToolCount = Array.isArray(externalTools) ? externalTools.length : -1
        } catch {
          availableExternalToolCount = -1
        }
      }

      remixAILogger.log('[DeepAgentInferencer][InitDiagnostics]', {
        isAuthenticated: !!snapshot?.isAuthenticated,
        permissionsState: snapshot?.permissionsState || 'unknown',
        hasPermissionsPayload: !!snapshot?.permissions,
        hasBasicMcp,
        selectedModel: this.modelSelection,
        configuredServerCount: configuredServers.length,
        configuredServers,
        connectedServerCount: connectedServers.length,
        connectedServers,
        availableExternalToolCount
      })
    } catch (error: any) {
      remixAILogger.warn('[DeepAgentInferencer][InitDiagnostics] Failed to collect diagnostics:', error?.message || error)
    }
  }

  private async initializeTools(toolRegistry: ToolRegistry, mcpInferencer?: any): Promise<void> {
    try {
      this.tools = await createRemixTools(this.plugin, toolRegistry, mcpInferencer, this.approvalGate)
      remixAILogger.log(`[DeepAgentInferencer] Initialized ${this.tools.length} tools`)
    } catch (error) {
      remixAILogger.warn('[DeepAgentInferencer] Failed to initialize tools:', error)
      this.tools = []
    }
  }

  cleanup(): void {
    this.plugin.off('filePanel', 'setWorkspace')
  }

  private emitErrorToTodos(error: any): void {
    const errorMessage = error?.message || String(error) || 'Unknown error'

    this.event.emit('onAgentError', {
      message: errorMessage,
      timestamp: Date.now(),
      type: error?.name || 'Error',
      threadId: this.sessionThreadId
    })

    this.event.emit('onTodoError', {
      error: errorMessage,
      timestamp: Date.now(),
      threadId: this.sessionThreadId
    })

    remixAILogger.log('[DeepAgentInferencer] Emitted error to todos:', errorMessage)
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
      // Bedrock has no proxy route (BYOK-only), so never offer the switch.
      canFallbackToProxy: (this.modelSelection.routeProvider ?? this.modelSelection.provider) !== 'bedrock',
      originalError: error?.message,
      timestamp: Date.now()
    }

    remixAILogger.log('[DeepAgentInferencer] Emitting API key error:', apiKeyError)
    this.event.emit('onApiKeyError', apiKeyError)
  }

  async code_generation(prompt: string, params: IParams): Promise<string | null> {
    this.event.emit('onInference')

    try {
      if (!this.agent) {
        throw new DeepAgentError(
          'DeepAgent not initialized',
          DeepAgentErrorType.INITIALIZATION_FAILED
        )
      }

      // Build messages
      const messages = [
        { role: 'system', content: REMIX_DEEPAGENT_SYSTEM_PROMPT + '\n\n' + SOLIDITY_CODE_GENERATION_PROMPT },
        { role: 'user', content: prompt }
      ]

      // Run the agent
      const response = await this.runAgent(messages)

      this.event.emit('onInferenceDone')
      return response
    } catch (error) {
      this.event.emit('onInferenceDone')
      return await this.handleError(error, 'code_generation', prompt, params)
    }
  }

  async code_explaining(prompt: string, context: string, params: IParams): Promise<string | null> {
    this.event.emit('onInference')

    try {
      if (!this.agent) {
        throw new DeepAgentError(
          'DeepAgent not initialized',
          DeepAgentErrorType.INITIALIZATION_FAILED
        )
      }

      const messages = [
        { role: 'system', content: REMIX_DEEPAGENT_SYSTEM_PROMPT + '\n\n' + CODE_EXPLANATION_PROMPT },
        { role: 'user', content: `Context:\n${context}\n\nQuestion: ${prompt}` }
      ]

      const response = await this.runAgent(messages)

      this.event.emit('onInferenceDone')
      return response
    } catch (error) {
      this.event.emit('onInferenceDone')
      return await this.handleError(error, 'code_explaining', prompt, params)
    }
  }

  async answer(prompt: string, params: IParams, context?: string): Promise<string | null> {
    this.event.emit('onInference')

    try {
      if (!this.agent) {
        remixAILogger.error('[DeepAgent] answer() FAILED: agent is null/undefined!')
        throw new DeepAgentError(
          'DeepAgent not initialized',
          DeepAgentErrorType.INITIALIZATION_FAILED
        )
      }

      remixAILogger.log('[DeepAgent.answer] model:', this.modelSelection)

      const seeded = this.pendingHistoryMessages || []
      this.pendingHistoryMessages = null
      if (seeded.length > 0) {
        remixAILogger.log('[DeepAgentInferencer] answer(): seeding', seeded.length, 'history messages into new thread', this.sessionThreadId)
      }
      const messages = [
        ...seeded,
        { role: 'user', content: context ? `Context:\n${context}\n\nQuestion: ${prompt}` : prompt }
      ]

      try {
        const response = await this.runAgent(messages)
        this.event.emit('onStreamComplete', response)
        this.event.emit('onInferenceDone')
        return response
      } catch (error: any) {
        if (error?.name === 'AbortError' || error?.message?.includes('cancelled')) {
          this.event.emit('onInferenceDone')
          remixAILogger.log('[DeepAgentInferencer] Answer request was cancelled')
          return ''
        }

        this.event.emit('onInferenceDone')
        remixAILogger.error('[DeepAgentInferencer] Answer error:', error)
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
      remixAILogger.error(`[DeepAgentInferencer] Error in answer method:`, error)
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

  async vulnerability_check(prompt: string, params: IParams): Promise<string | null> {
    this.event.emit('onInference')

    try {
      if (!this.agent) {
        throw new DeepAgentError(
          'DeepAgent not initialized',
          DeepAgentErrorType.INITIALIZATION_FAILED
        )
      }

      // A security check is a single read-only analysis — no tools needed — so
      // constrain the model to the SecurityCheck shape (Answer/Reason/Suggestion)
      // that `SecurityAgent.processFile` consumes. Callers `JSON.parse` the
      // string result, so we stringify the validated object. Falls back to the
      // free-form agent run if the model can't do structured output.
      if (this.model) {
        try {
          const structuredMessages: BaseMessage[] = [
            new SystemMessage(REMIX_DEEPAGENT_SYSTEM_PROMPT + '\n\n' + SECURITY_ANALYSIS_PROMPT),
            new HumanMessage(prompt)
          ]
          const result = await generateStructured(this.model, SecurityCheckSchema, structuredMessages, { name: 'security_check' })
          this.event.emit('onInferenceDone')
          return JSON.stringify(result)
        } catch (structuredError) {
          remixAILogger.warn('[DeepAgentInferencer] structured vulnerability_check failed, falling back to agent run', structuredError)
        }
      }

      const messages = [
        { role: 'system', content: REMIX_DEEPAGENT_SYSTEM_PROMPT + '\n\n' + SECURITY_ANALYSIS_PROMPT },
        { role: 'user', content: prompt }
      ]

      const response = await this.runAgent(messages)

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
    remixAILogger.warn('[DeepAgentInferencer] code_completion not supported, using fallback')
    if (this.fallbackInferencer) {
      return this.fallbackInferencer.code_completion(prompt, context, ctxFiles, fileName, params)
    }
    return ''
  }

  async code_insertion(msg_pfx: string, msg_sfx: string, ctxFiles: any, fileName: string, params: IParams): Promise<any> {
    remixAILogger.warn('[DeepAgentInferencer] code_insertion not supported, using fallback')
    if (this.fallbackInferencer) {
      return this.fallbackInferencer.code_insertion(msg_pfx, msg_sfx, ctxFiles, fileName, params)
    }
    return ''
  }

  async basic_inference(prompt: string, systemPrompt?: string): Promise<string> {
    if (!this.model) {
      throw new DeepAgentError(
        'Model not initialized',
        DeepAgentErrorType.INITIALIZATION_FAILED
      )
    }

    const messages: BaseMessage[] = []
    if (systemPrompt) messages.push(new SystemMessage(systemPrompt))
    messages.push(new HumanMessage(prompt))

    const response = await this.model.invoke(messages)
    const content = response?.content
    if (typeof content === 'string') return content
    if (Array.isArray(content)) {
      return content
        .map((part: any) => (typeof part === 'string' ? part : part?.text ?? ''))
        .join('')
    }
    return content == null ? '' : String(content)
  }

  /**
   * Schema-constrained one-shot inference — the structured sibling of
   * basic_inference.
   *
   * Deliberately prompt-agnostic: callers supply both the schema and the
   * prompts, so no feature vocabulary leaks into the inferencer.
   *
   * Note it does NOT emit onInference/onInferenceDone. Those paint the chat
   * panel's thinking state and trip the "assistant busy" guards in the UI;
   * this method exists for one-shot calls behind a button (e.g. audit-category
   * matching from a modal), which are not chat turns.
   */
  async structured_inference<T>(
    schema: z.ZodType<T>,
    prompt: string,
    systemPrompt?: string,
    opts?: StructuredOutputOptions
  ): Promise<T> {
    if (!this.model) {
      throw new DeepAgentError(
        'Model not initialized',
        DeepAgentErrorType.INITIALIZATION_FAILED
      )
    }

    const messages: BaseMessage[] = []
    if (systemPrompt) messages.push(new SystemMessage(systemPrompt))
    messages.push(new HumanMessage(prompt))

    return await generateStructured(this.model, schema, messages, { maxRepairs: 1, ...opts })
  }

  private async runAgent(messages: any[]): Promise<string> {
    const thisRunControllers = new Set<AbortController>()
    const localAbortController = new AbortController()
    thisRunControllers.add(localAbortController)
    this.currentAbortController = localAbortController
    let fullResponse = ''

    const runTimeoutMs = this.config.timeout
    const stallTimeout = new InactivityTimeoutManager(runTimeoutMs, () => {
      remixAILogger.warn(`[DeepAgentInferencer] no stream activity for ${runTimeoutMs}ms — aborting`)
      localAbortController.abort(new DOMException(`Agent run stalled: no activity for ${runTimeoutMs}ms.`, 'TimeoutError'))
    })
    stallTimeout.reset()

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
      this.lastReportedModel = null
      this.streamEventHandler.startInactivityTracking()

      // https://docs.langchain.com/oss/python/deepagents/streaming
      remixAILogger.log('[DeepAgent-Thread] ▶ runAgent called | thread_id:', this.sessionThreadId, '| message:', String(langchainMessages[0]?.content || '').substring(0, 60) + '...')

      if (!this.agent) {
        throw new DeepAgentError(
          'DeepAgent not initialized',
          DeepAgentErrorType.INITIALIZATION_FAILED
        )
      }

      // Identity for this run: Langfuse traces and the OpenRouter
      // `session_id` / `user` fields both key off it.
      setCurrentSessionId(this.sessionThreadId)

      // Attach Langfuse tracing (no-op when disabled/unconfigured).
      const langfuseHandler = await getLangfuseCallbackHandler({
        sessionId: this.sessionThreadId,
        metadata: {
          threadId: this.sessionThreadId,
          provider: this.modelSelection.provider,
          model: this.modelSelection.modelId
        }
      })

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
          signal: localAbortController.signal,
          ...(langfuseHandler ? { callbacks: [langfuseHandler]} : {})
        }
      )

      let finalMessageFromChain = ''
      for await (const event of eventStream) {
        // Any event — a reasoning delta included — counts as progress.
        stallTimeout.reset()
        if (localAbortController.signal.aborted) {
          this.event.emit('onStreamComplete', { content: fullResponse, threadId: this.sessionThreadId })
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
        remixAILogger.log('[DeepAgentInferencer] Using chain final message as it is more complete')
        fullResponse = finalMessageFromChain
      }

      // Flush any pending edit batches — this triggers the HITL modal immediately
      if (localAbortController.signal.aborted) {
        this.cancelPendingApprovals()
        return fullResponse
      }
      await (this.filesystemBackend as any).flushAllPendingBatches()

      // Log final token usage summary
      this.streamEventHandler.logTokenSummary()

      remixAILogger.log('[DeepAgentInferencer] Full response length:', fullResponse.length)
      return fullResponse
    } catch (caught: any) {
      console.error('[DeepAgentInferencer] Error in runAgent:', caught)
      // Every abort used to be read as "the user cancelled", so a run that
      // timed out or died on a transport abort silently returned whatever
      // partial text it had — indistinguishable from a deliberate stop.
      const abortReason: any = localAbortController.signal.aborted
        ? localAbortController.signal.reason
        : undefined
      if (abortReason?.name === 'TimeoutError') {
        throw new DeepAgentError(
          abortReason.message || `Agent run stalled: no activity for ${runTimeoutMs}ms.`,
          DeepAgentErrorType.REQUEST_TIMEOUT,
          caught
        )
      }
      if (caught?.name === 'AbortError' || localAbortController.signal.aborted) {
        remixAILogger.log('[DeepAgentInferencer] Request cancelled by user')
        return fullResponse
      }

      // Not our abort. `Error("Abort")` has exactly one source in LangGraph
      // (`PregelRunner._executeTasksWithRetry`): a superstep starting while
      // the composed abort signal is already aborted. That composed signal
      // includes the runner's *exception* signal, which fires as soon as any
      // node throws — so a node failure races the graph into an abort and the
      // real cause (a 402, an upstream API error, a tool crash) is replaced by
      // this meaningless message. The stream carried the real error on an
      // *_error event; swap it back in so the classification below sees it.
      let error: any = caught
      if (caught?.message === 'Abort') {
        const streamError = this.streamEventHandler.getStreamError()
        if (streamError) {
          remixAILogger.warn('[DeepAgentInferencer] graph aborted after a node error — reporting the cause', streamError)
          error = streamError instanceof Error
            ? streamError
            : Object.assign(new Error(String(streamError?.message ?? streamError)), streamError)
        } else {
          // No node error was recorded, so the cause is genuinely lost. A bare
          // `Error("Abort")` in the trace tells nobody anything — attach what
          // we do know (model, thread, how far the stream got) so these are
          // triageable, and keep the original as `cause`.
          const streamed = fullResponse.length
          error = Object.assign(
            new Error(
              `The agent run stopped unexpectedly (model ${this.modelSelection.modelId}, ` +
              `thread ${this.sessionThreadId}, ${streamed} chars streamed). No underlying error was reported.`
            ),
            { cause: caught, name: 'AgentAbortError' }
          )
          remixAILogger.warn('[DeepAgentInferencer] graph aborted with no recorded node error', {
            model: this.modelSelection.modelId,
            thread: this.sessionThreadId,
            streamedChars: streamed
          })
        }
      }

      // If ToolInputParsingException (stale multi-turn state), reset session and retry once
      if (error?.message?.includes('ToolInputParsingException') || error?.message?.includes('did not match expected schema')) {
        remixAILogger.warn('[DeepAgentInferencer] Tool input schema error detected — resetting session thread and retrying...')
        remixAILogger.warn('[DeepAgentInferencer] Error details:', error?.message)
        remixAILogger.warn('[DeepAgentInferencer] Error cause:', error?.cause?.message || error?.cause)
        remixAILogger.warn('[DeepAgentInferencer] Thread ID was:', this.sessionThreadId)
        this.resetSessionThread()

        // Retry with fresh thread_id (only once — if it fails again, propagate the error)
        try {
          const retryAbortController = new AbortController()
          thisRunControllers.add(retryAbortController)
          this.currentAbortController = retryAbortController
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
              signal: retryAbortController.signal
            }
          )
          for await (const event of retryStream) {
            if (retryAbortController.signal.aborted) break
            if (event.event === 'on_chat_model_stream' && event.data?.chunk?.content) {
              const content = typeof event.data.chunk.content === 'string'
                ? event.data.chunk.content
                : event.data.chunk.content.map((c: any) => c.text || '').join('')
              if (content) {
                fullResponse += content
                this.event.emit('onStreamResult', { content, isIntermediate: false, source: 'retry', threadId: this.sessionThreadId })
              }
            }
          }
          if (retryAbortController.signal.aborted) {
            this.cancelPendingApprovals()
            return fullResponse
          }
          await (this.filesystemBackend as any).flushAllPendingBatches()
          return fullResponse
        } catch (retryError: any) {
          remixAILogger.error('[DeepAgentInferencer] Retry also failed:', retryError)
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

      remixAILogger.error(`[DeepAgentInferencer] Error during agent execution: ${errorType}`, error)
      remixAILogger.error('[DeepAgentInferencer] Original error message:', error)

      // Emit API error event for UI handling
      this.event.emit('onApiError', {
        type: errorType,
        message: userMessage,
        retryable,
        retryAfter,
        originalError: error?.message,
        timestamp: Date.now(),
        threadId: this.sessionThreadId
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
          source: 'error',
          threadId: this.sessionThreadId
        })
        fullResponse += errorMessage
        return fullResponse
      }

      throw error
    } finally {
      stallTimeout.clear()
      clearQuickDappDocsContext()
      // Best-effort trace delivery: the SDK drains only a slice of its queue
      // per tick, so the tail of this run's trace needs an explicit push.
      void flushLangfuse()
      this.streamEventHandler.stopInactivityTracking()
      // Only null out if still one of this run's controllers (a new request might have started)
      if (this.currentAbortController && thisRunControllers.has(this.currentAbortController)) {
        this.currentAbortController = null
      }
      this.event.emit('onToolCall', { toolName: '', toolInput: '', toolUIString: '', status: 'end', threadId: this.sessionThreadId })
    }
  }

  public async getProjectStructure(): Promise<string> {
    if (!this.mcpInferencer) {
      return ''
    }

    try {
      const connectedServers = this.mcpInferencer.getConnectedServers()
      if (!connectedServers || !connectedServers.includes('Remix IDE Server')) {
        return ''
      }

      const mcpClient = (this.mcpInferencer as any).mcpClients?.get('Remix IDE Server')
      if (!mcpClient || !mcpClient.isConnected()) {
        return ''
      }

      const content = await mcpClient.readResource('project://structure')

      if (!content?.text) {
        return ''
      }

      const context = JSON.parse(content.text || '{}')
      const flatten = renderTree(context.structure)
      // Absolute, like every path the filesystem tools take.
      const openedFiles = Object.keys(context?.currentOpenedFiles || {})
        .map(toAbsolutePath)
        .join(', ')

      return `\n\n## Current Project Structure\n${flatten}\n\n## Current Opened Files\n${openedFiles ? openedFiles: 'no opened files'}`
    } catch (error) {
      remixAILogger.warn('[DeepAgentInferencer] Failed to get project structure:', error)
      return ''
    }
  }

  public async getCompilerConfig(): Promise<string> {
    console.log('[DeepAgentInferencer] Attempting to retrieve compiler config from MCP...')
    if (!this.mcpInferencer) {
      return ''
    }

    try {
      const connectedServers = this.mcpInferencer.getConnectedServers()
      if (!connectedServers || !connectedServers.includes('Remix IDE Server')) {
        return ''
      }

      const mcpClient = (this.mcpInferencer as any).mcpClients?.get('Remix IDE Server')
      if (!mcpClient || !mcpClient.isConnected()) {
        return ''
      }

      const content = await mcpClient.readResource('compilation://config')

      if (!content?.text) {
        return ''
      }

      return `\n\n## Current Compiler Config\n${flattenJSON(JSON.parse(content.text))}`
    } catch (error) {
      remixAILogger.warn('[DeepAgentInferencer] Failed to get compiler config:', error)
      return ''
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

      // Both of these are independent of the model, so a model swap must not
      // rebuild them: the checkpointer owns an IndexedDB connection, and the
      // permission is a plugin round-trip.
      if (!this.checkpointer) this.checkpointer = new IndexedDBCheckpointSaver()
      if (this.hasSkillsPermission === null) {
        this.hasSkillsPermission = await (async () => {
          try {
            return !!(await (this.plugin as any).call?.('assistantState', 'hasFeature', Features.AI_SKILLS))
          } catch {
            return false
          }
        })()
      }
      const checkpointer = this.checkpointer
      const hasSkillsPermission = this.hasSkillsPermission
      const harnessProfile = resolveHarnessProfile(this.modelSelection)

      // Create agent configuration with selected tools
      const agentConfig: CreateDeepAgentParams = {
        backend: this.filesystemBackend as any,
        tools: [],
        model: this.model,
        systemPrompt: {
          base: REMIX_DEEPAGENT_SYSTEM_PROMPT,
          ...(harnessProfile?.systemPromptSuffix ? { suffix: harnessProfile.systemPromptSuffix } : {})
        },
        skills: hasSkillsPermission ? ["skills/"] : [],
        checkpointer,
        middleware: [createPatchToolCallsMiddleware(), new RemixDeepAgentMiddleware(this.plugin, this)],
      }

      if (this.config.enableSubagents && this.model) {
        // Subagents run on the user's selected model — the same instance the
        // main agent uses. No separate code-capable pick: a second model meant
        // subagents could answer from a model the user never chose.
        const shapedTools = applyHarnessToolRules(this.tools, harnessProfile)
        if (shapedTools.length !== this.tools.length) {
          remixAILogger.log(
            `[DeepAgentInferencer] harness profile for ${this.modelSelection.modelId} hides ` +
            `${this.tools.length - shapedTools.length} tool(s) from subagents`
          )
        }
        // A subagent that cannot be built must not take the whole agent with it.
        try {
          agentConfig.subagents = await buildSubagentConfigs(
            shapedTools,
            this.model,
            this.filesystemBackend
          )
        } catch (subagentError) {
          remixAILogger.error(
            '[DeepAgentInferencer] Subagent configuration failed — continuing without subagents:',
            subagentError
          )
          agentConfig.subagents = []
        }
        const subagentsDesc = agentConfig.subagents
          .map(sub => `\n- ${sub.name}:${sub.description || ''}`)
          .join('')
        const roster = `## The agent has access to the following subagents:${subagentsDesc}`
        const promptConfig = agentConfig.systemPrompt as { base?: string; suffix?: string | null }
        promptConfig.suffix = promptConfig.suffix
          ? `${roster}\n\n${promptConfig.suffix}`
          : roster
      }

      if (this.memoryBackend) {
        agentConfig.store = this.memoryBackend as any
      }

      this.agent = createDeepAgent(agentConfig as any) as DeepAgent

      remixAILogger.log(`[DeepAgentInferencer] Recreated agent with ${selectedTools.length} selected tools`)
    } catch (error) {
      remixAILogger.error('[DeepAgentInferencer] Failed to recreate agent with selected tools:', error)
      throw new DeepAgentError(
        `Failed to build the agent: ${(error as any)?.message ?? error}`,
        DeepAgentErrorType.INITIALIZATION_FAILED,
        error
      )
    }
  }

  private async handleError(error: any, method: string, prompt: string, params: IParams): Promise<string | null> {
    remixAILogger.error(`[DeepAgentInferencer] Error in ${method}:`, error)

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

    remixAILogger.log(`[DeepAgentInferencer] Error classified as: ${errorType}, retryable: ${retryable}, retryAfter: ${retryAfter}`)
    console.error(`[DeepAgentInferencer] Original error:`, error)

    // Emit API key specific error for UI handling
    if (errorType === DeepAgentErrorType.AUTHENTICATION_FAILED ||
        errorType === DeepAgentErrorType.API_KEY_INVALID ||
        errorType === DeepAgentErrorType.QUOTA_EXCEEDED ||
        errorType === DeepAgentErrorType.RATE_LIMIT_EXCEEDED) {
      this.emitApiKeyError(errorType, error)
    }

    // A model without tool calling fails every request, not just this one.
    // Emit it so the plugin can warn the user and roll the selection back.
    //
    // Return null, not the message: null is the chat's "nothing was said"
    // signal — it paints no assistant bubble and reads the notice strip
    // instead. Returning the text would put a failure in the transcript as if
    // the assistant had answered, and an empty string reads as "streaming
    // started" and leaves an empty bubble spinning.
    if (errorType === DeepAgentErrorType.TOOL_USE_UNSUPPORTED) {
      this.event.emit('onApiError', {
        type: errorType,
        message: userMessage,
        retryable: false,
        originalError: error?.message,
        timestamp: Date.now(),
        threadId: this.sessionThreadId
      })
      return null
    }

    // Recoverable errors: surface a friendly inline message and keep the
    // turn's partial output — there's nothing actionable to report.
    if (errorType === DeepAgentErrorType.RATE_LIMIT_EXCEEDED ||
        errorType === DeepAgentErrorType.QUOTA_EXCEEDED) {
      this.event.emit('onApiError', {
        type: errorType,
        message: userMessage,
        retryable,
        retryAfter,
        originalError: error?.message,
        timestamp: Date.now(),
        threadId: this.sessionThreadId
      })
      return `${userMessage}`
    }

    // Solcoder fallback disabled. Where we used to silently retry the
    // request against RemoteInferencer, re-throw so withAssistantGate calls
    // reportError() and the existing chat-notice strip above the prompt
    // renders the failure (same path backend-envelope errors already take).
    remixAILogger.log(`[DeepAgentInferencer] ${method} failed, solcoder fallback disabled — surfacing to notice strip`)
    throw error
  }

  cancelRequest(): void {
    remixAILogger.log('[DeepAgentInferencer] Cancelling request...')
    if (this.currentAbortController) {
      // A reason makes the abort self-describing at the catch site, which is
      // what lets a user cancel be told apart from a timeout.
      this.currentAbortController.abort(new DOMException('The user cancelled the request.', 'AbortError'))
      this.currentAbortController = null
    }
    // Aborting the stream does NOT unblock a run that is parked on a HITL
    this.cancelPendingApprovals()
    this.event.emit('onInferenceDone')

    try {
      clearAllQuickDappWorkspaceLocks()
      clearAllQuickDappGenerationContexts()
      clearQuickDappDocsContext()
      remixAILogger.log('[QuickDapp][WorkspaceLock] cleared on AI cancel')
      this.plugin.emit('generationProgress', null)
    } catch (_) { /* best-effort cleanup */ }
  }

  /** Settle every HITL approval still waiting on the user (see cancelRequest). */
  private cancelPendingApprovals(): void {
    try {
      this.approvalGate?.cancelPendingApprovals()
    } catch (e) {
      remixAILogger.warn('[DeepAgentInferencer] approvalGate.cancelPendingApprovals failed', e)
    }
    try {
      ;(this.filesystemBackend as any)?.cancelPendingApprovals?.()
    } catch (e) {
      remixAILogger.warn('[DeepAgentInferencer] filesystemBackend.cancelPendingApprovals failed', e)
    }
  }

  async close(): Promise<void> {
    this.__closed = true
    // A close() racing an in-flight run (cancelRequest → reinitialize) must not
    // leave approval waiters pending — they would keep answer() alive forever.
    this.cancelPendingApprovals()
    // eslint-disable-next-line no-console
    if (DeepAgentInferencer.__gcLogging) console.log(`[DeepAgent-GC] 🛑 CLOSE #${this.__instanceId} thread=${this.sessionThreadId} | live=${DeepAgentInferencer.__liveCount}`)

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

  getCurrentModelInfo(): ModelSelection {
    return { ...this.modelSelection }
  }
}
