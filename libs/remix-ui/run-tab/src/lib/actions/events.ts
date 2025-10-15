import { envChangeNotification } from "@remix-ui/helper"
import { RunTab } from "../types/run-tab"
import { trackMatomoEvent } from '@remix-api'
import { setExecutionContext, setFinalContext, updateAccountBalances, fillAccountsList } from "./account"
import { addExternalProvider, addInstance, addNewProxyDeployment, removeExternalProvider, setNetworkNameFromProvider, setPinnedChainId, setExecEnv } from "./actions"
import { addDeployOption, clearAllInstances, clearRecorderCount, fetchContractListSuccess, resetProxyDeployments, resetUdapp, setCurrentContract, setCurrentFile, setLoadType, setRecorderCount, setRemixDActivated, setSendValue, fetchAccountsListSuccess, fetchAccountsListRequest } from "./payload"
import { updateInstanceBalance } from './deploy'
import { CompilerAbstract } from '@remix-project/remix-solidity'
import BN from 'bn.js'
import { Web3 } from 'web3'
import { Plugin } from "@remixproject/engine"
import { getNetworkProxyAddresses } from "./deploy"
import { shortenAddress } from "@remix-ui/helper"

let dispatch: React.Dispatch<any> = () => {}

export const setEventsDispatch = (reducerDispatch: React.Dispatch<any>) => {
  dispatch = reducerDispatch
}

export const setupEvents = (plugin: RunTab) => {
  // This maintains current network state and update the pinned contracts list,
  // only when there is a change in provider or in chain id for same provider
  // as 'networkStatus' is triggered in each 10 seconds
  const currentNetwork = {
    provider: null,
    chainId: null
  }
  plugin.blockchain.events.on('newTransaction', (tx, receipt) => {
    plugin.emit('newTransaction', tx, receipt)
  })

  plugin.blockchain.event.register('transactionExecuted', (error, from, to, data, lookupOnly, txResult) => {
    if (!lookupOnly) dispatch(setSendValue('0'))
    if (error) return
    updateAccountBalances(plugin, dispatch)
    updateInstanceBalance(plugin, dispatch)
  })

  plugin.blockchain.event.register('contextChanged', async (context) => {
    dispatch(resetProxyDeployments())
    getNetworkProxyAddresses(plugin, dispatch)
    setFinalContext(plugin, dispatch)
    fillAccountsList(plugin, dispatch)
    // 'contextChanged' & 'networkStatus' both are triggered on workspace & network change
    // There is chance that pinned contracts state is overridden by other event
    // We load pinned contracts for VM environment in this event
    // and for other environments in 'networkStatus' event
    if (context.startsWith('vm')) await loadPinnedContracts(plugin, dispatch, context)
  })

  plugin.blockchain.event.register('networkStatus', async ({ error, network }) => {
    if (error) {
      const netUI = 'can\'t detect network'
      setNetworkNameFromProvider(dispatch, netUI)
      return
    }
    const networkProvider = plugin.networkModule.getNetworkProvider.bind(plugin.networkModule)
    const isVM = networkProvider().startsWith('vm') ? true : false
    const netUI = !isVM ? `${network.name} (${network.id || '-'}) network` : 'VM'
    const pinnedChainId = !isVM ? network.id : networkProvider()
    setNetworkNameFromProvider(dispatch, netUI)
    setPinnedChainId(dispatch, pinnedChainId)

    // Check if provider is changed or network is changed for same provider e.g; Metamask
    if (currentNetwork.provider !== networkProvider() || (!isVM && currentNetwork.chainId !== network.id)) {
      currentNetwork.provider = networkProvider()
      if (!isVM) {
        fillAccountsList(plugin, dispatch)
        currentNetwork.chainId = network.id
        await loadPinnedContracts(plugin, dispatch, pinnedChainId)
      }
    }
  })

  plugin.on('blockchain', 'shouldAddProvidertoUdapp', (name, provider) => addExternalProvider(dispatch, provider))

  plugin.on('blockchain', 'shouldRemoveProviderFromUdapp', (name, provider) => removeExternalProvider(dispatch, name))

  plugin.blockchain.events.on('newProxyDeployment', (address, date, contractName) => addNewProxyDeployment(dispatch, address, date, contractName))

  plugin.on('solidity', 'compilationFinished', (file, source, languageVersion, data, input, version) => broadcastCompilationResult('remix', plugin, dispatch, file, source, languageVersion, data, input))

  plugin.on('vyper', 'compilationFinished', (file, source, languageVersion, data) => broadcastCompilationResult('vyper', plugin, dispatch, file, source, languageVersion, data))

  plugin.on('lexon', 'compilationFinished', (file, source, languageVersion, data) => broadcastCompilationResult('lexon', plugin, dispatch, file, source, languageVersion, data))

  plugin.on('yulp', 'compilationFinished', (file, source, languageVersion, data) => broadcastCompilationResult('yulp', plugin, dispatch, file, source, languageVersion, data))

  plugin.on('nahmii-compiler', 'compilationFinished', (file, source, languageVersion, data) => broadcastCompilationResult('nahmii', plugin, dispatch, file, source, languageVersion, data))

  plugin.on('hardhat', 'compilationFinished', (file, source, languageVersion, data) => broadcastCompilationResult('hardhat', plugin, dispatch, file, source, languageVersion, data))

  plugin.on('foundry', 'compilationFinished', (file, source, languageVersion, data) => broadcastCompilationResult('foundry', plugin, dispatch, file, source, languageVersion, data))

  plugin.on('truffle', 'compilationFinished', (file, source, languageVersion, data) => broadcastCompilationResult('truffle', plugin, dispatch, file, source, languageVersion, data))

  plugin.on('desktopHost', 'chainChanged', (context) => {
    //console.log('desktopHost chainChanged', context)
    fillAccountsList(plugin, dispatch)
    updateInstanceBalance(plugin, dispatch)
  })

  plugin.on('desktopHost', 'disconnected', () => {
    setExecutionContext(plugin, dispatch, { context: 'vm-cancun', fork: '' })
  })

  plugin.on('udapp', 'setEnvironmentModeReducer', (env: { context: string, fork: string }, from: string) => {
    plugin.call('notification', 'toast', envChangeNotification(env, from))
    setExecutionContext(plugin, dispatch, env)
  })

  plugin.on('udapp', 'clearAllInstancesReducer', () => {
    dispatch(clearAllInstances())
  })

  plugin.on('udapp', 'addInstanceReducer', (address, abi, name, contractData?) => {
    addInstance(dispatch, { contractData, abi, address, name })
  })

  plugin.on('filePanel', 'setWorkspace', async () => {
    dispatch(resetUdapp())
    resetAndInit(plugin)
    await migrateSavedContracts(plugin)
    plugin.call('manager', 'isActive', 'remixd').then((activated) => {
      dispatch(setRemixDActivated(activated))
    })
  })

  plugin.on('manager', 'pluginActivated', (activatedPlugin: Plugin) => {
    if (activatedPlugin.name === 'remixd') {
      dispatch(setRemixDActivated(true))
    } else {
      if (activatedPlugin && activatedPlugin.name.startsWith('injected')) {
        plugin.on(activatedPlugin.name, 'accountsChanged', (accounts: Array<string>) => {
          const accountsMap = {}
          accounts.map(account => { accountsMap[account] = shortenAddress(account, '0')})
          dispatch(fetchAccountsListSuccess(accountsMap))
        })
      } else if (activatedPlugin && activatedPlugin.name === 'walletconnect') {
        plugin.on('walletconnect', 'accountsChanged', async (accounts: Array<string>) => {
          const accountsMap = {}

          await Promise.all(accounts.map(async (account) => {
            const balance = await plugin.blockchain.getBalanceInEther(account)
            const updated = shortenAddress(account, balance)

            accountsMap[account] = updated
          }))
          dispatch(fetchAccountsListSuccess(accountsMap))
        })
      }
    }
  })

  plugin.on('manager', 'pluginDeactivated', (plugin: Plugin) => {
    if (plugin.name === 'remixd') {
      dispatch(setRemixDActivated(false))
    }
  })

  plugin.on('fileManager', 'currentFileChanged', (currentFile: string) => {
    if (/.(.abi)$/.exec(currentFile)) dispatch(setLoadType('abi'))
    else if (/.(.sol)$/.exec(currentFile)) dispatch(setLoadType('sol'))
    else if (/.(.vy)$/.exec(currentFile)) dispatch(setLoadType('vyper'))
    else if (/.(.lex)$/.exec(currentFile)) dispatch(setLoadType('lexon'))
    else if (/.(.contract)$/.exec(currentFile)) dispatch(setLoadType('contract'))
    else dispatch(setLoadType('other'))
    dispatch(setCurrentFile(currentFile))
  })

  plugin.recorder.event.register('recorderCountChange', (count) => {
    dispatch(setRecorderCount(count))
  })

  plugin.event.register('cleared', () => {
    dispatch(clearRecorderCount())
  })

  setInterval(() => {
    fillAccountsList(plugin, dispatch)
    updateInstanceBalance(plugin, dispatch)
  }, 30000)
}

const loadPinnedContracts = async (plugin, dispatch, dirName) => {
  await plugin.call('udapp', 'clearAllInstances')
  const isPinnedAvailable = await plugin.call('fileManager', 'exists', `.deploys/pinned-contracts/${dirName}`)
  if (isPinnedAvailable) {
    try {
      const list = await plugin.call('fileManager', 'readdir', `.deploys/pinned-contracts/${dirName}`)
      const filePaths = Object.keys(list)
      let codeError = false
      for (const file of filePaths) {
        const pinnedContract = await plugin.call('fileManager', 'readFile', file)
        const pinnedContractObj = JSON.parse(pinnedContract)
        const code = await plugin.call('blockchain', 'getCode', pinnedContractObj.address)
        if (code === '0x') {
          codeError = true
          const msg = `Cannot load pinned contract at ${pinnedContractObj.address}: Contract not found at that address.`
          await plugin.call('terminal', 'log', { type: 'error', value: msg })
        } else {
          pinnedContractObj.isPinned = true
          if (pinnedContractObj) addInstance(dispatch, pinnedContractObj)
        }
      }
      if (codeError) {
        const msg = `Some pinned contracts cannot be loaded.\nCotracts deployed to a (Mainnet, Custom, Sepolia) fork are not persisted unless there were already on chain.\nDirectly forking one of these forks will enable you to use the pinned contracts feature.`
        await plugin.call('terminal', 'log', { type: 'log', value: msg })
      }
    } catch (err) {
      console.log(err)
    }
  }
}

const migrateSavedContracts = async (plugin) => {
  // Move contract saved in localstorage to Remix FE
  const allSavedContracts = localStorage.getItem('savedContracts')
  if (allSavedContracts) {
    const savedContracts = JSON.parse(allSavedContracts)
    for (const networkId in savedContracts) {
      if (savedContracts[networkId].length > 0) {
        for (const contractDetails of savedContracts[networkId]) {
          const objToSave = {
            name: contractDetails.name,
            address: contractDetails.address,
            abi: contractDetails.abi || contractDetails.contractData.abi,
            filePath: contractDetails.filePath,
            pinnedAt: contractDetails.savedOn
          }
          await plugin.call('fileManager', 'writeFile', `.deploys/pinned-contracts/${networkId}/${contractDetails.address}.json`, JSON.stringify(objToSave, null, 2))
        }
      }
    }
    localStorage.removeItem('savedContracts')
  }
}

const broadcastCompilationResult = async (compilerName: string, plugin: RunTab, dispatch: React.Dispatch<any>, file, source, languageVersion, data, input?) => {
  await trackMatomoEvent(plugin, { category: 'udapp', action: 'broadcastCompilationResult', name: compilerName, isClick: false })
  // TODO check whether the tab is configured
  const compiler = new CompilerAbstract(languageVersion, data, source, input)
  plugin.compilersArtefacts[languageVersion] = compiler
  plugin.compilersArtefacts.__last = compiler

  const contracts = getCompiledContracts(compiler).map((contract) => {
    return { name: languageVersion, alias: contract.name, file: contract.file, compiler, compilerName }
  })
  if ((contracts.length > 0)) {
    const contractsInCompiledFile = contracts.filter(obj => obj.file === file)
    let currentContract
    if (contractsInCompiledFile.length) currentContract = contractsInCompiledFile[0].alias
    else currentContract = contracts[0].alias
    dispatch(setCurrentContract(currentContract))
  }
  const isUpgradeable = await plugin.call('openzeppelin-proxy', 'isConcerned', data.sources && data.sources[file] ? data.sources[file].ast : {})

  if (isUpgradeable) {
    const options = await plugin.call('openzeppelin-proxy', 'getProxyOptions', data, file)

    dispatch(addDeployOption({ [file]: options }))
  } else {
    dispatch(addDeployOption({ [file]: {} }))
  }
  dispatch(fetchContractListSuccess({ [file]: contracts }))
  dispatch(setCurrentFile(file))
  // TODO: set current contract
}

const getCompiledContracts = (compiler) => {
  const contracts = []

  compiler.visitContracts((contract) => {
    contracts.push(contract)
  })
  return contracts
}

export const resetAndInit = (plugin: RunTab) => {
  plugin.blockchain.resetAndInit(plugin.config, {
    getAddress: (cb) => {
      cb(null, plugin.REACT_API.accounts.selectedAccount)
    },
    getValue: (cb) => {
      try {
        const number = plugin.REACT_API.sendValue
        const unit = plugin.REACT_API.sendUnit

        cb(null, Web3.utils.toWei(number, unit))
      } catch (e) {
        cb(e)
      }
    },
    getGasLimit: (cb) => {
      try {
        const gasLimit = '0x' + new BN(plugin.REACT_API.gasLimit, 10).toString(16)

        cb(null, gasLimit)
      } catch (e) {
        cb(e.message)
      }
    },
    isSmartAccount: (address) => {
      const smartAddresses = Object.keys(plugin.REACT_API.smartAccounts)
      if (smartAddresses && smartAddresses.includes(address)) return true
      else return false
    }
  })
}
