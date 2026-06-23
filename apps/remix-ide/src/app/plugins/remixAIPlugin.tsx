import * as packageJson from '../../../../../package.json'
import { Plugin } from '@remixproject/engine';
import { trackMatomoEvent, Features } from '@remix-api'
import { remixAILogger, RemoteInferencer, IRemoteModel, IParams, GenerationParams, AssistantParams, CodeExplainAgent, SecurityAgent, CompletionParams, OllamaInferencer } from '@remix/remix-ai-core';
import { CodeCompletionAgent, ContractAgent, workspaceAgent, IContextType, mcpDefaultServersConfig, mcpBasicServersConfig, mcpWebSearchServersConfig } from '@remix/remix-ai-core';
import { MCPInferencer, DeepAgentInferencer, onApiKeysChange } from '@remix/remix-ai-core';
import { IMCPServer, IMCPConnectionStatus } from '@remix/remix-ai-core';
import { RemixMCPServer, createRemixMCPServer } from '@remix/remix-ai-core';
import { AIModel } from '@remix/remix-ai-core';
import { aiErrorFromException, parseAIErrorEnvelope } from '@remix/remix-ai-core';
import axios from 'axios';
import { endpointUrls } from "@remix-endpoints-helper"
import { Registry } from '@remix-project/remix-lib'
import { DeepAgentEventBridge, MCPServerManager, PermissionChecker, ModelManager, DeepAgentManager, ChatRequestBuffer, ApiKeySettingsHelper } from './remixAI'

const profile = {
  name: 'remixAI',
  displayName: 'RemixAI',
  methods: ['code_generation', 'code_completion', 'setContextFiles', 'basic_prompt',
    "answer", "code_explaining", "generateWorkspace", "fixWorspaceErrors",
    "code_insertion", "error_explaining", "vulnerability_check", 'generate',
    "initialize", 'chatPipe', 'ProcessChatRequestBuffer', 'isChatRequestPending',
    'resetChatRequestBuffer', 'setAssistantThrId',
    'getAssistantThrId', 'getAssistantProvider', 'setAssistantProvider', 'setModel', 'setOllamaModel',
    'getSelectedModel', 'getModelAccess', 'getOllamaModels',
    'addMCPServer', 'removeMCPServer', 'getMCPConnectionStatus', 'getMCPResources', 'getMCPTools', 'executeMCPTool',
    'enableMCPEnhancement', 'disableMCPEnhancement', 'isMCPEnabled', 'getIMCPServers',
    'enableDeepAgent', 'disableDeepAgent', 'isDeepAgentEnabled',
    'setDeepAgentThread',
    'respondToToolApproval',
    'setAutoMode', 'getAutoModeStatus',
    'clearCaches', 'cancelRequest',
    'getAllowedModels', 'setModelAccess',
    'isUsingOwnApiKey', 'getApiKeyStatus', 'fallbackToProxy',
    'getRouteStatus'
  ],
  events: [
    'modelChanged',
    'chatMessageSent', 'chatPipeRequested',
    'codeExplainRequested', 'errorExplainRequested', 'vulnerabilityCheckRequested',
    'codeCompletionUsed', 'workspaceGenerated',
    'mcpEnabled', 'mcpDisabled', 'mcpServersLoaded',
    'apiKeyModeChanged', 'onApiKeyError',
    'routeStatusChanged',
    // DeepAgent streaming events
    'onStreamResult', 'onStreamComplete', 'onThinking',
    'onToolCall', 'onSubagentStart', 'onSubagentComplete',
    'onTaskStart', 'onTaskComplete', 'onTodoUpdate',
    'onTodoError', 'onAgentError', 'onApiError',
    'onToolApprovalRequired', 'ollamaModelDiscovered'
  ],
  icon: 'assets/img/remix-logo-blue.png',
  description: 'RemixAI provides AI services to Remix IDE.',
  kind: '',
  location: 'none',
  documentation: 'https://remix-ide.readthedocs.io/en/latest/ai.html',
  version: packageJson.version,
  maintainedBy: 'Remix'
}

// add Plugin<any, CustomRemixApi>
export class RemixAIPlugin extends Plugin {
  aiIsActivated:boolean = false
  remoteInferencer:RemoteInferencer | OllamaInferencer | MCPInferencer = null
  isInferencing: boolean = false
  chatRequestBuffer: ChatRequestBuffer<any> = null
  codeExpAgent: CodeExplainAgent | null = null
  securityAgent: SecurityAgent | null = null
  contractor: ContractAgent | null = null
  workspaceAgent: workspaceAgent | null = null
  modelAccess: any
  // Model selection is API-driven — sourced from /permissions via the
  // assistantState plugin. Starts null; the activation hook subscribes
  // to `assistantState.stateChanged` and populates with the row flagged
  // `is_default: true`. Never substitute a literal model id here.
  selectedModel: AIModel | null = null
  selectedModelId: string = ''
  assistantThreadId: string = ''
  useRemoteInferencer:boolean = true
  completionAgent: CodeCompletionAgent | null = null
  mcpServers: IMCPServer[] = []
  mcpInferencer: MCPInferencer | null = null
  mcpEnabled: boolean = false
  remixMCPServer: RemixMCPServer | null = null
  deepAgentInferencer: DeepAgentInferencer | null = null

  /**
   * Bound bearer-token provider for MCPInferencer / MCPClient. Returns
   * the user's current JWT (refreshed on every call) or null when the
   * user is anonymous. We pass the bound function — not the raw
   * `this.call` — so MCPClient stays plugin-engine-agnostic.
   */
  public readonly getMcpAuthToken = async (): Promise<string | null> => {
    try {
      const token = await this.call('auth' as any, 'getToken')
      return typeof token === 'string' && token.length > 0 ? token : null
    } catch {
      return null
    }
  }
  deepAgentEnabled: boolean = false
  private pendingDeepAgentThreadId: string | null = null

  // Extracted helper modules
  private eventBridge: DeepAgentEventBridge
  private mcpManager: MCPServerManager
  private permissionChecker: PermissionChecker
  private modelManager: ModelManager
  private deepAgentManager: DeepAgentManager

  constructor() {
    super(profile)
    this.eventBridge = new DeepAgentEventBridge()
    this.mcpManager = new MCPServerManager(this as any)
    this.permissionChecker = new PermissionChecker(this as any)
    this.deepAgentEnabled = true

    this.modelManager = new ModelManager({
      plugin: this as any,
      eventBridge: this.eventBridge,
      setupDeepAgentEventListeners: () => this.setupDeepAgentEventListeners()
    })
    this.deepAgentManager = new DeepAgentManager({
      plugin: this as any,
      eventBridge: this.eventBridge,
      mcpManager: this.mcpManager,
      setupDeepAgentEventListeners: () => this.setupDeepAgentEventListeners()
    })
    // Set up MCP manager deps after all managers are created
    this.mcpManager.setDeps({
      plugin: this as any,
      permissionChecker: this.permissionChecker,
      setModel: (modelId: string) => this.modelManager.setModel(modelId),
      reinitializeDeepAgent: () => this.deepAgentManager.reinitialize()
    })

    // Listen for API key settings changes and reinitialize DeepAgent
    onApiKeysChange(() => {
      remixAILogger.log('[RemixAI Plugin] API keys changed, reinitializing DeepAgent...')
      if (this.deepAgentEnabled) {
        this.deepAgentManager.reinitialize()
      }
    })
  }

  private setupDeepAgentEventListeners() {
    if (!this.deepAgentInferencer) return
    this.eventBridge.setupListeners(this.deepAgentInferencer, this as any)
  }

  /**
   * Single source of truth for diagnosing "why did this request go to
    * solcoder/remote?". Emits a tagged debug log group with every prereq
   * we evaluate in the routing decision plus the current lifecycle
   * state for DeepAgent / MCP / model selection.
   *
   * NOTE: investigation only — does not change behavior.
   */
  public traceRouteDecision(stage: string, extra: Record<string, any> = {}): void {
    try {
      const card = {
        stage,
        timestamp: new Date().toISOString(),
        chosenRoute:
          this.mcpEnabled && !!this.mcpInferencer
            ? 'mcp'
            : (this.deepAgentEnabled && !!this.deepAgentInferencer ? 'deepagent' : 'remote'),
        mcp: {
          mcpEnabled: this.mcpEnabled,
          hasMcpInferencer: !!this.mcpInferencer,
          mcpServersCount: this.mcpServers?.length ?? 0,
          hasRemixMCPServer: !!this.remixMCPServer
        },
        deepAgent: {
          deepAgentEnabled: this.deepAgentEnabled,
          hasDeepAgentInferencer: !!this.deepAgentInferencer,
          pendingThreadId: this.pendingDeepAgentThreadId
        },
        model: {
          selectedModelId: this.selectedModelId,
          selectedProvider: this.selectedModel?.provider ?? null,
          requiredFeature: this.selectedModel?.requiredFeature ?? null,
          available: this.selectedModel?.available ?? null
        },
        remote: {
          hasRemoteInferencer: !!this.remoteInferencer
        },
        extra
      }
      remixAILogger.group(`[route-trace][${stage}] chosen=${card.chosenRoute}`)
      remixAILogger.log(card)
      if (card.chosenRoute === 'remote') {
        // Make the fallback impossible to miss — also dump a stack
        // snippet so we can see who is calling us.
        remixAILogger.warn('[route-trace][SOLCODER-FALLBACK] DeepAgent/MCP unavailable, falling back to remote (solcoder).')
        remixAILogger.warn('[route-trace][SOLCODER-FALLBACK] reason flags:', {
          mcpEnabledButNoInferencer: this.mcpEnabled && !this.mcpInferencer,
          deepAgentEnabledButNoInferencer: this.deepAgentEnabled && !this.deepAgentInferencer,
          deepAgentDisabled: !this.deepAgentEnabled,
          mcpDisabled: !this.mcpEnabled
        })
        try { throw new Error('route-trace stack') } catch (e: any) {
          remixAILogger.warn('[route-trace][SOLCODER-FALLBACK] stack:\n' + (e?.stack || '').split('\n').slice(0, 12).join('\n'))
        }
      }
      remixAILogger.groupEnd()
    } catch { /* logging must never throw */ }
  }

  /**
   * Tag every transition that toggles DeepAgent on/off so we can
   * reconstruct, from the console, why a later request fell back to
   * solcoder. `reason` is a short label, `extra` should include the
   * key state values (selectedModel, hasRemixMCPServer, error).
   */
  public traceDeepAgentLifecycle(event: string, reason: string, extra: Record<string, any> = {}): void {
    try {
      remixAILogger.log('[deepagent-lifecycle]', {
        event,
        reason,
        deepAgentEnabled: this.deepAgentEnabled,
        hasDeepAgentInferencer: !!this.deepAgentInferencer,
        selectedModelId: this.selectedModelId,
        selectedProvider: this.selectedModel?.provider ?? null,
        hasRemixMCPServer: !!this.remixMCPServer,
        hasMcpInferencer: !!this.mcpInferencer,
        mcpEnabled: this.mcpEnabled,
        timestamp: new Date().toISOString(),
        extra
      })
    } catch { /* logging must never throw */ }
  }

  // ─── Route status (UI readiness signal) ─────────────────────────────
  // The UI shows a small badge / disables input based on this. It is
  // recomputed whenever the underlying state changes; `publishRouteStatus`
  // is called from every code path that mutates a relevant field.
  private _lastRouteStatus: string | null = null

  /**
   * Compute the current chat route status for the UI:
   *  - 'initializing': prereqs are still settling (no selectedModel yet, or
   *    DeepAgent is enabled but its inferencer hasn't been built yet).
   *  - 'agent'       : DeepAgent path is live (subagents + tools).
   *  - 'tools'       : MCP-only path is live (tools, no subagents).
   *  - 'chat'        : plain remote/ollama path (no tools, no subagents).
   */
  public getRouteStatus(): {
    route: 'initializing' | 'agent' | 'tools' | 'chat'
    ready: boolean
    details: Record<string, any>
    } {
    const hasModel = !!(this.selectedModel && this.selectedModelId)
    const hasDeepAgent = !!(this.deepAgentEnabled && this.deepAgentInferencer)
    const hasMcp = !!(this.mcpEnabled && this.mcpInferencer)
    // DeepAgent prereqs known to the plugin: model + remixMCPServer + flag.
    // If the flag is on and we have the prereqs but the inferencer isn't
    // built yet, treat the route as "initializing" instead of falling back
    // to 'chat' — this is the window where the UI should hold the user back.
    const deepAgentSettling = this.deepAgentEnabled && !!this.remixMCPServer && hasModel && !this.deepAgentInferencer
    let route: 'initializing' | 'agent' | 'tools' | 'chat'
    if (!hasModel || deepAgentSettling) {
      route = 'initializing'
    } else if (hasDeepAgent) {
      route = 'agent'
    } else if (hasMcp) {
      route = 'tools'
    } else {
      route = 'chat'
    }
    return {
      route,
      ready: route !== 'initializing',
      details: {
        deepAgentEnabled: this.deepAgentEnabled,
        hasDeepAgentInferencer: !!this.deepAgentInferencer,
        mcpEnabled: this.mcpEnabled,
        hasMcpInferencer: !!this.mcpInferencer,
        hasRemixMCPServer: !!this.remixMCPServer,
        selectedModelId: this.selectedModelId,
        selectedProvider: this.selectedModel?.provider ?? null
      }
    }
  }

  /**
   * Recompute the route status and emit `routeStatusChanged` if it changed.
   * Safe to call from any lifecycle hook; no-op if status is unchanged.
   */
  public publishRouteStatus(): void {
    try {
      const status = this.getRouteStatus()
      const key = `${status.route}|${status.ready}`
      if (key !== this._lastRouteStatus) {
        this._lastRouteStatus = key
        this.emit('routeStatusChanged', status)
      }
    } catch { /* never throw */ }
  }

  private async getLocalizedMessage(key: string): Promise<string> {
    try {
      const locale = await this.call('locale', 'currentLocale')
      return locale.messages[key] || key
    } catch (error) {
      remixAILogger.warn('Failed to get localized message for key:', key, error)
      return key
    }
  }

  public getAllowedModels(): string[] {
    if (this.modelAccess) {
      return this.modelAccess.allowedModels
    }
    return []
  }

  public setModelAccess(modelAccess: any): void {
    this.modelAccess = modelAccess
  }

  async onActivation(): Promise<void> {
    const { hasBasicMcp, hasWebSearch } = await this.checkMCPAccess()
    let mcpPermissionSyncInFlight = false

    // Resolve the initial model from /permissions — NO client-side defaults
    // and NO beta-user hardcode. The backend's `is_default: true` row wins.
    // If permissions haven't loaded yet, subscribe and wait; downstream
    // calls (DeepAgent enable, completion, etc.) all gate on `selectedModel`.
    const applyDefaultFromState = async (): Promise<void> => {
      try {
        const def: AIModel | null = await this.call('assistantState' as any, 'getDefaultModel')
        // The anonymous placeholder (id: '__signin__') is marked
        // `available: false` — it exists only so the picker can render a
        // "Sign in" row. The plugin must NEVER commit to it; otherwise
        // we end up sending `model: "__signin__"` to the backend.
        if (!def || !def.id || def.available === false) {
          remixAILogger.log('[RemixAI Plugin] /permissions has no usable default model yet — waiting for stateChanged', { id: def?.id, available: def?.available })
          return
        }
        // Re-apply when:
        //   - we don't have a selection yet, OR
        //   - the current selection is the anonymous placeholder / an
        //     unavailable row (e.g. permissions just flipped from anon
        //     → authed and we still hold '__signin__').
        // Don't clobber a real user pick.
        const currentIsUsable = !!this.selectedModel && this.selectedModel.available !== false
        if (this.selectedModelId && currentIsUsable) {
          return
        }
        remixAILogger.log('[RemixAI Plugin] Initial/refreshed default model from /permissions:', def.provider, def.id)
        this.selectedModel = def
        this.selectedModelId = def.id
        this.emit('modelChanged', def.id)
        // Push the new selection through the standard setModel flow so
        // GenerationParams/CompletionParams pick up the provider+model
        // and DeepAgent (if enabled) reinitialises.
        try {
          await this.setModel(def.id)
        } catch (e) {
          remixAILogger.warn('[RemixAI Plugin] setModel failed during initial /permissions resolution', e)
        }
        // If DeepAgent is intended-on but wasn't initialised at startup
        // because selectedModel was null, do it now.
        if (this.deepAgentEnabled && !this.deepAgentInferencer && this.remixMCPServer) {
          try {
            await this.deepAgentManager.enable()
          } catch (e) {
            remixAILogger.warn('[RemixAI Plugin] deferred DeepAgent enable failed', e)
          }
        }
      } catch (e) {
        remixAILogger.warn('[RemixAI Plugin] assistantState.getDefaultModel failed', e)
      }
    }

    // Auth can flip before /permissions has fully hydrated in assistantState.
    // When that happens, refreshMCPServersOnAuthChange() may run with a stale
    // snapshot and keep the default-only server set. Re-run the MCP refresh
    // once permissions are definitively ready so mcp:basicExternal is applied
    // without requiring a hard reload.
    const syncMcpServersFromReadyPermissions = async (snap?: any): Promise<void> => {
      if (mcpPermissionSyncInFlight) return

      const permissionsState = snap?.permissionsState
      const isAuthenticated = !!snap?.isAuthenticated

      // Only run once the permissions payload is ready for an authenticated user.
      if (!isAuthenticated || permissionsState !== 'ready') return

      mcpPermissionSyncInFlight = true
      try {
        await this.refreshMCPServersOnAuthChange({ isAuthenticated: true })
      } catch (e) {
        remixAILogger.warn('[RemixAI Plugin] MCP sync from ready permissions failed', e)
      } finally {
        mcpPermissionSyncInFlight = false
      }
    }

    await applyDefaultFromState()
    this.on('assistantState' as any, 'stateChanged', (snap: any) => {
      void applyDefaultFromState()
      void syncMcpServersFromReadyPermissions(snap)
    })

    // Listen for tool-approval responses forwarded by the assistant UI as engine events.
    // The UI cannot use plugin.call() here because remixAI's request queue is busy with
    // the in-flight answer() call that is awaiting this very approval.
    this.on('remixaiassistant' as any, 'toolApprovalResponse', (response: { requestId: string; approved: boolean; modifiedArgs?: Record<string, any>; timedOut?: boolean }) => {
      this.deepAgentManager.respondToToolApproval(response)
    })

    // Listen for Stop requests forwarded by the assistant UI as engine events.
    // Same reason as toolApprovalResponse above: the UI cannot use plugin.call()
    // because remixAI's request queue is busy with the in-flight answer() call.
    // We deliberately do NOT await cancelRequest() here — the synchronous abort
    // inside it (currentAbortController.abort()) runs immediately during event
    // dispatch, which lets the queued answer() unwind and drain the queue; the
    // subsequent reinitialize() runs detached and the next turn gates on
    // DeepAgentManager.awaitReady().
    this.on('remixaiassistant' as any, 'stopRequested', (historyMessages?: Array<{ role: 'user' | 'assistant'; content: string }>) => {
      void this.cancelRequest(historyMessages)
    })

    await this.initialize()
    this.completionAgent = new CodeCompletionAgent(this)
    this.securityAgent = new SecurityAgent(this)
    this.codeExpAgent = new CodeExplainAgent(this)
    this.contractor = ContractAgent.getInstance(this)
    this.workspaceAgent = workspaceAgent.getInstance(this)

    // Web Search MUST be gated on `mcp:web-search` — see PermissionChecker.
    // Including it unconditionally fires an anonymous request to /web-search
    // and the gateway returns 401, polluting the console and flagging the
    // session. The post-login `refreshMCPServersOnAuthChange` flow re-adds it
    // once permissions hydrate.
    this.mcpServers = [
      ...mcpDefaultServersConfig.defaultServers,
      ...(hasBasicMcp ? mcpBasicServersConfig.defaultServers : []),
      ...(hasWebSearch ? mcpWebSearchServersConfig.defaultServers : [])
    ]

    // Initialize MCP inferencer if we have servers and remixMCPServer exists
    if (this.mcpServers.length > 0 && this.remixMCPServer) {
      this.mcpInferencer = new MCPInferencer(this.mcpServers, undefined, undefined, this.remixMCPServer, this.remoteInferencer, this.getMcpAuthToken);
      this.mcpInferencer.event.on('mcpServerConnected', (serverName: string) => {
        remixAILogger.log(`[RemixAI Plugin] MCP server connected: ${serverName}`);
      });
      this.mcpInferencer.event.on('mcpServerError', (serverName: string, error: Error) => {
        remixAILogger.error(`[RemixAI Plugin] MCP server error (${serverName}):`, error);
      });

      // Connect to enabled servers for status tracking
      const enabledServers = this.mcpServers.filter((s: IMCPServer) => s.enabled);
      if (enabledServers.length > 0) {
        const waitPromise = this.waitForMCPServersReady();
        await this.mcpInferencer.connectAllServers();
        remixAILogger.log('[RemixAI Plugin] connectAllServers() completed, now waiting for all servers to fully connect...');

        // Wait for all connection events to be received
        await waitPromise;
        remixAILogger.log('[RemixAI Plugin] All MCP servers fully connected');
        this.emit('mcpServersLoaded');
      }
    }

    // Listen to auth state changes to refresh MCP servers based on user permissions
    this.on('auth', 'authStateChanged', async (authState: any) => {
      await this.refreshMCPServersOnAuthChange(authState);
    });

    const allTools = await this.mcpInferencer?.getAllTools();
    remixAILogger.log('[RemixAI Plugin] MCP tools available after wait:', allTools);

    this.traceDeepAgentLifecycle('onActivation:preInitCheck', 'evaluating prereqs before constructing DeepAgentInferencer', {
      deepAgentEnabled: this.deepAgentEnabled,
      hasRemixMCPServer: !!this.remixMCPServer,
      hasSelectedModel: !!this.selectedModel,
      selectedModelId: this.selectedModelId,
      willInitialize: !!(this.deepAgentEnabled && this.remixMCPServer && this.selectedModel && this.selectedModelId)
    })
    if (this.deepAgentEnabled && this.remixMCPServer && this.selectedModel && this.selectedModelId) {
      try {
        remixAILogger.log('[RemixAI Plugin] Initializing DeepAgent with mcpInferencer:', !!this.mcpInferencer);
        remixAILogger.log('[RemixAI Plugin] Using model for DeepAgent:', this.selectedModel.provider, this.selectedModelId);

        // Read user API keys from settings using helper
        const apiKeyHelper = new ApiKeySettingsHelper(this)
        const userApiKeys = await apiKeyHelper.getUserApiKeysConfig()
        if (userApiKeys?.useOwnKeys) {
          remixAILogger.log('[RemixAI Plugin] Using user-provided API keys for DeepAgent')
        }

        // Don't use remote fallback for Ollama - user explicitly chose local models
        const fallbackInferencer = this.selectedModel.provider === 'ollama' ? null : this.remoteInferencer

        // Clean up old instance if it exists
        if (this.deepAgentInferencer && typeof this.deepAgentInferencer.cleanup === 'function') {
          this.deepAgentInferencer.cleanup()
        }

        this.deepAgentInferencer = new DeepAgentInferencer(
          this,
          this.remixMCPServer.tools,
          {
            memoryBackend: (localStorage.getItem('deepagent_memory_backend') as 'state' | 'store') || 'store',
            enableSubagents: true,
            enablePlanning: true,
            userApiKeys
          },
          fallbackInferencer,
          this.mcpInferencer, // Pass MCPInferencer to gather external MCP client tools
          { provider: this.selectedModel.provider as 'anthropic' | 'mistralai' | 'openai' | 'moonshot' | 'ollama', modelId: this.selectedModelId } // Pass selected model
        )
        await this.deepAgentInferencer.initialize()
        // Set up DeepAgent event listeners for streaming (once only)
        this.setupDeepAgentEventListeners();

        // Push allowed models directly to avoid re-entrant deadlock
        ;(this.deepAgentInferencer as any).setAllowedModels(this.getAllowedModels() || [])

        remixAILogger.log('[RemixAI Plugin] DeepAgent initialized successfully')

        // Apply pending thread_id if setDeepAgentThread was called before init completed
        if (this.pendingDeepAgentThreadId) {
          this.deepAgentInferencer.setSessionThreadId(this.pendingDeepAgentThreadId)
          this.pendingDeepAgentThreadId = null
        }
      } catch (error) {
        remixAILogger.error('[RemixAI Plugin] Failed to initialize DeepAgent:', error)
        this.deepAgentEnabled = false
        this.deepAgentInferencer = null
        this.traceDeepAgentLifecycle('onActivation:initFailed', 'caught error during DeepAgentInferencer construction/initialize', {
          errorMessage: (error as any)?.message,
          errorStack: ((error as any)?.stack || '').split('\n').slice(0, 8).join('\n')
        })
      }
    } else {
      this.traceDeepAgentLifecycle('onActivation:initSkipped', 'prereqs missing — DeepAgent not constructed at activation', {
        deepAgentEnabled: this.deepAgentEnabled,
        hasRemixMCPServer: !!this.remixMCPServer,
        hasSelectedModel: !!this.selectedModel,
        selectedModelId: this.selectedModelId
      })
    }
    this.publishRouteStatus()
  }

  async initialize(remoteModel?:IRemoteModel){
    this.remoteInferencer = new RemoteInferencer(remoteModel?.apiUrl, remoteModel?.completionUrl)
    this.remoteInferencer.event.on('onInference', () => {
      this.isInferencing = true
    })
    this.remoteInferencer.event.on('onInferenceDone', () => {
      this.isInferencing = false
    })

    // Only push the model to the inference layer once /permissions has
    // resolved one. Without an id the picker is empty and downstream
    // setModel would throw — we let the assistantState subscription do it.
    if (this.selectedModelId) {
      await this.setModel(this.selectedModelId)
    } else {
      remixAILogger.log('[RemixAI Plugin] initialize: no selectedModelId yet, deferring setModel until /permissions loads')
    }

    this.aiIsActivated = true

    this.on('blockchain', 'transactionExecuted', async () => {
      this.clearCaches()
    })
    this.on('web3Provider', 'transactionBroadcasted', (txhash) => {
      this.clearCaches()
    });

    (window as any).getRemixAIPlugin = this

    // initialize the remix MCP server
    this.remixMCPServer = await createRemixMCPServer(this)

    return true
  }

  /**
   * Wrap an AI inferencer call with the assistant-state lifecycle:
   *   - `requireReady({feature})` — opens planManager with the right reason
   *      when the user is anonymous, unverified, feature-gated or in cooldown.
   *      Returns `null` from the AI method when the gate refuses.
   *   - `reportRequestStarted` before the call.
   *   - `reportRequestSucceeded` on success.
   *   - `reportError(parsedAIError)` on failure (then re-throws).
   *
   * `assistantState` calls are individually try/catch-wrapped so the legacy
   * path keeps working when the plugin is disabled (e.g. tests).
   */
  private getSelectedModelRequiredFeature(): string | undefined {
    const feature = this.selectedModel?.requiredFeature
    return feature && feature.length > 0 ? feature : undefined
  }

  private async withAssistantGate<T>(feature: string | undefined, run: () => Promise<T>): Promise<T | null> {
    try {
      const ready = feature
        ? await this.call('assistantState' as any, 'requireReady', { feature })
        : await this.call('assistantState' as any, 'requireReady')
      if (!ready) return null
    } catch { /* assistantState not active — fall through */ }
    try { await this.call('assistantState' as any, 'reportRequestStarted') } catch { /* noop */ }
    try {
      const result = await run()
      try { await this.call('assistantState' as any, 'reportRequestSucceeded') } catch { /* noop */ }
      return result
    } catch (e: any) {
      const status = e?.response?.status ?? e?.status ?? 0
      const responseBody = e?.response?.data ?? e?.data
      // Only run parseAIErrorEnvelope on an actual response body. If we
      // don't have one (e.g. plain Error from langchain with the body
      // stringified into .message as "403 {json}"), aiErrorFromException
      // is the right tool — it knows how to peel that wrapper apart.
      const aiError = responseBody && typeof responseBody === 'object'
        ? parseAIErrorEnvelope(responseBody, status)
        : aiErrorFromException(e)
      try { await this.call('assistantState' as any, 'reportError', aiError) } catch { /* noop */ }
      // Stamp the parsed envelope on the thrown error so the UI catch
      // block (and any other consumer) doesn't need to re-parse the raw
      // response. Critical for inferencer paths that throw plain Errors
      // (MCP tool failures, SSE error frames, network down) — without
      // this the UI saw `error.message` and showed nothing useful.
      try {
        if (e && typeof e === 'object') {
          ;(e as any).aiError = aiError
          // Also synthesise the .response.data.error shape that legacy
          // catch sites look for, so they don't accidentally swallow
          // the error as "no envelope, ignore".
          if (!(e as any).response) (e as any).response = { status: aiError.status, data: { error: aiError } }
          else if (!(e as any).response.data) (e as any).response.data = { error: aiError }
          else if (!(e as any).response.data.error) (e as any).response.data.error = aiError
        }
      } catch { /* defensive — never let stamping crash error propagation */ }
      throw e
    }
  }

  async basic_prompt(prompt: string) {
    const option = { ...GenerationParams }
    option.stream = false
    option.stream_result = false
    option.return_stream_response = false
    // return await this.remoteInferencer.basic_prompt(prompt, option)
    return this.deepAgentInferencer?.basic_inference(prompt) ?? this.remoteInferencer.basic_prompt(prompt, option)
  }

  async code_generation(prompt: string, params: IParams=CompletionParams): Promise<any> {
    return this.withAssistantGate(this.getSelectedModelRequiredFeature(), async () => {
      this.traceRouteDecision('code_generation', { promptLen: prompt?.length ?? 0 })
      // Explicit MCP toggle wins over DeepAgent — the user opted in to the
      // MCP-enriched solcoder path and that's what they expect to run.
      if (this.mcpEnabled && this.mcpInferencer){
        return this.mcpInferencer.code_generation(prompt, params)
      } else if (this.deepAgentEnabled && this.deepAgentInferencer) {
        await this.deepAgentManager.awaitReady()
        return this.deepAgentInferencer.code_generation(prompt, params)
      } else {
        return await this.remoteInferencer.code_generation(prompt, params)
      }
    })
  }

  async code_completion(prompt: string, promptAfter: string, params:IParams=CompletionParams): Promise<any> {
    this.emit('codeCompletionUsed')
    return this.withAssistantGate(Features.AI_COMPLETION, async () => {
      if (this.completionAgent.indexer == null || this.completionAgent.indexer == undefined) await this.completionAgent.indexWorkspace()
      params.provider = 'mistralai' // default provider for code completion
      const currentFileName = await this.call('fileManager', 'getCurrentFile')
      const contextfiles = await this.completionAgent.getContextFiles(prompt)
      return await this.remoteInferencer.code_completion(prompt, promptAfter, contextfiles, currentFileName, params)
    })
  }

  async answer(prompt: string, params: IParams=GenerationParams): Promise<any> {
    this.emit('chatMessageSent')
    const result = await this.withAssistantGate(this.getSelectedModelRequiredFeature(), async () => {
      this.traceRouteDecision('answer', { promptLen: prompt?.length ?? 0 })
      let newPrompt = await this.codeExpAgent.chatCommand(prompt)
      // add workspace context
      newPrompt = !this.workspaceAgent.ctxFiles ? newPrompt : "Using the following context: ```\n" + this.workspaceAgent.ctxFiles + "```\n\n" + newPrompt
      // Single source of truth for which backend handled this turn.
      // `/solcoder` = simple chat, `/langchain` = DeepAgent (multi-POST),
      // `mcp` = MCP-enriched solcoder. Without this it's nearly impossible
      // to tell from DevTools which path produced any given error.
      // Explicit MCP toggle wins over DeepAgent — when the user flips the
      // MCP Enhancement checkbox they expect the MCP-enriched solcoder
      // route, not the langchain DeepAgent flow.
      const mcpRouteCheck = this.mcpEnabled && !!this.mcpInferencer
      const deepAgentRouteCheck = this.deepAgentEnabled && !!this.deepAgentInferencer
      const remoteRouteCheck = !!this.remoteInferencer
      const route = mcpRouteCheck
        ? 'mcp'
        : (deepAgentRouteCheck ? 'deepagent' : 'remote')
      const routeFlow = {
        selectedRoute: route,
        checks: [
          {
            step: 1,
            name: 'mcpEnabled && hasMcpInferencer',
            mcpEnabled: this.mcpEnabled,
            hasMcpInferencer: !!this.mcpInferencer,
            passed: mcpRouteCheck
          },
          {
            step: 2,
            name: 'deepAgentEnabled && hasDeepAgentInferencer',
            deepAgentEnabled: this.deepAgentEnabled,
            hasDeepAgentInferencer: !!this.deepAgentInferencer,
            passed: deepAgentRouteCheck
          },
          {
            step: 3,
            name: 'hasRemoteInferencer (fallback)',
            hasRemoteInferencer: remoteRouteCheck,
            passed: remoteRouteCheck
          }
        ],
        prompt: {
          originalLength: prompt?.length ?? 0,
          transformedLength: newPrompt?.length ?? 0,
          workspaceContextChars: this.workspaceAgent?.ctxFiles?.length ?? 0,
          hasWorkspaceContext: !!this.workspaceAgent?.ctxFiles
        },
        model: {
          provider: this.selectedModel?.provider ?? '?',
          id: this.selectedModel?.id ?? '?',
          requestedProvider: params?.provider ?? '?',
          requestedModel: params?.model ?? '?'
        },
        params: {
          stream: !!params?.stream,
          stream_result: !!params?.stream_result,
          return_stream_response: !!params?.return_stream_response,
          threadId: params?.threadId ?? ''
        }
      }
      remixAILogger.log('[answer][route-flow]', routeFlow)
      if (!remoteRouteCheck && route === 'remote') {
        remixAILogger.warn('[answer][route-flow] remote route selected but remoteInferencer is missing')
      }
      if (route === 'deepagent') {
        // If a previous cancelRequest is still rebuilding the inferencer,
        // wait for it to finish so this dispatch lands on the new
        // instance with a clean LangGraph pipe rather than racing the
        // about-to-be-discarded one.
        await this.deepAgentManager.awaitReady()
        remixAILogger.log('[answer][route-flow] dispatch=deepagent.answer')
        return await this.deepAgentInferencer.answer(newPrompt, params, this.workspaceAgent.ctxFiles || '')
      } else if (route === 'mcp'){
        remixAILogger.log('[answer][route-flow] dispatch=mcp.answer')
        return await this.mcpInferencer.answer(prompt, params)
      } else {
        remixAILogger.log('[answer][route-flow] dispatch=remote.answer')
        return await this.remoteInferencer.answer(newPrompt, params)
      }
    })
    if (result && params.terminal_output) this.call('terminal', 'log', { type: 'aitypewriterwarning', value: result })
    return result
  }

  async code_explaining(prompt: string, context: string, params: IParams=GenerationParams): Promise<any> {
    this.emit('codeExplainRequested')
    const result = await this.withAssistantGate(this.getSelectedModelRequiredFeature(), async () => {
      this.traceRouteDecision('code_explaining', { promptLen: prompt?.length ?? 0, contextLen: context?.length ?? 0 })
      // Explicit MCP toggle wins over DeepAgent — see answer() for rationale.
      if (this.mcpEnabled && this.mcpInferencer){
        return await this.mcpInferencer.code_explaining(prompt, context, params)
      } else if (this.deepAgentEnabled && this.deepAgentInferencer) {
        await this.deepAgentManager.awaitReady()
        return await this.deepAgentInferencer.code_explaining(prompt, context, params)
      } else {
        return await this.remoteInferencer.code_explaining(prompt, context, params)
      }
    })
    if (result && params.terminal_output) this.call('terminal', 'log', { type: 'aitypewriterwarning', value: result })
    return result
  }

  async error_explaining(prompt: string, params: IParams=GenerationParams): Promise<any> {
    this.emit('errorExplainRequested')
    const result = await this.withAssistantGate(this.getSelectedModelRequiredFeature(), async () => {
      // NOTE: error_explaining ALWAYS goes to remote (solcoder) by design.
      this.traceRouteDecision('error_explaining', { hardcodedRoute: 'remote', promptLen: prompt?.length ?? 0 })
      let localFilesImports = ""

      // Get local imports from the workspace restrict to 5 most relevant files
      const relevantFiles = this.workspaceAgent.getRelevantLocalFiles(prompt, 5);

      for (const file in relevantFiles) {
        localFilesImports += `\n\nFileName: ${file}\n\n${relevantFiles[file]}`
      }
      localFilesImports = localFilesImports + "\n End of local files imports.\n\n"
      const finalPrompt = localFilesImports ? `Using the following local imports: ${localFilesImports}\n\n` + prompt : prompt
      return await this.remoteInferencer.error_explaining(finalPrompt, params)
    })
    if (result && params.terminal_output) this.call('terminal', 'log', { type: 'aitypewriterwarning', value: result })
    return result
  }

  async vulnerability_check(prompt: string, params: IParams=GenerationParams): Promise<any> {
    this.emit('vulnerabilityCheckRequested')
    const result = await this.withAssistantGate(this.getSelectedModelRequiredFeature(), async () => {
      // NOTE: vulnerability_check ALWAYS goes to remote (solcoder) by design.
      this.traceRouteDecision('vulnerability_check', { hardcodedRoute: 'remote', promptLen: prompt?.length ?? 0 })
      return await this.remoteInferencer.vulnerability_check(prompt, params)
    })
    if (result && params.terminal_output) this.call('terminal', 'log', { type: 'aitypewriterwarning', value: result })
    return result
  }

  getVulnerabilityReport(file: string): any {
    return this.securityAgent.getReport(file)
  }

  /**
   * Generates a new remix IDE workspace based on the provided user prompt, optionally using Retrieval-Augmented Generation (RAG) context.
   * - If `useRag` is `true`, the function fetches additional context from a RAG API and prepends it to the user prompt.
   */
  async generate(prompt: string, params: IParams=AssistantParams, newThreadID:string="", useRag:boolean=false, statusCallback?: (status: string) => Promise<void>): Promise<any> {
    params.stream_result = false // enforce no stream result
    params.threadId = newThreadID
    params.provider = 'mistralai' // enforce all generation to be only on anthropic
    params.model = 'mistral-medium-latest'
    useRag = false
    trackMatomoEvent(this, { category: 'ai', action: 'remixAI', name: 'GenerateNewAIWorkspace', isClick: false })
    let userPrompt = ''

    if (useRag) {
      statusCallback?.(await this.getLocalizedMessage('remixApp.ai.status.fetchingRAGContext'))
      try {
        let ragContext = ""
        const options = { headers: { 'Content-Type': 'application/json', } }
        const response = await axios.post(endpointUrls.rag, { query: prompt, endpoint:"query" }, options)
        if (response.data) {
          ragContext = response.data.response
          userPrompt = "Using the following context: ```\n\n" + JSON.stringify(ragContext) + "```\n\n" + userPrompt
        } else {
          remixAILogger.log('Invalid response from RAG context API:', response.data)
        }
      } catch (error) {
        remixAILogger.log('RAG context error:', error)
      }
    } else {
      userPrompt = prompt
    }
    await statusCallback?.(await this.getLocalizedMessage('remixApp.ai.status.generatingNewWorkspace'))
    const result = await this.remoteInferencer.generate(userPrompt, params)

    await statusCallback?.(await this.getLocalizedMessage('remixApp.ai.status.creatingContracts'))
    const genResult = await this.contractor.writeContracts(result, userPrompt, statusCallback)

    // revert provider
    this.setAssistantProvider(await this.getAssistantProvider())
    if (genResult.includes('No payload')) return genResult
    await this.call('menuicons', 'select', 'filePanel')
    this.emit('workspaceGenerated')
    return genResult
  }

  /**
   * Performs any user action on the entire curren workspace or updates the workspace based on a user prompt,
   * optionally using Retrieval-Augmented Generation (RAG) for additional context.
   *
   */
  async generateWorkspace (userPrompt: string, params: IParams=AssistantParams, newThreadID:string="", useRag:boolean=false, statusCallback?: (status: string) => Promise<void>): Promise<any> {
    params.stream_result = false // enforce no stream result
    params.threadId = newThreadID
    if (!this.selectedModel) {
      throw new Error('[remixAIPlugin.generateWorkspace] No selectedModel — wait for /permissions to load before invoking the workspace agent.')
    }
    params.provider = this.selectedModel.provider
    useRag = false
    trackMatomoEvent(this, { category: 'ai', action: 'remixAI', name: 'WorkspaceAgentEdit', isClick: false })

    await statusCallback?.(await this.getLocalizedMessage('remixApp.ai.status.performingWorkspaceRequest'))
    if (useRag) {
      await statusCallback?.(await this.getLocalizedMessage('remixApp.ai.status.fetchingRAGContext'))
      try {
        let ragContext = ""
        const options = { headers: { 'Content-Type': 'application/json', } }
        const response = await axios.post(endpointUrls.rag, { query: userPrompt, endpoint:"query" }, options)
        if (response.data) {
          ragContext = response.data.response
          userPrompt = "Using the following context: ```\n\n" + ragContext + "```\n\n" + userPrompt
        }
        else {
          remixAILogger.log('Invalid response from RAG context API:', response.data)
        }
      } catch (error) {
        remixAILogger.log('RAG context error:', error)
      }
    }
    await statusCallback?.(await this.getLocalizedMessage('remixApp.ai.status.loadingWorkspaceContext'))
    const files = !this.workspaceAgent.ctxFiles ? await this.workspaceAgent.getCurrentWorkspaceFiles() : this.workspaceAgent.ctxFiles
    userPrompt = "Using the following workspace context: ```\n" + files + "```\n\n" + userPrompt

    await statusCallback?.(await this.getLocalizedMessage('remixApp.ai.status.generatingWorkspaceUpdates'))
    const result = await this.remoteInferencer.generateWorkspace(userPrompt, params)

    await statusCallback?.(await this.getLocalizedMessage('remixApp.ai.status.applyingChanges'))
    const finalResult = (result !== undefined) ? this.workspaceAgent.writeGenerationResults(result, statusCallback) : "### No Changes applied!"
    this.emit('workspaceGenerated')
    return finalResult
  }

  async fixWorspaceErrors(): Promise<any> {
    try {
      return this.contractor.fixWorkspaceCompilationErrors(this.workspaceAgent)
    } catch (error) {
    }
  }

  async code_insertion(msg_pfx: string, msg_sfx: string, params:IParams=CompletionParams): Promise<any> {
    return this.withAssistantGate(Features.AI_COMPLETION, async () => {
      if (this.completionAgent.indexer == null || this.completionAgent.indexer == undefined) await this.completionAgent.indexWorkspace()

      params.provider = 'mistralai' // default provider for code completion
      const currentFileName = await this.call('fileManager', 'getCurrentFile')
      const contextfiles = await this.completionAgent.getContextFiles(msg_pfx)
      return await this.remoteInferencer.code_insertion( msg_pfx, msg_sfx, contextfiles, currentFileName, params)
    })
  }

  async chatPipe(fn, prompt: string, context?: string, pipeMessage?: string){
    // Gate before we pipe anything to the chat — otherwise the user bubble
    // appears for a request we already know we won't honor (and the
    // downstream null result crashes the chat with "cannot read body").
    try {
      const requiredFeature = this.getSelectedModelRequiredFeature()
      const ready = requiredFeature
        ? await this.call('assistantState' as any, 'requireReady', { feature: requiredFeature })
        : await this.call('assistantState' as any, 'requireReady')
      if (!ready) return
    } catch { /* assistantState not active — fall through to legacy path */ }

    if (this.chatRequestBuffer == null){
      this.chatRequestBuffer = {
        fn_name: fn,
        prompt: prompt,
        context: context
      }

      if (pipeMessage) this.call('remixaiassistant', 'chatPipe', pipeMessage)
      else {
        if (fn === "code_explaining") this.call('remixaiassistant', 'chatPipe',"Explain the current code")
        else if (fn === "error_explaining") this.call('remixaiassistant', 'chatPipe', "Explain the error")
        else if (fn === "answer") this.call('remixaiassistant', 'chatPipe', "Answer the following question")
        else if (fn === "vulnerability_check") this.call('remixaiassistant', 'chatPipe',"Is there any vulnerability in the pasted code?")
        else remixAILogger.log("chatRequestBuffer function name not recognized.")
      }
    }
    else {
      remixAILogger.log("chatRequestBuffer is not empty. First process the last request.", this.chatRequestBuffer)
    }
    trackMatomoEvent(this, { category: 'ai', action: 'remixAI', name: 'remixAI_chat', isClick: false })
    this.emit('chatPipeRequested', fn)
  }

  async ProcessChatRequestBuffer(params:IParams=GenerationParams){
    if (this.chatRequestBuffer != null){
      const result = this[this.chatRequestBuffer.fn_name](this.chatRequestBuffer.prompt, this.chatRequestBuffer.context, params)
      this.chatRequestBuffer = null
      return result
    }
    else {
      remixAILogger.log("chatRequestBuffer is empty.")
      return ""
    }
  }

  async setContextFiles(context: IContextType) {
    this.workspaceAgent.setCtxFiles(context)
  }

  async setAssistantThrId(newThrId: string){
    this.assistantThreadId = newThrId
    AssistantParams.threadId = newThrId
    GenerationParams.threadId = newThrId
    CompletionParams.threadId = newThrId
  }

  async getAssistantThrId(){
    return this.assistantThreadId
  }

  async getAssistantProvider(){
    // Legacy method for backwards compatibility
    if (!this.selectedModel) {
      throw new Error('[remixAIPlugin.getAssistantProvider] No selectedModel \u2014 /permissions has not resolved a default model yet.')
    }
    return this.selectedModel.provider
  }

  async getSelectedModel(){
    return this.selectedModelId
  }

  async setAssistantProvider(provider: string) {
    return this.modelManager.setAssistantProvider(provider)
  }

  async setModel(modelId: string, allowedModels: string[] = []) {
    return this.modelManager.setModel(modelId, allowedModels)
  }

  async setOllamaModel(ollamaModelName: string) {
    return this.modelManager.setOllamaModel(ollamaModelName)
  }

  async getModelAccess(): Promise<string[]> {
    const models = await this.permissionChecker.getModelAccess()
    if (models.length > 0) return models
    // No literal fallback. Empty list is a valid signal: the picker will
    // show locked rows and clicking opens the planManager.
    return []
  }

  async getOllamaModels(): Promise<{ name: string; supported: boolean }[]> {
    return this.modelManager.getOllamaModels()
  }

  isChatRequestPending(){
    return this.chatRequestBuffer != null
  }

  resetChatRequestBuffer() {
    this.chatRequestBuffer = null
  }

  // MCP Server Management Methods (delegated to MCPServerManager)
  async addMCPServer(server: IMCPServer): Promise<void> {
    return this.mcpManager.addServer(server)
  }

  async removeMCPServer(serverName: string): Promise<void> {
    return this.mcpManager.removeServer(serverName)
  }

  getMCPConnectionStatus(): IMCPConnectionStatus[] {
    return this.mcpManager.getConnectionStatus()
  }

  async getMCPResources(): Promise<Record<string, any[]>> {
    return this.mcpManager.getResources()
  }

  async getMCPTools(): Promise<Record<string, any[]>> {
    return this.mcpManager.getTools()
  }

  async executeMCPTool(serverName: string, toolName: string, arguments_: Record<string, any>): Promise<any> {
    return this.mcpManager.executeTool(serverName, toolName, arguments_)
  }

  async enableMCPEnhancement(): Promise<void> {
    this.mcpEnabled = true;
    this.emit('mcpEnabled')
    this.publishRouteStatus()

    if (!this.mcpServers || this.mcpServers.length === 0) {
      return;
    }

    if (!this.mcpInferencer) {
      this.mcpInferencer = new MCPInferencer(this.mcpServers, undefined, undefined, this.remixMCPServer, this.remoteInferencer, this.getMcpAuthToken);
      this.mcpInferencer.event.on('mcpServerConnected', (serverName: string) => {
      })
      this.mcpInferencer.event.on('mcpServerError', (serverName: string, error: Error) => {
      })
      this.mcpInferencer.event.on('onInference', () => {
        this.isInferencing = true
      })
      this.mcpInferencer.event.on('onInferenceDone', () => {
        this.isInferencing = false
      })

      await this.mcpInferencer.connectAllServers();
    }

    if (this.deepAgentEnabled && this.remixMCPServer) {
      await this.deepAgentManager.reinitialize()
    }
  }

  async disableMCPEnhancement(): Promise<void> {
    this.mcpEnabled = false;
    this.emit('mcpDisabled')
    this.publishRouteStatus()

    if (this.mcpInferencer) {
      for (const server of this.mcpServers) {
        try {
          await this.mcpInferencer.removeMCPServer(server.name)
        } catch (err) {
        }
      }
      this.mcpInferencer = null
    }

    // Reinitialize DeepAgent without MCP inferencer
    if (this.deepAgentEnabled && this.remixMCPServer) {
      await this.deepAgentManager.reinitialize()
    }
  }

  isMCPEnabled(): boolean {
    return this.mcpEnabled;
  }

  getIMCPServers(): IMCPServer[] {
    return this.mcpServers;
  }

  async enableDeepAgent(): Promise<void> {
    return this.deepAgentManager.enable()
  }

  async disableDeepAgent(): Promise<void> {
    return this.deepAgentManager.disable()
  }

  isDeepAgentEnabled(): boolean {
    return this.deepAgentManager.isEnabled()
  }

  async setAutoMode(enabled: boolean): Promise<void> {
    return this.deepAgentManager.setAutoMode(enabled)
  }

  getAutoModeStatus(): boolean {
    return this.deepAgentManager.getAutoModeStatus()
  }

  setDeepAgentThread(conversationId: string): void {
    this.deepAgentManager.setThread(conversationId)
  }

  respondToToolApproval(response: { requestId: string; approved: boolean; modifiedArgs?: Record<string, any> }): void {
    this.deepAgentManager.respondToToolApproval(response)
  }

  clearCaches(){
    if (this.mcpInferencer){
      this.mcpInferencer.resetResourceCache()
    }
  }

  async cancelRequest(historyMessages?: Array<{ role: 'user' | 'assistant'; content: string }>): Promise<void> {
    if (this.deepAgentEnabled && this.deepAgentInferencer) {
      // Forward the current chat history so the post-reinit DeepAgent
      // thread can be seeded with the prior turns instead of starting
      // amnesiac. We AWAIT here so that any subsequent answer() dispatch
      // from the UI (e.g. user immediately retypes a new prompt) lands
      // on the rebuilt inferencer rather than racing the old one.
      // See DeepAgentManager.cancelRequest() for details.
      await this.deepAgentManager.cancelRequest(historyMessages)
    } else if (this.mcpEnabled && this.mcpInferencer) {
      this.mcpInferencer.cancelRequest()
    } else if (this.remoteInferencer) {
      (this.remoteInferencer as RemoteInferencer).cancelRequest()
    }
  }

  private async refreshMCPServersOnAuthChange(authState: any): Promise<void> {
    return this.mcpManager.refreshOnAuthChange(authState)
  }

  private async checkMCPAccess(): Promise<{ hasBasicMcp: boolean; hasWebSearch: boolean; isBetaUser: boolean }> {
    return this.permissionChecker.checkMCPAccess()
  }

  private waitForMCPServersReady(timeout: number = 30000): Promise<void> {
    return this.mcpManager.waitForServersReady(timeout)
  }

  private async resetMCPServersToDefault(): Promise<void> {
    return this.mcpManager.resetToDefaultWithReinit()
  }

  async isUsingOwnApiKey(): Promise<boolean> {
    return this.deepAgentManager.isUsingOwnApiKey()
  }

  async getApiKeyStatus(): Promise<{ provider: string; usingOwnKey: boolean }> {
    const usingOwnKey = await this.deepAgentManager.isUsingOwnApiKey()
    return {
      provider: this.selectedModel.provider,
      usingOwnKey
    }
  }

  async fallbackToProxy(): Promise<void> {
    return this.deepAgentManager.fallbackToProxy()
  }
}
