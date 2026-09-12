export type DappStatus = 'draft' | 'creating' | 'updating' | 'created' | 'deployed';
export type DappMode = 'workspace' | 'inline';
export type ProvingScheme = 'groth16' | 'plonk';
export type PrimeValue = 'bn128' | 'bls12381';
export type ZkVerifyNetwork = 'testnet' | 'mainnet';

export type ZkVerificationMethod = 'zkverify' | 'onchain';

export interface ZkOnChainVerifierConfig {
  address: string;
  abi: any[];
  chainId: number | string;
  networkName?: string;
  contractName?: string;
}

export interface NoirZkArtifacts {
  nargoTomlPath: string;
  circuitSourcePaths: string[];
  proverTomlPath: string;
  programJsonPath: string;
  backendUrl: string;
  wsUrl: string;
}

export interface ZkCircuitConfig {
  circuitName: string;
  circuitPath: string;
  // Defaults to 'circom' for back-compat with dapps created before Noir support existed.
  circuitType?: 'circom' | 'noir';
  // Circom-only fields (absent/unused when circuitType === 'noir').
  provingScheme?: ProvingScheme;
  primeValue?: PrimeValue;
  signalInputs?: string[];
  zkArtifacts?: {
    wasmPath: string;
    zkeyPath: string;
    vkeyPath: string;
  };
  zkVerifyConfig?: {
    network: ZkVerifyNetwork;
  };
  // Noir-only fields (absent/unused when circuitType === 'circom').
  noirArtifacts?: NoirZkArtifacts;
  // Optional for back-compat with dapps created before verification-method selection existed;
  // treated as 'zkverify' when absent. Noir circuits always use 'onchain'.
  verificationMethod?: ZkVerificationMethod;
  onChainVerifier?: ZkOnChainVerifierConfig;
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
