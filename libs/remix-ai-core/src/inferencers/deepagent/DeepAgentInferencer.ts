/**
 * DeepAgent Inferencer for Remix IDE
 * Integrates LangChain DeepAgent with Remix's AI system
 */

import { IAIStreamResponse, ICompletions, IGeneration, IParams } from '../../types/types'
import { Plugin } from '@remixproject/engine'
import EventEmitter from 'events'
import { RemixFilesystemBackend } from './RemixFilesystemBackend'
import { createRemixTools, ToolApprovalGate } from './RemixToolAdapter'
import {
  REMIX_DEEPAGENT_SYSTEM_PROMPT,
  SOLIDITY_CODE_GENERATION_PROMPT,
  SECURITY_ANALYSIS_PROMPT,
  CODE_EXPLANATION_PROMPT,
  SECURITY_AUDITOR_SUBAGENT_PROMPT,
  CODE_REVIEWER_SUBAGENT_PROMPT
} from './DeepAgentPrompts'
import { DeepAgentMemoryBackend } from '../../storage/deepAgentMemoryBackend'
import { IDeepAgentConfig, DeepAgentError, DeepAgentErrorType } from '../../types/deepagent'
import { ToolRegistry } from '../../remix-mcp-server/types/mcpTools'

// Import LangChain modules
import { ChatAnthropic } from '@langchain/anthropic'
import { HumanMessage, AIMessage } from '@langchain/core/messages'
import type { DynamicStructuredTool } from '@langchain/core/tools'
import { GenerationParams } from '../../types/models'
import { buildChatPrompt } from '../../prompts/promptBuilder'
import { MemorySaver } from "@langchain/langgraph";

/**
 * DeepAgentInferencer integrates LangChain DeepAgent with Remix IDE
 */
export class DeepAgentInferencer implements ICompletions, IGeneration {
  private plugin: Plugin
  private config: IDeepAgentConfig
  private event: EventEmitter
  private agent: any = null
  private filesystemBackend: RemixFilesystemBackend
  private memoryBackend: DeepAgentMemoryBackend | null = null
  private tools: DynamicStructuredTool[] = []
  private approvalGate: ToolApprovalGate | null = null
  private currentAbortController: AbortController | null = null
  private fallbackInferencer: any = null
  private model: ChatAnthropic | null = null

  constructor(
    plugin: Plugin,
    toolRegistry: ToolRegistry,
    config?: Partial<IDeepAgentConfig>,
    fallbackInferencer?: any,
    mcpInferencer?: any
  ) {
    this.plugin = plugin
    this.event = new EventEmitter()
    this.fallbackInferencer = fallbackInferencer

    // Default configuration (API key handled by proxy)
    this.config = {
      enabled: true,
      apiKey: 'proxy-handled', // Proxy server handles the API key
      memoryBackend: config?.memoryBackend || 'store',
      maxToolExecutions: config?.maxToolExecutions || 10,
      timeout: config?.timeout || 300000, // 5 minutes
      enableSubagents: config?.enableSubagents !== false,
      enablePlanning: config?.enablePlanning !== false
    }

    // Initialize filesystem backend with shared EventEmitter for approval
    const rawBackend = new RemixFilesystemBackend(plugin, this.event)

    // Proxy wrapper: logs every method call from the deepagents library
    this.filesystemBackend = new Proxy(rawBackend, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver)
        if (typeof value === 'function') {
          return function (...args: any[]) {
            console.log(`[HITL][Proxy] Backend.${String(prop)}() called with`, args.length, 'args:', args.map(a => typeof a === 'string' ? a.substring(0, 80) : a))
            return value.apply(target, args)
          }
        }
        return value
      }
    }) as any

    // Initialize tools with approval gate
    this.approvalGate = new ToolApprovalGate(plugin, this.event, 'ask_risky')
    this.initializeTools(toolRegistry, mcpInferencer)
  }

  /**
   * Initialize DeepAgent with all components
   */
  async initialize(): Promise<void> {
    try {
      console.log('[DeepAgentInferencer] Initializing DeepAgent...')
      // Dynamic import of deepagents only
      const { createDeepAgent } = await import('deepagents')

      console.log('[DeepAgentInferencer] Initializing DeepAgent with config:', this.config)

      // Always use proxy server - API key is handled server-side
      // Use absolute URL for the proxy (webpack dev server proxies /api/langchain to localhost:4000)
      const proxyUrl = 'http://localhost:4000'

      const modelConfig: any = {
        apiKey: 'proxy-handled', // Proxy server adds the real API key
        model: 'claude-sonnet-4-5-20250929',
        temperature: 0.7,
        maxTokens: 4096,
        streaming: true,
        clientOptions: {
          baseURL: proxyUrl
        }
      }

      console.log('[DeepAgentInferencer] Using proxy server:', proxyUrl)

      this.model = new ChatAnthropic(modelConfig)

      // Don't create model instance here - let deepagents handle it internally
      // This avoids dynamic loading issues in the browser
      console.log('[DeepAgentInferencer] Model will be initialized by deepagents')

      // Initialize memory backend if enabled
      if (this.config.memoryBackend === 'store') {
        this.memoryBackend = new DeepAgentMemoryBackend('remix-deepagent-memory')
        await this.memoryBackend.init()
      }

      // LangGraph checkpointer — manages agent internal state (conversation, tool calls)
      // Ref: Yann's PR #7080 (langchain_skills)
      const checkpointer = new MemorySaver();

      // Create DeepAgent configuration
      console.log('[DeepAgentInferencer] Setting up agent configuration...')
      const agentConfig: any = {
        backend: this.filesystemBackend,
        tools: this.tools,
        model: this.model,
        systemPrompt: REMIX_DEEPAGENT_SYSTEM_PROMPT,
        skills: ["skills/"],
        checkpointer
      }

      // Configure specialized subagents
      // if (this.config.enableSubagents) {
      //   agentConfig.subagents = {
      //     'Security Auditor': {
      //       systemPrompt: SECURITY_AUDITOR_SUBAGENT_PROMPT,
      //       model: this.model,
      //       tools: this.tools,
      //       backend: this.filesystemBackend
      //     },
      //     'Code Reviewer': {
      //       systemPrompt: CODE_REVIEWER_SUBAGENT_PROMPT,
      //       model: this.model,
      //       tools: this.tools,
      //       backend: this.filesystemBackend
      //     }
      //   }
      //   console.log('[DeepAgentInferencer] Configured 2 specialized subagents: Security Auditor, Code Reviewer')
      // }

      // Add store if configured
      console.log('[DeepAgentInferencer] Memory backend:', this.memoryBackend ? 'Enabled' : 'Disabled')
      if (this.memoryBackend) {
        agentConfig.store = this.memoryBackend
      }

      // Create the agent
      console.log('[DeepAgentInferencer] Creating DeepAgent instance...')
      this.agent = await createDeepAgent(agentConfig)

      console.log('[DeepAgentInferencer] Agent created successfully')
      console.log('[DeepAgentInferencer] DeepAgent instance created successfully', this.agent)

      console.log('[DeepAgentInferencer] Initialized successfully')
    } catch (error) {
      console.error('[DeepAgentInferencer] Initialization failed:', error)
      throw new DeepAgentError(
        `Failed to initialize DeepAgent: ${error.message}`,
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

      // Build messages
      const messages = [
        { role: 'system', content: REMIX_DEEPAGENT_SYSTEM_PROMPT + '\n\n' + SOLIDITY_CODE_GENERATION_PROMPT },
        { role: 'user', content: prompt }
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

      const messages = [
        { role: 'system', content: REMIX_DEEPAGENT_SYSTEM_PROMPT + '\n\n' + CODE_EXPLANATION_PROMPT },
        { role: 'user', content: `Context:\n${context}\n\nQuestion: ${prompt}` }
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
        throw new DeepAgentError(
          'DeepAgent not initialized',
          DeepAgentErrorType.INITIALIZATION_FAILED
        )
      }
      const messages = [
        { role: 'user', content: context ? `Context:\n${context}\n\nQuestion: ${prompt}` : prompt }
      ]
      console.log('[DeepAgentInferencer] Running answer with messages:')

      // Return empty string immediately to signal streaming mode
      // The actual content will be streamed via onStreamResult events
      const responsePromise = this.runAgent(messages, params)

      // Handle the response asynchronously
      responsePromise.then(response => {
        console.log('[DeepAgentInferencer] Answer response complete:', response)
        // Emit completion event with final response for chat history
        this.event.emit('onStreamComplete', response)
        this.event.emit('onInferenceDone')
      }).catch(error => {
        console.error('[DeepAgentInferencer] Answer error:', error)
        this.event.emit('onInferenceDone')
      })

      // Return empty string to trigger streaming mode in UI
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

      const messages = [
        { role: 'system', content: REMIX_DEEPAGENT_SYSTEM_PROMPT + '\n\n' + SECURITY_ANALYSIS_PROMPT },
        { role: 'user', content: prompt }
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
    // Create abort controller for cancellation
    this.currentAbortController = new AbortController()

    try {
      // Filter out system messages - they're already set during agent creation
      const langchainMessages = messages
        .filter(msg => msg.role !== 'system')
        .map(msg => {
          if (msg.role === 'user') return new HumanMessage(msg.content)
          if (msg.role === 'assistant') return new AIMessage(msg.content)
          return new HumanMessage(msg.content)
        })

      let fullResponse = ''
      console.log('[DeepAgentInferencer] Running agent with messages (streaming enabled)', this.agent)

      // Use streamEvents() for token-level streaming as per LangChain DeepAgent docs
      // https://docs.langchain.com/oss/python/deepagents/streaming
      const eventStream = this.agent.streamEvents(
        {
          messages: langchainMessages
        },
        {
          version: 'v2',
          // Each request gets a unique thread_id for the LangGraph checkpointer.
          configurable: {
            thread_id: `remix-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
          }
        }
      )

      // Process stream events
      let finalMessageFromChain = ''
      for await (const event of eventStream) {
        const eventType = event.event
        console.log(`[DeepAgentInferencer] Event: ${eventType}`, event.name || '')

        // Handle different event types from the stream
        if (eventType === 'on_chat_model_stream') {
          // Token-level streaming from the LLM - this is the actual text streaming
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
              fullResponse += deltaContent
              // Emit incremental delta for streaming display
              this.event.emit('onStreamResult', deltaContent)
            }
          }
        } else if (eventType === 'on_chain_end') {
          // Store final response but don't overwrite accumulated chunks
          const output = event.data?.output
          if (output?.messages && output.messages.length > 0) {
            const lastMessage = output.messages[output.messages.length - 1]
            if (lastMessage.content && typeof lastMessage.content === 'string') {
              finalMessageFromChain = lastMessage.content
            }
          }
        } else if (eventType === 'on_tool_start') {
          const toolName = event.name
          console.log(`[DeepAgentInferencer] ★ TOOL START: ${toolName}`, JSON.stringify(event.data?.input || {}).substring(0, 200))
          this.event.emit('onStreamResult', `\n[Using tool: ${toolName}]\n`)
        } else if (eventType === 'on_tool_end') {
          const toolName = event.name
          console.log(`[DeepAgentInferencer] ★ TOOL END: ${toolName}`, JSON.stringify(event.data?.output || '').substring(0, 200))
        }
      }

      // Use final message from chain if available and longer than accumulated chunks
      // This handles cases where streaming might miss some content
      if (finalMessageFromChain && finalMessageFromChain.length > fullResponse.length) {
        console.log('[DeepAgentInferencer] Using chain final message as it is more complete')
        fullResponse = finalMessageFromChain
      }

      console.log('[DeepAgentInferencer] Stream complete, full response length:', fullResponse.length)
      return fullResponse
    } catch (error) {
      console.error('[DeepAgentInferencer] Error during agent execution:', error)
      if (error.name === 'AbortError') {
        throw new DeepAgentError(
          'Request cancelled by user',
          DeepAgentErrorType.UNKNOWN
        )
      }
      throw error
    } finally {
      this.currentAbortController = null
    }
  }

  /**
   * Handle errors with fallback strategy
   */
  private async handleError(error: any, method: string, prompt: string, params: IParams): Promise<string> {
    console.error(`[DeepAgentInferencer] Error in ${method}:`, error)

    // Categorize error
    let errorType = DeepAgentErrorType.UNKNOWN
    if (error.message?.includes('context_length_exceeded')) {
      errorType = DeepAgentErrorType.CONTEXT_LENGTH_EXCEEDED
    } else if (error.message?.includes('tool_execution_failed')) {
      errorType = DeepAgentErrorType.TOOL_EXECUTION_FAILED
    } else if (error.message?.includes('API key')) {
      errorType = DeepAgentErrorType.API_KEY_INVALID
    } else if (error.message?.includes('network') || error.message?.includes('fetch')) {
      errorType = DeepAgentErrorType.NETWORK_ERROR
    }

    // Try fallback to RemoteInferencer
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
      } catch (fallbackError) {
        console.error('[DeepAgentInferencer] Fallback also failed:', fallbackError)
      }
    }

    // Return error message
    return `Error: ${error.message || 'An unexpected error occurred'}`
  }

  /**
   * Cancel current request
   */
  cancelRequest(): void {
    if (this.currentAbortController) {
      this.currentAbortController.abort()
      this.currentAbortController = null
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
   * Get memory statistics
   */
  async getMemoryStats(): Promise<any> {
    if (this.memoryBackend) {
      return await this.memoryBackend.getStats()
    }
    return null
  }
}
