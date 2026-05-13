/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import React, { useState, useEffect, useCallback, useRef, useImperativeHandle, MutableRefObject, useContext } from 'react'
//@ts-ignore
import '../css/remix-ai-assistant.css'

import { ChatCommandParser, GenerationParams, ChatHistory, HandleStreamResponse, listModels, isOllamaAvailable, AVAILABLE_MODELS, getDefaultModel, getModelById, AIModel } from '@remix/remix-ai-core'
import { ToolApprovalRequest } from '@remix/remix-ai-core'
import { HandleOpenAIResponse, HandleMistralAIResponse, HandleAnthropicResponse, HandleOllamaResponse } from '@remix/remix-ai-core'
//@ts-ignore
import '../css/color.css'
import { ModalTypes } from '@remix-ui/app'
import { MatomoEvent, AIEvent } from '@remix-api'
//@ts-ignore
import { TrackingContext } from '@remix-ide/tracking'
import { ChatHistoryComponent } from './chat'
import { ActivityType, ChatMessage, ConversationMetadata } from '../lib/types'
import { useOnClickOutside } from './onClickOutsideHook'
import { RemixAIAssistant } from 'apps/remix-ide/src/app/plugins/remix-ai-assistant'
import { useAudioTranscription } from '../hooks/useAudioTranscription'
import ChatHistoryHeading from './chatHistoryHeading'
import { ChatHistorySidebar } from './chatHistorySidebar'
import AiChatPromptAreaForHistory from './aiChatPromptAreaForHistory'
import AiChatPromptArea from './aiChatPromptArea'
import { useModelAccess } from '../hooks/useModelAccess'
import { ToolApprovalModal } from './ToolApprovalModal'

export interface RemixUiRemixAiAssistantProps {
  plugin: RemixAIAssistant
  isInitializing?: boolean
  queuedMessage: { text: string; timestamp: number } | null
  initialMessages?: ChatMessage[]
  onMessagesChange?: (msgs: ChatMessage[]) => void
  /** optional callback whenever the user or AI does something */
  onActivity?: (type: ActivityType, payload?: any) => void
  /** Conversation management props */
  conversations?: ConversationMetadata[]
  currentConversationId?: string | null
  showHistorySidebar?: boolean
  isMaximized?: boolean
  onNewConversation?: () => void
  onLoadConversation?: (id: string) => void
  onArchiveConversation?: (id: string) => void
  onDeleteConversation?: (id: string) => void
  onDeleteAllConversations?: () => void
  onToggleHistorySidebar?: () => void
  onSearch?: (query: string) => Promise<ConversationMetadata[]>
  onOpenSkillsModal?: () => void
}
export interface RemixUiRemixAiAssistantHandle {
  /** Programmatically send a prompt to the chat (returns after processing starts) */
  sendChat: (prompt: string) => Promise<void>
  /** Clears local chat history (parent receives onMessagesChange([])) */
  clearChat: () => void
  /** Returns current chat history array */
  getHistory: () => ChatMessage[]
}

function getSystemThemeFallback(): string {
  const bodyTheme = document.body.getAttribute('data-theme')
    || document.documentElement.getAttribute('data-theme')
  if (bodyTheme) return bodyTheme
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export const RemixUiRemixAiAssistant = React.forwardRef<
  RemixUiRemixAiAssistantHandle,
  RemixUiRemixAiAssistantProps
>(function RemixUiRemixAiAssistant(props, ref) {
  const [messages, setMessages] = useState<ChatMessage[]>(props.initialMessages || [])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [showModelOptions, setShowModelOptions] = useState(false)
  const [showModelSelector, setShowModelSelector] = useState(false)
  const [assistantChoice, setAssistantChoice] = useState<'openai' | 'mistralai' | 'anthropic' | 'ollama'>(
    'mistralai'
  )
  const [showArchivedConversations, setShowArchivedConversations] = useState(false)
  const [showButton, setShowButton] = useState(true);
  const [isAiChatMaximized, setIsAiChatMaximized] = useState(false)
  const [showOllamaModelSelector, setShowOllamaModelSelector] = useState(false)
  const [selectedOllamaModel, setSelectedOllamaModel] = useState<string | null>(null)
  const [selectedModelId, setSelectedModelId] = useState<string>(getDefaultModel().id)
  const mcpEnabled = true

  const [mcpEnhanced, setMcpEnhanced] = useState(mcpEnabled)
  const [pendingApprovals, setPendingApprovals] = useState<ToolApprovalRequest[]>([])
  const approvalQueueRef = useRef<ToolApprovalRequest[]>([])
  // Tracks which approval requests are currently being reviewed in the editor via showCustomDiff
  const [reviewingApprovals, setReviewingApprovals] = useState<Set<string>>(new Set())
  const pendingDiffApprovalRef = useRef<{ requestId: string; filePath: string } | null>(null)
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)
  const trackMatomoEvent = <T extends MatomoEvent = AIEvent>(event: T) => {
    baseTrackEvent?.<T>(event)
  }
  const modelAccess = useModelAccess()
  const [modelOpt, setModelOpt] = useState({ top: 0, left: 0 })
  const menuRef = useRef<any>()
  const [ollamaModels, setOllamaModels] = useState<string[]>([])
  const [selectedModel, setSelectedModel] = useState<AIModel>(getDefaultModel())
  const [isOllamaFailureFallback, setIsOllamaFailureFallback] = useState(false)
  const [autoModeEnabled, setAutoModeEnabled] = useState(false)
  const [themeTracker, setThemeTracker] = useState<{ name: string } | null>(() => ({ name: getSystemThemeFallback() }))
  const historyRef = useRef<HTMLDivElement | null>(null)
  const modelBtnRef = useRef(null)
  const modelSelectorBtnRef = useRef(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const aiChatRef = useRef<HTMLDivElement>(null)
  const userHasScrolledRef = useRef(false)
  const lastMessageCountRef = useRef(0)
  const abortControllerRef = useRef<AbortController | null>(null)
  const clearToolTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const uiToolCallbackRef = useRef<((isExecuting: boolean, toolName?: string, toolArgs?: Record<string, any>) => void) | null>(null)
  const wasInitializingRef = useRef(props.isInitializing)
  const streamingAssistantIdRef = useRef<string | null>(null)
  if (props.isInitializing) wasInitializingRef.current = true

  // Audio transcription hook
  const {
    isRecording,
    isTranscribing,
    error,
    toggleRecording
  } = useAudioTranscription({
    model: 'whisper-v3',
    onTranscriptionComplete: (text) => {
      // Check if transcription ends with "stop" (case-insensitive, with optional punctuation)
      const trimmedText = text.trim()
      const endsWithStop = /\bstop\b[\s.,!?;:]*$/i.test(trimmedText)

      if (endsWithStop) {
        // Remove "stop" and punctuation from the end and just append to input box (don't execute)
        const promptText = trimmedText.replace(/\bstop\b[\s.,!?;:]*$/i, '').trim()
        setInput(prev => prev ? `${prev} ${promptText}`.trim() : promptText)
        // Focus the textarea so user can review/edit
        if (textareaRef.current) {
          textareaRef.current.focus()
        }
        trackMatomoEvent({ category: 'ai', action: 'SpeechToTextPrompt', name: 'SpeechToTextPrompt', isClick: true })
      } else {
        // Append transcription to the input box only
        setInput(prev => prev ? `${prev} ${text}`.trim() : text)
        if (trimmedText) {
          trackMatomoEvent({ category: 'ai', action: 'SpeechToTextPrompt', name: 'SpeechToTextPrompt', isClick: true })
        }
        // Focus the textarea so user can review/edit before sending
        if (textareaRef.current) {
          textareaRef.current.focus()
        }
      }
    },
    onError: (error) => {
      console.error('Audio transcription error:', error)
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `**Audio transcription failed.**\n\nError: ${error.message}`,
        timestamp: Date.now(),
        sentiment: 'none'
      }])
    }
  })

  // Show transcribing status
  useEffect(() => {
    if (isTranscribing) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '***Transcribing audio...***',
        timestamp: Date.now(),
        sentiment: 'none'
      }])
    } else {
      // Remove transcribing message when done
      setMessages(prev => {
        const last = prev[prev.length - 1]
        if (last?.content === '***Transcribing audio...***') {
          return prev.slice(0, -1)
        }
        return prev
      })
    }
  }, [isTranscribing])

  useOnClickOutside([modelBtnRef], () => setShowModelSelector(false))
  useOnClickOutside([modelSelectorBtnRef], () => setShowOllamaModelSelector(false))

  const chatCmdParser = new ChatCommandParser(props.plugin)

  const dispatchActivity = useCallback(
    (type: ActivityType, payload?: any) => {
      props.onActivity?.(type, payload)
    },
    [props.onActivity]
  )

  useEffect(() => {
    if (props.plugin.externalMessage) {
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: props.plugin.externalMessage, timestamp: Date.now(), sentiment: 'none' }])
    }
  }, [props.plugin.externalMessage])

  // Sync messages when initialMessages changes (e.g., when loading a different conversation)
  useEffect(() => {
    if (props.initialMessages) {
      setMessages(props.initialMessages)
    }
  }, [props.initialMessages])

  // When switching conversations, clean up any in-flight streaming / pending approvals.
  const prevConversationIdRef = useRef(props.currentConversationId)
  useEffect(() => {
    if (prevConversationIdRef.current === props.currentConversationId) return
    prevConversationIdRef.current = props.currentConversationId

    // 1. Reject all pending approvals so DeepAgent's approvalGate unblocks
    setPendingApprovals(prev => {
      for (const approval of prev) {
        props.plugin.call('remixAI', 'respondToToolApproval', {
          requestId: approval.requestId,
          approved: false
        }).catch(() => { /* best-effort */ })
      }
      return []
    })
    setReviewingApprovals(new Set())

    // 2. Cancel the backend request and abort the frontend stream
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    props.plugin.call('remixAI', 'cancelRequest').catch(() => { /* best-effort */ })

    // 3. Stop the spinner so the new conversation starts clean
    setIsStreaming(false)
    streamingAssistantIdRef.current = null
    if (clearToolTimeoutRef.current) {
      clearTimeout(clearToolTimeoutRef.current)
      clearToolTimeoutRef.current = null
    }
    uiToolCallbackRef.current = null
  }, [props.currentConversationId, props.plugin])

  const handleOllamaModelSelection = useCallback(async (modelName: string) => {
    const previousModel = selectedOllamaModel
    setSelectedOllamaModel(modelName)
    setShowOllamaModelSelector(false)
    trackMatomoEvent({ category: 'ai', action: 'remixAI', name: 'ollama_model_selected', value: `${modelName}|from:${previousModel || 'none'}`, isClick: true })
    // Update the model in the backend
    try {
      await props.plugin.call('remixAI', 'setModel', modelName)
      trackMatomoEvent({ category: 'ai', action: 'remixAI', name: 'ollama_model_set_backend_success', value: modelName, isClick: false })
    } catch (error: any) {
      console.warn('Failed to set model:', error)
      trackMatomoEvent({ category: 'ai', action: 'remixAI', name: 'ollama_model_set_backend_failed', value: `${modelName}|${error.message || 'unknown'}`, isClick: false })
    }
    trackMatomoEvent<AIEvent>({ category: 'ai', action: 'remixAI', name: 'ollama_model_selected_final', value: modelName, isClick: true })
  }, [props.plugin, selectedOllamaModel])

  useEffect(() => {
    props.plugin.call('theme', 'currentTheme')
      .then((theme) => setThemeTracker(theme))
      .catch((error: any) => console.log(error))

    props.plugin.on('theme', 'themeChanged', (theme: any) => {
      setThemeTracker(theme)
    })
    return () => {
      props.plugin.off('theme', 'themeChanged')
    }
  }, [])

  useEffect(() => {
    // Initialize: fetch current model from plugin on mount
    const initializeModel = async () => {
      try {
        const currentModelId = await props.plugin.call('remixAI', 'getSelectedModel')
        const model = getModelById(currentModelId)
        if (model) {
          setSelectedModelId(currentModelId)
          setSelectedModel(model)
          setAssistantChoice(model.provider as 'openai' | 'mistralai' | 'anthropic' | 'ollama')
        }
        await props.plugin.call('remixAI', 'setModelAccess', modelAccess)
      } catch (error) {
        console.warn('[RemixAI Assistant UI] Failed to get initial model from plugin:', error)
      }
    }

    initializeModel()

    const handleModelChanged = async (modelId: string) => {
      console.log('[RemixAI Assistant UI] Model changed to:', modelId)
      const model = getModelById(modelId)
      if (model) {
        setSelectedModelId(modelId)
        setSelectedModel(model)
        setAssistantChoice(model.provider as 'openai' | 'mistralai' | 'anthropic' | 'ollama')
      }
    }

    props.plugin.on('remixAI', 'modelChanged', handleModelChanged)

    return () => {
      props.plugin.off('remixAI', 'modelChanged')
    }
  }, [props.plugin])

  useEffect(() => {
    let refreshTimeout: NodeJS.Timeout | null = null
    let isRefreshing = false // avoid circular calls

    const handleAuthStateChanged = async (authState: any) => {
      if (isRefreshing) return

      if (refreshTimeout) {
        clearTimeout(refreshTimeout)
      }

      refreshTimeout = setTimeout(async () => {
        isRefreshing = true
        if (authState.isAuthenticated) {
          console.log('Auth state changed to authenticated, refreshing model access...')
        } else {
          console.log('Auth state changed to logged out, refreshing model access and switching to default model...')
          // Switch back to default model on logout
          const defaultModel = getDefaultModel()
          setSelectedModelId(defaultModel.id)
          setSelectedModel(defaultModel)
          setAssistantChoice(defaultModel.provider as 'openai' | 'mistralai' | 'anthropic' | 'ollama')
          try {
            await props.plugin.call('remixAI', 'setModel', defaultModel.id)
          } catch (error) {
            console.warn('Failed to set default model on logout:', error)
          }
        }
        await modelAccess.refreshAccess()
        isRefreshing = false
      }, 500) // Reduced from 2000ms to 500ms for faster UI Update
    }

    props.plugin.on('auth', 'authStateChanged', handleAuthStateChanged)

    return () => {
      if (refreshTimeout) {
        clearTimeout(refreshTimeout)
      }
      props.plugin.off('auth', 'authStateChanged')
    }
  }, [props.plugin])

  // Listen for streaming chunks from DeepAgent
  useEffect(() => {
    // Handle stream chunks - supports both legacy string format and new object format
    const handleStreamChunk = (data: string | { content: string; isIntermediate?: boolean; source?: string; isSubagent?: boolean; subagentName?: string }) => {
      const chunk = typeof data === 'string' ? data : data.content
      const isIntermediate = typeof data === 'object' ? data.isIntermediate : false
      const isSubagent = typeof data === 'object' ? data.isSubagent : false
      const subagentName = typeof data === 'object' ? data.subagentName : undefined

      if (streamingAssistantIdRef.current) {
        setMessages(prev =>
          prev.map(m =>
            m.id === streamingAssistantIdRef.current
              ? {
                ...m,
                content: m.content + chunk,
                isIntermediateContent: isIntermediate,
                isSubagentStreaming: isSubagent,
                streamingSubagentName: subagentName
              }
              : m
          )
        )
      }
    }

    const handleStreamComplete = (finalText: string) => {
      // Save to chat history when streaming completes
      if (streamingAssistantIdRef.current) {
        const assistantId = streamingAssistantIdRef.current
        setMessages(prev => {
          const userMsg = prev[prev.length - 2]
          if (userMsg && userMsg.role === 'user' && finalText) {
            Promise.resolve(ChatHistory.pushHistory(userMsg.content, finalText)).then(() => props.plugin.loadConversations())
          }
          // Clear all streaming and agent-related states
          return prev.map(m =>
            m.id === assistantId
              ? {
                ...m,
                isSubagentStreaming: false,
                streamingSubagentName: undefined,
                activeSubagent: undefined,
                subagentTask: undefined,
                isExecutingTools: false,
                executingToolName: undefined,
                executingToolArgs: undefined,
                executingToolUIString: undefined,
                currentTask: undefined,
                taskStatus: undefined,
                isIntermediateContent: false
              }
              : m
          )
        })
      }
      setIsStreaming(false)
      streamingAssistantIdRef.current = null
    }

    // Handle tool call events from DeepAgent
    const handleToolCall = (data: { toolName: string; toolInput?: any; toolUIString?: string; toolOutput?: any; status: 'start' | 'end' }) => {
      console.log('[RemixAI Assistant] Tool call event:', data)
      const assistantId = streamingAssistantIdRef.current
      if (!assistantId) return

      if (data.status === 'start') {
        setMessages(prev =>
          prev.map(m => (m.id === assistantId ? {
            ...m,
            isExecutingTools: true,
            executingToolName: data.toolName,
            executingToolArgs: data.toolInput,
            executingToolUIString: data.toolUIString
          } : m))
        )
      } else {
        setMessages(prev =>
          prev.map(m => (m.id === assistantId ? {
            ...m,
            isExecutingTools: false,
            executingToolName: undefined,
            executingToolArgs: undefined,
            executingToolUIString: undefined
          } : m))
        )
      }
    }

    // Handle subagent start events
    const handleSubagentStart = (data: { id: string; name: string; task: string; status: string }) => {
      console.log('[RemixAI Assistant] Subagent started:', data)
      if (streamingAssistantIdRef.current) {
        setMessages(prev =>
          prev.map(m =>
            m.id === streamingAssistantIdRef.current
              ? { ...m, activeSubagent: data.name, subagentTask: data.task }
              : m
          )
        )
      }
    }

    // Handle subagent complete events
    const handleSubagentComplete = (data: { id: string; name: string; status: string; duration: number }) => {
      console.log('[RemixAI Assistant] Subagent completed:', data)
      if (streamingAssistantIdRef.current) {
        setMessages(prev =>
          prev.map(m =>
            m.id === streamingAssistantIdRef.current
              ? {
                ...m,
                activeSubagent: undefined,
                subagentTask: undefined,
                isSubagentStreaming: false,
                streamingSubagentName: undefined
              }
              : m
          )
        )
      }
    }

    // Handle task start events
    const handleTaskStart = (data: { id: string; name: string; status: string }) => {
      console.log('[RemixAI Assistant] Task started:', data)
      if (streamingAssistantIdRef.current) {
        setMessages(prev =>
          prev.map(m =>
            m.id === streamingAssistantIdRef.current
              ? { ...m, currentTask: data.name, taskStatus: 'running' }
              : m
          )
        )
      }
    }

    // Handle task complete events
    const handleTaskComplete = (data: { id: string; name: string; status: string }) => {
      console.log('[RemixAI Assistant] Task completed:', data)
      if (streamingAssistantIdRef.current) {
        setMessages(prev =>
          prev.map(m =>
            m.id === streamingAssistantIdRef.current
              ? { ...m, currentTask: undefined, taskStatus: 'completed' }
              : m
          )
        )
      }
    }

    // Handle todo update events from DeepAgent's write_todos tool
    const handleTodoUpdate = (data: { todos: any[]; currentTodoIndex?: number; timestamp: number }) => {
      console.log('[RemixAI Assistant] Todo list updated:', data)
      if (streamingAssistantIdRef.current) {
        setMessages(prev =>
          prev.map(m =>
            m.id === streamingAssistantIdRef.current
              ? { ...m, todos: data.todos, currentTodoIndex: data.currentTodoIndex }
              : m
          )
        )
      }
    }

    // Handle error events - mark current todo as failed
    const handleTodoError = (data: { error: string; timestamp: number }) => {
      console.log('[RemixAI Assistant] Todo error received:', data)
      if (streamingAssistantIdRef.current) {
        setMessages(prev =>
          prev.map(m => {
            if (m.id !== streamingAssistantIdRef.current) return m
            // Mark the current in-progress todo as failed
            const updatedTodos = m.todos?.map((todo, idx) => {
              if (todo.status === 'in_progress' || idx === m.currentTodoIndex) {
                return { ...todo, status: 'failed' as const }
              }
              return todo
            })
            return {
              ...m,
              todos: updatedTodos,
              isExecutingTools: false,
              executingToolName: undefined,
              executingToolArgs: undefined,
              executingToolUIString: undefined
            }
          })
        )
      }
    }

    // Handle agent error events - display error message
    const handleAgentError = (data: { message: string; timestamp: number; type: string }) => {
      console.error('[RemixAI Assistant] Agent error:', data)
      if (streamingAssistantIdRef.current) {
        setMessages(prev =>
          prev.map(m =>
            m.id === streamingAssistantIdRef.current
              ? {
                ...m,
                content: m.content + `\n\n**Error:** ${data.message}`,
                isExecutingTools: false,
                executingToolName: undefined,
                executingToolArgs: undefined,
                executingToolUIString: undefined
              }
              : m
          )
        )
      }
    }

    // Handle API errors (rate limits, quota exceeded, etc.)
    const handleApiError = (data: { type: string; message: string; retryable: boolean; retryAfter?: number; originalError?: string; timestamp: number }) => {
      console.error('[RemixAI Assistant] API error:', data)
      setIsStreaming(false)

      if (streamingAssistantIdRef.current) {
        setMessages(prev =>
          prev.map(m =>
            m.id === streamingAssistantIdRef.current
              ? {
                ...m,
                content: m.content + `\n${data.message}`,
                isExecutingTools: false,
                executingToolName: undefined,
                executingToolArgs: undefined,
                executingToolUIString: undefined
              }
              : m
          )
        )
      }
    }

    props.plugin.on('remixAI', 'onStreamResult', handleStreamChunk)
    props.plugin.on('remixAI', 'onStreamComplete', handleStreamComplete)
    props.plugin.on('remixAI', 'onToolCall', handleToolCall)
    props.plugin.on('remixAI', 'onSubagentStart', handleSubagentStart)
    props.plugin.on('remixAI', 'onSubagentComplete', handleSubagentComplete)
    props.plugin.on('remixAI', 'onTaskStart', handleTaskStart)
    props.plugin.on('remixAI', 'onTaskComplete', handleTaskComplete)
    props.plugin.on('remixAI', 'onTodoUpdate', handleTodoUpdate)
    props.plugin.on('remixAI', 'onTodoError', handleTodoError)
    props.plugin.on('remixAI', 'onAgentError', handleAgentError)
    props.plugin.on('remixAI', 'onApiError', handleApiError)

    // Human-in-the-loop: listen for tool approval requests (batch processing)
    const handleToolApproval = (request: ToolApprovalRequest) => {
      setPendingApprovals(prev => [...prev, request])
    }
    props.plugin.on('remixAI', 'onToolApprovalRequired', handleToolApproval)

    // DApp update review: listen for post-update file changes
    const handleDappUpdateCompleted = (data: { slug: string; files: Record<string, string>; backups: Record<string, string> }) => {
      console.log('[DAppReview] Update completed for:', data.slug, '- files:', Object.keys(data.files).length)
      // Find the latest assistant message (may or may not be streaming) and attach review data
      setMessages(prev => {
        // Find the last assistant message to attach the review to
        const lastAssistantIdx = [...prev].reverse().findIndex(m => m.role === 'assistant')
        if (lastAssistantIdx === -1) return prev
        const targetIdx = prev.length - 1 - lastAssistantIdx
        return prev.map((m, idx) =>
          idx === targetIdx
            ? {
              ...m,
              dappUpdateReview: {
                workspaceName: data.slug,
                files: data.files,
                backups: data.backups,
                status: 'pending' as const
              }
            }
            : m
        )
      })
    }
    props.plugin.on('remixAI', 'onDappUpdateCompleted', handleDappUpdateCompleted)

    return () => {
      props.plugin.off('remixAI', 'onStreamResult')
      props.plugin.off('remixAI', 'onStreamComplete')
      props.plugin.off('remixAI', 'onToolCall')
      props.plugin.off('remixAI', 'onSubagentStart')
      props.plugin.off('remixAI', 'onSubagentComplete')
      props.plugin.off('remixAI', 'onTaskStart')
      props.plugin.off('remixAI', 'onTaskComplete')
      props.plugin.off('remixAI', 'onTodoUpdate')
      props.plugin.off('remixAI', 'onTodoError')
      props.plugin.off('remixAI', 'onAgentError')
      props.plugin.off('remixAI', 'onApiError')
      props.plugin.off('remixAI', 'onToolApprovalRequired')
      props.plugin.off('remixAI', 'onDappUpdateCompleted')
    }
  }, [props.plugin])

  // bubble messages up to parent
  useEffect(() => {
    props.onMessagesChange?.(messages)
  }, [messages, props.onMessagesChange])

  // Smart auto-scroll: only scroll to bottom if:
  useEffect(() => {
    const node = historyRef.current
    if (!node || messages.length === 0) return

    const isAtBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 100
    const userSentNewMessage = messages.length > lastMessageCountRef.current &&
                                messages[messages.length - 1]?.role === 'user'
    // Auto-scroll conditions:
    // - User sent a new message (always scroll)
    // - User hasn't manually scrolled up (userHasScrolledRef is false)
    // - Currently streaming and user is near bottom
    if (userSentNewMessage || !userHasScrolledRef.current || (isStreaming && isAtBottom)) {
      node.scrollTop = node.scrollHeight
      userHasScrolledRef.current = false
    }

    lastMessageCountRef.current = messages.length
  }, [messages, isStreaming])

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [])

  useEffect(() => {
    // Focus textarea when streaming stops (after request processing)
    if (!isStreaming && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [isStreaming])

  // helper to toggle like / dislike feedback and push Matomo events
  const recordFeedback = (msgId: string, next: 'like' | 'dislike' | 'none') => {
    setMessages(prev =>
      prev.map(m => (m.id === msgId ? { ...m, sentiment: next } : m))
    )
    if (next === 'like') {
      trackMatomoEvent<AIEvent>({ category: 'ai', action: 'remixAI', name: 'like-response', isClick: true })
    } else if (next === 'dislike') {
      trackMatomoEvent<AIEvent>({ category: 'ai', action: 'remixAI', name: 'dislike-response', isClick: true })
    }
  }

  // Helper: remove a specific approval from the pending list
  const removeApproval = useCallback((requestId: string) => {
    setReviewingApprovals(prev => {
      const next = new Set(prev)
      next.delete(requestId)
      return next
    })
    pendingDiffApprovalRef.current = null
    setPendingApprovals(prev => prev.filter(approval => approval.requestId !== requestId))
  }, [])

  /**
   * Open showCustomDiff in the editor for line-by-line review.
   * The agent stays blocked until the user clicks Accept All or Reject All.
   */
  const handleReviewChanges = useCallback(async (approval: ToolApprovalRequest) => {
    if (!approval) return
    const { proposedContent, requestId } = approval
    const { filePath } = approval
    if (!filePath || !proposedContent) {
      console.warn('[HITL][Review] Cannot open review — missing filePath or proposedContent')
      return
    }

    // Normalize path: Remix fileManager expects paths without leading '/'
    // (e.g. 'contracts/X.sol', not '/contracts/X.sol')
    const normalizedPath = filePath.replace(/^\/+/, '')

    try {
      // For new files: create empty file and open it (same as Stefan's handler pattern)
      const exists = await props.plugin.call('fileManager', 'exists', normalizedPath)
      if (!exists) {

        await props.plugin.call('fileManager', 'writeFile', normalizedPath, '')
      }
      await props.plugin.call('fileManager', 'open', normalizedPath)

      // Store pending state before calling showCustomDiff
      pendingDiffApprovalRef.current = { requestId, filePath: normalizedPath }
      setReviewingApprovals(prev => new Set([...prev, requestId]))

      // Call showCustomDiff — this shows inline diff with Accept/Decline widgets
      await props.plugin.call('editor', 'showCustomDiff', normalizedPath, proposedContent)

    } catch (err) {
      console.error('[HITL][Review] Failed to open showCustomDiff:', err)
      // Fallback: reset reviewing state so the modal buttons are usable again
      setReviewingApprovals(prev => {
        const next = new Set(prev)
        next.delete(requestId)
        return next
      })
      pendingDiffApprovalRef.current = null
    }
  }, [props.plugin])

  // Listen for Accept All / Reject All events from the editor
  useEffect(() => {
    const handleDiffAccepted = async (file: string) => {
      const pending = pendingDiffApprovalRef.current
      if (!pending) return

      // Read the final editor model content (includes selective accept/decline)
      let finalContent: string | undefined
      try {
        finalContent = await props.plugin.call('editor', 'getText')

      } catch (err) {
        console.warn('[HITL][Review] Could not read editor text, using proposedContent as fallback')
      }

      // Send approval with the final content as modifiedArgs
      const modifiedArgs = finalContent ? { content: finalContent } : undefined
      props.plugin.call('remixAI', 'respondToToolApproval', {
        requestId: pending.requestId,
        approved: true,
        modifiedArgs
      })

      removeApproval(pending.requestId)
    }

    const handleDiffRejected = (file: string) => {
      const pending = pendingDiffApprovalRef.current
      if (!pending) return

      props.plugin.call('remixAI', 'respondToToolApproval', {
        requestId: pending.requestId,
        approved: false
      })

      removeApproval(pending.requestId)
    }

    props.plugin.on('editor', 'customDiffAccepted', handleDiffAccepted)
    props.plugin.on('editor', 'customDiffRejected', handleDiffRejected)

    return () => {
      props.plugin.off('editor', 'customDiffAccepted')
      props.plugin.off('editor', 'customDiffRejected')
    }
  }, [props.plugin, removeApproval])

  const handleApproveToolAction = useCallback(async (approval: ToolApprovalRequest, modifiedArgs?: Record<string, any>) => {
    if (!approval) return

    // Close DiffEditor tab if the user had opened a Review
    if (reviewingApprovals.has(approval.requestId)) {
      try {
        const sessions = await props.plugin.call('editor', 'getDiffSessions')
        for (const session of sessions) {
          await props.plugin.call('editor', 'closeDiffSession', session.id)
        }
      } catch (err) {
        console.warn('[HITL] Failed to close diff sessions:', err)
      }
    }

    props.plugin.call('remixAI', 'respondToToolApproval', {
      requestId: approval.requestId,
      approved: true,
      modifiedArgs
    })
    removeApproval(approval.requestId)
  }, [props.plugin, removeApproval, reviewingApprovals])

  const handleRejectToolAction = useCallback(async (approval: ToolApprovalRequest) => {
    if (!approval) return

    // Close DiffEditor tab if the user had opened a Review
    if (reviewingApprovals.has(approval.requestId)) {
      try {
        const sessions = await props.plugin.call('editor', 'getDiffSessions')
        for (const session of sessions) {
          await props.plugin.call('editor', 'closeDiffSession', session.id)
        }
      } catch (err) {
        console.warn('[HITL] Failed to close diff sessions:', err)
      }
    }

    props.plugin.call('remixAI', 'respondToToolApproval', {
      requestId: approval.requestId,
      approved: false
    })
    removeApproval(approval.requestId)
  }, [props.plugin, removeApproval, reviewingApprovals])

  const handleTimeoutToolAction = useCallback(async (approval: ToolApprovalRequest) => {
    if (!approval) return
    props.plugin.call('remixAI', 'respondToToolApproval', {
      requestId: approval.requestId,
      approved: false,
      timedOut: true
    })
    removeApproval(approval.requestId)
  }, [props.plugin, removeApproval])

  // Handle approving all pending approvals at once
  const handleApproveAll = useCallback(async () => {
    // Close any open DiffEditor sessions first
    if (reviewingApprovals.size > 0) {
      try {
        const sessions = await props.plugin.call('editor', 'getDiffSessions')
        for (const session of sessions) {
          await props.plugin.call('editor', 'closeDiffSession', session.id)
        }
      } catch (err) {
        console.warn('[HITL] Failed to close diff sessions:', err)
      }
    }

    const approvals = [...pendingApprovals]
    for (const approval of approvals) {
      props.plugin.call('remixAI', 'respondToToolApproval', {
        requestId: approval.requestId,
        approved: true
      })
    }
    setPendingApprovals([])
    setReviewingApprovals(new Set())
  }, [pendingApprovals, props.plugin, reviewingApprovals])

  // Handle rejecting all pending approvals at once
  const handleRejectAll = useCallback(async () => {
    // Close any open DiffEditor sessions first
    if (reviewingApprovals.size > 0) {
      try {
        const sessions = await props.plugin.call('editor', 'getDiffSessions')
        for (const session of sessions) {
          await props.plugin.call('editor', 'closeDiffSession', session.id)
        }
      } catch (err) {
        console.warn('[HITL] Failed to close diff sessions:', err)
      }
    }

    const approvals = [...pendingApprovals]
    for (const approval of approvals) {
      props.plugin.call('remixAI', 'respondToToolApproval', {
        requestId: approval.requestId,
        approved: false
      })
    }
    setPendingApprovals([])
    setReviewingApprovals(new Set())
  }, [pendingApprovals, props.plugin, reviewingApprovals])

  // ── DApp Update Review Handlers ──

  /** Close any open diff editor sessions */
  const closeDiffSessions = useCallback(async () => {
    try {
      const sessions = await props.plugin.call('editor', 'getDiffSessions')
      for (const session of sessions) {
        await props.plugin.call('editor', 'closeDiffSession', session.id)
      }
    } catch (err) {
      console.warn('[DAppReview] Failed to close diff sessions:', err)
    }
  }, [props.plugin])

  const handleDappReviewAcceptAll = useCallback(async (msgId: string) => {
    console.log('[DAppReview] Accept all for message:', msgId)
    await closeDiffSessions()
    // Remove review data entirely so the card disappears
    setMessages(prev =>
      prev.map(m =>
        m.id === msgId && m.dappUpdateReview
          ? { ...m, dappUpdateReview: { ...m.dappUpdateReview, status: 'accepted' as const } }
          : m
      )
    )
  }, [closeDiffSessions])

  const handleDappReviewRevertAll = useCallback(async (msgId: string) => {
    const msg = messages.find(m => m.id === msgId)
    if (!msg?.dappUpdateReview) return
    const { backups, workspaceName } = msg.dappUpdateReview

    console.log('[DAppReview] Reverting', Object.keys(backups).length, 'files in', workspaceName)

    // Close diff editors first
    await closeDiffSessions()

    try {
      // Ensure we're on the right workspace
      const currentWs = await props.plugin.call('filePanel', 'getCurrentWorkspace')
      if (currentWs?.name !== workspaceName) {
        await props.plugin.call('filePanel' as any, 'switchToWorkspace', {
          name: workspaceName,
          isLocalhost: false,
        })
        await new Promise(r => setTimeout(r, 300))
      }

      // Restore each backup file
      for (const [filePath, originalContent] of Object.entries(backups)) {
        const normalizedPath = filePath.startsWith('/') ? filePath : `/${filePath}`
        try {
          if (originalContent === '') {
            try {
              await props.plugin.call('fileManager', 'remove', normalizedPath)
              console.log('[DAppReview] Deleted new file:', normalizedPath)
            } catch (e) {
              console.warn('[DAppReview] Could not delete:', normalizedPath)
            }
          } else {
            await props.plugin.call('fileManager', 'writeFile', normalizedPath, originalContent)
            console.log('[DAppReview] Reverted:', normalizedPath)
          }
        } catch (e: any) {
          console.error('[DAppReview] Failed to revert file:', normalizedPath, e?.message)
        }
      }

      // Mark as reverted (card will hide via return null)
      setMessages(prev =>
        prev.map(m =>
          m.id === msgId && m.dappUpdateReview
            ? { ...m, dappUpdateReview: { ...m.dappUpdateReview, status: 'reverted' as const } }
            : m
        )
      )
      console.log('[DAppReview] All files reverted in', workspaceName)
    } catch (e: any) {
      console.error('[DAppReview] Revert failed:', e?.message)
    }
  }, [messages, props.plugin, closeDiffSessions])

  const handleDappReviewViewDiff = useCallback(async (filePath: string, newContent: string, oldContent: string) => {
    try {
      const normalizedPath = filePath.replace(/^\/+/, '')
      console.log('[DAppReview] Opening diff for:', normalizedPath)

      // showCustomDiff compares current file content against proposed content.
      // Since the new content is already on disk, temporarily write old content
      // so the diff correctly shows before → after.
      const currentContent = await props.plugin.call('fileManager', 'readFile', normalizedPath).catch(() => '')

      if (currentContent === newContent && oldContent) {
        await props.plugin.call('fileManager', 'writeFile', normalizedPath, oldContent)
      }

      await props.plugin.call('fileManager', 'open', normalizedPath)
      await props.plugin.call('editor', 'showCustomDiff', normalizedPath, newContent)
    } catch (err) {
      console.error('[DAppReview] Failed to show diff:', err)
    }
  }, [props.plugin])

  // Push a queued message (if any) into history once props update
  useEffect(() => {
    if (props.queuedMessage) {
      const { text, timestamp } = props.queuedMessage
      setMessages(prev => [
        ...prev,
        { id: crypto.randomUUID(), role: 'user', content: text, timestamp }
      ])
    }
  }, [props.queuedMessage])

  // Stop ongoing request
  const stopRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      setIsStreaming(false)

      if (clearToolTimeoutRef.current) {
        clearTimeout(clearToolTimeoutRef.current)
        clearToolTimeoutRef.current = null
      }

      uiToolCallbackRef.current = null
      streamingAssistantIdRef.current = null
      setMessages(prev => {
        const cleanedMessages = prev
          .filter(m => {
            if (m.role !== 'assistant') return true
            const content = m.content.trim()
            return content !== '' && !content.startsWith('***')
          })
          .map(m => ({
            ...m,
            isExecutingTools: false,
            executingToolName: undefined,
            executingToolArgs: undefined,
            executingToolUIString: undefined,
            activeSubagent: undefined,
            subagentTask: undefined,
            currentTask: undefined,
            taskStatus: undefined,
            isIntermediateContent: undefined
          }))

        return [
          ...cleanedMessages,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: '**Request stopped by user!**',
            timestamp: Date.now(),
            sentiment: 'none'
          }
        ]
      })

      // Cancel the backend fetch so the server stops generating
      props.plugin.call('remixAI', 'cancelRequest').catch(() => { /* best-effort */ })

      // Clear all pending HITL approval modals from the aborted request
      setPendingApprovals([])
      setReviewingApprovals(new Set())

      trackMatomoEvent({ category: 'ai', action: 'remixAI', name: 'StopRequest', isClick: true })
    }
  }, [props.plugin])

  // reusable sender (used by both UI button and imperative ref)
  const sendPrompt = useCallback(
    async (prompt: string) => {
      const trimmed = prompt.trim()
      if (!trimmed || isStreaming) return

      dispatchActivity('promptSend', trimmed)

      // optimistic user message
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: trimmed,
        timestamp: Date.now()
      }
      setMessages(prev => [...prev, userMsg])

      // If this is the first message in the conversation, optimistically show it in the sidebar
      if (messages.length === 0 && props.currentConversationId) {
        props.plugin.onFirstPromptSent(props.currentConversationId, trimmed)
      }

      /** append streaming chunks helper - clears tool status when content arrives */
      const appendAssistantChunk = (msgId: string, chunk: string) => {
        // Clear any pending tool status timeout since content is now displaying
        if (clearToolTimeoutRef.current) {
          clearTimeout(clearToolTimeoutRef.current)
          clearToolTimeoutRef.current = null
        }

        setMessages(prev =>
          prev.map(m => (m.id === msgId ? {
            ...m,
            content: m.content + chunk,
            // Clear tool execution status when content starts arriving
            isExecutingTools: false,
            executingToolName: undefined,
            executingToolArgs: undefined,
            executingToolUIString: undefined
          } : m))
        )
      }

      try {
        // Create new AbortController for this request
        abortControllerRef.current = new AbortController()
        setIsStreaming(true)

        // Add temporary assistant message for parsing status
        const parsingId = crypto.randomUUID()
        setMessages(prev => [
          ...prev,
          { id: parsingId, role: 'assistant', content: '***Processing command...***', timestamp: Date.now(), sentiment: 'none' }
        ])

        // callback to update parsing status with minimum display time
        const updateParsingStatus = (status: string): Promise<void> => {
          setMessages(prev =>
            prev.map(m => (m.id === parsingId ? { ...m, content: `***${status}***` } : m))
          )
          return new Promise<void>(resolve => setTimeout(resolve, 400))
        }

        const parseResult = await chatCmdParser.parse(trimmed, updateParsingStatus)

        if (parseResult) {
          // Remove the temporary parsing message and add the actual result
          setMessages(prev => [
            ...prev.filter(m => m.id !== parsingId),
            {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: parseResult,
              timestamp: Date.now(),
              sentiment: 'none'
            }
          ])
          setIsStreaming(false)
          return
        }
        // Remove all temporary parsing message if no parse result
        setMessages(prev => prev.filter(m => m.id !== parsingId))

        GenerationParams.stream_result = true
        GenerationParams.stream = true
        GenerationParams.return_stream_response = true
        GenerationParams.threadId = await props.plugin.call('remixAI', 'getAssistantThrId') || ""

        const pending = await props.plugin.call('remixAI', 'isChatRequestPending')
        const response = pending
          ? await props.plugin.call('remixAI', 'ProcessChatRequestBuffer', GenerationParams)
          : await props.plugin.call('remixAI', 'answer', trimmed, GenerationParams)

        console.log('Received response from plugin:', response)

        // Handle langchain/deepagent mode: response is plain text
        if (typeof response === 'string') {
          const assistantId = crypto.randomUUID()

          // If response is empty, this is a streaming response
          // Set up an empty message that will be filled by stream events
          if (response === '' || response.length === 0) {
            streamingAssistantIdRef.current = assistantId
            setMessages(prev => [
              ...prev,
              { id: assistantId, role: 'assistant', content: '', timestamp: Date.now(), sentiment: 'none' }
            ])
            // Don't setIsStreaming(false) here - let the stream complete
            // The streaming will continue via the onStreamResult event listener
            return
          }

          // If response has content, it's the final non-streamed response
          setMessages(prev => [
            ...prev,
            { id: assistantId, role: 'assistant', content: response, timestamp: Date.now(), sentiment: 'none' }
          ])
          Promise.resolve(ChatHistory.pushHistory(trimmed, response)).then(() => props.plugin.loadConversations())
          setIsStreaming(false)
          streamingAssistantIdRef.current = null
          return
        }

        const assistantId = crypto.randomUUID()
        setMessages(prev => [
          ...prev,
          { id: assistantId, role: 'assistant', content: '', timestamp: Date.now(), sentiment: 'none' }
        ])

        // Add tool execution callback with minimum display time
        let toolExecutionStartTime: number | null = null

        const uiToolCallback = (isExecuting: boolean, toolName?: string, toolArgs?: Record<string, any>) => {
          const MIN_DISPLAY_TIME = 30000 // 30 seconds

          // Clear any pending timeout
          if (clearToolTimeoutRef.current) {
            clearTimeout(clearToolTimeoutRef.current)
            clearToolTimeoutRef.current = null
          }

          if (isExecuting) {
            if (!toolExecutionStartTime) {
              toolExecutionStartTime = Date.now()
            }

            setMessages(prev =>
              prev.map(m => (m.id === assistantId ? {
                ...m,
                // Only show tool execution indicator if no content has arrived yet
                isExecutingTools: m.content.length === 0 ? isExecuting : m.isExecutingTools,
                executingToolName: m.content.length === 0 ? toolName : m.executingToolName,
                executingToolArgs: m.content.length === 0 ? toolArgs : m.executingToolArgs
              } : m))
            )
          } else {
            // Tool execution ending - check minimum display time
            if (toolExecutionStartTime) {
              const elapsedTime = Date.now() - toolExecutionStartTime
              const remainingTime = MIN_DISPLAY_TIME - elapsedTime

              if (remainingTime > 0) {
                // Not enough time has passed - delay the clearing
                clearToolTimeoutRef.current = setTimeout(() => {
                  setMessages(prev =>
                    prev.map(m => (m.id === assistantId ? {
                      ...m,
                      isExecutingTools: false,
                      executingToolName: undefined,
                      executingToolArgs: undefined,
                      executingToolUIString: undefined
                    } : m))
                  )
                  toolExecutionStartTime = null
                }, remainingTime)
              } else {
                // Enough time has passed - clear immediately
                setMessages(prev =>
                  prev.map(m => (m.id === assistantId ? {
                    ...m,
                    isExecutingTools: false,
                    executingToolName: undefined,
                    executingToolArgs: undefined,
                    executingToolUIString: undefined
                  } : m))
                )
                toolExecutionStartTime = null
              }
            } else {
              // No start time recorded - clear immediately
              setMessages(prev =>
                prev.map(m => (m.id === assistantId ? {
                  ...m,
                  isExecutingTools: false,
                  executingToolName: undefined,
                  executingToolArgs: undefined,
                  executingToolUIString: undefined
                } : m))
              )
            }
          }
        }
        uiToolCallbackRef.current = uiToolCallback

        // Attach the callback and abort signal to the response if it's an object
        if (response && typeof response === 'object') {
          response.uiToolCallback = uiToolCallback
          response.abortSignal = abortControllerRef.current?.signal
          response.modelId = selectedModel?.id
        }

        // Derive provider from selectedModel to avoid stale state issues
        const currentProvider = selectedModel?.provider || assistantChoice

        switch (currentProvider) {
        case 'openai':
          await HandleOpenAIResponse(
            response,
            (chunk: string) => {
              if (abortControllerRef.current?.signal.aborted) return
              appendAssistantChunk(assistantId, chunk)
            },
            (finalText: string, threadId) => {
              if (abortControllerRef.current?.signal.aborted) return
              Promise.resolve(ChatHistory.pushHistory(trimmed, finalText)).then(() => props.plugin.loadConversations())
              setIsStreaming(false)
              props.plugin.call('remixAI', 'setAssistantThrId', threadId)
            }
          )
          break;
        case 'mistralai':
          await HandleMistralAIResponse(
            response,
            (chunk: string) => {
              if (abortControllerRef.current?.signal.aborted) return
              appendAssistantChunk(assistantId, chunk)
            },
            (finalText: string, threadId) => {
              if (abortControllerRef.current?.signal.aborted) return
              Promise.resolve(ChatHistory.pushHistory(trimmed, finalText)).then(() => props.plugin.loadConversations())
              setIsStreaming(false)
              props.plugin.call('remixAI', 'setAssistantThrId', threadId)
            }
          )
          break;
        case 'anthropic':
          await HandleAnthropicResponse(
            response,
            (chunk: string) => {
              if (abortControllerRef.current?.signal.aborted) return
              appendAssistantChunk(assistantId, chunk)
            },
            (finalText: string, threadId) => {
              if (abortControllerRef.current?.signal.aborted) return
              Promise.resolve(ChatHistory.pushHistory(trimmed, finalText)).then(() => props.plugin.loadConversations())
              setIsStreaming(false)
              props.plugin.call('remixAI', 'setAssistantThrId', threadId)
            }
          )
          break;
        case 'ollama':
        {
          // Create a reasoning callback that updates the assistant message
          const reasoningCallback = (status: string) => {
            if (abortControllerRef.current?.signal.aborted) return
            setMessages(prev =>
              prev.map(m => (m.id === assistantId ? { ...m, content: `${status}` } : m))
            )
          }

          await HandleOllamaResponse(
            response,
            (chunk: string) => {
              if (abortControllerRef.current?.signal.aborted) return
              appendAssistantChunk(assistantId, chunk)
            },
            (finalText: string) => {
              if (abortControllerRef.current?.signal.aborted) return
              Promise.resolve(ChatHistory.pushHistory(trimmed, finalText)).then(() => props.plugin.loadConversations())
              setIsStreaming(false)
            },
            reasoningCallback
          )
          break;
        }
        default:
          await HandleStreamResponse(
            response,
            (chunk: string) => {
              if (abortControllerRef.current?.signal.aborted) return
              appendAssistantChunk(assistantId, chunk)
            },
            (finalText: string) => {
              if (abortControllerRef.current?.signal.aborted) return
              Promise.resolve(ChatHistory.pushHistory(trimmed, finalText)).then(() => props.plugin.loadConversations())
              setIsStreaming(false)
            }
          )
        }
        // Note: setIsStreaming(false) is called in each handler's completion callback
        // DO NOT call it here as it would stop the spinner before the response completes
      }
      catch (error: any) {
        console.error('Error sending prompt:', error)
        setIsStreaming(false)
        abortControllerRef.current = null

        if (clearToolTimeoutRef.current) {
          clearTimeout(clearToolTimeoutRef.current)
          clearToolTimeoutRef.current = null
        }
        uiToolCallbackRef.current = null

        // Don't show error message if request was aborted by user
        if (error.name === 'AbortError') {
          return
        }

        // Add error message to chat history
        setMessages(prev => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `Error: ${error.message}`,
            timestamp: Date.now(),
            sentiment: 'none'
          }
        ])
      }
    },
    [isStreaming, props.plugin, selectedModel, assistantChoice]
  )

  const handleSend = useCallback(async () => {
    await sendPrompt(input)
    setInput('')
  }, [input, sendPrompt])

  useEffect(() => {
    const handleMCPToggle = async () => {
      // Only toggle MCP if it's enabled via query parameter
      if (!mcpEnabled) {
        // Ensure MCP is disabled if query param is not set
        try {
          await props.plugin.call('remixAI', 'disableMCPEnhancement')
        } catch (error) {
          console.warn('Failed to disable MCP enhancement:', error)
        }
        return
      }

      try {
        if (mcpEnhanced) {
          await props.plugin.call('remixAI', 'enableMCPEnhancement')
        } else {
          await props.plugin.call('remixAI', 'disableMCPEnhancement')
        }
      } catch (error) {
        console.warn('Failed to toggle MCP enhancement:', error)
      }
    }
    if (mcpEnhanced !== null) { // Only call when state is initialized
      handleMCPToggle()
    }
  }, [mcpEnhanced, mcpEnabled])

  // Fetch available Ollama models when Ollama model is selected
  useEffect(() => {
    const fetchOllamaModels = async () => {
      if (selectedModel.provider === 'ollama') {
        try {
          const available = await isOllamaAvailable()
          if (available) {
            const models = await listModels()
            setOllamaModels(models)
            if (models.length === 0) {
              // Ollama is running but no models installed
              setMessages(prev => [...prev, {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: '**Ollama is running but no models are installed.**\n\nTo use Ollama, you need to install at least one model. Try:\n\n```bash\nollama pull codestral:latest\n# or\nollama pull qwen2.5-coder:14b\n```\n\nSee the [Ollama Setup Guide](https://github.com/ethereum/remix-project/blob/master/OLLAMA_SETUP.md) for more information.',
                timestamp: Date.now(),
                sentiment: 'none'
              }])
            } else {
              if (!selectedOllamaModel && models.length > 0) {
                const defaultModel = models.find(m => m.includes('codestral')) || models[0]
                setSelectedOllamaModel(defaultModel)
                trackMatomoEvent({ category: 'ai', action: 'remixAI', name: 'ollama_default_model_selected', value: `${defaultModel}|codestral|total:${models.length}`, isClick: false })
                // Sync the default model with the backend
                try {
                  await props.plugin.call('remixAI', 'setModel', defaultModel)
                  setAssistantChoice(selectedModel.provider)
                  setMessages(prev => [...prev, {
                    id: crypto.randomUUID(),
                    role: 'assistant',
                    content: `**Ollama connected successfully!**\n\nFound ${models.length} model${models.length > 1 ? 's' : ''}:\n${models.map(m => `• ${m}`).join('\n')}\n\nYou can now use local AI for code completion and assistance.`,
                    timestamp: Date.now(),
                    sentiment: 'none'
                  }])
                } catch (error) {
                  console.warn('Failed to set default model:', error)
                }
              }
            }
          } else {
            // Ollama is not available
            setOllamaModels([])
            setMessages(prev => [...prev, {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: '**Ollama is not available.**\n\nTo use Ollama with Remix IDE:\n\n1. **Install Ollama**: Visit [ollama.ai](https://ollama.ai) to download\n2. **Start Ollama**: Run `ollama serve` in your terminal\n3. **Install a model**: Run `ollama pull codestral:latest`\n4. **Configure CORS**: e.g `OLLAMA_ORIGINS=https://remix.ethereum.org ollama serve`\n\nSee the [Ollama Setup Guide](https://github.com/ethereum/remix-project/blob/master/OLLAMA_SETUP.md) for detailed instructions.\n\n*Switching back to default model for now.*',
              timestamp: Date.now(),
              sentiment: 'none'
            }])
            // Log Ollama unavailable event
            trackMatomoEvent({ category: 'ai', action: 'remixAI', name: 'ollama_unavailable', value: 'switching_to_default', isClick: false })
            // Set failure flag before switching back to prevent success message
            setIsOllamaFailureFallback(true)
            // Automatically switch back to default model
            const defaultModel = getDefaultModel()
            setSelectedModelId(defaultModel.id)
            setSelectedModel(defaultModel)
          }
        } catch (error: any) {
          console.warn('Failed to fetch Ollama models:', error)
          setOllamaModels([])
          setMessages(prev => [...prev, {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `**Failed to connect to Ollama.**\n\nError: ${error.message || 'Unknown error'}\n\nPlease ensure:\n- Ollama is running (\`ollama serve\`)\n- The ollama CORS setting is configured for Remix IDE. e.g \`OLLAMA_ORIGINS=https://remix.ethereum.org ollama serve\` Please see [Ollama Setup Guide](https://github.com/ethereum/remix-project/blob/master/OLLAMA_SETUP.md) for detailed instructions.\n- At least one model is installed\n\nSee the [Ollama Setup Guide](https://github.com/ethereum/remix-project/blob/master/OLLAMA_SETUP.md) for help.\n\n*Switching back to default model.*`,
            timestamp: Date.now(),
            sentiment: 'none'
          }])
          // Log Ollama connection error
          trackMatomoEvent({ category: 'ai', action: 'remixAI', name: 'ollama_connection_error', value: `${error.message || 'unknown'}|switching_to_default`, isClick: false })
          // Set failure flag before switching back to prevent success message
          setIsOllamaFailureFallback(true)
          // Switch back to default model on error
          const defaultModel = getDefaultModel()
          setSelectedModelId(defaultModel.id)
          setSelectedModel(defaultModel)
        }
      } else {
        setOllamaModels([])
        setSelectedOllamaModel(null)
      }
    }
    fetchOllamaModels()
  }, [selectedModel.provider, selectedOllamaModel])

  const handleSetModel = useCallback(() => {
    dispatchActivity('button', 'setModel')
    setShowModelSelector(prev => !prev)
  }, [])

  const handleModelSelection = useCallback(async (modelId: string) => {
    // Handle auto mode selection
    if (modelId === 'auto') {
      setAutoModeEnabled(true)
      try {
        await props.plugin.call('remixAI', 'setAutoMode', true)
        trackMatomoEvent({ category: 'ai', action: 'remixAI', name: 'auto_mode_enabled', isClick: true })
      } catch (error) {
        console.warn('Failed to enable auto mode:', error)
      }
      setShowModelSelector(false)
      return
    } else {
      setAutoModeEnabled(false)
      try {
        await props.plugin.call('remixAI', 'setAutoMode', false)
      } catch (error) {
        console.warn('Failed to disable auto mode:', error)
      }
    }

    const model = AVAILABLE_MODELS.find(m => m.id === modelId)
    if (!model) return

    // Check access
    if (!modelAccess.checkAccess(modelId)) {
      // Show login/upgrade prompt
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `**Authentication Required**\n\nThe model "${model.name}" requires authentication. Please sign in to access premium models.`,
        timestamp: Date.now(),
        sentiment: 'none'
      }])
      return
    }

    setSelectedModelId(modelId)
    setSelectedModel(model)

    // Always update assistantChoice to match the selected model's provider
    setAssistantChoice(model.provider as 'openai' | 'mistralai' | 'anthropic' | 'ollama')
    console.log('Setting assistant choice to:', model.provider)

    if (model.provider === 'ollama') {
      try {
        const models = await props.plugin.call('remixAI', 'getOllamaModels')
        setOllamaModels(models)
        setShowOllamaModelSelector(true)
      } catch (err) {
        console.error('Ollama not available:', err)
      }
    } else {
      try {
        await props.plugin.call('remixAI', 'setModel', modelId)
        trackMatomoEvent({ category: 'ai', action: 'remixAI', name: 'model_selected', value: modelId, isClick: true })
      } catch (error) {
        console.warn('Failed to set model:', error)
      }
    }

    setShowModelSelector(false)
  }, [props.plugin, modelAccess])

  const handleLockedModelClick = useCallback((modelId: string, modelName: string) => {
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: `**Join the Beta Program for ${modelName}**\n\nThis model is currently in beta and requires special access.\n\n**How to get access:**\nUse the *Sign in BETA* or *Join Remix Beta* buttons to join Beta Program\nYou'll directly have access to all beta models\n\n*Beta models include the latest AI capabilities for smart contract development, including advanced code analysis, MCP integrations and generation features.*`,
      timestamp: Date.now(),
      sentiment: 'none'
    }])
    props.plugin.call('betaCornerWidget', 'show').catch(() => {
    })
    trackMatomoEvent({ category: 'ai', action: 'remixAI', name: 'beta_model_click', value: modelId, isClick: true })
  }, [props.plugin])

  const modalMessage = () => {
    return (
      <ul className="p-3">
        <div className="mb-2">
          <span>Describe the files you want in the new Workspace, for example:</span>
        </div>
        <li>
          <span className="fst-italic fw-light">Create an ERC-20 token and explain it with comments in the contract</span>
        </li>
        <li>
          <span className="fst-italic fw-light">Create a voting contract and explain the contract with comments</span>
        </li>
        <li>
          <span className="fst-italic fw-light">Create a proxy contract with explanations in comments</span>
        </li>
      </ul>
    )
  }

  const handleRecord = useCallback(async () => {
    await toggleRecording()
    if (!isRecording) {
      trackMatomoEvent({ category: 'ai', action: 'StartAudioRecording', name: 'StartAudioRecording', isClick: true })
    }
  }, [toggleRecording, isRecording])

  const handleLoadSkills = useCallback(() => {
    if (props.onOpenSkillsModal) {
      props.onOpenSkillsModal()
    }
  }, [props.onOpenSkillsModal])

  const handleGenerateWorkspace = useCallback(async () => {
    dispatchActivity('button', 'generateWorkspace')
    try {
      const description: string = await new Promise((resolve, reject) => {
        const modalContent = {
          id: 'generate-workspace',
          title: 'Generate Workspace',
          message: modalMessage(),
          placeholderText: 'Create a Voting contract and explain the contract',
          modalType: ModalTypes.textarea,
          okLabel: 'Generate',
          cancelLabel: 'Cancel',
          okFn: (value: string) => setTimeout(() => resolve(value), 0),
          cancelFn: () => setTimeout(() => reject(new Error('Canceled')), 0),
          hideFn: () => setTimeout(() => reject(new Error('Hide')), 0)
        }
        // @ts-ignore – the notification plugin's modal signature
        props.plugin.call('notification', 'modal', modalContent)
      })

      if (description && description.trim()) {
        sendPrompt(`/generate ${description.trim()}`)
        trackMatomoEvent<AIEvent>({ category: 'ai', action: 'GenerateNewAIWorkspaceFromModal', name: description, isClick: true })
      }
    } catch {
      /* user cancelled */
    }
  }, [props.plugin, sendPrompt])

  useImperativeHandle(
    ref,
    () => ({
      sendChat: async (prompt: string) => {
        await sendPrompt(prompt)
      },
      clearChat: () => {
        setMessages([])
      },
      getHistory: () => messages
    }),
    [sendPrompt, messages]
  )
  const chatHistoryRef = useRef<HTMLElement | null>(null)

  // Detect manual user scrolling
  useEffect(() => {
    const node = historyRef.current
    if (!node) return

    const handleScroll = () => {
      const isAtBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 100

      if (!isAtBottom) {
        userHasScrolledRef.current = true
      } else {
        userHasScrolledRef.current = false
      }
    }

    node.addEventListener('scroll', handleScroll)
    return () => node.removeEventListener('scroll', handleScroll)
  }, [])

  const maximizePanel = async () => {
    await props.plugin.call('layout', 'maximiseRightSidePanel')
  }

  const recalcModelOpt = useCallback(() => {
    const modelBtn: any = modelBtnRef.current
    const menu = menuRef.current
    const container = aiChatRef.current
    if (!modelBtn || !menu || !container) return

    const btnRect = modelBtn.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    const menuWidth = menu.offsetWidth // replace hardcoded 180
    const menuHeight = menu.offsetHeight
    const GAP = 8

    // Prefer above the button; if no room, drop below it
    let top = btnRect.top - menuHeight - GAP
    if (top < containerRect.top) top = btnRect.bottom + GAP

    // Right-align with the button, then clamp to side panel
    let left = btnRect.right - menuWidth
    if (left < containerRect.left) left = containerRect.left
    if (left + menuWidth > containerRect.right) left = containerRect.right - menuWidth

    setModelOpt({ top, left })
  }, [])
  useEffect(() => {
    if (showModelSelector) {
      requestAnimationFrame(recalcModelOpt)
    }
  }, [showModelSelector, recalcModelOpt])

  useEffect(() => {
    if (!showModelSelector) return

    let frame: number | null = null
    const onResize = () => {
      if (frame) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(recalcModelOpt)
    }

    window.addEventListener('resize', onResize)
    // Also catches side-panel splitter drags (window resize won't fire then)
    const ro = new ResizeObserver(onResize)
    if (aiChatRef.current) ro.observe(aiChatRef.current)

    return () => {
      window.removeEventListener('resize', onResize)
      ro.disconnect()
      if (frame) cancelAnimationFrame(frame)
    }
  }, [showModelSelector, recalcModelOpt])

  const [aiChatIsMaximized, setAiChatIsMaximized] = useState(false);

  useEffect(() => {
    props.plugin.on('rightSidePanel', 'rightSidePanelMaximized', () => {
      setShowButton(false);
      setIsAiChatMaximized(true);
    })
    props.plugin.on('rightSidePanel', 'rightSidePanelRestored', () => {
      setShowButton(true);
      setIsAiChatMaximized(false);
    })

    return () => {
      props.plugin.off('rightSidePanel', 'rightSidePanelMaximized');
      props.plugin.off('rightSidePanel', 'rightSidePanelRestored');
    }
  }, [])

  return (
    props.isInitializing ? (
      <div
        className="d-flex flex-column w-100 h-100 ai-assistant-startup"
        ref={aiChatRef}
        data-theme={themeTracker && themeTracker?.name.toLowerCase()}
      >
        <div className="ai-assistant-startup__body">
          <div className="ai-assistant-startup__logo">
            <i className="fa fa-spinner fa-spin fa-2x" aria-hidden="true"></i>
          </div>
          <div className="ai-assistant-startup__title">Starting Remix AI Assistant</div>
          <div className="ai-assistant-startup__subtitle">Loading chat history...</div>
          <div data-id="remix-ai-assistant-loading"></div>
        </div>
      </div>
    ) : (
      <div
        className="d-flex flex-column w-100 h-100"
        ref={aiChatRef}
        style={{ overflow: 'hidden' }}
        data-theme={themeTracker && themeTracker?.name.toLowerCase()}
        data-was-loading={wasInitializingRef.current ? 'true' : undefined}
      >
        {/* Main content area with sidebar and chat */}
        <div className="d-flex flex-grow-1" style={{ overflow: 'hidden', minHeight: 0 }}>
          {/* Maximized Mode: Show sidebar on left if enabled */}
          {props.isMaximized && props.showHistorySidebar && props.conversations && (
            <ChatHistorySidebar
              conversations={props.conversations}
              currentConversationId={props.currentConversationId || null}
              showArchived={showArchivedConversations}
              onNewConversation={props.onNewConversation || (() => {})}
              onLoadConversation={props.onLoadConversation || (() => {})}
              onArchiveConversation={props.onArchiveConversation || (() => {})}
              onDeleteConversation={props.onDeleteConversation || (() => {})}
              onDeleteAllConversations={props.onDeleteAllConversations}
              onToggleArchived={() => setShowArchivedConversations(!showArchivedConversations)}
              onClose={props.onToggleHistorySidebar || (() => {})}
              onSearch={props.onSearch}
              isFloating={false}
              isMaximized={true}
              theme={themeTracker?.name}
            />
          )}

          {/* Maximized Mode: Always show chat area */}
          {props.isMaximized ? (
            <div className={`d-flex flex-column flex-grow-1 always-show ${messages.length === 0 ? 'ai-assistant-bg' : ''}`} style={{ overflow: 'hidden', minHeight: 0, backgroundColor: messages.length > 0 ? (themeTracker?.name.toLowerCase() === 'dark' ? '#222336' : '#eff1f5') : undefined }} data-theme={themeTracker && themeTracker?.name.toLowerCase()}>
              <ChatHistoryHeading
                onNewChat={props.onNewConversation || (() => {})}
                onToggleHistory={props.onToggleHistorySidebar || (() => {})}
                showHistorySidebar={props.showHistorySidebar || false}
                archiveChat={props.onArchiveConversation || (() => {})}
                currentConversationId={props.currentConversationId}
                showButton={showButton}
                setShowButton={setShowButton}
                theme={themeTracker?.name}
                chatTitle={messages.find(m => m.role === 'user')?.content}
                isAiChatMaximized={isAiChatMaximized}
                setIsAiChatMaximized={setIsAiChatMaximized}
              />
              <section id="remix-ai-chat-history" className="d-flex flex-column p-2" style={{ flex: 1, overflow: 'auto', minHeight: 0 }} ref={chatHistoryRef}>
                <div data-id="remix-ai-assistant-ready"></div>
                {/* hidden hook for E2E tests: data-streaming="true|false" */}
                <div
                  data-id="remix-ai-streaming"
                  className='d-none'
                  data-streaming={isStreaming ? 'true' : 'false'}
                ></div>
                <ChatHistoryComponent
                  messages={messages}
                  isStreaming={isStreaming}
                  sendPrompt={sendPrompt}
                  recordFeedback={recordFeedback}
                  historyRef={historyRef}
                  theme={themeTracker?.name}
                  plugin={props.plugin}
                  handleGenerateWorkspace={handleGenerateWorkspace}
                  handleLoadSkills={handleLoadSkills}
                  allowedMcps={modelAccess.allowedMcps}
                  onDappReviewAcceptAll={handleDappReviewAcceptAll}
                  onDappReviewRevertAll={handleDappReviewRevertAll}
                  onDappReviewViewDiff={handleDappReviewViewDiff}
                />
                {pendingApprovals.length > 1 && (
                  <div style={{ padding: '12px', borderBottom: '1px solid #ccc', marginBottom: '8px' }}>
                    <div className="d-flex justify-content-between align-items-center">
                      <span className="fw-bold">Multiple Changes Pending ({pendingApprovals.length})</span>
                      <div className="d-flex gap-2">
                        <button
                          className="btn btn-success btn-sm"
                          onClick={handleApproveAll}
                          data-id="approve-all-changes"
                        >
                          Approve All
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={handleRejectAll}
                          data-id="reject-all-changes"
                        >
                          Discard All
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {pendingApprovals.map((approval) => (
                  <div key={approval.requestId} style={{ padding: '0 12px', marginBottom: '8px' }}>
                    <ToolApprovalModal
                      request={approval}
                      onApprove={(modifiedArgs) => handleApproveToolAction(approval, modifiedArgs)}
                      onReject={() => handleRejectToolAction(approval)}
                      onTimeout={() => handleTimeoutToolAction(approval)}
                      onReviewChanges={() => handleReviewChanges(approval)}
                      isReviewing={reviewingApprovals.has(approval.requestId)}
                    />
                  </div>
                ))}
              </section>
            </div>
          ) : (
          /* Non-Maximized Mode: Toggle between history view and chat view */
            props.showHistorySidebar && props.isMaximized === false && props.conversations ? (
              <div className="d-flex flex-column flex-grow-1 ai-assistant-bg nonMaximizedMode" style={{ overflow: 'hidden', minHeight: 0 }} data-theme={themeTracker && themeTracker?.name.toLowerCase()}>
                {/* Back button header */}
                <div
                  className="p-2 border-bottom"
                  style={{ backgroundColor: themeTracker?.name.toLowerCase() === 'dark' ? '#222336' : '#eff1f5' }}
                >
                  <button
                    className={`btn btn-sm ${themeTracker?.name.toLowerCase() === 'dark' ? 'btn-dark' : 'btn-light text-light-emphasis'}`}
                    onClick={props.onToggleHistorySidebar || (() => {})}
                    data-id="chat-history-back-btn"
                  >
                    <i className="fas fa-chevron-left me-3"></i>
                    <span>Back to chat</span>
                  </button>
                </div>
                {/* Chat history content */}
                <div className="flex-grow-1" style={{ overflow: 'hidden', minHeight: 0 }}>
                  <ChatHistorySidebar
                    conversations={props.conversations}
                    currentConversationId={props.currentConversationId || null}
                    showArchived={showArchivedConversations}
                    onNewConversation={props.onNewConversation || (() => {})}
                    onLoadConversation={(id) => {
                      props.onLoadConversation?.(id)
                      // Close sidebar after loading conversation in non-maximized mode
                      props.onToggleHistorySidebar?.()
                    }}
                    onArchiveConversation={props.onArchiveConversation || (() => {})}
                    onDeleteConversation={props.onDeleteConversation || (() => {})}
                    onDeleteAllConversations={props.onDeleteAllConversations}
                    onToggleArchived={() => setShowArchivedConversations(!showArchivedConversations)}
                    onClose={props.onToggleHistorySidebar || (() => {})}
                    onSearch={props.onSearch}
                    isFloating={false}
                    isMaximized={false}
                    theme={themeTracker?.name}
                  />
                </div>
              </div>
            ) : (
            /* Show chat area when sidebar is closed */
              <div className={`d-flex flex-column flex-grow-1 sideBarIsClosed ${messages.length === 0 ? 'ai-assistant-bg' : ''}`} style={{ overflow: 'hidden', minHeight: 0, backgroundColor: messages.length > 0 ? (themeTracker?.name.toLowerCase() === 'dark' ? '#222336' : '#eff1f5') : undefined }} data-theme={themeTracker && themeTracker?.name.toLowerCase()}>
                <ChatHistoryHeading
                  onNewChat={props.onNewConversation || (() => {})}
                  onToggleHistory={props.onToggleHistorySidebar || (() => {})}
                  showHistorySidebar={props.showHistorySidebar || false}
                  archiveChat={props.onArchiveConversation || (() => {})}
                  currentConversationId={props.currentConversationId}
                  showButton={showButton}
                  setShowButton={setShowButton}
                  theme={themeTracker?.name}
                  chatTitle={messages.find(m => m.role === 'user')?.content}
                  isAiChatMaximized={isAiChatMaximized}
                  setIsAiChatMaximized={setIsAiChatMaximized}
                />
                <section id="remix-ai-chat-history" className="d-flex flex-column p-2" style={{ flex: 1, overflow: 'auto', minHeight: 0 }} ref={chatHistoryRef}>
                  <div data-id="remix-ai-assistant-ready"></div>
                  {/* hidden hook for E2E tests: data-streaming="true|false" */}
                  <div
                    data-id="remix-ai-streaming"
                    className='d-none'
                    data-streaming={isStreaming ? 'true' : 'false'}
                  ></div>
                  <ChatHistoryComponent
                    messages={messages}
                    isStreaming={isStreaming}
                    sendPrompt={sendPrompt}
                    recordFeedback={recordFeedback}
                    historyRef={historyRef}
                    theme={themeTracker?.name}
                    plugin={props.plugin}
                    handleGenerateWorkspace={handleGenerateWorkspace}
                    handleLoadSkills={handleLoadSkills}
                    allowedMcps={modelAccess.allowedMcps}
                    onDappReviewAcceptAll={handleDappReviewAcceptAll}
                    onDappReviewRevertAll={handleDappReviewRevertAll}
                    onDappReviewViewDiff={handleDappReviewViewDiff}
                  />
                  {pendingApprovals.length > 1 && (
                    <div style={{ padding: '12px', borderBottom: '1px solid #ccc', marginBottom: '8px' }}>
                      <div className="d-flex justify-content-between align-items-center">
                        <span className="fw-bold">Multiple Changes Pending ({pendingApprovals.length})</span>
                        <div className="d-flex gap-2">
                          <button
                            className="btn btn-success btn-sm"
                            onClick={handleApproveAll}
                            data-id="approve-all-changes"
                          >
                            Approve All
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={handleRejectAll}
                            data-id="reject-all-changes"
                          >
                            Discard All
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  {pendingApprovals.map((approval) => (
                    <div key={approval.requestId} style={{ padding: '0 12px', marginBottom: '8px' }}>
                      <ToolApprovalModal
                        request={approval}
                        onApprove={(modifiedArgs) => handleApproveToolAction(approval, modifiedArgs)}
                        onReject={() => handleRejectToolAction(approval)}
                        onTimeout={() => handleTimeoutToolAction(approval)}
                        onReviewChanges={() => handleReviewChanges(approval)}
                        isReviewing={reviewingApprovals.has(approval.requestId)}
                      />
                    </div>
                  ))}
                </section>
              </div>
            )
          )}
        </div>

        {
          messages.length > 0 ? (
            <AiChatPromptAreaForHistory
              themeTracker={themeTracker}
              showHistorySidebar={props.showHistorySidebar || false}
              isMaximized={false}
              modelOpt={modelOpt}
              menuRef={menuRef}
              assistantChoice={assistantChoice}
              setAssistantChoice={setAssistantChoice}
              mcpEnabled={mcpEnabled}
              mcpEnhanced={mcpEnhanced}
              setMcpEnhanced={setMcpEnhanced}
              availableModels={AVAILABLE_MODELS}
              selectedModel={selectedModel}
              autoModeEnabled={autoModeEnabled}
              handleModelSelection={handleModelSelection}
              onLockedModelClick={handleLockedModelClick}
              input={input}
              setInput={setInput}
              isStreaming={isStreaming}
              handleSend={handleSend}
              stopRequest={stopRequest}
              showModelOptions={showModelOptions}
              setShowModelOptions={setShowModelOptions}
              handleSetModel={handleSetModel}
              handleGenerateWorkspace={handleGenerateWorkspace}
              handleRecord={handleRecord}
              isRecording={isRecording}
              dispatchActivity={dispatchActivity as any}
              modelBtnRef={modelBtnRef}
              modelSelectorBtnRef={modelSelectorBtnRef}
              textareaRef={textareaRef}
              maximizePanel={maximizePanel}
              setShowOllamaModelSelector={setShowOllamaModelSelector}
              showOllamaModelSelector={showOllamaModelSelector}
              showModelSelector={showModelSelector}
              setShowModelSelector={setShowModelSelector}
              modelAccess={modelAccess}
              selectedModelId={selectedModelId}
              handleOllamaModelSelection={handleModelSelection}
              selectedOllamaModel={selectedOllamaModel}
              ollamaModels={ollamaModels}
              messages={messages}
              handleLoadSkills={handleLoadSkills}
            />
          ) : (
            <AiChatPromptArea
              themeTracker={themeTracker}
              showHistorySidebar={props.showHistorySidebar || false}
              isMaximized={false}
              modelOpt={modelOpt}
              menuRef={menuRef}
              assistantChoice={assistantChoice}
              setAssistantChoice={setAssistantChoice}
              mcpEnabled={mcpEnabled}
              mcpEnhanced={mcpEnhanced}
              setMcpEnhanced={setMcpEnhanced}
              availableModels={AVAILABLE_MODELS}
              selectedModel={selectedModel}
              autoModeEnabled={autoModeEnabled}
              handleModelSelection={handleModelSelection}
              onLockedModelClick={handleLockedModelClick}
              input={input}
              setInput={setInput}
              isStreaming={isStreaming}
              handleSend={handleSend}
              stopRequest={stopRequest}
              showModelOptions={showModelOptions}
              setShowModelOptions={setShowModelOptions}
              handleSetModel={handleSetModel}
              handleGenerateWorkspace={handleGenerateWorkspace}
              handleRecord={handleRecord}
              isRecording={isRecording}
              dispatchActivity={dispatchActivity as any}
              modelBtnRef={modelBtnRef}
              modelSelectorBtnRef={modelSelectorBtnRef}
              textareaRef={textareaRef}
              maximizePanel={maximizePanel}
              setShowOllamaModelSelector={setShowOllamaModelSelector}
              showOllamaModelSelector={showOllamaModelSelector}
              showModelSelector={showModelSelector}
              setShowModelSelector={setShowModelSelector}
              modelAccess={modelAccess}
              selectedModelId={selectedModelId}
              handleOllamaModelSelection={handleModelSelection}
              selectedOllamaModel={selectedOllamaModel}
              ollamaModels={ollamaModels}
              messages={messages}
              handleLoadSkills={handleLoadSkills}
            />
          )
        }
      </div>
    )
  )
})
