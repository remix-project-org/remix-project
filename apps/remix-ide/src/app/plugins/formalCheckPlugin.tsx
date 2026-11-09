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
  type FormalCheckState,
  type FormalCheckTemplate,
  type CompilationRunner,
  type CompileRequest,
  type SolverResult,
  type ModelCheckerSettings,
  type CheckResult,
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
  description: 'Check Solidity properties using SMTChecker (BMC). No LLM required.',
  methods: ['checkProperty'],
  events: [],
  icon: FORMAL_CHECK_ICON,
  location: 'sidePanel',
  version: packageJson.version,
  maintainedBy: 'Remix',
}

// ----- CompilationRunner implementation ---------------------------------

/**
 * Browser-side CompilationRunner.
 * Creates a fresh Compiler instance per check so it never contends with
 * the user's active compilation workflow and can be cancelled independently.
 */
class BrowserCompilationRunner implements CompilationRunner {
  private compiler: Compiler | null = null
  private soljsonUrl: string

  constructor(soljsonUrl: string) {
    this.soljsonUrl = soljsonUrl
  }

  compile(req: CompileRequest): Promise<SolverResult> {
    return new Promise((resolve, reject) => {
      const compiler = new Compiler()
      this.compiler = compiler

      const { sources, filename, modelCheckerSettings } = req

      // Build the standard JSON input, then inject modelChecker settings.
      // We use useFileConfiguration so the full JSON is passed verbatim to solc.
      const outputSelection = {
        '*': {
          '': ['ast'],
          '*': ['abi'],
        },
      }
      const configObj = {
        language: 'Solidity',
        settings: {
          outputSelection,
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

      // Load soljson, then compile
      compiler.event.register('compilerLoaded', () => {
        compiler.compile(
          Object.fromEntries(
            Object.entries(sources).map(([name, content]) => [
              name,
              { content },
            ]),
          ) as any,
          filename,
        )
      })

      compiler.event.register('compilationFinished', (success: boolean, data: any) => {
        this.compiler = null
        resolve({
          success,
          errors: data?.errors ?? [],
        })
      })

      compiler.event.register('loadingCompiler', (_url: string, _usingWorker: boolean) => {
        // Loading — no action needed
      })

      // Load the soljson (triggers compilerLoaded when done)
      compiler.loadVersion(true, this.soljsonUrl)
    })
  }

  cancel(): void {
    if (this.compiler) {
      // Terminate the underlying worker by loading a no-op version.
      // The Compiler class doesn't expose a direct cancel API; loading a new
      // version terminates the current worker (see compiler.ts loadVersion).
      // We resolve the promise via the compilationFinished event above.
      this.compiler = null
    }
  }
}

// ----- Plugin class -----------------------------------------------------

const INITIAL_STATE: FormalCheckState = {
  status: 'idle',
  currentFile: '',
  proposal: null,
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
    // Track the current file
    this.on('fileManager', 'currentFileChanged', async (file: string) => {
      if (file.endsWith('.sol')) {
        this.updateState({ currentFile: file, result: null, errorMessage: null, status: 'idle' })
      }
    })

    // Keep the soljson URL up to date and cache the last AST
    this.on(
      'solidity',
      'compilationFinished',
      (
        _file: string,
        _source: any,
        _languageVersion: string,
        data: any,
        _input: string,
        version: string,
      ) => {
        this.lastSoljsonUrl = this.versionToUrl(version)
        if (data?.sources) {
          const primary = Object.keys(data.sources)[0]
          this.lastAst = data.sources?.[primary]?.ast ?? null
        }
      },
    )

    // Load current file on activation
    try {
      const file = await this.call('fileManager', 'getCurrentFile')
      if (file?.endsWith('.sol')) {
        this.updateState({ currentFile: file })
      }
    } catch {
      // No file open yet — that's fine
    }
  }

  onDeactivation() {
    this.off('fileManager', 'currentFileChanged')
    this.off('solidity', 'compilationFinished')
  }

  // --- Public API (called by UI) ----------------------------------------

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
      this.updateState({
        status: 'error',
        errorMessage:
          'Compile your contract first so the plugin knows which solc version to use.',
      })
      return
    }

    this.updateState({
      status: 'running',
      result: null,
      errorMessage: null,
      userConfirmed: false,
      proposal: templateToProposal(template),
    })

    try {
      const filename = this.state.currentFile
      const original = await this.call('fileManager', 'readFile', filename)

      // Collect all sources in case the file has imports
      const allSources: Record<string, string> = { [filename]: original }

      // We need the AST to do source-range–based instrumentation.
      // If we don't have it yet (no prior compilation), compile now to get it.
      let ast = this.lastAst
      if (!ast) {
        ast = await this.fetchAst(filename, allSources)
        if (!ast) {
          this.updateState({
            status: 'error',
            errorMessage:
              'Could not get the AST for this file. Compile the contract in the Solidity tab first.',
          })
          return
        }
      }

      const proposal = templateToProposal(template)
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
        // Skip vacuity check in Phase 1 to keep the UX fast.
        // Phase 2 will re-enable it once LLM proposals are in play.
        skipVacuity: true,
      })

      this.currentRunner = null
      this.updateState({ status: 'done', result: checkResult })

      // Highlight violations in the editor
      await this.highlightResult(checkResult, filename)
    } catch (err: any) {
      this.currentRunner = null
      this.updateState({
        status: 'error',
        errorMessage: err?.message ?? String(err),
      })
    }
  }

  cancelCheck(): void {
    this.currentRunner?.cancel()
    this.currentRunner = null
    this.updateState({ status: 'idle', errorMessage: 'Cancelled.' })
  }

  confirmMatch(confirmed: boolean): void {
    this.updateState({ userConfirmed: confirmed })
  }

  setCurrentFile(path: string): void {
    this.updateState({ currentFile: path })
  }

  // --- Private helpers --------------------------------------------------

  private updateState(patch: Partial<FormalCheckState>): void {
    this.state = { ...this.state, ...patch }
    this.renderComponent()
  }

  private async fetchAst(filename: string, sources: Record<string, string>): Promise<unknown> {
    // Trigger a lightweight compilation to get the AST
    return new Promise<unknown>((resolve) => {
      const compiler = new Compiler()
      compiler.set('useFileConfiguration', false)
      compiler.event.register('compilerLoaded', () => {
        compiler.compile(
          Object.fromEntries(
            Object.entries(sources).map(([n, c]) => [n, { content: c }]),
          ) as any,
          filename,
        )
      })
      compiler.event.register('compilationFinished', (_success: boolean, data: any) => {
        const ast = data?.sources?.[filename]?.ast ?? null
        resolve(ast)
      })
      compiler.loadVersion(true, this.lastSoljsonUrl)
    })
  }

  private async highlightResult(result: CheckResult, filename: string): Promise<void> {
    try {
      await this.call('editor', 'discardHighlight')
      await this.call('editor', 'clearAnnotations')

      if (result.outcome === 'COUNTEREXAMPLE' && result.sourceLocation) {
        const { start, end } = result.sourceLocation
        await this.call('editor', 'highlight', { start: { line: 0, column: start }, end: { line: 0, column: end } }, filename, '#ff4444', { focus: false })
        await this.call('editor', 'addAnnotation', {
          row: result.sourceLocation.line ?? 0,
          column: result.sourceLocation.column ?? 0,
          text: 'Formal Check: violation found here',
          type: 'error',
        })
      }
    } catch {
      // Editor API calls are best-effort — never fail the check for this
    }
  }

  private versionToUrl(version: string): string {
    if (!version || version === 'builtin') {
      // Fall back to builtin if the main tab used it
      return 'assets/js/soljson.js'
    }
    // version may be like "0.8.26+commit.8a97fa7a" or already "soljson-v…"
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
          runCheck: (id: string) => this.checkProperty(id),
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
