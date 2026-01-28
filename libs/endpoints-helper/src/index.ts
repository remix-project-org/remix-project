type EndpointUrls = {
    corsProxy: string;
    mcpCorsProxy: string;
    mcpCorsProxy8443: string;
    solidityScan: string;
    ipfsGateway: string;
    commonCorsProxy: string;
    github: string;
    solcoder: string;
    completion: string;
    ghfolderpull: string;
    embedly: string;
    gptChat: string;
    rag: string;
    vyper2: string;
    solidityScanWebSocket: string;
    gitHubLoginProxy: string;
    sso: string;
    billing: string;
    credits: string;
    audio;
    permissions: string;
};

const defaultUrls: EndpointUrls = {
  corsProxy: 'https://gitproxy.api.remix.live',
  mcpCorsProxy: "https://mcp.api.remix.live",
  mcpCorsProxy8443: "https://mcp.api.remix.live:8443",
  solidityScan: 'https://solidityscan.api.remix.live',
  ipfsGateway: 'https://jqgt.api.remix.live',
  commonCorsProxy: 'https://common-corsproxy.api.remix.live',
  github: 'https://github.api.remix.live',
  solcoder: 'https://solcoder.api.remix.live',
  ghfolderpull: 'https://ghfolderpull.api.remix.live',
  embedly: 'https://embedly.api.remix.live',
  gptChat: 'https://gpt-chat.api.remix.live',
  rag: 'https://rag.api.remix.live',
  vyper2: 'https://vyper2.api.remix.live',
  completion: 'https://completion.api.remix.live',
  solidityScanWebSocket: 'wss://solidityscan.api.remix.live',
  gitHubLoginProxy: 'https://github-login-proxy.api.remix.live',
  sso: 'https://auth.api.remix.live:8443/sso',
  billing: 'https://auth.api.remix.live:8443//billing',
  credits: 'https://auth.api.remix.live:8443/credits',
  audio: 'https://audio.api.remix.live',
  permissions: 'https://auth.api.remix.live:8443/permissions',
};

const endpointPathMap: Record<keyof EndpointUrls, string> = {
  corsProxy: 'corsproxy',
  mcpCorsProxy: 'mcp',
  mcpCorsProxy8443: 'mcp',
  solidityScan: 'solidityscan',
  ipfsGateway: 'jqgt',
  commonCorsProxy: 'common-corsproxy',
  github: 'github',
  solcoder: 'solcoder',
  completion: 'completion',
  ghfolderpull: 'ghfolderpull',
  embedly: 'embedly',
  gptChat: 'gpt-chat',
  rag: 'rag',
  vyper2: 'vyper2',
  solidityScanWebSocket: '',
  gitHubLoginProxy: 'github-login-proxy',
  sso: 'sso',
  billing: 'billing',
  credits: 'credits',
  audio: 'audio',
  permissions: 'permissions',
};

const prefix = process.env.NX_ENDPOINTS_URL;

// Microservices development URLs (individual service ports)
const localhostUrls: EndpointUrls = {
  // PROXY service (port 3005)
  corsProxy: 'http://localhost:3005/corsproxy',
  mcpCorsProxy: 'http://localhost:3005/mcp',
  mcpCorsProxy8443: 'http://localhost:8443/mcp',
  commonCorsProxy: 'http://localhost:3005/common-corsproxy',
  github: 'http://localhost:3005/github',
  ghfolderpull: 'http://localhost:3005/ghfolderpull',
  gitHubLoginProxy: 'http://localhost:3005/github-login-proxy',
  
  // UTILITIES service (port 3007)
  solidityScan: 'http://localhost:3007/solidityscan',
  solidityScanWebSocket: 'ws://localhost:3007/solidityscan',
  
  // PLUGINS service (port 3006)
  ipfsGateway: 'http://localhost:3006/jqgt',
  embedly: 'http://localhost:3006/embedly',
  vyper2: 'http://localhost:3006/vyper2',
  
  // AI service (port 3003)
  solcoder: 'http://localhost:4000/solcoder',
  completion: 'http://localhost:3003/completion',
  gptChat: 'http://localhost:3003/gpt-chat',
  rag: 'http://localhost:3003/rag',
  
  // AUTH service (port 3001)
  sso: 'https://auth.api.remix.live:8443/sso',
  
  // BILLING service (port 3002)
  billing: 'https://auth.api.remix.live:8443//billing',
  credits: 'https://auth.api.remix.live:8443/credits',
  
  // AUDIO service (port 3004)
  audio: 'http://localhost:3004/audio',
  
  // PERMISSIONS service
  permissions: 'https://auth.api.remix.live:8443/permissions',
};

const resolvedUrls: EndpointUrls = prefix
  ? (prefix.includes('localhost')
      ? localhostUrls  // Use direct service ports for localhost
      : Object.fromEntries(  // Use prefix paths for production/ngrok
          Object.entries(defaultUrls).map(([key, _]) => [
            key,
            `${prefix}/${endpointPathMap[key as keyof EndpointUrls]}`,
          ])
        ) as EndpointUrls)
  : defaultUrls;

if (resolvedUrls.solidityScan.startsWith('https://')) {
  resolvedUrls.solidityScanWebSocket = resolvedUrls.solidityScan.replace(
    'https://',
    'wss://'
  );
} else if (resolvedUrls.solidityScan.startsWith('http://')) {
  resolvedUrls.solidityScanWebSocket = resolvedUrls.solidityScan.replace(
    'http://',
    'ws://'
  );
}

export const endpointUrls = resolvedUrls;
