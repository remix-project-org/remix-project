import { collectFindings } from './findings'
import { deployedFromOlderVersion, isStale } from './store'
import { CHECK_STEPS, FileCheckState, Finding, FindingSource, IgnoreReason, StepId, StepResult } from './types'

export interface ReportContext {
  date: Date
  compiler?: { version?: string, optimize?: boolean, runs?: number | string, evmVersion?: string }
  contractName?: string
}

export const DISCLAIMER = 'Automated checks, not a security audit. They run existing tools (compiler, Remix analyzer, Solhint, Slither, optional AI security check). Passing them does not mean the contract is safe.'

export const STEP_LABELS: Record<StepId, string> = {
  compile: 'Compile',
  analysis: 'Static analysis',
  slither: 'Slither',
  ai: 'AI security check',
  flatten: 'Flatten',
  deploy: 'Deploy',
  verify: 'Verify'
}

export const SOURCE_LABELS: Record<FindingSource, string> = {
  compiler: 'Compiler',
  remix: 'Remix analyzer',
  solhint: 'Solhint',
  slither: 'Slither',
  ai: 'RemixAI'
}

export const REASON_LABELS: Record<IgnoreReason, string> = {
  'false-positive': 'False positive',
  'accepted-risk': 'Accepted risk',
  'test-code': 'Test or example code'
}

export function reportFileName (file: string, contractName?: string): string {
  const dir = file.includes('/') ? file.substring(0, file.lastIndexOf('/') + 1) : ''
  const base = contractName || file.substring(dir.length).replace(/\.sol$/, '')
  return `${dir}${base}.predeploy.md`
}

function cell (text: string): string {
  // analyzer messages carry indentation and line breaks from their source strings
  return (text || '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim()
}

function stepLine (state: FileCheckState, id: StepId, step?: StepResult): string {
  if (!step) return `| ${STEP_LABELS[id]} | not run | | |`
  const status = isStale(state, id) ? `${step.status} (out of date)` : step.status
  const origin = step.origin === 'manual' ? 'by hand' : 'this panel'
  return `| ${STEP_LABELS[id]} | ${cell(status)}${step.note ? ` — ${cell(step.note)}` : ''} | ${origin} | ${new Date(step.at).toISOString()} |`
}

function plural (count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

function findingRow (f: Finding, extra?: string): string {
  const tools = f.items.map((i) => SOURCE_LABELS[i.source] + (i.nativeSeverity ? ` (${i.nativeSeverity})` : '')).join(', ')
  const rules = Array.from(new Set(f.items.map((i) => i.rule || i.title))).join(', ')
  const location = f.file ? `${f.file}${f.range ? `:${f.range.start.line + 1}` : ''}` : ''
  return `| ${f.severity} | ${cell(tools)} | ${cell(rules)} | ${cell(location)} |${extra !== undefined ? ` ${cell(extra)} |` : ''} ${cell(f.message)} |`
}

export function buildReport (state: FileCheckState, ctx: ReportContext): string {
  const lines: string[] = []
  const current = collectFindings(state).filter((f) => !f.stale)
  const open = current.filter((f) => !f.ignored)
  const ignored = current.filter((f) => f.ignored)
  const high = open.filter((f) => f.severity === 'high').length
  const deploy = state.steps.deploy
  const verify = state.steps.verify
  const flatten = state.steps.flatten

  lines.push(`# Pre-deploy checks: ${ctx.contractName || state.file}`)
  lines.push('')
  lines.push(`> ${DISCLAIMER}`)
  lines.push('')
  lines.push(`- **Date:** ${ctx.date.toISOString()}`)
  lines.push(`- **File:** \`${state.file}\``)
  lines.push(`- **Content hash:** \`${state.currentHash || 'unknown'}\``)
  if (ctx.compiler) {
    const c = ctx.compiler
    lines.push(`- **Compiler:** ${(c.version || 'unknown').replace(/\.Emscripten.*$/, '')}, optimizer ${c.optimize ? `on (${c.runs} runs)` : 'off'}, EVM ${c.evmVersion || 'default'}`)
  }
  lines.push('')

  lines.push('## Checks')
  lines.push('')
  lines.push('| Check | Status | Origin | Time |')
  lines.push('|---|---|---|---|')
  for (const id of CHECK_STEPS) lines.push(stepLine(state, id, state.steps[id]))
  lines.push('')

  lines.push('## High-severity issues')
  lines.push('')
  lines.push(high > 0 ? `${plural(high, 'open high-severity issue')}.` : 'None open.')
  if (ignored.length) lines.push(`${plural(ignored.length, 'issue')} ignored, listed below with the reason.`)
  if (deploy?.status === 'passed' && deploy.data?.openHigh > 0) {
    lines.push(`Deployed with ${plural(deploy.data.openHigh, 'open high-severity issue')}.`)
  }
  lines.push('')

  lines.push('## Issues')
  lines.push('')
  if (!open.length) {
    lines.push('No open issues.')
  } else {
    lines.push('| Severity | Tools | Rule | Location | Message |')
    lines.push('|---|---|---|---|---|')
    for (const f of open) lines.push(findingRow(f))
  }
  lines.push('')

  if (ignored.length) {
    lines.push('## Ignored issues')
    lines.push('')
    lines.push('| Severity | Tools | Rule | Location | Reason | Message |')
    lines.push('|---|---|---|---|---|---|')
    for (const f of ignored) lines.push(findingRow(f, REASON_LABELS[f.ignored.reason]))
    lines.push('')
  }

  lines.push('## Outputs')
  lines.push('')
  lines.push(`- **Flattened file:** ${flatten?.status === 'passed' && flatten.data?.path ? `\`${flatten.data.path}\`${isStale(state, 'flatten') ? ' (out of date)' : ''}` : 'none'}`)
  lines.push('')

  lines.push('## Deployment')
  lines.push('')
  if (deploy?.status === 'passed' && deploy.data?.address) {
    const d = deploy.data
    lines.push(`- **Contract:** ${d.contractName} at \`${d.address}\``)
    lines.push(`- **Network:** ${d.network || 'unknown'}${d.chainId ? ` (chain id ${d.chainId})` : ''}`)
    if (d.txHash) lines.push(`- **Transaction:** \`${d.txHash}\``)
    lines.push(`- **Time:** ${new Date(deploy.at).toISOString()}, from Deploy & Run`)
    lines.push(`- **Version:** ${deployedFromOlderVersion(state) ? 'an earlier version of the file' : 'the version checked above'}`)
    if (verify) lines.push(`- **Verification:** ${verify.status}${verify.note ? ` — ${cell(verify.note)}` : ''}`)
  } else {
    lines.push('Not deployed from Deploy & Run in this session.')
  }
  lines.push('')
  return lines.join('\n')
}
