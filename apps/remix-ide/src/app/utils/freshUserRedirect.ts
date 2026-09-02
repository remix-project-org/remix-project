/**
 * Sends brand-new visitors straight to the domain Remix is moving to.
 *
 * Two clocks are out of step here. Whether a visitor is "fresh" can only be
 * judged during preload, before the IDE creates its default workspace, while
 * the backend config that enables the redirect normally only arrives once the
 * auth plugin has fetched it. So preload fetches the public config itself —
 * but only for a fresh visitor, so nobody else pays for the request — and the
 * result is cached in localStorage. If that request is slow or fails, the auth
 * plugin still redirects the moment the config lands.
 *
 * Nothing here touches users who already have projects — they get the normal
 * migration flow instead.
 */

import { endpointUrls } from '@remix-endpoints-helper'

/** Set by preload for the current page load; not persisted, it is per-boot. */
const FRESH_FLAG = '__remixVisitIsFresh'

const CONFIG_CACHE_KEY = 'remix:migration-redirect-config'
const OPT_OUT_KEY = 'remix:no-migration-redirect'
const OPT_OUT_FLAG = 'nomigrationredirect'
/** Keyed on the destination so a changed target can still redirect once. */
const redirectedKey = (toDomain: string) => `remix:migration-redirected:${toDomain}`

export interface RedirectConfig {
  enabled: boolean
  /** Host to send fresh visitors to, e.g. 'app.remix.live'. */
  toDomain: string
  /** Hosts the redirect applies to. Empty means "any host but the target". */
  fromDomains: string[]
}

const EMPTY_CONFIG: RedirectConfig = { enabled: false, toDomain: '', fromDomains: []}

/** Strip protocol, path and case so 'https://App.Remix.live/' compares equal to 'app.remix.live'. */
export function normalizeDomain(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/^[a-z]+:\/\//i, '')
    .replace(/\/.*$/, '')
    .toLowerCase()
}

function toDomainList(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : String(value ?? '').split(',')
  return raw.map(normalizeDomain).filter(Boolean)
}

/** `read` takes a config key and returns the raw backend value. */
export function parseRedirectConfig(read: (key: string) => unknown): RedirectConfig {
  const enabled = read('migration.redirect_enabled')
  return {
    // The backend may serialise booleans as strings.
    enabled: enabled === true || enabled === 'true',
    toDomain: normalizeDomain(read('migration.to_domain')),
    fromDomains: toDomainList(read('migration.from_domains'))
  }
}

/** Reads a config value out of either the object or the array shape the API can return. */
export function appConfigReader(raw: unknown): (key: string) => unknown {
  return (key: string) => {
    if (Array.isArray(raw)) return raw.find((entry: any) => entry?.key === key)?.value
    return (raw as any)?.[key]
  }
}

// ─── Per-boot freshness ──────────────────────────────────────────

/**
 * Record whether this page load started with an empty browser storage.
 * Recomputed on every boot on purpose: a user who stays on the old domain and
 * starts working must stop qualifying as fresh.
 */
export function setVisitFreshness(fresh: boolean): void {
  ;(window as any)[FRESH_FLAG] = fresh
}

export function isVisitFresh(): boolean {
  return (window as any)[FRESH_FLAG] === true
}

/** localStorage keys that only exist once someone has actually used Remix here. */
const RETURNING_VISITOR_KEYS = ['currentWorkspace', 'recentWorkspaces', 'remix_user', 'remix_refresh_token']

/**
 * A visitor is fresh when the browser holds no workspaces and no trace of an
 * earlier session on this origin. Called with the workspace answer because
 * only preload knows it, and only before the IDE creates its default one.
 */
export function isFreshBrowser(hasWorkspaces: boolean): boolean {
  if (hasWorkspaces) return false
  try {
    return !RETURNING_VISITOR_KEYS.some((key) => localStorage.getItem(key) !== null)
  } catch {
    return true
  }
}

// ─── Config cache ────────────────────────────────────────────────

export function cacheRedirectConfig(config: RedirectConfig): void {
  try {
    if (!config.enabled || !config.toDomain) localStorage.removeItem(CONFIG_CACHE_KEY)
    else localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(config))
  } catch {
    // storage blocked — the redirect just waits for the config on each visit
  }
}

export function readCachedRedirectConfig(): RedirectConfig {
  try {
    const raw = localStorage.getItem(CONFIG_CACHE_KEY)
    if (!raw) return EMPTY_CONFIG
    const parsed = JSON.parse(raw)
    return {
      enabled: parsed?.enabled === true,
      toDomain: normalizeDomain(parsed?.toDomain),
      fromDomains: Array.isArray(parsed?.fromDomains) ? parsed.fromDomains.map(normalizeDomain) : []
    }
  } catch {
    return EMPTY_CONFIG
  }
}

// ─── Opt-out ─────────────────────────────────────────────────────

/**
 * `?nomigrationredirect` in the URL (or hash) pins the visitor to this origin,
 * for support, e2e runs and anyone deliberately coming back.
 */
export function isRedirectOptedOut(): boolean {
  try {
    const inUrl = `${window.location.search || ''}${window.location.hash || ''}`.indexOf(OPT_OUT_FLAG) !== -1
    if (inUrl) {
      try { localStorage.setItem(OPT_OUT_KEY, 'true') } catch { /* storage blocked */ }
      return true
    }
    return localStorage.getItem(OPT_OUT_KEY) === 'true'
  } catch {
    return false
  }
}

function hasAlreadyRedirected(toDomain: string): boolean {
  try {
    return localStorage.getItem(redirectedKey(toDomain)) !== null
  } catch {
    return false
  }
}

function markRedirected(toDomain: string): void {
  try {
    localStorage.setItem(redirectedKey(toDomain), new Date().toISOString())
  } catch {
    // storage blocked — worst case the back button bounces once more
  }
}

// ─── Decision ────────────────────────────────────────────────────

export function shouldRedirect(config: RedirectConfig, host: string = window.location.host): boolean {
  if (!config.enabled || !config.toDomain) return false
  const current = normalizeDomain(host)
  if (!current || current === config.toDomain) return false
  if (config.fromDomains.length && !config.fromDomains.includes(current)) return false
  return true
}

/** Carries the path and any `#url=` style share params over to the new domain. */
export function redirectTarget(toDomain: string): string {
  const { pathname, search, hash } = window.location
  return `https://${toDomain}${pathname || '/'}${search || ''}${hash || ''}`
}

/**
 * Redirect when this visit is fresh, the config allows it and we have not
 * already sent this browser over — that last check keeps the back button
 * usable for anyone who wants to look at the old domain again.
 *
 * @returns true when a navigation was started, so callers can stop booting.
 */
export function redirectFreshVisitor(
  config: RedirectConfig,
  onRedirect?: (toDomain: string) => void
): boolean {
  if (!isVisitFresh()) return false
  if (!shouldRedirect(config)) return false
  if (isRedirectOptedOut()) return false
  if (hasAlreadyRedirected(config.toDomain)) return false

  markRedirected(config.toDomain)
  onRedirect?.(config.toDomain)
  window.location.replace(redirectTarget(config.toDomain))
  return true
}

/**
 * Public config endpoint, fetched directly rather than through the auth
 * plugin, which only starts once the IDE is already booting.
 */
async function fetchRedirectConfig(timeoutMs = 1200): Promise<RedirectConfig | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const authBaseUrl = endpointUrls.sso.replace(/\/sso\/?$/, '')
    const response = await fetch(`${authBaseUrl}/config/public`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal
    })
    if (!response.ok) return null
    return parseRedirectConfig(appConfigReader(await response.json()))
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Preload entry point. Only a fresh visitor ever pays for the config request;
 * everyone else returns immediately and boots as usual.
 *
 * @returns true when a navigation was started, so the caller can stop booting.
 */
export async function maybeRedirectFreshVisitor(onRedirect?: (toDomain: string) => void): Promise<boolean> {
  if (!isVisitFresh() || isRedirectOptedOut()) return false
  if (redirectFreshVisitor(readCachedRedirectConfig(), onRedirect)) return true

  const config = await fetchRedirectConfig()
  if (!config) return false
  cacheRedirectConfig(config)
  return redirectFreshVisitor(config, onRedirect)
}
