'use strict'

import { parseCode } from './codeUtils'
import { util } from '@remix-project/remix-lib'

function createExpressions (instructions) {
  const expressions = []
  let labels = 0
  for (let i = 0; i < instructions.length; i++) {
    const expr = instructions[i]
    expr.functional = false
    if (expr.name === 'JUMPDEST') {
      expr.label = 'label' + (++labels)
    // eslint-disable-next-line no-empty
    } else if (expr.name.slice(0, 3) === 'DUP') {
    // eslint-disable-next-line no-empty
    } else if (expr.name.slice(0, 4) === 'SWAP') {
    } else if (expr.out <= 1 && expr.in <= expressions.length) {
      let error = false
      for (let j = 0; j < expr.in && !error; j++) {
        const arg = expressions[expressions.length - j - 1]
        if (!arg.functional || arg.out !== 1) {
          error = true
          break
        }
      }
      if (!error) {
        expr.args = expressions.splice(expressions.length - expr.in)
        expr.functional = true
      }
    }
    expressions.push(expr)
  }
  return expressions
}

function toString (expr) {
  if (expr.name.slice(0, 4) === 'PUSH') {
    return util.bytesToHex(expr.pushData)
  } else if (expr.name === 'JUMPDEST') {
    return expr.label + ':'
  } else if (expr.args) {
    return expr.name.toLowerCase() + '(' + expr.args.reverse().map(toString).join(', ') + ')'
  }
  return expr.name.toLowerCase()
}

/**
  * Disassembler that turns bytecode (as a hex string) into Solidity inline assembly.
  */
export function disassemble (input, hardfork = 'osaka') {
  const code = parseCode(util.hexToIntArray(input), hardfork)
  return createExpressions(code).map(toString).join('\n')
}
