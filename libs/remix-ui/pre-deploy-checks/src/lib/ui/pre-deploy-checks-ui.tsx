import React, { useEffect, useMemo, useState } from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import { CustomTooltip } from '@remix-ui/helper'
import { aggregateFindings } from '../findings'
import { isStale } from '../store'
import { CHECK_STEPS, Finding } from '../types'
import { deriveVerdict, toolLines } from '../verdict'
import { splitPath } from './format'
import { Issues } from './issues'
import { Deployment, Outputs } from './outputs'
import { Settings } from './settings'
import { StatusCard } from './status-card'
import { PreDeployChecksActions, PreDeployChecksViewState } from './types'
import './pre-deploy-checks.css'

interface PreDeployChecksUIProps {
  plugin: PreDeployChecksActions
  view: PreDeployChecksViewState
}

function useNow (intervalMs = 30000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}

function Header ({ file, onSettings }: { file: string, onSettings: () => void }) {
  const intl = useIntl()
  const { name, folder } = splitPath(file)
  return (
    <header className="pdc-header">
      <i className="far fa-file-code pdc-header-icon" aria-hidden="true"></i>
      <div className="min-w-0 flex-grow-1">
        <div className="pdc-file text-truncate" data-id="preDeployChecks-file" title={file}>{name}</div>
        <div className="pdc-folder text-truncate">{folder || <FormattedMessage id="preDeployChecks.workspaceRoot" />}</div>
      </div>
      <CustomTooltip placement="bottom" tooltipId="preDeployChecks-infoTooltip" tooltipText={<FormattedMessage id="preDeployChecks.disclaimer" />}>
        <button
          className="pdc-icon-btn pdc-info-btn"
          data-id="preDeployChecks-info"
          aria-label={intl.formatMessage({ id: 'preDeployChecks.disclaimer' })}
        >
          <i className="fas fa-info-circle" aria-hidden="true"></i>
        </button>
      </CustomTooltip>
      <button className="pdc-icon-btn" data-id="preDeployChecks-openSettings" onClick={onSettings} aria-label={intl.formatMessage({ id: 'preDeployChecks.settings' })} title={intl.formatMessage({ id: 'preDeployChecks.settings' })}>
        <i className="fas fa-cog" aria-hidden="true"></i>
      </button>
    </header>
  )
}

function Intro ({ view, plugin, onSettings }: { view: PreDeployChecksViewState, plugin: PreDeployChecksActions, onSettings: () => void }) {
  const steps = CHECK_STEPS.filter((id) => id === 'compile' || view.toggles[id])
  return (
    <section className="pdc-card pdc-intro" data-id="preDeployChecks-intro">
      <div className="pdc-title"><FormattedMessage id="preDeployChecks.intro.title" /></div>
      <div className="pdc-sub"><FormattedMessage id="preDeployChecks.intro.text" /></div>
      <ul className="pdc-intro-list">
        {steps.map((id) => <li key={id}><i className="far fa-circle" aria-hidden="true"></i><FormattedMessage id={`preDeployChecks.step.${id}`} /></li>)}
      </ul>
      <div className="pdc-actions">
        <button className="btn pdc-btn btn-primary" data-id="preDeployChecks-run" onClick={() => plugin.startRun(view.file)}>
          <FormattedMessage id="preDeployChecks.run" />
        </button>
      </div>
      <div className="text-center mt-2">
        <button className="pdc-link-btn pdc-muted" data-id="preDeployChecks-chooseChecks" onClick={onSettings}><FormattedMessage id="preDeployChecks.chooseChecks" /></button>
      </div>
    </section>
  )
}

export function PreDeployChecksUI ({ plugin, view }: PreDeployChecksUIProps) {
  const now = useNow()
  const [page, setPage] = useState<'main' | 'settings'>('main')
  const { file, state, findings, toggles, running } = view
  const themeClass = view.themeQuality === 'light' ? 'pdc-light' : 'pdc-dark'

  const input = { state, findings, toggles, runningStep: running ? view.currentStep : null }
  const { verdict, actions } = deriveVerdict(input)
  const lines = toolLines(input)

  // compile errors are issues too: high severity, tagged Compiler, listed first
  const compileErrors = useMemo((): Finding[] => {
    const compile = state?.steps.compile
    if (compile?.status !== 'failed' || !compile.data?.errors?.length) return []
    const stale = isStale(state, 'compile')
    return aggregateFindings(compile.data.errors.map((finding) => ({ finding, stale })))
  }, [state])

  if (!file || !state) {
    return (
      <div className={`pdc ${themeClass}`} data-id="preDeployChecks-empty">
        <div className="pdc-empty">
          <i className="far fa-file-code" aria-hidden="true"></i>
          <div className="pdc-title"><FormattedMessage id="preDeployChecks.empty.title" /></div>
          <div className="pdc-sub"><FormattedMessage id="preDeployChecks.empty.text" /></div>
        </div>
      </div>
    )
  }

  if (page === 'settings') {
    return (
      <div className={`pdc ${themeClass}`} data-id="preDeployChecks">
        <Settings toggles={toggles} compiler={view.compiler} disabled={running} onBack={() => setPage('main')} plugin={plugin} />
      </div>
    )
  }

  return (
    <div className={`pdc ${themeClass}`} data-id="preDeployChecks">
      <Header file={file} onSettings={() => setPage('settings')} />
      {verdict.kind === 'not-checked' ? (
        <Intro view={view} plugin={plugin} onSettings={() => setPage('settings')} />
      ) : (
        <>
          <StatusCard file={file} verdict={verdict} actions={actions} cancelling={view.cancelling} now={now} plugin={plugin} />
          <Deployment state={state} />
          <Issues key={file} file={file} findings={findings} compileErrors={compileErrors} lines={lines} running={running} plugin={plugin} />
          {!running && state.steps.compile && <Outputs state={state} flattenEnabled={toggles.flatten} reportPath={view.reportPath} plugin={plugin} />}
        </>
      )}
    </div>
  )
}
