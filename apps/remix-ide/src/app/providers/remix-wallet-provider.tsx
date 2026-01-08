/**
 * Remix Wallet Provider
 * 
 * A blockchain provider that uses Remix Wallet for signing transactions.
 * Users can connect their Remix-managed wallet to any network.
 */

import React from 'react'
import { Plugin } from '@remixproject/engine'
import { JsonDataRequest } from '../providers/abstract-provider'
import { IProvider } from './abstract-provider'
import * as packageJson from '../../../../../package.json'
import { BrowserProvider, JsonRpcProvider, formatUnits, hexlify, toUtf8Bytes } from 'ethers'
import { hashPersonalMessage, bytesToHex } from '@ethereumjs/util'

// Preconfigured networks with GetBlock.io RPC endpoints
const NETWORKS = {
  sepolia: {
    name: 'Sepolia Testnet',
    chainId: 11155111,
    rpcUrl: 'https://go.getblock.io/7fbe62b139884d2c9c1616ca0de8b5b2',
    explorer: 'https://sepolia.etherscan.io'
  },
  mainnet: {
    name: 'Ethereum Mainnet',
    chainId: 1,
    rpcUrl: 'https://go.getblock.us/1552e4e35bcf4efe8a78897cba5557f9',
    explorer: 'https://etherscan.io'
  },
  custom: {
    name: 'Custom RPC',
    chainId: 0,
    rpcUrl: '',
    explorer: ''
  }
}

const profile = {
  name: 'remix-wallet-provider',
  displayName: 'Remix Wallet',
  kind: 'provider',
  description: 'Use your Remix Wallet to sign transactions on any network',
  methods: ['sendAsync', 'init'],
  version: packageJson.version
}

interface RemixWalletProviderState {
  selectedNetwork: string
  customRpcUrl: string
  rpcUrl: string
  chainId: number
  networkName: string
}

export class RemixWalletProvider extends Plugin implements IProvider {
  options: { [id: string]: any } = {}
  provider: JsonRpcProvider | null = null
  state: RemixWalletProviderState = {
    selectedNetwork: 'sepolia',
    customRpcUrl: '',
    rpcUrl: NETWORKS.sepolia.rpcUrl,
    chainId: NETWORKS.sepolia.chainId,
    networkName: NETWORKS.sepolia.name
  }

  constructor() {
    super(profile)
  }

  async onActivation(): Promise<void> {
    // Listen for wallet unlock/lock events
    this.on('remixWallet', 'walletUnlocked', () => {
      this.emit('accountsChanged', [])
    })
    
    this.on('remixWallet', 'walletLocked', () => {
      this.emit('accountsChanged', [])
    })
  }

  onDeactivation(): void {
    this.off('remixWallet', 'walletUnlocked')
    this.off('remixWallet', 'walletLocked')
    this.provider = null
  }

  private handleNetworkChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const network = e.target.value
    this.state.selectedNetwork = network
    if (network !== 'custom') {
      this.state.rpcUrl = NETWORKS[network].rpcUrl
      this.state.chainId = NETWORKS[network].chainId
      this.state.networkName = NETWORKS[network].name
    }
  }

  private handleCustomRpcChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    this.state.customRpcUrl = e.target.value
    if (this.state.selectedNetwork === 'custom') {
      this.state.rpcUrl = e.target.value
    }
  }

  body(): JSX.Element {
    return (
      <div className="p-3">
        <div className="form-group mb-3">
          <label className="form-label">
            <strong>Select Network</strong>
          </label>
          <select
            className="form-control form-select"
            defaultValue={this.state.selectedNetwork}
            onChange={this.handleNetworkChange}
            data-id="remix-wallet-network-select"
          >
            <option value="sepolia">Sepolia Testnet (Recommended for testing)</option>
            <option value="mainnet">Ethereum Mainnet</option>
            <option value="custom">Custom RPC URL</option>
          </select>
        </div>

        {this.state.selectedNetwork === 'custom' && (
          <div className="form-group mb-3">
            <label className="form-label">
              <strong>Custom RPC URL</strong>
            </label>
            <input
              type="text"
              className="form-control"
              defaultValue={this.state.customRpcUrl}
              onChange={this.handleCustomRpcChange}
              placeholder="https://..."
              data-id="remix-wallet-custom-rpc"
            />
          </div>
        )}
        
        <div className="alert alert-info mb-0">
          <i className="fas fa-wallet me-2"></i>
          <strong>Remix Wallet</strong>
          <p className="mb-0 mt-2 small">
            Your Remix Wallet will sign transactions. Make sure it's unlocked in Settings before deploying.
          </p>
        </div>
      </div>
    )
  }

  async init(): Promise<{ [id: string]: any }> {
    // Show modal to select network
    return new Promise((resolve, reject) => {
      this.call('notification', 'modal', {
        id: 'remix-wallet-provider',
        title: 'Connect Remix Wallet',
        message: this.body(),
        modalType: 'modal',
        okLabel: 'Connect',
        cancelLabel: 'Cancel',
        okFn: async () => {
          try {
            // Check if wallet is unlocked
            const unlockedAddress = await this.call('remixWallet', 'getUnlockedAddress')
            if (!unlockedAddress) {
              this.call('notification', 'toast', 'Please unlock your Remix Wallet first in Settings → Remix Wallet')
              reject(new Error('Wallet not unlocked'))
              return
            }

            // Get the RPC URL based on selection
            let rpcUrl = this.state.rpcUrl
            if (this.state.selectedNetwork === 'custom') {
              rpcUrl = this.state.customRpcUrl
              if (!rpcUrl) {
                this.call('notification', 'toast', 'Please enter a custom RPC URL')
                reject(new Error('No RPC URL provided'))
                return
              }
            } else {
              rpcUrl = NETWORKS[this.state.selectedNetwork].rpcUrl
            }
            
            // Initialize provider
            this.provider = new JsonRpcProvider(rpcUrl)
            this.state.rpcUrl = rpcUrl
            
            // Get network info
            const network = await this.provider.getNetwork()
            this.state.chainId = Number(network.chainId)
            this.state.networkName = NETWORKS[this.state.selectedNetwork]?.name || network.name || 'Unknown'
            
            this.call('notification', 'toast', `Connected to ${this.state.networkName}`)
            
            // Emit accountsChanged to populate the accounts list
            const accounts = await this.getAccounts()
            console.log('[RemixWalletProvider] Connected, accounts:', accounts)
            setTimeout(() => {
              console.log('[RemixWalletProvider] Emitting accountsChanged:', accounts)
              this.emit('accountsChanged', accounts)
            }, 100)
            
            resolve({
              rpcUrl: this.state.rpcUrl,
              chainId: this.state.chainId,
              network: this.state.networkName
            })
          } catch (error: any) {
            this.call('notification', 'toast', `Failed to connect: ${error.message}`)
            reject(error)
          }
        },
        cancelFn: () => {
          reject(new Error('Cancelled'))
        },
        hideFn: () => {
          reject(new Error('Cancelled'))
        }
      })
    })
  }

  // EIP-1193 request method - used by ethers BrowserProvider
  async request(args: { method: string, params?: any[] }): Promise<any> {
    return this.handleRequest({ method: args.method, params: args.params || [], id: Date.now(), jsonrpc: '2.0' })
  }

  async sendAsync(data: JsonDataRequest): Promise<any> {
    return new Promise(async (resolve, reject) => {
      try {
        const result = await this.handleRequest(data)
        resolve({
          jsonrpc: '2.0',
          result,
          id: data.id
        })
      } catch (error: any) {
        resolve({
          jsonrpc: '2.0',
          error: { message: error.message, code: -32603 },
          id: data.id
        })
      }
    })
  }

  private async handleRequest(data: JsonDataRequest): Promise<any> {
    if (!this.provider) {
      throw new Error('Provider not initialized')
    }

    switch (data.method) {
      case 'eth_accounts':
      case 'eth_requestAccounts':
        console.log('[RemixWalletProvider] eth_accounts request')
        return this.getAccounts()
        
      case 'eth_chainId':
        return '0x' + this.state.chainId.toString(16)
        
      case 'net_version':
        return this.state.chainId.toString()
        
      case 'eth_getBalance':
        const balance = await this.provider.getBalance(data.params[0], data.params[1])
        // Return as hex string for JSON-RPC compatibility
        return '0x' + balance.toString(16)
        
      case 'eth_getTransactionCount':
        return this.provider.getTransactionCount(data.params[0], data.params[1])
        
      case 'eth_getBlockByNumber':
        return this.provider.getBlock(data.params[0], data.params[1])
        
      case 'eth_gasPrice':
        const feeData = await this.provider.getFeeData()
        return feeData.gasPrice?.toString()
        
      case 'eth_estimateGas':
        return this.provider.estimateGas(data.params[0])
        
      case 'eth_call':
        return this.provider.call(data.params[0])
        
      case 'eth_getCode':
        return this.provider.getCode(data.params[0], data.params[1])
        
      case 'eth_getStorageAt':
        return this.provider.getStorage(data.params[0], data.params[1], data.params[2])
        
      case 'eth_sendTransaction':
        return this.sendTransaction(data.params[0])
        
      case 'eth_sendRawTransaction':
        return this.provider.broadcastTransaction(data.params[0])
        
      case 'eth_getTransactionReceipt':
        return this.provider.getTransactionReceipt(data.params[0])
        
      case 'eth_getTransactionByHash':
        return this.provider.getTransaction(data.params[0])
        
      case 'personal_sign':
        return this.personalSign(data.params[0], data.params[1])
        
      case 'eth_sign':
        return this.ethSign(data.params[0], data.params[1])
        
      case 'eth_signTypedData':
      case 'eth_signTypedData_v4':
        return this.signTypedData(data.params[0], data.params[1])
        
      default:
        // Forward to RPC provider
        return this.provider.send(data.method, data.params || [])
    }
  }

  private async getAccounts(): Promise<string[]> {
    try {
      const accounts = await this.call('remixWallet', 'getAccounts')
      console.log('[RemixWalletProvider] getAccounts from remixWallet:', accounts)
      return accounts || []
    } catch (error) {
      console.error('[RemixWalletProvider] getAccounts error:', error)
      return []
    }
  }

  private async sendTransaction(tx: any): Promise<string> {
    const accounts = await this.getAccounts()
    if (accounts.length === 0) {
      throw new Error('No unlocked Remix Wallet. Please unlock your wallet first.')
    }
    
    const from = tx.from || accounts[0]
    
    console.log('[RemixWalletProvider] Incoming tx:', JSON.stringify(tx, (key, value) => 
      typeof value === 'bigint' ? value.toString() + 'n' : value
    ))
    
    // Normalize gas field (Ethereum uses 'gas', ethers uses 'gasLimit')
    const gasLimit = tx.gasLimit || tx.gas
    
    // Ensure we have nonce and chain ID
    let nonce = tx.nonce
    if (nonce === undefined) {
      nonce = await this.provider!.getTransactionCount(from, 'pending')
    }
    
    const chainId = tx.chainId !== undefined ? tx.chainId : this.state.chainId
    
    // Get gas estimate if not provided
    let finalGasLimit = gasLimit
    if (!finalGasLimit) {
      try {
        finalGasLimit = await this.provider!.estimateGas({ ...tx, from })
      } catch (e) {
        finalGasLimit = 21000n // 21000 for simple transfers
      }
    }
    
    // Get gas price - prefer values from incoming tx, fetch only if not provided
    let maxFeePerGas = tx.maxFeePerGas
    let maxPriorityFeePerGas = tx.maxPriorityFeePerGas
    let gasPrice = tx.gasPrice
    let type = tx.type
    
    // Only fetch fee data if no gas pricing info was provided
    if (!gasPrice && !maxFeePerGas) {
      console.log('[RemixWalletProvider] No gas fees in tx, fetching from provider...')
      const feeData = await this.provider!.getFeeData()
      console.log('[RemixWalletProvider] FeeData:', {
        maxFeePerGas: feeData.maxFeePerGas?.toString(),
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toString(),
        gasPrice: feeData.gasPrice?.toString()
      })
      
      if (feeData.maxFeePerGas) {
        // Add a buffer to ensure tx goes through (1.5x)
        maxFeePerGas = (feeData.maxFeePerGas * 150n) / 100n
        maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || 1000000000n // 1 gwei default
        type = 2
      } else if (feeData.gasPrice) {
        gasPrice = (feeData.gasPrice * 150n) / 100n
      } else {
        // Fallback to reasonable defaults for Sepolia
        maxFeePerGas = 2000000000n // 2 gwei
        maxPriorityFeePerGas = 1000000000n // 1 gwei
        type = 2
      }
    }
    
    // Build clean transaction object for signing
    const cleanTx: any = {
      to: tx.to || null,
      value: tx.value || '0x0',
      data: tx.data || '0x',
      gasLimit: finalGasLimit,
      nonce,
      chainId,
      type: type || 2
    }
    
    // Add gas pricing fields
    if (maxFeePerGas) {
      cleanTx.maxFeePerGas = maxFeePerGas
      cleanTx.maxPriorityFeePerGas = maxPriorityFeePerGas || maxFeePerGas
    } else if (gasPrice) {
      cleanTx.gasPrice = gasPrice
    }
    
    console.log('[RemixWalletProvider] Signing transaction:', cleanTx)
    
    // Sign transaction with Remix Wallet
    const signedTx = await this.call('remixWallet', 'signTransaction', from, cleanTx)
    
    console.log('[RemixWalletProvider] Broadcasting signed tx:', signedTx)
    
    // Broadcast transaction
    const txResponse = await this.provider!.broadcastTransaction(signedTx)
    
    return txResponse.hash
  }

  private async personalSign(message: string, address: string): Promise<string> {
    // personal_sign params are: [message, address]
    return this.call('remixWallet', 'signMessage', address, message)
  }

  private async ethSign(address: string, message: string): Promise<string> {
    // eth_sign params are: [address, message]
    return this.call('remixWallet', 'signMessage', address, message)
  }

  private async signTypedData(address: string, typedData: string | object): Promise<string> {
    const data = typeof typedData === 'string' ? JSON.parse(typedData) : typedData
    return this.call('remixWallet', 'signTypedData', address, data)
  }
}
