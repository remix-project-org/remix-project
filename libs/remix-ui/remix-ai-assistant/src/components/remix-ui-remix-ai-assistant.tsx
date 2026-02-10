/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import React, { useState, useEffect, useCallback, useRef, useImperativeHandle, MutableRefObject, useContext } from 'react'
import '../css/remix-ai-assistant.css'

import { ChatCommandParser, GenerationParams, ChatHistory, HandleStreamResponse, listModels, isOllamaAvailable, AIModel, AVAILABLE_MODELS, getDefaultModel } from '@remix/remix-ai-core'
import { HandleOpenAIResponse, HandleMistralAIResponse, HandleAnthropicResponse, HandleOllamaResponse } from '@remix/remix-ai-core'
import { useModelAccess } from '../hooks/useModelAccess'
import '../css/color.css'
import { Plugin } from '@remixproject/engine'
import { ModalTypes } from '@remix-ui/app'
import { MatomoEvent, AIEvent, RemixAIAssistantEvent } from '@remix-api'
//@ts-ignore
import { TrackingContext } from '@remix-ide/tracking'
import { PromptArea } from './prompt'
import { ChatHistoryComponent } from './chat'
import { ActivityType, ChatMessage } from '../lib/types'
import { groupListType } from '../types/componentTypes'
import GroupListMenu from './contextOptMenu'
import { useOnClickOutside } from './onClickOutsideHook'
import { RemixAIAssistant } from 'apps/remix-ide/src/app/plugins/remix-ai-assistant'
import { useAudioTranscription } from '../hooks/useAudioTranscription'
import { QueryParams } from '@remix-project/remix-lib'

export interface RemixUiRemixAiAssistantProps {
  plugin: RemixAIAssistant
  queuedMessage: { text: string; timestamp: number } | null
  initialMessages?: ChatMessage[]
  onMessagesChange?: (msgs: ChatMessage[]) => void
  /** optional callback whenever the user or AI does something */
  onActivity?: (type: ActivityType, payload?: any) => void
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
  const [showContextOptions, setShowContextOptions] = useState(false)
  const [showModelSelector, setShowModelSelector] = useState(false)
  const [showOllamaModelSelector, setShowOllamaModelSelector] = useState(false)
  const [selectedModelId, setSelectedModelId] = useState<string>(getDefaultModel().id)
  const [selectedModel, setSelectedModel] = useState<AIModel>(getDefaultModel())
  const [ollamaModels, setOllamaModels] = useState<string[]>([])
  const [selectedOllamaModel, setSelectedOllamaModel] = useState<string | null>(null)
  const [contextChoice, setContextChoice] = useState<'none' | 'current' | 'opened' | 'workspace'>(
    'none'
  )
  const [aiAssistantHeight, setAiAssistantHeight] = useState(window.innerHeight < 750 ? 87 : window.innerHeight < 1000 ? 89.6 : 92)

  // Check if MCP is enabled via query parameter
  const queryParams = new QueryParams()
  const mcpEnabled = queryParams.exists('experimental')

  const [mcpEnhanced, setMcpEnhanced] = useState(mcpEnabled)
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)
  const trackMatomoEvent = <T extends MatomoEvent = AIEvent>(event: T) => {
    baseTrackEvent?.<T>(event)
  }
  const modelAccess = useModelAccess()
  const [isOllamaFailureFallback, setIsOllamaFailureFallback] = useState(false)
  const [aiMode, setAiMode] = useState<'ask' | 'edit'>('ask')
  const [themeTracker, setThemeTracker] = useState(null)
  const [isMaximized, setIsMaximized] = useState(false)
  const historyRef = useRef<HTMLDivElement | null>(null)
  const modelBtnRef = useRef(null)
  const modelSelectorBtnRef = useRef(null)
  const contextBtnRef = useRef(null)
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

  useOnClickOutside([modelBtnRef, contextBtnRef], () => setShowModelSelector(false))
  useOnClickOutside([modelBtnRef, contextBtnRef], () => setShowContextOptions(false))
  useOnClickOutside([modelSelectorBtnRef], () => setShowOllamaModelSelector(false))

  const getBoundingRect = (ref: MutableRefObject<any>) => ref.current?.getBoundingClientRect()
  const calcAndConvertToDvh = (coordValue: number) => (coordValue / window.innerHeight) * 100
  const calcAndConvertToDvw = (coordValue: number) => (coordValue / window.innerWidth) * 100
  const chatCmdParser = new ChatCommandParser(props.plugin)

  const aiContextGroupList: groupListType[] = [
    {
      label: 'None',
      bodyText: 'Uses no context',
      icon: 'fa-solid fa-check',
      stateValue: 'none',
      dataId: 'composer-ai-context-none'
    },
    {
      label: 'Current file',
      bodyText: 'Uses the current file in the editor as context',
      icon: 'fa-solid fa-check',
      stateValue: 'current',
      dataId: 'currentFile-context-option'
    },
    {
      label: 'All opened files',
      bodyText: 'Uses all files opened in the editor as context',
      icon: 'fa-solid fa-check',
      stateValue: 'opened',
      dataId: 'allOpenedFiles-context-option'
    },
    {
      label: 'Workspace',
      bodyText: 'Uses the current workspace as context',
      icon: 'fa-solid fa-check',
      stateValue: 'workspace',
      dataId: 'workspace-context-option'
    }
  ]

  const dispatchActivity = useCallback(
    (type: ActivityType, payload?: any) => {
      props.onActivity?.(type, payload)
    },
    [props.onActivity]
  )
  const [contextFiles, setContextFiles] = useState<string[]>([])
  const clearContext = () => {
    setContextChoice('none')
    setContextFiles([])
    props.plugin.call('remixAI', 'setContextFiles', { context: 'none' })
  }
  const refreshContext = useCallback(async (choice: typeof contextChoice) => {
    try {
      let files: string[] = []
      switch (choice) {
      case 'none':
        await props.plugin.call('remixAI', 'setContextFiles', { context: 'none' })
        files = []
        break
      case 'current':
        {
          trackMatomoEvent({ category: 'ai', action: 'remixAI', name: 'AddingAIContext', value: choice, isClick: true })
          const f = await props.plugin.call('fileManager', 'getCurrentFile')
          if (f) files = [f]
          await props.plugin.call('remixAI', 'setContextFiles', { context: 'currentFile' })
        }
        break
      case 'opened':
        {
          trackMatomoEvent({ category: 'ai', action: 'remixAI', name: 'AddingAIContext', value: choice, isClick: true })
          const res = await props.plugin.call('fileManager', 'getOpenedFiles')
          if (Array.isArray(res)) {
            files = res
          } else if (res && typeof res === 'object') {
            files = Object.values(res) as string[]
          }
          await props.plugin.call('remixAI', 'setContextFiles', { context: 'openedFiles' })
        }
        break
      case 'workspace':
        {
          trackMatomoEvent({ category: 'ai', action: 'remixAI', name: 'AddingAIContext', value: choice, isClick: true })
          await props.plugin.call('remixAI', 'setContextFiles', { context: 'workspace' })
          files = ['@workspace']
        }
        break
      }
      setContextFiles(files)
    } catch (err) {
      console.error('Failed to refresh context:', err)
    }
  }, [props.plugin])

  useEffect(() => {
    if (props.plugin.externalMessage) {
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: props.plugin.externalMessage, timestamp: Date.now(), sentiment: 'none' }])
    }
  }, [props.plugin.externalMessage])

  useEffect(() => {
    const update = () => refreshContext(contextChoice)

    if (contextChoice === 'current' || contextChoice === 'opened') {
      props.plugin.on('fileManager', 'currentFileChanged', update)
      props.plugin.on('fileManager', 'fileClosed', update)
      return () =>
        props.plugin.off('fileManager', 'currentFileChanged')
    }
  }, [contextChoice, refreshContext, props.plugin])

  useEffect(() => {
    props.plugin.on('theme', 'themeChanged', (theme) => {
      setThemeTracker(theme)
    })
    return () => {
      props.plugin.off('theme', 'themeChanged')
    }
  })

  // Listen for auth state changes and refresh model access
  useEffect(() => {
    const handleAuthChange = async (authState: { isAuthenticated: boolean; user: any; token: string | null }) => {
      // Refresh model access permissions
      console.log('calling modelaccess')
      await modelAccess.refreshAccess()

      // If user logged out, revert to default model
      console.log('user is logged in', authState)
      if (!authState.isAuthenticated) {
        const defaultModel = getDefaultModel()
        setSelectedModelId(defaultModel.id)
        setSelectedModel(defaultModel)
        console.log("Setting default model user not authenticated", defaultModel.id)
        await props.plugin.call('remixAI', 'setModel', defaultModel.id)
      }
    }

    props.plugin.on('auth', 'authStateChanged', handleAuthChange)
    return () => {
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

        // Use the selected model's provider to determine handler
        const provider = selectedModel.provider
        switch (provider) {
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
    [isStreaming, props.plugin, selectedModel]
  )

  const handleGenerateWorkspaceWithPrompt = useCallback(async (prompt: string) => {
    dispatchActivity('button', 'generateWorkspace')
    if (prompt && prompt.trim()) {
      await sendPrompt(`/workspace ${prompt.trim()}`)
      trackMatomoEvent<AIEvent>({ category: 'ai', action: 'GenerateNewAIWorkspaceFromEditMode', name: prompt, isClick: true })
    }
  }, [sendPrompt])

  const handleSend = useCallback(async () => {
    if (aiMode === 'ask') {
      await sendPrompt(input)
    } else if (aiMode === 'edit') {
      // Call generateWorkspace for edit mode with the current input
      await handleGenerateWorkspaceWithPrompt(input)
    }
    setInput('')
  }, [input, sendPrompt, aiMode, handleGenerateWorkspaceWithPrompt])

  // Added handlers for special command buttons (assumed to exist)
  const handleAddContext = useCallback(() => {
    dispatchActivity('button', 'addContext')
    setShowModelSelector(false)
    setShowContextOptions(prev => !prev)
  }, [])

  const handleSetModel = useCallback(() => {
    dispatchActivity('button', 'setModel')
    setShowContextOptions(false)
    setShowModelSelector(prev => !prev)
  }, [])

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
        } catch (error) {
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

    // Special handling for Ollama
    if (model.provider === 'ollama') {
      // Fetch available Ollama models
      try {
        const models = await props.plugin.call('remixAI', 'getOllamaModels')
        setOllamaModels(models)
        setShowOllamaModelSelector(true)
      } catch (err) {
        console.error('Ollama not available:', err)
      }
    } else {
      // Set model in plugin
      try {
        await props.plugin.call('remixAI', 'setModel', modelId)
        trackMatomoEvent({ category: 'ai', action: 'remixAI', name: 'model_selected', value: modelId, isClick: true })
      } catch (error) {
        console.warn('Failed to set model:', error)
      }
    }

    setShowModelSelector(false)
  }, [props.plugin, modelAccess])

  const handleOllamaModelSelection = useCallback(async (modelName: string) => {
    const previousModel = selectedOllamaModel
    setSelectedOllamaModel(modelName)
    setShowOllamaModelSelector(false)
    trackMatomoEvent({ category: 'ai', action: 'remixAI', name: 'ollama_model_selected', value: `${modelName}|from:${previousModel || 'none'}`, isClick: true })
    // Update the model in the backend
    try {
      await props.plugin.call('remixAI', 'setModel', modelName)
      trackMatomoEvent({ category: 'ai', action: 'remixAI', name: 'ollama_model_set_backend_success', value: modelName, isClick: false })
    } catch (error) {
      console.warn('Failed to set model:', error)
      trackMatomoEvent({ category: 'ai', action: 'remixAI', name: 'ollama_model_set_backend_failed', value: `${modelName}|${error.message || 'unknown'}`, isClick: false })
    }
    trackMatomoEvent<AIEvent>({ category: 'ai', action: 'remixAI', name: 'ollama_model_selected_final', value: modelName, isClick: true })
  }, [props.plugin, selectedOllamaModel])

  // refresh context whenever selection changes (even if selector is closed)
  useEffect(() => {
    refreshContext(contextChoice)
  }, [contextChoice, refreshContext])

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
    setIsMaximized(true) // ensured that expansion of the panel is stateful
  }

  return (
    <div
      className="d-flex flex-column w-100 overflow-x-hidden h-100"
      ref={aiChatRef}
    >
      <section id="remix-ai-chat-history" className="h-83 d-flex flex-column p-2 overflow-x-hidden" style={{ flex: 1, overflowY: 'scroll' }} ref={chatHistoryRef}>
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
        />
      </section>
      <section id="remix-ai-prompt-area" className="mt-1" style={{ minHeight: '140px', maxHeight: '180px' }}
      >
        {showModelSelector && (
          <div
            className="pt-2 mb-2 z-3 bg-light border border-text w-75"
            style={{ borderRadius: '8px' }}
          >
            <div className="text-uppercase ms-2 mb-2 small">AI Model</div>
            <GroupListMenu
              setChoice={handleModelSelection}
              setShowOptions={setShowModelSelector}
              choice={selectedModelId}
              groupList={AVAILABLE_MODELS
                .filter(model => {
                  // Check if user is logged in by checking for token
                  const isLoggedIn = !!localStorage.getItem('remix_access_token')

                  // If not logged in, only show models that don't require auth
                  if (!isLoggedIn) {
                    return !model.requiresAuth
                  }

                  // If logged in, only show models the user has access to
                  return modelAccess.checkAccess(model.id)
                })
                .map(model => ({
                  label: model.name,
                  bodyText: model.description,
                  icon: 'fa-solid fa-check',
                  stateValue: model.id,
                  dataId: `ai-model-${model.id.replace(/[^a-zA-Z0-9]/g, '-')}`
                }))}
            />
            {mcpEnabled && (
              <div className="border-top mt-2 pt-2">
                <div className="text-uppercase ms-2 mb-2 small">MCP Enhancement</div>
                <div className="form-check ms-2 mb-2">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="mcpEnhancementToggle"
                    checked={mcpEnhanced}
                    onChange={(e) => setMcpEnhanced(e.target.checked)}
                  />
                  <label className="form-check-label small" htmlFor="mcpEnhancementToggle">
                    Enable MCP context enhancement
                  </label>
                </div>
                <div className="small text-muted ms-2">
                  Adds relevant context from configured MCP servers to AI requests
                </div>
              </div>
            )}
          </div>
        )}
        {showOllamaModelSelector && selectedModel.provider === 'ollama' && (
          <div
            className="pt-2 mb-2 z-3 bg-light border border-text w-75"
            style={{ borderRadius: '8px' }}
          >
            <div className="text-uppercase ml-2 mb-2 small">Ollama Model</div>
            <GroupListMenu
              setChoice={handleOllamaModelSelection}
              setShowOptions={setShowOllamaModelSelector}
              choice={selectedOllamaModel}
              groupList={ollamaModels.map(model => ({
                label: model,
                bodyText: `Use ${model} model`,
                icon: 'fa-solid fa-check',
                stateValue: model,
                dataId: `ollama-model-${model.replace(/[^a-zA-Z0-9]/g, '-')}`
              }))}
            />
          </div>
        )}
        <PromptArea
          input={input}
          maximizePanel={maximizePanel}
          setInput={setInput}
          isStreaming={isStreaming}
          handleSend={handleSend}
          handleStop={stopRequest}
          showContextOptions={showContextOptions}
          setShowContextOptions={setShowContextOptions}
          showModelSelector={showModelSelector}
          setShowModelSelector={setShowModelSelector}
          showOllamaModelSelector={showOllamaModelSelector}
          setShowOllamaModelSelector={setShowOllamaModelSelector}
          contextChoice={contextChoice}
          setContextChoice={setContextChoice}
          selectedModel={selectedModel}
          ollamaModels={ollamaModels}
          selectedOllamaModel={selectedOllamaModel}
          contextFiles={contextFiles}
          clearContext={clearContext}
          handleAddContext={handleAddContext}
          handleSetModel={handleSetModel}
          handleModelSelection={handleModelSelection}
          handleOllamaModelSelection={handleOllamaModelSelection}
          handleGenerateWorkspace={handleGenerateWorkspace}
          handleRecord={handleRecord}
          isRecording={isRecording}
          dispatchActivity={dispatchActivity}
          contextBtnRef={contextBtnRef}
          modelBtnRef={modelBtnRef}
          modelSelectorBtnRef={modelSelectorBtnRef}
          aiContextGroupList={aiContextGroupList}
          textareaRef={textareaRef}
          aiMode={aiMode}
          setAiMode={setAiMode}
          isMaximized={isMaximized}
          setIsMaximized={setIsMaximized}
          modelAccess={modelAccess}
        />
      </section>
    </div>
  )
})

