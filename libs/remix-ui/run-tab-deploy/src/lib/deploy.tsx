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

    plugin.on('filePanel', 'setWorkspace', async (workspace: { name: string }) => {
      const workspaceName = workspace.name
      const lastLoadedWorkspaceName = plugin?.getWidgetState()?.lastLoadedWorkspace

      if (workspaceName && lastLoadedWorkspaceName !== workspaceName) {
        dispatch({ type: 'CLEAR_ALL_CONTRACT_FILES', payload: undefined })
        const workspaceFiles = await plugin.call('fileManager', 'readdir', '/')

        Object.keys(workspaceFiles).forEach(entry => addContractFile(entry, plugin, dispatch))
        if (workspaceFiles['contracts'] && workspaceFiles['contracts'].isDirectory) {
          const contractFiles = await plugin.call('fileManager', 'readdir', '/contracts')

          Object.keys(contractFiles).forEach(entry => addContractFile(entry, plugin, dispatch))
        }
        dispatch({ type: 'SET_LAST_LOADED_WORKSPACE', payload: workspaceName })
      }
    })

    plugin.on('solidity', 'compilationFailed', (_, source) => {
      Object.keys(source.sources).forEach((filePath) => {
        dispatch({ type: 'SET_COMPILING_FAILED', payload: filePath })
      })
    })

    plugin.on('blockchain', 'networkStatus', async ({ error, network }) => {
      if (error) {
        const netUI = 'can\'t detect network'

        return dispatch({ type: 'SET_DETECTED_NETWORK', payload: netUI })
      }
      const networkProvider = await plugin.call('udappEnv', 'getSelectedProvider')
      const isVM = networkProvider.startsWith('vm') ? true : false
      // For forked VM states (vm-fs-*), remove the vm-fs- prefix to show just the state name
      // For regular VM states (vm-*), remove the vm- prefix to show the fork name
      const vmName = networkProvider?.startsWith('vm-fs-')
        ? networkProvider.replace('vm-fs-', '')
        : networkProvider?.replace('vm-', '')
      const netUI = !isVM ? `${network.name} (${network.id || '-'}) network` : `Remix VM ${vmName}`

      dispatch({ type: 'SET_DETECTED_NETWORK', payload: netUI })
    })

    // plugin.on('desktopHost', 'chainChanged', (context) => {
    //   //console.log('desktopHost chainChanged', context)
    //   fillAccountsList(plugin, dispatch)
    //   updateInstanceBalance(plugin, dispatch)
    // })

    // plugin.on('desktopHost', 'disconnected', () => {
    //   setExecutionContext(plugin, dispatch, { context: 'vm-cancun', fork: '' })
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
      plugin.off('filePanel', 'setWorkspace')
      plugin.off('solidity', 'compilationFailed')
      plugin.off('blockchain', 'networkStatus')
    }
  }, [])

  return (
    <DeployAppContext.Provider value={{ widgetState, dispatch, plugin, themeQuality }}>
      <DeployPortraitView />
    </DeployAppContext.Provider>
  )
}

export default DeployWidget

