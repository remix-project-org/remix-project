import React, { useEffect, useState } from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import { Verdict, VerdictAction } from '../verdict'
import { timeAgo, toolList } from './format'
import { PreDeployChecksActions } from './types'

interface StatusCardProps {
  file: string
  verdict: Verdict
  actions: VerdictAction[]
  cancelling: boolean
  now: number
  plugin: PreDeployChecksActions
}

const LOOK: Partial<Record<Verdict['kind'], { tone: string, icon: string }>> = {
  running: { tone: 'neutral', icon: 'fas fa-circle-notch fa-spin' },
  'compile-failed': { tone: 'danger', icon: 'fas fa-times' },
  'out-of-date': { tone: 'warning', icon: 'fas fa-history' },
  gate: { tone: 'danger', icon: 'fas fa-exclamation' },
  clear: { tone: 'success', icon: 'fas fa-check' },
  deployed: { tone: 'success', icon: 'fas fa-check' }
}

function Sentence ({ verdict }: { verdict: Verdict }) {
  const intl = useIntl()
  switch (verdict.kind) {
  case 'running': return <FormattedMessage id="preDeployChecks.status.running" values={{ tool: intl.formatMessage({ id: `preDeployChecks.step.${verdict.step}` }) }} />
  case 'compile-failed': return <FormattedMessage id="preDeployChecks.status.compileFailed" values={{ count: verdict.errors }} />
  case 'out-of-date': return <FormattedMessage id="preDeployChecks.status.outOfDate" />
  case 'gate': return <FormattedMessage id="preDeployChecks.status.gate" values={{ count: verdict.high }} />
  case 'clear': return <FormattedMessage id="preDeployChecks.status.clear" />
  case 'deployed': return <FormattedMessage id="preDeployChecks.status.deployed" values={{ network: verdict.network || intl.formatMessage({ id: 'preDeployChecks.unknownNetwork' }) }} />
  default: return null
  }
}

function Subline ({ verdict, now }: { verdict: Verdict, now: number }) {
  const intl = useIntl()
  switch (verdict.kind) {
  case 'compile-failed': return <FormattedMessage id="preDeployChecks.status.compileFailedSub" />
  case 'out-of-date': return <FormattedMessage id="preDeployChecks.status.outOfDateSub" />
  case 'gate':
    return verdict.notRun.length
      ? <FormattedMessage id="preDeployChecks.status.notRun" values={{ tools: toolList(intl, verdict.notRun) }} />
      : <FormattedMessage id="preDeployChecks.status.gateSub" />
  case 'clear': {
    const parts = [intl.formatMessage({ id: 'preDeployChecks.status.fromTools' }, { count: verdict.tools })]
    if (verdict.medium) parts.push(intl.formatMessage({ id: 'preDeployChecks.status.mediumToReview' }, { count: verdict.medium }))
    if (verdict.ignored) parts.push(intl.formatMessage({ id: 'preDeployChecks.status.ignored' }, { count: verdict.ignored }))
    return <>{parts.join(' · ')}</>
  }
  case 'deployed': return <>{[verdict.contractName, timeAgo(intl, verdict.at, now)].filter(Boolean).join(' · ')}</>
  default: return null
  }
}

export function StatusCard ({ file, verdict, actions, cancelling, now, plugin }: StatusCardProps) {
  const [confirming, setConfirming] = useState(false)
  const look = LOOK[verdict.kind]

  // the confirmation belongs to the gate it was opened for
  useEffect(() => setConfirming(false), [file, verdict.kind])

  if (!look) return null
  return (
    <section className="pdc-card pdc-status" data-id="preDeployChecks-status" data-kind={verdict.kind}>
      <div className="d-flex gap-3 align-items-center">
        <span className={`pdc-status-icon pdc-tone-${look.tone}`} aria-hidden="true"><i className={look.icon}></i></span>
        <div className="min-w-0">
          <div className="pdc-title" data-id="preDeployChecks-status-title"><Sentence verdict={verdict} /></div>
          {verdict.kind !== 'running' && <div className="pdc-sub" data-id="preDeployChecks-status-sub"><Subline verdict={verdict} now={now} /></div>}
        </div>
      </div>

      {!confirming && actions.length > 0 && (
        <div className="pdc-actions">
          {actions.includes('cancel') && (
            <button className="btn pdc-btn pdc-btn-quiet" data-id="preDeployChecks-cancel" disabled={cancelling} onClick={() => plugin.cancelRun()}>
              <FormattedMessage id={cancelling ? 'preDeployChecks.cancelling' : 'preDeployChecks.cancel'} />
            </button>
          )}
          {actions.includes('run') && (
            <button className="btn pdc-btn btn-primary" data-id="preDeployChecks-run" onClick={() => plugin.startRun(file)}>
              <FormattedMessage id="preDeployChecks.run" />
            </button>
          )}
          {actions.includes('rerun') && (
            <button className="btn pdc-btn pdc-btn-quiet" data-id="preDeployChecks-rerun" onClick={() => plugin.startRun(file, { force: true })}>
              <FormattedMessage id="preDeployChecks.rerun" />
            </button>
          )}
          {actions.includes('deploy-anyway') && (
            <button className="btn pdc-btn pdc-btn-danger-outline" data-id="preDeployChecks-deployAnyway" onClick={() => setConfirming(true)}>
              <FormattedMessage id="preDeployChecks.deployAnyway" />
            </button>
          )}
          {actions.includes('go-to-deploy') && (
            <button className="btn pdc-btn btn-primary" data-id="preDeployChecks-goToDeploy" onClick={() => plugin.goToDeploy()}>
              <FormattedMessage id="preDeployChecks.goToDeploy" /><i className="fas fa-arrow-right ms-2 pdc-btn-icon" aria-hidden="true"></i>
            </button>
          )}
        </div>
      )}

      {confirming && verdict.kind === 'gate' && (
        <div className="pdc-confirm" data-id="preDeployChecks-confirm">
          <div className="pdc-confirm-text"><FormattedMessage id="preDeployChecks.confirmDeploy" values={{ count: verdict.high }} /></div>
          <div className="pdc-actions">
            <button className="btn pdc-btn pdc-btn-quiet" data-id="preDeployChecks-confirmCancel" onClick={() => setConfirming(false)}>
              <FormattedMessage id="preDeployChecks.cancel" />
            </button>
            <button className="btn pdc-btn btn-danger" data-id="preDeployChecks-confirmDeploy" onClick={() => plugin.goToDeploy()}>
              <FormattedMessage id="preDeployChecks.goToDeploy" />
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
