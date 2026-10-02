import React from 'react'
import { trackMatomoEvent } from '@remix-api'
import * as remixLib from '@remix-project/remix-lib'
import { FuncABI } from '@remix-project/core-plugin'
import { JsonRpcProvider, Contract } from 'ethers'
import { decodeEezRevertData } from '@remix-ui/helper'
// eslint-disable-next-line @nrwl/nx/enforce-module-boundaries
import { DeployedContractsPlugin } from 'apps/remix-ide/src/app/udapp/udappDeployedContracts'
import { Actions, DeployedContract } from '../types'

const txFormat = remixLib.execution.txFormat

const EEZ_NETWORKS_CONFIG_KEY = 'eez-networks'
const AUTHORIZED_PROXIES_ABI = ['function authorizedProxies(address) view returns (bool isProxy, address originalAddress, uint64 originalRollupId)']

interface EezNetworkEntry {
  id: string
  label: string
  rpcUrl: string
  eezContractAddress: string
  rollupId: string
  chainId: string
}

export interface CrossChainProxyInfo {
  originalAddress: string
  originalRollupId: string
  originNetworkLabel: string | null
}

async function getEezContext(plugin: DeployedContractsPlugin): Promise<{ networks: EezNetworkEntry[]; currentNetwork: EezNetworkEntry } | null> {
  const raw = await plugin.call('config', 'getAppParameter', EEZ_NETWORKS_CONFIG_KEY)
  if (!raw) return null
  const networks: EezNetworkEntry[] = JSON.parse(raw)
  if (!networks.length) return null

  const status = await plugin.call('blockchain', 'getCurrentNetworkStatus')
  const chainId = status?.network?.id
  const currentChainId = chainId === undefined || chainId === null ? null : String(chainId)
  if (!currentChainId) return null

  const currentNetwork = networks.find((n) => String(n.chainId) === currentChainId)
  if (!currentNetwork?.eezContractAddress || !currentNetwork?.rpcUrl) return null

  return { networks, currentNetwork }
}

function resolveProxyInfo(networks: EezNetworkEntry[], result: any): CrossChainProxyInfo | null {
  const isProxy: boolean = result[0]
  if (!isProxy) return null

  const originalAddress: string = result[1]
  const originalRollupId: string = result[2].toString()
  const originNetwork = networks.find((n) => String(n.rollupId) === originalRollupId)

  return { originalAddress, originalRollupId, originNetworkLabel: originNetwork?.label || null }
}

export async function checkCrossChainProxy(plugin: DeployedContractsPlugin, address: string): Promise<CrossChainProxyInfo | null> {
  try {
    const ctx = await getEezContext(plugin)
    if (!ctx) return null
    const { networks, currentNetwork } = ctx

    const provider = new JsonRpcProvider(currentNetwork.rpcUrl)
    try {
      const manager = new Contract(currentNetwork.eezContractAddress, AUTHORIZED_PROXIES_ABI, provider)
      const result = await manager.authorizedProxies(address)
      return resolveProxyInfo(networks, result)
    } finally {
      provider.destroy()
    }
  } catch (e) {
    return null
  }
}

export interface TraceAddressInfo {
  address: string
  proxyInfo: CrossChainProxyInfo | null
}

export interface CrossChainTraceResult {
  willSucceed: boolean
  error: string | null
  decodedError: string | null
  addresses: TraceAddressInfo[]
  currentNetworkLabel: string
}

function collectCallAddresses(frame: any, into: Set<string>) {
  if (!frame) return
  if (typeof frame.to === 'string') into.add(frame.to.toLowerCase())
  if (Array.isArray(frame.calls)) {
    for (const child of frame.calls) collectCallAddresses(child, into)
  }
}

export async function traceCrossChainCall(
  plugin: DeployedContractsPlugin,
  to: string,
  data: string,
  from: string,
  value: string
): Promise<CrossChainTraceResult> {
  const ctx = await getEezContext(plugin)
  if (!ctx) throw new Error('The current network is not a configured EEZ network.')
  const { networks, currentNetwork } = ctx

  const provider = new JsonRpcProvider(currentNetwork.rpcUrl)
  try {
    const traceParams = [{ from, to, data, value }, 'latest', { tracer: 'callTracer' }]
    const trace = await provider.send('debug_traceCall', traceParams)

    const addressSet = new Set<string>()
    collectCallAddresses(trace, addressSet)

    const manager = new Contract(currentNetwork.eezContractAddress, AUTHORIZED_PROXIES_ABI, provider)
    const addresses: TraceAddressInfo[] = await Promise.all(
      Array.from(addressSet).map(async (addr): Promise<TraceAddressInfo> => {
        try {
          const result = await manager.authorizedProxies(addr)
          return { address: addr, proxyInfo: resolveProxyInfo(networks, result) }
        } catch (e) {
          return { address: addr, proxyInfo: null }
        }
      })
    )

    const decodedError = trace.error ? (trace.revertReason || decodeEezRevertData(trace.output)) : null

    return { willSucceed: !trace.error, error: trace.error || null, decodedError, addresses, currentNetworkLabel: currentNetwork.label }
  } finally {
    provider.destroy()
  }
}

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
      const contract: DeployedContract = await plugin.call('udappDeploy', 'getSelectedContractItem')
      const contractData = contract?.contractData

      if (!contractData) {
        await plugin.call('notification', 'toast', '⚠️ Contract not compiled')
        return
      }

      // Add instance with contract data
      await plugin.addInstance(address, contractData.abi, contractData.name, contractData)
      trackMatomoEvent(plugin, {
        category: 'udapp',
        action: 'useAtAddress',
        name: 'AtAddressLoadWithContract',
        isClick: false
      })
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
      for (const file of filePaths) {
        const pinnedContract = await plugin.call('fileManager', 'readFile', file)
        const pinnedContractObj = JSON.parse(pinnedContract)
        if (pinnedContractObj) await plugin.addInstance(pinnedContractObj.address, pinnedContractObj.abi, pinnedContractObj.name, null, pinnedContractObj.pinnedAt, pinnedContractObj.timestamp)
      }
    } catch (err) {
      console.log(err)
    }
  }
}

export async function refreshDeployedContractBalances (plugin: DeployedContractsPlugin, dispatch: React.Dispatch<Actions>) {
  const deployedContracts = plugin.getWidgetState?.()?.deployedContracts || []

  for (const contract of deployedContracts) {
    if (!contract.address) continue
    try {
      const balance = await plugin.call('blockchain', 'getBalanceInEther', contract.address)

      if (balance !== undefined && balance !== null) {
        dispatch({ type: 'UPDATE_CONTRACT_BALANCE', payload: { address: contract.address, balance } })
      }
    } catch (e) {
      console.error(`Failed to update balance for ${contract.address}:`, e)
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