import { AbiCoder, ErrorFragment, FunctionFragment, Interface, InterfaceAbi, LogDescription, ParamType, Result, dataSlice } from 'ethers'
import { EEZ_TRACE_ABI } from '../abi'
import { ResolvedProxyInfo, TraceCallStatus, TraceCheck, TraceCrossChainCall, TraceLegRole, TraceTokenTransfer } from '../types'

const traceInterface = new Interface(EEZ_TRACE_ABI)
const coder = AbiCoder.defaultAbiCoder()
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const ZERO_ADDRESS = '0x' + '0'.repeat(40)

export interface AnalyzedLeg {
  role: TraceLegRole
  networkLabel: string
  rollupId: string
  managerAddress: string
  txHash: string
  receipt: any
}

interface ManagerEvent {
  leg: AnalyzedLeg
  event: LogDescription
}

function same(a?: string | null, b?: string | null) {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase()
}

function managerEvents(leg: AnalyzedLeg): ManagerEvent[] {
  if (Number(leg.receipt?.status) !== 1) return []
  const events: ManagerEvent[] = []
  for (const log of leg.receipt.logs || []) {
    if (log.removed || !same(log.address, leg.managerAddress)) continue
    try {
      const event = traceInterface.parseLog(log)
      if (event) events.push({ leg, event })
    } catch (e) {
      // Not one of the events this analysis reads.
    }
  }
  return events
}

export function requestedCallData(leg: AnalyzedLeg): string[] {
  return managerEvents(leg).filter(({ event }) => event.name === 'CrossChainCallExecuted').map(({ event }) => String(event.args.callData))
}

export function requestedProxies(leg: AnalyzedLeg): string[] {
  return managerEvents(leg).filter(({ event }) => event.name === 'CrossChainCallExecuted').map(({ event }) => String(event.args.proxy).toLowerCase())
}

function formatValue(value: any): string {
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'string') return value.length > 66 ? `${value.slice(0, 18)}…(${(value.length - 2) / 2} bytes)` : value
  if (Array.isArray(value)) return `[${value.map(formatValue).join(', ')}]`
  return String(value)
}

function formatParams(params: readonly ParamType[], values: Result): string {
  return params.map((param, i) => `${param.name ? `${param.name}: ` : ''}${formatValue(values[i])}`).join(', ')
}

export class CalldataDecoder {
  private functions = new Map<string, FunctionFragment[]>()
  private lookedUp = new WeakSet<FunctionFragment>()
  private errors = new Map<string, ErrorFragment>()

  constructor(abis: InterfaceAbi[]) {
    for (const abi of abis) {
      try {
        const iface = new Interface(abi)
        iface.forEachFunction((fn) => this.addFunction(fn))
        iface.forEachError((err) => { if (!this.errors.has(err.selector)) this.errors.set(err.selector, err) })
      } catch (e) {
        // Skip ABIs ethers cannot parse.
      }
    }
  }

  private addFunction(fn: FunctionFragment, lookedUp = false) {
    const candidates = this.functions.get(fn.selector) || []
    if (candidates.some((known) => known.format('sighash') === fn.format('sighash'))) return
    this.functions.set(fn.selector, [...candidates, fn])
    if (lookedUp) this.lookedUp.add(fn)
  }

  addSignatures(signatures: string[]) {
    for (const signature of signatures) {
      try {
        this.addFunction(FunctionFragment.from(`function ${signature}`), true)
      } catch (e) {
        // Skip signatures ethers cannot parse.
      }
    }
  }

  unknownSelectors(calldata: string[]): string[] {
    const selectors = calldata.filter((data) => data && data.length >= 10).map((data) => data.slice(0, 10).toLowerCase())
    return [...new Set(selectors)].filter((selector) => !this.functions.has(selector))
  }

  private decoded(data: string): { fn: FunctionFragment; args: Result } | null {
    if (!data || data.length < 10) return null
    for (const fn of this.functions.get(data.slice(0, 10).toLowerCase()) || []) {
      try {
        const encoded = dataSlice(data, 4)
        const args = coder.decode(fn.inputs, encoded)

        if (this.lookedUp.has(fn) && coder.encode(fn.inputs, args).toLowerCase() !== encoded.toLowerCase()) continue
        return { fn, args }
      } catch (e) {
        // Try the next signature with this selector.
      }
    }
    return null
  }

  private fragment(data: string): FunctionFragment | null {
    return this.decoded(data)?.fn || null
  }

  describeCall(data: string): string | null {
    if (!data || data === '0x') return 'plain value transfer'
    const match = this.decoded(data)
    return match ? `${match.fn.name}(${formatParams(match.fn.inputs, match.args)})` : null
  }

  describeResult(data: string, success: boolean, returnData: string): string | null {
    if (success) {
      const fn = this.fragment(data)
      if (!fn || !fn.outputs.length || !returnData || returnData === '0x') return null
      try {
        return `returned ${formatParams(fn.outputs, coder.decode(fn.outputs, returnData))}`
      } catch (e) {
        return null
      }
    }
    return `reverted: ${this.describeRevert(returnData)}`
  }

  describeRevert(returnData: string): string {
    if (!returnData || returnData === '0x') return 'no reason given'
    const selector = returnData.slice(0, 10).toLowerCase()
    try {
      if (selector === '0x08c379a0') return `Error("${coder.decode(['string'], dataSlice(returnData, 4))[0]}")`
      if (selector === '0x4e487b71') return `Panic(0x${coder.decode(['uint256'], dataSlice(returnData, 4))[0].toString(16)})`
      const err = this.errors.get(selector)
      if (err) return `${err.name}(${formatParams(err.inputs, coder.decode(err.inputs, dataSlice(returnData, 4)))})`
    } catch (e) {
      // Malformed revert data stays raw.
    }
    return `custom error ${selector}`
  }
}

interface PreparedResult {
  success: boolean
  returnData: string
}

function preparedResults(events: ManagerEvent[]): Map<string, PreparedResult[]> {
  const results = new Map<string, PreparedResult[]>()
  const add = (hash: string, success: boolean, returnData: string) => {
    const key = hash.toLowerCase()
    if (!results.has(key)) results.set(key, [])
    results.get(key).push({ success, returnData })
  }
  for (const { event } of events) {
    if (event.name !== 'ExecutionTableLoaded') continue
    const [entries, staticEntries] = event.args
    for (const entry of [...entries, ...staticEntries]) add(entry.proxyEntryHash, entry.success, entry.returnData)
  }
  return results
}

export interface CallAnalysisContext {
  networkLabelOf: (rollupId: string) => string
  proxyTargets: Map<string, ResolvedProxyInfo>
  l1ExecutionTxHash: string | null
  l1RollupId: string
  decoder: CalldataDecoder
}

export function analyzeCrossChainCalls(legs: AnalyzedLeg[], context: CallAnalysisContext): TraceCrossChainCall[] {
  const events = legs.flatMap(managerEvents)
  const prepared = preparedResults(events)
  const deliveries = new Map<string, ManagerEvent[]>()
  for (const item of events) {
    if (item.event.name !== 'IncomingCrossChainCallExecuted') continue
    const key = item.event.args.crossChainCallHash.toLowerCase()
    if (!deliveries.has(key)) deliveries.set(key, [])
    deliveries.get(key).push(item)
  }
  const requestsIn = (leg: AnalyzedLeg) => events.filter((item) => item.leg === leg && item.event.name === 'CrossChainCallExecuted')
  const calls: TraceCrossChainCall[] = []
  const visit = (request: ManagerEvent, depth: number) => {
    const { leg, event } = request
    const hash: string = event.args.crossChainCallHash.toLowerCase()
    const delivery = deliveries.get(hash)?.shift() || null
    const result = prepared.get(hash)?.shift() || null
    const proxy = context.proxyTargets.get(`${leg.rollupId}:${String(event.args.proxy).toLowerCase()}`) || null
    const targetRollupId = delivery ? delivery.leg.rollupId : proxy?.originalRollupId ?? null
    const callData: string = event.args.callData
    const status: TraceCallStatus = delivery ? 'delivered' : result ? 'prepared' : 'not-observed'
    calls.push({
      hash,
      depth,
      sourceNetworkLabel: leg.networkLabel,
      sourceAddress: event.args.sourceAddress,
      proxyAddress: event.args.proxy,
      targetNetworkLabel: targetRollupId === null ? 'unknown network' : context.networkLabelOf(targetRollupId),
      targetAddress: delivery ? delivery.event.args.destination : proxy?.originalAddress ?? null,
      value: event.args.value.toString(),
      isStatic: delivery ? delivery.event.args.isStatic : null,
      functionLabel: context.decoder.describeCall(callData),
      requestTxHash: leg.txHash,
      executionTxHash: delivery ? delivery.leg.txHash : result && targetRollupId === context.l1RollupId ? context.l1ExecutionTxHash : null,
      status,
      success: result ? result.success : null,
      resultLabel: result ? context.decoder.describeResult(callData, result.success, result.returnData) : null
    })
    if (delivery) for (const nested of requestsIn(delivery.leg)) visit(nested, depth + 1)
  }

  for (const leg of legs.filter((l) => l.role === 'origin')) {
    for (const request of requestsIn(leg)) visit(request, 0)
  }
  return calls
}

export function tokenTransfers(legs: AnalyzedLeg[]): { leg: AnalyzedLeg; token: string; from: string; to: string; amount: bigint; kind: TraceTokenTransfer['kind'] }[] {
  const transfers = []
  for (const leg of legs) {
    if (Number(leg.receipt?.status) !== 1) continue
    for (const log of leg.receipt.logs || []) {
      if (log.removed || log.topics?.length !== 3 || log.topics[0].toLowerCase() !== TRANSFER_TOPIC || !/^0x[0-9a-f]{64}$/i.test(log.data || '')) continue
      const from = '0x' + log.topics[1].slice(-40).toLowerCase()
      const to = '0x' + log.topics[2].slice(-40).toLowerCase()
      transfers.push({ leg, token: log.address.toLowerCase(), from, to, amount: BigInt(log.data), kind: from === ZERO_ADDRESS ? 'mint' : to === ZERO_ADDRESS ? 'burn' : 'transfer' })
    }
  }
  return transfers
}

export function linkChecks(legs: AnalyzedLeg[], { isL2Origin, l2RollupIds }: { isL2Origin: boolean; l2RollupIds: string[] }): TraceCheck[] {
  const origin = legs.find((l) => l.role === 'origin')
  if (!origin?.receipt) return []
  if (isL2Origin) {
    const loader = legs.find((l) => l.role === 'table-load')
    if (!loader?.receipt) return []
    const loaded = managerEvents(loader).some(({ event }) => event.name === 'ExecutionTableLoaded')
    const precedes = same(loader.receipt.blockHash, origin.receipt.blockHash) && Number(loader.receipt.transactionIndex) < Number(origin.receipt.transactionIndex)
    return [{ label: 'The execution table was loaded just before this transaction, in the same block', ok: loaded && precedes }]
  }
  const deliveries = legs.filter((l) => l.role === 'delivery')
  if (!deliveries.length || deliveries.some((l) => !l.receipt)) return []
  const consumed = managerEvents(origin)
    .filter(({ event }) => event.name === 'ExecutionConsumed' && event.args.length === 3 && l2RollupIds.includes(event.args.rollupId.toString()))
    .map(({ event }) => event.args.crossChainCallHash.toLowerCase())
  const delivered = deliveries.flatMap((leg) => managerEvents(leg)
    .filter(({ event }) => event.name === 'IncomingCrossChainCallExecuted')
    .map(({ event }) => event.args.crossChainCallHash.toLowerCase()))
  return [{ label: `The L2 deliveries match the ${consumed.length} cross-chain ${consumed.length === 1 ? 'call' : 'calls'} this transaction consumed, in order`, ok: consumed.join() === delivered.join() }]
}
