/**
 * Remix Tool Registry Implementation
 */
import { isBigInt } from './RemixResourceProviderRegistry';
import EventEmitter from 'events';
import { IMCPToolCall, IMCPToolResult } from '../../types/mcp';
import {
  ToolRegistry,
  RemixToolDefinition,
  ToolCategory,
  ToolExecutionContext,
  RemixToolHandler
} from '../types/mcpTools';
import { Plugin } from '@remixproject/engine';

/**
 * Registry for managing Remix MCP tools
 */
export class RemixToolRegistry extends EventEmitter implements ToolRegistry {
  private tools: Map<string, RemixToolDefinition> = new Map();
  private categories: Map<ToolCategory, Set<string>> = new Map();

  constructor() {
    super();
    this.initializeCategories();
  }

  register(tool: RemixToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool '${tool.name}' is already registered`);
    }

    this.tools.set(tool.name, tool);

    // Add to category
    if (!this.categories.has(tool.category)) {
      this.categories.set(tool.category, new Set());
    }
    this.categories.get(tool.category)!.add(tool.name);

    this.emit('tool-registered', tool.name, tool.category);
  }

  /**
   * Unregister a tool
   */
  unregister(name: string): void {
    const tool = this.tools.get(name);
    if (!tool) {
      return;
    }

    this.tools.delete(name);

    // Remove from category
    const categoryTools = this.categories.get(tool.category);
    if (categoryTools) {
      categoryTools.delete(name);
    }

    this.emit('tool-unregistered', name, tool.category);
  }

  /**
   * Get a specific tool
   */
  get(name: string): RemixToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * List tools, optionally filtered by category
   */
  list(category?: ToolCategory): RemixToolDefinition[] {
    if (category) {
      const categoryTools = this.categories.get(category) || new Set();
      return Array.from(categoryTools).map(name => this.tools.get(name)!);
    }

    return Array.from(this.tools.values());
  }

  /**
   * Execute a tool
   */
  async execute(
    call: IMCPToolCall,
    context: ToolExecutionContext,
    plugin: Plugin
  ): Promise<IMCPToolResult> {
    const tool = this.tools.get(call.name);
    if (!tool) {
      throw new Error(`Tool '${call.name}' not found`);
    }

    // Validate arguments
    if (tool.handler.validate) {
      const validation = tool.handler.validate(call.arguments || {});
      if (validation !== true) {
        throw new Error(`Invalid arguments: ${validation}`);
      }
    }

    // Check permissions
    const requiredPermissions = tool.handler.getPermissions?.() || [];
    for (const permission of requiredPermissions) {
      if (!context.permissions.includes(permission) && !context.permissions.includes('*')) {
        throw new Error(`Missing permission: ${permission}`);
      }
    }

    // Execute the tool
    try {
      const result = await tool.handler.execute(call.arguments || {}, plugin);
      this.emit('tool-executed', call.name, context, result);
      return result;
    } catch (error) {
      this.emit('tool-execution-error', call.name, context, error);
      throw error;
    }
  }

  /**
   * Get tools by category
   */
  getByCategory(category: ToolCategory): RemixToolDefinition[] {
    return this.list(category);
  }

  /**
   * Get available categories
   */
  getCategories(): ToolCategory[] {
    return Array.from(this.categories.keys());
  }

  /**
   * Get tool count by category
   */
  getCategoryStats(): Record<ToolCategory, number> {
    const stats: Partial<Record<ToolCategory, number>> = {};
    for (const [category, tools] of this.categories) {
      stats[category] = tools.size;
    }
    return stats as Record<ToolCategory, number>;
  }

  /**
   * Check if a tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Clear all tools
   */
  clear(): void {
    const toolNames = Array.from(this.tools.keys());
    this.tools.clear();
    this.categories.clear();
    this.initializeCategories();
    this.emit('tools-cleared', toolNames);
  }

  /**
   * Register multiple tools at once
   */
  registerBatch(tools: RemixToolDefinition[]): void {
    const registered: string[] = [];
    const failed: Array<{ tool: RemixToolDefinition; error: Error }> = [];

    for (const tool of tools) {
      try {
        this.register(tool);
        registered.push(tool.name);
      } catch (error) {
        failed.push({ tool, error });
      }
    }

    this.emit('batch-registered', registered, failed);
  }

  /**
   * Get tool metadata
   */
  getToolMetadata(name: string): any {
    const tool = this.tools.get(name);
    if (!tool) {
      return null;
    }

    return {
      name: tool.name,
      description: tool.description,
      category: tool.category,
      permissions: tool.permissions,
      inputSchema: tool.inputSchema,
      registeredAt: new Date() // TODO: Store actual registration time
    };
  }

  /**
   * Search tools by name or description
   */
  search(query: string): RemixToolDefinition[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.tools.values()).filter(tool =>
      tool.name.toLowerCase().includes(lowerQuery) ||
      tool.description.toLowerCase().includes(lowerQuery)
    );
  }

  private initializeCategories(): void {
    for (const category of Object.values(ToolCategory)) {
      this.categories.set(category, new Set());
    }
  }
}

const replacer = (key: string, value: any) => {
  if (isBigInt(value)) return value.toString(); // Convert BigInt to string
  if (typeof value === 'function') return undefined; // Remove functions
  if (value instanceof Error) {
    return {
      message: value.message,
      name: value.name,
      stack: value.stack,
    }; // Properly serialize Error objects
  }
  return value;
};

/**
 * Base class for implementing tool handlers
 */
export abstract class BaseToolHandler implements RemixToolHandler {
  abstract name: string;
  abstract description: string;
  abstract inputSchema: any;

  abstract execute(args: any, plugin:Plugin): Promise<IMCPToolResult>;

  getPermissions(): string[] {
    return [];
  }

  validate(args: any): boolean | string {
    return true;
  }

  protected createSuccessResult(content: any): IMCPToolResult {
    return {
      content: [{
        type: 'text',
        text: typeof content === 'string' ? content : JSON.stringify(content, replacer, 2)
      }],
      isError: false
    };
  }

  protected createErrorResult(error: string | Error): IMCPToolResult {
    const message = error instanceof Error ? error.message : error;
    return {
      content: [{
        type: 'text',
        text: `Error: ${message}`
      }],
      isError: true
    };
  }

  protected validateRequired(args: any, required: string[]): boolean | string {
    for (const field of required) {
      if (!(field in args) || args[field] === null || args[field] === undefined) {
        return `Missing required argument: ${field}`;
      }
    }
    return true;
  }

  protected validateTypes(args: any, types: Record<string, string>): boolean | string {
    for (const [field, expectedType] of Object.entries(types)) {
      if (field in args && typeof args[field] !== expectedType) {
        return `Invalid type for ${field}: expected ${expectedType}, got ${typeof args[field]}`;
      }
    }
    return true;
  }
}