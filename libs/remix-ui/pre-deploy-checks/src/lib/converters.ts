import { aiIsVulnerable, remixModuleKey, remixSeverity, slitherNativeSeverity, slitherSeverity, solhintSeverity } from './severity'
import { keccak256, toUtf8Bytes } from 'ethers'
import { Position, Range, RawFinding } from './types'

/** Converts a solc byte offset into a 0-based line/column in `content`. */
export function offsetToPosition (content: string, byteOffset: number): Position {
  let line = 0
  let column = 0
  let bytes = 0
  for (const char of content) {
    if (bytes >= byteOffset) break
    const code = char.codePointAt(0)
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4
    if (char === '\n') {
      line++
      column = 0
    } else {
      column++
    }
  }
  return { line, column }
}

export function offsetsToRange (content: string, start: number, length: number): Range | undefined {
  if (content === undefined || isNaN(start) || start < 0) return undefined
  return { start: offsetToPosition(content, start), end: offsetToPosition(content, start + Math.max(length, 0)) }
}

type Sources = Record<string, { content?: string }>
type CompiledSources = Record<string, { id?: number }>

/** Source file name for a solc source index, using the ids in the compilation output. */
export function sourceNameForIndex (index: number, compiledSources: CompiledSources): string | undefined {
  const names = Object.keys(compiledSources || {})
  return names.find((name) => compiledSources[name]?.id === index) ?? names[index]
}

/** Parses a solc "start:length:fileIndex" location. */
export function rangeFromSrc (src: string, sources: Sources, compiledSources: CompiledSources): { file?: string, range?: Range } {
  if (!src) return {}
  const [start, length, index] = src.split(':').map((n) => parseInt(n))
  const file = sourceNameForIndex(index, compiledSources)
  if (!file) return {}
  return { file, range: offsetsToRange(sources?.[file]?.content, start, length) }
}

export interface CompilerError {
  severity: 'error' | 'warning' | 'info'
  type?: string
  message: string
  formattedMessage?: string
  sourceLocation?: { file: string, start: number, end: number }
}

export function compilerMessages (errors: CompilerError[], sources: Sources): { errors: RawFinding[], warnings: RawFinding[] } {
  const result = { errors: [] as RawFinding[], warnings: [] as RawFinding[] }
  for (const error of errors || []) {
    if (error.severity === 'info') continue
    const location = error.sourceLocation
    const finding: RawFinding = {
      source: 'compiler',
      severity: error.severity === 'error' ? 'high' : 'low',
      rule: error.type,
      title: error.type || (error.severity === 'error' ? 'Error' : 'Warning'),
      message: error.message,
      file: location?.file,
      range: location ? offsetsToRange(sources?.[location.file]?.content, location.start, location.end - location.start) : undefined,
      nativeSeverity: error.severity
    }
    if (error.severity === 'error') result.errors.push(finding)
    else result.warnings.push(finding)
  }
  return result
}

export interface RemixAnalysisReport {
  name: string
  report: { warning: string, location?: string, more?: string, error?: string }[]
}

export function remixFindings (reports: RemixAnalysisReport[], sources: Sources, compiledSources: CompiledSources): RawFinding[] {
  const findings: RawFinding[] = []
  for (const result of reports || []) {
    for (const item of result.report || []) {
      if (item.error) continue // internal error in an analyzer module, not a finding
      const { file, range } = rangeFromSrc(item.location, sources, compiledSources)
      findings.push({
        source: 'remix',
        severity: remixSeverity(result.name),
        rule: remixModuleKey(result.name),
        title: result.name.replace(/:\s*$/, ''),
        message: stripHtml(item.warning),
        file,
        range
      })
    }
  }
  return findings
}

export interface SolhintHint {
  type: string
  line: number // 0-based
  column: number // 1-based (solhint)
  message: string
  ruleId: string
}

export function solhintFindings (hints: SolhintHint[], file: string): RawFinding[] {
  return (hints || []).map((hint) => {
    const column = Math.max((hint.column || 1) - 1, 0)
    return {
      source: 'solhint',
      severity: solhintSeverity(hint.type),
      rule: hint.ruleId,
      title: hint.ruleId,
      message: hint.message,
      file,
      range: { start: { line: hint.line, column }, end: { line: hint.line, column } },
      nativeSeverity: hint.type
    }
  })
}

export interface SlitherDetector {
  check: string
  impact: string
  confidence: string
  description: string
  elements?: {
    type?: string
    name?: string
    source_mapping?: { start: number, length: number, filename_relative: string, lines?: number[], starting_column?: number, ending_column?: number }
  }[]
}

/** Slither's own JSON report (`slither --json`), as returned by the hosted Slither service. */
export interface SlitherReport {
  success: boolean
  error?: string | null
  results?: { detectors?: SlitherDetector[] }
}

/** Length of the comment `withSlitherCacheKeys` puts at the start of each file. */
export const SLITHER_KEY_LENGTH = 14

/**
 * The hosted Slither service caches results under the file paths and only the first 12 bytes of each
 * file, which are the same for nearly every file ("// SPDX-Lice"): an edited file gets the results of its
 * earlier content. Starting each file with a hash of its content and the compiler version gives every
 * version its own cache entry. The comment stays on line 1, so line numbers don't move.
 */
export function withSlitherCacheKeys (sources: Record<string, { content: string }>, version: string): Record<string, { content: string }> {
  const keyed: Record<string, { content: string }> = {}
  for (const [path, { content }] of Object.entries(sources)) {
    const hash = keccak256(toUtf8Bytes(`${version}\n${content}`)).slice(2, 12)
    keyed[path] = { content: `/*${hash}*/${content}` }
  }
  return keyed
}

/**
 * Findings of a Slither report. The service compiles the sources under `src/`, so that prefix is
 * removed to get back the workspace path. A clean run has no `detectors`. `firstLineShift` is the
 * length of text added at the start of each file, taken off columns on line 1.
 */
export function slitherFindings (report: SlitherReport, firstLineShift = 0): RawFinding[] {
  const column = (line: number, col: number | undefined) => Math.max((col || 1) - 1 - (line === 0 ? firstLineShift : 0), 0)
  return (report?.results?.detectors || []).map((item) => {
    const mapping = item.elements?.find((e) => e.source_mapping)?.source_mapping
    let range: Range | undefined
    if (mapping?.lines?.length) {
      const first = mapping.lines[0] - 1
      const last = mapping.lines[mapping.lines.length - 1] - 1
      range = {
        start: { line: first, column: column(first, mapping.starting_column) },
        end: { line: last, column: column(last, mapping.ending_column) }
      }
    }
    return {
      source: 'slither',
      severity: slitherSeverity(item.impact),
      rule: item.check,
      title: item.check,
      message: (item.description || '').trim(),
      file: mapping ? mapping.filename_relative.replace(/^src\//, '') : undefined,
      range,
      nativeSeverity: slitherNativeSeverity(item.impact, item.confidence)
    }
  })
}

export interface AiSecurityAnswer {
  Answer: string
  Reason?: string[]
  Suggestion?: string[] | string
}

export function aiFindings (answer: AiSecurityAnswer, file: string): RawFinding[] {
  if (!answer || !aiIsVulnerable(answer.Answer)) return []
  const list = (items: string[]) => items.filter(Boolean).map((item) => `• ${item}`).join('\n')
  const reasons = list(answer.Reason || [])
  const suggestions = list(Array.isArray(answer.Suggestion) ? answer.Suggestion : [answer.Suggestion])
  return [{
    source: 'ai',
    severity: 'high',
    title: 'RemixAI flagged a possible major vulnerability',
    message: [
      reasons || 'RemixAI gave no details. Run a full security audit to see what it found.',
      suggestions && `Suggestions:\n${suggestions}`
    ].filter(Boolean).join('\n\n'),
    file,
    nativeSeverity: answer.Answer
  }]
}

/** Imported packages (npm, GitHub, Foundry libs): their findings are not the user's to fix. */
export function isDependencyPath (path?: string): boolean {
  if (!path) return false
  return path.startsWith('.deps/') || path.includes('/.deps/') || path.includes('node_modules/') ||
    path.startsWith('lib/forge-std/') || /^(@|https?:\/\/|github\.com\/|npm:)/.test(path)
}

/** Splits findings into the user's own code and dependencies. */
export function withoutDependencies (findings: RawFinding[]): { own: RawFinding[], dependencyCount: number } {
  const own = findings.filter((f) => !isDependencyPath(f.file))
  return { own, dependencyCount: findings.length - own.length }
}

export function stripHtml (text: string): string {
  return (text || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+\n/g, '\n').trim()
}
