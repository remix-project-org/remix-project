'use strict'
import React from 'react'
import { ViewPlugin } from '@remixproject/engine-web'
import { PluginViewWrapper } from '@remix-ui/helper'
import { RemixUiFormalCheck } from '@remix-ui/formal-check'
import {
  TEMPLATES,
  templateToProposal,
  instrument,
  runFormalCheck,
  RemixAIAdapter,
  parseAndValidateProposal,
  checkAssertionSafety,
  type FormalCheckState,
  type FormalCheckTemplate,
  type CompilationRunner,
  type CompileRequest,
  type SolverResult,
  type ModelCheckerSettings,
  type CheckResult,
  type ProposalSchema,
} from '@remix-project/remix-formal-check'
import { Compiler } from '@remix-project/remix-solidity'
import * as packageJson from '../../../../../package.json'

// ----- Profile ----------------------------------------------------------

const FORMAL_CHECK_ICON =
  'data:image/svg+xml;base64,' +
  btoa(
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#a2a3bd" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">` +
      `<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>` +
      `</svg>`,
  )

const profile = {
  name: 'formalCheck',
  displayName: 'Formal Check',
  description: 'Check Solidity properties using SMTChecker (BMC). Template and LLM modes.',
  methods: ['checkProperty', 'proposeFromLLM'],
  events: [],
  icon: FORMAL_CHECK_ICON,
  location: 'sidePanel',
  version: packageJson.version,
  maintainedBy: 'Remix',
}

// ----- CompilationRunner ------------------------------------------------

class BrowserCompilationRunner implements CompilationRunner {
  constructor(private soljsonUrl: string) {}

  compile(req: CompileRequest): Promise<SolverResult> {
    return new Promise((resolve) => {
      const compiler = new Compiler()
      const { sources, filename, modelCheckerSettings } = req
      const configObj = {
        language: 'Solidity',
        settings: {
          outputSelection: { '*': { '': ['ast'], '*': ['abi'] } },
          modelChecker: {
            engine: modelCheckerSettings.engine,
            targets: modelCheckerSettings.targets,
            timeout: modelCheckerSettings.timeoutMs,
            showUnproved: modelCheckerSettings.showUnproved ?? true,
            ...(modelCheckerSettings.bmcLoopIterations !== undefined
              ? { bmcLoopIterations: modelCheckerSettings.bmcLoopIterations }
              : {}),
          },
        },
      }

      compiler.set('useFileConfiguration', true)
      compiler.set('configFileContent', configObj)

      compiler.event.register('compilerLoaded', () => {
        compiler.compile(
          Object.fromEntries(Object.entries(sources).map(([n, c]) => [n, { content: c }])) as any,
          filename,
        )
      })

      compiler.event.register('compilationFinished', (success: boolean, data: any) => {
        resolve({ success, errors: data?.errors ?? [] })
      })

      compiler.loadVersion(true, this.soljsonUrl)
    })
  }

  cancel(): void {
    // The solc web worker cannot be interrupted mid-compile; in-flight resolve() fires and is ignored.
  }
}

// ----- Plugin -----------------------------------------------------------

const INITIAL_STATE: FormalCheckState = {
  status: 'idle',
  mode: 'template',
  currentFile: '',
  llmIntent: '',
  proposal: null,
  rawProposalJson: null,
  result: null,
  errorMessage: null,
  userConfirmed: false,
  consentGiven: false,
}

const DEFAULT_SETTINGS: ModelCheckerSettings = {
  engine: 'bmc',
  targets: ['assert', 'overflow'],
  timeoutMs: 30000,
  bmcLoopIterations: 2,
  showUnproved: true,
}

export class FormalCheckPlugin extends ViewPlugin {
  dispatch: React.Dispatch<any> = () => {}
  state: FormalCheckState = { ...INITIAL_STATE }
  readonly templates: FormalCheckTemplate[] = TEMPLATES

  private currentRunner: BrowserCompilationRunner | null = null
  private lastSoljsonUrl = ''
  private lastAst: unknown = null

  constructor() {
    super(profile)
  }

  async onActivation() {
    this.on('fileManager', 'currentFileChanged', async (file: string) => {
      if (file.endsWith('.sol')) {
        this.updateState({ currentFile: file, result: null, errorMessage: null, status: 'idle' })
      }
    })

    this.on(
      'solidity',
      'compilationFinished',
      (_file: string, _source: any, _langVer: string, data: any, _input: string, version: string) => {
        this.lastSoljsonUrl = this.versionToUrl(version)
        if (data?.sources) {
          const primary = Object.keys(data.sources)[0]
          this.lastAst = data.sources?.[primary]?.ast ?? null
        }
      },
    )

    try {
      const file = await this.call('fileManager', 'getCurrentFile')
      if (file?.endsWith('.sol')) this.updateState({ currentFile: file })
    } catch { /* no file open yet */ }
  }

  onDeactivation() {
    this.off('fileManager', 'currentFileChanged')
    this.off('solidity', 'compilationFinished')
  }

  // --- Mode switching ---------------------------------------------------

  setMode(mode: 'template' | 'llm'): void {
    this.updateState({ mode, status: 'idle', result: null, errorMessage: null, proposal: null, rawProposalJson: null })
  }

  setLLMIntent(intent: string): void {
    this.updateState({ llmIntent: intent })
  }

  // --- Template path (Phase 1, vacuity skipped for speed) ---------------

  async checkProperty(templateId: string): Promise<void> {
    const template = this.templates.find((t) => t.id === templateId)
    if (!template) {
      this.updateState({ status: 'error', errorMessage: `Unknown template: ${templateId}` })
      return
    }
    if (!this.state.currentFile) {
      this.updateState({ status: 'error', errorMessage: 'No Solidity file is open.' })
      return
    }
    if (!this.lastSoljsonUrl) {
      this.updateState({ status: 'error', errorMessage: 'Compile your contract first.' })
      return
    }

    const proposal = templateToProposal(template)
    this.updateState({ status: 'running', result: null, errorMessage: null, userConfirmed: false, proposal })
    await this._runSolverPipeline(proposal, { skipVacuity: true })
  }

  // --- LLM path (Phase 2) -----------------------------------------------

  /**
   * Step 1: User clicked "Propose assertion".
   * If consent not yet given, show the banner. Otherwise go straight to LLM.
   */
  requestLLMProposal(intent: string): void {
    if (!intent.trim()) {
      this.updateState({ status: 'error', errorMessage: 'Please describe what property you want to check.' })
      return
    }
    if (!this.state.currentFile) {
      this.updateState({ status: 'error', errorMessage: 'No Solidity file is open.' })
      return
    }
    this.updateState({ llmIntent: intent, result: null, errorMessage: null, proposal: null, rawProposalJson: null })

    if (this.state.consentGiven) {
      void this._callLLM(intent)
    } else {
      this.updateState({ status: 'pending_consent' })
    }
  }

  /** Step 2a: User accepted the consent banner. */
  grantConsent(): void {
    this.updateState({ consentGiven: true })
    void this._callLLM(this.state.llmIntent)
  }

  /** Step 2b: User declined. */
  denyConsent(): void {
    this.updateState({ status: 'idle', errorMessage: null })
  }

  /**
   * Step 3: User confirmed "this assertion matches what I meant" and
   * clicked "Run formal check".  Runs the solver on the pending proposal.
   */
  async confirmAndRun(): Promise<void> {
    if (!this.state.proposal) {
      this.updateState({ status: 'error', errorMessage: 'No proposal to run.' })
      return
    }
    if (!this.state.userConfirmed) {
      this.updateState({ status: 'error', errorMessage: 'Please confirm the assertion matches your intent before running.' })
      return
    }
    if (!this.lastSoljsonUrl) {
      this.updateState({ status: 'error', errorMessage: 'Compile your contract first.' })
      return
    }
    this.updateState({ status: 'running' })
    // Vacuity check is ON for LLM proposals
    await this._runSolverPipeline(this.state.proposal, { skipVacuity: false })
  }

  cancelCheck(): void {
    this.currentRunner?.cancel()
    this.currentRunner = null
    this.updateState({ status: 'idle', errorMessage: null, proposal: null, rawProposalJson: null })
  }

  confirmMatch(confirmed: boolean): void {
    this.updateState({ userConfirmed: confirmed })
  }

  setCurrentFile(path: string): void {
    this.updateState({ currentFile: path })
  }

  // --- Private: LLM call ------------------------------------------------

  private async _callLLM(intent: string): Promise<void> {
    this.updateState({ status: 'running_llm' })
    try {
      const filename = this.state.currentFile
      const source = await this.call('fileManager', 'readFile', filename)
      const adapter = new RemixAIAdapter(
        (p: string, m: string, ...a: unknown[]) => this.call(p as any, m as any, ...a),
      )
      // Single LLM call; validate + safety-check the returned JSON ourselves
      const rawJson = await adapter.generateProposal(source, intent)
      const proposal = parseAndValidateProposal(rawJson)
      checkAssertionSafety(proposal)
      this.updateState({
        status: 'proposal_ready',
        proposal,
        rawProposalJson: rawJson,
        userConfirmed: false,
      })
    } catch (err: any) {
      this.updateState({ status: 'error', errorMessage: err?.message ?? String(err) })
    }
  }

  // --- Private: Solver pipeline -----------------------------------------

  private async _runSolverPipeline(
    proposal: ProposalSchema,
    opts: { skipVacuity: boolean },
  ): Promise<void> {
    try {
      const filename = this.state.currentFile
      const original = await this.call('fileManager', 'readFile', filename)
      const allSources: Record<string, string> = { [filename]: original }

      let ast = this.lastAst
      if (!ast) {
        ast = await this._fetchAst(filename, allSources)
        if (!ast) {
          this.updateState({ status: 'error', errorMessage: 'Compile the contract first to get the AST.' })
          return
        }
      }

      const instrumented = instrument(original, ast as any, proposal)
      const runner = new BrowserCompilationRunner(this.lastSoljsonUrl)
      this.currentRunner = runner

      const { checkResult } = await runFormalCheck({
        proposal,
        original,
        instrumented,
        ast,
        allSources,
        primaryFilename: filename,
        runner,
        settings: DEFAULT_SETTINGS,
        skipVacuity: opts.skipVacuity,
      })

      this.currentRunner = null
      this.updateState({ status: 'done', result: checkResult })
      await this._highlightResult(checkResult, filename)
    } catch (err: any) {
      this.currentRunner = null
      this.updateState({ status: 'error', errorMessage: err?.message ?? String(err) })
    }
  }

  // --- Private helpers --------------------------------------------------

  private updateState(patch: Partial<FormalCheckState>): void {
    this.state = { ...this.state, ...patch }
    this.renderComponent()
  }

  private async _fetchAst(filename: string, sources: Record<string, string>): Promise<unknown> {
    return new Promise<unknown>((resolve) => {
      const compiler = new Compiler()
      compiler.set('useFileConfiguration', false)
      compiler.event.register('compilerLoaded', () => {
        compiler.compile(
          Object.fromEntries(Object.entries(sources).map(([n, c]) => [n, { content: c }])) as any,
          filename,
        )
      })
      compiler.event.register('compilationFinished', (_success: boolean, data: any) => {
        resolve(data?.sources?.[filename]?.ast ?? null)
      })
      compiler.loadVersion(true, this.lastSoljsonUrl)
    })
  }

  private async _highlightResult(result: CheckResult, filename: string): Promise<void> {
    try {
      await this.call('editor', 'discardHighlight')
      await this.call('editor', 'clearAnnotations')
      if (result.outcome === 'COUNTEREXAMPLE' && result.sourceLocation) {
        const { start, end } = result.sourceLocation
        await this.call(
          'editor',
          'highlight',
          { start: { line: 0, column: start }, end: { line: 0, column: end } },
          filename,
          '#ff4444',
          { focus: false },
        )
        await this.call('editor', 'addAnnotation', {
          row: result.sourceLocation.line ?? 0,
          column: result.sourceLocation.column ?? 0,
          text: 'Formal Check: violation found here',
          type: 'error',
        })
      }
    } catch { /* editor decorations are best-effort */ }
  }

  private versionToUrl(version: string): string {
    if (!version || version === 'builtin') return 'assets/js/soljson.js'
    let v = version.replace('.Emscripten.clang', '')
    if (!v.startsWith('soljson-v')) v = 'soljson-v' + v
    if (!v.endsWith('.js')) v = v + '.js'
    return `https://binaries.soliditylang.org/wasm/${v}`
  }

  // --- ViewPlugin rendering --------------------------------------------

  render() {
    return (
      <div id="formalCheckView">
        <PluginViewWrapper plugin={this} />
      </div>
    )
  }

  setDispatch(dispatch: React.Dispatch<any>) {
    this.dispatch = dispatch
    this.renderComponent()
  }

  renderComponent() {
    this.dispatch &&
      this.dispatch({
        plugin: {
          state: this.state,
          templates: this.templates,
          // Template mode
          runCheck: (id: string) => this.checkProperty(id),
          // LLM mode
          setMode: (m: 'template' | 'llm') => this.setMode(m),
          setLLMIntent: (s: string) => this.setLLMIntent(s),
          requestLLMProposal: (intent: string) => this.requestLLMProposal(intent),
          grantConsent: () => this.grantConsent(),
          denyConsent: () => this.denyConsent(),
          confirmAndRun: () => this.confirmAndRun(),
          // Shared
          cancelCheck: () => this.cancelCheck(),
          confirmMatch: (v: boolean) => this.confirmMatch(v),
          setCurrentFile: (p: string) => this.setCurrentFile(p),
        },
      })
  }

  updateComponent(state: any) {
    return <RemixUiFormalCheck plugin={state.plugin} />
  }
}
