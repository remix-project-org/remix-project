/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import React, { useState, useEffect, useCallback, useRef, useImperativeHandle, MutableRefObject, useContext } from 'react'
//@ts-ignore
import '../css/remix-ai-assistant.css'

import { ChatCommandParser, GenerationParams, ChatHistory, HandleStreamResponse, listModels, isOllamaAvailable, AVAILABLE_MODELS, getDefaultModel, getModelById, AIModel } from '@remix/remix-ai-core'
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
  const [isMaximized, setIsMaximized] = useState(false)
  const mcpEnabled = true

  const [mcpEnhanced, setMcpEnhanced] = useState(mcpEnabled)
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

  const getBoundingRect = (ref: MutableRefObject<any>) => ref.current?.getBoundingClientRect()
  const calcAndConvertToDvh = (coordValue: number) => (coordValue / window.innerHeight) * 100
  const calcAndConvertToDvw = (coordValue: number) => (coordValue / window.innerWidth) * 100
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
            executingToolArgs: undefined
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
            executingToolArgs: undefined
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
                      executingToolArgs: undefined
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
                    executingToolArgs: undefined
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
                  executingToolArgs: undefined
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

  const handleLoadSkills = useCallback(async () => {
    try {
      const res = await fetch('http://187.77.100.93:9005/skills')
      const data = res.ok ? await res.json() : { skills: [] }
      const skills: { id: string; name: string; description?: string; source?: string }[] = data?.skills || []

      await new Promise<void>((resolve, reject) => {
        const SkillsList = () => {
          const [filter, setFilter] = React.useState('')
          const filtered = filter.trim()
            ? skills.filter(s => `${s.name} ${s.description || ''} ${s.source || ''}`.toLowerCase().includes(filter.toLowerCase()))
            : skills
          return (
            <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              <input
                className="form-control mb-3"
                placeholder="Search skills..."
                value={filter}
                onChange={e => setFilter(e.target.value)}
                autoFocus
              />
              <div className="d-flex flex-wrap gap-2">
                {filtered.map(skill => (
                  <div
                    key={skill.id}
                    className="card bg-secondary text-light"
                    style={{ width: 200, cursor: 'pointer' }}
                    onClick={() => {
                      sendPrompt(`Please load and apply the "${skill.name}" skill (id: ${skill.id}) to help me with Ethereum development.`)
                      trackMatomoEvent<AIEvent>({ category: 'ai', action: 'conv_starter', name: 'load_skill', value: skill.id, isClick: true })
                      resolve()
                      props.plugin.call('notification', 'modal', { id: 'skills-close', title: '', message: '', modalType: ModalTypes.alert, okLabel: 'close', okFn: () => {}, cancelFn: () => {}, hideFn: () => {} })
                    }}
                  >
                    <div className="card-body p-2">
                      <h6 className="card-title mb-1" style={{ fontSize: '0.85rem' }}>{skill.name}</h6>
                      {skill.source && <span className="badge bg-dark mb-1" style={{ fontSize: '0.65rem' }}>{skill.source}</span>}
                      <p className="card-text" style={{ fontSize: '0.75rem', opacity: 0.85 }}>{skill.description || ''}</p>
                    </div>
                  </div>
                ))}
                {filtered.length === 0 && <div className="text-muted">No skills found.</div>}
              </div>
            </div>
          )
        }
        const modalContent = {
          id: 'load-skills',
          title: 'Load Skills',
          message: <SkillsList />,
          modalType: ModalTypes.default,
          okLabel: 'Close',
          okFn: () => setTimeout(() => resolve(), 0),
          cancelFn: () => setTimeout(() => reject(new Error('Canceled')), 0),
          hideFn: () => setTimeout(() => reject(new Error('Hide')), 0)
        }
        // @ts-ignore
        props.plugin.call('notification', 'modal', modalContent)
      })
    } catch (e: any) {
      if (e?.message !== 'Canceled' && e?.message !== 'Hide') {
        // @ts-ignore
        props.plugin.call('notification', 'modal', {
          id: 'load-skills-error',
          title: 'Load Skills',
          message: <div className="text-danger">Failed to load skills. Make sure the ethskills server is running at http://187.77.100.93:9005.</div>,
          modalType: ModalTypes.alert,
          okLabel: 'OK',
          okFn: () => {},
          cancelFn: () => {},
          hideFn: () => {}
        })
      }
    }
  }, [props.plugin, sendPrompt])

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

  useEffect(() => {
    if (showModelSelector && modelBtnRef.current && menuRef.current) {
      // Use requestAnimationFrame to ensure menu is rendered and has dimensions
      requestAnimationFrame(() => {
        const modelBtn = modelBtnRef.current as any
        const menu = menuRef.current

        if (modelBtn && menu) {
          const modelBtnRect = modelBtn.getBoundingClientRect()
          const menuHeight = menu.offsetHeight

          // Position menu above the button using fixed positioning (viewport coordinates)
          // Align menu's right edge with button's right edge
          setModelOpt({
            top: modelBtnRect.top - menuHeight - 8,
            left: modelBtnRect.right - 180 // Small gap from the right edge
          })
        }
      })
    }
  }, [showModelSelector])
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
                />
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
                  />
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
            />
          )
        }
      </div>
    )
  )
})
