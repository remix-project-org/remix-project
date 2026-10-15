import React, { useState } from 'react'
import { FormattedMessage } from 'react-intl'
import { isStale } from '../store'
import { FileCheckState, RawFinding, StepId, StepResult } from '../types'

const STATUS_ICON: Record<string, string> = {
  'not-run': 'far fa-circle text-secondary',
  running: 'fas fa-spinner fa-spin text-info',
  passed: 'fas fa-check-circle text-success',
  findings: 'fas fa-exclamation-circle text-warning',
  submitted: 'fas fa-paper-plane text-info',
  failed: 'fas fa-times-circle text-danger',
  skipped: 'fas fa-minus-circle text-secondary',
  stale: 'fas fa-history text-secondary'
}

export function timeAgo (at: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000))
  if (seconds < 30) return 'just now'
  if (seconds < 90) return '1 min ago'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  return `${hours} h ago`
}

function summary (stepId: StepId, step: StepResult): string {
  const count = step.findings?.length || 0
  switch (step.status) {
  case 'passed':
    if (stepId === 'deploy') return step.data?.address ? `${step.data.contractName} at ${step.data.address}` : 'Deployed'
    if (stepId === 'flatten') return step.data?.path || 'Done'
    return step.note || (stepId === 'compile' ? 'Compiled' : 'No findings')
  case 'findings':
    if (stepId === 'compile') return `${count} warning${count === 1 ? '' : 's'}`
    return `${count} finding${count === 1 ? '' : 's'}${step.note ? ` · ${step.note}` : ''}`
  case 'running': return 'Running…'
  default: return step.note || ''
  }
}

interface StepRowProps {
  stepId: StepId
  state: FileCheckState
  enabled: boolean
  canToggle: boolean
  disabled: boolean
  now: number
  onToggle: (enabled: boolean) => void
  onOpenFile: (file: string) => void
  onOpenError: (error: RawFinding) => void
  action?: { label: string, onClick: () => void }
}

export function StepRow ({ stepId, state, enabled, canToggle, disabled, now, onToggle, onOpenFile, onOpenError, action }: StepRowProps) {
  const [expanded, setExpanded] = useState(false)
  const step = state.steps[stepId]
  const stale = isStale(state, stepId)
  const status = !step ? 'not-run' : stale && step.status !== 'running' ? 'stale' : step.status
  const errors = stepId === 'compile' && step?.status === 'failed' ? step.data?.errors || [] : []
  const deployedEarlier = stepId === 'deploy' && step?.status === 'passed' && step.contentHash && state.currentHash && step.contentHash !== state.currentHash

  return (
    <li className={`list-group-item px-2 py-2 ${!enabled ? 'opacity-50' : ''}`} data-id={`preDeployChecks-step-${stepId}`} data-status={status}>
      <div className="d-flex align-items-start gap-2">
        <i className={`${STATUS_ICON[status]} mt-1`} aria-hidden="true"></i>
        <div className="flex-grow-1 text-break" style={{ minWidth: 0 }}>
          <div className="d-flex align-items-center gap-1">
            <span className="fw-semibold"><FormattedMessage id={`preDeployChecks.step.${stepId}`} /></span>
            <span className="small text-secondary" data-id={`preDeployChecks-step-${stepId}-status`}>
              · <FormattedMessage id={`preDeployChecks.status.${status}`} />
            </span>
          </div>
          {step && step.status !== 'not-run' && (
            <div className="small" data-id={`preDeployChecks-step-${stepId}-summary`}>
              {stepId === 'flatten' && step.status === 'passed' && step.data?.path ? (
                <a href="#" className="text-decoration-none" onClick={(e) => { e.preventDefault(); onOpenFile(step.data.path) }}>{step.data.path}</a>
              ) : summary(stepId, step)}
            </div>
          )}
          {deployedEarlier && (
            <div className="small text-warning" data-id="preDeployChecks-deployedEarlier"><FormattedMessage id="preDeployChecks.deployedEarlier" /></div>
          )}
          {step && step.status !== 'running' && step.status !== 'not-run' && (
            <div className="small text-secondary" data-id={`preDeployChecks-step-${stepId}-origin`}>
              <FormattedMessage id={step.origin === 'manual' ? 'preDeployChecks.origin.manual' : 'preDeployChecks.origin.panel'} /> · {timeAgo(step.at, now)}
            </div>
          )}
          {action && (
            <button className="btn btn-link btn-sm p-0 small" data-id={`preDeployChecks-step-${stepId}-action`} onClick={action.onClick}>{action.label}</button>
          )}
          {errors.length > 0 && (
            <>
              <button className="btn btn-link btn-sm p-0 small" onClick={() => setExpanded(!expanded)} aria-expanded={expanded} data-id="preDeployChecks-compileErrors-toggle">
                <FormattedMessage id={expanded ? 'preDeployChecks.hideErrors' : 'preDeployChecks.showErrors'} />
              </button>
              {expanded && (
                <ul className="list-unstyled small mb-0 mt-1" data-id="preDeployChecks-compileErrors">
                  {errors.map((error: RawFinding, index: number) => (
                    <li key={index} className="text-danger mb-1">
                      {error.file && error.range ? (
                        <a href="#" className="text-danger" onClick={(e) => { e.preventDefault(); onOpenError(error) }}>
                          {error.file}:{error.range.start.line + 1}
                        </a>
                      ) : null} {error.title}: {error.message}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
        <div className="form-check form-switch m-0" title={canToggle ? undefined : 'Always on'}>
          <input
            className="form-check-input"
            type="checkbox"
            role="switch"
            id={`preDeployChecks-toggle-${stepId}`}
            data-id={`preDeployChecks-toggle-${stepId}`}
            checked={enabled}
            disabled={!canToggle || disabled}
            onChange={(e) => onToggle(e.target.checked)}
          />
          <label className="visually-hidden" htmlFor={`preDeployChecks-toggle-${stepId}`}>
            <FormattedMessage id={`preDeployChecks.step.${stepId}`} />
          </label>
        </div>
      </div>
    </li>
  )
}
