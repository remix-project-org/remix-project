import React, { useEffect, useReducer, useState } from 'react'
import { DeployedContractsAppContext } from './contexts'
import { deployedContractsInitialState, deployedContractsReducer } from './reducers'
import DeployedContractsPortraitView from './widgets/deployedContractsPortraitView'
import './css/index.css'
// eslint-disable-next-line @nrwl/nx/enforce-module-boundaries
import { DeployedContractsPlugin } from 'apps/remix-ide/src/app/udapp/udappDeployedContracts'
import { loadPinnedContracts, refreshDeployedContractBalances } from './actions'
import { LightCheckInfo } from './types'

interface DeployedContractsWidgetProps {
  plugin: DeployedContractsPlugin
}

function DeployedContractsWidget({ plugin }: DeployedContractsWidgetProps) {
  const widgetInitializer = plugin.getWidgetState ? plugin.getWidgetState() : null
  const [widgetState, dispatch] = useReducer(deployedContractsReducer, widgetInitializer || deployedContractsInitialState)
  const [themeQuality, setThemeQuality] = useState<string>('dark')
  const [eezNetworksVersion, setEezNetworksVersion] = useState<number>(0)
  const [lightChecks, setLightChecks] = useState<Record<string, LightCheckInfo>>({})

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

    plugin.on('blockchain', 'transactionExecuted', async (error) => {
      if (error) return
      await refreshDeployedContractBalances(plugin, dispatch)
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
    plugin.on('udappEez', 'networksChanged', () => {
      setEezNetworksVersion((version) => version + 1)
    })
    plugin.on('udappEez', 'walletRpcChanged', () => {
      setEezNetworksVersion((version) => version + 1)
    })

    return () => {
      plugin.off('udappEez', 'networksChanged')
      plugin.off('udappEez', 'walletRpcChanged')
    }
  }, [])

  // one subscription for all cards: a listener per card would replace the previous one
  useEffect(() => {
    const keep = (records: LightCheckInfo[]) => setLightChecks((current) => {
      const next = { ...current }
      for (const record of records) if (record?.address) next[record.address.toLowerCase()] = record
      return next
    })
    plugin.on('preDeployChecks', 'lightCheckChanged', (record: LightCheckInfo) => keep([record]))
    plugin.call('preDeployChecks', 'getLightChecks')
      .then((records: LightCheckInfo[]) => keep(records || []))
      .catch(() => { /* Pre-deploy Checks not active */ })
    return () => plugin.off('preDeployChecks', 'lightCheckChanged')
  }, [])

  useEffect(() => {
    plugin.emit('deployedInstanceUpdated', widgetState.deployedContracts)
  }, [widgetState.deployedContracts])

  return (
    <DeployedContractsAppContext.Provider value={{ widgetState, dispatch, plugin, themeQuality, eezNetworksVersion, lightChecks }}>
      <DeployedContractsPortraitView />
    </DeployedContractsAppContext.Provider>
  )
}

export default DeployedContractsWidget
