/**
 * IndexedDB-based CheckpointSaver for LangGraph
 * Drop-in replacement for MemorySaver that persists state across browser refreshes.
 *
 * Storage layout (mirrors MemorySaver's in-memory structure):
 *   checkpoints store: { key: "<threadId>|<ns>|<cpId>", threadId, ns, cpId, checkpoint, metadata, parentCpId }
 *   writes store:      { key: "<outerKey>|<innerKey>", outerKey, innerKey, taskId, channel, value }
 */
import {
  BaseCheckpointSaver,
  Checkpoint,
  CheckpointTuple,
  copyCheckpoint,
  maxChannelVersion,
  WRITES_IDX_MAP,
  getCheckpointId,
} from '@langchain/langgraph-checkpoint'
import type {
  CheckpointMetadata,
  PendingWrite,
  CheckpointPendingWrite,
} from '@langchain/langgraph-checkpoint'
import type { RunnableConfig } from '@langchain/core/runnables'
import type { SerializerProtocol } from '@langchain/langgraph-checkpoint'

const DB_NAME = 'RemixDeepAgentCheckpoints'
const DB_VERSION = 1
const CHECKPOINTS_STORE = 'checkpoints'
const WRITES_STORE = 'writes'

// Key helpers (match MemorySaver's internal _generateKey / _parseKey)
function generateKey(threadId: string, ns: string, cpId: string): string {
  return `${threadId}|${ns}|${cpId}`
}

function parseKey(key: string): { threadId: string; ns: string; cpId: string } {
  const [threadId, ns, cpId] = key.split('|')
  return { threadId, ns, cpId }
}

/** Promise wrapper around IDBRequest */
function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/**
 * IndexedDB checkpoint saver — persistent replacement for MemorySaver.
 */
export class IndexedDBCheckpointSaver extends BaseCheckpointSaver {
  private db: IDBDatabase | null = null
  private initPromise: Promise<void> | null = null

  constructor(serde?: SerializerProtocol) {
    super(serde)
  }

  // ─── Database lifecycle ──────────────────────────────────────────

  private async ensureDb(): Promise<IDBDatabase> {
    if (this.db) return this.db
    if (!this.initPromise) {
      this.initPromise = this._openDb()
    }
    await this.initPromise
    return this.db!
  }

  private _openDb(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () =>
        reject(new Error(`[IndexedDBCheckpointSaver] Failed to open DB: ${request.error?.message}`))

      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result

        if (!db.objectStoreNames.contains(CHECKPOINTS_STORE)) {
          const cpStore = db.createObjectStore(CHECKPOINTS_STORE, { keyPath: 'key' })
          cpStore.createIndex('byThread', 'threadId', { unique: false })
        }

        if (!db.objectStoreNames.contains(WRITES_STORE)) {
          const wStore = db.createObjectStore(WRITES_STORE, { keyPath: 'key' })
          wStore.createIndex('byOuterKey', 'outerKey', { unique: false })
          wStore.createIndex('byThread', 'threadId', { unique: false })
        }
      }
    })
  }

  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
      this.initPromise = null
    }
  }

  // ─── Internal helpers ────────────────────────────────────────────

  private async _getCheckpoint(
    threadId: string,
    ns: string,
    cpId: string
  ): Promise<{ checkpoint: Uint8Array; metadata: Uint8Array; parentCpId: string | undefined } | undefined> {
    const db = await this.ensureDb()
    const tx = db.transaction(CHECKPOINTS_STORE, 'readonly')
    const store = tx.objectStore(CHECKPOINTS_STORE)
    const key = generateKey(threadId, ns, cpId)
    const result = await idbRequest(store.get(key))
    return result ?? undefined
  }

  private async _getLatestCheckpointId(threadId: string, ns: string): Promise<string | undefined> {
    const db = await this.ensureDb()
    const tx = db.transaction(CHECKPOINTS_STORE, 'readonly')
    const store = tx.objectStore(CHECKPOINTS_STORE)
    const index = store.index('byThread')
    const all: any[] = await idbRequest(index.getAll(threadId))
    const matching = all.filter(r => r.ns === ns)
    if (matching.length === 0) return undefined
    matching.sort((a, b) => (b.cpId as string).localeCompare(a.cpId as string))
    return matching[0].cpId
  }

  private async _getWrites(outerKey: string): Promise<Array<{ taskId: string; channel: string; value: Uint8Array }>> {
    const db = await this.ensureDb()
    const tx = db.transaction(WRITES_STORE, 'readonly')
    const store = tx.objectStore(WRITES_STORE)
    const index = store.index('byOuterKey')
    const all: any[] = await idbRequest(index.getAll(outerKey))
    return all
  }

  private async _buildTuple(
    threadId: string,
    ns: string,
    cpId: string,
    saved: { checkpoint: Uint8Array; metadata: Uint8Array; parentCpId: string | undefined },
    config?: RunnableConfig
  ): Promise<CheckpointTuple> {
    const deserializedCheckpoint = (await this.serde.loadsTyped('json', saved.checkpoint)) as Checkpoint
    const key = generateKey(threadId, ns, cpId)
    const rawWrites = await this._getWrites(key)
    const pendingWrites: CheckpointPendingWrite[] = await Promise.all(
      rawWrites.map(async (w) => [
        w.taskId,
        w.channel,
        await this.serde.loadsTyped('json', w.value),
      ] as CheckpointPendingWrite)
    )

    const tuple: CheckpointTuple = {
      config: config ?? {
        configurable: { thread_id: threadId, checkpoint_id: cpId, checkpoint_ns: ns },
      },
      checkpoint: deserializedCheckpoint,
      metadata: (await this.serde.loadsTyped('json', saved.metadata)) as CheckpointMetadata,
      pendingWrites,
    }
    if (saved.parentCpId !== undefined) {
      tuple.parentConfig = {
        configurable: { thread_id: threadId, checkpoint_ns: ns, checkpoint_id: saved.parentCpId },
      }
    }
    return tuple
  }

  // ─── BaseCheckpointSaver interface ───────────────────────────────

  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const threadId = config.configurable?.thread_id as string
    const ns = (config.configurable?.checkpoint_ns as string) ?? ''
    let cpId = getCheckpointId(config)

    if (cpId) {
      const saved = await this._getCheckpoint(threadId, ns, cpId)
      if (saved) return this._buildTuple(threadId, ns, cpId, saved, config)
    } else {
      cpId = await this._getLatestCheckpointId(threadId, ns)
      if (cpId) {
        const saved = await this._getCheckpoint(threadId, ns, cpId)
        if (saved) return this._buildTuple(threadId, ns, cpId, saved)
      }
    }
    return undefined
  }

  async *list(
    config: RunnableConfig,
    options?: { limit?: number; before?: RunnableConfig; filter?: Record<string, any> }
  ): AsyncGenerator<CheckpointTuple> {
    const { before, filter } = options ?? {}
    let limit = options?.limit
    const db = await this.ensureDb()

    // Collect all relevant checkpoints
    const tx = db.transaction(CHECKPOINTS_STORE, 'readonly')
    const store = tx.objectStore(CHECKPOINTS_STORE)
    const threadId = config.configurable?.thread_id as string | undefined
    const configNs = config.configurable?.checkpoint_ns as string | undefined

    let all: any[]
    if (threadId) {
      const index = store.index('byThread')
      all = await idbRequest(index.getAll(threadId))
    } else {
      all = await idbRequest(store.getAll())
    }

    // Filter by namespace
    if (configNs !== undefined) {
      all = all.filter(r => r.ns === configNs)
    }

    // Sort descending by checkpoint ID
    all.sort((a, b) => (b.cpId as string).localeCompare(a.cpId as string))

    for (const record of all) {
      const cpId = record.cpId as string
      if (before?.configurable?.checkpoint_id && cpId >= before.configurable.checkpoint_id) continue

      const metadata = (await this.serde.loadsTyped('json', record.metadata)) as Record<string, any>
      if (filter && !Object.entries(filter).every(([k, v]) => metadata[k] === v)) continue

      if (limit !== undefined) {
        if (limit <= 0) break
        limit -= 1
      }

      yield await this._buildTuple(record.threadId, record.ns, cpId, record)
    }
  }

  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata
  ): Promise<RunnableConfig> {
    const prepared = copyCheckpoint(checkpoint)
    const threadId = config.configurable?.thread_id as string
    const ns = (config.configurable?.checkpoint_ns as string) ?? ''
    if (!threadId) throw new Error('Missing thread_id in config')

    console.log('[DeepAgent-Checkpoint] put() called | threadId:', threadId, '| cpId:', checkpoint.id, '| ns:', JSON.stringify(ns))

    try {
      const [[, serializedCp], [, serializedMeta]] = await Promise.all([
        this.serde.dumpsTyped(prepared),
        this.serde.dumpsTyped(metadata),
      ])

      const db = await this.ensureDb()
      const tx = db.transaction(CHECKPOINTS_STORE, 'readwrite')
      const store = tx.objectStore(CHECKPOINTS_STORE)

      const key = generateKey(threadId, ns, checkpoint.id)
      await idbRequest(
        store.put({
          key,
          threadId,
          ns,
          cpId: checkpoint.id,
          checkpoint: serializedCp,
          metadata: serializedMeta,
          parentCpId: config.configurable?.checkpoint_id,
        })
      )
    } catch (err) {
      console.error('[DeepAgent-Checkpoint] put() FAILED:', err)
      throw err
    }

    return {
      configurable: {
        thread_id: threadId,
        checkpoint_ns: ns,
        checkpoint_id: checkpoint.id,
      },
    }
  }

  async putWrites(config: RunnableConfig, writes: PendingWrite[], taskId: string): Promise<void> {
    const threadId = config.configurable?.thread_id as string
    const ns = (config.configurable?.checkpoint_ns as string) ?? ''
    const cpId = config.configurable?.checkpoint_id as string
    if (!threadId) throw new Error('Missing thread_id')
    if (!cpId) throw new Error('Missing checkpoint_id')

    const outerKey = generateKey(threadId, ns, cpId)
    const db = await this.ensureDb()

    // Read existing writes for this outer key to avoid duplicates
    const existingWrites = await this._getWrites(outerKey)
    const existingKeys = new Set(existingWrites.map(w => `${outerKey}|${w.taskId},${w.channel}`))

    const tx = db.transaction(WRITES_STORE, 'readwrite')
    const store = tx.objectStore(WRITES_STORE)

    await Promise.all(
      writes.map(async ([channel, value], idx) => {
        const [, serializedValue] = await this.serde.dumpsTyped(value)
        const innerIdx = WRITES_IDX_MAP[channel as string] ?? idx
        const innerKey = `${taskId},${innerIdx}`
        const fullKey = `${outerKey}|${innerKey}`

        // Skip if positive index and already exists (match MemorySaver behavior)
        if (innerIdx >= 0 && existingKeys.has(fullKey)) return

        await idbRequest(
          store.put({
            key: fullKey,
            outerKey,
            innerKey,
            threadId,
            taskId,
            channel: channel as string,
            value: serializedValue,
          })
        )
      })
    )
  }

  async deleteThread(threadId: string): Promise<void> {
    const db = await this.ensureDb()

    // Delete checkpoints
    const cpTx = db.transaction(CHECKPOINTS_STORE, 'readwrite')
    const cpStore = cpTx.objectStore(CHECKPOINTS_STORE)
    const cpIndex = cpStore.index('byThread')
    const cpRecords: any[] = await idbRequest(cpIndex.getAll(threadId))
    for (const record of cpRecords) {
      cpStore.delete(record.key)
    }

    // Delete writes
    const wTx = db.transaction(WRITES_STORE, 'readwrite')
    const wStore = wTx.objectStore(WRITES_STORE)
    const wIndex = wStore.index('byThread')
    const wRecords: any[] = await idbRequest(wIndex.getAll(threadId))
    for (const record of wRecords) {
      wStore.delete(record.key)
    }
  }
}
