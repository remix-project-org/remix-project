type EndpointUrls = {
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
    gptChat: string;
    rag: string;
    vyper2: string;
    solidityScanWebSocket: string;
    gitHubLoginProxy: string;
    audio;
};

const defaultUrls: EndpointUrls = {
  corsProxy: 'https://gitproxy.api.remix.live',
  mcpCorsProxy: "https://mcp.api.remix.live",
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
  audio: 'https://audio.api.remix.live',
};

const endpointPathMap: Record<keyof EndpointUrls, string> = {
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
  gptChat: 'gpt-chat',
  rag: 'rag',
  vyper2: 'vyper2',
  solidityScanWebSocket: '',
  gitHubLoginProxy: 'github-login-proxy',
  audio: 'audio',
};

const prefix = process.env.NX_ENDPOINTS_URL;

const resolvedUrls: EndpointUrls = prefix
  ? Object.fromEntries(
    Object.entries(defaultUrls).map(([key, _]) => [
      key,
      `${prefix}/${endpointPathMap[key as keyof EndpointUrls]}`,
    ])
  ) as EndpointUrls
  : defaultUrls;

resolvedUrls.solidityScanWebSocket = resolvedUrls.solidityScan.replace(
  'http://',
  'ws://'
);

export const endpointUrls = resolvedUrls;
