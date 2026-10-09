import React from 'react'
// eslint-disable-next-line @nrwl/nx/enforce-module-boundaries
import type { EezPlugin } from 'apps/remix-ide/src/app/udapp/udappEez'

export interface EezNetworkEntry {
  id: string
  label: string
  // From EEZ_COMPOSER_RPC_URLS, else Settings > EEZ; null when no RPC is configured for this chain.
  rpcUrl: string | null
  eezContractAddress: string
  rollupId: string
  chainId: string
}

export type EezComposerNetwork = number | string

export interface EezComposerInfo {
  eezContracts: {
    eezRegistryAddress: string
    eezRollupManagerAddress?: string
    eezL1BridgeSender?: string
    [contractName: string]: string | undefined
  }
  supportedNetworks: Record<string, EezComposerNetwork>
  version: string
}

export interface ResolutionRow {
  network: EezNetworkEntry
  isOrigin: boolean
  proxyAddress: string | null
  isDeployed: boolean | null
  error: string | null
}

export interface CreatedProxyEntry {
  proxyAddress: string
  txHash: string
  originNetworkLabel: string
  originAddress: string
  destinationNetworkLabel: string
  timestamp: number
}

export interface ResolvedProxyInfo {
  originalAddress: string
  originalRollupId: string
  originNetworkLabel: string | null
}

export interface TraceProxyInfo {
  address: string
  hops: ResolvedProxyInfo[]
}

export interface TransactionTraceResult {
  txHash: string
  success: boolean
  error: string | null
  decodedError: string | null
  proxies: TraceProxyInfo[]
  proxyCount: number
}

export interface EezWidgetState {
  networks: EezNetworkEntry[]
  isDiscovering: boolean
  originNetworkChainId: string | null
  addressInput: string
  isResolving: boolean
  resolutionRows: ResolutionRow[]
  resolutionError: string | null
  showCreateDialog: boolean
  createdProxies: CreatedProxyEntry[]
  creator: {
    originNetworkId: string
    originAddress: string
    isPreviewing: boolean
    previewAddress: string | null
    previewIsDeployed: boolean | null
    previewError: string | null
    isCreating: boolean
    createError: string | null
    createdTxHash: string | null
  }
  traceTxHash: string
  isTracing: boolean
  traceResult: TransactionTraceResult | null
  traceError: string | null
}

export interface EezAppContextType {
  widgetState: EezWidgetState
  dispatch: React.Dispatch<Actions>
  plugin: EezPlugin
  themeQuality: string
}

export type Actions =
  | { type: 'SET_NETWORKS'; payload: EezNetworkEntry[] }
  | { type: 'SET_DISCOVERING'; payload: boolean }
  | { type: 'SET_ORIGIN_NETWORK_CHAIN_ID'; payload: string | null }
  | { type: 'SET_ADDRESS_INPUT'; payload: string }
  | { type: 'SHOW_CREATE_DIALOG'; payload: boolean }
  | { type: 'START_RESOLVE' }
  | { type: 'RESOLVE_SUCCESS'; payload: ResolutionRow[] }
  | { type: 'RESOLVE_ERROR'; payload: string }
  | { type: 'SET_CREATOR_ORIGIN_NETWORK'; payload: string }
  | { type: 'SET_CREATOR_ORIGIN_ADDRESS'; payload: string }
  | { type: 'START_PREVIEW' }
  | { type: 'PREVIEW_SUCCESS'; payload: { previewAddress: string; previewIsDeployed: boolean } }
  | { type: 'PREVIEW_ERROR'; payload: string }
  | { type: 'START_CREATE' }
  | { type: 'CREATE_SUCCESS'; payload: { txHash: string; proxyAddress: string; originNetworkLabel: string; originAddress: string; destinationNetworkLabel: string } }
  | { type: 'CREATE_ERROR'; payload: string }
  | { type: 'SET_THEME_QUALITY'; payload: string }
  | { type: 'NETWORK_CHANGED' }
  | { type: 'SET_TRACE_TX_HASH'; payload: string }
  | { type: 'START_TRACE' }
  | { type: 'TRACE_SUCCESS'; payload: TransactionTraceResult }
  | { type: 'TRACE_ERROR'; payload: string }
