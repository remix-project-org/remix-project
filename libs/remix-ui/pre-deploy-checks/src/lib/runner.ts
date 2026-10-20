import { CodeAnalysis } from '@remix-project/remix-analyzer'
import { aiFindings, remixFindings, slitherFindings, solhintFindings, withoutDependencies } from './converters'
import { withIssueKeys } from './findings'
import { CheckStore, compilerSettingsKey, needsRun, PlanContext } from './store'
import { CHECK_STEPS, CheckStepId, RawFinding, StepResult, StepToggles } from './types'

/** Last compilation of a file, as received from `solidity.compilationFinished`. */
export interface Compilation {
  file: string
  source: { sources: Record<string, { content: string }>, target: string }
  data: any
  input: string
  version: string
}

/** What the runner needs from the plugin that hosts it. */
export interface CheckHost {
  call: (plugin: string, method: string, ...args: any[]) => Promise<any>
  store: CheckStore
  isDesktop: boolean
  /** compiles the file through the Solidity compiler; resolves once the compile step is recorded */
  compile: (file: string) => Promise<void>
  getCompilation: (file: string) => Compilation | undefined
  /** updates the file's current content hash from the editor right away (the editor's event is debounced) */
  syncContent: (file: string) => Promise<void>
}

export interface RunOptions {
  file: string
  toggles: StepToggles
  force?: boolean
  isCancelled: () => boolean
  onStep?: (step: CheckStepId | null) => void
}

/** How a run ended. Whether the file may be deployed is not decided here: it follows from the open issues. */
export type RunOutcome =
  | { kind: 'done' }
  | { kind: 'cancelled' }
  | { kind: 'compile-failed' }
  | { kind: 'error', message: string }

const SECURITY_PROMPT_SUFFIX = 'Reply in a short manner: Does this code contain major security vulnerabilities leading to a scam or loss of funds?'

function result (status: StepResult['status'], extra: Partial<StepResult> = {}): StepResult {
  return { status, at: Date.now(), origin: 'panel', ...extra }
}

function errorMessage (e: any): string {
  return (e && (e.message || e.error)) || String(e)
}

export async function getSettingsKey (host: CheckHost): Promise<string> {
  try {
    return compilerSettingsKey(await host.call('solidity', 'getCompilerState'))
  } catch (e) {
    return ''
  }
}

/**
 * Findings in the user's own code: the checked file and the workspace files it imports. Imported packages
 * keep their import path in the compilation ("hardhat/console.sol"), which isn't a file in the workspace.
 */
export async function ownFindings (host: CheckHost, file: string, findings: RawFinding[]): Promise<{ own: RawFinding[], dependencyCount: number }> {
  const { own } = withoutDependencies(findings)
  const inWorkspace = new Map<string, boolean>()
  for (const path of new Set(own.map((f) => f.file).filter((path) => path && path !== file))) {
    inWorkspace.set(path, !!(await host.call('fileManager', 'exists', path).catch(() => false)))
  }
  const kept = own.filter((f) => !f.file || f.file === file || inWorkspace.get(f.file))
  return { own: kept, dependencyCount: findings.length - kept.length }
}

async function runAnalysis (host: CheckHost, file: string, compilation: Compilation): Promise<StepResult> {
  const analyzer = new CodeAnalysis()
  const modules = analyzer.modules().map((_m, index) => index)
  const reports = analyzer.run(compilation.data, modules)
  const findings = remixFindings(reports as any, compilation.source.sources, compilation.data.sources)
  const notes: string[] = []
  let solhintError: string | undefined
  try {
    const hints = await host.call('solhint', 'lint', file)
    findings.push(...solhintFindings(hints, file))
  } catch (e) {
    solhintError = errorMessage(e)
    notes.push(`Solhint unavailable: ${solhintError}`)
  }
  const { own, dependencyCount } = await ownFindings(host, file, findings)
  if (dependencyCount) notes.push(`${dependencyCount} finding${dependencyCount === 1 ? '' : 's'} in imported libraries not shown`)
  return result(own.length ? 'findings' : 'passed', { findings: own, note: notes.join(' · ') || undefined, data: solhintError ? { solhintError } : undefined })
}

async function runSlither (host: CheckHost, file: string): Promise<StepResult> {
  const remixdActive = await host.call('manager', 'isActive', 'remixd').catch(() => false)
  if (!remixdActive && !host.isDesktop) {
    return result('skipped', { note: 'Connect remixd or use Remix Desktop to run Slither', data: { reason: 'unavailable' } })
  }
  const { currentVersion, optimize, evmVersion } = await host.call('solidity', 'getCompilerState')
  let response: any
  try {
    response = await host.call('slither', 'analyse', file, { currentVersion, optimize, evmVersion })
  } catch (e) {
    return result('failed', { note: errorMessage(e) })
  }
  if (!response) return result('skipped', { note: 'Slither is not reachable: check the remixd connection', data: { reason: 'unavailable' } })
  if (!response.status) return result('failed', { note: 'Slither did not complete' })
  const resolveFile = (path: string) => (path === file || file.endsWith('/' + path) || path.endsWith('/' + file)) ? file : path
  const { own, dependencyCount } = await ownFindings(host, file, slitherFindings(response, resolveFile))
  const note = dependencyCount ? `${dependencyCount} finding${dependencyCount === 1 ? '' : 's'} in imported libraries not shown` : undefined
  return result(own.length ? 'findings' : 'passed', { findings: own, note })
}

async function runAiReview (host: CheckHost, file: string): Promise<StepResult> {
  const content = await host.call('fileManager', 'readFile', file)
  const prompt = '```\n' + content + '\n```\n\n' + SECURITY_PROMPT_SUFFIX
  let raw: any
  try {
    raw = await host.call('remixAI', 'vulnerability_check', prompt)
  } catch (e) {
    return result('failed', { note: errorMessage(e) })
  }
  if (raw === null || raw === undefined) return result('skipped', { note: 'Sign in to RemixAI to run the AI review', data: { reason: 'sign-in' } })
  let answer: any
  try {
    answer = typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch (e) {
    return result('failed', { note: 'RemixAI returned an answer that could not be read' })
  }
  if (!answer || typeof answer.Answer !== 'string') return result('failed', { note: 'RemixAI returned an answer that could not be read' })
  const findings = aiFindings(answer, file)
  return result(findings.length ? 'findings' : 'passed', { findings, note: findings.length ? undefined : 'No major vulnerability reported' })
}

export function flattenedPath (file: string): string {
  const dir = file.includes('/') ? file.substring(0, file.lastIndexOf('/') + 1) : ''
  const name = file.substring(dir.length).split('.')[0]
  return `${dir}${name}_flattened.sol`
}

async function runFlatten (host: CheckHost, file: string, compilation: Compilation): Promise<StepResult> {
  const flattened = await host.call('contractflattener', 'flattenContract', compilation.source, file, compilation.data, JSON.parse(compilation.input), true)
  if (!flattened) return result('failed', { note: 'The file could not be flattened' })
  return result('passed', { data: { path: flattenedPath(file) } })
}

/**
 * Runs the enabled check steps that are missing or out of date, in order (FR-11, FR-12).
 * Stops when compilation fails. Never deploys: deploying stays in Deploy & Run.
 */
export async function runPipeline (host: CheckHost, opts: RunOptions): Promise<RunOutcome> {
  const { file, store } = { file: opts.file, store: host.store }
  await host.syncContent(file)
  const settingsKey = await getSettingsKey(host)
  const ctx: PlanContext = { toggles: opts.toggles, settingsKey, force: opts.force }

  const setRunning = (stepId: CheckStepId) => {
    const previous = store.get(file).steps[stepId]
    store.setStep(file, stepId, { ...(previous || { at: Date.now(), origin: 'panel' }), status: 'running', at: Date.now(), origin: 'panel' })
    opts.onStep && opts.onStep(stepId)
  }

  try {
    for (const stepId of CHECK_STEPS) {
      if (opts.isCancelled()) return { kind: 'cancelled' }
      if (!needsRun(store.get(file), stepId, ctx)) continue

      if (stepId === 'compile') {
        setRunning('compile')
        await host.compile(file)
        // an auto-compile of an earlier version can land first: compile again so every step uses the current content
        await host.syncContent(file)
        const compiled = store.get(file)
        if (compiled.steps.compile?.status !== 'failed' && compiled.steps.compile?.contentHash !== compiled.currentHash) {
          setRunning('compile')
          await host.compile(file)
        }
        if (store.get(file).steps.compile?.status === 'failed') return { kind: 'compile-failed' }
        continue
      }

      const compiled = store.get(file).steps.compile
      const compilation = host.getCompilation(file)
      setRunning(stepId)
      let stepResult: StepResult
      try {
        switch (stepId) {
        case 'analysis': stepResult = await runAnalysis(host, file, compilation); break
        case 'slither': stepResult = await runSlither(host, file); break
        case 'ai': stepResult = await runAiReview(host, file); break
        case 'flatten': stepResult = await runFlatten(host, file, compilation); break
        }
      } catch (e) {
        stepResult = result('failed', { note: errorMessage(e) })
      }
      if (stepResult.findings) stepResult = { ...stepResult, findings: withIssueKeys(stepResult.findings, compilation?.source?.sources) }
      store.setStep(file, stepId, { ...stepResult, contentHash: compiled?.contentHash, settingsKey: compiled?.settingsKey })
    }
    return { kind: 'done' }
  } finally {
    opts.onStep && opts.onStep(null)
  }
}
