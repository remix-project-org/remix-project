import type { CheckStepId, FileCheckState, Finding, IgnoreReason, Range, StepToggles } from '../types'

export interface CompilerSummary {
  version?: string
  optimize?: boolean
  runs?: number
  evmVersion?: string
}

/** Snapshot rendered by the panel; produced by the plugin on every change. */
export interface PreDeployChecksViewState {
  file: string | null
  state: FileCheckState | null
  findings: Finding[]
  toggles: StepToggles
  running: boolean
  cancelling: boolean
  currentStep: CheckStepId | null
  compiler: CompilerSummary | null
  /** path of the report "Save" writes */
  reportPath: string | null
  themeQuality: 'dark' | 'light'
}

/** Actions the panel can ask the plugin to perform. */
export interface PreDeployChecksActions {
  startRun: (file: string, opts?: { force?: boolean }) => Promise<void>
  cancelRun: () => void
  /** opens Deploy & Run with this file's contract selected */
  goToDeploy: () => Promise<void>
  setToggle: (stepId: CheckStepId, enabled: boolean) => void
  openFinding: (finding: { file?: string, range?: Range }) => Promise<void>
  ignoreFinding: (finding: Finding, reason: IgnoreReason) => void
  restoreFinding: (finding: Finding) => void
  openFile: (file: string) => Promise<void>
  openPlugin: (name: string) => Promise<void>
  saveReport: () => Promise<void>
}
