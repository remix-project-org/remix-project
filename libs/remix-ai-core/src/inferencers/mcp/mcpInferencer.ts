/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { ICompletions, IGeneration, IParams, AIRequestType, IAIStreamResponse } from "../../types/types";
import { GenerationParams, CompletionParams, InsertionParams } from "../../types/models";
import { RemoteInferencer } from "../remote/remoteInference";
import EventEmitter from "events";
import {
  IMCPServer,
  IMCPResource,
  IMCPResourceContent,
  IMCPTool,
  IMCPToolCall,
  IMCPToolResult,
  IMCPConnectionStatus,
  IMCPInitializeResult,
  IEnhancedMCPProviderParams,
} from "../../types/mcp";
import { IntentAnalyzer } from "../../services/intentAnalyzer";
import { ResourceScoring } from "../../services/resourceScoring";
import { RemixMCPServer } from '@remix/remix-ai-core';
import { endpointUrls } from "@remix-endpoints-helper"
import { text } from "stream/consumers";

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

export class MCPClient {
  private server: IMCPServer;
  private connected: boolean = false;
  private capabilities?: any;
  private eventEmitter: EventEmitter;
  private resources: IMCPResource[] = [];
  private tools: IMCPTool[] = [];
  private remixMCPServer?: RemixMCPServer; // Will be injected for internal transport
  private requestId: number = 1;
  private sseEventSource?: EventSource; // For SSE transport
  private wsConnection?: WebSocket; // For WebSocket transport
  private httpAbortController?: AbortController; // For HTTP request cancellation
  private resourceListCache?: { resources: IMCPResource[], timestamp: number }; // Cache for HTTP servers
  private toolListCache?: { tools: IMCPTool[], timestamp: number }; // Cache for HTTP servers
  private readonly CACHE_TTL = 120000; // 120 seconds cache TTL

  constructor(server: IMCPServer, remixMCPServer?: any) {
    this.server = server;
    this.eventEmitter = new EventEmitter();
    this.remixMCPServer = remixMCPServer;
  }

  async connect(): Promise<IMCPInitializeResult> {
    try {
      this.eventEmitter.emit('connecting', this.server.name);
      trackMatomoEvent('ai', 'mcp_connect_attempt', `${this.server.name}|${this.server.transport}`);

      if (this.server.transport === 'internal') {
        return await this.connectInternal();
      } else if (this.server.transport === 'http') {
        return await this.connectHTTP();
      } else if (this.server.transport === 'sse') {
        return await this.connectSSE();
      } else if (this.server.transport === 'websocket') {
        return await this.connectWebSocket();
      } else if (this.server.transport === 'stdio') {
        throw new Error(`stdio transport is not supported in browser environment. Please use http, sse, or websocket instead.`);
      } else {
        throw new Error(`Unknown transport type: ${this.server.transport}`);
      }

    } catch (error) {
      this.eventEmitter.emit('error', this.server.name, error);
      trackMatomoEvent('ai', 'mcp_connect_failed', `${this.server.name}|${error.message}`);
      throw error;
    }
  }

  private async connectInternal(): Promise<IMCPInitializeResult> {
    if (!this.remixMCPServer) {
      throw new Error(`Internal RemixMCPServer not available for ${this.server.name}`);
    }

    const result = await this.remixMCPServer.initialize();
    this.connected = true;
    this.capabilities = result.capabilities;
    this.eventEmitter.emit('connected', this.server.name, result);
    trackMatomoEvent('ai', 'mcp_connect_success', `${this.server.name}|internal`);
    return result;
  }

  private async connectHTTP(): Promise<IMCPInitializeResult> {
    if (!this.server.url) {
      throw new Error(`HTTP URL not specified for ${this.server.name}`);
    }

    this.httpAbortController = new AbortController();

    // Send initialize request
    const response = await this.sendHTTPRequest({
      jsonrpc: '2.0',
      id: this.getNextRequestId(),
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {
          resources: { subscribe: true },
          sampling: {}
        },
        clientInfo: {
          name: 'Remix IDE',
          version: '1.0.0'
        }
      }
    });

    if (response.error) {
      throw new Error(`HTTP initialization failed: ${response.error.message}`);
    }

    const result: IMCPInitializeResult = response.result;
    this.connected = true;
    this.capabilities = result.capabilities;

    this.eventEmitter.emit('connected', this.server.name, result);
    trackMatomoEvent('ai', 'mcp_connect_success', `${this.server.name}|http`);
    return result;
  }

  private async connectSSE(): Promise<IMCPInitializeResult> {
    if (!this.server.url) {
      throw new Error(`SSE URL not specified for ${this.server.name}`);
    }

    return new Promise((resolve, reject) => {
      try {
        this.sseEventSource = new EventSource(this.server.url!);
        let initialized = false;

        this.sseEventSource.onmessage = (event) => {
          try {
            const response = JSON.parse(event.data);

            if (!initialized && response.method === 'initialize') {
              const result: IMCPInitializeResult = response.result;
              this.connected = true;
              this.capabilities = result.capabilities;
              initialized = true;

              this.eventEmitter.emit('connected', this.server.name, result);
              resolve(result);
            } else {
              // Handle other SSE messages (resource updates, notifications, etc.)
              this.handleSSEMessage(response);
            }
          } catch (error) {
            console.error(`[MCP] Error parsing SSE message:`, error);
          }
        };

        this.sseEventSource.onerror = (error) => {
          if (!initialized) {
            reject(new Error(`SSE connection failed for ${this.server.name}`));
          }
          this.eventEmitter.emit('error', this.server.name, error);
        };

        // Send initialize request via POST (SSE is one-way, so we use HTTP POST for requests)
        this.sendSSEInitialize().catch(reject);

      } catch (error) {
        reject(error);
      }
    });
  }

  private async connectWebSocket(): Promise<IMCPInitializeResult> {
    if (!this.server.url) {
      throw new Error(`WebSocket URL not specified for ${this.server.name}`);
    }

    return new Promise((resolve, reject) => {
      try {
        this.wsConnection = new WebSocket(this.server.url!);
        let initialized = false;

        this.wsConnection.onopen = () => {
          console.log(`[MCP] WebSocket connection opened to ${this.server.name}`);

          // Send initialize message
          const initMessage = {
            jsonrpc: '2.0',
            id: this.getNextRequestId(),
            method: 'initialize',
            params: {
              protocolVersion: '2024-11-05',
              capabilities: {
                resources: { subscribe: true },
                sampling: {}
              },
              clientInfo: {
                name: 'Remix IDE',
                version: '1.0.0'
              }
            }
          };

          this.wsConnection!.send(JSON.stringify(initMessage));
        };

        this.wsConnection.onmessage = (event) => {
          try {
            const response = JSON.parse(event.data);

            if (!initialized && response.result) {
              const result: IMCPInitializeResult = response.result;
              this.connected = true;
              this.capabilities = result.capabilities;
              initialized = true;

              this.eventEmitter.emit('connected', this.server.name, result);
              resolve(result);
            } else {
              // Handle other WebSocket messages
              this.handleWebSocketMessage(response);
            }
          } catch (error) {
            console.error(`[MCP] Error parsing WebSocket message:`, error);
          }
        };

        this.wsConnection.onerror = (error) => {
          if (!initialized) {
            reject(new Error(`WebSocket connection failed for ${this.server.name}`));
          }
          this.eventEmitter.emit('error', this.server.name, error);
        };

        this.wsConnection.onclose = () => {
          this.connected = false;
          this.eventEmitter.emit('disconnected', this.server.name);
        };

      } catch (error) {
        reject(error);
      }
    });
  }

  private async sendHTTPRequest(request: any): Promise<any> {
    const contractType = new URL(this.server.url).pathname.split('/')[2]
    const response = await fetch(endpointUrls.mcpCorsProxy + '/' + contractType, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream', // Required by some MCP servers
      },
      body: JSON.stringify(request),
      signal: this.httpAbortController!.signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
    }

    // Check if response is SSE format (some MCP servers return SSE even for POST)
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/event-stream')) {
      // Parse SSE response format: "event: message\ndata: {...}\n\n"
      const text = await response.text();
      const dataMatch = text.match(/data: (.+)/);
      if (dataMatch && dataMatch[1]) {
        return JSON.parse(dataMatch[1]);
      }
      throw new Error('Invalid SSE response format');
    }

    return response.json();
  }

  private async sendSSEInitialize(): Promise<void> {
    // For SSE, send initialize request via HTTP POST
    const initUrl = this.server.url!.replace('/sse', '/initialize');

    // Use commonCorsProxy to bypass CORS restrictions
    // The proxy expects the target URL in the 'proxy' header
    await fetch(endpointUrls.mcpCorsProxy + this.server.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream', // Required by some MCP servers
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: this.getNextRequestId(),
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {
            resources: { subscribe: true },
            sampling: {}
          },
          clientInfo: {
            name: 'Remix IDE',
            version: '1.0.0'
          }
        }
      })
    });
  }

  private handleSSEMessage(message: any): void {
    // Handle SSE notifications (resource updates, etc.)
    if (message.method === 'notifications/resources/list_changed') {
      this.resourceListCache = undefined;
      this.eventEmitter.emit('resourcesChanged', this.server.name);
    } else if (message.method === 'notifications/tools/list_changed') {
      this.toolListCache = undefined;
      this.eventEmitter.emit('toolsChanged', this.server.name);
    }
  }

  private handleWebSocketMessage(message: any): void {
    // Handle WebSocket responses and notifications
    if (message.method === 'notifications/resources/list_changed') {
      this.resourceListCache = undefined;
      this.eventEmitter.emit('resourcesChanged', this.server.name);
    } else if (message.method === 'notifications/tools/list_changed') {
      this.toolListCache = undefined;
      this.eventEmitter.emit('toolsChanged', this.server.name);
    }
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      // Handle different transport types
      if (this.server.transport === 'internal' && this.remixMCPServer) {
        await this.remixMCPServer.stop();
      } else if (this.server.transport === 'http' && this.httpAbortController) {
        this.httpAbortController.abort();
        this.httpAbortController = undefined;
      } else if (this.server.transport === 'sse' && this.sseEventSource) {
        this.sseEventSource.close();
        this.sseEventSource = undefined;
      } else if (this.server.transport === 'websocket' && this.wsConnection) {
        this.wsConnection.close();
        this.wsConnection = undefined;
      }

      this.connected = false;
      this.resources = [];
      this.tools = [];
      this.resourceListCache = undefined; // Clear cache on disconnect
      this.toolListCache = undefined; // Clear cache on disconnect
      this.eventEmitter.emit('disconnected', this.server.name);
    }
  }

  async listResources(): Promise<IMCPResource[]> {
    if (!this.connected) {
      throw new Error(`MCP server ${this.server.name} is not connected`);
    }

    // Check if server supports resources capability
    if (!this.capabilities?.resources) {
      return [];
    }

    if (this.server.transport === 'internal' && this.remixMCPServer) {
      const response = await this.remixMCPServer.handleMessage({
        id: Date.now().toString(),
        method: 'resources/list',
        params: {}
      });

      if (response.error) {
        throw new Error(`Failed to list resources: ${response.error.message}`);
      }

      this.resources = response.result.resources || [];
      return this.resources;

    } else if (this.server.transport === 'http') {
      // Check cache for HTTP servers
      const now = Date.now();
      if (this.resourceListCache && (now - this.resourceListCache.timestamp) < this.CACHE_TTL) {
        console.log(`[MCP] Using cached resource list for ${this.server.name}`);
        return this.resourceListCache.resources;
      }

      // Cache miss or expired, fetch from server
      const response = await this.sendHTTPRequest({
        jsonrpc: '2.0',
        id: this.getNextRequestId(),
        method: 'resources/list',
        params: {}
      });

      if (response.error) {
        throw new Error(`Failed to list resources: ${response.error.message}`);
      }

      this.resources = response.result.resources || [];

      // Update cache
      this.resourceListCache = {
        resources: this.resources,
        timestamp: now
      };

      return this.resources;

    } else if (this.server.transport === 'websocket' && this.wsConnection) {
      return new Promise((resolve, reject) => {
        const requestId = this.getNextRequestId();

        const handleMessage = (event: MessageEvent) => {
          const response = JSON.parse(event.data);
          if (response.id === requestId) {
            this.wsConnection!.removeEventListener('message', handleMessage);

            if (response.error) {
              reject(new Error(`Failed to list resources: ${response.error.message}`));
            } else {
              this.resources = response.result.resources || [];
              resolve(this.resources);
            }
          }
        };

        this.wsConnection.addEventListener('message', handleMessage);
        this.wsConnection.send(JSON.stringify({
          jsonrpc: '2.0',
          id: requestId,
          method: 'resources/list',
          params: {}
        }));
      });

    } else {
      throw new Error(`SSE transport requires HTTP fallback for listing resources`);
    }
  }

  async readResource(uri: string): Promise<IMCPResourceContent> {
    if (!this.connected) {
      throw new Error(`MCP server ${this.server.name} is not connected`);
    }

    trackMatomoEvent('ai', 'mcp_resource_read', `${this.server.name}|${uri}`);

    if (this.server.transport === 'internal' && this.remixMCPServer) {
      const response = await this.remixMCPServer.handleMessage({
        id: Date.now().toString(),
        method: 'resources/read',
        params: { uri }
      });

      if (response.error) {
        throw new Error(`Failed to read resource: ${response.error.message}`);
      }

      return response.result;
    } else if (this.server.transport === 'http') {
      const response = await this.sendHTTPRequest({
        jsonrpc: '2.0',
        id: this.getNextRequestId(),
        method: 'resources/read',
        params: { uri }
      });

      if (response.error) {
        throw new Error(`Failed to read resource: ${response.error.message}`);
      }

      return response.result;
    } else if (this.server.transport === 'websocket' && this.wsConnection) {
      return new Promise((resolve, reject) => {
        const requestId = this.getNextRequestId();

        const handleMessage = (event: MessageEvent) => {
          const response = JSON.parse(event.data);
          if (response.id === requestId) {
            this.wsConnection!.removeEventListener('message', handleMessage);

            if (response.error) {
              reject(new Error(`Failed to read resource: ${response.error.message}`));
            } else {
              resolve(response.result);
            }
          }
        };

        this.wsConnection.addEventListener('message', handleMessage);
        this.wsConnection.send(JSON.stringify({
          jsonrpc: '2.0',
          id: requestId,
          method: 'resources/read',
          params: { uri }
        }));
      });

    } else {
      throw new Error(`SSE transport requires HTTP fallback for reading resources`);
    }
  }

  async listTools(): Promise<IMCPTool[]> {
    if (!this.connected) {
      throw new Error(`MCP server ${this.server.name} is not connected`);
    }

    // Check if server supports tools capability
    if (!this.capabilities?.tools) {
      return [];
    }

    if (this.server.transport === 'internal' && this.remixMCPServer) {
      const response = await this.remixMCPServer.handleMessage({
        id: Date.now().toString(),
        method: 'tools/list',
        params: {}
      });

      if (response.error) {
        throw new Error(`Failed to list tools: ${response.error.message}`);
      }

      this.tools = response.result.tools || [];
      return this.tools;

    } else if (this.server.transport === 'http') {
      // Check cache for HTTP servers
      const now = Date.now();
      if (this.toolListCache && (now - this.toolListCache.timestamp) < this.CACHE_TTL) {
        return this.toolListCache.tools;
      }

      // Cache miss or expired, fetch from server
      const response = await this.sendHTTPRequest({
        jsonrpc: '2.0',
        id: this.getNextRequestId(),
        method: 'tools/list',
        params: {}
      });

      if (response.error) {
        throw new Error(`Failed to list tools: ${response.error.message}`);
      }

      this.tools = response.result.tools || [];

      // Update cache
      this.toolListCache = {
        tools: this.tools,
        timestamp: now
      };

      return this.tools;

    } else if (this.server.transport === 'websocket' && this.wsConnection) {
      return new Promise((resolve, reject) => {
        const requestId = this.getNextRequestId();

        const handleMessage = (event: MessageEvent) => {
          const response = JSON.parse(event.data);
          if (response.id === requestId) {
            this.wsConnection!.removeEventListener('message', handleMessage);

            if (response.error) {
              reject(new Error(`Failed to list tools: ${response.error.message}`));
            } else {
              this.tools = response.result.tools || [];
              resolve(this.tools);
            }
          }
        };

        this.wsConnection.addEventListener('message', handleMessage);
        this.wsConnection.send(JSON.stringify({
          jsonrpc: '2.0',
          id: requestId,
          method: 'tools/list',
          params: {}
        }));
      });

    } else {
      throw new Error(`SSE transport requires HTTP fallback for listing tools`);
    }
  }

  async callTool(toolCall: IMCPToolCall): Promise<IMCPToolResult> {
    if (!this.connected) {
      throw new Error(`MCP server ${this.server.name} is not connected`);
    }

    trackMatomoEvent('ai', 'mcp_tool_call', `${this.server.name}|${toolCall.name}`);

    if (this.server.transport === 'internal' && this.remixMCPServer) {
      const response = await this.remixMCPServer.handleMessage({
        id: Date.now().toString(),
        method: 'tools/call',
        params: toolCall
      });

      if (response.error) {
        trackMatomoEvent('ai', 'mcp_tool_call_failed', `${this.server.name}|${toolCall.name}|${response.error.message}`);
        throw new Error(`Failed to call tool: ${response.error.message}`);
      }
      trackMatomoEvent('ai', 'mcp_tool_call_success', `${this.server.name}|${toolCall.name}`);
      return response.result;
    } else if (this.server.transport === 'http') {
      const response = await this.sendHTTPRequest({
        jsonrpc: '2.0',
        id: this.getNextRequestId(),
        method: 'tools/call',
        params: toolCall
      });

      if (response.error) {
        throw new Error(`Failed to call tool: ${response.error.message}`);
      }

      return response.result;
    } else if (this.server.transport === 'websocket' && this.wsConnection) {
      return new Promise((resolve, reject) => {
        const requestId = this.getNextRequestId();

        const handleMessage = (event: MessageEvent) => {
          const response = JSON.parse(event.data);
          if (response.id === requestId) {
            this.wsConnection!.removeEventListener('message', handleMessage);

            if (response.error) {
              reject(new Error(`Failed to call tool: ${response.error.message}`));
            } else {
              resolve(response.result);
            }
          }
        };

        this.wsConnection.addEventListener('message', handleMessage);
        this.wsConnection.send(JSON.stringify({
          jsonrpc: '2.0',
          id: requestId,
          method: 'tools/call',
          params: toolCall
        }));
      });

    } else {
      throw new Error(`SSE transport requires HTTP fallback for calling tools`);
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  getServerName(): string {
    return this.server.name;
  }

  on(event: string, listener: (...args: any[]) => void): void {
    this.eventEmitter.on(event, listener);
  }

  off(event: string, listener: (...args: any[]) => void): void {
    this.eventEmitter.off(event, listener);
  }

  hasCapability(capability: string): boolean {
    if (!this.capabilities) return false;

    const parts = capability.split('.');
    let current = this.capabilities;

    for (const part of parts) {
      if (current[part] === undefined) return false;
      current = current[part];
    }

    return !!current;
  }

  getCapabilities(): any {
    return this.capabilities;
  }

  clearResourceListCache(): void {
    this.resourceListCache = undefined;
  }

  clearToolListCache(): void {
    this.toolListCache = undefined;
  }

  clearAllCaches(): void {
    this.resourceListCache = undefined;
    this.toolListCache = undefined;
  }

  private getNextRequestId(): number {
    return this.requestId++;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
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
  private resourceListCache: Map<string, { resources: IMCPResource[], timestamp: number }> = new Map();
  private cacheTimeout: number = 5000;
  private intentAnalyzer: IntentAnalyzer = new IntentAnalyzer();
  private resourceScoring: ResourceScoring = new ResourceScoring();
  private remixMCPServer?: any; // Internal RemixMCPServer instance
  private MAX_TOOL_EXECUTIONS = 10;

  constructor(servers: IMCPServer[] = [], apiUrl?: string, completionUrl?: string, remixMCPServer?: any) {
    super(apiUrl, completionUrl);
    this.remixMCPServer = remixMCPServer;
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
      const response = await super.answer(enrichedPrompt, enhancedOptions);
      let toolExecutionCount = 0;

      const toolExecutionCallback = async (tool_calls) => {

        // avoid circular tooling
        if (toolExecutionCount >= this.MAX_TOOL_EXECUTIONS) {
          console.warn(`[MCP] Maximum tool execution iterations (${this.MAX_TOOL_EXECUTIONS}) reached`);
          return { streamResponse: await super.answer(enrichedPrompt, options) };
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
            return { streamResponse: await super.answer('', followUpOptions), callback: toolExecutionCallback } as IAIStreamResponse;
          }
        }
      }

      return { streamResponse: response, callback:toolExecutionCallback } as IAIStreamResponse;
    } catch (error) {
      return { streamResponse: await super.answer(enrichedPrompt, options) };
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
      const response = await super.code_explaining(prompt, enrichedContext, enhancedOptions);

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

          return super.code_explaining("", "", followUpOptions);
        }
      }

      return response;
    } catch (error) {
      return super.code_explaining(prompt, enrichedContext, options);
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

    // Format tools based on provider
    let convertedTools: any[];

    if (provider === 'anthropic') {
      // Anthropic format: direct object with name, description, input_schema
      convertedTools = mcpTools.map(tool => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema
      }));
    } else {
      // OpenAI and other providers format: type + function wrapper
      convertedTools = mcpTools.map(tool => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema
        }
      }));
    }

    return convertedTools;
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
    // Find which server has this tool
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
    console.log(`executing tool ${toolCall.name} from server ${targetServer}`)
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