'use strict'

import type { ProposalSchema } from './types'

/**
 * Validates raw LLM JSON output against the ProposalSchema.
 * Throws a descriptive Error on any violation so callers can show the user
 * why the LLM output was rejected without displaying raw stack traces.
 */
export function validateProposal(raw: unknown): ProposalSchema {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('Proposal must be a JSON object')
  }
  const p = raw as Record<string, unknown>

  if (typeof p.english !== 'string' || p.english.trim() === '') {
    throw new Error('Proposal.english must be a non-empty string')
  }
  if (typeof p.target_function !== 'string' || p.target_function.trim() === '') {
    throw new Error('Proposal.target_function must be a non-empty string')
  }
  if (typeof p.assertion !== 'string' || p.assertion.trim() === '') {
    throw new Error('Proposal.assertion must be a non-empty string')
  }
  if (!Array.isArray(p.needs_snapshot)) {
    throw new Error('Proposal.needs_snapshot must be an array')
  }
  if (p.needs_snapshot.some((x: unknown) => typeof x !== 'string')) {
    throw new Error('Proposal.needs_snapshot must contain only strings')
  }

  // The LLM must never return instructions to modify arbitrary source.
  // The assertion field must not contain multi-statement blocks that look
  // like function/contract bodies — a single assert expression is expected.
  if (p.assertion.includes('contract ') || p.assertion.includes('interface ') || p.assertion.includes('library ')) {
    throw new Error('Proposal.assertion must not define a contract, interface, or library')
  }

  return {
    english: (p.english as string).trim(),
    target_function: (p.target_function as string).trim(),
    assertion: (p.assertion as string).trim(),
    needs_snapshot: p.needs_snapshot as string[],
  }
}

/**
 * Parses a JSON string from the LLM and validates it.
 * Returns the validated proposal or throws with a human-readable error.
 */
export function parseAndValidateProposal(jsonString: string): ProposalSchema {
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonString)
  } catch {
    throw new Error('LLM returned invalid JSON — cannot parse the proposal')
  }
  return validateProposal(parsed)
}
