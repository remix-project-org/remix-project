import * as packageJson from '../../../../../package.json'
import { Plugin } from '@remixproject/engine';
import { trackMatomoEvent } from '@remix-api'
import { RemoteInferencer, IRemoteModel, IParams, GenerationParams, AssistantParams, CodeExplainAgent, SecurityAgent, CompletionParams, OllamaInferencer, isOllamaAvailable, getBestAvailableModel, listModels } from '@remix/remix-ai-core';
import { CodeCompletionAgent, ContractAgent, workspaceAgent, IContextType, mcpDefaultServersConfig, mcpBasicServersConfig } from '@remix/remix-ai-core';
import { MCPInferencer, DeepAgentInferencer } from '@remix/remix-ai-core';
import { IMCPServer, IMCPConnectionStatus } from '@remix/remix-ai-core';
import { RemixMCPServer, createRemixMCPServer } from '@remix/remix-ai-core';
import { AIModel, getDefaultModel, getModelById } from '@remix/remix-ai-core';
import axios from 'axios';
import { endpointUrls } from "@remix-endpoints-helper"

type chatRequestBufferT<T> = {
  [key in keyof T]: T[key]
}

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
    'clearCaches', 'cancelRequest'
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
  chatRequestBuffer: chatRequestBufferT<any> = null
  codeExpAgent: CodeExplainAgent
  securityAgent: SecurityAgent
  contractor: ContractAgent
  workspaceAgent: workspaceAgent
  selectedModel: AIModel = getDefaultModel() // default model
  selectedModelId: string = getDefaultModel().id
  assistantThreadId: string = ''
  useRemoteInferencer:boolean = true
  completionAgent: CodeCompletionAgent
  mcpServers: IMCPServer[] = []
  mcpInferencer: MCPInferencer | null = null
  mcpEnabled: boolean = false
  remixMCPServer: RemixMCPServer | null = null
  deepAgentInferencer: DeepAgentInferencer | null = null
  deepAgentEnabled: boolean = false
  private deepAgentEventListenersSetup: boolean = false
  private pendingDeepAgentThreadId: string | null = null

  constructor() {
    super(profile)
  }

  private setupDeepAgentEventListeners() {
    if (!this.deepAgentInferencer || this.deepAgentEventListenersSetup) {
      return
    }

    const eventEmitter = this.deepAgentInferencer.getEventEmitter()

    // Remove all existing listeners first to prevent duplicates
    eventEmitter.removeAllListeners('onInference')
    eventEmitter.removeAllListeners('onInferenceDone')
    eventEmitter.removeAllListeners('onStreamResult')
    eventEmitter.removeAllListeners('onStreamComplete')
    eventEmitter.removeAllListeners('onToolCall')
    eventEmitter.removeAllListeners('onSubagentStart')
    eventEmitter.removeAllListeners('onSubagentComplete')
    eventEmitter.removeAllListeners('onTaskStart')
    eventEmitter.removeAllListeners('onTaskComplete')
    eventEmitter.removeAllListeners('onToolApprovalRequired')

    // Set up fresh listeners
    eventEmitter.on('onInference', () => {
      this.isInferencing = true
    })
    eventEmitter.on('onInferenceDone', () => {
      this.isInferencing = false
    })
    eventEmitter.on('onStreamResult', (data: string | { content: string; isIntermediate: boolean; source?: string }) => {
      this.emit('onStreamResult', data)
    })
    eventEmitter.on('onStreamComplete', (finalText: string) => {
      this.emit('onStreamComplete', finalText)
    })
    eventEmitter.on('onToolCall', (data: { toolName: string; toolInput?: any; toolOutput?: any; status: 'start' | 'end' }) => {
      this.emit('onToolCall', data)
    })
    eventEmitter.on('onSubagentStart', (data: { id: string; name: string; task: string; status: string }) => {
      this.emit('onSubagentStart', data)
    })
    eventEmitter.on('onSubagentComplete', (data: { id: string; name: string; status: string; duration: number }) => {
      this.emit('onSubagentComplete', data)
    })
    eventEmitter.on('onTaskStart', (data: { id: string; name: string; status: string }) => {
      this.emit('onTaskStart', data)
    })
    eventEmitter.on('onTaskComplete', (data: { id: string; name: string; status: string }) => {
      this.emit('onTaskComplete', data)
    })

    // Human-in-the-loop: relay approval requests to UI
    eventEmitter.on('onToolApprovalRequired', (request: any) => {

      this.emit('onToolApprovalRequired', request)
    })

    this.deepAgentEventListenersSetup = true
    console.log('[RemixAI Plugin] DeepAgent event listeners set up')
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

  async onActivation(): Promise<void> {
    // check access
    const { hasBasicMcp, isBetaUser } = await this.checkMCPAccess()

    // IMPORTANT: Must await initialize() before loading MCP servers
    // to ensure remixMCPServer is created first (race condition fix)
    await this.initialize()
    this.completionAgent = new CodeCompletionAgent(this)
    this.securityAgent = new SecurityAgent(this)
    this.codeExpAgent = new CodeExplainAgent(this)
    this.contractor = ContractAgent.getInstance(this)
    this.workspaceAgent = workspaceAgent.getInstance(this)

    // Switch to claude-sonnet-4-6 for beta users
    if (isBetaUser) {
      console.log('[RemixAI Plugin] Beta user detected, switching to claude-sonnet-4-6')
      await this.setModel('claude-sonnet-4-6')
    }

    // Initialize MCP servers with defaults (after initialize() completes)
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

    // Initialize DeepAgent if enabled (API key handled by proxy server)
    const deepAgentEnabled = true // localStorage.getItem('deepagent_enabled') === 'true'
    console.log('[RemixAI Plugin] DeepAgent enabled in localStorage:', deepAgentEnabled);

    if (deepAgentEnabled && this.remixMCPServer) {
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
        this.deepAgentEnabled = true

        // Set up DeepAgent event listeners for streaming (once only)
        this.setupDeepAgentEventListeners()

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

    // Always initialize with default model on page reload
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
    const providerToModelMap: Record<string, string> = {
      'openai': 'gpt-4-turbo',
      'mistralai': 'mistral-medium-latest',
      'anthropic': 'claude-sonnet-4-5',
      'ollama': 'ollama'
    }
    const modelId = providerToModelMap[provider] || getDefaultModel().id
    await this.setModel(modelId)
  }

  async setModel(modelId: string) {
    let model = getModelById(modelId)
    if (!model) {
      model = getDefaultModel()
      modelId = model.id
    }

    // Store previous model for comparison
    const previousModelId = this.selectedModelId

    this.selectedModelId = modelId
    this.selectedModel = model

    // Update inference parameters
    GenerationParams.provider = model.provider
    GenerationParams.model = modelId
    CompletionParams.provider = model.provider
    CompletionParams.model = modelId
    AssistantParams.provider = model.provider
    AssistantParams.model = modelId

    // Clear thread IDs when switching models
    if (previousModelId !== modelId) {
      this.assistantThreadId = ''
      GenerationParams.threadId = ''
      CompletionParams.threadId = ''
      AssistantParams.threadId = ''
    }

    // Switch inferencer based on provider
    if (model.provider === 'ollama') {
      // Ollama requires sub-model selection, use best available for now
      const isAvailable = await isOllamaAvailable();
      if (!isAvailable) {
        console.error('Ollama is not available. Please ensure Ollama is running. Falling back to default model.')
        const defaultModel = getDefaultModel()
        model = defaultModel
        modelId = defaultModel.id
        this.selectedModelId = modelId
        this.selectedModel = model
        GenerationParams.provider = model.provider
        GenerationParams.model = modelId
        CompletionParams.provider = model.provider
        CompletionParams.model = modelId
        AssistantParams.provider = model.provider
        AssistantParams.model = modelId
      } else {
        const bestModel = await getBestAvailableModel();
        if (!bestModel) {
          console.error('No Ollama models available. Falling back to default model.')
          // Fall back to default model
          const defaultModel = getDefaultModel()
          model = defaultModel
          modelId = defaultModel.id
          this.selectedModelId = modelId
          this.selectedModel = model
          GenerationParams.provider = model.provider
          GenerationParams.model = modelId
          CompletionParams.provider = model.provider
          CompletionParams.model = modelId
          AssistantParams.provider = model.provider
          AssistantParams.model = modelId
        } else {
          // Switch to Ollama inferencer
          this.remoteInferencer = new OllamaInferencer(bestModel);
          this.remoteInferencer.event.on('onInference', () => {
            this.isInferencing = true
          })
          this.remoteInferencer.event.on('onInferenceDone', () => {
            this.isInferencing = false
          })
        }
      }
    }

    // Update MCP inferencer if enabled
    if (this.mcpEnabled) {
      this.mcpInferencer = new MCPInferencer(this.mcpServers, undefined, undefined, this.remixMCPServer, this.remoteInferencer);
      this.mcpInferencer.event.on('mcpServerConnected', (serverName: string) => {
        // Handle server connected
      })
      this.mcpInferencer.event.on('mcpServerError', (serverName: string, error: Error) => {
        // Handle server error
      })
      this.mcpInferencer.event.on('onInference', () => {
        this.isInferencing = true
      })
      this.mcpInferencer.event.on('onInferenceDone', () => {
        this.isInferencing = false
      })
      await this.mcpInferencer.connectAllServers();
    }

    // Reinitialize DeepAgent if enabled and model changed
    if (this.deepAgentEnabled && this.deepAgentInferencer && this.remixMCPServer && previousModelId !== modelId) {
      console.log('[RemixAI Plugin] Model changed, reinitializing DeepAgent with new model:', model.provider, modelId);
      try {
        // Clean up old instance
        const eventEmitter = this.deepAgentInferencer.getEventEmitter();
        eventEmitter.removeAllListeners();
        await this.deepAgentInferencer.close();

        // Create new instance with updated model
        this.deepAgentInferencer = new DeepAgentInferencer(
          this,
          this.remixMCPServer.tools,
          {
            memoryBackend: (localStorage.getItem('deepagent_memory_backend') as 'state' | 'store') || 'store',
            enableSubagents: true,
            enablePlanning: true
          },
          this.remoteInferencer,
          this.mcpInferencer,
          { provider: model.provider as 'anthropic' | 'mistralai', modelId: modelId }
        );
        await this.deepAgentInferencer.initialize();

        // Reset and set up event listeners
        this.deepAgentEventListenersSetup = false;
        this.setupDeepAgentEventListeners();

        console.log('[RemixAI Plugin] DeepAgent reinitialized with new model successfully');

        // Apply pending thread_id after model switch reinitialization
        if (this.pendingDeepAgentThreadId) {
          this.deepAgentInferencer.setSessionThreadId(this.pendingDeepAgentThreadId)
          this.pendingDeepAgentThreadId = null
        }
      } catch (error) {
        console.error('[RemixAI Plugin] Failed to reinitialize DeepAgent on model change:', error);
        // Keep DeepAgent enabled but log the error
      }
    }

    // Emit event for UI updates
    this.emit('modelChanged', modelId)
  }

  async setOllamaModel(ollamaModelName: string) {
    // Special method for selecting specific Ollama model after "Ollama" is selected
    if (this.selectedModel.provider !== 'ollama') {
      console.warn('setOllamaModel should only be called when Ollama provider is selected')
      return
    }

    const isAvailable = await isOllamaAvailable();
    if (!isAvailable) {
      console.error('Ollama is not available. Please ensure Ollama is running.')
      return
    }

    this.remoteInferencer = new OllamaInferencer(ollamaModelName);
    this.remoteInferencer.event.on('onInference', () => {
      this.isInferencing = true
    })
    this.remoteInferencer.event.on('onInferenceDone', () => {
      this.isInferencing = false
    })

    // Update MCP if enabled
    if (this.mcpEnabled && this.mcpInferencer) {
      this.mcpInferencer = new MCPInferencer(this.mcpServers, undefined, undefined, this.remixMCPServer, this.remoteInferencer);
      await this.mcpInferencer.connectAllServers();
    }
  }

  async getModelAccess(): Promise<string[]> {
    try {
      const token = localStorage.getItem('remix_access_token')
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {}

      const response = await fetch(`${endpointUrls.sso}/accounts`, {
        credentials: 'include',
        headers
      })

      if (response.ok) {
        const data = await response.json()
        return data.allowed_models || []
      }
    } catch (err) {
      console.error('Failed to fetch model access:', err)
    }

    // Fallback: default model + ollama
    return [getDefaultModel().id, 'ollama']
  }

  async getOllamaModels(): Promise<string[]> {
    if (this.selectedModel.provider !== 'ollama') {
      throw new Error('Ollama is not the selected provider')
    }

    const available = await isOllamaAvailable()
    if (!available) {
      throw new Error('Ollama is not running')
    }

    const models = await listModels()
    return models
  }

  isChatRequestPending(){
    return this.chatRequestBuffer != null
  }

  resetChatRequestBuffer() {
    this.chatRequestBuffer = null
  }

  // MCP Server Management Methods
  async addMCPServer(server: IMCPServer): Promise<void> {
    try {
      this.mcpServers.push(server);

      // If MCP inferencer is active, add the server dynamically
      if (this.mcpInferencer) {
        await this.mcpInferencer.addMCPServer(server);
      }
    } catch (error) {
      console.error(`[RemixAI Plugin] Failed to add MCP server ${server.name}:`, error);
      throw error;
    }
  }

  async removeMCPServer(serverName: string): Promise<void> {
    try {
      const serverToRemove = this.mcpServers.find(s => s.name === serverName);
      if (serverToRemove?.isBuiltIn) {
        throw new Error(`Cannot remove built-in server: ${serverName}`);
      }
      this.mcpServers = this.mcpServers.filter(s => s.name !== serverName);

      // If MCP inferencer is active, remove the server dynamically
      if (this.mcpInferencer) {
        await this.mcpInferencer.removeMCPServer(serverName);
      }
    } catch (error) {
      console.error(`[RemixAI Plugin] Failed to remove MCP server ${serverName}:`, error);
      throw error;
    }
  }

  getMCPConnectionStatus(): IMCPConnectionStatus[] {
    if (this.mcpInferencer) {
      const statuses = this.mcpInferencer.getConnectionStatuses();
      return statuses;
    }

    const defaultStatuses = this.mcpServers.map(server => ({
      serverName: server.name,
      status: 'disconnected' as const,
      lastAttempt: Date.now()
    }));
    return defaultStatuses;
  }

  async getMCPResources(): Promise<Record<string, any[]>> {
    if (this.mcpInferencer) {
      const resources = await this.mcpInferencer.getAllResources();
      return resources;
    }
    return {};
  }

  async getMCPTools(): Promise<Record<string, any[]>> {
    if (this.mcpInferencer) {
      const tools = await this.mcpInferencer.getAllTools();
      return tools;
    }
    return {};
  }

  async executeMCPTool(serverName: string, toolName: string, arguments_: Record<string, any>): Promise<any> {
    if (this.mcpInferencer) {
      const result = await this.mcpInferencer.executeTool(serverName, { name: toolName, arguments: arguments_ });
      return result;
    }
    throw new Error('MCP provider not active');
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
    try {
      if (!this.remixMCPServer) {
        throw new Error('RemixMCPServer not initialized')
      }

      console.log('[RemixAI Plugin] Enabling DeepAgent (API key handled by proxy)...')

      // Ensure MCP servers are fully ready before creating DeepAgent
      if (this.mcpInferencer) {
        await this.waitForMCPServersReady();
      }

      // Create or reinitialize DeepAgentInferencer
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
        this.mcpInferencer,
        { provider: this.selectedModel.provider as 'anthropic' | 'mistralai', modelId: this.selectedModelId }
      )

      await this.deepAgentInferencer.initialize()

      // Set up event listeners (centralized method prevents duplicates)
      this.deepAgentEventListenersSetup = false // Reset flag
      this.setupDeepAgentEventListeners()

      this.deepAgentEnabled = true

      // Store settings
      localStorage.setItem('deepagent_enabled', 'true')

      console.log('[RemixAI Plugin] DeepAgent enabled successfully')

      // Apply pending thread_id if setDeepAgentThread was called before init completed
      if (this.pendingDeepAgentThreadId) {
        this.deepAgentInferencer.setSessionThreadId(this.pendingDeepAgentThreadId)
        this.pendingDeepAgentThreadId = null
      }
    } catch (error) {
      console.error('[RemixAI Plugin] Failed to enable DeepAgent:', error)
      this.deepAgentEnabled = false
      this.deepAgentInferencer = null
      throw error
    }
  }

  async disableDeepAgent(): Promise<void> {
    console.log('[RemixAI Plugin] Disabling DeepAgent...')

    if (this.deepAgentInferencer) {
      // Remove all event listeners before closing
      const eventEmitter = this.deepAgentInferencer.getEventEmitter()
      eventEmitter.removeAllListeners()

      await this.deepAgentInferencer.close()
    }

    this.deepAgentEnabled = false
    this.deepAgentInferencer = null
    this.deepAgentEventListenersSetup = false

    // Store settings
    localStorage.setItem('deepagent_enabled', 'false')

    console.log('[RemixAI Plugin] DeepAgent disabled')
  }

  isDeepAgentEnabled(): boolean {
    return this.deepAgentEnabled
  }

  /**
   * Set DeepAgent thread for an existing conversation.
   * Uses conversationId as part of thread_id so MemorySaver restores that conversation's context.
   * If DeepAgent is not yet initialized, stores the thread_id for later application.
   */
  setDeepAgentThread(conversationId: string): void {
    const threadId = `remix-conv-${conversationId}`
    if (this.deepAgentInferencer) {
      this.deepAgentInferencer.setSessionThreadId(threadId)
      this.pendingDeepAgentThreadId = null
      console.log('[DeepAgent-Thread] Plugin: thread set for conversation:', conversationId, '→', threadId)
    } else {
      // DeepAgent not yet initialized — store for later
      this.pendingDeepAgentThreadId = threadId
      console.log('[DeepAgent-Thread] Plugin: thread PENDING (DeepAgent not ready):', conversationId, '→', threadId)
    }
  }

  respondToToolApproval(response: { requestId: string; approved: boolean; modifiedArgs?: Record<string, any> }): void {

    if (this.deepAgentInferencer) {
      this.deepAgentInferencer.getEventEmitter().emit('onToolApprovalResponse', response)
    }
  }

  clearCaches(){
    if (this.mcpInferencer){
      this.mcpInferencer.resetResourceCache()
    }
  }

  cancelRequest(): void {
    if (this.deepAgentEnabled && this.deepAgentInferencer) {
      this.deepAgentInferencer.cancelRequest()
    } else if (this.mcpEnabled && this.mcpInferencer) {
      this.mcpInferencer.cancelRequest()
    } else if (this.remoteInferencer) {
      (this.remoteInferencer as RemoteInferencer).cancelRequest()
    }
  }

  private async refreshMCPServersOnAuthChange(authState: any): Promise<void> {
    try {
      const isAuthenticated = authState?.isAuthenticated || false;

      if (!isAuthenticated) { // logged out or no user
        console.log('[RemixAI Plugin] User logged out, resetting to default model and MCP servers');
        const defaultModel = getDefaultModel();
        await this.setModel(defaultModel.id);
        await this.resetMCPServersToDefault();
        return;
      }

      const { hasBasicMcp, isBetaUser } = await this.checkMCPAccess();

      // Switch to claude-sonnet-4-6 for beta users
      if (isBetaUser) {
        console.log('[RemixAI Plugin] Beta user logged in, switching to claude-sonnet-4-6');
        await this.setModel('claude-sonnet-4-6');
      } else {
        const defaultModel = getDefaultModel();
        console.log(`[RemixAI Plugin] Non-beta user logged in, using default model: ${defaultModel.id}`);
        await this.setModel(defaultModel.id);
      }

      const newServerList = [
        ...mcpDefaultServersConfig.defaultServers,
        ...(hasBasicMcp ? mcpBasicServersConfig.defaultServers : [])
      ];
      const currentServerNames = this.mcpServers.map(s => s.name).sort().join(',');
      const newServerNames = newServerList.map(s => s.name).sort().join(',');

      if (currentServerNames !== newServerNames) {
        this.mcpServers = newServerList;

        if (this.remixMCPServer) {
          if (this.mcpInferencer) {
            for (const server of this.mcpServers) {
              try {
                await this.mcpInferencer.removeMCPServer(server.name);
              } catch (err) {
              }
            }
          }

          this.mcpInferencer = new MCPInferencer(
            this.mcpServers,
            undefined,
            undefined,
            this.remixMCPServer,
            this.remoteInferencer
          );

          this.mcpInferencer.event.on('mcpServerConnected', (serverName: string) => {
            console.log(`[RemixAI Plugin] MCP server connected: ${serverName}`);
          });
          this.mcpInferencer.event.on('mcpServerError', (serverName: string, error: Error) => {
            console.error(`[RemixAI Plugin] MCP server error (${serverName}):`, error);
          });

          const enabledServers = this.mcpServers.filter((s: IMCPServer) => s.enabled);
          if (enabledServers.length > 0) {
            const waitPromise = this.waitForMCPServersReady();
            await this.mcpInferencer.connectAllServers();
            await waitPromise;
            this.emit('mcpServersLoaded');
            console.log('[RemixAI Plugin] MCP servers refreshed and connected');
          }
        }
      } else {
      }
    } catch (error) {
      console.error('[RemixAI Plugin] Failed to refresh MCP servers on auth change:', error);
    }
  }

  private async checkMCPAccess(): Promise<{ hasBasicMcp: boolean; isBetaUser: boolean }> {
    try {
      const token = localStorage.getItem('remix_access_token');
      if (!token) return { hasBasicMcp: false, isBetaUser: false };

      const headers = { 'Authorization': `Bearer ${token}` };
      const response = await fetch(`${endpointUrls.permissions}`, {
        credentials: 'include',
        headers
      });

      if (response.ok) {
        const data = await response.json();

        const hasBasicMcp = data.features?.['mcp:basicExternal']?.is_enabled || false;
        const isBetaUser = data.feature_groups?.some((group: any) => group.name === 'beta') || false;

        return { hasBasicMcp, isBetaUser };
      }
      return { hasBasicMcp: false, isBetaUser: false };
    } catch (error) {
      console.error('[RemixAI Plugin] Failed to check MCP access:', error);
      return { hasBasicMcp: false, isBetaUser: false };
    }
  }

  /**
   * Waits for all enabled MCP servers to emit their connection events (connected or errored).
   * This ensures all external MCP tools are available before DeepAgentInferencer is instantiated.
   */
  private waitForMCPServersReady(timeout: number = 30000): Promise<void> {
    const mcpInferencer = this.mcpInferencer;
    if (!mcpInferencer) return Promise.resolve();

    const enabledServers = this.mcpServers.filter(s => s.enabled);
    if (enabledServers.length === 0) return Promise.resolve();

    // Track which servers we're waiting for (excluding Remix IDE Server which is internal)
    const serversToWaitFor = enabledServers.filter(s => s.name !== 'Remix IDE Server');
    if (serversToWaitFor.length === 0) return Promise.resolve();

    console.log(`[RemixAI Plugin] Waiting for ${serversToWaitFor.length} external MCP servers to connect:`, serversToWaitFor.map(s => s.name));

    return new Promise<void>((resolve) => {
      const connectedServers = new Set<string>();
      const erroredServers = new Set<string>();

      const checkComplete = () => {
        const totalResolved = connectedServers.size + erroredServers.size;
        console.log(`[RemixAI Plugin] MCP servers progress: ${totalResolved}/${serversToWaitFor.length} (${connectedServers.size} connected, ${erroredServers.size} errored)`);

        if (totalResolved >= serversToWaitFor.length) {
          console.log(`[RemixAI Plugin] All ${serversToWaitFor.length} external MCP servers resolved`);
          cleanup();
          resolve();
        }
      };

      const onConnected = (serverName: string) => {
        if (serversToWaitFor.some(s => s.name === serverName)) {
          connectedServers.add(serverName);
          console.log(`[RemixAI Plugin] waitForMCPServersReady: "${serverName}" connected`);
          checkComplete();
        }
      };

      const onError = (serverName: string, _error: Error) => {
        if (serversToWaitFor.some(s => s.name === serverName)) {
          erroredServers.add(serverName);
          console.log(`[RemixAI Plugin] waitForMCPServersReady: "${serverName}" errored`);
          checkComplete();
        }
      };

      const cleanup = () => {
        mcpInferencer.event.off('mcpServerConnected', onConnected);
        mcpInferencer.event.off('mcpServerError', onError);
        clearTimeout(timeoutId);
      };

      const timeoutId = setTimeout(() => {
        const missing = serversToWaitFor
          .filter(s => !connectedServers.has(s.name) && !erroredServers.has(s.name))
          .map(s => s.name);
        console.warn(`[RemixAI Plugin] Timeout waiting for MCP servers. Missing: ${missing.join(', ')}`);
        cleanup();
        resolve();
      }, timeout);

      // Listen for connection events
      mcpInferencer.event.on('mcpServerConnected', onConnected);
      mcpInferencer.event.on('mcpServerError', onError);
    });
  }

  private async resetMCPServersToDefault(): Promise<void> {
    try {
      this.mcpServers = [...mcpDefaultServersConfig.defaultServers];

      if (this.remixMCPServer) {
        this.mcpInferencer = new MCPInferencer(
          this.mcpServers,
          undefined,
          undefined,
          this.remixMCPServer,
          this.remoteInferencer
        );

        this.mcpInferencer.event.on('mcpServerConnected', (serverName: string) => {
          console.log(`[RemixAI Plugin] MCP server connected: ${serverName}`);
        });
        this.mcpInferencer.event.on('mcpServerError', (serverName: string, error: Error) => {
          console.error(`[RemixAI Plugin] MCP server error (${serverName}):`, error);
        });

        const enabledServers = this.mcpServers.filter((s: IMCPServer) => s.enabled);
        if (enabledServers.length > 0) {
          const waitPromise = this.waitForMCPServersReady();
          await this.mcpInferencer.connectAllServers();
          await waitPromise;
          this.emit('mcpServersLoaded');
        }

        const deepAgentEnabled = localStorage.getItem('deepagent_enabled') === 'true'

        if (deepAgentEnabled && this.remixMCPServer) {
          try {
            console.log('[RemixAI Plugin] Reinitializing DeepAgent after MCP server reset...')

            // Clean up old instance first
            if (this.deepAgentInferencer) {
              const eventEmitter = this.deepAgentInferencer.getEventEmitter()
              eventEmitter.removeAllListeners()
              await this.deepAgentInferencer.close()
            }

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
              { provider: this.selectedModel.provider as 'anthropic' | 'mistralai', modelId: this.selectedModelId }
            )
            await this.deepAgentInferencer.initialize()
            this.deepAgentEnabled = true

            // Set up event listeners (reset flag first)
            this.deepAgentEventListenersSetup = false
            this.setupDeepAgentEventListeners()

            console.log('[RemixAI Plugin] DeepAgent reinitialized successfully')
          } catch (error) {
            console.error('[RemixAI Plugin] Failed to reinitialize DeepAgent:', error)
            this.deepAgentEnabled = false
            this.deepAgentInferencer = null
          }
        }
      }
    } catch (error) {
      console.error('[RemixAI Plugin] Failed to reset MCP servers to default:', error);
    }
  }
}
