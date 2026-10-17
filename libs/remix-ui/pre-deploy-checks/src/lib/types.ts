export type Severity = 'high' | 'medium' | 'low' | 'info'

export type StepId = 'compile' | 'analysis' | 'slither' | 'ai' | 'flatten' | 'deploy' | 'verify'

export type StepStatus = 'not-run' | 'running' | 'passed' | 'findings' | 'submitted' | 'failed' | 'skipped'

export type FindingSource = 'compiler' | 'remix' | 'solhint' | 'slither' | 'ai'

export type Origin = 'panel' | 'manual'

export interface Position {
  line: number // 0-based
  column: number // 0-based
}

export interface Range {
  start: Position
  end: Position
}

/** One finding as reported by one tool. Native data is kept as-is. */
export interface RawFinding {
  source: FindingSource
  severity: Severity
  /** the tool's own rule id: Remix module key, Slither detector, Solhint rule id */
  rule?: string
  title: string
  message: string
  file?: string
  range?: Range
  /** the tool's own severity wording, e.g. "High · Medium confidence" or "warning" */
  nativeSeverity?: string
  /** stable identity used to ignore the finding: rule + the code it points at, not its line number */
  key?: string
}

/** A finding in the aggregated list: one or more raw findings describing the same issue. */
export interface Finding {
  id: string
  severity: Severity
  title: string
  message: string
  file?: string
  range?: Range
  sources: FindingSource[]
  items: RawFinding[]
  stale: boolean
  /** keys of its raw findings; ignoring the finding ignores all of them */
  keys: string[]
  ignored?: IgnoredIssue
}

export type IgnoreReason = 'false-positive' | 'accepted-risk' | 'test-code'

export interface IgnoredIssue {
  reason: IgnoreReason
  at: number
}

export interface StepResult {
  status: StepStatus
  at: number
  origin: Origin
  /** keccak256 of the file content the result was produced from */
  contentHash?: string
  /** compiler version + settings the result was produced with */
  settingsKey?: string
  findings?: RawFinding[]
  note?: string
  data?: any
}

export interface FileCheckState {
  file: string
  currentHash?: string
  steps: Partial<Record<StepId, StepResult>>
  /** ignored issues by finding key, for the session */
  ignored?: Record<string, IgnoredIssue>
  gateOverridden?: boolean
}

export interface DeployResult {
  address: string
  txHash?: string
  chainId: string
  network?: string
  account?: string
  contractName: string
  args: any[]
}

export interface VerifyResult {
  chainId: string
  address: string
  submitted: boolean
}

/** the steps a run performs; deploy and verify are recorded from Deploy & Run, never run by the panel */
export type CheckStepId = 'compile' | 'analysis' | 'slither' | 'ai' | 'flatten'

export type StepToggles = Record<CheckStepId, boolean>

export const STEP_ORDER: StepId[] = ['compile', 'analysis', 'slither', 'ai', 'flatten', 'deploy', 'verify']

/** steps a run performs, in order; their result depends on the file content and becomes out of date when it changes */
export const CHECK_STEPS: CheckStepId[] = ['compile', 'analysis', 'slither', 'ai', 'flatten']

export const CONTENT_STEPS: StepId[] = CHECK_STEPS

export const DEFAULT_TOGGLES: StepToggles = {
  compile: true,
  analysis: true,
  slither: true,
  ai: false,
  flatten: true
}
