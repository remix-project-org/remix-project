'use strict'
import React, { useState } from 'react'
import type { FormalCheckUIProps } from './types'
import { IntentInput } from './components/IntentInput'
import { ResultView } from './components/ResultView'
import { DetailsSection } from './components/DetailsSection'

export function RemixUiFormalCheck({ plugin }: FormalCheckUIProps) {
  const { state, templates } = plugin
  const [selectedTemplateId, setSelectedTemplateId] = useState('')

  function handleRun() {
    if (!selectedTemplateId) return
    plugin.runCheck(selectedTemplateId)
  }

  return (
    <div
      id="formalCheckPanel"
      data-id="formalCheckPanel"
      className="p-3"
      style={{ overflowY: 'auto', height: '100%' }}
    >
      <div className="d-flex align-items-center mb-3">
        <span className="fw-bold me-2">Formal Check</span>
        <span className="badge bg-secondary" title="Phase 1 — templates only, no LLM">
          Phase 1
        </span>
      </div>

      {/* File context */}
      {state.currentFile ? (
        <div className="small text-muted mb-3" data-id="formalCheckCurrentFile">
          File: <code>{state.currentFile}</code>
        </div>
      ) : (
        <div className="alert alert-info py-2 small" data-id="formalCheckNoFile">
          Open a Solidity file to run a formal check.
        </div>
      )}

      {/* Template picker + run button */}
      <IntentInput
        templates={templates}
        selectedId={selectedTemplateId}
        onSelect={setSelectedTemplateId}
        status={state.status}
        onRun={handleRun}
        onCancel={() => plugin.cancelCheck()}
      />

      {/* Error message */}
      {state.status === 'error' && state.errorMessage && (
        <div className="alert alert-danger small mt-3 py-2" data-id="formalCheckError">
          {state.errorMessage}
        </div>
      )}

      {/* Result */}
      {state.status === 'done' && state.result && (
        <>
          <ResultView
            result={state.result}
            userConfirmed={state.userConfirmed}
            onConfirmChange={(v) => plugin.confirmMatch(v)}
          />
          <DetailsSection result={state.result} currentFile={state.currentFile} />
        </>
      )}
    </div>
  )
}
