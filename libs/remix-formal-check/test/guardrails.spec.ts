/// <reference types="mocha" />
import { expect } from 'chai'
import { checkAssertionSafety, checkDiff, GuardrailError } from '../src/guardrails'
import type { ProposalSchema, InstrumentedSource } from '../src/types'

function makeProposal(overrides: Partial<ProposalSchema> = {}): ProposalSchema {
  return {
    english: 'test property',
    target_function: 'withdraw',
    assertion: 'assert(x >= amount);',
    needs_snapshot: [],
    ...overrides,
  }
}

describe('guardrails — checkAssertionSafety', () => {
  it('passes a plain assert()', () => {
    expect(() => checkAssertionSafety(makeProposal())).not.to.throw()
  })

  it('rejects require()', () => {
    expect(() =>
      checkAssertionSafety(makeProposal({ assertion: 'require(x > 0, "bad");' })),
    ).to.throw(GuardrailError).with.property('kind', 'forbidden_pattern')
  })

  it('rejects revert statement', () => {
    expect(() =>
      checkAssertionSafety(makeProposal({ assertion: 'revert("bad");' })),
    ).to.throw(GuardrailError).with.property('kind', 'forbidden_pattern')
  })

  it('rejects inline assembly', () => {
    expect(() =>
      checkAssertionSafety(makeProposal({ assertion: 'assembly { pop(0) }' })),
    ).to.throw(GuardrailError).with.property('kind', 'forbidden_pattern')
  })

  it('rejects .call()', () => {
    expect(() =>
      checkAssertionSafety(makeProposal({ assertion: 'addr.call("")' })),
    ).to.throw(GuardrailError).with.property('kind', 'forbidden_pattern')
  })

  it('rejects .transfer()', () => {
    expect(() =>
      checkAssertionSafety(makeProposal({ assertion: 'payable(a).transfer(1)' })),
    ).to.throw(GuardrailError).with.property('kind', 'forbidden_pattern')
  })

  it('rejects assert(true) as trivially true', () => {
    expect(() =>
      checkAssertionSafety(makeProposal({ assertion: 'assert(true)' })),
    ).to.throw(GuardrailError).with.property('kind', 'trivially_true')
  })

  it('rejects assert(x == x) as trivially true', () => {
    expect(() =>
      checkAssertionSafety(makeProposal({ assertion: 'assert(balance == balance)' })),
    ).to.throw(GuardrailError).with.property('kind', 'trivially_true')
  })

  it('allows __contract__ target with function body (skips trivial check)', () => {
    const proposal = makeProposal({
      target_function: '__contract__',
      assertion: 'function __check() internal pure { assert(1 + 1 == 2); }',
    })
    expect(() => checkAssertionSafety(proposal)).not.to.throw()
  })

  // State-write guardrail (Phase 2)
  it('rejects plain assignment in assertion', () => {
    expect(() =>
      checkAssertionSafety(makeProposal({ assertion: 'balance = 0; assert(balance == 0);' })),
    ).to.throw(GuardrailError).with.property('kind', 'forbidden_pattern')
  })

  it('allows == comparisons (not assignments)', () => {
    expect(() =>
      checkAssertionSafety(makeProposal({ assertion: 'assert(balance == total);' })),
    ).not.to.throw()
  })

  it('allows != comparisons', () => {
    expect(() =>
      checkAssertionSafety(makeProposal({ assertion: 'assert(x != 0);' })),
    ).not.to.throw()
  })

  it('allows += compound assignment in __contract__ target (local var OK)', () => {
    const proposal = makeProposal({
      target_function: '__contract__',
      assertion: 'function __check(uint a, uint b) internal pure { uint c = a + b; assert(c >= a); }',
    })
    // __contract__ blocks skip the state-write check because they may have local declarations
    expect(() => checkAssertionSafety(proposal)).not.to.throw()
  })
})

describe('guardrails — checkDiff', () => {
  const original = 'contract C { function f() external { uint x = 1; } }'

  function makeInstrumented(
    original: string,
    offset: number,
    insertion: string,
  ): InstrumentedSource {
    const source = original.slice(0, offset) + insertion + original.slice(offset)
    return { source, insertionOffset: offset, insertionLength: insertion.length, assertionCode: insertion }
  }

  it('passes when only the insertion differs', () => {
    const ins = makeInstrumented(original, 10, ' assert(true); ')
    expect(() => checkDiff(original, ins)).not.to.throw()
  })

  it('fails when text before insertion was changed', () => {
    const tampered: InstrumentedSource = {
      source: 'XXXXXXXX{ function f() external { uint x = 1; } }',
      insertionOffset: 10,
      insertionLength: 0,
      assertionCode: '',
    }
    expect(() => checkDiff(original, tampered)).to.throw(GuardrailError).with.property('kind', 'diff_mismatch')
  })

  it('fails when text after insertion was changed', () => {
    const ins = makeInstrumented(original, 10, ' assert(x); ')
    // Now additionally mutate after the insertion
    const badSource = ins.source.slice(0, ins.source.length - 3) + 'XXX'
    const tampered: InstrumentedSource = { ...ins, source: badSource }
    expect(() => checkDiff(original, tampered)).to.throw(GuardrailError).with.property('kind', 'diff_mismatch')
  })

  it('fails when total length does not match', () => {
    // Claim insertion of length 5 but actually inserted 10 chars
    const ins = makeInstrumented(original, 10, '1234567890')
    const wrong: InstrumentedSource = { ...ins, insertionLength: 5 }
    expect(() => checkDiff(original, wrong)).to.throw(GuardrailError).with.property('kind', 'diff_mismatch')
  })
})
