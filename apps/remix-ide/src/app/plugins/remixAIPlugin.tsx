import * as packageJson from '../../../../../package.json'
import { Plugin } from '@remixproject/engine';
import { trackMatomoEvent } from '@remix-api'
import { RemoteInferencer, IRemoteModel, IParams, GenerationParams, AssistantParams, CodeExplainAgent, SecurityAgent, CompletionParams, OllamaInferencer } from '@remix/remix-ai-core';
import { CodeCompletionAgent, ContractAgent, workspaceAgent, IContextType, mcpDefaultServersConfig, mcpBasicServersConfig } from '@remix/remix-ai-core';
import { MCPInferencer, DeepAgentInferencer } from '@remix/remix-ai-core';
import { IMCPServer, IMCPConnectionStatus } from '@remix/remix-ai-core';
import { RemixMCPServer, createRemixMCPServer } from '@remix/remix-ai-core';
import { AIModel, getDefaultModel, getModelById } from '@remix/remix-ai-core';
import axios from 'axios';
import { endpointUrls } from "@remix-endpoints-helper"
import { DeepAgentEventBridge, MCPServerManager, PermissionChecker, ModelManager, DeepAgentManager, DAppGenerationManager, ChatRequestBuffer } from './remixAI'

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
    'generateDAppContent', 'fetchFigmaDesign', 'generateDAppFromFigma'
  ],
  events: [
    'modelChanged',
    'chatMessageSent', 'chatPipeRequested',
    'codeExplainRequested', 'errorExplainRequested', 'vulnerabilityCheckRequested',
    'codeCompletionUsed', 'workspaceGenerated',
    'mcpEnabled', 'mcpDisabled'
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
  selectedModel: AIModel = getDefaultModel() // default model
  selectedModelId: string = getDefaultModel().id
  assistantThreadId: string = ''
  useRemoteInferencer:boolean = true
  completionAgent: CodeCompletionAgent | null = null
  mcpServers: IMCPServer[] = []
  mcpInferencer: MCPInferencer | null = null
  mcpEnabled: boolean = false
  remixMCPServer: RemixMCPServer | null = null
  deepAgentInferencer: DeepAgentInferencer | null = null
  deepAgentEnabled: boolean = false
  private pendingDeepAgentThreadId: string | null = null

  // Extracted helper modules
  private eventBridge: DeepAgentEventBridge
  private mcpManager: MCPServerManager
  private permissionChecker: PermissionChecker
  private modelManager: ModelManager
  private deepAgentManager: DeepAgentManager
  private dappManager: DAppGenerationManager

  constructor() {
    super(profile)
    this.eventBridge = new DeepAgentEventBridge()
    this.mcpManager = new MCPServerManager(this as any)
    this.permissionChecker = new PermissionChecker()
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
    this.dappManager = new DAppGenerationManager({ plugin: this as any })
    // Set up MCP manager deps after all managers are created
    this.mcpManager.setDeps({
      plugin: this as any,
      permissionChecker: this.permissionChecker,
      setModel: (modelId: string) => this.modelManager.setModel(modelId),
      reinitializeDeepAgent: () => this.deepAgentManager.reinitialize()
    })
  }

  private setupDeepAgentEventListeners() {
    if (!this.deepAgentInferencer) return
    this.eventBridge.setupListeners(this.deepAgentInferencer, this as any)
  }

  private async getLocalizedMessage(key: string): Promise<string> {
    try {
      const locale = await this.call('locale', 'currentLocale')
      return locale.messages[key] || key
    } catch (error) {
      console.warn('Failed to get localized message for key:', key, error)
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
    const { hasBasicMcp, isBetaUser } = await this.checkMCPAccess()

    if (isBetaUser) {
      console.log('[RemixAI Plugin] Beta user detected at startup, using claude-sonnet-4-6')
      const betaModel = getModelById('claude-sonnet-4-6')
      if (betaModel) {
        this.selectedModelId = 'claude-sonnet-4-6'
        this.selectedModel = betaModel
      }
    } else {
      console.log('[RemixAI Plugin] Non-beta user at startup, using default model')
      const defaultModel = getDefaultModel()
      this.selectedModelId = defaultModel.id
      this.selectedModel = defaultModel
    }

    await this.initialize()
    this.completionAgent = new CodeCompletionAgent(this)
    this.securityAgent = new SecurityAgent(this)
    this.codeExpAgent = new CodeExplainAgent(this)
    this.contractor = ContractAgent.getInstance(this)
    this.workspaceAgent = workspaceAgent.getInstance(this)

    this.mcpServers = [...mcpDefaultServersConfig.defaultServers, ...(hasBasicMcp ? mcpBasicServersConfig.defaultServers : [])]

    // Initialize MCP inferencer if we have servers and remixMCPServer exists
    if (this.mcpServers.length > 0 && this.remixMCPServer) {
      this.mcpInferencer = new MCPInferencer(this.mcpServers, undefined, undefined, this.remixMCPServer, this.remoteInferencer);
      this.mcpInferencer.event.on('mcpServerConnected', (serverName: string) => {
        console.log(`[RemixAI Plugin] MCP server connected: ${serverName}`);
      });
      this.mcpInferencer.event.on('mcpServerError', (serverName: string, error: Error) => {
        console.error(`[RemixAI Plugin] MCP server error (${serverName}):`, error);
      });

      // Connect to enabled servers for status tracking
      const enabledServers = this.mcpServers.filter((s: IMCPServer) => s.enabled);
      if (enabledServers.length > 0) {
        const waitPromise = this.waitForMCPServersReady();
        await this.mcpInferencer.connectAllServers();
        console.log('[RemixAI Plugin] connectAllServers() completed, now waiting for all servers to fully connect...');

        // Wait for all connection events to be received
        await waitPromise;
        console.log('[RemixAI Plugin] All MCP servers fully connected');
        this.emit('mcpServersLoaded');
      }
    }

    // Listen to auth state changes to refresh MCP servers based on user permissions
    this.on('auth', 'authStateChanged', async (authState: any) => {
      await this.refreshMCPServersOnAuthChange(authState);
    });

    const allTools = await this.mcpInferencer?.getAllTools();
    console.log('[RemixAI Plugin] MCP tools available after wait:', allTools);

    if (this.deepAgentEnabled && this.remixMCPServer) {
      try {
        console.log('[RemixAI Plugin] Initializing DeepAgent with mcpInferencer:', !!this.mcpInferencer);
        console.log('[RemixAI Plugin] Using model for DeepAgent:', this.selectedModel.provider, this.selectedModelId);
        this.deepAgentInferencer = new DeepAgentInferencer(
          this,
          this.remixMCPServer.tools,
          {
            memoryBackend: (localStorage.getItem('deepagent_memory_backend') as 'state' | 'store') || 'store',
            enableSubagents: true,
            enablePlanning: true
          },
          this.remoteInferencer,
          this.mcpInferencer, // Pass MCPInferencer to gather external MCP client tools
          { provider: this.selectedModel.provider as 'anthropic' | 'mistralai', modelId: this.selectedModelId } // Pass selected model
        )
        await this.deepAgentInferencer.initialize()
        // Set up DeepAgent event listeners for streaming (once only)
        this.setupDeepAgentEventListeners();

        // Push allowed models directly to avoid re-entrant deadlock
        ;(this.deepAgentInferencer as any).setAllowedModels(this.getAllowedModels() || [])

        console.log('[RemixAI Plugin] DeepAgent initialized successfully')

        // Apply pending thread_id if setDeepAgentThread was called before init completed
        if (this.pendingDeepAgentThreadId) {
          this.deepAgentInferencer.setSessionThreadId(this.pendingDeepAgentThreadId)
          this.pendingDeepAgentThreadId = null
        }
      } catch (error) {
        console.error('[RemixAI Plugin] Failed to initialize DeepAgent:', error)
        this.deepAgentEnabled = false
        this.deepAgentInferencer = null
      }
    }
  }

  async initialize(remoteModel?:IRemoteModel){
    this.remoteInferencer = new RemoteInferencer(remoteModel?.apiUrl, remoteModel?.completionUrl)
    this.remoteInferencer.event.on('onInference', () => {
      this.isInferencing = true
    })
    this.remoteInferencer.event.on('onInferenceDone', () => {
      this.isInferencing = false
    })

    await this.setModel(this.selectedModelId)

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

  async basic_prompt(prompt: string) {
    const option = { ...GenerationParams }
    option.stream = false
    option.stream_result = false
    option.return_stream_response = false
    return await this.remoteInferencer.basic_prompt(prompt, option)
  }

  async code_generation(prompt: string, params: IParams=CompletionParams): Promise<any> {
    if (this.deepAgentEnabled && this.deepAgentInferencer) {
      return this.deepAgentInferencer.code_generation(prompt, params)
    } else if (this.mcpEnabled && this.mcpInferencer){
      return this.mcpInferencer.code_generation(prompt, params)
    } else {
      return await this.remoteInferencer.code_generation(prompt, params)
    }
  }

  async code_completion(prompt: string, promptAfter: string, params:IParams=CompletionParams): Promise<any> {
    this.emit('codeCompletionUsed')
    if (this.completionAgent.indexer == null || this.completionAgent.indexer == undefined) await this.completionAgent.indexWorkspace()
    params.provider = 'mistralai' // default provider for code completion
    const currentFileName = await this.call('fileManager', 'getCurrentFile')
    const contextfiles = await this.completionAgent.getContextFiles(prompt)
    return await this.remoteInferencer.code_completion(prompt, promptAfter, contextfiles, currentFileName, params)
  }

  async answer(prompt: string, params: IParams=GenerationParams): Promise<any> {
    this.emit('chatMessageSent')
    let newPrompt = await this.codeExpAgent.chatCommand(prompt)
    // add workspace context
    newPrompt = !this.workspaceAgent.ctxFiles ? newPrompt : "Using the following context: ```\n" + this.workspaceAgent.ctxFiles + "```\n\n" + newPrompt
    let result
    if (this.deepAgentEnabled && this.deepAgentInferencer) {
      result = await this.deepAgentInferencer.answer(newPrompt, params, this.workspaceAgent.ctxFiles || '')
    } else if (this.mcpEnabled && this.mcpInferencer){
      return this.mcpInferencer.answer(prompt, params)
    } else {
      result = await this.remoteInferencer.answer(newPrompt, params)
    }
    if (result && params.terminal_output) this.call('terminal', 'log', { type: 'aitypewriterwarning', value: result })
    return result
  }

  async code_explaining(prompt: string, context: string, params: IParams=GenerationParams): Promise<any> {
    this.emit('codeExplainRequested')
    let result
    if (this.deepAgentEnabled && this.deepAgentInferencer) {
      result = await this.deepAgentInferencer.code_explaining(prompt, context, params)
    } else if (this.mcpEnabled && this.mcpInferencer){
      return this.mcpInferencer.code_explaining(prompt, context, params)
    } else {
      result = await this.remoteInferencer.code_explaining(prompt, context, params)
    }
    if (result && params.terminal_output) this.call('terminal', 'log', { type: 'aitypewriterwarning', value: result })
    return result
  }

  async error_explaining(prompt: string, params: IParams=GenerationParams): Promise<any> {
    this.emit('errorExplainRequested')
    let localFilesImports = ""

    // Get local imports from the workspace restrict to 5 most relevant files
    const relevantFiles = this.workspaceAgent.getRelevantLocalFiles(prompt, 5);

    for (const file in relevantFiles) {
      localFilesImports += `\n\nFileName: ${file}\n\n${relevantFiles[file]}`
    }
    localFilesImports = localFilesImports + "\n End of local files imports.\n\n"
    prompt = localFilesImports ? `Using the following local imports: ${localFilesImports}\n\n` + prompt : prompt
    const result = await this.remoteInferencer.error_explaining(prompt, params)
    if (result && params.terminal_output) this.call('terminal', 'log', { type: 'aitypewriterwarning', value: result })
    return result
  }

  async vulnerability_check(prompt: string, params: IParams=GenerationParams): Promise<any> {
    this.emit('vulnerabilityCheckRequested')
    const result = await this.remoteInferencer.vulnerability_check(prompt, params)
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
    params.provider = 'anthropic' // enforce all generation to be only on anthropic
    params.model = 'claude-haiku-4-5'
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
          console.log('Invalid response from RAG context API:', response.data)
        }
      } catch (error) {
        console.log('RAG context error:', error)
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
          console.log('Invalid response from RAG context API:', response.data)
        }
      } catch (error) {
        console.log('RAG context error:', error)
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
    if (this.completionAgent.indexer == null || this.completionAgent.indexer == undefined) await this.completionAgent.indexWorkspace()

    params.provider = 'mistralai' // default provider for code completion
    const currentFileName = await this.call('fileManager', 'getCurrentFile')
    const contextfiles = await this.completionAgent.getContextFiles(msg_pfx)
    return await this.remoteInferencer.code_insertion( msg_pfx, msg_sfx, contextfiles, currentFileName, params)
  }

  chatPipe(fn, prompt: string, context?: string, pipeMessage?: string){
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
        else console.log("chatRequestBuffer function name not recognized.")
      }
    }
    else {
      console.log("chatRequestBuffer is not empty. First process the last request.", this.chatRequestBuffer)
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
      console.log("chatRequestBuffer is empty.")
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
    // Fallback: default model + ollama
    return [getDefaultModel().id, 'ollama']
  }

  async getOllamaModels(): Promise<string[]> {
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

    if (!this.mcpServers || this.mcpServers.length === 0) {
      return;
    }

    if (!this.mcpInferencer) {
      this.mcpInferencer = new MCPInferencer(this.mcpServers, undefined, undefined, this.remixMCPServer, this.remoteInferencer);
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
  }

  async disableMCPEnhancement(): Promise<void> {
    this.mcpEnabled = false;
    this.emit('mcpDisabled')
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

  cancelRequest(): void {
    if (this.deepAgentEnabled && this.deepAgentInferencer) {
      this.deepAgentManager.cancelRequest()
    } else if (this.mcpEnabled && this.mcpInferencer) {
      this.mcpInferencer.cancelRequest()
    } else if (this.remoteInferencer) {
      (this.remoteInferencer as RemoteInferencer).cancelRequest()
    }
  }

  async generateDAppContent(params: {
    messages: any[];
    systemPrompt: string;
    hasImage?: boolean;
    isUpdate?: boolean;
    hasFigma?: boolean;
  }): Promise<string> {
    return this.dappManager.generateDAppContent(params)
  }

  async fetchFigmaDesign(params: {
    figmaUrl: string;
    figmaToken: string;
  }): Promise<{ success: boolean; fileName?: string; rawJson?: string; fileKey?: string; message?: string }> {
    return this.dappManager.fetchFigmaDesign(params)
  }

  async generateDAppFromFigma(params: {
    figmaUrl: string;
    figmaToken: string;
    description?: string;
    systemPrompt: string;
    isBaseMiniApp?: boolean;
  }): Promise<string> {
    return this.dappManager.generateDAppFromFigma(params)
  }

  private async refreshMCPServersOnAuthChange(authState: any): Promise<void> {
    return this.mcpManager.refreshOnAuthChange(authState)
  }

  private async checkMCPAccess(): Promise<{ hasBasicMcp: boolean; isBetaUser: boolean }> {
    return this.permissionChecker.checkMCPAccess()
  }

  private waitForMCPServersReady(timeout: number = 30000): Promise<void> {
    return this.mcpManager.waitForServersReady(timeout)
  }

  private async resetMCPServersToDefault(): Promise<void> {
    return this.mcpManager.resetToDefaultWithReinit()
  }
}
