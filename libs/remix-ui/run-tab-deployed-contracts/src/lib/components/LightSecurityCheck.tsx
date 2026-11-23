import React, { useContext, useState } from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import { TrackingContext } from '@remix-ide/tracking'
import { useAuth } from '@remix-ui/app'
import { Features } from '@remix-api'
import { DeployedContractsAppContext } from '../contexts'
import { DeployedContract, LightCheckInfo } from '../types'

const LOOK: Partial<Record<LightCheckInfo['status'], { tone: string, icon: string }>> = {
  running: { tone: 'scanning', icon: 'fas fa-shield-alt udapp-light-check-pulse' },
  clear: { tone: 'success', icon: 'fas fa-check-circle' },
  issues: { tone: 'danger', icon: 'fas fa-exclamation-triangle' },
  signin: { tone: 'promo', icon: 'fas fa-shield-alt' },
  exhausted: { tone: 'warning', icon: 'fas fa-shield-alt' }
}

/**
 * The light security check of a freshly deployed contract: a one-line verdict
 * under the card header, with the details and the way to the full audit.
 */
export function LightSecurityCheck ({ contract }: { contract: DeployedContract }) {
  const { plugin, lightChecks, themeQuality } = useContext(DeployedContractsAppContext)
  const { trackMatomoEvent } = useContext(TrackingContext)
  const { isAuthenticated, features } = useAuth()
  const intl = useIntl()
  const [open, setOpen] = useState(false)

  const hasAuditorAccess = isAuthenticated && features?.[Features.AI_AUDITOR]?.is_enabled === true

  const record = lightChecks?.[(contract.address || '').toLowerCase()]
  // a reset Remix VM reuses addresses: only the check of this very contract counts
  if (!record || record.contractName !== contract.name) return null
  const look = LOOK[record.status]
  if (!look) return null

  const cta = (name: string, run: () => Promise<any>) => (e: React.MouseEvent) => {
    e.stopPropagation()
    trackMatomoEvent?.({ category: 'udapp', action: 'lightSecurityCheckCta', name, isClick: true })
    run().catch((err) => console.warn('Light security check action failed', err))
  }
  const fullAudit = cta(`fullAudit-${record.status}`, () => plugin.call('preDeployChecks', 'fullAudit', record.file))
  const signIn = cta('signIn', () => plugin.call('planManager' as any, 'open', { reason: 'auth-required' }))
  const topUp = cta('topUp', () => plugin.call('planManager' as any, 'open'))

  const count = record.reasons.length
  const text = () => {
    switch (record.status) {
    case 'running': return intl.formatMessage({ id: 'udapp.lightCheck.running' })
    case 'clear': return intl.formatMessage({ id: 'udapp.lightCheck.clear' })
    case 'issues': return count
      ? intl.formatMessage({ id: 'udapp.lightCheck.issues' }, { count })
      : intl.formatMessage({ id: 'udapp.lightCheck.issuesNoDetails' })
    case 'signin': return intl.formatMessage({ id: 'udapp.lightCheck.signin' })
    case 'exhausted': return intl.formatMessage({ id: 'udapp.lightCheck.exhausted' })
    }
  }

  const action = () => {
    switch (record.status) {
    case 'clear': return <button className="udapp-light-check-link" data-id="lightCheckFullAudit" onClick={fullAudit}><FormattedMessage id="udapp.lightCheck.fullAudit" /></button>
    case 'issues': return count
      ? <button className="udapp-light-check-link" data-id="lightCheckToggle" aria-expanded={open} onClick={(e) => { e.stopPropagation(); setOpen(!open) }}>
        <FormattedMessage id={open ? 'udapp.lightCheck.hide' : 'udapp.lightCheck.details'} />
      </button>
      : <button className="udapp-light-check-link" data-id="lightCheckFullAudit" onClick={fullAudit}><FormattedMessage id="udapp.lightCheck.fullAudit" /></button>
    case 'signin': return <button className="udapp-light-check-link" data-id="lightCheckSignIn" onClick={signIn}><FormattedMessage id="udapp.lightCheck.signinAction" /></button>
    case 'exhausted': return <button className="udapp-light-check-link" data-id="lightCheckTopUp" onClick={topUp}><FormattedMessage id="udapp.lightCheck.exhaustedAction" /></button>
    default: return null
    }
  }

  return (
    <div
      // keyed on the status so each new state fades in
      key={record.status}
      className={`udapp-light-check udapp-light-check-${look.tone} udapp-light-check-${themeQuality === 'light' ? 'light' : 'dark'} mx-3 mb-2`}
      data-id={`lightCheck-${contract.address}`}
      data-status={record.status}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="d-flex align-items-center gap-2">
        <i className={look.icon} aria-hidden="true"></i>
        <span className="flex-grow-1 text-start udapp-light-check-text">
          <span className="udapp-light-check-kicker"><FormattedMessage id="udapp.lightCheck.kicker" /></span>
          {text()}
        </span>
        {action()}
      </div>
      {record.status === 'running' && <div className="udapp-light-check-progress" role="presentation"><div></div></div>}
      {record.status === 'issues' && open && (
        <div className="udapp-light-check-details" data-id="lightCheckDetails">
          <div className={hasAuditorAccess ? undefined : 'udapp-light-check-details-gated'}>
            <ul className="mb-2 ps-3">
              {record.reasons.map((reason, i) => (
                <li key={i}>
                  {reason}
                  {record.suggestions[i] && <div className="udapp-light-check-suggestion">{record.suggestions[i]}</div>}
                </li>
              ))}
            </ul>
            {!hasAuditorAccess && (
              <div className="udapp-light-check-gate-overlay">
                <button className="btn btn-sm btn-primary" data-id="lightCheckGateCta" onClick={isAuthenticated ? topUp : signIn}>
                  <FormattedMessage id={isAuthenticated ? 'udapp.lightCheck.upgradeToView' : 'udapp.lightCheck.signinToView'} />
                </button>
              </div>
            )}
          </div>
          <div className="udapp-light-check-note"><FormattedMessage id="udapp.lightCheck.lightNote" /></div>
          <button className="btn btn-sm btn-primary w-100 mt-2" data-id="lightCheckFullAudit" onClick={fullAudit}>
            <FormattedMessage id="udapp.lightCheck.fullAuditCta" />
          </button>
        </div>
      )}
    </div>
  )
}
