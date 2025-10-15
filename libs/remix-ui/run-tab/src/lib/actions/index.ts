// eslint-disable-next-line no-unused-vars
import React from 'react'
import { RunTab } from '../types/run-tab'
import { resetAndInit, setupEvents, setEventsDispatch } from './events'
import { createNewBlockchainAccount, createSmartAccount, delegationAuthorization, setExecutionContext, signMessageWithAddress, addFileInternal } from './account'
import { clearInstances, clearPopUp, removeInstance, pinInstance, unpinInstance, setAccount, setGasFee, setMatchPassphrasePrompt,
  setNetworkNameFromProvider, setPassphrasePrompt, setSelectedContract, setSendTransactionValue, setUnit,
  updateBaseFeePerGas, updateConfirmSettings, updateGasPrice, updateGasPriceStatus, updateMaxFee, updateMaxPriorityFee, updateScenarioPath } from './actions'
import { createInstance, getContext, getFuncABIInputs, getSelectedContract, loadAddress, runTransactions, updateInstanceBalance, syncContractsInternal, isValidContractAddress, isValidContractUpgrade } from './deploy'
import { CompilerAbstract as CompilerAbstractType } from '@remix-project/remix-solidity'
import { ContractData, FuncABI, OverSizeLimit } from "@remix-project/core-plugin"
import { DeployMode, MainnetPrompt } from '../types'
import { runCurrentScenario, storeScenario } from './recorder'
import { SolcInput, SolcOutput } from '@openzeppelin/upgrades-core'

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

export const addFile = (path: string, content: string) => addFileInternal(plugin, path, content)
export const setAccountAddress = (account: string) => setAccount(dispatch, account)
export const setUnitValue = (unit: 'ether' | 'finney' | 'gwei' | 'wei') => setUnit(dispatch, unit)
export const setGasFeeAmount = (value: number) => setGasFee(dispatch, value)
export const setExecutionEnvironment = (executionContext: { context: string, fork: string }) => setExecutionContext(plugin, dispatch, executionContext)
export const hideToaster = () => clearPopUp(dispatch)
export const createNewAddress = (cbMessage: JSX.Element) => createNewBlockchainAccount(plugin, dispatch, cbMessage)
export const createNewSmartAccount = () => createSmartAccount(plugin, dispatch)
export const internalDelegationAuthorization = (contractAddress: string) => delegationAuthorization(contractAddress, plugin)
export const setPassphraseModal = (passphrase: string) => setPassphrasePrompt(dispatch, passphrase)
export const setMatchPassphraseModal = (passphrase: string) => setMatchPassphrasePrompt(dispatch, passphrase)
export const signMessage = (account: string, message: string, modalContent: (hash: string, data: string) => JSX.Element, passphrase?: string) => signMessageWithAddress(plugin, dispatch, account, message, modalContent, passphrase)
export const fetchSelectedContract = (contractName: string, compiler: CompilerAbstractType) => getSelectedContract(contractName, compiler)
export const createNewInstance = async (selectedContract: ContractData, gasEstimationPrompt: (msg: string) => JSX.Element, passphrasePrompt: (msg: string) => JSX.Element, publishToStorage: (storage: 'ipfs' | 'swarm', contract: ContractData) => void, mainnetPrompt: MainnetPrompt, isOverSizePrompt: (values: OverSizeLimit) => JSX.Element, args, deployMode: DeployMode[], isVerifyChecked: boolean) => createInstance(plugin, dispatch, selectedContract, gasEstimationPrompt, passphrasePrompt, publishToStorage, mainnetPrompt, isOverSizePrompt, args, deployMode, isVerifyChecked)
export const setSendValue = (value: string) => setSendTransactionValue(dispatch, value)
export const setBaseFeePerGas = (baseFee: string) => updateBaseFeePerGas(dispatch, baseFee)
export const setConfirmSettings = (confirmation: boolean) => updateConfirmSettings(dispatch, confirmation)
export const setGasPrice = (price: string) => updateGasPrice(dispatch, price)
export const setGasPriceStatus = (status: boolean) => updateGasPriceStatus(dispatch, status)
export const setMaxFee = (fee: string) => updateMaxFee(dispatch, fee)
export const setMaxPriorityFee = (fee: string) => updateMaxPriorityFee(dispatch, fee)
export const pinUnpinnedInstance = (index: number, pinnedAt: number, filePath: string) => pinInstance(dispatch, index, pinnedAt, filePath)
export const unpinPinnedInstance = (index: number) => unpinInstance(dispatch, index)
export const removeInstances = () => clearInstances(dispatch)
export const removeSingleInstance = (index: number) => removeInstance(dispatch, index)
export const getExecutionContext = () => getContext(plugin)
export const executeTransactions = (instanceIndex: number, lookupOnly: boolean, funcABI: FuncABI, inputsValues: string, contractName: string, contractABI, contract, address, logMsg:string, mainnetPrompt: MainnetPrompt, gasEstimationPrompt: (msg: string) => JSX.Element, passphrasePrompt: (msg: string) => JSX.Element, funcIndex?: number) => runTransactions(plugin, dispatch, instanceIndex, lookupOnly, funcABI, inputsValues, contractName, contractABI, contract, address, logMsg, mainnetPrompt, gasEstimationPrompt, passphrasePrompt, funcIndex)
export const loadFromAddress = (contract: ContractData, address: string) => loadAddress(plugin, dispatch, contract, address)
export const storeNewScenario = async (prompt: (msg: string, defaultValue: string) => JSX.Element) => storeScenario(plugin, dispatch, prompt)
export const runScenario = (liveMode: boolean, gasEstimationPrompt: (msg: string) => JSX.Element, passphrasePrompt: (msg: string) => JSX.Element, confirmDialogContent: MainnetPrompt) => runCurrentScenario(liveMode, plugin, dispatch, gasEstimationPrompt, passphrasePrompt, confirmDialogContent)
export const setScenarioPath = (path: string) => updateScenarioPath(dispatch, path)
export const getFuncABIValues = (funcABI: FuncABI) => getFuncABIInputs(plugin, funcABI)
export const setNetworkName = (networkName: string) => setNetworkNameFromProvider(dispatch, networkName)
export const updateSelectedContract = (contractName) => setSelectedContract(dispatch, contractName)
export const syncContracts = () => syncContractsInternal(plugin)
export const isValidProxyAddress = (address: string) => isValidContractAddress(plugin, address)
export const isValidProxyUpgrade = (proxyAddress: string, contractName: string, solcInput: SolcInput, solcOutput: SolcOutput, solcVersion: string) => isValidContractUpgrade(plugin, proxyAddress, contractName, solcInput, solcOutput, solcVersion)