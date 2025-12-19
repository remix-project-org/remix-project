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

// Helper function to track events using MatomoManager instance
function trackMatomoEvent(category: string, action: string, name?: string) {
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
  private intentAnalyzer: IntentAnalyzer = new IntentAnalyzer();
  private resourceScoring: ResourceScoring = new ResourceScoring();
  private remixMCPServer?: any; // Internal RemixMCPServer instance
  private MAX_TOOL_EXECUTIONS = 10;
  private baseInferencer: RemoteInferencer; // The actual inferencer to use (could be Ollama or Remote)

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
      }
    }
  }

  async connectAllServers(): Promise<void> {
    trackMatomoEvent('ai', 'mcp_connect_all_servers', `count:${this.mcpClients.size}`);
    const promises = Array.from(this.mcpClients.values()).map(async (client) => {
      try {
        await client.connect();
      } catch (error) {
        console.warn(`[MCP Inferencer] Failed to connect to MCP server ${client.getServerName()}:`, error);
      }
    });

    await Promise.allSettled(promises);
    const connectedCount = this.getConnectedServers().length;
    trackMatomoEvent('ai', 'mcp_connect_all_complete', `connected:${connectedCount}|total:${this.mcpClients.size}`);
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

    trackMatomoEvent('ai', 'mcp_server_add', `${server.name}|${server.transport}`);

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
      trackMatomoEvent('ai', 'mcp_server_remove', serverName);
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

  private async intelligentResourceSelection(prompt: string, mcpParams: IEnhancedMCPProviderParams): Promise<string> {
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

      const workspaceResource: IMCPResource = {
        uri: 'project://structure',
        name: 'Project Structure',
        description: 'Hierarchical view of project files and folders',
        mimeType: 'application/json',
      };

      // Always add project structure for internal remix MCP server
      const hasInternalServer = this.mcpClients.has('Remix IDE Server')

      if (hasInternalServer) {
        const existingProjectStructure = selectedResources.find(r => r.resource.uri === 'project://structure');
        if (existingProjectStructure === undefined) {
          selectedResources.push({
            resource: workspaceResource,
            serverName: 'Remix IDE Server',
            score: 1.0, // High score to ensure it's included
            components: { keywordMatch: 1.0, domainRelevance: 1.0, typeRelevance:1, priority:1, freshness:1 },
            reasoning: 'Project structure always included for internal remix MCP server'
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

    // Add available tools to the request in LLM format
    const llmFormattedTools = await this.getToolsForLLMRequest(options.provider);
    const enhancedOptions = {
      ...options,
      tools: llmFormattedTools.length > 0 ? llmFormattedTools : undefined,
      tool_choice: llmFormattedTools.length > 0 ? "auto" : undefined
    };

    if (llmFormattedTools.length > 0) {
      trackMatomoEvent('ai', 'mcp_answer_with_tools', `provider:${options.provider}|tools:${llmFormattedTools.length}`);
    }

    try {
      const response = await this.baseInferencer.answer(enrichedPrompt, enhancedOptions);
      let toolExecutionCount = 0;

      const toolExecutionStatusCallback = async (tool_calls) => {

        // avoid circular tooling
        if (toolExecutionCount >= this.MAX_TOOL_EXECUTIONS) {
          console.warn(`[MCP] Maximum tool execution iterations (${this.MAX_TOOL_EXECUTIONS}) reached`);
          return { streamResponse: await this.baseInferencer.answer(enrichedPrompt, options) };
        }

        toolExecutionCount++;
        if (tool_calls && tool_calls.length > 0) {
          trackMatomoEvent('ai', 'mcp_llm_tool_execution', `provider:${options.provider}|count:${tool_calls.length}|iteration:${toolExecutionCount}`);
          const toolMessages = [];

          // Execute all tools and collect results
          for (const llmToolCall of tool_calls) {
            try {
              // Convert LLM tool call to internal MCP format
              const mcpToolCall = this.convertLLMToolCallToMCP(llmToolCall);
              const result = await this.executeToolForLLM(mcpToolCall);
              console.log(`[MCP] Tool ${mcpToolCall.name} executed successfully`);
              console.log("[MCP] Tool result", result);

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

              toolsMessagesArray = [
                { role: 'assistant', content: toolUseBlocks },
                { role: 'user', content: toolMessages }
              ];
            } else if (options.provider === 'openai' || options.provider === 'mistralai') {
              // OpenAI & MistralAI: assistant message with tool_calls, followed by individual tool messages
              toolsMessagesArray = [
                { role: 'assistant', tool_calls: tool_calls },
                ...toolMessages
              ];
            }

            const followUpOptions = {
              ...enhancedOptions,
              toolsMessages: toolsMessagesArray
            };

            // Send empty prompt - the tool results are in toolsMessages
            // Don't add extra prompts as they cause Anthropic to summarize instead of using full tool results
            if (options.provider === 'openai' || options.provider === 'mistralai') return { streamResponse: await this.baseInferencer.answer(prompt, followUpOptions), callback: toolExecutionStatusCallback } as IAIStreamResponse;
            else return { streamResponse: await this.baseInferencer.answer("", followUpOptions), callback: toolExecutionStatusCallback } as IAIStreamResponse;
          }
        }
      }

      return { streamResponse: response, callback:toolExecutionStatusCallback } as IAIStreamResponse;
    } catch (error) {
      return { streamResponse: await this.baseInferencer.answer(enrichedPrompt, options) };
    }
  }

  async code_explaining(prompt: string, context: string = "", options: IParams = GenerationParams): Promise<any> {
    const mcpContext = await this.enrichContextWithMCPResources(options, prompt);
    const enrichedContext = mcpContext ? `${mcpContext}\n\n${context}` : context;

    // Add available tools to the request in LLM format
    const llmFormattedTools = await this.getToolsForLLMRequest(options.provider);
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
        try {
          result[serverName] = await client.listTools();
        } catch (error) {
          result[serverName] = [];
        }
      }
    }

    return result;
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

  /**
   * Get available tools for LLM integration
   */
  async getAvailableToolsForLLM(): Promise<IMCPTool[]> {
    const allTools: IMCPTool[] = [];
    const toolsFromServers = await this.getAllTools();

    for (const [serverName, tools] of Object.entries(toolsFromServers)) {
      for (const tool of tools) {
        // Add server context to tool for execution routing
        const enhancedTool: IMCPTool & { _mcpServer?: string } = {
          ...tool,
          _mcpServer: serverName
        };
        allTools.push(enhancedTool);
      }
    }
    return allTools;
  }

  async getToolsForLLMRequest(provider?: string): Promise<any[]> {
    const mcpTools = await this.getAvailableToolsForLLM();

    if (mcpTools.length === 0) {
      return [];
    }

    // Generate compact tool descriptions
    const apiGenerator = new ToolApiGenerator();
    const apiDescription = apiGenerator.generateAPIDescription();
    const toolsList = apiGenerator.generateToolsList(mcpTools);

    // Create single execute_tool with TypeScript API definitions
    const executeToolDef = {
      name: "execute_tool",
      description: `Execute TypeScript code to interact with the Remix IDE API.

${apiDescription}

${toolsList}`,
      input_schema: {
        type: "object",
        properties: {
          code: {
            type: "string",
            description: "TypeScript code to execute. Use callMCPTool(toolName, args) to call available tools."
          }
        },
        required: ["code"]
      }
    };

    // Format based on provider
    if (provider === 'anthropic') {
      return [executeToolDef];
    } else {
      // OpenAI and other providers format
      return [{
        type: "function",
        function: {
          name: executeToolDef.name,
          description: executeToolDef.description,
          parameters: executeToolDef.input_schema
        }
      }];
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
  async executeToolForLLM(toolCall: IMCPToolCall): Promise<IMCPToolResult> {
    // Handle code execution mode
    if (toolCall.name === 'execute_tool') {
      const code = toolCall.arguments?.code;
      if (!code || typeof code !== 'string') {
        throw new Error('execute_tool requires a code argument');
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
            throw new Error(`Tool '${innerToolCall.name}' not found in any connected MCP server`);
          }

          const result = await this.executeTool(targetServer, innerToolCall);
          return result
        },
        60000 * 10, // 10 minutes
      );

      // Execute the code
      const result = await codeExecutor.execute(code);

      // Convert code execution result to MCP tool result format
      if (result.success) {
        const content = [];

        // Add all tool call results with their full payloads
        if (result.toolCallRecords && result.toolCallRecords.length > 0) {
          content.push({
            type: 'text' as const,
            text: `Tool Calls (${result.toolCallRecords.length}):`
          });

          for (const record of result.toolCallRecords) {
            const toolResult = record.result.content
              .map((c: any) => c.text || JSON.stringify(c))
              .join('\n');

            content.push({
              type: 'text' as const,
              text: `\n[${record.name}] (${record.executionTime}ms)\nArguments: ${JSON.stringify(record.arguments, null, 2)}\nResult:\n${toolResult}`
            });
          }
        }

        if (result.output) {
          content.push({
            type: 'text' as const,
            text: `\nConsole Output:\n${result.output}`
          });
        }

        if (result.returnValue !== undefined) {
          content.push({
            type: 'text' as const,
            text: `\nReturn Value:\n${JSON.stringify(result.returnValue, null, 2)}`
          });
        }

        content.push({
          type: 'text' as const,
          text: `\nExecution Stats:\n- Time: ${result.executionTime}ms\n- Tools Called: ${result.toolsCalled.join(', ') || 'none'}`
        });

        return {
          content: content.length > 0 ? content : [{ type: 'text', text: 'Code executed successfully with no output' }],
          isError: false
        };
      } else {
        const content = [];

        content.push({
          type: 'text' as const,
          text: `Code Execution Error:\n${result.error}`
        });

        // Include tool call results even on error
        if (result.toolCallRecords && result.toolCallRecords.length > 0) {
          content.push({
            type: 'text' as const,
            text: `\nTool Calls Before Error (${result.toolCallRecords.length}):`
          });

          for (const record of result.toolCallRecords) {
            const toolResult = record.result.content
              .map((c: any) => c.text || JSON.stringify(c))
              .join('\n');

            content.push({
              type: 'text' as const,
              text: `\n[${record.name}] (${record.executionTime}ms)\nArguments: ${JSON.stringify(record.arguments, null, 2)}\nResult:\n${toolResult}`
            });
          }
        }

        if (result.output) {
          content.push({
            type: 'text' as const,
            text: `\nConsole Output:\n${result.output}`
          });
        }

        content.push({
          type: 'text' as const,
          text: `\nExecution Time: ${result.executionTime}ms`
        });

        return {
          content,
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
    console.log(`[MCP Legacy Mode] Executing tool ${toolCall.name} from server ${targetServer}`)
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