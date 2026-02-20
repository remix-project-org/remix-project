import React from 'react'
import { trackMatomoEvent } from '@remix-api'
import * as remixLib from '@remix-project/remix-lib'
import { FuncABI } from '@remix-project/core-plugin'
// eslint-disable-next-line @nrwl/nx/enforce-module-boundaries
import { DeployedContractsPlugin } from 'apps/remix-ide/src/app/udapp/udappDeployedContracts'
import { Actions } from '../types'

const txFormat = remixLib.execution.txFormat

export async function loadAddress (plugin: DeployedContractsPlugin, dispatch: React.Dispatch<Actions>, address: string, currentFile: string, loadType: 'abi' | 'sol' | 'vyper' | 'lexon' | 'contract' | 'other') {
  // Show confirmation modal for ABI files
  if (loadType === 'abi') {
    plugin.call('notification', 'modal', {
      id: 'deployedContractsAtAddress',
      title: 'At Address',
      message: `Do you really want to interact with ${address} using the current ABI definition?`,
      okLabel: 'OK',
      cancelLabel: 'Cancel',
      okFn: async () => {
        try {
          const content = await plugin.call('fileManager', 'readFile', currentFile)
          let abi: any[]

          try {
            abi = JSON.parse(content)
            if (!Array.isArray(abi)) {
              await plugin.call('notification', 'toast', '⚠️ ABI should be an array')
              return
            }
            trackMatomoEvent(plugin, {
              category: 'udapp',
              action: 'useAtAddress',
              name: 'AtAddressLoadWithABI',
              isClick: true
            })
            await plugin.addInstance(address, abi, '<at address>')
            dispatch({ type: 'SET_ADDRESS_INPUT', payload: '' })
          } catch (e) {
            await plugin.call('notification', 'toast', '⚠️ Failed to parse ABI file')
          }
        } catch (e) {
          console.error('Error loading ABI:', e)
          await plugin.call('notification', 'toast', `⚠️ Error: ${e.message}`)
        }},
      cancelFn: () => {
        plugin.call('notification', 'toast', 'Cancelled by user')
      }
    })
  } else if (['sol', 'vyper', 'lexon', 'contract'].includes(loadType)) {
    try {
      const contractList: any = await plugin.call('udappDeploy', 'getCompiledContracts')
      const contract = contractList.find(contract => contract.filePath === currentFile)
      const contractData = contract?.contractData

      if (!contractData) {
        await plugin.call('notification', 'toast', '⚠️ Contract not compiled')
        return
      }

      // Add instance with contract data
      await plugin.addInstance(address, contractData.abi, contractData.name, contractData)
      dispatch({ type: 'SET_ADDRESS_INPUT', payload: '' })
    } catch (e) {
      console.error('Error loading contract:', e)
      await plugin.call('notification', 'toast', `⚠️ Error loading contract: ${e.message}`)
    }
  } else {
    plugin.call('notification', 'toast', '⚠️ Please open a contract ABI file or compile a contract')
  }
}

export async function loadPinnedContracts (plugin: DeployedContractsPlugin, dispatch: React.Dispatch<Actions>, dirName: string) {
  dispatch({ type: 'CLEAR_ALL_CONTRACTS', payload: null })
  const isPinnedAvailable = await plugin.call('fileManager', 'exists', `.deploys/pinned-contracts/${dirName}`)

  if (isPinnedAvailable) {
    try {
      const list = await plugin.call('fileManager', 'readdir', `.deploys/pinned-contracts/${dirName}`)
      const filePaths = Object.keys(list)
      let codeError = false
      for (const file of filePaths) {
        const pinnedContract = await plugin.call('fileManager', 'readFile', file)
        const pinnedContractObj = JSON.parse(pinnedContract)
        const web3 = await plugin.call('blockchain', 'web3')
        const code = await web3.getCode(pinnedContractObj.address)

        if (code === '0x') {
          codeError = true
          const msg = `Cannot load pinned contract at ${pinnedContractObj.address}: Contract not found at that address.`

          await plugin.call('terminal', 'log', { type: 'error', value: msg })
        } else {
          if (pinnedContractObj) plugin.addInstance(pinnedContractObj.address, pinnedContractObj.abi, pinnedContractObj.name, null, pinnedContractObj.pinnedAt, pinnedContractObj.timestamp)
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

export async function runTransactions (
  plugin: DeployedContractsPlugin,
  dispatch: React.Dispatch<Actions>,
  instanceIndex: number,
  lookupOnly: boolean,
  funcABI: FuncABI,
  inputsValues: string,
  contract: any,
  funcIndex: number,
  sendParams?: { value: bigint, gasLimit: string }
) {
  // Destructure contract properties
  const { name: contractName, abi, contractData, address } = contract
  const contractABI = abi || contractData?.abi

  let eventAction: 'call' | 'lowLevelinteractions' | 'transact'
  if (lookupOnly) {
    eventAction = 'call'
  } else if (funcABI.type === 'fallback' || funcABI.type === 'receive') {
    eventAction = 'lowLevelinteractions'
  } else {
    eventAction = 'transact'
  }

  // Get network name for tracking
  const network = await plugin.call('udappEnv', 'getNetwork')
  const networkName = network?.name || 'unknown'

  trackMatomoEvent(plugin, { category: 'udapp', action: eventAction, name: networkName, isClick: true })

  const params = funcABI.type !== 'fallback' ? inputsValues : ''
  const result = await plugin.call('blockchain', 'runOrCallContractMethod', contractName, contractABI, funcABI, contractData, inputsValues, address, params, sendParams)

  if (lookupOnly) {
    const response = txFormat.decodeResponse(result.returnValue, funcABI)

    dispatch({ type: 'SET_DECODED_RESPONSE',
      payload: {
        instanceIndex,
        funcIndex,
        response
      }
    })
  }
}