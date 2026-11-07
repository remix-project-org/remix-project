import React from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import { ToggleSwitch } from '@remix-ui/toggle'
import { Select } from '@remix-ui/helper'

interface CompilerSettingsProps {
  open: boolean
  onToggle: () => void
  configFileName: string
  useFileConfiguration: boolean
  onUseFileConfigurationChange: () => void
  onOpenConfigFile: () => void
  language: string
  onLanguageChange: (value: string) => void
  evmVersion: string
  evmVersions: string[]
  onEvmVersionChange: (value: string) => void
  optimize: boolean
  onOptimizeChange: (value: boolean) => void
  runs: string
  onRunsChange: (value: string) => void
  includeNightlies: boolean
  onNightliesChange: (value: boolean) => void
  showOnlyDownloaded: boolean
  onlyDownloaded: boolean
  onOnlyDownloadedChange: (value: boolean) => void
}

// "default" stands for the compiler's default EVM version, which is the next entry of the list
const evmVersionName = (version: string, evmVersions: string[]) => version === 'default' || !version ? evmVersions[evmVersions.indexOf('default') + 1] : version

// Settings row (chevron + read-only summary) and the card it expands to
export const CompilerSettings = (props: CompilerSettingsProps) => {
  const intl = useIntl()
  const { open, useFileConfiguration, language, evmVersion, evmVersions, optimize, runs } = props

  const summary = useFileConfiguration
    ? props.configFileName
    : [
      language === 'Yul' ? 'Yul' : null,
      evmVersionName(evmVersion, evmVersions),
      optimize ? intl.formatMessage({ id: 'solidity.optimizerWithRuns' }, { runs: runs || 200 }) : intl.formatMessage({ id: 'solidity.noOptimizer' })
    ].filter(Boolean).join(' · ')

  return (
    <>
      <button className="sc-settings-row" data-id="scConfigExpander" aria-expanded={open} onClick={props.onToggle}>
        <i className={`fas fa-chevron-${open ? 'down' : 'right'} sc-chev`}></i>
        <span className="sc-settings-title"><FormattedMessage id="solidity.settings" /></span>
        <span className="sc-settings-summary" data-id="scSettingsSummary">{summary}</span>
      </button>

      {/* stays mounted while collapsed, like before: tests and URL parameters read its fields */}
      <div className={`sc-card sc-settings ${open ? '' : 'd-none'}`} data-id="scSettings">
        <div className="sc-set-row">
          <span>
            <label className="n" htmlFor="scFileConfig"><FormattedMessage id="solidity.useAConfigurationFile" /></label>
            <small><FormattedMessage id="solidity.useAConfigurationFileSub" /></small>
          </span>
          <span data-id="scFileConfiguration">
            <ToggleSwitch id="scFileConfig" isOn={useFileConfiguration} onClick={props.onUseFileConfigurationChange} />
          </span>
        </div>

        {useFileConfiguration ? (
          <div className="sc-file-row">
            <i className="far fa-file-code"></i>
            <span className="n">{props.configFileName}</span>
            <button className="sc-link-btn ms-auto" data-id="view-solidity-config" onClick={props.onOpenConfigFile}>
              <FormattedMessage id="solidity.open" />
            </button>
          </div>
        ) : (
          <>
            <div className="sc-grid">
              <div className="sc-field" id="compilerLanguageSelectorWrapper">
                <label className="sc-field-label" htmlFor="compilerLanguageSelector"><FormattedMessage id="solidity.language" /></label>
                <Select
                  id="compilerLanguageSelector"
                  title={intl.formatMessage({ id: 'solidity.tooltipText6' })}
                  value={language}
                  onChange={props.onLanguageChange}
                  options={[
                    { value: 'Solidity', label: 'Solidity', itemProps: { 'data-sol-lang': 'solidity' } },
                    { value: 'Yul', label: 'Yul', itemProps: { 'data-sol-lang': 'yul' } }
                  ]}
                />
              </div>
              <div className="sc-field">
                <label className="sc-field-label" htmlFor="evmVersionSelector"><FormattedMessage id="solidity.evmVersion" /></label>
                <Select
                  id="evmVersionSelector"
                  value={evmVersion}
                  onChange={props.onEvmVersionChange}
                  options={evmVersions.map((version, index) => ({
                    value: version,
                    label: version === 'default'
                      ? intl.formatMessage({ id: 'solidity.evmVersionDefault' }, { version: evmVersions[index + 1] })
                      : version
                  }))}
                />
              </div>
            </div>
            <div className="sc-set-row">
              <span title={intl.formatMessage({ id: !optimize ? 'solidity.enableOptimizerTooltip' : 'solidity.disableOptimizerTooltip' })}>
                <label className="n" htmlFor="optimize"><FormattedMessage id="solidity.optimizer" /></label>
                <small><FormattedMessage id="solidity.optimizerSub" /></small>
              </span>
              <span className="d-flex align-items-center gap-2">
                <input
                  id="runs"
                  className={`form-control form-control-sm sc-runs ${optimize ? '' : 'd-none'}`}
                  disabled={!optimize}
                  type="number"
                  min="1"
                  placeholder="200"
                  aria-label={intl.formatMessage({ id: 'solidity.runs' })}
                  title={intl.formatMessage({ id: 'solidity.inputTitle2' })}
                  value={runs}
                  onChange={(e) => props.onRunsChange(e.target.value)}
                />
                <ToggleSwitch id="optimize" isOn={optimize} onClick={() => props.onOptimizeChange(!optimize)} />
              </span>
            </div>
            {optimize && <div className="sc-hint"><FormattedMessage id="solidity.runsHint" /></div>}
          </>
        )}

        <div className="sc-sep"></div>
        <div className="sc-set-row">
          <label className="n" htmlFor="nightlies"><FormattedMessage id="solidity.showNightlyBuilds" /></label>
          <span data-id="compilerNightliesBuild">
            <ToggleSwitch id="nightlies" size="sm" isOn={props.includeNightlies} onClick={() => props.onNightliesChange(!props.includeNightlies)} />
          </span>
        </div>
        {props.showOnlyDownloaded && (
          <div className="sc-set-row">
            <label className="n" htmlFor="downloadedcompilers"><FormattedMessage id="solidity.onlyDownloadedVersions" /></label>
            <ToggleSwitch id="downloadedcompilers" size="sm" isOn={props.onlyDownloaded} onClick={() => props.onOnlyDownloadedChange(!props.onlyDownloaded)} />
          </div>
        )}
      </div>
    </>
  )
}
