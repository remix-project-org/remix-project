/* global ethereum */
'use strict'
import { Web3 } from 'web3'
import { execution } from '@remix-project/remix-lib'
import EventManager from '../lib/events'
import { bytesToHex } from '@ethereumjs/util'


let web3

// Helper function to track events using MatomoManager
function track(event) {
  try {
    const matomoManager = window._matomoManagerInstance
    if (matomoManager && matomoManager.trackEvent) {
      matomoManager.trackEvent(event)
    }
  } catch (error) {
    console.debug('Tracking error:', error)
  }
}

const config  = { defaultTransactionType: '0x0' }
if (typeof window !== 'undefined' && typeof window.ethereum !== 'undefined') {
  var injectedProvider = window.ethereum
  web3 = new Web3(injectedProvider)
} else {
  web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'))
}
web3.eth.setConfig(config)

/*
  trigger contextChanged, web3EndpointChanged
*/
export class ExecutionContext {
  constructor () {
    this.event = new EventManager()
    this.executionContext = 'vm-prague'
    this.lastBlock = null
    this.blockGasLimitDefault = 4300000
    this.blockGasLimit = this.blockGasLimitDefault
    this.currentFork = 'prague'
    this.mainNetGenesisHash = '0xd4e56740f876aef8c010b86a40d5f56745a118d0906a34e69aec8c0db1cb8fa3'
    this.customNetWorks = {}
    this.blocks = {}
    this.latestBlockNumber = 0
    this.txs = {}
    this.customWeb3 = {} // mapping between a context name and a web3.js instance
    this.isConnected = false
  }

  init (config) {
    this.executionContext = 'vm-prague'
    this.event.trigger('contextChanged', [this.executionContext])
  }

  getProvider () {
    return this.executionContext
  }

  getProviderObject () {
    return this.customNetWorks[this.executionContext]
  }

  getCurrentFork () {
    return this.currentFork
  }

  isVM () {
    return this.executionContext.startsWith('vm')
  }

  setWeb3 (context, web3) {
    web3.setConfig(config)
    this.customWeb3[context] = web3
  }

  web3 () {
    if (this.customWeb3[this.executionContext]) return this.customWeb3[this.executionContext]
    return web3
  }

  detectNetwork (callback) {
    return new Promise((resolve, reject) => {
      if (this.isVM()) {
        callback && callback(null, { id: '-', name: 'VM' })
        return resolve({ id: '-', name: 'VM' })
      } else {
        if (!web3.currentProvider) {
          callback && callback('No provider set')
          return reject('No provider set')
        }
        const cb = async (err, id) => {
          let name = 'Custom'
          let networkNativeCurrency = { name: "Ether", symbol: "ETH", decimals: 18 }
          if (err) name = 'Unknown'
          // https://github.com/ethereum/EIPs/blob/master/EIPS/eip-155.md
          else if (id === 1) name = 'Main'
          else if (id === 11155111) name = 'Sepolia'
          else {
            let networkDetails = localStorage.getItem('networkDetails')
            if (!networkDetails) networkDetails = '{}'
            networkDetails = JSON.parse(networkDetails)
            if (networkDetails[id]) {
              name = networkDetails[id].name
              networkNativeCurrency = networkDetails[id].nativeCurrency
            } else {
              const response = await fetch('https://chainid.network/chains.json')
              if (response.ok) {
                const networks = await response.json()
                const connectedNetwork = networks.find((n) => n.chainId === id)
                if (connectedNetwork) {
                  name = connectedNetwork.name
                  networkNativeCurrency = connectedNetwork.nativeCurrency
                  networkDetails[id] = { name, nativeCurrency:  networkNativeCurrency}
                  localStorage.setItem('networkDetails', JSON.stringify(networkDetails))
                }
              }
            }
          }
        
          if (id === 1) {
            web3.eth.getBlock(0).then((block) => {
              if (block && block.hash !== this.mainNetGenesisHash) name = 'Custom'
              callback && callback(err, { id, name, lastBlock: this.lastBlock, currentFork: this.currentFork, networkNativeCurrency })
              return resolve({ id, name, lastBlock: this.lastBlock, currentFork: this.currentFork, networkNativeCurrency })
            }).catch((error) => {
              // Rabby wallet throws an error at this point. We are in that case unable to check the genesis hash.
              callback && callback(err, { id, name, lastBlock: this.lastBlock, currentFork: this.currentFork, networkNativeCurrency })
              return resolve({ id, name, lastBlock: this.lastBlock, currentFork: this.currentFork, networkNativeCurrency })
            })
          } else {
            callback && callback(err, { id, name, lastBlock: this.lastBlock, currentFork: this.currentFork, networkNativeCurrency })
            return resolve({ id, name, lastBlock: this.lastBlock, currentFork: this.currentFork, networkNativeCurrency })
          }
        }
        web3.eth.net.getId().then(async (id) => await cb(null, parseInt(id))).catch(err => cb(err))
      }
    })
  }

  removeProvider (name) {
    if (name && this.customNetWorks[name]) {
      if (this.executionContext === name) this.setContext('vm-prague', null, null, null)
      delete this.customNetWorks[name]
      this.event.trigger('removeProvider', [name])
    }
  }

  addProvider (network) {
    if (network && network.name && !this.customNetWorks[network.name]) {
      this.customNetWorks[network.name] = network
    }
  }

  getAllProviders () {
    return this.customNetWorks
  }

  internalWeb3 () {
    return web3
  }

  setContext (context, endPointUrl, confirmCb, infoCb) {
    this.executionContext = context
    this.executionContextChange(context, endPointUrl, confirmCb, infoCb, null)
  }

  async executionContextChange (value, endPointUrl, confirmCb, infoCb, cb) {
    // Track provider change event
    track({
      category: 'udapp',
      action: 'providerChanged',
      name: value.context,
      isClick: false
    })
    const context = value.context
    if (!cb) cb = () => { /* Do nothing. */ }
    if (!confirmCb) confirmCb = () => { /* Do nothing. */ }
    if (!infoCb) infoCb = () => { /* Do nothing. */ }
    if (this.customNetWorks[context]) {
      this.isConnected = false
      var network = this.customNetWorks[context]
      try {
        await network.init()
        this.currentFork = network.config.fork
        // injected
        web3.setProvider(network.provider)
        this.executionContext = context
        this.isConnected = await this._updateChainContext()
        this.event.trigger('contextChanged', [context])
        cb()
      } catch (e) {
        console.error(e)
        cb(false)
      }
    }
  }

  currentblockGasLimit () {
    return this.blockGasLimit
  }

  stopListenOnLastBlock () {
    if (this.listenOnLastBlockId) clearInterval(this.listenOnLastBlockId)
    this.listenOnLastBlockId = null
  }

  async _updateChainContext () {
    if (!this.isVM()) {
      try {
        const block = await web3.eth.getBlock('latest')
        // we can't use the blockGasLimit cause the next blocks could have a lower limit : https://github.com/ethereum/remix/issues/506
        this.blockGasLimit = (block && block.gasLimit) ? Math.floor(web3.utils.toNumber(block.gasLimit) - (5 * web3.utils.toNumber(block.gasLimit) / 1024)) : web3.utils.toNumber(this.blockGasLimitDefault)
        this.lastBlock = block
        try {
          this.currentFork = execution.forkAt(await web3.eth.net.getId(), block.number)
        } catch (e) {
          this.currentFork = 'prague'
          console.log(`unable to detect fork, defaulting to ${this.currentFork}..`)
          console.error(e)
        }
      } catch (e) {
        console.error(e)
        this.blockGasLimit = this.blockGasLimitDefault
        return false
      }
    }
    return true
  }

  listenOnLastBlock () {
    this.listenOnLastBlockId = setInterval(() => {
      this._updateChainContext()
    }, 15000)
  }

  txDetailsLink (network, hash) {
    const transactionDetailsLinks = {
      Main: 'https://www.etherscan.io/tx/',
      Rinkeby: 'https://rinkeby.etherscan.io/tx/',
      Ropsten: 'https://ropsten.etherscan.io/tx/',
      Sepolia: 'https://sepolia.etherscan.io/tx/',
      Kovan: 'https://kovan.etherscan.io/tx/',
      Goerli: 'https://goerli.etherscan.io/tx/'
    }

    if (transactionDetailsLinks[network]) {
      return transactionDetailsLinks[network] + hash
    }
  }

  async getStateDetails() {
    const stateDb = await this.web3().remix.getStateDb()
    const blocksData = await this.web3().remix.getBlocksData()
    const state = {
      db: Object.fromEntries(stateDb.db._database),
      blocks: blocksData.blocks,
      latestBlockNumber: blocksData.latestBlockNumber,
      baseBlockNumber: blocksData.baseBlockNumber
    }
    const stringifyed = JSON.stringify(state, (key, value) => {
      if (key === 'db') {
        return value
      } else if (key === 'blocks') {
        return value.map(block => bytesToHex(block))
      } else if (key === '') {
        return value       
      }
      if (typeof value === 'string') {
        return value.startsWith('0x') ? value : '0x' + value
      } else if (typeof value === 'number') {
        return '0x' + value.toString(16)
      } else {
        return bytesToHex(value)
      }      
    }, '\t')

    return stringifyed
  }
}
