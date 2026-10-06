import React from 'react'
import { Plugin } from '@remixproject/engine'
import {
  EezWidget,
  Actions,
  EezWidgetState,
  EezNetworkEntry,
  discoverEezNetworks,
  EEZ_SETTINGS_KEY,
  resolveProxyAddresses as resolveProxyAddressesAction,
  createProxy as createProxyAction,
  traceTransactionByHash as traceTransactionByHashAction
} from '@remix-ui/run-tab-eez'

const profile = {
  name: 'udappEez',
  displayName: 'EEZ Cross-Chain Proxy',
  description: 'Resolve and create EEZ cross-chain proxy addresses across configured networks',
  methods: ['getUI', 'getNetworks', 'resolveProxyAddresses', 'createProxy', 'traceTransaction', 'openTraceTransaction'],
  events: ['networksChanged']
}

export class EezPlugin extends Plugin {
  getWidgetState: (() => EezWidgetState) | null = null
  private _getDispatch: (() => React.Dispatch<Actions>) | null = null
  networks: EezNetworkEntry[] = []
  isDiscovering = false
  private networkKey: string | null = null
  private discoveryRun = 0

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

  private async refreshNetworks(status: any) {
    const chainId = status?.network?.id
    const providerName = await this.call('blockchain', 'getProvider')
    const key = `${providerName}:${chainId}`
    if (key === this.networkKey) return
    this.networkKey = key
    const run = ++this.discoveryRun

    this.getDispatch()?.({ type: 'NETWORK_CHANGED' })
    this.setNetworks([])
    this.setDiscovering(true)
    const isVM = await this.call('blockchain', 'isVM')

    if (isVM || chainId === undefined || chainId === null || !/^\d+$/.test(String(chainId).trim())) {
      if (run === this.discoveryRun) this.setDiscovering(false)
      return
    }
    const networks = await discoverEezNetworks(this, String(chainId).trim())

    if (run !== this.discoveryRun) {
      return
    }
    this.setNetworks(networks)
    this.setDiscovering(false)
  }

  private setDiscovering(isDiscovering: boolean) {
    this.isDiscovering = isDiscovering
    this.getDispatch()?.({ type: 'SET_DISCOVERING', payload: isDiscovering })
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

  getUI() {
    return <EezWidget plugin={this} />
  }
}
