'use strict'
import React from 'react'

interface ConsentBannerProps {
  currentFile: string
  onGrant(): void
  onDeny(): void
}

export function ConsentBanner({ currentFile, onGrant, onDeny }: ConsentBannerProps) {
  return (
    <div
      className="alert alert-warning mt-3 small"
      role="alert"
      data-id="formalCheckConsentBanner"
    >
      <div className="fw-bold mb-1">Send source code to AI?</div>
      <p className="mb-2">
        To propose an assertion, the following will be sent to the Remix AI service:
      </p>
      <ul className="mb-2 ps-3">
        <li>
          The full contents of <code>{currentFile || 'the current file'}</code>
        </li>
        <li>Your intent description</li>
      </ul>
      <p className="mb-2 text-muted">
        No API keys leave the browser. The AI returns only a JSON assertion proposal — it cannot
        modify your contract.
      </p>
      <div className="d-flex gap-2">
        <button
          className="btn btn-sm btn-warning"
          onClick={onGrant}
          data-id="formalCheckConsentGrant"
        >
          Yes, send and propose
        </button>
        <button
          className="btn btn-sm btn-outline-secondary"
          onClick={onDeny}
          data-id="formalCheckConsentDeny"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
