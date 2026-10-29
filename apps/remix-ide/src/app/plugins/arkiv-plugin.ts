import { Plugin } from '@remixproject/engine'
import {
  createPublicClient,
  createWalletClient,
  ExpirationTime,
  type Expiry,
  type AttributeInputs,
  type CreateEntityParameters,
  type PatchEntityParameters,
  type ExtendEntityParameters,
  type FullEntity,
  bool as boolAttr,
  i32,
  u64,
  u256,
  dec,
  str,
  addr as addrAttr,
  key as keyAttr,
  bytes32,
} from '@arkiv-network/sdk'
import { tiramisu } from '@arkiv-network/sdk/chains'
import { toAccount } from 'viem/accounts'
import type { Hex, SignableMessage, TransactionSerializable } from 'viem'
import { http } from 'viem'

// ─── Wire types (JSON-serializable) ─────────────────────────────────────────

export type ExpiresInput =
  | { seconds: number }
  | { minutes: number }
  | { hours: number }
  | { days: number }
  | { weeks: number }
  | { months: number }
  | { blocks: number }
  | { atBlock: string }   // decimal bigint string
  | 'permanent'

/** JSON-serializable attribute value for plugin API. bigint types use decimal strings. */
export type AttrInput =
  | string                                      // → str
  | number                                      // → i32
  | boolean                                     // → bool
  | { type: 'str';     value: string }
  | { type: 'i32';     value: number }
  | { type: 'bool';    value: boolean }
  | { type: 'u64';     value: string }          // decimal string for bigint
  | { type: 'u256';    value: string }          // decimal string for bigint
  | { type: 'dec';     value: string }          // fixed-point e.g. "3.14"
  | { type: 'bytes32'; value: string }          // 0x hex (32 bytes)
  | { type: 'addr';    value: string }          // 0x checksummed address
  | { type: 'key';     value: string }          // 0x bytes32 entity key

export interface CreateEntityParams {
  payload: string                               // 0x-prefixed hex
  contentType: string
  attributes?: Record<string, AttrInput>
  expires: ExpiresInput
}

export interface PatchEntityParams {
  entityKey: string
  set?: Record<string, AttrInput>
  unset?: string[]
  payload?: string                              // 0x-prefixed hex (replaces payload)
}

export interface DeleteEntityParams {
  entityKey: string
}

export interface ExtendEntityParams {
  entityKey: string
  expires: ExpiresInput
}

/** JSON-serializable result for write operations */
export interface EntityWriteResult {
  entityKey: string
  txHash: string
  expiresAt?: string                            // decimal block number
}

/** JSON-serializable entity (from getEntity / query) */
export interface SerializedEntity {
  key?: string
  owner?: string
  creator?: string
  createdAt?: string                            // decimal block number
  updatedAt?: string                            // decimal block number
  expiresAt?: string                            // decimal block number
  contentType?: string
  payload?: string                              // 0x-prefixed hex
  text?: string                                 // decoded when contentType starts with text/
  attributes?: Record<string, { type: string; value: unknown }>
}

export interface QueryParams {
  query: string
  limit?: number
  cursor?: string
}

export interface ArkivQueryResult {
  entities: SerializedEntity[]
  cursor?: string
  blockNumber: string                           // decimal
}

// ─── Profile ────────────────────────────────────────────────────────────────

const profile = {
  name: 'arkiv',
  displayName: 'Arkiv',
  description: 'Store and retrieve wallet-owned, queryable data on the Arkiv Network',
  methods: [
    'unlock', 'lock', 'isUnlocked', 'getAddress',
    'createEntity', 'getEntity', 'patchEntity', 'deleteEntity', 'extendEntity',
    'query', 'getEntityCount',
  ],
  events: ['unlocked', 'locked'],
  version: '1.0.0',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex
  if (h.length % 2 !== 0) throw new Error(`Arkiv: invalid hex string length: ${hex}`)
  const arr = new Uint8Array(h.length / 2)
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16)
  return arr
}

function bytesToHex(bytes: Uint8Array): string {
  return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

function toExpiry(input: ExpiresInput): Expiry {
  if (input === 'permanent')    return ExpirationTime.permanent()
  if ('seconds' in input)       return ExpirationTime.fromSeconds(input.seconds)
  if ('minutes' in input)       return ExpirationTime.fromMinutes(input.minutes)
  if ('hours'   in input)       return ExpirationTime.fromHours(input.hours)
  if ('days'    in input)       return ExpirationTime.fromDays(input.days)
  if ('weeks'   in input)       return ExpirationTime.fromWeeks(input.weeks)
  if ('months'  in input)       return ExpirationTime.fromMonths(input.months)
  if ('blocks'  in input)       return ExpirationTime.fromBlocks(input.blocks)
  if ('atBlock' in input)       return ExpirationTime.atBlock(BigInt(input.atBlock))
  throw new Error('Arkiv: unrecognised expires input')
}

function toAttrSdkValue(v: AttrInput): AttributeInputs[string] {
  if (typeof v === 'string')  return v
  if (typeof v === 'number')  return v
  if (typeof v === 'boolean') return v
  switch (v.type) {
    case 'str':     return str(v.value)
    case 'i32':     return i32(v.value)
    case 'bool':    return boolAttr(v.value)
    case 'u64':     return u64(BigInt(v.value))
    case 'u256':    return u256(BigInt(v.value))
    case 'dec':     return dec(v.value)
    case 'bytes32': return bytes32(v.value as Hex)
    case 'addr':    return addrAttr(v.value)
    case 'key':     return keyAttr(v.value as Hex)
    default:        throw new Error(`Arkiv: unsupported attribute type: ${(v as { type: string }).type}`)
  }
}

function resolveAttrs(attrs: Record<string, AttrInput>): AttributeInputs {
  const out: Record<string, AttributeInputs[string]> = {}
  for (const [k, v] of Object.entries(attrs)) out[k] = toAttrSdkValue(v)
  return out as AttributeInputs
}

function serializeAttrValue(v: { type: string; value: unknown }): { type: string; value: unknown } {
  if (v.value instanceof Uint8Array) return { type: v.type, value: bytesToHex(v.value) }
  if (typeof v.value === 'bigint')   return { type: v.type, value: v.value.toString() }
  return { type: v.type, value: v.value }
}

function serializeEntity(entity: FullEntity): SerializedEntity {
  const out: SerializedEntity = {}
  if (entity.key        !== undefined) out.key        = entity.key
  if (entity.owner      !== undefined) out.owner      = entity.owner
  if (entity.creator    !== undefined) out.creator    = entity.creator
  if (entity.createdAt  !== undefined) out.createdAt  = entity.createdAt.toString()
  if (entity.updatedAt  !== undefined) out.updatedAt  = entity.updatedAt.toString()
  if (entity.expiresAt  !== undefined) out.expiresAt  = entity.expiresAt.toString()
  if (entity.contentType !== undefined) out.contentType = entity.contentType
  if (entity.payload !== undefined) {
    out.payload = bytesToHex(entity.payload)
    if (entity.contentType?.startsWith('text/')) {
      try { out.text = new TextDecoder().decode(entity.payload) } catch { /* non-UTF-8 */ }
    }
  }
  if (entity.attributes !== undefined) {
    const serialized: Record<string, { type: string; value: unknown }> = {}
    for (const [k, v] of Object.entries(entity.attributes)) {
      serialized[k] = serializeAttrValue(v as { type: string; value: unknown })
    }
    out.attributes = serialized
  }
  return out
}

// ─── Plugin ──────────────────────────────────────────────────────────────────

export class ArkivPlugin extends Plugin {
  private _address: string | null = null
  // Typed as any internally: complex SDK generics don't survive the toAccount proxy
  private _walletClient: any = null
  private _publicClient: any = null

  constructor() {
    super(profile)
  }

  async onActivation() {
    this.on('walletKeyring', 'locked', (purpose: string) => {
      if (purpose === 'arkiv') this._clearState()
    })
  }

  onDeactivation() {
    this.off('walletKeyring', 'locked')
    this._clearState()
  }

  private _clearState() {
    this._address = null
    this._walletClient = null
    this._publicClient = null
    this.emit('locked')
  }

  private _requireClients() {
    if (!this._walletClient || !this._publicClient || !this._address) {
      throw new Error('Arkiv: not unlocked — call unlock() first')
    }
    return { wallet: this._walletClient, pub: this._publicClient, address: this._address }
  }

  // ─── Session management ─────────────────────────────────────────────────

  async unlock(params?: { passphrase?: string; verifyDeterminism?: boolean }): Promise<{ address: string }> {
    if (this._walletClient && this._address) return { address: this._address }

    const { address } = await (this as any).call('walletKeyring', 'unlock', {
      purpose: 'arkiv',
      ...params,
    }) as { address: string }

    this._address = address

    const plugin = this
    const account = toAccount({
      address: address as Hex,
      async signMessage({ message }: { message: SignableMessage }): Promise<Hex> {
        let msg: string
        if (typeof message === 'string') {
          msg = message
        } else {
          const raw = (message as { raw: Uint8Array | Hex }).raw
          msg = raw instanceof Uint8Array
            ? new TextDecoder().decode(raw)
            : raw
        }
        return (plugin as any).call('walletKeyring', 'signMessage', 'arkiv', msg)
      },
      async signTransaction(tx: TransactionSerializable): Promise<Hex> {
        return (plugin as any).call('walletKeyring', 'signTransaction', 'arkiv', {
          to:                   tx.to,
          from:                 address,
          value:                tx.value?.toString(),
          data:                 'data' in tx ? tx.data : undefined,
          gasLimit:             'gas' in tx ? (tx as any).gas?.toString() : undefined,
          maxFeePerGas:         'maxFeePerGas' in tx ? (tx as any).maxFeePerGas?.toString() : undefined,
          maxPriorityFeePerGas: 'maxPriorityFeePerGas' in tx ? (tx as any).maxPriorityFeePerGas?.toString() : undefined,
          gasPrice:             'gasPrice' in tx ? (tx as any).gasPrice?.toString() : undefined,
          nonce:                tx.nonce,
          chainId:              tx.chainId,
        })
      },
      signTypedData: async (typedData: any): Promise<Hex> => {
        const { domain, types, message, primaryType } = typedData
        return (plugin as any).call('walletKeyring', 'signTypedData', 'arkiv', {
          domain, types, message, primaryType,
        })
      },
    } as any)

    this._walletClient = createWalletClient({ chain: tiramisu, transport: http(), account })
    this._publicClient = createPublicClient({ chain: tiramisu, transport: http() })

    this.emit('unlocked', address)
    return { address }
  }

  isUnlocked(): boolean {
    return this._walletClient !== null
  }

  getAddress(): string {
    if (!this._address) throw new Error('Arkiv: not unlocked — call unlock() first')
    return this._address
  }

  async lock(): Promise<void> {
    await (this as any).call('walletKeyring', 'lock', 'arkiv')
    this._clearState()
  }

  // ─── Write operations ────────────────────────────────────────────────────

  async createEntity(params: CreateEntityParams): Promise<EntityWriteResult> {
    const { wallet } = this._requireClients()

    const args: CreateEntityParameters = {
      payload:     hexToBytes(params.payload),
      contentType: params.contentType,
      expires:     toExpiry(params.expires),
      ...(params.attributes ? { attributes: resolveAttrs(params.attributes) } : {}),
    }

    const { entityKey, txHash, expiresAt } = await wallet.createEntity(args)
    const result: EntityWriteResult = { entityKey, txHash }
    if (expiresAt !== undefined) result.expiresAt = expiresAt.toString()
    return result
  }

  async patchEntity(params: PatchEntityParams): Promise<EntityWriteResult> {
    const { wallet } = this._requireClients()

    const args: PatchEntityParameters = {
      entityKey: params.entityKey as Hex,
      ...(params.set    ? { set: resolveAttrs(params.set) }           : {}),
      ...(params.unset  ? { unset: params.unset }                     : {}),
      ...(params.payload ? { payload: hexToBytes(params.payload) }    : {}),
    }

    const { entityKey, txHash } = await wallet.patchEntity(args)
    return { entityKey, txHash }
  }

  async deleteEntity(params: DeleteEntityParams): Promise<EntityWriteResult> {
    const { wallet } = this._requireClients()
    const { entityKey, txHash } = await wallet.deleteEntity({ entityKey: params.entityKey as Hex })
    return { entityKey, txHash }
  }

  async extendEntity(params: ExtendEntityParams): Promise<EntityWriteResult> {
    const { wallet } = this._requireClients()

    const args: ExtendEntityParameters = {
      entityKey: params.entityKey as Hex,
      expires:   toExpiry(params.expires),
    }

    const { entityKey, txHash, expiresAt } = await wallet.extendEntity(args)
    const result: EntityWriteResult = { entityKey, txHash }
    if (expiresAt !== undefined) result.expiresAt = expiresAt.toString()
    return result
  }

  // ─── Read operations ─────────────────────────────────────────────────────

  async getEntity(entityKey: string): Promise<SerializedEntity> {
    const { pub } = this._requireClients()
    const entity = await pub.getEntity(entityKey as Hex)
    return serializeEntity(entity)
  }

  async query(params: QueryParams): Promise<ArkivQueryResult> {
    const { pub } = this._requireClients()
    const result = await pub.query(params.query, {
      ...(params.limit  ? { limit: params.limit }   : {}),
      ...(params.cursor ? { cursor: params.cursor }  : {}),
    })
    return {
      entities:    result.entities.map((e: unknown) => serializeEntity(e as FullEntity)),
      cursor:      result.cursor ?? undefined,
      blockNumber: result.blockNumber.toString(),
    }
  }

  async getEntityCount(): Promise<number> {
    const { pub } = this._requireClients()
    return pub.getEntityCount()
  }
}
