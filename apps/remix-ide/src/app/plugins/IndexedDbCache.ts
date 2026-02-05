import { Plugin } from '@remixproject/engine'

export interface CacheEntry<T = any> {
  key: string
  data: T
  timestamp: number
  namespace: string
  expiry?: number
}

export interface CacheStats {
  count: number
  totalSize: number
  namespaces: string[]
}

export interface CacheOptions {
  maxAgeInMs?: number
  namespace?: string
}

const profile = {
  name: 'indexedDbCache',
  displayName: 'IndexedDB Cache',
  description: 'Generic IndexedDB caching service for Remix IDE plugins',
  methods: [
    'set',
    'get',
    'remove',
    'clear',
    'clearNamespace',
    'clearExpired',
    'getStats',
    'getAllKeys',
    'exists',
    'setWithTTL'
  ],
  events: ['cacheReady', 'cacheError']
}

export class IndexedDbCachePlugin extends Plugin {
  private db: IDBDatabase | null = null
  private dbIsReady = false
  private readonly dbName = 'RemixPluginCache'
  private readonly dbVersion = 1
  private readonly storeName = 'cache'
  private readonly disabled = true

  constructor() {
    super(profile)
    this.initializeDatabase()
  }

  private async initializeDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion)

      request.onerror = () => {
        console.error('IndexedDB Cache: Failed to open database')
        this.emit('cacheError', 'Failed to initialize database')
        reject(new Error('Failed to open IndexedDB'))
      }

      request.onupgradeneeded = (event) => {
        console.log('IndexedDB Cache: Upgrading database')
        this.db = (event.target as IDBOpenDBRequest).result

        if (!this.db.objectStoreNames.contains(this.storeName)) {
          const store = this.db.createObjectStore(this.storeName, { keyPath: 'key' })
          store.createIndex('namespace', 'namespace', { unique: false })
          store.createIndex('timestamp', 'timestamp', { unique: false })
          store.createIndex('expiry', 'expiry', { unique: false })
        }
      }

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result
        this.dbIsReady = true
        console.log('IndexedDB Cache: Database ready')
        this.emit('cacheReady')
        resolve()
      }
    })
  }

  private ensureReady(): void {
    if (!this.dbIsReady || !this.db) {
      throw new Error('Cache is not ready. Wait for cacheReady event.')
    }
  }

  private createTransaction(mode: IDBTransactionMode = 'readonly'): IDBTransaction {
    this.ensureReady()
    return this.db!.transaction([this.storeName], mode)
  }

  private getObjectStore(mode: IDBTransactionMode = 'readonly'): IDBObjectStore {
    return this.createTransaction(mode).objectStore(this.storeName)
  }

  /**
   * Store data in the cache
   */
  async set<T>(key: string, data: T, options: CacheOptions = {}): Promise<void> {
    if (this.disabled) return
    const namespace = options.namespace || 'default'
    const cacheKey = `${namespace}:${key}`

    const entry: CacheEntry<T> = {
      key: cacheKey,
      data,
      timestamp: Date.now(),
      namespace,
      expiry: options.maxAgeInMs ? Date.now() + options.maxAgeInMs : undefined
    }

    return new Promise((resolve, reject) => {
      try {
        const store = this.getObjectStore('readwrite')
        const request = store.put(entry)

        request.onsuccess = () => resolve()
        request.onerror = () => reject(new Error(`Failed to cache data for key: ${cacheKey}`))
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * Store data with Time-To-Live (TTL) in milliseconds
   */
  async setWithTTL<T>(key: string, data: T, ttlMs: number, namespace = 'default'): Promise<void> {
    return this.set(key, data, { namespace, maxAgeInMs: ttlMs })
  }

  /**
   * Retrieve data from the cache
   */
  async get<T>(key: string, namespace = 'default'): Promise<T | null> {
    if (this.disabled) return null
    const cacheKey = `${namespace}:${key}`

    return new Promise((resolve, reject) => {
      try {
        const store = this.getObjectStore('readonly')
        const request = store.get(cacheKey)

        request.onsuccess = () => {
          const result = request.result as CacheEntry<T>
          if (!result) {
            resolve(null)
            return
          }

          // Check if entry has expired
          if (result.expiry && Date.now() > result.expiry) {
            // Remove expired entry asynchronously
            this.remove(key, namespace).catch(console.error)
            resolve(null)
            return
          }

          resolve(result.data)
        }

        request.onerror = () => reject(new Error(`Failed to retrieve data for key: ${cacheKey}`))
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * Check if a key exists in the cache
   */
  async exists(key: string, namespace = 'default'): Promise<boolean> {
    if (this.disabled) return false
    const cacheKey = `${namespace}:${key}`

    return new Promise((resolve, reject) => {
      try {
        const store = this.getObjectStore('readonly')
        const request = store.getKey(cacheKey)

        request.onsuccess = () => {
          resolve(request.result !== undefined)
        }

        request.onerror = () => reject(new Error(`Failed to check existence for key: ${cacheKey}`))
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * Remove a specific entry from the cache
   */
  async remove(key: string, namespace = 'default'): Promise<void> {
    if (this.disabled) return
    const cacheKey = `${namespace}:${key}`

    return new Promise((resolve, reject) => {
      try {
        const store = this.getObjectStore('readwrite')
        const request = store.delete(cacheKey)

        request.onsuccess = () => resolve()
        request.onerror = () => reject(new Error(`Failed to remove data for key: ${cacheKey}`))
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * Clear all entries in a specific namespace
   */
  async clearNamespace(namespace: string): Promise<number> {
    if (this.disabled) return 0
    return new Promise((resolve, reject) => {
      try {
        const store = this.getObjectStore('readwrite')
        const index = store.index('namespace')
        const request = index.openCursor(IDBKeyRange.only(namespace))
        let deletedCount = 0

        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result
          if (cursor) {
            cursor.delete()
            deletedCount++
            cursor.continue()
          } else {
            resolve(deletedCount)
          }
        }

        request.onerror = () => reject(new Error(`Failed to clear namespace: ${namespace}`))
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    if (this.disabled) return
    return new Promise((resolve, reject) => {
      try {
        const store = this.getObjectStore('readwrite')
        const request = store.clear()

        request.onsuccess = () => resolve()
        request.onerror = () => reject(new Error('Failed to clear cache'))
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * Remove expired entries
   */
  async clearExpired(): Promise<number> {
    if (this.disabled) return 0
    const now = Date.now()
    return new Promise((resolve, reject) => {
      try {
        const store = this.getObjectStore('readwrite')
        const index = store.index('expiry')
        const request = index.openCursor(IDBKeyRange.upperBound(now))
        let deletedCount = 0

        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result
          if (cursor) {
            const entry = cursor.value as CacheEntry
            if (entry.expiry && entry.expiry <= now) {
              cursor.delete()
              deletedCount++
            }
            cursor.continue()
          } else {
            resolve(deletedCount)
          }
        }

        request.onerror = () => reject(new Error('Failed to clear expired entries'))
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * Get all keys in a namespace
   */
  async getAllKeys(namespace = 'default'): Promise<string[]> {
    if (this.disabled) return []
    return new Promise((resolve, reject) => {
      try {
        const store = this.getObjectStore('readonly')
        const index = store.index('namespace')
        const request = index.openKeyCursor(IDBKeyRange.only(namespace))
        const keys: string[] = []

        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result
          if (cursor) {
            const fullKey = cursor.primaryKey as string
            const key = fullKey.substring(namespace.length + 1) // Remove "namespace:" prefix
            keys.push(key)
            cursor.continue()
          } else {
            resolve(keys)
          }
        }

        request.onerror = () => reject(new Error(`Failed to get keys for namespace: ${namespace}`))
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    if (this.disabled) return null
    return new Promise((resolve, reject) => {
      try {
        const store = this.getObjectStore('readonly')
        const request = store.openCursor()

        const stats: CacheStats = {
          count: 0,
          totalSize: 0,
          namespaces: []
        }
        const namespacesSet = new Set<string>()

        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result
          if (cursor) {
            const entry = cursor.value as CacheEntry
            stats.count++
            stats.totalSize += JSON.stringify(entry.data).length
            namespacesSet.add(entry.namespace)
            cursor.continue()
          } else {
            stats.namespaces = Array.from(namespacesSet)
            resolve(stats)
          }
        }

        request.onerror = () => reject(new Error('Failed to get cache statistics'))
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * Check if the cache is ready
   */
  isReady(): boolean {
    if (this.disabled) return false
    return this.dbIsReady && this.db !== null
  }
}