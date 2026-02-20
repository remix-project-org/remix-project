import React, { useEffect, useReducer, useState } from 'react'
import { DeployedContractsAppContext } from './contexts'
import { deployedContractsInitialState, deployedContractsReducer } from './reducers'
import DeployedContractsPortraitView from './widgets/deployedContractsPortraitView'
import './css/index.css'
// eslint-disable-next-line @nrwl/nx/enforce-module-boundaries
import { DeployedContractsPlugin } from 'apps/remix-ide/src/app/udapp/udappDeployedContracts'
import { loadPinnedContracts } from './actions'

interface DeployedContractsWidgetProps {
  plugin: DeployedContractsPlugin
}

function DeployedContractsWidget({ plugin }: DeployedContractsWidgetProps) {
  const widgetInitializer = plugin.getWidgetState ? plugin.getWidgetState() : null
  const [widgetState, dispatch] = useReducer(deployedContractsReducer, widgetInitializer || deployedContractsInitialState)
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

    plugin.on('fileManager', 'currentFileChanged', (currentFile: string) => {
      if (/.(.abi)$/.exec(currentFile)) dispatch({ type: 'SET_LOAD_TYPE', payload: 'abi' })
      else if (/.(.sol)$/.exec(currentFile)) dispatch({ type: 'SET_LOAD_TYPE', payload: 'sol' })
      else if (/.(.vy)$/.exec(currentFile)) dispatch({ type: 'SET_LOAD_TYPE', payload: 'vyper' })
      else if (/.(.lex)$/.exec(currentFile)) dispatch({ type: 'SET_LOAD_TYPE', payload: 'lexon' })
      else if (/.(.contract)$/.exec(currentFile)) dispatch({ type: 'SET_LOAD_TYPE', payload: 'contract' })
      else dispatch({ type: 'SET_LOAD_TYPE', payload: 'other' })
      dispatch({ type: 'SET_CURRENT_FILE', payload: currentFile })
    })

    plugin.on('blockchain', 'networkStatus', async ({ error, network }) => {
      if (error) return
      let chainId: string

      if (network?.name === 'VM') {
        const context = await plugin.call('udappEnv', 'getSelectedProvider')

        chainId = context
      } else {
        chainId = network?.id
      }

      if (chainId && widgetState.lastLoadedChainId !== chainId) {
        dispatch({ type: 'SET_LAST_LOADED_CHAIN_ID', payload: chainId })
        await loadPinnedContracts(plugin, dispatch, chainId)
      }
    })

    plugin.on('filePanel', 'setWorkspace', async (workspace) => {
      const workspaceName = workspace.name
      const lastLoadedWorkspaceName = plugin?.getWidgetState()?.lastLoadedWorkspace

      if (workspaceName && lastLoadedWorkspaceName !== workspaceName) {
        const network = await plugin.call('udappEnv', 'getNetwork')
        const chainId = network?.chainId
        const providerName = network?.name === 'VM' ? await plugin.call('udappEnv', 'getSelectedProvider') : chainId

        await loadPinnedContracts(plugin, dispatch, providerName)
        dispatch({ type: 'SET_LAST_LOADED_WORKSPACE', payload: workspaceName })
      }
    })

    plugin.on('blockchain', 'transactionExecuted', async (error, _, to, __, ___, txResult) => {
      if (error) return
      if (to || txResult?.receipt?.contractAddress) {
        const address = to || txResult?.receipt?.contractAddress
        const balance = await plugin.call('blockchain', 'getBalanceInEther', address)

        if (balance) dispatch({ type: 'UPDATE_CONTRACT_BALANCE', payload: { address: address, balance } })
      }
    })

    // Cleanup function to remove event listeners when component unmounts
    return () => {
      plugin.off('theme', 'themeChanged')
      plugin.off('fileManager', 'currentFileChanged')
      plugin.off('blockchain', 'networkStatus')
      plugin.off('blockchain', 'transactionExecuted')
      plugin.off('filePanel', 'setWorkspace')
    }
  }, [widgetState.lastLoadedChainId])

  useEffect(() => {
    plugin.emit('deployedInstanceUpdated', widgetState.deployedContracts)
  }, [widgetState.deployedContracts])

  return (
    <DeployedContractsAppContext.Provider value={{ widgetState, dispatch, plugin, themeQuality }}>
      <DeployedContractsPortraitView />
    </DeployedContractsAppContext.Provider>
  )
}

export default DeployedContractsWidget
