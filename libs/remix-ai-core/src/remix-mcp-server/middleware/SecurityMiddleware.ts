
import { Plugin } from '@remixproject/engine';
import { IMCPToolCall } from '../../types/mcp';
import { ToolExecutionContext } from '../types/mcpTools';
import { RemixToolRegistry } from '../registry/RemixToolRegistry';
import { MCPSecurityConfig } from '../types/mcpConfig';
import { MCPConfigManager } from '../config/MCPConfigManager';
import { BaseMiddleware } from './BaseMiddleware';

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

export class SecurityMiddleware extends BaseMiddleware {
  private rateLimitTracker = new Map<string, number[]>();
  private auditLog: AuditLogEntry[] = [];
  private toolRegistry?: RemixToolRegistry;
  private config: MCPSecurityConfig;
  private rateLimitCleanupInterval?: NodeJS.Timeout;

  constructor(toolRegistry?: RemixToolRegistry, configManager?: MCPConfigManager) {
    super(configManager);
    this.toolRegistry = toolRegistry;

    this.config = (configManager?.getSecurityConfig() || {}) as MCPSecurityConfig;

    this.rateLimitCleanupInterval = setInterval(() => {
      this.cleanupRateLimitTracker();
    }, 300000);
  }

  private getConfig(): MCPSecurityConfig {
    if (this.configManager) {
      return this.configManager.getSecurityConfig();
    }
    return this.config;
  }

  async validateToolCall(
    call: IMCPToolCall,
    context: ToolExecutionContext,
    plugin: Plugin
  ): Promise<SecurityValidationResult> {
    const startTime = Date.now();
    const config = this.getConfig();

    try {
      // Check if tool is allowed (exclude/allow lists)
      const toolAllowedResult = this.checkToolAllowed(call.name);
      if (!toolAllowedResult.allowed) {
        this.logAudit(call, context, 'blocked', toolAllowedResult.reason, startTime, 'high');
        return toolAllowedResult;
      }

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

      // Mainnet transaction validation (must be before other validations to block early)
      const mainnetResult = await this.validateMainnetOperation(call, plugin);
      if (!mainnetResult.allowed) {
        this.logAudit(call, context, 'blocked', mainnetResult.reason, startTime, 'high');
        return mainnetResult;
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

  private checkToolAllowed(toolName: string): SecurityValidationResult {
    const config = this.getConfig();

    // Use ConfigManager if available
    if (this.configManager) {
      const allowed = this.configManager.isToolAllowed(toolName);
      if (!allowed) {
        return {
          allowed: false,
          reason: `Tool '${toolName}' is not allowed by configuration`,
          risk: 'high'
        };
      }
      return { allowed: true, risk: 'low' };
    }

    if (config.excludeTools && config.excludeTools.includes(toolName)) {
      return {
        allowed: false,
        reason: `Tool '${toolName}' is excluded by security configuration`,
        risk: 'high'
      };
    }

    return { allowed: true, risk: 'low' };
  }

  private checkRateLimit(context: ToolExecutionContext): SecurityValidationResult {
    const config = this.getConfig();
    const identifier = context.userId || context.sessionId || 'anonymous';
    const now = Date.now();
    const windowMs = 60000;

    if (config.rateLimit && !config.rateLimit.enabled) {
      return { allowed: true, risk: 'low' };
    }

    const maxRequests = config.rateLimit?.requestsPerMinute || config.maxRequestsPerMinute || 100;
    let timestamps = this.rateLimitTracker.get(identifier) || [];

    const windowStart = now - windowMs;
    timestamps = timestamps.filter(timestamp => timestamp > windowStart);

    if (timestamps.length >= maxRequests) {
      const oldestTimestamp = Math.min(...timestamps);
      const timeUntilOldestExpires = (oldestTimestamp + windowMs) - now;
      const secondsToWait = Math.ceil(timeUntilOldestExpires / 1000);

      return {
        allowed: false,
        reason: `Rate limit exceeded: ${timestamps.length}/${maxRequests} requests in the last minute. Please wait ${secondsToWait} seconds.`,
        risk: 'medium'
      };
    }

    timestamps.push(now);
    this.rateLimitTracker.set(identifier, timestamps);

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
   *
   * IMPORTANT: For file operations (file_write, file_create), we treat 'content'
   * arguments as code, not user input, to avoid false positives for legitimate
   * code patterns like require(), eval(), etc.
   */
  private async validateArguments(call: IMCPToolCall, plugin: Plugin): Promise<SecurityValidationResult> {
    const args = call.arguments || {};

    // File operation tools where 'content' is expected to be code
    const fileOperationTools = ['file_write', 'file_create', 'file_update'];
    const isFileOperation = fileOperationTools.includes(call.name);

    for (const [key, value] of Object.entries(args)) {
      if (typeof value === 'string') {
        const context = (isFileOperation && key === 'content') ? 'code' : 'input';

        const dangerousPattern = this.findDangerousPattern(value, context);
        if (dangerousPattern) {
          return {
            allowed: false,
            reason: `Potentially dangerous content detected in argument ${key}: ${dangerousPattern.source}`,
            risk: 'high'
          };
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

  private async validateFileOperations(call: IMCPToolCall, plugin: Plugin): Promise<SecurityValidationResult> {
    const args = call.arguments || {};
    const fileOps = ['file_read', 'file_write', 'file_create', 'file_delete', 'file_move', 'file_copy'];

    if (!fileOps.includes(call.name)) {
      return { allowed: true, risk: 'low' };
    }

    const pathArgs = ['path', 'from', 'to', 'sourceFile'];
    console.log(`[SecurityMiddleware] Validating file operation arguments for call: ${call.name}`);
    for (const pathArg of pathArgs) {
      if (args[pathArg]) {
        const pathResult = this.validateFilePath(args[pathArg]);
        if (!pathResult.allowed) {
          return pathResult;
        }
      }
    }

    // Check file content size
    console.log(`[SecurityMiddleware] Validating file content size for call: ${call.name}`);
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
    console.log(`[SecurityMiddleware] Validating file type for call: ${args}`);
    if (args.type === 'directory') {
      console.log(`[SecurityMiddleware] Directory operations are allowed without file type checks.`);
      return { allowed: true, risk: 'low' };
    }

    console.log(`[SecurityMiddleware] Validating file type for path: ${args.path}`);
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

  private normalizePath(path: string): string {
    let normalized = path;

    try {
      let previous = '';
      while (previous !== normalized) {
        previous = normalized;
        normalized = decodeURIComponent(normalized);
      }
    } catch (e) {
      // If decoding fails, continue with original
    }

    // Unicode normalization (NFC - Canonical Decomposition followed by Canonical Composition)
    normalized = normalized.normalize('NFC');

    // Convert backslashes to forward slashes for consistency
    normalized = normalized.replace(/\\/g, '/');

    // Remove null bytes
    normalized = normalized.replace(/\0/g, '');

    return normalized;
  }

  private resolvePath(path: string): string {
    const parts = path.split('/').filter(part => part && part !== '.');
    const resolved: string[] = [];

    for (const part of parts) {
      if (part === '..') {
        resolved.pop();
      } else {
        resolved.push(part);
      }
    }

    return '/' + resolved.join('/');
  }

  private isPathWithinWorkspace(path: string, workspaceRoot: string = '/'): boolean {
    const normalizedPath = this.normalizePath(path);
    const resolvedPath = this.resolvePath(normalizedPath);
    const normalizedWorkspace = workspaceRoot.endsWith('/') ? workspaceRoot : workspaceRoot + '/';

    // Ensure the resolved path starts with the workspace root
    return resolvedPath.startsWith(normalizedWorkspace) || resolvedPath === workspaceRoot;
  }

  /**
   * Validate file path for security issues with comprehensive protection
   */
  private validateFilePath(path: string): SecurityValidationResult {
    const config = this.getConfig();

    // Normalize the path first
    const normalizedPath = this.normalizePath(path);

    // Check for obvious path traversal patterns (before and after normalization)
    const traversalPatterns = [
      '..',
      '%2e%2e',
      '%252e%252e',
      '..%2f',
      '..%5c',
      '%2e%2e%2f',
      '%2e%2e%5c',
      '..%c0%af',
      '..%c1%9c',
      '\u2024', // Unicode variation
      '\uFF0E\uFF0E', // Fullwidth dots
    ];

    for (const pattern of traversalPatterns) {
      if (normalizedPath.toLowerCase().includes(pattern.toLowerCase())) {
        return {
          allowed: false,
          reason: `Path traversal pattern detected: ${pattern}`,
          risk: 'high'
        };
      }
    }

    if (normalizedPath.includes('~')) {
      return {
        allowed: false,
        reason: 'Tilde expansion not allowed',
        risk: 'high'
      };
    }

    // Resolve path and check workspace boundaries
    try {
      const workspaceRoot = '/';
      if (!this.isPathWithinWorkspace(normalizedPath, workspaceRoot)) {
        return {
          allowed: false,
          reason: 'Path escapes workspace boundaries',
          risk: 'high'
        };
      }
    } catch (e) {
      return {
        allowed: false,
        reason: 'Invalid path format',
        risk: 'high'
      };
    }

    // Use ConfigManager if available
    if (this.configManager) {
      const allowed = this.configManager.isPathAllowed(normalizedPath);
      if (!allowed) {
        return {
          allowed: false,
          reason: 'Path not allowed by configuration',
          risk: 'high'
        };
      }
      return { allowed: true, risk: 'low' };
    }

    // Check blocked paths
    for (const blockedPath of config.blockedPaths) {
      if (normalizedPath.includes(blockedPath)) {
        return {
          allowed: false,
          reason: `Path contains blocked segment: ${blockedPath}`,
          risk: 'high'
        };
      }
    }

    // Check allowed paths (if set, only allow paths matching patterns)
    if (config.allowedPaths && config.allowedPaths.length > 0) {
      let pathAllowed = false;
      for (const allowedPattern of config.allowedPaths) {
        if (normalizedPath.includes(allowedPattern) || this.matchPattern(normalizedPath, allowedPattern)) {
          pathAllowed = true;
          break;
        }
      }
      if (!pathAllowed) {
        return {
          allowed: false,
          reason: 'Path not in allowed paths list',
          risk: 'high'
        };
      }
    }

    // Check for system files
    const systemFiles = ['.env', '.git', 'node_modules', '.ssh', 'id_rsa', 'private', 'secret', 'credentials'];
    for (const systemFile of systemFiles) {
      if (normalizedPath.toLowerCase().includes(systemFile)) {
        return {
          allowed: false,
          reason: `Access to system file/directory not allowed: ${systemFile}`,
          risk: 'high'
        };
      }
    }

    return { allowed: true, risk: 'low' };
  }

  /**
   * Validate input sanitization (check for injection patterns)
   *
   * IMPORTANT: This is more lenient for file content in file operations
   */
  private validateInputSanitization(call: IMCPToolCall): SecurityValidationResult {
    const args = call.arguments || {};

    // File operation tools where 'content' is expected to be code
    const fileOperationTools = ['file_write', 'file_create', 'file_update'];
    const isFileOperation = fileOperationTools.includes(call.name);

    const cmdPatterns = [
      /;\s*rm\s+-rf\s+\//i, // Severe: rm -rf /
      /&&\s*rm\s+-rf\s+\//i, // Severe: chained rm -rf /
      /\|\s*rm\s+-rf\s+\//i, // Severe: piped rm -rf /
      />\s*\/dev\//i, // Redirect to devices
      /curl\s.*\|\s*sh/i, // Piped curl to shell
      /wget\s.*\|\s*sh/i, // Piped wget to shell
    ];

    for (const [key, value] of Object.entries(args)) {
      if (typeof value === 'string') {
        if (isFileOperation && key === 'content' && this.isLikelyCodeContent(value)) {
          continue;
        }

        for (const pattern of cmdPatterns) {
          if (pattern.test(value)) {
            return {
              allowed: false,
              reason: `Potentially malicious content detected in ${key}: ${pattern}`,
              risk: 'high'
            };
          }
        }
      }
    }

    return { allowed: true, risk: 'low' };
  }

  private async validateMainnetOperation(call: IMCPToolCall, plugin: Plugin): Promise<SecurityValidationResult> {
    const criticalTools = ['deploy_contract', 'send_transaction', 'call_contract'];
    if (!criticalTools.includes(call.name)) {
      return { allowed: true, risk: 'low' };
    }

    try {
      const isMainnet = await this.isMainnetNetwork(plugin);
      if (!isMainnet) {
        return { allowed: true, risk: 'low' };
      }

      const args = call.arguments || {};
      const hasValue = args.value && args.value !== '0';

      // Build confirmation message based on operation type
      let operationType = '';
      let warningMessage = '';

      if (call.name === 'deploy_contract') {
        operationType = 'Contract Deployment';
        warningMessage = `You are about to deploy the contract "${args.contractName}" on Ethereum Mainnet.`;
        if (hasValue) {
          warningMessage += `\n\nThis deployment will send ${this.formatEther(args.value)} ETH to the contract.`;
        }
      } else if (call.name === 'send_transaction') {
        operationType = 'Transaction';
        if (hasValue) {
          operationType = 'Value Transaction';
          warningMessage = `You are about to send ${this.formatEther(args.value)} ETH to ${args.to} on Ethereum Mainnet.`;
        } else {
          warningMessage = `You are about to send a transaction to ${args.to} on Ethereum Mainnet.`;
        }
      } else if (call.name === 'call_contract') {
        operationType = 'Contract Interaction';
        warningMessage = `You are about to call the method "${args.methodName}" on contract ${args.address} on Ethereum Mainnet.`;
        if (hasValue) {
          warningMessage += `\n\nThis call will send ${this.formatEther(args.value)} ETH to the contract.`;
        }
      }

      warningMessage += '\n\n⚠️ This operation will cost real ETH. Are you sure you want to proceed?';

      // Show confirmation modal
      const confirmed = await this.showConfirmationModal(plugin, operationType, warningMessage);

      if (!confirmed) {
        return {
          allowed: false,
          reason: 'Mainnet operation cancelled by user',
          risk: 'high'
        };
      }

      return { allowed: true, risk: 'high' };
    } catch (error) {
      console.error('[SecurityMiddleware] Error validating mainnet operation:', error);
      // If we can't determine network, allow the operation but log it
      return { allowed: true, risk: 'medium' };
    }
  }

  private async isMainnetNetwork(plugin: Plugin): Promise<boolean> {
    try {
      const network = await plugin.call('network', 'detectNetwork');

      if (network && (network.id === '1' || network.id === 1 || network.name === 'main' || network.name === 'mainnet')) {
        return true;
      }

      return false;
    } catch (error) {
      console.error('[SecurityMiddleware] Error detecting network:', error);
      return false;
    }
  }

  private async showConfirmationModal(plugin: Plugin, title: string, message: string): Promise<boolean> {
    try {
      const result = await plugin.call('notification', 'modal', {
        id: 'security_mainnet_confirmation',
        title: `⚠️ Mainnet ${title}`,
        message: message,
        okLabel: 'Proceed',
        cancelLabel: 'Cancel'
      });

      return result;
    } catch (error) {
      console.log('[SecurityMiddleware] Error showing confirmation modal:', error);
      return false;
    }
  }

  private formatEther(weiValue: string): string {
    try {
      // Simple conversion from wei to ETH (divide by 10^18)
      const wei = BigInt(weiValue);
      const eth = Number(wei) / 1e18;
      return `${eth.toFixed(6)} ETH`;
    } catch (error) {
      return `${weiValue} wei`;
    }
  }

  private getRequiredPermissions(toolName: string): string[] {
    if (this.toolRegistry) {
      const toolDefinition = this.toolRegistry.get(toolName);
      if (toolDefinition && toolDefinition.permissions && toolDefinition.permissions.length > 0) {
        console.log(`[SecurityMiddleware] Tool '${toolName}' requires permissions:`, toolDefinition.permissions);
        return toolDefinition.permissions;
      }
    }

    console.log(`[SecurityMiddleware] Tool '${toolName}' has no specific permissions defined, granting all permissions (*)`);
    return ['*'];
  }

  // for audit logs
  private sanitizeArguments(args: any): any {
    if (!args || typeof args !== 'object') {
      return args;
    }

    const sensitiveFields = [
      'privateKey',
      'private_key',
      'privatekey',
      'password',
      'secret',
      'apiKey',
      'api_key',
      'apikey',
      'token',
      'accessToken',
      'access_token',
      'refreshToken',
      'refresh_token',
      'sessionToken',
      'session_token',
      'authToken',
      'auth_token',
      'bearer',
      'credentials',
      'mnemonic',
      'seedPhrase',
      'seed_phrase',
      'key'
    ];

    const sanitized: any = Array.isArray(args) ? [] : {};

    for (const [key, value] of Object.entries(args)) {
      const lowerKey = key.toLowerCase();

      if (sensitiveFields.some(field => lowerKey.includes(field.toLowerCase()))) {
        sanitized[key] = '[REDACTED]';
        continue;
      }

      // Check if value looks like a private key (64 hex characters)
      if (typeof value === 'string' && /^(0x)?[a-fA-F0-9]{64}$/.test(value)) {
        sanitized[key] = '[REDACTED-PRIVATE-KEY]';
        continue;
      }

      // Check if value looks like an Ethereum address with private info context
      if (typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value) &&
          (lowerKey.includes('from') || lowerKey.includes('account'))) {
        // Keep addresses visible but mark in context-sensitive fields
        sanitized[key] = value;
        continue;
      }

      // Recursively sanitize nested objects
      if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeArguments(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

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
      arguments: this.sanitizeArguments(call.arguments || {}),
      result,
      reason,
      executionTime: Date.now() - startTime,
      riskLevel
    };

    this.auditLog.push(entry);

    if (this.auditLog.length > 1000) {
      this.auditLog.splice(0, this.auditLog.length - 1000);
    }

    if (riskLevel === 'high') {
      console.warn('High-risk security event:', entry);
    }
  }

  getAuditLog(limit = 100): AuditLogEntry[] {
    return this.auditLog.slice(-limit);
  }

  private cleanupRateLimitTracker(): void {
    const now = Date.now();
    const windowMs = 60000;
    const windowStart = now - windowMs;
    const entriesToDelete: string[] = [];
    let timestampsCleanedCount = 0;

    for (const [identifier, timestamps] of this.rateLimitTracker.entries()) {
      // Filter out old timestamps
      const filteredTimestamps = timestamps.filter(timestamp => timestamp > windowStart);

      if (filteredTimestamps.length === 0) {
        entriesToDelete.push(identifier);
      } else if (filteredTimestamps.length < timestamps.length) {
        timestampsCleanedCount += timestamps.length - filteredTimestamps.length;
        this.rateLimitTracker.set(identifier, filteredTimestamps);
      }
    }

    for (const identifier of entriesToDelete) {
      this.rateLimitTracker.delete(identifier);
    }

    if (entriesToDelete.length > 0 || timestampsCleanedCount > 0) {
      console.log(`[SecurityMiddleware] Cleaned up ${entriesToDelete.length} idle users and ${timestampsCleanedCount} expired timestamps`);
    }
  }

  destroy(): void {
    if (this.rateLimitCleanupInterval) {
      clearInterval(this.rateLimitCleanupInterval);
      this.rateLimitCleanupInterval = undefined;
    }
    this.rateLimitTracker.clear();
    this.auditLog = [];
  }
}