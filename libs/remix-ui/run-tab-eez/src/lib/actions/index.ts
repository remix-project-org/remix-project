import React from 'react'
import { JsonRpcProvider, Contract, Interface, InterfaceAbi, isAddress, isHexString, hexlify, randomBytes, toUtf8String, formatUnits } from 'ethers'
// eslint-disable-next-line @nrwl/nx/enforce-module-boundaries
import type { EezPlugin } from 'apps/remix-ide/src/app/udapp/udappEez'
import { EEZ_ABI, EEZ_COMPOSER_PROBE_ABI, EEZ_ROLLUP_ID_ABI } from '../abi'
import { EEZ_COMPOSER_PROBE_ADDRESS, EEZ_COMPOSER_RPC_URLS } from '../constants'
import { Actions, EezComposerInfo, EezComposerNetwork, EezNetworkEntry, ResolutionRow, ResolvedProxyInfo, TraceCheck, TraceComposerRecord, TraceLeg, TraceLegRole, TraceSettlement, TraceTokenTransfer, TransactionTraceResult } from '../types'
import { AnalyzedLeg, CalldataDecoder, analyzeCrossChainCalls, linkChecks, requestedCallData, requestedProxies, tokenTransfers } from './trace-analysis'

const NOT_EEZ_NETWORK = 'The currently connected network is not part of an EEZ network.'
export const EEZ_SETTINGS_KEY = 'eez-networks'

function parseChainId(network: EezComposerNetwork): string | null {
  if (network === undefined || network === null) return null
  return String(network)
}

async function loadSettingsNetworks(plugin: EezPlugin): Promise<{ urls: Record<string, string>; labels: Record<string, string> }> {
  const urls: Record<string, string> = {}
  const labels: Record<string, string> = {}
  try {
    const raw = await plugin.call('config', 'getAppParameter', EEZ_SETTINGS_KEY)
    const entries: { chainId?: string | number; rpcUrl?: string; label?: string }[] = raw ? JSON.parse(raw) : []

    for (const entry of entries) {
      const chainId = String(entry?.chainId ?? '').trim()
      const rpcUrl = (entry?.rpcUrl || '').trim()
      const label = (entry?.label || '').trim()
      if (chainId && rpcUrl) urls[chainId] = rpcUrl
      if (chainId && label) labels[chainId] = label
    }
  } catch (e) {
    console.warn('EEZ: unable to read the EEZ networks configured in Settings', e)
  }
  return { urls, labels }
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
  const settings = await loadSettingsNetworks(plugin)
  const composerUrls = Object.fromEntries(Object.entries(EEZ_COMPOSER_RPC_URLS).map(([chainId, { rpcUrl }]) => [chainId, rpcUrl]))
  const rpcUrls: Record<string, string> = { ...settings.urls, ...composerUrls }
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
      label: EEZ_COMPOSER_RPC_URLS[chainId]?.label || settings.labels[chainId] || key || `Chain ${chainId}`,
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

export async function isWalletOnComposerRpc(plugin: EezPlugin, chainId: string): Promise<boolean | null> {
  if (!EEZ_COMPOSER_RPC_URLS[chainId]) return null
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
    if (!isComposer) dispatch({ type: 'WALLET_RPC_ADDED' })
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

function isL2Network(network: EezNetworkEntry) {
  return network.rollupId !== '' && network.rollupId !== '0'
}

function receiptSucceeded(receipt: any): boolean {
  return Number(receipt?.status) === 1
}

async function findReceipt(provider: JsonRpcProvider, txHash: string, status: any): Promise<{ receipt: any } | { status: any }> {
  const receipt = await provider.send('eth_getTransactionReceipt', [txHash])
  if (receipt) return { receipt }

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

interface LinkedReference {
  network: EezNetworkEntry
  hash: string
  role: TraceLegRole
}

function linkedReferences(record: any, txHash: string, networks: EezNetworkEntry[]): LinkedReference[] | null {
  const links = record?.transactions
  if (!links?.complete || record.hash?.toLowerCase() !== txHash.toLowerCase()) return null
  const reference = (ref: any, role: TraceLegRole): LinkedReference => {
    const network = isHexString(ref?.hash, 32) && networks.find((n) => BigInt(n.chainId) === BigInt(ref.chainId))
    if (!network) throw new Error(`The composer linked a transaction on chain ${ref?.chainId}, which is not a known EEZ network.`)
    return { network, hash: ref.hash, role }
  }
  if (record.direction === 'inbound') {
    return [reference(links.postBatch, 'batch-post'), ...(links.l2 || []).map((ref: any) => reference(ref, 'delivery'))]
  }
  const loaders = (links.l2 || []).filter((ref: any) => ref?.hash?.toLowerCase() !== txHash.toLowerCase())
  return [...loaders.map((ref: any) => reference(ref, 'table-load')), reference(links.l1, 'l1-execution')]
}

function composerRecord(record: any): TraceComposerRecord | null {
  if (!record) return null
  const canonical = record.ownership?.canonical
  return {
    lifecycle: record.lifecycle ?? null,
    reason: record.ownership?.reason ?? null,
    canonicalL1Block: canonical?.number != null ? Number(canonical.number) : null
  }
}

async function settlementOfL2Block(provider: JsonRpcProvider, blockHash: string): Promise<TraceSettlement | null> {
  const record = await provider.send('eez_getSettlementByL2Block', [{ blockHash }])
  return record?.canonicalL2 ? { l1TransactionHash: record.l1TransactionHash, l1BlockNumber: Number(record.l1BlockNumber), l2Finalized: !!record.l2Finalized } : null
}

async function compiledCalldataDecoder(plugin: EezPlugin): Promise<CalldataDecoder> {
  const abis: InterfaceAbi[] = []
  try {
    const contractsByFile = await plugin.call('compilerArtefacts', 'getAllContractDatas')
    for (const contracts of Object.values(contractsByFile || {})) {
      for (const contract of Object.values(contracts as Record<string, any>)) if (contract?.abi) abis.push(contract.abi)
    }
  } catch (e) {
    console.warn('EEZ: compiled contracts unavailable, cross-chain calldata stays undecoded', e)
  }
  return new CalldataDecoder(abis)
}

const SIGNATURE_LOOKUP_URL = 'https://api.4byte.sourcify.dev/signature-database/v1/lookup'

async function lookupFunctionSignatures(selectors: string[]): Promise<string[]> {
  if (!selectors.length) return []
  try {
    const response = await fetch(`${SIGNATURE_LOOKUP_URL}?function=${selectors.join(',')}&filter=true`, { signal: AbortSignal.timeout(5000) })
    if (!response.ok) return []
    const body = await response.json()
    return Object.values(body?.result?.function || {}).flatMap((matches: any) => (matches || []).map((match: any) => match?.name).filter(Boolean))
  } catch (e) {
    return []
  }
}

const MAX_TOKEN_TRANSFERS = 20
const TOKEN_METADATA_ABI = ['function symbol() view returns (string)', 'function decimals() view returns (uint8)']

async function describeTokenTransfers(transfers: ReturnType<typeof tokenTransfers>, networkOf: (leg: AnalyzedLeg) => EezNetworkEntry, providerOf: (network: EezNetworkEntry) => JsonRpcProvider): Promise<TraceTokenTransfer[]> {
  const metadata = new Map<string, Promise<{ symbol: string | null; decimals: number | null }>>()
  const metadataOf = (network: EezNetworkEntry, token: string) => {
    const key = `${network.chainId}:${token}`
    if (!metadata.has(key)) {
      const contract = new Contract(token, TOKEN_METADATA_ABI, providerOf(network))
      metadata.set(key, Promise.all([
        contract.symbol().then((s: string) => (s && s.length <= 32 ? s : null)).catch((): null => null),
        contract.decimals().then((d: bigint) => Number(d)).catch((): null => null)
      ]).then(([symbol, decimals]) => ({ symbol, decimals })))
    }
    return metadata.get(key)
  }
  return Promise.all(transfers.slice(0, MAX_TOKEN_TRANSFERS).map(async (t) => {
    const { symbol, decimals } = await metadataOf(networkOf(t.leg), t.token)
    return {
      networkLabel: t.leg.networkLabel,
      txHash: t.leg.txHash,
      token: t.token,
      symbol,
      amount: decimals === null ? `${t.amount} (raw units)` : formatUnits(t.amount, decimals),
      from: t.from,
      to: t.to,
      kind: t.kind
    }
  }))
}

const TRACE_LINK_POLL_INTERVAL_MS = 5000
const TRACE_LINK_POLL_TIMEOUT_MS = 10 * 60 * 1000
let traceRun = 0

export function stopTracePolling() {
  traceRun++
}

function pendingRolesOf(record: any, isL2Origin: boolean): TraceLegRole[] {
  if (!record || record.transactions?.complete || record.lifecycle === 'terminal' && record.ownership?.rejection) return []
  return isL2Origin ? ['table-load', 'l1-execution'] : ['batch-post', 'delivery']
}

export async function traceTransactionByHash(
  plugin: EezPlugin,
  dispatch: React.Dispatch<Actions>,
  networks: EezNetworkEntry[],
  txHash: string
) {
  const run = ++traceRun
  const traced = await runTrace(plugin, dispatch, networks, txHash, false)

  if (traced?.result.pendingRoles.length) pollTraceLinks(plugin, dispatch, networks, txHash, traced.network, run)
}

async function pollTraceLinks(plugin: EezPlugin, dispatch: React.Dispatch<Actions>, networks: EezNetworkEntry[], txHash: string, network: EezNetworkEntry, run: number) {
  const deadline = Date.now() + TRACE_LINK_POLL_TIMEOUT_MS
  while (run === traceRun) {
    await new Promise((resolve) => setTimeout(resolve, TRACE_LINK_POLL_INTERVAL_MS))
    if (run !== traceRun) return
    if (Date.now() > deadline) {
      dispatch({ type: 'TRACE_LINKS_TIMEOUT', payload: txHash })
      return
    }
    let record: any = null
    try {
      const { provider } = contractFor(network)
      try {
        record = await provider.send('eez_getCrossChainTransaction', [txHash])
      } finally {
        provider.destroy()
      }
    } catch (e) {
      continue // Transient RPC failure: keep waiting.
    }
    if (!record?.transactions?.complete && record?.lifecycle !== 'terminal') continue
    const traced = await runTrace(plugin, dispatch, networks, txHash, true)
    if (run !== traceRun || !traced) continue
    dispatch({ type: 'TRACE_LINKS_UPDATED', payload: traced.result })
    if (!traced.result.pendingRoles.length) return
  }
}

async function runTrace(
  plugin: EezPlugin,
  dispatch: React.Dispatch<Actions>,
  networks: EezNetworkEntry[],
  txHash: string,
  silent: boolean
): Promise<{ result: TransactionTraceResult; network: EezNetworkEntry } | null> {
  const fail = (message: string): null => {
    if (!silent) dispatch({ type: 'TRACE_ERROR', payload: message })
    return null
  }
  if (!isHexString(txHash, 32)) return fail('Enter a valid transaction hash')
  if (networks.length === 0) return fail(NOT_EEZ_NETWORK)

  if (!silent) dispatch({ type: 'START_TRACE' })

  const currentChainId = await getCurrentChainId(plugin)
  const currentNetwork = findByChainId(networks, currentChainId)
  if (!currentNetwork) return fail(NOT_EEZ_NETWORK)

  const providers = new Map<string, JsonRpcProvider>()
  const providerOf = (network: EezNetworkEntry) => {
    if (!providers.has(network.id)) providers.set(network.id, contractFor(network).provider)
    return providers.get(network.id)
  }
  const managerFor = (network: EezNetworkEntry) => new Contract(network.eezContractAddress, EEZ_ABI, providerOf(network))
  const toLeg = (network: EezNetworkEntry, role: TraceLegRole, hash: string, receipt: any): { network: EezNetworkEntry; leg: TraceLeg; receipt: any } => ({
    network,
    receipt,
    leg: {
      role,
      networkLabel: network.label,
      txHash: hash,
      blockNumber: receipt ? Number(receipt.blockNumber) : null,
      success: receipt ? receiptSucceeded(receipt) : null,
      gasUsed: receipt?.gasUsed != null ? BigInt(receipt.gasUsed).toString() : null,
      error: receipt ? null : 'Receipt unavailable',
      decodedError: null
    }
  })

  try {
    const provider = providerOf(currentNetwork)
    const record = await provider.send('eez_getCrossChainTransaction', [txHash]).catch((): null => null)
    const found = await findReceipt(provider, txHash, record)
    if ('status' in found) return fail(describeComposerStatus(found.status))
    const originReceipt = found.receipt
    const traced = [toLeg(currentNetwork, 'origin', txHash, originReceipt)]
    const isL2Origin = isL2Network(currentNetwork)
    const checks: TraceCheck[] = []
    let settlement: TraceSettlement | null = null
    let correlationError: string | null = null
    let references: LinkedReference[] | null = null
    try {
      references = linkedReferences(record, txHash, networks)
    } catch (e) {
      checks.push({ label: `The composer's transaction links were not usable: ${e.message}`, ok: false })
    }
    if (references) {
      const receipts = await Promise.all(references.map((ref) => providerOf(ref.network).send('eth_getTransactionReceipt', [ref.hash]).catch((): null => null)))
      references.forEach((ref, i) => traced.push(toLeg(ref.network, ref.role, ref.hash, receipts[i])))
      if (isL2Origin) {
        try {
          settlement = await settlementOfL2Block(provider, originReceipt.blockHash)
        } catch (e) {
          correlationError = e?.message || 'Failed to look up the settlement of this transaction.'
        }
      }
    }

    const legNetworks = new Map<AnalyzedLeg, EezNetworkEntry>()
    const analyzed: AnalyzedLeg[] = traced.map(({ network, leg, receipt }) => {
      const item: AnalyzedLeg = { role: leg.role, networkLabel: network.label, rollupId: network.rollupId, managerAddress: network.eezContractAddress, txHash: leg.txHash, receipt }
      legNetworks.set(item, network)
      return item
    })

    const proxyTargets = new Map<string, ResolvedProxyInfo>()
    await Promise.all(analyzed.filter((leg) => leg.role === 'origin' || leg.role === 'delivery').flatMap((leg) => (
      [...new Set(requestedProxies(leg))].map(async (addr) => {
        const target = await managerFor(legNetworks.get(leg)).authorizedProxies(addr).then((info) => resolveProxyInfo(networks, info)).catch((): null => null)
        if (target) proxyTargets.set(`${leg.rollupId}:${addr}`, target)
      })
    )))

    const decoder = await compiledCalldataDecoder(plugin)
    const requestedCalls = analyzed.filter((leg) => leg.role === 'origin' || leg.role === 'delivery').flatMap(requestedCallData)
    decoder.addSignatures(await lookupFunctionSignatures(decoder.unknownSelectors(requestedCalls)))

    const l1Execution = isL2Origin ? references?.find((ref) => ref.role === 'l1-execution')?.hash : txHash
    const calls = analyzeCrossChainCalls(analyzed, {
      networkLabelOf: (rollupId) => networks.find((n) => n.rollupId === rollupId)?.label || `rollup ${rollupId}`,
      proxyTargets,
      l1ExecutionTxHash: l1Execution || null,
      l1RollupId: '0',
      decoder
    })

    const ownLegs = analyzed.filter((leg) => ['origin', 'delivery', 'table-load'].includes(leg.role))
    const transfers = await describeTokenTransfers(tokenTransfers(ownLegs), (leg) => legNetworks.get(leg), providerOf)

    if (references) {
      checks.push(...linkChecks(analyzed, { isL2Origin, l2RollupIds: networks.filter(isL2Network).map((n) => n.rollupId) }))
      const canonical = record.ownership?.canonical
      const l1Leg = traced.find(({ leg }) => leg.role === (isL2Origin ? 'l1-execution' : 'origin'))
      if (canonical?.hash && l1Leg?.receipt) {
        checks.push({ label: `The composer's L1 inclusion matches block #${Number(l1Leg.receipt.blockNumber)}`, ok: canonical.hash.toLowerCase() === l1Leg.receipt.blockHash?.toLowerCase() })
      }
    }

    const result: TransactionTraceResult = {
      txHash,
      success: receiptSucceeded(originReceipt),
      error: null,
      decodedError: null,
      legs: traced.map(({ leg }) => leg),
      settlement,
      isL2Origin,
      correlationError,
      linked: !!references,
      composer: composerRecord(record),
      calls,
      tokenTransfers: transfers,
      checks,
      pendingRoles: references ? [] : pendingRolesOf(record, isL2Origin),
      pendingTimedOut: false
    }
    if (!silent) dispatch({ type: 'TRACE_SUCCESS', payload: result })
    return { result, network: currentNetwork }
  } catch (e: any) {
    return fail(e?.message || 'Failed to trace this transaction.')
  } finally {
    providers.forEach((provider) => provider.destroy())
  }
}
