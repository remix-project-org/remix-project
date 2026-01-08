/**
 * Remix Wallet API Types
 * Non-custodial wallet storage for users without MetaMask or other wallet extensions
 */

import { StatusEvents } from '@remixproject/plugin-utils'

// ==================== Wallet Types ====================

export interface RemixWallet {
  id: number
  address: string
  name: string
  isPrimary: boolean
  hasSeedBackup: boolean
  createdAt: string
  lastUsedAt: string | null
}

export interface WalletCreateRequest {
  address: string
  encryptedKey: string
  encryptedSeed?: string
  salt: string
  iterations: number
  name?: string
}

export interface WalletUnlockData {
  encryptedKey: string
  salt: string
  iterations: number
  address: string
}

export interface WalletSeedData {
  encryptedSeed: string
  salt: string
  iterations: number
}

export interface WalletListResponse {
  wallets: RemixWallet[]
}

// ==================== Wallet State ====================

export interface WalletState {
  wallets: RemixWallet[]
  activeWallet: RemixWallet | null
  isUnlocked: boolean
  unlockedAddress: string | null
}

// ==================== Wallet Plugin API ====================

export interface IWalletApi {
  events: {
    walletCreated: (wallet: RemixWallet) => void
    walletUnlocked: (address: string) => void
    walletLocked: (address: string) => void
    walletDeleted: (address: string) => void
    walletsUpdated: (wallets: RemixWallet[]) => void
    transactionSigned: (data: { address: string; txHash: string }) => void
    messageSigned: (data: { address: string; signature: string }) => void
    error: (error: { message: string; code?: string }) => void
  } & StatusEvents
  methods: {
    // Wallet Management
    listWallets(): Promise<RemixWallet[]>
    createWallet(password: string, name?: string): Promise<{ address: string; mnemonic: string }>
    deleteWallet(address: string): Promise<void>
    renameWallet(address: string, name: string): Promise<void>
    setPrimaryWallet(address: string): Promise<void>
    
    // Unlock/Lock
    unlockWallet(address: string, password: string): Promise<void>
    lockWallet(address: string): Promise<void>
    isWalletUnlocked(address: string): Promise<boolean>
    getUnlockedAddress(): Promise<string | null>
    
    // Recovery
    exportSeedPhrase(address: string, password: string): Promise<string>
    importWallet(mnemonic: string, password: string, name?: string): Promise<{ address: string }>
    
    // Signing
    signTransaction(address: string, transaction: TransactionRequest): Promise<string>
    signMessage(address: string, message: string): Promise<string>
    signTypedData(address: string, typedData: TypedDataRequest): Promise<string>
    
    // State
    getState(): Promise<WalletState>
    getActiveWallet(): Promise<RemixWallet | null>
  }
}

// ==================== Transaction Types ====================

export interface TransactionRequest {
  to?: string
  from?: string
  value?: string
  data?: string
  gasLimit?: string
  gasPrice?: string
  maxFeePerGas?: string
  maxPriorityFeePerGas?: string
  nonce?: number
  chainId?: number
  type?: number
}

export interface TypedDataRequest {
  domain: {
    name?: string
    version?: string
    chainId?: number
    verifyingContract?: string
  }
  types: Record<string, Array<{ name: string; type: string }>>
  primaryType: string
  message: Record<string, unknown>
}

// ==================== Error Codes ====================

export const WalletErrorCodes = {
  NOT_AUTHENTICATED: 'NOT_AUTHENTICATED',
  WALLET_NOT_FOUND: 'WALLET_NOT_FOUND',
  WALLET_LOCKED: 'WALLET_LOCKED',
  INVALID_PASSWORD: 'INVALID_PASSWORD',
  INVALID_MNEMONIC: 'INVALID_MNEMONIC',
  NO_SEED_BACKUP: 'NO_SEED_BACKUP',
  ENCRYPTION_FAILED: 'ENCRYPTION_FAILED',
  DECRYPTION_FAILED: 'DECRYPTION_FAILED',
  NETWORK_ERROR: 'NETWORK_ERROR',
} as const

export type WalletErrorCode = typeof WalletErrorCodes[keyof typeof WalletErrorCodes]

export class WalletError extends Error {
  constructor(
    message: string,
    public code: WalletErrorCode
  ) {
    super(message)
    this.name = 'WalletError'
  }
}
