'use strict'
import React from 'react'
import type { ProposalSchema } from '@remix-project/remix-formal-check'

interface ProposalViewProps {
  proposal: ProposalSchema
  rawJson: string | null
  userConfirmed: boolean
  onConfirmChange(v: boolean): void
  onRun(): void
  onCancel(): void
}

export function ProposalView({
  proposal,
  rawJson,
  userConfirmed,
  onConfirmChange,
  onRun,
  onCancel,
}: ProposalViewProps) {
  return (
    <div className="mt-3" data-id="formalCheckProposalView">
      <div className="fw-bold small mb-2">Proposed assertion</div>

      {/* English description from LLM */}
      <div className="small text-muted mb-2" data-id="formalCheckProposalEnglish">
        {proposal.english}
      </div>

      {/* Assertion code */}
      <pre
        className="p-2 border rounded small mb-1"
        style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
        data-id="formalCheckProposalAssertion"
      >
        {proposal.assertion}
      </pre>

      <div className="small text-muted mb-2">
        Target: <code>{proposal.target_function}</code>
      </div>

      {/* Confirm checkbox — required before running */}
      <div className="form-check mb-3">
        <input
          id="formalCheckProposalConfirm"
          type="checkbox"
          className="form-check-input"
          checked={userConfirmed}
          onChange={(e) => onConfirmChange(e.target.checked)}
          data-id="formalCheckProposalConfirm"
        />
        <label htmlFor="formalCheckProposalConfirm" className="form-check-label small">
          This assertion matches what I meant
        </label>
      </div>

      <div className="d-flex gap-2 mb-2">
        <button
          className="btn btn-sm btn-primary"
          disabled={!userConfirmed}
          onClick={onRun}
          data-id="formalCheckProposalRunBtn"
        >
          Run formal check
        </button>
        <button
          className="btn btn-sm btn-outline-secondary"
          onClick={onCancel}
          data-id="formalCheckProposalCancelBtn"
        >
          Cancel
        </button>
      </div>

      {/* Raw JSON for transparency — collapsed by default */}
      {rawJson && (
        <details className="mt-1">
          <summary className="small text-muted" style={{ cursor: 'pointer' }}>
            Raw LLM output
          </summary>
          <pre
            className="p-2 border rounded small mt-1"
            style={{ maxHeight: 160, overflowY: 'auto', whiteSpace: 'pre-wrap', fontSize: '0.75rem' }}
            data-id="formalCheckRawJson"
          >
            {rawJson}
          </pre>
        </details>
      )}
    </div>
  )
}
