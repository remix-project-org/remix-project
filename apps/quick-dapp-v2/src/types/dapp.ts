export type DappStatus = 'draft' | 'deployed';

export interface DappConfig {
  _warning: string;
  id: string;
  slug: string;
  name: string;
  
  contract: {
    address: string;
    name: string;
    abi: any[];
    chainId: number;
    networkName: string;
  };

  status: DappStatus;
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