import { endpointUrls } from '@remix-endpoints-helper'
import type { Hex } from 'viem'
import type { DeployedContract } from './types'

export const PARENT_NAME = 'remixcontract.eth'
export const ETHERSCAN_BASE = 'https://etherscan.io'
export const ENS_APP_BASE = 'https://app.ens.domains'
export const POLL_INTERVAL = 2000
export const DEBOUNCE_MS = 600

export const ENS_REVERSE_REGISTRAR_L1 = '0xa58E81fe9b61B5c3fE2AFD33CF304c454AbFc7Cb' as Hex
export const ENS_REVERSE_REGISTRAR_L2 = '0x0000000000D8e504002cC26E3Ec46D81971C1664' as Hex
export const ENS_REGISTRY_L1 = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e' as Hex
export const ENS_PUBLIC_RESOLVER_L1 = '0xF29100983E058B709F3D539b0c765937B804AC15' as Hex
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Hex

export const ENS_REGISTRY_READ_ABI = [
  {
    name: 'resolver',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'node', type: 'bytes32' }],
    outputs: [{ name: '', type: 'address' }],
  },
] as const

export const RESOLVER_NAME_ABI = [
  {
    name: 'name',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'node', type: 'bytes32' }],
    outputs: [{ name: '', type: 'string' }],
  },
] as const

export const REVERSE_REGISTRAR_READ_ABI = [
  {
    name: 'nameForAddr',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'addr', type: 'address' }],
    outputs: [{ name: '', type: 'string' }],
  },
] as const

export const REVERSE_REGISTRAR_ABI_L1 = [
  {
    name: 'setNameForAddr',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'addr', type: 'address' },
      { name: 'owner', type: 'address' },
      { name: 'resolver', type: 'address' },
      { name: 'name', type: 'string' },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
  },
] as const

export const REVERSE_REGISTRAR_ABI_L2 = [
  {
    name: 'setNameForAddr',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'addr', type: 'address' },
      { name: 'name', type: 'string' },
    ],
    outputs: [],
  },
] as const

export const OWNABLE_ABI = [
  {
    name: 'owner',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
] as const

export const SUPPORTED_CHAINS = new Map<number, string>([
  [1, 'Ethereum Mainnet'],
  [8453, 'Base'],
  [42161, 'Arbitrum One'],
  [10, 'OP Mainnet'],
  [59144, 'Linea'],
  [534352, 'Scroll'],
])

export const CHAIN_EXPLORERS: Record<number, { url: string; name: string }> = {
  1: { url: 'https://etherscan.io', name: 'Etherscan' },
  8453: { url: 'https://basescan.org', name: 'Basescan' },
  42161: { url: 'https://arbiscan.io', name: 'Arbiscan' },
  10: { url: 'https://optimistic.etherscan.io', name: 'Etherscan (OP)' },
  59144: { url: 'https://lineascan.build', name: 'Lineascan' },
  534352: { url: 'https://scrollscan.com', name: 'Scrollscan' },
}

export type PreflightStatus =
  | 'idle' | 'checking' | 'available' | 'available_for_chain'
  | 'current' | 'taken' | 'unsupported_chain' | 'parent_not_owned'
  | 'name_not_controlled' | 'project_not_controlled' | 'validation_only'
  | 'error'

export type JobStep = 'pending' | 'checking' | 'creating_project' | 'creating_label' | 'setting_forward' | 'completed' | 'failed'
export type ViewStep = 'input' | 'registering' | 'reverse' | 'done' | 'error'
export type ReverseStatus = 'idle' | 'checking' | 'set' | 'not_set' | 'wrong_chain' | 'unavailable'
export type PrimaryEnsStatus = 'idle' | 'checking' | 'verified' | 'unverified' | 'unavailable'

export const ENS_EVENTS = {
  forwardStatus: 'forwardStatus',
  forwardCompleted: 'forwardCompleted',
  forwardFailed: 'forwardFailed',
  reverseStatus: 'reverseStatus',
  reverseCompleted: 'reverseCompleted',
  reverseFailed: 'reverseFailed',
  primaryEnsStatus: 'primaryEnsStatus',
} as const

export type EnsEventName = typeof ENS_EVENTS[keyof typeof ENS_EVENTS]

export const getEnsEventName = (eventName: EnsEventName, requestId?: string): string =>
  requestId ? `${eventName}:${requestId}` : eventName

export interface TargetChain {
  chainId: number
  name: string
  coinType: number
}

export interface PreflightRequest {
  label: string
  project: string
  chainId: number
  contractAddress: string
}

export interface PreflightResult {
  fullName: string
  targetCoinType: number
  status: PreflightStatus
  currentAddress?: string
  parentOwned: boolean
  estimatedTxCount: number
  steps: string[]
}

export interface JobTransaction {
  type: string
  hash?: string
  gasUsed?: string
  effectiveGasPrice?: string
  gasCostWei?: string
}

export interface JobResult {
  id: string
  status: JobStep
  label?: string
  project?: string
  fullName: string
  chainId?: number
  coinType?: number
  contractAddress?: string
  transactions: JobTransaction[]
  totalGasUsed?: string
  totalCostWei?: string
  error?: string
  createdAt?: number
  completedAt?: number
}

export interface JobCreateResponse {
  jobId?: string
  status: string
  message?: string
  fullName?: string
  error?: string
}

export interface PrimaryEnsLookupResult {
  name: string
  targetCoinType: number
  verified: boolean
  status: 'verified' | 'mismatch' | 'unsupported_chain' | 'no_resolver' | 'unresolved' | 'invalid_name'
  resolvedAddress?: string
}

export interface ReverseCheckParams {
  requestId?: string
  chainId: number
  contractAddress: string
  fullName: string
}

export interface ReverseCheckResult {
  status: ReverseStatus
  name: string
  done: boolean
  message: string
}

export interface PrimaryEnsCheckParams {
  requestId?: string
  chainId: number
  contractAddress: string
}

export interface PrimaryEnsCheckResult {
  status: PrimaryEnsStatus
  name: string
  message: string
}

export interface RegisterForwardParams extends PreflightRequest {
  requestId?: string
}

export const JOB_STEP_LABELS: Record<string, string> = {
  pending: 'Queued...',
  checking: 'Checking name availability...',
  creating_project: 'Creating project subname...',
  creating_label: 'Creating label subname...',
  setting_forward: 'Setting forward record...',
  completed: 'Registration complete!',
  failed: 'Registration failed',
}

export const getReverseRegistrar = (cid: number): Hex => {
  if (cid === 1) return ENS_REVERSE_REGISTRAR_L1
  return ENS_REVERSE_REGISTRAR_L2
}

export const getChainExplorer = (cid: number | null): { url: string; name: string } =>
  (cid && CHAIN_EXPLORERS[cid]) || { url: 'https://etherscan.io', name: 'Etherscan' }

export const buildFullName = (label: string, project: string): string =>
  `${label}.${project}.${PARENT_NAME}`

export const sanitizeLabel = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')

export const getDefaultEnsLabel = (contract: DeployedContract): string => {
  const name = sanitizeLabel(contract.name || contract.contractData?.contract?.name || '')
  return name || `contract-${contract.address.slice(2, 8).toLowerCase()}`
}

export const formatEth = (wei: string): string => {
  const eth = Number(wei) / 1e18
  return eth < 0.000001 ? '<0.000001' : eth.toFixed(6)
}

export const friendlyEnsError = (raw: string): string => {
  if (!raw) return 'An unknown error occurred.'
  if (raw.includes('User rejected') || raw.includes('user rejected') || raw.includes('denied')) {
    return 'Transaction was rejected in your wallet.'
  }
  if (raw.includes('name_not_controlled')) return 'This name exists but is not controlled by the Remix server.'
  if (raw.includes('taken')) return 'This name is already taken by a different address.'
  if (raw.includes('parent_not_owned')) return 'The ENS naming service is not available (parent not owned).'
  if (raw.includes('contract owner')) return 'Only the contract owner can set the reverse name.'
  if (raw.includes('switch your wallet')) return raw
  if (raw.includes('No wallet provider')) return raw
  if (raw.includes('Internal error') || raw.includes('SERVER_ERROR')) {
    return 'Server transaction failed. Please try again later.'
  }
  if (raw.includes('503') || raw.includes('not available')) {
    return 'The ENS naming service is currently unavailable. Please try again later.'
  }
  if (raw.includes('insufficient funds')) return 'Insufficient funds for the transaction.'
  return raw
}

const apiBase = (): string => endpointUrls.ensContractNames

async function readJsonError(response: Response): Promise<string> {
  const fallback = `Server error (${response.status})`
  const data = await response.json().catch(() => null)
  return data?.error || data?.details?.[0]?.message || fallback
}

export async function fetchEnsNetworks(): Promise<TargetChain[]> {
  const response = await fetch(`${apiBase()}/networks`)
  if (!response.ok) throw new Error(`Failed to fetch networks: ${response.status}`)
  return response.json()
}

export async function fetchEnsPreflight(params: PreflightRequest): Promise<PreflightResult> {
  const response = await fetch(`${apiBase()}/preflight`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })

  if (!response.ok) throw new Error(await readJsonError(response))
  return response.json()
}

export async function createEnsJob(params: PreflightRequest): Promise<JobCreateResponse> {
  const response = await fetch(`${apiBase()}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error || `Job creation failed (${response.status})`)
  return data
}

export async function fetchEnsJobStatus(jobId: string): Promise<JobResult> {
  const response = await fetch(`${apiBase()}/jobs/${jobId}`)
  if (!response.ok) throw new Error(`Job not found (${response.status})`)
  return response.json()
}

export async function lookupPrimaryEnsName(params: {
  name: string
  chainId: number
  contractAddress: string
}): Promise<PrimaryEnsLookupResult> {
  const response = await fetch(`${apiBase()}/lookup-primary`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })

  if (!response.ok) throw new Error(await readJsonError(response))
  return response.json()
}
