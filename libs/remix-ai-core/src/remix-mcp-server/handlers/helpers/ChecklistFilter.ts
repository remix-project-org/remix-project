/* eslint-disable no-prototype-builtins */
/**
 * Enhanced Checklist Filtering Utilities for Smart Contract Auditing Pipeline
 * Builds on existing SlitherAnalisysMapping.ts with additional classification-based filtering
 */

import { ContractClassification } from './ContractClassifier';
import { SlitherDetector } from '../EnhancedAuditHandler';
import {
  Category,
  ChecklistItem
} from './SlitherAnalisysMapping';

export interface FilteredChecklistResult {
  totalItems: number;
  slitherTriggeredItems: ChecklistItemWithContext[];
  aiOnlyItems: ChecklistItemWithContext[];
  filteredCategories: string[];
  filterSummary: {
    appliedStaticFilters: string[];
    slitherDetectorsMatched: string[];
    itemsFilteredOut: number;
  };
}

export interface ChecklistItemWithContext extends ChecklistItem {
  slitherTriggered: boolean;
  matchedDetectors?: string[];
  filterReason?: string;
}

/**
 * Enhanced detector-to-checklist mapping with comprehensive coverage
 * Maps Slither detector names to Cyfrin audit checklist item IDs
 */
export const DETECTOR_TO_CHECKLIST_MAPPING: Record<string, string[]> = {
  // === REENTRANCY ATTACKS ===
  'reentrancy-eth': ['SOL-AM-ReentrancyAttack-1', 'SOL-AM-ReentrancyAttack-2'],
  'reentrancy-no-eth': ['SOL-AM-ReentrancyAttack-1'],
  'reentrancy-benign': ['SOL-AM-ReentrancyAttack-1'],
  'reentrancy-events': ['SOL-AM-ReentrancyAttack-1'],
  'reentrancy-unlimited-gas': ['SOL-AM-ReentrancyAttack-2'],

  // === ACCESS CONTROL & AUTHORIZATION ===
  'tx-origin': ['SOL-Basics-AC-7'],
  'suicidal': ['SOL-Basics-VI-EAI-1', 'SOL-Basics-AC-2'],
  'arbitrary-send-eth': ['SOL-Basics-Payment-1', 'SOL-Basics-AC-3'],
  'controlled-delegatecall': ['SOL-Basics-PU-6', 'SOL-LL-3'],
  'unprotected-upgrade': ['SOL-Basics-AC-1', 'SOL-CR-1'],
  'missing-access-control': ['SOL-Basics-AC-4', 'SOL-Basics-AC-5'],
  'incorrect-modifier': ['SOL-Basics-AC-6'],
  'authorization-through-tx-origin': ['SOL-Basics-AC-7'],

  // === MATHEMATICAL OPERATIONS ===
  'divide-before-multiply': ['SOL-Basics-Math-4'],
  'integer-overflow': ['SOL-Basics-Math-1'],
  'tautology': ['SOL-Basics-Math-5'],
  'incorrect-shift': ['SOL-Basics-Math-6'],
  'math-weak-prng': ['SOL-Basics-Math-7'],
  'dangerous-strict-equalities': ['SOL-Basics-Math-8'],
  'too-many-digits': ['SOL-Basics-Math-9'],
  'math-encode-packed-collision': ['SOL-Basics-Math-10'],
  'incorrect-operator': ['SOL-Basics-Math-11'],
  'void-cst': ['SOL-Basics-Math-12'],

  // === TIMESTAMP & RANDOMNESS MANIPULATION ===
  'timestamp': ['SOL-AM-MA-1', 'SOL-Heuristics-15'],
  'weak-prng': ['SOL-AM-MA-2', 'SOL-AM-MA-3'],
  'block-timestamp': ['SOL-AM-MA-1', 'SOL-Heuristics-16'],

  // === PRICE MANIPULATION & ORACLE ATTACKS ===
  'price-manipulation': ['SOL-AM-PMA-1', 'SOL-AM-PMA-2'],
  'oracle-price-manipulation': ['SOL-Defi-Oracle-1', 'SOL-Defi-Oracle-2'],
  'chainlink-oracle': ['SOL-Integrations-Chainlink-CCIP-1', 'SOL-Defi-Oracle-3'],

  // === INITIALIZATION ISSUES ===
  'uninitialized-local': ['SOL-Basics-Initialization-1'],
  'uninitialized-state': ['SOL-Basics-Initialization-2'],
  'uninitialized-storage': ['SOL-Basics-Initialization-3'],
  'missing-zero-check-init': ['SOL-Basics-Initialization-1', 'SOL-Signature-2'],

  // === EXTERNAL CALLS & RETURN VALUES ===
  'unchecked-lowlevel': ['SOL-EC-1'],
  'unchecked-send': ['SOL-Basics-Payment-2', 'SOL-EC-2'],
  'low-level-calls': ['SOL-EC-3', 'SOL-LL-2', 'SOL-AM-DOSA-5', 'SOL-Heuristics-14'],
  'missing-zero-check-ec': ['SOL-EC-4'],
  'unused-return': ['SOL-EC-5'],
  'incorrect-return': ['SOL-EC-6', 'SOL-LL-5'],
  'calls-loop': ['SOL-EC-7', 'SOL-AM-DOSA-1', 'SOL-Heuristics-10'],
  'delegatecall-loop': ['SOL-EC-8', 'SOL-LL-3'],
  'msg-value-loop': ['SOL-EC-9'],
  'multiple-calls-same-transaction': ['SOL-EC-10'],
  'return-bomb': ['SOL-EC-11'],
  'out-of-order-retryable': ['SOL-EC-12'],
  'chainlink-feed-registry': ['SOL-EC-13'],
  'ec-encode-packed-collision': ['SOL-EC-14', 'SOL-HMT-1'],

  // === DENIAL OF SERVICE (DOS) ===
  'dos-calls-loop': ['SOL-AM-DOSA-1'],
  'costly-loop': ['SOL-AM-DOSA-2', 'SOL-AM-GA-1', 'SOL-Heuristics-11'],
  'locked-ether': ['SOL-AM-DOSA-3', 'SOL-Basics-Payment-3'],
  'block-gas-limit': ['SOL-AM-DOSA-4'],
  'dos-low-level-calls': ['SOL-AM-DOSA-5'],
  'external-function': ['SOL-AM-DOSA-6', 'SOL-Heuristics-5'],

  // === DONATION ATTACKS ===
  'incorrect-equality': ['SOL-AM-DA-1'],
  'donation-strict-equalities': ['SOL-AM-DA-1'],

  // === FRONT-RUNNING ATTACKS ===
  'front-running': ['SOL-AM-FrA-1', 'SOL-AM-FrA-2'],
  'tx-order-dependence': ['SOL-AM-FrA-3'],
  'race-condition': ['SOL-AM-FrA-4'],

  // === GRIEFING ATTACKS ===
  'griefing': ['SOL-AM-GA-1', 'SOL-AM-GA-2'],
  'griefing-costly-loop': ['SOL-AM-GA-1'],

  // === REPLAY ATTACKS ===
  'replay-attack': ['SOL-AM-ReplayAttack-1', 'SOL-AM-ReplayAttack-2', 'SOL-Signature-5'],
  'missing-nonce': ['SOL-AM-ReplayAttack-1'],
  'weak-signature': ['SOL-AM-ReplayAttack-2', 'SOL-Signature-4'],

  // === SANDWICH ATTACKS ===
  'sandwich-attack': ['SOL-AM-SandwichAttack-1'],
  'slippage': ['SOL-AM-SandwichAttack-1'],

  // === SYBIL ATTACKS ===
  'sybil-attack': ['SOL-AM-SybilAttack-1'],

  // === SIGNATURE VULNERABILITIES ===
  'ecrecover': ['SOL-Signature-1'],
  'signature-zero-check': ['SOL-Signature-2'],
  'signature-malleability': ['SOL-Signature-3'],
  'signature-weak': ['SOL-Signature-4'],
  'signature-replay': ['SOL-Signature-5'],

  // === LOW-LEVEL OPERATIONS ===
  'assembly': ['SOL-LL-1', 'SOL-Heuristics-13'],
  'll-low-level-calls': ['SOL-LL-2'],
  'll-delegatecall-loop': ['SOL-LL-3'],
  'll-controlled-delegatecall': ['SOL-LL-4'],
  'll-incorrect-return': ['SOL-LL-5'],

  // === HASH & MERKLE TREE ===
  'hash-encode-packed-collision': ['SOL-HMT-1'],
  'hash-collision': ['SOL-HMT-2'],
  'merkle-proof': ['SOL-HMT-3'],
  'incorrect-merkle': ['SOL-HMT-4'],
  'weak-hash': ['SOL-HMT-5'],

  // === CENTRALIZATION RISKS ===
  'centralized-risk': ['SOL-CR-1'],
  'single-point-failure': ['SOL-CR-2'],
  'admin-privileges': ['SOL-CR-3'],
  'upgradeable-proxy': ['SOL-CR-4'],
  'time-based-control': ['SOL-CR-5'],
  'multisig-threshold': ['SOL-CR-6'],
  'governance-attack': ['SOL-CR-7'],

  // === TIMELOCK VULNERABILITIES ===
  'timelock-bypass': ['SOL-Timelock-1'],
  'weak-timelock': ['SOL-Timelock-1'],

  // === ERC20 TOKEN ISSUES ===
  'erc20-interface': ['SOL-Token-FE-1', 'SOL-Token-FE-2'],
  'token-zero-check': ['SOL-Token-FE-3'],
  'incorrect-erc20': ['SOL-Token-FE-4'],
  'transfer-return': ['SOL-Token-FE-5'],
  'approve-race': ['SOL-Token-FE-6'],
  'token-balance': ['SOL-Token-FE-7'],
  'fee-on-transfer': ['SOL-Token-FE-8'],
  'deflationary-token': ['SOL-Token-FE-9'],
  'pausable-token': ['SOL-Token-FE-10'],
  'blacklist-token': ['SOL-Token-FE-11'],
  'permit-signature': ['SOL-Token-FE-12'],
  'proxy-token': ['SOL-Token-FE-13'],
  'multi-token': ['SOL-Token-FE-14'],
  'token-metadata': ['SOL-Token-FE-15'],
  'burning-token': ['SOL-Token-FE-16'],

  // === ERC721/NFT TOKEN ISSUES ===
  'erc721-interface': ['SOL-Token-NfE1-1'],
  'nft-transfer': ['SOL-Token-NfE1-2'],
  'missing-approval': ['SOL-Token-NfE1-3'],
  'unsafe-nft-mint': ['SOL-Token-NfE1-4'],
  'nft-metadata': ['SOL-Token-NfE1-5'],
  'nft-enumerable': ['SOL-Token-NfE1-6'],
  'nft-royalty': ['SOL-Token-NfE1-7'],
  'nft-burning': ['SOL-Token-NfE1-8'],

  // === DEFI PROTOCOL VULNERABILITIES ===
  // Lending
  'flash-loan-attack': ['SOL-Defi-Lending-1', 'SOL-Defi-FlashLoan-1'],
  'liquidation-risk': ['SOL-Defi-Lending-2'],
  'interest-rate': ['SOL-Defi-Lending-3'],
  'collateral-ratio': ['SOL-Defi-Lending-4'],
  'borrowing-limit': ['SOL-Defi-Lending-5'],
  'compound-rate': ['SOL-Defi-Lending-6'],
  'aave-integration': ['SOL-Defi-Lending-7'],
  'lending-pool': ['SOL-Defi-Lending-8'],
  'overcollateralization': ['SOL-Defi-Lending-9'],
  'debt-ceiling': ['SOL-Defi-Lending-10'],
  'liquidation-threshold': ['SOL-Defi-Lending-11'],
  'health-factor': ['SOL-Defi-Lending-12'],

  // AMM/Swap
  'amm-slippage': ['SOL-Defi-AS-1'],
  'uniswap-integration': ['SOL-Defi-AS-2'],
  'liquidity-manipulation': ['SOL-Defi-AS-3'],
  'impermanent-loss': ['SOL-Defi-AS-4'],
  'swap-deadline': ['SOL-Defi-AS-5'],
  'minimum-output': ['SOL-Defi-AS-6'],
  'pool-manipulation': ['SOL-Defi-AS-7'],
  'sandwich-protection': ['SOL-Defi-AS-8'],
  'mev-protection': ['SOL-Defi-AS-9'],
  'oracle-manipulation': ['SOL-Defi-AS-10'],
  'flash-swap': ['SOL-Defi-AS-11'],
  'concentrated-liquidity': ['SOL-Defi-AS-12'],
  'tick-manipulation': ['SOL-Defi-AS-13'],
  'fee-manipulation': ['SOL-Defi-AS-14'],

  // === HEURISTICS & CODE QUALITY ===
  'unused-state': ['SOL-Heuristics-1'],
  'solc-version': ['SOL-Heuristics-2'],
  'pragma': ['SOL-Heuristics-3'],
  'naming-convention': ['SOL-Heuristics-4'],
  'heuristics-external-function': ['SOL-Heuristics-5'],
  'constable-states': ['SOL-Heuristics-6'],
  'constant-function': ['SOL-Heuristics-7'],
  'similar-names': ['SOL-Heuristics-8'],
  'heuristics-too-many-digits': ['SOL-Heuristics-9'],
  'heuristics-calls-loop': ['SOL-Heuristics-10'],
  'heuristics-costly-loop': ['SOL-Heuristics-11'],
  'redundant-statements': ['SOL-Heuristics-12'],
  'heuristics-assembly': ['SOL-Heuristics-13'],
  'heuristics-low-level-calls': ['SOL-Heuristics-14'],
  'heuristics-timestamp': ['SOL-Heuristics-15'],
  'heuristics-block-timestamp': ['SOL-Heuristics-16'],
  'deprecated-standards': ['SOL-Heuristics-17'],

  // === EVENTS & LOGGING ===
  'missing-events-access': ['SOL-Basics-Event-1'],
  'missing-events-arithmetic': ['SOL-Basics-Event-2'],

  // === PAYMENT & ETHER HANDLING ===
  'payment-arbitrary-send-eth': ['SOL-Basics-Payment-1'],
  'payment-unchecked-send': ['SOL-Basics-Payment-2'],
  'payment-locked-ether': ['SOL-Basics-Payment-3'],
  'ether-stuck': ['SOL-Basics-Payment-4'],
  'missing-withdrawal': ['SOL-Basics-Payment-5'],
  'incorrect-withdrawal': ['SOL-Basics-Payment-6'],
  'payment-reentrancy-eth': ['SOL-Basics-Payment-7'],
};

/**
 * Precise checklist ID-based filtering for optimal performance
 */
interface ChecklistItemFilter {
  ids: string[];
  condition: (classification: ContractClassification) => boolean;
  description: string;
}

/**
 * Static filtering rules based on contract classification
 */
export class StaticChecklistFilter {

  // Pre-computed filter rules for maximum performance
  private static readonly FILTER_RULES: ChecklistItemFilter[] = [
    // Proxy/Upgradability
    {
      ids: ['SOL-Basics-AC-1', 'SOL-CR-1', 'SOL-CR-4'],
      condition: (c) => !c.has_proxy,
      description: 'Filtered out Proxy/Upgradable items (has_proxy: false)'
    },

    // Token Standards
    {
      ids: ['SOL-Token-FE-1', 'SOL-Token-FE-2', 'SOL-Token-FE-3', 'SOL-Token-FE-4', 'SOL-Token-FE-5', 'SOL-Token-FE-6', 'SOL-Token-FE-7', 'SOL-Token-FE-8', 'SOL-Token-FE-9', 'SOL-Token-FE-10', 'SOL-Token-FE-11', 'SOL-Token-FE-12', 'SOL-Token-FE-13', 'SOL-Token-FE-14', 'SOL-Token-FE-15', 'SOL-Token-FE-16'],
      condition: (c) => !c.has_erc20,
      description: 'Filtered out ERC20 token items (has_erc20: false)'
    },

    {
      ids: ['SOL-Token-NfE1-1', 'SOL-Token-NfE1-2', 'SOL-Token-NfE1-3', 'SOL-Token-NfE1-4', 'SOL-Token-NfE1-5', 'SOL-Token-NfE1-6', 'SOL-Token-NfE1-7', 'SOL-Token-NfE1-8'],
      condition: (c) => !c.has_erc721,
      description: 'Filtered out ERC721/NFT items (has_erc721: false)'
    },

    // DeFi Protocols
    {
      ids: ['SOL-Defi-AS-1', 'SOL-Defi-AS-2', 'SOL-Defi-AS-3', 'SOL-Defi-AS-4', 'SOL-Defi-AS-5', 'SOL-Defi-AS-6', 'SOL-Defi-AS-7', 'SOL-Defi-AS-8', 'SOL-Defi-AS-9', 'SOL-Defi-AS-10', 'SOL-Defi-AS-11', 'SOL-Defi-AS-12', 'SOL-Defi-AS-13', 'SOL-Defi-AS-14'],
      condition: (c) => !c.has_amm_swap,
      description: 'Filtered out AMM/Swap items (has_amm_swap: false)'
    },

    {
      ids: ['SOL-Defi-Lending-1', 'SOL-Defi-Lending-2', 'SOL-Defi-Lending-3', 'SOL-Defi-Lending-4', 'SOL-Defi-Lending-5', 'SOL-Defi-Lending-6', 'SOL-Defi-Lending-7', 'SOL-Defi-Lending-8', 'SOL-Defi-Lending-9', 'SOL-Defi-Lending-10', 'SOL-Defi-Lending-11', 'SOL-Defi-Lending-12'],
      condition: (c) => !c.has_lending,
      description: 'Filtered out Lending items (has_lending: false)'
    },

    {
      ids: ['SOL-Defi-Oracle-1', 'SOL-Defi-Oracle-2', 'SOL-Defi-Oracle-3', 'SOL-Defi-Oracle-4', 'SOL-Defi-Oracle-5', 'SOL-Defi-Oracle-6', 'SOL-Defi-Oracle-7', 'SOL-Defi-Oracle-8', 'SOL-Defi-Oracle-9', 'SOL-Defi-Oracle-10', 'SOL-Defi-Oracle-11', 'SOL-Defi-Oracle-12', 'SOL-Defi-Oracle-13', 'SOL-Defi-Oracle-14', 'SOL-AM-PMA-1', 'SOL-AM-PMA-2'],
      condition: (c) => !c.has_oracle,
      description: 'Filtered out Oracle/Price Manipulation items (has_oracle: false)'
    },

    // Governance & Staking
    {
      ids: ['SOL-AM-SybilAttack-1', 'SOL-CR-7'],
      condition: (c) => !c.has_governance,
      description: 'Filtered out Governance items (has_governance: false)'
    },

    {
      ids: ['SOL-Defi-Staking-1', 'SOL-Defi-Staking-2', 'SOL-Defi-Staking-3'],
      condition: (c) => !c.has_staking,
      description: 'Filtered out Staking items (has_staking: false)'
    },

    // Cross-chain
    {
      ids: ['SOL-McCc-1', 'SOL-McCc-2', 'SOL-McCc-3', 'SOL-McCc-4', 'SOL-McCc-5', 'SOL-McCc-6', 'SOL-McCc-7', 'SOL-McCc-8', 'SOL-McCc-9', 'SOL-McCc-10', 'SOL-McCc-11', 'SOL-McCc-12', 'SOL-McCc-13'],
      condition: (c) => !c.has_cross_chain,
      description: 'Filtered out Cross-chain items (has_cross_chain: false)'
    },

    // Security Patterns
    {
      ids: ['SOL-Signature-1', 'SOL-Signature-2', 'SOL-Signature-3', 'SOL-Signature-4', 'SOL-Signature-5'],
      condition: (c) => !c.has_signatures,
      description: 'Filtered out Signature items (has_signatures: false)'
    },

    {
      ids: ['SOL-LL-1', 'SOL-LL-2', 'SOL-LL-3', 'SOL-LL-4', 'SOL-LL-5'],
      condition: (c) => !c.has_low_level,
      description: 'Filtered out Low Level items (has_low_level: false)'
    },

    {
      ids: ['SOL-HMT-1', 'SOL-HMT-2', 'SOL-HMT-3', 'SOL-HMT-4', 'SOL-HMT-5'],
      condition: (c) => !c.has_merkle_tree,
      description: 'Filtered out Hash/Merkle Tree items (has_merkle_tree: false)'
    },

    {
      ids: ['SOL-Timelock-1'],
      condition: (c) => !c.has_timelock,
      description: 'Filtered out Timelock items (has_timelock: false)'
    },

    {
      ids: ['SOL-CR-1', 'SOL-CR-2', 'SOL-CR-3', 'SOL-CR-5', 'SOL-CR-6'],
      condition: (c) => !c.has_centralized_control,
      description: 'Filtered out Centralization Risk items (has_centralized_control: false)'
    },

    {
      ids: ['SOL-EC-1', 'SOL-EC-2', 'SOL-EC-3', 'SOL-EC-4', 'SOL-EC-5', 'SOL-EC-6', 'SOL-EC-7', 'SOL-EC-8', 'SOL-EC-9', 'SOL-EC-10', 'SOL-EC-11', 'SOL-EC-12', 'SOL-EC-13', 'SOL-EC-14'],
      condition: (c) => !c.has_external_calls,
      description: 'Filtered out External Call items (has_external_calls: false)'
    },

    // Integration-specific
    {
      ids: ['SOL-Defi-FlashLoan-1', 'SOL-Defi-FlashLoan-2'],
      condition: (c) => !c.has_flashloan,
      description: 'Filtered out FlashLoan items (has_flashloan: false)'
    },

    {
      ids: ['SOL-Integrations-Chainlink-CCIP-1', 'SOL-Integrations-Chainlink-CCIP-2', 'SOL-Integrations-Chainlink-CCIP-3', 'SOL-Integrations-Chainlink-CCIP-4', 'SOL-Integrations-Chainlink-CCIP-5', 'SOL-Integrations-Chainlink-CCIP-6', 'SOL-Integrations-Chainlink-CCIP-7', 'SOL-Integrations-Chainlink-CCIP-8', 'SOL-Integrations-Chainlink-VRF-1', 'SOL-Integrations-Chainlink-VRF-2', 'SOL-Integrations-Chainlink-VRF-3', 'SOL-Integrations-Chainlink-VRF-4'],
      condition: (c) => !c.has_chainlink,
      description: 'Filtered out Chainlink items (has_chainlink: false)'
    },

    {
      ids: ['SOL-Integrations-Uniswap-1', 'SOL-Integrations-Uniswap-2', 'SOL-Integrations-Uniswap-3', 'SOL-Integrations-Uniswap-4', 'SOL-Integrations-Uniswap-5', 'SOL-Integrations-Uniswap-6', 'SOL-Integrations-Uniswap-7', 'SOL-Integrations-Uniswap-8', 'SOL-Integrations-Uniswap-9', 'SOL-Integrations-Uniswap-10'],
      condition: (c) => !c.has_uniswap,
      description: 'Filtered out Uniswap items (has_uniswap: false)'
    },

    {
      ids: ['SOL-Integrations-AC-1', 'SOL-Integrations-AC-2', 'SOL-Integrations-AC-3', 'SOL-Integrations-AC-4', 'SOL-Integrations-AC-5', 'SOL-Integrations-AC-6', 'SOL-Integrations-AC-7', 'SOL-Integrations-AC-8', 'SOL-Integrations-AC-9'],
      condition: (c) => !c.has_aave_compound,
      description: 'Filtered out AAVE/Compound items (has_aave_compound: false)'
    },

    {
      ids: ['SOL-Integrations-Balancer-1', 'SOL-Integrations-Balancer-2', 'SOL-Integrations-Balancer-3', 'SOL-Integrations-Balancer-4'],
      condition: (c) => !c.has_balancer,
      description: 'Filtered out Balancer items (has_balancer: false)'
    },

    {
      ids: ['SOL-Integrations-GS-1', 'SOL-Integrations-GS-2'],
      condition: (c) => !c.has_gnosis_safe,
      description: 'Filtered out Gnosis Safe items (has_gnosis_safe: false)'
    },

    // Complexity-based
    {
      ids: ['SOL-Heuristics-1', 'SOL-Heuristics-2', 'SOL-Heuristics-3', 'SOL-Heuristics-4', 'SOL-Heuristics-5', 'SOL-Heuristics-6', 'SOL-Heuristics-7', 'SOL-Heuristics-8', 'SOL-Heuristics-9', 'SOL-Heuristics-10', 'SOL-Heuristics-11', 'SOL-Heuristics-12', 'SOL-Heuristics-13', 'SOL-Heuristics-14', 'SOL-Heuristics-15', 'SOL-Heuristics-16', 'SOL-Heuristics-17'],
      condition: (c) => c.complexity_level === 'low',
      description: 'Filtered out Heuristics items (complexity_level: low)'
    },

    // Contract structure-based filtering - NEW!
    {
      ids: ['SOL-Basics-AC-6'], // "Does the contract inherit others?"
      condition: (c) => c.complexity_level === 'low', // No inheritance means low complexity
      description: 'Filtered out inheritance check (simple contract)'
    },

    // Version-based overflow/underflow filtering for Solidity 0.8+
    {
      ids: ['SOL-Basics-Math-1'], // integer overflow in pre-0.8
      condition: (c) => c.solidity_version.startsWith('0.8') || this.compareVersions(c.solidity_version, '0.8.0') >= 0,
      description: 'Filtered out pre-0.8 overflow items (solidity_version >= 0.8)'
    }
  ];

  /**
   * Apply optimized classification-based static filters
   */
  static applyStaticFilters(
    checklistItems: Category[],
    classification: ContractClassification
  ): { filteredItems: Category[], appliedFilters: string[] } {

    const appliedFilters: string[] = [];
    const filteredOutIds = new Set<string>();

    // Apply filters with early termination
    for (const rule of this.FILTER_RULES) {
      if (rule.condition(classification)) {
        rule.ids.forEach(id => filteredOutIds.add(id));
        appliedFilters.push(rule.description);
      }
    }

    // Early return if nothing to filter
    if (filteredOutIds.size === 0) {
      return { filteredItems: checklistItems, appliedFilters };
    }

    // Efficient filtering using Set lookup
    const filteredItems = this.filterItemsByIds(checklistItems, filteredOutIds);

    return { filteredItems, appliedFilters };
  }

  /**
   * Efficiently filter checklist items by IDs using Set-based lookup
   */
  private static filterItemsByIds(categories: Category[], filteredOutIds: Set<string>): Category[] {
    const filterCategory = (category: Category): Category | null => {
      if (Array.isArray(category.data) && category.data.length > 0) {
        // Check if data contains checklist items or subcategories
        if (category.data[0].hasOwnProperty('question')) {
          // These are checklist items - filter by ID
          const items = category.data as ChecklistItem[];
          const filteredItems = items.filter(item => !filteredOutIds.has(item.id));

          if (filteredItems.length === 0) {
            return null; // Filter out entire category if no items remain
          }

          return {
            ...category,
            data: filteredItems
          };
        } else {
          // These are subcategories - recursively filter
          const subcategories = category.data as Category[];
          const filteredSubcategories = subcategories
            .map(sub => filterCategory(sub))
            .filter(sub => sub !== null) as Category[];

          if (filteredSubcategories.length === 0) {
            return null; // Filter out entire category if no subcategories remain
          }

          return {
            ...category,
            data: filteredSubcategories
          };
        }
      }

      return category; // Return as-is if no data to filter
    };

    return categories
      .map(category => filterCategory(category))
      .filter(category => category !== null) as Category[];
  }

  private static compareVersions(a: string, b: string): number {
    const parseVersion = (v: string) => v.split('.').map(Number);
    const versionA = parseVersion(a);
    const versionB = parseVersion(b);

    for (let i = 0; i < Math.max(versionA.length, versionB.length); i++) {
      const partA = versionA[i] || 0;
      const partB = versionB[i] || 0;
      if (partA !== partB) return partA - partB;
    }
    return 0;
  }
}

/**
 * Slither-based checklist item matcher
 */
export class SlitherChecklistMatcher {

  /**
   * Mark checklist items as Slither-triggered or AI-only
   */
  static matchSlitherFindings(
    checklistItems: any[],
    slitherFindings: SlitherDetector[]
  ): ChecklistItemWithContext[] {

    const detectorNames = slitherFindings.map(f => f.check);
    const matchedItems: ChecklistItemWithContext[] = [];

    for (const item of checklistItems) {
      const matchedDetectors: string[] = [];

      // Check if this checklist item is matched by any Slither detector
      for (const detectorName of detectorNames) {
        const mappedItems = DETECTOR_TO_CHECKLIST_MAPPING[detectorName] || [];
        if (mappedItems.includes(item.id)) {
          matchedDetectors.push(detectorName);
        }
      }

      matchedItems.push({
        ...item,
        slitherTriggered: matchedDetectors.length > 0,
        matchedDetectors: matchedDetectors.length > 0 ? matchedDetectors : undefined,
        filterReason: matchedDetectors.length > 0
          ? `Matched by Slither detectors: ${matchedDetectors.join(', ')}`
          : 'AI-only analysis required'
      });
    }

    return matchedItems;
  }
}

/**
 * Main checklist filtering orchestrator
 */
export class ChecklistFilterOrchestrator {

  /**
   * Apply complete two-stage filtering process
   */
  static async filterChecklist(
    classification: ContractClassification,
    slitherFindings: SlitherDetector[]
  ): Promise<FilteredChecklistResult> {

    // Step 1: Fetch the Cyfrin audit checklist
    const checklistResponse = await fetch('https://raw.githubusercontent.com/Cyfrin/audit-checklist/main/checklist.json');
    if (!checklistResponse.ok) {
      throw new Error(`Failed to fetch checklist: ${checklistResponse.statusText}`);
    }
    const checklistJson = await checklistResponse.json();

    // Step 2: Apply static filters based on classification
    const { filteredItems, appliedFilters } = StaticChecklistFilter.applyStaticFilters(
      checklistJson,
      classification
    );

    // Step 3: Extract all checklist items from filtered categories
    const allItems: ChecklistItem[] = [];
    const extractItems = (categories: Category[], parentPath = '') => {
      for (const category of categories) {
        if (Array.isArray(category.data) && category.data.length > 0) {
          // Check if data contains checklist items or subcategories
          if (category.data[0].hasOwnProperty('question')) {
            // These are checklist items
            const items = category.data as ChecklistItem[];
            items.forEach(item => {
              allItems.push({
                ...item,
                categoryPath: parentPath ? `${parentPath} > ${category.category}` : category.category
              });
            });
          } else {
            // These are subcategories
            extractItems(category.data as Category[],
              parentPath ? `${parentPath} > ${category.category}` : category.category);
          }
        }
      }
    };
    extractItems(filteredItems);

    // Step 4: Apply Slither-based matching
    const matchedItems = SlitherChecklistMatcher.matchSlitherFindings(allItems, slitherFindings);

    // Step 5: Separate into Slither-triggered and AI-only items
    const slitherTriggeredItems = matchedItems.filter(item => item.slitherTriggered);
    const aiOnlyItems = matchedItems.filter(item => !item.slitherTriggered);

    // Step 6: Build summary
    const slitherDetectorsMatched = Array.from(
      new Set(slitherTriggeredItems.flatMap(item => item.matchedDetectors || []))
    );

    const filteredCategories = Array.from(
      new Set(matchedItems.map(item => item.categoryPath))
    );

    return {
      totalItems: matchedItems.length,
      slitherTriggeredItems,
      aiOnlyItems,
      filteredCategories,
      filterSummary: {
        appliedStaticFilters: appliedFilters,
        slitherDetectorsMatched,
        itemsFilteredOut: checklistJson.length - filteredItems.length
      }
    };
  }

  /**
   * Utility method to get a summary for debugging
   */
  static getSummary(result: FilteredChecklistResult): string {
    return `
Checklist Filtering Summary:
- Total items after filtering: ${result.totalItems}
- Slither-triggered items: ${result.slitherTriggeredItems.length}
- AI-only items: ${result.aiOnlyItems.length}
- Categories covered: ${result.filteredCategories.length}
- Static filters applied: ${result.filterSummary.appliedStaticFilters.length}
- Slither detectors matched: ${result.filterSummary.slitherDetectorsMatched.length}
    `.trim();
  }
}