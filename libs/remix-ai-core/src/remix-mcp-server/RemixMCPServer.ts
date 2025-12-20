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
import { createChartJsTools } from './handlers/ChartJsHandler';
import { createTutorialsTools } from './handlers/TutorialsHandler';
import { createAmpTools } from './handlers/AmpHandler';
import { createMathUtilsTools } from './handlers/MathUtilsHandler';
import { createFoundryHardhatTools } from './handlers/FoundryHardhatHandler';

// Import resource providers
import { ProjectResourceProvider } from './providers/ProjectResourceProvider';
import { CompilationResourceProvider } from './providers/CompilationResourceProvider';
import { DeploymentResourceProvider } from './providers/DeploymentResourceProvider';
import { TutorialsResourceProvider } from './providers/TutorialsResourceProvider';
import { AmpResourceProvider } from './providers/AmpResourceProvider';

// Import middleware
import { SecurityMiddleware } from './middleware/SecurityMiddleware';
import { ValidationMiddleware } from './middleware/ValidationMiddleware';
import { MCPConfigManager } from './config/MCPConfigManager';

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
  private _securityMiddleware: SecurityMiddleware;
  private _validationMiddleware: ValidationMiddleware;
  private _configManager: MCPConfigManager;
  private _isInitialized: boolean = false;

  constructor(plugin, config: RemixMCPServerConfig) {
    super();
    this._config = config;
    this._plugin = plugin
    this._tools = new RemixToolRegistry();
    this._resources = new RemixResourceProviderRegistry(plugin);
    this._isInitialized = false;

    this._stats = {
      uptime: 0,
      totalToolCalls: 0,
      totalResourcesServed: 0,
      activeToolExecutions: 0,
      cacheHitRate: 0,
      errorCount: 0,
      lastActivity: new Date()
    };

    // Initialize config manager
    this._configManager = new MCPConfigManager(this._plugin);

    // Initialize middleware with tool registry (will be updated after config is loaded)
    this._securityMiddleware = new SecurityMiddleware(
      this._tools as RemixToolRegistry,
      this._configManager
    );
    this._validationMiddleware = new ValidationMiddleware(
      this._plugin,
      this._configManager
    );

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
    return this._plugin
  }

  get configManager(): MCPConfigManager {
    return this._configManager
  }

  /**
   * Initialize the MCP server
   */
  async initialize(): Promise<IMCPInitializeResult> {
    const initResult: IMCPInitializeResult = {
      protocolVersion: '2024-11-05',
      capabilities: this.getCapabilities(),
      serverInfo: {
        name: this._config.name,
        version: this._config.version
      },
      instructions: `Remix IDE MCP Server initialized. Available tools: ${this._tools.list().length}, Resource providers: ${this._resources.list().length}. Configuration loaded from workspace.`
    };

    try {
      if (this._isInitialized) return initResult;

      try {
        await this._configManager.loadConfig();
        const securityConfig = this._configManager.getSecurityConfig();
        const validationConfig = this._configManager.getValidationConfig();
        console.log('[RemixMCPServer] Middlewares connected:');
        console.log(`  - SecurityMiddleware: using ${securityConfig.excludeTools?.length || 0} excluded tools`);
        console.log(`  - ValidationMiddleware: strictMode=${validationConfig.strictMode}, ${Object.keys(validationConfig.toolValidation || {}).length} tool-specific rules`);

      } catch (error) {
        console.log(`[RemixMCPServer] Failed to load MCP config: ${error.message}, using defaults`);
      }

      await this.initializeDefaultTools();
      await this.initializeDefaultResourceProviders();

      this.setupCleanupIntervals();
      this.setState(ServerState.RUNNING);

      this._isInitialized = true;
      return initResult;
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
   * Execute a tool with security and validation middleware
   */
  private async executeTool(call: IMCPToolCall): Promise<IMCPToolResult> {
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    const startTime = new Date();

    // Get current user (default to 'default' role)
    const currentUser = 'default'; // Can be extended to get from plugin context
    console.log("checking permissions")
    const permissionCheckResult = await this.checkPermissions(call.name, currentUser);
    console.log("permissions checked", permissionCheckResult)

    const execution: ToolExecutionStatus = {
      id: executionId,
      toolName: call.name,
      startTime,
      status: 'running',
      context: {
        workspace: await this.getCurrentWorkspace(),
        user: currentUser,
        permissions: permissionCheckResult.userPermissions
      }
    };

    this._activeExecutions.set(executionId, execution);
    this.emit('tool-executed', execution);

    try {
      const context = {
        workspace: execution.context.workspace,
        currentFile: await this.getCurrentFile(),
        permissions: permissionCheckResult.userPermissions,
        timestamp: Date.now(),
        requestId: executionId
      };

      // STEP 1: Security Validation (uses MCPConfigManager for dynamic config)
      console.log(`[RemixMCPServer] Step 1: Security validation for tool '${call.name}' (using MCPConfigManager)`);
      const securityResult = await this._securityMiddleware.validateToolCall(call, context, this._plugin);

      if (!securityResult.allowed) {
        console.log(`[RemixMCPServer] Security validation FAILED for tool '${call.name}': ${securityResult.reason}`);
        throw new Error(`Security validation failed: ${securityResult.reason}`);
      }
      console.log(`[RemixMCPServer] Security validation PASSED for tool '${call.name}'`);

      // STEP 2: Input Validation (uses MCPConfigManager for dynamic config)
      console.log(`[RemixMCPServer] Step 2: Input validation for tool '${call.name}' (using MCPConfigManager)`);
      const toolDefinition = this._tools.get(call.name);
      const inputSchema = toolDefinition?.inputSchema;

      const validationResult = await this._validationMiddleware.validateToolCall(
        call,
        inputSchema,
        context,
        this._plugin
      );

      if (!validationResult.valid) {
        const errorMessages = validationResult.errors.map(e => e.message).join(', ');
        console.log(`[RemixMCPServer] Input validation FAILED for tool '${call.name}': ${errorMessages}`);
        throw new Error(`Input validation failed: ${errorMessages}`);
      }

      // Log warnings if any
      if (validationResult.warnings.length > 0) {
        const warnings = validationResult.warnings.map(w => w.message).join(', ');
        console.log(`[RemixMCPServer] Input validation warnings for tool '${call.name}': ${warnings}`);
      } else {
        console.log(`[RemixMCPServer] Input validation PASSED for tool '${call.name}'`);
      }

      const timeout = this._config.toolTimeout || 60000 * 10 // 10 minutes;;
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Tool execution timeout')), timeout);
      });

      // Execute tool
      const toolPromise = this._tools.execute(call, context, this._plugin);
      const result = await Promise.race([toolPromise, timeoutPromise]);

      // Update execution status
      execution.status = 'completed';
      execution.endTime = new Date();
      this._stats.totalToolCalls++;

      console.log(`[RemixMCPServer] Tool '${call.name}' executed successfully`);
      this.emit('tool-executed', execution);
      return result;

    } catch (error) {
      execution.status = error.message.includes('timeout') ? 'timeout' : 'failed';
      execution.error = error.message;
      execution.endTime = new Date();
      this._stats.errorCount++;

      console.log(`[RemixMCPServer] Tool '${call.name}' execution FAILED: ${error.message}`);
      this.emit('tool-executed', execution);
      return {
        isError:true,
        content: [{ type: 'text', text:error.message }]
      }
    } finally {
      this._activeExecutions.delete(executionId);
    }
  }

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
    try {
      const securityConfig = this._configManager.getSecurityConfig();
      console.log("securityConfig", securityConfig)
      // If permissions

      if (!securityConfig.permissions.requirePermissions) {
        return {
          allowed: true,
          requiredPermissions: [],
          userPermissions: ['*'],
          reason: 'Permissions not required by configuration'
        };
      }

      const userPermissions = this.getUserPermissions(user, securityConfig);
      console.log("userPermissions", userPermissions)
      const requiredPermissions = this.getOperationPermissions(operation);
      console.log("requiredPermissions", requiredPermissions)

      if (userPermissions.includes('*')) {
        return {
          allowed: true,
          requiredPermissions,
          userPermissions,
          reason: 'User has wildcard permission (*)'
        };
      }

      // check if user has all required permissions
      const missingPermissions: string[] = [];
      for (const requiredPermission of requiredPermissions) {
        if (!userPermissions.includes(requiredPermission)) {
          missingPermissions.push(requiredPermission);
        }
      }

      // If there are missing permissions, deny the operation
      if (missingPermissions.length > 0) {
        const reason = `Missing required permissions: ${missingPermissions.join(', ')}`;

        // Log denied permission check
        this.logAuditEntry({
          id: `perm_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
          timestamp: new Date(),
          type: 'permission_check',
          user,
          details: {
            permission: operation,
            resourceUri: resource,
            result: 'denied',
            args: { missingPermissions, requiredPermissions, userPermissions }
          },
          severity: 'warning'
        });

        return {
          allowed: false,
          requiredPermissions,
          userPermissions,
          reason
        };
      }

      // Additional resource-specific checks
      if (resource) {
        const resourceCheck = this.checkResourcePermissions(resource, userPermissions, securityConfig);
        console.log("Resource check:", resourceCheck)
        if (!resourceCheck.allowed) {
          // Log denied resource access
          this.logAuditEntry({
            id: `perm_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
            timestamp: new Date(),
            type: 'permission_check',
            user,
            details: {
              permission: operation,
              resourceUri: resource,
              result: 'denied',
              args: { reason: resourceCheck.reason }
            },
            severity: 'warning'
          });

          return {
            allowed: false,
            requiredPermissions,
            userPermissions,
            reason: resourceCheck.reason
          };
        }
      }

      const result = {
        allowed: true,
        requiredPermissions,
        userPermissions,
        reason: 'All required permissions granted'
      };

      this.logAuditEntry({
        id: `perm_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
        timestamp: new Date(),
        type: 'permission_check',
        user,
        details: {
          permission: operation,
          resourceUri: resource,
          result: 'allowed'
        },
        severity: 'info'
      });

      return result;

    } catch (error) {
      console.error('[RemixMCPServer] Error checking permissions:', error);

      this.logAuditEntry({
        id: `perm_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
        timestamp: new Date(),
        type: 'permission_check',
        user,
        details: {
          permission: operation,
          resourceUri: resource,
          error: error.message,
          result: 'error'
        },
        severity: 'error'
      });

      return {
        allowed: false,
        requiredPermissions: [],
        userPermissions: [],
        reason: `Permission check failed: ${error.message}`
      };
    }
  }

  private logAuditEntry(entry: AuditLogEntry): void {
    const securityConfig = this._configManager.getSecurityConfig();

    if (!securityConfig.enableAuditLog) {
      return;
    }

    this._auditLog.push(entry);
    if (this._auditLog.length > 1000) {
      this._auditLog = this._auditLog.slice(-500);
    }

    if (entry.severity === 'error') {
      console.error('[RemixMCPServer] Audit:', entry);
    }
  }

  private getUserPermissions(user: string, securityConfig: any): string[] {
    console.log('security config', securityConfig)
    const permissions: string[] = [];

    if (securityConfig.permissions?.defaultPermissions) {
      permissions.push(...securityConfig.permissions.defaultPermissions);
    }

    if (securityConfig.permissions?.roles && securityConfig.permissions.roles[user]) {
      permissions.push(...securityConfig.permissions.roles[user]);
    }
    return Array.from(new Set(permissions));
  }

  private getOperationPermissions(operation: string): string[] {
    const toolDefinition = this._tools.get(operation);
    if (toolDefinition && toolDefinition.permissions) {
      return toolDefinition.permissions;
    }

    const defaultPermissionMap: Record<string, string[]> = {
      // File operations
      'file_read': ['file:read'],
      'file_write': ['file:write'],
      'file_create': ['file:write', 'file:create'],
      'file_delete': ['file:delete'],
      'file_move': ['file:write', 'file:move'],
      'file_copy': ['file:read', 'file:write'],
      'list_directory': ['file:read'],

      // Compilation
      'compile_solidity': ['compile:solidity'],
      'get_compiler_config': ['compile:read'],
      'set_compiler_config': ['compile:config'],

      // Deployment
      'deploy_contract': ['deploy:contract'],
      'call_contract': ['contract:interact'],
      'send_transaction': ['transaction:send'],
      'get_deployed_contracts': ['deploy:read'],
      'set_execution_environment': ['environment:config'],
      'get_account_balance': ['account:read'],
      'get_user_accounts': ['accounts:read'],
      'set_selected_account': ['accounts:write'],
      'get_current_environment': ['environment:read'],

      // Debugging
      'start_debugger': ['debug:start'],
      'set_breakpoint': ['debug:breakpoint'],
      'step_debugger': ['debug:control'],
      'inspect_variable': ['debug:inspect'],

      // Analysis
      'analyze_code': ['analysis:static'],
      'security_scan': ['analysis:security'],
      'estimate_gas': ['analysis:gas']
    };

    return defaultPermissionMap[operation] || ['*'];
  }

  private checkResourcePermissions(resource: string, userPermissions: string[], securityConfig: any): { allowed: boolean; reason?: string } {
    if (securityConfig.blockedPaths) {
      for (const blockedPath of securityConfig.blockedPaths) {
        if (resource.includes(blockedPath)) {
          return {
            allowed: false,
            reason: `Access to blocked path: ${blockedPath}`
          };
        }
      }
    }

    if (securityConfig.allowedPaths && securityConfig.allowedPaths.length > 0) {
      let pathAllowed = false;
      for (const allowedPath of securityConfig.allowedPaths) {
        if (resource.includes(allowedPath) || resource.startsWith(allowedPath)) {
          pathAllowed = true;
          break;
        }
      }

      if (!pathAllowed) {
        return {
          allowed: false,
          reason: 'Resource path not in allowed paths list'
        };
      }
    }

    return { allowed: true };
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
   * Reload MCP configuration from workspace
   */
  async reloadConfig(): Promise<void> {
    try {
      console.log('[RemixMCPServer] Reloading MCP configuration...');
      const mcpConfig = await this._configManager.reloadConfig();
      console.log('[RemixMCPServer] Configuration reloaded successfully');
      console.log('[RemixMCPServer] Configuration summary:', this._configManager.getConfigSummary());
      this.emit('config-reloaded', mcpConfig);
    } catch (error) {
      console.log(`[RemixMCPServer] Failed to reload config: ${error.message}`);
      throw error;
    }
  }

  getMCPConfig() {
    return this._configManager.getConfig();
  }

  updateMCPConfig(partialConfig: Partial<any>): void {
    this._configManager.updateConfig(partialConfig);
    console.log('[RemixMCPServer] Configuration updated at runtime');
    this.emit('config-updated', this._configManager.getConfig());
  }

  private setState(newState: ServerState): void {
    const oldState = this._state;
    this._state = newState;
    this.emit('state-changed', newState, oldState);
  }

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

      // Register Foundry and Hardhat tools
      const foundryHardhatTools = createFoundryHardhatTools();
      this._tools.registerBatch(foundryHardhatTools);

      // Register Chartjs tool
      const chartJsTools = createChartJsTools();
      this._tools.registerBatch(chartJsTools);

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

  private async getCurrentWorkspace(): Promise<string> {
    try {
      return await this.plugin.call('filePanel', 'getCurrentWorkspace')
    } catch (error) {
      return '';
    }
  }

  private async getCurrentFile(): Promise<string> {
    try {
      return await this.plugin.call('fileManager', 'getCurrentFile');
    } catch (error) {
      return 'None';
    }
  }

}