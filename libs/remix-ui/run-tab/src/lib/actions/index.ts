// eslint-disable-next-line no-unused-vars
import React from 'react'
import { RunTab } from '../types/run-tab'
import { resetAndInit, setupEvents, setEventsDispatch } from './events'
import { clearInstances, removeInstance, pinInstance, unpinInstance, updateScenarioPath } from './actions'
import { getContext, getFuncABIInputs, runTransactions } from './deploy'
import { FuncABI } from "@remix-project/core-plugin"
import { runCurrentScenario, storeScenario } from './recorder'

let plugin: RunTab, dispatch: React.Dispatch<any> = () => {}

export const initRunTab = (udapp: RunTab, resetEventsAndAccounts: boolean) => async (reducerDispatch: React.Dispatch<any>) => {
  plugin = udapp
  dispatch = reducerDispatch
  setEventsDispatch(reducerDispatch)
  if (resetEventsAndAccounts) {
    setupEvents(plugin)
    resetAndInit(plugin)
  }
}

export const pinUnpinnedInstance = (index: number, pinnedAt: number, filePath: string) => pinInstance(dispatch, index, pinnedAt, filePath)
export const unpinPinnedInstance = (index: number) => unpinInstance(dispatch, index)
export const removeInstances = () => clearInstances(dispatch)
export const removeSingleInstance = (index: number) => removeInstance(dispatch, index)
export const getExecutionContext = () => getContext(plugin)
export const executeTransactions = (instanceIndex: number, lookupOnly: boolean, funcABI: FuncABI, inputsValues: string, contractName: string, contractABI: any, contract: any, address: any, funcIndex?: number) => runTransactions(plugin, dispatch, instanceIndex, lookupOnly, funcABI, inputsValues, contractName, contractABI, contract, address, funcIndex)
export const storeNewScenario = async (prompt: (msg: string, defaultValue: string) => JSX.Element) => storeScenario(plugin, dispatch, prompt)
export const runScenario = async (liveMode: boolean): Promise<{ abi: any, address: string, contractName: string }> => await runCurrentScenario(liveMode, plugin, dispatch)
export const setScenarioPath = (path: string) => updateScenarioPath(dispatch, path)
export const getFuncABIValues = (funcABI: FuncABI) => getFuncABIInputs(plugin, funcABI)