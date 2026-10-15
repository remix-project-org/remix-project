import React from 'react'
import { ViewPlugin } from '@remixproject/engine-web'
import isElectron from 'is-electron'
import { PluginViewWrapper } from '@remix-ui/helper'
import {
  PreDeployChecksUI, PreDeployChecksViewState, CheckStore, CheckHost, Compilation, EnvironmentInfo, FileCheckState, Finding, RunOutcome,
  Range, StepId, StepToggles, DEFAULT_TOGGLES, collectFindings, contentHash, compilerMessages, compilerSettingsKey, withoutDependencies,
  runPipeline, DeployTarget, getEnvironment, getConstructorInputs, parseConstructorArgs, buildReport, reportFileName, ContractOption
} from '@remix-ui/pre-deploy-checks'
import * as packageJson from '../../../../../package.json'

const profile = {
  name: 'preDeployChecks',
  displayName: 'Pre-deploy Checks',
  description: 'Compile, analyze, flatten, deploy and verify the current Solidity file in one run.',
  methods: ['open', 'run', 'getState'],
  events: ['stateChanged'],
  icon: 'assets/img/preDeployChecks.svg',
  location: 'sidePanel',
  documentation: '',
  version: packageJson.version,
  maintainedBy: 'Remix'
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

interface FileSelection {
  contractName?: string
  rawArgs: string[]
}

export class PreDeployChecksPlugin extends ViewPlugin implements CheckHost {
  dispatch: React.Dispatch<PreDeployChecksViewState> | null = null
  store = new CheckStore()
  isDesktop = isElectron()
  private compilations = new Map<string, Compilation>()
  private selections = new Map<string, FileSelection>()
  private toggles: StepToggles = loadToggles()
  private currentFile: string | null = null
  private pendingCompile: { file: string, done: () => void } | null = null
  private running: { file: string, cancelled: boolean } | null = null
  private currentStep: StepId | null = null
  private outcomes = new Map<string, RunOutcome>()
  private env: EnvironmentInfo | null = null
  private compiler: { version?: string, optimize?: boolean, runs?: number, evmVersion?: string } | null = null
  private highlighted = false

  constructor () {
    super(profile)
    this.store.onChange((file, state) => {
      this.emit('stateChanged', file, state)
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
    this.on('blockchain', 'contextChanged', () => this.refreshSetup())
    this.on('blockchain', 'networkStatus', () => this.refreshSetup())

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
    this.off('blockchain', 'contextChanged')
    this.off('blockchain', 'networkStatus')
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

  confirmDeploy ({ contractName, env, args, value }: { contractName: string, env: EnvironmentInfo, args: any[], value: string }): Promise<boolean> {
    return new Promise((resolve) => {
      this.call('notification', 'modal', {
        id: 'preDeployChecksConfirmDeploy',
        title: `Deploy ${contractName}?`,
        message: (
          <div data-id="preDeployChecksConfirmDeploy">
            <p>This deploys a contract to <b>{env.network || 'the selected network'}</b>{env.chainId ? ` (chain id ${env.chainId})` : ''}.</p>
            <ul className="ps-3 mb-0">
              <li>Contract: {contractName}</li>
              <li>Account: <span className="text-break">{env.account || 'unknown'}</span></li>
              <li>Value: {value}</li>
              <li>Constructor arguments: {args.length ? <span className="text-break">{JSON.stringify(args)}</span> : 'none'}</li>
            </ul>
          </div>
        ),
        okLabel: 'Deploy',
        cancelLabel: 'Cancel',
        okFn: () => resolve(true),
        cancelFn: () => resolve(false),
        hideFn: () => resolve(false)
      })
    })
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
      findings: own
    })
    this.ensureContractSelection(file)
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
      data: { errors }
    })
    if (origin === 'panel') this.pendingCompile.done()
  }

  private async setCurrentFile (file: string | null) {
    this.currentFile = file && file.endsWith('.sol') ? file : null
    if (this.currentFile) await this.refreshHash(this.currentFile)
    this.refreshSetup()
  }

  private async refreshHash (file: string) {
    if (!file || !file.endsWith('.sol')) return
    try {
      const content = await this.call('fileManager', 'readFile', file)
      if (typeof content === 'string') this.store.setCurrentHash(file, contentHash(content))
    } catch (e) { /* file not readable (yet) */ }
  }

  private refreshTimer: any = null
  private refreshSetup () {
    clearTimeout(this.refreshTimer)
    this.refreshTimer = setTimeout(async () => {
      try {
        this.env = await getEnvironment(this)
      } catch (e) { /* environment not ready */ }
      try {
        const state = await this.call('solidity', 'getCompilerState')
        this.compiler = { version: state.currentVersion, optimize: state.optimize, runs: state.runs, evmVersion: state.evmVersion }
      } catch (e) { /* compiler not ready */ }
      this.renderComponent()
    }, 200)
  }

  // ---------------------------------------------------------------- contracts and arguments

  private contractsOf (file: string): ContractOption[] {
    const compiled = this.compilations.get(file)?.data?.contracts?.[file] || {}
    return Object.keys(compiled)
      .filter((name) => compiled[name]?.evm?.bytecode?.object?.length > 0)
      .map((name) => ({ name, inputs: getConstructorInputs(compiled[name].abi) }))
  }

  private ensureContractSelection (file: string) {
    const contracts = this.contractsOf(file)
    const selection = this.selections.get(file) || { rawArgs: []}
    if (!selection.contractName || !contracts.find((c) => c.name === selection.contractName)) {
      const baseName = file.substring(file.lastIndexOf('/') + 1).replace(/\.sol$/, '')
      const preferred = contracts.find((c) => c.name === baseName) || contracts[contracts.length - 1]
      selection.contractName = preferred?.name
      selection.rawArgs = []
    }
    this.selections.set(file, selection)
  }

  selectContract (name: string) {
    if (!this.currentFile) return
    this.selections.set(this.currentFile, { contractName: name, rawArgs: []})
    this.renderComponent()
  }

  setArg (index: number, value: string) {
    if (!this.currentFile) return
    const selection = this.selections.get(this.currentFile) || { rawArgs: []}
    const rawArgs = [...selection.rawArgs]
    rawArgs[index] = value
    this.selections.set(this.currentFile, { ...selection, rawArgs })
    this.renderComponent()
  }

  setToggle (stepId: StepId, enabled: boolean) {
    if (stepId === 'compile') return
    this.toggles = { ...this.toggles, [stepId]: enabled }
    try {
      window.localStorage.setItem(TOGGLES_KEY, JSON.stringify(this.toggles))
    } catch (e) { /* storage unavailable */ }
    this.renderComponent()
  }

  // ---------------------------------------------------------------- running

  async startRun (file: string, opts: { force?: boolean, overrideGate?: boolean } = {}) {
    if (this.running) return
    this.running = { file, cancelled: false }
    this.outcomes.delete(file)
    this.renderComponent()
    let outcome: RunOutcome
    try {
      outcome = await runPipeline(this, {
        file,
        toggles: this.toggles,
        force: opts.force,
        overrideGate: opts.overrideGate,
        getDeployTarget: () => this.deployTarget(file),
        isCancelled: () => this.running?.cancelled,
        onStep: (step) => {
          this.currentStep = step
          this.renderComponent()
        }
      })
    } catch (e) {
      console.error(e)
      outcome = { kind: 'error', message: e?.message || String(e) }
    } finally {
      this.running = null
      this.currentStep = null
    }
    this.outcomes.set(file, outcome)
    this.renderComponent()
  }

  /** The contract and constructor arguments to deploy, known once the file is compiled. */
  private deployTarget (file: string): DeployTarget {
    this.ensureContractSelection(file)
    const selection = this.selections.get(file)
    const contract = this.contractsOf(file).find((c) => c.name === selection?.contractName)
    if (!contract) return { error: 'no-contract' }
    const parsed = parseConstructorArgs(contract.inputs, selection.rawArgs)
    if (Object.keys(parsed.errors).length) return { error: 'invalid-args' }
    return { contractName: contract.name, args: parsed.values }
  }

  cancelRun () {
    if (this.running) {
      this.running.cancelled = true
      this.renderComponent()
    }
  }

  deployAnyway () {
    if (this.currentFile) this.startRun(this.currentFile, { overrideGate: true })
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

  async openFile (file: string) {
    await this.call('fileManager', 'open', file)
  }

  async openPlugin (name: string) {
    await this.call('menuicons', 'select', name)
  }

  async saveReport () {
    const file = this.currentFile
    if (!file) return
    const selection = this.selections.get(file)
    const contractName = this.store.get(file).steps.deploy?.data?.contractName || selection?.contractName
    const md = buildReport(this.store.get(file), { date: new Date(), contractName, compiler: this.compiler || undefined, environment: this.env || undefined })
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
    const selection = file ? this.selections.get(file) : null
    const contracts = file ? this.contractsOf(file) : []
    const contract = contracts.find((c) => c.name === selection?.contractName)
    this.dispatch({
      file,
      state,
      findings: state ? collectFindings(state) : [],
      toggles: this.toggles,
      running: !!this.running && this.running.file === file,
      cancelling: !!this.running?.cancelled,
      currentStep: this.running?.file === file ? this.currentStep : null,
      outcome: file ? this.outcomes.get(file) || null : null,
      env: this.env,
      compiler: this.compiler,
      contracts,
      contractName: selection?.contractName,
      rawArgs: selection?.rawArgs || [],
      argErrors: contract ? parseConstructorArgs(contract.inputs, selection?.rawArgs || []).errors : {},
      isDesktop: this.isDesktop
    })
  }
}
