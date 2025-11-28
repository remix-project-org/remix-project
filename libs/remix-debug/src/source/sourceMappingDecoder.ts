'use strict'
import { AstWalker } from '@remix-project/remix-astwalker'
import { util } from '@remix-project/remix-lib'

/**
 * Decompress the source mapping given by solc-bin.js
 * s:l:f:j
 */

/**
 * Decode the given @arg value
 *
 * @param {string} value      - source location to decode ( should be start:length:file )
 * @return {Object} returns the decompressed source mapping {start, length, file}
 */
export function decode (value) {
  if (value) {
    value = value.split(':')
    return {
      start: parseInt(value[0]),
      length: parseInt(value[1]),
      file: parseInt(value[2])
    }
  }
}

/**
 * Decode the source mapping for the given compressed mapping
 *
 * @param {String} mapping     - compressed source mapping given by solc-bin
 * @return {Array} returns the decompressed source mapping. Array of {start, length, file, jump}
 */
export function decompressAll (mapping) {
  const map = mapping.split(';')
  const ret = []
  for (const k in map) {
    const compressed = map[k].split(':')
    const sourceMap = {
      start: compressed[0] ? parseInt(compressed[0]) : ret[ret.length - 1].start,
      length: compressed[1] ? parseInt(compressed[1]) : ret[ret.length - 1].length,
      file: compressed[2] ? parseInt(compressed[2]) : ret[ret.length - 1].file,
      jump: compressed[3] ? compressed[3] : ret[ret.length - 1].jump
    }
    ret.push(sourceMap)
  }
  return ret
}

/**
  * Retrieve line/column position of each source char
  *
  * @param {String} source - contract source code
  * @return {Array} returns an array containing offset of line breaks
  */
export function getLinebreakPositions (source) {
  const ret = []
  for (let pos = source.indexOf('\n'); pos >= 0; pos = source.indexOf('\n', pos + 1)) {
    ret.push(pos)
  }
  return ret
}

/**
 * Retrieve the line/column position for the given source mapping
 *
 * @param {Object} sourceLocation - object containing attributes {source} and {length}
 * @param {Array} lineBreakPositions - array returned by the function 'getLinebreakPositions'
 * @return {Object} returns an object {start: {line, column}, end: {line, column}} (line/column count start at 0)
 */
export function convertOffsetToLineColumn (sourceLocation, lineBreakPositions) {
  if (sourceLocation.start >= 0 && sourceLocation.length >= 0) {
    return {
      start: convertFromCharPosition(sourceLocation.start, lineBreakPositions),
      end: convertFromCharPosition(sourceLocation.start + sourceLocation.length, lineBreakPositions)
    }
  }
  return { start: null, end: null }
}

function convertFromCharPosition (pos, lineBreakPositions) {
  let line = util.findLowerBound(pos, lineBreakPositions)
  if (lineBreakPositions[line] !== pos) {
    line = line + 1
  }
  const beginColumn = line === 0 ? 0 : (lineBreakPositions[line - 1] + 1)
  const column = pos - beginColumn
  return { line, column }
}

function sourceLocationFromAstNode (astNode) {
  if (astNode.src) {
    const split = astNode.src.split(':')
    return {
      start: parseInt(split[0]),
      length: parseInt(split[1]),
      file: parseInt(split[2])
    }
  }
  return null
}

/**
 * Retrieve the first @arg astNodeType that include the source map at arg instIndex
 *
 * @param {String} astNodeType - node type that include the source map instIndex
 * @param {String} instIndex - instruction index used to retrieve the source map
 * @param {String} sourceMap - source map given by the compilation result
 * @param {Object} ast - ast given by the compilation result
 */
export function findNodeAtInstructionIndex (astNodeType, instIndex, sourceMap, ast) {
  const sourceLocation = atIndex(instIndex, sourceMap)
  return findNodeAtSourceLocation(astNodeType, sourceLocation, ast)
}

function findNodeAtSourceLocation (astNodeType, sourceLocation, ast) {
  const astWalker = new AstWalker()
  let found = null
  const callback = function (node) {
    const nodeLocation = sourceLocationFromAstNode(node)
    if (!nodeLocation) {
      return
    }
    if (nodeLocation.start <= sourceLocation.start && nodeLocation.start + nodeLocation.length >= sourceLocation.start + sourceLocation.length) {
      if (astNodeType === node.nodeType) {
        found = node
      }
    }
  }
  astWalker.walkFull(ast.ast, callback)
  return found
}

export function nodesAtPositionForSourceLocation (astNodeType, sourceLocation, ast) {
  const astWalker = new AstWalker()
  const found = []
  const callback = function (node) {
    const nodeLocation = sourceLocationFromAstNode(node)
    if (!nodeLocation) {
      return
    }
    if (nodeLocation.start <= sourceLocation.start && nodeLocation.start + nodeLocation.length >= sourceLocation.start + sourceLocation.length) {
      if (!astNodeType || astNodeType === node.nodeType) {
        found.push(node)
      }
    }
  }
  astWalker.walkFull(ast.ast, callback)
  return found
}

/**
 * get a list of nodes that are at the given @arg position
 *
 * @param {String} astNodeType      - type of node to return
 * @param {Int} position     - cursor position
 * @return {Object} ast object given by the compiler
 */

export function nodesAtPosition (astNodeType, position, ast) {
  const astWalker = new AstWalker()
  const found = []
  const callback = function (node) {
    const nodeLocation = sourceLocationFromAstNode(node)
    if (!nodeLocation) {
      return
    }
    if (nodeLocation.start <= position && nodeLocation.start + nodeLocation.length >= position) {
      if (!astNodeType || astNodeType === node.nodeType) {
        found.push(node)
      }
    }
  }
  astWalker.walkFull(ast.ast, callback)
  return found
}

/**
 * starts with the given @arg index and move backward until it can find all the values for start, length, file, jump
 * if `file === -1` then the value of the sourcemap should be taken from the previous step,
 * because some steps are internal subroutine for the compiler and doesn't link to any high level code.
 *
 * Solidity source maps format is
 *  - start:length:file:jump
 *  - jump can be 'i', 'o' or '-' (jump 'in' or 'out' of a function)
 *  - if no value is specified ( e.g "5:2" - no mention of 'file' and 'jump' ), actual values are the one of the step before
 *  - if the file (3rd value) has -1, the source maps should be discarded
 *
 *  @param Int index - index in the bytecode to decode source mapping from
 *  @param Array mapping - source maps returned by the compiler. e.g 121:3741:0:-:0;;;;8:9:-1;5:2;;;30:1;27;20:12;5:2;121:3741:0;;;;;;;
 *  @return Object { start, length, file, jump }
 */
export function atIndex (index, mapping) {
  const ret = {}
  const map = mapping.split(';')
  if (index >= map.length) {
    index = map.length - 1
  }
  for (let k = index; k >= 0; k--) {
    let current = map[k]
    if (!current.length) {
      continue
    }
    current = current.split(':')
    if (ret['start'] === undefined && current[0] && current[0] !== '-1' && current[0].length) {
      ret['start'] = parseInt(current[0])
    }
    if (ret['length'] === undefined && current[1] && current[1] !== '-1' && current[1].length) {
      ret['length'] = parseInt(current[1])
    }
    if (ret['file'] === undefined && current[2] && current[2].length) {
      ret['file'] = parseInt(current[2])
    }
    if (ret['jump'] === undefined && current[3] && current[3].length) {
      ret['jump'] = current[3]
    }
    if (ret['start'] !== undefined && ret['length'] !== undefined && ret['file'] !== undefined && ret['jump'] !== undefined) {
      break
    }
  }
  return ret
}
