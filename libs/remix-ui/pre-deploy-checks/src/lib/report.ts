import { collectFindings } from './findings'
import { isStale } from './store'
import { FileCheckState, FindingSource, STEP_ORDER, StepId, StepResult } from './types'

export interface ReportContext {
  date: Date
  compiler?: { version?: string, optimize?: boolean, runs?: number | string, evmVersion?: string }
  environment?: { provider?: string, network?: string, chainId?: string, account?: string }
  contractName?: string
}

export const DISCLAIMER = 'Automated checks only. Passing them is not a security audit.'

export const STEP_LABELS: Record<StepId, string> = {
  compile: 'Compile',
  analysis: 'Static analysis',
  slither: 'Slither',
  ai: 'AI review',
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

export function reportFileName (file: string, contractName?: string): string {
  const dir = file.includes('/') ? file.substring(0, file.lastIndexOf('/') + 1) : ''
  const base = contractName || file.substring(dir.length).replace(/\.sol$/, '')
  return `${dir}${base}.predeploy.md`
}

function cell (text: string): string {
  return (text || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
}

function stepLine (state: FileCheckState, id: StepId, step?: StepResult): string {
  if (!step) return `| ${STEP_LABELS[id]} | not run | | |`
  const status = isStale(state, id) ? `${step.status} (out of date)` : step.status
  const origin = step.origin === 'manual' ? 'by hand' : 'this panel'
  return `| ${STEP_LABELS[id]} | ${cell(status)}${step.note ? ` — ${cell(step.note)}` : ''} | ${origin} | ${new Date(step.at).toISOString()} |`
}

export function buildReport (state: FileCheckState, ctx: ReportContext): string {
  const lines: string[] = []
  const findings = collectFindings(state).filter((f) => !f.stale)
  const high = findings.filter((f) => f.severity === 'high').length
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
    lines.push(`- **Compiler:** ${c.version || 'unknown'}, optimizer ${c.optimize ? `on (${c.runs} runs)` : 'off'}, EVM ${c.evmVersion || 'default'}`)
  }
  if (ctx.environment) {
    const e = ctx.environment
    lines.push(`- **Environment:** ${e.provider || 'unknown'} · ${e.network || 'unknown network'}${e.chainId ? ` (chain id ${e.chainId})` : ''}`)
    if (e.account) lines.push(`- **Account:** \`${e.account}\``)
  }
  lines.push('')

  lines.push('## Steps')
  lines.push('')
  lines.push('| Step | Status | Origin | Time |')
  lines.push('|---|---|---|---|')
  for (const id of STEP_ORDER) lines.push(stepLine(state, id, state.steps[id]))
  lines.push('')

  lines.push('## Gate')
  lines.push('')
  if (state.gateOverridden) lines.push(`Overridden: deployed with ${high} high-severity finding${high === 1 ? '' : 's'} ("Deploy anyway").`)
  else if (high > 0) lines.push(`Blocked: ${high} high-severity finding${high === 1 ? '' : 's'}.`)
  else lines.push('Passed: no high-severity findings.')
  lines.push('')

  lines.push('## Findings')
  lines.push('')
  if (!findings.length) {
    lines.push('No findings.')
  } else {
    lines.push('| Severity | Tools | Rule | Location | Message |')
    lines.push('|---|---|---|---|---|')
    for (const f of findings) {
      const tools = f.items.map((i) => SOURCE_LABELS[i.source] + (i.nativeSeverity ? ` (${i.nativeSeverity})` : '')).join(', ')
      const rules = Array.from(new Set(f.items.map((i) => i.rule || i.title))).join(', ')
      const location = f.file ? `${f.file}${f.range ? `:${f.range.start.line + 1}` : ''}` : ''
      lines.push(`| ${f.severity} | ${cell(tools)} | ${cell(rules)} | ${cell(location)} | ${cell(f.message)} |`)
    }
  }
  lines.push('')

  lines.push('## Output')
  lines.push('')
  lines.push(`- **Flattened file:** ${flatten?.data?.path ? `\`${flatten.data.path}\`` : 'none'}`)
  if (deploy?.status === 'passed' && deploy.data) {
    lines.push(`- **Contract:** ${deploy.data.contractName} at \`${deploy.data.address}\``)
    if (deploy.data.txHash) lines.push(`- **Transaction:** \`${deploy.data.txHash}\``)
    if (deploy.data.args?.length) lines.push(`- **Constructor arguments:** \`${cell(JSON.stringify(deploy.data.args))}\``)
  } else {
    lines.push('- **Deployment:** none')
  }
  if (verify) {
    lines.push(`- **Verification:** ${verify.status}${verify.note ? ` — ${verify.note}` : ''}`)
    for (const receipt of verify.data?.receipts || []) {
      lines.push(`  - ${receipt.verifier}: ${receipt.status}${receipt.lookupUrl ? ` — ${receipt.lookupUrl}` : ''}`)
    }
  }
  lines.push('')
  return lines.join('\n')
}
