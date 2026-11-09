'use strict'

import type { FormalCheckTemplate, ProposalSchema } from './types'

/**
 * Built-in property templates.
 *
 * Each template is a ready-made ProposalSchema that works with NO LLM.
 * Templates are verified to be safe (no forbidden patterns) so guardrails
 * run on them in the same way as LLM proposals — this keeps the pipeline
 * uniform and means templates implicitly test the guardrail path.
 *
 * targetFunction == '__contract__' means: append a new internal checker
 * function to the contract body rather than inserting into an existing fn.
 */
export const TEMPLATES: FormalCheckTemplate[] = [
  {
    id: 'vault-withdraw-invariant',
    name: 'Vault: withdrawals ≤ deposits',
    description: 'Assert that total withdrawn never exceeds total deposited (call inside withdraw())',
    targetFunction: 'withdraw',
    assertionCode: 'assert(withdrawn + amount <= deposited);',
    needsSnapshot: [],
  },
  {
    id: 'erc20-balance-nonnegative',
    name: 'ERC-20: balance non-negative after transfer',
    description: 'Assert sender balance is not underflowed after a transfer',
    targetFunction: 'transfer',
    assertionCode: 'assert(balances[msg.sender] <= totalSupply);',
    needsSnapshot: [],
  },
  {
    id: 'owner-only-call',
    name: 'Owner-only: only owner can reach this point',
    description: 'Assert msg.sender is the stored owner at a privileged call site',
    targetFunction: 'onlyOwnerAction',
    assertionCode: 'assert(msg.sender == owner);',
    needsSnapshot: [],
  },
  {
    id: 'no-overflow-add',
    name: 'No overflow on addition',
    description: 'Assert an addition result is at least as large as either operand (uint256)',
    targetFunction: '__contract__',
    assertionCode: [
      'function __formalCheck_noOverflowAdd(uint256 a, uint256 b) internal pure {',
      '    uint256 c = a + b;',
      '    assert(c >= a);',
      '}',
    ].join('\n    '),
    needsSnapshot: [],
  },
]

export function getTemplate(id: string): FormalCheckTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id)
}

/** Convert a template into the standard ProposalSchema used by the pipeline. */
export function templateToProposal(template: FormalCheckTemplate): ProposalSchema {
  return {
    english: template.description,
    target_function: template.targetFunction,
    assertion: template.assertionCode,
    needs_snapshot: template.needsSnapshot,
  }
}
