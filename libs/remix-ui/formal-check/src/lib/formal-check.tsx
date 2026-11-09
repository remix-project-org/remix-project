'use strict'
import React, { useState } from 'react'
import type { FormalCheckUIProps } from './types'
import { IntentInput } from './components/IntentInput'
import { ResultView } from './components/ResultView'
import { DetailsSection } from './components/DetailsSection'
import { ConsentBanner } from './components/ConsentBanner'
import { ProposalView } from './components/ProposalView'

export function RemixUiFormalCheck({ plugin }: FormalCheckUIProps) {
  const { state, templates } = plugin
  const [selectedTemplateId, setSelectedTemplateId] = useState('')

  function handleRun() {
    if (!selectedTemplateId) return
    plugin.runCheck(selectedTemplateId)
  }

  const busy = state.status === 'running' || state.status === 'running_llm'
  const showInput =
    state.status === 'idle' ||
    state.status === 'done' ||
    state.status === 'error' ||
    state.status === 'running' ||
    state.status === 'running_llm'

  return (
    <div
      id="formalCheckPanel"
      data-id="formalCheckPanel"
      className="p-3"
      style={{ overflowY: 'auto', height: '100%' }}
    >
      <div className="d-flex align-items-center mb-3">
        <span className="fw-bold me-2">Formal Check</span>
        <span className="badge bg-secondary" title="Phase 2 — templates + LLM assertion proposal">
          Phase 2
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

      {/* Input panel — shown unless we're in consent or proposal_ready */}
      {showInput && (
        <IntentInput
          mode={state.mode}
          templates={templates}
          selectedId={selectedTemplateId}
          onSelect={setSelectedTemplateId}
          status={state.status}
          onRun={handleRun}
          onCancel={() => plugin.cancelCheck()}
          llmIntent={state.llmIntent}
          onSetMode={(m) => plugin.setMode(m)}
          onPropose={(intent) => plugin.requestLLMProposal(intent)}
        />
      )}

      {/* Consent banner */}
      {state.status === 'pending_consent' && (
        <ConsentBanner
          currentFile={state.currentFile}
          onGrant={() => plugin.grantConsent()}
          onDeny={() => plugin.denyConsent()}
        />
      )}

      {/* LLM proposal ready — user must confirm before running */}
      {state.status === 'proposal_ready' && state.proposal && (
        <ProposalView
          proposal={state.proposal}
          rawJson={state.rawProposalJson}
          userConfirmed={state.userConfirmed}
          onConfirmChange={(v) => plugin.confirmMatch(v)}
          onRun={() => plugin.confirmAndRun()}
          onCancel={() => plugin.cancelCheck()}
        />
      )}

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
