import { canonicalRule, maxSeverity, SEVERITY_RANK } from './severity'
import { FileCheckState, Finding, FindingSource, Range, RawFinding, Severity, StepId } from './types'
import { isStale } from './store'

const FINDING_STEPS: StepId[] = ['compile', 'analysis', 'slither', 'ai']

function rangesOverlap (a?: Range, b?: Range): boolean {
  if (!a || !b) return false
  return a.start.line <= b.end.line && b.start.line <= a.end.line
}

function compareFindings (a: Finding, b: Finding): number {
  const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
  if (bySeverity !== 0) return bySeverity
  const byFile = (a.file || '').localeCompare(b.file || '')
  if (byFile !== 0) return byFile
  return (a.range?.start.line ?? Number.MAX_SAFE_INTEGER) - (b.range?.start.line ?? Number.MAX_SAFE_INTEGER)
}

/**
 * Merges raw findings from all tools into one list. Two findings are merged when they come from
 * different tools, are on the same file, their line ranges overlap and their rules are equivalent.
 * The merged finding takes the highest severity.
 */
export function aggregateFindings (raw: { finding: RawFinding, stale: boolean }[]): Finding[] {
  const merged: (Finding & { rule?: string })[] = []

  for (const { finding, stale } of raw) {
    const rule = canonicalRule(finding.source, finding.rule)
    const target = rule && merged.find((m) =>
      m.rule === rule &&
      m.stale === stale &&
      m.file === finding.file &&
      !m.sources.includes(finding.source) &&
      rangesOverlap(m.range, finding.range)
    )
    if (target) {
      if (maxSeverity(target.severity, finding.severity) !== target.severity) {
        target.severity = finding.severity
        target.title = finding.title
        target.message = finding.message
      }
      target.sources.push(finding.source)
      target.items.push(finding)
    } else {
      merged.push({
        id: '',
        rule,
        severity: finding.severity,
        title: finding.title,
        message: finding.message,
        file: finding.file,
        range: finding.range,
        sources: [finding.source],
        items: [finding],
        stale
      })
    }
  }

  return merged
    .map(({ rule, ...finding }) => finding)
    .sort(compareFindings)
    .map((finding, index) => ({ ...finding, id: `${finding.sources.join('+')}-${index}` }))
}

export function collectFindings (state: FileCheckState): Finding[] {
  const raw: { finding: RawFinding, stale: boolean }[] = []
  for (const stepId of FINDING_STEPS) {
    const step = state.steps[stepId]
    if (!step?.findings) continue
    const stale = isStale(state, stepId)
    for (const finding of step.findings) raw.push({ finding, stale })
  }
  return aggregateFindings(raw)
}

/** Up-to-date high-severity findings: while any is open, the panel asks before going to Deploy & Run. */
export function blockingFindings (findings: Finding[]): Finding[] {
  return findings.filter((f) => !f.stale && f.severity === 'high')
}

export function countBySeverity (findings: Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { high: 0, medium: 0, low: 0, info: 0 }
  for (const f of findings) if (!f.stale) counts[f.severity]++
  return counts
}

export function filterFindings (findings: Finding[], severities: Severity[], sources: FindingSource[]): Finding[] {
  return findings.filter((f) => severities.includes(f.severity) && f.sources.some((s) => sources.includes(s)))
}
