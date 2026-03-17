// eslint-disable-next-line no-use-before-define
import React, { Fragment, useEffect, useReducer, useState } from 'react'
import semver from 'semver'
import { InstanceContainerUI } from './components/instanceContainerUI'
import { RecorderUI } from './components/recorderCardUI'
import { RunTabProps } from './types'
import { runTabInitialState, runTabReducer } from './reducers/runTab'
import {
  initRunTab,
  unpinPinnedInstance,
  pinUnpinnedInstance,
  removeInstances,
  removeSingleInstance,
  getExecutionContext,
  executeTransactions,
  storeNewScenario,
  runScenario,
  setScenarioPath,
  getFuncABIValues
} from './actions'
import './css/run-tab.css'
import { ScenarioPrompt } from './components/scenario'
import { ChainCompatibleInfo, getCompatibleChain, HardFork, isChainCompatible } from './actions/evmmap'

export type CheckStatus = 'Passed' | 'Failed' | 'Not Found'

export function RunTabUI(props: RunTabProps) {
  const { plugin } = props
  const initialState = props.initialState || runTabInitialState

  const [runTab, dispatch] = useReducer(runTabReducer, initialState)
  const REACT_API = { runTab }
  const currentfile = plugin.config.get('currentFile')
  const [solcVersion, setSolcVersion] = useState<{version: string, canReceive: boolean}>({ version: '', canReceive: true })
  const [evmCheckComplete, setEvmCheckComplete] = useState(false)

  const getVersion = () => {
    let version = '0.8.25'
    try {
      const regVersion = window.location.href.match(/soljson-v(.*)\+commit/g)
      if (regVersion && regVersion[1]) version = regVersion[1]
      if (semver.lt(version, '0.6.0')) {
        setSolcVersion({ version: version, canReceive: false })
      } else {
        setSolcVersion({ version: version, canReceive: true })
      }
    } catch (e) {
      setSolcVersion({ version, canReceive: true })
    }
  }

  const getCompilerDetails = async () => await checkEvmChainCompatibility()

  const returnCompatibleChain = async (evmVersion: HardFork, targetChainId: number) => {
    const result = getCompatibleChain(evmVersion ?? 'paris', targetChainId)
    return result
  }

  const checkEvmChainCompatibilityOkFunction = async (fetchDetails: ChainCompatibleInfo) => {
    const compilerParams = {
      evmVersion: fetchDetails.evmVersion,
      optimize: false,
      language: 'Solidity',
      runs: '200',
      version: fetchDetails.minCompilerVersion
    }
    await plugin.call('solidity', 'setCompilerConfig', compilerParams)
    const currentFile = await plugin.call('fileManager', 'getCurrentFile')
    await plugin.call('solidity', 'compile', currentFile)
    setEvmCheckComplete(true)
  }

  const checkEvmChainCompatibility = async () => {
    const network = await plugin.call('udappEnv', 'getNetwork')
    const fetchDetails = await plugin.call('solidity', 'getCompilerQueryParameters')
    const compilerState = await plugin.call('solidity', 'getCompilerState')

    if (compilerState.target !== null) {
      const targetChainId = network?.chainId
      const ideDefault = fetchDetails && fetchDetails.evmVersion !== null ? fetchDetails.evmVersion : 'osaka'
      const IsCompatible = isChainCompatible(ideDefault, targetChainId)
      const chain = await returnCompatibleChain(ideDefault, targetChainId)
      if (chain === undefined) {
        return 'Not Found'
      } else {
        if (!IsCompatible) {
          plugin.call('notification', 'modal', {
            id: 'evm-chainId-incompatible',
            title: 'Incompatible EVM for the selected chain',
            message: <div className="px-3">
              <p>The smart contract has not been compiled with an EVM version that is compatible with the selected chain.</p>
              <ul className="px-3">
                <li>Have Remix switch to a compatible EVM version for this chain and recompile the contract.</li>
                <li>Cancel to keep the current EVM version.</li>
              </ul>
              <p>To manually change the EVM version, go to the Advanced Configurations section of the Solidity compiler.</p>
            </div>,
            modalType: 'modal',
            okLabel: 'Switch EVM and Recompile',
            cancelLabel: 'Cancel',
            okFn: () => checkEvmChainCompatibilityOkFunction(chain),
            cancelFn: () => {}
          })
          return 'Failed'
        } else {
          return 'Passed'
        }
      }
    }
  }

  useEffect(() => {
    if (!props.initialState) {
      initRunTab(plugin, true)(dispatch)
    } else {
      initRunTab(plugin, false)(dispatch)
    }
  }, [plugin])

  useEffect(() => {
    plugin.onReady(runTab)
    plugin.call('pluginStateLogger', 'logPluginState', 'udapp', runTab)
  }, [REACT_API])

  const scenarioPrompt = (message: string, defaultValue: string) => {
    return <ScenarioPrompt message={message} setScenarioPath={setScenarioPath} defaultValue={defaultValue} />
  }

  return (
    <Fragment>
      <div className="udapp_runTabView run-tab" id="runTabView" data-id="runTabView">
        <div className="list-group pb-4 list-group-flush">
          <RecorderUI
            plugin={plugin}
            storeScenario={storeNewScenario}
            runCurrentScenario={runScenario}
            scenarioPrompt={scenarioPrompt}
            count={runTab.recorder.transactionCount}
            currentFile={currentfile}
          />
          {/* <InstanceContainerUI
            plugin={plugin}
            getCompilerDetails={getCompilerDetails}
            evmCheckComplete={evmCheckComplete}
            runTabState={runTab}
            instances={runTab.instances}
            clearInstances={removeInstances}
            unpinInstance={unpinPinnedInstance}
            pinInstance={pinUnpinnedInstance}
            removeInstance={removeSingleInstance}
            getContext={getExecutionContext}
            runTransactions={executeTransactions}
            solcVersion={solcVersion}
            getVersion={getVersion}
            getFuncABIInputs={getFuncABIValues}
            editInstance={async (addressOrInstance, abi, name, devdoc, metadata, htmlTemplate) => {
              const network = await plugin.call('udappEnv', 'getNetwork')
              const payload = {
                address: '',
                abi: null,
                name: '',
                network: network?.name,
                devdoc: null,
                methodIdentifiers: null,
                solcVersion: '',
                htmlTemplate: null
              }

              let targetPlugin = 'quick-dapp'

              try {
                if (typeof addressOrInstance === 'object' && addressOrInstance !== null) {
                  targetPlugin = 'quick-dapp'

                  const instance = addressOrInstance as any
                  const { metadata: metaFromInst, abi: abiFromInst, object } = instance.contractData || {}

                  payload.address = instance.address
                  payload.abi = abiFromInst
                  payload.name = instance.name

                  if (object) {
                    payload.devdoc = object.devdoc
                    payload.methodIdentifiers = object.evm?.methodIdentifiers
                  }

                  if (metaFromInst) {
                    try {
                      payload.solcVersion = JSON.parse(metaFromInst).compiler.version
                    } catch (e) {
                      console.warn('[RunTab] Failed to parse solcVersion from V1 metadata', e)
                    }
                  }

                } else {
                  targetPlugin = 'quick-dapp-v2'

                  payload.address = addressOrInstance as string
                  payload.abi = abi
                  payload.name = name
                  payload.devdoc = devdoc
                  payload.htmlTemplate = htmlTemplate

                  if (metadata) {
                    try {
                      payload.solcVersion = JSON.parse(metadata).compiler.version
                    } catch (e) {
                      console.warn('[RunTab] Failed to parse solcVersion from V2 metadata', e)
                    }
                  }
                }

                plugin.call(targetPlugin, 'edit', payload)

              } catch (error) {
                console.error('[RunTab] Critical Error in editInstance:', error)
              }
            }}
          /> */}
        </div>
      </div>
    </Fragment>
  )
}
