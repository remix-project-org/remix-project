'use strict'

// --- Outcomes -----------------------------------------------------------

export type Outcome = 'PROVEN' | 'COUNTEREXAMPLE' | 'NOT_PROVEN'

export type UnprovenReason =
  | 'solver_unavailable'   // wasm soljson has no Z3
  | 'timeout'
  | 'unsupported_feature'  // solc SMTChecker emitted an unsupported-feature warning
  | 'over_approximation'   // engine could not rule out false positives
  | 'compile_error'        // instrumented source failed to compile
  | 'other'

// --- Proposal (LLM output schema) ---------------------------------------

export interface ProposalSchema {
  english: string           // human-readable intent
  target_function: string   // function name or '__contract__' for append-to-contract
  assertion: string         // Solidity assertion statement(s), no trailing semicolon required
  needs_snapshot: string[]  // state var names whose pre-call values are needed (Phase 2)
}

// --- Templates ----------------------------------------------------------

export interface FormalCheckTemplate {
  id: string
  name: string
  description: string
  targetFunction: string   // function name or '__contract__' to append a new checker fn
  assertionCode: string    // Solidity assertion code to insert / append
  needsSnapshot: string[]
}

// --- Instrumentation ----------------------------------------------------

export interface InstrumentedSource {
  source: string           // in-memory instrumented copy (original never modified)
  insertionOffset: number  // character offset where assertion was inserted
  insertionLength: number  // length of inserted text
  assertionCode: string    // exactly what was inserted
}

// --- Solver interface (implemented by IDE layer, not this lib) ----------

export interface ModelCheckerSettings {
  engine: 'bmc' | 'chc'
  targets: string[]
  timeoutMs: number
  bmcLoopIterations?: number
  showUnproved?: boolean
}

// Input to CompilationRunner.compile()
export interface CompileRequest {
  sources: Record<string, string>  // filename → source content
  filename: string                 // primary file to check
  modelCheckerSettings: ModelCheckerSettings
}

// A single error/warning from the compiler
export interface CompilerDiagnostic {
  type: string           // 'Warning' | 'Error' | 'Info'
  severity: string       // 'warning' | 'error' | 'info'
  component?: string     // 'general' | 'typeChecker' | 'SMTChecker' | ...
  message: string
  formattedMessage: string
  errorCode?: string
  sourceLocation?: {
    file: string
    start: number
    end: number
  }
  secondarySourceLocations?: Array<{
    start: number
    end: number
    file: string
    message: string
  }>
}

// Raw result of running the solver
export interface SolverResult {
  success: boolean
  errors: CompilerDiagnostic[]
}

// What the CompilationRunner must implement (IDE layer provides this)
export interface CompilationRunner {
  compile(req: CompileRequest): Promise<SolverResult>
  cancel(): void
}

// --- Check result (final output of the pipeline) -----------------------

export interface CheckResult {
  outcome: Outcome
  assertion: string
  targetFunction: string
  englishDescription: string
  engineUsed: 'bmc' | 'chc' | 'none'
  bounded: boolean          // true for BMC — not an unbounded proof
  unprovenReason?: UnprovenReason
  counterexampleTrace?: string
  smtCheckerWarnings: string[]
  unsupportedFeatureWarnings: string[]
  sourceLocation?: {
    file: string
    start: number
    end: number
    line?: number
    column?: number
  }
}

// State of the whole pipeline, used by the UI
export interface FormalCheckState {
  /**
   * idle            → nothing happening
   * pending_consent → user clicked "Propose" but hasn't yet consented to
   *                   sending their source to the LLM — show ConsentBanner
   * running_llm     → waiting for LLM response
   * proposal_ready  → LLM returned; waiting for user "matches intent" tick
   * running         → SMTChecker running
   * done            → check complete; result is set
   * error           → something failed; errorMessage is set
   */
  status: 'idle' | 'pending_consent' | 'running_llm' | 'proposal_ready' | 'running' | 'done' | 'error'
  mode: 'template' | 'llm'           // which input mode is active
  currentFile: string
  llmIntent: string                  // user-typed intent (LLM mode)
  proposal: ProposalSchema | null
  rawProposalJson: string | null     // raw LLM output shown for transparency
  result: CheckResult | null
  errorMessage: string | null
  userConfirmed: boolean    // "This matches what I meant" checkbox (shown before PROVEN green)
  consentGiven: boolean     // source-sent-to-LLM consent flag (persists across the session)
}
