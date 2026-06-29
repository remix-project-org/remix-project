import { Logger } from './logger'

export type ParentRequirement = { parent: string; version: string }

export class WarningSystem {
  private logger: Logger
  private emitted: Set<string>
  private verbose: boolean

  constructor(logger: Logger, options?: { verbose?: boolean }) {
    this.logger = logger
    this.emitted = new Set()
    this.verbose = !!options?.verbose
  }

  /**
   * Emit a multi-parent dependency conflict warning where different parents require different versions.
   */
  public async emitMultiParentConflictWarn(
    packageName: string,
    conflictingParents: ParentRequirement[]
  ): Promise<void> {
    const uniqueVersions = Array.from(new Set(conflictingParents.map(p => p.version))).sort()
    const dedupKey = `multi-parent:${packageName}:${uniqueVersions.join('↔')}`
    if (this.emitted.has(dedupKey)) return
    this.emitted.add(dedupKey)
    const lines: string[] = [
      `⚠️  MULTI-PARENT DEPENDENCY CONFLICT`,
      ``,
      `   Multiple parent packages require different versions of: ${packageName}`,
      ``,
      ...conflictingParents.map(p => `   • ${p.parent} requires ${packageName}@${p.version}`),
      uniqueVersions.length ? `` : ``
    ]
    await this.logger.terminal('warn', lines.join('\n'))
  }

  /**
   * Emit an error when the same file is imported from different versions of the same package.
   */
  public async emitDuplicateFileError(args: {
    packageName: string
    relativePath: string | null
    previousVersion: string
    requestedVersion: string
  }): Promise<void> {
    const { packageName, relativePath, previousVersion, requestedVersion } = args
    const rel = relativePath ?? '<unknown>'
    const dedupKey = `dup-file:${packageName}:${rel}:${previousVersion}↔${requestedVersion}`
    if (this.emitted.has(dedupKey)) return
    this.emitted.add(dedupKey)
    const lines: string[] = [
      `🚨 DUPLICATE FILE DETECTED - Will cause compilation errors!`,
      `   File: ${relativePath}`,
      `   From package: ${packageName}`,
      ``,
      `   Already imported from version: ${previousVersion}`,
      `   Now requesting version:       ${requestedVersion}`,
      ``,
      `🔧 REQUIRED FIX - Use explicit versioned imports in your Solidity file:`,
      `   Choose ONE version:`,
      `     import "${packageName}@${previousVersion}/${relativePath}";`,
      `   OR`,
      `     import "${packageName}@${requestedVersion}/${relativePath}";`,
      ``
    ]
    await this.logger.terminal('error', lines.join('\n'))
  }

  /**
   * Emit a warning for a non-Solidity import path encountered by the dependency resolver.
   */
  public async emitInvalidSolidityImport(importPath: string): Promise<void> {
    const key = `invalid:${importPath}`
    if (this.emitted.has(key)) return
    this.emitted.add(key)
    if (!this.verbose) return
    const lines: string[] = [
      `⚠️  Invalid import path encountered`,
      `   Import: ${importPath}`,
      `   Reason: path does not end with .sol`
    ]
    await this.logger.terminal('warn', lines.join('\n'))
  }

  /**
   * Emit a warning when a path could not be resolved by the dependency resolver.
   */
  public async emitFailedToResolve(importPath: string): Promise<void> {
    const key = `resolve-fail:${importPath}`
    if (this.emitted.has(key)) return
    this.emitted.add(key)
    if (!this.verbose) return
    const lines: string[] = [
      `⚠️  Failed to resolve import`,
      `   Import: ${importPath}`
    ]
    await this.logger.terminal('warn', lines.join('\n'))
  }

  /**
   * Emit an error for an unexpected exception while processing a file in the dependency resolver.
   */
  public async emitProcessingError(importPath: string, err: unknown): Promise<void> {
    const msg = (err instanceof Error) ? err.message : String(err)
    const key = `proc-error:${importPath}:${msg}`
    if (this.emitted.has(key)) return
    this.emitted.add(key)
    const lines: string[] = [
      `❌ Error processing import`,
      `   Import: ${importPath}`,
      `   Error: ${msg}`
    ]
    await this.logger.terminal('error', lines.join('\n'))
  }
}
