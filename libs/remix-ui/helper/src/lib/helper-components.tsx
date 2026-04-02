import React from 'react'
import { LayoutCompatibilityReport } from '@openzeppelin/upgrades-core/dist/storage/report'
import { FormattedMessage, useIntl } from 'react-intl'
import { CompileOptionsProps } from '../types/compilerTypes'
import { CustomTooltip } from './components/custom-tooltip'
import { extractNameFromKey } from './remix-ui-helper'
import type { OverSizeLimit } from '@remix-project/core-plugin'

export const fileChangedToastMsg = (from: string, path: string) => (
  <div>
    <i className="fas fa-exclamation-triangle text-red-500 mr-1"></i>
    <span>
      {from} <span className="font-bold text-yellow-500">is modifying</span> {path}
    </span>
  </div>
)

export const compilerConfigChangedToastMsg = (from: string, value: string) => (
  <div>
    <b>{from}</b> is updating the <b>Solidity compiler configuration</b>.<pre className="text-left">{value}</pre>
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
    <pre className="text-left">{settings}</pre>
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
    <i className="fas fa-exclamation-triangle text-red-500 mr-1"></i>
    <span>
      {from + ' '}
      <span className="font-bold text-yellow-500">set your environment to</span> {env && env.context}
    </span>
  </div>
)

export const storageFullMessage = () => (
  <div>
    <i className="fas fa-exclamation-triangle text-red-500 mr-1"></i>
    <span className="font-bold">
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
    <ol className="pl-3">
      <li key="impl-contract">Deploying the implementation contract</li>
      <li key="proxy-contract">Deploying an ERC1967 proxy contract</li>
    </ol>
  </div>
)

export const upgradeWithProxyMsg = () => (
  <div>
    <b>Upgrade with Proxy</b> will initiate two (2) transactions:
    <ol className="pl-3">
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
    <div className="py-2 ml-2 mb-1 self-end mb-2 flex">
      <span className="self-center pl-4 mt-1">
        <i className="pr-2 text-yellow-500 far fa-exclamation-triangle" aria-hidden="true" style={{ fontSize: 'xxx-large', fontWeight: 'lighter' }}></i>
      </span>
      <div className="flex flex-col">
        <span className="pl-4 mt-1">The storage layout of new implementation is NOT</span>
        <span className="pl-4 mt-1">compatible with the previous implementation.</span>
        <span className="pl-4 mt-1">Your contract's storage may be partially or fully erased!</span>
      </div>
    </div>
    <div className="pl-4 text-red-500">{report.explain()}</div>
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
    <div className="mt-2 flex items-center">
      <input
        className="w-4 h-4 text-primary bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-primary focus:ring-2"
        type="checkbox"
        onChange={(e) => setCircuitAutoCompile(e.target.checked)}
        checked={autoCompile}
        id="autoCompileCircuit"
      />
      <label className="ml-2 text-sm font-medium text-gray-900 dark:text-gray-300 cursor-pointer" htmlFor="autoCompileCircuit" data-id="auto_compile_circuit_checkbox_input">
        <FormattedMessage id="circuit.autoCompile" />
      </label>
    </div>
    <div className="mt-1 mb-2 flex items-center">
      <input
        className="w-4 h-4 text-primary bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-primary focus:ring-2"
        onChange={(e) => setCircuitHideWarnings(e.target.checked)}
        type="checkbox"
        checked={hideWarnings}
        id="hideCircuitWarnings"
      />
      <label className="ml-2 text-sm font-medium text-gray-900 dark:text-gray-300 cursor-pointer" htmlFor="hideCircuitWarnings" data-id="hide_circuit_warnings_checkbox_input">
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
      <div className="text-left">
        <div>
          <b>Ctrl+S</b> to compile {appState.filePath}
        </div>
      </div>
    }
  >
    <button
      className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-md transition-colors duration-200 block w-full break-words mb-1 mt-1 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-50 disabled:opacity-50 disabled:cursor-not-allowed"
      onClick={() => { compileAction() }}
      disabled={(appState.filePath === "") || (appState.status === "compiling")}
      data-id={`compile_${id}_btn`}
    >
      <div className="flex items-center justify-center">
        <RenderIf condition={appState.status === 'compiling'}>
          <i className="fas fa-sync fa-spin mr-2" aria-hidden="true"></i>
        </RenderIf>
        <div className="truncate overflow-hidden whitespace-nowrap">
          <span>
            <FormattedMessage id="circuit.compile" />
          </span>
          <span className="ml-1 whitespace-nowrap">
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

export const isOverSizePrompt = (values: OverSizeLimit) => {
  return (
    <div>
      {values.overSizeEip170 && (
        <div>
          <FormattedMessage
            id="udapp.isOverSizePromptEip170"
            values={{
              br: <br />,
              a: (
                <a href="https://eips.ethereum.org/EIPS/eip-170" target="_blank" rel="noreferrer">
                  eip-170
                </a>
              ),
            }}
          />
        </div>
      )}
      {values.overSizeEip3860 && (
        <div>
          <FormattedMessage
            id="udapp.isOverSizePromptEip3860"
            values={{
              br: <br />,
              a: (
                <a href="https://eips.ethereum.org/EIPS/eip-3860" target="_blank" rel="noreferrer">
                  eip-3860
                </a>
              ),
            }}
          />
        </div>
      )}
    </div>
  )
}

export const SmartAccountPromptTitle = ({ title }: { title: string }) => {
  return (
    <div className="flex items-center">
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 mr-2">Alpha</span>
      <span>{title}</span>
    </div>
  )
}
export const checkSumWarning = () => (
  <span className="text-left">
    <FormattedMessage
      id="udapp.checkSumWarning"
      values={{
        br: <br />,
        a: (
          <a href="https://eips.ethereum.org/EIPS/eip-55" target="_blank" rel="noreferrer">
        EIP-55
          </a>
        ),
      }}
    />
  </span>
)
