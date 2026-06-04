/**
 * ENS Contract Naming — API client for the contract-ens backend.
 */

import { endpointUrls } from '@remix-endpoints-helper'

// ── Types ──

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
  status: 'available' | 'available_for_chain' | 'current' | 'taken' |
    'name_not_controlled' | 'project_not_controlled' | 'unsupported_chain' | 'parent_not_owned' | 'validation_only'
  currentAddress?: string
  parentOwned: boolean
  estimatedTxCount: number
  steps: string[]
}

export interface JobTransaction {
  type: 'project' | 'label' | 'forward'
  hash?: string
  gasUsed?: string
  effectiveGasPrice?: string
  gasCostWei?: string
}

export interface JobStatus {
  id: string
  status: 'pending' | 'checking' | 'creating_project' | 'creating_label' | 'setting_forward' | 'completed' | 'failed'
  label: string
  project: string
  fullName: string
  chainId: number
  coinType: number
  contractAddress: string
  transactions: JobTransaction[]
  totalGasUsed?: string
  totalCostWei?: string
  error?: string
  createdAt: number
  completedAt?: number
}

export interface JobCreateResponse {
  jobId?: string
  status: string
  message?: string
  fullName?: string
  error?: string
}

// ── API Functions ──

function baseUrl(): string {
  return endpointUrls.ensContractNames
}

export async function fetchNetworks(): Promise<TargetChain[]> {
  const res = await fetch(`${baseUrl()}/networks`)
  if (!res.ok) throw new Error(`Failed to fetch networks: ${res.status}`)
  return res.json()
}

export async function fetchPreflight(params: PreflightRequest): Promise<PreflightResult> {
  const res = await fetch(`${baseUrl()}/preflight`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new Error(err.error || `Preflight failed: ${res.status}`)
  }
  return res.json()
}

export async function createJob(params: PreflightRequest): Promise<JobCreateResponse> {
  const res = await fetch(`${baseUrl()}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `Job creation failed: ${res.status}`)
  return data
}

export async function fetchJobStatus(jobId: string): Promise<JobStatus> {
  const res = await fetch(`${baseUrl()}/jobs/${jobId}`)
  if (!res.ok) throw new Error(`Job not found: ${res.status}`)
  return res.json()
}
