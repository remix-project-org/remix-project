/**
 * DeepAgent Inferencer for Remix IDE
 * Integrates LangChain DeepAgent with Remix's AI system
 */

import { ICompletions, IGeneration, IParams } from '../../types/types'
import { Plugin } from '@remixproject/engine'
import EventEmitter from 'events'
import { RemixFilesystemBackend } from './RemixFilesystemBackend'
import { createRemixTools, ToolApprovalGate } from './RemixToolAdapter'
import { ToolSelector } from './ToolSelector'
import {
  REMIX_DEEPAGENT_SYSTEM_PROMPT,
  SOLIDITY_CODE_GENERATION_PROMPT,
  SECURITY_ANALYSIS_PROMPT,
  CODE_EXPLANATION_PROMPT,
  SECURITY_AUDITOR_SUBAGENT_PROMPT,
  CODE_REVIEWER_SUBAGENT_PROMPT,
  FRONTEND_SPECIALIST_SUBAGENT_PROMPT,
  ETHERSCAN_SUBAGENT_PROMPT,
  THEGRAPH_SUBAGENT_PROMPT,
  ALCHEMY_SUBAGENT_PROMPT,
  GAS_OPTIMIZER_SUBAGENT_PROMPT,
  COMPREHENSIVE_AUDITOR_SUBAGENT_PROMPT,
  WEB3_EDUCATOR_SUBAGENT_PROMPT
} from './DeepAgentLightPrompts'
import { DeepAgentMemoryBackend } from '../../storage/deepAgentMemoryBackend'
import { IDeepAgentConfig, IAutoModelConfig, DeepAgentError, DeepAgentErrorType } from '../../types/deepagent'
import { ToolRegistry } from '../../remix-mcp-server/types/mcpTools'
import { classifyApiError, getErrorMessage } from './ApiErrorHandler'
import { resolveToolUIString } from './ToolUIStrings'

// Import LangChain modules
import { ChatAnthropic } from '@langchain/anthropic'
import { ChatMistralAI } from '@langchain/mistralai'
import { HumanMessage, AIMessage } from '@langchain/core/messages'
import type { DynamicStructuredTool } from '@langchain/core/tools'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { AsyncLocalStorageProviderSingleton } from '@langchain/core/singletons'
import { getBasicFileToolsForGasOptimizer, getBasicMcpToolsForSecurityAuditor, getCoordinationToolsForComprehensiveAuditor, getEducationToolsForWeb3Educator, analyzePromptForAutoSelection, selectOptimalModel } from './helpers'
import { IndexedDBCheckpointSaver } from '../../storage/IndexedDBCheckpointSaver'
import { endpointUrls } from "@remix-endpoints-helper"
import type { DeepAgent } from 'deepagents'

// Model provider types
type ModelProvider = 'anthropic' | 'mistralai' | 'openai' | 'ollama'

interface ModelSelection {
  provider: ModelProvider
  modelId: string
}

const DAPP_MAX_TOKENS = 65536

// Initialize AsyncLocalStorage for browser environment
const initializeAsyncLocalStorage = () => {
  const storeStack: any[] = []
  const browserAsyncLocalStorage = {
    run<T>(store: any, callback: () => T): T {
      storeStack.push(store)
      try {
        const result = callback()
        if (result && typeof (result as any).then === 'function') {
          return (result as any).finally(() => { storeStack.pop() })
        }
        storeStack.pop()
        return result
      } catch (error) {
        storeStack.pop()
        throw error
      }
    },
    getStore() {
      return storeStack.length > 0 ? storeStack[storeStack.length - 1] : undefined
    },
    enterWith(store: any) {
      storeStack.push(store)
    },
    exit<T>(callback: () => T): T {
      const prev = storeStack.pop()
      try {
        return callback()
      } finally {
        if (prev !== undefined) storeStack.push(prev)
      }
    },
    disable() {
      storeStack.length = 0
    }
  }

  // Initialize LangChain's global AsyncLocalStorage singleton
  AsyncLocalStorageProviderSingleton.initializeGlobalInstance(browserAsyncLocalStorage)
  console.log('[DeepAgentInferencer] Initialized AsyncLocalStorage for browser environment')
}

// Initialize immediately when module loads
initializeAsyncLocalStorage()

/**
 * DeepAgentInferencer integrates LangChain DeepAgent with Remix IDE
 */
export class DeepAgentInferencer implements ICompletions, IGeneration {
  private plugin: Plugin
  private config: IDeepAgentConfig
  private event: EventEmitter
  private agent: DeepAgent | null = null
  private filesystemBackend: RemixFilesystemBackend
  private memoryBackend: DeepAgentMemoryBackend | null = null
  private tools: DynamicStructuredTool[] = []
  private approvalGate: ToolApprovalGate | null = null
  private toolSelector: ToolSelector | null = null
  private currentAbortController: AbortController | null = null
  private fallbackInferencer: any = null
  private model: BaseChatModel | null = null
  private modelSelection: ModelSelection
  private mcpInferencer: any = null
  private allowedModels: string[] = []
  private sessionThreadId: string = DeepAgentInferencer.generateThreadId()

  private static generateThreadId(): string {
    return `remix-session-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
  }

  /** Reset the session thread_id (e.g. after error or new conversation) */
  private resetSessionThread(): void {
    const oldId = this.sessionThreadId
    this.sessionThreadId = DeepAgentInferencer.generateThreadId()
    console.log('[DeepAgent-Thread] resetSessionThread:', this.sessionThreadId, '(was:', oldId, ')')
  }

  /** Set the session thread_id (e.g. when switching conversations) */
  setSessionThreadId(threadId: string): void {
    console.log('[DeepAgent-Thread] setSessionThreadId:', threadId, '(was:', this.sessionThreadId, ')')
    this.sessionThreadId = threadId
  }

  /** Get the current session thread_id */
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

    this.toolSelector = new ToolSelector()
  }

  /**
   * Initialize DeepAgent with all components
   */
  async initialize(): Promise<void> {
    try {
      console.log('[DeepAgentInferencer] Initializing DeepAgent...') // Dynamic import of deepagents only

      console.log('[DeepAgentInferencer] Initializing DeepAgent with config:', this.config)
      console.log('[DeepAgentInferencer] Model selection:', this.modelSelection)

      this.model = this.createModelInstance()

      console.log(`[DeepAgentInferencer] Created ${this.modelSelection.provider} model: ${this.modelSelection.modelId}`)

      if (this.config.memoryBackend === 'store') {
        this.memoryBackend = new DeepAgentMemoryBackend('remix-deepagent-memory')
        await this.memoryBackend.init()
      }

      this.tools.push(...this.toolSelector?.getEssentialTools() || [])

      if (this.toolSelector && this.tools.length > 0) {
        await this.toolSelector.buildToolIndex(this.tools)
      }

      const metaTools = this.tools.filter(tool =>
        tool.name === 'get_tool_schema' || tool.name === 'call_tool'
      )

      console.log('[DeepAgentInferencer] Agent direct tools:', metaTools.map(t => t.name))
      console.log('[DeepAgentInferencer] All available tools via call_tool:', this.tools.map(t => t.name))

      this.createAgentWithTools(metaTools)
      console.log('[DeepAgentInferencer] Initialized: agent tools =', metaTools.map(t => t.name), ', available via call_tool =', this.tools.map(t => t.name))
    } catch (error: any) {
      console.error('[DeepAgentInferencer] Initialization failed:', error)
      throw new DeepAgentError(
        `Failed to initialize DeepAgent: ${error?.message || error}`,
        DeepAgentErrorType.INITIALIZATION_FAILED,
        error
      )
    }
  }

  /**
   * Initialize Remix tools for DeepAgent
   */
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


  /**
   * Create the appropriate model instance based on provider selection
   * @param maxTokens - Override default token limit (default: 4096, DApp generation uses 16384)
   */
  private createModelInstance(maxTokens: number=DAPP_MAX_TOKENS, modelSelection?: ModelSelection): BaseChatModel {
    const { provider, modelId } = modelSelection || this.modelSelection

    switch (provider) {
    case 'mistralai': {
      console.log(`[DeepAgentInferencer] Creating MistralAI model: ${modelId}`)
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
      console.log(`[DeepAgentInferencer] Creating Anthropic model: ${modelId}`)
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

  /**
   * Main code generation method
   */
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

  /**
   * Code explanation method
   */
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

  /**
   * Answer questions method
   */
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

  /**
   * General generation method
   */
  async generate(prompt: string, params: IParams): Promise<string> {
    return this.code_generation(prompt, params)
  }

  /**
   * Workspace generation method
   */
  async generateWorkspace(prompt: string, params: IParams): Promise<string> {
    return this.code_generation(prompt, params)
  }

  /**
   * Error explanation method
   */
  async error_explaining(prompt: string, params: IParams): Promise<string> {
    return this.answer(prompt, params, '')
  }

  /**
   * Vulnerability check method
   */
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

      // Create a dedicated model with higher token limit for code generation
      // (the default agent model uses 4096 which truncates multi-file output)
      const DAPP_MAX_TOKENS = 16384
      const dappModel = this.createModelInstance(DAPP_MAX_TOKENS)

      // Build the full prompt with system context
      const fullPrompt = `${systemPrompt}\n\n---\n\nUser Request:\n${prompt}`

      // Convert to LangChain messages with image support
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

  /**
   * Code insertion method (not supported by DeepAgent, falls back)
   */
  async code_insertion(msg_pfx: string, msg_sfx: string, ctxFiles: any, fileName: string, params: IParams): Promise<any> {
    console.warn('[DeepAgentInferencer] code_insertion not supported, using fallback')
    if (this.fallbackInferencer) {
      return this.fallbackInferencer.code_insertion(msg_pfx, msg_sfx, ctxFiles, fileName, params)
    }
    return ''
  }

  /**
   * Run the DeepAgent with messages
   */
  private async runAgent(messages: any[], params: IParams): Promise<string> {
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
      // Tracking state for subagents and intermediate/final answers
      let isIntermediatePhase = true
      const activeSubagents: Map<string, { name: string; startTime: number }> = new Map()
      let previousRunId: string | null = null

      // Token usage tracking for this request
      let totalInputTokens = 0
      let totalOutputTokens = 0
      let totalCacheReadTokens = 0
      let totalCacheCreationTokens = 0
      let turnCount = 0

      // https://docs.langchain.com/oss/python/deepagents/streaming
      console.log('[DeepAgent-Thread] ▶ runAgent called | thread_id:', this.sessionThreadId, '| message:', String(langchainMessages[0]?.content || '').substring(0, 60) + '...')
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
          signal: this.currentAbortController?.signal
        }
      )



      let finalMessageFromChain = ''
      for await (const event of eventStream) {
        if (this.currentAbortController?.signal.aborted) {
          this.event.emit('onStreamComplete', fullResponse)
          break
        }

        const eventType = event.event
        const metadata = event["metadata"] || {}
        const checkpoint_ns = metadata["langgraph_checkpoint_ns"] || ""
        const agent_name = metadata["lc_agent_name"] || ""
        const is_subagent = checkpoint_ns.includes("tools:")

        if (is_subagent) {
          console.log(`[DeepAgentInferencer] Stream event from subagent detected: ${eventType} (agent: ${agent_name})`, event)
        }

        if (eventType === 'on_chain_start') {
          const runName = event.name || ''
          const tags = event.tags || []
          if (is_subagent && agent_name) {
            console.log(`[DeepAgentInferencer] Subagent execution started: ${agent_name} (run_id: ${event.run_id})`, event)
            const subagentName = agent_name
            activeSubagents.set(event.run_id, { name: subagentName, startTime: Date.now() })

            this.event.emit('onSubagentStart', {
              id: event.run_id,
              name: subagentName,
              task: event.data?.input?.task || 'Processing...',
              status: 'running'
            })
          }

          if (runName.includes('plan') || tags.includes('planning')) {
            console.log(`[DeepAgentInferencer] Planning phase started (run_id: ${event.run_id})`)
            this.event.emit('onTaskStart', {
              id: event.run_id,
              name: event.name || 'Planning',
              status: 'started'
            })
          }

          if (runName === 'final_response' || tags.includes('final')) {
            isIntermediatePhase = false
          }
        }

        if (eventType === 'on_chain_end' && activeSubagents.has(event.run_id)) {
          const subagent = activeSubagents.get(event.run_id)!
          console.log(`[DeepAgentInferencer] Subagent completed: ${subagent.name} (run_id: ${event.run_id})`)
          const duration = Date.now() - subagent.startTime

          this.event.emit('onSubagentComplete', {
            id: event.run_id,
            name: subagent.name,
            status: 'completed',
            duration
          })
          activeSubagents.delete(event.run_id)
        }

        // Handle different event types from the stream
        if (eventType === 'on_chat_model_stream') {
          const chunk = event.data?.chunk
          if (chunk?.content) {
            // Extract delta content - handle different response formats
            let deltaContent = ''
            if (typeof chunk.content === 'string') {
              deltaContent = chunk.content
            } else if (Array.isArray(chunk.content) && chunk.content.length > 0) {
              // Handle array format (e.g., [{type: 'text', text: '...'}])
              if (chunk.content[0]?.text) {
                deltaContent = chunk.content[0].text
              } else if (typeof chunk.content[0] === 'string') {
                deltaContent = chunk.content[0]
              }
            }

            if (deltaContent) {
              const currentRunId = event.run_id
              if (previousRunId !== null && previousRunId !== currentRunId) {
                // Log token usage when run_id changes (new agent turn)
                console.log(`[DeepAgent-Tokens] Run ID changed: ${previousRunId} → ${currentRunId}`)
                deltaContent = '\n \n---\n' + deltaContent
              }
              previousRunId = currentRunId

              fullResponse += deltaContent

              if (is_subagent) {
                this.event.emit('onStreamResult', {
                  content: deltaContent,
                  isIntermediate: isIntermediatePhase,
                  source: event.metadata?.langgraph_node || 'agent',
                  isSubagent: true,
                  subagentName: agent_name
                })
              } else {
                this.event.emit('onStreamResult', {
                  content: deltaContent,
                  isIntermediate: isIntermediatePhase,
                  source: event.metadata?.langgraph_node || 'agent',
                  isSubagent: false,
                  subagentName: ""
                })
              }
            }
          }
        } else if (eventType === 'on_chat_model_end') {
          // Track token usage when a chat model call completes
          const output = event.data?.output
          if (output) {
            const usageMetadata = output.usage_metadata || output.response_metadata?.usage
            if (usageMetadata) {
              const inputTokens = usageMetadata.input_tokens || usageMetadata.prompt_tokens || 0
              const outputTokens = usageMetadata.output_tokens || usageMetadata.completion_tokens || 0
              const totalTokens = usageMetadata.total_tokens || (inputTokens + outputTokens)

              // Extract cached token information (Anthropic-specific fields)
              let cacheReadInputTokens = usageMetadata.cache_read_input_tokens || 0
              cacheReadInputTokens = cacheReadInputTokens === 0 ? usageMetadata.input_token_details?.cache_read || 0 : cacheReadInputTokens
              let cacheCreationInputTokens = usageMetadata.cache_creation_input_tokens || 0
              cacheCreationInputTokens = cacheCreationInputTokens === 0 ? usageMetadata.input_token_details?.cache_creation || 0 : cacheCreationInputTokens

              // Update cumulative counts
              totalInputTokens += inputTokens
              totalOutputTokens += outputTokens
              totalCacheReadTokens += cacheReadInputTokens
              totalCacheCreationTokens += cacheCreationInputTokens
              turnCount++

              console.log(`[DeepAgent-Tokens]   Turn ${turnCount} completed | run_id: ${event.run_id}`)
              console.log(`[DeepAgent-Tokens]   Input:  ${inputTokens} tokens`)
              console.log(`[DeepAgent-Tokens]   Output: ${outputTokens} tokens`)
              console.log(`[DeepAgent-Tokens]   Cache Read: ${cacheReadInputTokens} tokens`)
              console.log(`[DeepAgent-Tokens]   Cache Creation: ${cacheCreationInputTokens} tokens`)
              console.log(`[DeepAgent-Tokens]   Total:  ${totalTokens} tokens`)
              console.log(`[DeepAgent-Tokens]   Cumulative: ${totalInputTokens} in / ${totalOutputTokens} out / ${totalCacheReadTokens} cache-read / ${totalCacheCreationTokens} cache-creation`)

              // Emit token usage event for UI tracking
              this.event.emit('onTokenUsage', {
                runId: event.run_id,
                inputTokens,
                outputTokens,
                totalTokens,
                cacheReadInputTokens,
                cacheCreationInputTokens,
                cumulativeInputTokens: totalInputTokens,
                cumulativeOutputTokens: totalOutputTokens,
                cumulativeCacheReadTokens: totalCacheReadTokens,
                cumulativeCacheCreationTokens: totalCacheCreationTokens,
                turnCount,
                timestamp: Date.now(),
                agentName: agent_name || 'main',
                isSubagent: is_subagent
              })
            }
          }
        } else if (eventType === 'on_chain_end') {
          const output = event.data?.output
          if (output?.messages && output.messages.length > 0) {
            const lastMessage = output.messages[output.messages.length - 1]
            if (lastMessage.content && typeof lastMessage.content === 'string') {
              finalMessageFromChain = lastMessage.content
            }
          }
        } else if (eventType === 'on_tool_start') {
          // Tool execution started - emit onToolCall event
          const toolName = event.name
          const toolInput = JSON.parse(event.data?.input.input || '{}')
          const toolUIString = resolveToolUIString(toolName, toolInput)
          console.log('[DeepAgentInferencer] Tool call started:', toolName, toolInput, '| UI:', toolUIString)
          this.event.emit('onToolCall', { toolName, toolInput, toolUIString, status: 'start' })

          console.log('[DeepAgentInferencer] Checking for todo updates in tool input...', toolInput.todos)
          if (toolName === 'write_todos' && toolInput?.todos) {
            const todos = toolInput.todos
            // Find the current todo being executed (first in_progress, or first pending if none in progress)
            let currentTodoIndex = todos.findIndex((t: any) => t.status === 'in_progress')
            if (currentTodoIndex === -1) {
              const allCompleted = todos.every((t: any) => t.status === 'completed')
              if (allCompleted) {
                currentTodoIndex = todos.length - 1
              } else {
                currentTodoIndex = todos.findIndex((t: any) => t.status === 'pending')
              }
            }

            const currentTodoContent = currentTodoIndex >= 0 ? (todos[currentTodoIndex]?.content || todos[currentTodoIndex]?.task) : undefined
            const currentTodoUIString = currentTodoIndex >= 0 ? (todos[currentTodoIndex]?.activeForm || currentTodoContent) : undefined

            console.log('[DeepAgentInferencer] Todo list updated:', todos, 'Current index:', currentTodoIndex, 'Current todo:', currentTodoContent)
            this.event.emit('onToolCall', { toolName: currentTodoContent, toolInput: { }, toolUIString: currentTodoUIString || currentTodoContent, status: 'start' }) // just for UI

            this.event.emit('onTodoUpdate', {
              todos: todos,
              currentTodoIndex: currentTodoIndex,
              timestamp: Date.now()
            })
          }
        } else if (eventType === 'on_tool_end') {
          const toolName = event.name
          console.log('[DeepAgentInferencer] Tool call ended:', toolName)
          this.event.emit('onToolCall', { toolName, toolInput: {}, toolUIString: '', status: 'end' })
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
      if (turnCount > 0) {
        console.log(`[DeepAgent-Tokens] ═══════════════════════════════════════`)
        console.log(`[DeepAgent-Tokens]   Request Complete - Token Summary`)
        console.log(`[DeepAgent-Tokens]   Total Turns:   ${turnCount}`)
        console.log(`[DeepAgent-Tokens]   Total Input:   ${totalInputTokens} tokens`)
        console.log(`[DeepAgent-Tokens]   Total Output:  ${totalOutputTokens} tokens`)
        console.log(`[DeepAgent-Tokens]   Cache Read:    ${totalCacheReadTokens} tokens`)
        console.log(`[DeepAgent-Tokens]   Cache Creation: ${totalCacheCreationTokens} tokens`)
        console.log(`[DeepAgent-Tokens]   Grand Total:   ${totalInputTokens + totalOutputTokens} tokens`)
        console.log(`[DeepAgent-Tokens] ═══════════════════════════════════════`)
      }

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
          const retryStream = this.agent.streamEvents(
            { messages: langchainMessages },
            {
              version: 'v2',
              configurable: { thread_id: this.sessionThreadId },
              subgraphs: true,
              signal: this.currentAbortController?.signal
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
      this.currentAbortController = null
      this.event.emit('onToolCall', { toolName: '', toolInput: '', toolUIString: '', status: 'end' })
    }
  }

  /**
   * Recreate agent with selected tools
   */
  private async createAgentWithTools(selectedTools: DynamicStructuredTool[]): Promise<void> {
    try {
      const { createDeepAgent } = await import('deepagents')

      const checkpointer = new IndexedDBCheckpointSaver()

      // Create agent configuration with selected tools
      const agentConfig: any = {
        backend: this.filesystemBackend,
        tools: selectedTools,
        model: this.model,
        systemPrompt: REMIX_DEEPAGENT_SYSTEM_PROMPT,
        skills: ["skills/"],
        checkpointer
      }

      if (this.config.enableSubagents) {
        const etherscanTools = this.toolSelector ?
          this.toolSelector.getEtherscanTools() : []
        const theGraphTools = this.toolSelector ?
          this.toolSelector.getTheGraphTools() : []
        const alchemyTools = this.toolSelector ?
          this.toolSelector.getAlchemyTools() : []

        const basicMcpTools = getBasicMcpToolsForSecurityAuditor(this.tools)
        const basicFileTools = getBasicFileToolsForGasOptimizer(this.tools)
        const coordinationTools = getCoordinationToolsForComprehensiveAuditor(this.tools)
        const educationTools = getEducationToolsForWeb3Educator(this.tools)

        const generalTools = this.toolSelector ?
          this.toolSelector.filterOutSpecialistTools(this.tools) : this.tools

        agentConfig.subagents = [
          {
            name: 'Security Auditor',
            systemPrompt: SECURITY_AUDITOR_SUBAGENT_PROMPT,
            model: this.model,
            tools: basicMcpTools,
            backend: this.filesystemBackend
          },
          {
            name: 'Gas Optimizer',
            systemPrompt: GAS_OPTIMIZER_SUBAGENT_PROMPT,
            model: this.model,
            tools: basicFileTools,
            backend: this.filesystemBackend
          },
          {
            name: 'Code Reviewer',
            systemPrompt: CODE_REVIEWER_SUBAGENT_PROMPT,
            model: this.model,
            tools: generalTools,
            backend: this.filesystemBackend
          },
          {
            name: 'Comprehensive Auditor',
            systemPrompt: COMPREHENSIVE_AUDITOR_SUBAGENT_PROMPT,
            model: this.model,
            tools: coordinationTools,
            backend: this.filesystemBackend
          },
          {
            name: 'Web3 Educator',
            systemPrompt: WEB3_EDUCATOR_SUBAGENT_PROMPT,
            model: this.model,
            tools: educationTools,
            backend: this.filesystemBackend
          },
          {
            name: 'Frontend Specialist',
            systemPrompt: FRONTEND_SPECIALIST_SUBAGENT_PROMPT,
            model: this.model,
            tools: generalTools,
            backend: this.filesystemBackend
          },
          {
            name: 'Etherscan Specialist',
            systemPrompt: ETHERSCAN_SUBAGENT_PROMPT,
            model: this.model,
            tools: etherscanTools,
            backend: this.filesystemBackend
          },
          {
            name: 'TheGraph Specialist',
            systemPrompt: THEGRAPH_SUBAGENT_PROMPT,
            model: this.model,
            tools: theGraphTools,
            backend: this.filesystemBackend
          },
          {
            name: 'Alchemy Specialist',
            systemPrompt: ALCHEMY_SUBAGENT_PROMPT,
            model: this.model,
            tools: alchemyTools,
            backend: this.filesystemBackend
          }
        ]
      }

      if (this.memoryBackend) {
        agentConfig.store = this.memoryBackend
      }

      let enhancedSystemPrompt = REMIX_DEEPAGENT_SYSTEM_PROMPT
      if (this.toolSelector) {
        const toolInventoryPrompt = this.toolSelector.generateToolInventoryPrompt(selectedTools)
        enhancedSystemPrompt += toolInventoryPrompt
      }
      agentConfig.systemPrompt = enhancedSystemPrompt

      this.agent = createDeepAgent(agentConfig)

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
    this.model = this.createModelInstance(DAPP_MAX_TOKENS, selectedModel)
    
    // Recreate agent with new model
    const metaTools = this.tools.filter(tool =>
      tool.name === 'get_tool_schema' || tool.name === 'call_tool'
    )
    if (!this.agent) await this.createAgentWithTools(metaTools)
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

  /**
   * Cancel current request
   */
  cancelRequest(): void {
    if (this.currentAbortController) {
      console.log('[DeepAgentInferencer] Cancelling request...')
      this.resetSessionThread()
      this.currentAbortController.abort()
      this.currentAbortController = null
      this.event.emit('onInferenceDone')
    }
  }

  /**
   * Close connections and cleanup
   */
  async close(): Promise<void> {
    if (this.memoryBackend) {
      this.memoryBackend.close()
    }
    if (this.approvalGate) {
      this.approvalGate.dispose()
      this.approvalGate = null
    }
    this.agent = null
    this.model = null
    this.toolSelector = null
  }

  /**
   * Get event emitter
   */
  getEventEmitter(): EventEmitter {
    return this.event
  }

  /**
   * Check if DeepAgent is ready
   */
  isReady(): boolean {
    return this.agent !== null
  }

  /**
   * Enable or disable auto model selection
   */
  setAutoMode(enabled: boolean): void {
    if (this.config.autoMode) {
      this.config.autoMode.enabled = enabled
      console.log(`[DeepAgentInferencer] Auto mode ${enabled ? 'enabled' : 'disabled'}`)
    }
  }

  /**
   * Get auto mode status
   */
  isAutoModeEnabled(): boolean {
    return this.config.autoMode?.enabled || false
  }

  /**
   * Get current model selection info
   */
  getCurrentModelInfo(): ModelSelection & { autoModeEnabled: boolean } {
    return {
      ...this.modelSelection,
      autoModeEnabled: this.isAutoModeEnabled()
    }
  }
}
