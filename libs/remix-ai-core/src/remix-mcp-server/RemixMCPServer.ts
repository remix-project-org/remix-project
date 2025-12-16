/* eslint-disable no-case-declarations */
import EventEmitter from 'events';
import {
  IMCPInitializeResult,
  IMCPServerCapabilities,
  IMCPToolCall,
  IMCPToolResult,
  IMCPResourceContent
} from '../types/mcp';
import {
  IRemixMCPServer,
  RemixMCPServerConfig,
  ServerState,
  ServerStats,
  ToolExecutionStatus,
  ResourceCacheEntry,
  AuditLogEntry,
  PermissionCheckResult,
  MCPMessage,
  MCPResponse,
  MCPErrorCode,
} from './types/mcpServer';
import { ToolRegistry } from './types/mcpTools';
import { ResourceProviderRegistry } from './types/mcpResources';
import { RemixToolRegistry } from './registry/RemixToolRegistry';
import { RemixResourceProviderRegistry } from './registry/RemixResourceProviderRegistry';

// Import tool handlers
import { createCompilationTools } from './handlers/CompilationHandler';
import { createFileManagementTools } from './handlers/FileManagementHandler';
import { createDeploymentTools } from './handlers/DeploymentHandler';
import { createDebuggingTools } from './handlers/DebuggingHandler';
import { createCodeAnalysisTools } from './handlers/CodeAnalysisHandler';
import { createTutorialsTools } from './handlers/TutorialsHandler';
import { createAmpTools } from './handlers/AmpHandler';
import { createMathUtilsTools } from './handlers/MathUtilsHandler';

// Import resource providers
import { ProjectResourceProvider } from './providers/ProjectResourceProvider';
import { CompilationResourceProvider } from './providers/CompilationResourceProvider';
import { DeploymentResourceProvider } from './providers/DeploymentResourceProvider';
import { TutorialsResourceProvider } from './providers/TutorialsResourceProvider';
import { AmpResourceProvider } from './providers/AmpResourceProvider';

/**
 * Main Remix MCP Server implementation
 */
export class RemixMCPServer extends EventEmitter implements IRemixMCPServer {
  private _config: RemixMCPServerConfig;
  private _state: ServerState = ServerState.STOPPED;
  private _stats: ServerStats;
  private _tools: ToolRegistry;
  private _resources: ResourceProviderRegistry;
  private _plugin
  private _activeExecutions: Map<string, ToolExecutionStatus> = new Map();
  private _resourceCache: Map<string, ResourceCacheEntry> = new Map();
  private _auditLog: AuditLogEntry[] = [];
  private _startTime: Date = new Date();

  constructor(plugin, config: RemixMCPServerConfig) {
    super();
    this._config = config;
    this._plugin = plugin
    this._tools = new RemixToolRegistry();
    this._resources = new RemixResourceProviderRegistry(plugin);

    this._stats = {
      uptime: 0,
      totalToolCalls: 0,
      totalResourcesServed: 0,
      activeToolExecutions: 0,
      cacheHitRate: 0,
      errorCount: 0,
      lastActivity: new Date()
    };

    this.setupEventHandlers();
  }

  get config(): RemixMCPServerConfig {
    return this._config;
  }

  get state(): ServerState {
    return this._state;
  }

  get stats(): ServerStats {
    this._stats.uptime = Date.now() - this._startTime.getTime();
    this._stats.activeToolExecutions = this._activeExecutions.size;
    return this._stats;
  }

  get tools(): ToolRegistry {
    return this._tools;
  }

  get resources(): ResourceProviderRegistry {
    return this._resources;
  }

  get plugin(): any{
    return this.plugin
  }

  /**
   * Initialize the MCP server
   */
  async initialize(): Promise<IMCPInitializeResult> {
    try {
      this.setState(ServerState.STARTING);

      await this.initializeDefaultTools();

      await this.initializeDefaultResourceProviders();

      this.setupCleanupIntervals();

      const result: IMCPInitializeResult = {
        protocolVersion: '2024-11-05',
        capabilities: this.getCapabilities(),
        serverInfo: {
          name: this._config.name,
          version: this._config.version
        },
        instructions: `Remix IDE MCP Server initialized. Available tools: ${this._tools.list().length}, Resource providers: ${this._resources.list().length}`
      };

      this.setState(ServerState.RUNNING);

      return result;
    } catch (error) {
      this.setState(ServerState.ERROR);
      throw error;
    }
  }

  async start(): Promise<void> {
    if (this._state !== ServerState.STOPPED) {
      throw new Error(`Cannot start server in state: ${this._state}`);
    }

    await this.initialize();
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    this.setState(ServerState.STOPPING);

    // Cancel active tool executions
    for (const [id, execution] of this._activeExecutions) {
      execution.status = 'failed';
      execution.error = 'Server shutdown';
      execution.endTime = new Date();
      this.emit('tool-executed', execution);
    }
    this._activeExecutions.clear();

    // Clear cache
    this._resourceCache.clear();
    this.emit('cache-cleared');

    this.setState(ServerState.STOPPED);
  }

  /**
   * Get server capabilities
   */
  getCapabilities(): IMCPServerCapabilities {
    return {
      resources: {
        subscribe: true,
        listChanged: true
      },
      tools: {
        listChanged: true
      },
      prompts: {
        listChanged: false
      },
      logging: {},
      experimental: {
        remix: {
          compilation: this._config.features?.compilation !== false,
          deployment: this._config.features?.deployment !== false,
          debugging: this._config.features?.debugging !== false,
          analysis: this._config.features?.analysis !== false,
          testing: this._config.features?.testing !== false,
          git: this._config.features?.git !== false
        }
      }
    };
  }

  /**
   * Handle MCP protocol messages
   */
  async handleMessage(message: MCPMessage): Promise<MCPResponse> {
    try {
      this._stats.lastActivity = new Date();

      switch (message.method) {
      case 'initialize':
        const initResult = await this.initialize();
        return { id: message.id, result: initResult };

      case 'tools/list':
        const tools = this._tools.list().map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema
        }));
        return { id: message.id, result: { tools } };

      case 'tools/call':
        const toolResult = await this.executeTool(message.params as IMCPToolCall);
        return { id: message.id, result: toolResult };

      case 'resources/list':
        const resources = await this._resources.getResources();
        return { id: message.id, result: { resources: resources.resources } };

      case 'resources/read':
        const content = await this.getResourceContent(message.params.uri);
        return { id: message.id, result: content };

      case 'server/capabilities':
        return { id: message.id, result: this.getCapabilities() };

      case 'server/stats':
        return { id: message.id, result: this.stats };

      default:
        return {
          id: message.id,
          error: {
            code: MCPErrorCode.METHOD_NOT_FOUND,
            message: `Unknown method: ${message.method}`
          }
        };
      }
    } catch (error) {
      this._stats.errorCount++;

      return {
        id: message.id,
        error: {
          code: MCPErrorCode.INTERNAL_ERROR,
          message: error.message,
          data: this._config.debug ? error.stack : undefined
        }
      };
    }
  }

  /**
   * Execute a tool
   */
  private async executeTool(call: IMCPToolCall): Promise<IMCPToolResult> {
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = new Date();

    const execution: ToolExecutionStatus = {
      id: executionId,
      toolName: call.name,
      startTime,
      status: 'running',
      context: {
        workspace: await this.getCurrentWorkspace(),
        user: 'default', // TODO: Get actual user
        permissions: ["*"] // TODO: Get actual permissions
      }
    };

    this._activeExecutions.set(executionId, execution);
    this.emit('tool-executed', execution);

    try {
      // Check permissions
      const permissionCheck = await this.checkPermissions(`tool:${call.name}`, 'default');
      if (!permissionCheck.allowed) {
        throw new Error(`Permission denied: ${permissionCheck.reason}`);
      }

      // Set timeout
      const timeout = this._config.toolTimeout || 30000;
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Tool execution timeout')), timeout);
      });

      // Execute tool
      const toolPromise = this._tools.execute(call, {
        workspace: execution.context.workspace,
        currentFile: await this.getCurrentFile(),
        permissions: execution.context.permissions,
        timestamp: Date.now(),
        requestId: executionId
      }, this._plugin);

      const result = await Promise.race([toolPromise, timeoutPromise]);

      // Update execution status
      execution.status = 'completed';
      execution.endTime = new Date();
      this._stats.totalToolCalls++;

      this.emit('tool-executed', execution);
      return result;

    } catch (error) {
      execution.status = error.message.includes('timeout') ? 'timeout' : 'failed';
      execution.error = error.message;
      execution.endTime = new Date();
      this._stats.errorCount++;

      this.emit('tool-executed', execution);
      throw error;
    } finally {
      this._activeExecutions.delete(executionId);
    }
  }

  /**
   * Get resource content with caching
   */
  private async getResourceContent(uri: string): Promise<IMCPResourceContent> {
    // Check cache first
    if (this._config.enableResourceCache !== false) {
      const cached = this._resourceCache.get(uri);
      if (cached && Date.now() - cached.timestamp.getTime() < cached.ttl) {
        cached.accessCount++;
        cached.lastAccess = new Date();
        this._stats.totalResourcesServed++;
        this.emit('resource-accessed', uri, 'default');
        return cached.content;
      }
    }

    // Get from provider
    const content = await this._resources.getResourceContent(uri);

    // Cache result
    if (this._config.enableResourceCache !== false) {
      this._resourceCache.set(uri, {
        uri,
        content,
        timestamp: new Date(),
        ttl: this._config.resourceCacheTTL || 300000, // 5 minutes default
        accessCount: 1,
        lastAccess: new Date()
      });
    }

    this._stats.totalResourcesServed++;
    this.emit('resource-accessed', uri, 'default');

    return content;
  }

  async checkPermissions(operation: string, user: string, resource?: string): Promise<PermissionCheckResult> {
    // TODO: Implement actual permission checking
    // For now, allow all operations
    return {
      allowed: true,
      requiredPermissions: [],
      userPermissions: ['*']
    };
  }

  getActiveExecutions(): ToolExecutionStatus[] {
    return Array.from(this._activeExecutions.values());
  }

  getCacheStats() {
    const entries = Array.from(this._resourceCache.values());
    const totalAccess = entries.reduce((sum, entry) => sum + entry.accessCount, 0);
    const cacheHits = totalAccess - entries.length;

    return {
      size: entries.length,
      hitRate: totalAccess > 0 ? cacheHits / totalAccess : 0,
      entries
    };
  }

  getAuditLog(limit: number = 100): AuditLogEntry[] {
    return this._auditLog.slice(-limit);
  }

  clearCache(): void {
    this._resourceCache.clear();
    this.emit('cache-cleared');
  }

  async refreshResources(): Promise<void> {
    try {
      const result = await this._resources.getResources();
      this.emit('resources-refreshed', result.resources.length);
    } catch (error) {
      console.log(`Failed to refresh resources: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Set server state
   */
  private setState(newState: ServerState): void {
    const oldState = this._state;
    this._state = newState;
    this.emit('state-changed', newState, oldState);
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    // Tool registry events
    this._tools.on('tool-registered', (toolName: string) => {
    });

    this._tools.on('tool-unregistered', (toolName: string) => {
    });

    this._tools.on('batch-registered', (registered: string[], failed: Array<{ tool: any; error: Error }>) => {
      if (failed.length > 0) {
      }
    });

    // Resource registry events
    this._resources.subscribe((event) => {
    });
  }

  private async initializeDefaultTools(): Promise<void> {
    if (this._tools.list().length > 0) return
    try {
      // Register compilation tools
      const compilationTools = createCompilationTools();
      this._tools.registerBatch(compilationTools);

      // Register file management tools
      const fileManagementTools = createFileManagementTools();
      this._tools.registerBatch(fileManagementTools);

      // Register deployment tools
      const deploymentTools = createDeploymentTools();
      this._tools.registerBatch(deploymentTools);

      // Register debugging tools
      const debuggingTools = createDebuggingTools();
      this._tools.registerBatch(debuggingTools);

      // Register debugging tools
      const codeAnalysisTools = createCodeAnalysisTools();
      this._tools.registerBatch(codeAnalysisTools);

      // Register tutorial tools
      const tutorialTools = createTutorialsTools();
      this._tools.registerBatch(tutorialTools);

      // Register Amp tools
      const ampTools = createAmpTools();
      this._tools.registerBatch(ampTools);

      // Register Math Utils tools
      const mathUtilsTools = createMathUtilsTools();
      this._tools.registerBatch(mathUtilsTools);

      const totalTools = this._tools.list().length;

    } catch (error) {
      console.log(`Failed to initialize default tools: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Initialize default resource providers
   */
  private async initializeDefaultResourceProviders(): Promise<void> {
    if (this._resources.list().length > 0) return
    try {
      // Register project resource provider
      const projectProvider = new ProjectResourceProvider(this._plugin);
      this._resources.register(projectProvider);

      // Register compilation resource provider
      const compilationProvider = new CompilationResourceProvider(this._plugin);
      this._resources.register(compilationProvider);

      // Register deployment resource provider
      const deploymentProvider = new DeploymentResourceProvider();
      this._resources.register(deploymentProvider);

      // Register tutorial resource provider
      const tutorialsProvider = new TutorialsResourceProvider(this._plugin);
      this._resources.register(tutorialsProvider);

      // Register Amp resource provider
      const ampProvider = new AmpResourceProvider(this._plugin);
      this._resources.register(ampProvider);

      const totalProviders = this._resources.list().length;

    } catch (error) {
      console.log(`Failed to initialize default resource providers: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Setup cleanup intervals
   */
  private setupCleanupIntervals(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [uri, entry] of this._resourceCache.entries()) {
        if (now - entry.timestamp.getTime() > entry.ttl) {
          this._resourceCache.delete(uri);
        }
      }
    }, 60000);

    setInterval(() => {
      if (this._auditLog.length > 1000) {
        this._auditLog = this._auditLog.slice(-500);
      }
    }, 300000);
  }

  /**
   * Get current workspace
   */
  private async getCurrentWorkspace(): Promise<string> {
    try {
      return await this.plugin.call('filePanel', 'getCurrentWorkspace')
    } catch (error) {
      return 'default';
    }
  }

  /**
   * Get current file
   */
  private async getCurrentFile(): Promise<string> {
    try {
      return await this.plugin.call('fileManager', 'getCurrentFile');
    } catch (error) {
      return 'None';
    }
  }

}