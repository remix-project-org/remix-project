import type { DeepAgentInferencer } from '@remix/remix-ai-core'
import type {
  IRemixAIPlugin,
  StreamResultData,
  ToolCallData,
  SubagentStartData,
  SubagentCompleteData,
  TaskData,
  TodoUpdateData,
  AgentErrorData,
  TodoErrorData,
  ApiErrorData,
  ToolApprovalRequest
} from './types'

export class DeepAgentEventBridge {
  private listenersSetup = false

  private static readonly EVENTS = [
    'onInference',
    'onInferenceDone',
    'onStreamResult',
    'onStreamComplete',
    'onToolCall',
    'onSubagentStart',
    'onSubagentComplete',
    'onTaskStart',
    'onTaskComplete',
    'onTodoUpdate',
    'onAgentError',
    'onTodoError',
    'onApiError',
    'onToolApprovalRequired',
    'onTokenUsage',
    'onInactivityTimeout'
  ] as const

  setupListeners(inferencer: DeepAgentInferencer, plugin: IRemixAIPlugin): void {
    if (!inferencer || this.listenersSetup) {
      return
    }

    const eventEmitter = inferencer.getEventEmitter()

    // Remove all existing listeners first to prevent duplicates
    for (const event of DeepAgentEventBridge.EVENTS) {
      eventEmitter.removeAllListeners(event)
    }

    // Set up fresh listeners
    eventEmitter.on('onInference', () => {
      plugin.isInferencing = true
    })

    eventEmitter.on('onInferenceDone', () => {
      plugin.isInferencing = false
    })

    eventEmitter.on('onStreamResult', (data: string | StreamResultData) => {
      plugin.emit('onStreamResult', data)
    })

    eventEmitter.on('onStreamComplete', (finalText: string) => {
      plugin.emit('onStreamComplete', finalText)
    })

    eventEmitter.on('onToolCall', (data: ToolCallData) => {
      plugin.emit('onToolCall', data)
    })

    eventEmitter.on('onSubagentStart', (data: SubagentStartData) => {
      plugin.emit('onSubagentStart', data)
    })

    eventEmitter.on('onSubagentComplete', (data: SubagentCompleteData) => {
      plugin.emit('onSubagentComplete', data)
    })

    eventEmitter.on('onTaskStart', (data: TaskData) => {
      plugin.emit('onTaskStart', data)
    })

    eventEmitter.on('onTaskComplete', (data: TaskData) => {
      plugin.emit('onTaskComplete', data)
    })

    eventEmitter.on('onTodoUpdate', (data: TodoUpdateData) => {
      plugin.emit('onTodoUpdate', data)
    })

    // Error events for todo list updates
    eventEmitter.on('onAgentError', (data: AgentErrorData) => {
      plugin.emit('onAgentError', data)
    })

    eventEmitter.on('onTodoError', (data: TodoErrorData) => {
      plugin.emit('onTodoError', data)
    })

    // API error events (rate limits, quota exceeded, etc.)
    eventEmitter.on('onApiError', (data: ApiErrorData) => {
      plugin.emit('onApiError', data)
    })

    // Human-in-the-loop: relay approval requests to UI
    eventEmitter.on('onToolApprovalRequired', (request: ToolApprovalRequest) => {
      plugin.emit('onToolApprovalRequired', request)
    })

    this.listenersSetup = true
    console.log('[RemixAI Plugin] DeepAgent event listeners set up')
  }

  teardownListeners(inferencer: DeepAgentInferencer): void {
    if (!inferencer) return

    const eventEmitter = inferencer.getEventEmitter()
    eventEmitter.removeAllListeners()
    this.listenersSetup = false
  }

  isSetup(): boolean {
    return this.listenersSetup
  }

  resetSetup(): void {
    this.listenersSetup = false
  }
}
