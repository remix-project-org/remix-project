/**
 * Closes the migration loop.
 *
 * After importing on the new domain the user follows a link back here, which
 * is caught before the IDE boots (see AppRenderer) and records that this
 * browser is done with this origin. Every later visit then redirects.
 *
 * The link carries no destination — the backend config is the only source for
 * that. Reading it from the URL would let a crafted link redirect Remix
 * anywhere, permanently.
 */

import {
  fetchRedirectConfig,
  isRedirectOptedOut,
  normalizeDomain,
  readMigrationCompletion,
  redirectTarget,
  writeMigrationCompletion
} from './freshUserRedirect'

export { clearMigrationCompletion, readMigrationCompletion } from './freshUserRedirect'
export type { MigrationCompletion } from './freshUserRedirect'

const CONFIRM_PARAM = 'migrated'

/** True when this load is the "I'm done" link coming back from the new domain. */
export function isConfirmingMigration(
  hash: string = window.location.hash,
  search: string = window.location.search
): boolean {
  try {
    return (
      new URLSearchParams(hash.replace(/^#/, '')).has(CONFIRM_PARAM) ||
      new URLSearchParams(search).has(CONFIRM_PARAM)
    )
  } catch {
    return false
  }
}

export type ConfirmOutcome =
  | { status: 'confirmed'; toDomain: string }
  /** Config unreachable or no destination set. Retryable, never assumed. */
  | { status: 'unavailable' }

/** Record the move against the destination the backend reports. */
export async function confirmMigration(): Promise<ConfirmOutcome> {
  const config = await fetchRedirectConfig()
  const toDomain = normalizeDomain(config?.toDomain)
  if (!toDomain) return { status: 'unavailable' }

  writeMigrationCompletion(toDomain)
  return { status: 'confirmed', toDomain }
}

/**
 * Send a confirmed user on to the new domain. Reads localStorage only, so
 * returning visitors pay nothing for it.
 *
 * Unlike the fresh-visitor redirect this repeats on every visit — the user has
 * said they are done here — with `?nomigrationredirect` as the way back.
 *
 * @returns true when a navigation was started, so the caller can stop booting.
 */
export function redirectConfirmedVisitor(onRedirect?: (toDomain: string) => void): boolean {
  const completion = readMigrationCompletion()
  if (!completion) return false
  if (isConfirmingMigration()) return false
  if (isRedirectOptedOut()) return false
  if (normalizeDomain(window.location.host) === completion.toDomain) return false

  onRedirect?.(completion.toDomain)
  window.location.replace(redirectTarget(completion.toDomain))
  return true
}
