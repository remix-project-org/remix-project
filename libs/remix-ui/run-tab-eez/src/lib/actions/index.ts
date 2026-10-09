import React from 'react'
import { JsonRpcProvider, Contract, Interface, InterfaceAbi, isAddress, isHexString } from 'ethers'
import { decodeEezRevertData } from '@remix-ui/helper'
// eslint-disable-next-line @nrwl/nx/enforce-module-boundaries
import type { EezPlugin } from 'apps/remix-ide/src/app/udapp/udappEez'
import { EEZ_ABI, EEZ_ROLLUP_ID_ABI } from '../abi'
import { EEZ_COMPOSER_RPC_URLS } from '../constants'
import { Actions, EezComposerInfo, EezComposerNetwork, EezNetworkEntry, ResolutionRow, ResolvedProxyInfo, TraceProxyInfo, TransactionTraceResult } from '../types'

const NOT_EEZ_NETWORK = 'The currently connected network is not part of an EEZ network.'
export const EEZ_SETTINGS_KEY = 'eez-networks'

function collectCallAddresses(frame: any, into: Set<string>) {
  if (!frame) return
  if (typeof frame.to === 'string') into.add(frame.to.toLowerCase())
  if (Array.isArray(frame.calls)) {
    for (const child of frame.calls) collectCallAddresses(child, into)
  }
}

function parseChainId(network: EezComposerNetwork): string | null {
  if (network === undefined || network === null) return null
  return String(network)
}

async function loadSettingsRpcUrls(plugin: EezPlugin): Promise<Record<string, string>> {
  const urls: Record<string, string> = {}
  try {
    const raw = await plugin.call('config', 'getAppParameter', EEZ_SETTINGS_KEY)
    const entries: { chainId?: string | number; rpcUrl?: string }[] = raw ? JSON.parse(raw) : []

    for (const entry of entries) {
      const chainId = String(entry?.chainId ?? '').trim()
      const rpcUrl = (entry?.rpcUrl || '').trim()
      if (chainId && rpcUrl) urls[chainId] = rpcUrl
    }
  } catch (e) {
    console.warn('EEZ: unable to read the EEZ networks configured in Settings', e)
  }
  return urls
}

async function resolveRpcUrls(plugin: EezPlugin): Promise<Record<string, string>> {
  return { ...(await loadSettingsRpcUrls(plugin)), ...EEZ_COMPOSER_RPC_URLS }
}

async function fetchComposerInfo(url: string, chainId: string): Promise<EezComposerInfo> {
  const provider = new JsonRpcProvider(url, Number(chainId), { staticNetwork: true })
  try {
    return await provider.send('eez_composerInfo', [])
  } finally {
    provider.destroy()
  }
}

function composerSupportsChain(info: EezComposerInfo, chainId: string): boolean {
  return Object.values(info?.supportedNetworks || {}).some((network) => parseChainId(network) === chainId)
}

export async function discoverEezNetworks(plugin: EezPlugin, currentChainId: string): Promise<EezNetworkEntry[]> {
  const rpcUrls = await resolveRpcUrls(plugin)
  const composerUrl = rpcUrls[currentChainId]
  if (!composerUrl) {
    return []
  }

  let info: EezComposerInfo | null = null
  try {
    info = await fetchComposerInfo(composerUrl, currentChainId)
  } catch (e: any) {
    for (const [chainId, url] of Object.entries(rpcUrls)) {
      if (chainId === currentChainId || url === composerUrl) continue
      try {
        const candidate = await fetchComposerInfo(url, chainId)
        if (composerSupportsChain(candidate, currentChainId)) {
          info = candidate
          break
        }
      } catch (err) {
        // not a composer endpoint, try the next one
      }
    }
  }
  if (!info) {
    console.warn(`EEZ: no composer serving eez_composerInfo was found for chain ${currentChainId}. EEZ features are disabled for this network.`)
    return []
  }
  if (!info?.eezContracts || !info?.supportedNetworks) {
    plugin.call('terminal', 'log', { type: 'warn', value: `EEZ: unexpected eez_composerInfo response from ${composerUrl}: ${JSON.stringify(info)}` })
    return []
  }

  const networks: EezNetworkEntry[] = []
  for (const [key, network] of Object.entries(info.supportedNetworks)) {
    const chainId = parseChainId(network)
    const eezContractAddress = info.eezContracts[`${key}Address`] || info.eezContracts.eezRegistryAddress
    if (!chainId || !eezContractAddress) {
      console.warn(`EEZ: skipping supported network '${key}': missing chain id or EEZ contract address in eez_composerInfo`)
      continue
    }
    networks.push({
      id: key,
      label: key.replace(/^eez/, 'EEZ '),
      rpcUrl: rpcUrls[chainId] || null,
      eezContractAddress,
      rollupId: '',
      chainId
    })
  }

  await Promise.all(networks.map(async (network) => {
    try {
      const { provider, contract } = contractFor(network, EEZ_ROLLUP_ID_ABI)
      try {
        const rollupId = await contract.ROLLUP_ID().catch(() => contract.MAINNET_ROLLUP_ID())
        network.rollupId = rollupId.toString()
        if (network.rollupId === '0') network.eezContractAddress = info.eezContracts.eezRegistryAddress
      } finally {
        provider.destroy()
      }
    } catch (e) {
      console.warn(`Unable to read the rollup id of ${network.label}`, e)
    }
  }))

  return networks
}

async function getCurrentChainId(plugin: EezPlugin): Promise<string | null> {
  try {
    const status = await plugin.call('blockchain', 'getCurrentNetworkStatus')
    const id = status?.network?.id
    return id === undefined || id === null ? null : String(id)
  } catch (e) {
    return null
  }
}

function findByChainId(networks: EezNetworkEntry[], chainId: string | null): EezNetworkEntry | undefined {
  if (!chainId) return undefined
  return networks.find(n => String(n.chainId) === chainId)
}

function contractFor(network: EezNetworkEntry, abi: InterfaceAbi = EEZ_ABI) {
  if (!network.rpcUrl) throw new Error(`No RPC endpoint is configured for ${network.label} (chain ${network.chainId}). Add it in Settings > EEZ.`)
  const provider = new JsonRpcProvider(network.rpcUrl, Number(network.chainId), { staticNetwork: true })

  return { provider, contract: new Contract(network.eezContractAddress, abi, provider) }
}

function rollupIdOf(network: EezNetworkEntry): bigint {
  if (!network.rollupId) throw new Error(`The rollup id of ${network.label} is unknown.`)
  return BigInt(network.rollupId)
}

export async function resolveProxyAddresses(
  plugin: EezPlugin,
  dispatch: React.Dispatch<Actions>,
  networks: EezNetworkEntry[],
  address: string
) {
  if (!isAddress(address)) {
    dispatch({ type: 'RESOLVE_ERROR', payload: 'Enter a valid address' })
    return
  }
  if (networks.length === 0) {
    dispatch({ type: 'RESOLVE_ERROR', payload: NOT_EEZ_NETWORK })
    return
  }

  dispatch({ type: 'START_RESOLVE' })

  const currentChainId = await getCurrentChainId(plugin)
  dispatch({ type: 'SET_ORIGIN_NETWORK_CHAIN_ID', payload: currentChainId })
  const originNetwork = findByChainId(networks, currentChainId)

  if (!originNetwork) {
    dispatch({ type: 'RESOLVE_ERROR', payload: NOT_EEZ_NETWORK })
    return
  }

  const settled = await Promise.allSettled(
    networks.map(async (network): Promise<ResolutionRow> => {
      const isOrigin = network.id === originNetwork.id
      if (isOrigin) {
        return { network, isOrigin: true, proxyAddress: null, isDeployed: null, error: null }
      }
      let provider: JsonRpcProvider | null = null
      try {
        const target = contractFor(network)

        provider = target.provider
        const proxyAddress: string = await target.contract.computeCrossChainProxyAddress(address, rollupIdOf(originNetwork))
        const code = await provider.getCode(proxyAddress)
        return { network, isOrigin: false, proxyAddress, isDeployed: code !== '0x', error: null }
      } catch (e) {
        return { network, isOrigin: false, proxyAddress: null, isDeployed: null, error: e?.message || 'Failed to resolve' }
      } finally {
        provider?.destroy()
      }
    })
  )

  const rows = settled.map((result, i) =>
    result.status === 'fulfilled'
      ? result.value
      : { network: networks[i], isOrigin: networks[i].id === originNetwork.id, proxyAddress: null, isDeployed: null, error: 'Failed to resolve' }
  )

  dispatch({ type: 'RESOLVE_SUCCESS', payload: rows })
}

export async function previewProxyCreation(
  plugin: EezPlugin,
  dispatch: React.Dispatch<Actions>,
  networks: EezNetworkEntry[],
  originNetworkId: string,
  originAddress: string
) {
  if (!isAddress(originAddress)) {
    dispatch({ type: 'PREVIEW_ERROR', payload: 'Enter a valid origin address' })
    return
  }
  const originNetwork = networks.find(n => n.id === originNetworkId)
  if (!originNetwork) {
    dispatch({ type: 'PREVIEW_ERROR', payload: 'Select the origin network' })
    return
  }
  dispatch({ type: 'START_PREVIEW' })

  const currentChainId = await getCurrentChainId(plugin)
  const destinationNetwork = findByChainId(networks, currentChainId)
  if (!destinationNetwork) {
    dispatch({ type: 'PREVIEW_ERROR', payload: NOT_EEZ_NETWORK })
    return
  }
  if (destinationNetwork.id === originNetwork.id) {
    dispatch({ type: 'PREVIEW_ERROR', payload: 'Origin network cannot be the network you are currently connected to (same-network proxies are not allowed).' })
    return
  }

  const { provider, contract } = contractFor(destinationNetwork)
  try {
    const proxyAddress: string = await contract.computeCrossChainProxyAddress(originAddress, rollupIdOf(originNetwork))
    const code = await provider.getCode(proxyAddress)
    dispatch({ type: 'PREVIEW_SUCCESS', payload: { previewAddress: proxyAddress, previewIsDeployed: code !== '0x' } })
  } catch (e) {
    dispatch({ type: 'PREVIEW_ERROR', payload: e?.message || 'Failed to preview proxy address' })
  } finally {
    provider.destroy()
  }
}

export async function createProxy(
  plugin: EezPlugin,
  dispatch: React.Dispatch<Actions>,
  networks: EezNetworkEntry[],
  originNetworkId: string,
  originAddress: string
) {
  const originNetwork = networks.find(n => n.id === originNetworkId)
  if (!originNetwork || !isAddress(originAddress)) {
    dispatch({ type: 'CREATE_ERROR', payload: 'Select a valid origin network and address first' })
    return
  }

  const currentChainId = await getCurrentChainId(plugin)
  const destinationNetwork = findByChainId(networks, currentChainId)
  if (!destinationNetwork) {
    dispatch({ type: 'CREATE_ERROR', payload: NOT_EEZ_NETWORK })
    return
  }
  if (destinationNetwork.id === originNetwork.id) {
    dispatch({ type: 'CREATE_ERROR', payload: 'Origin network cannot be the network you are currently connected to (same-network proxies are not allowed).' })
    return
  }

  dispatch({ type: 'START_CREATE' })

  try {
    const iface = new Interface(EEZ_ABI)
    const funArgs = [originAddress, rollupIdOf(originNetwork)]
    const dataHex = iface.encodeFunctionData('createCrossChainProxy', funArgs)
    const funAbi = {
      name: 'createCrossChainProxy',
      type: 'function',
      inputs: [
        { name: 'originalAddress', type: 'address' },
        { name: 'originalRollupId', type: 'uint64' }
      ],
      outputs: [{ name: '', type: 'address' }],
      stateMutability: 'nonpayable',
      payable: false
    }

    const result = await plugin.call('blockchain', 'runTx', {
      to: destinationNetwork.eezContractAddress,
      useCall: false,
      data: { dataHex, value: '0x0', gasLimit: '0x' + (3000000).toString(16), timestamp: Date.now(), funAbi, funArgs, contractName: 'EEZ' }
    })

    const txHash = result?.txResult?.transactionHash || result?.txResult?.receipt?.transactionHash || ''

    const { provider, contract } = contractFor(destinationNetwork)
    let proxyAddress = ''
    try {
      proxyAddress = await contract.computeCrossChainProxyAddress(originAddress, rollupIdOf(originNetwork))
    } finally {
      provider.destroy()
    }

    dispatch({
      type: 'CREATE_SUCCESS',
      payload: {
        txHash,
        proxyAddress,
        originNetworkLabel: originNetwork.label,
        originAddress,
        destinationNetworkLabel: destinationNetwork.label
      }
    })
  } catch (e) {
    const message = e?.message || 'Failed to create proxy'
    const friendly = /SameNetworkProxy/.test(message)
      ? 'The destination network already matches the origin network — same-network proxies are not allowed.'
      : message
    dispatch({ type: 'CREATE_ERROR', payload: friendly })
  }
}

export async function loadCreatedProxyWithSelectedAbi(plugin: EezPlugin, proxyAddress: string) {
  const selected = await plugin.call('udappDeploy', 'getSelectedContractItem')
  if (!selected || !selected.contractData?.abi) {
    throw new Error('No compiled contract selected in the Deploy tab to load this proxy with.')
  }
  await plugin.call('udappDeployedContracts', 'addInstance', proxyAddress, selected.contractData.abi, selected.name || '<eez proxy>')
}

function resolveProxyInfo(networks: EezNetworkEntry[], result: any): ResolvedProxyInfo | null {
  const isProxy: boolean = result[0]
  if (!isProxy) return null
  const originalAddress: string = result[1]
  const originalRollupId: string = result[2].toString()
  const originNetwork = networks.find((n) => String(n.rollupId) === originalRollupId)
  return { originalAddress, originalRollupId, originNetworkLabel: originNetwork?.label || null }
}

export async function traceTransactionByHash(
  plugin: EezPlugin,
  dispatch: React.Dispatch<Actions>,
  networks: EezNetworkEntry[],
  txHash: string
) {
  if (!isHexString(txHash, 32)) {
    dispatch({ type: 'TRACE_ERROR', payload: 'Enter a valid transaction hash' })
    return
  }
  if (networks.length === 0) {
    dispatch({ type: 'TRACE_ERROR', payload: NOT_EEZ_NETWORK })
    return
  }

  dispatch({ type: 'START_TRACE' })

  const currentChainId = await getCurrentChainId(plugin)
  const currentNetwork = findByChainId(networks, currentChainId)
  if (!currentNetwork) {
    dispatch({ type: 'TRACE_ERROR', payload: NOT_EEZ_NETWORK })
    return
  }

  const providers = new Map<string, JsonRpcProvider>()
  const providerOf = (network: EezNetworkEntry) => {
    if (!providers.has(network.id)) providers.set(network.id, contractFor(network).provider)
    return providers.get(network.id)
  }
  const managerFor = (network: EezNetworkEntry) => new Contract(network.eezContractAddress, EEZ_ABI, providerOf(network))
  const lookupProxy = async (network: EezNetworkEntry, address: string): Promise<ResolvedProxyInfo | null> => {
    try {
      return resolveProxyInfo(networks, await managerFor(network).authorizedProxies(address))
    } catch (e) {
      return null
    }
  }

  const resolveHops = async (first: ResolvedProxyInfo, address: string): Promise<ResolvedProxyInfo[]> => {
    const hops = [first]
    const seen = new Set([`${currentNetwork.rollupId}:${address}`.toLowerCase()])
    let hop = first
    while (true) {
      const key = `${hop.originalRollupId}:${hop.originalAddress}`.toLowerCase()
      if (seen.has(key)) break
      seen.add(key)
      const network = networks.find((n) => String(n.rollupId) === hop.originalRollupId)
      if (!network?.rpcUrl || !network.eezContractAddress) break
      const next = await lookupProxy(network, hop.originalAddress)
      if (!next) break
      hops.push(next)
      hop = next
    }
    return hops
  }

  try {
    const provider = providerOf(currentNetwork)
    const receipt = await provider.getTransactionReceipt(txHash)
    if (!receipt) {
      dispatch({ type: 'TRACE_ERROR', payload: 'Transaction not found on the currently connected network.' })
      return
    }

    const trace = await provider.send('debug_traceTransaction', [txHash, { tracer: 'callTracer' }])
    const addressSet = new Set<string>()
    collectCallAddresses(trace, addressSet)

    const touched = (await Promise.all(
      Array.from(addressSet).map(async (addr): Promise<TraceProxyInfo | null> => {
        const proxyInfo = await lookupProxy(currentNetwork, addr)
        return proxyInfo ? { address: addr, hops: await resolveHops(proxyInfo, addr) } : null
      })
    )).filter((p): p is TraceProxyInfo => p !== null)

    const proxyKeys = new Set<string>()
    for (const p of touched) {
      proxyKeys.add(`${currentNetwork.rollupId}:${p.address}`.toLowerCase())
      p.hops.slice(0, -1).forEach((hop) => proxyKeys.add(`${hop.originalRollupId}:${hop.originalAddress}`.toLowerCase()))
    }

    const decodedError = trace.error ? (trace.revertReason || decodeEezRevertData(trace.output)) : null

    const result: TransactionTraceResult = {
      txHash,
      success: !trace.error,
      error: trace.error || null,
      decodedError,
      proxies: touched,
      proxyCount: proxyKeys.size
    }
    dispatch({ type: 'TRACE_SUCCESS', payload: result })
  } catch (e: any) {
    dispatch({ type: 'TRACE_ERROR', payload: e?.message || 'Failed to trace this transaction.' })
  } finally {
    providers.forEach((provider) => provider.destroy())
  }
}
