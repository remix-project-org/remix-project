import React from 'react'
import { ViewPlugin } from '@remixproject/engine-web'
import isElectron from 'is-electron'
import { PluginViewWrapper } from '@remix-ui/helper'
import {
  PreDeployChecksUI, PreDeployChecksViewState, CheckStore, CheckHost, Compilation, CompilerSummary, FileCheckState,
  Finding, IgnoreReason, Range, CheckStepId, StepToggles, DEFAULT_TOGGLES, collectFindings, contentHash, compilerMessages, compilerSettingsKey,
  withIssueKeys, withoutDependencies, runPipeline, blockingFindings, buildReport, reportFileName, summarize, ChecksSummary
} from '@remix-ui/pre-deploy-checks'
import * as packageJson from '../../../../../package.json'

const profile = {
  name: 'preDeployChecks',
  displayName: 'Pre-deploy Checks',
  description: 'Compile, analyze and flatten the current Solidity file in one run before deploying it.',
  methods: ['open', 'run', 'getState', 'getSummary'],
  events: ['stateChanged', 'summaryChanged'],
  icon: 'assets/img/preDeployChecks.svg',
  location: 'sidePanel',
  documentation: '',
  version: packageJson.version,
  maintainedBy: 'Remix'
}

/** Payload of udappDeploy's contractDeployed event. */
interface Deployment {
  filePath: string
  contractName: string
  address: string
  txHash?: string
  chainId?: string
  network?: string
  verify?: boolean
}

const TOGGLES_KEY = 'preDeployChecks:toggles'
const COMPILE_TIMEOUT = 120000

function loadToggles (): StepToggles {
  try {
    const saved = JSON.parse(window.localStorage.getItem(TOGGLES_KEY) || '{}')
    return { ...DEFAULT_TOGGLES, ...saved, compile: true }
  } catch (e) {
    return { ...DEFAULT_TOGGLES }
  }
}

export class PreDeployChecksPlugin extends ViewPlugin implements CheckHost {
  dispatch: React.Dispatch<PreDeployChecksViewState> | null = null
  store = new CheckStore()
  isDesktop = isElectron()
  private compilations = new Map<string, Compilation>()
  private toggles: StepToggles = loadToggles()
  private currentFile: string | null = null
  private pendingCompile: { file: string, done: () => void } | null = null
  private running: { file: string, cancelled: boolean } | null = null
  private currentStep: CheckStepId | null = null
  private compiler: CompilerSummary | null = null
  private themeQuality: 'dark' | 'light' = 'dark'
  private highlighted = false

  private summaries = new Map<string, string>()

  constructor () {
    super(profile)
    this.store.onChange((file, state) => {
      this.emit('stateChanged', file, state)
      this.publishSummary(file)
      this.renderComponent()
    })
  }

  async onActivation () {
    this.on('solidity', 'compilationFinished', (file: string, source, languageVersion: string, data, input: string, version: string) => {
      if (!languageVersion || languageVersion.indexOf('soljson') !== 0) return
      this.onCompilationFinished({ file, source, data, input, version })
    })
    this.on('solidity', 'compilationFailed', (file: string, source, languageVersion: string, data) => {
      if (file) this.onCompilationFailed(file, source, data)
    })
    this.on('fileManager', 'currentFileChanged', (file: string) => this.setCurrentFile(file))
    this.on('fileManager', 'noFileSelected', () => this.setCurrentFile(null))
    this.on('fileManager', 'fileSaved', (file: string) => this.refreshHash(file))
    this.on('fileManager', 'fileRenamed', (oldName: string, newName: string) => this.store.rename(oldName, newName))
    this.on('fileManager', 'fileRemoved', (file: string) => this.store.remove(file))
    this.on('editor', 'contentChanged', (file: string, content: string) => {
      if (file && file.endsWith('.sol') && typeof content === 'string') this.store.setCurrentHash(file, contentHash(content))
    })
    this.on('udappDeploy', 'contractDeployed', (deployment: Deployment) => this.onDeployed(deployment))
    this.on('theme', 'themeChanged', (theme: { quality?: string }) => this.setThemeQuality(theme?.quality))
    this.call('theme', 'currentTheme').then((theme) => this.setThemeQuality(theme?.quality)).catch(() => { /* theme plugin not ready */ })

    try {
      this.setCurrentFile(await this.call('fileManager', 'file'))
    } catch (e) {
      this.setCurrentFile(null)
    }
  }

  onDeactivation () {
    this.off('solidity', 'compilationFinished')
    this.off('solidity', 'compilationFailed')
    this.off('fileManager', 'currentFileChanged')
    this.off('fileManager', 'noFileSelected')
    this.off('fileManager', 'fileSaved')
    this.off('fileManager', 'fileRenamed')
    this.off('fileManager', 'fileRemoved')
    this.off('editor', 'contentChanged')
    this.off('theme', 'themeChanged')
    this.off('udappDeploy', 'contractDeployed')
  }

  // ---------------------------------------------------------------- public API

  async open (file?: string) {
    await this.call('menuicons', 'select', 'preDeployChecks')
    if (file) await this.call('fileManager', 'open', file)
  }

  async run (file?: string, opts: { force?: boolean } = {}): Promise<FileCheckState> {
    const target = file || this.currentFile
    if (!target || !target.endsWith('.sol')) throw new Error('Open a Solidity file to run pre-deploy checks')
    if (file && file !== this.currentFile) await this.call('fileManager', 'open', file)
    await this.startRun(target, { force: opts.force })
    return this.store.get(target)
  }

  getState (file: string): FileCheckState {
    return this.store.get(file)
  }

  getSummary (file: string): ChecksSummary | null {
    if (!file || !file.endsWith('.sol')) return null
    return summarize({
      state: this.store.get(file),
      findings: collectFindings(this.store.get(file)),
      toggles: this.toggles,
      runningStep: this.running?.file === file ? this.currentStep || 'compile' : null
    })
  }

  /** Emits summaryChanged when what Deploy & Run shows for the file changes. */
  private publishSummary (file: string) {
    const summary = this.getSummary(file)
    if (!summary) return
    const key = JSON.stringify(summary)
    if (this.summaries.get(file) === key) return
    this.summaries.set(file, key)
    this.emit('summaryChanged', file, summary)
  }

  // ---------------------------------------------------------------- CheckHost

  compile (file: string): Promise<void> {
    return new Promise((resolve) => {
      const finish = () => {
        clearTimeout(timer)
        if (this.pendingCompile?.file === file) this.pendingCompile = null
        resolve()
      }
      const timer = setTimeout(() => {
        this.store.setStep(file, 'compile', { status: 'failed', at: Date.now(), origin: 'panel', note: 'Compilation did not finish. Check the Solidity compiler panel.' })
        finish()
      }, COMPILE_TIMEOUT)
      this.pendingCompile = { file, done: finish }
      this.call('solidity', 'compile', file).catch((e) => {
        this.store.setStep(file, 'compile', { status: 'failed', at: Date.now(), origin: 'panel', note: e?.message || String(e) })
        finish()
      })
    })
  }

  getCompilation (file: string) {
    return this.compilations.get(file)
  }

  // ---------------------------------------------------------------- events

  private async onCompilationFinished (compilation: Compilation) {
    const { file, source, data } = compilation
    this.compilations.set(file, compilation)
    const origin = this.pendingCompile?.file === file ? 'panel' : 'manual'
    const content = source?.sources?.[file]?.content
    const { warnings } = compilerMessages(data?.errors, source?.sources)
    const { own } = withoutDependencies(warnings)
    let settingsKey = ''
    try {
      const state = await this.call('solidity', 'getCompilerState')
      settingsKey = compilerSettingsKey(state)
      this.compiler = { version: state.currentVersion, optimize: state.optimize, runs: state.runs, evmVersion: state.evmVersion }
    } catch (e) { /* compiler state unavailable */ }
    if (!this.store.get(file).currentHash && content !== undefined) this.store.setCurrentHash(file, contentHash(content))
    this.store.setStep(file, 'compile', {
      status: own.length ? 'findings' : 'passed',
      at: Date.now(),
      origin,
      contentHash: content !== undefined ? contentHash(content) : undefined,
      settingsKey,
      findings: withIssueKeys(own, source?.sources)
    })
    if (origin === 'panel') this.pendingCompile.done()
  }

  private onCompilationFailed (file: string, source, data) {
    const origin = this.pendingCompile?.file === file ? 'panel' : 'manual'
    const content = source?.sources?.[file]?.content
    const { errors } = compilerMessages(data?.errors, source?.sources)
    if (!errors.length && data?.error) {
      errors.push({ source: 'compiler', severity: 'high', title: 'Error', message: data.error.formattedMessage || data.error.message || String(data.error) })
    }
    this.store.setStep(file, 'compile', {
      status: 'failed',
      at: Date.now(),
      origin,
      contentHash: content !== undefined ? contentHash(content) : undefined,
      note: `${errors.length} error${errors.length === 1 ? '' : 's'}`,
      data: { errors: withIssueKeys(errors, source?.sources) }
    })
    if (origin === 'panel') this.pendingCompile.done()
  }

  private async setCurrentFile (file: string | null) {
    this.currentFile = file && file.endsWith('.sol') ? file : null
    if (this.currentFile) await this.refreshHash(this.currentFile)
    this.refreshCompiler()
  }

  async syncContent (file: string) {
    let content: string
    try {
      content = await this.call('editor', 'getText', file)
    } catch (e) { /* not open in the editor */ }
    if (typeof content !== 'string') {
      try {
        content = await this.call('fileManager', 'readFile', file)
      } catch (e) { /* not readable */ }
    }
    if (typeof content === 'string') this.store.setCurrentHash(file, contentHash(content))
  }

  private async refreshHash (file: string) {
    if (!file || !file.endsWith('.sol')) return
    try {
      const content = await this.call('fileManager', 'readFile', file)
      if (typeof content === 'string') this.store.setCurrentHash(file, contentHash(content))
    } catch (e) { /* file not readable (yet) */ }
  }

  private refreshTimer: any = null
  private refreshCompiler () {
    clearTimeout(this.refreshTimer)
    this.refreshTimer = setTimeout(async () => {
      try {
        const state = await this.call('solidity', 'getCompilerState')
        this.compiler = { version: state.currentVersion, optimize: state.optimize, runs: state.runs, evmVersion: state.evmVersion }
      } catch (e) { /* compiler not ready */ }
      this.renderComponent()
    }, 200)
  }

  private setThemeQuality (quality?: string) {
    this.themeQuality = quality === 'light' ? 'light' : 'dark'
    this.renderComponent()
  }

  /** The contract the report is named after: the deployed one, else the one named like the file, else the last one. */
  private contractNameOf (file: string): string | undefined {
    const deployed = this.store.get(file).steps.deploy?.data?.contractName
    if (deployed) return deployed
    const compiled = this.compilations.get(file)?.data?.contracts?.[file] || {}
    const names = Object.keys(compiled).filter((name) => compiled[name]?.evm?.bytecode?.object?.length > 0)
    const baseName = file.substring(file.lastIndexOf('/') + 1).replace(/\.sol$/, '')
    return names.find((name) => name === baseName) || names[names.length - 1]
  }

  setToggle (stepId: CheckStepId, enabled: boolean) {
    if (stepId === 'compile') return
    this.toggles = { ...this.toggles, [stepId]: enabled }
    try {
      window.localStorage.setItem(TOGGLES_KEY, JSON.stringify(this.toggles))
    } catch (e) { /* storage unavailable */ }
    if (this.currentFile) this.publishSummary(this.currentFile)
    this.renderComponent()
  }

  // ---------------------------------------------------------------- running

  async startRun (file: string, opts: { force?: boolean } = {}) {
    if (this.running) return
    this.running = { file, cancelled: false }
    this.publishSummary(file)
    this.renderComponent()
    try {
      await runPipeline(this, {
        file,
        toggles: this.toggles,
        force: opts.force,
        isCancelled: () => this.running?.cancelled,
        onStep: (step) => {
          this.currentStep = step
          this.renderComponent()
        }
      })
    } catch (e) {
      console.error(e)
      this.call('notification', 'toast', `Pre-deploy checks stopped: ${e?.message || String(e)}`)
    } finally {
      this.running = null
      this.currentStep = null
    }
    this.publishSummary(file)
    this.renderComponent()
  }

  cancelRun () {
    if (this.running) {
      this.running.cancelled = true
      this.renderComponent()
    }
  }

  async goToDeploy () {
    const file = this.currentFile
    await this.call('menuicons', 'select', 'udapp')
    if (!file) return
    try {
      await this.call('udappDeploy', 'selectContract', file, this.contractNameOf(file))
    } catch (e) {
      console.warn('Pre-deploy checks: could not select the contract in Deploy & Run', e)
    }
  }

  /** A deployment made in Deploy & Run: recorded for its file, from the version last compiled (FR-21). */
  private onDeployed (deployment: Deployment) {
    const { filePath, contractName, address, txHash, chainId, network, verify } = deployment || {} as Deployment
    if (!filePath || !filePath.endsWith('.sol') || !address) return
    const state = this.store.get(filePath)
    const steps = { ...state.steps }
    const at = Date.now()
    steps.deploy = {
      status: 'passed',
      at,
      origin: 'manual',
      contentHash: state.steps.compile?.contentHash,
      // the report records a deployment made while high-severity issues were open
      data: { contractName, address, txHash, chainId, network, openHigh: blockingFindings(collectFindings(state)).length }
    }
    // Deploy & Run verifies on its own when its Verify option is on; results arrive in Contract Verification
    if (verify && chainId) steps.verify = { status: 'submitted', at, origin: 'manual', data: { address, chainId } }
    else delete steps.verify
    this.store.patch(filePath, { steps })
  }

  // ---------------------------------------------------------------- findings and report

  async openFinding (finding: { file?: string, range?: Range }) {
    if (!finding.file) return
    try {
      if (this.highlighted) await this.call('editor', 'discardHighlight')
      if (finding.range) {
        await this.call('editor', 'highlight', finding.range, finding.file, '', { focus: true })
        this.highlighted = true
      } else {
        await this.call('fileManager', 'open', finding.file)
      }
    } catch (e) {
      console.warn('Pre-deploy checks: could not open the finding', e)
    }
  }

  ignoreFinding (finding: Finding, reason: IgnoreReason) {
    if (this.currentFile) this.store.ignore(this.currentFile, finding.keys, reason)
  }

  restoreFinding (finding: Finding) {
    if (this.currentFile) this.store.restore(this.currentFile, finding.keys)
  }

  async openFile (file: string) {
    await this.call('fileManager', 'open', file)
  }

  async openPlugin (name: string) {
    await this.call('menuicons', 'select', name)
  }

  async saveReport () {
    const file = this.currentFile
    if (!file) return
    const contractName = this.contractNameOf(file)
    const md = buildReport(this.store.get(file), { date: new Date(), contractName, compiler: this.compiler || undefined })
    const path = reportFileName(file, contractName)
    await this.call('fileManager', 'writeFile', path, md)
    await this.call('fileManager', 'open', path)
  }

  // ---------------------------------------------------------------- view

  setDispatch (dispatch: React.Dispatch<PreDeployChecksViewState>) {
    this.dispatch = dispatch
    this.renderComponent()
  }

  render () {
    return <div id="preDeployChecks" className="h-100"><PluginViewWrapper plugin={this} /></div>
  }

  updateComponent (view: PreDeployChecksViewState) {
    return <PreDeployChecksUI plugin={this} view={view} />
  }

  renderComponent () {
    if (!this.dispatch) return
    const file = this.currentFile
    const state = file ? this.store.get(file) : null
    this.dispatch({
      file,
      state,
      findings: state ? collectFindings(state) : [],
      toggles: this.toggles,
      running: !!this.running && this.running.file === file,
      cancelling: !!this.running?.cancelled,
      currentStep: this.running?.file === file ? this.currentStep : null,
      compiler: this.compiler,
      reportPath: file ? reportFileName(file, this.contractNameOf(file)) : null,
      themeQuality: this.themeQuality
    })
  }
}
