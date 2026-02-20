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

export interface AppState {
  loading: { screen: boolean };
  isAiLoading: boolean;
  view: 'loading' | 'dashboard' | 'editor' | 'create';
  dapps: DappConfig[];
  activeDapp: DappConfig | null;
  instance: any;
  dappProcessing: Record<string, boolean>;
}

export interface QuickDappV2PluginApi {
  call: (plugin: string, method: string, ...args: any[]) => Promise<any>;
  on: (plugin: string, event: string, callback: (...args: any[]) => void) => void;
  emit: (event: string, ...args: any[]) => void;
  event: {
    on: (event: string, callback: (...args: any[]) => void) => void;
    off: (event: string, callback: (...args: any[]) => void) => void;
  };
  updateDapp: (
    slug: string,
    address: string,
    prompt: string | any[],
    files: any,
    image: string | null
  ) => Promise<void>;
}
