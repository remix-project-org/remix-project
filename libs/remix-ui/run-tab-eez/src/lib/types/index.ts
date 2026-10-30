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

export type TraceLegRole = 'origin' | 'batch-post' | 'delivery' | 'table-load' | 'l1-execution'

export interface TraceLeg {
  role: TraceLegRole
  networkLabel: string
  txHash: string
  blockNumber: number | null
  success: boolean | null
  gasUsed: string | null
  error: string | null
  decodedError: string | null
}

export type TraceCallStatus = 'delivered' | 'prepared' | 'not-observed'

export interface TraceCrossChainCall {
  hash: string
  depth: number
  sourceNetworkLabel: string
  sourceAddress: string
  proxyAddress: string | null
  targetNetworkLabel: string
  targetAddress: string | null
  value: string
  isStatic: boolean | null
  functionLabel: string | null
  requestTxHash: string | null
  executionTxHash: string | null
  status: TraceCallStatus
  success: boolean | null
  resultLabel: string | null
}

export interface TraceTokenTransfer {
  networkLabel: string
  txHash: string
  token: string
  symbol: string | null
  amount: string
  from: string
  to: string
  kind: 'transfer' | 'mint' | 'burn'
}

export interface TraceComposerRecord {
  lifecycle: string | null
  reason: string | null
  canonicalL1Block: number | null
}

export interface TraceCheck {
  label: string
  ok: boolean
}

export interface TraceSettlement {
  l1TransactionHash: string
  l1BlockNumber: number
  l2Finalized: boolean
}

export interface TransactionTraceResult {
  txHash: string
  success: boolean
  error: string | null
  decodedError: string | null
  legs: TraceLeg[]
  settlement: TraceSettlement | null
  isL2Origin: boolean
  correlationError: string | null
  linked: boolean
  pendingRoles: TraceLegRole[]
  pendingTimedOut: boolean
  composer: TraceComposerRecord | null
  calls: TraceCrossChainCall[]
  tokenTransfers: TraceTokenTransfer[]
  checks: TraceCheck[]
}

export interface EezWalletRpc {
  chainId: string | null
  isComposer: boolean | null
  canSwitch: boolean
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
  walletRpc: EezWalletRpc
  isSwitchingWalletRpc: boolean
  isWalletRpcAdded: boolean
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
  | { type: 'TRACE_LINKS_UPDATED'; payload: TransactionTraceResult }
  | { type: 'TRACE_LINKS_TIMEOUT'; payload: string }
  | { type: 'SET_WALLET_RPC'; payload: EezWalletRpc }
  | { type: 'START_WALLET_RPC_SWITCH' }
  | { type: 'WALLET_RPC_SWITCH_DONE' }
  | { type: 'WALLET_RPC_ADDED' }
