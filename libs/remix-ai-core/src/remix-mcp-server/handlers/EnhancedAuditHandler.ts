/**
 * Enhanced Audit Handler for Remix MCP Server
 * Combines contract classification, Slither analysis, and intelligent checklist filtering
 */

import { IMCPToolResult } from '../../types/mcp';
import { BaseToolHandler } from '../registry/RemixToolRegistry';
import { Plugin } from '@remixproject/engine';
import { SlitherHandler } from './CodeAnalysisHandler';
import { ContractClassifierHandler, ContractClassificationResult } from './ContractClassifierHandler';
import {
  ChecklistFilterOrchestrator,
  FilteredChecklistResult
} from './helpers/ChecklistFilter';

// Slither-related types (copied from AuditorAnalyserHandler since we're switching handlers)
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

export interface SlitherScanResult {
  success: boolean;
  fileName: string;
  scanCompletedAt: string;
  analysis_result: any;
}

export interface EnhancedAuditResult {
  success: boolean;
  fileName: string;
  analysisCompletedAt: string;
  classification: ContractClassificationResult;
  slitherScanResult: SlitherScanResult | null;
  filteredChecklist: FilteredChecklistResult;
  rawMetrics: {
    totalSlitherFindings: number;
    slitherFindingsBySeverity: {
      High: number;
      Medium: number;
      Low: number;
      Informational: number;
      Optimization: number;
    };
    checklistMetrics: {
      totalItems: number;
      slitherTriggeredItems: number;
      aiOnlyItems: number;
      categoriesCovered: string[];
    };
    contractFeatures: {
      complexityIndicators: string[];
      riskFactors: string[];
      optimizationOpportunities: string[];
    };
    analysisContext: {
      hasSlitherData: boolean;
      compilationStatus: string;
      solidityVersion: string;
      usesOpenZeppelin: boolean;
    };
  };
}

export class EnhancedAuditHandler extends BaseToolHandler {
  name = 'enhanced_audit';
  description = 'COMPREHENSIVE AUDIT TOOL: Integrates classification + Slither + checklist filtering, returning structured raw data for Comprehensive Auditor intelligent synthesis. Contains embedded contract classifier.';
  inputSchema = {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: 'Path to the Solidity file to audit (relative to workspace root)'
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

      const exists = await plugin.call('fileManager', 'exists', args.filePath)
      if (!exists) {
        return this.createErrorResult(`File not found: ${args.filePath}`);
      }
      // Step 1: Contract Classification
      const classifierHandler = new ContractClassifierHandler();
      const classificationResult = await classifierHandler.execute({ filePath: args.filePath }, plugin);

      if (classificationResult.isError) {
        return classificationResult
      }

      // Parse the classification result from MCP tool result
      let classification: ContractClassificationResult;
      try {
        const resultText = classificationResult.content[0]?.text;
        if (!resultText) {
          return this.createErrorResult('Contract classification returned no data');
        }
        classification = JSON.parse(resultText);
        if (!classification.success) {
          return this.createErrorResult('Contract classification failed');
        }
      } catch (error) {
        return this.createErrorResult(`Failed to parse classification result: ${error.message}`);
      }

      // Step 2: Run Slither analysis using CodeAnalysisHandler
      const slitherResult = await this.runSlitherAnalysisWithCodeHandler(args, plugin);

      // Step 3: Apply intelligent checklist filtering
      let filteredChecklist: FilteredChecklistResult;
      try {
        // Extract detectors from SlitherScanResult format
        const slitherFindings = this.extractSlitherDetectors(slitherResult);
        filteredChecklist = await ChecklistFilterOrchestrator.filterChecklist(
          classification.classification,
          slitherFindings
        );
      } catch (error) {
        console.warn('Checklist filtering failed, using fallback:', error.message);
        // Fallback to basic structure if filtering fails
        filteredChecklist = {
          totalItems: 0,
          slitherTriggeredItems: [],
          aiOnlyItems: [],
          filteredCategories: [],
          filterSummary: {
            appliedStaticFilters: ['Checklist filtering unavailable'],
            slitherDetectorsMatched: [],
            itemsFilteredOut: 0
          }
        };
      }

      // Step 4: Generate raw metrics for LLM analysis
      const rawMetrics = this.generateRawMetrics(
        classification,
        slitherResult,
        filteredChecklist
      );

      const result: EnhancedAuditResult = {
        success: true,
        fileName: classification.fileName,
        analysisCompletedAt: new Date().toISOString(),
        classification,
        slitherScanResult: slitherResult,
        filteredChecklist,
        rawMetrics
      };

      return this.createSuccessResult(result);

    } catch (error) {
      return this.createErrorResult(`Enhanced audit failed: ${error.message}`);
    }
  }

  /**
   * Run Slither analysis using CodeAnalysisHandler (SlitherHandler)
   */
  private async runSlitherAnalysisWithCodeHandler(
    args: { filePath: string; includeOptimizations?: boolean; minSeverity?: string },
    plugin: Plugin
  ): Promise<SlitherScanResult | null> {
    try {
      // Use the SlitherHandler from CodeAnalysisHandler
      const slitherHandler = new SlitherHandler();

      // Map our args to the slither handler's expected format
      const slitherArgs = {
        filePath: args.filePath
      };

      // Execute the slither scan
      const result = await slitherHandler.execute(slitherArgs, plugin);

      if (result.isError) {
        console.warn('Slither scan failed:', result.content[0]?.text || 'Unknown error');
        return null;
      }

      // Parse the result from MCP tool result format
      try {
        const resultText = result.content[0]?.text;
        if (!resultText) {
          console.warn('Slither scan returned no data');
          return null;
        }

        const slitherResult = JSON.parse(resultText) as SlitherScanResult;
        if (!slitherResult.success) {
          console.warn('Slither scan was not successful');
          return null;
        }

        return slitherResult;

      } catch (parseError) {
        console.warn('Failed to parse Slither scan result:', parseError.message);
        return null;
      }

    } catch (error) {
      console.warn('Slither scan failed:', error.message);
      return null;
    }
  }

  /**
   * Extract Slither detectors from SlitherScanResult format
   */
  private extractSlitherDetectors(slitherResult: SlitherScanResult | null): SlitherDetector[] {
    if (!slitherResult || !slitherResult.analysis_result) {
      return [];
    }

    try {
      // Parse the analysis_result which should contain the Slither JSON output
      const analysisData = typeof slitherResult.analysis_result === 'string'
        ? JSON.parse(slitherResult.analysis_result)
        : slitherResult.analysis_result;

      // Extract detectors from the Slither analysis format
      if (analysisData && analysisData.results && Array.isArray(analysisData.results.detectors)) {
        return analysisData.results.detectors as SlitherDetector[];
      }

      return [];
    } catch (error) {
      console.warn('Failed to extract Slither detectors:', error.message);
      return [];
    }
  }

  /**
   * Generate raw metrics and structured data for LLM analysis
   */
  private generateRawMetrics(
    classification: ContractClassificationResult,
    slitherResult: SlitherScanResult | null,
    filteredChecklist: FilteredChecklistResult
  ) {
    const slitherFindings = this.extractSlitherDetectors(slitherResult);

    // Count findings by severity
    const severityCounts = {
      High: slitherFindings.filter(f => f.impact === 'High').length,
      Medium: slitherFindings.filter(f => f.impact === 'Medium').length,
      Low: slitherFindings.filter(f => f.impact === 'Low').length,
      Informational: slitherFindings.filter(f => f.impact === 'Informational').length,
      Optimization: slitherFindings.filter(f => f.impact === 'Optimization').length,
    };

    // Identify complexity indicators based on contract features
    const complexityIndicators: string[] = [];
    const riskFactors: string[] = [];
    const optimizationOpportunities: string[] = [];

    const features = classification.classification;

    if (features.has_proxy) {
      complexityIndicators.push('Proxy pattern implementation');
      riskFactors.push('Upgrade mechanism security');
    }

    if (features.has_erc20 || features.has_erc721) {
      complexityIndicators.push('Token standard implementation');
      optimizationOpportunities.push('Token transfer optimizations');
    }

    if (features.has_amm_swap || features.has_lending) {
      complexityIndicators.push('DeFi protocol complexity');
      riskFactors.push('Economic attack vectors');
      riskFactors.push('Price manipulation risks');
    }

    if (features.has_oracle) {
      riskFactors.push('Oracle dependency risks');
      riskFactors.push('Price feed reliability');
    }

    if (features.has_governance) {
      complexityIndicators.push('Governance mechanisms');
      riskFactors.push('Centralization risks');
      riskFactors.push('Vote manipulation possibilities');
    }

    if (features.has_cross_chain) {
      complexityIndicators.push('Cross-chain functionality');
      riskFactors.push('Bridge security concerns');
    }

    if (features.has_staking) {
      complexityIndicators.push('Staking mechanisms');
      riskFactors.push('Reward calculation accuracy');
    }

    // Analysis context flags
    const analysisContext = {
      hasSlitherData: slitherResult !== null,
      compilationStatus: slitherResult ? 'compiled' : 'not_compiled',
      solidityVersion: features.solidity_version,
      usesOpenZeppelin: features.oz_version !== 'unknown'
    };

    return {
      totalSlitherFindings: slitherFindings.length,
      slitherFindingsBySeverity: severityCounts,
      checklistMetrics: {
        totalItems: filteredChecklist.totalItems,
        slitherTriggeredItems: filteredChecklist.slitherTriggeredItems.length,
        aiOnlyItems: filteredChecklist.aiOnlyItems.length,
        categoriesCovered: filteredChecklist.filteredCategories
      },
      contractFeatures: {
        complexityIndicators,
        riskFactors,
        optimizationOpportunities
      },
      analysisContext
    };
  }
}

/**
 * Create enhanced audit tool definition
 */
export function createEnhancedAuditTools() {
  return [
    {
      name: 'enhanced_audit',
      description: 'COMPREHENSIVE AUDIT ORCHESTRATION: All-in-one audit tool that integrates contract classification, Slither analysis, and intelligent checklist filtering. Returns structured raw data for Comprehensive Auditor intelligent synthesis. Exclusive to audit workflows.',
      inputSchema: new EnhancedAuditHandler().inputSchema,
      category: 'ANALYSIS' as any,
      permissions: ['analysis:scan', 'file:read', 'compile:access'],
      handler: new EnhancedAuditHandler()
    }
  ];
}