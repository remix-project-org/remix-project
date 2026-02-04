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