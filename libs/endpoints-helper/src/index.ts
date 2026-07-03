/**
 * Remix IDE Endpoint URLs
 *
 * Resolution order:
 * 1. NX_ENDPOINTS_URL set → build all URLs as `${baseUrl}/${path}`
 * 2. No env var → use legacy hardcoded defaultUrls (backward compat)
 *
 * Runtime discovery (optional):
 *   import { fetchRemixConfig, updateEndpoints } from '@remix-endpoints/endpoints-helper'
 *   const config = await fetchRemixConfig('https://api.remix.live')
 *   updateEndpoints(config)
 */

export type EndpointUrls = {
  corsProxy: string;
  mcpCorsProxy: string;
  solidityScan: string;
  ipfsGateway: string;
  commonCorsProxy: string;
  github: string;
  solcoder: string;
  completion: string;
  ghfolderpull: string;
  embedly: string;
  rag: string;
  vyper2: string;
  solidityScanWebSocket: string;
  gitHubLoginProxy: string;
  sso: string;
  billing: string;
  products: string;
  credits: string;
  audio: string;
  storage: string;
  permissions: string;
  walkthroughs: string;
  notifications: string;
  invite: string;
  feedback: string;
  membershipRequests: string;
  workspaceLock: string;
  pimlico: string;
  dappGenerator: string;
  figma: string;
  mcp: string;
  ethskills: string;
  quickdappIpfs: string;
  quickdappGraph: string;
  ensService: string;
  ccipRead: string;
  ensContractNames: string;
  learneth: string;
  rss: string;
  langchain: string
};

/**
 * Service key → path segment mapping (no leading slash).
 * Paths reflect the production /.well-known/remix-config manifest hosted at
 * https://api.remix.live where services are grouped under /endpoints, /ai, etc.
 */
const servicePathMap: Record<keyof Omit<EndpointUrls, 'solidityScanWebSocket' | 'membershipRequests'>, string> = {
  corsProxy: 'endpoints/corsproxy',
  mcpCorsProxy: 'mcp',
  solidityScan: 'endpoints/solidityscan',
  ipfsGateway: 'endpoints/jqgt',
  commonCorsProxy: 'endpoints/common-corsproxy',
  github: 'endpoints/github',
  solcoder: 'ai/solcoder',
  completion: 'ai/completion',
  ghfolderpull: 'endpoints/ghfolderpull',
  embedly: 'endpoints/embedly',
  rag: 'ai/rag',
  vyper2: 'vyper2',
  gitHubLoginProxy: 'endpoints/github-login-proxy',
  sso: 'sso',
  billing: 'billing',
  products: 'products',
  credits: 'credits',
  audio: 'ai/audio',
  storage: 'storage',
  permissions: 'permissions',
  walkthroughs: 'walkthroughs',
  notifications: 'notifications',
  invite: 'invite',
  feedback: 'feedback',
  workspaceLock: 'workspace-lock',
  pimlico: 'endpoints/pimlico',
  dappGenerator: 'ai/dapp-generator',
  figma: 'ai/figma',
  mcp: 'mcp',
  ethskills: 'mcp/ethskills',
  quickdappIpfs: 'endpoints/quickdapp-ipfs',
  quickdappGraph: 'quickdapp-graph',
  ensService: 'endpoints/ens-service',
  ccipRead: 'endpoints/ccip-read',
  ensContractNames: 'endpoints/contract-ens',
  learneth: 'learneth',
  rss: 'endpoints/rss',
  langchain: 'ai/langchain'
};

/** Build all endpoint URLs from a single base URL */
function buildUrls(baseUrl: string): EndpointUrls {
  const base = baseUrl.replace(/\/$/, '');
  const urls = {} as EndpointUrls;

  for (const [key, path] of Object.entries(servicePathMap)) {
    (urls as any)[key] = `${base}/${path}`;
  }

  // Derived endpoints
  urls.membershipRequests = `${base}/permissions/membership-requests/anonymous`;

  // WebSocket variant
  if (base.startsWith('https://')) {
    urls.solidityScanWebSocket = `${base}/${servicePathMap.solidityScan}`.replace('https://', 'wss://');
  } else {
    urls.solidityScanWebSocket = `${base}/${servicePathMap.solidityScan}`.replace('http://', 'ws://');
  }

  return urls;
}

/**
 * Default endpoint URLs — used when NX_ENDPOINTS_URL is not set.
 * Mirrors the production /.well-known/remix-config manifest at https://api.remix.live.
 */
const defaultUrls: EndpointUrls = buildUrls('https://api.remix.live');

// --- Resolution ---
const prefix = ''

const resolvedUrls: EndpointUrls = prefix
  ? buildUrls(prefix)
  : defaultUrls;

export const endpointUrls = resolvedUrls;

// --- Runtime Discovery (Optional) ---

export interface RemixConfig {
  version: number;
  baseUrl: string;
  services: Record<string, string>;
  websockets?: Record<string, string>;
}

/**
 * Fetch the service discovery document from a Remix API base URL.
 * Call once at app startup, then pass result to updateEndpoints().
 *
 * @example
 *   const config = await fetchRemixConfig('https://api.remix.live')
 *   updateEndpoints(config)
 */
export async function fetchRemixConfig(baseUrl: string): Promise<RemixConfig> {
  const url = `${baseUrl.replace(/\/$/, '')}/.well-known/remix-config?v=${Date.now()}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch remix-config: ${res.status}`);
  return res.json();
}

/**
 * Update the live endpoint URLs from a discovery config.
 * Mutates the exported endpointUrls object in-place so all
 * consumers see the updated values immediately.
 */
export function updateEndpoints(config: RemixConfig): void {
  const base = config.baseUrl.replace(/\/$/, '');

  // Map discovery keys back to EndpointUrls keys
  for (const [key, path] of Object.entries(config.services)) {
    if (key in endpointUrls) {
      (endpointUrls as any)[key] = `${base}${path}`;
    }
  }

  // Derived endpoints
  endpointUrls.membershipRequests = `${endpointUrls.permissions}/membership-requests/anonymous`;

  // WebSocket from discovery or derived
  if (config.websockets?.solidityScan) {
    endpointUrls.solidityScanWebSocket = config.websockets.solidityScan;
  } else if (endpointUrls.solidityScan) {
    endpointUrls.solidityScanWebSocket = endpointUrls.solidityScan
      .replace('https://', 'wss://')
      .replace('http://', 'ws://');
  }

  // Handle mcpCorsProxy alias
  if (config.services.mcp) {
    endpointUrls.mcpCorsProxy = `${base}${config.services.mcp}`;
  } // SSO must always point to auth.api.remix.live (separate auth domain)
  //endpointUrls.sso = 'https://auth.api.remix.live/sso';
}

/**
 * Initialize endpoints from service discovery.
 * Uses NX_ENDPOINTS_URL as discovery base if set, otherwise 'https://api.remix.live'.
 * Falls back to current values silently on failure.
 */
export async function initEndpoints(baseUrl?: string): Promise<void> {
  const base = baseUrl || ('https://api.remix.live').replace(/\/$/, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const url = `${base}/.well-known/remix-config?v=${Date.now()}`;
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`Discovery HTTP ${res.status}`);
    const config: RemixConfig = await res.json();
    updateEndpoints(config);
  } catch {
    // Discovery failed — continue with defaults
  } finally {
    clearTimeout(timeout);
  }
}
