import { endpointUrls } from '@remix-endpoints-helper';
import { parseGraphQLFile } from '@remix-ui/thegraph';

const safeScriptJson = (value: any): string => JSON.stringify(value).replace(/<\//g, '<\\/');

export const getQuickDappGraphSources = (activeDapp: any): any[] => {
  const sources = activeDapp?.dataSources?.theGraph;
  return Array.isArray(sources) ? sources : [];
};

export const hasTheGraphGatewaySources = (activeDapp: any): boolean =>
  getQuickDappGraphSources(activeDapp).some(source => source?.endpointKind === 'thegraph-gateway' || source?.endpointNeedsApiKey === true);

const getGraphSourceId = (source: any): string =>
  source?.filePath || source?.subgraphId || source?.operationName || 'thegraph-source';

const needsGatewayKey = (source: any): boolean =>
  source?.endpointKind === 'thegraph-gateway' || source?.endpointNeedsApiKey === true;

const getQuickdappGraphEndpoint = (): string => {
  return endpointUrls.quickdappGraph;
};

const hasText = (value: any): boolean => typeof value === 'string' && value.trim().length > 0;

const getSubgraphIdFromEndpoint = (endpoint?: string): string | undefined => {
  if (!hasText(endpoint)) return undefined;

  const raw = (endpoint || '').trim();
  const withKeyMatch = raw.match(/^https:\/\/gateway\.thegraph\.com\/api\/([^/]+)\/subgraphs\/id\/([^/?#]+).*$/i);
  const withoutKeyMatch = raw.match(/^https:\/\/gateway\.thegraph\.com\/api\/subgraphs\/id\/([^/?#]+).*$/i);
  return withoutKeyMatch?.[1] || withKeyMatch?.[2];
};

const sanitizeGraphGatewayEndpoint = (endpoint?: string): string | undefined => {
  const subgraphId = getSubgraphIdFromEndpoint(endpoint);
  return subgraphId ? `https://gateway.thegraph.com/api/subgraphs/id/${subgraphId}` : endpoint;
};

const normalizeSubgraphPath = (path: string, workspaceName?: string): string => {
  let normalized = path.replace(/^\/+/, '');
  if (workspaceName && normalized.startsWith(`${workspaceName}/`)) {
    normalized = normalized.substring(workspaceName.length + 1);
  }
  return normalized;
};

const getSubgraphPathCandidates = (source: any, activeDapp: any): string[] => {
  const workspaceName = activeDapp?.sourceWorkspace?.name;
  const candidates = [
    source?.filePath,
    activeDapp?.sourceWorkspace?.filePath
  ].filter(hasText).map((path: string) => normalizeSubgraphPath(path, workspaceName));

  return Array.from(new Set(candidates));
};

const getDeployRepairWorkspaceName = async (plugin: any, activeDapp: any): Promise<string> => {
  if (hasText(activeDapp?.sourceWorkspace?.name)) return activeDapp.sourceWorkspace.name;

  if (activeDapp?.mode === 'inline') {
    try {
      const currentWorkspace = await plugin.call('filePanel', 'getCurrentWorkspace');
      return currentWorkspace?.name || '';
    } catch {
      return '';
    }
  }

  return '';
};

const readSubgraphFileForDeploy = async (
  plugin: any,
  activeDapp: any,
  source: any
): Promise<{ path: string; content: string } | null> => {
  const workspaceName = await getDeployRepairWorkspaceName(plugin, activeDapp);
  if (!workspaceName) return null;

  for (const filePath of getSubgraphPathCandidates(source, activeDapp)) {
    try {
      const content = await plugin.call('filePanel', 'readFileFromWorkspace', workspaceName, filePath);
      return { path: filePath, content };
    } catch {
      // Try the next candidate path.
    }
  }

  return null;
};

const hydrateGraphSourceForDeploy = async (plugin: any, activeDapp: any, source: any): Promise<any> => {
  const needsQuery = !hasText(source?.query);
  const needsSubgraphId = !hasText(source?.subgraphId);

  if (!needsQuery && !needsSubgraphId) return source;

  const subgraphFile = await readSubgraphFileForDeploy(plugin, activeDapp, source);
  if (!subgraphFile) return source;

  try {
    const parsed = parseGraphQLFile(subgraphFile.content);
    const endpoint = hasText(source?.endpoint) ? source.endpoint : parsed.metadata.endpoint;
    const subgraphId = source?.subgraphId || getSubgraphIdFromEndpoint(endpoint);
    const hydrated = {
      ...source,
      filePath: source?.filePath || subgraphFile.path,
      endpoint: sanitizeGraphGatewayEndpoint(endpoint),
      endpointKind: subgraphId ? 'thegraph-gateway' : source?.endpointKind,
      endpointNeedsApiKey: subgraphId ? true : source?.endpointNeedsApiKey,
      apiKeySource: subgraphId ? 'remix-settings' : source?.apiKeySource,
      subgraphId,
      network: source?.network || parsed.metadata.network,
      description: source?.description || parsed.metadata.description,
      query: hasText(source?.query) ? source.query : parsed.query,
      variables: source?.variables !== undefined ? source.variables : parsed.metadata.variables || {},
      operationName: source?.operationName || parsed.operationName,
      operationType: source?.operationType || parsed.operationType
    };

    return hydrated;
  } catch {
    return source;
  }
};

const hydrateGraphSourcesForDeploy = async (plugin: any, activeDapp: any, sources: any[]): Promise<any[]> =>
  Promise.all(sources.map(source => hydrateGraphSourceForDeploy(plugin, activeDapp, source)));

const getRemixAccessToken = (): string => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem('remix_access_token') || '' : '';
  } catch {
    return '';
  }
};

const getTheGraphApiKey = async (plugin: any): Promise<string> => {
  try {
    return await plugin.call('config', 'getAppParameter', 'settings/thegraph-access-token') || '';
  } catch {
    return '';
  }
};

const createProxyToken = async (source: any, apiKey: string): Promise<string> => {
  const sourceId = getGraphSourceId(source);
  if (!source?.subgraphId) throw new Error(`The Graph subgraph ID is required to deploy this DApp. Missing dataSources.theGraph[].subgraphId for ${sourceId}.`);
  if (!source?.query) throw new Error(`The Graph query is required to deploy this DApp. Missing dataSources.theGraph[].query for ${sourceId}.`);

  const authToken = getRemixAccessToken();
  const graphEndpoint = getQuickdappGraphEndpoint();
  const response = await fetch(`${graphEndpoint}/seal`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
    },
    body: JSON.stringify({
      subgraphId: source.subgraphId,
      apiKey,
      query: source.query,
      operationName: source.operationName,
      defaultVariables: source.variables || {}
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Could not prepare The Graph proxy token: ${errorText}`);
  }

  const data = await response.json();
  if (!data?.token) throw new Error('Could not prepare The Graph proxy token.');
  return data.token;
};

export const buildGraphRuntimeConfigScript = async (
  plugin: any,
  activeDapp: any,
  options: { includeApiKey: boolean; target: 'preview' | 'ipfs-deploy' | 'base-ipfs-deploy' }
): Promise<string> => {
  const graphSources = await hydrateGraphSourcesForDeploy(plugin, activeDapp, getQuickDappGraphSources(activeDapp));
  if (graphSources.length === 0) return '';

  const gatewaySources = graphSources.filter(needsGatewayKey);
  const needsApiKey = gatewaySources.length > 0;
  let apiKey = needsApiKey ? await getTheGraphApiKey(plugin) : '';
  const proxyTokens: Record<string, string> = {};

  if (needsApiKey && !options.includeApiKey) {
    if (!apiKey) {
      throw new Error('Add The Graph API key in Remix settings before deploying this DApp.');
    }

    await Promise.all(gatewaySources.map(async source => {
      proxyTokens[getGraphSourceId(source)] = await createProxyToken(source, apiKey);
    }));
    apiKey = '';
  }

  const runtimeSources = graphSources.map(source => ({
    id: getGraphSourceId(source),
    filePath: source?.filePath,
    endpointKind: source?.endpointKind,
    endpointNeedsApiKey: source?.endpointNeedsApiKey === true,
    apiKeySource: options.includeApiKey ? source?.apiKeySource : 'none',
    subgraphId: source?.subgraphId,
    operationName: source?.operationName,
    proxyToken: proxyTokens[getGraphSourceId(source)]
  }));
  const primarySource = runtimeSources[0];

  const runtimeConfig: any = {
    ...(apiKey ? { apiKey } : {}),
    ...(needsApiKey && !options.includeApiKey ? { proxyEndpoint: `${getQuickdappGraphEndpoint()}/query` } : {}),
    ...(primarySource ? { source: primarySource } : {}),
    sources: runtimeSources
  };

  return `<script>window.__QUICK_DAPP_GRAPH_CONFIG__=${safeScriptJson(runtimeConfig)};</script>`;
};
