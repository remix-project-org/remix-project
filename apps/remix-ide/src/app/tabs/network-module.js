import { Plugin } from '@remixproject/engine'
import * as packageJson from '../../../../../package.json'
import { ethers } from 'ethers'

export const profile = {
  name: 'network',
  description: 'Manage the network (mainnet, sepolia,...) and the provider (web3, vm, injected)',
  methods: ['getNetworkProvider', 'getEndpoint', 'detectNetwork', 'addNetwork', 'removeNetwork'],
  version: packageJson.version,
  kind: 'network'
}

// Network API has :
// - events: ['providerChanged']
// - methods: ['getNetworkProvider', 'getEndpoint', 'detectNetwork', 'addNetwork', 'removeNetwork']

export class NetworkModule extends Plugin {
  constructor (blockchain) {
    super(profile)
    this.blockchain = blockchain

    // TODO: See with remix-lib to make semantic coherent
    this.blockchain.event.register('contextChanged', (provider) => {
      this.emit('providerChanged', provider)
    })
  }

  onActivation () {
    // emit the initial provider type
    this.emit('providerChanged', this.blockchain.getProvider)
  }

  /** Return the current network provider (web3, vm, injected) */
  getNetworkProvider () {
    return this.blockchain.getProvider()
  }

  /** Return the current network */
  detectNetwork () {
    return new Promise((resolve, reject) => {
      this.blockchain.detectNetwork((error, network) => {
        error ? reject(error) : resolve(network)
      })
    })
  }

  /** Return the url only if network provider is 'web3' */
  getEndpoint () {
    const provider = this.blockchain.getProvider()
    if (provider !== 'web3') {
      throw new Error('no endpoint: current provider is either injected or vm')
    }
    return this.blockchain.web3().currentProvider.host
  }

  /** Add a custom network to the list of available networks */
  addNetwork (network) { // { name, url }
    const provider = network.url === 'ipc' ? new ethers.IpcProvider() : new ethers.JsonRpcProvider(network.url)
    this.blockchain.addProvider({ name: network.name, provider })
  }

  /** Remove a network to the list of available networks */
  removeNetwork (name) {
    this.blockchain.removeProvider(name)
  }
}
