import { remixAILogger } from '../../helpers/logger'
/**
 * Code Analysis Tool Handlers for Remix MCP Server
 */
import axios from 'axios';
import { IMCPToolResult } from '../../types/mcp';
import { BaseToolHandler } from '../registry/RemixToolRegistry';
import {
  ToolCategory,
  RemixToolDefinition
} from '../types/mcpTools';
import { Plugin } from '@remixproject/engine';

/**
 * Learneth tutorial Tool Handler
 * Starts a tutorial using learneth
 */
export class TutorialsHandler extends BaseToolHandler {
  name = 'start_tutorial';
  description = 'Start a learneth tutorial. Solidity basics and advanced topics. if you do not know the list of available tutorials, call the tool tutorials_list first';
  inputSchema = {
    type: 'object',
    properties: {
      tutorialId: {
        type: 'string',
        description: 'id of the tutorial to start. This is the id, not the name.'
      }
    },
    required: ['tutorialId']
  };

  getPermissions(): string[] {
    return ['tutorial:start'];
  }

  validate(args: { filePath: string }): boolean | string {
    const required = this.validateRequired(args, ['tutorialId']);
    if (required !== true) return required
    return true;
  }

  async execute(args: { tutorialId: string }, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      await plugin.call('LearnEth', 'startTutorial', "remix-project-org/remix-workshops", "master", args.tutorialId)
      if (await plugin.call('sidePanel', 'isPanelHidden')) {
        await plugin.call('sidePanel', 'togglePanel')
      }
      await plugin.call('sidePanel', 'showContent', 'LearnEth' )
      return this.createSuccessResult({
        success: true,
        tutorialId: args.tutorialId,
        message: `Tutorial ${args.tutorialId} started successfully.`
      });
    } catch (error) {
      return this.createErrorResult(`Starting tutorial failed: ${error.message}`);
    }
  }
}

/**
 * Tutorials List Tool Handler
 * Gets the list of available tutorials
 */
export class TutorialsListHandler extends BaseToolHandler {
  name = 'tutorials_list';
  description = 'Get the list of available learneth tutorials';
  inputSchema = {
    type: 'object',
    properties: {},
    required: []
  }
  static readonly CACHE_KEY = 'remix_tutorials_config';
  static readonly CACHE_EXPIRY_KEY = 'remix_tutorials_config_expiry';
  static readonly CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes

  getPermissions(): string[] {
    return ['tutorial:list'];
  }

  validate(_args: any): boolean | string {
    return true;
  }

  async execute(_args: any, _plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const tutorialsConfig = await this.loadTutorialsConfig();

      if (!tutorialsConfig) {
        return this.createErrorResult('Failed to load tutorials configuration.');
      }

      return this.createSuccessResult({
        success: true,
        tutorials: tutorialsConfig,
        message: 'Tutorials list retrieved successfully.'
      });
    } catch (error) {
      return this.createErrorResult(`Failed to get tutorials list: ${error.message}`);
    }
  }

  private async loadTutorialsConfig(): Promise<any> {
    try {
      const cachedData = this.getCachedConfig();
      if (cachedData) {
        return JSON.parse(cachedData);
      }

      const response = await axios('https://raw.githubusercontent.com/remix-project-org/remix-workshops/refs/heads/master/config-properties.json');
      this.setCachedConfig(JSON.stringify(response.data));
      return response.data
    } catch (error) {
      remixAILogger.error('Failed to load tutorials config:', error);
    }
  }

  private getCachedConfig(): string | null {
    if (typeof localStorage === 'undefined') return null;

    try {
      const cachedData = localStorage.getItem(TutorialsListHandler.CACHE_KEY);
      const expiryTime = localStorage.getItem(TutorialsListHandler.CACHE_EXPIRY_KEY);

      if (!cachedData || !expiryTime) return null;

      const now = Date.now();
      if (now > parseInt(expiryTime, 10)) {
        localStorage.removeItem(TutorialsListHandler.CACHE_KEY);
        localStorage.removeItem(TutorialsListHandler.CACHE_EXPIRY_KEY);
        return null;
      }

      return cachedData;
    } catch (error) {
      remixAILogger.error('Error reading from localStorage:', error);
      return null;
    }
  }

  private setCachedConfig(data: string): void {
    if (typeof localStorage === 'undefined') return;

    try {
      const expiryTime = Date.now() + TutorialsListHandler.CACHE_DURATION_MS;
      localStorage.setItem(TutorialsListHandler.CACHE_KEY, data);
      localStorage.setItem(TutorialsListHandler.CACHE_EXPIRY_KEY, expiryTime.toString());
    } catch (error) {
      remixAILogger.error('Error writing to localStorage:', error);
    }
  }
}

/**
 * Create code analysis tool definitions
 */
export function createTutorialsTools(): RemixToolDefinition[] {
  return [
    {
      name: 'start_tutorial',
      description: new TutorialsHandler().description,
      inputSchema: new TutorialsHandler().inputSchema,
      category: ToolCategory.ANALYSIS,
      permissions: ['analysis:scan', 'file:read'],
      handler: new TutorialsHandler()
    },
    {
      name: 'tutorials_list',
      description: 'get the list of available learneth tutorials',
      inputSchema: new TutorialsListHandler().inputSchema,
      category: ToolCategory.ANALYSIS,
      permissions: ['tutorial:list'],
      handler: new TutorialsListHandler()
    }
  ];
}
