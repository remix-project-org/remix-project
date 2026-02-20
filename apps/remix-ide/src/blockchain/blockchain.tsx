import React from 'react' // eslint-disable-line
import { Plugin } from '@remixproject/engine'
import { trackMatomoEvent } from '@remix-api'
import { toBytes, addHexPrefix } from '@ethereumjs/util'
import { EventEmitter } from 'events'
import { format } from 'util'
import { ExecutionContext } from './execution-context'
import Config from '../config'
import { VMProvider } from './providers/vm'
import { InjectedProvider } from './providers/injected'
import { NodeProvider } from './providers/node'
import { execution, EventManager, helpers } from '@remix-project/remix-lib'
import { etherScanLink, getBlockScoutUrl } from './helper'
import { logBuilder, cancelUpgradeMsg, cancelProxyMsg, addressToString } from '@remix-ui/helper'
import { Provider } from '@remix-ui/environment-explorer'

const { txFormat, txExecution, typeConversion, txListener: Txlistener, txHelper } = execution
const { txResultHelper } = helpers
const { resultToRemixTx } = txResultHelper
import * as packageJson from '../../../../package.json'
import { formatUnits, parseUnits } from 'ethers'

const profile = {
  name: 'blockchain',
  displayName: 'Blockchain',
  description: 'Blockchain - Logic',
  methods: ['dumpState', 'getCode', 'getTransactionReceipt', 'addProvider', 'removeProvider', 'getCurrentFork', 'isSmartAccount', 'getAccounts', 'web3VM', 'web3', 'sendRpc', 'getProvider', 'getCurrentProvider', 'getCurrentNetworkStatus', 'getCurrentNetworkCurrency', 'getAllProviders', 'getPinnedProviders', 'changeExecutionContext', 'getProviderObject', 'runTx', 'getBalanceInEther', 'getCurrentProvider', 'deployContractAndLibraries', 'runOrCallContractMethod', 'getStateDetails', 'resetAndInit', 'detectNetwork', 'isVM', 'getWeb3', 'fromWei', 'toWei', 'deployContractWithLibrary', 'newAccount', 'signMessage', 'determineGasPrice'],
  version: packageJson.version
}

// see TxRunner.ts in remix-lib
export type Transaction = {
  from: string
  to: string
  value: string
  data: string
  gasLimit: string
  useCall: boolean
  timestamp?: number
}

export class Blockchain extends Plugin {
  active: boolean
  event: EventManager
  events: EventEmitter
  executionContext: ExecutionContext
  config: Config
  txRunner: any // TxRunner
  networkcallid: number
  networkStatus: {
    network: {
      name: string
      id: string
    }
    error?: string
  }
  networkNativeCurrency: {
      name: string,
      symbol: string,
      decimals: number
  }
  providers: {[key: string]: VMProvider | InjectedProvider | NodeProvider }
  registeredPluginEvents: string[]
  defaultPinnedProviders: string[]
  pinnedProviders: string[]
  isWorkspaceLoaded: boolean

  // NOTE: the config object will need to be refactored out in remix-lib
  constructor(config: Config) {
    super(profile)
    this.active = false
    this.event = new EventManager()
    this.executionContext = new ExecutionContext()
    this.events = new EventEmitter()
    this.config = config
    this.networkcallid = 0
    this.registeredPluginEvents = []
    // the first item in the list should be latest fork.
    this.defaultPinnedProviders = ['vm-osaka', 'vm-prague', 'vm-cancun', 'vm-mainnet-fork', 'walletconnect', 'injected-MetaMask', 'basic-http-provider', 'hardhat-provider', 'foundry-provider', 'desktopHost']
    this.networkStatus = { network: { name: this.defaultPinnedProviders[0], id: ' - ' } }
    this.networkNativeCurrency = { name: "Ether", symbol: "ETH", decimals: 18 }
    this.pinnedProviders = []
    this.setupProviders()
  }

  _triggerEvent(name, args) {
    if (!this.active) return
    this.event.trigger(name, args)
    this.emit(name, ...args)
  }

  onActivation() {
    this.active = true
    this.on('manager', 'pluginActivated', (plugin) => {
      if ((plugin && plugin.name && (plugin.name.startsWith('injected') || plugin.name === 'walletconnect')) || plugin.name === 'desktopHost') {
        this.registeredPluginEvents.push(plugin.name)
        this.on(plugin.name, 'chainChanged', async () => {
          if (plugin.name === this.executionContext.executionContext) {
            await this.changeExecutionContext({ context: plugin.name })
            const network = await this.detectNetwork()
            this.networkStatus = { network, error: null }
            if (network.networkNativeCurrency) this.networkNativeCurrency = network.networkNativeCurrency
            this._triggerEvent('networkStatus', [this.networkStatus])
          }
        })
      }
    })

    // used to pin and select newly created forked state provider
    this.on('udapp', 'forkStateProviderAdded', async (providerName) => {
      const name = `vm-fs-${providerName}`
      trackMatomoEvent(this, { category: 'blockchain', action: 'providerPinned', name: name, isClick: false })
      // this.emit('providersChanged')
      await this.changeExecutionContext({ context: name })
      this.call('notification', 'toast', `New environment '${providerName}' created with forked state.`)
    })

    this.setupEvents()

    this.call('config', 'getAppParameter', 'settings/pinned-providers').then((providers) => {
      if (!providers) {
        this.call('config', 'setAppParameter', 'settings/pinned-providers', JSON.stringify(this.defaultPinnedProviders))
        this.pinnedProviders = this.defaultPinnedProviders
      } else {
        providers = JSON.parse(providers)
        if (!providers.includes(this.defaultPinnedProviders[0])) {
          // we force the inclusion of the latest fork in the pinned VM.
          providers.push(this.defaultPinnedProviders[0])
        }
        this.pinnedProviders = providers
      }
    }).catch((error) => { console.log(error) })
  }

  onDeactivation() {
    this.active = false
    for (const pluginName of this.registeredPluginEvents) {
      this.off(pluginName, 'chainChanged')
    }
  }

  setupEvents() {
    this.on('filePanel', 'workspaceInitializationCompleted', async () => {
      this.isWorkspaceLoaded = true
      const context = this.getProvider()

      this.executionContext.event.trigger('contextChanged', [context])
    })

    this.executionContext.event.register('contextChanged', async (context) => {
      if (!this.isWorkspaceLoaded) return
      // reset environment to last known state of the context
      await this.loadContext(context)
      this._triggerEvent('contextChanged', [context])
      const network = await this.detectNetwork()
      this.networkStatus = { network, error: null }
      if (network.networkNativeCurrency) this.networkNativeCurrency = network.networkNativeCurrency
      this._triggerEvent('networkStatus', [this.networkStatus])
    })

    this.executionContext.event.register('providerAdded', (network) => {
      this._triggerEvent('providerAdded', [network])
    })

    this.executionContext.event.register('providerRemoved', (name) => {
      this._triggerEvent('providerRemoved', [name])
    })

    setInterval(async () => {
      const network = await this.detectNetwork()
      this.networkStatus = { network, error: null }
      if (network.networkNativeCurrency) this.networkNativeCurrency = network.networkNativeCurrency
      this._triggerEvent('networkStatus', [this.networkStatus])
    }, 30000)

    this.on('txRunner','transactionBroadcasted', async (txhash, isUserOp) => {
      if (isUserOp) trackMatomoEvent(this, { category: 'udapp', action: 'safeSmartAccount', name: 'txBroadcastedFromSmartAccount', isClick: false })
      // logTransaction(txhash, 'gui')
      const network = await this.executionContext.detectNetwork()
      if (!network) return
      if (network.name === 'VM') return
      const viewEtherScanLink = etherScanLink(network.name, txhash)
      const viewBlockScoutLink = await getBlockScoutUrl(network.id as any, txhash)
      if (viewEtherScanLink) {
        this.call(
          'terminal',
          'logHtml',
          <span className="flex flex-row">
            <a href={etherScanLink(network.name, txhash)} className="me-3" target="_blank">
                  view on Etherscan
            </a>
            {' '}
            {viewBlockScoutLink && <a href={viewBlockScoutLink} target="_blank">
                  view on Blockscout
            </a>}
          </span>
        )
      } else {
        this.call(
          'terminal',
          'logHtml',
          <span className="flex flex-row">
            {viewBlockScoutLink && <a href={viewBlockScoutLink} target="_blank">
                  view on Blockscout
            </a>}
          </span>
        )
      }
    })
  }

  getCurrentNetworkStatus() {
    return this.networkStatus
  }

  getCurrentNetworkCurrency() {
    return this.networkNativeCurrency
  }

  async isSmartAccount(address) {
    return await this.call('udappEnv', 'isSmartAccount', address)
  }

  setupProviders() {
    this.providers = {}
    this.providers['vm'] = new VMProvider(this.executionContext)
    this.providers.injected = new InjectedProvider(this.executionContext)
    this.providers.web3 = new NodeProvider(this.executionContext, this.config)
  }

  getCurrentProvider() {
    const provider = this.getProvider()
    if (provider && provider.startsWith('vm')) return this.providers['vm']
    if (provider && provider.startsWith('injected')) return this.providers['injected']
    if (this.providers[provider]) return this.providers[provider]
    return this.providers.web3 // default to the common type of provider
  }

  /** Return the list of accounts */
  // note: the dual promise/callback is kept for now as it was before
  getAccounts() {
    return new Promise((resolve, reject) => {
      this.getCurrentProvider().getAccounts((error, accounts) => {
        if (error) {
          reject(error)
        }
        return resolve(accounts)
      })
    })
  }

  async getStateDetails() {
    return await this.executionContext.getStateDetails()
  }

  async dumpState() {
    const provider = this.executionContext.getProviderObject()

    // a basic in-browser VM state.
    const isBasicVMState = provider.config.isVM && !provider.config.isVMStateForked && !provider.config.isRpcForkedState
    // a standard fork of an in-browser state.
    const isForkedVMState = provider.config.isVM && provider.config.isVMStateForked && !provider.config.isRpcForkedState
    // a fork of an in-browser state which derive from a live network.
    const isForkedRpcState = provider.config.isVM && provider.config.isVMStateForked && provider.config.isRpcForkedState

    if (isBasicVMState || isForkedVMState || isForkedRpcState) {
      if (this.config.get('settings/save-evm-state')) {
        try {
          let state = await this.getStateDetails()
          if (provider.config.statePath) {
            const stateFileExists = await this.call('fileManager', 'exists', provider.config.statePath)
            if (stateFileExists) {
              let stateDetails = await this.call('fileManager', 'readFile', provider.config.statePath)
              stateDetails = JSON.parse(stateDetails)
              state = JSON.parse(state)
              state['stateName'] = stateDetails.stateName
              state['forkName'] = stateDetails.forkName
              state['savingTimestamp'] = stateDetails.savingTimestamp
              state = JSON.stringify(state, null, 2)
            }
            this.call('fileManager', 'writeFile', provider.config.statePath, state)
          } else if (isBasicVMState && !isForkedRpcState && !isForkedRpcState) {
            // in that case, we store the state only if it is a basic VM.
            const provider = this.executionContext.getProvider()
            this.call('fileManager', 'writeFile', `.states/${provider}/state.json`, state)
          }
        } catch (e) {
          console.error(e)
        }
      }
    }
  }

  async deployContractAndLibraries(selectedContract, args, contractMetadata, compilerContracts) {
    const constructor = selectedContract.getConstructorInterface()
    const data = await txFormat.buildData(
      selectedContract.name,
      selectedContract.object,
      compilerContracts?.data?.contracts,
      true,
      constructor,
      args,
      async (data, runTxCallback) => {
        // called for libraries deployment
        try {
          const result = await this.runTx(data)
          // Pass result.txResult because deployLibrary expects txResult.receipt.contractAddress
          runTxCallback(null, result.txResult)
        } catch (error) {
          runTxCallback(error, null)
        }
      }
    )
    // statusCb(`creation of ${selectedContract.name} pending...`)
    return await this.createContract(selectedContract, data)
    // statusCb(`creation of ${selectedContract.name} errored: ${error.message ? error.message : error.error ? error.error : error}`)
  }

  async deployContractWithLibrary(selectedContract, args, contractMetadata) {
    const constructor = selectedContract.getConstructorInterface()
    const data = txFormat.encodeConstructorCallAndLinkLibraries(
      selectedContract.object,
      args,
      constructor,
      contractMetadata.linkReferences,
      selectedContract.bytecodeLinkReferences
    )

    // statusCb(`creation of ${selectedContract.name} pending...`)
    const result = await this.createContract(selectedContract, data)
    return result
  }

  async deployProxy(proxyData, implementationContractObject) {
    const proxyModal = {
      id: 'confirmProxyDeployment',
      title: 'Confirm Deploy Proxy (ERC1967)',
      message: `Confirm you want to deploy an ERC1967 proxy contract that is connected to your implementation.
      For more info on ERC1967, see: https://docs.openzeppelin.com/contracts/4.x/api/proxy#ERC1967Proxy`,
      modalType: 'modal',
      okLabel: 'OK',
      cancelLabel: 'Cancel',
      okFn: () => {
        this.runProxyTx(proxyData, implementationContractObject)
        trackMatomoEvent(this, { category: 'blockchain', action: 'deployWithProxy', name: 'modal ok confirmation', isClick: true })
      },
      cancelFn: () => {
        this.call('notification', 'toast', cancelProxyMsg())
        trackMatomoEvent(this, { category: 'blockchain', action: 'deployWithProxy', name: 'cancel proxy deployment', isClick: true })
      },
      hideFn: () => null
    }
    this.call('notification', 'modal', proxyModal)
  }

  async runProxyTx(proxyData, implementationContractObject) {
    const args = { useCall: false, data: proxyData }

    try {
      const result = await this.runTx(args)
      const { address } = result

      await this.saveDeployedContractStorageLayout(implementationContractObject, address)
      this.events.emit('newProxyDeployment', address, new Date().toISOString(), implementationContractObject.contractName)
      trackMatomoEvent(this, { category: 'blockchain', action: 'deployWithProxy', name: 'Proxy deployment successful', isClick: false })
      this.call('udappDeployedContracts', 'addInstance', addressToString(address), implementationContractObject.abi, implementationContractObject.name, implementationContractObject)
    } catch (error) {
      const log = logBuilder(error)

      trackMatomoEvent(this, { category: 'blockchain', action: 'deployWithProxy', name: 'Proxy deployment failed: ' + error, isClick: false })
      return this.call('terminal', 'logHtml', log)
    }
  }

  async upgradeProxy(proxyAddress, newImplAddress, data, newImplementationContractObject) {
    const upgradeModal = {
      id: 'confirmProxyDeployment',
      title: 'Confirm Update Proxy (ERC1967)',
      message: `Confirm you want to update your proxy contract with the new implementation contract's address:  ${newImplAddress}.`,
      modalType: 'modal',
      okLabel: 'OK',
      cancelLabel: 'Cancel',
      okFn: () => {
        this.runUpgradeTx(proxyAddress, data, newImplementationContractObject)
        trackMatomoEvent(this, { category: 'blockchain', action: 'upgradeWithProxy', name: 'proxy upgrade confirmation click', isClick: true })
      },
      cancelFn: () => {
        this.call('notification', 'toast', cancelUpgradeMsg())
        trackMatomoEvent(this, { category: 'blockchain', action: 'upgradeWithProxy', name: 'proxy upgrade cancel click', isClick: true })
      },
      hideFn: () => null
    }
    this.call('notification', 'modal', upgradeModal)
  }

  async runUpgradeTx(proxyAddress, data, newImplementationContractObject) {
    const args = { useCall: false, data, to: proxyAddress }

    try {
      await this.runTx(args)
      await this.saveDeployedContractStorageLayout(newImplementationContractObject, proxyAddress)
      trackMatomoEvent(this, { category: 'blockchain', action: 'upgradeWithProxy', name: 'Upgrade Successful', isClick: false })
      this.call('udappDeployedContracts', 'addInstance', addressToString(proxyAddress), newImplementationContractObject.abi, newImplementationContractObject.name, newImplementationContractObject)
    } catch (error) {
      const log = logBuilder(error)
      trackMatomoEvent(this, { category: 'blockchain', action: 'upgradeWithProxy', name: 'Upgrade failed', isClick: false })
      return this.call('terminal', 'logHtml', log)
    }
  }

  async saveDeployedContractStorageLayout(contractObject, proxyAddress) {
    const networkInfo = this.getCurrentNetworkStatus().network
    const { contractName, implementationAddress } = contractObject
    const networkName = networkInfo.name === 'custom' ? networkInfo.name + '-' + networkInfo.id : networkInfo.name === 'VM' ? networkInfo.name.toLowerCase() + '-' + this.getCurrentFork() : networkInfo.name
    const hasPreviousDeploys = await this.call('fileManager', 'exists', `.deploys/upgradeable-contracts/${networkName}/UUPS.json`)
    // TODO: make deploys folder read only.
    if (hasPreviousDeploys) {
      const deployments = await this.call('fileManager', 'readFile', `.deploys/upgradeable-contracts/${networkName}/UUPS.json`)
      const parsedDeployments = JSON.parse(deployments)
      const proxyDeployment = parsedDeployments.deployments[proxyAddress]

      if (proxyDeployment) {
        const oldImplementationAddress = proxyDeployment.implementationAddress
        const hasPreviousBuild = await this.call('fileManager', 'exists', `.deploys/upgradeable-contracts/${networkName}/solc-${oldImplementationAddress}.json`)

        if (hasPreviousBuild) await this.call('fileManager', 'remove', `.deploys/upgradeable-contracts/${networkName}/solc-${oldImplementationAddress}.json`)
      }
      parsedDeployments.deployments[proxyAddress] = {
        date: new Date().toISOString(),
        contractName: contractName,
        fork: this.getCurrentFork(),
        implementationAddress: implementationAddress,
        solcOutput: contractObject.compiler.data,
        solcInput: contractObject.compiler.source
      }
      await this.call(
        'fileManager',
        'writeFile',
        `.deploys/upgradeable-contracts/${networkName}/solc-${implementationAddress}.json`,
        JSON.stringify(
          {
            solcInput: contractObject.compiler.source,
            solcOutput: contractObject.compiler.data
          },
          null,
          2
        )
      )
      await this.call('fileManager', 'writeFile', `.deploys/upgradeable-contracts/${networkName}/UUPS.json`, JSON.stringify(parsedDeployments, null, 2))
    } else {
      await this.call(
        'fileManager',
        'writeFile',
        `.deploys/upgradeable-contracts/${networkName}/solc-${implementationAddress}.json`,
        JSON.stringify(
          {
            solcInput: contractObject.compiler.source,
            solcOutput: contractObject.compiler.data
          },
          null,
          2
        )
      )
      await this.call(
        'fileManager',
        'writeFile',
        `.deploys/upgradeable-contracts/${networkName}/UUPS.json`,
        JSON.stringify(
          {
            id: networkInfo.id,
            network: networkInfo.name,
            deployments: {
              [proxyAddress]: {
                date: new Date().toISOString(),
                contractName: contractName,
                fork: this.getCurrentFork(),
                implementationAddress: implementationAddress
              }
            }
          },
          null,
          2
        )
      )
    }
  }

  async getEncodedFunctionHex(args, funABI) {
    const data = await txFormat.encodeFunctionCall(args, funABI)

    return data.dataHex
  }

  async getEncodedParams(args, funABI) {
    const encodedParams = await txFormat.encodeParams(args, funABI)

    return encodedParams.dataHex
  }

  async createContract(selectedContract, data): Promise<{ selectedContract: any, address: string, txResult: any }> {
    if (data) {
      data.contractName = selectedContract.name
      data.linkReferences = selectedContract.bytecodeLinkReferences
      data.contractABI = selectedContract.abi
    }

    try {
      const result = await this.runTx({ data: data, useCall: false })
      const { txResult, address } = result

      if (txResult.receipt.status === false || txResult.receipt.status === '0x0' || txResult.receipt.status === 0) {
        throw new Error(`creation of ${selectedContract.name} errored: transaction execution failed`)
      }
      return { selectedContract, address, txResult }
    } catch (error) {
      throw new Error(`creation of ${selectedContract.name} errored: ${error.message ? error.message : error.error ? error.error : error}`)
    }
  }

  determineGasPrice() {
    return new Promise((resolve, reject) => {
      this.getCurrentProvider().getGasPrice((error, gasPrice) => {
        const warnMessage = ' Please fix this issue before sending any transaction. '
        if (error) {
          return reject('Unable to retrieve the current network gas price.' + warnMessage + error)
        }
        try {
          const gasPriceValue = this.fromWei(gasPrice, false, 'gwei')
          return resolve(gasPriceValue)
        } catch (e) {
          return reject(warnMessage + e.message)
        }
      })
    })
  }

  getInputs(funABI) {
    if (!funABI.inputs) {
      return ''
    }
    return txHelper.inputParametersDeclarationToString(funABI.inputs)
  }

  fromWei(value, doTypeConversion, unit) {
    if (doTypeConversion) {
      return formatUnits(typeConversion.toInt(value), unit || 'ether')
    }
    return formatUnits(value.toString(10), unit || 'ether')
  }

  toWei(value, unit) {
    return (parseUnits(value, unit || 'gwei')).toString()
  }

  changeExecutionContext(context) {
    if (this.currentRequest && this.currentRequest.from && !(this.currentRequest.from.startsWith('injected') || this.currentRequest.from === 'remixAI' || this.currentRequest.from === 'udappEnv')) {
      // only injected provider can update the provider.
      return
    }
    if (context.context === 'item-another-chain') {
      this.call('manager', 'activatePlugin', 'environmentExplorer').then(() => this.call('tabs', 'focus', 'environmentExplorer'))
    } else {
      return this.executionContext.executionContextChange(context)
    }
  }

  async detectNetwork() {
    return await this.executionContext.detectNetwork()
  }

  isVM() {
    return this.executionContext.isVM()
  }

  getWeb3() {
    return this.executionContext.web3()
  }

  getProvider() {
    return this.executionContext.getProvider()
  }

  getProviderObjByName(name) {
    const allProviders = this.getAllProviders()
    return allProviders[name]
  }

  getProviderObject() {
    return this.executionContext.getProviderObject()
  }

  /**
   * return the fork name applied to the current environment
   * @return {String} - fork name
   */
  getCurrentFork() {
    return this.executionContext.getCurrentFork()
  }

  signMessage(message, account, passphrase) {
    return new Promise((resolve, reject) => {
      this.getCurrentProvider().signMessage(message, account, passphrase, (err, msgHash, signedData) => {
        if (err) {
          return reject(err)
        }
        resolve ({ msgHash, signedData })
      })
    })
  }

  web3VM() {
    return (this.providers.vm as VMProvider).web3
  }

  web3() {
    const isVM = this.executionContext.isVM()
    if (isVM) {
      return (this.providers.vm as VMProvider).web3
    }
    return this.executionContext.web3()
  }

  /**
   * Generic JSON-RPC forwarder – runs web3.send() in-process so the
   * result travels back as plain, serialisable JSON through the plugin API.
   */
  async sendRpc(method: string, params?: any[]) {
    const web3 = this.web3()
    return await web3.send(method, params || [])
  }

  getTxListener(opts) {
    opts.event = {
      // udapp: this.udapp.event
      udapp: this.event
    }
    const txlistener = new Txlistener(opts, this.executionContext)
    return txlistener
  }

  async runOrCallContractMethod(contractName, contractAbi, funABI, contract, value, address, callType, sendParams?: { value: string, gasLimit: string }) {
    // contractsDetails is used to resolve libraries
    try {
      const data = await txFormat.buildData(
        contractName,
        contractAbi,
        {},
        false,
        funABI,
        callType,
        async (data, runTxCallback) => {
        // called for libraries deployment
          try {
            const result = await this.runTx(data)
            runTxCallback(null, result.txResult)
          } catch (error) {
            runTxCallback(error, null)
          }
        }
      )
      if (funABI.type === 'fallback') data.dataHex = value

      if (data) {
        data.contractName = contractName
        // @ts-ignore
        data.contractABI = contractAbi
        // @ts-ignore
        data.contract = contract

        // Apply send parameters if provided
        if (sendParams) {
          // @ts-ignore
          data.value = sendParams.value
          // @ts-ignore
          data.gasLimit = sendParams.gasLimit
        }
      }
      const useCall = funABI.stateMutability === 'view' || funABI.stateMutability === 'pure'
      const result = await this.runTx({ to: address, data, useCall })
      const { txResult, address: _address, returnValue } = result

      return { txResult, address: _address, returnValue }
    } catch (err) {
      const log = logBuilder(err.message)
      this.call('terminal', 'log', log)
      throw err
    }
  }

  context() {
    return this.executionContext.isVM() ? 'memory' : 'blockchain'
  }

  resetAndInit() {
    // this.transactionContextAPI = transactionContextAPI
    this.executionContext.init()
    this.executionContext.stopListenOnLastBlock()
    this.executionContext.listenOnLastBlock()
  }

  addProvider(provider: Provider) {
    // this.emit('shouldAddProvidertoUdapp', provider.name, provider)
    this.executionContext.addProvider(provider)
    // this.emit('providersChanged')
  }

  removeProvider(name) {
    this.emit('shouldRemoveProviderFromUdapp', name, this.getProviderObjByName(name))
    this.executionContext.removeProvider(name)
    // this.emit('providersChanged')
  }

  getAllProviders() {
    return this.executionContext.getAllProviders()
  }

  // getPinnedProviders() {
  //   return this.pinnedProviders
  // }

  // TODO : event should be triggered by Udapp instead of TxListener
  /** Listen on New Transaction. (Cannot be done inside constructor because txlistener doesn't exist yet) */
  startListening(txlistener) {
    txlistener.event.register('newTransaction', (tx, receipt) => {
      this.events.emit('newTransaction', tx, receipt)
    })
  }

  async loadContext(context: string) {
    const saveEvmState = this.config.get('settings/save-evm-state')

    if (saveEvmState) {
      const contextExists = await this.call('fileManager', 'exists', `.states/${context}/state.json`)
      if (contextExists) {
        const stateDb = await this.call('fileManager', 'readFile', `.states/${context}/state.json`)
        await this.getCurrentProvider().resetEnvironment(stateDb)
      } else {
        // check if forked VM state is used as provider
        const stateName = context.replace('vm-fs-', '')
        const contextExists = await this.call('fileManager', 'exists', `.states/forked_states/${stateName}.json`)
        if (contextExists) {
          const stateDb = await this.call('fileManager', 'readFile', `.states/forked_states/${stateName}.json`)
          await this.getCurrentProvider().resetEnvironment(stateDb)
        } else await this.getCurrentProvider().resetEnvironment()
      }
    } else {
      await this.getCurrentProvider().resetEnvironment()
    }

    const logTransaction = async (txhash, origin) => {
      const network = await this.detectNetwork()
      const actionName = origin === 'plugin' ? 'sendTransaction-from-plugin' : 'sendTransaction-from-gui';

      if (network && network.id) {
        trackMatomoEvent(this, { category: 'udapp', action: actionName, name: `${txhash}-${network.id}`, isClick: false })
      } else {
        try {
          const networkString = JSON.stringify(network)
          trackMatomoEvent(this, { category: 'udapp', action: actionName, name: `${txhash}-${networkString}`, isClick: false })
        } catch (e) {
          trackMatomoEvent(this, { category: 'udapp', action: actionName, name: `${txhash}-unknownnetwork`, isClick: false })
        }
      }
    }

    this.on('web3Provider', 'transactionBroadcasted', (txhash) => {
      logTransaction(txhash, 'plugin')
    })

    this.call('txRunner', 'resetInternalRunner')
  }

  /**
   * Create a VM Account
   * @param {{privateKey: string, balance: string}} newAccount The new account to create
   */
  createVMAccount(newAccount) {
    if (!this.executionContext.isVM()) {
      throw new Error('plugin API does not allow creating a new account through web3 connection. Only vm mode is allowed')
    }
    return (this.providers.vm as VMProvider).createVMAccount(newAccount)
  }

  async newAccount() {
    const passphrasePrompt = await this.call('udappEnv', 'getPassphrasePrompt')

    return new Promise((resolve, reject) => {
      this.getCurrentProvider().newAccount((cb) => {
        this.call('notification', 'modal', {
          id: 'newAccount',
          title: 'Enter Passphrase',
          message: passphrasePrompt,
          okLabel: 'OK',
          cancelLabel: 'Cancel',
          okFn: async () => {
            const passphrase = await this.call('udappEnv', 'getPassphrase')

            if (!passphrase) {
              return reject('Passphrase does not match')
            }
            cb(passphrase)
          },
          cancelFn: () => {
            reject('Canceled by user')
          }
        })
      }, (error, address) => {
        if (error) {
          return reject(error)
        }
        return resolve(address)
      })
    })
  }

  /** Get the balance of an address, and convert wei to ether */
  getBalanceInEther(address) {
    return this.getCurrentProvider().getBalanceInEther(address)
  }

  async getCode(address) {
    return await this.web3().getCode(address)
  }

  async getTransactionReceipt(hash) {
    return await this.web3().getTransactionReceipt(hash)
  }

  /**
   * This function send a tx only to Remix VM or testnet, will return an error for the mainnet
   * SHOULD BE TAKEN CAREFULLY!
   *
   * @param {Object} tx    - transaction.
   */
  async sendTransaction(tx: Transaction) {
    try {
      const network = await this.executionContext.detectNetwork()

      tx.gasLimit = '0x0' // force using gas estimation
      if (network.name === 'Main' && network.id === '1') {
        return new Promise((_, reject) => reject(new Error('It is not allowed to make this action against mainnet')))
      }

      try {
        const result = await this.call('txRunner', 'rawRun', tx)

        if (this.executionContext.isVM()) {
          const execResult = await this.web3().remix.getExecutionResultFromSimulator(result.transactionHash)
          return new Promise((resolve) => resolve(resultToRemixTx(result, execResult)))
        } else return new Promise((resolve) => resolve(resultToRemixTx(result)))
      } catch (e) {
        return new Promise((_, reject) => reject(e))
      }
    } catch (e) {
      return new Promise((_, reject) => reject(e))
    }
  }

  async runTx(args, silenceError = false): Promise<{ txResult: any, address: string, returnValue: string }> {
    try {
      const transaction = await this.runTransaction(args)
      const txResult = (transaction as any).result
      const tx = (transaction as any).tx
      /*
      value of txResult is inconsistent:
          - transact to contract:
            {"receipt": { ... }, "tx":{ ... }, "transactionHash":"0x7ba4c05075210fdbcf4e6660258379db5cc559e15703f9ac6f970a320c2dee09"}
          - call to contract:
            {"result":"0x0000000000000000000000000000000000000000000000000000000000000000","transactionHash":"0x5236a76152054a8aad0c7135bcc151f03bccb773be88fbf4823184e47fc76247"}
      */
      const isVM = this.executionContext.isVM()
      const provider = this.executionContext.getProviderObject()
      let execResult
      let returnValue = null

      if (isVM) {
        const hhlogs = await this.web3().remix.getHHLogsForTx(txResult.transactionHash)
        if (hhlogs && hhlogs.length) {
          const finalLogs = (
            <div>
              <div>
                <b>console.log:</b>
              </div>
              {hhlogs.map((log) => {
                let formattedLog
                // Hardhat implements the same formatting options that can be found in Node.js' console.log,
                // which in turn uses util.format: https://nodejs.org/dist/latest-v12.x/docs/api/util.html#util_util_format_format_args
                // For example: console.log("Name: %s, Age: %d", remix, 6) will log 'Name: remix, Age: 6'
                // We check first arg to determine if 'util.format' is needed
                if (typeof log[0] === 'string' && (log[0].includes('%s') || log[0].includes('%d'))) {
                  formattedLog = format(log[0], ...log.slice(1))
                } else {
                  formattedLog = log.join(' ')
                }
                return <div>{formattedLog}</div>
              })}
            </div>
          )
          trackMatomoEvent(this, { category: 'udapp', action: 'hardhat', name: 'console.log', isClick: false })
          this.call('terminal', 'logHtml', finalLogs)
        }
      }

      if (!tx.useCall && this.config.get('settings/save-evm-state')) {
        await this.dumpState()
      }

      if (isVM) {
        execResult = await this.web3().remix.getExecutionResultFromSimulator(txResult.transactionHash)
        if (execResult) {
          // if it's not the VM, we don't have return value. We only have the transaction, and it does not contain the return value.
          returnValue = execResult
            ? toBytes(execResult.returnValue)
            : toBytes(addHexPrefix(txResult.result) || '0x0000000000000000000000000000000000000000000000000000000000000000')
          const compiledContracts = await this.call('compilerArtefacts', 'getAllContractDatas')
          const vmError = txExecution.checkError({ errorMessage: execResult.exceptionError ? execResult.exceptionError.error : '', errorData: execResult.returnValue }, compiledContracts)
          if (vmError.error && !silenceError) {
            throw new Error(vmError.message)
          }
        }
      }
      if (!isVM && tx && tx.useCall) {
        returnValue = toBytes(addHexPrefix(txResult.result))
      }

      let address = null
      if (txResult && txResult.receipt) {
        address = txResult.receipt.contractAddress
      }

      return { txResult, address, returnValue }
    } catch (error) {
      const buildError = async (errorMessage, errorData) => {
        const compiledContracts = await this.call('compilerArtefacts', 'getAllContractDatas')
        return txExecution.checkError({ errorMessage, errorData }, compiledContracts)
      }
      let errorMessage
      let errorData
      if (error.innerError) {
        errorMessage = error.innerError.message
        errorData = error.innerError.data
        throw new Error((await buildError(errorMessage, errorData)).message)
      } else if (error.error) {
        errorMessage = error.error.message
        errorData = error.error.code
        throw new Error((await buildError(errorMessage, errorData)).message)
      } else if (error.message || error.data) {
        errorMessage = error.message
        errorData = error.data
        throw new Error((await buildError(errorMessage, errorData)).message)
      } else
        throw new Error(error)
    }
  }

  async getAccount(args) {
    if (args.from) {
      return new Promise((resolve) => resolve(args.from))
    }
    try {
      const address = await this.call('udappEnv', 'getSelectedAccount')

      if (!address) throw new Error('"from" is not defined. Please make sure an account is selected. If you are using a public node, it is likely that no account will be provided. In that case, add the public node to your injected provider (type Metamask) and use injected provider in Remix.')
      return address
    } catch (error) {
      const accounts = await this.getAccounts()
      const address = accounts[0]

      if (!address) throw new Error('No accounts available')
      // @ts-ignore
      if (this.executionContext.isVM() && !this.providers.vm.RemixSimulatorProvider.Accounts.accounts[address]) {
        throw new Error('Invalid account selected')
      }
      return address
    }
  }

  async runTransaction(args) {
    const gasLimit = args.to ? args.data?.gasLimit : await this.call('udappDeploy', 'getGasLimit')
    const value = args.to ? args.data?.value : await this.call('udappDeploy', 'getValue')
    const queryValue = !args.useCall ? value : '0x0'
    let fromAddress
    let fromSmartAccount
    let authorizationList
    try {
      fromAddress = await this.getAccount(args)
      fromSmartAccount = await this.isSmartAccount(fromAddress)
    } catch (e) {
      return new Promise((_, reject) => reject(e))
    }
    const tx = {
      to: args.to,
      data: args.data.dataHex,
      deployedBytecode: args.data.contractDeployedBytecode,
      useCall: args.useCall,
      from: fromAddress,
      fromSmartAccount,
      value: queryValue,
      gasLimit: gasLimit,
      timestamp: args.data.timestamp,
      authorizationList: args.authorizationList,
      web3: await this.getWeb3(), // Pass web3 to avoid circular callback
      provider: this.getProvider(), // Pass provider to avoid circular callback deadlock
      isVM: this.executionContext.isVM(), // Pass isVM to avoid circular callback deadlock
      determineGasPrice: await this.determineGasPrice() // Pass gasPrice to avoid circular callback deadlock
    }
    const payLoad = {
      funAbi: args.data.funAbi,
      funArgs: args.data.funArgs,
      contractBytecode: args.data.contractBytecode,
      contractName: args.data.contractName,
      contractABI: args.data.contractABI,
      linkReferences: args.data.linkReferences
    }

    if (!tx.timestamp) tx.timestamp = Date.now()
    const timestamp = tx.timestamp
    if (fromSmartAccount) trackMatomoEvent(this, { category: 'udapp', action: 'safeSmartAccount', name: 'txInitiatedFromSmartAccount', isClick: false })
    try {
      const result = await this.call('txRunner', 'rawRun', tx)
      const isVM = this.executionContext.isVM()
      if (isVM && tx.useCall) {
        try {
          result.transactionHash = await this.web3().remix.getHashFromTagBySimulator(timestamp)
        } catch (e) {
          console.log('unable to retrieve back the "call" hash', e)
        }
      }
      const eventName = tx.useCall ? 'callExecuted' : 'transactionExecuted'

      this._triggerEvent(eventName, [null, tx.from, tx.to, tx.data, tx.useCall, result, timestamp, payLoad])
      return new Promise((resolve) => resolve({ result, tx }))
    } catch (err) {
      return new Promise((_, reject) => reject(err))
    }
  }
}
