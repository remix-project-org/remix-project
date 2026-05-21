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
  private tokenUsage: TokenUsageState = {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCacheReadTokens: 0,
    totalCacheCreationTokens: 0,
    turnCount: 0
  }

  constructor(eventEmitter: EventEmitter) {
    this.event = eventEmitter
    this.inactivityTimeout = new InactivityTimeoutManager(INACTIVITY_TIMEOUT_MS, () => {
      console.warn('[DeepAgent] No activity for 10 seconds, handling timeout...')
      this.event.emit('onInactivityTimeout', {
        message: 'No response received for 10 seconds',
        timestamp: Date.now()
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
    const is_subagent = checkpoint_ns.includes('tools:')

    if (is_subagent) {
      console.log(`[StreamEventHandler] Stream event from subagent detected: ${eventType} (agent: ${agent_name})`, event)
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
      console.log(`[StreamEventHandler] Subagent execution started: ${agent_name} (run_id: ${event.run_id})`, event)
      this.activeSubagents.set(event.run_id, { name: agent_name, startTime: Date.now() })

      this.event.emit('onSubagentStart', {
        id: event.run_id,
        name: agent_name,
        task: event.data?.input?.task || 'Processing...',
        status: 'running'
      })
    }

    if (runName.includes('plan') || tags.includes('planning')) {
      console.log(`[StreamEventHandler] Planning phase started (run_id: ${event.run_id})`)
      this.event.emit('onTaskStart', {
        id: event.run_id,
        name: event.name || 'Planning',
        status: 'started'
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
      console.log(`[StreamEventHandler] Subagent completed: ${subagent.name} (run_id: ${event.run_id})`)
      const duration = Date.now() - subagent.startTime

      this.event.emit('onSubagentComplete', {
        id: event.run_id,
        name: subagent.name,
        status: 'completed',
        duration
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
    if (!chunk?.content) return ''

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

    if (!deltaContent) return ''

    const currentRunId = event.run_id
    if (this.previousRunId !== null && this.previousRunId !== currentRunId) {
      // Log token usage when run_id changes (new agent turn)
      console.log(`[DeepAgent-Tokens] Run ID changed: ${this.previousRunId} → ${currentRunId}`)
      deltaContent = '\n \n---\n' + deltaContent
    }
    this.previousRunId = currentRunId

    if (is_subagent) {
      this.event.emit('onStreamResult', {
        content: deltaContent,
        isIntermediate: this.isIntermediatePhase,
        source: event.metadata?.langgraph_node || 'agent',
        isSubagent: true,
        subagentName: agent_name
      })
    } else {
      this.event.emit('onStreamResult', {
        content: deltaContent,
        isIntermediate: this.isIntermediatePhase,
        source: event.metadata?.langgraph_node || 'agent',
        isSubagent: false,
        subagentName: ''
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

    console.log(`[DeepAgent-Tokens]   Turn ${this.tokenUsage.turnCount} completed | run_id: ${event.run_id}`)
    console.log(`[DeepAgent-Tokens]   Input (cache + no cache):  ${inputTokens} tokens `)
    console.log(`[DeepAgent-Tokens]   Input (no cache):  ${inputTokens - cacheReadInputTokens} tokens`)
    console.log(`[DeepAgent-Tokens]   Output: ${outputTokens} tokens`)
    console.log(`[DeepAgent-Tokens]   Cache Read: ${cacheReadInputTokens} tokens`)
    console.log(`[DeepAgent-Tokens]   Cache Creation: ${cacheCreationInputTokens} tokens`)
    console.log(`[DeepAgent-Tokens]   Total:  ${totalTokens} tokens`)
    console.log(`[DeepAgent-Tokens]   Cumulative: ${this.tokenUsage.totalInputTokens} in / ${this.tokenUsage.totalOutputTokens} out / ${this.tokenUsage.totalCacheReadTokens} cache-read / ${this.tokenUsage.totalCacheCreationTokens} cache-creation`)

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
      isSubagent: is_subagent
    })

    return ''
  }

  private handleToolStart(event: any): string {
    const toolName = event.name
    const toolInput = JSON.parse(event.data?.input.input || '{}')
    const toolUIString = resolveToolUIString(toolName, toolInput)
    console.log('[StreamEventHandler] Tool call started:', toolName, toolInput, '| UI:', toolUIString)
    this.event.emit('onToolCall', { toolName, toolInput, toolUIString, status: 'start' })

    console.log('[StreamEventHandler] Checking for todo updates in tool input...', toolInput.todos)
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

      console.log('[StreamEventHandler] Todo list updated:', todos, 'Current index:', currentTodoIndex, 'Current todo:', currentTodoContent)
      this.event.emit('onToolCall', { toolName: currentTodoContent, toolInput: { }, toolUIString: currentTodoUIString || currentTodoContent, status: 'start' }) // just for UI

      this.event.emit('onTodoUpdate', {
        todos: todos,
        currentTodoIndex: currentTodoIndex,
        timestamp: Date.now()
      })
    }

    return ''
  }

  private handleToolEnd(event: any): string {
    const toolName = event.name
    console.log('[StreamEventHandler] Tool call ended:', toolName)
    this.event.emit('onToolCall', { toolName, toolInput: {}, toolUIString: '', status: 'end' })
    return ''
  }

  getTokenUsage(): TokenUsageState {
    return { ...this.tokenUsage }
  }

  logTokenSummary(): void {
    if (this.tokenUsage.turnCount > 0) {
      console.log(`[DeepAgent-Tokens] ═══════════════════════════════════════`)
      console.log(`[DeepAgent-Tokens]   Request Complete - Token Summary`)
      console.log(`[DeepAgent-Tokens]   Total Turns:   ${this.tokenUsage.turnCount}`)
      console.log(`[DeepAgent-Tokens]   Total Input (cache + no cache):   ${this.tokenUsage.totalInputTokens} tokens`)
      console.log(`[DeepAgent-Tokens]   Total Input (no cache):   ${this.tokenUsage.totalInputTokens - this.tokenUsage.totalCacheReadTokens} tokens`)
      console.log(`[DeepAgent-Tokens]   Total Output:  ${this.tokenUsage.totalOutputTokens} tokens`)
      console.log(`[DeepAgent-Tokens]   Cache Read:    ${this.tokenUsage.totalCacheReadTokens} tokens`)
      console.log(`[DeepAgent-Tokens]   Cache Creation: ${this.tokenUsage.totalCacheCreationTokens} tokens`)
      console.log(`[DeepAgent-Tokens]   Grand Total:   ${this.tokenUsage.totalInputTokens + this.tokenUsage.totalOutputTokens} tokens`)
      console.log(`[DeepAgent-Tokens] ═══════════════════════════════════════`)
    }
  }
}
