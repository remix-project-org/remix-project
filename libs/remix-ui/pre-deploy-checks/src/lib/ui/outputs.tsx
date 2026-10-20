import React from 'react'
import { FormattedMessage } from 'react-intl'
import { CopyToClipboard } from '@remix-ui/clipboard'
import { isStale } from '../store'
import { FileCheckState } from '../types'
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
    </section>
  )
}
