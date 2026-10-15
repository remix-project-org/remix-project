import React, { useEffect, useState } from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import { blockingFindings } from '../findings'
import { isStale } from '../store'
import { STEP_ORDER, StepId } from '../types'
import { FindingsList } from './findings-list'
import { StepRow } from './step-row'
import { PreDeployChecksActions, PreDeployChecksViewState } from './types'

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

function Disclaimer () {
  return (
    <p className="small text-secondary mb-2" data-id="preDeployChecks-disclaimer">
      <i className="fas fa-info-circle me-1" aria-hidden="true"></i>
      <FormattedMessage id="preDeployChecks.disclaimer" />
    </p>
  )
}

function OutcomeBanner ({ view, plugin }: PreDeployChecksUIProps) {
  const { outcome, file } = view
  if (!outcome || view.running) return null
  switch (outcome.kind) {
  case 'gate':
    return (
      <div className="alert alert-danger py-2 px-2 small" role="alert" data-id="preDeployChecks-gate">
        <div className="mb-2">
          <FormattedMessage id="preDeployChecks.gate" values={{ count: outcome.high }} />
        </div>
        {outcome.notRun.length > 0 && (
          <div className="mb-2"><FormattedMessage id="preDeployChecks.notRun" values={{ steps: outcome.notRun.join(', ') }} /></div>
        )}
        <div className="d-flex gap-2">
          <button className="btn btn-sm btn-secondary" data-id="preDeployChecks-rerun" onClick={() => plugin.startRun(file)}>
            <FormattedMessage id="preDeployChecks.rerun" />
          </button>
          <button className="btn btn-sm btn-danger" data-id="preDeployChecks-deployAnyway" onClick={() => plugin.deployAnyway()}>
            <FormattedMessage id="preDeployChecks.deployAnyway" />
          </button>
        </div>
      </div>
    )
  case 'compile-failed':
    return <div className="alert alert-danger py-2 px-2 small" data-id="preDeployChecks-outcome-compile-failed"><FormattedMessage id="preDeployChecks.outcome.compileFailed" /></div>
  case 'no-contract':
    return <div className="alert alert-warning py-2 px-2 small" data-id="preDeployChecks-outcome-no-contract"><FormattedMessage id="preDeployChecks.outcome.noContract" /></div>
  case 'invalid-args':
    return <div className="alert alert-warning py-2 px-2 small" data-id="preDeployChecks-outcome-invalid-args"><FormattedMessage id="preDeployChecks.outcome.invalidArgs" /></div>
  case 'deploy-failed':
    return <div className="alert alert-danger py-2 px-2 small" data-id="preDeployChecks-outcome-deploy-failed"><FormattedMessage id="preDeployChecks.outcome.deployFailed" /></div>
  case 'deploy-declined':
    return <div className="alert alert-secondary py-2 px-2 small" data-id="preDeployChecks-outcome-deploy-declined"><FormattedMessage id="preDeployChecks.outcome.deployDeclined" /></div>
  case 'cancelled':
    return <div className="alert alert-secondary py-2 px-2 small" data-id="preDeployChecks-outcome-cancelled"><FormattedMessage id="preDeployChecks.outcome.cancelled" /></div>
  case 'error':
    return <div className="alert alert-danger py-2 px-2 small text-break" data-id="preDeployChecks-outcome-error">{outcome.message}</div>
  case 'done':
    return <div className="alert alert-success py-2 px-2 small" data-id="preDeployChecks-outcome-done"><FormattedMessage id="preDeployChecks.outcome.done" /></div>
  }
}

function SetupSection ({ view, plugin }: PreDeployChecksUIProps) {
  const intl = useIntl()
  const [open, setOpen] = useState(true)
  const { compiler, env, contracts, contractName, rawArgs, argErrors } = view
  const contract = contracts.find((c) => c.name === contractName)

  return (
    <div className="mb-3" data-id="preDeployChecks-setup">
      <button className="btn btn-sm p-0 d-flex align-items-center gap-1 fw-semibold mb-1 text-body" aria-expanded={open} onClick={() => setOpen(!open)} data-id="preDeployChecks-setup-toggle">
        <i className={`fas fa-angle-${open ? 'down' : 'right'}`} aria-hidden="true"></i>
        <FormattedMessage id="preDeployChecks.setup" />
      </button>
      {open && (
        <div className="small">
          <div className="d-flex justify-content-between gap-2 mb-1">
            <span className="text-secondary"><FormattedMessage id="preDeployChecks.compiler" /></span>
            <span className="text-end text-break" data-id="preDeployChecks-compiler">
              {compiler?.version ? `${compiler.version.replace(/^soljson-v?/, '').replace(/\.js$/, '')}, ${compiler.optimize ? `optimizer ${compiler.runs}` : 'no optimizer'}, ${compiler.evmVersion || 'default EVM'}` : '—'}
              {' '}<a href="#" onClick={(e) => { e.preventDefault(); plugin.openPlugin('solidity') }}><FormattedMessage id="preDeployChecks.change" /></a>
            </span>
          </div>
          <div className="d-flex justify-content-between gap-2 mb-1">
            <span className="text-secondary"><FormattedMessage id="preDeployChecks.environment" /></span>
            <span className="text-end text-break" data-id="preDeployChecks-environment">
              {env ? `${env.network || env.provider || '—'}${env.chainId ? ` (${env.chainId})` : ''}` : '—'}
              {' '}<a href="#" onClick={(e) => { e.preventDefault(); plugin.openPlugin('udapp') }}><FormattedMessage id="preDeployChecks.change" /></a>
            </span>
          </div>
          <div className="d-flex justify-content-between gap-2 mb-2">
            <span className="text-secondary"><FormattedMessage id="preDeployChecks.account" /></span>
            <span className="text-end text-break" data-id="preDeployChecks-account">{env?.account || '—'}</span>
          </div>
          {contracts.length > 0 ? (
            <>
              <label className="form-label text-secondary mb-1" htmlFor="preDeployChecks-contract"><FormattedMessage id="preDeployChecks.contract" /></label>
              <select
                id="preDeployChecks-contract"
                className="form-select form-select-sm mb-2"
                data-id="preDeployChecks-contract"
                value={contractName || ''}
                disabled={view.running}
                onChange={(e) => plugin.selectContract(e.target.value)}
              >
                {contracts.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
              {contract?.inputs.map((input, index) => (
                <div className="mb-2" key={index}>
                  <label className="form-label text-secondary mb-1" htmlFor={`preDeployChecks-arg-${index}`}>{input.name || `arg${index}`} <span className="text-secondary">({input.type})</span></label>
                  <input
                    id={`preDeployChecks-arg-${index}`}
                    className={`form-control form-control-sm ${argErrors[index] && rawArgs[index] !== undefined ? 'is-invalid' : ''}`}
                    data-id={`preDeployChecks-arg-${index}`}
                    placeholder={input.type}
                    value={rawArgs[index] || ''}
                    disabled={view.running}
                    onChange={(e) => plugin.setArg(index, e.target.value)}
                  />
                  {argErrors[index] && rawArgs[index] !== undefined && <div className="invalid-feedback">{argErrors[index]}</div>}
                </div>
              ))}
            </>
          ) : (
            <p className="text-secondary mb-0" data-id="preDeployChecks-contract-unknown">{intl.formatMessage({ id: 'preDeployChecks.contractAfterCompile' })}</p>
          )}
        </div>
      )}
    </div>
  )
}

export function PreDeployChecksUI ({ plugin, view }: PreDeployChecksUIProps) {
  const intl = useIntl()
  const now = useNow()
  const { file, state, findings, toggles, running } = view

  if (!file || !state) {
    return (
      <div className="px-3 pt-2" data-id="preDeployChecks-empty">
        <Disclaimer />
        <p className="text-secondary"><FormattedMessage id="preDeployChecks.empty" /></p>
      </div>
    )
  }

  const upToDate = STEP_ORDER.filter((id) => {
    const step = state.steps[id]
    return toggles[id] && step && ['passed', 'findings', 'submitted'].includes(step.status) && !isStale(state, id)
  }).length
  const enabledCount = STEP_ORDER.filter((id) => toggles[id]).length
  const high = blockingFindings(findings).length
  const deploy = state.steps.deploy

  const stepAction = (stepId: StepId): { label: string, onClick: () => void } | undefined => {
    const step = state.steps[stepId]
    if (stepId === 'slither' && step?.status === 'skipped' && step.data?.reason === 'unavailable') {
      return { label: intl.formatMessage({ id: 'preDeployChecks.action.connectRemixd' }), onClick: () => plugin.openPlugin('filePanel') }
    }
    if (stepId === 'ai' && step?.status === 'skipped' && step.data?.reason === 'sign-in') {
      return { label: intl.formatMessage({ id: 'preDeployChecks.action.openRemixAI' }), onClick: () => plugin.openPlugin('remixaiassistant') }
    }
    if (stepId === 'verify' && step?.status === 'submitted') {
      return { label: intl.formatMessage({ id: 'preDeployChecks.action.openVerification' }), onClick: () => plugin.openPlugin('contract-verification') }
    }
    return undefined
  }

  return (
    <div className="px-3 pt-2 pb-4" data-id="preDeployChecks">
      <Disclaimer />

      <div className="mb-3">
        <div className="fw-semibold text-break" data-id="preDeployChecks-file">{file}</div>
        <div className="small text-secondary" data-id="preDeployChecks-overall">
          <FormattedMessage id="preDeployChecks.overall" values={{ upToDate, total: enabledCount }} />
          {high > 0 && <> · <span className="text-danger"><FormattedMessage id="preDeployChecks.highCount" values={{ count: high }} /></span></>}
        </div>
      </div>

      <SetupSection view={view} plugin={plugin} />

      <ul className="list-group mb-3" data-id="preDeployChecks-steps">
        {STEP_ORDER.map((stepId) => (
          <StepRow
            key={stepId}
            stepId={stepId}
            state={state}
            enabled={toggles[stepId]}
            canToggle={stepId !== 'compile'}
            disabled={running}
            now={now}
            onToggle={(enabled) => plugin.setToggle(stepId, enabled)}
            onOpenFile={(path) => plugin.openFile(path)}
            onOpenError={(error) => plugin.openFinding(error)}
            action={stepAction(stepId)}
          />
        ))}
      </ul>
      {toggles.ai && <p className="small text-secondary mt-n2 mb-3" data-id="preDeployChecks-aiNotice"><FormattedMessage id="preDeployChecks.aiNotice" /></p>}

      <div className="d-flex gap-2 mb-3">
        {running ? (
          <button className="btn btn-secondary btn-sm flex-grow-1" data-id="preDeployChecks-cancel" disabled={view.cancelling} onClick={() => plugin.cancelRun()}>
            <FormattedMessage id={view.cancelling ? 'preDeployChecks.cancelling' : 'preDeployChecks.cancel'} />
          </button>
        ) : (
          <>
            <button className="btn btn-primary btn-sm flex-grow-1" data-id="preDeployChecks-run" onClick={() => plugin.startRun(file)}>
              <FormattedMessage id="preDeployChecks.run" />
            </button>
            <button className="btn btn-outline-secondary btn-sm" data-id="preDeployChecks-rerunAll" onClick={() => plugin.startRun(file, { force: true })}>
              <FormattedMessage id="preDeployChecks.rerunAll" />
            </button>
          </>
        )}
      </div>

      <OutcomeBanner view={view} plugin={plugin} />

      <h6 className="mt-3 mb-2"><FormattedMessage id="preDeployChecks.findings" /></h6>
      <FindingsList findings={findings} onOpen={(finding) => plugin.openFinding(finding)} />

      {deploy?.status === 'passed' && deploy.data?.address && (
        <div className="mt-3 small" data-id="preDeployChecks-deployment">
          <h6 className="mb-2"><FormattedMessage id="preDeployChecks.deployment" /></h6>
          <div className="text-break">{deploy.data.contractName}: <span data-id="preDeployChecks-deployedAddress">{deploy.data.address}</span></div>
          {deploy.data.txHash && <div className="text-break text-secondary">tx {deploy.data.txHash}</div>}
          {deploy.data.network && <div className="text-secondary">{deploy.data.network}{deploy.data.chainId ? ` (${deploy.data.chainId})` : ''}</div>}
        </div>
      )}

      <button className="btn btn-outline-primary btn-sm w-100 mt-3" data-id="preDeployChecks-saveReport" disabled={running || !Object.keys(state.steps).length} onClick={() => plugin.saveReport()}>
        <FormattedMessage id="preDeployChecks.saveReport" />
      </button>
    </div>
  )
}
