/// <reference types="mocha" />
import { expect } from 'chai'
import { validateProposal, parseAndValidateProposal } from '../src/proposal'

describe('proposal — validateProposal', () => {
  it('accepts a valid proposal object', () => {
    const p = validateProposal({
      english: 'balances should not overflow',
      target_function: 'transfer',
      assertion: 'assert(balances[msg.sender] <= totalSupply);',
      needs_snapshot: [],
    })
    expect(p.english).to.equal('balances should not overflow')
    expect(p.target_function).to.equal('transfer')
  })

  it('rejects non-object input', () => {
    expect(() => validateProposal('string')).to.throw('JSON object')
    expect(() => validateProposal(null)).to.throw('JSON object')
    expect(() => validateProposal([1, 2])).to.throw('JSON object')
  })

  it('rejects missing english', () => {
    expect(() =>
      validateProposal({ english: '', target_function: 'f', assertion: 'assert(x)', needs_snapshot: [] }),
    ).to.throw('english')
  })

  it('rejects missing target_function', () => {
    expect(() =>
      validateProposal({ english: 'e', target_function: '', assertion: 'assert(x)', needs_snapshot: [] }),
    ).to.throw('target_function')
  })

  it('rejects missing assertion', () => {
    expect(() =>
      validateProposal({ english: 'e', target_function: 'f', assertion: '', needs_snapshot: [] }),
    ).to.throw('assertion')
  })

  it('rejects non-array needs_snapshot', () => {
    expect(() =>
      validateProposal({ english: 'e', target_function: 'f', assertion: 'assert(x)', needs_snapshot: 'bad' }),
    ).to.throw('needs_snapshot')
  })

  it('rejects assertion that defines a contract', () => {
    expect(() =>
      validateProposal({
        english: 'e',
        target_function: 'f',
        assertion: 'contract Malicious {}',
        needs_snapshot: [],
      }),
    ).to.throw('contract')
  })

  it('trims whitespace from string fields', () => {
    const p = validateProposal({
      english: '  intent  ',
      target_function: '  withdraw  ',
      assertion: '  assert(x);  ',
      needs_snapshot: [],
    })
    expect(p.english).to.equal('intent')
    expect(p.target_function).to.equal('withdraw')
  })
})

describe('proposal — parseAndValidateProposal', () => {
  it('parses valid JSON string', () => {
    const json = JSON.stringify({
      english: 'test',
      target_function: 'fn',
      assertion: 'assert(1 == 1);',
      needs_snapshot: [],
    })
    const p = parseAndValidateProposal(json)
    expect(p.target_function).to.equal('fn')
  })

  it('rejects invalid JSON', () => {
    expect(() => parseAndValidateProposal('not json')).to.throw('invalid JSON')
  })

  it('rejects JSON that is not an object', () => {
    expect(() => parseAndValidateProposal('"just a string"')).to.throw('JSON object')
  })
})
