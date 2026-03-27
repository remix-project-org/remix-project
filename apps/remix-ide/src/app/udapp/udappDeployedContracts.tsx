import React from 'react'
import { Plugin } from '@remixproject/engine'
import { DeployedContractsWidget } from '@remix-ui/run-tab-deployed-contracts'
import { DeployedContractsWidgetState, Actions } from '@remix-ui/run-tab-deployed-contracts'
import * as ethJSUtil from '@ethereumjs/util'

const profile = {
  name: 'udappDeployedContracts',
  displayName: 'Udapp Deployed Contracts',
  description: 'Manages the UI and state for deployed contracts',
  methods: ['getUI', 'addInstance', 'getDeployedInstanceCount', 'getDeployedContracts', 'clearDeployedContracts'],
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
    const instance = { address, abi, name, contractData, decodedResponse: {}, isPinned: !!pinnedAt, pinnedAt, timestamp }
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

  getDeployedInstanceCount() {
    return this.getWidgetState()?.deployedContracts.length || 0
  }

  getDeployedContracts() {
    return this.getWidgetState()?.deployedContracts || []
  }

  clearDeployedContracts() {
    this.getDispatch()({ type: 'CLEAR_ALL_CONTRACTS', payload: null })
  }

  getUI() {
    return <DeployedContractsWidget plugin={this} />
  }
}
