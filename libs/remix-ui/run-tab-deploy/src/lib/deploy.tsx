import React, { useEffect, useReducer, useState } from 'react'
import { DeployAppContext } from './contexts'
import { deployInitialState, deployReducer } from './reducers'
import DeployPortraitView from './widgets/deployPortraitView'
import { broadcastCompilationResult, addContractFile } from './actions'
import "./css/index.css"
// eslint-disable-next-line @nrwl/nx/enforce-module-boundaries
import type { DeployPlugin } from 'apps/remix-ide/src/app/udapp/udappDeploy'

interface DeployWidgetProps {
  plugin: DeployPlugin
}

function DeployWidget({ plugin }: DeployWidgetProps) {
  const widgetInitializer = plugin.getWidgetState ? plugin.getWidgetState() : null
  const [widgetState, dispatch] = useReducer(deployReducer, widgetInitializer || deployInitialState)
  const [themeQuality, setThemeQuality] = useState<string>('dark')

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
    plugin.on('fileManager', 'currentFileChanged', async (filePath: string) => addContractFile(filePath, plugin, dispatch))

    plugin.on('editor', 'contentChanged', async (filePath: string) => addContractFile(filePath, plugin, dispatch))

    plugin.on('fileManager', 'fileClosed', (filePath: string) => {
      if (filePath && (filePath.endsWith('.sol') || filePath.endsWith('.yul'))) {
        dispatch({ type: 'REMOVE_CONTRACT_FILE', payload: filePath })
      }
    })

    plugin.on('solidity', 'compilationFinished', (file, source, languageVersion, data, input) => broadcastCompilationResult('remix', { file, source, languageVersion, data, input }, plugin, dispatch))

    plugin.on('vyper', 'compilationFinished', (file, source, languageVersion, data) => broadcastCompilationResult('vyper', { file, source, languageVersion, data }, plugin, dispatch))

    plugin.on('lexon', 'compilationFinished', (file, source, languageVersion, data) => broadcastCompilationResult('lexon', { file, source, languageVersion, data }, plugin, dispatch))

    plugin.on('yulp', 'compilationFinished', (file, source, languageVersion, data) => broadcastCompilationResult('yulp', { file, source, languageVersion, data }, plugin, dispatch))

    plugin.on('nahmii-compiler', 'compilationFinished', (file, source, languageVersion, data) => broadcastCompilationResult('nahmii', { file, source, languageVersion, data }, plugin, dispatch))

    plugin.on('hardhat', 'compilationFinished', (file, source, languageVersion, data) => broadcastCompilationResult('hardhat', { file, source, languageVersion, data }, plugin, dispatch))

    plugin.on('foundry', 'compilationFinished', (file, source, languageVersion, data) => broadcastCompilationResult('foundry', { file, source, languageVersion, data }, plugin, dispatch))

    plugin.on('truffle', 'compilationFinished', (file, source, languageVersion, data) => broadcastCompilationResult('truffle', { file, source, languageVersion, data }, plugin, dispatch))

    // plugin.on('desktopHost', 'chainChanged', (context) => {
    //   //console.log('desktopHost chainChanged', context)
    //   fillAccountsList(plugin, dispatch)
    //   updateInstanceBalance(plugin, dispatch)
    // })

    // plugin.on('desktopHost', 'disconnected', () => {
    //   setExecutionContext(plugin, dispatch, { context: 'vm-cancun', fork: '' })
    // })

    // plugin.on('filePanel', 'setWorkspace', async () => {
    //   dispatch(resetUdapp())
    //   resetAndInit(plugin)
    //   await migrateSavedContracts(plugin)
    //   plugin.call('manager', 'isActive', 'remixd').then((activated) => {
    //     dispatch(setRemixDActivated(activated))
    //   })
    // })

    // plugin.on('manager', 'pluginActivated', (activatedPlugin: Plugin) => {
    //   if (activatedPlugin.name === 'remixd') {
    //     dispatch(setRemixDActivated(true))
    //   } else {
    //     if (activatedPlugin && activatedPlugin.name.startsWith('injected')) {
    //       plugin.on(activatedPlugin.name, 'accountsChanged', (accounts: Array<string>) => {
    //         const accountsMap = {}
    //         accounts.map(account => { accountsMap[account] = shortenAddress(account, '0')})
    //         dispatch(fetchAccountsListSuccess(accountsMap))
    //         dispatch(setSelectedAccount((window as any).ethereum.selectedAddress || accounts[0]))
    //       })
    //     } else if (activatedPlugin && activatedPlugin.name === 'walletconnect') {
    //       plugin.on('walletconnect', 'accountsChanged', async (accounts: Array<string>) => {
    //         const accountsMap = {}

    //         await Promise.all(accounts.map(async (account) => {
    //           const balance = await plugin.blockchain.getBalanceInEther(account)
    //           const updated = shortenAddress(account, balance)

    //           accountsMap[account] = updated
    //         }))
    //         dispatch(fetchAccountsListSuccess(accountsMap))
    //       })
    //     }
    //   }
    // })

    // plugin.on('manager', 'pluginDeactivated', (plugin: Plugin) => {
    //   if (plugin.name === 'remixd') {
    //     dispatch(setRemixDActivated(false))
    //   }
    // })

    // Cleanup function to remove event listeners when component unmounts
    return () => {
      plugin.off('fileManager', 'currentFileChanged')
      plugin.off('editor', 'contentChanged')
      plugin.off('fileManager', 'fileClosed')
      plugin.off('solidity', 'compilationFinished')
      plugin.off('vyper', 'compilationFinished')
      plugin.off('lexon', 'compilationFinished')
      plugin.off('yulp', 'compilationFinished')
      plugin.off('nahmii-compiler', 'compilationFinished')
      plugin.off('hardhat', 'compilationFinished')
      plugin.off('foundry', 'compilationFinished')
      plugin.off('truffle', 'compilationFinished')
    }
  }, [])

  return (
    <DeployAppContext.Provider value={{ widgetState, dispatch, plugin, themeQuality }}>
      <DeployPortraitView />
    </DeployAppContext.Provider>
  )
}

export default DeployWidget

