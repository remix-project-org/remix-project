/// <reference types="mocha" />
import { expect } from 'chai'
import * as fs from 'fs'
import * as path from 'path'
import { instrument, instrumentVacuity } from '../src/instrument'
import type { ProposalSchema } from '../src/types'

// Minimal AST builder for tests — mirrors the shape returned by solc
function makeAst(contractSrc: string, fns: Array<{ name: string; bodySrc: string }>) {
  // We'll build a minimal AST using character offsets for a known source string
  return {
    nodeType: 'SourceUnit',
    src: `0:${contractSrc.length}:0`,
    nodes: [
      {
        nodeType: 'ContractDefinition',
        name: 'SimpleVault',
        src: `0:${contractSrc.length}:0`,
        nodes: fns.map(({ name, bodySrc }) => ({
          nodeType: 'FunctionDefinition',
          name,
          src: bodySrc,
          body: {
            nodeType: 'Block',
            src: bodySrc,
          },
        })),
      },
    ],
  }
}

describe('instrument — insertIntoFunction', () => {
  const src = [
    'contract SimpleVault {',
    '    uint256 public x;',
    '    function withdraw(uint256 amount) external {',
    '        x -= amount;',
    '    }',
    '}',
  ].join('\n')

  // Find real offsets
  const withdrawBodyStart = src.indexOf('{\n        x -= amount;')
  const withdrawBodyLength = src.indexOf('\n    }') - withdrawBodyStart + '\n    }'.length
  const fnBodySrc = `${withdrawBodyStart}:${withdrawBodyLength}:0`

  const ast = makeAst(src, [{ name: 'withdraw', bodySrc: fnBodySrc }])

  const proposal: ProposalSchema = {
    english: 'amount should not exceed x',
    target_function: 'withdraw',
    assertion: 'assert(x >= amount);',
    needs_snapshot: [],
  }

  it('inserts assertion before closing brace of function body', () => {
    const result = instrument(src, ast as any, proposal)
    expect(result.source).to.include('assert(x >= amount);')
    // The original function code must still be present
    expect(result.source).to.include('x -= amount;')
    // Length increased by insertion
    expect(result.source.length).to.be.greaterThan(src.length)
    expect(result.insertionLength).to.equal(result.assertionCode.length)
  })

  it('original source is not modified (only the return value changes)', () => {
    instrument(src, ast as any, proposal)
    expect(src).not.to.include('assert(x >= amount);')
  })

  it('insertion is at the right offset', () => {
    const result = instrument(src, ast as any, proposal)
    // The characters before insertion should equal the original
    expect(result.source.slice(0, result.insertionOffset)).to.equal(
      src.slice(0, result.insertionOffset),
    )
    // The characters after insertion (skipping the inserted block) should equal original tail
    expect(result.source.slice(result.insertionOffset + result.insertionLength)).to.equal(
      src.slice(result.insertionOffset),
    )
  })

  it('throws if function not found', () => {
    expect(() =>
      instrument(src, ast as any, { ...proposal, target_function: 'nonexistent' }),
    ).to.throw('nonexistent')
  })
})

describe('instrument — appendToContract', () => {
  const src = [
    'contract SimpleVault {',
    '    uint256 public x;',
    '}',
  ].join('\n')

  const ast = {
    nodeType: 'SourceUnit',
    src: `0:${src.length}:0`,
    nodes: [
      {
        nodeType: 'ContractDefinition',
        name: 'SimpleVault',
        src: `0:${src.length}:0`,
        nodes: [],
      },
    ],
  }

  const proposal: ProposalSchema = {
    english: 'no overflow on add',
    target_function: '__contract__',
    assertion: 'function __formalCheck() internal pure { assert(1 + 1 == 2); }',
    needs_snapshot: [],
  }

  it('appends code before the last closing brace of the contract', () => {
    const result = instrument(src, ast as any, proposal)
    expect(result.source).to.include('__formalCheck')
    // The closing brace should still be at the end
    expect(result.source.trimEnd().endsWith('}')).to.be.true
  })
})

describe('instrument — needs_snapshot', () => {
  const src = [
    'contract Vault {',
    '    uint256 public balance;',
    '    function withdraw(uint256 amount) external {',
    '        balance -= amount;',
    '    }',
    '}',
  ].join('\n')

  const bodyStart = src.indexOf('{\n        balance -= amount;')
  const bodyLength = src.indexOf('\n    }') - bodyStart + '\n    }'.length

  // Build an AST that includes a state variable declaration
  const ast = {
    nodeType: 'SourceUnit',
    src: `0:${src.length}:0`,
    nodes: [
      {
        nodeType: 'ContractDefinition',
        name: 'Vault',
        src: `0:${src.length}:0`,
        nodes: [
          {
            nodeType: 'VariableDeclaration',
            name: 'balance',
            stateVariable: true,
            src: '19:22:0',
            typeName: { nodeType: 'ElementaryTypeName', name: 'uint256' },
          },
          {
            nodeType: 'FunctionDefinition',
            name: 'withdraw',
            src: `${bodyStart - 10}:${bodyLength + 10}:0`,
            body: { nodeType: 'Block', src: `${bodyStart}:${bodyLength}:0` },
          },
        ],
      },
    ],
  }

  it('inserts snapshot declaration before assertion', () => {
    const proposal: ProposalSchema = {
      english: 'balance should not decrease below zero',
      target_function: 'withdraw',
      assertion: 'assert(__snapshot_balance >= amount);',
      needs_snapshot: ['balance'],
    }
    const result = instrument(src, ast as any, proposal)
    expect(result.source).to.include('uint256 __snapshot_balance = balance;')
    expect(result.source).to.include('assert(__snapshot_balance >= amount);')
    // Snapshot must come BEFORE assertion in the inserted text
    const snapIdx = result.source.indexOf('__snapshot_balance = balance;')
    const assertIdx = result.source.indexOf('assert(__snapshot_balance')
    expect(snapIdx).to.be.lessThan(assertIdx)
  })

  it('throws if snapshot variable not found in AST', () => {
    const proposal: ProposalSchema = {
      english: 'test',
      target_function: 'withdraw',
      assertion: 'assert(true);',
      needs_snapshot: ['nonExistentVar'],
    }
    expect(() => instrument(src, ast as any, proposal)).to.throw('nonExistentVar')
  })
})

describe('instrumentVacuity', () => {
  const src = [
    'contract C {',
    '    function f() external {',
    '        uint x = 1;',
    '    }',
    '}',
  ].join('\n')

  const bodyStart = src.indexOf('{\n        uint x = 1;')
  const bodyLength = src.indexOf('\n    }') - bodyStart + '\n    }'.length
  const ast = makeAst(src, [{ name: 'f', bodySrc: `${bodyStart}:${bodyLength}:0` }])

  it('inserts assert(false) instead of the real assertion', () => {
    const result = instrumentVacuity(src, ast as any, {
      english: 'test',
      target_function: 'f',
      assertion: 'assert(x == 1);',
      needs_snapshot: [],
    })
    expect(result.source).to.include('assert(false)')
    expect(result.source).not.to.include('assert(x == 1)')
  })
})
