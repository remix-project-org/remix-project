import { randomBytes, toQuantity } from 'ethers'
import { RpcError } from './types'

type BlockTag = bigint | 'latest' | 'pending'
type Log = { address: string; topics: string[]; [key: string]: any }
type Block = { hash: string; number: string; transactions: string[] }
interface Query {
  blockHash?: string
  fromBlock: BlockTag
  toBlock: BlockTag
  addresses: string[]
  topics: (string[] | null)[]
}
type Filter = { nextBlock: bigint } & ({ kind: 'blocks' } | { kind: 'logs'; query: Query; changes: Query })

const quantity = (value: unknown): value is string => typeof value === 'string' && /^0x(?:0|[1-9a-f][\da-f]*)$/i.test(value)
const hash = (value: unknown): value is string => typeof value === 'string' && /^0x[\da-f]{64}$/i.test(value)

function blockTag(value: unknown): BlockTag {
  if (value == null || value === 'latest' || value === 'safe' || value === 'finalized') return 'latest'
  if (value === 'earliest') return 0n
  if (value === 'pending') return 'pending'
  if (quantity(value) && BigInt(value) < (1n << 256n)) return BigInt(value)
  throw new RpcError('Invalid log filter block number or tag')
}

function normalize(input: unknown): Query {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RpcError('Expected a log filter object')
  const value = input as Record<string, unknown>
  if (Object.keys(value).some(key => !['blockHash', 'fromBlock', 'toBlock', 'address', 'topics'].includes(key))) throw new RpcError('Unknown log filter field')
  const fromBlock = blockTag(value.fromBlock)
  const toBlock = blockTag(value.toBlock)
  if (typeof fromBlock === 'bigint' && typeof toBlock === 'bigint' && fromBlock > toBlock) throw new RpcError('Invalid log filter block range')
  let blockHash: string
  if (value.blockHash != null) {
    if (!hash(value.blockHash)) throw new RpcError('Invalid log filter block hash')
    if (value.fromBlock != null || value.toBlock != null) throw new RpcError('blockHash cannot be combined with fromBlock or toBlock')
    blockHash = value.blockHash.toLowerCase()
  }
  const addresses = value.address == null ? [] : (Array.isArray(value.address) ? value.address : [value.address]).map(address => {
    if (typeof address !== 'string' || !/^0x[\da-f]{40}$/i.test(address)) throw new RpcError('Invalid log filter address')
    return address.toLowerCase()
  })
  if (value.topics != null && (!Array.isArray(value.topics) || value.topics.length > 4)) throw new RpcError('Expected up to four log filter topics')
  const topics = ((value.topics ?? []) as unknown[]).map(topic => {
    if (topic === null) return null
    const alternatives = Array.isArray(topic) ? topic : [topic]
    for (const item of alternatives) if (item !== null && !hash(item)) throw new RpcError('Invalid log filter topic')
    // Empty alternatives and null alternatives are wildcards for an existing topic position.
    return !alternatives.length || alternatives.includes(null) ? null : alternatives.map(item => (item as string).toLowerCase())
  })
  return { blockHash, fromBlock, toBlock, addresses, topics }
}

/** Polling cursors belong to one provider instance and are deliberately excluded from saved chain state. */
export class MonadFilters {
  private filters = new Map<string, Filter>()

  constructor(private blocks: () => Block[], private logs: (block: Block) => Log[]) {}

  private number(tag: BlockTag): bigint {
    return typeof tag === 'bigint' ? tag : BigInt(this.blocks().length - (tag === 'pending' ? 0 : 1))
  }

  private collect(query: Query, nextBlock = 0n): Log[] {
    let blocks = this.blocks()
    if (query.blockHash) {
      const block = blocks.find(block => block.hash.toLowerCase() === query.blockHash)
      if (!block) throw new RpcError('Unknown local block for log filter', -32001)
      blocks = [block]
    } else {
      const from = this.number(query.fromBlock)
      const to = this.number(query.toBlock)
      blocks = blocks.filter(block => BigInt(block.number) >= from && BigInt(block.number) <= to)
    }
    return blocks.filter(block => BigInt(block.number) >= nextBlock).flatMap(block => this.logs(block))
      .filter(log => (!query.addresses.length || query.addresses.includes(log.address.toLowerCase())) &&
        log.topics.length >= query.topics.length && query.topics.every((topics, index) => topics === null || topics.includes(log.topics[index].toLowerCase())))
      .map(log => ({ ...log, topics: [...log.topics]}))
  }

  getLogs(input: unknown) { return this.collect(normalize(input)) }

  newFilter(input: unknown): string {
    const query = normalize(input)
    if (query.blockHash) this.collect(query)
    // Resolve the lower tag once so a delayed poll still sees every intervening block.
    const changes = { ...query, fromBlock: this.number(query.fromBlock) }
    return this.add({ kind: 'logs', query, changes, nextBlock: BigInt(this.blocks().length) })
  }

  newBlockFilter(): string { return this.add({ kind: 'blocks', nextBlock: BigInt(this.blocks().length) }) }

  private add(filter: Filter): string {
    // Random IDs prevent a stale listener from addressing a new filter after a worker reset.
    let id: string
    do { id = toQuantity(randomBytes(16)) } while (this.filters.has(id))
    this.filters.set(id, filter)
    return id
  }

  private id(value: unknown): string {
    if (!quantity(value) || BigInt(value) >= (1n << 256n)) throw new RpcError('Invalid filter ID')
    return toQuantity(value)
  }

  private find(id: unknown): Filter {
    const filter = this.filters.get(this.id(id))
    if (!filter) throw new RpcError('Filter not found in this Monad VM session', -32000)
    return filter
  }

  getFilterChanges(id: unknown): (Log | string)[] {
    const filter = this.find(id)
    const result = filter.kind === 'blocks'
      ? this.blocks().filter(block => BigInt(block.number) >= filter.nextBlock).map(block => block.hash)
      : this.collect(filter.changes, filter.nextBlock)
    filter.nextBlock = BigInt(this.blocks().length)
    return result
  }

  getFilterLogs(id: unknown): Log[] {
    const filter = this.find(id)
    if (filter.kind !== 'logs') throw new RpcError('Expected a log filter ID', -32602)
    return this.collect(filter.query)
  }

  uninstallFilter(id: unknown): boolean { return this.filters.delete(this.id(id)) }
}
