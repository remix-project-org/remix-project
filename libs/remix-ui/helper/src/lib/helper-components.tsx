import { LayoutCompatibilityReport } from '@openzeppelin/upgrades-core/dist/storage/report'
import React from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import { CompileOptionsProps } from '../types/compilerTypes'
import { CustomTooltip } from './components/custom-tooltip'
import { extractNameFromKey } from './remix-ui-helper'

export const fileChangedToastMsg = (from: string, path: string) => (
  <div>
    <i className="fas fa-exclamation-triangle text-danger me-1"></i>
    <span>
      {from} <span className="fw-bold text-warning">is modifying</span> {path}
    </span>
  </div>
)

export const compilerConfigChangedToastMsg = (from: string, value: string) => (
  <div>
    <b>{from}</b> is updating the <b>Solidity compiler configuration</b>.<pre className="text-start">{value}</pre>
  </div>
)

export const compileToastMsg = (from: string, fileName: string) => (
  <div>
    <b>{from}</b> is requiring to compile <b>{fileName}</b>
  </div>
)

export const compilingToastMsg = (settings: string) => (
  <div>
    <b>Recompiling and debugging with params</b>
    <pre className="text-start">{settings}</pre>
  </div>
)

export const compilationFinishedToastMsg = () => (
  <div>
    <b>Compilation failed...</b> continuing <i>without</i> source code debugging.
  </div>
)

export const notFoundToastMsg = (address: string) => (
  <div>
    <b>Contract {address} not found in source code repository</b> continuing <i>without</i> source code debugging.
  </div>
)

export const localCompilationToastMsg = () => (
  <div>
    <b>Using compilation result from Solidity module</b>
  </div>
)

export const sourceVerificationNotAvailableToastMsg = () => (
  <div>
    <b>Source verification plugin not activated or not available.</b> continuing <i>without</i> source code debugging.
  </div>
)

export const envChangeNotification = (env: {context: string; fork: string}, from: string) => (
  <div>
    <i className="fas fa-exclamation-triangle text-danger me-1"></i>
    <span>
      {from + ' '}
      <span className="fw-bold text-warning">set your environment to</span> {env && env.context}
    </span>
  </div>
)

export const storageFullMessage = () => (
  <div>
    <i className="fas fa-exclamation-triangle text-danger me-1"></i>
    <span className="fw-bold">
      <span>Cannot save this file due to full LocalStorage. Backup existing files and free up some space.</span>
    </span>
  </div>
)

export const recursivePasteToastMsg = () => <div>File(s) to paste is an ancestor of the destination folder</div>

export const logBuilder = (msg: string) => {
  return <pre>{msg}</pre>
}

export const cancelProxyMsg = () => (
  <div>
    <b>Proxy deployment cancelled.</b>
  </div>
)

export const cancelUpgradeMsg = () => (
  <div>
    <b>Upgrade with proxy cancelled.</b>
  </div>
)

export const deployWithProxyMsg = () => (
  <div>
    <b>Deploy with Proxy</b> will initiate two (2) transactions:
    <ol className="ps-3">
      <li key="impl-contract">Deploying the implementation contract</li>
      <li key="proxy-contract">Deploying an ERC1967 proxy contract</li>
    </ol>
  </div>
)

export const upgradeWithProxyMsg = () => (
  <div>
    <b>Upgrade with Proxy</b> will initiate two (2) transactions:
    <ol className="ps-3">
      <li key="new-impl-contract">Deploying the new implementation contract</li>
      <li key="update-proxy-contract">Updating the proxy contract with the address of the new implementation contract</li>
    </ol>
  </div>
)

export const unavailableProxyLayoutMsg = () => (
  <div>
    <p>
      The previous contract implementation is NOT available for an upgrade comparison
      <br /> A new storage layout will be saved for future upgrades.
    </p>
  </div>
)

export const upgradeReportMsg = (report: LayoutCompatibilityReport) => (
  <div>
    <div className="py-2 ms-2 mb-1 align-self-end mb-2 d-flex">
      <span className="align-self-center ps-4 mt-1">
        <i className="pe-2 text-warning far fa-exclamation-triangle" aria-hidden="true" style={{ fontSize: 'xxx-large', fontWeight: 'lighter' }}></i>
      </span>
      <div className="d-flex flex-column">
        <span className="ps-4 mt-1">The storage layout of new implementation is NOT</span>
        <span className="ps-4 mt-1">compatible with the previous implementation.</span>
        <span className="ps-4 mt-1">Your contract's storage may be partially or fully erased!</span>
      </div>
    </div>
    <div className="ps-4 text-danger">{report.explain()}</div>
  </div>
)

export function RenderIf({ condition, children }: { condition: boolean, children: JSX.Element }) {
  return condition ? children : null
}

export function RenderIfNot({ condition, children }: { condition: boolean, children: JSX.Element }) {
  return condition ? null : children
}

export const CompileOptions = ({ autoCompile, hideWarnings, setCircuitAutoCompile, setCircuitHideWarnings }: CompileOptionsProps) => (

  <div>
    <div className="mt-2 form-check">
      <input
        className="form-check-input"
        type="checkbox"
        onChange={(e) => setCircuitAutoCompile(e.target.checked)}
        checked={autoCompile}
        id="autoCompileCircuit"
      />
      <label className="form-check-label" htmlFor="autoCompileCircuit" data-id="auto_compile_circuit_checkbox_input">
        <FormattedMessage id="circuit.autoCompile" />
      </label>
    </div>
    <div className="mt-1 mb-2 form-check">
      <input
        className="form-check-input"
        onChange={(e) => setCircuitHideWarnings(e.target.checked)}
        type="checkbox"
        checked={hideWarnings}
        id="hideCircuitWarnings"
      />
      <label className="form-check-label" htmlFor="hideCircuitWarnings" data-id="hide_circuit_warnings_checkbox_input">
        <FormattedMessage id="solidity.hideWarnings" />
      </label>
    </div>
  </div>
)

export const CompileBtn = ({ plugin, appState, id, compileAction }: { plugin: any, appState: { status, filePath }, id: string, compileAction: () => void }) => (
  <CustomTooltip
    placement="auto"
    tooltipId="overlay-tooltip-compile"
    tooltipText={
      <div className="text-start">
        <div>
          <b>Ctrl+S</b> to compile {appState.filePath}
        </div>
      </div>
    }
  >
    <button
      className="btn btn-primary btn-block d-block w-100 text-break mb-1 mt-1"
      onClick={() => { compileAction() }}
      disabled={(appState.filePath === "") || (appState.status === "compiling")}
      data-id={`compile_${id}_btn`}
    >
      <div className="d-flex align-items-center justify-content-center">
        <RenderIf condition={appState.status === 'compiling'}>
          <i className="fas fa-sync fa-spin me-2" aria-hidden="true"></i>
        </RenderIf>
        <div className="text-truncate overflow-hidden text-nowrap">
          <span>
            <FormattedMessage id="circuit.compile" />
          </span>
          <span className="ms-1 text-nowrap">
            <RenderIf condition={appState.filePath === ""}>
              <FormattedMessage id="circuit.noFileSelected" />
            </RenderIf>
            <RenderIfNot condition={appState.filePath === ""}>
              <>{extractNameFromKey(appState.filePath)}</>
            </RenderIfNot>
          </span>
        </div>
      </div>
    </button>
  </CustomTooltip>
)

export const gitAccessTokenLink = 'https://github.com/settings/tokens/new?scopes=gist,repo&description=Remix%20IDE%20Token'
export const etherscanTokenLink = 'https://etherscan.io/myapikey'
export const sindriAccessTokenLink = 'https://sindri.app'

export const GitHubCredentialsDescription = () => {
  const intl = useIntl()

  return (
    <>
      <p className="mb-1">
        <FormattedMessage id="settings.gitAccessTokenText" />
      </p>
      <p className="mb-1">
        <a href={gitAccessTokenLink} target="_blank" rel="noopener noreferrer" className="text-primary">{intl.formatMessage({ id: 'settings.gitAccessTokenText2' })}</a> <FormattedMessage id="settings.gitAccessTokenText3" />
      </p>
    </>
  )
}

export const SindriCredentialsDescription = () => {
  const intl = useIntl()

  return (
    <>
      <p className="mb-1">
        <FormattedMessage id="settings.sindriAccessTokenText" />
      </p>
      <p className="mb-1">
        <a href={sindriAccessTokenLink} target="_blank" rel="noopener noreferrer" className="text-primary">{intl.formatMessage({ id: 'settings.gitAccessTokenText2' })}</a> <FormattedMessage id="settings.sindriAccessTokenText2" />
      </p>
    </>
  )
}

export const EtherscanConfigDescription = () => {
  const intl = useIntl()

  return (
    <>
      <p className="mb-1">
        <FormattedMessage id="settings.etherscanAccessTokenText" />
      </p>
      <p className="mb-1">
        <a className="text-primary" target="_blank" href={etherscanTokenLink}>
          {intl.formatMessage({ id: 'settings.etherscanAccessTokenText2' })}
        </a> <FormattedMessage id="settings.etherscanAccessTokenText3" />
      </p>
    </>
  )
}