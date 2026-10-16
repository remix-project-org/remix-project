import { keccak256, toUtf8Bytes } from 'ethers'
import { CheckStepId, CONTENT_STEPS, FileCheckState, STEP_ORDER, StepId, StepResult, StepToggles } from './types'

export function contentHash (content: string): string {
  return keccak256(toUtf8Bytes(content ?? ''))
}

/** Key describing the compiler version and the settings that change the build. */
export function compilerSettingsKey (state: { currentVersion?: string, optimize?: boolean, runs?: number | string, evmVersion?: string }): string {
  if (!state) return ''
  return [state.currentVersion || '', state.optimize ? `opt:${state.runs}` : 'no-opt', state.evmVersion || 'default'].join('|')
}

/**
 * A content step (compile, analysis, Slither, AI, flatten) is out of date when it was produced
 * from other content than the file's current content. Deploy and verify are never out of date.
 */
export function isStale (state: FileCheckState, stepId: StepId): boolean {
  if (!CONTENT_STEPS.includes(stepId)) return false
  const step = state.steps[stepId]
  if (!step || !step.contentHash || !state.currentHash) return false
  return step.contentHash !== state.currentHash
}

/** Deploy result produced from an earlier version of the file. */
export function deployedFromOlderVersion (state: FileCheckState): boolean {
  const deploy = state.steps.deploy
  return !!(deploy?.status === 'passed' && deploy.contentHash && state.currentHash && deploy.contentHash !== state.currentHash)
}

export interface PlanContext {
  toggles: StepToggles
  /** current compiler settings key */
  settingsKey: string
  force?: boolean
}

function hasUsableResult (step?: StepResult): boolean {
  return !!step && (step.status === 'passed' || step.status === 'findings' || step.status === 'submitted')
}

/** Whether a check step must run, given its last result (FR-12, FR-13). */
export function needsRun (state: FileCheckState, stepId: CheckStepId, ctx: PlanContext): boolean {
  if (stepId !== 'compile' && !ctx.toggles[stepId]) return false
  if (ctx.force) return true
  const step = state.steps[stepId]
  if (!hasUsableResult(step)) return true
  return step.contentHash !== state.currentHash || step.settingsKey !== ctx.settingsKey
}

export type StateListener = (file: string, state: FileCheckState) => void

/** Per-file check state for the session (kept in the plugin, so it updates while the panel is hidden). */
export class CheckStore {
  private states = new Map<string, FileCheckState>()
  private listener: StateListener | null = null

  onChange (listener: StateListener) {
    this.listener = listener
  }

  get (file: string): FileCheckState {
    let state = this.states.get(file)
    if (!state) {
      state = { file, steps: {} }
      this.states.set(file, state)
    }
    return state
  }

  has (file: string): boolean {
    return this.states.has(file)
  }

  setCurrentHash (file: string, hash: string) {
    const state = this.get(file)
    if (state.currentHash === hash) return
    this.update(file, { ...state, currentHash: hash })
  }

  setStep (file: string, stepId: StepId, result: StepResult) {
    const state = this.get(file)
    this.update(file, { ...state, steps: { ...state.steps, [stepId]: result } })
  }

  patch (file: string, changes: Partial<FileCheckState>) {
    this.update(file, { ...this.get(file), ...changes })
  }

  rename (oldFile: string, newFile: string) {
    const state = this.states.get(oldFile)
    if (!state) return
    this.states.delete(oldFile)
    this.update(newFile, { ...state, file: newFile })
  }

  remove (file: string) {
    this.states.delete(file)
  }

  private update (file: string, state: FileCheckState) {
    this.states.set(file, state)
    this.listener && this.listener(file, state)
  }
}

export function stepsInOrder (state: FileCheckState): { id: StepId, result?: StepResult }[] {
  return STEP_ORDER.map((id) => ({ id, result: state.steps[id] }))
}
