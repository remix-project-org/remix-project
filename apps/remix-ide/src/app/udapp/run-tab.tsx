/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import React from 'react' // eslint-disable-line
import { RunTabUI } from '@remix-ui/run-tab'
import { trackMatomoEvent } from '@remix-api'
import { ViewPlugin } from '@remixproject/engine-web'
import isElectron from 'is-electron'
import { addressToString } from '@remix-ui/helper'
import { InjectedProviderDefault } from '../providers/injected-provider-default'
import { InjectedCustomProvider } from '../providers/injected-custom-provider'
import * as packageJson from '../../../../../package.json'
import { EventManager } from '@remix-project/remix-lib'
import type { Blockchain } from '../../blockchain/blockchain'
import { ProviderConfig } from '@remix-ui/environment-explorer'
import type { CompilerArtefacts } from '@remix-project/core-plugin'
import { ForkedVMStateProvider } from '../providers/vm-provider'
import { Recorder } from '../tabs/runTab/model/recorder'
import { EnvDropdownLabelStateType } from 'libs/remix-ui/run-tab/src/lib/types'

export const providerLogos = {
  'injected-metamask-optimism': ['assets/img/optimism-ethereum-op-logo.png', 'assets/img/metamask.png'],
  'injected-metamask-arbitrum': ['assets/img/arbitrum-arb-logo.png', 'assets/img/metamask.png'],
  'injected-metamask-gnosis': ['assets/img/gnosis_chain.png', 'assets/img/metamask.png'],
  'injected-metamask-chiado': ['assets/img/gnosis_chain.png', 'assets/img/metamask.png'],
  'injected-metamask-linea': ['assets/img/linea_chain.png', 'assets/img/metamask.png'],
  'injected-metamask-sepolia': ['assets/img/metamask.png'],
  'injected-metamask-ephemery': ['assets/img/metamask.png'],
  'injected-MetaMask': ['assets/img/metamask.png'],
  'injected-Brave Wallet': ['assets/img/brave.png'],
  'injected-Trust Wallet': ['assets/img/trust-wallet.png'],
  'hardhat-provider': ['assets/img/hardhat.png'],
  'walletconnect': ['assets/img/Walletconnect-logo.png'],
  'foundry-provider': ['assets/img/foundry.png']
}

const profile = {
  name: 'udapp',
  displayName: 'Deploy & run transactions',
  icon: 'assets/img/deployAndRun.webp',
  description: 'Execute, save and replay transactions',
  kind: 'udapp',
  location: 'sidePanel',
  documentation: 'https://remix-ide.readthedocs.io/en/latest/run.html',
  version: packageJson.version,
  maintainedBy: 'Remix',
  permission: true,
  events: ['newTransaction'],
  methods: [
    'createVMAccount',
    'sendTransaction',
    'getAccounts',
    'pendingTransactionsCount',
    'getSettings',
    'setEnvironmentMode',
    'clearAllInstances',
    'addInstance',
    'resolveContractAndAddInstance',
    'showPluginDetails',
    'getRunTabAPI',
    'getDeployedContracts',
    'getAllDeployedInstances',
    'setAccount'
  ]
}

export class RunTab extends ViewPlugin {
  event: EventManager
  engine: any
  config: any
  blockchain: Blockchain
  fileManager: any
  editor: any
  filePanel: any
  compilersArtefacts: CompilerArtefacts
  networkModule: any
  fileProvider: any
  recorder: any
  REACT_API: any
  el: any
  allTransactionHistory: Map<string, any> = new Map()

  constructor(blockchain: Blockchain, config: any, fileManager: any, editor: any, filePanel: any, compilersArtefacts: CompilerArtefacts, networkModule: any, fileProvider: any, engine: any) {
    super(profile)
    this.event = new EventManager()
    this.engine = engine
    this.config = config
    this.blockchain = blockchain
    this.fileManager = fileManager
    this.editor = editor
    this.filePanel = filePanel
    this.compilersArtefacts = compilersArtefacts
    this.networkModule = networkModule
    this.fileProvider = fileProvider
    this.recorder = new Recorder(blockchain)
    this.REACT_API = {}
    this.setupEvents()
    this.el = document.createElement('div')
  }

  setupEvents() {
    this.blockchain.events.on('newTransaction', (tx, receipt) => {
      this.emit('newTransaction', tx, receipt)
    })
  }

  onActivation(): void {
    // Listen for transaction execution events to collect deployment data
    this.on('blockchain','transactionExecuted', (error, from, to, data, useCall, result, timestamp, payload) => {
      console.log('[UDAPP] Transaction execution detected:', result.receipt.contractAddress)

      if (!error && result && result.receipt && result.receipt.contractAddress) {

        // Store deployment transaction data
        const deploymentData = {
          transactionHash: result.receipt.transactionHash,
          blockHash: result.receipt.blockHash,
          blockNumber: result.receipt.blockNumber,
          gasUsed: result.receipt.gasUsed,
          gasPrice: result.receipt.gasPrice || result.receipt.effectiveGasPrice || '0',
          from: from,
          to: to,
          timestamp: timestamp,
          status: result.receipt.status ? 'success' : 'failed',
          constructorArgs: payload?.contractGuess?.constructorArgs || [],
          contractName: payload?.contractData?.name || payload?.contractGuess?.name || 'Unknown',
          value: result.receipt.value || '0'
        }

        this.allTransactionHistory.set(result.receipt.contractAddress, deploymentData)
      }
    })
  }

  getSettings() {
    return new Promise((resolve, reject) => {
      resolve({
        selectedAccount: this.REACT_API.accounts.selectedAccount,
        selectedEnvMode: this.REACT_API.selectExEnv,
        networkEnvironment: this.REACT_API.networkName
      })
    })
  }

  showPluginDetails() {
    return profile
  }

  async setEnvironmentMode(env) {
    const canCall = await this.askUserPermission('setEnvironmentMode', 'change the environment used')
    if (canCall) {
      env = typeof env === 'string' ? { context: env } : env
      this.emit('setEnvironmentModeReducer', env, this.currentRequest.from)
      this.allTransactionHistory.clear()
    }
  }

  setAccount(address: string) {
    this.emit('setAccountReducer', address)
  }

  getAllDeployedInstances() {
    return this.REACT_API.instances?.instanceList
  }

  clearAllInstances() {
    this.emit('clearAllInstancesReducer')
    this.allTransactionHistory.clear()
  }

  addInstance(address, abi, name, contractData?) {
    this.emit('addInstanceReducer', address, abi, name, contractData)
  }

  createVMAccount(newAccount) {
    return this.blockchain.createVMAccount(newAccount)
  }

  sendTransaction(tx) {
    trackMatomoEvent(this, { category: 'udapp', action: 'sendTx', name: 'udappTransaction', isClick: true })
    return this.blockchain.sendTransaction(tx)
  }

  getAccounts(cb) {
    return this.blockchain.getAccounts(cb)
  }

  getRunTabAPI(){
    return this.REACT_API;
  }

  getDeployedContracts() {
    if (!this.REACT_API || !this.REACT_API.instances) {
      return {};
    }
    const instances = this.REACT_API.instances.instanceList || [];
    const deployedContracts = {};
    const currentProvider = this.REACT_API.selectExEnv || 'vm-london';

    deployedContracts[currentProvider] = {};

    instances.forEach((instance, index) => {
      if (instance && instance.address) {
        const txData = this.allTransactionHistory.get(instance.address)

        const contractInstance = {
          name: instance.name || txData?.contractName || 'Unknown',
          address: instance.address,
          abi: instance.contractData?.abi || instance.abi || [],
          timestamp: txData?.timestamp ? new Date(txData.timestamp).toISOString() : new Date().toISOString(),
          from: txData?.from || this.REACT_API.accounts?.selectedAccount || 'unknown',
          transactionHash: txData?.transactionHash || 'unknown',
          blockHash: txData?.blockHash,
          blockNumber: Number(txData?.blockNumber) || 0,
          gasUsed: Number(txData?.gasUsed)|| 0,
          gasPrice: txData?.gasPrice || '0',
          value: txData?.value || '0',
          status: txData?.status || 'unknown',
          constructorArgs: txData?.constructorArgs || [],
          verified: false,
          index: index
        }

        deployedContracts[currentProvider][instance.address] = contractInstance
      }
    });

    return deployedContracts;
  }

  pendingTransactionsCount() {
    return this.blockchain.pendingTransactionsCount()
  }

  render() {
    return (
      <div>
        <RunTabUI plugin={this} />
      </div>
    )
  }

  onReady(api) {
    this.REACT_API = api
  }

  async onInitDone() {
    const udapp = this // eslint-disable-line

    const descriptions = {
      'vm-cancun': 'Deploy to the in-browser virtual machine running the Cancun fork.',
      'vm-shanghai': 'Deploy to the in-browser virtual machine running the Shanghai fork.',
      'vm-paris': 'Deploy to the in-browser virtual machine running the Paris fork.',
      'vm-london': 'Deploy to the in-browser virtual machine running the London fork.',
      'vm-berlin': 'Deploy to the in-browser virtual machine running the Berlin fork.',
      'vm-prague': 'Deploy to the in-browser virtual machine running the Prague fork.',
      'vm-osaka': 'Deploy to the in-browser virtual machine running the Osaka fork.',
      'vm-mainnet-fork': 'Deploy to a fork of the Ethereum mainnet latest block in the in-browser virtual machine.',
      'vm-sepolia-fork': 'Deploy to a fork of the Sepolia testnet latest block in the in-browser virtual machine.',
      'vm-custom-fork': 'Deploy to a fork of a custom network in the in-browser virtual machine.',
      'walletconnect': 'Deploy using WalletConnect.',
      'desktopHost': 'Deploy using web metamask.',
      'basic-http-provider': 'Deploy to a Custom local network.',
      'hardhat-provider': 'Deploy to the local Hardhat dev chain.',
      'ganache-provider': 'Deploy to the local Ganache dev chain.',
      'foundry-provider': 'Deploy to the local Foundry dev chain.',
      'injected-MetaMask': 'Deploy through the Metamask browser extension.',
      'injected-Brave Wallet': 'Deploy through the Brave Wallet extension.',
      'injected-Brave': 'Deploy through the Brave browser extension.',
      'injected-metamask-optimism': 'Deploy to Optimism through the Metamask browser extension.',
      'injected-metamask-gnosis': 'Deploy to Gnosis through the Metamask browser extension.',
      'injected-metamask-chiado': 'Deploy to Gnosis Chiado Testnet through the Metamask browser extension.',
      'injected-metamask-arbitrum': 'Deploy to Arbitrum through the Metamask browser extension.',
      'injected-metamask-sepolia': 'Deploy to the Sepolia testnet through the Metamask browser extension.',
      'injected-metamask-ephemery': 'Deploy to the Ephemery testnet through the Metamask browser extension.',
      'injected-metamask-linea': 'Deploy to Linea through the Metamask browser extension.'
    }

    const addProvider = async (position: number, name: string, displayName: string, providerConfig: ProviderConfig, dataId = '', title = '') => {
      await this.call('blockchain', 'addProvider', {
        position,
        options: {},
        dataId,
        name,
        displayName,
        description: descriptions[name] || displayName,
        logos: providerLogos[name],
        config: providerConfig,
        title,
        init: async function () {
          const options = await udapp.call(name, 'init')
          if (options) {
            this.options = options
            if (options['fork']) this.config.fork = options['fork']
            if (options['nodeUrl']) this.config.nodeUrl = options['nodeUrl']
            if (options['blockNumber']) this.config.blockNumber = options['blockNumber']
          }
        },
        provider: new Provider(udapp, name)
      })
      this.emit('providerAdded', {
        name,
        displayName,
        description: descriptions[name] || displayName,
        logos: providerLogos[name],
        isInjected: providerConfig.isInjected,
        isVM: providerConfig.isVM,
        isForkedState: providerConfig.isRpcForkedState,
      })
    }

    const addCustomInjectedProvider = async (position, event, name, displayName, networkId, urls, nativeCurrency?) => {
      // name = `${name} through ${event.detail.info.name}`
      const parent = 'injected-' + event.detail.info.name
      await this.engine.register([new InjectedCustomProvider(event.detail.provider, name, displayName, networkId, urls, nativeCurrency, [], parent)])
      await addProvider(position, name, displayName + ' - ' + event.detail.info.name, { isInjected: true, isVM: false, isRpcForkedState: false, fork: '' })
    }
    const registerInjectedProvider = async (event) => {
      const name = 'injected-' + event.detail.info.name
      const displayName = 'Injected Provider - ' + event.detail.info.name
      await this.engine.register([new InjectedProviderDefault(event.detail.provider, name)])
      await addProvider(0, name, displayName, { isInjected: true, isVM: false, isRpcForkedState: false, fork: '' })

      if (event.detail.info.name === 'MetaMask') {
        await addCustomInjectedProvider(7, event, 'injected-metamask-optimism', 'L2 - Optimism', '0xa', ['https://mainnet.optimism.io'])
        await addCustomInjectedProvider(8, event, 'injected-metamask-arbitrum', 'L2 - Arbitrum', '0xa4b1', ['https://arb1.arbitrum.io/rpc'])
        await addCustomInjectedProvider(5, event, 'injected-metamask-sepolia', 'Sepolia Testnet', '0xaa36a7', [],
          {
            "name": "Sepolia ETH",
            "symbol": "ETH",
            "decimals": 18
          })
        await addCustomInjectedProvider(9, event, 'injected-metamask-ephemery', 'Ephemery Testnet', '', ['https://otter.bordel.wtf/erigon', 'https://eth.ephemeral.zeus.fyi'],
          {
            "name": "Ephemery ETH",
            "symbol": "ETH",
            "decimals": 18
          })
        await addCustomInjectedProvider(10, event, 'injected-metamask-gnosis', 'Gnosis Mainnet', '', ['https://gnosis.drpc.org'],
          {
            "name": "XDAI",
            "symbol": "XDAI",
            "decimals": 18
          })
        await addCustomInjectedProvider(11, event, 'injected-metamask-chiado', 'Gnosis Chiado Testnet', '', ['https://gnosis-chiado.drpc.org'],
          {
            "name": "XDAI",
            "symbol": "XDAI",
            "decimals": 18
          })
        /*
        await addCustomInjectedProvider(9, event, 'SKALE Chaos Testnet', '0x50877ed6', ['https://staging-v3.skalenodes.com/v1/staging-fast-active-bellatrix'],
          {
            "name": "sFUEL",
            "symbol": "sFUEL",
            "decimals": 18
          })
        */
        await addCustomInjectedProvider(12, event, 'injected-metamask-linea', 'L2 - Linea', '0xe708', ['https://rpc.linea.build'])
      }
    }

    // VM
    const titleVM = 'Execution environment is local to Remix.  Data is only saved to browser memory and will vanish upon reload.'
    await addProvider(1, 'vm-osaka', 'Remix VM (Osaka)', { isInjected: false, isVM: true, isRpcForkedState: false, statePath: '.states/vm-osaka/state.json', fork: 'osaka' }, 'settingsVMFusakaMode', titleVM)
    await addProvider(2, 'vm-prague', 'Remix VM (Prague)', { isInjected: false, isVM: true, isRpcForkedState: false, statePath: '.states/vm-prague/state.json', fork: 'prague' }, 'settingsVMPectraMode', titleVM)
    await addProvider(3, 'vm-cancun', 'Remix VM (Cancun)', { isInjected: false, isVM: true, isRpcForkedState: false, statePath: '.states/vm-cancun/state.json', fork: 'cancun' }, 'settingsVMCancunMode', titleVM)
    await addProvider(50, 'vm-shanghai', 'Remix VM (Shanghai)', { isInjected: false, isVM: true, isRpcForkedState: false, statePath: '.states/vm-shanghai/state.json', fork: 'shanghai' }, 'settingsVMShanghaiMode', titleVM)
    await addProvider(51, 'vm-paris', 'Remix VM (Paris)', { isInjected: false, isVM: true, isRpcForkedState: false, statePath: '.states/vm-paris/state.json', fork: 'paris' }, 'settingsVMParisMode', titleVM)
    await addProvider(52, 'vm-london', 'Remix VM (London)', { isInjected: false, isVM: true, isRpcForkedState: false, statePath: '.states/vm-london/state.json', fork: 'london' }, 'settingsVMLondonMode', titleVM)
    await addProvider(53, 'vm-berlin', 'Remix VM (Berlin)', { isInjected: false, isVM: true, isRpcForkedState: false, statePath: '.states/vm-berlin/state.json', fork: 'berlin' }, 'settingsVMBerlinMode', titleVM)
    await addProvider(4, 'vm-mainnet-fork', 'Remix VM - Mainnet fork', { isInjected: false, isVM: true, isVMStateForked: true, isRpcForkedState: true, fork: 'osaka' }, 'settingsVMMainnetMode', titleVM)
    await addProvider(5, 'vm-sepolia-fork', 'Remix VM - Sepolia fork', { isInjected: false, isVM: true, isVMStateForked: true, isRpcForkedState: true, fork: 'osaka' }, 'settingsVMSepoliaMode', titleVM)
    await addProvider(6, 'vm-custom-fork', 'Remix VM - Custom fork', { isInjected: false, isVM: true, isVMStateForked: true, isRpcForkedState: true, fork: '' }, 'settingsVMCustomMode', titleVM)

    // Forked VM States
    const addFVSProvider = async(stateFilePath, pos) => {
      let stateDetail = await this.call('fileManager', 'readFile', stateFilePath)
      stateDetail = JSON.parse(stateDetail)
      const providerName = 'vm-fs-' + stateDetail.stateName
      descriptions[providerName] = JSON.stringify({
        name: providerName,
        latestBlock: stateDetail.latestBlockNumber,
        timestamp: stateDetail.savingTimestamp
      })
      // Create and register provider plugin for saved states
      const fvsProvider = new ForkedVMStateProvider({
        name: providerName,
        displayName: stateDetail.stateName,
        kind: 'provider',
        description: descriptions[providerName],
        methods: ['sendAsync', 'init'],
        version: packageJson.version
      }, this.blockchain, stateDetail.forkName, stateDetail.nodeUrl, stateDetail.blockNumber)
      const isRpcForkedState = !!stateDetail.nodeUrl
      this.engine.register(fvsProvider)
      await addProvider(pos, providerName, stateDetail.stateName, { nodeUrl: stateDetail.nodeUrl, baseBlockNumber: stateDetail.baseBlockNumber, isInjected: false, isVM: true, isRpcForkedState, isVMStateForked: true, statePath: `.states/forked_states/${stateDetail.stateName}.json`, fork: stateDetail.forkName })
    }

    this.on('filePanel', 'workspaceInitializationCompleted', async () => {
      const ssExists = await this.call('fileManager', 'exists', '.states/forked_states')
      if (ssExists) {
        const savedStatesDetails = await this.call('fileManager', 'readdir', '.states/forked_states')
        const savedStatesFiles = Object.keys(savedStatesDetails)
        let pos = 10
        for (const filePath of savedStatesFiles) {
          pos += 1
          await addFVSProvider(filePath, pos)
        }
      }
    })

    this.on('udapp', 'vmStateForked', async (stateName) => {
      await addFVSProvider(`.states/forked_states/${stateName}.json`, 20)
      this.emit('forkStateProviderAdded', stateName)
    })

    if (isElectron()) {
      // desktop host
      await addProvider(5, 'desktopHost', 'Browser Wallet', { isInjected: false, isVM: false, isRpcForkedState: false, fork: '' })
    }

    // wallet connect
    await addProvider(6, 'walletconnect', 'WalletConnect', { isInjected: false, isVM: false, isRpcForkedState: false, fork: '' })

    // external provider
    await addProvider(10, 'basic-http-provider', 'Custom - External Http Provider', { isInjected: false, isVM: false, isRpcForkedState: false, fork: '' })
    await addProvider(20, 'hardhat-provider', 'Dev - Hardhat Provider', { isInjected: false, isVM: false, isRpcForkedState: false, fork: '' })
    await addProvider(21, 'ganache-provider', 'Dev - Ganache Provider', { isInjected: false, isVM: false, isRpcForkedState: false, fork: '' })
    await addProvider(22, 'foundry-provider', 'Dev - Foundry Provider', { isInjected: false, isVM: false, isRpcForkedState: false, fork: '' })

    // register injected providers

    window.addEventListener(
      "eip6963:announceProvider",
      (event) => {
        registerInjectedProvider(event)
      }
    )
    if (!isElectron()) window.dispatchEvent(new Event("eip6963:requestProvider"))
  }

  writeFile(fileName, content) {
    return this.call('fileManager', 'writeFile', fileName, content)
  }

  readFile(fileName) {
    return this.call('fileManager', 'readFile', fileName)
  }

  async resolveContractAndAddInstance(contractObject, address) {
    const data = await this.compilersArtefacts.getCompilerAbstract(contractObject.contract.file)

    this.compilersArtefacts.addResolvedContract(addressToString(address), data)
    this.addInstance(address, contractObject.abi, contractObject.name)
  }
}

class Provider {
  udapp: RunTab
  name: string
  constructor(udapp, name) {
    this.udapp = udapp
    this.name = name
  }
  sendAsync (payload) {
    return this.udapp.call(this.name, 'sendAsync', payload)
  }
  send (payload) {
    return this.udapp.call(this.name, 'sendAsync', payload)
  }
  request (payload): Promise<any> {
    return new Promise((resolve, reject) => {
      this.udapp.call(this.name, 'sendAsync', payload).then((response) => {
        if (response.error) {
          reject(response.error)
        } else {
          resolve(response.result? response.result : response)
        }
      }).catch((err) => {
        reject(err.error ? err.error : err)
      })
    })
  }
}
