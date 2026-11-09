'use strict'
import React from 'react'
import type { CheckResult } from '@remix-project/remix-formal-check'

interface ResultViewProps {
  result: CheckResult
  userConfirmed: boolean
  onConfirmChange(v: boolean): void
}

const OUTCOME_BADGE: Record<string, { label: string; cls: string }> = {
  PROVEN: { label: 'No violation found', cls: 'badge bg-success' },
  COUNTEREXAMPLE: { label: 'Violation found', cls: 'badge bg-danger' },
  NOT_PROVEN: { label: 'Not proven', cls: 'badge bg-warning text-dark' },
}

export function ResultView({ result, userConfirmed, onConfirmChange }: ResultViewProps) {
  const badge = OUTCOME_BADGE[result.outcome] ?? { label: result.outcome, cls: 'badge bg-secondary' }
  const showGreen = result.outcome === 'PROVEN' && userConfirmed

  return (
    <div data-id="formalCheckResult" className="mt-3">
      {/* Property–intent confirmation (spec §8) */}
      {result.outcome !== 'NOT_PROVEN' && (
        <div className="form-check mb-2">
          <input
            id="formalCheckConfirm"
            type="checkbox"
            className="form-check-input"
            checked={userConfirmed}
            onChange={(e) => onConfirmChange(e.target.checked)}
            data-id="formalCheckConfirm"
          />
          <label htmlFor="formalCheckConfirm" className="form-check-label small">
            This assertion matches what I meant
          </label>
        </div>
      )}

      {/* Outcome badge */}
      <div className="d-flex align-items-center gap-2 mb-2">
        <span className={showGreen ? 'badge bg-success' : badge.cls} data-id="formalCheckOutcomeBadge">
          {badge.label}
        </span>
        {result.bounded && (
          <span className="badge bg-secondary" title="BMC: bounded — not an unbounded proof">
            BMC bounded
          </span>
        )}
      </div>

      {/* Counterexample trace */}
      {result.outcome === 'COUNTEREXAMPLE' && result.counterexampleTrace && (
        <div className="mb-2">
          <div className="small fw-bold text-danger mb-1">Counterexample trace</div>
          <pre
            className="p-2 border rounded small"
            style={{ maxHeight: 200, overflowY: 'auto', whiteSpace: 'pre-wrap' }}
            data-id="formalCheckTrace"
          >
            {result.counterexampleTrace}
          </pre>
          <div className="small text-muted mt-1">
            Is the contract wrong, or is the property wrong? You decide.
          </div>
        </div>
      )}

      {/* Not-proven reason */}
      {result.outcome === 'NOT_PROVEN' && result.unprovenReason && (
        <div className="small text-muted mb-1" data-id="formalCheckUnprovenReason">
          {unprovenReasonText(result.unprovenReason)}
        </div>
      )}

      {/* SMTChecker warnings */}
      {result.smtCheckerWarnings.length > 0 && (
        <details className="mt-2">
          <summary className="small text-muted">
            SMTChecker warnings ({result.smtCheckerWarnings.length})
          </summary>
          <ul className="small ps-3 mt-1">
            {result.smtCheckerWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

function unprovenReasonText(reason: string): string {
  switch (reason) {
    case 'solver_unavailable':
      return 'SMT solver (Z3) is not available in this browser build. The check could not run. Use the Solidity compiler with Z3 locally for a full verification.'
    case 'timeout':
      return 'The solver timed out before finishing. The property may or may not hold.'
    case 'unsupported_feature':
      return 'The contract uses a feature (e.g. external call) that the SMTChecker cannot reason about.'
    case 'over_approximation':
      return 'The insertion point is unreachable — this is a vacuous result, not a proof.'
    case 'compile_error':
      return 'The instrumented source failed to compile. The assertion code may be invalid.'
    default:
      return 'The check could not be completed.'
  }
}
