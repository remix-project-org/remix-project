import type { AbiInput } from '../args'
import type { EnvironmentInfo, RunOutcome } from '../runner'
import type { CheckStepId, FileCheckState, Finding, Range, StepToggles } from '../types'

export interface ContractOption {
  name: string
  inputs: AbiInput[]
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
  outcome: RunOutcome | null
  env: EnvironmentInfo | null
  compiler: { version?: string, optimize?: boolean, runs?: number, evmVersion?: string } | null
  contracts: ContractOption[]
  contractName?: string
  rawArgs: string[]
  argErrors: Record<number, string>
  isDesktop: boolean
}

/** Actions the panel can ask the plugin to perform. */
export interface PreDeployChecksActions {
  startRun: (file: string, opts?: { force?: boolean }) => Promise<void>
  cancelRun: () => void
  setToggle: (stepId: CheckStepId, enabled: boolean) => void
  selectContract: (name: string) => void
  setArg: (index: number, value: string) => void
  openFinding: (finding: { file?: string, range?: Range }) => Promise<void>
  openFile: (file: string) => Promise<void>
  openPlugin: (name: string) => Promise<void>
  saveReport: () => Promise<void>
}
