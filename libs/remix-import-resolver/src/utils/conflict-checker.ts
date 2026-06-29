import { Logger, TerminalLogType } from './logger'
import { isPotentialVersionConflict, isBreakingVersionConflict } from './semver-utils'
import { PackageVersionResolver } from './package-version-resolver'
import { DependencyStore } from './dependency-store'
import type { PackageJson, PartialPackageJson } from '../types'

/**
 * Dependencies required by ConflictChecker.
 * Consolidates constructor parameters into a single typed object.
 */
export interface ConflictCheckerDeps {
  /** Logger instance for diagnostic output */
  readonly logger: Logger
  /** Resolver for package versions (workspace, lockfile, npm) */
  readonly versionResolver: PackageVersionResolver
  /** Store for package dependency information */
  readonly depStore: DependencyStore
  /** Function to look up existing import mappings */
  readonly getImportMapping: (key: string) => string | undefined
}

export class ConflictChecker {
  private readonly warned: Set<string> = new Set()
  private readonly logger: Logger
  private readonly versionResolver: PackageVersionResolver
  private readonly depStore: DependencyStore
  private readonly getImportMapping: (key: string) => string | undefined

  constructor(deps: ConflictCheckerDeps) {
    this.logger = deps.logger
    this.versionResolver = deps.versionResolver
    this.depStore = deps.depStore
    this.getImportMapping = deps.getImportMapping
  }

  async checkPackageDependencies(packageName: string, resolvedVersion: string, packageJson: PartialPackageJson): Promise<void> {
    const allDeps = { ...(packageJson?.dependencies || {}), ...(packageJson?.peerDependencies || {}) }
    if (Object.keys(allDeps).length === 0) return
    const depTypes: string[] = []
    if (packageJson.dependencies) depTypes.push('dependencies')
    if (packageJson.peerDependencies) depTypes.push('peerDependencies')
    this.logger.log(`[ImportResolver] 🔗 Found ${depTypes.join(' & ')} for ${packageName}:`, Object.keys(allDeps))
    for (const [dep, requestedRange] of Object.entries(allDeps)) {
      await this.checkDependencyConflict(packageName, resolvedVersion, dep as string, requestedRange as string, packageJson.peerDependencies)
    }
  }

  private async checkDependencyConflict(
    packageName: string,
    packageVersion: string,
    dep: string,
    requestedRange: string,
    peerDependencies: Readonly<Record<string, string>> | undefined
  ): Promise<void> {
    const isPeerDep = peerDependencies && dep in peerDependencies
    const depMappingKey = `__PKG__${dep}`
    let resolvedDepVersion: string | null = null

    if (this.getImportMapping(depMappingKey)) {
      const resolvedDepPackage = this.getImportMapping(depMappingKey)
      const match = resolvedDepPackage?.match(/@([^/]+)$/)
      resolvedDepVersion = match ? match[1] : null
    } else if (isPeerDep) {
      if (this.versionResolver.hasWorkspaceResolution(dep)) {
        resolvedDepVersion = this.versionResolver.getWorkspaceResolution(dep)!
      } else if (this.versionResolver.hasLockFileVersion(dep)) {
        resolvedDepVersion = this.versionResolver.getLockFileVersion(dep)!
      }
    } else {
      return
    }

    if (!resolvedDepVersion || typeof requestedRange !== 'string') return

    const conflictKey = `${isPeerDep ? 'peer' : 'dep'}:${packageName}→${dep}:${requestedRange}→${resolvedDepVersion}`
    if (this.warned.has(conflictKey) || !isPotentialVersionConflict(requestedRange, resolvedDepVersion)) return
    this.warned.add(conflictKey)

    let resolvedFrom = 'npm registry'
    const sourcePackage = this.depStore.getPackageSource(dep)
    if (this.versionResolver.hasWorkspaceResolution(dep)) {
      resolvedFrom = 'workspace package.json'
    } else if (this.versionResolver.hasLockFileVersion(dep)) {
      resolvedFrom = 'lock file'
    } else if (sourcePackage && sourcePackage !== dep && sourcePackage !== 'workspace') {
      resolvedFrom = `${sourcePackage}/package.json`
    }

    const breaking = isBreakingVersionConflict(requestedRange, resolvedDepVersion)
    const severity: TerminalLogType = breaking ? 'error' : 'warn'
    const emoji = breaking ? '🚨' : '⚠️'
    const depType = isPeerDep ? 'peerDependencies' : 'dependencies'
    const isAlreadyImported = Boolean(this.getImportMapping(depMappingKey))

    const warningMsg = [
      `${emoji} ${isPeerDep ? 'Peer Dependency' : 'Dependency'} version mismatch detected:`,
      `   Package ${packageName}@${packageVersion} requires in ${depType}:`,
      `     "${dep}": "${requestedRange}"`,
      ``,
      isAlreadyImported
        ? `   But actual imported version is: ${dep}@${resolvedDepVersion}`
        : `   But your workspace will resolve to: ${dep}@${resolvedDepVersion}`,
      `     (from ${resolvedFrom})`,
      ``,
      breaking && isPeerDep ? `⚠️  PEER DEPENDENCY MISMATCH - This WILL cause compilation failures!` : '',
      breaking && !isPeerDep ? `⚠️  MAJOR VERSION MISMATCH - May cause compilation failures!` : '',
      breaking ? `` : '',
      `💡 To fix, update your workspace package.json:`,
      `     "${dep}": "${requestedRange}"`,
      isPeerDep ? `   (Peer dependencies must be satisfied for ${packageName} to work correctly)` : '',
      ``
    ].filter(Boolean).join('\n')

    await this.logger.terminal(severity, warningMsg)
  }
}
