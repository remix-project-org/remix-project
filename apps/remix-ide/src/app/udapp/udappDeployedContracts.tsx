import React from 'react'
import { Plugin } from '@remixproject/engine'
import { DeployedContractsWidget, pinContract } from '@remix-ui/run-tab-deployed-contracts'
import { DeployedContractsWidgetState, Actions } from '@remix-ui/run-tab-deployed-contracts'
import * as ethJSUtil from '@ethereumjs/util'

const profile = {
  name: 'udappDeployedContracts',
  displayName: 'Udapp Deployed Contracts',
  description: 'Manages the UI and state for deployed contracts',
  methods: ['getUI', 'addInstance', 'pinContract', 'getDeployedInstanceCount', 'getDeployedContracts', 'clearDeployedContracts', 'openAddContractDialog'],
  events: ['deployedInstanceUpdated']
}

export class DeployedContractsPlugin extends Plugin {
  instanceAddresses: string[] = []
  getWidgetState: (() => DeployedContractsWidgetState) | null = null
  private getDispatch: (() => React.Dispatch<Actions>) | null = null

  constructor() {
    super(profile)
  }

  setStateGetter(getter: () => DeployedContractsWidgetState) {
    this.getWidgetState = getter
  }

  setDispatchGetter(getter: () => React.Dispatch<Actions>) {
    this.getDispatch = getter
  }

  async addInstance(address, abi, name, contractData?, pinnedAt?, timestamp = Date.now()) {
    address = (address.slice(0, 2) === '0x' ? '' : '0x') + address.toString('hex')
    address = ethJSUtil.toChecksumAddress(address)

    let balance = '0'
    try {
      balance = await this.call('blockchain', 'getBalanceInEther', address)
    } catch (e) {
      console.error(`Failed to fetch initial balance for ${address}:`, e)
    }

    const instance = { address, abi, name, contractData, decodedResponse: {}, isPinned: !!pinnedAt, pinnedAt, timestamp, balance }
    const duplicateContract = this.getWidgetState()?.deployedContracts?.find(contract => contract.address === address)

    if (!duplicateContract) {
      await new Promise<void>((resolve) => {
        this.getDispatch()?.({ type: 'ADD_CONTRACT', payload: instance })
        setTimeout(resolve, 10)
      })
    } else {
      this.call('notification', 'toast', 'Deployed contract with duplicate address already exist!')
    }
  }

  async pinContract(address: string): Promise<boolean> {
    const contracts = this.getWidgetState()?.deployedContracts || []
    const index = contracts.findIndex((contract) => contract.address.toLowerCase() === address.toLowerCase())
    if (index === -1) return false
    if (contracts[index].isPinned) return true
    return pinContract(this, this.getDispatch(), contracts[index], index)
  }

  getDeployedInstanceCount() {
    return this.getWidgetState()?.deployedContracts.length || 0
  }

  getDeployedContracts() {
    return this.getWidgetState()?.deployedContracts || []
  }

  clearDeployedContracts() {
    this.getDispatch()({ type: 'CLEAR_ALL_CONTRACTS', payload: null })
  }

  openAddContractDialog(address: string) {
    const dispatch = this.getDispatch?.()
    if (!dispatch) return

    dispatch({ type: 'COLLAPSE_ALL' })
    dispatch({ type: 'SET_ADDRESS_INPUT', payload: address })
    dispatch({ type: 'SHOW_ADD_DIALOG', payload: true })
    dispatch({ type: 'HIGHLIGHT_ADD_DIALOG', payload: true })
    setTimeout(() => {
      this.getDispatch?.()?.({ type: 'HIGHLIGHT_ADD_DIALOG', payload: false })
    }, 2000)
  }

  getUI() {
    return <DeployedContractsWidget plugin={this} />
  }
}
