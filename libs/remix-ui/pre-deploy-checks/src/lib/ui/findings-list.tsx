import React, { useMemo, useState } from 'react'
import { FormattedMessage } from 'react-intl'
import { countBySeverity, filterFindings } from '../findings'
import { SOURCE_LABELS } from '../report'
import { SEVERITIES } from '../severity'
import { Finding, FindingSource, Severity } from '../types'

const SEVERITY_BADGE: Record<Severity, string> = {
  high: 'bg-danger',
  medium: 'bg-warning text-dark',
  low: 'bg-info text-dark',
  info: 'bg-secondary'
}

const ALL_SOURCES: FindingSource[] = ['compiler', 'remix', 'solhint', 'slither', 'ai']

interface FindingsListProps {
  findings: Finding[]
  onOpen: (finding: Finding) => void
}

export function FindingsList ({ findings, onOpen }: FindingsListProps) {
  const [severities, setSeverities] = useState<Severity[]>(SEVERITIES)
  const [sources, setSources] = useState<FindingSource[]>(ALL_SOURCES)
  const [selected, setSelected] = useState<string | null>(null)
  const counts = useMemo(() => countBySeverity(findings), [findings])
  const presentSources = useMemo(() => ALL_SOURCES.filter((s) => findings.some((f) => f.sources.includes(s))), [findings])
  const visible = useMemo(() => filterFindings(findings, severities, sources), [findings, severities, sources])

  const toggle = <T, >(list: T[], item: T, set: (l: T[]) => void) => set(list.includes(item) ? list.filter((i) => i !== item) : [...list, item])

  if (!findings.length) {
    return <p className="small text-secondary mb-0" data-id="preDeployChecks-noFindings"><FormattedMessage id="preDeployChecks.noFindings" /></p>
  }

  return (
    <div data-id="preDeployChecks-findings">
      <div className="d-flex flex-wrap gap-1 mb-2" role="group" aria-label="Filter by severity">
        {SEVERITIES.map((severity) => (
          <button
            key={severity}
            type="button"
            className={`btn btn-sm py-0 px-2 ${severities.includes(severity) ? 'btn-secondary' : 'btn-outline-secondary'}`}
            aria-pressed={severities.includes(severity)}
            data-id={`preDeployChecks-filter-${severity}`}
            onClick={() => toggle(severities, severity, setSeverities)}
          >
            <FormattedMessage id={`preDeployChecks.severity.${severity}`} /> <span data-id={`preDeployChecks-count-${severity}`}>{counts[severity]}</span>
          </button>
        ))}
      </div>
      {presentSources.length > 1 && (
        <div className="d-flex flex-wrap gap-1 mb-2" role="group" aria-label="Filter by tool">
          {presentSources.map((source) => (
            <button
              key={source}
              type="button"
              className={`btn btn-sm py-0 px-2 ${sources.includes(source) ? 'btn-secondary' : 'btn-outline-secondary'}`}
              aria-pressed={sources.includes(source)}
              data-id={`preDeployChecks-filter-${source}`}
              onClick={() => toggle(sources, source, setSources)}
            >
              {SOURCE_LABELS[source]}
            </button>
          ))}
        </div>
      )}
      <ul className="list-group">
        {visible.map((finding) => (
          <li
            key={finding.id}
            className={`list-group-item list-group-item-action px-2 py-2 ${finding.stale ? 'opacity-50' : ''} ${selected === finding.id ? 'active' : ''}`}
            data-id={`preDeployChecks-finding-${finding.severity}`}
            data-sources={finding.sources.join(',')}
            role="button"
            tabIndex={0}
            onClick={() => { setSelected(finding.id); onOpen(finding) }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(finding.id); onOpen(finding) } }}
          >
            <div className="d-flex align-items-center flex-wrap gap-1 mb-1">
              <span className={`badge ${SEVERITY_BADGE[finding.severity]}`}><FormattedMessage id={`preDeployChecks.severity.${finding.severity}`} /></span>
              {finding.stale && <span className="badge bg-light text-dark border"><FormattedMessage id="preDeployChecks.status.stale" /></span>}
              <span className="fw-semibold small text-break">{finding.title}</span>
            </div>
            <div className="small text-break" style={{ whiteSpace: 'pre-wrap' }}>{finding.message}</div>
            <div className="d-flex flex-wrap align-items-center gap-1 mt-1 small">
              {finding.file && (
                <span className="text-secondary text-break">{finding.file}{finding.range ? `:${finding.range.start.line + 1}` : ''}</span>
              )}
              {finding.items.map((item, index) => (
                <span key={index} className="badge border text-body fw-normal" data-id={`preDeployChecks-finding-source-${item.source}`}>
                  {SOURCE_LABELS[item.source]}{item.nativeSeverity ? ` · ${item.nativeSeverity}` : ''}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
