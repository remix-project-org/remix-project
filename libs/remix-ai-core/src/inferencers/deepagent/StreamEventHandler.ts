import { remixAILogger } from '../../helpers/logger'
import EventEmitter from 'events'
import { InactivityTimeoutManager } from './InactivityTimeoutManager'
import { INACTIVITY_TIMEOUT_MS } from './constants'
import { resolveToolUIString } from './tools/toolUIStrings'

interface SubagentInfo {
  name: string
  startTime: number
}

export interface TokenUsageState {
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheReadTokens: number
  totalCacheCreationTokens: number
  turnCount: number
}

export interface StreamProcessingResult {
  fullResponse: string
  finalMessageFromChain: string
  tokenUsage: TokenUsageState
}

export class StreamEventHandler {
  private event: EventEmitter
  private inactivityTimeout: InactivityTimeoutManager
  private activeSubagents: Map<string, SubagentInfo> = new Map()
  private previousRunId: string | null = null
  private isIntermediatePhase = true
  private inThinking = false
  private tokenUsage: TokenUsageState = {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCacheReadTokens: 0,
    totalCacheCreationTokens: 0,
    turnCount: 0
  }
  private getThreadId: () => string

  constructor(eventEmitter: EventEmitter, threadIdGetter: () => string) {
    this.event = eventEmitter
    this.getThreadId = threadIdGetter
    this.inactivityTimeout = new InactivityTimeoutManager(INACTIVITY_TIMEOUT_MS, () => {
      remixAILogger.warn('[DeepAgent] No activity for 10 seconds, handling timeout...')
      this.event.emit('onInactivityTimeout', {
        message: 'No response received for 10 seconds',
        timestamp: Date.now(),
        threadId: this.getThreadId()
      })
    })
  }

  startInactivityTracking(): void {
    this.inactivityTimeout.reset()
  }

  stopInactivityTracking(): void {
    this.inactivityTimeout.clear()
  }

  reset(): void {
    this.activeSubagents.clear()
    this.previousRunId = null
    this.isIntermediatePhase = true
    this.inThinking = false
    this.tokenUsage = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheReadTokens: 0,
      totalCacheCreationTokens: 0,
      turnCount: 0
    }
    this.inactivityTimeout.clear()
  }

  processEvent(event: any): { content: string; finalMessage?: string } {
    // Reset inactivity timeout on any activity
    this.inactivityTimeout.reset()

    const eventType = event.event
    const metadata = event.metadata || {}
    const checkpoint_ns = metadata.langgraph_checkpoint_ns || ''
    const agent_name = metadata.lc_agent_name || ''
    // Subagent detection requires BOTH: tools namespace AND a populated agent name
    // This prevents false positives when main agent events pass through tool-related nodes
    const is_subagent = checkpoint_ns.includes('tools:') && agent_name.trim().length > 0

    if (is_subagent) {
      remixAILogger.log(`[StreamEventHandler] Stream event from subagent detected: ${eventType} (agent: ${agent_name})`, event)
    }

    switch (eventType) {
    case 'on_chain_start':
      return { content: this.handleChainStart(event, is_subagent, agent_name) }

    case 'on_chain_end':
      return this.handleChainEnd(event, is_subagent)

    case 'on_chat_model_stream':
      return { content: this.handleChatModelStream(event, is_subagent, agent_name) }

    case 'on_chat_model_end':
      return { content: this.handleChatModelEnd(event, is_subagent, agent_name) }

    case 'on_tool_start':
      return { content: this.handleToolStart(event) }

    case 'on_tool_end':
      return { content: this.handleToolEnd(event) }

    default:
      return { content: '' }
    }
  }

  private handleChainStart(event: any, is_subagent: boolean, agent_name: string): string {
    const runName = event.name || ''
    const tags = event.tags || []

    if (is_subagent && agent_name) {
      remixAILogger.log(`[StreamEventHandler] Subagent execution started: ${agent_name} (run_id: ${event.run_id})`, event)
      this.activeSubagents.set(event.run_id, { name: agent_name, startTime: Date.now() })

      this.event.emit('onSubagentStart', {
        id: event.run_id,
        name: agent_name,
        task: event.data?.input?.task || 'Processing...',
        status: 'running',
        threadId: this.getThreadId()
      })
    }

    if (runName.includes('plan') || tags.includes('planning')) {
      remixAILogger.log(`[StreamEventHandler] Planning phase started (run_id: ${event.run_id})`)
      this.event.emit('onTaskStart', {
        id: event.run_id,
        name: event.name || 'Planning',
        status: 'started',
        threadId: this.getThreadId()
      })
    }

    if (runName === 'final_response' || tags.includes('final')) {
      this.isIntermediatePhase = false
    }

    return ''
  }

  private handleChainEnd(event: any, _is_subagent: boolean): { content: string; finalMessage?: string } {
    const subagent = this.activeSubagents.get(event.run_id)
    if (subagent) {
      remixAILogger.log(`[StreamEventHandler] Subagent completed: ${subagent.name} (run_id: ${event.run_id})`)
      const duration = Date.now() - subagent.startTime

      this.event.emit('onSubagentComplete', {
        id: event.run_id,
        name: subagent.name,
        status: 'completed',
        duration,
        threadId: this.getThreadId()
      })
      this.activeSubagents.delete(event.run_id)
    }

    // Check for final message
    const output = event.data?.output
    let finalMessage: string | undefined
    if (output?.messages && output.messages.length > 0) {
      const lastMessage = output.messages[output.messages.length - 1]
      if (lastMessage.content && typeof lastMessage.content === 'string') {
        finalMessage = lastMessage.content
      }
    }

    return { content: '', finalMessage }
  }

  private handleChatModelStream(event: any, is_subagent: boolean, agent_name: string): string {
    const chunk = event.data?.chunk
    const reasoningContent =
      chunk?.additional_kwargs?.reasoning_content ??
      chunk?.message?.additional_kwargs?.reasoning_content ??
      chunk?.kwargs?.additional_kwargs?.reasoning_content ??
      chunk?.thinking

    const rawContent = chunk?.content ?? chunk?.message?.content ?? chunk?.text ?? ''
    const contentStr = typeof rawContent === 'string' ? rawContent : ''
    const isThinkingContent = contentStr.includes('<think>') || contentStr.startsWith('<think')
    const hasEndThinkTag = contentStr.includes('</think>')

    // Detect thinking blocks in array content (Anthropic, etc.)
    const hasThinkingBlock = Array.isArray(rawContent) && rawContent.some(
      (item: any) => item?.type === 'thinking' || item?.type === 'reasoning'
    )

    if ((reasoningContent && reasoningContent !== '') || (isThinkingContent && !hasEndThinkTag) || hasThinkingBlock) {
      if (!this.inThinking) {
        this.inThinking = true
        remixAILogger.log('[StreamEventHandler] Thinking phase detected', {
          hasReasoningContent: !!reasoningContent,
          isThinkingContent,
          hasThinkingBlock,
          contentPreview: contentStr.substring(0, 100)
        })
        this.event.emit('onThinking', { isThinking: true, threadId: this.getThreadId() })
      }
    } else if (this.inThinking && (hasEndThinkTag || (!reasoningContent && !isThinkingContent && !hasThinkingBlock && contentStr.length > 0))) {
      this.inThinking = false
      remixAILogger.log('[StreamEventHandler] Thinking phase ended')
      this.event.emit('onThinking', { isThinking: false, threadId: this.getThreadId() })
    }

    // Suppress thinking text from being emitted as regular chat content.
    if (this.inThinking) return ''
    if (!rawContent) return ''

    let deltaContent = ''
    if (typeof rawContent === 'string') {
      deltaContent = rawContent
    } else if (Array.isArray(rawContent) && rawContent.length > 0) {
      if (rawContent[0]?.text) {
        deltaContent = rawContent[0].text
      } else if (typeof rawContent[0] === 'string') {
        deltaContent = rawContent[0]
      }
    }

    if (!deltaContent) return ''

    const currentRunId = event.run_id
    if (this.previousRunId !== null && this.previousRunId !== currentRunId) {
      // Log token usage when run_id changes (new agent turn)
      remixAILogger.log(`[DeepAgent-Tokens] Run ID changed: ${this.previousRunId} → ${currentRunId}`)
      deltaContent = '\n \n---\n' + deltaContent
    }
    this.previousRunId = currentRunId

    if (is_subagent) {
      this.event.emit('onStreamResult', {
        content: deltaContent,
        isIntermediate: this.isIntermediatePhase,
        source: event.metadata?.langgraph_node || 'agent',
        isSubagent: true,
        subagentName: agent_name,
        threadId: this.getThreadId()
      })
    } else {
      this.event.emit('onStreamResult', {
        content: deltaContent,
        isIntermediate: this.isIntermediatePhase,
        source: event.metadata?.langgraph_node || 'agent',
        isSubagent: false,
        subagentName: '',
        threadId: this.getThreadId()
      })
    }

    return deltaContent
  }

  private handleChatModelEnd(event: any, is_subagent: boolean, agent_name: string): string {
    const output = event.data?.output
    if (!output) return ''

    const usageMetadata = output.usage_metadata || output.response_metadata?.usage
    if (!usageMetadata) return ''

    const inputTokens = usageMetadata.input_tokens || usageMetadata.prompt_tokens || 0
    const outputTokens = usageMetadata.output_tokens || usageMetadata.completion_tokens || 0
    const totalTokens = usageMetadata.total_tokens || (inputTokens + outputTokens)

    // Extract cached token information (Anthropic-specific fields)
    let cacheReadInputTokens = usageMetadata.cache_read_input_tokens || 0
    cacheReadInputTokens = cacheReadInputTokens === 0 ? usageMetadata.input_token_details?.cache_read || 0 : cacheReadInputTokens
    let cacheCreationInputTokens = usageMetadata.cache_creation_input_tokens || 0
    cacheCreationInputTokens = cacheCreationInputTokens === 0 ? usageMetadata.input_token_details?.cache_creation || 0 : cacheCreationInputTokens

    // Update cumulative counts
    this.tokenUsage.totalInputTokens += inputTokens
    this.tokenUsage.totalOutputTokens += outputTokens
    this.tokenUsage.totalCacheReadTokens += cacheReadInputTokens
    this.tokenUsage.totalCacheCreationTokens += cacheCreationInputTokens
    this.tokenUsage.turnCount++

    remixAILogger.log(`[DeepAgent-Tokens]   Turn ${this.tokenUsage.turnCount} completed | run_id: ${event.run_id}`)
    remixAILogger.log(`[DeepAgent-Tokens]   Input (cache + no cache):  ${inputTokens} tokens `)
    remixAILogger.log(`[DeepAgent-Tokens]   Input (no cache):  ${inputTokens - cacheReadInputTokens} tokens`)
    remixAILogger.log(`[DeepAgent-Tokens]   Output: ${outputTokens} tokens`)
    remixAILogger.log(`[DeepAgent-Tokens]   Cache Read: ${cacheReadInputTokens} tokens`)
    remixAILogger.log(`[DeepAgent-Tokens]   Cache Creation: ${cacheCreationInputTokens} tokens`)
    remixAILogger.log(`[DeepAgent-Tokens]   Total:  ${totalTokens} tokens`)
    remixAILogger.log(`[DeepAgent-Tokens]   Cumulative: ${this.tokenUsage.totalInputTokens} in / ${this.tokenUsage.totalOutputTokens} out / ${this.tokenUsage.totalCacheReadTokens} cache-read / ${this.tokenUsage.totalCacheCreationTokens} cache-creation`)

    // Emit token usage event for UI tracking
    this.event.emit('onTokenUsage', {
      runId: event.run_id,
      inputTokens,
      outputTokens,
      totalTokens,
      cacheReadInputTokens,
      cacheCreationInputTokens,
      cumulativeInputTokens: this.tokenUsage.totalInputTokens,
      cumulativeOutputTokens: this.tokenUsage.totalOutputTokens,
      cumulativeCacheReadTokens: this.tokenUsage.totalCacheReadTokens,
      cumulativeCacheCreationTokens: this.tokenUsage.totalCacheCreationTokens,
      turnCount: this.tokenUsage.turnCount,
      timestamp: Date.now(),
      agentName: agent_name || 'main',
      isSubagent: is_subagent,
      threadId: this.getThreadId()
    })

    return ''
  }

  private handleToolStart(event: any): string {
    const toolName = event.name
    const toolInput = JSON.parse(event.data?.input.input || '{}')
    const toolUIString = resolveToolUIString(toolName, toolInput)
    remixAILogger.log('[StreamEventHandler] Tool call started:', toolName, toolInput, '| UI:', toolUIString)
    this.event.emit('onToolCall', { toolName, toolInput, toolUIString, status: 'start', threadId: this.getThreadId() })

    remixAILogger.log('[StreamEventHandler] Checking for todo updates in tool input...', toolInput.todos)
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

      remixAILogger.log('[StreamEventHandler] Todo list updated:', todos, 'Current index:', currentTodoIndex, 'Current todo:', currentTodoContent)

      this.event.emit('onTodoUpdate', {
        todos: todos,
        currentTodoIndex: currentTodoIndex,
        timestamp: Date.now(),
        threadId: this.getThreadId()
      })
    }

    return ''
  }

  private handleToolEnd(event: any): string {
    const toolName = event.name
    remixAILogger.log('[StreamEventHandler] Tool call ended:', toolName)
    this.event.emit('onToolCall', { toolName, toolInput: {}, toolUIString: '', status: 'end', threadId: this.getThreadId() })
    return ''
  }

  getTokenUsage(): TokenUsageState {
    return { ...this.tokenUsage }
  }

  logTokenSummary(): void {
    if (this.tokenUsage.turnCount > 0) {
      remixAILogger.log(`[DeepAgent-Tokens] ═══════════════════════════════════════`)
      remixAILogger.log(`[DeepAgent-Tokens]   Request Complete - Token Summary`)
      remixAILogger.log(`[DeepAgent-Tokens]   Total Turns:   ${this.tokenUsage.turnCount}`)
      remixAILogger.log(`[DeepAgent-Tokens]   Total Input (cache + no cache):   ${this.tokenUsage.totalInputTokens} tokens`)
      remixAILogger.log(`[DeepAgent-Tokens]   Total Input (no cache):   ${this.tokenUsage.totalInputTokens - this.tokenUsage.totalCacheReadTokens} tokens`)
      remixAILogger.log(`[DeepAgent-Tokens]   Total Output:  ${this.tokenUsage.totalOutputTokens} tokens`)
      remixAILogger.log(`[DeepAgent-Tokens]   Cache Read:    ${this.tokenUsage.totalCacheReadTokens} tokens`)
      remixAILogger.log(`[DeepAgent-Tokens]   Cache Creation: ${this.tokenUsage.totalCacheCreationTokens} tokens`)
      remixAILogger.log(`[DeepAgent-Tokens]   Grand Total:   ${this.tokenUsage.totalInputTokens + this.tokenUsage.totalOutputTokens} tokens`)
      remixAILogger.log(`[DeepAgent-Tokens] ═══════════════════════════════════════`)
    }
  }
}
