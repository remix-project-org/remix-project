export type DappStatus = 'draft' | 'creating' | 'updating' | 'created' | 'deployed';

export interface DappConfig {
  _warning: string;
  id: string;
  slug: string;
  name: string;
  workspaceName: string;

  contract: {
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

  thumbnailPath?: string;
}

// ──────────────────────────────────────────────
// New folder-based DApp model
// DApp lives inside the current workspace as a subfolder (apps/<slug>/),
// with metadata stored in .quickdapp/apps/<slug>.json.
// No workspace switching required.
// ──────────────────────────────────────────────

export interface DappAppConfig {
  id: string;
  name: string;
  /** Relative path from workspace root to DApp frontend folder, e.g. "apps/mytoken-dapp" */
  frontendDir: string;
  status: DappStatus;
  processingStartedAt?: number | null;
  createdAt: number;
  updatedAt: number;

  /** Array of contracts bound to this DApp. Can be empty for frontend-first. */
  contracts: DappContractBinding[];

  deployment?: {
    ipfsCid?: string | null;
    gatewayUrl?: string | null;
    ensDomain?: string | null;
  };

  config: {
    title?: string;
    details?: string;
    logo?: string;
    isBaseMiniApp?: boolean;
  };
}

export interface DappContractBinding {
  /** Unique identifier for this binding, e.g. "mytoken" */
  id: string;
  name: string;
  /** Path to Solidity source relative to workspace root, e.g. "contracts/MyToken.sol" */
  sourceFilePath: string;
  abi: any[];
  deployments: DappContractDeployment[];
  activeDeploymentIndex: number;
}

export interface DappContractDeployment {
  address: string;
  chainId: string | number;
  networkName: string;
  deployedAt: number;
}