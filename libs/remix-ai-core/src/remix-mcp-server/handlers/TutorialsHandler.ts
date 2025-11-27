/**
 * Code Analysis Tool Handlers for Remix MCP Server
 */

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
  name = 'tutorials';
  description = 'Use learneth to start a tutorial. Solidity basics and advanced topics.';
  inputSchema = {
    type: 'object',
    properties: {
      tutorialId: {
        type: 'string',
        description: 'id of the tutorial to start'
      }
    },
    required: ['tutorialId']
  };

  getPermissions(): string[] {
    return ['tutorial:sstart'];
  }

  validate(args: { filePath: string }): boolean | string {
    const required = this.validateRequired(args, ['tutorialId']);
    if (required !== true) return required
    return true;
  }

  async execute(args: { tutorialId: string }, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      await plugin.call('LearnEth', 'startTutorial', "remix-project-org/remix-workshops", "master", args.tutorialId)
      await plugin.call('sidePanel', 'showContent', 'LearnEth' )
      return this.createSuccessResult(`Tutorial ${args.tutorialId} started successfully.`);
    } catch (error) {
      return this.createErrorResult(`Starting tutorial failed: ${error.message}`);
    }
  }
}

/**
 * Create code analysis tool definitions
 */
export function createTutorialsTools(): RemixToolDefinition[] {
  return [
    {
      name: 'tutorials',
      description: 'Use learneth to start a tutorial',
      inputSchema: new TutorialsHandler().inputSchema,
      category: ToolCategory.ANALYSIS,
      permissions: ['analysis:scan', 'file:read'],
      handler: new TutorialsHandler()
    }
  ];
}
