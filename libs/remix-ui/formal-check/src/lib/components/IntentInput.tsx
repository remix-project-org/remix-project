'use strict'
import React, { useState } from 'react'
import type { FormalCheckTemplate } from '@remix-project/remix-formal-check'

interface IntentInputProps {
  mode: 'template' | 'llm'
  templates: FormalCheckTemplate[]
  selectedId: string
  onSelect(id: string): void
  status: string
  onRun(): void
  onCancel(): void
  // LLM mode
  llmIntent: string
  onSetMode(mode: 'template' | 'llm'): void
  onPropose(intent: string): void
}

export function IntentInput({
  mode,
  templates,
  selectedId,
  onSelect,
  status,
  onRun,
  onCancel,
  llmIntent,
  onSetMode,
  onPropose,
}: IntentInputProps) {
  const [localIntent, setLocalIntent] = useState(llmIntent)
  const busy = status === 'running' || status === 'running_llm'

  return (
    <div data-id="formalCheckIntentInput">
      {/* Mode toggle */}
      <div className="btn-group btn-group-sm mb-3 w-100" role="group" aria-label="Check mode">
        <button
          type="button"
          className={`btn btn-outline-secondary ${mode === 'template' ? 'active' : ''}`}
          onClick={() => onSetMode('template')}
          disabled={busy}
          data-id="formalCheckModeTemplate"
        >
          Templates
        </button>
        <button
          type="button"
          className={`btn btn-outline-secondary ${mode === 'llm' ? 'active' : ''}`}
          onClick={() => onSetMode('llm')}
          disabled={busy}
          data-id="formalCheckModeLLM"
        >
          Describe in English
        </button>
      </div>

      {mode === 'template' ? (
        <>
          <label className="form-label small fw-bold">Property template</label>
          <select
            className="form-select form-select-sm mb-2"
            value={selectedId}
            onChange={(e) => onSelect(e.target.value)}
            disabled={busy}
            data-id="formalCheckTemplateSelect"
          >
            <option value="">— select a template —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          {selectedId && (
            <div className="small text-muted mb-2">
              {templates.find((t) => t.id === selectedId)?.description}
            </div>
          )}

          <div className="d-flex gap-2">
            <button
              className="btn btn-sm btn-primary"
              disabled={!selectedId || busy}
              onClick={onRun}
              data-id="formalCheckRunBtn"
            >
              {busy ? (
                <>
                  <span className="spinner-border spinner-border-sm me-1" role="status" />
                  Checking…
                </>
              ) : (
                'Run formal check'
              )}
            </button>
            {busy && (
              <button
                className="btn btn-sm btn-outline-secondary"
                onClick={onCancel}
                data-id="formalCheckCancelBtn"
              >
                Cancel
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <label className="form-label small fw-bold" htmlFor="formalCheckIntentText">
            Describe the property you want to check
          </label>
          <textarea
            id="formalCheckIntentText"
            className="form-control form-control-sm mb-2"
            rows={3}
            placeholder="e.g. The balance of msg.sender should never exceed the total supply after a transfer."
            value={localIntent}
            onChange={(e) => setLocalIntent(e.target.value)}
            disabled={busy}
            data-id="formalCheckIntentTextarea"
          />

          <div className="d-flex gap-2">
            <button
              className="btn btn-sm btn-primary"
              disabled={!localIntent.trim() || busy}
              onClick={() => onPropose(localIntent)}
              data-id="formalCheckProposeBtn"
            >
              {status === 'running_llm' ? (
                <>
                  <span className="spinner-border spinner-border-sm me-1" role="status" />
                  Proposing…
                </>
              ) : (
                'Propose assertion'
              )}
            </button>
            {busy && (
              <button
                className="btn btn-sm btn-outline-secondary"
                onClick={onCancel}
                data-id="formalCheckCancelBtn"
              >
                Cancel
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
