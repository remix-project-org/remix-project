import { ImportPatterns } from '../constants/import-patterns'

export function isPotentialVersionConflict(requestedRange: string, resolvedVersion: string): boolean {
  const resolvedMatch = resolvedVersion.match(ImportPatterns.RESOLVED_SEMVER)
  if (!resolvedMatch) return false

  const [, rMajStr, rMinStr, rPatStr] = resolvedMatch
  const resolvedMajor = parseInt(rMajStr, 10)
  const resolvedMinor = parseInt(rMinStr, 10)
  const resolvedPatch = parseInt(rPatStr, 10)

  const caretMatch = requestedRange.match(ImportPatterns.CARET_RANGE)
  if (caretMatch) {
    const [, reqMajStr, reqMinStr, reqPatStr] = caretMatch
    const reqMajor = parseInt(reqMajStr, 10)
    const reqMinor = parseInt(reqMinStr, 10)
    const reqPatch = parseInt(reqPatStr, 10)

    if (resolvedMajor !== reqMajor) return true
    if (resolvedMajor > 0) {
      if (resolvedMinor < reqMinor) return true
      if (resolvedMinor === reqMinor && resolvedPatch < reqPatch) return true
    }
    return false
  }

  const tildeMatch = requestedRange.match(ImportPatterns.TILDE_RANGE)
  if (tildeMatch) {
    const [, reqMajStr, reqMinStr, reqPatStr] = tildeMatch
    const reqMajor = parseInt(reqMajStr, 10)
    const reqMinor = parseInt(reqMinStr, 10)
    const reqPatch = parseInt(reqPatStr, 10)

    if (resolvedMajor !== reqMajor) return true
    if (resolvedMinor !== reqMinor) return true
    if (resolvedPatch < reqPatch) return true
    return false
  }

  const exactMatch = requestedRange.match(ImportPatterns.EXACT_SEMVER)
  if (exactMatch) {
    return requestedRange !== resolvedVersion
  }

  const gteMatch = requestedRange.match(ImportPatterns.GTE_RANGE)
  if (gteMatch) {
    const [, reqMajStr, reqMinStr, reqPatStr] = gteMatch
    const reqMajor = parseInt(reqMajStr, 10)
    const reqMinor = parseInt(reqMinStr, 10)
    const reqPatch = parseInt(reqPatStr, 10)

    if (resolvedMajor < reqMajor) return true
    if (resolvedMajor === reqMajor && resolvedMinor < reqMinor) return true
    if (resolvedMajor === reqMajor && resolvedMinor === reqMinor && resolvedPatch < reqPatch) return true
    return false
  }

  return false
}

export function isBreakingVersionConflict(requestedRange: string, resolvedVersion: string): boolean {
  const resolvedMatch = resolvedVersion.match(ImportPatterns.MAJOR_VERSION)
  if (!resolvedMatch) return false
  const resolvedMajor = parseInt(resolvedMatch[1], 10)

  const rangeMatch = requestedRange.match(ImportPatterns.FIRST_DIGIT)
  if (!rangeMatch) return false
  const requestedMajor = parseInt(rangeMatch[1], 10)

  return resolvedMajor !== requestedMajor
}
