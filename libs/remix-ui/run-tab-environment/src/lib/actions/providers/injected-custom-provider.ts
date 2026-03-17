import { InjectedProviderDefault } from './injected-provider-default'

export class InjectedCustomProvider extends InjectedProviderDefault {
  chainName: string
  chainId: string
  pluginName: string
  rpcUrls: Array<string>
  nativeCurrency: Record<string, any>
  blockExplorerUrls: Array<string>
  parent: string

  constructor(provider: any, pluginName: string, chainName: string, chainId: string, rpcUrls: Array<string>, nativeCurrency?: Record<string, any>, blockExplorerUrls?: Array<string>, parent?: string) {
    super(provider, pluginName)
    this.parent = parent
    this.pluginName = pluginName
    this.chainName = chainName
    this.chainId = chainId
    this.rpcUrls = rpcUrls
    this.nativeCurrency = nativeCurrency
    this.blockExplorerUrls = blockExplorerUrls
    this.listenerChainChanged = (chainId: number) => {
      if (chainId !== parseInt(this.chainId)) {
        this.call('blockchain', 'changeExecutionContext', { context: this.parent })
      }
    }
  }

  async init() {
    if (!this.chainId && this.rpcUrls.length > 0) {
      try {
        const response = await fetch(this.rpcUrls[0], {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_chainId',
            params: [],
            id: 1
          })
        })
        const data = await response.json()
        if (data.result) {
          const chainId = parseInt(data.result, 16)
          this.chainId = `0x${chainId.toString(16)}`
        }
      } catch (error) {
        console.error('Error fetching chain ID:', error)
      }
    }
    await super.init()
    await setCustomNetwork(this.chainName, this.chainId, this.rpcUrls, this.nativeCurrency, this.blockExplorerUrls)
    return {}
  }
}

export const setCustomNetwork = async (chainName: string, chainId: string, rpcUrls: Array<string>, nativeCurrency?: Record<string, any>, blockExplorerUrls?: Array<string>) => {
  try {
    await (window as any).ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chainId }]
    })
  } catch (switchError) {
    // This error code indicates that the chain has not been added to MetaMask.
    if (switchError.code === 4902) {
      try {
        if (chainName && rpcUrls && rpcUrls.length > 0) {
          const paramsObj: Record<string, any> = {
            chainId: chainId,
            chainName: chainName,
            rpcUrls: rpcUrls,
          }
          paramsObj.nativeCurrency = nativeCurrency ? nativeCurrency : null
          paramsObj.blockExplorerUrls = blockExplorerUrls ? blockExplorerUrls : null
          await (window as any).ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [paramsObj]
          })

          await (window as any).ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: chainId }]
          })
        }
      } catch (addError) {
        // handle "add" error
      }
    }
    // handle other "switch" errors
  }
}
