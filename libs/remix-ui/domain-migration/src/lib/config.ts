/**
 * localStorage settings that travel with a migration archive.
 *
 * This is an allow-list on purpose. A deny-list would leak any future key that
 * happens to hold a credential, so anything not named here simply stays behind.
 */

const ALLOWED_PREFIXES = [
  'config-v0.8:',
  'providerExternals:',
  // Suppresses the first-run welcome guide for users who have already seen it.
  'remix:free-welcome-shown'
]

const ALLOWED_KEYS = [
  'panelStates',
  'pinnedPlugin',
  'currentWorkspace',
  'lastLocalWorkspace',
  'lastCloudWorkspace',
  'recentWorkspaces',
  'workspace',
  'networkDetails',
  'plugins/local',
  'remix-account-preferences',
  'remix-ai-history-sidebar-visible',
  'remixaiassistant_firstload_flag',
  'deepagent_enabled',
  'deepagent_memory_backend'
]

/**
 * Deliberately left behind, with the reason, so this isn't re-litigated:
 *
 *   /                              old localStorage filesystem, huge and obsolete
 *   __test__                       storage probe written by the FS layer
 *   remix_access_token             credentials, must not cross an origin
 *   remix_refresh_token            "
 *   remix_user                     "
 *   remix_anonymous_notification_token  "
 *   gh_id / gh_login               identity without its token; would show a
 *                                  signed-in GitHub user that cannot act
 *   plugins/permissions            security grants, re-ask on the new origin
 *   permissionVersion              pairs with the above
 *   matomo-analytics-consent       consent is per-origin, re-ask
 *   showMatomo                     "
 *   plugins-directory              remote cache, refetched and may be stale
 *   remix-desktop-release-cache    "
 */

/**
 * Applied on top of the allow-list. Credentials must never cross an origin
 * boundary, even if a key is accidentally added above.
 */
const DENY_PATTERNS = [/token/i, /secret/i, /password/i, /passphrase/i, /private[-_]?key/i, /remix_user/i, /auth/i, /session/i]

/** JWTs are the one secret shape likely to hide inside an allow-listed value. */
const JWT_SHAPE = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/

export function isMigratableConfigKey(key: string): boolean {
  if (DENY_PATTERNS.some((p) => p.test(key))) return false
  if (ALLOWED_KEYS.includes(key)) return true
  return ALLOWED_PREFIXES.some((prefix) => key.startsWith(prefix))
}

/** The archive is a file users may pass around, so scan values too. */
export function isMigratableConfigValue(value: string): boolean {
  return !JWT_SHAPE.test(value)
}

export function collectConfig(): Record<string, string> {
  const out: Record<string, string> = {}
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key || !isMigratableConfigKey(key)) continue
      const value = localStorage.getItem(key)
      if (value !== null && isMigratableConfigValue(value)) out[key] = value
    }
  } catch {
    // private mode / storage disabled: settings are optional
  }
  return out
}

/**
 * Write imported settings, re-checking the allow-list because the archive is
 * user-supplied and may have been edited between export and import.
 *
 * Existing local values win so a re-import never clobbers newer preferences.
 */
export function applyConfig(
  config: Record<string, string>,
  overwrite = false
): { applied: number; skipped: number } {
  let applied = 0
  let skipped = 0
  for (const [key, value] of Object.entries(config || {})) {
    if (!isMigratableConfigKey(key) || !isMigratableConfigValue(value)) {
      skipped++
      continue
    }
    try {
      if (!overwrite && localStorage.getItem(key) !== null) {
        skipped++
        continue
      }
      localStorage.setItem(key, value)
      applied++
    } catch {
      skipped++
    }
  }
  return { applied, skipped }
}
