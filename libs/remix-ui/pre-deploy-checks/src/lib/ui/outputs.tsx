import React from 'react'
import { FormattedMessage } from 'react-intl'
import { CopyToClipboard } from '@remix-ui/clipboard'
import { isStale } from '../store'
import { FileCheckState } from '../types'
import { VerificationReceipt } from '../verification'
import { splitPath } from './format'
import { PreDeployChecksActions } from './types'

interface OutputsProps {
  state: FileCheckState
  flattenEnabled: boolean
  reportPath: string | null
  plugin: PreDeployChecksActions
}

export function Outputs ({ state, flattenEnabled, reportPath, plugin }: OutputsProps) {
  const flatten = state.steps.flatten
  const flatPath: string | undefined = flattenEnabled && flatten?.status === 'passed' ? flatten.data?.path : undefined
  const flatStale = isStale(state, 'flatten')
  return (
    <section className="pdc-outputs" data-id="preDeployChecks-outputs">
      <div className="pdc-section-head"><span className="pdc-section-title"><FormattedMessage id="preDeployChecks.outputs" /></span></div>
      <div className="pdc-card pdc-list-card">
        {flatPath && (
          <div className={`pdc-output ${flatStale ? 'pdc-dim' : ''}`}>
            <i className="far fa-file-code" aria-hidden="true"></i>
            <div className="min-w-0 flex-grow-1">
              <div className="pdc-output-name"><FormattedMessage id="preDeployChecks.flattenedFile" /></div>
              <div className="pdc-output-meta text-truncate">
                {splitPath(flatPath).name}{flatStale && <> · <FormattedMessage id="preDeployChecks.outOfDate" /></>}
              </div>
            </div>
            <button className="pdc-link-btn" data-id="preDeployChecks-openFlattened" onClick={() => plugin.openFile(flatPath)}><FormattedMessage id="preDeployChecks.open" /></button>
          </div>
        )}
        <div className="pdc-output">
          <i className="far fa-file-alt" aria-hidden="true"></i>
          <div className="min-w-0 flex-grow-1">
            <div className="pdc-output-name"><FormattedMessage id="preDeployChecks.report" /></div>
            <div className="pdc-output-meta text-truncate">
              {reportPath ? splitPath(reportPath).name : ''} · <FormattedMessage id="preDeployChecks.reportContents" />
            </div>
          </div>
          <button className="pdc-link-btn" data-id="preDeployChecks-saveReport" onClick={() => plugin.saveReport()}><FormattedMessage id="preDeployChecks.save" /></button>
        </div>
      </div>
    </section>
  )
}

/** The deployment made from Deploy & Run for this file, once picked up. */
export function Deployment ({ state }: { state: FileCheckState }) {
  const deploy = state.steps.deploy
  if (deploy?.status !== 'passed' || !deploy.data?.address) return null
  const { address, txHash, contractName } = deploy.data
  const verify = state.steps.verify
  const receipts: VerificationReceipt[] = verify?.data?.receipts || []
  return (
    <section className="pdc-card pdc-deployment" data-id="preDeployChecks-deployment">
      <div className="pdc-section-title">{contractName || <FormattedMessage id="preDeployChecks.deployment" />}</div>
      <div className="pdc-address">
        <span className="pdc-mono text-truncate" data-id="preDeployChecks-deployedAddress">{address}</span>
        <CopyToClipboard content={address} direction="top" classList="pdc-icon-btn" />
      </div>
      {txHash && <div className="pdc-meta text-truncate">tx <span className="pdc-mono">{txHash}</span></div>}
      {verify && (
        <div className="pdc-meta" data-id="preDeployChecks-verification">
          <FormattedMessage id="preDeployChecks.verification" />: <FormattedMessage id={`preDeployChecks.verification.${verify.status}`} defaultMessage={verify.status} />
        </div>
      )}
      {receipts.length > 0 && (
        <ul className="pdc-receipts" data-id="preDeployChecks-receipts">
          {receipts.map((r) => (
            <li key={r.verifier} className="pdc-receipt" data-id={`preDeployChecks-receipt-${r.verifier}`} data-outcome={r.outcome}>
              <div className="d-flex gap-2 align-items-baseline">
                <span className="pdc-receipt-name">{r.verifier}</span>
                <span className={`pdc-receipt-status pdc-receipt-${r.outcome}`}>{r.status}</span>
                {r.lookupUrl && (
                  <a className="pdc-link-btn ms-auto" href={r.lookupUrl} target="_blank" rel="noopener noreferrer"><FormattedMessage id="preDeployChecks.view" /></a>
                )}
              </div>
              {r.outcome === 'failed' && r.message && <div className="pdc-receipt-message text-truncate" title={r.message}>{r.message}</div>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
