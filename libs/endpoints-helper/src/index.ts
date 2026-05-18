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
  quickdappIpfs: string;
  ensService: string;
  ccipRead: string;
  learneth: string;
  rss: string;
  langchain: string;
  langsmith: string;
};

/** Service key → path segment mapping (no leading slash) */
const servicePathMap: Record<keyof Omit<EndpointUrls, 'solidityScanWebSocket' | 'membershipRequests'>, string> = {
  corsProxy: 'corsproxy',
  mcpCorsProxy: 'mcp',
  solidityScan: 'solidityscan',
  ipfsGateway: 'jqgt',
  commonCorsProxy: 'common-corsproxy',
  github: 'github',
  solcoder: 'solcoder',
  completion: 'completion',
  ghfolderpull: 'ghfolderpull',
  embedly: 'embedly',
  rag: 'rag',
  vyper2: 'vyper2',
  gitHubLoginProxy: 'github-login-proxy',
  sso: 'sso',
  billing: 'billing',
  credits: 'credits',
  audio: 'audio',
  storage: 'storage',
  permissions: 'permissions',
  walkthroughs: 'walkthroughs',
  notifications: 'notifications',
  invite: 'invite',
  feedback: 'feedback',
  workspaceLock: 'workspace-lock',
  pimlico: 'pimlico',
  dappGenerator: 'dapp-generator',
  figma: 'figma',
  mcp: 'mcp',
  quickdappIpfs: 'quickdapp-ipfs',
  ensService: 'ens-service',
  ccipRead: 'ccip-read',
  learneth: 'learneth',
  rss: 'rss',
  langchain: 'langchain',
  langsmith: 'langsmith',

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
    urls.solidityScanWebSocket = `${base}/solidityscan`.replace('https://', 'wss://');
  } else {
    urls.solidityScanWebSocket = `${base}/solidityscan`.replace('http://', 'ws://');
  }

  return urls;
}

/** Legacy hardcoded URLs — used when NX_ENDPOINTS_URL is not set */
const defaultUrls: EndpointUrls = {
  corsProxy: 'https://gitproxy.api.remix.live',
  mcpCorsProxy: 'https://mcp.api.remix.live',
  solidityScan: 'https://solidityscan.api.remix.live',
  ipfsGateway: 'https://jqgt.api.remix.live',
  commonCorsProxy: 'https://common-corsproxy.api.remix.live',
  github: 'https://github.api.remix.live',
  solcoder: 'https://solcoder.api.remix.live',
  completion: 'https://completion.api.remix.live',
  ghfolderpull: 'https://ghfolderpull.api.remix.live',
  embedly: 'https://embedly.api.remix.live',
  rag: 'https://rag.api.remix.live',
  vyper2: 'https://vyper2.api.remix.live',
  solidityScanWebSocket: 'wss://solidityscan.api.remix.live',
  gitHubLoginProxy: 'https://github-login-proxy.api.remix.live',
  sso: 'https://auth.api.remix.live/sso',
  billing: 'https://auth.api.remix.live/billing',
  credits: 'https://auth.api.remix.live/credits',
  audio: 'https://audio.api.remix.live',
  storage: 'https://auth.api.remix.live/storage',
  permissions: 'https://auth.api.remix.live/permissions',
  walkthroughs: 'https://auth.api.remix.live/walkthroughs',
  notifications: 'https://auth.api.remix.live/notifications',
  invite: 'https://auth.api.remix.live/invite',
  feedback: 'https://auth.api.remix.live/feedback',
  membershipRequests: 'https://auth.api.remix.live/permissions/membership-requests/anonymous',
  workspaceLock: 'https://auth.api.remix.live/workspace-lock',
  pimlico: 'https://pimlico.api.remix.live',
  dappGenerator: 'https://quickdapp-ai.api.remix.live',
  figma: 'https://quickdapp-figma.api.remix.live',
  mcp: 'https://mcp.api.remix.live',
  quickdappIpfs: 'https://quickdapp-ipfs.api.remix.live',
  ensService: 'https://quickdapp-ens.api.remix.live',
  ccipRead: 'https://quickdapp-ccip.api.remix.live',
  learneth: 'https://learneth.api.remix.live',
  rss: 'https://rss.api.remix.live',
  langchain: 'https://langchain.api.remix.live',
  langsmith: 'http://localhost:3000/langsmith',
  // langsmith: 'https://langchain.api.remix.live/langsmith',
};

// --- Resolution ---
const prefix = process.env.NX_ENDPOINTS_URL;

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
  const url = `${baseUrl.replace(/\/$/, '')}/.well-known/remix-config`;
  const res = await fetch(url);
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
  }

  // SSO must always point to auth.api.remix.live (separate auth domain)
  endpointUrls.sso = 'https://auth.api.remix.live/sso';
 
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
    const url = `${base}/.well-known/remix-config`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Discovery HTTP ${res.status}`);
    const config: RemixConfig = await res.json();
    updateEndpoints(config);
  } catch {
    // Discovery failed — continue with defaults
  } finally {
    clearTimeout(timeout);
  }
}
