'use strict'

import type { ProposalSchema } from './types'
import { parseAndValidateProposal } from './proposal'
import { checkAssertionSafety } from './guardrails'

/**
 * LLMProvider interface.
 *
 * Implementations must:
 *  - Accept contract source + user intent as input.
 *  - Return ONLY a JSON string matching ProposalSchema.
 *  - Never receive instructions to return Solidity files or full contracts.
 *  - Never include API keys.
 *
 * The formal-check pipeline calls generateProposal() and then
 * parseAndValidateProposal() on the result. If validation fails the
 * proposal is rejected and the user is informed — the LLM never decides
 * whether a property holds.
 */
export interface LLMProvider {
  generateProposal(contractSource: string, intent: string): Promise<string>
}

/**
 * Mock provider used in unit tests and "templates only" offline mode.
 * Returns a fixed valid proposal regardless of input.
 */
export class MockLLMProvider implements LLMProvider {
  private fixedProposal: ProposalSchema

  constructor(fixedProposal?: ProposalSchema) {
    this.fixedProposal = fixedProposal ?? {
      english: 'Mock: balances[msg.sender] should not exceed totalSupply',
      target_function: 'transfer',
      assertion: 'assert(balances[msg.sender] <= totalSupply);',
      needs_snapshot: [],
    }
  }

  async generateProposal(_source: string, _intent: string): Promise<string> {
    return JSON.stringify(this.fixedProposal)
  }
}

/**
 * A mock provider that deliberately returns invalid JSON to test rejection.
 */
export class MaliciousMockProvider implements LLMProvider {
  constructor(private payload: string) {}

  async generateProposal(_source: string, _intent: string): Promise<string> {
    return this.payload
  }
}

/**
 * Convenience: generate and immediately validate a proposal from any provider.
 * Returns the validated ProposalSchema or throws.
 */
export async function generateAndValidate(
  provider: LLMProvider,
  contractSource: string,
  intent: string,
): Promise<ProposalSchema> {
  const raw = await provider.generateProposal(contractSource, intent)
  const proposal = parseAndValidateProposal(raw)
  // Run safety checks immediately so forbidden patterns never reach the pipeline
  checkAssertionSafety(proposal)
  return proposal
}

/**
 * Builds the system prompt sent to the LLM for proposal generation.
 * The prompt deliberately avoids asking for Solidity files or contract bodies.
 */
export function buildProposalPrompt(contractSource: string, intent: string): string {
  return [
    'You are a formal-verification assistant. Your ONLY task is to propose ONE Solidity assertion.',
    '',
    'Contract source:',
    '```solidity',
    contractSource,
    '```',
    '',
    `User intent: ${intent}`,
    '',
    'Respond with ONLY valid JSON in this exact shape (no markdown, no explanation):',
    '{',
    '  "english": "<one sentence describing the property>",',
    '  "target_function": "<name of the function to instrument, or __contract__ to append>",',
    '  "assertion": "<a single Solidity assert(...) statement>",',
    '  "needs_snapshot": []',
    '}',
    '',
    'Rules:',
    '- assertion must start with assert(',
    '- assertion must NOT contain require, revert, assembly, external calls, or state writes',
    '- Do NOT return any Solidity file, contract body, or function definition (except inside assertion for __contract__ target)',
    '- Do NOT suggest modifying the original contract',
  ].join('\n')
}
