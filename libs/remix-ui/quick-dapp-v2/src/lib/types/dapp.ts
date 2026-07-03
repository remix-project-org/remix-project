export type DappStatus = 'draft' | 'creating' | 'updating' | 'created' | 'deployed';
export type DappMode = 'workspace' | 'inline';

export interface DappConfig {
  _warning?: string;
  slug: string;
  name: string;
  workspaceName: string;
  mode?: DappMode;
  appKind?: 'contract' | 'graph-only';

  contract?: {
    address: string;
    name: string;
    abi: any[];
    chainId: number | string;
    networkName: string;
  };

  sourceWorkspace?: {
    name: string;
    filePath: string;
  };

  status: DappStatus;
  processingStartedAt?: number | null;
  createdAt: number;
  updatedAt: number;
  lastDeployedAt?: number;

  deployment?: {
    ipfsCid?: string;
    gatewayUrl?: string;
    ensDomain?: string;
  };

  config: {
    title: string;
    details: string;
    logo?: string;
    isBaseMiniApp?: boolean;
  };

  dataSources?: {
    theGraph?: QuickDappGraphContext[];
  };

  thumbnailPath?: string;
}

export interface QuickDappGraphContext {
  source: 'subgraph-file' | 'remixai-chat' | 'manual';
  filePath?: string;
  endpoint: string;
  endpointKind?: 'local' | 'thegraph-gateway' | 'generic-graphql';
  endpointNeedsApiKey?: boolean;
  apiKeySource?: 'remix-settings' | 'none';
  subgraphId?: string;
  network?: string;
  description?: string;
  query: string;
  variables?: Record<string, any>;
  operationName?: string;
  operationType?: 'query' | 'mutation' | 'subscription';
}
