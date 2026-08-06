/**
 * zkVerify Service - Handles communication with Kurier API
 */

import axios, { AxiosInstance, AxiosError } from 'axios'
import { KurierConfig, ProofType, VKRegistrationRequest, VKRegistrationResponse, ProofSubmissionRequest, ProofSubmissionResponse, JobStatusResponse, Groth16ProofOptions, VerificationResult, ProofData } from '../types'
import { KURIER_API_ENDPOINTS, JOB_POLL_INTERVAL_MS, JOB_TIMEOUT_MS, MAX_RETRIES, RETRY_DELAY_MS } from '../constants'

export class ZkVerifyService {
  private config: KurierConfig
  private client: AxiosInstance

  constructor(config: KurierConfig) {
    this.config = config
    this.client = axios.create({
      baseURL: KURIER_API_ENDPOINTS[config.network],
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000
    })
  }

  updateConfig(config: Partial<KurierConfig>): void {
    this.config = { ...this.config, ...config }
    if (config.network) {
      this.client.defaults.baseURL = KURIER_API_ENDPOINTS[this.config.network]
    }
  }

  getConfig(): KurierConfig {
    return { ...this.config }
  }

  async registerVK(request: VKRegistrationRequest): Promise<VKRegistrationResponse> {
    return this.withRetry(async () => {
      const payload = { proofType: request.proofType, vk: request.vk, proofOptions: request.proofOptions }
      const response = await this.client.post<VKRegistrationResponse>(`/register-vk/${this.config.apiKey}`, payload)

      return response.data
    })
  }

  async submitProof(request: ProofSubmissionRequest): Promise<ProofSubmissionResponse> {
    return this.withRetry(async () => {
      try {
        const response = await this.client.post<ProofSubmissionResponse>(`/submit-proof/${this.config.apiKey}`, request)

        return response.data
      } catch (error) {
        if (axios.isAxiosError(error) && error.response) {
          console.error('Submit proof API error:', error.response.status, error.response.data)
        }
        throw error
      }
    })
  }

  async getJobStatus(jobId: string): Promise<JobStatusResponse> {
    const response = await this.client.get<JobStatusResponse>(`/job-status/${this.config.apiKey}/${jobId}`)

    return response.data
  }

  async waitForJobCompletion(jobId: string, onProgress?: (status: JobStatusResponse) => void): Promise<JobStatusResponse> {
    const startTime = Date.now()

    while (Date.now() - startTime < JOB_TIMEOUT_MS) {
      try {
        const status = await this.getJobStatus(jobId)

        if (onProgress) {
          onProgress(status)
        }
        const normalizedStatus = status.status.toLowerCase()

        if (normalizedStatus === 'completed' || normalizedStatus === 'finalized' || normalizedStatus === 'aggregated' || normalizedStatus === 'failed') {
          return status
        }

        await this.delay(JOB_POLL_INTERVAL_MS)
      } catch (error) {
        // Log but continue polling on transient errors
        console.warn(`Error polling job status: ${error}`)
        await this.delay(JOB_POLL_INTERVAL_MS)
      }
    }

    throw new Error(`Job ${jobId} timed out after ${JOB_TIMEOUT_MS / 1000} seconds`)
  }

  async verifyProof(proofType: ProofType, proof: object | string, publicSignals: string[], vkOrHash: string | object, vkRegistered: boolean, proofOptions?: Groth16ProofOptions, onProgress?: (status: JobStatusResponse) => void): Promise<VerificationResult> {
    try {
      const proofData: ProofData = {
        proof: proof as any,
        publicSignals,
        vk: vkOrHash as any
      }
      const request: ProofSubmissionRequest = {
        proofType,
        vkRegistered,
        proofOptions,
        proofData
      }
      let jobId: string

      try {
        const submitResponse = await this.submitProof(request)

        jobId = submitResponse.jobId
      } catch (submitError) {
        const errorMsg = submitError instanceof Error ? submitError.message : String(submitError)
        console.error('submitProof error:', submitError)

        return {
          success: false,
          jobId: '',
          status: 'failed',
          network: this.config.network,
          error: `Failed to submit proof: ${errorMsg}`
        }
      }
      const finalStatus = await this.waitForJobCompletion(jobId, onProgress)
      const statusLower = finalStatus.status.toLowerCase()
      const success = statusLower === 'completed' || statusLower === 'finalized' || statusLower === 'aggregated' || statusLower === 'includedinblock'

      return {
        success,
        jobId,
        status: finalStatus.status,
        attestationId: finalStatus.attestationId,
        transactionHash: finalStatus.txHash || finalStatus.transactionHash,
        network: this.config.network,
        error: success ? undefined : (finalStatus.error || `Job ended with status: ${finalStatus.status}`)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('verifyProof error:', error)

      return {
        success: false,
        jobId: '',
        status: 'failed',
        network: this.config.network,
        error: message
      }
    }
  }

  static formatGroth16Proof(proof: any, publicSignals: string[], vkOrHash: string | object, vkRegistered: boolean, curve: 'bn128' | 'bls12381' = 'bn128'): ProofSubmissionRequest {
    return {
      proofType: 'groth16',
      vkRegistered,
      proofOptions: {
        library: 'snarkjs',
        curve
      },
      proofData: {
        proof,
        publicSignals,
        vk: vkOrHash as any
      }
    }
  }

  static formatUltraHonkProof(
    proof: string, // hex or base64 encoded
    publicSignals: string[],
    vkOrHash: string | object,
    vkRegistered: boolean
  ): ProofSubmissionRequest {
    return {
      proofType: 'ultrahonk',
      vkRegistered,
      proofData: {
        proof: proof as any,
        publicSignals,
        vk: vkOrHash as any
      }
    }
  }

  private async withRetry<T>(operation: () => Promise<T>, retries: number = MAX_RETRIES): Promise<T> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        if (axios.isAxiosError(error) && error.response?.status &&
            error.response.status >= 400 && error.response.status < 500) {
          throw this.formatError(error)
        }

        if (attempt < retries) {
          await this.delay(RETRY_DELAY_MS * Math.pow(2, attempt))
        }
      }
    }

    throw lastError
  }

  private formatError(error: AxiosError): Error {
    if (error.response?.data) {
      const data = error.response.data as any
      console.error('Kurier API error response:', JSON.stringify(data, null, 2))

      let message = ''
      if (data.detail) {
        if (Array.isArray(data.detail)) {
          message = data.detail.map((d: any) => `${d.loc?.join('.')}: ${d.msg}`).join('; ')
        } else {
          message = data.detail
        }
      } else {
        message = data.message || data.error || JSON.stringify(data)
      }
      return new Error(`Kurier API error (${error.response.status}): ${message}`)
    }
    if (error.request) {
      return new Error(`Network error: Could not reach Kurier API`)
    }
    return new Error(`Request error: ${error.message}`)
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
