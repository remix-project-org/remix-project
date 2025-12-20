import * as packageJson from '../../../../../package.json'
import { Plugin } from '@remixproject/engine';
import { trackMatomoEvent } from '@remix-api'
import { RemoteInferencer, IRemoteModel, IParams, GenerationParams, AssistantParams, CodeExplainAgent, SecurityAgent, CompletionParams, OllamaInferencer, isOllamaAvailable, getBestAvailableModel } from '@remix/remix-ai-core';
import { CodeCompletionAgent, ContractAgent, workspaceAgent, IContextType, mcpDefaultServersConfig } from '@remix/remix-ai-core';
import { MCPInferencer } from '@remix/remix-ai-core';
import { IMCPServer, IMCPConnectionStatus } from '@remix/remix-ai-core';
import { RemixMCPServer, createRemixMCPServer } from '@remix/remix-ai-core';
import axios from 'axios';
import { endpointUrls } from "@remix-endpoints-helper"
import { QueryParams } from '@remix-project/remix-lib'

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
    'getAssistantThrId', 'getAssistantProvider', 'setAssistantProvider', 'setModel',
    'addMCPServer', 'removeMCPServer', 'getMCPConnectionStatus', 'getMCPResources', 'getMCPTools', 'executeMCPTool',
    'enableMCPEnhancement', 'disableMCPEnhancement', 'isMCPEnabled', 'getIMCPServers',
    'loadMCPServersFromSettings', 'clearCaches'
  ],
  events: [],
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
  remoteInferencer:RemoteInferencer = null
  isInferencing: boolean = false
  chatRequestBuffer: chatRequestBufferT<any> = null
  codeExpAgent: CodeExplainAgent
  securityAgent: SecurityAgent
  contractor: ContractAgent
  workspaceAgent: workspaceAgent
  assistantProvider: string = 'mistralai' // default provider
  assistantThreadId: string = ''
  useRemoteInferencer:boolean = true
  completionAgent: CodeCompletionAgent
  mcpServers: IMCPServer[] = []
  mcpInferencer: MCPInferencer | null = null
  mcpEnabled: boolean = false
  remixMCPServer: RemixMCPServer | null = null

  constructor() {
    super(profile)
  }

  onActivation(): void {
    this.initialize()
    this.completionAgent = new CodeCompletionAgent(this)
    this.securityAgent = new SecurityAgent(this)
    this.codeExpAgent = new CodeExplainAgent(this)
    this.contractor = ContractAgent.getInstance(this)
    this.workspaceAgent = workspaceAgent.getInstance(this)

    // Load MCP servers from settings
    this.loadMCPServersFromSettings();
  }

  async initialize(remoteModel?:IRemoteModel){
    this.remoteInferencer = new RemoteInferencer(remoteModel?.apiUrl, remoteModel?.completionUrl)
    this.remoteInferencer.event.on('onInference', () => {
      this.isInferencing = true
    })
    this.remoteInferencer.event.on('onInferenceDone', () => {
      this.isInferencing = false
    })

    this.setAssistantProvider(this.assistantProvider) // propagate the provider to the remote inferencer
    this.aiIsActivated = true

    this.on('blockchain', 'transactionExecuted', async () => {
      this.clearCaches()
    })
    this.on('web3Provider', 'transactionBroadcasted', (txhash) => {
      this.clearCaches()
    });

    (window as any).getRemixAIPlugin = this

    // initialize the remix MCP server
    const qp = new QueryParams()
    const hasFlag = qp.exists('experimental')
    if (hasFlag) {
      this.remixMCPServer = await createRemixMCPServer(this)
    }

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
    if (this.mcpEnabled && this.mcpInferencer){
      return this.mcpInferencer.code_generation(prompt, params)
    } else {
      return await this.remoteInferencer.code_generation(prompt, params)
    }
  }

  async code_completion(prompt: string, promptAfter: string, params:IParams=CompletionParams): Promise<any> {
    if (this.completionAgent.indexer == null || this.completionAgent.indexer == undefined) await this.completionAgent.indexWorkspace()
    params.provider = 'mistralai' // default provider for code completion
    const currentFileName = await this.call('fileManager', 'getCurrentFile')
    const contextfiles = await this.completionAgent.getContextFiles(prompt)
    return await this.remoteInferencer.code_completion(prompt, promptAfter, contextfiles, currentFileName, params)
  }

  async answer(prompt: string, params: IParams=GenerationParams): Promise<any> {

    let newPrompt = await this.codeExpAgent.chatCommand(prompt)
    // add workspace context
    newPrompt = !this.workspaceAgent.ctxFiles ? newPrompt : "Using the following context: ```\n" + this.workspaceAgent.ctxFiles + "```\n\n" + newPrompt

    let result
    if (this.mcpEnabled && this.mcpInferencer){
      return this.mcpInferencer.answer(prompt, params)
    } else {
      result = await this.remoteInferencer.answer(newPrompt)
    }
    if (result && params.terminal_output) this.call('terminal', 'log', { type: 'aitypewriterwarning', value: result })
    return result
  }

  async code_explaining(prompt: string, context: string, params: IParams=GenerationParams): Promise<any> {
    let result
    if (this.mcpEnabled && this.mcpInferencer){
      return this.mcpInferencer.code_explaining(prompt, context, params)
    } else {
      result = await this.remoteInferencer.code_explaining(prompt, context, params)
    }
    if (result && params.terminal_output) this.call('terminal', 'log', { type: 'aitypewriterwarning', value: result })
    return result
  }

  async error_explaining(prompt: string, params: IParams=GenerationParams): Promise<any> {
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
    useRag = false
    trackMatomoEvent(this, { category: 'ai', action: 'GenerateNewAIWorkspace', name: 'GenerateNewAIWorkspace', isClick: false })
    let userPrompt = ''

    if (useRag) {
      statusCallback?.('Fetching RAG context...')
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
    await statusCallback?.('Generating new workspace with AI...\nThis might take some minutes. Please be patient!')
    const result = await this.remoteInferencer.generate(userPrompt, params)

    await statusCallback?.('Creating contracts and files...')
    const genResult = await this.contractor.writeContracts(result, userPrompt, statusCallback)

    // revert provider
    this.setAssistantProvider(await this.getAssistantProvider())
    if (genResult.includes('No payload')) return genResult
    await this.call('menuicons', 'select', 'filePanel')
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
    params.provider = this.assistantProvider
    useRag = false
    trackMatomoEvent(this, { category: 'ai', action: 'GenerateNewAIWorkspace', name: 'WorkspaceAgentEdit', isClick: false })

    await statusCallback?.('Performing workspace request...')
    if (useRag) {
      await statusCallback?.('Fetching RAG context...')
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
    await statusCallback?.('Loading workspace context...')
    const files = !this.workspaceAgent.ctxFiles ? await this.workspaceAgent.getCurrentWorkspaceFiles() : this.workspaceAgent.ctxFiles
    userPrompt = "Using the following workspace context: ```\n" + files + "```\n\n" + userPrompt

    await statusCallback?.('Generating workspace updates with AI...')
    const result = await this.remoteInferencer.generateWorkspace(userPrompt, params)

    await statusCallback?.('Applying changes to workspace...')
    return (result !== undefined) ? this.workspaceAgent.writeGenerationResults(result, statusCallback) : "### No Changes applied!"
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
    trackMatomoEvent(this, { category: 'ai', action: 'chatting', name: 'remixAI_chat', isClick: false })
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
    return this.assistantProvider
  }

  async setAssistantProvider(provider: string) {
    if (provider === 'openai' || provider === 'mistralai' || provider === 'anthropic') {
      GenerationParams.provider = provider
      CompletionParams.provider = provider
      AssistantParams.provider = provider

      if (this.assistantProvider !== provider){
        // clear the threadDds
        this.assistantThreadId = ''
        GenerationParams.threadId = ''
        CompletionParams.threadId = ''
        AssistantParams.threadId = ''
      }
      this.assistantProvider = provider

      // Switch back to remote inferencer for cloud providers -- important
      if (this.remoteInferencer && this.remoteInferencer instanceof OllamaInferencer) {
        this.remoteInferencer = new RemoteInferencer()
        this.remoteInferencer.event.on('onInference', () => {
          this.isInferencing = true
        })
        this.remoteInferencer.event.on('onInferenceDone', () => {
          this.isInferencing = false
        })
      }
    } else if (provider === 'ollama') {
      const isAvailable = await isOllamaAvailable();
      if (!isAvailable) {
        return
      }

      const bestModel = await getBestAvailableModel();
      if (!bestModel) {
        return
      }

      // Switch to Ollama inferencer
      this.remoteInferencer = new OllamaInferencer(bestModel);
      this.remoteInferencer.event.on('onInference', () => {
        this.isInferencing = true
      })
      this.remoteInferencer.event.on('onInferenceDone', () => {
        this.isInferencing = false
      })

      if (this.assistantProvider !== provider){
        // clear the threadIds
        this.assistantThreadId = ''
        GenerationParams.threadId = ''
        CompletionParams.threadId = ''
        AssistantParams.threadId = ''
      }
      this.assistantProvider = provider
    } else {
      console.error(`Unknown assistant provider: ${provider}`)
    }

    // If MCP is enabled, update it to use the new Ollama inferencer
    if (this.mcpEnabled) {
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

  async setModel(modelName: string) {
    if (this.assistantProvider === 'ollama' && this.remoteInferencer instanceof OllamaInferencer) {
      try {
        const isAvailable = await isOllamaAvailable();
        if (!isAvailable) {
          console.error('Ollama is not available. Please ensure Ollama is running.')
          return
        }

        this.remoteInferencer = new OllamaInferencer(modelName);
        this.remoteInferencer.event.on('onInference', () => {
          this.isInferencing = true
        })
        this.remoteInferencer.event.on('onInferenceDone', () => {
          this.isInferencing = false
        })

      } catch (error) {
        console.error('Failed to set Ollama model:', error)
      }
    } else {
      console.warn(`setModel is only supported for Ollama provider. Current provider: ${this.assistantProvider}`)
    }
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
      // Add to local configuration
      this.mcpServers.push(server);

      // If MCP inferencer is active, add the server dynamically
      if (this.mcpInferencer) {
        await this.mcpInferencer.addMCPServer(server);
      }

      // Persist configuration
      await this.call('settings', 'set', 'settings/mcp/servers', JSON.stringify(this.mcpServers));
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

      await this.call('settings', 'set', 'settings/mcp/servers', JSON.stringify(this.mcpServers));
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

  async loadMCPServersFromSettings(): Promise<void> {
    try {
      const savedServers = await this.call('settings', 'get', 'settings/mcp/servers');
      if (savedServers) {
        const loadedServers = JSON.parse(savedServers);
        // Get built-in servers from config file
        const builtInServers: IMCPServer[] = mcpDefaultServersConfig.defaultServers.filter(s => s.isBuiltIn);

        // Add built-in servers if they don't exist, or ensure they're enabled if they do
        for (const builtInServer of builtInServers) {
          const existingServer = loadedServers.find(s => s.name === builtInServer.name);
          if (!existingServer) {
            loadedServers.push(builtInServer);
          } else if (!existingServer.enabled || !existingServer.isBuiltIn) {
            // Force enable and mark as built-in
            existingServer.enabled = true;
            existingServer.isBuiltIn = true;
          }
        }

        this.mcpServers = loadedServers;
        const originalServers = JSON.parse(savedServers);
        const serversChanged = loadedServers.length !== originalServers.length ||
                               loadedServers.some(server => {
                                 const original = originalServers.find(s => s.name === server.name);
                                 return !original || (server.isBuiltIn && (!original.enabled || !original.isBuiltIn));
                               });

        if (serversChanged) {
          await this.call('settings', 'set', 'settings/mcp/servers', JSON.stringify(loadedServers));
        }
      } else {
        // Initialize with default MCP servers from config file
        const defaultServers: IMCPServer[] = mcpDefaultServersConfig.defaultServers;
        this.mcpServers = defaultServers;
        // Save default servers to settings
        await this.call('settings', 'set', 'settings/mcp/servers', JSON.stringify(defaultServers));
      }

      // Initialize MCP inferencer if we have servers and it's not already initialized
      if (this.mcpServers.length > 0 && !this.mcpInferencer && this.remixMCPServer && this.mcpEnabled) {
        this.mcpInferencer = new MCPInferencer(this.mcpServers, undefined, undefined, this.remixMCPServer, this.remoteInferencer);
        this.mcpInferencer.event.on('mcpServerConnected', (serverName: string) => {
        });
        this.mcpInferencer.event.on('mcpServerError', (serverName: string, error: Error) => {
          console.error(`[RemixAI Plugin] MCP server error (${serverName}):`, error);
        });

        // Connect to enabled servers for status tracking
        const enabledServers = this.mcpServers.filter((s: IMCPServer) => s.enabled);
        if (enabledServers.length > 0) {
          await this.mcpInferencer.connectAllServers();
          this.emit('mcpServersLoaded');
        }
      }
    } catch (error) {
      this.mcpServers = [];
    }
  }

  async enableMCPEnhancement(): Promise<void> {
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

    this.mcpEnabled = true;
  }

  async disableMCPEnhancement(): Promise<void> {
    this.mcpEnabled = false;
  }

  isMCPEnabled(): boolean {
    return this.mcpEnabled;
  }

  getIMCPServers(): IMCPServer[] {
    return this.mcpServers;
  }

  clearCaches(){
    if (this.mcpInferencer){
      this.mcpInferencer.resetResourceCache()
    }
  }
}
