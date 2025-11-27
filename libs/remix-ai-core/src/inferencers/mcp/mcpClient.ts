import EventEmitter from "events";
import {
  IMCPResource,
  IMCPServer,
  IMCPTool,
  IMCPInitializeResult,
  IMCPResourceContent,
  IMCPToolResult,
  IMCPToolCall,
} from '../../types/mcp';
import { endpointUrls } from "@remix-endpoints-helper"
import RemixMCPServer from "../../remix-mcp-server";

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
