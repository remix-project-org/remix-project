// Translate supported import schemes into concrete HTTP(S) URLs for fetching.
// - http(s) passthrough
// - npm ("@scope/pkg@ver/path" or "pkg/path") → https://cdn.jsdelivr.net/npm/<path> (overridable)
// - ipfs://<hash>/<path> → https://ipfs.io/ipfs/<hash>/<path> (overridable)
// - bzz://... or bzz-raw://... → https://swarm-gateways.net/bzz(-raw):/<...> (overridable)

import {
  isHttpUrl,
  isIpfsUrl,
  isSwarmUrl,
  ImportPatterns,
  SWARM_RAW_SCHEME,
  SWARM_SCHEME
} from '../constants/import-patterns'

type RuntimeConfig = { npmURL?: string; ipfsGateway?: string; swarmGateway?: string }

/**
 * Window type extension for Remix compiler configuration
 */
interface RemixCompilerWindow {
  __REMIX_COMPILER_URLS__?: RuntimeConfig
  REMIX_COMPILER_URLS?: RuntimeConfig
}

/**
 * Get global window object in a cross-environment compatible way
 */
function getGlobalWindow(): RemixCompilerWindow | undefined {
  if (typeof window !== 'undefined') {
    return window as unknown as RemixCompilerWindow
  }
  if (typeof globalThis !== 'undefined' && 'window' in globalThis) {
    return (globalThis as { window?: RemixCompilerWindow }).window
  }
  return undefined
}

function getRuntimeConfig(): RuntimeConfig | undefined {
  try {
    // Prefer browser window; fallback to globalThis.window if present in tests
    const w = getGlobalWindow()
    const cfg = w?.__REMIX_COMPILER_URLS__ || w?.REMIX_COMPILER_URLS
    if (cfg && typeof cfg === 'object') return cfg
  } catch {}
  return undefined
}

function toNpmCdn(url: string) {
  // Map bare npm path like "@scope/pkg@1.2.3/file" or "@scope/pkg/file" to CDN
  const runtime = getRuntimeConfig()
  const base = (runtime?.npmURL ? runtime.npmURL.replace(/\/+$/, '') : 'https://cdn.jsdelivr.net/npm')
  return `${base}/${url}`
}

function toIpfsGateway(url: string) {
  // ipfs://[ipfs/]<hash>/<path?> → https://ipfs.io/ipfs/<hash>/<path?>
  const m = url.match(ImportPatterns.IPFS_URL)
  if (!m) return url
  const hash = m[1]
  const path = m[2] ? `/${m[2]}` : ''
  const runtime = getRuntimeConfig()
  const base = (runtime?.ipfsGateway ? runtime.ipfsGateway.replace(/\/+$/, '') : 'https://ipfs.io/ipfs')
  return `${base}/${hash}${path}`
}

function toSwarmGateway(url: string) {
  // bzz://<hash>/<path?> or bzz-raw://<hash>/<path?> → swarm gateways
  const raw = url.startsWith(SWARM_RAW_SCHEME)
  const clean = url.replace(SWARM_RAW_SCHEME, '').replace(SWARM_SCHEME, '')
  const prefix = raw ? 'bzz-raw:/' : 'bzz:/'
  const runtime = getRuntimeConfig()
  const base = (runtime?.swarmGateway ? runtime.swarmGateway.replace(/\/+$/, '') : 'https://swarm-gateways.net')
  return `${base}/${prefix}${clean}`
}

export function toHttpUrl(url: string): string {
  if (isHttpUrl(url)) return url
  if (isIpfsUrl(url)) return toIpfsGateway(url)
  if (isSwarmUrl(url)) return toSwarmGateway(url)
  // Fallback: treat as npm path
  return toNpmCdn(url)
}
