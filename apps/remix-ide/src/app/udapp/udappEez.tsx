import React from 'react'
import { Plugin } from '@remixproject/engine'
import {
  EezWidget,
  Actions,
  EezWidgetState,
  EezNetworkEntry,
  EezWalletRpc,
  discoverEezNetworks,
  isWalletOnComposerRpc,
  switchWalletToComposerRpc,
  switchWalletChain,
  findCrossChainProxy,
  assertOriginDeployed,
  eezInitialWalletRpc,
  EEZ_COMPOSER_RPC_URLS,
  EEZ_SETTINGS_KEY,
  resolveProxyAddresses as resolveProxyAddressesAction,
  createProxy as createProxyAction,
  traceTransactionByHash as traceTransactionByHashAction,
  stopTracePolling
} from '@remix-ui/run-tab-eez'

const profile = {
  name: 'udappEez',
  displayName: 'EEZ Cross-Chain Proxy',
  description: 'Resolve and create EEZ cross-chain proxy addresses across configured networks',
  methods: ['getUI', 'getNetworks', 'resolveProxyAddresses', 'createProxy', 'traceTransaction', 'openTraceTransaction', 'createProxyFor', 'interactThroughProxy', 'getWalletRpc'],
  events: ['networksChanged', 'walletRpcChanged']
}

export class EezPlugin extends Plugin {
  getWidgetState: (() => EezWidgetState) | null = null
  private _getDispatch: (() => React.Dispatch<Actions>) | null = null
  networks: EezNetworkEntry[] = []
  isDiscovering = false
  walletRpc: EezWalletRpc = eezInitialWalletRpc
  private networkKey: string | null = null
  private discoveryRun = 0
  private networkWaiters: { chainId: string; resolve: () => void }[] = []
  private isProxyFlowRunning = false

  constructor () {
    super(profile)
  }

  onActivation() {
    this.on('blockchain', 'networkStatus', (status) => this.refreshNetworks(status))
    this.on('settings', 'configChanged', (changed) => {
      if (changed?.key !== EEZ_SETTINGS_KEY) return
      this.networkKey = null
      this.call('blockchain', 'getCurrentNetworkStatus').then((status) => this.refreshNetworks(status)).catch(() => {})
    })
    this.call('blockchain', 'getCurrentNetworkStatus').then((status) => this.refreshNetworks(status)).catch(() => {})
  }

  onDeactivation() {
    this.off('blockchain', 'networkStatus')
    this.off('settings', 'configChanged')
  }

  getNetworks() {
    return this.networks
  }

  getWalletRpc() {
    return this.walletRpc
  }

  private async refreshNetworks(status: any) {
    const chainId = status?.network?.id
    const providerName = await this.call('blockchain', 'getProvider')
    const key = `${providerName}:${chainId}`
    if (key === this.networkKey) return
    this.networkKey = key
    const run = ++this.discoveryRun

    stopTracePolling()
    this.getDispatch()?.({ type: 'NETWORK_CHANGED' })
    this.setNetworks([])
    this.setWalletRpc(eezInitialWalletRpc)
    this.setDiscovering(true)
    const isVM = await this.call('blockchain', 'isVM')

    if (isVM || chainId === undefined || chainId === null || !/^\d+$/.test(String(chainId).trim())) {
      if (run === this.discoveryRun) this.setDiscovering(false)
      return
    }
    const currentChainId = String(chainId).trim()
    const networks = await discoverEezNetworks(this, currentChainId)
    const isComposer = networks.length > 0 ? await isWalletOnComposerRpc(this, currentChainId) : null

    if (run !== this.discoveryRun) {
      return
    }
    this.setWalletRpc({
      chainId: currentChainId,
      isComposer,
      canSwitch: !!providerName?.startsWith('injected') && !!EEZ_COMPOSER_RPC_URLS[currentChainId]?.nativeCurrency
    })
    this.setNetworks(networks)
    this.setDiscovering(false)
    this.networkWaiters = this.networkWaiters.filter((waiter) => {
      if (waiter.chainId !== currentChainId) return true
      waiter.resolve()
      return false
    })
  }

  private waitForNetwork(chainId: string, timeoutMs = 120000): Promise<void> {
    return new Promise((resolve, reject) => {
      const waiter = { chainId, resolve: () => { clearTimeout(timer); resolve() } }
      const timer = setTimeout(() => {
        this.networkWaiters = this.networkWaiters.filter((w) => w !== waiter)
        reject(new Error(`Timed out waiting for the wallet to switch to chain ${chainId}.`))
      }, timeoutMs)
      this.networkWaiters.push(waiter)
    })
  }

  private setDiscovering(isDiscovering: boolean) {
    this.isDiscovering = isDiscovering
    this.getDispatch()?.({ type: 'SET_DISCOVERING', payload: isDiscovering })
  }

  async checkWalletRpc(): Promise<boolean | null> {
    const run = this.discoveryRun
    const isComposer = await isWalletOnComposerRpc(this, this.walletRpc.chainId)
    if (run === this.discoveryRun) this.setWalletRpc({ ...this.walletRpc, isComposer })
    return isComposer
  }

  async switchToNetwork(networkId: string): Promise<boolean> {
    const network = this.networks.find((n) => n.id === networkId)
    if (!network) throw new Error('The selected network is not part of this EEZ network.')
    return this.switchWalletTo(network)
  }

  private setWalletRpc(walletRpc: EezWalletRpc) {
    this.walletRpc = walletRpc
    this.getDispatch()?.({ type: 'SET_WALLET_RPC', payload: walletRpc })
    this.emit('walletRpcChanged', walletRpc)
  }

  private setNetworks(networks: EezNetworkEntry[]) {
    this.networks = networks
    this.getDispatch()?.({ type: 'SET_NETWORKS', payload: networks })
    this.emit('networksChanged', networks)
  }

  setStateGetter(getter: () => EezWidgetState) {
    this.getWidgetState = getter
  }

  setDispatchGetter(getter: () => React.Dispatch<Actions>) {
    this._getDispatch = getter
  }

  getDispatch() {
    return this._getDispatch?.()
  }

  clearGetters() {
    this.getWidgetState = null
    this._getDispatch = null
  }

  async resolveProxyAddresses(address: string) {
    const dispatch = this.getDispatch()
    if (!dispatch) throw new Error('EEZ panel is not mounted')
    const networks = this.networks
    await resolveProxyAddressesAction(this, dispatch, networks, address)
    return this.getWidgetState?.()?.resolutionRows
  }

  async createProxy(originNetworkId: string, originAddress: string) {
    const dispatch = this.getDispatch()
    if (!dispatch) throw new Error('EEZ panel is not mounted')
    const networks = this.networks
    await createProxyAction(this, dispatch, networks, originNetworkId, originAddress)
    return this.getWidgetState?.()?.creator
  }

  async traceTransaction(txHash: string) {
    const dispatch = this.getDispatch()
    if (!dispatch) throw new Error('EEZ panel is not mounted')
    const networks = this.networks
    await traceTransactionByHashAction(this, dispatch, networks, txHash)
    return this.getWidgetState?.()?.traceResult
  }

  openTraceTransaction(txHash: string) {
    const dispatch = this.getDispatch()
    if (!dispatch) return
    dispatch({ type: 'SET_TRACE_TX_HASH', payload: txHash })
    this.traceTransaction(txHash)
  }

  createProxyFor(originAddress: string, destinationNetworkId: string, abi: any, name: string) {
    this.runProxyFlow(async () => {
      const { origin, destination, proxyAddress, isDeployed } = await this.locateProxy(originAddress, destinationNetworkId)
      if (isDeployed) {
        this.call('notification', 'modal', {
          id: 'eezProxyAlreadyExists',
          title: 'Proxy already exists',
          message: `${name} already has a proxy on ${destination.label} at ${proxyAddress}.`,
          okLabel: 'Interact through proxy',
          okFn: () => this.interactThroughProxy(originAddress, destinationNetworkId, abi, name),
          cancelLabel: 'Close'
        })
        return
      }
      const confirmed = await this.confirmSteps(`Create a proxy on ${destination.label}`, [
        `Your wallet switches to ${destination.label}.`,
        `Confirm the proxy creation transaction in your wallet.`,
        `The proxy is loaded into Deployed Contracts at ${proxyAddress}, so you can call ${name} through it.`
      ])
      if (!confirmed) return
      await this.pinOriginContract(originAddress)
      if (!(await this.switchWalletTo(destination))) return

      let outcome: Actions | null = null
      const panelDispatch = this.getDispatch()
      await createProxyAction(this, (action: Actions) => {
        if (action.type === 'CREATE_SUCCESS' || action.type === 'CREATE_ERROR') outcome = action
        panelDispatch?.(action)
      }, this.networks, origin.id, originAddress)
      if (outcome?.type === 'CREATE_ERROR') throw new Error(outcome.payload)
      if (outcome?.type !== 'CREATE_SUCCESS') return

      await this.showInDeployedContracts(proxyAddress, abi, name)
    })
  }

  interactThroughProxy(originAddress: string, destinationNetworkId: string, abi: any, name: string) {
    this.runProxyFlow(async () => {
      const { destination, proxyAddress, isDeployed } = await this.locateProxy(originAddress, destinationNetworkId)
      if (!isDeployed) {
        this.call('notification', 'modal', {
          id: 'eezProxyNotFound',
          title: 'No proxy yet',
          message: `${name} has no proxy on ${destination.label} yet. Its address will be ${proxyAddress}.`,
          okLabel: 'Create proxy',
          okFn: () => this.createProxyFor(originAddress, destinationNetworkId, abi, name),
          cancelLabel: 'Close'
        })
        return
      }
      const confirmed = await this.confirmSteps(`Interact through a proxy on ${destination.label}`, [
        `Your wallet switches to ${destination.label}.`,
        `The proxy at ${proxyAddress} is loaded into Deployed Contracts, so you can call ${name} through it.`
      ])
      if (!confirmed) return
      await this.pinOriginContract(originAddress)
      if (!(await this.switchWalletTo(destination))) return

      await this.showInDeployedContracts(proxyAddress, abi, name)
    })
  }

  private async pinOriginContract(originAddress: string) {
    try {
      await this.call('udappDeployedContracts', 'pinContract', originAddress)
    } catch (e) {
      console.warn(`EEZ: failed to pin the original contract ${originAddress}`, e)
    }
  }

  private confirmSteps(title: string, steps: string[]): Promise<boolean> {
    return new Promise((resolve) => {
      this.call('notification', 'modal', {
        id: 'eezProxyFlowSteps',
        title,
        message: (
          <div>
            <p className="mb-2">The following will happen:</p>
            <ol className="ps-3 mb-0">
              {steps.map((step) => <li key={step} className="mb-1">{step}</li>)}
            </ol>
          </div>
        ),
        okLabel: 'Proceed',
        okFn: () => resolve(true),
        cancelLabel: 'Cancel',
        cancelFn: () => resolve(false),
        hideFn: () => resolve(false)
      })
    })
  }

  private async runProxyFlow(flow: () => Promise<void>) {
    if (this.isProxyFlowRunning) {
      this.call('notification', 'toast', 'A cross-chain proxy action is already in progress.')
      return
    }
    this.isProxyFlowRunning = true
    try {
      await flow()
    } catch (e) {
      this.call('notification', 'modal', {
        id: 'eezProxyActionFailed',
        title: 'Cross-chain proxy',
        message: e?.message || String(e),
        okLabel: 'OK'
      })
    } finally {
      this.isProxyFlowRunning = false
    }
  }

  private async locateProxy(originAddress: string, destinationNetworkId: string) {
    const origin = this.networks.find((n) => n.chainId === this.walletRpc.chainId)
    const destination = this.networks.find((n) => n.id === destinationNetworkId)
    if (!origin || !destination) throw new Error('The current network is not part of an EEZ network.')
    if (origin.id === destination.id) throw new Error('The destination must be a different network from the one the contract is deployed on.')
    await assertOriginDeployed(origin, originAddress)
    return { origin, destination, ...await findCrossChainProxy(origin, destination, originAddress) }
  }

  private async switchWalletTo(network: EezNetworkEntry): Promise<boolean> {
    if (this.walletRpc.chainId !== network.chainId) {
      const providerName: string = await this.call('blockchain', 'getProvider')
      if (!providerName?.startsWith('injected')) throw new Error(`Switch the environment to ${network.label} to continue.`)
      const reached = this.waitForNetwork(network.chainId)
      reached.catch(() => {})
      await switchWalletChain(this, network.chainId)
      await reached
    }
    if (this.walletRpc.isComposer === false && this.walletRpc.canSwitch) {
      await switchWalletToComposerRpc(this, this.getDispatch() || (() => {}), network.chainId)
      return this.walletRpc.isComposer !== false
    }
    if (this.walletRpc.isComposer === false) throw new Error(`Your wallet is not using the EEZ composer RPC for ${network.label}. Set ${EEZ_COMPOSER_RPC_URLS[network.chainId]?.rpcUrl || 'the EEZ composer RPC'} as its RPC in your wallet and try again.`)
    return true
  }

  private async showInDeployedContracts(proxyAddress: string, abi: any, name: string) {
    await this.call('udappDeployedContracts', 'addInstance', proxyAddress, abi, name)
    window.dispatchEvent(new CustomEvent('udapp:switchTab', { detail: { tab: 'contracts' } }))
  }

  getUI() {
    return <EezWidget plugin={this} />
  }
}
