/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { ICompletions, IGeneration, IParams, IAIStreamResponse } from "../../types/types";
import { GenerationParams } from "../../types/models";
import { RemoteInferencer } from "../remote/remoteInference";
import {
  IMCPServer,
  IMCPResource,
  IMCPResourceContent,
  IMCPTool,
  IMCPToolCall,
  IMCPToolResult,
  IMCPConnectionStatus,
  IMCPInitializeResult,
  IEnhancedMCPProviderParams
} from "../../types/mcp";
import { IntentAnalyzer } from "../../services/intentAnalyzer";
import { ResourceScoring } from "../../services/resourceScoring";
import { CodeExecutor } from "./codeExecutor";
import { ToolApiGenerator } from "./toolApiGenerator";
import { MCPClient } from "./mcpClient";
import { WeightedToolSelector, IChatMessage } from "../../services/weightedToolSelector";
import { buildChatPrompt } from "../../prompts/promptBuilder";
import { ChatHistory } from "../../prompts/chat";

// Helper function to track events using MatomoManager instance
function trackMatomoEvent(category: string, action: string, name: string) {
  try {
    if (typeof window !== 'undefined' && (window as any)._matomoManagerInstance) {
      const matomoInstance = (window as any)._matomoManagerInstance;
      if (typeof matomoInstance.trackEvent === 'function') {
        matomoInstance.trackEvent(category, action, name);
      }
    }
  } catch (error) {
    // Silent fail for tracking
    console.debug('Matomo tracking failed:', error);
  }
}

/**
 * MCPInferencer extends RemoteInferencer to support Model Context Protocol
 * It manages MCP server connections and integrates MCP resources/tools with AI requests
 */
export class MCPInferencer extends RemoteInferencer implements ICompletions, IGeneration {
  private mcpClients: Map<string, MCPClient> = new Map();
  private connectionStatuses: Map<string, IMCPConnectionStatus> = new Map();
  private resourceCache: Map<string, IMCPResourceContent> = new Map();
  private toolsCache: Map<string, IMCPTool[]> = new Map();
  private intentAnalyzer: IntentAnalyzer = new IntentAnalyzer();
  private resourceScoring: ResourceScoring = new ResourceScoring();
  private remixMCPServer?: any; // Internal RemixMCPServer instance
  private MAX_TOOL_EXECUTIONS = 10;
  private baseInferencer: RemoteInferencer; // The actual inferencer to use (could be Ollama or Remote)
  private toolSelector: WeightedToolSelector = new WeightedToolSelector();
  MAXTOOLS = 25

  constructor(servers: IMCPServer[] = [], apiUrl?: string, completionUrl?: string, remixMCPServer?: any, baseInferencer?: RemoteInferencer) {
    super(apiUrl, completionUrl);
    this.remixMCPServer = remixMCPServer;
    this.baseInferencer = baseInferencer;
    this.initializeMCPServers(servers);
  }

  private initializeMCPServers(servers: IMCPServer[]): void {
    for (const server of servers) {
      if (server.enabled !== false) {
        const client = new MCPClient(
          server,
          server.transport === 'internal' ? this.remixMCPServer : undefined
        );
        this.mcpClients.set(server.name, client);
        this.connectionStatuses.set(server.name, {
          status: 'disconnected',
          serverName: server.name
        });

        // Set up event listeners
        client.on('connected', async (serverName: string, result: IMCPInitializeResult) => {
          this.connectionStatuses.set(serverName, {
            status: 'connected',
            serverName,
            capabilities: result.capabilities
          });
          // Populate tools cache on connect
          try {
            const tools = await client.listTools();
            this.toolsCache.set(serverName, tools);
          } catch (error) {
            this.toolsCache.set(serverName, []);
          }
          this.event.emit('mcpServerConnected', serverName, result);
        });

        client.on('error', (serverName: string, error: Error) => {
          this.connectionStatuses.set(serverName, {
            status: 'error',
            serverName,
            error: error.message,
            lastAttempt: Date.now()
          });
          this.toolsCache.delete(serverName);
          this.event.emit('mcpServerError', serverName, error);
        });

        client.on('disconnected', (serverName: string) => {
          this.connectionStatuses.set(serverName, {
            status: 'disconnected',
            serverName
          });
          this.toolsCache.delete(serverName);
          this.event.emit('mcpServerDisconnected', serverName);
        });
      }
    }
  }

  cancelRequest(): void {
    this.baseInferencer?.cancelRequest()
  }

  async connectAllServers(): Promise<void> {
    const promises = Array.from(this.mcpClients.values()).map(async (client) => {
      try {
        await client.connect();
      } catch (error) {
        console.warn(`[MCP Inferencer] Failed to connect to MCP server ${client.getServerName()}:`, error);
      }
    });

    await Promise.allSettled(promises);
  }

  async disconnectAllServers(): Promise<void> {
    const promises = Array.from(this.mcpClients.values()).map(client => client.disconnect());
    await Promise.allSettled(promises);
    this.resourceCache.clear();
  }

  async resetResourceCache(){
    this.resourceCache.clear()
  }

  async addMCPServer(server: IMCPServer): Promise<void> {
    if (this.mcpClients.has(server.name)) {
      throw new Error(`MCP server ${server.name} already exists`);
    }

    trackMatomoEvent('ai', 'remixAI', `mcp_server_add_${server.name}`);

    const client = new MCPClient(
      server,
      server.transport === 'internal' ? this.remixMCPServer : undefined
    );
    this.mcpClients.set(server.name, client);
    this.connectionStatuses.set(server.name, {
      status: 'disconnected',
      serverName: server.name
    });

    // Set up event listeners for the new client
    client.on('connected', (serverName: string, result: IMCPInitializeResult) => {
      this.connectionStatuses.set(serverName, {
        status: 'connected',
        serverName,
        capabilities: result.capabilities
      });
      this.event.emit('mcpServerConnected', serverName, result);
    });

    client.on('error', (serverName: string, error: Error) => {
      this.connectionStatuses.set(serverName, {
        status: 'error',
        serverName,
        error: error.message,
        lastAttempt: Date.now()
      });
      this.event.emit('mcpServerError', serverName, error);
    });

    client.on('disconnected', (serverName: string) => {
      this.connectionStatuses.set(serverName, {
        status: 'disconnected',
        serverName
      });
      this.event.emit('mcpServerDisconnected', serverName);
    });

    if (server.autoStart !== false) {
      try {
        await client.connect();
      } catch (error) {
        console.warn(`[MCP Inferencer] Failed to auto-connect to MCP server ${server.name}:`, error);
      }
    }
  }

  async removeMCPServer(serverName: string): Promise<void> {
    const client = this.mcpClients.get(serverName);
    if (client) {
      trackMatomoEvent('ai', 'remixAI', `mcp_server_remove_${serverName}`);
      await client.disconnect();
      this.mcpClients.delete(serverName);
      this.connectionStatuses.delete(serverName);
    } else {
      console.warn(`[MCP Inferencer] Server ${serverName} not found`);
    }
  }

  private async enrichContextWithMCPResources(params: IParams, prompt?: string): Promise<string> {
    const connectedServers = this.getConnectedServers();
    if (!connectedServers.length) {
      return "";
    }

    // Extract MCP params for configuration (optional)
    const mcpParams = (params as any).mcp as IEnhancedMCPProviderParams;
    const enhancedParams: IEnhancedMCPProviderParams = {
      mcpServers: connectedServers,
      enableIntentMatching: mcpParams?.enableIntentMatching || true,
      maxResources: mcpParams?.maxResources || 10,
      resourcePriorityThreshold: mcpParams?.resourcePriorityThreshold,
      selectionStrategy: mcpParams?.selectionStrategy || 'hybrid'
    };

    // Use intelligent resource selection if enabled
    if (enhancedParams.enableIntentMatching && prompt) {
      return this.intelligentResourceSelection(prompt, enhancedParams);
    }

    // Fallback to original logic
    return this.legacyResourceSelection(enhancedParams);
  }

  public async intelligentResourceSelection(prompt: string, mcpParams: IEnhancedMCPProviderParams): Promise<string> {
    try {
      // Analyze user intent
      const intent = await this.intentAnalyzer.analyzeIntent(prompt);

      // Gather all available resources
      const allResources: Array<{ resource: IMCPResource; serverName: string }> = [];

      for (const serverName of mcpParams.mcpServers || []) {
        const client = this.mcpClients.get(serverName);
        if (!client || !client.isConnected()) {
          continue;
        }

        try {
          const resources = await client.listResources();
          resources.forEach(resource => {
            allResources.push({ resource, serverName });
          });
        } catch (error) {
          console.warn(`[MCP Inferencer] Failed to list resources from ${serverName}:`, error);
        }
      }

      if (allResources.length === 0) {
        return "";
      }

      // Score resources against intent
      const scoredResources = await this.resourceScoring.scoreResources(
        allResources,
        intent,
        mcpParams
      );

      // Select best resources
      const selectedResources = this.resourceScoring.selectResources(
        scoredResources,
        mcpParams.maxResources || 3,
        mcpParams.selectionStrategy || 'hybrid'
      );

      // Log selection for debugging
      this.event.emit('mcpResourceSelection', {
        intent,
        totalResourcesConsidered: allResources.length,
        selectedResources: selectedResources.map(r => ({
          name: r.resource.name,
          score: r.score,
          reasoning: r.reasoning
        }))
      });

      const contextResource: IMCPResource = {
        uri: 'context://workspace',
        name: 'Workspace Context',
        description: 'Complete IDE context including files, editor state, git status, and diagnostics',
        mimeType: 'application/json',
      };

      // Always add project structure for internal remix MCP server
      const hasInternalServer = this.mcpClients.has('Remix IDE Server')

      if (hasInternalServer) {
        const existingProjectStructure = selectedResources.find(r => r.resource.uri === 'context://workspace');
        if (existingProjectStructure === undefined) {
          selectedResources.push({
            resource: contextResource,
            serverName: 'Remix IDE Server',
            score: 1.0, // High score to ensure it's included
            components: { keywordMatch: 1.0, domainRelevance: 1.0, typeRelevance:1, priority:1, freshness:1 },
            reasoning: 'IDE context always included for internal remix MCP server'
          });
        }
      }

      // Sort resources from less relevant to most relevant (ascending by score) -> contex reduction when sending payload
      const sortedResources = selectedResources.sort((a, b) => a.score - b.score);

      // Build context from selected resources
      let mcpContext = "";
      for (const scoredResource of sortedResources) {
        const { resource, serverName } = scoredResource;

        try {
          // Try to get from cache first
          let content = null //this.resourceCache.get(resource.uri);
          const client = this.mcpClients.get(serverName);
          if (client) {
            content = await client.readResource(resource.uri);
          }

          if (content?.text) {
            mcpContext += `\n--- Resource: ${resource.name} (Score: ${Math.round(scoredResource.score * 100)}%) ---\n`;
            mcpContext += `Relevance: ${scoredResource.reasoning}\n`;
            mcpContext += content.text;
            mcpContext += "\n--- End Resource ---\n";
          }
        } catch (error) {
          console.warn(`Failed to read resource ${resource.uri}:`, error);
        }
      }

      return mcpContext;
    } catch (error) {
      // Fallback to legacy selection
      return this.legacyResourceSelection(mcpParams);
    }
  }

  private async legacyResourceSelection(mcpParams: IEnhancedMCPProviderParams): Promise<string> {
    let mcpContext = "";
    const maxResources = mcpParams.maxResources || 10;
    let resourceCount = 0;

    for (const serverName of mcpParams.mcpServers || []) {
      if (resourceCount >= maxResources) break;

      const client = this.mcpClients.get(serverName);
      if (!client || !client.isConnected()) continue;

      try {
        const resources = await client.listResources();

        for (const resource of resources) {
          if (resourceCount >= maxResources) break;

          // Check resource priority if specified
          if (mcpParams.resourcePriorityThreshold &&
              resource.annotations?.priority &&
              resource.annotations.priority < mcpParams.resourcePriorityThreshold) {
            continue;
          }

          const content = await client.readResource(resource.uri);
          if (content.text) {
            mcpContext += `\n--- Resource: ${resource.name} (${resource.uri}) ---\n`;
            mcpContext += content.text;
            mcpContext += "\n--- End Resource ---\n";
            resourceCount++;
          }
        }
      } catch (error) {
        console.warn(`Failed to get resources from MCP server ${serverName}:`, error);
      }
    }

    return mcpContext;
  }

  // Override completion methods to include MCP context

  async answer(prompt: string, options: IParams = GenerationParams): Promise<IAIStreamResponse> {
    const mcpContext = await this.enrichContextWithMCPResources(options, prompt);
    const enrichedPrompt = mcpContext ? `${mcpContext}\n\n${prompt}` : prompt;

    // Add available tools to the request in LLM format (with prompt for tool selection)
    const llmFormattedTools = await this.getToolsForLLMRequest(options.provider, prompt, buildChatPrompt(ChatHistory.queueSize));
    const enhancedOptions = {
      ...options,
      tools: llmFormattedTools.length > 0 ? llmFormattedTools : undefined,
      tool_choice: llmFormattedTools.length > 0 ? "auto" : undefined
    };

    if (llmFormattedTools.length > 0) {
      trackMatomoEvent('ai', 'remixAI', `mcp_answer_with_tools`);
    }

    try {
      const response = await this.baseInferencer.answer(enrichedPrompt, enhancedOptions);
      let toolExecutionCount = 0;

      const toolExecutionStatusCallback = async (tool_calls, uiCallback) => {

        // avoid circular tooling
        if (toolExecutionCount >= this.MAX_TOOL_EXECUTIONS) {
          console.warn(`[MCP] Maximum tool execution iterations (${this.MAX_TOOL_EXECUTIONS}) reached`);
          return { streamResponse: await this.baseInferencer.answer(enrichedPrompt, options) };
        }

        toolExecutionCount++;
        if (tool_calls && tool_calls.length > 0) {
          const toolMessages = [];

          // Execute all tools and collect results
          for (const llmToolCall of tool_calls) {
            try {
              // Convert LLM tool call to internal MCP format
              const mcpToolCall = this.convertLLMToolCallToMCP(llmToolCall);
              const result = await this.executeToolForLLM(mcpToolCall, uiCallback);
              console.log(`[MCP] Tool ${mcpToolCall.name} executed successfully with result `, result);

              // Extract full text content from MCP result
              const extractContent = (mcpResult: any): string => {
                if (!mcpResult?.content) return JSON.stringify(mcpResult);

                return mcpResult.content
                  .map((item: any) => {
                    if (typeof item === 'string') return item;
                    if (item?.text) return item.text;
                    return JSON.stringify(item);
                  })
                  .join('\n');
              };

              const toolResultContent = extractContent(result);

              // Compress successful results to save tokens for huge mcp payloads
              // const isSuccess = !result.isError;
              // const isVerbose = toolResultContent.length > 1000;
              // if (isSuccess && isVerbose) {
              //   const preview = toolResultContent.substring(0, 200);
              //   toolResultContent = `[Tool executed successfully - Result compressed to save tokens]\n\nPreview:\n${preview}...\n\n[${toolResultContent.length} characters total]`;
              // }

              // Format tool result based on provider
              if (options.provider === 'anthropic') {
                toolMessages.push({
                  type: 'tool_result',
                  tool_use_id: llmToolCall.id,
                  content: toolResultContent
                });
              } else if (options.provider === 'openai') {
                toolMessages.push({
                  role: 'tool',
                  tool_call_id: llmToolCall.id,
                  content: toolResultContent
                });
              } else if (options.provider === 'mistralai') {
                toolMessages.push({
                  role: 'tool',
                  name: mcpToolCall.name,
                  tool_call_id: llmToolCall.id,
                  content: toolResultContent
                });
              }
            } catch (error) {
              if (uiCallback) {
                uiCallback(false);
              }

              console.error(`[MCP] Tool execution error for ${llmToolCall.function?.name}:`, error);
              const errorContent = `Error executing tool: ${error.message}`;

              if (options.provider === 'anthropic') {
                toolMessages.push({
                  type: 'tool_result',
                  tool_use_id: llmToolCall.id,
                  content: errorContent,
                  is_error: true
                });
              } else if (options.provider === 'openai') {
                toolMessages.push({
                  role: 'tool',
                  tool_call_id: llmToolCall.id,
                  content: errorContent
                });
              } else if (options.provider === 'mistralai') {
                toolMessages.push({
                  role: 'tool',
                  tool_call_id: llmToolCall.id,
                  content: errorContent
                });
              }
            }
          }

          if (toolMessages.length > 0) {
            const existingToolsMessages = enhancedOptions.toolsMessages || [];
            const currentChatHistory = enhancedOptions.chatHistory || [];
            let toolsMessagesArray = [];

            if (options.provider === 'anthropic') {
              // Anthropic: Convert tool_use blocks to assistant message, then user message with tool_result blocks
              const toolUseBlocks = tool_calls.map(tc => ({
                type: 'tool_use',
                id: tc.id,
                name: tc.function?.name || '',
                input: typeof tc.function?.arguments === 'string'
                  ? JSON.parse(tc.function.arguments || '{}')
                  : tc.function?.arguments || {}
              }));

              if (existingToolsMessages.length === 0) {
                toolsMessagesArray = [
                  ...currentChatHistory,
                  { role: 'user', content: prompt },
                  { role: 'assistant', content: toolUseBlocks },
                  { role: 'user', content: toolMessages }
                ];
              } else {
                // Subsequent iterations: append to existing tool messages
                toolsMessagesArray = [
                  ...existingToolsMessages,
                  { role: 'assistant', content: toolUseBlocks },
                  { role: 'user', content: toolMessages }
                ];
              }
            } else if (options.provider === 'openai' || options.provider === 'mistralai') {
              if (existingToolsMessages.length === 0) {
                toolsMessagesArray = [
                  ...currentChatHistory,
                  { role: 'user', content: prompt },
                  { role: 'assistant', tool_calls: tool_calls },
                  ...toolMessages
                ];
              } else {
                toolsMessagesArray = [
                  ...existingToolsMessages,
                  { role: 'assistant', tool_calls: tool_calls },
                  ...toolMessages
                ];
              }
            }

            const followUpOptions = {
              ...enhancedOptions,
              toolsMessages: toolsMessagesArray
            };

            enhancedOptions.toolsMessages = toolsMessagesArray;

            if (options.provider === 'openai' || options.provider === 'mistralai') {
              return {
                streamResponse: await this.baseInferencer.answer(prompt, followUpOptions),
                callback: toolExecutionStatusCallback,
                uiToolCallback: uiCallback
              } as IAIStreamResponse;
            } else {
              return {
                streamResponse: await this.baseInferencer.answer("", followUpOptions),
                callback: toolExecutionStatusCallback,
                uiToolCallback: uiCallback
              } as IAIStreamResponse;
            }
          }
        }
      }

      return {
        streamResponse: response,
        callback: toolExecutionStatusCallback
      } as IAIStreamResponse;
    } catch (error) {
      return { streamResponse: await this.baseInferencer.answer(enrichedPrompt, options) };
    }
  }

  async code_explaining(prompt: string, context: string = "", options: IParams = GenerationParams): Promise<any> {
    const mcpContext = await this.enrichContextWithMCPResources(options, prompt);
    const enrichedContext = mcpContext ? `${mcpContext}\n\n${context}` : context;

    // Add available tools to the request in LLM format (with prompt for tool selection)
    const llmFormattedTools = await this.getToolsForLLMRequest(options.provider, prompt);
    options.stream_result = false
    const enhancedOptions = {
      ...options,
      tools: llmFormattedTools.length > 0 ? llmFormattedTools : undefined,
      tool_choice: llmFormattedTools.length > 0 ? "auto" : undefined
    };

    try {
      const response = await this.baseInferencer.code_explaining(prompt, enrichedContext, enhancedOptions);

      if (response?.tool_calls && response.tool_calls.length > 0) {
        const toolResults = [];

        for (const llmToolCall of response.tool_calls) {
          try {
            const mcpToolCall = this.convertLLMToolCallToMCP(llmToolCall);
            const result = await this.executeToolForLLM(mcpToolCall);

            const extractContent = (mcpResult: any): string => {
              if (!mcpResult?.content) return JSON.stringify(mcpResult);

              return mcpResult.content
                .map((item: any) => {
                  if (typeof item === 'string') return item;
                  if (item?.text) return item.text;
                  return JSON.stringify(item);
                })
                .join('\n');
            };

            const toolResult: any = {
              content: extractContent(result)
            };

            if (options.provider !== 'anthropic') {
              toolResult.tool_call_id = llmToolCall.id;
            }

            toolResults.push(toolResult);
          } catch (error) {
            const errorResult: any = {
              content: `Error: ${error.message}`
            };

            if (options.provider !== 'anthropic') {
              errorResult.tool_call_id = llmToolCall.id;
            }

            toolResults.push(errorResult);
          }
        }

        // Send tool results back to LLM for final response
        if (toolResults.length > 0) {
          const followUpOptions = {
            ...enhancedOptions,
            messages: [
              ...(prompt || []),
              response,
              {
                role: "tool",
                tool_calls: toolResults
              }
            ]
          };

          return this.baseInferencer.code_explaining("", "", followUpOptions);
        }
      }

      return response;
    } catch (error) {
      return this.baseInferencer.code_explaining(prompt, enrichedContext, options);
    }
  }

  // MCP-specific methods
  getConnectionStatuses(): IMCPConnectionStatus[] {
    return Array.from(this.connectionStatuses.values());
  }

  getConnectedServers(): string[] {
    return Array.from(this.connectionStatuses.entries())
      .filter(([_, status]) => status.status === 'connected')
      .map(([name, _]) => name);
  }

  async getAllResources(): Promise<Record<string, IMCPResource[]>> {
    const result: Record<string, IMCPResource[]> = {};

    for (const [serverName, client] of this.mcpClients) {
      if (client.isConnected()) {
        try {
          result[serverName] = await client.listResources();
        } catch (error) {
          result[serverName] = [];
        }
      }
    }

    return result;
  }

  async getAllTools(): Promise<Record<string, IMCPTool[]>> {
    const result: Record<string, IMCPTool[]> = {};

    for (const [serverName, client] of this.mcpClients) {
      if (client.isConnected()) {
        result[serverName] = this.toolsCache.get(serverName) || [];
      }
    }

    return result;
  }

  async refreshToolsCache(serverName?: string): Promise<void> {
    if (serverName) {
      const client = this.mcpClients.get(serverName);
      if (client?.isConnected()) {
        try {
          this.toolsCache.set(serverName, await client.listTools());
        } catch (error) {
          this.toolsCache.set(serverName, []);
        }
      }
    } else {
      for (const [name, client] of this.mcpClients) {
        if (client.isConnected()) {
          try {
            this.toolsCache.set(name, await client.listTools());
          } catch (error) {
            this.toolsCache.set(name, []);
          }
        }
      }
    }
  }

  async executeTool(serverName: string, toolCall: IMCPToolCall): Promise<IMCPToolResult> {
    const client = this.mcpClients.get(serverName);
    if (!client) {
      throw new Error(`MCP server ${serverName} not found`);
    }

    if (!client.isConnected()) {
      throw new Error(`MCP server ${serverName} is not connected`);
    }
    return client.callTool(toolCall);
  }

  private inferToolCategory(toolName: string): string {
    const name = toolName.toLowerCase()
    if (name.includes('compile')) return 'compilation'
    if (name.includes('deploy') || name.includes('transaction') || name.includes('balance') || name.includes('account')) return 'deployment'
    if (name.includes('debug') || name.includes('breakpoint')) return 'debugging'
    if (name.includes('file') || name.includes('directory')) return 'file_management'
    if (name.includes('test')) return 'testing'
    if (name.includes('git') || name.includes('commit')) return 'git'
    if (name.includes('scan') || name.includes('analyze') || name.includes('audit')) return 'analysis'
    if (name.includes('wei') || name.includes('ether') || name.includes('hex') || name.includes('decimal')) return 'deployment'
    return 'workspace'
  }

  /**
   * Get available tools for LLM integration with category metadata
   */
  async getAvailableToolsForLLM(): Promise<IMCPTool[]> {
    const allTools: IMCPTool[] = [];
    const toolsFromServers = await this.getAllTools();

    for (const [serverName, tools] of Object.entries(toolsFromServers)) {
      for (const tool of tools) {
        // Add server context AND category metadata for filtering
        const enhancedTool: IMCPTool & { _mcpServer?: string; _mcpCategory?: string } = {
          ...tool,
          _mcpServer: serverName,
          _mcpCategory: this.inferToolCategory(tool.name)
        };
        allTools.push(enhancedTool);
      }
    }

    return allTools;
  }

  async getToolsForLLMRequest(provider?: string, prompt?: string, chatHistory?: IChatMessage[]): Promise<any[]> {
    const mcpTools = await this.getAvailableToolsForLLM();
    if (mcpTools.length === 0) return [];

    // Use weighted tool selection if prompt provided and more than threshold tools
    let selectedTools = mcpTools;
    if (prompt && mcpTools.length > this.MAXTOOLS) {
      try {
        // Use weighted selector with chat history for improved tool selection
        selectedTools = this.toolSelector.selectTools(mcpTools, prompt, this.MAXTOOLS, chatHistory);

        // Emit selection event for debugging/analytics
        this.event.emit('mcpToolSelection', {
          totalTools: mcpTools.length,
          selectedTools: selectedTools.map(t => t.name),
          categories: this.toolSelector.detectCategories(prompt),
          method: chatHistory && chatHistory.length > 0 ? 'weighted_with_history' : 'keyword',
          historyLength: chatHistory?.length || 0
        });

        console.log(`[MCPInferencer] Tool selection: ${mcpTools.length} → ${selectedTools.length} tools (${Math.round((1 - selectedTools.length / mcpTools.length) * 100)}% reduction)`)
      } catch (error) {
        console.warn('[MCPInferencer] Tool selection failed, using all tools:', error)
        selectedTools = mcpTools
      }
    }

    // Generate compact tool descriptions
    const apiGenerator = new ToolApiGenerator();
    const apiDescription = apiGenerator.generateAPIDescription();
    const toolsList = apiGenerator.generateToolsList(selectedTools);

    // Create tool names list for get_tool_schema description
    const toolNamesList = mcpTools.map(t => `- ${t.name}`).join('\n');

    const executeToolDef = {
      name: "execute_tool",
      description: `Execute TypeScript code to interact with the Remix IDE API.

${apiDescription}

${toolsList}

IMPORTANT: You always call callMCPTool as follow: return callMCPTool(...)

Note: For detailed schema information about any tool, use the get_tool_schema tool.`,
      input_schema: {
        type: "object",
        properties: {
          code: {
            type: "string",
            description: "TypeScript code to execute. Use callMCPTool(toolName, args) to call available tools. MUST return a value."
          }
        },
        required: ["code"]
      }
    };

    const getToolSchemaDef = {
      name: "get_tool_schema",
      description: `Get the full JSON schema for a specific MCP tool. This allows you to retrieve detailed parameter information, types, and requirements for any available tool.

Available tools that you can query:
${toolNamesList}

Use this tool when you need:
- Detailed parameter specifications for a tool
- Required vs optional parameters
- Parameter types and constraints
- Full input schema validation rules`,
      input_schema: {
        type: "object",
        properties: {
          tool_name: {
            type: "string",
            description: "The name of the tool to get schema for (e.g., 'file_read', 'solidity_compile')"
          }
        },
        required: ["tool_name"]
      }
    };

    // Format based on provider
    if (provider === 'anthropic') {
      return [executeToolDef, getToolSchemaDef];
    } else {
      // OpenAI and other providers format
      return [
        {
          type: "function",
          function: {
            name: executeToolDef.name,
            description: executeToolDef.description,
            parameters: executeToolDef.input_schema
          }
        },
        {
          type: "function",
          function: {
            name: getToolSchemaDef.name,
            description: getToolSchemaDef.description,
            parameters: getToolSchemaDef.input_schema
          }
        }
      ];
    }
  }

  convertLLMToolCallToMCP(llmToolCall: any): IMCPToolCall {
    let parsedArguments = llmToolCall.function.arguments;

    if (typeof parsedArguments === 'string') {
      const trimmed = parsedArguments.trim();
      if (trimmed === '' || trimmed === '{}') {
        parsedArguments = {};
      } else {
        try {
          parsedArguments = JSON.parse(trimmed);
        } catch (error) {
          parsedArguments = {};
        }
      }
    }

    return {
      name: llmToolCall.function.name,
      arguments: parsedArguments || {}
    };
  }

  /**
   * Execute a tool call from the LLM
   */
  async executeToolForLLM(toolCall: IMCPToolCall, uiCallback?: any): Promise<IMCPToolResult> {
    const toolName = toolCall.arguments?.tool_name;
    if (toolCall.name === 'get_tool_schema') {
      if (!toolName || typeof toolName !== 'string') {
        return {
          content: [{
            type: 'text',
            text: 'Error: get_tool_schema requires a tool_name parameter (string)'
          }],
          isError: true
        };
      }

      const allTools = await this.getAvailableToolsForLLM()
      const tool = allTools.find(t => t.name === toolName);
      if (!tool) {
        const availableNames = allTools.map(t => t.name).join(', ');
        return {
          content: [{
            type: 'text',
            text: `Error: Tool '${toolName}' not found. Available tools: ${availableNames}`
          }],
          isError: true
        };
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(tool, null, 2)
        }],
        isError: false
      };
    }

    // Handle code execution mode
    if (toolCall.name === 'execute_tool') {
      const code = toolCall.arguments?.code;
      if (!code || typeof code !== 'string') {
        return {
          content: [{ type: 'text', text: 'Error: execute_tool requires a code argument' }],
          isError: true
        };
      }

      // Create code executor with callback to execute actual MCP tools
      const codeExecutor = new CodeExecutor(
        async (innerToolCall: IMCPToolCall) => {
          // Find which server has this tool
          const toolsFromServers = await this.getAllTools();

          let targetServer: string | undefined;

          for (const [serverName, tools] of Object.entries(toolsFromServers)) {
            if (tools.some(tool => tool.name === innerToolCall.name)) {
              targetServer = serverName;
              break;
            }
          }

          if (!targetServer) {
            return {
              content: [{
                type: 'text',
                text: `Tool '${innerToolCall.name}' not found in any connected MCP server`
              }],
              isError: true
            } as IMCPToolResult;
          }

          try {
            if (uiCallback) {
              uiCallback(true, innerToolCall.name, innerToolCall.arguments);
            }
            const result = await this.executeTool(targetServer, innerToolCall);
            if (uiCallback) {
              uiCallback(false);
            }
            return result;
          } catch (error) {
            if (uiCallback) {
              uiCallback(false);
            }
            return {
              content: [{
                type: 'text',
                text: `Tool execution failed: ${error.message || String(error)}`
              }],
              isError: true
            } as IMCPToolResult;
          }
        },
        60000 * 10 // 10 minutes
      );

      // Execute the code
      const result = await codeExecutor.execute(code);
      console.log('code execution output', result)

      if (result.success) {
        return {
          content: [{
            type: 'text',
            text: typeof result.returnValue === 'string'
              ? result.returnValue
              : JSON.stringify(result.returnValue, null, 2)
          }],
          isError: false
        };
      } else {
        // returnValue contains error message processed in code_executor
        return {
          content: [{
            type: 'text',
            text: typeof result.returnValue === 'string'
              ? result.returnValue
              : JSON.stringify(result.returnValue, null, 2)
          }],
          isError: true
        };
      }
    }

    // Fallback: Legacy direct tool execution (should not be reached with code mode)
    const toolsFromServers = await this.getAllTools();
    let targetServer: string | undefined;

    for (const [serverName, tools] of Object.entries(toolsFromServers)) {
      if (tools.some(tool => tool.name === toolCall.name)) {
        targetServer = serverName;
        break;
      }
    }

    if (!targetServer) {
      throw new Error(`Tool '${toolCall.name}' not found in any connected MCP server`);
    }
    return this.executeTool(targetServer, toolCall);
  }

  /**
   * Check if tools are available for LLM integration
   */
  async hasAvailableTools(): Promise<boolean> {
    try {
      const tools = await this.getAvailableToolsForLLM();
      return tools.length > 0;
    } catch (error) {
      return false;
    }
  }
}
