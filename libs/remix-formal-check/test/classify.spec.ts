/// <reference types="mocha" />
import { expect } from 'chai'
import { classify } from '../src/classify'
import type { SolverResult, ProposalSchema, ModelCheckerSettings, CompilerDiagnostic } from '../src/types'

const proposal: ProposalSchema = {
  english: 'withdrawn should not exceed deposited',
  target_function: 'withdraw',
  assertion: 'assert(withdrawn + amount <= deposited);',
  needs_snapshot: [],
}

const bmcSettings: ModelCheckerSettings = {
  engine: 'bmc',
  targets: ['assert', 'overflow'],
  timeoutMs: 30000,
}

function diag(message: string, overrides: Partial<CompilerDiagnostic> = {}): CompilerDiagnostic {
  return {
    type: 'Warning',
    severity: 'warning',
    component: 'SMTChecker',
    message,
    formattedMessage: message,
    ...overrides,
  }
}

describe('classify', () => {
  it('returns COUNTEREXAMPLE on assertion violation', () => {
    const result: SolverResult = {
      success: true,
      errors: [diag('BMC: Assertion violation happens here.')],
    }
    const check = classify(result, proposal, bmcSettings)
    expect(check.outcome).to.equal('COUNTEREXAMPLE')
    expect(check.bounded).to.be.true
    expect(check.engineUsed).to.equal('bmc')
  })

  it('returns NOT_PROVEN(solver_unavailable) when Z3 is missing', () => {
    const result: SolverResult = {
      success: true,
      errors: [diag('SMTChecker analysis was not possible since it requires Z3 or CVC4.')],
    }
    const check = classify(result, proposal, bmcSettings)
    expect(check.outcome).to.equal('NOT_PROVEN')
    expect(check.unprovenReason).to.equal('solver_unavailable')
  })

  it('returns NOT_PROVEN(timeout) on solver timeout', () => {
    const result: SolverResult = {
      success: true,
      errors: [diag('BMC: 1 verification condition(s) could not be proved. Enable the model checker option "timeout" to modify the timeout.'),
               diag('BMC: timeout reached')],
    }
    const check = classify(result, proposal, bmcSettings)
    expect(check.outcome).to.equal('NOT_PROVEN')
    expect(check.unprovenReason).to.equal('timeout')
  })

  it('returns NOT_PROVEN(unsupported_feature) when solver hits unsupported constructs', () => {
    const result: SolverResult = {
      success: true,
      errors: [diag('SMTChecker: Unsupported feature: external function call.', { component: 'general' })],
    }
    const check = classify(result, proposal, bmcSettings)
    expect(check.outcome).to.equal('NOT_PROVEN')
    expect(check.unprovenReason).to.equal('unsupported_feature')
  })

  it('returns NOT_PROVEN(compile_error) on compilation failure', () => {
    const result: SolverResult = {
      success: false,
      errors: [
        { type: 'Error', severity: 'error', message: 'Identifier not found', formattedMessage: 'Identifier not found' },
      ],
    }
    const check = classify(result, proposal, bmcSettings)
    expect(check.outcome).to.equal('NOT_PROVEN')
    expect(check.unprovenReason).to.equal('compile_error')
  })

  it('returns PROVEN(bounded) when BMC runs with no violations', () => {
    const result: SolverResult = {
      success: true,
      errors: [],
    }
    const check = classify(result, proposal, bmcSettings)
    expect(check.outcome).to.equal('PROVEN')
    expect(check.bounded).to.be.true
    // A PROVEN(bounded) result must state it is not an unbounded proof
    expect(check.engineUsed).to.equal('bmc')
  })

  it('populates counterexampleTrace from secondarySourceLocations', () => {
    const d = diag('BMC: Assertion violation happens here.', {
      secondarySourceLocations: [
        { start: 10, end: 20, file: 'test.sol', message: 'Entry point' },
      ],
    })
    const result: SolverResult = { success: true, errors: [d] }
    const check = classify(result, proposal, bmcSettings)
    expect(check.counterexampleTrace).to.include('Entry point')
  })
})
