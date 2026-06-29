/**
 * ImportHandler Interface
 *
 * Defines the contract for handling special import patterns.
 * Handlers can intercept imports matching specific patterns and generate/resolve content.
 */

import type { ImportPath, LocalPath, ResolvedPath } from '../types'

export interface ImportHandlerContext {
  /** The original import string (readonly - handlers should not mutate) */
  readonly importPath: ImportPath | string
  /** The target file being compiled */
  readonly targetFile: string
  /** Optional target path override */
  readonly targetPath?: LocalPath | string
}

export interface ImportHandlerResult {
  /** Whether this handler handled the import */
  readonly handled: boolean
  /** Generated/resolved content if handled */
  readonly content?: string
  /** Optional resolved path if different from original */
  readonly resolvedPath?: ResolvedPath | string
}

/**
 * Base interface for import handlers
 */
export interface IImportHandler {
  /**
   * Return a pattern (string or regex) that this handler matches against.
   * Examples:
   * - 'remix_tests.sol' (exact match)
   * - /^remix_.*\.sol$/ (regex pattern)
   * - '@myorg/*' (glob-like pattern)
   */
  getPattern(): string | RegExp

  /**
   * Test if this handler can handle the given import
   */
  canHandle(importPath: string): boolean

  /**
   * Handle the import and return content or resolution info
   */
  handle(context: ImportHandlerContext): Promise<ImportHandlerResult>

  /**
   * Optional: Priority for handler ordering (higher = runs first)
   * Default: 0
   */
  getPriority?(): number
}

/**
 * Abstract base class providing common functionality
 */
export abstract class ImportHandler implements IImportHandler {
  protected pattern: string | RegExp

  constructor(pattern: string | RegExp) {
    this.pattern = pattern
  }

  getPattern(): string | RegExp {
    return this.pattern
  }

  canHandle(importPath: string): boolean {
    if (typeof this.pattern === 'string') {
      // Support simple wildcards: 'remix_*.sol' -> /^remix_.*\.sol$/
      if (this.pattern.includes('*')) {
        const regexPattern = this.pattern
          .replace(/[.+^${}()|[\]\\]/g, '\\$&') // escape special chars
          .replace(/\*/g, '.*') // convert * to .*
        const regex = new RegExp(`^${regexPattern}$`)
        return regex.test(importPath)
      }
      return importPath === this.pattern || importPath.endsWith(this.pattern)
    } else {
      return this.pattern.test(importPath)
    }
  }

  abstract handle(context: ImportHandlerContext): Promise<ImportHandlerResult>

  getPriority(): number {
    return 0
  }
}
