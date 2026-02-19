/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import React, { useState, useEffect, useCallback, useRef, useImperativeHandle, MutableRefObject, useContext } from 'react'
import '../css/remix-ai-assistant.css'

import { ChatCommandParser, GenerationParams, ChatHistory, HandleStreamResponse, listModels, isOllamaAvailable } from '@remix/remix-ai-core'
import { HandleOpenAIResponse, HandleMistralAIResponse, HandleAnthropicResponse, HandleOllamaResponse } from '@remix/remix-ai-core'
import '../css/color.css'
import { Plugin } from '@remixproject/engine'
import { ModalTypes } from '@remix-ui/app'
import { MatomoEvent, AIEvent, RemixAIAssistantEvent } from '@remix-api'
//@ts-ignore
import { TrackingContext } from '@remix-ide/tracking'
import { PromptArea } from './prompt'
import { ChatHistoryComponent } from './chat'
import { ActivityType, ChatMessage, ConversationMetadata } from '../lib/types'
import { groupListType } from '../types/componentTypes'
import GroupListMenu from './contextOptMenu'
import { useOnClickOutside } from './onClickOutsideHook'
import { RemixAIAssistant } from 'apps/remix-ide/src/app/plugins/remix-ai-assistant'
import { useAudioTranscription } from '../hooks/useAudioTranscription'
import { QueryParams } from '@remix-project/remix-lib'
import ChatHistoryHeading from './chatHistoryHeading'
import { ChatHistorySidebar } from './chatHistorySidebar'
import AiChatPromptAreaForHistory from './aiChatPromptAreaForHistory'
import AiChatPromptArea from './aiChatPromptArea'

export interface RemixUiRemixAiAssistantProps {
  plugin: RemixAIAssistant
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
  onToggleHistorySidebar?: () => void
}
export interface RemixUiRemixAiAssistantHandle {
  /** Programmatically send a prompt to the chat (returns after processing starts) */
  sendChat: (prompt: string) => Promise<void>
  /** Clears local chat history (parent receives onMessagesChange([])) */
  clearChat: () => void
  /** Returns current chat history array */
  getHistory: () => ChatMessage[]
}

export const RemixUiRemixAiAssistant = React.forwardRef<
  RemixUiRemixAiAssistantHandle,
  RemixUiRemixAiAssistantProps
>(function RemixUiRemixAiAssistant(props, ref) {
  const [messages, setMessages] = useState<ChatMessage[]>(props.initialMessages || [])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [showAssistantOptions, setShowAssistantOptions] = useState(false)
  const [showModelOptions, setShowModelOptions] = useState(false)
  const [assistantChoice, setAssistantChoice] = useState<'openai' | 'mistralai' | 'anthropic' | 'ollama'>(
    'mistralai'
  )
  const [showArchivedConversations, setShowArchivedConversations] = useState(false)
  const [showButton, setShowButton] = useState(true);

  // Check if MCP is enabled via query parameter
  const queryParams = new QueryParams()
  const mcpEnabled = queryParams.exists('experimental')

  const [mcpEnhanced, setMcpEnhanced] = useState(mcpEnabled)
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)
  const trackMatomoEvent = <T extends MatomoEvent = AIEvent>(event: T) => {
    baseTrackEvent?.<T>(event)
  }
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [selectedModel, setSelectedModel] = useState<string | null>(null)
  const [isOllamaFailureFallback, setIsOllamaFailureFallback] = useState(false)
  const [themeTracker, setThemeTracker] = useState(null)
  const historyRef = useRef<HTMLDivElement | null>(null)
  const modelBtnRef = useRef(null)
  const modelSelectorBtnRef = useRef(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const aiChatRef = useRef<HTMLDivElement>(null)
  const userHasScrolledRef = useRef(false)
  const lastMessageCountRef = useRef(0)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Audio transcription hook
  const {
    isRecording,
    isTranscribing,
    error,
    toggleRecording
  } = useAudioTranscription({
    model: 'whisper-v3',
    onTranscriptionComplete: async (text) => {
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
        // Append transcription to the input box and execute the prompt
        setInput(prev => prev ? `${prev} ${text}`.trim() : text)
        if (trimmedText) {
          await sendPrompt(trimmedText)
          trackMatomoEvent({ category: 'ai', action: 'SpeechToTextPrompt', name: 'SpeechToTextPrompt', isClick: true })
        }
        // Focus the textarea
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

  useOnClickOutside([modelBtnRef], () => setShowAssistantOptions(false))
  useOnClickOutside([modelSelectorBtnRef], () => setShowModelOptions(false))

  const getBoundingRect = (ref: MutableRefObject<any>) => ref.current?.getBoundingClientRect()
  const calcAndConvertToDvh = (coordValue: number) => (coordValue / window.innerHeight) * 100
  const calcAndConvertToDvw = (coordValue: number) => (coordValue / window.innerWidth) * 100
  const chatCmdParser = new ChatCommandParser(props.plugin)

  const aiAssistantGroupList: groupListType[] = [
    {
      label: 'OpenAI',
      bodyText: 'Better for general purpose coding tasks',
      icon: 'fa-solid fa-check',
      stateValue: 'openai',
      dataId: 'composer-ai-assistant-openai'
    },
    {
      label: 'MistralAI',
      bodyText: 'Better for more complex coding tasks with solidity, typescript and more',
      icon: 'fa-solid fa-check',
      stateValue: 'mistralai',
      dataId: 'composer-ai-assistant-mistralai'
    },
    {
      label: 'Anthropic',
      bodyText: 'Best for complex coding tasks but most demanding on resources',
      icon: 'fa-solid fa-check',
      stateValue: 'anthropic',
      dataId: 'composer-ai-assistant-anthropic'
    },
    {
      label: 'Ollama',
      bodyText: 'Local AI models running on your machine (requires Ollama installation)',
      icon: 'fa-solid fa-check',
      stateValue: 'ollama',
      dataId: 'composer-ai-assistant-ollama'
    }
  ]

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

  // useEffect(() => {
  //   const fetchAssistantChoice = async () => {
  //     console.log('Fetching assistant choice from plugin')
  //     const choice = await props.plugin.call('remixAI', 'getAssistantProvider')
  //     setAssistantChoice(choice || 'openai')
  //   }
  //   fetchAssistantChoice()
  // }, [props.plugin])

  useEffect(() => {
    props.plugin.call('theme', 'currentTheme')
      .then((theme) => setThemeTracker(theme))
      .catch((error) => console.log(error))

    props.plugin.on('theme', 'themeChanged', (theme) => {
      setThemeTracker(theme)
    })
    return () => {
      props.plugin.off('theme', 'themeChanged')
    }
  }, [])

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
      abortControllerRef.current = null
      setIsStreaming(false)

      trackMatomoEvent({ category: 'ai', action: 'remixAI', name: 'StopRequest', isClick: true })
    }
  }, [])

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

      // Track tool execution timeout to clear it when content arrives
      let clearToolTimeout: NodeJS.Timeout | null = null

      /** append streaming chunks helper - clears tool status when content arrives */
      const appendAssistantChunk = (msgId: string, chunk: string) => {
        // Clear any pending tool status timeout since content is now displaying
        if (clearToolTimeout) {
          clearTimeout(clearToolTimeout)
          clearToolTimeout = null
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
          if (clearToolTimeout) {
            clearTimeout(clearToolTimeout)
            clearToolTimeout = null
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
                clearToolTimeout = setTimeout(() => {
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

        // Attach the callback and abort signal to the response if it's an object
        if (response && typeof response === 'object') {
          response.uiToolCallback = uiToolCallback
          response.abortSignal = abortControllerRef.current?.signal
        }

        switch (assistantChoice) {
        case 'openai':
          await HandleOpenAIResponse(
            response,
            (chunk: string) => {
              if (abortControllerRef.current?.signal.aborted) return
              appendAssistantChunk(assistantId, chunk)
            },
            (finalText: string, threadId) => {
              if (abortControllerRef.current?.signal.aborted) return
              ChatHistory.pushHistory(trimmed, finalText)
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
              ChatHistory.pushHistory(trimmed, finalText)
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
              ChatHistory.pushHistory(trimmed, finalText)
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
              ChatHistory.pushHistory(trimmed, finalText)
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
              ChatHistory.pushHistory(trimmed, finalText)
              setIsStreaming(false)
            }
          )
        }
        // Note: setIsStreaming(false) is called in each handler's completion callback
        // DO NOT call it here as it would stop the spinner before the response completes
      }
      catch (error) {
        console.error('Error sending prompt:', error)
        setIsStreaming(false)
        abortControllerRef.current = null

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
    [isStreaming, props.plugin]
  )

  const handleSend = useCallback(async () => {
    await sendPrompt(input)
    setInput('')
  }, [input, sendPrompt])

  const handleSetAssistant = useCallback(() => {
    dispatchActivity('button', 'setAssistant')
    setShowAssistantOptions(prev => !prev)
  }, [])

  // Only send the /setAssistant command when the choice actually changes
  useEffect(() => {
    const fetchAssistantChoice = async () => {
      const choiceSetting = await props.plugin.call('remixAI', 'getAssistantProvider')
      if (choiceSetting !== assistantChoice) {
        // Don't send success messages if this is a fallback from Ollama failure
        if (!isOllamaFailureFallback) {
          dispatchActivity('button', 'setAssistant')
          setMessages([])
          sendPrompt(`/setAssistant ${assistantChoice}`)
          trackMatomoEvent<AIEvent>({ category: 'ai', action: 'SetAIProvider', name: assistantChoice, isClick: true })
          // Log specific Ollama selection
          if (assistantChoice === 'ollama') {
            trackMatomoEvent({ category: 'ai', action: 'remixAI', name: 'ollama_provider_selected', value: `from:${choiceSetting || 'unknown'}`, isClick: false })
          }
        } else {
          // This is a fallback, just update the backend silently
          trackMatomoEvent({ category: 'ai', action: 'remixAI', name: 'ollama_fallback_to_provider', value: `${assistantChoice}|from:${choiceSetting}`, isClick: false })
          await props.plugin.call('remixAI', 'setAssistantProvider', assistantChoice)
        }
        setAssistantChoice(assistantChoice || 'mistralai')

        // Reset the fallback flag after handling
        if (isOllamaFailureFallback) {
          setIsOllamaFailureFallback(false)
        }
      }
    }
    fetchAssistantChoice()
  }, [assistantChoice, isOllamaFailureFallback])

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

  // Fetch available models everytime Ollama is selected
  useEffect(() => {
    const fetchModels = async () => {
      if (assistantChoice === 'ollama') {
        try {
          const available = await isOllamaAvailable()
          if (available) {
            const models = await listModels()
            setAvailableModels(models)
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
              if (!selectedModel && models.length > 0) {
                const defaultModel = models.find(m => m.includes('codestral')) || models[0]
                setSelectedModel(defaultModel)
                trackMatomoEvent({ category: 'ai', action: 'remixAI', name: 'ollama_default_model_selected', value: `${defaultModel}|codestral|total:${models.length}`, isClick: false })
                // Sync the default model with the backend
                try {
                  await props.plugin.call('remixAI', 'setModel', defaultModel)
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
            setAvailableModels([])
            setMessages(prev => [...prev, {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: '**Ollama is not available.**\n\nTo use Ollama with Remix IDE:\n\n1. **Install Ollama**: Visit [ollama.ai](https://ollama.ai) to download\n2. **Start Ollama**: Run `ollama serve` in your terminal\n3. **Install a model**: Run `ollama pull codestral:latest`\n4. **Configure CORS**: e.g `OLLAMA_ORIGINS=https://remix.ethereum.org ollama serve`\n\nSee the [Ollama Setup Guide](https://github.com/ethereum/remix-project/blob/master/OLLAMA_SETUP.md) for detailed instructions.\n\n*Switching back to previous model for now.*',
              timestamp: Date.now(),
              sentiment: 'none'
            }])
            // Log Ollama unavailable event
            trackMatomoEvent({ category: 'ai', action: 'remixAI', name: 'ollama_unavailable', value: 'switching_to_mistralai', isClick: false })
            // Set failure flag before switching back to prevent success message
            setIsOllamaFailureFallback(true)
            // Automatically switch back to mistralai
            setAssistantChoice('mistralai')
          }
        } catch (error) {
          console.warn('Failed to fetch Ollama models:', error)
          setAvailableModels([])
          setMessages(prev => [...prev, {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `**Failed to connect to Ollama.**\n\nError: ${error.message || 'Unknown error'}\n\nPlease ensure:\n- Ollama is running (\`ollama serve\`)\n- The ollama CORS setting is configured for Remix IDE. e.g \`OLLAMA_ORIGINS=https://remix.ethereum.org ollama serve\` Please see [Ollama Setup Guide](https://github.com/ethereum/remix-project/blob/master/OLLAMA_SETUP.md) for detailed instructions.\n- At least one model is installed\n\nSee the [Ollama Setup Guide](https://github.com/ethereum/remix-project/blob/master/OLLAMA_SETUP.md) for help.\n\n*Switching back to previous model.*`,
            timestamp: Date.now(),
            sentiment: 'none'
          }])
          // Log Ollama connection error
          trackMatomoEvent({ category: 'ai', action: 'remixAI', name: 'ollama_connection_error', value: `${error.message || 'unknown'}|switching_to_mistralai`, isClick: false })
          // Set failure flag before switching back to prevent success message
          setIsOllamaFailureFallback(true)
          // Switch back to mistralai on error
          setAssistantChoice('mistralai')
        }
      } else {
        setAvailableModels([])
        setSelectedModel(null)
      }
    }
    fetchModels()
  }, [assistantChoice, selectedModel])

  const handleSetModel = useCallback(() => {
    dispatchActivity('button', 'setModel')
    setShowModelOptions(prev => !prev)
  }, [])

  const handleModelSelection = useCallback(async (modelName: string) => {
    const previousModel = selectedModel
    setSelectedModel(modelName)
    setShowModelOptions(false)
    trackMatomoEvent({ category: 'ai', action: 'remixAI', name: 'ollama_model_selected', value: `${modelName}|from:${previousModel || 'none'}`, isClick: true })
    // Update the model in the backend
    try {
      await props.plugin.call('remixAI', 'setModel', modelName)
      trackMatomoEvent({ category: 'ai', action: 'remixAI', name: 'ollama_model_set_backend_success', value: modelName, isClick: false })
    } catch (error) {
      console.warn('Failed to set model:', error)
      trackMatomoEvent({ category: 'ai', action: 'remixAI', name: 'ollama_model_set_backend_failed', value: `${modelName}|${error.message || 'unknown'}`, isClick: false })
    }
    trackMatomoEvent<AIEvent>({ category: 'ai', action: 'SetOllamaModel', name: modelName, isClick: true })
  }, [props.plugin, selectedModel])

  const modalMessage = () => {
    return (
      <ul className="p-3">
        <div className="mb-2">
          <span>Write a command and it will execute it by creating a new workspace e.g:</span>
        </div>
        <li>
          <span className="fst-italic fw-light">Create an ERC‑20 token with all explanations as comments in the contract,</span>
        </li>
        <li>
          <span className="fst-italic fw-light">Create a Voting contract and explain the contract with comments,</span>
        </li>
        <li>
          <span className="fst-italic fw-light">Create a proxy contract with all explanations about the contract as comments</span>
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

  const [modelOpt, setModelOpt] = useState({ top: 0, left: 0 })
  const menuRef = useRef<any>()

  useEffect(() => {
    if (showAssistantOptions && modelBtnRef.current && menuRef.current) {
      // Use requestAnimationFrame to ensure menu is rendered and has dimensions
      requestAnimationFrame(() => {
        const modelBtn = modelBtnRef.current
        const menu = menuRef.current

        if (modelBtn && menu) {
          const modelBtnRect = modelBtn.getBoundingClientRect()
          const menuHeight = menu.offsetHeight

          // Position menu above the button using fixed positioning (viewport coordinates)
          // Align menu's right edge with button's right edge
          setModelOpt({
            top: modelBtnRect.top - menuHeight - 8,
            left: modelBtnRect.right - 80 // Small gap from the right edge
          })
        }
      })
    }
  }, [showAssistantOptions])

  useEffect(() => {
    props.plugin.on('rightSidePanel', 'rightSidePanelMaximized', () => {
      setShowButton(false);
    })
    props.plugin.on('rightSidePanel', 'rightSidePanelRestored', () => {
      setShowButton(true);
    })

    return () => {
      props.plugin.off('rightSidePanel', 'rightSidePanelMaximized');
      props.plugin.off('rightSidePanel', 'rightSidePanelRestored');
    }
  }, [])

  return (
    <div
      className="d-flex flex-column w-100 h-100"
      ref={aiChatRef}
      style={{ overflow: 'hidden' }}
      data-theme={themeTracker && themeTracker?.name.toLowerCase()}
    >
      {/* Main content area with sidebar and chat */}
      <div className="d-flex flex-row flex-grow-1" style={{ overflow: 'hidden', minHeight: 0 }}>
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
            onToggleArchived={() => setShowArchivedConversations(!showArchivedConversations)}
            onClose={props.onToggleHistorySidebar || (() => {})}
            isFloating={false}
            isMaximized={true}
            theme={themeTracker?.name}
          />
        )}

        {/* Maximized Mode: Always show chat area */}
        {props.isMaximized ? (
          <div className="d-flex flex-column flex-grow-1 ai-assistant-bg always-show" style={{ overflow: 'hidden', minHeight: 0, backgroundColor: themeTracker?.name.toLowerCase() === 'dark' ? 'red' : 'var(--bs-light)' }} data-theme={themeTracker && themeTracker?.name.toLowerCase()}>
            <ChatHistoryHeading
              onNewChat={props.onNewConversation || (() => {})}
              onToggleHistory={props.onToggleHistorySidebar || (() => {})}
              showHistorySidebar={props.showHistorySidebar || false}
              archiveChat={props.onArchiveConversation || (() => {})}
              currentConversationId={props.currentConversationId}
              showButton={showButton}
              setShowButton={setShowButton}
              theme={themeTracker?.name}
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
              <div className="flex-grow-1" style={{ overflow: 'hidden' }}>
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
                  onToggleArchived={() => setShowArchivedConversations(!showArchivedConversations)}
                  onClose={props.onToggleHistorySidebar || (() => {})}
                  isFloating={false}
                  isMaximized={false}
                  theme={themeTracker?.name}
                />
              </div>
            </div>
          ) : (
            /* Show chat area when sidebar is closed */
            <div className="d-flex flex-column flex-grow-1 ai-assistant-bg sideBarIsClosed" style={{ overflow: 'hidden', minHeight: 0, }} data-theme={themeTracker && themeTracker?.name.toLowerCase()}>
              <ChatHistoryHeading
                onNewChat={props.onNewConversation || (() => {})}
                onToggleHistory={props.onToggleHistorySidebar || (() => {})}
                showHistorySidebar={props.showHistorySidebar || false}
                archiveChat={props.onArchiveConversation || (() => {})}
                currentConversationId={props.currentConversationId}
                showButton={showButton}
                setShowButton={setShowButton}
                theme={themeTracker?.name}
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
                />
              </section>
            </div>
          )
        )}
      </div>

      {
        props.showHistorySidebar && props.isMaximized === false && props.conversations ? (
          <AiChatPromptAreaForHistory
            themeTracker={themeTracker}
            showHistorySidebar={props.showHistorySidebar || false}
            isMaximized={false}
            showAssistantOptions={showAssistantOptions}
            modelOpt={modelOpt}
            menuRef={menuRef}
            setShowAssistantOptions={setShowAssistantOptions}
            assistantChoice={assistantChoice}
            setAssistantChoice={setAssistantChoice}
            aiAssistantGroupList={aiAssistantGroupList}
            mcpEnabled={mcpEnabled}
            mcpEnhanced={mcpEnhanced}
            setMcpEnhanced={setMcpEnhanced}
            availableModels={availableModels}
            selectedModel={selectedModel}
            handleModelSelection={handleModelSelection}
            input={input}
            setInput={setInput}
            isStreaming={isStreaming}
            handleSend={handleSend}
            stopRequest={stopRequest}
            showModelOptions={showModelOptions}
            setShowModelOptions={setShowModelOptions}
            handleSetAssistant={handleSetAssistant}
            handleSetModel={handleSetModel}
            handleGenerateWorkspace={handleGenerateWorkspace}
            handleRecord={handleRecord}
            isRecording={isRecording}
            dispatchActivity={dispatchActivity}
            modelBtnRef={modelBtnRef}
            modelSelectorBtnRef={modelSelectorBtnRef}
            textareaRef={textareaRef}
            maximizePanel={maximizePanel}
          />
        ) : (
          <AiChatPromptArea
            themeTracker={themeTracker}
            showHistorySidebar={props.showHistorySidebar || false}
            isMaximized={props.isMaximized || false}
            showAssistantOptions={showAssistantOptions}
            modelOpt={modelOpt}
            menuRef={menuRef}
            setShowAssistantOptions={setShowAssistantOptions}
            assistantChoice={assistantChoice}
            setAssistantChoice={setAssistantChoice}
            aiAssistantGroupList={aiAssistantGroupList}
            mcpEnabled={mcpEnabled}
            mcpEnhanced={mcpEnhanced}
            setMcpEnhanced={setMcpEnhanced}
            availableModels={availableModels}
            selectedModel={selectedModel}
            handleModelSelection={handleModelSelection}
            input={input}
            setInput={setInput}
            isStreaming={isStreaming}
            handleSend={handleSend}
            stopRequest={stopRequest}
            showModelOptions={showModelOptions}
            setShowModelOptions={setShowModelOptions}
            handleSetAssistant={handleSetAssistant}
            handleSetModel={handleSetModel}
            handleGenerateWorkspace={handleGenerateWorkspace}
            handleRecord={handleRecord}
            isRecording={isRecording}
            dispatchActivity={dispatchActivity}
            modelBtnRef={modelBtnRef}
            modelSelectorBtnRef={modelSelectorBtnRef}
            textareaRef={textareaRef}
            maximizePanel={maximizePanel}
          />
        )
      }
    </div>
  )
})

