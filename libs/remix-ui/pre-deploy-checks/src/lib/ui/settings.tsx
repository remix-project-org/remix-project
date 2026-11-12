import React from 'react'
import { FormattedMessage, IntlShape, useIntl } from 'react-intl'
import { StepToggles } from '../types'
import { CheckList } from './check-list'
import { CompilerSummary, PreDeployChecksActions } from './types'

function compilerLine (intl: IntlShape, compiler: CompilerSummary | null): string {
  if (!compiler?.version) return ''
  const optimizer = compiler.optimize
    ? intl.formatMessage({ id: 'preDeployChecks.compiler.optimizerOn' }, { runs: compiler.runs })
    : intl.formatMessage({ id: 'preDeployChecks.compiler.optimizerOff' })
  const evm = compiler.evmVersion && intl.formatMessage({ id: 'preDeployChecks.compiler.evm' }, { version: compiler.evmVersion })
  // "0.8.34+commit.80d5c536.Emscripten.clang" → "0.8.34+commit.80d5c536"
  return [compiler.version.replace(/\.Emscripten.*$/, ''), optimizer, evm].filter(Boolean).join(' · ')
}

interface SettingsProps {
  toggles: StepToggles
  compiler: CompilerSummary | null
  disabled: boolean
  onBack: () => void
  plugin: PreDeployChecksActions
}

export function Settings ({ toggles, compiler, disabled, onBack, plugin }: SettingsProps) {
  const intl = useIntl()
  return (
    <>
      <div className="pdc-back">
        <button className="pdc-icon-btn" data-id="preDeployChecks-back" onClick={onBack} aria-label={intl.formatMessage({ id: 'preDeployChecks.back' })}>
          <i className="fas fa-arrow-left" aria-hidden="true"></i>
        </button>
        <span><FormattedMessage id="preDeployChecks.settings" /></span>
      </div>
      <section className="pdc-card pdc-settings" data-id="preDeployChecks-settings">
        <div className="pdc-title"><FormattedMessage id="preDeployChecks.checksToRun" /></div>
        <p className="pdc-sub mb-2"><FormattedMessage id="preDeployChecks.checksToRunHint" /></p>
        <CheckList toggles={toggles} disabled={disabled} plugin={plugin} />
      </section>
      <section className="pdc-card pdc-settings">
        <div className="pdc-title"><FormattedMessage id="preDeployChecks.compiler" /></div>
        <p className="pdc-sub mb-2" data-id="preDeployChecks-compilerSettings">{compilerLine(intl, compiler) || <FormattedMessage id="preDeployChecks.compilerUnknown" />}</p>
        <button className="pdc-link-btn" data-id="preDeployChecks-openCompiler" onClick={() => plugin.openPlugin('solidity')}>
          <FormattedMessage id="preDeployChecks.changeCompiler" />
        </button>
      </section>
    </>
  )
}
