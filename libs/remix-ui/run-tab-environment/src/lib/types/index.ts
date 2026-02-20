import { Plugin } from "@remixproject/engine"
import { Dispatch } from 'react'
// eslint-disable-next-line @nrwl/nx/enforce-module-boundaries
import { EnvironmentPlugin } from 'apps/remix-ide/src/app/udapp/udappEnv'

export interface EnvironmentAppContext {
  plugin: EnvironmentPlugin
  widgetState: WidgetState
  dispatch: Dispatch<Actions>
  themeQuality: string
}

export interface IEnvWidgetContext {
  widgetState: WidgetState
  dispatch: Dispatch<Actions>,
  plugin: EnvironmentPlugin
}

export type NetworkStatus = {
  chainId: string,
  name: string
}

export interface WidgetState {
  providers: {
    defaultProvider: string,
    selectedProvider: string,
    providerList: Provider[],
    isRequesting: boolean,
    isSuccessful: boolean,
    error: string
  },
  accounts: {
    selectedAccount: string,
    defaultAccounts: Account[],
    smartAccounts: SmartAccount[],
    delegations?: { [address: string]: string },
    isRequesting: boolean,
    isSuccessful: boolean,
    error: string
  },
  fork: {
    isVisible: {
      forkUI: boolean,
      resetUI: boolean
    },
    isRequesting: boolean,
    isSuccessful: boolean,
    error: string
  },
  network: NetworkStatus,
  matchPassphrase: string,
  deployedContractsCount: number,
  transactionRecorderCount: number
}

export interface ActionPayloadTypes {
  SET_CURRENT_PROVIDER: string,
  ADD_PROVIDER: Provider,
  REMOVE_PROVIDER: Provider,
  LOADING_ALL_PROVIDERS: undefined,
  COMPLETED_LOADING_ALL_PROVIDERS: undefined,
  LOADING_ALL_ACCOUNTS: undefined,
  COMPLETED_LOADING_ALL_ACCOUNTS: undefined,
  SET_ACCOUNTS: Account[],
  SET_SMART_ACCOUNTS: SmartAccount[],
  SET_SELECTED_ACCOUNT: string,
  SHOW_FORK_UI: undefined,
  HIDE_FORK_UI: undefined,
  SHOW_RESET_UI: undefined,
  HIDE_RESET_UI: undefined,
  REQUEST_FORK: undefined,
  COMPLETED_FORK: undefined,
  ERROR_FORK: string,
  SET_MATCH_PASSPHRASE: string,
  SET_NETWORK_STATUS: NetworkStatus,
  SET_DELEGATION: { account: string, address: string },
  REMOVE_DELEGATION: string,
  SET_DEPLOYED_CONTRACTS_COUNT: number
  SET_TRANSACTION_RECORDER_COUNT: number
}
export interface Action<T extends keyof ActionPayloadTypes> {
  type: T
  payload: ActionPayloadTypes[T]
}

export type Actions = {[A in keyof ActionPayloadTypes]: Action<A>}[keyof ActionPayloadTypes]

export type ProviderConfig = {
    isVM: boolean
    isInjected: boolean
    isRpcForkedState?: boolean
    isVMStateForked?: boolean
    fork: string
    statePath?: string,
    blockNumber?: string
    nodeUrl?: string
    baseBlockNumber?: string
  }

export type Provider = {
    position: number,
    category?: string,
    options: { [key: string]: string }
    dataId: string
    name: string
    displayName: string
    logo?: string,
    logos?: string[],
    description?: string
    config: ProviderConfig
    title: string
    init: () => Promise<void>
    provider:{
      sendAsync: (payload: any) => Promise<void>
      udapp?: Plugin
    }
  }

export type ProviderDetails = {
    position: number,
    name: string,
    displayName: string,
    providerConfig?: ProviderConfig,
    dataId?: string,
    title?: string
    event?: ProviderDetailsEvent,
    networkId?: string,
    urls?: string[],
    nativeCurrency?: { name: string, symbol: string, decimals: number }
    category?: string
}

export type ProviderDetailsEvent = {
  detail: {
    info: {
      name: string
    }
    provider: Provider
  }
}
export interface ExecutionContext {
  event: any;
  executionContext: any;
  lastBlock: any;
  blockGasLimitDefault: number;
  blockGasLimit: number;
  currentFork: string;
  mainNetGenesisHash: string;
  customNetWorks: any;
  blocks: any;
  latestBlockNumber: number;
  txs: any;
  customWeb3: any;
  init(config: any): void;
  getProvider(): any;
  getCurrentFork(): string;
  isVM(): boolean;
  setWeb3(context: any, web3: any): void;
  web3(): any;
  detectNetwork(callback: any): void;
  removeProvider(name: any): void;
  addProvider(network: any): void;
  internalWeb3(): any;
  setContext(context: any, endPointUrl: any, confirmCb: any, infoCb: any): void;
  executionContextChange(value: any, endPointUrl: any, confirmCb: any, infoCb: any, cb: any): Promise<any>;
  currentblockGasLimit(): number;
  stopListenOnLastBlock(): void;
  // eslint-disable-next-line no-undef
  listenOnLastBlockId: NodeJS.Timer;
  _updateChainContext(): Promise<boolean>;
  listenOnLastBlock(): void;
  txDetailsLink(network: any, hash: any): any;
  getStateDetails(): Promise<string>
}

export type Account = {
  alias: string,
  account: string,
  balance: string,
  symbol?: string
}

export type SmartAccount = {
  alias: string,
  account: string,
  balance: string,
  salt: number
  ownerEOA: string
  timestamp: number
  symbol?: string
}