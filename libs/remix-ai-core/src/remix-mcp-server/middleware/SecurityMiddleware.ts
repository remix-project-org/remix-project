/**
 * Security Middleware for Remix MCP Server
 */

import { Plugin } from '@remixproject/engine';
import { IMCPToolCall, IMCPToolResult } from '../../types/mcp';
import { ToolExecutionContext } from '../types/mcpTools';

export interface SecurityConfig {
  maxRequestsPerMinute: number;
  maxFileSize: number;
  allowedFileTypes: string[];
  blockedPaths: string[];
  requirePermissions: boolean;
  enableAuditLog: boolean;
  maxExecutionTime: number;
}

export interface SecurityValidationResult {
  allowed: boolean;
  reason?: string;
  risk?: 'low' | 'medium' | 'high';
}

export interface AuditLogEntry {
  timestamp: Date;
  toolName: string;
  userId?: string;
  arguments: any;
  result: 'success' | 'error' | 'blocked';
  reason?: string;
  executionTime: number;
  riskLevel: 'low' | 'medium' | 'high';
}

/**
 * Security middleware for validating and securing MCP tool calls
 */
export class SecurityMiddleware {
  private rateLimitTracker = new Map<string, { count: number; resetTime: number }>();
  private auditLog: AuditLogEntry[] = [];
  private blockedIPs = new Set<string>();

  constructor(private config: SecurityConfig) {}

  /**
   * Validate a tool call before execution
   */
  async validateToolCall(
    call: IMCPToolCall,
    context: ToolExecutionContext,
    plugin: Plugin
  ): Promise<SecurityValidationResult> {
    const startTime = Date.now();

    try {
      // Rate limiting check
      const rateLimitResult = this.checkRateLimit(context);
      if (!rateLimitResult.allowed) {
        this.logAudit(call, context, 'blocked', rateLimitResult.reason, startTime, 'medium');
        return rateLimitResult;
      }

      // Permission validation
      const permissionResult = this.validatePermissions(call, context);
      if (!permissionResult.allowed) {
        this.logAudit(call, context, 'blocked', permissionResult.reason, startTime, 'high');
        return permissionResult;
      }

      // Argument validation
      const argumentResult = await this.validateArguments(call, plugin);
      if (!argumentResult.allowed) {
        this.logAudit(call, context, 'blocked', argumentResult.reason, startTime, argumentResult.risk || 'medium');
        return argumentResult;
      }

      // File operation security checks
      const fileResult = await this.validateFileOperations(call, plugin);
      if (!fileResult.allowed) {
        this.logAudit(call, context, 'blocked', fileResult.reason, startTime, fileResult.risk || 'high');
        return fileResult;
      }

      // Input sanitization
      const sanitizationResult = this.validateInputSanitization(call);
      if (!sanitizationResult.allowed) {
        this.logAudit(call, context, 'blocked', sanitizationResult.reason, startTime, 'high');
        return sanitizationResult;
      }

      this.logAudit(call, context, 'success', 'Validation passed', startTime, 'low');
      return { allowed: true, risk: 'low' };

    } catch (error) {
      this.logAudit(call, context, 'error', `Validation error: ${error.message}`, startTime, 'high');
      return {
        allowed: false,
        reason: `Security validation failed: ${error.message}`,
        risk: 'high'
      };
    }
  }

  /**
   * Wrap tool execution with security monitoring
   */
  async secureExecute<T>(
    toolName: string,
    context: ToolExecutionContext,
    executor: () => Promise<T>
  ): Promise<T> {
    const startTime = Date.now();
    const timeoutId = setTimeout(() => {
      throw new Error(`Tool execution timeout: ${toolName} exceeded ${this.config.maxExecutionTime}ms`);
    }, this.config.maxExecutionTime);

    try {
      const result = await executor();
      clearTimeout(timeoutId);

      this.logAudit(
        { name: toolName, arguments: {} },
        context,
        'success',
        'Execution completed',
        startTime,
        'low'
      );

      return result;
    } catch (error) {
      clearTimeout(timeoutId);

      this.logAudit(
        { name: toolName, arguments: {} },
        context,
        'error',
        error.message,
        startTime,
        'high'
      );

      throw error;
    }
  }

  /**
   * Check rate limiting for user/session
   */
  private checkRateLimit(context: ToolExecutionContext): SecurityValidationResult {
    const identifier = context.userId || context.sessionId || 'anonymous';
    const now = Date.now();
    const resetTime = Math.floor(now / 60000) * 60000 + 60000; // Next minute

    const userLimit = this.rateLimitTracker.get(identifier);
    if (!userLimit || userLimit.resetTime <= now) {
      this.rateLimitTracker.set(identifier, { count: 1, resetTime });
      return { allowed: true, risk: 'low' };
    }

    if (userLimit.count >= this.config.maxRequestsPerMinute) {
      return {
        allowed: false,
        reason: `Rate limit exceeded: ${userLimit.count}/${this.config.maxRequestsPerMinute} requests per minute`,
        risk: 'medium'
      };
    }

    userLimit.count++;
    return { allowed: true, risk: 'low' };
  }

  /**
   * Validate user permissions for tool execution
   */
  private validatePermissions(call: IMCPToolCall, context: ToolExecutionContext): SecurityValidationResult {
    if (!this.config.requirePermissions) {
      return { allowed: true, risk: 'low' };
    }

    // Check if user has wildcard permission
    if (context.permissions.includes('*')) {
      return { allowed: true, risk: 'low' };
    }

    // Get required permissions for this tool (would need to be passed from tool definition)
    const requiredPermissions = this.getRequiredPermissions(call.name);

    for (const permission of requiredPermissions) {
      if (!context.permissions.includes(permission)) {
        return {
          allowed: false,
          reason: `Missing required permission: ${permission}`,
          risk: 'high'
        };
      }
    }

    return { allowed: true, risk: 'low' };
  }

  /**
   * Validate tool arguments for security issues
   */
  private async validateArguments(call: IMCPToolCall, plugin: Plugin): Promise<SecurityValidationResult> {
    const args = call.arguments || {};

    // Check for potentially dangerous patterns
    const dangerousPatterns = [
      /eval\s*\(/i,
      /function\s*\(/i,
      /javascript:/i,
      /<script/i,
      /\$\{.*\}/,
      /`.*`/,
      /require\s*\(/i,
      /import\s+.*from/i
    ];

    for (const [key, value] of Object.entries(args)) {
      if (typeof value === 'string') {
        for (const pattern of dangerousPatterns) {
          if (pattern.test(value)) {
            return {
              allowed: false,
              reason: `Potentially dangerous content detected in argument ${key}: ${pattern}`,
              risk: 'high'
            };
          }
        }

        // Check for extremely long strings that might cause DoS
        if (value.length > 100000) {
          return {
            allowed: false,
            reason: `Argument ${key} exceeds maximum length (100KB)`,
            risk: 'medium'
          };
        }
      }
    }

    return { allowed: true, risk: 'low' };
  }

  /**
   * Validate file operations for security
   */
  private async validateFileOperations(call: IMCPToolCall, plugin: Plugin): Promise<SecurityValidationResult> {
    const args = call.arguments || {};

    // File operation tools
    const fileOps = ['file_read', 'file_write', 'file_create', 'file_delete', 'file_move', 'file_copy'];

    if (!fileOps.includes(call.name)) {
      return { allowed: true, risk: 'low' };
    }

    // Check file paths
    const pathArgs = ['path', 'from', 'to', 'sourceFile'];
    for (const pathArg of pathArgs) {
      if (args[pathArg]) {
        const pathResult = this.validateFilePath(args[pathArg]);
        if (!pathResult.allowed) {
          return pathResult;
        }
      }
    }

    // Check file content size
    if (args.content && typeof args.content === 'string') {
      if (args.content.length > this.config.maxFileSize) {
        return {
          allowed: false,
          reason: `File content exceeds maximum size (${this.config.maxFileSize} bytes)`,
          risk: 'medium'
        };
      }
    }

    // Check file type restrictions
    if (args.path && this.config.allowedFileTypes.length > 0) {
      const extension = args.path.split('.').pop()?.toLowerCase();
      if (extension && !this.config.allowedFileTypes.includes(extension)) {
        return {
          allowed: false,
          reason: `File type .${extension} is not allowed`,
          risk: 'medium'
        };
      }
    }

    return { allowed: true, risk: 'low' };
  }

  /**
   * Validate file path for security issues
   */
  private validateFilePath(path: string): SecurityValidationResult {
    // Check for path traversal attacks
    if (path.includes('..') || path.includes('~')) {
      return {
        allowed: false,
        reason: 'Path traversal detected',
        risk: 'high'
      };
    }

    // Check for absolute paths outside workspace
    if (path.startsWith('/') && !path.startsWith('/workspace')) {
      return {
        allowed: false,
        reason: 'Absolute path outside workspace',
        risk: 'high'
      };
    }

    // Check blocked paths
    for (const blockedPath of this.config.blockedPaths) {
      if (path.includes(blockedPath)) {
        return {
          allowed: false,
          reason: `Path contains blocked segment: ${blockedPath}`,
          risk: 'high'
        };
      }
    }

    // Check for system files
    const systemFiles = ['.env', '.git', 'node_modules', '.ssh', 'id_rsa'];
    for (const systemFile of systemFiles) {
      if (path.includes(systemFile)) {
        return {
          allowed: false,
          reason: `Access to system file/directory not allowed: ${systemFile}`,
          risk: 'high'
        };
      }
    }

    return { allowed: true, risk: 'low' };
  }

  private validateInputSanitization(call: IMCPToolCall): SecurityValidationResult {
    const args = call.arguments || {};

    // Check for SQL injection patterns (even though we're not using SQL)
    const sqlPatterns = [
      /union\s+select/i,
      /drop\s+table/i,
      /delete\s+from/i,
      /insert\s+into/i,
      /update\s+.*set/i
    ];

    // Check for command injection patterns
    const cmdPatterns = [
      /;.*rm\s/i,
      /&&.*rm\s/i,
      /\|.*rm\s/i,
      /`.*`/,
      /\$\(.*\)/,
      />\s*\/dev\//i,
      /curl\s.*\|/i,
      /wget\s.*\|/i
    ];

    const allPatterns = [...sqlPatterns, ...cmdPatterns];

    for (const [key, value] of Object.entries(args)) {
      if (typeof value === 'string') {
        for (const pattern of allPatterns) {
          if (pattern.test(value)) {
            return {
              allowed: false,
              reason: `Potentially malicious content detected in ${key}`,
              risk: 'high'
            };
          }
        }
      }
    }

    return { allowed: true, risk: 'low' };
  }

  /**
   * Get required permissions for a tool (placeholder)
   */
  private getRequiredPermissions(toolName: string): string[] {
    // This would typically come from the tool registry
    // TODO update the tools
    const toolPermissions: Record<string, string[]> = {
      'file_write': ['file:write'],
      'file_delete': ['file:delete'],
      'deploy_contract': ['deploy:contract'],
      'call_contract': ['contract:interact'],
      'debug_start': ['debug:start'],
      'solidity_compile': ['compile:solidity']
    };

    return toolPermissions[toolName] || [];
  }

  /**
   * Log audit entry
   */
  private logAudit(
    call: IMCPToolCall,
    context: ToolExecutionContext,
    result: 'success' | 'error' | 'blocked',
    reason: string,
    startTime: number,
    riskLevel: 'low' | 'medium' | 'high'
  ): void {
    if (!this.config.enableAuditLog) return;

    const entry: AuditLogEntry = {
      timestamp: new Date(),
      toolName: call.name,
      userId: context.userId,
      arguments: call.arguments || {},
      result,
      reason,
      executionTime: Date.now() - startTime,
      riskLevel
    };

    this.auditLog.push(entry);

    // Keep only last 1000 entries
    if (this.auditLog.length > 1000) {
      this.auditLog.splice(0, this.auditLog.length - 1000);
    }

    // Log high-risk activities
    if (riskLevel === 'high') {
      console.warn('High-risk security event:', entry);
    }
  }

  getAuditLog(limit = 100): AuditLogEntry[] {
    return this.auditLog.slice(-limit);
  }

  clearAuditLog(): void {
    this.auditLog = [];
  }

  blockIP(ip: string): void {
    this.blockedIPs.add(ip);
  }

  unblockIP(ip: string): void {
    this.blockedIPs.delete(ip);
  }

  isIPBlocked(ip: string): boolean {
    return this.blockedIPs.has(ip);
  }
}

export const defaultSecurityConfig: SecurityConfig = {
  maxRequestsPerMinute: 60,
  maxFileSize: 1024 * 1024 * 2, // 2MB
  allowedFileTypes: ['sol', 'js', 'ts', 'json', 'md', 'txt', 'toml', 'yaml', 'yml'],
  blockedPaths: ['.env', '.git', 'node_modules', '.ssh', 'private', 'secret'],
  requirePermissions: true,
  enableAuditLog: true,
  maxExecutionTime: 30000 // 30 seconds
};