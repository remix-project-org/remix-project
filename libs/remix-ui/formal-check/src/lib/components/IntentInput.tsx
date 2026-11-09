'use strict'
import React from 'react'
import type { FormalCheckTemplate } from '@remix-project/remix-formal-check'

interface IntentInputProps {
  templates: FormalCheckTemplate[]
  selectedId: string
  onSelect(id: string): void
  status: string
  onRun(): void
  onCancel(): void
}

export function IntentInput({
  templates,
  selectedId,
  onSelect,
  status,
  onRun,
  onCancel,
}: IntentInputProps) {
  const running = status === 'running'

  return (
    <div data-id="formalCheckIntentInput">
      <label className="form-label small fw-bold">Property template</label>
      <select
        className="form-select form-select-sm mb-2"
        value={selectedId}
        onChange={(e) => onSelect(e.target.value)}
        disabled={running}
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
          disabled={!selectedId || running}
          onClick={onRun}
          data-id="formalCheckRunBtn"
        >
          {running ? (
            <>
              <span className="spinner-border spinner-border-sm me-1" role="status" />
              Checking…
            </>
          ) : (
            'Run formal check'
          )}
        </button>
        {running && (
          <button className="btn btn-sm btn-outline-secondary" onClick={onCancel} data-id="formalCheckCancelBtn">
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}
