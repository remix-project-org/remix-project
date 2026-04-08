import React, { useEffect, useReducer, useState } from 'react'
import isElectron from 'is-electron'
import { EnvAppContext } from './contexts'
import { widgetInitialState, widgetReducer } from './reducers'
import EnvironmentPortraitView from './widgets/envPortraitView'
import { addFVSProvider, addProvider, getAccountsList, loadAllDelegations, refreshAccountBalances, registerInjectedProvider } from './actions'
import { ProviderDetailsEvent } from './types'
import { formatBalance } from '@remix-ui/helper'
// eslint-disable-next-line @nrwl/nx/enforce-module-boundaries
import { EnvironmentPlugin } from 'apps/remix-ide/src/app/udapp/udappEnv'
import { Plugin } from '@remixproject/engine'

function EnvironmentWidget({ plugin }: { plugin: EnvironmentPlugin }) {
  const widgetInitializer = plugin.getWidgetState ? plugin.getWidgetState() : null
  const [widgetState, dispatch] = useReducer(widgetReducer, widgetInitializer || widgetInitialState)
  const [themeQuality, setThemeQuality] = useState<string>('dark')
  const injectedProviderPluginsRef = React.useRef<string[]>([])

  useEffect(() => {
    if (plugin.setStateGetter) {
      plugin.setStateGetter(() => widgetState)
    }
    if (plugin.setDispatchGetter) {
      plugin.setDispatchGetter(() => dispatch)
    }
  }, [widgetState])

  useEffect(() => {
    plugin.call('theme', 'currentTheme').then((theme) => {
      setThemeQuality(theme.quality)
    })

    plugin.on('theme', 'themeChanged', (theme: any) => {
      setThemeQuality(theme.quality)
    })
  }, [])

  useEffect(() => {
    if (!plugin.isAlreadyInitialized()) {
      (async () => {
        dispatch({ type: 'LOADING_ALL_PROVIDERS', payload: null })
        dispatch({ type: 'LOADING_ALL_ACCOUNTS', payload: null })
        await plugin.call('blockchain', 'resetAndInit')
        // VM
        const titleVM = 'Execution environment is local to Remix.  Data is only saved to browser memory and will vanish upon reload.'
        await addProvider({ position: 1, name: 'vm-osaka', displayName: 'Osaka', category: 'Remix VM', providerConfig: { isInjected: false, isVM: true, isRpcForkedState: false, statePath: '.states/vm-osaka/state.json', fork: 'osaka' }, dataId: 'settingsVMOsakaMode', title: titleVM }, plugin, dispatch)
        await addProvider({ position: 2, name: 'vm-prague', displayName: 'Prague', category: 'Remix VM', providerConfig: { isInjected: false, isVM: true, isRpcForkedState: false, statePath: '.states/vm-prague/state.json', fork: 'prague' }, dataId: 'settingsVMPectraMode', title: titleVM }, plugin, dispatch)
        await addProvider({ position: 3, name: 'vm-cancun', displayName: 'Cancun', category: 'Remix VM', providerConfig: { isInjected: false, isVM: true, isRpcForkedState: false, statePath: '.states/vm-cancun/state.json', fork: 'cancun' }, dataId: 'settingsVMCancunMode', title: titleVM }, plugin, dispatch)
        await addProvider({ position: 50, name: 'vm-shanghai', displayName: 'Shanghai', category: 'Remix VM', providerConfig: { isInjected: false, isVM: true, isRpcForkedState: false, statePath: '.states/vm-shanghai/state.json', fork: 'shanghai' }, dataId: 'settingsVMShanghaiMode', title: titleVM }, plugin, dispatch)
        await addProvider({ position: 51, name: 'vm-paris', displayName: 'Paris', category: 'Remix VM', providerConfig: { isInjected: false, isVM: true, isRpcForkedState: false, statePath: '.states/vm-paris/state.json', fork: 'paris' }, dataId: 'settingsVMParisMode', title: titleVM }, plugin, dispatch)
        await addProvider({ position: 52, name: 'vm-london', displayName: 'London', category: 'Remix VM', providerConfig: { isInjected: false, isVM: true, isRpcForkedState: false, statePath: '.states/vm-london/state.json', fork: 'london' }, dataId: 'settingsVMLondonMode', title: titleVM }, plugin, dispatch)
        await addProvider({ position: 53, name: 'vm-berlin', displayName: 'Berlin', category: 'Remix VM', providerConfig: { isInjected: false, isVM: true, isRpcForkedState: false, statePath: '.states/vm-berlin/state.json', fork: 'berlin' }, dataId: 'settingsVMBerlinMode', title: titleVM }, plugin, dispatch)
        await addProvider({ position: 4, name: 'vm-mainnet-fork', displayName: 'Mainnet fork', category: 'VM Fork', providerConfig: { isInjected: false, isVM: true, isVMStateForked: true, isRpcForkedState: true, fork: 'prague' }, dataId: 'settingsVMMainnetMode', title: titleVM }, plugin, dispatch)
        await addProvider({ position: 5, name: 'vm-sepolia-fork', displayName: 'Sepolia fork', category: 'VM Fork', providerConfig: { isInjected: false, isVM: true, isVMStateForked: true, isRpcForkedState: true, fork: 'prague' }, dataId: 'settingsVMSepoliaMode', title: titleVM }, plugin, dispatch)
        await addProvider({ position: 6, name: 'vm-custom-fork', displayName: 'Custom fork', category: 'VM Fork', providerConfig: { isInjected: false, isVM: true, isVMStateForked: true, isRpcForkedState: true, fork: '' }, dataId: 'settingsVMCustomMode', title: titleVM }, plugin, dispatch)

        if (isElectron()) {
        // desktop host
          await addProvider({ position: 6, name: 'desktopHost', displayName: 'Browser Wallet', providerConfig: { isInjected: false, isVM: false, isRpcForkedState: false, fork: '' } }, plugin, dispatch)
        }

        // wallet connect
        await addProvider({ position: 7, name: 'walletconnect', displayName: 'WalletConnect', providerConfig: { isInjected: false, isVM: false, isRpcForkedState: false, fork: '' } }, plugin, dispatch)

        // external provider
        await addProvider({ position: 10, name: 'basic-http-provider', displayName: 'Custom - External Http Provider', providerConfig: { isInjected: false, isVM: false, isRpcForkedState: false, fork: '' } }, plugin, dispatch)
        await addProvider({ position: 20, name: 'hardhat-provider', displayName: 'Hardhat Provider', category: 'Dev', providerConfig: { isInjected: false, isVM: false, isRpcForkedState: false, fork: '' } }, plugin, dispatch)
        await addProvider({ position: 21, name: 'ganache-provider', displayName: 'Ganache Provider', category: 'Dev', providerConfig: { isInjected: false, isVM: false, isRpcForkedState: false, fork: '' } }, plugin, dispatch)
        await addProvider({ position: 22, name: 'foundry-provider', displayName: 'Foundry Provider', category: 'Dev', providerConfig: { isInjected: false, isVM: false, isRpcForkedState: false, fork: '' } }, plugin, dispatch)

        // register injected providers
        window.addEventListener(
          "eip6963:announceProvider",
          (event) => {
            registerInjectedProvider(event as unknown as ProviderDetailsEvent, plugin, dispatch)
          }
        )
        if (!isElectron()) window.dispatchEvent(new Event("eip6963:requestProvider"))
        await addProvider({ position: 24, name: 'base-provider-84532', displayName: 'Base Wallet Sepolia Provider', category: 'Base', providerConfig: { isInjected: true, isVM: false, isRpcForkedState: false, fork: '' } }, plugin, dispatch)
        dispatch({ type: 'COMPLETED_LOADING_ALL_PROVIDERS', payload: null })

        plugin.on('filePanel', 'workspaceInitializationCompleted', async () => {
          const ssExists = await plugin.call('fileManager', 'exists', '.states/forked_states')
          if (ssExists) {
            const savedStatesDetails = await plugin.call('fileManager', 'readdir', '.states/forked_states')
            const savedStatesFiles = Object.keys(savedStatesDetails)
            let pos = 10
            for (const filePath of savedStatesFiles) {
              pos += 1
              await addFVSProvider(filePath, pos, plugin, dispatch)
            }
          }
        })

        // Mark as initialized at plugin level to prevent re-initialization
        plugin.markAsInitialized()
      })()
    }

    plugin.on('blockchain', 'contextChanged', async (context) => {
      await getAccountsList(plugin, dispatch)
      // Load delegations for all accounts after accounts are loaded
      const currentProvider = await plugin.call('blockchain', 'getProvider')
      const accounts = await plugin.call('blockchain', 'getAccounts')
      if (accounts && accounts.length > 0) {
        dispatch({ type: 'SET_SELECTED_ACCOUNT', payload: accounts[0] })
        // Convert account addresses to Account objects for loadAllDelegations
        const accountObjects = accounts.map((addr: string) => ({ account: addr } as any))
        await loadAllDelegations(plugin, accountObjects, currentProvider, dispatch)
      }
      dispatch({ type: 'COMPLETED_LOADING_ALL_ACCOUNTS', payload: null })
    })

    plugin.on('blockchain', 'networkStatus', async (networkStatus: any) => {
      dispatch({ type: 'SET_NETWORK_STATUS', payload: { chainId: networkStatus.network.id, name: networkStatus.network.name } })
      await refreshAccountBalances(plugin, dispatch)
    })

    plugin.on('udappDeployedContracts', 'deployedInstanceUpdated', async (deployedInstances: any[]) => {

      dispatch({ type: 'SET_DEPLOYED_CONTRACTS_COUNT', payload: deployedInstances.length })
    })

    plugin.on('udappTransactions', 'transactionRecorderUpdated', async (transactions: any[]) => {
      dispatch({ type: 'SET_TRANSACTION_RECORDER_COUNT', payload: transactions.length })
    })

    plugin.on('blockchain', 'transactionExecuted', async (error, address: string) => {
      if (error) return

      if (address) {
        const balance = await plugin.call('blockchain', 'getBalanceInEther', address)

        if (balance) dispatch({ type: 'SET_ACCOUNT_BALANCE', payload: { address, balance: formatBalance(balance, 3) } })
      }
    })

    const registerInjectedPluginListener = (pluginName: string) => {
      if (!injectedProviderPluginsRef.current.includes(pluginName)) {
        if (pluginName.startsWith('injected')) {
          plugin.on(pluginName, 'accountsChanged', async (accounts) => {
            await getAccountsList(plugin, dispatch)
            dispatch({ type: 'SET_SELECTED_ACCOUNT', payload: (window as any).ethereum.selectedAddress || accounts[0] })
          })
          injectedProviderPluginsRef.current.push(pluginName)
          plugin.injectedProviderPlugins = injectedProviderPluginsRef.current
        } else if (pluginName === 'walletconnect') {
          plugin.on('walletconnect', 'accountsChanged', async (accounts: Array<string>) => {
            await getAccountsList(plugin, dispatch)
          })
          injectedProviderPluginsRef.current.push('walletconnect')
          plugin.injectedProviderPlugins = injectedProviderPluginsRef.current
        }
      }
    }

    if ((plugin as any).injectedProviderPlugins && Array.isArray((plugin as any).injectedProviderPlugins)) {
      const savedPlugins = (plugin as any).injectedProviderPlugins as string[]

      savedPlugins.forEach((pluginName) => {
        registerInjectedPluginListener(pluginName)
      })
    }

    plugin.on('manager', 'pluginActivated', (activatedPlugin: Plugin) => {
      if (activatedPlugin && (activatedPlugin.name.startsWith('injected') || activatedPlugin.name === 'walletconnect')) {
        registerInjectedPluginListener(activatedPlugin.name)
      }
    })

    plugin.on('filePanel', 'setWorkspace', async () => {
      try {
        await plugin.changeExecutionContext({ context: 'vm-osaka' })
      } catch (e) {
        console.error(e)
      }
    })

    // Cleanup function to remove event listeners when component unmounts
    return () => {
      plugin.off('filePanel', 'workspaceInitializationCompleted')
      plugin.off('blockchain', 'contextChanged')
      plugin.off('blockchain', 'networkStatus')
      plugin.off('udappDeployedContracts', 'deployedInstanceUpdated')
      plugin.off('udappTransactions', 'transactionRecorderUpdated')
      plugin.off('blockchain', 'transactionExecuted')
      injectedProviderPluginsRef.current.forEach((injectedPlugin) => {
        plugin.off(injectedPlugin, 'accountsChanged')
      })
      plugin.off('manager', 'pluginActivated')
      plugin.off('filePanel', 'setWorkspace')
    }
  }, [])

  return (
    <EnvAppContext.Provider value={{ widgetState, dispatch, plugin, themeQuality }}>
      <EnvironmentPortraitView />
    </EnvAppContext.Provider>
  )
}

export default EnvironmentWidget
