export interface QuickDappGraphPromptContext {
  source?: 'subgraph-file' | 'remixai-chat' | 'manual'
  filePath?: string
  endpoint?: string
  endpointKind?: 'local' | 'thegraph-gateway' | 'generic-graphql'
  endpointNeedsApiKey?: boolean
  apiKeySource?: 'remix-settings' | 'none'
  subgraphId?: string
  network?: string
  description?: string
  query?: string
  variables?: Record<string, any>
  operationName?: string
  operationType?: 'query' | 'mutation' | 'subscription'
}

export interface QuickDappSubgraphValidationPromptContext {
  canGenerateDapp?: boolean
  errors?: string[]
  warnings?: string[]
  missingFields?: string[]
}

export interface QuickDappContractPromptCandidate {
  name: string
  address: string
  chainId: string
}

export interface QuickDappContractHandoffPromptContext {
  candidates: QuickDappContractPromptCandidate[]
  chainId: string
  mode: 'none' | 'single' | 'multiple'
}

const QUICKDAPP_SCOPE_NOTICE = 'Before listing setup options, briefly state this scope once: "QuickDApp publishes a browser-based static frontend. It does not provide a server runtime or secret storage, and selected contract bindings are fixed after creation."'
const QUICKDAPP_GRAPH_ONLY_SCOPE_NOTICE = 'Before listing setup options, briefly state this scope once: "QuickDApp publishes a browser-based static frontend. It does not provide a server runtime or secret storage. This Graph-only DApp is read-only."'

const formatContractCandidatesForPrompt = (candidates: QuickDappContractPromptCandidate[]): string[] =>
  candidates.map((contract, index) =>
    `${index + 1}. ${contract.name} at ${contract.address} on chain ${contract.chainId}`
  )

const getLocationLine = (isDesktop: boolean, graphOnly: boolean): string => {
  if (isDesktop) return '- Location: Inline in /frontend only (Remix Desktop requirement - only option)'
  if (graphOnly) return '- Location: Workspace (default, new dedicated workspace) or Inline (in /frontend folder of current workspace)'
  return '- Location: Workspace (default, new dedicated workspace) or Inline (in /frontend folder of current workspace)'
}

const buildContractHandoffPrompt = (
  contractContext?: QuickDappContractHandoffPromptContext,
  isDesktop = false
): string[] => {
  const context = contractContext || { candidates: [], chainId: 'unknown', mode: 'none' as const }
  const contractLines = formatContractCandidatesForPrompt(context.candidates)

  if (context.mode === 'single') {
    const contract = context.candidates[0]
    return [
      'DEPLOYED_CONTRACT_CANDIDATES:',
      ...contractLines,
      '',
      'STEP 1 - ASK FOR SETUP OPTIONS:',
      QUICKDAPP_SCOPE_NOTICE,
      `Use ${contract.name} at ${contract.address} on chain ${contract.chainId} unless I explicitly ask to choose another contract.`,
      'Ask me once: "How should I create your DApp?"',
      getLocationLine(isDesktop, false),
      '- Base mini-app: No (default) or Yes',
      '- Design: defaults, style notes, or a Figma URL',
      '',
      'Ask exactly those three setup options. Do not ask Theme, Primary Color, DApp Title, Layout, Subgraph, contract choice, or any other design subquestions.',
      'After asking, STOP and wait for my next reply. Do not compile, deploy, call generate_dapp, or write files in the same turn as this setup question.',
      '',
      'STEP 2 - GENERATE DAPP:',
      'After I answer, call generate_dapp with the contractName, contractAddress, and chainId from the single deployed contract above, plus the confirmed setup options.',
      'Include graphContext exactly from the GRAPH_CONTEXT_JSON below. Do not ask for the selected .subgraph file path again.'
    ]
  }

  if (context.mode === 'multiple') {
    return [
      'DEPLOYED_CONTRACT_CANDIDATES:',
      ...contractLines,
      '',
      'STEP 1 - ASK FOR SETUP OPTIONS AND CONTRACT:',
      QUICKDAPP_SCOPE_NOTICE,
      'Ask me once: "How should I create your DApp?"',
      getLocationLine(isDesktop, false),
      '- Base mini-app: No (default) or Yes',
      '- Design: defaults, style notes, or a Figma URL',
      '- Contract: choose one deployed contract from DEPLOYED_CONTRACT_CANDIDATES above',
      '',
      'Ask exactly those four options. Do not ask Theme, Primary Color, DApp Title, Layout, Subgraph, or any other design subquestions.',
      'After asking, STOP and wait for my next reply. Do not compile, deploy, call generate_dapp, or write files in the same turn as this setup question.',
      '',
      'STEP 2 - GENERATE DAPP:',
      'After I answer, call generate_dapp with the selected contractName, contractAddress, and chainId from DEPLOYED_CONTRACT_CANDIDATES, plus the confirmed setup options.',
      'Include graphContext exactly from the GRAPH_CONTEXT_JSON below. Do not ask for the selected .subgraph file path again.'
    ]
  }

  return [
    'DEPLOYED_CONTRACT_CANDIDATES:',
    '- none found',
    '',
    'STEP 1 - ASK FOR GRAPH-ONLY SETUP OPTIONS:',
    QUICKDAPP_GRAPH_ONLY_SCOPE_NOTICE,
    'Ask me once: "How should I create your DApp?"',
    getLocationLine(isDesktop, true),
    '- Base mini-app: No (default) or Yes',
    '- Design: defaults or style notes',
    '',
    'Tell me no deployed contract was found, so this will be a read-only Graph-only DApp unless I explicitly ask to deploy a contract first.',
    'Ask exactly those setup options. Do not ask Theme, Primary Color, DApp Title, Layout, Subgraph, Contract, or any other design subquestions.',
    'After asking, STOP and wait for my next reply. Do not compile, deploy, call generate_graph_dapp, or write files in the same turn as this setup question.',
    '',
    'STEP 2 - GENERATE GRAPH-ONLY DAPP:',
    isDesktop
      ? 'After I answer, call generate_graph_dapp with setupOptionsConfirmed=true, setupOptionsSummary, frontendMode="inline", isBaseMiniApp if selected, description, and graphContext exactly from the GRAPH_CONTEXT_JSON below.'
      : 'After I answer, call generate_graph_dapp with setupOptionsConfirmed=true, setupOptionsSummary, frontendMode ("workspace" or "inline" based on my Location choice), isBaseMiniApp if selected, description, and graphContext exactly from the GRAPH_CONTEXT_JSON below.',
    'Do not call generate_dapp for this no-contract path. Do not ask for the selected .subgraph file path again.'
  ]
}

export const buildCreateDappFromSubgraphPrompt = (args: {
  graphContext: QuickDappGraphPromptContext
  contractContext?: QuickDappContractHandoffPromptContext
  isDesktop?: boolean
}): string => {
  const { graphContext, contractContext, isDesktop = false } = args
  const selectedPath = graphContext.filePath || ''
  const contractInstructions = buildContractHandoffPrompt(contractContext, isDesktop)

  return [
    'I want to create a QuickDapp that uses the selected The Graph .subgraph file as an independent read-only data source.',
    '',
    'SELECTED_SUBGRAPH_FILE_PATH:',
    selectedPath,
    '',
    'IMPORTANT HANDOFF RULES:',
    '- The .subgraph file is already selected and validated. Do not ask me whether I want to use a subgraph, and do not ask me to select it again.',
    '- The selected .subgraph file path is SELECTED_SUBGRAPH_FILE_PATH above and graphContext.filePath below. Do not ask me to provide it again.',
    '- When calling generate_dapp or generate_graph_dapp, include graphContext exactly from GRAPH_CONTEXT_JSON.',
    '- The Graph query may be unrelated to the contract ABI. Treat it as a separate read-only GraphQL data source.',
    '- The contract network/provider rules still come from the deployed contract. Do not infer the wallet network from graphContext.network.',
    '- Do not put The Graph API key values into generated source files, config files, or chat output.',
    '- The Graph API key is not required to ask setup options or generate files. Remix preview/deployment injects runtime Graph config later.',
    '- Keep this flow in QuickDapp_Specialist. Do not delegate to Contract_Runner just to list or select already deployed contracts.',
    '- Use Contract_Runner only if I explicitly ask to compile/deploy a contract. If no deployed contract is available, continue as a Graph-only DApp instead.',
    '',
    ...contractInstructions,
    '',
    'GRAPH_CONTEXT_JSON:',
    '```json',
    JSON.stringify(graphContext, null, 2),
    '```',
    '',
    'Start by asking STEP 1 only, then STOP.'
  ].join('\n')
}

export const buildSubgraphFixPrompt = (args: {
  graphContext: QuickDappGraphPromptContext
  validation?: QuickDappSubgraphValidationPromptContext
}): string => {
  const { graphContext, validation } = args
  return [
    'I tried to create a QuickDapp from the selected The Graph .subgraph file, but the subgraph context is incomplete.',
    '',
    'SELECTED_SUBGRAPH_FILE_PATH:',
    graphContext.filePath || '',
    '',
    'Ask me only for the missing or invalid .subgraph fields listed below. Do not ask QuickDapp setup options until this subgraph context is valid.',
    '',
    `Errors: ${(validation?.errors || []).join(', ') || 'none'}`,
    `Warnings: ${(validation?.warnings || []).join(', ') || 'none'}`,
    `Missing fields: ${(validation?.missingFields || []).join(', ') || 'none'}`,
    '',
    'CURRENT_SUBGRAPH_CONTEXT_JSON:',
    '```json',
    JSON.stringify(graphContext, null, 2),
    '```'
  ].join('\n')
}

export const buildQuickDappGraphGatewayRuntimeRules = (graphContext?: QuickDappGraphPromptContext): string => {
  const subgraphId = graphContext?.subgraphId || '<subgraphId from GRAPH_CONTEXT_JSON>'
  return `\nTHE GRAPH GATEWAY RUNTIME RULES (CRITICAL - MUST IMPLEMENT WHEN endpointKind="thegraph-gateway" OR endpointNeedsApiKey=true):\n` +
    `- The sanitized gateway URL "https://gateway.thegraph.com/api/subgraphs/id/..." is NOT fetchable. It causes "auth error: missing authorization header".\n` +
    `- NEVER create a GRAPHQL_ENDPOINT/GRAPH_ENDPOINT constant with "https://gateway.thegraph.com/api/subgraphs/id/...".\n` +
    `- Store only SUBGRAPH_ID as a constant, for example SUBGRAPH_ID = "${subgraphId}".\n` +
    `- Read Remix-injected runtime config from window.__QUICK_DAPP_GRAPH_CONFIG__.\n` +
    `- Runtime priority: (1) graphConfig.proxyEndpoint + matching source.proxyToken from graphConfig.sources (or graphConfig.source fallback), then (2) Remix preview graphConfig.apiKey, then (3) show a configuration message without fetching.\n` +
    `- Resolve the runtime source with code like: const source = (graphConfig.sources || []).find(s => s.subgraphId === SUBGRAPH_ID) || graphConfig.source || (graphConfig.sources || [])[0];\n` +
    `- Deployed DApps use the sealed proxy path. When proxyToken is available, POST only { token: proxyToken, variables } to graphConfig.proxyEndpoint. Do not send query, apiKey, subgraphId, or operationName to the proxy.\n` +
    `- Remix preview may use graphConfig.apiKey when no proxyToken exists. Only in that preview path, build \`https://gateway.thegraph.com/api/\${apiKey}/subgraphs/id/${subgraphId}\` and POST { query, variables, operationName }.\n` +
    `- Do not render a The Graph API key input. Do not ask the user for a The Graph API key. Do not read or write The Graph API keys in localStorage.\n` +
    `- Missing proxyToken/apiKey is only a runtime configuration state; it is NOT a reason to refuse DApp generation.\n` +
    `- Bad code to avoid: fetch('https://gateway.thegraph.com/api/subgraphs/id/...').\n` +
    `- Good deployed flow: injected proxy token -> POST { token, variables } to Remix proxy.\n`
}

export const buildQuickDappGraphDataSourceInstructions = (args: {
  graphContext: QuickDappGraphPromptContext
  graphOnly?: boolean
}): string => {
  const { graphContext, graphOnly = false } = args
  const graphOnlyIntro = graphOnly
    ? `- This is a Graph-only read-only DApp. Do not create contract, wallet, provider, signer, ethers, transaction, or network switching code.\n`
    : `- This DApp must query The Graph using the provided GraphQL query.\n` +
      `- The Graph query is independent from the smart contract ABI. Do not assume the query entities match the contract.\n` +
      `- The DApp network and wallet rules are still determined by the contract chainId. The Graph network metadata is informational only.\n` +
      `- Create a small GraphQL client/helper, for example src/graphClient.js or src/hooks/useGraphQuery.js.\n`

  const contractSeparationRules = graphOnly
    ? ''
    : `- Do not use ethers provider, RPC provider, or wallet calls to fetch GraphQL data.\n` +
      `- Preserve contract wallet rules separately from GraphQL fetch rules.\n`

  return `\nTHE GRAPH DATA SOURCE:\n` +
    graphOnlyIntro +
    `- The Graph API key is handled by QuickDapp runtime config. Do not refuse generation because an API key is not present during generation.\n` +
    `- Implement a runtime fetch helper that first resolves source from graphConfig.sources (with graphConfig.source fallback), then tries graphConfig.proxyEndpoint + source.proxyToken, then falls back to graphConfig.apiKey for Remix preview only.\n` +
    `- Show loading, error, empty, and success states.\n` +
    `- Never hardcode an actual The Graph API key in generated source files.\n` +
    `- If endpointNeedsApiKey is true, read window.__QUICK_DAPP_GRAPH_CONFIG__ and use proxyEndpoint plus the resolved source.proxyToken when present.\n` +
    `- For proxyToken requests, POST { token, variables } only. The Remix proxy already has the fixed query.\n` +
    `- Do not ask users for a The Graph API key. Do not store The Graph API keys in localStorage.\n` +
    `- For Remix preview only, graphConfig.apiKey may be present; use it only when no proxyToken exists, and POST { query, variables, operationName } to the keyed gateway URL.\n` +
    `- For endpointKind "thegraph-gateway", never fetch the sanitized /api/subgraphs/id/... URL directly.\n` +
    `- If endpointKind is "thegraph-gateway" and neither proxyToken nor preview apiKey is available at runtime, show a configuration message and do not send the GraphQL request yet.\n` +
    `- For IPFS/ENS static deployments, assume the injected runtime config provides a sealed proxy token.\n` +
    contractSeparationRules +
    `\n${buildQuickDappGraphGatewayRuntimeRules(graphContext)}\n` +
    `GRAPH_CONTEXT_JSON:\n${JSON.stringify(graphContext, null, 2)}\n`
}

export const buildExistingGraphDataSourceBlock = (graphSources: QuickDappGraphPromptContext[]): string => {
  if (!Array.isArray(graphSources) || graphSources.length === 0) return ''

  const safeSources = graphSources.map((source, index) => ({
    index: index + 1,
    source: source.source,
    filePath: source.filePath,
    endpoint: source.endpoint,
    endpointKind: source.endpointKind,
    endpointNeedsApiKey: source.endpointNeedsApiKey === true,
    apiKeySource: source.apiKeySource,
    subgraphId: source.subgraphId,
    network: source.network,
    description: source.description,
    operationName: source.operationName,
    operationType: source.operationType,
    variables: source.variables || {},
    query: source.query
  }))

  const raw = JSON.stringify(safeSources, null, 2)
  const graphContext = raw.length > 12000 ? `${raw.substring(0, 12000)}\n... [truncated]` : raw

  return `EXISTING THE GRAPH DATA SOURCES:\n${graphContext}\n\n` +
    `GRAPH DATA PRESERVATION (MANDATORY):\n` +
    `- Preserve existing GraphQL fetch logic unless the user explicitly asks to remove or replace The Graph data.\n` +
    `- Preserve loading, error, empty, and success states for Graph data.\n` +
    `- The Graph API key is handled by QuickDapp runtime config. Never hardcode an API key.\n` +
    `- Preserve window.__QUICK_DAPP_GRAPH_CONFIG__ usage and prefer proxyEndpoint/source.proxyToken for The Graph gateway requests.\n` +
    `- Do not add a runtime The Graph API key input or localStorage key fallback.\n` +
    `- Never hardcode an actual The Graph API key in source files.\n` +
    `- For endpointKind "thegraph-gateway", never fetch the sanitized /api/subgraphs/id/... URL directly.\n` +
    `- Do not use ethers provider, RPC provider, wallet provider, signer, or contract instances to fetch GraphQL data.\n\n`
}

export const buildQuickDappUpdateGraphContextBlock = (graphSources: QuickDappGraphPromptContext[]): string[] => {
  if (!Array.isArray(graphSources) || graphSources.length === 0) return []

  return [
    '',
    'Existing The Graph data sources:',
    ...graphSources.map((source, index) =>
      `- ${index + 1}. ${source.filePath || source.operationName || source.subgraphId || 'thegraph-source'} (${source.endpointKind || 'unknown'}, needsApiKey=${source.endpointNeedsApiKey === true})`
    ),
    'Preserve existing GraphQL fetch logic, loading/error/empty/success states, and QuickDapp runtime Graph config usage. Prefer proxyEndpoint/source.proxyToken for deployed The Graph gateway requests; do not add a runtime API key input or localStorage key fallback unless I explicitly ask to remove The Graph support.'
  ]
}
