import React, { Ref } from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import { Dropdown } from 'react-bootstrap'
import { CustomTooltip } from '@remix-ui/helper'
import { MoreMenu, MenuItems } from './more-menu'

export type CompileWithValue = 'remix' | 'hardhat' | 'foundry' | 'truffle'

export const frameworkNames: Record<Exclude<CompileWithValue, 'remix'>, string> = {
  hardhat: 'Hardhat',
  foundry: 'Foundry',
  truffle: 'Truffle'
}

interface CompilerHeaderProps {
  showMenu: boolean
  onAddCustomCompiler: () => void
  onShowLicense: () => void
}

// COMPILER label and its ⋯ menu of rare actions
export const CompilerHeader = (props: CompilerHeaderProps) => {
  const intl = useIntl()

  return (
    <div className="sc-label-row">
      <label className="sc-label" htmlFor="versionSelector"><FormattedMessage id="solidity.compiler" /></label>
      {props.showMenu && (
        <MoreMenu
          label={intl.formatMessage({ id: 'solidity.moreCompilerOptions' })}
          dataId="compilerMoreMenu"
          items={[
            { icon: 'fas fa-plus', text: <FormattedMessage id="solidity.addACustomCompiler" />, sub: <FormattedMessage id="solidity.addACustomCompilerSub" />, dataId: 'compilerAddCustomCompiler', onClick: props.onAddCustomCompiler },
            'divider',
            { icon: 'far fa-file-certificate', text: <FormattedMessage id="solidity.compilerLicenseMenu" />, dataId: 'compilerShowLicense', onClick: props.onShowLicense }
          ]}
        />
      )}
    </div>
  )
}

interface CompileWithProps {
  value: CompileWithValue
  frameworks: { value: Exclude<CompileWithValue, 'remix'>, configFile: string }[]
  onChange: (value: CompileWithValue) => void
  onOpenConfigFile: (file: string) => void
}

// framework projects only: pick Remix's compiler or the framework's. With the framework, its config file has the settings
export const CompileWith = ({ value, frameworks, onChange, onOpenConfigFile }: CompileWithProps) => {
  const intl = useIntl()
  const selected = frameworks.find((f) => f.value === value)

  return (
    <>
      <div className="sc-field">
        <label className="sc-field-label" htmlFor="compileWithSelector"><FormattedMessage id="solidity.compileWith" /></label>
        <select id="compileWithSelector" data-id="compileWithSelector" className="form-select" value={value} onChange={(e) => onChange(e.target.value as CompileWithValue)}>
          <option value="remix">{intl.formatMessage({ id: 'solidity.remixCompiler' })}</option>
          {frameworks.map((f) => <option key={f.value} value={f.value}>{frameworkNames[f.value]} ({f.configFile})</option>)}
        </select>
      </div>
      {selected && (
        <div className="sc-note" data-id="compileWithNote">
          <i className="fas fa-circle-info"></i>
          <span>
            <FormattedMessage id="solidity.frameworkConfigNote" values={{ file: selected.configFile, b: (chunks) => <b>{chunks}</b> }} />{' '}
            <button className="sc-link-btn" onClick={() => onOpenConfigFile(selected.configFile)}><FormattedMessage id="solidity.open" /></button>
          </span>
        </div>
      )}
    </>
  )
}

interface CompileButtonProps {
  fileName: string
  disabled: boolean
  iconRef: React.MutableRefObject<HTMLElement>
  onCompile: () => void
  onCompileAndRun: () => void
}

const CompileMoreToggle = React.forwardRef(
  (
    { onClick, label, disabled, 'aria-expanded': expanded }: { onClick: (e: React.MouseEvent) => void, label: string, disabled: boolean, 'aria-expanded'?: boolean },
    ref: Ref<HTMLButtonElement>
  ) => (
    <button
      ref={ref}
      type="button"
      className="btn btn-primary sc-compile-more"
      aria-label={label}
      aria-expanded={expanded}
      data-id="compilerCompileMore"
      disabled={disabled}
      onClick={(e) => {
        e.preventDefault()
        onClick(e)
      }}
    >
      <i className="fas fa-angle-down" aria-hidden="true"></i>
    </button>
  )
)

// the panel's only primary action, with Compile and run script behind its ▾
export const CompileButton = ({ fileName, disabled, iconRef, onCompile, onCompileAndRun }: CompileButtonProps) => {
  const intl = useIntl()
  const name = fileName || `<${intl.formatMessage({ id: 'solidity.noFileSelected' })}>`

  return (
    <div className="sc-compile-group">
      <CustomTooltip
        placement="auto"
        tooltipId="overlay-tooltip-compile"
        tooltipText={<div className="text-start"><b>Ctrl+S</b> <FormattedMessage id="solidity.toCompile" /> {fileName}</div>}
      >
        <button id="compileBtn" data-id="compilerContainerCompileBtn" className="btn btn-primary sc-compile remixui_disabled" onClick={onCompile} disabled={disabled}>
          <i ref={iconRef} className="fas fa-sync" aria-hidden="true"></i>
          <span className="text-truncate">
            <FormattedMessage id="solidity.compile" /> {name}
          </span>
        </button>
      </CustomTooltip>
      <Dropdown align="end">
        <Dropdown.Toggle as={CompileMoreToggle} label={intl.formatMessage({ id: 'solidity.moreCompileOptions' })} disabled={disabled} />
        <Dropdown.Menu className="sc-menu" data-id="compilerCompileMore-items">
          <MenuItems items={[{
            icon: 'fas fa-play',
            text: <FormattedMessage id="solidity.compileAndRunScriptMenu" />,
            sub: <FormattedMessage id="solidity.compileAndRunScriptSub" />,
            id: 'compileAndRunBtn',
            dataId: 'compilerContainerCompileAndRunBtn',
            onClick: onCompileAndRun
          }]} />
        </Dropdown.Menu>
      </Dropdown>
    </div>
  )
}
