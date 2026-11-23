import { blockingFindings } from './findings'
import { deployedFromOlderVersion, isStale } from './store'
import { CHECK_STEPS, CheckStepId, FileCheckState, Finding, StepToggles } from './types'

/** The tools behind the check steps, as named to the user. Flatten produces no issues and is shown under Outputs. */
export type ToolId = 'compiler' | 'analyzer' | 'solhint' | 'slither' | 'ai'

const STEP_TOOLS: Partial<Record<CheckStepId, ToolId[]>> = {
  compile: ['compiler'],
  analysis: ['analyzer', 'solhint'],
  slither: ['slither'],
  ai: ['ai']
}

/** What the status card says. Wording lives in the locale file; this only holds the facts. */
export type Verdict =
  | { kind: 'empty' }
  | { kind: 'not-checked' }
  | { kind: 'running', step: CheckStepId }
  | { kind: 'compile-failed', errors: number }
  | { kind: 'out-of-date' }
  | { kind: 'deployed', contractName?: string, network?: string, at: number }
  | { kind: 'gate', high: number, notRun: ToolId[] }
  | { kind: 'clear', tools: number, medium: number, ignored: number }

export type VerdictAction = 'cancel' | 'run' | 'rerun' | 'deploy-anyway' | 'go-to-deploy'

export interface VerdictInput {
  state: FileCheckState | null
  findings: Finding[]
  toggles: StepToggles
  /** the step running now, when a run is in progress for this file */
  runningStep: CheckStepId | null
}

/** A tool without a usable result, shown as one plain line above the issues. */
export interface ToolLine {
  tools: ToolId[]
  /** clear: the AI security check found no major vulnerability (other tools show it as an empty list) */
  kind: 'running' | 'waiting' | 'stale' | 'failed' | 'skipped' | 'clear'
  note?: string
  /** why it was skipped, when the panel can help: RemixAI sign-in */
  reason?: 'sign-in'
}

const usable = (status?: string) => status === 'passed' || status === 'findings'

function enabledSteps (toggles: StepToggles): CheckStepId[] {
  return CHECK_STEPS.filter((id) => id === 'compile' || toggles[id])
}

/** Tools whose results are current: what "From N tools" counts. */
export function toolsWithResults (state: FileCheckState, toggles: StepToggles): ToolId[] {
  const tools: ToolId[] = []
  for (const id of enabledSteps(toggles)) {
    const step = state.steps[id]
    if (!STEP_TOOLS[id] || !step || !usable(step.status) || isStale(state, id)) continue
    tools.push(...STEP_TOOLS[id].filter((tool) => !(tool === 'solhint' && step.data?.solhintError)))
  }
  return tools
}

/** The status card's state and actions, in priority order (design §3). */
export function deriveVerdict ({ state, findings, toggles, runningStep }: VerdictInput): { verdict: Verdict, actions: VerdictAction[] } {
  if (!state) return { verdict: { kind: 'empty' }, actions: []}
  if (runningStep) return { verdict: { kind: 'running', step: runningStep }, actions: ['cancel']}

  const compile = state.steps.compile
  if (compile?.status === 'failed' && !isStale(state, 'compile')) {
    return { verdict: { kind: 'compile-failed', errors: compile.data?.errors?.length || 0 }, actions: ['run']}
  }

  const deploy = state.steps.deploy
  const deployed = deploy?.status === 'passed' && deploy.data?.address
  const checked = enabledSteps(toggles).some((id) => id !== 'compile' && state.steps[id] && state.steps[id].status !== 'running')
  if (!checked && !deployed) return { verdict: { kind: 'not-checked' }, actions: ['run']}

  if (enabledSteps(toggles).some((id) => isStale(state, id))) return { verdict: { kind: 'out-of-date' }, actions: ['run']}

  if (deployed && !deployedFromOlderVersion(state)) {
    return { verdict: { kind: 'deployed', contractName: deploy.data.contractName, network: deploy.data.network, at: deploy.at }, actions: []}
  }

  const high = blockingFindings(findings).length
  if (high > 0) {
    const notRun = toolLines({ state, findings, toggles, runningStep })
      .filter((line) => line.kind === 'skipped' || line.kind === 'failed')
      .reduce((tools, line) => tools.concat(line.tools), [] as ToolId[])
    return { verdict: { kind: 'gate', high, notRun }, actions: ['rerun', 'deploy-anyway']}
  }

  const current = findings.filter((f) => !f.stale)
  return {
    verdict: {
      kind: 'clear',
      tools: toolsWithResults(state, toggles).length,
      medium: current.filter((f) => !f.ignored && f.severity === 'medium').length,
      ignored: current.filter((f) => f.ignored).length
    },
    actions: ['go-to-deploy']
  }
}

/** One line per enabled tool that has no current result (design §4). Compile errors are issues, not a line. */
export function toolLines ({ state, toggles, runningStep }: VerdictInput): ToolLine[] {
  if (!state) return []
  const lines: ToolLine[] = []
  for (const id of enabledSteps(toggles)) {
    const tools = STEP_TOOLS[id]
    if (!tools) continue
    const step = state.steps[id]
    if (step?.status === 'running' || runningStep === id) {
      lines.push({ tools, kind: 'running' })
    } else if (!step) {
      if (runningStep) lines.push({ tools, kind: 'waiting' })
    } else if (isStale(state, id)) {
      lines.push({ tools, kind: runningStep ? 'waiting' : 'stale' })
    } else if (step.status === 'failed') {
      if (id !== 'compile') lines.push({ tools, kind: 'failed', note: step.note })
    } else if (step.status === 'skipped') {
      lines.push({ tools, kind: 'skipped', note: step.note, reason: step.data?.reason })
    } else if (id === 'analysis' && step.data?.solhintError) {
      lines.push({ tools: ['solhint'], kind: 'failed', note: step.data.solhintError })
    } else if (id === 'ai' && step.status === 'passed') {
      lines.push({ tools, kind: 'clear' })
    }
  }
  return lines
}

/** What other panels (Deploy & Run's status line) need to know about a file's checks. */
export interface ChecksSummary {
  file: string
  kind: Verdict['kind']
  /** open high-severity issues, or compile errors when the file doesn't compile */
  count: number
  /** when the last check step finished */
  checkedAt?: number
}

export function summarize (input: VerdictInput): ChecksSummary | null {
  if (!input.state) return null
  const { verdict } = deriveVerdict(input)
  const finished = CHECK_STEPS.map((id) => input.state.steps[id]).filter((step) => step && step.status !== 'running').map((step) => step.at)
  return {
    file: input.state.file,
    kind: verdict.kind,
    count: verdict.kind === 'gate' ? verdict.high : verdict.kind === 'compile-failed' ? verdict.errors : 0,
    checkedAt: finished.length ? Math.max(...finished) : undefined
  }
}
