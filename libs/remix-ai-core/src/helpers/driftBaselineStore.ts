import { remixAILogger } from './logger'
import { ModelBaseline, hydrateBaselines, onBaselineChange } from './driftMonitor'

/**
 * Persists the per-model drift baselines in IndexedDB, so "this model got
 * slower" can be measured across sessions instead of resetting on reload.
 * One record per model label; writes are debounced because every answer turn
 * changes the record.
 */

const DB_NAME = 'remix-ai-drift'
const STORE = 'baselines'
const SAVE_DELAY_MS = 2000

let started = false

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: 'label' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function readAll(db: IDBDatabase): Promise<ModelBaseline[]> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll()
    request.onsuccess = () => resolve(request.result as ModelBaseline[])
    request.onerror = () => reject(request.error)
  })
}

/**
 * Loads stored baselines and keeps them saved. Idempotent; a missing or
 * blocked IndexedDB leaves the in-memory baselines working for the session.
 */
export async function startDriftBaselinePersistence(): Promise<void> {
  if (started || typeof indexedDB === 'undefined') return
  started = true

  try {
    const db = await openDb()
    hydrateBaselines(await readAll(db))

    const dirty = new Map<string, ModelBaseline>()
    let timer: ReturnType<typeof setTimeout> | null = null
    onBaselineChange((baseline) => {
      dirty.set(baseline.label, baseline)
      if (timer) return
      timer = setTimeout(() => {
        timer = null
        const store = db.transaction(STORE, 'readwrite').objectStore(STORE)
        for (const row of dirty.values()) store.put(row)
        dirty.clear()
      }, SAVE_DELAY_MS)
    })
  } catch (error) {
    remixAILogger.warn('[DriftMonitor] baseline persistence unavailable, keeping baselines in memory:', error)
  }
}
