/**
 * Reads the backend `migration.*` app-config values and decides whether the
 * current origin is one being retired.
 */

export interface MigrationConfig {
  enabled: boolean
  fromDomains: string[]
  toDomain: string
  deadline: string | null
}

/**
 * Strip protocol, path, trailing slash and case so `https://Remix.ethereum.org/`
 * and `remix.ethereum.org` compare equal. Port is significant (localhost:8080).
 */
export function normalizeDomain(value: string): string {
  return String(value || '')
    .trim()
    .replace(/^[a-z]+:\/\//i, '')
    .replace(/\/.*$/, '')
    .toLowerCase()
}

function toDomainList(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : String(value ?? '').split(',')
  return raw.map((entry) => normalizeDomain(String(entry))).filter(Boolean)
}

/** `read` takes a config key and returns the raw backend value. */
export function parseMigrationConfig(read: (key: string) => unknown): MigrationConfig {
  const enabled = read('migration.enabled')
  const deadline = read('migration.deadline')
  return {
    // The backend may serialise booleans as strings.
    enabled: enabled === true || enabled === 'true',
    fromDomains: toDomainList(read('migration.from_domains')),
    toDomain: normalizeDomain(String(read('migration.to_domain') ?? '')),
    deadline: deadline ? String(deadline) : null
  }
}

/**
 * True when this origin is being retired and there is somewhere to go.
 * Guards against prompting on the destination itself, which would otherwise
 * happen if the destination is left in `from_domains` by mistake.
 */
export function shouldPromptMigration(config: MigrationConfig, host: string = window.location.host): boolean {
  if (!config.enabled || !config.toDomain) return false
  const current = normalizeDomain(host)
  if (current === config.toDomain) return false
  return config.fromDomains.includes(current)
}

/** Query param set by the handoff link on the old domain. */
export const HANDOFF_PARAM = 'migrate'

/**
 * True when this page was opened from a handoff link. The wizard is already
 * on screen in that case, so announcing the move again would only be noise.
 *
 * Read-only on purpose: `QueryParams.get()` rewrites `window.location`.
 */
export function isMigrationHandoff(
  hash: string = window.location.hash,
  search: string = window.location.search
): boolean {
  try {
    const inHash = new URLSearchParams(hash.replace(/^#/, '')).get(HANDOFF_PARAM)
    const inSearch = new URLSearchParams(search).get(HANDOFF_PARAM)
    return !!(inHash || inSearch)
  } catch {
    return false
  }
}

/**
 * The current URL without the handoff param, so reloading after an import
 * lands on a normal Remix session instead of reopening the import step.
 *
 * The hash is filtered segment by segment rather than round-tripped through
 * `URLSearchParams`, which would re-encode any other routing state Remix keeps
 * there.
 */
export function urlWithoutHandoff(href: string = window.location.href): string {
  try {
    const url = new URL(href)

    const search = new URLSearchParams(url.search)
    if (search.has(HANDOFF_PARAM)) {
      search.delete(HANDOFF_PARAM)
      const rest = search.toString()
      url.search = rest ? `?${rest}` : ''
    }

    const rawHash = url.hash.replace(/^#/, '')
    if (rawHash) {
      const kept = rawHash.split('&').filter((part) => part && !new RegExp(`^${HANDOFF_PARAM}(=|$)`).test(part))
      if (kept.length !== rawHash.split('&').filter(Boolean).length) {
        url.hash = kept.length ? `#${kept.join('&')}` : ''
      }
    }

    return url.toString()
  } catch {
    return href
  }
}

// ─── Pending confirmation ────────────────────────────────────────

/**
 * Set on the destination once an import succeeds, and cleared when the user
 * comes back from confirming. Without it, reloading to see the imported
 * workspaces would drop the confirmation link and there would be no way back
 * to it.
 */
const PENDING_CONFIRM_KEY = 'remix:migration-pending-confirm'
const DONE_PARAM = 'migrationdone'

/** @param sourceOrigin full origin the archive came from, e.g. `https://remix.ethereum.org` */
export function setPendingConfirmation(sourceOrigin: string): void {
  try {
    localStorage.setItem(PENDING_CONFIRM_KEY, sourceOrigin)
  } catch {
    // storage blocked — the wizard still shows the link in this session
  }
}

export function readPendingConfirmation(): string | null {
  try {
    const value = localStorage.getItem(PENDING_CONFIRM_KEY)
    if (!value) return null
    // Only ever used to build a link back, so it must be a real origin.
    const url = new URL(value)
    return url.protocol.startsWith('http') ? url.origin : null
  } catch {
    return null
  }
}

export function clearPendingConfirmation(): void {
  try {
    localStorage.removeItem(PENDING_CONFIRM_KEY)
  } catch {
    // nothing to undo
  }
}

/** True when the old domain sent the user back after confirming. */
export function isMigrationDoneReturn(
  hash: string = window.location.hash,
  search: string = window.location.search
): boolean {
  try {
    return (
      new URLSearchParams(hash.replace(/^#/, '')).has(DONE_PARAM) ||
      new URLSearchParams(search).has(DONE_PARAM)
    )
  } catch {
    return false
  }
}

// ─── Prompt snoozing ─────────────────────────────────────────────
/** Keyed on the destination so a changed target re-opens the conversation. */
export const migrationDismissKey = (toDomain: string) => `remix:domain-migration:${toDomain}`

const REMIND_DELAY_MS = 3 * 24 * 60 * 60 * 1000

export type MigrationDismissKind = 'remind' | 'never'

export function isMigrationPromptSnoozed(toDomain: string): boolean {
  try {
    const value = localStorage.getItem(migrationDismissKey(toDomain))
    if (!value) return false
    if (value === 'never') return true
    const until = Date.parse(value)
    return !Number.isNaN(until) && Date.now() < until
  } catch {
    return false
  }
}

export function snoozeMigrationPrompt(toDomain: string, kind: MigrationDismissKind): void {
  try {
    localStorage.setItem(
      migrationDismissKey(toDomain),
      kind === 'never' ? 'never' : new Date(Date.now() + REMIND_DELAY_MS).toISOString()
    )
  } catch {
    // storage unavailable — the prompt simply reappears next session
  }
}
