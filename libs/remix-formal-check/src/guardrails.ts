'use strict'

import type { ProposalSchema, InstrumentedSource } from './types'

// Patterns that must NOT appear in LLM-supplied assertion code.
// Templates bypass this check only for the specific __contract__ append case
// where a function body is provided — but we still run the check on
// non-append assertions.
const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\brequire\s*\(/, reason: 'require() not allowed in formal check assertion' },
  { pattern: /\brevert\s*[({;]/, reason: 'revert not allowed in formal check assertion' },
  { pattern: /\bassembly\s*\{/, reason: 'inline assembly not allowed in formal check assertion' },
  { pattern: /\b(\.call|\.delegatecall|\.staticcall)\s*[({]/, reason: 'external calls not allowed in formal check assertion' },
  { pattern: /\.send\s*\(|\.transfer\s*\(/, reason: 'ETH transfers not allowed in formal check assertion' },
  { pattern: /\bselfdestruct\s*\(/, reason: 'selfdestruct not allowed in formal check assertion' },
  { pattern: /\bsuicide\s*\(/, reason: 'suicide not allowed in formal check assertion' },
]

// Trivially-true assertion patterns we reject early so the user doesn't
// see a misleading PROVEN badge for a no-op check.
const TRIVIAL_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /assert\s*\(\s*true\s*\)/, reason: 'assert(true) is trivially true' },
  { pattern: /assert\s*\(\s*(\w+)\s*==\s*\1\s*\)/, reason: 'assert(x == x) is trivially true' },
  { pattern: /assert\s*\(\s*(\w+)\s*<=\s*\1\s*\)/, reason: 'assert(x <= x) is trivially true' },
  { pattern: /assert\s*\(\s*(\w+)\s*>=\s*\1\s*\)/, reason: 'assert(x >= x) is trivially true' },
]

/**
 * Check a proposal's assertion code for forbidden patterns.
 * Throws with a human-readable message if any are found.
 *
 * For __contract__ target (appending a function), the check applies to
 * the whole appended block.
 */
export function checkAssertionSafety(proposal: ProposalSchema): void {
  const code = proposal.assertion

  // Allow __contract__ templates that append an entire function — they are
  // authored in this library and known safe. We still reject any forbidden
  // patterns inside them.
  for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
    if (pattern.test(code)) {
      throw new GuardrailError(`Rejected: ${reason}`, 'forbidden_pattern')
    }
  }

  // Skip trivial-pattern check for __contract__ appended functions because
  // they intentionally contain assert() and may have complex bodies.
  if (proposal.target_function !== '__contract__') {
    for (const { pattern, reason } of TRIVIAL_PATTERNS) {
      if (pattern.test(code)) {
        throw new GuardrailError(`Rejected: ${reason}`, 'trivially_true')
      }
    }
  }
}

/**
 * Diff check: verify that the ONLY differences between original and
 * instrumented source are the bytes at [insertionOffset, insertionOffset +
 * insertionLength). Any other difference means the LLM or instrumentation
 * code touched something it should not have.
 */
export function checkDiff(
  original: string,
  instrumented: InstrumentedSource,
): void {
  const { source: modified, insertionOffset, insertionLength } = instrumented
  const expectedLength = original.length + insertionLength

  if (modified.length !== expectedLength) {
    throw new GuardrailError(
      `Diff check failed: expected length ${expectedLength}, got ${modified.length}`,
      'diff_mismatch',
    )
  }

  // Everything before insertion must be identical
  if (modified.slice(0, insertionOffset) !== original.slice(0, insertionOffset)) {
    throw new GuardrailError(
      'Diff check failed: original source was modified before the insertion point',
      'diff_mismatch',
    )
  }

  // Everything after insertion must be the original tail
  if (modified.slice(insertionOffset + insertionLength) !== original.slice(insertionOffset)) {
    throw new GuardrailError(
      'Diff check failed: original source was modified after the insertion point',
      'diff_mismatch',
    )
  }
}

/**
 * Run all guardrails on a proposal and its instrumented source.
 * Throws GuardrailError on first failure.
 */
export function runAllGuardrails(
  proposal: ProposalSchema,
  original: string,
  instrumented: InstrumentedSource,
): void {
  checkAssertionSafety(proposal)
  checkDiff(original, instrumented)
}

export type GuardrailFailureKind =
  | 'forbidden_pattern'
  | 'trivially_true'
  | 'diff_mismatch'
  | 'vacuity_failed'

export class GuardrailError extends Error {
  readonly kind: GuardrailFailureKind
  constructor(message: string, kind: GuardrailFailureKind) {
    super(message)
    this.name = 'GuardrailError'
    this.kind = kind
  }
}
