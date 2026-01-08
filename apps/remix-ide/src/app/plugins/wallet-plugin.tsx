/**
 * Remix Wallet Plugin
 * 
 * Non-custodial wallet management for Remix IDE users.
 * Provides secure key generation, storage, and signing capabilities
 * for users who don't have MetaMask or other wallet extensions.
 * 
 * Security Model:
 * - Keys are generated entirely client-side
 * - Private keys are encrypted with user's password before sending to server
 * - Server stores double-encrypted blobs (can't decrypt)
 * - Decryption happens only in browser, private key never leaves client unencrypted
 */

import { Plugin } from '@remixproject/engine'
import { Wallet } from 'ethers'
import { 
  RemixWallet, 
  WalletState, 
  TransactionRequest, 
  TypedDataRequest,
  WalletError, 
  WalletErrorCodes,
  ApiClient,
  WalletApiService 
} from '@remix-api'
import { endpointUrls } from '@remix-endpoints-helper'
import {
  generateWallet,
  recoverWalletFromMnemonic,
  encryptWallet,
  decryptPrivateKey,
  decryptSeedPhrase,
  validatePassword,
  clearSensitiveData,
  GeneratedWallet
} from './wallet-crypto'

const profile = {
  name: 'remixWallet',
  displayName: 'Remix Wallet',
  description: 'Secure non-custodial wallet for Remix IDE users',
  methods: [
    'listWallets',
    'createWallet',
    'deleteWallet',
    'renameWallet',
    'setPrimaryWallet',
    'unlockWallet',
    'lockWallet',
    'isWalletUnlocked',
    'getUnlockedAddress',
    'exportSeedPhrase',
    'importWallet',
    'signTransaction',
    'signMessage',
    'signTypedData',
    'getState',
    'getActiveWallet',
    'getAccounts'
  ],
  events: [
    'walletCreated',
    'walletUnlocked',
    'walletLocked',
    'walletDeleted',
    'walletsUpdated',
    'transactionSigned',
    'messageSigned',
    'error'
  ]
}

interface UnlockedWallet {
  address: string
  privateKey: Uint8Array
  ethersWallet: Wallet
}

export class RemixWalletPlugin extends Plugin {
  private apiClient: ApiClient
  private walletApi: WalletApiService
  private wallets: RemixWallet[] = []
  private unlockedWallets: Map<string, UnlockedWallet> = new Map()
  private activeAddress: string | null = null

  constructor() {
    super(profile)
    
    // Initialize API client for wallet endpoints
    this.apiClient = new ApiClient(endpointUrls.wallet)
    this.walletApi = new WalletApiService(this.apiClient)
  }

  async onActivation(): Promise<void> {
    console.log('[RemixWallet] Plugin activated')
    
    // Set up auth token from localStorage
    const token = localStorage.getItem('remix_access_token')
    if (token) {
      this.apiClient.setToken(token)
    }
    
    // Listen for auth state changes
    this.on('auth', 'authStateChanged', (authState: any) => {
      if (authState.token) {
        this.apiClient.setToken(authState.token)
        // Refresh wallet list when user logs in
        this.refreshWalletList().catch(console.error)
      } else {
        // User logged out - lock all wallets
        this.lockAllWallets()
      }
    })
    
    // Load wallets if user is authenticated
    if (token) {
      await this.refreshWalletList()
    }
  }

  onDeactivation(): void {
    // Lock all wallets and clear sensitive data
    this.lockAllWallets()
    this.off('auth', 'authStateChanged')
  }

  /**
   * Refresh the wallet list from the server
   */
  private async refreshWalletList(): Promise<void> {
    try {
      const response = await this.walletApi.listWallets()
      if (response.ok && response.data) {
        this.wallets = response.data.wallets || []
        this.emit('walletsUpdated', this.wallets)
      }
    } catch (error) {
      console.error('[RemixWallet] Failed to refresh wallet list:', error)
    }
  }

  /**
   * Lock all unlocked wallets
   */
  private lockAllWallets(): void {
    for (const [address, wallet] of this.unlockedWallets) {
      clearSensitiveData(wallet.privateKey)
      this.emit('walletLocked', address)
    }
    this.unlockedWallets.clear()
    this.activeAddress = null
  }

  /**
   * Ensure user is authenticated
   */
  private async ensureAuthenticated(): Promise<void> {
    const token = localStorage.getItem('remix_access_token')
    if (!token) {
      throw new WalletError('Please log in to use Remix Wallet', WalletErrorCodes.NOT_AUTHENTICATED)
    }
    this.apiClient.setToken(token)
  }

  // ==================== Public API ====================

  /**
   * List all wallets for the current user
   */
  async listWallets(): Promise<RemixWallet[]> {
    await this.ensureAuthenticated()
    await this.refreshWalletList()
    return this.wallets
  }

  /**
   * Create a new wallet
   * @param password Password to encrypt the wallet
   * @param name Optional name for the wallet
   * @returns The new wallet address and mnemonic (show mnemonic once!)
   */
  async createWallet(password: string, name?: string): Promise<{ address: string; mnemonic: string }> {
    await this.ensureAuthenticated()
    
    // Validate password
    const passwordError = validatePassword(password)
    if (passwordError) {
      throw new WalletError(passwordError, WalletErrorCodes.INVALID_PASSWORD)
    }
    
    // Generate wallet client-side
    const wallet = await generateWallet()
    
    try {
      // Encrypt wallet data
      const encrypted = await encryptWallet(wallet, password)
      
      // Store on server
      const response = await this.walletApi.createWallet({
        address: encrypted.address,
        encryptedKey: encrypted.encryptedKey,
        encryptedSeed: encrypted.encryptedSeed,
        salt: encrypted.salt,
        iterations: encrypted.iterations,
        name
      })
      
      if (!response.ok || !response.data) {
        throw new WalletError(
          response.error || 'Failed to create wallet',
          WalletErrorCodes.NETWORK_ERROR
        )
      }
      
      // Update local state
      await this.refreshWalletList()
      
      // Emit event
      this.emit('walletCreated', response.data)
      
      // Return address and mnemonic (user should save this!)
      return {
        address: wallet.address,
        mnemonic: wallet.mnemonic
      }
    } finally {
      // Clear sensitive data from memory
      clearSensitiveData(wallet.privateKey)
    }
  }

  /**
   * Import a wallet from mnemonic
   */
  async importWallet(mnemonic: string, password: string, name?: string): Promise<{ address: string }> {
    await this.ensureAuthenticated()
    
    // Validate password
    const passwordError = validatePassword(password)
    if (passwordError) {
      throw new WalletError(passwordError, WalletErrorCodes.INVALID_PASSWORD)
    }
    
    // Recover wallet from mnemonic
    const wallet = await recoverWalletFromMnemonic(mnemonic)
    
    try {
      // Check if wallet already exists
      const existingWallet = this.wallets.find(w => w.address.toLowerCase() === wallet.address.toLowerCase())
      if (existingWallet) {
        throw new WalletError('This wallet already exists in your account', WalletErrorCodes.WALLET_NOT_FOUND)
      }
      
      // Encrypt wallet data
      const encrypted = await encryptWallet(wallet, password)
      
      // Store on server
      const response = await this.walletApi.createWallet({
        address: encrypted.address,
        encryptedKey: encrypted.encryptedKey,
        encryptedSeed: encrypted.encryptedSeed,
        salt: encrypted.salt,
        iterations: encrypted.iterations,
        name: name || 'Imported Wallet'
      })
      
      if (!response.ok || !response.data) {
        throw new WalletError(
          response.error || 'Failed to import wallet',
          WalletErrorCodes.NETWORK_ERROR
        )
      }
      
      // Update local state
      await this.refreshWalletList()
      
      // Emit event
      this.emit('walletCreated', response.data)
      
      return { address: wallet.address }
    } finally {
      // Clear sensitive data from memory
      clearSensitiveData(wallet.privateKey)
    }
  }

  /**
   * Delete a wallet
   */
  async deleteWallet(address: string): Promise<void> {
    await this.ensureAuthenticated()
    
    // Lock wallet first if unlocked
    if (this.unlockedWallets.has(address.toLowerCase())) {
      await this.lockWallet(address)
    }
    
    const response = await this.walletApi.deleteWallet(address)
    
    if (!response.ok) {
      throw new WalletError(
        response.error || 'Failed to delete wallet',
        WalletErrorCodes.NETWORK_ERROR
      )
    }
    
    // Update local state
    await this.refreshWalletList()
    
    this.emit('walletDeleted', address)
  }

  /**
   * Rename a wallet
   */
  async renameWallet(address: string, name: string): Promise<void> {
    await this.ensureAuthenticated()
    
    const response = await this.walletApi.renameWallet(address, name)
    
    if (!response.ok) {
      throw new WalletError(
        response.error || 'Failed to rename wallet',
        WalletErrorCodes.NETWORK_ERROR
      )
    }
    
    await this.refreshWalletList()
  }

  /**
   * Set a wallet as primary
   */
  async setPrimaryWallet(address: string): Promise<void> {
    await this.ensureAuthenticated()
    
    const response = await this.walletApi.setPrimaryWallet(address)
    
    if (!response.ok) {
      throw new WalletError(
        response.error || 'Failed to set primary wallet',
        WalletErrorCodes.NETWORK_ERROR
      )
    }
    
    await this.refreshWalletList()
  }

  /**
   * Unlock a wallet with password
   */
  async unlockWallet(address: string, password: string): Promise<void> {
    await this.ensureAuthenticated()
    
    const normalizedAddress = address.toLowerCase()
    
    // Check if already unlocked
    if (this.unlockedWallets.has(normalizedAddress)) {
      this.activeAddress = normalizedAddress
      return
    }
    
    // Fetch encrypted key from server
    const response = await this.walletApi.getWalletForUnlock(address)
    
    if (!response.ok || !response.data) {
      throw new WalletError(
        response.error || 'Wallet not found',
        WalletErrorCodes.WALLET_NOT_FOUND
      )
    }
    
    const { encryptedKey, salt, iterations } = response.data
    
    // Decrypt private key
    let privateKey: Uint8Array
    try {
      privateKey = await decryptPrivateKey(encryptedKey, salt, iterations, password)
    } catch (error) {
      throw new WalletError('Invalid password', WalletErrorCodes.INVALID_PASSWORD)
    }
    
    // Create ethers wallet - convert Uint8Array to hex string
    const privateKeyHex = '0x' + Array.from(privateKey).map(b => b.toString(16).padStart(2, '0')).join('')
    const ethersWallet = new Wallet(privateKeyHex)
    
    // Store unlocked wallet
    this.unlockedWallets.set(normalizedAddress, {
      address: normalizedAddress,
      privateKey,
      ethersWallet
    })
    
    this.activeAddress = normalizedAddress
    
    this.emit('walletUnlocked', address)
  }

  /**
   * Lock a wallet (clear private key from memory)
   */
  async lockWallet(address: string): Promise<void> {
    const normalizedAddress = address.toLowerCase()
    const wallet = this.unlockedWallets.get(normalizedAddress)
    
    if (wallet) {
      clearSensitiveData(wallet.privateKey)
      this.unlockedWallets.delete(normalizedAddress)
      
      if (this.activeAddress === normalizedAddress) {
        // Set active to another unlocked wallet, or null
        const remaining = Array.from(this.unlockedWallets.keys())
        this.activeAddress = remaining.length > 0 ? remaining[0] : null
      }
      
      this.emit('walletLocked', address)
    }
  }

  /**
   * Check if a wallet is unlocked
   */
  async isWalletUnlocked(address: string): Promise<boolean> {
    return this.unlockedWallets.has(address.toLowerCase())
  }

  /**
   * Get the currently active unlocked address
   */
  async getUnlockedAddress(): Promise<string | null> {
    return this.activeAddress
  }

  /**
   * Get all accounts (unlocked wallet addresses)
   * This is used by the blockchain provider
   */
  async getAccounts(): Promise<string[]> {
    return Array.from(this.unlockedWallets.keys())
  }

  /**
   * Export the seed phrase for a wallet
   */
  async exportSeedPhrase(address: string, password: string): Promise<string> {
    await this.ensureAuthenticated()
    
    // Fetch encrypted seed from server
    const response = await this.walletApi.getSeedPhrase(address)
    
    if (!response.ok || !response.data) {
      if (response.error?.includes('NO_SEED_BACKUP')) {
        throw new WalletError('No seed backup available for this wallet', WalletErrorCodes.NO_SEED_BACKUP)
      }
      throw new WalletError(
        response.error || 'Failed to fetch seed phrase',
        WalletErrorCodes.NETWORK_ERROR
      )
    }
    
    const { encryptedSeed, salt, iterations } = response.data
    
    // Decrypt seed phrase
    try {
      return await decryptSeedPhrase(encryptedSeed, salt, iterations, password)
    } catch (error) {
      throw new WalletError('Invalid password', WalletErrorCodes.INVALID_PASSWORD)
    }
  }

  /**
   * Sign a transaction
   */
  async signTransaction(address: string, transaction: TransactionRequest): Promise<string> {
    const wallet = this.getUnlockedWallet(address)
    
    // Normalize gas field (handle both 'gas' and 'gasLimit')
    const gasLimit = transaction.gasLimit || (transaction as any).gas
    
    // Build the transaction object for ethers
    const txToSign: any = {
      to: transaction.to || null,
      value: transaction.value || '0x0',
      data: transaction.data || '0x',
      gasLimit: gasLimit,
      nonce: transaction.nonce,
      chainId: transaction.chainId,
      type: transaction.type || 2
    }
    
    // Add gas price fields based on transaction type
    if (transaction.maxFeePerGas) {
      txToSign.maxFeePerGas = transaction.maxFeePerGas
      txToSign.maxPriorityFeePerGas = transaction.maxPriorityFeePerGas
    } else if (transaction.gasPrice) {
      txToSign.gasPrice = transaction.gasPrice
    }
    
    console.log('[RemixWallet] Signing transaction:', txToSign)
    
    const signedTx = await wallet.ethersWallet.signTransaction(txToSign)
    
    console.log('[RemixWallet] Signed transaction:', signedTx)
    
    this.emit('transactionSigned', { address, txHash: signedTx })
    
    return signedTx
  }

  /**
   * Sign a message
   */
  async signMessage(address: string, message: string): Promise<string> {
    const wallet = this.getUnlockedWallet(address)
    
    const signature = await wallet.ethersWallet.signMessage(message)
    
    this.emit('messageSigned', { address, signature })
    
    return signature
  }

  /**
   * Sign typed data (EIP-712)
   */
  async signTypedData(address: string, typedData: TypedDataRequest): Promise<string> {
    const wallet = this.getUnlockedWallet(address)
    
    // Remove EIP712Domain from types if present (ethers handles it automatically)
    const types = { ...typedData.types }
    delete types['EIP712Domain']
    
    const signature = await wallet.ethersWallet.signTypedData(
      typedData.domain,
      types,
      typedData.message
    )
    
    return signature
  }

  /**
   * Get the current wallet state
   */
  async getState(): Promise<WalletState> {
    const activeWallet = this.activeAddress 
      ? this.wallets.find(w => w.address.toLowerCase() === this.activeAddress) || null
      : null
    
    return {
      wallets: this.wallets,
      activeWallet,
      isUnlocked: this.unlockedWallets.size > 0,
      unlockedAddress: this.activeAddress
    }
  }

  /**
   * Get the active wallet
   */
  async getActiveWallet(): Promise<RemixWallet | null> {
    if (!this.activeAddress) return null
    return this.wallets.find(w => w.address.toLowerCase() === this.activeAddress) || null
  }

  /**
   * Get an unlocked wallet or throw error
   */
  private getUnlockedWallet(address: string): UnlockedWallet {
    const normalizedAddress = address.toLowerCase()
    const wallet = this.unlockedWallets.get(normalizedAddress)
    
    if (!wallet) {
      throw new WalletError('Wallet is locked. Please unlock it first.', WalletErrorCodes.WALLET_LOCKED)
    }
    
    return wallet
  }
}
