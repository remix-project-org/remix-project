/**
 * zkVerify (Kurier) Type Definitions
 */
export type ProofType = 'groth16' | 'plonk' | 'ultrahonk' | 'ultraplonk' | 'fflonk'
export type KurierNetwork = 'testnet' | 'mainnet'

export interface KurierConfig {
  network: KurierNetwork
  apiKey: string
}

export interface Groth16ProofOptions {
  library: 'snarkjs' | 'rapidsnark' | 'gnark'
  curve: 'bn128' | 'bn254' | 'bls12381'
}

export interface Groth16Proof {
  pi_a: string[]
  pi_b: string[][]
  pi_c: string[]
  protocol: string
  curve: string
}

export interface ProofData {
  proof: Groth16Proof | string
  publicSignals: string[]
  vk: string | object
}

export interface VKRegistrationRequest {
  proofType: ProofType
  vk: object | string
  proofOptions?: Groth16ProofOptions
}

export interface VKRegistrationResponse {
  vkHash: string
  transactionHash?: string
}

export interface ProofSubmissionRequest {
  proofType: ProofType
  vkRegistered: boolean
  proofOptions?: Groth16ProofOptions
  proofData: ProofData
  submissionMode?: 'direct' | 'aggregated'
  chainId?: number
}

export interface ProofSubmissionResponse {
  jobId: string
  optimisticVerify?: string
}

export type JobStatus = 'Submitted' | 'IncludedInBlock' | 'Finalized' | 'Aggregated' | 'failed' | 'pending' | 'processing' | 'completed'

export interface JobStatusResponse {
  jobId: string
  status: JobStatus
  statusId?: number
  proofType?: string
  txHash?: string
  transactionHash?: string
  blockHash?: string
  attestationId?: string
  error?: string
  completedAt?: string
}

export interface VerificationResult {
  success: boolean
  jobId: string
  status: JobStatus
  attestationId?: string
  transactionHash?: string
  network: KurierNetwork
  error?: string
}
