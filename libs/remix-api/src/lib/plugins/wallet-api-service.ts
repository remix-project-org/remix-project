/**
 * Wallet API Service - All wallet-related API endpoints with full TypeScript typing
 */

import { IApiClient, ApiResponse } from './api-client'
import {
  RemixWallet,
  WalletCreateRequest,
  WalletUnlockData,
  WalletSeedData,
  WalletListResponse
} from './wallet-api'

/**
 * Wallet API Service - Handles all wallet backend operations
 * Base URL: https://auth.api.remix.live:8443/wallet
 */
export class WalletApiService {
  constructor(private apiClient: IApiClient) {}

  /**
   * List all wallets for the authenticated user
   * GET /wallet
   */
  async listWallets(): Promise<ApiResponse<WalletListResponse>> {
    return this.apiClient.get<WalletListResponse>('')
  }

  /**
   * Create a new wallet
   * POST /wallet
   */
  async createWallet(request: WalletCreateRequest): Promise<ApiResponse<RemixWallet>> {
    return this.apiClient.post<RemixWallet>('', request)
  }

  /**
   * Get wallet data for unlocking (encrypted key + salt)
   * GET /wallet/:address
   */
  async getWalletForUnlock(address: string): Promise<ApiResponse<WalletUnlockData>> {
    return this.apiClient.get<WalletUnlockData>(`/${address}`)
  }

  /**
   * Export encrypted seed phrase
   * GET /wallet/:address/seed
   */
  async getSeedPhrase(address: string): Promise<ApiResponse<WalletSeedData>> {
    return this.apiClient.get<WalletSeedData>(`/${address}/seed`)
  }

  /**
   * Rename a wallet
   * PUT /wallet/:address
   */
  async renameWallet(address: string, name: string): Promise<ApiResponse<{ success: boolean }>> {
    return this.apiClient.put<{ success: boolean }>(`/${address}`, { name })
  }

  /**
   * Set a wallet as primary
   * PUT /wallet/:address/primary
   */
  async setPrimaryWallet(address: string): Promise<ApiResponse<{ success: boolean }>> {
    return this.apiClient.put<{ success: boolean }>(`/${address}/primary`, {})
  }

  /**
   * Delete a wallet
   * DELETE /wallet/:address
   */
  async deleteWallet(address: string): Promise<ApiResponse<{ success: boolean }>> {
    return this.apiClient.delete<{ success: boolean }>(`/${address}`)
  }
}
