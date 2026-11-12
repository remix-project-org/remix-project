import { SEVERITIES } from '../severity'
import { Finding, FindingSource, Severity } from '../types'

export type FileFilter = 'all' | 'this' | 'imports'

/** The issue list's search text and filters; an empty list means no filter on that dimension. */
export interface IssueFilter {
  query: string
  severities: Severity[]
  sources: FindingSource[]
  file: FileFilter
}

export const NO_FILTER: IssueFilter = { query: '', severities: [], sources: [], file: 'all' }

export interface FilterOptions {
  severities: { value: Severity, count: number }[]
  sources: { value: FindingSource, count: number }[]
  /** only when some issues are in imported files */
  files: boolean
}

const isImported = (finding: Finding, file: string) => !!finding.file && finding.file !== file

/** What the list can be filtered on: only the values present, with how many issues each has. */
export function filterOptions (findings: Finding[], file: string): FilterOptions {
  const sources = [...new Set(findings.flatMap((f) => f.sources))]
  return {
    severities: SEVERITIES.map((value) => ({ value, count: findings.filter((f) => f.severity === value).length })).filter((o) => o.count),
    sources: sources.map((value) => ({ value, count: findings.filter((f) => f.sources.includes(value)).length })),
    files: findings.some((f) => isImported(f, file))
  }
}

/** Filters set apart from the search text: the count on the filter button. */
export function activeFilters (filter: IssueFilter): number {
  return (filter.severities.length ? 1 : 0) + (filter.sources.length ? 1 : 0) + (filter.file !== 'all' ? 1 : 0)
}

export function isFiltering (filter: IssueFilter): boolean {
  return !!filter.query.trim() || activeFilters(filter) > 0
}

export function matchesFilter (finding: Finding, filter: IssueFilter, file: string): boolean {
  if (filter.severities.length && !filter.severities.includes(finding.severity)) return false
  if (filter.sources.length && !finding.sources.some((s) => filter.sources.includes(s))) return false
  if (filter.file === 'this' && isImported(finding, file)) return false
  if (filter.file === 'imports' && !isImported(finding, file)) return false
  const query = filter.query.trim().toLowerCase()
  if (query && !`${finding.title}\n${finding.message}\n${finding.file || ''}`.toLowerCase().includes(query)) return false
  return true
}
