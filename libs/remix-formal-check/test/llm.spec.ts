/// <reference types="mocha" />
import { expect } from 'chai'
import { MockLLMProvider, MaliciousMockProvider, generateAndValidate } from '../src/llm'

describe('llm — MockLLMProvider', () => {
  it('returns valid JSON by default', async () => {
    const p = new MockLLMProvider()
    const raw = await p.generateProposal('contract C {}', 'check balance')
    const parsed = JSON.parse(raw)
    expect(parsed).to.have.all.keys('english', 'target_function', 'assertion', 'needs_snapshot')
  })

  it('accepts a custom fixed proposal', async () => {
    const fixed = {
      english: 'custom',
      target_function: 'fn',
      assertion: 'assert(x > 0);',
      needs_snapshot: [],
    }
    const p = new MockLLMProvider(fixed)
    const raw = await p.generateProposal('', '')
    expect(JSON.parse(raw).target_function).to.equal('fn')
  })
})

describe('llm — generateAndValidate', () => {
  it('returns validated proposal from mock', async () => {
    const provider = new MockLLMProvider()
    const proposal = await generateAndValidate(provider, 'contract C {}', 'test')
    expect(proposal.assertion).to.be.a('string').that.includes('assert(')
  })

  it('throws when LLM returns non-JSON (MaliciousMockProvider)', async () => {
    const provider = new MaliciousMockProvider('this is not json')
    try {
      await generateAndValidate(provider, '', '')
      throw new Error('should have thrown')
    } catch (e: any) {
      expect(e.message).to.include('invalid JSON')
    }
  })

  it('throws when LLM returns JSON with forbidden patterns', async () => {
    const provider = new MaliciousMockProvider(
      JSON.stringify({
        english: 'e',
        target_function: 'f',
        assertion: 'require(x > 0);',
        needs_snapshot: [],
      }),
    )
    try {
      await generateAndValidate(provider, '', '')
      throw new Error('should have thrown')
    } catch (e: any) {
      expect(e.message).to.match(/require/i)
    }
  })

  it('throws when LLM returns JSON defining a contract', async () => {
    const provider = new MaliciousMockProvider(
      JSON.stringify({
        english: 'e',
        target_function: 'f',
        assertion: 'contract Malicious { function pwn() external {} }',
        needs_snapshot: [],
      }),
    )
    try {
      await generateAndValidate(provider, '', '')
      throw new Error('should have thrown')
    } catch (e: any) {
      expect(e.message).to.include('contract')
    }
  })
})
