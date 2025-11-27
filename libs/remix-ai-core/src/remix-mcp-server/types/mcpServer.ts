/**
 * Types and interfaces for Remix IDE MCP Server
 */

import { IMCPServer, IMCPServerCapabilities, IMCPInitializeResult } from '../../types/mcp';
import { ICustomRemixApi } from '@remix-api';
import { ToolRegistry } from './mcpTools';
import { ResourceProviderRegistry } from './mcpResources';
import EventEmitter from 'events';

/**
 * Remix MCP Server configuration
 */
export interface RemixMCPServerConfig {
  name: string;
  version: string;
  description: string;
  debug?: boolean;
  maxConcurrentTools?: number;
  toolTimeout?: number;
  resourceCacheTTL?: number;
  enableResourceCache?: boolean;
  security?: {
    enablePermissions?: boolean;
    requiredPermissions?: string[];
    allowedFilePatterns?: RegExp[];
    blockedFilePatterns?: RegExp[];
    enableAuditLog?: boolean;
  };
  features?: {
    compilation?: boolean;
    deployment?: boolean;
    debugging?: boolean;
    analysis?: boolean;
    testing?: boolean;
    git?: boolean;
  };
}

/**
 * MCP Server state
 */
export enum ServerState {
  STOPPED = 'stopped',
  STARTING = 'starting',
  RUNNING = 'running',
  STOPPING = 'stopping',
  ERROR = 'error'
}

/**
 * MCP Server statistics
 */
export interface ServerStats {
  uptime: number;
  totalToolCalls: number;
  totalResourcesServed: number;
  activeToolExecutions: number;
  cacheHitRate: number;
  errorCount: number;
  lastActivity: Date;
}

/**
 * Tool execution status
 */
export interface ToolExecutionStatus {
  id: string;
  toolName: string;
  startTime: Date;
  endTime?: Date;
  status: 'running' | 'completed' | 'failed' | 'timeout';
  error?: string;
  context: {
    workspace: string;
    user: string;
    permissions: string[];
  };
}

/**
 * Resource cache entry
 */
export interface ResourceCacheEntry {
  uri: string;
  content: any;
  timestamp: Date;
  ttl: number;
  accessCount: number;
  lastAccess: Date;
}

/**
 * Audit log entry
 */
export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  type: 'tool_call' | 'resource_access' | 'permission_check' | 'error';
  user: string;
  details: {
    toolName?: string;
    resourceUri?: string;
    permission?: string;
    error?: string;
    args?: any;
    result?: any;
  };
  severity: 'info' | 'warning' | 'error';
}

/**
 * Permission check result
 */
export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
  requiredPermissions: string[];
  userPermissions: string[];
}

/**
 * Remix MCP Server interface
 */
export interface IRemixMCPServer extends EventEmitter {
  readonly config: RemixMCPServerConfig;
  readonly state: ServerState;
  readonly stats: ServerStats;
  readonly tools: ToolRegistry;
  readonly resources: ResourceProviderRegistry;
  readonly plugin: ICustomRemixApi;

  initialize(): Promise<IMCPInitializeResult>;

  start(): Promise<void>;

  stop(): Promise<void>;

  getCapabilities(): IMCPServerCapabilities;

  handleMessage(message: any): Promise<any>;

  checkPermissions(operation: string, user: string, resource?: string): Promise<PermissionCheckResult>;

  getActiveExecutions(): ToolExecutionStatus[];

  getCacheStats(): {
    size: number;
    hitRate: number;
    entries: ResourceCacheEntry[];
  };

  getAuditLog(limit?: number): AuditLogEntry[];

  clearCache(): void;

  refreshResources(): Promise<void>;
}

/**
 * Server event types
 */
export interface ServerEvents {
  'state-changed': (newState: ServerState, oldState: ServerState) => void;
  'tool-executed': (execution: ToolExecutionStatus) => void;
  'resource-accessed': (uri: string, user: string) => void;
  'permission-denied': (operation: string, user: string, reason: string) => void;
  'error': (error: Error, context?: any) => void;
  'audit-log': (entry: AuditLogEntry) => void;
  'cache-cleared': () => void;
  'resources-refreshed': (count: number) => void;
}

/**
 * MCP message types
 */
export interface MCPMessage {
  id?: string;
  method: string;
  params?: any;
}

export interface MCPResponse {
  id?: string;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

/**
 * Error codes for MCP responses
 */
export enum MCPErrorCode {
  PARSE_ERROR = -32700,
  INVALID_REQUEST = -32600,
  METHOD_NOT_FOUND = -32601,
  INVALID_PARAMS = -32602,
  INTERNAL_ERROR = -32603,
  PERMISSION_DENIED = -32000,
  TOOL_NOT_FOUND = -32001,
  TOOL_EXECUTION_ERROR = -32002,
  RESOURCE_NOT_FOUND = -32003,
  VALIDATION_ERROR = -32004,
  TIMEOUT_ERROR = -32005
}

/**
 * Server factory interface
 */
export interface RemixMCPServerFactory {
  create(config: RemixMCPServerConfig, plugin: Plugin): IRemixMCPServer;
}