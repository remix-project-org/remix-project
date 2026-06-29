import {
  ImportPatterns,
  isScopedPackage
} from '../constants/import-patterns'

export function extractPackageName(url: string, workspaceResolutions?: ReadonlyMap<string, string> | null): string | null {
  // Prefer known workspace resolution keys (supports npm alias keys like "@module_remapping")
  if (isScopedPackage(url) && workspaceResolutions && workspaceResolutions.size > 0) {
    const keys = Array.from(workspaceResolutions.keys())
    keys.sort((a, b) => b.length - a.length)
    for (const key of keys) {
      if (url === key || url.startsWith(`${key}/`) || url.startsWith(`${key}@`)) {
        return key
      }
    }
  }
  const scopedMatch = url.match(ImportPatterns.SCOPED_PACKAGE)
  if (scopedMatch) return scopedMatch[1]
  const regularMatch = url.match(ImportPatterns.REGULAR_PACKAGE)
  if (regularMatch) return regularMatch[1]
  return null
}

export function extractVersion(url: string): string | null {
  const match = url.match(ImportPatterns.VERSION_SUFFIX)
  return match ? match[1] : null
}

export function extractRelativePath(url: string, packageName: string): string | null {
  const escaped = packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const versionedPattern = new RegExp(`^${escaped}@[^/]+/(.+)$`)
  const versionedMatch = url.match(versionedPattern)
  if (versionedMatch) return versionedMatch[1]
  const unversionedPattern = new RegExp(`^${escaped}/(.+)$`)
  const unversionedMatch = url.match(unversionedPattern)
  if (unversionedMatch) return unversionedMatch[1]
  return null
}
