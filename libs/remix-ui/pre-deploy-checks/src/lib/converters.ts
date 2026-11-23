import { aiIsVulnerable, remixModuleKey, remixSeverity, slitherNativeSeverity, slitherSeverity, solhintSeverity } from './severity'
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

/** The relative import path (`./x.sol`, `../a/b.sol`) from the file `from` to the file `to`. */
export function relativePath (from: string, to: string): string {
  const fromDir = from.split('/').slice(0, -1)
  const target = to.split('/')
  let common = 0
  while (common < fromDir.length && common < target.length - 1 && fromDir[common] === target[common]) common++
  const up = fromDir.length - common
  return (up ? '../'.repeat(up) : './') + target.slice(common).join('/')
}

/**
 * The sources with every non-relative import (`@openzeppelin/...`, `contracts/B.sol`) rewritten to a
 * relative path. The Slither service writes the sources under `src/` and builds them with Foundry
 * without remappings, so only relative imports resolve there. Each import's resolved path and position
 * come from the compiled AST; only the quoted path changes, so line numbers stay the same.
 */
export function relativeImports (sources: Record<string, { content: string }>, astSources: Record<string, { ast?: any }> = {}): Record<string, { content: string }> {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  const out: Record<string, { content: string }> = {}
  for (const [path, { content }] of Object.entries(sources)) {
    const imports = (astSources[path]?.ast?.nodes || [])
      .filter((node) => node.nodeType === 'ImportDirective' && node.absolutePath && node.file && !node.file.startsWith('.'))
      .map((node) => ({ node, start: Number(node.src.split(':')[0]), length: Number(node.src.split(':')[1]) }))
      .sort((a, b) => b.start - a.start)
    if (!imports.length) {
      out[path] = { content }
      continue
    }
    // solc positions are byte offsets: edit the UTF-8 bytes, last import first so earlier offsets hold
    let bytes = encoder.encode(content)
    for (const { node, start, length } of imports) {
      const statement = decoder.decode(bytes.slice(start, start + length))
      const rewritten = statement.replace(/(["'])([^"']*)\1/, (match, quote, file) => file === node.file ? `${quote}${relativePath(path, node.absolutePath)}${quote}` : match)
      bytes = new Uint8Array([...bytes.slice(0, start), ...encoder.encode(rewritten), ...bytes.slice(start + length)])
    }
    out[path] = { content: decoder.decode(bytes) }
  }
  return out
}

/**
 * The `analysis` field of the Slither service's answer. When Slither can't compile the sources the
 * service still answers, with Slither's console log in place of the JSON report: that becomes a
 * failed report whose error is the compiler's first specific message.
 */
export function parseSlitherAnalysis (analysis: string | SlitherReport): SlitherReport {
  if (typeof analysis !== 'string') return analysis
  try {
    return JSON.parse(analysis)
  } catch (e) {
    return { success: false, error: slitherLogError(analysis) }
  }
}

function slitherLogError (log: string): string {
  for (const line of log.split('\n')) {
    const match = line.replace(/^stderr:\s*/, '').match(/^(\w*Error)(?: \(\d+\))?:\s*(.+)$/)
    if (!match || /^Compiler run failed/.test(match[2])) continue
    const message = match[2].replace(/\/tmp\/slither-sandbox-[^/\s"]*\/?/g, '').replace(/\bsrc\//g, '').replace(/\s*Searched the following locations:.*$/, '')
    return `Slither could not compile the contract: ${message}`
  }
  return 'Slither could not compile the contract'
}

/**
 * Findings of a Slither report. The service compiles the sources under `src/`, so that prefix is
 * removed to get back the workspace path. A clean run has no `detectors`.
 */
export function slitherFindings (report: SlitherReport): RawFinding[] {
  return (report?.results?.detectors || []).map((item) => {
    const mapping = item.elements?.find((e) => e.source_mapping)?.source_mapping
    let range: Range | undefined
    if (mapping?.lines?.length) {
      const first = mapping.lines[0] - 1
      const last = mapping.lines[mapping.lines.length - 1] - 1
      range = {
        start: { line: first, column: Math.max((mapping.starting_column || 1) - 1, 0) },
        end: { line: last, column: Math.max((mapping.ending_column || 1) - 1, 0) }
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
