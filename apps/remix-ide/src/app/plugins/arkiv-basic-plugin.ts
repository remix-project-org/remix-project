import { Plugin } from '@remixproject/engine'
import { endpointUrls } from '@remix-endpoints-helper'

const PROXY_BASE_URL = 'https://tokens.staging.remix.live/endpoints/arkiv' // 'endpointUrls.arkivProxy

// ─── Wire types (JSON-serializable) ─────────────────────────────────────────

export type ExpiresInput =
  | { seconds: number }
  | { minutes: number }
  | { hours: number }
  | { days: number }
  | { weeks: number }
  | { months: number }
  | { blocks: number }
  | { atBlock: string } // decimal bigint string
  | 'permanent'

export interface CreateEntityParams {
  payload: string
  contentType: string
  attributes?: Record<string, unknown>
  expires: ExpiresInput
}

export interface PatchEntityParams {
  entityKey: string
  set?: {
    contentType?: string
    payload?: string
    attributes?: Record<string, unknown>
  }
  unset?: string[]
}

export interface DeleteEntityParams {
  entityKey: string
}

export interface ExtendEntityParams {
  entityKey: string
  expires: ExpiresInput
}

export interface EntityWriteResult {
  entityKey: string
  txHash: string
  expiresAt?: string
}

export interface SerializedEntity {
  key?: string
  owner?: string
  creator?: string
  createdAt?: string
  updatedAt?: string
  expiresAt?: string
  contentType?: string
  payload?: string
  text?: string
  attributes?: Record<string, unknown>
}

export interface QueryParams {
  query: string
  limit?: number
  offset?: number
}

export interface ArkivQueryResult {
  entities: SerializedEntity[]
  blockNumber: string
  count?: string
}

// ─── Profile ────────────────────────────────────────────────────────────────

const profile = {
  name: 'arkivBasic',
  displayName: 'Arkiv (Basic Account)',
  description: 'Arkiv Network plugin — operations proxied server-side',
  methods: [
    'unlock', 'lock', 'isUnlocked',
    'createEntity', 'getEntity', 'patchEntity', 'deleteEntity', 'extendEntity',
    'query', 'getEntityCount',
  ],
  events: ['unlocked', 'locked'],
  version: '1.0.0',
}

// ─── Plugin ──────────────────────────────────────────────────────────────────

export class ArkivBasicPlugin extends Plugin {
  private _ready = false

  constructor() {
    super(profile)
  }

  onDeactivation() {
    this.lock()
  }

  private async _fetch<T>(path: string, options?: RequestInit): Promise<T> {
    if (!this._ready) throw new Error('Arkiv: not unlocked — call unlock() first')
    const res = await fetch(`${PROXY_BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error ?? `Arkiv proxy error ${res.status}`)
    return body as T
  }

  // ─── Session management ─────────────────────────────────────────────────

  async unlock(): Promise<void> {
    if (this._ready) return
    this._ready = true
    this.emit('unlocked')
  }

  isUnlocked(): boolean {
    return this._ready
  }

  lock(): void {
    this._ready = false
    this.emit('locked')
  }

  // ─── Write operations ────────────────────────────────────────────────────

  async createEntity(params: CreateEntityParams): Promise<EntityWriteResult> {
    return this._fetch('/create-entity', {
      method: 'POST',
      body: JSON.stringify(params),
    })
  }

  async patchEntity(params: PatchEntityParams): Promise<EntityWriteResult> {
    return this._fetch('/patch-entity', {
      method: 'POST',
      body: JSON.stringify(params),
    })
  }

  async deleteEntity(params: DeleteEntityParams): Promise<EntityWriteResult> {
    return this._fetch('/delete-entity', {
      method: 'POST',
      body: JSON.stringify(params),
    })
  }

  async extendEntity(params: ExtendEntityParams): Promise<EntityWriteResult> {
    return this._fetch('/extend-entity', {
      method: 'POST',
      body: JSON.stringify(params),
    })
  }

  // ─── Read operations ─────────────────────────────────────────────────────

  async getEntity(entityKey: string): Promise<SerializedEntity> {
    return this._fetch(`/entity/${encodeURIComponent(entityKey)}`)
  }

  async query(params: QueryParams): Promise<ArkivQueryResult> {
    return this._fetch('/query', {
      method: 'POST',
      body: JSON.stringify(params),
    })
  }

  async getEntityCount(): Promise<number> {
    const { count } = await this._fetch<{ count: string }>('/entity-count')
    return Number(count)
  }
}
