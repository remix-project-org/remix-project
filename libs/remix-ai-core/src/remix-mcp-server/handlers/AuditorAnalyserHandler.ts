/**
 * Auditor Analyser Handler for Remix MCP Server
 * Runs Slither analysis and provides filtered audit checklist for LLM-assisted auditing
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

// Import the helper functions
import {
  getChecklistCategories,
  filterChecklist,
  toPromptSnippet,
  SlitherFinding,
  ChecklistItem
} from './helpers/SlitherAnalisysMapping'

export interface SlitherDetector {
  impact: 'High' | 'Medium' | 'Low' | 'Informational' | 'Optimization';
  confidence: 'High' | 'Medium' | 'Low';
  check: string;
  description: string;
  elements: any[];
  first_markdown_element?: string;
  id: string;
  markdown: string;
}

export interface SlitherAnalysisResult {
  success: boolean;
  results?: {
    detectors: SlitherDetector[];
    [key: string]: any;
  };
  [key: string]: any;
}

export interface AuditorAnalysisResult {
  success: boolean;
  fileName: string;
  analysisCompletedAt: string;
  slitherReport: SlitherAnalysisResult;
  auditChecklist: {
    totalFindings: number;
    relevantCategories: string[];
    checklistItems: ChecklistItem[];
    promptSnippet: string;
  };
}

export class AuditorAnalyserHandler extends BaseToolHandler {
  name = 'auditor_analyse';
  description = 'Run Slither security analysis and generate filtered audit checklist for smart contract auditing';
  inputSchema = {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: 'Path to the Solidity file to analyze (relative to workspace root)'
      },
      includeOptimizations: {
        type: 'boolean',
        description: 'Include optimization-level findings in the analysis',
        default: false
      },
      minSeverity: {
        type: 'string',
        description: 'Minimum severity level to include (High, Medium, Low, Informational)',
        enum: ['High', 'Medium', 'Low', 'Informational'],
        default: 'Low'
      }
    },
    required: ['filePath']
  };

  getPermissions(): string[] {
    return ['analysis:scan', 'file:read', 'compile:access'];
  }

  validate(args: { filePath: string; includeOptimizations?: boolean; minSeverity?: string }): boolean | string {
    const required = this.validateRequired(args, ['filePath']);
    if (required !== true) return required;

    const types = this.validateTypes(args, {
      filePath: 'string',
      includeOptimizations: 'boolean',
      minSeverity: 'string'
    });
    if (types !== true) return types;

    if (!args.filePath.endsWith('.sol')) {
      return 'File must be a Solidity file (.sol)';
    }

    const validSeverities = ['High', 'Medium', 'Low', 'Informational'];
    if (args.minSeverity && !validSeverities.includes(args.minSeverity)) {
      return `Invalid severity level. Must be one of: ${validSeverities.join(', ')}`;
    }

    return true;
  }

  async execute(args: { filePath: string; includeOptimizations?: boolean; minSeverity?: string }, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      // Check if file exists
      const workspace = await plugin.call('filePanel', 'getCurrentWorkspace');
      const fileName = `${workspace.name}/${args.filePath}`;
      const filePath = `.workspaces/${fileName}`;

      const exists = await plugin.call('fileManager', 'exists', filePath);
      if (!exists) {
        return this.createErrorResult(`File not found: ${args.filePath}`);
      }

      // Get compilation result
      const compilationResult: CompilerAbstract = await plugin.call('compilerArtefacts' as any, 'getCompilerAbstract', args.filePath);
      if (!compilationResult || !compilationResult.source || !compilationResult.source.sources) {
        return this.createErrorResult('No compilation result available. Please compile the contract first.');
      }

      const compilerConfig = await plugin.call('solidity' as any, 'getCurrentCompilerConfig');

      // Flatten the contract for Slither analysis
      const flattened = await plugin.call('contractflattener', 'flattenContract', 
        compilationResult.source, 
        args.filePath, 
        compilationResult.data, 
        compilationResult.input, 
        false
      );

      // Run Slither analysis
      const slitherResponse = await fetch(endpointUrls.mcpCorsProxy + '/slither/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sources: { [args.filePath]: { content: flattened } },
          version: compilerConfig?.currentVersion
        })
      });

      if (!slitherResponse.ok) {
        throw new Error(`Slither analysis failed: HTTP ${slitherResponse.status}`);
      }

      const slitherReport: SlitherAnalysisResult = await slitherResponse.json();

      // Process Slither results if successful
      let auditChecklist = {
        totalFindings: 0,
        relevantCategories: [] as string[],
        checklistItems: [] as ChecklistItem[],
        promptSnippet: ''
      };

      if (slitherReport.success && slitherReport.results?.detectors) {
        let findings = slitherReport.results.detectors;

        // Filter by minimum severity if specified
        if (args.minSeverity) {
          const severityOrder = { 'High': 0, 'Medium': 1, 'Low': 2, 'Informational': 3 };
          const minLevel = severityOrder[args.minSeverity as keyof typeof severityOrder];
          findings = findings.filter(f => severityOrder[f.impact as keyof typeof severityOrder] <= minLevel);
        }

        // Filter out optimization findings if not requested
        if (!args.includeOptimizations) {
          findings = findings.filter(f => f.impact !== 'Optimization');
        }

        // Get relevant checklist categories from Slither findings
        const categories = getChecklistCategories(findings);

        // Fetch Cyfrin audit checklist
        try {
          const checklistResponse = await fetch('https://raw.githubusercontent.com/Cyfrin/audit-checklist/main/checklist.json');
          if (checklistResponse.ok) {
            const checklistJson = await checklistResponse.json();
            
            // Filter checklist to relevant items
            const filteredItems = filterChecklist(checklistJson, categories);
            
            // Generate prompt snippet for LLM
            const promptSnippet = toPromptSnippet(filteredItems);

            auditChecklist = {
              totalFindings: findings.length,
              relevantCategories: Array.from(categories),
              checklistItems: filteredItems,
              promptSnippet: promptSnippet
            };
          }
        } catch (checklistError) {
          console.warn('Failed to fetch audit checklist:', checklistError);
          // Continue without checklist data
          auditChecklist.totalFindings = findings.length;
          auditChecklist.relevantCategories = Array.from(categories);
        }
      }

      const result: AuditorAnalysisResult = {
        success: true,
        fileName,
        analysisCompletedAt: new Date().toISOString(),
        slitherReport,
        auditChecklist
      };

      return this.createSuccessResult(result);

    } catch (error) {
      return this.createErrorResult(`Auditor analysis failed: ${error.message}`);
    }
  }
}

/**
 * Create auditor analysis tool definition
 */
export function createAuditorAnalysisTools(): RemixToolDefinition[] {
  return [
    {
      name: 'auditor_analyse',
      description: 'Run comprehensive security analysis using Slither and generate filtered audit checklist for LLM-assisted auditing. Returns both the complete Slither report and a curated checklist based on findings.',
      inputSchema: new AuditorAnalyserHandler().inputSchema,
      category: ToolCategory.ANALYSIS,
      permissions: ['analysis:scan', 'file:read', 'compile:access'],
      handler: new AuditorAnalyserHandler()
    }
  ];
}