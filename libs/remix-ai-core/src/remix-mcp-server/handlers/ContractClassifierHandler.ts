/**
 * Contract Classifier Handler for Remix MCP Server
 * Provides contract classification capabilities as MCP tools
 */

import { IMCPToolResult } from '../../types/mcp';
import { BaseToolHandler } from '../registry/RemixToolRegistry';
import { Plugin } from '@remixproject/engine';
import {
  ContractSkeletonExtractor,
  ContractClassifier,
  ContractClassification
} from './helpers/ContractClassifier';

export interface ContractClassificationResult {
  success: boolean;
  fileName: string;
  classification: ContractClassification;
  skeleton: {
    pragmaCount: number;
    importsCount: number;
    stateVariablesCount: number;
    functionSignaturesCount: number;
    eventsCount: number;
    modifiersCount: number;
  };
  analysisCompletedAt: string;
}

export class ContractClassifierHandler extends BaseToolHandler {
  name = 'classify_contract';
  description = 'Standalone contract classification: Extract contract skeleton and classify features (proxy, token standards, DeFi protocols). Use for feature analysis without full audit.';
  inputSchema = {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: 'Path to the Solidity file to classify (relative to workspace root)'
      }
    },
    required: ['filePath']
  };

  getPermissions(): string[] {
    return ['file:read'];
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

      // Read contract source code
      const sourceCode = await plugin.call('fileManager', 'getFile', args.filePath);
      if (!sourceCode || sourceCode.trim().length === 0) {
        return this.createErrorResult('File is empty or could not be read');
      }

      // Extract contract skeleton
      const skeleton = ContractSkeletonExtractor.extractSkeleton(sourceCode);

      // Mock LLM call for now - in real implementation this would use the actual LLM
      const llmCall = async (prompt: string, schema: any): Promise<ContractClassification> => {
        // This is a simplified heuristic-based classification
        // In the real implementation, this would call the actual LLM with the prompt
        return this.heuristicClassification(sourceCode, skeleton);
      };

      // Classify the contract
      const classification = await ContractClassifier.classifyContract(skeleton, llmCall);

      const result: ContractClassificationResult = {
        success: true,
        fileName: args.filePath,
        classification,
        skeleton: {
          pragmaCount: skeleton.pragma.length,
          importsCount: skeleton.imports.length,
          stateVariablesCount: skeleton.stateVariables.length,
          functionSignaturesCount: skeleton.functionSignatures.length,
          eventsCount: skeleton.events.length,
          modifiersCount: skeleton.modifiers.length
        },
        analysisCompletedAt: new Date().toISOString()
      };

      return this.createSuccessResult(result);

    } catch (error) {
      return this.createErrorResult(`Contract classification failed: ${error.message}`);
    }
  }

  /**
   * Heuristic-based classification for demonstration
   * In real implementation, this would be replaced by actual LLM call
   */
  private heuristicClassification(sourceCode: string, skeleton: any): ContractClassification {
    const code = sourceCode.toLowerCase();
    const allText = skeleton.inheritance.join(' ') + ' ' +
                   skeleton.stateVariables.join(' ') + ' ' +
                   skeleton.functionSignatures.join(' ');
    const textLower = allText.toLowerCase();

    // Count feature complexity
    let featureCount = 0;
    const features = [
      textLower.includes('upgradeable') || textLower.includes('proxy'),
      textLower.includes('erc20') || textLower.includes('erc721'),
      textLower.includes('swap') || textLower.includes('lending'),
      textLower.includes('oracle') || textLower.includes('governance'),
      textLower.includes('bridge') || textLower.includes('staking')
    ];
    featureCount = features.filter(Boolean).length;

    return {
      // DeFi/Protocol patterns
      has_proxy: textLower.includes('upgradeable') || textLower.includes('proxy') || textLower.includes('uups'),
      has_erc20: textLower.includes('erc20') || textLower.includes('transfer') && textLower.includes('balanceof'),
      has_erc721: textLower.includes('erc721') || textLower.includes('tokenid') || textLower.includes('safetransferfrom'),
      has_amm_swap: textLower.includes('swap') || textLower.includes('addliquidity') || textLower.includes('removeliquidity'),
      has_lending: textLower.includes('borrow') || textLower.includes('lend') || textLower.includes('repay') || textLower.includes('liquidate'),
      has_oracle: textLower.includes('oracle') || textLower.includes('pricefeed') || textLower.includes('chainlink') || textLower.includes('getlatestprice'),
      has_governance: textLower.includes('governance') || textLower.includes('propose') || textLower.includes('vote') || textLower.includes('execute'),
      has_create_opcode: code.includes('create2') || code.includes('new ') || textLower.includes('deploy'),
      has_cross_chain: textLower.includes('bridge') || textLower.includes('crosschain') || textLower.includes('multichain') || textLower.includes('layer'),
      has_staking: textLower.includes('stake') || textLower.includes('unstake') || textLower.includes('delegate') || textLower.includes('reward'),

      // Security & Low-level patterns
      has_signatures: textLower.includes('ecrecover') || textLower.includes('ecdsa') || textLower.includes('permit') || textLower.includes('signature'),
      has_low_level: code.includes('assembly') || textLower.includes('delegatecall') || textLower.includes('call(') || textLower.includes('staticcall'),
      has_merkle_tree: textLower.includes('merkle') || textLower.includes('proof') || textLower.includes('hash') && textLower.includes('verify'),
      has_timelock: textLower.includes('timelock') || textLower.includes('delay') || textLower.includes('timelocked'),
      has_centralized_control: textLower.includes('onlyowner') || textLower.includes('admin') || textLower.includes('owner') || textLower.includes('authority'),
      has_external_calls: textLower.includes('call(') || textLower.includes('interface') && textLower.includes('external'),

      // Integration patterns
      has_flashloan: textLower.includes('flashloan') || textLower.includes('flash') && textLower.includes('borrow'),
      has_chainlink: textLower.includes('chainlink') || textLower.includes('aggregator') || textLower.includes('vrf'),
      has_uniswap: textLower.includes('uniswap') || textLower.includes('router') || textLower.includes('v2') || textLower.includes('v3'),
      has_aave_compound: textLower.includes('aave') || textLower.includes('compound') || textLower.includes('atoken') || textLower.includes('ctoken'),
      has_balancer: textLower.includes('balancer') || textLower.includes('vault') || textLower.includes('weighted'),
      has_gnosis_safe: textLower.includes('gnosis') || textLower.includes('safe') || textLower.includes('multisig'),

      // Complexity assessment
      complexity_level: featureCount >= 3 ? 'high' : featureCount >= 1 ? 'medium' : 'low',

      // Version information
      solidity_version: this.extractSolidityVersion(skeleton.pragma),
      oz_version: this.extractOZVersion(skeleton.imports)
    };
  }

  private extractSolidityVersion(pragmaStatements: string[]): string {
    for (const pragma of pragmaStatements) {
      const match = pragma.match(/pragma\s+solidity\s+[^0-9]*([0-9]+\.[0-9]+(\.[0-9]+)?)/);
      if (match) {
        return match[1];
      }
    }
    return 'unknown';
  }

  private extractOZVersion(importStatements: string[]): string {
    for (const importStmt of importStatements) {
      if (importStmt.includes('@openzeppelin/contracts')) {
        return 'detected';
      }
    }
    return 'unknown';
  }
}

/**
 * Create contract classification tool definition
 */
export function createContractClassificationTools() {
  return [
    {
      name: 'classify_contract',
      description: 'Standalone contract feature classification: Extract contract skeleton and classify architectural patterns, token standards, DeFi protocols, and complexity indicators. Use for feature analysis without full audit workflow.',
      inputSchema: new ContractClassifierHandler().inputSchema,
      category: 'ANALYSIS' as any,
      permissions: ['file:read'],
      handler: new ContractClassifierHandler()
    }
  ];
}