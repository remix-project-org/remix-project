import React from 'react'
import { JsonRpcProvider, Contract, Interface, InterfaceAbi, isAddress, isHexString, hexlify, randomBytes, toUtf8String } from 'ethers'
// eslint-disable-next-line @nrwl/nx/enforce-module-boundaries
import type { EezPlugin } from 'apps/remix-ide/src/app/udapp/udappEez'
import { EEZ_ABI, EEZ_COMPOSER_PROBE_ABI, EEZ_ROLLUP_ID_ABI } from '../abi'
import { EEZ_COMPOSER_PROBE_ADDRESS, EEZ_COMPOSER_RPC_URLS } from '../constants'
import { Actions, EezComposerInfo, EezComposerNetwork, EezNetworkEntry, ResolutionRow, ResolvedProxyInfo, TraceLeg, TraceLegRole, TraceProxyInfo, TraceSettlement, TransactionTraceResult } from '../types'

const NOT_EEZ_NETWORK = 'The currently connected network is not part of an EEZ network.'
export const EEZ_SETTINGS_KEY = 'eez-networks'

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
  const composerUrls = Object.fromEntries(Object.entries(EEZ_COMPOSER_RPC_URLS).map(([chainId, { rpcUrl }]) => [chainId, rpcUrl]))
  return { ...(await loadSettingsRpcUrls(plugin)), ...composerUrls }
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
      label: EEZ_COMPOSER_RPC_URLS[chainId]?.label,
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

export async function isWalletOnComposerRpc(plugin: EezPlugin, chainId: string): Promise<boolean> {
  const providerName = await plugin.call('blockchain', 'getProvider').catch((): null => null)
  const iface = new Interface(EEZ_COMPOSER_PROBE_ABI)
  const nonce = hexlify(randomBytes(32))
  try {
    const raw: string = await plugin.call('blockchain', 'sendRpc', 'eth_call', [{ to: EEZ_COMPOSER_PROBE_ADDRESS, data: iface.encodeFunctionData('composerInfo', [nonce]) }, 'latest'])
    if (!raw || raw === '0x') {
      console.warn(`EEZ: the RPC of ${providerName} did not answer the composer probe, so it is treated as a non-composer RPC`)
      return false
    }
    const [, , echoedNonce, servedChainId, infoJson] = iface.decodeFunctionResult('composerInfo', raw)
    if (echoedNonce !== nonce) {
      console.warn(`EEZ: the RPC of ${providerName} returned an unexpected composer probe response`, raw)
      return false
    }
    const info: EezComposerInfo = JSON.parse(toUtf8String(infoJson))
    if (servedChainId.toString() === chainId && composerSupportsChain(info, chainId)) return true
    console.warn(`EEZ: the RPC of ${providerName} is a composer for chain ${servedChainId} (${JSON.stringify(info?.supportedNetworks)}), not chain ${chainId}`)
    return false
  } catch (e) {
    console.warn(`EEZ: the composer probe through ${providerName} failed, so it is treated as a non-composer RPC`, e)
    return false
  }
}

export async function switchWalletToComposerRpc(plugin: EezPlugin, dispatch: React.Dispatch<Actions>, chainId: string) {
  const composer = EEZ_COMPOSER_RPC_URLS[chainId]
  if (!composer?.nativeCurrency) return
  dispatch({ type: 'START_WALLET_RPC_SWITCH' })
  try {
    await plugin.call('blockchain', 'sendRpc', 'wallet_addEthereumChain', [addEthereumChainParams(chainId)])
    const isComposer = await plugin.checkWalletRpc()
    if (!isComposer) showWalletRpcSwitchFailed(plugin, `Your wallet is still not using ${composer.rpcUrl}. Select it as the RPC for ${composer.label} in your wallet's network settings.`)
  } catch (e) {
    showWalletRpcSwitchFailed(plugin, e?.message || 'Failed to update the wallet RPC')
  } finally {
    dispatch({ type: 'WALLET_RPC_SWITCH_DONE' })
  }
}

function addEthereumChainParams(chainId: string) {
  const composer = EEZ_COMPOSER_RPC_URLS[chainId]
  return { chainId: '0x' + Number(chainId).toString(16), chainName: composer.label, rpcUrls: [composer.rpcUrl], nativeCurrency: composer.nativeCurrency }
}

export async function switchWalletChain(plugin: EezPlugin, chainId: string) {
  try {
    await plugin.call('blockchain', 'sendRpc', 'wallet_switchEthereumChain', [{ chainId: '0x' + Number(chainId).toString(16) }])
  } catch (e) {
    const isUnknownChain = e?.error?.code === 4902 || e?.info?.error?.code === 4902 || /4902|unrecognized chain/i.test(e?.message || '')
    if (!isUnknownChain || !EEZ_COMPOSER_RPC_URLS[chainId]?.nativeCurrency) throw e
    await plugin.call('blockchain', 'sendRpc', 'wallet_addEthereumChain', [addEthereumChainParams(chainId)])
  }
}

function showWalletRpcSwitchFailed(plugin: EezPlugin, message: string) {
  plugin.call('notification', 'modal', {
    id: 'eezWalletRpcSwitchFailed',
    title: 'Switching to the EEZ RPC failed',
    message,
    okLabel: 'OK'
  })
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

export async function assertOriginDeployed(network: EezNetworkEntry, address: string) {
  const { provider } = contractFor(network)
  try {
    const code = await provider.getCode(address)
    if (code === '0x') throw new Error(`No contract is deployed at ${address} on ${network.label}. Check the origin network and address.`)
  } finally {
    provider.destroy()
  }
}

function rollupIdOf(network: EezNetworkEntry): bigint {
  if (!network.rollupId) throw new Error(`The rollup id of ${network.label} is unknown.`)
  return BigInt(network.rollupId)
}

export async function findCrossChainProxy(originNetwork: EezNetworkEntry, destinationNetwork: EezNetworkEntry, originAddress: string): Promise<{ proxyAddress: string; isDeployed: boolean }> {
  const { provider, contract } = contractFor(destinationNetwork)
  try {
    const proxyAddress: string = await contract.computeCrossChainProxyAddress(originAddress, rollupIdOf(originNetwork))
    const code = await provider.getCode(proxyAddress)
    return { proxyAddress, isDeployed: code !== '0x' }
  } finally {
    provider.destroy()
  }
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

  try {
    await assertOriginDeployed(originNetwork, originAddress)
  } catch (e) {
    dispatch({ type: 'PREVIEW_ERROR', payload: e?.message || 'Failed to check the origin contract' })
    return
  }

  try {
    const { proxyAddress, isDeployed } = await findCrossChainProxy(originNetwork, destinationNetwork, originAddress)
    dispatch({ type: 'PREVIEW_SUCCESS', payload: { previewAddress: proxyAddress, previewIsDeployed: isDeployed } })
  } catch (e) {
    dispatch({ type: 'PREVIEW_ERROR', payload: e?.message || 'Failed to preview proxy address' })
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
    await assertOriginDeployed(originNetwork, originAddress)

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

const MAX_EXECUTION_LEGS = 10

function isL1Network(network: EezNetworkEntry) {
  return network.rollupId === '0'
}

function isL2Network(network: EezNetworkEntry) {
  return network.rollupId !== '' && network.rollupId !== '0'
}

function receiptAddresses(receipt: any): string[] {
  const addresses = new Set<string>()
  if (typeof receipt?.to === 'string') addresses.add(receipt.to.toLowerCase())
  for (const log of receipt?.logs || []) {
    if (typeof log?.address === 'string') addresses.add(log.address.toLowerCase())
  }
  return Array.from(addresses)
}

function receiptSucceeded(receipt: any): boolean {
  return Number(receipt?.status) === 1
}

async function findReceipt(provider: JsonRpcProvider, txHash: string): Promise<{ receipt: any } | { status: any }> {
  const receipt = await provider.send('eth_getTransactionReceipt', [txHash])
  if (receipt) return { receipt }

  const status = await provider.send('eez_getCrossChainTransaction', [txHash]).catch((): null => null)
  const blockHash: string | undefined = status?.ownership?.canonical?.hash
  if (blockHash) {
    const receipts: any[] = await provider.send('eth_getBlockReceipts', [blockHash]).catch((): null => null)
    const match = receipts?.find((r) => r?.transactionHash?.toLowerCase() === txHash.toLowerCase())
    if (match) return { receipt: match }
  }
  return { status }
}

function describeComposerStatus(status: any): string {
  if (!status) return 'Transaction not found on the currently connected network.'
  const ownership = status.ownership || {}
  if (status.lifecycle === 'terminal' || ownership.state === 'terminal') {
    const reason = ownership.reason ? ` (${ownership.reason})` : ''
    const detail = ownership.rejection?.error ? `: ${ownership.rejection.error}` : '.'
    return `The composer rejected this transaction${reason}${detail}`
  }
  return `This transaction is still pending in the composer (${ownership.state || status.lifecycle || 'unknown state'}). Trace it again once it is mined.`
}

async function findEezExecutions(
  l2Networks: EezNetworkEntry[],
  providerOf: (network: EezNetworkEntry) => JsonRpcProvider,
  blockHashes: string[]
): Promise<{ network: EezNetworkEntry; receipt: any }[]> {
  const found: { network: EezNetworkEntry; receipt: any }[] = []
  for (const network of l2Networks) {
    const eezAddress = network.eezContractAddress.toLowerCase()
    const blocks: any[][] = await Promise.all(blockHashes.map((hash) => providerOf(network).send('eth_getBlockReceipts', [hash]).catch((): null => null)))
    for (const receipts of blocks) {
      for (const receipt of receipts || []) {
        if (receipt?.to?.toLowerCase() === eezAddress) found.push({ network, receipt })
      }
    }
  }
  return found.sort((a, b) => Number(a.receipt.blockNumber) - Number(b.receipt.blockNumber))
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

  const resolveHops = async (network: EezNetworkEntry, first: ResolvedProxyInfo, address: string): Promise<ResolvedProxyInfo[]> => {
    const seen = new Set([`${network.rollupId}:${address}`.toLowerCase()])
    const follow = async (hop: ResolvedProxyInfo): Promise<ResolvedProxyInfo[]> => {
      const key = `${hop.originalRollupId}:${hop.originalAddress}`.toLowerCase()
      if (seen.has(key)) return [hop]
      seen.add(key)
      const hopNetwork = networks.find((n) => String(n.rollupId) === hop.originalRollupId)
      if (!hopNetwork?.rpcUrl || !hopNetwork.eezContractAddress) return [hop]
      const next = await lookupProxy(hopNetwork, hop.originalAddress)
      return next ? [hop, ...await follow(next)] : [hop]
    }
    return follow(first)
  }

  const toLeg = (network: EezNetworkEntry, role: TraceLegRole, hash: string, receipt: any): { network: EezNetworkEntry; leg: TraceLeg; receipt: any } => ({
    network,
    receipt,
    leg: {
      role,
      networkLabel: network.label,
      txHash: hash,
      blockNumber: receipt ? Number(receipt.blockNumber) : null,
      success: receipt ? receiptSucceeded(receipt) : null,
      error: receipt ? null : 'Receipt unavailable',
      decodedError: null
    }
  })

  try {
    const provider = providerOf(currentNetwork)
    const found = await findReceipt(provider, txHash)
    if ('status' in found) {
      dispatch({ type: 'TRACE_ERROR', payload: describeComposerStatus(found.status) })
      return
    }
    const originReceipt = found.receipt
    const traced = [toLeg(currentNetwork, 'origin', txHash, originReceipt)]
    const isL2Origin = isL2Network(currentNetwork)
    let settlement: TraceSettlement | null = null
    let correlationError: string | null = null
    let omittedLegs = 0
    try {
      if (isL2Origin) {
        const l1Network = networks.find(isL1Network)
        const record = await provider.send('eez_getSettlementByL2Block', [{ blockHash: originReceipt.blockHash }])
        if (record?.canonicalL2 && l1Network) {
          settlement = { l1TransactionHash: record.l1TransactionHash, l1BlockNumber: Number(record.l1BlockNumber), l2Finalized: !!record.l2Finalized }
          const receipt = await providerOf(l1Network).send('eth_getTransactionReceipt', [settlement.l1TransactionHash]).catch((): null => null)
          traced.push(toLeg(l1Network, 'settlement', settlement.l1TransactionHash, receipt))
        }
      } else if (isL1Network(currentNetwork)) {
        const records: any[] = ((await provider.send('eez_getSettledL2RangesByL1Block', [{ blockHash: originReceipt.blockHash }])) || []).filter((r: any) => r?.canonicalL2)
        const postings = Array.from(new Set<string>(records.map((r) => r.l1TransactionHash).filter((hash) => hash && hash.toLowerCase() !== txHash.toLowerCase())))
        for (const hash of postings) {
          const receipt = await provider.send('eth_getTransactionReceipt', [hash]).catch((): null => null)
          traced.push(toLeg(currentNetwork, 'settlement', hash, receipt))
        }
        const l2BlockHashes = Array.from(new Set<string>(records.flatMap((r) => (r.l2Blocks || []).map((b: any) => b.hash))))
        const executions = await findEezExecutions(networks.filter(isL2Network), providerOf, l2BlockHashes)
        omittedLegs = Math.max(0, executions.length - MAX_EXECUTION_LEGS)
        for (const { network, receipt } of executions.slice(0, MAX_EXECUTION_LEGS)) {
          traced.push(toLeg(network, 'execution', receipt.transactionHash, receipt))
        }
      }
    } catch (e) {
      correlationError = e?.message || 'Failed to look up the settlement of this transaction.'
    }

    const proxySeen = new Set<string>()
    const lookups: Promise<{ rollupId: string; proxy: TraceProxyInfo } | null>[] = []
    for (const { network, receipt } of traced) {
      for (const addr of receiptAddresses(receipt)) {
        const key = `${network.rollupId}:${addr}`
        if (proxySeen.has(key)) continue
        proxySeen.add(key)
        lookups.push(lookupProxy(network, addr).then(async (proxyInfo) => (
          proxyInfo ? { rollupId: network.rollupId, proxy: { address: addr, networkLabel: network.label, hops: await resolveHops(network, proxyInfo, addr) } } : null
        )))
      }
    }
    const resolved = (await Promise.all(lookups)).filter((p) => p !== null)

    const proxyKeys = new Set<string>()
    for (const { rollupId, proxy } of resolved) {
      proxyKeys.add(`${rollupId}:${proxy.address}`.toLowerCase())
      proxy.hops.slice(0, -1).forEach((hop) => proxyKeys.add(`${hop.originalRollupId}:${hop.originalAddress}`.toLowerCase()))
    }

    const result: TransactionTraceResult = {
      txHash,
      success: receiptSucceeded(originReceipt),
      error: null,
      decodedError: null,
      proxies: resolved.map(({ proxy }) => proxy),
      proxyCount: proxyKeys.size,
      legs: traced.map(({ leg }) => leg),
      settlement,
      isL2Origin,
      omittedLegs,
      correlationError
    }
    dispatch({ type: 'TRACE_SUCCESS', payload: result })
  } catch (e: any) {
    dispatch({ type: 'TRACE_ERROR', payload: e?.message || 'Failed to trace this transaction.' })
  } finally {
    providers.forEach((provider) => provider.destroy())
  }
}
