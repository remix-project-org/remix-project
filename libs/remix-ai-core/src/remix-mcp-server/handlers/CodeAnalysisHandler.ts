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
import { performSolidityScan } from '@remix-project/core-plugin';

/**
 * Solidity Scan Tool Handler
 * Analyzes Solidity code for security vulnerabilities and code quality issues
 */
export class SolidityScanHandler extends BaseToolHandler {
  name = 'solidity_scan';
  description = 'Scan Solidity smart contracts for security vulnerabilities and code quality issues using SolidityScan API';
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
      const workspace = await plugin.call('filePanel', 'getCurrentWorkspace');
      const fileName = `${workspace.name}/${args.filePath}`;
      const filePath = `.workspaces/${fileName}`;

      const exists = await plugin.call('fileManager', 'exists', filePath);
      if (!exists) {
        return this.createErrorResult(`File not found: ${args.filePath}`);
      }

      // Use the core scanning function from remix-core-plugin
      const scanReport = await performSolidityScan(plugin, args.filePath);

      const result = {
        success: true,
        fileName,
        scanCompletedAt: new Date().toISOString(),
        multi_file_scan_details: scanReport.multi_file_scan_details,
        multi_file_scan_summary: scanReport.multi_file_scan_summary
      };
      return this.createSuccessResult(result);

    } catch (error) {
      return this.createErrorResult(`Scan failed: ${error.message}`);
    }
  }
}

/**
 * Create code analysis tool definitions
 */
export function createCodeAnalysisTools(): RemixToolDefinition[] {
  return [
    {
      name: 'solidity_scan',
      description: 'Scan Solidity smart contracts for security vulnerabilities and code quality issues using SolidityScan API',
      inputSchema: new SolidityScanHandler().inputSchema,
      category: ToolCategory.ANALYSIS,
      permissions: ['analysis:scan', 'file:read'],
      handler: new SolidityScanHandler()
    }
  ];
}
