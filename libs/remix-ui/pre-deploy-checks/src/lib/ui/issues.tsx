import React, { useEffect, useRef, useState } from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import { SOURCE_LABELS } from '../report'
import { SEVERITIES } from '../severity'
import { Finding, FindingSource, IgnoreReason, Severity } from '../types'
import { ToolLine } from '../verdict'
import { activeFilters, FileFilter, filterOptions, FilterOptions, IssueFilter, isFiltering, matchesFilter, NO_FILTER } from './filter'
import { splitPath, toolList } from './format'
import { PreDeployChecksActions } from './types'

const SEVERITY_ICON: Record<Severity, string> = {
  high: 'fas fa-exclamation-circle',
  medium: 'fas fa-exclamation-triangle',
  low: 'fas fa-info-circle',
  info: 'fas fa-info-circle'
}

const REASONS: IgnoreReason[] = ['false-positive', 'accepted-risk', 'test-code']

const REASON_ICON: Record<IgnoreReason, string> = {
  'false-positive': 'far fa-times-circle',
  'accepted-risk': 'fas fa-shield-alt',
  'test-code': 'fas fa-flask'
}

/** how long an issue just ignored keeps its place with an Undo */
const UNDO_MS = 5000

const findingKey = (finding: Finding) => `${finding.id}-${finding.keys[0]}`

const LINE_ICON: Record<ToolLine['kind'], string> = {
  running: 'fas fa-circle-notch fa-spin',
  waiting: 'far fa-circle',
  stale: 'fas fa-history',
  failed: 'fas fa-times-circle pdc-sev-high',
  skipped: 'fas fa-minus-circle',
  clear: 'fas fa-check-circle pdc-ok'
}

interface IssueProps {
  finding: Finding
  index: number
  /** the checked file: issues in other files (local imports) show their file name */
  file: string
  /** compile errors can't be ignored */
  ignorable: boolean
  onIgnore: (finding: Finding, reason: IgnoreReason) => void
  plugin: PreDeployChecksActions
}

/** Closes a menu on a click outside the element the returned ref is put on. */
function useCloseOutside (open: boolean, setOpen: (open: boolean) => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  return ref
}

/** "Ignore ▾": a small menu of reasons under a heading. */
function IgnoreMenu ({ dataId, onIgnore }: { dataId: string, onIgnore: (reason: IgnoreReason) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useCloseOutside(open, setOpen)
  return (
    <div className="pdc-issue-actions justify-content-end">
      <div className="pdc-ignore" ref={ref}>
        <button className={`pdc-ignore-btn ${open ? 'active' : ''}`} data-id={`${dataId}-ignore`} onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu">
          <i className="far fa-eye-slash" aria-hidden="true"></i>
          <FormattedMessage id="preDeployChecks.issue.ignore" />
          <i className={`fas fa-chevron-${open ? 'up' : 'down'} pdc-ignore-caret`} aria-hidden="true"></i>
        </button>
        {open && (
          <div className="pdc-ignore-menu" role="menu">
            <div className="pdc-ignore-menu-head"><FormattedMessage id="preDeployChecks.issue.ignoreBecause" /></div>
            {REASONS.map((reason) => (
              <button key={reason} className="pdc-ignore-menu-item" role="menuitem" data-id={`${dataId}-reason-${reason}`} onClick={() => { setOpen(false); onIgnore(reason) }}>
                <i className={REASON_ICON[reason]} aria-hidden="true"></i>
                <FormattedMessage id={`preDeployChecks.reason.${reason}`} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Issue ({ finding, index, file, ignorable, onIgnore, plugin }: IssueProps) {
  const intl = useIntl()
  const [open, setOpen] = useState(false)
  const line = finding.range ? finding.range.start.line + 1 : null
  const otherFile = finding.file && finding.file !== file ? splitPath(finding.file).name : null
  const dataId = `preDeployChecks-issue-${index}`

  const toggle = () => {
    if (!open) plugin.openFinding(finding)
    setOpen(!open)
  }

  return (
    <li className={`pdc-issue ${finding.stale ? 'pdc-dim' : ''} ${open ? 'open' : ''}`} data-id={dataId} data-severity={finding.severity}>
      <button className="pdc-issue-row" onClick={toggle} aria-expanded={open} title={intl.formatMessage({ id: 'preDeployChecks.issue.open' })} data-id={`${dataId}-row`}>
        <i className={`${SEVERITY_ICON[finding.severity]} pdc-sev-${finding.severity} pdc-issue-icon`} aria-label={intl.formatMessage({ id: `preDeployChecks.severity.${finding.severity}` })} role="img"></i>
        <span className="pdc-issue-text">
          <span className="pdc-issue-title">{finding.title}</span>
          {!open && finding.message && <span className="pdc-issue-preview">{finding.message}</span>}
        </span>
        {(line || otherFile) && <span className="pdc-issue-line" title={otherFile ? finding.file : undefined}>{otherFile}{otherFile && line ? ':' : ''}{line && `L${line}`}</span>}
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
          {finding.items.some((item) => item.source === 'ai') && (
            <button className="btn pdc-btn pdc-btn-quiet w-100 mt-2" data-id={`${dataId}-securityAudit`} onClick={() => plugin.securityAudit()}>
              <FormattedMessage id="preDeployChecks.action.runSecurityAudit" />
            </button>
          )}
          {ignorable && !finding.stale && <IgnoreMenu dataId={dataId} onIgnore={(reason) => onIgnore(finding, reason)} />}
        </div>
      )}
    </li>
  )
}

/** Takes the place of an issue for a few seconds after it is ignored. */
function JustIgnored ({ finding, index, onUndo }: { finding: Finding, index: number, onUndo: () => void }) {
  return (
    <li className="pdc-issue pdc-just-ignored" data-id={`preDeployChecks-issue-${index}-justIgnored`}>
      <i className="fas fa-eye-slash" aria-hidden="true"></i>
      <span className="text-truncate flex-grow-1"><FormattedMessage id="preDeployChecks.issue.justIgnored" values={{ title: finding.title, b: (chunks) => <b>{chunks}</b> }} /></span>
      <button className="pdc-link-btn" data-id={`preDeployChecks-issue-${index}-undo`} onClick={onUndo}><FormattedMessage id="preDeployChecks.issue.undo" /></button>
    </li>
  )
}

/** An ignored issue: its reason on the row, Restore one click away. */
function IgnoredIssue ({ finding, index, plugin }: { finding: Finding, index: number, plugin: PreDeployChecksActions }) {
  const intl = useIntl()
  const line = finding.range ? finding.range.start.line + 1 : null
  const dataId = `preDeployChecks-issue-${index}`
  return (
    <li className="pdc-issue pdc-ignored-row" data-id={dataId} data-severity={finding.severity}>
      <i className={`${SEVERITY_ICON[finding.severity]} pdc-sev-${finding.severity} pdc-issue-icon`} aria-label={intl.formatMessage({ id: `preDeployChecks.severity.${finding.severity}` })} role="img"></i>
      <span className="pdc-issue-text">
        <span className="pdc-issue-title">{finding.title}</span>
        <span className="pdc-issue-preview">{finding.ignored && <FormattedMessage id={`preDeployChecks.reason.${finding.ignored.reason}`} />}</span>
      </span>
      {line && <span className="pdc-issue-line">L{line}</span>}
      <button className="pdc-link-btn" data-id={`${dataId}-restore`} onClick={() => plugin.restoreFinding(finding)}><FormattedMessage id="preDeployChecks.issue.restore" /></button>
    </li>
  )
}

function ToolLineRow ({ line, plugin }: { line: ToolLine, plugin: PreDeployChecksActions }) {
  const intl = useIntl()
  const tools = toolList(intl, line.tools)
  const action = line.reason === 'sign-in'
    ? { id: 'preDeployChecks.action.openRemixAI', run: () => plugin.openPlugin('remixaiassistant') }
    : line.kind === 'clear' ? { id: 'preDeployChecks.action.fullSecurityAudit', run: () => plugin.securityAudit() } : null
  return (
    <div className="pdc-note" data-id={`preDeployChecks-toolLine-${line.tools.join('-')}`} data-kind={line.kind}>
      <i className={LINE_ICON[line.kind]} aria-hidden="true"></i>
      <span>
        <FormattedMessage id={`preDeployChecks.toolLine.${line.kind}${line.kind === 'skipped' && line.reason ? `.${line.reason}` : ''}`} values={{ tools, note: line.note || '' }} />
        {action && <> · <button className="pdc-link-btn" data-id="preDeployChecks-toolAction" onClick={action.run}><FormattedMessage id={action.id} /></button></>}
      </span>
    </div>
  )
}

const toggled = <T, >(list: T[], value: T): T[] => list.includes(value) ? list.filter((v) => v !== value) : [...list, value]

/** Checkboxes for severity and tool, a choice of files; each group only when it offers a choice. */
function FilterMenu ({ options, filter, setFilter, file }: { options: FilterOptions, filter: IssueFilter, setFilter: (filter: IssueFilter) => void, file: string }) {
  const intl = useIntl()
  const files: { value: FileFilter, label: string }[] = [
    { value: 'all', label: intl.formatMessage({ id: 'preDeployChecks.filter.allFiles' }) },
    { value: 'this', label: splitPath(file).name },
    { value: 'imports', label: intl.formatMessage({ id: 'preDeployChecks.filter.imports' }) }
  ]
  return (
    <div className="pdc-ignore-menu pdc-filter-menu" data-id="preDeployChecks-filterMenu">
      {options.severities.length > 1 && <>
        <div className="pdc-ignore-menu-head"><FormattedMessage id="preDeployChecks.filter.severity" /></div>
        {options.severities.map(({ value, count }) => (
          <label key={value} className="pdc-filter-item" data-id={`preDeployChecks-filter-severity-${value}`}>
            <input type="checkbox" className="form-check-input" checked={filter.severities.includes(value)} onChange={() => setFilter({ ...filter, severities: toggled(filter.severities, value) })} />
            <i className={`${SEVERITY_ICON[value]} pdc-sev-${value}`} aria-hidden="true"></i>
            <span className="text-truncate"><FormattedMessage id={`preDeployChecks.severity.${value}`} /></span>
            <span className="pdc-filter-count">{count}</span>
          </label>
        ))}
      </>}
      {options.sources.length > 1 && <>
        <div className="pdc-ignore-menu-head"><FormattedMessage id="preDeployChecks.filter.tool" /></div>
        {options.sources.map(({ value, count }) => (
          <label key={value} className="pdc-filter-item" data-id={`preDeployChecks-filter-tool-${value}`}>
            <input type="checkbox" className="form-check-input" checked={filter.sources.includes(value)} onChange={() => setFilter({ ...filter, sources: toggled<FindingSource>(filter.sources, value) })} />
            <span className="text-truncate">{SOURCE_LABELS[value]}</span>
            <span className="pdc-filter-count">{count}</span>
          </label>
        ))}
      </>}
      {options.files && <>
        <div className="pdc-ignore-menu-head"><FormattedMessage id="preDeployChecks.filter.file" /></div>
        {files.map(({ value, label }) => (
          <label key={value} className="pdc-filter-item" data-id={`preDeployChecks-filter-file-${value}`}>
            <input type="radio" className="form-check-input" name="pdc-filter-file" checked={filter.file === value} onChange={() => setFilter({ ...filter, file: value })} />
            <span className="text-truncate">{label}</span>
          </label>
        ))}
      </>}
    </div>
  )
}

/** Search over title, message and file, with the filters behind the button at its end. */
function IssueSearch ({ options, filter, setFilter, file }: { options: FilterOptions, filter: IssueFilter, setFilter: (filter: IssueFilter) => void, file: string }) {
  const intl = useIntl()
  const [open, setOpen] = useState(false)
  const ref = useCloseOutside(open, setOpen)
  const active = activeFilters(filter)
  const hasMenu = options.severities.length > 1 || options.sources.length > 1 || options.files
  return (
    <div className="pdc-search" ref={ref}>
      <i className="fas fa-search pdc-search-icon" aria-hidden="true"></i>
      <input
        className="form-control form-control-sm"
        data-id="preDeployChecks-search"
        placeholder={intl.formatMessage({ id: 'preDeployChecks.filter.search' })}
        aria-label={intl.formatMessage({ id: 'preDeployChecks.filter.search' })}
        value={filter.query}
        onChange={(e) => setFilter({ ...filter, query: e.target.value })}
      />
      {hasMenu && (
        <button
          className={`pdc-filter-btn ${open ? 'open' : ''} ${active ? 'on' : ''}`}
          data-id="preDeployChecks-filterBtn"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-haspopup="menu"
          title={intl.formatMessage({ id: 'preDeployChecks.filter.button' })}
        >
          <i className="fas fa-sliders-h" aria-hidden="true"></i>
          {active > 0 && <span className="pdc-filter-badge">{active}</span>}
        </button>
      )}
      {open && <FilterMenu options={options} filter={filter} setFilter={setFilter} file={file} />}
    </div>
  )
}

interface IssuesProps {
  file: string
  findings: Finding[]
  compileErrors: Finding[]
  lines: ToolLine[]
  running: boolean
  plugin: PreDeployChecksActions
}

/** One flat list sorted by severity then line; compile errors first; ignored issues behind a toggle (design §4). */
export function Issues ({ file, findings, compileErrors, lines, running, plugin }: IssuesProps) {
  const [showIgnored, setShowIgnored] = useState(false)
  const [filter, setFilterState] = useState<IssueFilter>(NO_FILTER)
  // while filtering, the section keeps the height it had before, so a shorter list doesn't stop the panel
  // scrolling and change its width when the scrollbar goes away
  const sectionRef = useRef<HTMLElement>(null)
  const [heldHeight, setHeldHeight] = useState<number | null>(null)
  const setFilter = (next: IssueFilter) => {
    if (!isFiltering(next)) setHeldHeight(null)
    else if (!isFiltering(filter) && sectionRef.current) setHeldHeight(sectionRef.current.offsetHeight)
    setFilterState(next)
  }
  // the issue just ignored keeps its place for a few seconds with an Undo
  const [justIgnored, setJustIgnored] = useState<string | null>(null)
  useEffect(() => {
    if (!justIgnored) return
    const timer = setTimeout(() => setJustIgnored(null), UNDO_MS)
    return () => clearTimeout(timer)
  }, [justIgnored])
  const ignore = (finding: Finding, reason: IgnoreReason) => {
    plugin.ignoreFinding(finding, reason)
    setJustIgnored(findingKey(finding))
  }
  const isJust = (f: Finding) => f.ignored && findingKey(f) === justIgnored
  const open = [...compileErrors, ...findings.filter((f) => !f.ignored)]
  const rows = [...compileErrors, ...findings.filter((f) => !f.ignored || isJust(f))]
  const ignored = findings.filter((f) => f.ignored && !isJust(f))
  // compile errors always show: nothing else matters until the file compiles
  const filterable = findings.filter((f) => !f.ignored)
  const filtering = isFiltering(filter)
  const showSearch = filterable.length > 1 || filtering
  const shown = filtering ? rows.filter((f, i) => i < compileErrors.length || isJust(f) || matchesFilter(f, filter, file)) : rows
  const shownOpen = shown.filter((f) => !f.ignored).length
  const counts = SEVERITIES.map((severity) => ({ severity, count: open.filter((f) => f.severity === severity && !f.stale).length })).filter((c) => c.count)

  return (
    <section data-id="preDeployChecks-issues" ref={sectionRef} style={heldHeight ? { minHeight: heldHeight } : undefined}>
      <div className="pdc-section-head">
        <span className="pdc-section-title"><FormattedMessage id="preDeployChecks.issues" /></span>
        <span className="pdc-section-meta" data-id="preDeployChecks-counts">
          {counts.map(({ severity, count }) => (
            <span key={severity}><b className={`pdc-sev-${severity}`}>{count}</b> <FormattedMessage id={`preDeployChecks.count.${severity}`} /></span>
          ))}
        </span>
      </div>
      {showSearch && <IssueSearch options={filterOptions(filterable, file)} filter={filter} setFilter={setFilter} file={file} />}
      {filtering && shown.length > 0 && shownOpen < open.length && (
        <div className="pdc-hint pdc-filter-summary" data-id="preDeployChecks-filterSummary">
          <span className="text-truncate"><FormattedMessage id="preDeployChecks.filter.showing" values={{ shown: shownOpen, total: open.length }} /></span>
          <span>·</span>
          <button className="pdc-link-btn" data-id="preDeployChecks-clearFilters" onClick={() => setFilter(NO_FILTER)}><FormattedMessage id="preDeployChecks.filter.clear" /></button>
        </div>
      )}
      {lines.length > 0 && <div className="pdc-notes">{lines.map((line, i) => <ToolLineRow key={i} line={line} plugin={plugin} />)}</div>}
      {open.some((f) => f.stale) && <div className="pdc-hint"><FormattedMessage id="preDeployChecks.staleHint" /></div>}
      <div className="pdc-card pdc-list-card">
        {shown.length > 0 ? (
          <ul className="pdc-issues">
            {shown.map((finding, i) => isJust(finding)
              ? <JustIgnored key={findingKey(finding)} finding={finding} index={i} onUndo={() => { plugin.restoreFinding(finding); setJustIgnored(null) }} />
              : <Issue key={findingKey(finding)} finding={finding} index={i} file={file} ignorable={!compileErrors.includes(finding)} onIgnore={ignore} plugin={plugin} />)}
          </ul>
        ) : filtering && rows.length > 0 ? (
          <div className="pdc-empty-list" data-id="preDeployChecks-noMatch">
            <i className="fas fa-search" aria-hidden="true"></i>
            <span><FormattedMessage id="preDeployChecks.filter.noMatch" /> <button className="pdc-link-btn" onClick={() => setFilter(NO_FILTER)}><FormattedMessage id="preDeployChecks.filter.clear" /></button></span>
          </div>
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
                {ignored.map((finding, i) => <IgnoredIssue key={findingKey(finding)} finding={finding} index={shown.length + i} plugin={plugin} />)}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
  )
}
