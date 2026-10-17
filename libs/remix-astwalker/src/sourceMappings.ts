import { isAstNode, isYulAstNode, AstWalker } from './astWalker'
import { AstNode, LineColPosition, LineColRange, Location } from './types'
import { util } from '@remix-project/remix-lib'

export declare interface SourceMappings {
  // eslint-disable-next-line @typescript-eslint/no-misused-new
  new(): SourceMappings;
}

/**
 * Turn a character offset into a "LineColPosition".
 *
 * @param offset  The character offset to convert.
 */
export function lineColPositionFromOffset (offset: number, lineBreaks: Array<number>): LineColPosition {
  let line: number = util.findLowerBound(offset, lineBreaks)
  if (lineBreaks[line] !== offset) {
    line += 1
  }
  const beginColumn = line === 0 ? 0 : (lineBreaks[line - 1] + 1)
  return <LineColPosition>{
    line: line + 1,
    character: (offset - beginColumn) + 1
  }
}

/**
 * Turn a solc AST's "src" attribute string (s:l:f)
 * into a Location
 *
 * @param astNode  The object to convert.
 */
export function sourceLocationFromAstNode (astNode: AstNode): Location | null {
  if (isAstNode(astNode) && isYulAstNode(astNode) && astNode.src) {
    return sourceLocationFromSrc(astNode.src)
  }
  return null
}

/**
 * Break out fields of solc AST's "src" attribute string (s:l:f)
 * into its "start", "length", and "file index" components
 * and return that as a Location
 *
 * @param src  A solc "src" field.
 * @returns {Location}
 */
export function sourceLocationFromSrc (src: string): Location {
  const split = src.split(':')
  return <Location>{
    start: parseInt(split[0], 10),
    length: parseInt(split[1], 10),
    file: parseInt(split[2], 10)
  }
}

/**
 * Routines for retrieving solc AST object(s) using some criteria, usually
 * including "src' information.
 */
// eslint-disable-next-line no-redeclare
export class SourceMappings {
  readonly source: string;
  readonly lineBreaks: Array<number>;

  constructor (source: string) {
    this.source = source

    // Create a list of line offsets which will be used to map between
    // character offset and line/column positions.
    const lineBreaks: Array<number> = []
    for (let pos = source.indexOf('\n'); pos >= 0; pos = source.indexOf('\n', pos + 1)) {
      lineBreaks.push(pos)
    }
    this.lineBreaks = lineBreaks
  }

  /**
   * Get all nodes whose source start and length exactly match the given range.
   *
   * @param astNodeType  Type of node to return, or null to match any node type.
   * @param position     Source range to match by start and length; the file index is ignored.
   */
  nodesAtPosition (astNodeType: string | null, position: Location, ast: AstNode): Array<AstNode> {
    const astWalker = new AstWalker()
    const found: Array<AstNode> = []

    const callback = function (node: AstNode): boolean {
      const nodeLocation = sourceLocationFromAstNode(node)
      if (nodeLocation &&
        nodeLocation.start === position.start &&
        nodeLocation.length === position.length) {
        if (!astNodeType || astNodeType === node.nodeType) {
          found.push(node)
        }
      }
      return true
    }
    astWalker.walkFull(ast, callback)
    return found
  }

  /**
   * Retrieve the last node in traversal order whose source start and length exactly match
   * the given range, or null if no matching node is found.
   *
   * @param astNodeType   Required node type, or undefined to match any node type.
   * @param sourceLocation Source range to match by start and length; the file index is ignored.
   */
  findNodeAtSourceLocation (astNodeType: string | undefined, sourceLocation: Location, ast: AstNode | null): AstNode | null {
    const astWalker = new AstWalker()
    let found = null
    /* FIXME: Looking at AST walker code,
       I don't understand a need to return a boolean. */
    const callback = function (node: AstNode) {
      const nodeLocation = sourceLocationFromAstNode(node)
      if (nodeLocation &&
        nodeLocation.start === sourceLocation.start &&
        nodeLocation.length === sourceLocation.length) {
        if (astNodeType === undefined || astNodeType === node.nodeType) {
          found = node
        }
      }
      return true
    }

    astWalker.walkFull(ast, callback)
    return found
  }

  /**
   * Retrieve the line/column range position for the given source-mapping string.
   *
   * @param src  Solc "src" object containing attributes {source} and {length}.
   */
  srcToLineColumnRange (src: string): LineColRange {
    const sourceLocation = sourceLocationFromSrc(src)
    if (sourceLocation.start >= 0 && sourceLocation.length >= 0) {
      return <LineColRange>{
        start: lineColPositionFromOffset(sourceLocation.start, this.lineBreaks),
        end: lineColPositionFromOffset(sourceLocation.start + sourceLocation.length, this.lineBreaks)
      }
    } else {
      return <LineColRange>{
        start: null,
        end: null
      }
    }
  }
}
