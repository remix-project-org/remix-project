import { canonicalRule, maxSeverity, SEVERITY_RANK } from './severity'
import { FileCheckState, Finding, FindingSource, Range, RawFinding, Severity, StepId } from './types'
import { contentHash, isStale } from './store'

const FINDING_STEPS: StepId[] = ['compile', 'analysis', 'slither', 'ai']

/** The code a range covers, whitespace collapsed, so moving or re-indenting the lines keeps the same text. */
function codeAt (content: string, range: Range): string {
  return content.split('\n').slice(range.start.line, range.end.line + 1).join(' ').replace(/\s+/g, ' ').trim()
}

/**
 * Key that identifies a finding across runs: the tool's rule plus the code it points at. It survives
 * edits elsewhere in the file and changes when the flagged lines change. Without a location the
 * message stands in for the code.
 */
export function issueKey (finding: RawFinding, content?: string): string {
  const rule = canonicalRule(finding.source, finding.rule) || `${finding.source}:${finding.rule || finding.title}`
  const code = finding.range && typeof content === 'string' ? codeAt(content, finding.range) : ''
  return `${rule}|${finding.file || ''}|${contentHash(code || finding.message).substring(2, 18)}`
}

/** Adds keys from the sources the tool ran on (file path → content). */
export function withIssueKeys (findings: RawFinding[], sources: Record<string, { content: string }> = {}): RawFinding[] {
  return findings.map((finding) => ({ ...finding, key: issueKey(finding, sources[finding.file]?.content) }))
}

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
        stale,
        keys: []
      })
    }
  }

  return merged
    .map(({ rule, ...finding }) => ({ ...finding, keys: finding.items.map((item) => item.key || issueKey(item)) }))
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
  const ignored = state.ignored || {}
  return aggregateFindings(raw).map((finding) => {
    const match = finding.keys.find((key) => ignored[key])
    return match ? { ...finding, ignored: ignored[match] } : finding
  })
}

/** Up-to-date, not ignored high-severity findings: while any is open, the panel asks before going to Deploy & Run. */
export function blockingFindings (findings: Finding[]): Finding[] {
  return findings.filter((f) => !f.stale && !f.ignored && f.severity === 'high')
}

/** Counts of up-to-date, not ignored findings. */
export function countBySeverity (findings: Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { high: 0, medium: 0, low: 0, info: 0 }
  for (const f of findings) if (!f.stale && !f.ignored) counts[f.severity]++
  return counts
}

export function filterFindings (findings: Finding[], severities: Severity[], sources: FindingSource[]): Finding[] {
  return findings.filter((f) => severities.includes(f.severity) && f.sources.some((s) => sources.includes(s)))
}
