import React, { useContext } from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import { helper } from '@remix-project/remix-solidity'
import { CopyToClipboard } from '@remix-ui/clipboard'
import { CustomTooltip } from '@remix-ui/helper'
import { gotoError, fixWithRemixAI } from '@remix-ui/renderer'
import { ToggleSwitch } from '@remix-ui/toggle'
import { TrackingContext } from '@remix-ide/tracking'
import { CompileErrors } from '../types'
import { AiIcon } from './ai-review'

export type CompileIssueData = {
  severity: 'error' | 'warning'
  title: string
  formatted: string
  errFile: string
  errLine: number
  errCol: number
  location: string
}

const baseName = (path: string) => path.split('/').pop()

// solc's formattedMessage: "ParserError: Expected ';' but got '}'\n --> contracts/A.sol:21:5:\n   |\n21 | ..." (older
// versions put "file:line:col: " first). The title is the first line without the location and the "XxxError:" kind.
export const toIssue = (err: any): CompileIssueData => {
  const formatted: string = typeof err === 'string' ? err : (err.formattedMessage || err.message || String(err))
  const severity = typeof err === 'object' && (err.severity === 'warning' || err.severity === 'info') ? 'warning' : 'error'
  const title = formatted.trim().split('\n')[0]
    .replace(/^.*?:\d+:\d+:\s*/, '')
    .replace(/^(\w*Error|Warning|Info)\s*:\s*/, '')
  const pos = helper.getPositionDetails(formatted)
  const errLine = Number.isFinite(pos.errLine) ? pos.errLine as number : -1
  const errCol = Number.isFinite(pos.errCol) ? pos.errCol as number : 0
  const errFile = typeof pos.errFile === 'string' && pos.errFile !== formatted ? pos.errFile.trim() : ''
  const hasFile = errLine >= 0 || /\.(sol|yul)$/.test(errFile)
  const location = !hasFile ? '' : errLine >= 0 ? `${baseName(errFile)}:${errLine + 1}` : baseName(errFile)
  return { severity, title: title || formatted, formatted, errFile: hasFile ? errFile : '', errLine, errCol, location }
}

const CompileIssue = ({ api, issue }: { api: any, issue: CompileIssueData }) => {
  const intl = useIntl()
  const { trackMatomoEvent } = useContext(TrackingContext)
  const err = issue.severity === 'error'
  const canGo = issue.errFile && issue.errLine >= 0
  const goTo = canGo ? intl.formatMessage({ id: 'solidity.goToLine' }, { line: issue.errLine + 1 }) + '\n\n' : ''
  const fixLabel = intl.formatMessage({ id: 'solidity.fixWithRemixAI' })

  const fix = () => fixWithRemixAI(
    api,
    issue.errFile,
    issue.formatted,
    (content, filePath) => intl.formatMessage({ id: 'solidity.openaigptMessage' }, { content, messageText: issue.formatted, filePath }),
    trackMatomoEvent
  )

  return (
    <div className={`sc-issue ${issue.severity}`} data-id={`compileIssue-${issue.severity}`}>
      {/* data-id: the file the issue points to, as the previous renderer had it */}
      <button className="sc-issue-row" data-id={issue.errFile || undefined} title={goTo + issue.formatted} onClick={() => canGo && gotoError(api, issue.errFile, issue.errLine, issue.errCol)}>
        <i className={`fas ${err ? 'fa-circle-xmark sc-err' : 'fa-triangle-exclamation sc-warn'} sc-issue-icon`} aria-hidden="true"></i>
        <span className="sc-issue-main">
          <span className="sc-issue-title">{issue.title}</span>
          {issue.location && <span className="sc-issue-loc">{issue.location}</span>}
        </span>
      </button>
      <span className="sc-issue-tools">
        <CopyToClipboard tip={intl.formatMessage({ id: 'solidity.copyMessage' })} content={issue.formatted} direction="top">
          <button className="sc-icon-btn sc-copy-hover" aria-label={intl.formatMessage({ id: 'solidity.copyMessage' })}><i className="far fa-copy"></i></button>
        </CopyToClipboard>
        <CustomTooltip placement="top" tooltipId="overlay-tooltip-fix-with-ai" tooltipText={fixLabel}>
          <button className="sc-icon-btn" data-id="ask-remix-ai-button" aria-label={fixLabel} onClick={fix}>
            <AiIcon size={12} />
          </button>
        </CustomTooltip>
      </span>
    </div>
  )
}

interface CompileResultsProps {
  api: any
  result: CompileErrors | Record<string, any> | undefined
  compiling: boolean
  fileName: string
  version: string // the loaded compiler, e.g. soljson-v0.8.30+commit.73712a01.js; marks the finished compilation for e2e
  solcVersion: string // e.g. 0.8.30
  via?: string // framework name when it compiled the file
  hideWarnings: boolean
  onHideWarningsChange: (value: boolean) => void
  footer?: React.ReactNode // RemixAI row once the card is dismissed
}

// status line + flat issue list (errors first), right under the Compile button
export const CompileResults = (props: CompileResultsProps) => {
  const { result, compiling, hideWarnings } = props
  const intl = useIntl()
  if (!result && !compiling) return null

  const issues: CompileIssueData[] = []
  if (result?.error) issues.push(toIssue(result.error))
  if (result?.errors?.length) result.errors.forEach((e) => issues.push(toIssue(e)))
  const errors = issues.filter((i) => i.severity === 'error')
  const warnings = issues.filter((i) => i.severity === 'warning')
  const shown = [...errors, ...(hideWarnings ? [] : warnings)]
  const hasResult = !!result && Object.keys(result).length > 0
  const done = !compiling && hasResult

  let status = null
  if (compiling) {
    status = <><i className="fas fa-spinner fa-spin sc-muted"></i><span><FormattedMessage id="solidity.compilingFile" values={{ file: props.fileName }} /></span></>
  } else if (done && errors.length) {
    const counts = [intl.formatMessage({ id: 'solidity.errorsCount' }, { count: errors.length })]
    if (warnings.length) counts.push(intl.formatMessage({ id: 'solidity.warningsCount' }, { count: warnings.length }))
    status = <><i className="fas fa-circle-xmark sc-err"></i><span><b><FormattedMessage id="solidity.failed" /></b><span className="sc-muted"> · {counts.join(', ')}</span></span></>
  } else if (done) {
    const detail = warnings.length
      ? intl.formatMessage({ id: 'solidity.warningsCount' }, { count: warnings.length })
      : props.via
        ? intl.formatMessage({ id: 'solidity.withFramework' }, { framework: props.via })
        : intl.formatMessage({ id: 'solidity.solcVersion' }, { version: props.solcVersion })
    status = <><i className="fas fa-circle-check sc-ok"></i><span><b><FormattedMessage id="solidity.compiled" /></b><span className="sc-muted"> · {detail}</span></span></>
  }

  return (
    <div className="sc-results" data-id="compiledErrors">
      <span data-id={`compilationFinishedWith_${props.version}`}></span>
      {status && (
        <div className="sc-status" data-id="compileStatus">
          <span className="sc-status-text">{status}</span>
          {warnings.length > 0 && (
            <span className="sc-inline-switch">
              <label htmlFor="hideWarnings"><FormattedMessage id="solidity.hideWarnings" /></label>
              <ToggleSwitch id="hideWarnings" size="sm" isOn={hideWarnings} onClick={() => props.onHideWarningsChange(!hideWarnings)} />
            </span>
          )}
        </div>
      )}
      {/* the previous issues stay while recompiling, so auto compile doesn't make the list flicker */}
      {shown.length > 0 && (
        <div className="sc-card sc-issues">
          {shown.map((issue, i) => <CompileIssue key={i} api={props.api} issue={issue} />)}
        </div>
      )}
      {hasResult && props.footer}
    </div>
  )
}
