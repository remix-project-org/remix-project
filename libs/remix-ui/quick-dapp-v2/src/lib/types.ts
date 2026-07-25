export type DappStatus = 'draft' | 'creating' | 'updating' | 'created' | 'deployed';
export type ProvingScheme = 'groth16';
export type PrimeValue = 'bn128' | 'bls12381';
export type ZkVerifyNetwork = 'testnet' | 'mainnet';

export interface ZkCircuitConfig {
  circuitName: string;
  circuitPath: string;
  provingScheme: ProvingScheme;
  primeValue: PrimeValue;
  signalInputs: string[];
  zkArtifacts: {
    wasmPath: string;
    zkeyPath: string;
    vkeyPath: string;
  };
  zkVerifyConfig?: {
    network: ZkVerifyNetwork;
  };
}

export interface DappConfig {
  _warning?: string;
  slug: string;
  name: string;
  workspaceName: string;
  mode?: DappMode;
  appKind?: 'contract' | 'graph-only' | 'zk-circuit';

  contract?: {
    address: string;
    name: string;
    abi: any[];
    chainId: number | string;
    networkName: string;
  };

  zkCircuit?: ZkCircuitConfig;

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

  inlineMode?: boolean;
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

export type DappMode = 'workspace' | 'inline';

export interface AppState {
  loading: { screen: boolean };
  isAiLoading: boolean;
  view: 'loading' | 'dashboard' | 'editor' | 'create';
  dapps: DappConfig[];
  activeDapp: DappConfig | null;
  instance: any;
  dappProcessing: Record<string, boolean>;
  generationProgress: GenerationProgress | null;
}

export interface GenerationProgress {
  status: 'preparing' | 'calling_llm' | 'generating_file' | 'parsing' | 'validating' | 'complete';
  slug?: string;
  workspaceName?: string;
  address?: string;
  filename?: string;
  fileCount?: number;
  totalFiles?: number;
  generatedFiles?: string[];
  missingFiles?: string[];
}

export interface QuickDappV2PluginApi {
  call: (plugin: string, method: string, ...args: any[]) => Promise<any>;
  on: (plugin: string, event: string, callback: (...args: any[]) => void) => void;
  emit: (event: string, ...args: any[]) => void;
  event: {
    on: (event: string, callback: (...args: any[]) => void) => void;
    off: (event: string, callback: (...args: any[]) => void) => void;
  };
  consumePendingCreateDapp?: () => any;
}
