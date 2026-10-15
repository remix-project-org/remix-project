import { CodeAnalysis } from '@remix-project/remix-analyzer'
import { aiFindings, remixFindings, slitherFindings, solhintFindings, withoutDependencies } from './converters'
import { blockingFindings, collectFindings } from './findings'
import { CheckStore, compilerSettingsKey, needsRun, PlanContext } from './store'
import { FileCheckState, STEP_ORDER, StepId, StepResult, StepToggles } from './types'

/** Last compilation of a file, as received from `solidity.compilationFinished`. */
export interface Compilation {
  file: string
  source: { sources: Record<string, { content: string }>, target: string }
  data: any
  input: string
  version: string
}

export interface EnvironmentInfo {
  provider?: string
  network?: string
  chainId?: string
  account?: string
  isVM: boolean
}

/** What the runner needs from the plugin that hosts it. */
export interface CheckHost {
  call: (plugin: string, method: string, ...args: any[]) => Promise<any>
  store: CheckStore
  isDesktop: boolean
  /** compiles the file through the Solidity compiler; resolves once the compile step is recorded */
  compile: (file: string) => Promise<void>
  getCompilation: (file: string) => Compilation | undefined
  /** asks the user to confirm a deployment on a live chain */
  confirmDeploy: (details: { contractName: string, env: EnvironmentInfo, args: any[], value: string }) => Promise<boolean>
}

export type DeployTarget =
  | { contractName: string, args: any[] }
  | { error: 'no-contract' | 'invalid-args' }

export interface RunOptions {
  file: string
  toggles: StepToggles
  /** contract and constructor arguments to deploy; asked for once the file is compiled */
  getDeployTarget: () => DeployTarget
  force?: boolean
  /** continue past the gate ("Deploy anyway") */
  overrideGate?: boolean
  isCancelled: () => boolean
  onStep?: (step: StepId | null) => void
}

export type RunOutcome =
  | { kind: 'done' }
  | { kind: 'cancelled' }
  | { kind: 'compile-failed' }
  | { kind: 'gate', high: number, notRun: string[] }
  | { kind: 'no-contract' }
  | { kind: 'invalid-args' }
  | { kind: 'deploy-failed' }
  | { kind: 'deploy-declined' }
  | { kind: 'error', message: string }

const SECURITY_PROMPT_SUFFIX = 'Reply in a short manner: Does this code contain major security vulnerabilities leading to a scam or loss of funds?'

function result (status: StepResult['status'], extra: Partial<StepResult> = {}): StepResult {
  return { status, at: Date.now(), origin: 'panel', ...extra }
}

function errorMessage (e: any): string {
  return (e && (e.message || e.error)) || String(e)
}

export async function getEnvironment (host: CheckHost): Promise<EnvironmentInfo> {
  const [network, provider, account, isVM] = await Promise.all([
    host.call('udappEnv', 'getNetwork').catch((): any => null),
    host.call('udappEnv', 'getSelectedProvider').catch((): any => null),
    host.call('udappEnv', 'getSelectedAccount').catch((): any => null),
    host.call('blockchain', 'isVM').catch(() => false)
  ])
  return { provider, network: network?.name, chainId: network?.chainId?.toString(), account, isVM: !!isVM }
}

export async function getSettingsKey (host: CheckHost): Promise<string> {
  try {
    return compilerSettingsKey(await host.call('solidity', 'getCompilerState'))
  } catch (e) {
    return ''
  }
}

async function runAnalysis (host: CheckHost, file: string, compilation: Compilation): Promise<StepResult> {
  const analyzer = new CodeAnalysis()
  const modules = analyzer.modules().map((_m, index) => index)
  const reports = analyzer.run(compilation.data, modules)
  const findings = remixFindings(reports as any, compilation.source.sources, compilation.data.sources)
  const notes: string[] = []
  try {
    const hints = await host.call('solhint', 'lint', file)
    findings.push(...solhintFindings(hints, file))
  } catch (e) {
    notes.push(`Solhint unavailable: ${errorMessage(e)}`)
  }
  const { own, dependencyCount } = withoutDependencies(findings)
  if (dependencyCount) notes.push(`${dependencyCount} finding${dependencyCount === 1 ? '' : 's'} in imported libraries not shown`)
  return result(own.length ? 'findings' : 'passed', { findings: own, note: notes.join(' · ') || undefined })
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
  const { own, dependencyCount } = withoutDependencies(slitherFindings(response, resolveFile))
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

async function runDeploy (host: CheckHost, file: string, contractName: string, args: any[], env: EnvironmentInfo, deployKey: string, contentHash: string): Promise<StepResult | 'declined'> {
  if (!env.isVM) {
    const value = await host.call('udappDeploy', 'getValue').catch((): any => '0')
    const confirmed = await host.confirmDeploy({ contractName, env, args, value: `${value?.toString() || '0'} wei` })
    if (!confirmed) return 'declined'
  }
  try {
    const deployed = await host.call('udappDeploy', 'deployCompiledContract', { filePath: file, contractName, args, verify: false })
    return result('passed', {
      contentHash,
      settingsKey: deployKey,
      data: { contractName, address: deployed.address, txHash: deployed.txHash, chainId: deployed.chainId || env.chainId, network: env.network, account: env.account, args }
    })
  } catch (e) {
    return result('failed', { contentHash, settingsKey: deployKey, note: errorMessage(e) })
  }
}

async function runVerify (host: CheckHost, file: string, state: FileCheckState, env: EnvironmentInfo): Promise<StepResult> {
  const deploy = state.steps.deploy?.data
  if (!deploy?.address) return result('skipped', { note: 'Nothing deployed yet' })
  if (env.isVM) return result('skipped', { note: 'Verification is not available on Remix VM', data: { address: deploy.address } })
  const chainId = deploy.chainId || env.chainId
  const supported = await host.call('contract-verification', 'isVerificationSupportedForChain', chainId).catch(() => false)
  if (!supported) return result('skipped', { note: 'Verification is not available on this network', data: { address: deploy.address } })
  try {
    await host.call('contract-verification', 'verifyOnDeploy', { chainId, address: deploy.address, contractName: deploy.contractName, filePath: file, args: deploy.args })
  } catch (e) {
    return result('failed', { note: errorMessage(e), data: { address: deploy.address } })
  }
  return result('submitted', { note: 'Submitted: results in the terminal and in Contract Verification', data: { address: deploy.address, chainId } })
}

/**
 * Runs the enabled steps that are missing or out of date, in order (FR-11, FR-12).
 * Stops when compilation fails, at the gate, or when deploying fails.
 */
export async function runPipeline (host: CheckHost, opts: RunOptions): Promise<RunOutcome> {
  const { file, store } = { file: opts.file, store: host.store }
  const settingsKey = await getSettingsKey(host)
  const env = await getEnvironment(host)
  let target: { contractName?: string, args: any[] } = { args: []}
  const deployKey = () => `${env.chainId}|${target.contractName}|${JSON.stringify(target.args)}`
  const ctx = (): PlanContext => ({ toggles: opts.toggles, settingsKey, deployKey: deployKey(), force: opts.force })
  let deployRan = false

  const setRunning = (stepId: StepId) => {
    const previous = store.get(file).steps[stepId]
    store.setStep(file, stepId, { ...(previous || { at: Date.now(), origin: 'panel' }), status: 'running', at: Date.now(), origin: 'panel' })
    opts.onStep && opts.onStep(stepId)
  }

  try {
    for (const stepId of STEP_ORDER) {
      if (opts.isCancelled()) return { kind: 'cancelled' }
      const state = store.get(file)

      if (stepId === 'deploy' && opts.toggles.deploy) {
        const deployTarget = opts.getDeployTarget()
        if ('error' in deployTarget) return { kind: deployTarget.error }
        target = deployTarget
        const high = blockingFindings(collectFindings(state)).length
        const notRun = (['analysis', 'slither'] as StepId[]).filter((id) => opts.toggles[id] && ['skipped', 'failed'].includes(state.steps[id]?.status))
        if (high > 0 && !opts.overrideGate && needsRun(state, 'deploy', ctx())) {
          return { kind: 'gate', high, notRun }
        }
        if (high > 0 && opts.overrideGate) store.patch(file, { gateOverridden: true })
        if (high === 0) store.patch(file, { gateOverridden: false })
      }

      if (!needsRun(state, stepId, ctx(), deployRan)) continue

      if (stepId === 'compile') {
        setRunning('compile')
        await host.compile(file)
        if (store.get(file).steps.compile?.status === 'failed') return { kind: 'compile-failed' }
        continue
      }

      const compiled = store.get(file).steps.compile
      const compilation = host.getCompilation(file)
      const hash = compiled?.contentHash
      setRunning(stepId)
      let stepResult: StepResult | 'declined'
      try {
        switch (stepId) {
        case 'analysis': stepResult = await runAnalysis(host, file, compilation); break
        case 'slither': stepResult = await runSlither(host, file); break
        case 'ai': stepResult = await runAiReview(host, file); break
        case 'flatten': stepResult = await runFlatten(host, file, compilation); break
        case 'deploy': stepResult = await runDeploy(host, file, target.contractName, target.args, env, deployKey(), state.currentHash); break
        case 'verify': stepResult = await runVerify(host, file, store.get(file), env); break
        }
      } catch (e) {
        stepResult = result('failed', { note: errorMessage(e) })
      }

      if (stepResult === 'declined') {
        store.setStep(file, 'deploy', state.steps.deploy || result('not-run'))
        return { kind: 'deploy-declined' }
      }
      if (stepId !== 'deploy' && stepId !== 'verify') {
        stepResult = { ...stepResult, contentHash: hash, settingsKey: compiled?.settingsKey }
      }
      store.setStep(file, stepId, stepResult)
      if (stepId === 'deploy') {
        if (stepResult.status === 'failed') return { kind: 'deploy-failed' }
        deployRan = true
      }
    }
    return { kind: 'done' }
  } finally {
    opts.onStep && opts.onStep(null)
  }
}
