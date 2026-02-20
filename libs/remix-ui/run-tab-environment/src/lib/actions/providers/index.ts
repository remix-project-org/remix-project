import { Engine, Plugin } from "@remixproject/engine"
import { Actions, ProviderDetails, ProviderDetailsEvent } from "../../types"
import { PROVIDER_DESCRIPTIONS, PROVIDER_LOGOS } from "../../constants"
import { ProviderWrapper } from "./providerWrapper"
import { InjectedCustomProvider } from "./injected-custom-provider"
import { InjectedProviderDefault } from "./injected-provider-default"
import { ForkedVMStateProvider } from "./vm-provider"
// eslint-disable-next-line @nrwl/nx/enforce-module-boundaries
import { EnvironmentPlugin } from 'apps/remix-ide/src/app/udapp/udappEnv'
import * as packageJson from '../../../../../../../package.json'

export async function addProvider (providerDetails: ProviderDetails, plugin: EnvironmentPlugin, dispatch: React.Dispatch<Actions>) {
  const { position, name, displayName, category, providerConfig, dataId = '', title = '' } = providerDetails
  const provider = {
    position,
    options: {},
    dataId,
    name,
    displayName,
    description: PROVIDER_DESCRIPTIONS[name] || displayName,
    logos: PROVIDER_LOGOS[name],
    config: providerConfig,
    title,
    category,
    init: async function () {
      const options = await plugin.call(name, 'init')
      if (options) {
        this.options = options
        if (options['fork']) this.config.fork = options['fork']
        if (options['nodeUrl']) this.config.nodeUrl = options['nodeUrl']
        if (options['blockNumber']) this.config.blockNumber = options['blockNumber']
      }
    },
    provider: new ProviderWrapper(plugin, name)
  }
  await plugin.call('blockchain', 'addProvider', provider)
  dispatch({ type: 'ADD_PROVIDER', payload: provider })
  plugin.emit('providerAdded', {
    name,
    displayName,
    description: PROVIDER_DESCRIPTIONS[name] || displayName,
    logos: PROVIDER_LOGOS[name],
    isInjected: providerConfig.isInjected,
    isVM: providerConfig.isVM,
    isForkedState: providerConfig.isRpcForkedState,
  })
}

export async function addCustomInjectedProvider (providerDetails: ProviderDetails, plugin: EnvironmentPlugin, dispatch: React.Dispatch<Actions>) {
  const { position, event, name, displayName, networkId, urls, nativeCurrency } = providerDetails
  // name = `${name} through ${event.detail.info.name}`
  const parent = 'injected-' + event.detail.info.name
  await plugin.engine.register([new InjectedCustomProvider(event.detail.provider, name, displayName, networkId, urls, nativeCurrency, [], parent)])
  await addProvider({ position, name, displayName: displayName + ' - ' + event.detail.info.name, category: 'Browser Extension', providerConfig: { isInjected: true, isVM: false, isRpcForkedState: false, fork: '' } }, plugin, dispatch)
}

export async function registerInjectedProvider (event: ProviderDetailsEvent, plugin: EnvironmentPlugin, dispatch: React.Dispatch<Actions>) {
  const name = 'injected-' + event.detail.info.name
  const displayName = 'Injected Provider - ' + event.detail.info.name
  await plugin.engine.register([new InjectedProviderDefault(event.detail.provider, name)])
  await addProvider({ position: 0, name, displayName, category: 'Browser Extension', providerConfig: { isInjected: true, isVM: false, isRpcForkedState: false, fork: '' } }, plugin, dispatch)

  if (event.detail.info.name === 'MetaMask') {
    await addCustomInjectedProvider({ position: 7, event, name: 'injected-metamask-optimism', displayName: 'L2 - Optimism', networkId: '0xa', urls: ['https://mainnet.optimism.io']}, plugin, dispatch)
    await addCustomInjectedProvider({ position: 8, event, name: 'injected-metamask-arbitrum', displayName: 'L2 - Arbitrum', networkId: '0xa4b1', urls: ['https://arb1.arbitrum.io/rpc']}, plugin, dispatch)
    await addCustomInjectedProvider({ position: 5, event, name: 'injected-metamask-sepolia', displayName: 'Sepolia Testnet', networkId: '0xaa36a7', urls: [], nativeCurrency: {
      "name": "Sepolia ETH",
      "symbol": "ETH",
      "decimals": 18
    } }, plugin, dispatch)
    await addCustomInjectedProvider({ position: 9, event, name: 'injected-metamask-ephemery', displayName: 'Ephemery Testnet', networkId: '', urls: ['https://otter.bordel.wtf/erigon', 'https://eth.ephemeral.zeus.fyi'], nativeCurrency: {
      "name": "Ephemery ETH",
      "symbol": "ETH",
      "decimals": 18
    } }, plugin, dispatch)
    await addCustomInjectedProvider({ position: 10, event, name: 'injected-metamask-gnosis', displayName: 'Gnosis Mainnet', networkId: '', urls: ['https://gnosis.drpc.org'], nativeCurrency: {
      "name": "XDAI",
      "symbol": "XDAI",
      "decimals": 18
    } }, plugin, dispatch)
    await addCustomInjectedProvider({ position: 11, event, name: 'injected-metamask-chiado', displayName: 'Gnosis Chiado Testnet', networkId: '', urls: ['https://gnosis-chiado.drpc.org'], nativeCurrency: {
      "name": "XDAI",
      "symbol": "XDAI",
      "decimals": 18
    } }, plugin, dispatch)
    /*
    await addCustomInjectedProvider(9, event, 'SKALE Chaos Testnet', '0x50877ed6', ['https://staging-v3.skalenodes.com/v1/staging-fast-active-bellatrix'],
      {
        "name": "sFUEL",
        "symbol": "sFUEL",
        "decimals": 18
      })
    */
    await addCustomInjectedProvider({ position: 12, event, name: 'injected-metamask-linea', displayName: 'L2 - Linea', networkId: '0xe708', urls: ['https://rpc.linea.build']}, plugin, dispatch)
  }
}

// Forked VM States
export async function addFVSProvider (stateFilePath: string, pos: number, plugin: EnvironmentPlugin, dispatch: React.Dispatch<Actions>) {
  let stateDetail = await plugin.call('fileManager', 'readFile', stateFilePath)
  stateDetail = JSON.parse(stateDetail)
  const providerName = 'vm-fs-' + stateDetail.stateName
  PROVIDER_DESCRIPTIONS[providerName] = JSON.stringify({
    name: providerName,
    latestBlock: stateDetail.latestBlockNumber,
    timestamp: stateDetail.savingTimestamp
  })
  // Create and register provider plugin for saved states
  const fvsProvider = new ForkedVMStateProvider({
    name: providerName,
    displayName: stateDetail.stateName,
    kind: 'provider',
    description: PROVIDER_DESCRIPTIONS[providerName],
    methods: ['sendAsync', 'init'],
    version: packageJson.version
  }, plugin.blockchain, stateDetail.forkName, stateDetail.nodeUrl, stateDetail.blockNumber)

  const isRpcForkedState = !!stateDetail.nodeUrl

  plugin.engine.register(fvsProvider)
  await addProvider({ position: pos, name: providerName, displayName: stateDetail.stateName, category: 'Forked State', providerConfig: { nodeUrl: stateDetail.nodeUrl, baseBlockNumber: stateDetail.baseBlockNumber, isInjected: false, isVM: true, isRpcForkedState, isVMStateForked: true, statePath: `.states/forked_states/${stateDetail.stateName}.json`, fork: stateDetail.forkName } }, plugin, dispatch)
}
