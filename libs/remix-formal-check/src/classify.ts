'use strict'

import type {
  SolverResult,
  CheckResult,
  CompilerDiagnostic,
  ModelCheckerSettings,
  ProposalSchema,
  UnprovenReason,
} from './types'

// Patterns that identify SMTChecker-originated diagnostics
const SMT_COMPONENTS = new Set(['SMTChecker', 'general'])
const ASSERTION_VIOLATION_PATTERN = /assertion\s+violation|assert\s+violation/i
const OVERFLOW_PATTERN = /overflow/i
const UNDERFLOW_PATTERN = /underflow/i
const SOLVER_UNAVAILABLE_PATTERN = /not possible since it requires|no smt solver/i
const THREAD_ERROR_PATTERN = /thread constructor failed|Resource temporarily unavailable/i
const UNSUPPORTED_FEATURE_PATTERN = /unsupported feature|not supported by/i
const TIMEOUT_PATTERN = /timeout/i
const UNPROVED_PATTERN = /could not be proved|unproven/i

function isSmtDiagnostic(d: CompilerDiagnostic): boolean {
  if (d.component && SMT_COMPONENTS.has(d.component)) return true
  // Some solc versions don't set component; fall back to message content
  return (
    SOLVER_UNAVAILABLE_PATTERN.test(d.message) ||
    UNSUPPORTED_FEATURE_PATTERN.test(d.message) ||
    TIMEOUT_PATTERN.test(d.message) ||
    UNPROVED_PATTERN.test(d.message) ||
    ASSERTION_VIOLATION_PATTERN.test(d.message) ||
    OVERFLOW_PATTERN.test(d.message)
  )
}

function isViolation(d: CompilerDiagnostic): boolean {
  return (
    ASSERTION_VIOLATION_PATTERN.test(d.message) ||
    OVERFLOW_PATTERN.test(d.message) ||
    UNDERFLOW_PATTERN.test(d.message)
  )
}

function formatTrace(d: CompilerDiagnostic): string {
  const lines: string[] = [d.formattedMessage || d.message]
  if (d.secondarySourceLocations) {
    for (const loc of d.secondarySourceLocations) {
      lines.push(`  at ${loc.file}:${loc.start}–${loc.end}: ${loc.message}`)
    }
  }
  return lines.join('\n')
}

/**
 * Map raw SolverResult + proposal into a typed CheckResult.
 *
 * Rules (enforced here, not by any LLM):
 *  - COUNTEREXAMPLE iff the solver found a reachable violation.
 *  - NOT_PROVEN if the solver could not complete (no Z3, timeout, unsupported).
 *  - PROVEN (bounded) only if the solver ran to completion without violations
 *    AND the engine was BMC (bounded) — always labelled as such.
 *  - PROVEN (unbounded) only for CHC with no violations (Phase 2).
 */
export function classify(
  solverResult: SolverResult,
  proposal: ProposalSchema,
  settings: ModelCheckerSettings,
): CheckResult {
  const { errors } = solverResult
  const smtDiags = errors.filter(isSmtDiagnostic)

  const violations = smtDiags.filter(isViolation)
  const unavailableDiags = smtDiags.filter((d) => SOLVER_UNAVAILABLE_PATTERN.test(d.message))
  const unsupportedDiags = smtDiags.filter((d) => UNSUPPORTED_FEATURE_PATTERN.test(d.message))
  const timeoutDiags = smtDiags.filter((d) => TIMEOUT_PATTERN.test(d.message))
  const warnings = smtDiags
    .filter((d) => !isViolation(d))
    .map((d) => d.formattedMessage || d.message)

  // Thread-creation failure: solc WASM tried to spawn solver threads but the OS refused.
  // Treat this as solver_unavailable so the UI shows a helpful message rather than
  // the generic "instrumented source failed to compile" text.
  const threadErrors = errors.filter((d) => THREAD_ERROR_PATTERN.test(d.message))
  if (threadErrors.length > 0) {
    return baseResult(proposal, settings, {
      outcome: 'NOT_PROVEN',
      unprovenReason: 'solver_unavailable',
      smtCheckerWarnings: warnings,
      unsupportedFeatureWarnings: [],
    })
  }

  // Compile errors (non-SMT) mean we couldn't even run the solver
  const compileErrors = errors.filter(
    (d) => d.severity === 'error' && !isSmtDiagnostic(d),
  )
  if (!solverResult.success || compileErrors.length > 0) {
    const msgs = compileErrors.map((e) => e.formattedMessage || e.message)
    return baseResult(proposal, settings, {
      outcome: 'NOT_PROVEN',
      unprovenReason: 'compile_error',
      smtCheckerWarnings: warnings,
      unsupportedFeatureWarnings: [],
      errorDetails: msgs.join('\n'),
    })
  }

  // Solver not available (no Z3 in this soljson build)
  if (unavailableDiags.length > 0) {
    return baseResult(proposal, settings, {
      outcome: 'NOT_PROVEN',
      unprovenReason: 'solver_unavailable',
      smtCheckerWarnings: warnings,
      unsupportedFeatureWarnings: [],
    })
  }

  // Counterexample found
  if (violations.length > 0) {
    const primary = violations[0]
    return baseResult(proposal, settings, {
      outcome: 'COUNTEREXAMPLE',
      counterexampleTrace: violations.map(formatTrace).join('\n\n'),
      smtCheckerWarnings: warnings,
      unsupportedFeatureWarnings: unsupportedDiags.map((d) => d.message),
      sourceLocation: primary.sourceLocation
        ? { ...primary.sourceLocation }
        : undefined,
    })
  }

  // Timeout
  if (timeoutDiags.length > 0) {
    return baseResult(proposal, settings, {
      outcome: 'NOT_PROVEN',
      unprovenReason: 'timeout',
      smtCheckerWarnings: warnings,
      unsupportedFeatureWarnings: unsupportedDiags.map((d) => d.message),
    })
  }

  // Unsupported feature (without timeout)
  if (unsupportedDiags.length > 0) {
    return baseResult(proposal, settings, {
      outcome: 'NOT_PROVEN',
      unprovenReason: 'unsupported_feature',
      smtCheckerWarnings: warnings,
      unsupportedFeatureWarnings: unsupportedDiags.map((d) => d.message),
    })
  }

  // No violations, solver completed — PROVEN (bounded for BMC)
  return baseResult(proposal, settings, {
    outcome: 'PROVEN',
    smtCheckerWarnings: warnings,
    unsupportedFeatureWarnings: [],
  })
}

type Extras = {
  outcome: CheckResult['outcome']
  unprovenReason?: UnprovenReason
  counterexampleTrace?: string
  smtCheckerWarnings: string[]
  unsupportedFeatureWarnings: string[]
  sourceLocation?: CheckResult['sourceLocation']
  errorDetails?: string
}

function baseResult(
  proposal: ProposalSchema,
  settings: ModelCheckerSettings,
  extras: Extras,
): CheckResult {
  const bounded = settings.engine === 'bmc'
  const base: CheckResult = {
    outcome: extras.outcome,
    assertion: proposal.assertion,
    targetFunction: proposal.target_function,
    englishDescription: proposal.english,
    engineUsed: settings.engine,
    bounded,
    smtCheckerWarnings: extras.smtCheckerWarnings,
    unsupportedFeatureWarnings: extras.unsupportedFeatureWarnings,
  }
  if (extras.unprovenReason) base.unprovenReason = extras.unprovenReason
  if (extras.counterexampleTrace) base.counterexampleTrace = extras.counterexampleTrace
  if (extras.sourceLocation) base.sourceLocation = extras.sourceLocation
  return base
}
