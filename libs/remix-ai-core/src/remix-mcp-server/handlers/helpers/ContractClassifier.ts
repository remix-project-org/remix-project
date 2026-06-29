/**
 * Contract Classifier for Smart Contract Auditing Pipeline
 * Extracts contract skeleton and classifies features using structured LLM output
 */

import { z } from 'zod';

// Zod schema for structured contract classification output
export const ContractClassificationSchema = z.object({
  // Existing DeFi/Protocol patterns
  has_proxy: z.boolean().describe("Contract implements proxy patterns (UUPS, Transparent, etc.)"),
  has_erc20: z.boolean().describe("Contract implements or extends ERC20 token functionality"),
  has_erc721: z.boolean().describe("Contract implements ERC721/NFT functionality"),
  has_amm_swap: z.boolean().describe("Contract implements AMM/DEX swap functionality"),
  has_lending: z.boolean().describe("Contract implements lending/borrowing protocols"),
  has_oracle: z.boolean().describe("Contract uses price oracles or external data feeds"),
  has_governance: z.boolean().describe("Contract implements governance/voting mechanisms"),
  has_create_opcode: z.boolean().describe("Contract uses CREATE or CREATE2 opcodes for dynamic deployment"),
  has_cross_chain: z.boolean().describe("Contract implements cross-chain or bridge functionality"),
  has_staking: z.boolean().describe("Contract implements staking/delegation mechanisms"),

  // Security & Low-level patterns
  has_signatures: z.boolean().describe("Contract uses signature validation (ECRecover, ECDSA, permit functions)"),
  has_low_level: z.boolean().describe("Contract uses low-level calls (assembly, delegatecall, call)"),
  has_merkle_tree: z.boolean().describe("Contract implements Merkle tree or proof validation"),
  has_timelock: z.boolean().describe("Contract implements timelock or delay mechanisms"),
  has_centralized_control: z.boolean().describe("Contract has centralized admin controls or single points of failure"),
  has_external_calls: z.boolean().describe("Contract makes external calls to other contracts"),

  // Complexity & Integration patterns
  has_flashloan: z.boolean().describe("Contract implements or integrates with flash loan functionality"),
  has_chainlink: z.boolean().describe("Contract integrates with Chainlink price feeds or VRF"),
  has_uniswap: z.boolean().describe("Contract integrates with Uniswap V2/V3 protocol"),
  has_aave_compound: z.boolean().describe("Contract integrates with AAVE or Compound protocols"),
  has_balancer: z.boolean().describe("Contract integrates with Balancer protocol"),
  has_gnosis_safe: z.boolean().describe("Contract integrates with Gnosis Safe multisig"),

  // Technical complexity indicators
  complexity_level: z.enum(['low', 'medium', 'high']).describe("Overall contract complexity based on features and patterns"),

  // Version information
  solidity_version: z.string().describe("Solidity version (x.x.x format)"),
  oz_version: z.string().describe("OpenZeppelin version detected or 'unknown'")
});

export type ContractClassification = z.infer<typeof ContractClassificationSchema>;

export interface ContractSkeleton {
  pragma: string[];
  imports: string[];
  inheritance: string[];
  stateVariables: string[];
  functionSignatures: string[];
  events: string[];
  modifiers: string[];
}

/**
 * Extracts contract skeleton (structure without function bodies)
 * for efficient classification without sending full implementation
 */
export class ContractSkeletonExtractor {

  /**
   * Extract contract skeleton from Solidity source code
   */
  static extractSkeleton(sourceCode: string): ContractSkeleton {
    const lines = sourceCode.split('\n');
    const skeleton: ContractSkeleton = {
      pragma: [],
      imports: [],
      inheritance: [],
      stateVariables: [],
      functionSignatures: [],
      events: [],
      modifiers: []
    };

    let inContract = false;
    const contractName = '';
    let braceDepth = 0;
    let inFunction = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip empty lines and comments
      if (!line || line.startsWith('//') || line.startsWith('*') || line.startsWith('/*')) {
        continue;
      }

      // Extract pragma statements
      if (line.startsWith('pragma ')) {
        skeleton.pragma.push(line);
        continue;
      }

      // Extract imports
      if (line.startsWith('import ')) {
        skeleton.imports.push(line);
        continue;
      }

      // Detect contract declaration
      if (line.includes('contract ') || line.includes('interface ') || line.includes('library ')) {
        inContract = true;
        skeleton.inheritance.push(line);
        continue;
      }

      if (!inContract) continue;

      // Track brace depth to know when we're inside functions
      const openBraces = (line.match(/{/g) || []).length;
      const closeBraces = (line.match(/}/g) || []).length;
      braceDepth += openBraces - closeBraces;

      // Extract events
      if (line.includes('event ')) {
        skeleton.events.push(line.replace(/;$/, ''));
        continue;
      }

      // Extract modifiers (definitions, not usage)
      if (line.includes('modifier ')) {
        skeleton.modifiers.push(line);
        continue;
      }

      // Extract function signatures
      if (line.includes('function ') && !inFunction) {
        // Extract just the signature, not the body
        let signature = line;

        // Handle multi-line function declarations
        let j = i;
        while (!signature.includes('{') && !signature.includes(';') && j < lines.length - 1) {
          j++;
          signature += ' ' + lines[j].trim();
        }

        // Clean up the signature - remove body part
        if (signature.includes('{')) {
          signature = signature.substring(0, signature.indexOf('{')).trim();
        }
        if (signature.endsWith(';')) {
          signature = signature.slice(0, -1);
        }

        skeleton.functionSignatures.push(signature);

        if (line.includes('{')) {
          inFunction = true;
        }
        continue;
      }

      // Track when we exit functions
      if (inFunction && braceDepth <= 1) {
        inFunction = false;
      }

      // Extract state variables (outside functions)
      if (!inFunction && braceDepth === 1) {
        // State variables are typically type + visibility + name
        if (this.isStateVariableDeclaration(line)) {
          skeleton.stateVariables.push(line.replace(/;$/, ''));
        }
      }
    }

    return skeleton;
  }

  private static isStateVariableDeclaration(line: string): boolean {
    // Basic heuristics for state variable detection
    const trimmed = line.trim();

    // Skip function calls, returns, requires, etc.
    if (trimmed.includes('(') ||
        trimmed.startsWith('require') ||
        trimmed.startsWith('assert') ||
        trimmed.startsWith('emit') ||
        trimmed.startsWith('return') ||
        trimmed.startsWith('if') ||
        trimmed.startsWith('for') ||
        trimmed.startsWith('while') ||
        trimmed.includes('=') && !trimmed.includes('==')) {
      return false;
    }

    // Look for type declarations
    const commonTypes = [
      'uint', 'int', 'bool', 'address', 'bytes', 'string',
      'mapping', 'array', 'struct', 'enum'
    ];

    const visibilityModifiers = ['public', 'private', 'internal', 'external'];

    const hasType = commonTypes.some(type => trimmed.includes(type));
    const hasVisibility = visibilityModifiers.some(vis => trimmed.includes(vis));
    const endsWithSemicolon = trimmed.endsWith(';');

    return (hasType || hasVisibility) && endsWithSemicolon;
  }

  /**
   * Convert skeleton to string for LLM analysis
   */
  static skeletonToString(skeleton: ContractSkeleton): string {
    const parts = [
      '// === PRAGMA ===',
      ...skeleton.pragma,
      '',
      '// === IMPORTS ===',
      ...skeleton.imports,
      '',
      '// === CONTRACT DECLARATION & INHERITANCE ===',
      ...skeleton.inheritance,
      '',
      '// === STATE VARIABLES ===',
      ...skeleton.stateVariables,
      '',
      '// === EVENTS ===',
      ...skeleton.events,
      '',
      '// === MODIFIERS ===',
      ...skeleton.modifiers,
      '',
      '// === FUNCTION SIGNATURES ===',
      ...skeleton.functionSignatures
    ];

    return parts.join('\n');
  }
}

/**
 * Contract classifier using LLM with structured output
 */
export class ContractClassifier {

  /**
   * Classify contract features from skeleton
   */
  static async classifyContract(
    skeleton: ContractSkeleton,
    llmCall: (prompt: string, schema: any) => Promise<any>
  ): Promise<ContractClassification> {

    const skeletonString = ContractSkeletonExtractor.skeletonToString(skeleton);

    const prompt = `Analyze this smart contract skeleton and classify its features.

Contract Skeleton:
\`\`\`solidity
${skeletonString}
\`\`\`

Instructions:
- Only analyze what you can see in the skeleton above
- Look for inheritance patterns, state variables, and function signatures
- Detect version information from pragma and imports
- Be conservative: only mark features as true if clearly present

Focus on these patterns:

**DeFi/Protocol patterns:**
- Proxy: UUPS, Transparent, Beacon proxy patterns, upgradeable contracts
- ERC20: _transfer, _mint, balanceOf, transfer functions
- ERC721: tokenId parameters, NFT-related functions
- AMM/Swap: swap, addLiquidity, removeLiquidity functions 
- Lending: borrow, lend, repay, liquidate functions
- Oracle: price feeds, getLatestPrice, oracle interactions
- Governance: propose, vote, execute functions
- CREATE opcodes: assembly usage, factory patterns
- Cross-chain: bridge functions, cross-chain messaging
- Staking: stake, unstake, delegate functions

**Security & Low-level patterns:**
- Signatures: ecrecover, ECDSA, permit, signature validation
- Low-level: assembly blocks, delegatecall, call, staticcall
- Merkle: merkle proofs, hash validation, tree structures
- Timelock: delay mechanisms, time-based controls
- Centralized control: onlyOwner, admin functions, single points of failure
- External calls: interactions with external contracts

**Integration patterns:**
- FlashLoan: AAVE flash loans, flash mint patterns
- Chainlink: price feeds, VRF, automation
- Uniswap: V2/V3 router, pool interactions
- AAVE/Compound: lending protocol integration
- Balancer: weighted pools, vault interactions  
- Gnosis Safe: multisig integration

**Complexity indicators:**
- Low: Simple contracts with basic functionality
- Medium: Multiple features, some complexity
- High: Complex DeFi protocols, many integrations

Return a JSON object with boolean flags for each feature and version strings.`;

    const result = await llmCall(prompt, ContractClassificationSchema);
    return ContractClassificationSchema.parse(result);
  }

  /**
   * Extract Solidity version from pragma
   */
  static extractSolidityVersion(pragmaStatements: string[]): string {
    for (const pragma of pragmaStatements) {
      const match = pragma.match(/pragma\s+solidity\s+[^0-9]*([0-9]+\.[0-9]+\.[0-9]+)/);
      if (match) {
        return match[1];
      }
      // Try to extract version range and pick the minimum
      const rangeMatch = pragma.match(/pragma\s+solidity\s+[>=^~]*([0-9]+\.[0-9]+)/);
      if (rangeMatch) {
        return rangeMatch[1] + '.0';
      }
    }
    return 'unknown';
  }

  /**
   * Extract OpenZeppelin version from imports
   */
  static extractOZVersion(importStatements: string[]): string {
    for (const importStmt of importStatements) {
      if (importStmt.includes('@openzeppelin/contracts')) {
        // This is a heuristic - actual version would need package.json analysis
        return 'detected'; // Could be enhanced to detect specific version
      }
    }
    return 'unknown';
  }
}