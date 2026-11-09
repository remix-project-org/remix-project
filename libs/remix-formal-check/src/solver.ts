'use strict'

/**
 * solver.ts — orchestrates a formal check run.
 *
 * This module is IDE-independent: it accepts a CompilationRunner interface
 * provided by the plugin layer (which wraps the actual solc Compiler). That
 * keeps this library testable with a mock runner and free of browser/Worker deps.
 *
 * Pipeline per check:
 *   1. Run guardrails on the proposal + instrumented source.
 *   2. Run vacuity check (assert(false) at same insertion point).
 *      If the solver proves assert(false) unreachable → insertion point is
 *      dead code → result is NOT_PROVEN('over_approximation'), never PROVEN.
 *   3. Run the real check.
 *   4. Classify the result.
 */

import type {
  ProposalSchema,
  InstrumentedSource,
  CompilationRunner,
  ModelCheckerSettings,
  SolverResult,
  CheckResult,
} from './types'
import { runAllGuardrails, GuardrailError } from './guardrails'
import { instrumentVacuity } from './instrument'
import { classify } from './classify'

export interface FormalCheckRunOptions {
  proposal: ProposalSchema
  original: string                      // unchanged user source
  instrumented: InstrumentedSource      // assertion already inserted
  ast: unknown                          // AST from prior compilation (for vacuity re-instrument)
  allSources: Record<string, string>    // filename → content (for imports)
  primaryFilename: string
  runner: CompilationRunner
  settings: ModelCheckerSettings
  skipVacuity?: boolean                 // set true in tests to skip the second compile
}

export interface FormalCheckRunResult {
  checkResult: CheckResult
  guardrailPassed: boolean
  vacuityPassed: boolean
}

export async function runFormalCheck(
  opts: FormalCheckRunOptions,
): Promise<FormalCheckRunResult> {
  const {
    proposal,
    original,
    instrumented,
    ast,
    allSources,
    primaryFilename,
    runner,
    settings,
    skipVacuity = false,
  } = opts

  // Step 1 — Guardrails
  runAllGuardrails(proposal, original, instrumented)

  // Step 2 — Vacuity check
  // Insert assert(false) at the same location and check it is reachable.
  // If the solver proves it unreachable, the insertion point is dead code.
  if (!skipVacuity) {
    const vacuitySource = instrumentVacuity(original, ast as any, proposal)
    runAllGuardrails(
      { ...proposal, assertion: 'assert(false); // vacuity check' },
      original,
      vacuitySource,
    )

    const vacuityInput = buildSources(vacuitySource.source, primaryFilename, allSources)
    const vacuityResult = await runner.compile({
      sources: vacuityInput,
      filename: primaryFilename,
      modelCheckerSettings: settings,
    })

    // If assert(false) is PROVEN (no violation found), the insertion point is unreachable.
    const vacuityCheck = classify(
      vacuityResult,
      { ...proposal, assertion: 'assert(false); // vacuity check' },
      settings,
    )
    if (vacuityCheck.outcome === 'PROVEN') {
      const result: CheckResult = {
        outcome: 'NOT_PROVEN',
        assertion: proposal.assertion,
        targetFunction: proposal.target_function,
        englishDescription: proposal.english,
        engineUsed: settings.engine,
        bounded: settings.engine === 'bmc',
        unprovenReason: 'over_approximation',
        smtCheckerWarnings: vacuityCheck.smtCheckerWarnings,
        unsupportedFeatureWarnings: vacuityCheck.unsupportedFeatureWarnings,
      }
      return { checkResult: result, guardrailPassed: true, vacuityPassed: false }
    }
  }

  // Step 3 — Real check
  const sources = buildSources(instrumented.source, primaryFilename, allSources)
  let solverResult: SolverResult
  try {
    solverResult = await runner.compile({
      sources,
      filename: primaryFilename,
      modelCheckerSettings: settings,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      checkResult: {
        outcome: 'NOT_PROVEN',
        assertion: proposal.assertion,
        targetFunction: proposal.target_function,
        englishDescription: proposal.english,
        engineUsed: settings.engine,
        bounded: settings.engine === 'bmc',
        unprovenReason: 'other',
        smtCheckerWarnings: [msg],
        unsupportedFeatureWarnings: [],
      },
      guardrailPassed: true,
      vacuityPassed: true,
    }
  }

  // Step 4 — Classify
  const checkResult = classify(solverResult, proposal, settings)
  return { checkResult, guardrailPassed: true, vacuityPassed: true }
}

/** Merge the instrumented source into the sources map, overriding the primary. */
function buildSources(
  instrumentedSource: string,
  primaryFilename: string,
  allSources: Record<string, string>,
): Record<string, string> {
  return {
    ...allSources,
    [primaryFilename]: instrumentedSource,
  }
}
