/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import React, { useState, useEffect, useCallback, useRef, useImperativeHandle, MutableRefObject, useContext } from 'react'
//@ts-ignore
import '../css/remix-ai-assistant.css'

import { ChatCommandParser, GenerationParams, ChatHistory, HandleStreamResponse, listModels, isOllamaAvailable, AIModel, ANONYMOUS_FALLBACK_MODELS, aiErrorFromException, remixAILogger } from '@remix/remix-ai-core'
import { ToolApprovalRequest, ApiKeyErrorEvent } from '@remix/remix-ai-core'
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
import ChatHistoryHeading from './chatHistoryHeading'
import { ChatHistorySidebar } from './chatHistorySidebar'
import AiChatPromptAreaForHistory from './aiChatPromptAreaForHistory'
import AiChatPromptArea from './aiChatPromptArea'
import { CooldownBanner } from './cooldownBanner'
import { ChatNoticeStrip, type ChatNoticeDisplay, type ChatNoticeActionDisplay } from './chatNoticeStrip'
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
  onLoadConversation?: (id: string) => Promise<void>
  onArchiveConversation?: (id: string) => Promise<void>
  onDeleteConversation?: (id: string) => Promise<void>
  onDeleteAllConversations?: () => void
  onToggleHistorySidebar?: () => void
  onSearch?: (query: string) => Promise<ConversationMetadata[]>
  onOpenSkillsModal?: () => void
  onOpenChecklistModal?: () => void
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
  const [showModelSelector, setShowModelSelector] = useState(false)
  const [assistantChoice, setAssistantChoice] = useState<'openai' | 'mistralai' | 'anthropic' | 'ollama'>(
    'mistralai'
  )
  const [showArchivedConversations, setShowArchivedConversations] = useState(false)
  const [showButton, setShowButton] = useState(true);
  const [isAiChatMaximized, setIsAiChatMaximized] = useState(false)
  const [showOllamaModelSelector, setShowOllamaModelSelector] = useState(false)
  const [selectedOllamaModel, setSelectedOllamaModel] = useState<string | null>(null)
  const [selectedModelId, setSelectedModelId] = useState<string>('')
  const [isMaximized, setIsMaximized] = useState(false)
  // MCP Enhancement is gated by the `mcp:basicExternal` feature flag.
  // Anonymous users have no permissions, so the section stays hidden.
  // Refreshed in the same `refreshFeatures` block as `ai:auto`.
  const [mcpEnabled, setMcpEnabled] = useState(true)

  // Route readiness signal — drives the small badge next to the model
  // selector and gates the input while DeepAgent/MCP/model are still
  // settling. Updated via the `routeStatusChanged` event from the plugin
  // (plus an initial fetch on mount).
  const [aiRouteStatus, setAiRouteStatus] = useState<{
    route: 'initializing' | 'agent' | 'tools' | 'chat'
    ready: boolean
  }>({ route: 'initializing', ready: false })

  // Authentication signal — mirrored from the assistantState snapshot.
  // Drives the composer's sign-in CTA so an anonymous user gets a clear
  // "Sign in to chat" affordance instead of a perpetually-disabled
  // "Initialising agents…" placeholder (the route will never become
  // ready until they authenticate).
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false)

  // Permission-derived state for the locked-model picker pills. Defaults
  // to 'hidden' so an unauthenticated/loading account never flashes a
  // checkout CTA. Re-computed whenever assistantState emits stateChanged.
  // See contextOptMenu.tsx for the rendering rules.
  type PillState = 'hidden' | 'coming_soon' | 'available'
  const [pillStates, setPillStates] = useState<{ upgrade: PillState; buyCredits: PillState }>({
    upgrade: 'hidden',
    buyCredits: 'hidden'
  })

  // Permission state for specific features
  const [hasAuditorPermission, setHasAuditorPermission] = useState(false)
  const [hasSkillsPermission, setHasSkillsPermission] = useState(false)

  const [mcpEnhanced, setMcpEnhanced] = useState(false)
  const [pendingApprovals, setPendingApprovals] = useState<ToolApprovalRequest[]>([])
  const approvalQueueRef = useRef<ToolApprovalRequest[]>([])
  // Tracks which approval requests are currently being reviewed in the editor via showCustomDiff
  const [reviewingApprovals, setReviewingApprovals] = useState<Set<string>>(new Set())
  const pendingDiffApprovalRef = useRef<{ requestId: string; filePath: string } | null>(null)

  // HITL auto-accept state
  const HITL_AUTO_ACCEPT_KEY = 'remix_hitl_auto_accept'
  const [hitlAutoAccept, setHitlAutoAccept] = useState(() => localStorage.getItem('remix_hitl_auto_accept') === 'true')
  const hitlAutoAcceptRef = useRef(hitlAutoAccept)
  useEffect(() => { hitlAutoAcceptRef.current = hitlAutoAccept }, [hitlAutoAccept])
  const toggleHitlAutoAccept = useCallback(() => {
    setHitlAutoAccept(prev => {
      const next = !prev
      localStorage.setItem(HITL_AUTO_ACCEPT_KEY, String(next))
      remixAILogger.log('[HITL] Auto-accept toggled:', next)
      return next
    })
  }, [])
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)
  const trackMatomoEvent = <T extends MatomoEvent = AIEvent>(event: T) => {
    baseTrackEvent?.<T>(event)
  }
  const modelAccess = useModelAccess(props.plugin as any)
  // Live AI model catalogue, sourced from the assistantState plugin (which
  // owns the /permissions response). Picker `isLocked` is derived from
  // each entry's `available` flag — we no longer cross-check provider
  // features here. Anonymous users see ANONYMOUS_FALLBACK_MODELS until
  // assistantState reports otherwise.
  const [availableModels, setAvailableModels] = useState<AIModel[]>(ANONYMOUS_FALLBACK_MODELS)
  // ai:auto feature flag — gates the Auto Mode option in the model picker.
  // Sourced from assistantState.hasFeature('ai:auto') and refreshed on
  // every stateChanged event. Anonymous users get false.
  const [autoModeAvailable, setAutoModeAvailable] = useState(false)
  // Tracks whether we've applied the "auto is the default for logged-in
  // users" rule in the current session. Reset when ai:auto flips back to
  // false (logout) so the next login re-applies the default.
  const autoDefaultAppliedRef = useRef(false)
  const [modelOpt, setModelOpt] = useState({ top: 0, left: 0 })
  const menuRef = useRef<any>()
  const [ollamaModels, setOllamaModels] = useState<string[]>([])
  const [selectedModel, setSelectedModel] = useState<AIModel | null>(null)
  const [isOllamaFailureFallback, setIsOllamaFailureFallback] = useState(false)
  const [autoModeEnabled, setAutoModeEnabled] = useState(false)
  const [usingOwnApiKey, setUsingOwnApiKey] = useState(false)
  const [apiKeyError, setApiKeyError] = useState<ApiKeyErrorEvent | null>(null)
  const [themeTracker, setThemeTracker] = useState<{ name: string } | null>(() => ({ name: getSystemThemeFallback() }))
  const historyRef = useRef<HTMLDivElement | null>(null)
  const modelBtnRef = useRef(null)
  const modelSelectorBtnRef = useRef(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const aiChatRef = useRef<HTMLDivElement>(null)
  const userHasScrolledRef = useRef(false)
  const lastMessageCountRef = useRef(0)
  const abortControllerRef = useRef<AbortController | null>(null)
  // Tracks whether the current request has been stopped. Event handlers check this
  // to early-return and avoid processing stale events after the user clicks stop.
  const isStoppedRef = useRef<boolean>(false)
  const clearToolTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const uiToolCallbackRef = useRef<((isExecuting: boolean, toolName?: string, toolArgs?: Record<string, any>) => void) | null>(null)
  const wasInitializingRef = useRef(props.isInitializing)
  const streamingAssistantIdRef = useRef<string | null>(null)
  // Active subagent bubble. When a chunk arrives with `isSubagent: true`,
  // we render it into a SEPARATE bubble (keyed by subagent name) so the
  // Comprehensive Auditor / Planner / etc. doesn't append into the main
  // agent's growing message and push the Task Plan off-screen. Reset on
  // onSubagentComplete and at the end of every turn.
  const streamingSubagentBubbleRef = useRef<{ id: string; name: string } | null>(null)
  // Set true the moment a stream chunk lazily creates a bubble, or when
  // onStreamComplete fires. Tells the post-`await answer()` branch below
  // that the response was already painted by the streaming pipeline, so
  // we must NOT create a second bubble with the full text.
  const streamConsumedThisTurnRef = useRef<boolean>(false)
  if (props.isInitializing) wasInitializingRef.current = true

  // Cooldown UI state — driven by the assistantState plugin's `stateChanged`
  // event. When non-null, we render a banner above the prompt area. The
  // banner is informational only and the user can dismiss it; we remember
  // the dismissed key (code+expiresAt) in a ref so re-emits don't bring it
  // back until a new cooldown starts.
  const [cooldownDisplay, setCooldownDisplay] = useState<any | null>(null)
  const dismissedCooldownKeyRef = useRef<string | null>(null)
  // Chat-notice state — covers every AIError that ISN'T a cooldown and
  // ISN'T a plan-manager hand-off (PROVIDER_DENIED, server errors,
  // validation, unknown codes). Non-blocking: input stays editable.
  const [chatNotice, setChatNotice] = useState<ChatNoticeDisplay | null>(null)

  const dismissChatNotice = useCallback(() => {
    setChatNotice(null)
    try { void props.plugin.call('assistantState' as any, 'dismissChatNotice') } catch { /* noop */ }
  }, [props.plugin])

  const handleChatNoticeAction = useCallback(async (action: ChatNoticeActionDisplay) => {
    if (!action?.plugin || !action?.method) return
    try {
      const args = Array.isArray(action.args) ? action.args : []
      await props.plugin.call(action.plugin as any, action.method as any, ...args)
      if (action.dismissOnClick) dismissChatNotice()
    } catch (e) {
      remixAILogger.warn('[remix-ai-assistant] chat notice action failed', action, e)
    }
  }, [dismissChatNotice, props.plugin])

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
        try {
          ;(props.plugin as any).respondToToolApproval({
            requestId: approval.requestId,
            approved: false
          })
        } catch { /* best-effort */ }
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
      remixAILogger.warn('Failed to set model:', error)
      trackMatomoEvent({ category: 'ai', action: 'remixAI', name: 'ollama_model_set_backend_failed', value: `${modelName}|${error.message || 'unknown'}`, isClick: false })
    }
    trackMatomoEvent<AIEvent>({ category: 'ai', action: 'remixAI', name: 'ollama_model_selected_final', value: modelName, isClick: true })
  }, [props.plugin, selectedOllamaModel])

  useEffect(() => {
    props.plugin.call('theme', 'currentTheme')
      .then((theme) => setThemeTracker(theme))
      .catch((error: any) => remixAILogger.log(error))

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
        const model = availableModels.find(m => m.id === currentModelId)
        if (model) {
          setSelectedModelId(currentModelId)
          setSelectedModel(model)
          setAssistantChoice(model.provider as 'openai' | 'mistralai' | 'anthropic' | 'ollama')
        }
        await props.plugin.call('remixAI', 'setModelAccess', modelAccess)
      } catch (error) {
        remixAILogger.warn('[RemixAI Assistant UI] Failed to get initial model from plugin:', error)
      }
    }

    initializeModel()

    const handleModelChanged = async (modelId: string) => {
      remixAILogger.log('[RemixAI Assistant UI] Model changed to:', modelId)
      const model = availableModels.find(m => m.id === modelId)
      if (model) {
        setSelectedModelId(modelId)
        setSelectedModel(model)
        setAssistantChoice(model.provider as 'openai' | 'mistralai' | 'anthropic' | 'ollama')
      }
    }

    props.plugin.on('remixAI', 'modelChanged', handleModelChanged)

    const checkApiKeyStatus = async () => {
      try {
        const isUsingOwn = await props.plugin.call('remixAI', 'isUsingOwnApiKey')
        setUsingOwnApiKey(!!isUsingOwn)
      } catch (error) {
        remixAILogger.warn('[RemixAI Assistant] Failed to check API key status:', error)
      }
    }
    checkApiKeyStatus()

    const handleApiKeyModeChanged = (data: { usingOwnKey: boolean }) => {
      setUsingOwnApiKey(data.usingOwnKey)
    }
    props.plugin.on('remixAI', 'apiKeyModeChanged', handleApiKeyModeChanged)

    const handleApiKeyError = (error: ApiKeyErrorEvent) => {
      remixAILogger.error('[RemixAI Assistant] API key error:', error)
      setApiKeyError(error)
    }
    props.plugin.on('remixAI', 'onApiKeyError', handleApiKeyError)

    return () => {
      props.plugin.off('remixAI', 'modelChanged')
      props.plugin.off('remixAI', 'apiKeyModeChanged')
      props.plugin.off('remixAI', 'onApiKeyError')
    }
  }, [props.plugin, availableModels])

  // Subscribe to AI route-status updates so the UI can show a readiness
  // badge and gate the input while DeepAgent/MCP/model are settling.
  useEffect(() => {
    let cancelled = false
    const handleRouteStatusChanged = (status: { route: 'initializing' | 'agent' | 'tools' | 'chat'; ready: boolean }) => {
      if (cancelled) return
      setAiRouteStatus({ route: status.route, ready: status.ready })
    }
    props.plugin.on('remixAI', 'routeStatusChanged', handleRouteStatusChanged)
    // Initial pull — the plugin may have published before we subscribed.
    ;(async () => {
      try {
        const status = await props.plugin.call('remixAI', 'getRouteStatus' as any)
        if (!cancelled && status) handleRouteStatusChanged(status as any)
      } catch (err) {
        if (!cancelled) remixAILogger.warn('[RemixAI Assistant] getRouteStatus failed:', err)
      }
    })()
    return () => {
      cancelled = true
      props.plugin.off('remixAI', 'routeStatusChanged')
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
          remixAILogger.log('Auth state changed to authenticated, refreshing model access...')
        } else {
          remixAILogger.log('Auth state changed to logged out, refreshing model access. Model selection will clear until /permissions resolves.')
          // No literal default to switch to — clear the selection. The
          // picker shows ANONYMOUS_FALLBACK_MODELS while logged out.
          setSelectedModelId('')
          setSelectedModel(null)
          setAssistantChoice('mistralai')
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
    const handleStreamChunk = (data: string | { content: string; isIntermediate?: boolean; source?: string; isSubagent?: boolean; subagentName?: string; threadId?: string }) => {
      // Early-return if the request has been stopped to prevent stale events from updating UI
      if (isStoppedRef.current) {
        remixAILogger.log('[RemixAI Assistant] Ignoring stream chunk - request was stopped')
        return
      }

      const chunk = typeof data === 'string' ? data : data.content
      const isIntermediate = typeof data === 'object' ? data.isIntermediate : false
      const isSubagent = typeof data === 'object' ? !!data.isSubagent : false
      const subagentName = typeof data === 'object' ? (data.subagentName || '') : ''

      streamConsumedThisTurnRef.current = true
      if (!isStreaming) setIsStreaming(true)

      // ── SUBAGENT CHUNK ──────────────────────────────────────────────
      // Each subagent gets its OWN bubble. Otherwise its prose appends
      // into the main agent's message and pushes the Task Plan offscreen.
      // A new bubble is created on first subagent chunk OR when the
      // subagent name changes (Auditor → Gas Optimizer, etc.).
      // NOTE: Subagent UI bubbles are temporarily disabled - uncomment to re-enable
      /*
      if (isSubagent) {
        const current = streamingSubagentBubbleRef.current
        const effectiveName = subagentName || current?.name || ''
        const needsNewBubble = !current || (subagentName && current.name !== subagentName)

        if (needsNewBubble) {
          const subId = crypto.randomUUID()
          streamingSubagentBubbleRef.current = { id: subId, name: effectiveName }
          setMessages(prev => [
            ...prev,
            {
              id: subId,
              role: 'assistant',
              content: chunk,
              timestamp: Date.now(),
              sentiment: 'none',
              isIntermediateContent: isIntermediate,
              isSubagentStreaming: true,
              streamingSubagentName: effectiveName
            }
          ])
          return
        }
        setMessages(prev =>
          prev.map(m =>
            m.id === current.id
              ? {
                ...m,
                content: m.content + chunk,
                isIntermediateContent: isIntermediate,
                isSubagentStreaming: true,
                streamingSubagentName: effectiveName
              }
              : m
          )
        )
        return
      }
      */

      // ── MAIN AGENT CHUNK ────────────────────────────────────────────
      // Lazy-create the main bubble on first chunk (DeepAgent's `answer()`
      // is now awaited so we can't rely on its empty-string return as the
      // "create bubble" trigger).
      if (!streamingAssistantIdRef.current) {
        const assistantId = crypto.randomUUID()
        streamingAssistantIdRef.current = assistantId
        setMessages(prev => [
          ...prev,
          {
            id: assistantId,
            role: 'assistant',
            content: chunk,
            timestamp: Date.now(),
            sentiment: 'none',
            isIntermediateContent: isIntermediate,
            isSubagentStreaming: false,
            streamingSubagentName: undefined
          }
        ])
        return
      }

      setMessages(prev =>
        prev.map(m =>
          m.id === streamingAssistantIdRef.current
            ? {
              ...m,
              content: m.content + chunk,
              isIntermediateContent: isIntermediate,
              isSubagentStreaming: false,
              streamingSubagentName: undefined
            }
            : m
        )
      )
    }

    const handleStreamComplete = (finalText: string) => {
      // Early-return if the request has been stopped
      if (isStoppedRef.current) {
        remixAILogger.log('[RemixAI Assistant] Ignoring stream complete - request was stopped')
        return
      }

      // Mark consumed even if there was no streaming bubble (e.g. an empty
      // turn that finished before the first chunk) so the post-await
      // branch in sendPrompt doesn't paint the full text again.
      streamConsumedThisTurnRef.current = true
      // Save to chat history when streaming completes
      if (streamingAssistantIdRef.current) {
        const assistantId = streamingAssistantIdRef.current
        setMessages(prev => {
          const userMsg = prev[prev.length - 2]
          if (userMsg && userMsg.role === 'user' && finalText) {
            Promise.resolve(ChatHistory.pushHistory(userMsg.content, finalText)).then(() => props.plugin.loadConversations())
          }
          // Clear streaming states but preserve subagent name for persistent styling
          return prev.map(m =>
            m.id === assistantId
              ? {
                ...m,
                isSubagentStreaming: false,
                // Keep streamingSubagentName to preserve subagent styling after completion
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
      streamingSubagentBubbleRef.current = null
    }

    // Handle tool call events from DeepAgent
    const handleToolCall = (data: { toolName: string; toolInput?: any; toolUIString?: string; toolOutput?: any; status: 'start' | 'end'; threadId?: string }) => {
      // Early-return if the request has been stopped
      if (isStoppedRef.current) return

      remixAILogger.log('[RemixAI Assistant] Tool call event:', data)
      const assistantId = streamingAssistantIdRef.current
      if (!assistantId) return

      if (data.status === 'start') {
        if (clearToolTimeoutRef.current) {
          clearTimeout(clearToolTimeoutRef.current)
          clearToolTimeoutRef.current = null
        }
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
        if (clearToolTimeoutRef.current) {
          clearTimeout(clearToolTimeoutRef.current)
          clearToolTimeoutRef.current = null
        }
        const targetId = assistantId
        clearToolTimeoutRef.current = setTimeout(() => {
          setMessages(prev =>
            prev.map(m => (m.id === targetId ? {
              ...m,
              isExecutingTools: false,
              executingToolName: undefined,
              executingToolArgs: undefined,
              executingToolUIString: undefined
            } : m))
          )
          clearToolTimeoutRef.current = null
        }, 3000)
      }
    }

    // Handle subagent start events
    const handleSubagentStart = (data: { id: string; name: string; task: string; status: string; threadId?: string }) => {
      if (isStoppedRef.current) return
      remixAILogger.log('[RemixAI Assistant] Subagent started:', data)
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
    // NOTE: Subagent UI bubbles are temporarily disabled - uncomment to re-enable
    const handleSubagentComplete = (data: { id: string; name: string; status: string; duration: number; threadId?: string }) => {
      if (isStoppedRef.current) return
      remixAILogger.log('[RemixAI Assistant] Subagent completed:', data)
      /*
      // Update subagent bubble styling when subagent completes
      const sub = streamingSubagentBubbleRef.current
      if (sub) {
        setMessages(prev =>
          prev.map(m =>
            m.id === sub.id
              ? {
                ...m,
                isSubagentStreaming: false,
                isIntermediateContent: false
              }
              : m
          )
        )
      }
      */
      // Clear any subagent annotations stamped on the main bubble
      if (streamingAssistantIdRef.current) {
        setMessages(prev =>
          prev.map(m =>
            m.id === streamingAssistantIdRef.current
              ? {
                ...m,
                activeSubagent: undefined,
                subagentTask: undefined
              }
              : m
          )
        )
      }
    }

    // Handle task start events
    const handleTaskStart = (data: { id: string; name: string; status: string; threadId?: string }) => {
      if (isStoppedRef.current) return
      remixAILogger.log('[RemixAI Assistant] Task started:', data)
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
    const handleTaskComplete = (data: { id: string; name: string; status: string; threadId?: string }) => {
      if (isStoppedRef.current) return
      remixAILogger.log('[RemixAI Assistant] Task completed:', data)
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
    const handleTodoUpdate = (data: { todos: any[]; currentTodoIndex?: number; timestamp: number; threadId?: string }) => {
      if (isStoppedRef.current) return
      remixAILogger.log('[RemixAI Assistant] Todo list updated:', data)
      if (streamingAssistantIdRef.current) {
        // Update existing assistant message with todos
        setMessages(prev =>
          prev.map(m =>
            m.id === streamingAssistantIdRef.current
              ? { ...m, todos: data.todos, currentTodoIndex: data.currentTodoIndex }
              : m
          )
        )
      } else {
        // No assistant message exists yet - create one to show the todos
        // This can happen if the todo tool is called before any streaming content
        const assistantId = crypto.randomUUID()
        streamingAssistantIdRef.current = assistantId
        setMessages(prev => [
          ...prev,
          {
            id: assistantId,
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
            sentiment: 'none',
            todos: data.todos,
            currentTodoIndex: data.currentTodoIndex
          }
        ])
      }
    }

    // Handle error events - mark current todo as failed
    const handleTodoError = (data: { error: string; timestamp: number; threadId?: string }) => {
      if (isStoppedRef.current) return
      remixAILogger.log('[RemixAI Assistant] Todo error received:', data)
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
    const handleAgentError = (data: { message: string; timestamp: number; type: string; threadId?: string }) => {
      if (isStoppedRef.current) return
      remixAILogger.error('[RemixAI Assistant] Agent error:', data)
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
    const handleApiError = (data: { type: string; message: string; retryable: boolean; retryAfter?: number; originalError?: string; timestamp: number; threadId?: string }) => {
      if (isStoppedRef.current) return
      remixAILogger.error('[RemixAI Assistant] API error:', data)
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

    // Subscribe to the assistant-state machine so the cooldown banner
    // can render a live countdown when the AI service rate-limits us.
    const refreshCooldown = async () => {
      try {
        const display = await props.plugin.call('assistantState' as any, 'getCooldownDisplay')
        if (display) {
          const key = `${display.code}:${display.expiresAt ?? ''}`
          if (dismissedCooldownKeyRef.current === key) {
            return // user dismissed this exact cooldown — don't bring it back
          }
        } else {
          dismissedCooldownKeyRef.current = null
        }
        setCooldownDisplay(display)
      } catch { /* assistantState not active — ignore */ }
    }
    // Same pattern as cooldown: ask the plugin for the typed notice for
    // any pending error that's NOT already covered by the cooldown banner
    // or plan-manager hand-off. Re-ran on every stateChanged.
    const refreshChatNotice = async () => {
      try {
        const notice = await props.plugin.call('assistantState' as any, 'getChatNotice')
        setChatNotice(notice ?? null)
      } catch { /* assistantState not active — ignore */ }
    }
    // Refresh the model catalogue from the assistantState plugin. Same
    // pattern as the cooldown display — the plugin re-emits stateChanged
    // whenever permissions land or auth flips, so the picker stays in sync.
    const refreshModels = async () => {
      try {
        const models = await props.plugin.call('assistantState' as any, 'getAvailableModels')
        remixAILogger.log('[remix-ai-assistant] getAvailableModels →',
          Array.isArray(models) ? models.map((m: any) => `${m.id}(${m.available ? 'on' : 'off'})`).join(', ') : models)
        if (Array.isArray(models) && models.length > 0) setAvailableModels(models)
      } catch (e) { remixAILogger.warn('[remix-ai-assistant] getAvailableModels failed', e) }
    }
    const refreshFeatures = async () => {
      try {
        // const auto = await props.plugin.call('assistantState' as any, 'hasFeature', 'ai:auto')
        setAutoModeAvailable(false)
        // const mcp = await props.plugin.call('assistantState' as any, 'hasFeature', 'mcp:basicExternal')
        setMcpEnabled(true)
        // When the section gets hidden, also collapse the inner toggle so
        // we don't leave MCP enhancement "on" for a user who can no longer
        // see or control it.
        // if (!mcp) setMcpEnhanced(false)
      } catch { /* assistantState not active — ignore */ }
    }
    const onAssistantStateChange = (snap: any) => {
      remixAILogger.log('[remix-ai-assistant] stateChanged event received', {
        availability: snap?.availability,
        permissionsState: snap?.permissionsState,
        isAuthenticated: snap?.isAuthenticated,
        cooldown: snap?.cooldown,
        ai_models_len: Array.isArray(snap?.permissions?.ai_models) ? snap.permissions.ai_models.length : 'absent'
      })
      setIsAuthenticated(!!snap?.isAuthenticated)
      // Derive pill visibility from the same snapshot. `ai:modes_coming_soon`
      // wins over the specific entitlement so a soft-launch account never
      // exposes a working checkout pill.
      const features = snap?.permissions?.features
      const isOn = (key: string): boolean => {
        if (!features) return false
        if (Array.isArray(features)) return features.some((f: any) => f?.feature_name === key && f?.is_enabled !== false)
        const entry = features[key]
        if (entry == null) return false
        if (typeof entry === 'boolean') return entry
        return entry?.is_enabled !== false && entry?.allowed !== false
      }
      const comingSoon = isOn('ai:modes_coming_soon')

      // Check specific feature permissions
      setHasAuditorPermission(isOn('ai:auditor'))
      setHasSkillsPermission(isOn('ai:skills'))

      const nextPillStates = {
        upgrade: comingSoon ? 'coming_soon' : isOn('ai:upgrade_available') ? 'available' : 'hidden',
        buyCredits: comingSoon ? 'hidden' : isOn('ai:buy_credits') ? 'available' : 'hidden'
      } as const
      setPillStates(nextPillStates)
      void refreshCooldown()
      void refreshModels()
      void refreshFeatures()
      void refreshChatNotice()
    }
    props.plugin.on('assistantState' as any, 'stateChanged', onAssistantStateChange)
    // Initial probe — covers the case where the panel mounts after
    // permissions have already loaded.
    void refreshCooldown()
    void refreshModels()
    void refreshFeatures()
    void refreshChatNotice()
    // Seed the authenticated flag synchronously from the cached snapshot
    // so the composer never flashes a "sign in" CTA for an already
    // logged-in user on remount.
    ;(async () => {
      try {
        const snap: any = await props.plugin.call('assistantState' as any, 'getSnapshot')
        if (snap) {
          setIsAuthenticated(!!snap.isAuthenticated)
          // Reuse the same derivation as the event handler so the initial
          // pill state is correct without waiting for a stateChanged.
          onAssistantStateChange(snap)
        }
      } catch { /* assistantState not active */ }
    })()

    // Human-in-the-loop: listen for tool approval requests (batch processing)
    const handleToolApproval = (request: ToolApprovalRequest) => {
      // Don't show new approval dialogs if the request has been stopped
      if (isStoppedRef.current) return
      remixAILogger.log('[Assistant UI] approval requested', request.toolName, request.requestId)
      if (hitlAutoAcceptRef.current) {
        try {
          ;(props.plugin as any).respondToToolApproval({
            requestId: request.requestId,
            approved: true
          })
          remixAILogger.log('[HITL][AutoAccept] approved', request.requestId)
        } catch (err: any) {
          remixAILogger.error('[HITL][AutoAccept] Failed to auto-approve:', err)
        }
        return
      }
      setPendingApprovals(prev => [...prev, request])
    }
    props.plugin.on('remixAI', 'onToolApprovalRequired', handleToolApproval)

    // DApp update review: listen for post-update file changes
    const handleDappUpdateCompleted = (data: { slug: string; files: Record<string, string>; backups: Record<string, string> }) => {
      remixAILogger.log('[DAppReview] Update completed for:', data.slug, '- files:', Object.keys(data.files).length)
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
      try { props.plugin.off('assistantState' as any, 'stateChanged') } catch { /* noop */ }
    }
  }, [props.plugin])

  // bubble messages up to parent
  useEffect(() => {
    props.onMessagesChange?.(messages)
  }, [messages, props.onMessagesChange])

  // Auto Mode is the default for every logged-in user. Once `ai:auto`
  // becomes available (after /permissions resolves), enable it. When it
  // flips back off (logout), reset both the toggle and the
  // "already-applied" guard so the next login re-applies the default.
  useEffect(() => {
    if (autoModeAvailable) {
      if (!autoDefaultAppliedRef.current) {
        autoDefaultAppliedRef.current = true
        setAutoModeEnabled(true)
        void props.plugin.call('remixAI', 'setAutoMode', true).catch(() => { /* noop */ })
      }
    } else {
      autoDefaultAppliedRef.current = false
      if (autoModeEnabled) {
        setAutoModeEnabled(false)
        void props.plugin.call('remixAI', 'setAutoMode', false).catch(() => { /* noop */ })
      }
    }
  }, [autoModeAvailable])

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
      remixAILogger.warn('[HITL][Review] Cannot open review — missing filePath or proposedContent')
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
      remixAILogger.error('[HITL][Review] Failed to open showCustomDiff:', err)
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
        remixAILogger.warn('[HITL][Review] Could not read editor text, using proposedContent as fallback')
      }

      // Send approval with the final content as modifiedArgs
      const modifiedArgs = finalContent ? { content: finalContent } : undefined
      ;(props.plugin as any).respondToToolApproval({
        requestId: pending.requestId,
        approved: true,
        modifiedArgs
      })

      removeApproval(pending.requestId)
    }

    const handleDiffRejected = (file: string) => {
      const pending = pendingDiffApprovalRef.current
      if (!pending) return

      ;(props.plugin as any).respondToToolApproval({
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

  const handleApproveToolAction = useCallback(async (approval: ToolApprovalRequest, options?: { modifiedArgs?: Record<string, any>; enableAutoAccept?: boolean }) => {
    if (!approval) return
    remixAILogger.log('[Assistant UI] handleApproveToolAction', approval.toolName, approval.requestId)

    // Close DiffEditor tab if the user had opened a Review
    if (reviewingApprovals.has(approval.requestId)) {
      try {
        const sessions = await props.plugin.call('editor', 'getDiffSessions')
        for (const session of sessions) {
          await props.plugin.call('editor', 'closeDiffSession', session.id)
        }
      } catch (err) {
        remixAILogger.warn('[HITL] Failed to close diff sessions:', err)
      }
    }

    // Enable auto-accept if the user checked the checkbox in the modal
    if (options?.enableAutoAccept && !hitlAutoAcceptRef.current) {
      setHitlAutoAccept(true)
      localStorage.setItem(HITL_AUTO_ACCEPT_KEY, 'true')
      remixAILogger.log('[HITL] Auto-accept ENABLED from approval modal')
    }

    try {
      ;(props.plugin as any).respondToToolApproval({
        requestId: approval.requestId,
        approved: true,
        modifiedArgs: options?.modifiedArgs
      })
      remixAILogger.log('[Assistant UI] respondToToolApproval emitted', approval.requestId)
    } catch (err) {
      remixAILogger.error('[Assistant UI] respondToToolApproval threw', approval.requestId, err)
    }
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
        remixAILogger.warn('[HITL] Failed to close diff sessions:', err)
      }
    }

    ;(props.plugin as any).respondToToolApproval({
      requestId: approval.requestId,
      approved: false
    })
    removeApproval(approval.requestId)
  }, [props.plugin, removeApproval, reviewingApprovals])

  const handleTimeoutToolAction = useCallback(async (approval: ToolApprovalRequest) => {
    if (!approval) return
    ;(props.plugin as any).respondToToolApproval({
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
        remixAILogger.warn('[HITL] Failed to close diff sessions:', err)
      }
    }

    const approvals = [...pendingApprovals]
    for (const approval of approvals) {
      ;(props.plugin as any).respondToToolApproval({
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
        remixAILogger.warn('[HITL] Failed to close diff sessions:', err)
      }
    }

    const approvals = [...pendingApprovals]
    for (const approval of approvals) {
      ;(props.plugin as any).respondToToolApproval({
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
      remixAILogger.warn('[DAppReview] Failed to close diff sessions:', err)
    }
  }, [props.plugin])

  const handleDappReviewAcceptAll = useCallback(async (msgId: string) => {
    remixAILogger.log('[DAppReview] Accept all for message:', msgId)
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

    remixAILogger.log('[DAppReview] Reverting', Object.keys(backups).length, 'files in', workspaceName)

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
              remixAILogger.log('[DAppReview] Deleted new file:', normalizedPath)
            } catch (e) {
              remixAILogger.warn('[DAppReview] Could not delete:', normalizedPath)
            }
          } else {
            await props.plugin.call('fileManager', 'writeFile', normalizedPath, originalContent)
            remixAILogger.log('[DAppReview] Reverted:', normalizedPath)
          }
        } catch (e: any) {
          remixAILogger.error('[DAppReview] Failed to revert file:', normalizedPath, e?.message)
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
      remixAILogger.log('[DAppReview] All files reverted in', workspaceName)
    } catch (e: any) {
      remixAILogger.error('[DAppReview] Revert failed:', e?.message)
    }
  }, [messages, props.plugin, closeDiffSessions])

  const handleDappReviewViewDiff = useCallback(async (filePath: string, newContent: string, oldContent: string) => {
    try {
      const normalizedPath = filePath.replace(/^\/+/, '')
      remixAILogger.log('[DAppReview] Opening diff for:', normalizedPath)

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
      remixAILogger.error('[DAppReview] Failed to show diff:', err)
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

  // Stop ongoing request - ALWAYS execute stop logic regardless of abort controller state
  const stopRequest = useCallback(() => {
    isStoppedRef.current = true

    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }

    // Capture the current user/assistant conversation so the reinitialized
    // LangGraph (after cancelRequest tears down the running graph) can be
    // seeded with the existing context. We snapshot from the React state
    // BEFORE the cleanup setState below mutates the array, and we filter
    // out empty/intermediate/status-only assistant bubbles.
    const historyMessages = messages
      .filter(m => {
        if (!m || (m.role !== 'user' && m.role !== 'assistant')) return false
        const content = (m.content || '').trim()
        if (!content) return false
        if (m.role === 'assistant') {
          if (content.startsWith('***')) return false
          if (content.startsWith('**Request stopped by user!**')) return false
        }
        return true
      })
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

    // Fire-and-forget so the Stop button stays instant. The plugin-side
    // cancelRequest is async (rebuilds DeepAgent), but the next prompt
    // dispatch is gated in remixAIPlugin.answer/code_generation/code_explaining
    // via DeepAgentManager.awaitReady(), not here.
    props.plugin.call('remixAI', 'cancelRequest', historyMessages).catch((err) => {
      remixAILogger.warn('[RemixAI Assistant] cancelRequest failed:', err)
    })

    // Always stop streaming state
    setIsStreaming(false)

    if (clearToolTimeoutRef.current) {
      clearTimeout(clearToolTimeoutRef.current)
      clearToolTimeoutRef.current = null
    }

    uiToolCallbackRef.current = null
    if (streamingAssistantIdRef.current) {
      const streamedId = streamingAssistantIdRef.current
      const idx = messages.findIndex(m => m.id === streamedId)
      const streamedContent = (idx >= 0 ? messages[idx].content || '' : '').trim()
      const userMsg = idx > 0 ? messages[idx - 1] : null
      if (userMsg && userMsg.role === 'user' && streamedContent) {
        Promise.resolve(ChatHistory.pushHistory(userMsg.content, streamedContent))
          .then(() => props.plugin.loadConversations())
          .catch((err) => remixAILogger.warn('[RemixAI Assistant] failed to persist stopped stream:', err))
      }
    }

    streamingAssistantIdRef.current = null
    streamingSubagentBubbleRef.current = null
    //@ts-ignore
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
          isIntermediateContent: undefined,
          // Mark any in_progress todos as stopped so spinner stops
          todos: m.todos?.map(todo =>
            todo.status === 'in_progress'
              ? { ...todo, status: 'stopped' as const }
              : todo
          ),
          currentTodoIndex: undefined
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

    // Clear all pending HITL approval modals from the aborted request
    setPendingApprovals([])
    setReviewingApprovals(new Set())

    trackMatomoEvent({ category: 'ai', action: 'remixAI', name: 'StopRequest', isClick: true })
  }, [props.plugin, isStreaming, messages])

  // reusable sender (used by both UI button and imperative ref)
  const sendPrompt = useCallback(
    async (prompt: string) => {
      const trimmed = prompt.trim()
      if (!trimmed || isStreaming) return

      // Gate via assistantState — if the user is anonymous, unverified or
      // feature-blocked this opens planManager with the right reason and
      // returns false so we never show an orphan user bubble + null error.
      try {
        const ready = await props.plugin.call('assistantState' as any, 'requireReady')
        if (!ready) return
      } catch { /* assistantState not active — fall through to legacy behaviour */ }

      dispatchActivity('promptSend', trimmed)

      // Reset the per-turn "stream consumed" flag — it gates the
      // post-await duplicate-bubble guard further down.
      streamConsumedThisTurnRef.current = false
      // Clear any leftover subagent bubble ref from a previous turn so
      // the next subagent chunk creates a fresh bubble.
      streamingSubagentBubbleRef.current = null
      // Reset the stopped flag from any previous stop. Without this,
      // every event handler short-circuits and the new request appears
      // to silently swallow all stream chunks/tool events.
      isStoppedRef.current = false
      // Make sure no stale streaming bubble id leaks from a previous,
      // stopped turn — otherwise new chunks could append into an old
      // bubble that belongs to a different conversation/turn.
      streamingAssistantIdRef.current = null

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

        remixAILogger.log('Received response from plugin:', response)

        // Handle langchain/deepagent mode: response is plain text
        if (typeof response === 'string') {
          // The DeepAgent path now awaits runAgent (so withAssistantGate
          // can see envelope errors). That means by the time `answer()`
          // returns, the entire stream has already played out via
          // onStreamResult/onStreamComplete and the bubble is fully
          // painted. Skip the legacy create-bubble-from-final-text branch
          // — otherwise we paint the response a second time below the
          // streaming bubble.
          if (streamConsumedThisTurnRef.current) {
            setIsStreaming(false)
            streamingAssistantIdRef.current = null
            return
          }

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
        remixAILogger.error('Error sending prompt:', error)
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

        // Pull the structured AIError envelope (HTTP body, SSE error frame,
        // or stamped by withAssistantGate / DeepAgent.handleError). The
        // assistant-state plugin has already routed it to the cooldown
        // banner / plan-manager / chat-notice strip as appropriate.
        let envelope = error?.aiError ?? error?.response?.data?.error ?? error?.data?.error
        // Last-ditch: re-parse the error here. Different SDKs throw
        // different shapes (Anthropic gives clean .message; Mistral SDK
        // throws "API error occurred: Status 429 ... Body: {json}";
        // langchain wraps as "<status> {json}"). aiErrorFromException
        // knows about all of them — running it locally guarantees we
        // never dump raw JSON in the chat bubble even if upstream
        // stamping was lost (frozen error object, missed code path…).
        if (!envelope?.code) {
          try {
            const parsed = aiErrorFromException(error)
            if (parsed && parsed.code && parsed.code !== 'INTERNAL_ERROR') {
              envelope = parsed
            } else if (parsed && parsed.code === 'INTERNAL_ERROR' && parsed.message && parsed.message !== (error?.message ?? '')) {
              // Scanner extracted a JSON body's `message` field but no
              // recognised code — still a cleaner message than the raw
              // SDK string, so use it.
              envelope = parsed
            }
          } catch { /* ignore */ }
        }
        const envelopeCode: string | undefined = envelope?.code
        const envelopeMsg: string | undefined = envelope?.message

        // The streaming bubble may contain pollution: model SSE error
        // frames, raw HTTP bodies that langchain emits as `on_chat_model_stream`
        // events, or partial output that was invalidated by the error.
        // If we have a structured envelope, replace the bubble's content
        // with a single-line trace so the user knows WHICH prompt failed
        // without seeing the raw JSON. If there's no envelope, we keep
        // whatever partial content was streamed (it's the only signal).
        const streamingId = streamingAssistantIdRef.current
        if (streamingId && envelopeCode) {
          setMessages(prev => prev.map(m =>
            m.id === streamingId
              ? { ...m, content: `${envelopeCode}: ${envelopeMsg ?? 'AI service error'}`, isExecutingTools: false, executingToolName: undefined, executingToolArgs: undefined, executingToolUIString: undefined }
              : m
          ))
          streamingAssistantIdRef.current = null
          return
        }

        // No envelope — likely a network failure, abort, or unknown shape.
        // The notice strip won't render (assistantState classifies it as
        // INTERNAL_ERROR but the strip suppresses generic messages without
        // a real backend code). Surface a single chat bubble so the user
        // never sees a silent failure.
        const fallbackText = `Error: ${error?.message ?? 'Something went wrong'}`
        if (streamingId) {
          setMessages(prev => prev.map(m =>
            m.id === streamingId
              ? (m.content && m.content.trim().length > 0
                ? { ...m, content: m.content + `\n\n${fallbackText}`, isExecutingTools: false, executingToolName: undefined, executingToolArgs: undefined, executingToolUIString: undefined }
                : { ...m, content: fallbackText, isExecutingTools: false, executingToolName: undefined, executingToolArgs: undefined, executingToolUIString: undefined })
              : m
          ))
          streamingAssistantIdRef.current = null
          return
        }
        setMessages(prev => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: fallbackText,
            timestamp: Date.now(),
            sentiment: 'none'
          }
        ])
      }
    },
    [isStreaming, props.plugin, selectedModel, assistantChoice]
  )

  const handleSend = useCallback(async () => {
    // We do NOT hard-gate on cooldownDisplay — the banner is informational
    // only. If the user wants to retry while rate-limited, that's their
    // call; the backend will reject it and we surface the error normally.
    const trimmed = input.trim()
    if (!trimmed || isStreaming) return

    // Pre-flight the assistant gate so we only clear the textarea when
    // the prompt will actually be processed. If the user is anonymous,
    // has no verified email, lacks the feature or is out of quota,
    // requireReady opens planManager and returns false — we preserve the
    // typed prompt (which can be long) so it isn't silently wiped.
    try {
      const ready = await props.plugin.call('assistantState' as any, 'requireReady')
      if (!ready) return
    } catch { /* assistantState not active — fall through, sendPrompt will retry the check */ }

    setInput('')
    await sendPrompt(trimmed)
  }, [input, isStreaming, props.plugin, sendPrompt])

  /*
  useEffect(() => {
    const handleMCPToggle = async () => {
      // Only toggle MCP if it's enabled via query parameter
      if (!mcpEnabled) {
        // Ensure MCP is disabled if query param is not set
        try {
          await props.plugin.call('remixAI', 'disableMCPEnhancement')
        } catch (error) {
          remixAILogger.warn('Failed to disable MCP enhancement:', error)
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
        remixAILogger.warn('Failed to toggle MCP enhancement:', error)
      }
    }
    if (mcpEnhanced !== null) { // Only call when state is initialized
      handleMCPToggle()
    }
  }, [mcpEnhanced, mcpEnabled])
  */

  // Fetch available Ollama models when Ollama model is selected
  useEffect(() => {
    const fetchOllamaModels = async () => {
      if (selectedModel?.provider === 'ollama') {
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
                  setAssistantChoice(selectedModel?.provider ?? 'ollama')
                  setMessages(prev => [...prev, {
                    id: crypto.randomUUID(),
                    role: 'assistant',
                    content: `**Ollama connected successfully!**\n\nFound ${models.length} model${models.length > 1 ? 's' : ''}:\n${models.map(m => `• ${m}`).join('\n')}\n\nYou can now use local AI for code completion and assistance.`,
                    timestamp: Date.now(),
                    sentiment: 'none'
                  }])
                } catch (error) {
                  remixAILogger.warn('Failed to set default model:', error)
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
            // Fall back to the API-resolved chat default (no literal id).
            try {
              const def: AIModel | null = await props.plugin.call('assistantState' as any, 'getDefaultModel')
              if (def && def.id) {
                setSelectedModelId(def.id)
                setSelectedModel(def)
              } else {
                remixAILogger.warn('[RemixAI Assistant UI] Ollama unavailable and no API default model yet — leaving picker empty')
                setSelectedModelId('')
                setSelectedModel(null)
              }
            } catch (e) {
              remixAILogger.warn('[RemixAI Assistant UI] assistantState.getDefaultModel failed during Ollama fallback', e)
              setSelectedModelId('')
              setSelectedModel(null)
            }
          }
        } catch (error: any) {
          remixAILogger.warn('Failed to fetch Ollama models:', error)
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
          // Fall back to the API-resolved chat default (no literal id).
          try {
            const def: AIModel | null = await props.plugin.call('assistantState' as any, 'getDefaultModel')
            if (def && def.id) {
              setSelectedModelId(def.id)
              setSelectedModel(def)
            } else {
              remixAILogger.warn('[RemixAI Assistant UI] Ollama errored and no API default model yet — leaving picker empty')
              setSelectedModelId('')
              setSelectedModel(null)
            }
          } catch (e) {
            remixAILogger.warn('[RemixAI Assistant UI] assistantState.getDefaultModel failed during Ollama error fallback', e)
            setSelectedModelId('')
            setSelectedModel(null)
          }
        }
      } else {
        setOllamaModels([])
        setSelectedOllamaModel(null)
      }
    }
    fetchOllamaModels()
  }, [selectedModel?.provider, selectedOllamaModel])

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
        remixAILogger.warn('Failed to enable auto mode:', error)
      }
      // When the user toggles back to Auto after explicitly picking a
      // model (e.g. Opus → Auto), reset the underlying selection to the
      // backend-advertised default. Otherwise the inferencer keeps the
      // last static pick and `selectOptimalModel` (which only swaps in
      // *Sonnet* when allowed) silently keeps Opus, defeating Auto Mode.
      try {
        const def: AIModel | null = await props.plugin.call('assistantState' as any, 'getDefaultModel')
        if (def && def.id && def.available !== false) {
          setSelectedModelId(def.id)
          setSelectedModel(def)
          setAssistantChoice(def.provider as 'openai' | 'mistralai' | 'anthropic' | 'ollama')
          try {
            await props.plugin.call('remixAI', 'setModel', def.id)
          } catch (e) {
            remixAILogger.warn('[remix-ai-assistant] setModel(default) failed when entering Auto Mode', e)
          }
        } else {
          remixAILogger.warn('[remix-ai-assistant] Auto Mode requested but /permissions has no usable default model yet', def)
        }
      } catch (e) {
        remixAILogger.warn('[remix-ai-assistant] assistantState.getDefaultModel failed when entering Auto Mode', e)
      }
      setShowModelSelector(false)
      return
    } else {
      setAutoModeEnabled(false)
      try {
        await props.plugin.call('remixAI', 'setAutoMode', false)
      } catch (error) {
        remixAILogger.warn('Failed to disable auto mode:', error)
      }
    }

    const model = availableModels.find(m => m.id === modelId)
    if (!model) return

    // Check access — backend's `available` flag is the source of truth.
    if (!model.available) {
      handleLockedModelClick(model.id, model.displayName)
      return
    }

    setSelectedModelId(modelId)
    setSelectedModel(model)

    // Always update assistantChoice to match the selected model's provider
    setAssistantChoice(model.provider as 'openai' | 'mistralai' | 'anthropic' | 'ollama')
    remixAILogger.log('Setting assistant choice to:', model.provider)

    if (model.provider === 'ollama') {
      try {
        const models = await props.plugin.call('remixAI', 'getOllamaModels')
        setOllamaModels(models)
        setShowOllamaModelSelector(true)
      } catch (err) {
        remixAILogger.error('Ollama not available:', err)
      }
    } else {
      try {
        await props.plugin.call('remixAI', 'setModel', modelId)
        trackMatomoEvent({ category: 'ai', action: 'remixAI', name: 'model_selected', value: modelId, isClick: true })
      } catch (error) {
        remixAILogger.warn('Failed to set model:', error)
      }
    }

    setShowModelSelector(false)
  }, [props.plugin, modelAccess])

  const handleLockedModelClick = useCallback((modelId: string, modelName: string) => {
    const model = availableModels.find(m => m.id === modelId)
    let reason: 'auth-required' | 'email-unverified' | 'feature-required' | 'quota-exhausted' = 'feature-required'
    let requiredFeature: string | null = null
    if (model?.reason === 'auth_required' || modelId === '__signin__') {
      reason = 'auth-required'
    } else if (model?.requiredFeature) {
      reason = 'feature-required'
      requiredFeature = model.requiredFeature
    }
    props.plugin.call('planManager' as any, 'open', { reason, requiredFeature }).catch(() => {
      // planManager not active (e.g. tests) — fall back to legacy beta widget
      props.plugin.call('betaCornerWidget', 'show').catch(() => { /* noop */ })
    })
    trackMatomoEvent({ category: 'ai', action: 'remixAI', name: 'locked_model_click', value: modelId, isClick: true })
  }, [props.plugin, availableModels])

  // Buy-credits pill route: opens plan-manager with the quota-exhausted
  // intent so it lands on the top-up section directly. `modelName` is
  // currently unused but kept symmetrical with handleLockedModelClick in
  // case we want to surface "which model triggered this" later.
  const handleBuyCreditsClick = useCallback((modelId: string, _modelName: string) => {
    props.plugin.call('planManager' as any, 'open', { reason: 'quota-exhausted' }).catch(() => {
      props.plugin.call('betaCornerWidget', 'show').catch(() => { /* noop */ })
    })
    trackMatomoEvent({ category: 'ai', action: 'remixAI', name: 'buy_credits_pill_click', value: modelId, isClick: true })
  }, [props.plugin])

  // Opens the plan-manager paywall/sign-in modal with reason=auth-required.
  // This is the same hand-off the locked-model picker uses for the
  // `__signin__` placeholder model — keeping it consistent means the user
  // sees the same sign-in UX from every entry point.
  const handleSignIn = useCallback(() => {
    props.plugin.call('planManager' as any, 'open', { reason: 'auth-required' }).catch(() => {
      // planManager not active (e.g. tests) — fall back to legacy beta widget
      props.plugin.call('betaCornerWidget', 'show').catch(() => { /* noop */ })
    })
    trackMatomoEvent({ category: 'ai', action: 'remixAI', name: 'composer_sign_in_click', isClick: true })
  }, [props.plugin, trackMatomoEvent])

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

  const handleLoadSkills = useCallback(() => {
    if (props.onOpenSkillsModal) {
      props.onOpenSkillsModal()
    }
  }, [props.onOpenSkillsModal])

  const handleOpenSettings = useCallback(async () => {
    const isActive = await props.plugin.call('manager', 'isActive', 'settings')
    if (!isActive) await props.plugin.call('manager', 'activatePlugin', 'settings')
    await props.plugin.call('tabs', 'focus', 'settings')
    props.plugin.call('settings', 'showSection', 'ai')
  }, [props.plugin])

  const handleLoadAuditChecklist = useCallback(() => {
    if (props.onOpenChecklistModal) props.onOpenChecklistModal()
  }, [props.onOpenChecklistModal])

  const handleGasOptimisationAudit = useCallback(async () => {
    await props.plugin.newConversation()
    try {
      await props.plugin.call('skillsexplorermodal', 'loadSkill', 'coding-solidity-gas-optimization')
    } catch {
      // skill endpoint unavailable — proceed without it
    }
    props.plugin.chatPipe('Start gas optimization checks on the active contract.')
  }, [props.plugin])

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

  const autoAcceptBannerEl = hitlAutoAccept && pendingApprovals.length === 0 && (
    <div
      className="hitl-auto-accept-banner"
      data-id="hitl-auto-accept-banner"
    >
      <span className="hitl-auto-accept-banner__text">Auto-accepting all tool changes</span>
      <button
        onClick={toggleHitlAutoAccept}
        className="hitl-auto-accept-banner__btn"
        data-id="hitl-auto-accept-disable"
      >
        Disable
      </button>
    </div>
  )

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
              onLoadConversation={props.onLoadConversation || (async (id: string) => {})}
              onArchiveConversation={props.onArchiveConversation || (async (id: string) => {})}
              onDeleteConversation={props.onDeleteConversation || (async (id: string) => {})}
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
            <div className={`d-flex flex-column flex-grow-1 always-show ${messages.length === 0 ? 'ai-assistant-bg' : 'ai-chat-area-flat'}`} style={{ overflow: 'hidden', minHeight: 0 }} data-theme={themeTracker && themeTracker?.name.toLowerCase()}>
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
                  <div className="hitl-pending-summary">
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
                      onApprove={(options) => handleApproveToolAction(approval, options)}
                      onReject={() => handleRejectToolAction(approval)}
                      onTimeout={() => handleTimeoutToolAction(approval)}
                      onReviewChanges={() => handleReviewChanges(approval)}
                      isReviewing={reviewingApprovals.has(approval.requestId)}
                    />
                  </div>
                ))}
              </section>
              {autoAcceptBannerEl}
            </div>
          ) : (
          /* Non-Maximized Mode: Toggle between history view and chat view */
            props.showHistorySidebar && props.isMaximized === false && props.conversations ? (
              <div className="d-flex flex-column flex-grow-1 ai-history-view-bg nonMaximizedMode" style={{ overflow: 'hidden', minHeight: 0 }} data-theme={themeTracker && themeTracker?.name.toLowerCase()}>
                {/* Back button header */}
                <div
                  className="p-2 border-bottom"
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
                    onLoadConversation={async (id) => {
                      await props.onLoadConversation?.(id)
                      // Close sidebar after loading conversation in non-maximized mode
                      await props.onToggleHistorySidebar?.()
                    }}
                    onArchiveConversation={props.onArchiveConversation || (async (id: string) => {})}
                    onDeleteConversation={props.onDeleteConversation || (async (id: string) => {})}
                    onDeleteAllConversations={props.onDeleteAllConversations}
                    onToggleArchived={() => setShowArchivedConversations(!showArchivedConversations)}
                    onClose={props.onToggleHistorySidebar || (() => {})}
                    onSearch={props.onSearch}
                    isFloating={false}
                    isMaximized={false}
                    theme={themeTracker?.name}
                  />
                </div>
                {autoAcceptBannerEl}
              </div>
            ) : (
            /* Show chat area when sidebar is closed */
              <div className={`d-flex flex-column flex-grow-1 sideBarIsClosed ${messages.length === 0 ? 'ai-assistant-bg' : 'ai-chat-area-flat'}`} style={{ overflow: 'hidden', minHeight: 0 }} data-theme={themeTracker && themeTracker?.name.toLowerCase()}>
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
                    <div className="hitl-pending-summary">
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
                        onApprove={(options) => handleApproveToolAction(approval, options)}
                        onReject={() => handleRejectToolAction(approval)}
                        onTimeout={() => handleTimeoutToolAction(approval)}
                        onReviewChanges={() => handleReviewChanges(approval)}
                        isReviewing={reviewingApprovals.has(approval.requestId)}
                      />
                    </div>
                  ))}
                </section>
                {autoAcceptBannerEl}
              </div>
            )
          )}
        </div>

        {cooldownDisplay && (
          <CooldownBanner
            display={cooldownDisplay}
            onDismiss={() => {
              dismissedCooldownKeyRef.current = `${cooldownDisplay.code}:${cooldownDisplay.expiresAt ?? ''}`
              setCooldownDisplay(null)
            }}
          />
        )}
        {chatNotice && (
          <ChatNoticeStrip
            notice={chatNotice}
            onAction={(action) => { void handleChatNoticeAction(action) }}
            onDismiss={dismissChatNotice}
          />
        )}
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
              availableModels={availableModels}
              selectedModel={selectedModel}
              autoModeEnabled={autoModeEnabled}
              autoModeAvailable={autoModeAvailable}
              handleModelSelection={handleModelSelection}
              onLockedModelClick={handleLockedModelClick}
              upgradePillState={pillStates.upgrade}
              buyCreditsPillState={pillStates.buyCredits}
              onBuyCreditsClick={handleBuyCreditsClick}
              input={input}
              setInput={setInput}
              isStreaming={isStreaming}
              handleSend={handleSend}
              stopRequest={stopRequest}
              handleSetModel={handleSetModel}
              handleGenerateWorkspace={handleGenerateWorkspace}
              dispatchActivity={dispatchActivity as any}
              modelBtnRef={modelBtnRef}
              modelSelectorBtnRef={modelSelectorBtnRef}
              textareaRef={textareaRef}
              maximizePanel={maximizePanel}
              setShowOllamaModelSelector={setShowOllamaModelSelector}
              showOllamaModelSelector={showOllamaModelSelector}
              showModelSelector={showModelSelector}
              setShowModelSelector={setShowModelSelector}
              selectedModelId={selectedModelId}
              handleOllamaModelSelection={handleModelSelection}
              selectedOllamaModel={selectedOllamaModel}
              ollamaModels={ollamaModels}
              messages={messages}
              handleLoadSkills={handleLoadSkills}
              handleOpenSettings={handleOpenSettings}
              handleLoadAuditChecklist={handleLoadAuditChecklist}
              handleGasOptimisationAudit={handleGasOptimisationAudit}
              usingOwnApiKey={usingOwnApiKey}
              aiRoute={aiRouteStatus.route}
              aiRouteReady={aiRouteStatus.ready}
              isAuthenticated={isAuthenticated}
              onSignIn={handleSignIn}
              hasAuditorPermission={hasAuditorPermission}
              hasSkillsPermission={hasSkillsPermission}
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
              availableModels={availableModels}
              selectedModel={selectedModel}
              autoModeEnabled={autoModeEnabled}
              autoModeAvailable={autoModeAvailable}
              handleModelSelection={handleModelSelection}
              onLockedModelClick={handleLockedModelClick}
              upgradePillState={pillStates.upgrade}
              buyCreditsPillState={pillStates.buyCredits}
              onBuyCreditsClick={handleBuyCreditsClick}
              input={input}
              setInput={setInput}
              isStreaming={isStreaming}
              handleSend={handleSend}
              stopRequest={stopRequest}
              handleSetModel={handleSetModel}
              handleGenerateWorkspace={handleGenerateWorkspace}
              dispatchActivity={dispatchActivity as any}
              modelBtnRef={modelBtnRef}
              modelSelectorBtnRef={modelSelectorBtnRef}
              textareaRef={textareaRef}
              maximizePanel={maximizePanel}
              setShowOllamaModelSelector={setShowOllamaModelSelector}
              showOllamaModelSelector={showOllamaModelSelector}
              showModelSelector={showModelSelector}
              setShowModelSelector={setShowModelSelector}
              selectedModelId={selectedModelId}
              handleOllamaModelSelection={handleModelSelection}
              selectedOllamaModel={selectedOllamaModel}
              ollamaModels={ollamaModels}
              messages={messages}
              handleLoadSkills={handleLoadSkills}
              handleOpenSettings={handleOpenSettings}
              handleLoadAuditChecklist={handleLoadAuditChecklist}
              handleGasOptimisationAudit={handleGasOptimisationAudit}
              usingOwnApiKey={usingOwnApiKey}
              aiRoute={aiRouteStatus.route}
              aiRouteReady={aiRouteStatus.ready}
              isAuthenticated={isAuthenticated}
              onSignIn={handleSignIn}
              hasAuditorPermission={hasAuditorPermission}
              hasSkillsPermission={hasSkillsPermission}
            />
          )
        }

        {/* API Key Error Toast */}
        {apiKeyError && (
          <div
            className="position-fixed bottom-0 start-50 translate-middle-x mb-5 p-3 bg-danger text-white rounded shadow"
            style={{ zIndex: 9999, maxWidth: '400px' }}
          >
            <div className="d-flex align-items-start">
              <i className="fas fa-exclamation-triangle me-2 mt-1"></i>
              <div className="flex-grow-1">
                <strong>{apiKeyError.errorType === 'authentication_failed' ? 'API Key Authentication Failed' : 'API Key Error'}</strong>
                <p className="mb-2 small">{apiKeyError.message}</p>
                {apiKeyError.canFallbackToProxy && (
                  <button
                    className="btn btn-sm btn-light me-2"
                    onClick={async () => {
                      try {
                        await props.plugin.call('remixAI', 'fallbackToProxy')
                        setApiKeyError(null)
                        setUsingOwnApiKey(false)
                      } catch (error) {
                        remixAILogger.error('Failed to fallback to proxy:', error)
                      }
                    }}
                  >
                    <i className="fas fa-server me-1"></i>
                    Switch to Proxy
                  </button>
                )}
                <button
                  className="btn btn-sm btn-outline-light"
                  onClick={() => setApiKeyError(null)}
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  )
})
