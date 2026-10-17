import React, { useState } from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import { SOURCE_LABELS } from '../report'
import { SEVERITIES } from '../severity'
import { Finding, IgnoreReason, Severity } from '../types'
import { ToolLine } from '../verdict'
import { toolList } from './format'
import { PreDeployChecksActions } from './types'

const SEVERITY_ICON: Record<Severity, string> = {
  high: 'fas fa-exclamation-circle',
  medium: 'fas fa-exclamation-triangle',
  low: 'fas fa-info-circle',
  info: 'fas fa-info-circle'
}

const REASONS: IgnoreReason[] = ['false-positive', 'accepted-risk', 'test-code']

const LINE_ICON: Record<ToolLine['kind'], string> = {
  running: 'fas fa-circle-notch fa-spin',
  waiting: 'far fa-circle',
  stale: 'fas fa-history',
  failed: 'fas fa-times-circle pdc-sev-high',
  skipped: 'fas fa-minus-circle'
}

interface IssueProps {
  finding: Finding
  index: number
  /** compile errors can't be ignored */
  ignorable: boolean
  plugin: PreDeployChecksActions
}

function Issue ({ finding, index, ignorable, plugin }: IssueProps) {
  const intl = useIntl()
  const [open, setOpen] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const line = finding.range ? finding.range.start.line + 1 : null
  const dataId = `preDeployChecks-issue-${index}`

  const toggle = () => {
    if (!open) plugin.openFinding(finding)
    setOpen(!open)
    setChoosing(false)
  }

  return (
    <li className={`pdc-issue ${finding.stale || finding.ignored ? 'pdc-dim' : ''} ${open ? 'open' : ''}`} data-id={dataId} data-severity={finding.severity}>
      <button className="pdc-issue-row" onClick={toggle} aria-expanded={open} title={intl.formatMessage({ id: 'preDeployChecks.issue.open' })} data-id={`${dataId}-row`}>
        <i className={`${SEVERITY_ICON[finding.severity]} pdc-sev-${finding.severity} pdc-issue-icon`} aria-label={intl.formatMessage({ id: `preDeployChecks.severity.${finding.severity}` })} role="img"></i>
        <span className="pdc-issue-text">
          <span className="pdc-issue-title">{finding.title}</span>
          {!open && finding.message && <span className="pdc-issue-preview">{finding.message}</span>}
        </span>
        {line && <span className="pdc-issue-line">L{line}</span>}
        <i className={`fas fa-chevron-${open ? 'down' : 'right'} pdc-issue-chevron`} aria-hidden="true"></i>
      </button>
      {open && (
        <div className="pdc-issue-body">
          {finding.message && <p>{finding.message}</p>}
          <div className="pdc-tags">
            {finding.items.map((item, i) => (
              <span key={i} className="pdc-tag">{SOURCE_LABELS[item.source]}{item.nativeSeverity ? ` · ${item.nativeSeverity}` : ''}</span>
            ))}
          </div>
          {finding.ignored ? (
            <div className="pdc-issue-actions">
              <span><FormattedMessage id="preDeployChecks.issue.ignoredBecause" values={{ reason: intl.formatMessage({ id: `preDeployChecks.reason.${finding.ignored.reason}` }) }} /></span>
              <button className="pdc-link-btn" data-id={`${dataId}-restore`} onClick={() => plugin.restoreFinding(finding)}><FormattedMessage id="preDeployChecks.issue.restore" /></button>
            </div>
          ) : ignorable && !finding.stale && (choosing ? (
            <div className="pdc-issue-actions flex-wrap">
              <span><FormattedMessage id="preDeployChecks.issue.ignoreBecause" /></span>
              {REASONS.map((reason) => (
                <button key={reason} className="pdc-reason" data-id={`${dataId}-reason-${reason}`} onClick={() => plugin.ignoreFinding(finding, reason)}>
                  <FormattedMessage id={`preDeployChecks.reason.${reason}`} />
                </button>
              ))}
              <button className="pdc-link-btn pdc-muted" onClick={() => setChoosing(false)}><FormattedMessage id="preDeployChecks.cancel" /></button>
            </div>
          ) : (
            <div className="pdc-issue-actions">
              <button className="pdc-link-btn" data-id={`${dataId}-ignore`} onClick={() => setChoosing(true)}>
                <i className="far fa-eye-slash me-1" aria-hidden="true"></i><FormattedMessage id="preDeployChecks.issue.ignore" />
              </button>
            </div>
          ))}
        </div>
      )}
    </li>
  )
}

function ToolLineRow ({ line, plugin }: { line: ToolLine, plugin: PreDeployChecksActions }) {
  const intl = useIntl()
  const tools = toolList(intl, line.tools)
  const action = line.reason === 'unavailable'
    ? { id: 'preDeployChecks.action.connectRemixd', plugin: 'filePanel' }
    : line.reason === 'sign-in' ? { id: 'preDeployChecks.action.openRemixAI', plugin: 'remixaiassistant' } : null
  return (
    <div className="pdc-note" data-id={`preDeployChecks-toolLine-${line.tools.join('-')}`} data-kind={line.kind}>
      <i className={LINE_ICON[line.kind]} aria-hidden="true"></i>
      <span>
        <FormattedMessage id={`preDeployChecks.toolLine.${line.kind}${line.kind === 'skipped' && line.reason ? `.${line.reason}` : ''}`} values={{ tools, note: line.note || '' }} />
        {action && <> · <button className="pdc-link-btn" data-id="preDeployChecks-toolAction" onClick={() => plugin.openPlugin(action.plugin)}><FormattedMessage id={action.id} /></button></>}
      </span>
    </div>
  )
}

interface IssuesProps {
  findings: Finding[]
  compileErrors: Finding[]
  lines: ToolLine[]
  running: boolean
  plugin: PreDeployChecksActions
}

/** One flat list sorted by severity then line; compile errors first; ignored issues behind a toggle (design §4). */
export function Issues ({ findings, compileErrors, lines, running, plugin }: IssuesProps) {
  const [showIgnored, setShowIgnored] = useState(false)
  const open = [...compileErrors, ...findings.filter((f) => !f.ignored)]
  const ignored = findings.filter((f) => f.ignored)
  const counts = SEVERITIES.map((severity) => ({ severity, count: open.filter((f) => f.severity === severity && !f.stale).length })).filter((c) => c.count)

  return (
    <section data-id="preDeployChecks-issues">
      <div className="pdc-section-head">
        <span className="pdc-section-title"><FormattedMessage id="preDeployChecks.issues" /></span>
        <span className="pdc-section-meta" data-id="preDeployChecks-counts">
          {counts.map(({ severity, count }) => (
            <span key={severity}><b className={`pdc-sev-${severity}`}>{count}</b> <FormattedMessage id={`preDeployChecks.count.${severity}`} /></span>
          ))}
        </span>
      </div>
      {lines.length > 0 && <div className="pdc-notes">{lines.map((line, i) => <ToolLineRow key={i} line={line} plugin={plugin} />)}</div>}
      {open.some((f) => f.stale) && <div className="pdc-hint"><FormattedMessage id="preDeployChecks.staleHint" /></div>}
      <div className="pdc-card pdc-list-card">
        {open.length > 0 ? (
          <ul className="pdc-issues">
            {open.map((finding, i) => <Issue key={`${finding.id}-${finding.keys[0]}`} finding={finding} index={i} ignorable={i >= compileErrors.length} plugin={plugin} />)}
          </ul>
        ) : (
          <div className="pdc-empty-list" data-id="preDeployChecks-noIssues">
            <i className={running ? 'fas fa-circle-notch fa-spin' : 'fas fa-check-circle pdc-ok'} aria-hidden="true"></i>
            <FormattedMessage id={running ? 'preDeployChecks.issuesAppear' : 'preDeployChecks.noIssues'} />
          </div>
        )}
        {ignored.length > 0 && (
          <>
            <button className="pdc-ignored-toggle" data-id="preDeployChecks-ignoredToggle" onClick={() => setShowIgnored(!showIgnored)} aria-expanded={showIgnored}>
              <i className={`fas fa-chevron-${showIgnored ? 'up' : 'down'}`} aria-hidden="true"></i>
              <FormattedMessage id="preDeployChecks.ignoredCount" values={{ count: ignored.length }} />
            </button>
            {showIgnored && (
              <ul className="pdc-issues" data-id="preDeployChecks-ignored">
                {ignored.map((finding, i) => <Issue key={`${finding.id}-${finding.keys[0]}`} finding={finding} index={open.length + i} ignorable plugin={plugin} />)}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
  )
}
