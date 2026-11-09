'use strict'

import type { InstrumentedSource, ProposalSchema } from './types'

// --- AST types (minimal subset we need) --------------------------------

interface ASTSourceRange {
  start: number  // character offset
  end: number    // exclusive end (start + length)
}

interface ASTNode {
  nodeType: string
  src: string   // "offset:length:fileIndex"
  name?: string
  body?: ASTNode
  nodes?: ASTNode[]
  members?: ASTNode[]
  parameters?: ASTNode
  returnParameters?: ASTNode
  stateMutability?: string
  visibility?: string
}

/** Parse an AST src string into start/end offsets. */
function parseSrc(src: string): ASTSourceRange {
  const [offset, length] = src.split(':').map(Number)
  return { start: offset, end: offset + length }
}

/** Find the ContractDefinition node(s) in the top-level AST. */
function findContracts(ast: ASTNode): ASTNode[] {
  if (!ast || !Array.isArray(ast.nodes)) return []
  return ast.nodes.filter((n) => n.nodeType === 'ContractDefinition')
}

/** Find a FunctionDefinition by name inside a contract node. */
function findFunction(contractNode: ASTNode, fnName: string): ASTNode | undefined {
  if (!Array.isArray(contractNode.nodes)) return undefined
  return contractNode.nodes.find(
    (n) => n.nodeType === 'FunctionDefinition' && n.name === fnName,
  )
}

/**
 * Find the last contract definition in the AST to use as the append target
 * when targetFunction is '__contract__'.
 */
function lastContract(ast: ASTNode): ASTNode | undefined {
  const contracts = findContracts(ast)
  return contracts[contracts.length - 1]
}

// --- Insertion ----------------------------------------------------------

/**
 * Instrument a source file by inserting the assertion code from a proposal.
 *
 * Uses AST source ranges from a prior compilation (the caller passes the AST
 * for the file). The original source string is NEVER modified — this function
 * returns a new string.
 *
 * Rules:
 *  - targetFunction == '__contract__': append a new block before the
 *    closing `}` of the last ContractDefinition in the file.
 *  - otherwise: insert the assertion statement before the closing `}` of
 *    the named function's body.
 *
 * Throws if the AST doesn't contain the requested target.
 */
export function instrument(
  source: string,
  ast: ASTNode,
  proposal: ProposalSchema,
): InstrumentedSource {
  const { target_function: targetFn, assertion } = proposal

  if (targetFn === '__contract__') {
    return appendToContract(source, ast, assertion)
  }
  return insertIntoFunction(source, ast, targetFn, assertion)
}

function insertIntoFunction(
  source: string,
  ast: ASTNode,
  fnName: string,
  assertionCode: string,
): InstrumentedSource {
  const contracts = findContracts(ast)
  if (contracts.length === 0) {
    throw new Error('AST contains no ContractDefinition — cannot instrument')
  }

  for (const contract of contracts) {
    const fn = findFunction(contract, fnName)
    if (!fn) continue
    if (!fn.body) {
      throw new Error(`Function "${fnName}" has no body (may be abstract or external declaration)`)
    }

    const bodyRange = parseSrc(fn.body.src)

    // Insert just before the closing brace of the function body.
    // bodyRange.end points one character past the closing `}`, so we
    // insert at bodyRange.end - 1.
    const insertOffset = bodyRange.end - 1

    // Build the inserted text: newline + indentation + code + newline
    const insertion = `\n        ${assertionCode}\n    `

    const result =
      source.slice(0, insertOffset) + insertion + source.slice(insertOffset)

    return {
      source: result,
      insertionOffset: insertOffset,
      insertionLength: insertion.length,
      assertionCode: insertion,
    }
  }

  throw new Error(
    `Function "${fnName}" not found in any contract in the AST`,
  )
}

function appendToContract(
  source: string,
  ast: ASTNode,
  code: string,
): InstrumentedSource {
  const contract = lastContract(ast)
  if (!contract) {
    throw new Error('AST contains no ContractDefinition — cannot append')
  }

  const contractRange = parseSrc(contract.src)
  // Insert just before the closing `}` of the contract.
  const insertOffset = contractRange.end - 1

  const insertion = `\n\n    ${code}\n`

  const result =
    source.slice(0, insertOffset) + insertion + source.slice(insertOffset)

  return {
    source: result,
    insertionOffset: insertOffset,
    insertionLength: insertion.length,
    assertionCode: insertion,
  }
}

/**
 * Build an instrumented source for the vacuity check: insert `assert(false)`
 * at the same location as the real assertion. If the solver proves this
 * unreachable, the insertion point is dead code — real assertion → NOT_PROVEN.
 */
export function instrumentVacuity(
  source: string,
  ast: ASTNode,
  proposal: ProposalSchema,
): InstrumentedSource {
  const vacuousProposal: ProposalSchema = {
    ...proposal,
    assertion: 'assert(false); // vacuity check',
  }
  return instrument(source, ast, vacuousProposal)
}
