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
      <div className="udapp_runTabView run-tab bg-dark text-white" id="runTabView" data-id="runTabView">
        <div className="p-4 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold mb-0">DEPLOY & RUN TRANSACTIONS</h3>
            <div className="flex gap-2">
              <button className="inline-flex items-center px-3 py-1.5 text-sm rounded-md transition-colors bg-blue-600 hover:bg-blue-700 text-white">
                Fork
              </button>
              <button className="inline-flex items-center px-3 py-1.5 text-sm rounded-md transition-colors bg-red-600 hover:bg-red-700 text-white">
                Reset
              </button>
            </div>
          </div>

          {/* Environment Section */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Environment</label>
            <div className="flex items-center justify-between bg-gray-700 rounded-md px-3 py-2">
              <span className="text-white">Remix VM</span>
              <span className="text-gray-400">Osaka ▼</span>
            </div>
          </div>

          {/* Account Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-300">Account 1 ✏</label>
              <span className="text-white">100.000 ETH</span>
            </div>
            <div className="bg-gray-700 rounded-md px-3 py-2 text-sm text-gray-300">
              0x5B3...edC4 📋
            </div>
          </div>

          {/* Deploy Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-300">Deploy</label>
              <span className="text-xs text-gray-400">Remix VM osaka</span>
              <button className="ml-auto inline-flex items-center px-3 py-1.5 text-sm rounded-md transition-colors bg-blue-600 hover:bg-blue-700 text-white">
                ▶ Compile
              </button>
            </div>
            
            <div className="bg-gray-700 rounded-md px-3 py-2">
              <div className="text-white">Ballot</div>
              <div className="text-xs text-gray-400">3_Ballot.sol</div>
            </div>

            {/* Value Section */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-300 min-w-12">Value</label>
              <div className="flex flex-1">
                <input
                  type="number"
                  defaultValue="0"
                  className="flex-1 bg-gray-600 border border-theme rounded-l-md px-3 py-1.5 text-white text-sm"
                />
                <select className="bg-gray-600 border border-l-0 border-theme rounded-r-md px-2 py-1.5 text-white text-sm">
                  <option>wei</option>
                </select>
              </div>
            </div>

            {/* Gas Limit Section */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-300 min-w-16">Gas limit</label>
              <div className="flex items-center gap-2">
                <span className="text-blue-400 text-sm">auto:</span>
                <input
                  type="number"
                  defaultValue="0"
                  className="bg-gray-600 border border-theme rounded-md px-3 py-1.5 text-white text-sm w-20"
                />
              </div>
            </div>

            {/* Deploy Button */}
            <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors">
              Deploy
            </button>
          </div>

          {/* Deployed Contracts Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-300">Deployed Contracts</label>
              <div className="flex items-center gap-2">
                <span className="bg-blue-600 text-white text-xs px-2 py-1 rounded-full">0</span>
                <button className="text-blue-400 hover:text-blue-300 text-sm">+ Add Contract</button>
              </div>
            </div>
            <div className="text-sm text-gray-400">
              <p>Interact with a deployed contract</p>
              <p className="mt-1">There is no contract to show.</p>
              <p className="mt-2">
                Learn how to deploy <a href="#" className="text-blue-400 underline">"your first contract"</a>.
              </p>
            </div>
          </div>

          {/* Transactions Recorder Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-300">Transactions recorder</label>
              <div className="flex items-center gap-2">
                <button className="inline-flex items-center px-3 py-1.5 text-sm rounded-md transition-colors bg-gray-600 hover:bg-gray-700 text-white">
                  Save
                </button>
                <button className="text-gray-400 hover:text-gray-300">
                  ▶
                </button>
              </div>
            </div>
            <span className="bg-blue-600 text-white text-xs px-2 py-1 rounded-full">0</span>
          </div>
        </div>
      </div>
    </Fragment>
  )
}
