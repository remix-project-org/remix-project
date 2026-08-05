import { KurierNetwork } from '../types'

export const KURIER_API_ENDPOINTS: Record<KurierNetwork, string> = {
  testnet: 'https://api-testnet.kurier.xyz/api/v1',
  mainnet: 'https://api.kurier.xyz/api/v1'
}

export const KURIER_API_ENDPOINTS_ALT: Record<KurierNetwork, string> = {
  testnet: 'https://relayer-api-testnet.horizenlabs.io/api/v1',
  mainnet: 'https://relayer-api.horizenlabs.io/api/v1'
}

export const PROOF_TYPE_MAP = {
  circom_groth16: 'groth16',
  circom_plonk: 'plonk',
  noir_ultrahonk: 'ultrahonk'
} as const

export const JOB_POLL_INTERVAL_MS = 3000
export const JOB_TIMEOUT_MS = 300000

export const MAX_RETRIES = 3
export const RETRY_DELAY_MS = 1000
