import type { PartialPackageJson } from '../types'

export class DependencyStore {
  private readonly parentPackageDependencies: Map<string, Map<string, string>> = new Map()
  private readonly importedFiles: Map<string, string> = new Map()
  private readonly packageSources: Map<string, string> = new Map()

  setPackageSource(pkg: string, source: string): void { this.packageSources.set(pkg, source) }
  getPackageSource(pkg: string): string | undefined { return this.packageSources.get(pkg) }

  setImportedFile(fileKey: string, version: string): void { this.importedFiles.set(fileKey, version) }
  getImportedFile(fileKey: string): string | undefined { return this.importedFiles.get(fileKey) }

  storePackageDependencies(packageKey: string, packageJson: PartialPackageJson | null): Map<string, string> | null {
    if (!packageJson) return null
    if (!packageJson.dependencies && !packageJson.peerDependencies) return null
    const deps = new Map<string, string>()
    const addDeps = (obj: Readonly<Record<string, string>>) => {
      for (const [dep, versionRange] of Object.entries(obj)) {
        if (!deps.has(dep)) {
          const clean = versionRange.replace(/^[\^~>=<]+/, '')
          deps.set(dep, clean)
        }
      }
    }
    if (packageJson.dependencies) addDeps(packageJson.dependencies)
    if (packageJson.peerDependencies) addDeps(packageJson.peerDependencies)
    this.parentPackageDependencies.set(packageKey, deps)
    return deps
  }

  getParentPackageDeps(packageKey: string): Map<string, string> | undefined { return this.parentPackageDependencies.get(packageKey) }
  hasParent(packageKey: string): boolean { return this.parentPackageDependencies.has(packageKey) }
  entries(): IterableIterator<[string, Map<string, string>]> { return this.parentPackageDependencies.entries() }
}
