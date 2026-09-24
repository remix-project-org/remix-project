/**
 * Code Analysis Tool Handlers for Remix MCP Server
 */

import { endpointUrls } from "@remix-endpoints-helper"
import { IMCPToolResult } from '../../types/mcp';
import { BaseToolHandler } from '../registry/RemixToolRegistry';
import {
  ToolCategory,
  RemixToolDefinition
} from '../types/mcpTools';
import { Plugin } from '@remixproject/engine';
import { CompilerAbstract } from "@remix-project/remix-solidity";

export class SlitherHandler extends BaseToolHandler {
  name = 'slither_scan';
  description = 'Scan Solidity smart contracts for security vulnerabilities and code quality issues using Slither';
  inputSchema = {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: 'Path to the Solidity file to scan (relative to workspace root)'
      }
    },
    required: ['filePath']
  };

  getPermissions(): string[] {
    return ['analysis:scan', 'file:read'];
  }

  validate(args: { filePath: string }): boolean | string {
    const required = this.validateRequired(args, ['filePath']);
    if (required !== true) return required;

    const types = this.validateTypes(args, {
      filePath: 'string'
    });
    if (types !== true) return types;

    if (!args.filePath.endsWith('.sol')) {
      return 'File must be a Solidity file (.sol)';
    }

    return true;
  }

  async execute(args: { filePath: string }, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      // Check if file exists
      const exists = await plugin.call('fileManager', 'exists', args.filePath);
      if (!exists) {
        return this.createErrorResult(`File not found: ${args.filePath}`);
      }

      const compilationResult: CompilerAbstract = await plugin.call('compilerArtefacts' as any, 'getCompilerAbstract', args.filePath)
      if (!compilationResult || !compilationResult.source || !compilationResult.source.sources) {
        return this.createErrorResult('No compilation result available for the specified file path. Please compile the contract first.');
      }

      // Get compiler state which includes version and remappings
      const compilerState = await plugin.call('solidity' as any, 'getCompilerState');

      const { sources } = compilationResult.source;

      const remappings: string[] = compilerState?.remappings || [];

      // Prepare request body
      const requestBody: { sources: Record<string, { content: string }>; version?: string; remappings?: string[] } = {
        sources,
        version: compilerState?.currentVersion
      };

      // Only include remappings if they exist
      if (remappings.length > 0) {
        requestBody.remappings = remappings;
      }

      // Call external Slither endpoint
      const response = await fetch(endpointUrls.mcpCorsProxy + '/slither/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const scanReport = await response.json();
      const parsedScanReport = JSON.parse(scanReport.analysis);
      const result = {
        success: true,
        fileName: args.filePath,
        scanCompletedAt: new Date().toISOString(),
        analysis_result: parsedScanReport
      };
      return this.createSuccessResult(result);

    } catch (error) {
      return this.createErrorResult(`Scan failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/**
 * Create code analysis tool definitions
 */
export function createCodeAnalysisTools(): RemixToolDefinition[] {
  return [
    {
      name: 'slither_scan',
      description: `Scan Solidity smart contracts for security vulnerabilities and code quality issues using Slither.`,
      inputSchema: new SlitherHandler().inputSchema,
      category: ToolCategory.ANALYSIS,
      permissions: ['slither:scan', 'file:read'],
      handler: new SlitherHandler()
    }
  ];
}
