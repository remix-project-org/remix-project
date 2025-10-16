import React, { useState, useEffect, useCallback, useRef, useImperativeHandle, MutableRefObject, useContext } from 'react'
import '../css/remix-ai-assistant.css'

import { ChatCommandParser, GenerationParams, ChatHistory, HandleStreamResponse, listModels, isOllamaAvailable } from '@remix/remix-ai-core'
import { HandleOpenAIResponse, HandleMistralAIResponse, HandleAnthropicResponse, HandleOllamaResponse } from '@remix/remix-ai-core'
import '../css/color.css'
import { Plugin } from '@remixproject/engine'
import { ModalTypes } from '@remix-ui/app'
import { MatomoEvent, AIEvent, RemixAIEvent, RemixAIAssistantEvent } from '@remix-api'
import { TrackingContext } from '@remix-ide/tracking'
import { PromptArea } from './prompt'
import { ChatHistoryComponent } from './chat'
import { ActivityType, ChatMessage } from '../lib/types'
import { groupListType } from '../types/componentTypes'
import GroupListMenu from './contextOptMenu'
import { useOnClickOutside } from './onClickOutsideHook'

export interface RemixUiRemixAiAssistantProps {
  plugin: Plugin
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
  const [showAssistantOptions, setShowAssistantOptions] = useState(false)
  const [showModelOptions, setShowModelOptions] = useState(false)
  const [assistantChoice, setAssistantChoice] = useState<'openai' | 'mistralai' | 'anthropic' | 'ollama'>(
    'mistralai'
  )
  const [contextChoice, setContextChoice] = useState<'none' | 'current' | 'opened' | 'workspace'>(
    'none'
  )
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)
  const trackMatomoEvent = <T extends MatomoEvent = AIEvent>(event: T) => {
    baseTrackEvent?.<T>(event)
  }
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [selectedModel, setSelectedModel] = useState<string | null>(null)
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

  useOnClickOutside([modelBtnRef, contextBtnRef], () => setShowAssistantOptions(false))
  useOnClickOutside([modelBtnRef, contextBtnRef], () => setShowContextOptions(false))
  useOnClickOutside([modelSelectorBtnRef], () => setShowModelOptions(false))

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
          trackMatomoEvent({ category: 'ai', action: 'AddingAIContext', name: choice, isClick: true })
          const f = await props.plugin.call('fileManager', 'getCurrentFile')
          if (f) files = [f]
          await props.plugin.call('remixAI', 'setContextFiles', { context: 'currentFile' })
        }
        break
      case 'opened':
        {
          trackMatomoEvent({ category: 'ai', action: 'AddingAIContext', name: choice, isClick: true })
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
          trackMatomoEvent({ category: 'ai', action: 'AddingAIContext', name: choice, isClick: true })
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
    const update = () => refreshContext(contextChoice)

    if (contextChoice === 'current' || contextChoice === 'opened') {
      props.plugin.on('fileManager', 'currentFileChanged', update)
      props.plugin.on('fileManager', 'fileClosed', update)
      return () =>
        props.plugin.off('fileManager', 'currentFileChanged')
    }
  }, [contextChoice, refreshContext, props.plugin])

  // useEffect(() => {
  //   const fetchAssistantChoice = async () => {
  //     console.log('Fetching assistant choice from plugin')
  //     const choice = await props.plugin.call('remixAI', 'getAssistantProvider')
  //     setAssistantChoice(choice || 'openai')
  //   }
  //   fetchAssistantChoice()
  // }, [props.plugin])

  useEffect(() => {
    props.plugin.on('theme', 'themeChanged', (theme) => {
      setThemeTracker(theme)
    })
    return () => {
      props.plugin.off('theme', 'themeChanged')
    }
  })

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
      trackMatomoEvent<RemixAIAssistantEvent>({ category: 'remixAIAssistant', action: 'likeResponse', isClick: true })
    } else if (next === 'dislike') {
      trackMatomoEvent<RemixAIAssistantEvent>({ category: 'remixAIAssistant', action: 'dislikeResponse', isClick: true })
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

      /** append streaming chunks helper (kept identical) */
      const appendAssistantChunk = (msgId: string, chunk: string) => {
        setMessages(prev =>
          prev.map(m => (m.id === msgId ? { ...m, content: m.content + chunk } : m))
        )
      }

      try {
        setIsStreaming(true)

        // Add temporary assistant message for parsing status
        const parsingId = crypto.randomUUID()
        setMessages(prev => [
          ...prev,
          { id: parsingId, role: 'assistant', content: '***Processing command...***', timestamp: Date.now(), sentiment: 'none' }
        ])

        // callback to update parsing status with minimum display time
        const updateParsingStatus = (status: string): Promise<void> => {
          console.log(status)
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
        switch (assistantChoice) {
        case 'openai':
          HandleOpenAIResponse(
            response,
            (chunk: string) => appendAssistantChunk(assistantId, chunk),
            (finalText: string, threadId) => {
              ChatHistory.pushHistory(trimmed, finalText)
              setIsStreaming(false)
              props.plugin.call('remixAI', 'setAssistantThrId', threadId)
            }
          )
          break;
        case 'mistralai':
          HandleMistralAIResponse(
            response,
            (chunk: string) => appendAssistantChunk(assistantId, chunk),
            (finalText: string, threadId) => {
              ChatHistory.pushHistory(trimmed, finalText)
              setIsStreaming(false)
              props.plugin.call('remixAI', 'setAssistantThrId', threadId)
            }
          )
          // Add MistralAI handler here if available
          break;
        case 'anthropic':
          HandleAnthropicResponse(
            response,
            (chunk: string) => appendAssistantChunk(assistantId, chunk),
            (finalText: string, threadId) => {
              ChatHistory.pushHistory(trimmed, finalText)
              setIsStreaming(false)
              props.plugin.call('remixAI', 'setAssistantThrId', threadId)
            }
          )
          // Add Anthropic handler here if available
          break;
        case 'ollama':
        {
          // Create a reasoning callback that updates the assistant message
          const reasoningCallback = (status: string) => {
            setMessages(prev =>
              prev.map(m => (m.id === assistantId ? { ...m, content: `${status}` } : m))
            )
          }

          HandleOllamaResponse(
            response,
            (chunk: string) => appendAssistantChunk(assistantId, chunk),
            (finalText: string) => {
              ChatHistory.pushHistory(trimmed, finalText)
              setIsStreaming(false)
            },
            reasoningCallback
          )
          break;
        }
        default:
          HandleStreamResponse(
            response,
            (chunk: string) => appendAssistantChunk(assistantId, chunk),
            (finalText: string) => {
              ChatHistory.pushHistory(trimmed, finalText)
              setIsStreaming(false)
            }
          )
        }
        setIsStreaming(false)
      }
      catch (error) {
        console.error('Error sending prompt:', error)
        setIsStreaming(false)
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
  const handleGenerateWorkspaceWithPrompt = useCallback(async (prompt: string) => {
    dispatchActivity('button', 'generateWorkspace')
    if (prompt && prompt.trim()) {
      await sendPrompt(`/workspace ${prompt.trim()}`)
      trackMatomoEvent<RemixAIEvent>({ category: 'remixAI', action: 'GenerateNewAIWorkspaceFromEditMode', name: prompt, isClick: true })
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
    setShowAssistantOptions(false)
    setShowContextOptions(prev => !prev)
  }, [])

  const handleSetAssistant = useCallback(() => {
    dispatchActivity('button', 'setAssistant')
    setShowContextOptions(false)
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
          trackMatomoEvent<RemixAIEvent>({ category: 'remixAI', action: 'SetAIProvider', name: assistantChoice, isClick: true })
          // Log specific Ollama selection
          if (assistantChoice === 'ollama') {
            trackMatomoEvent({ category: 'ai', action: 'ollama_provider_selected', name: `from:${choiceSetting || 'unknown'}`, isClick: false })
          }
        } else {
          // This is a fallback, just update the backend silently
          trackMatomoEvent({ category: 'ai', action: 'ollama_fallback_to_provider', name: `${assistantChoice}|from:${choiceSetting}`, isClick: false })
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
                trackMatomoEvent({ category: 'ai', action: 'ollama_default_model_selected', name: `${defaultModel}|codestral|total:${models.length}`, isClick: false })
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
              content: '**Ollama is not available.**\n\nTo use Ollama with Remix IDE:\n\n1. **Install Ollama**: Visit [ollama.ai](https://ollama.ai) to download\n2. **Start Ollama**: Run `ollama serve` in your terminal\n3. **Install a model**: Run `ollama pull codestral:latest`\n4. **Configure CORS**: Set `OLLAMA_ORIGINS=https://remix.ethereum.org`\n\nSee the [Ollama Setup Guide](https://github.com/ethereum/remix-project/blob/master/OLLAMA_SETUP.md) for detailed instructions.\n\n*Switching back to previous model for now.*',
              timestamp: Date.now(),
              sentiment: 'none'
            }])
            // Log Ollama unavailable event
            trackMatomoEvent({ category: 'ai', action: 'ollama_unavailable', name: 'switching_to_mistralai', isClick: false })
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
            content: `**Failed to connect to Ollama.**\n\nError: ${error.message || 'Unknown error'}\n\nPlease ensure:\n- Ollama is running (\`ollama serve\`)\n- CORS is configured for Remix IDE\n- At least one model is installed\n\nSee the [Ollama Setup Guide](https://github.com/ethereum/remix-project/blob/master/OLLAMA_SETUP.md) for help.\n\n*Switching back to previous model.*`,
            timestamp: Date.now(),
            sentiment: 'none'
          }])
          // Log Ollama connection error
          trackMatomoEvent({ category: 'ai', action: 'ollama_connection_error', name: `${error.message || 'unknown'}|switching_to_mistralai`, isClick: false })
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
    trackMatomoEvent({ category: 'ai', action: 'ollama_model_selected', name: `${modelName}|from:${previousModel || 'none'}`, isClick: true })
    // Update the model in the backend
    try {
      await props.plugin.call('remixAI', 'setModel', modelName)
      trackMatomoEvent({ category: 'ai', action: 'ollama_model_set_backend_success', name: modelName, isClick: false })
    } catch (error) {
      console.warn('Failed to set model:', error)
      trackMatomoEvent({ category: 'ai', action: 'ollama_model_set_backend_failed', name: `${modelName}|${error.message || 'unknown'}`, isClick: false })
    }
    trackMatomoEvent<RemixAIEvent>({ category: 'remixAI', action: 'SetOllamaModel', name: modelName, isClick: true })
  }, [props.plugin, selectedModel])

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
        trackMatomoEvent<RemixAIEvent>({ category: 'remixAI', action: 'GenerateNewAIWorkspaceFromModal', name: description, isClick: true })
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
    await props.plugin.call('layout', 'maximisePinnedPanel')
    setIsMaximized(true) // ensured that expansion of the panel is stateful
  }

  return (
    <div
      className="d-flex flex-column h-100 w-100 overflow-x-hidden"
      ref={aiChatRef}
    >
      <section id="remix-ai-chat-history" className="h-83 d-flex flex-column p-2 overflow-x-hidden" style={{ flex: 7, overflowY: 'scroll' }} ref={chatHistoryRef}>
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
      <section id="remix-ai-prompt-area" className="mt-1" style={{ flex: 1 }}
      >
        {showAssistantOptions && (
          <div
            className="pt-2 mb-2 z-3 bg-light border border-text w-75"
            style={{ borderRadius: '8px' }}
          >
            <div className="text-uppercase ms-2 mb-2 small">AI Assistant Provider</div>
            <GroupListMenu
              setChoice={setAssistantChoice}
              setShowOptions={setShowAssistantOptions}
              choice={assistantChoice}
              groupList={aiAssistantGroupList}
            />
          </div>
        )}
        {showModelOptions && assistantChoice === 'ollama' && (
          <div
            className="pt-2 mb-2 z-3 bg-light border border-text w-75"
            style={{ borderRadius: '8px' }}
          >
            <div className="text-uppercase ml-2 mb-2 small">Ollama Model</div>
            <GroupListMenu
              setChoice={handleModelSelection}
              setShowOptions={setShowModelOptions}
              choice={selectedModel}
              groupList={availableModels.map(model => ({
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
          showContextOptions={showContextOptions}
          setShowContextOptions={setShowContextOptions}
          showAssistantOptions={showAssistantOptions}
          setShowAssistantOptions={setShowAssistantOptions}
          showModelOptions={showModelOptions}
          setShowModelOptions={setShowModelOptions}
          contextChoice={contextChoice}
          setContextChoice={setContextChoice}
          assistantChoice={assistantChoice}
          setAssistantChoice={setAssistantChoice}
          availableModels={availableModels}
          selectedModel={selectedModel}
          contextFiles={contextFiles}
          clearContext={clearContext}
          handleAddContext={handleAddContext}
          handleSetAssistant={handleSetAssistant}
          handleSetModel={handleSetModel}
          handleModelSelection={handleModelSelection}
          handleGenerateWorkspace={handleGenerateWorkspace}
          dispatchActivity={dispatchActivity}
          contextBtnRef={contextBtnRef}
          modelBtnRef={modelBtnRef}
          modelSelectorBtnRef={modelSelectorBtnRef}
          aiContextGroupList={aiContextGroupList}
          aiAssistantGroupList={aiAssistantGroupList}
          textareaRef={textareaRef}
          aiMode={aiMode}
          setAiMode={setAiMode}
          isMaximized={isMaximized}
          setIsMaximized={setIsMaximized}
        />
      </section>
    </div>
  )
})

