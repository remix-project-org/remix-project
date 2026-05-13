/**
 * DeepAgent Memory Backend using IndexedDB
 * Implements LangGraph MemoryStore interface for persistent memory storage
 */

/**
 * IndexedDB-based memory store for DeepAgent
 */
export class DeepAgentMemoryBackend {
  private dbName: string = 'RemixDeepAgentMemory'
  private storeName: string = 'memory'
  private version: number = 1
  private db: IDBDatabase | null = null

  constructor(dbName?: string) {
    if (dbName) {
      this.dbName = dbName
    }
  }

  /**
   * Initialize the IndexedDB database
   */
  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version)

      request.onerror = () => {
        reject(new Error(`Failed to open IndexedDB: ${request.error?.message}`))
      }

      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result

        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'id' })
        }
      }
    })
  }

  /**
   * Get a value from memory
   */
  async get(namespace: string, key: string): Promise<any | null> {
    await this.ensureDb()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly')
      const store = transaction.objectStore(this.storeName)
      const id = this.makeKey(namespace, key)
      const request = store.get(id)

      request.onsuccess = () => {
        const result = request.result
        resolve(result ? result.value : null)
      }

      request.onerror = () => {
        reject(new Error(`Failed to get from memory: ${request.error?.message}`))
      }
    })
  }

  /**
   * Store a value in memory
   */
  async put(namespace: string, key: string, value: any): Promise<void> {
    await this.ensureDb()

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction([this.storeName], 'readwrite')
        const store = transaction.objectStore(this.storeName)
        const id = this.makeKey(namespace, key)

        const record = {
          id,
          namespace,
          key,
          value,
          timestamp: Date.now()
        }

        const request = store.put(record)

        request.onsuccess = () => {
          resolve()
        }

        request.onerror = () => {
          // Check if quota exceeded
          if (request.error?.name === 'QuotaExceededError') {
            // Try to clear old memories
            this.clearOldMemories(namespace).then(() => {
              // Retry the put operation
              const retryRequest = store.put(record)
              retryRequest.onsuccess = () => resolve()
              retryRequest.onerror = () => reject(new Error('Failed to store after clearing old memories'))
            })
          } else {
            reject(new Error(`Failed to put to memory: ${request.error?.message}`))
          }
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * Delete a value from memory
   */
  async delete(namespace: string, key: string): Promise<void> {
    await this.ensureDb()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite')
      const store = transaction.objectStore(this.storeName)
      const id = this.makeKey(namespace, key)
      const request = store.delete(id)

      request.onsuccess = () => {
        resolve()
      }

      request.onerror = () => {
        reject(new Error(`Failed to delete from memory: ${request.error?.message}`))
      }
    })
  }

  /**
   * List all keys in a namespace
   */
  async list(namespace: string): Promise<string[]> {
    await this.ensureDb()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly')
      const store = transaction.objectStore(this.storeName)
      const request = store.getAll()

      request.onsuccess = () => {
        const results = request.result || []
        const keys = results
          .filter(record => record.namespace === namespace)
          .map(record => record.key)
        resolve(keys)
      }

      request.onerror = () => {
        reject(new Error(`Failed to list keys: ${request.error?.message}`))
      }
    })
  }

  /**
   * Clear all data in a namespace
   */
  async clearNamespace(namespace: string): Promise<void> {
    await this.ensureDb()

    const keys = await this.list(namespace)
    const deletePromises = keys.map(key => this.delete(namespace, key))
    await Promise.all(deletePromises)
  }

  /**
   * Clear old memories to free up space
   * Removes entries older than 30 days
   */
  private async clearOldMemories(namespace: string): Promise<void> {
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000)

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite')
      const store = transaction.objectStore(this.storeName)
      const request = store.getAll()

      request.onsuccess = () => {
        const results = request.result || []
        const oldRecords = results.filter(
          record => record.namespace === namespace && record.timestamp < thirtyDaysAgo
        )

        // Delete old records
        const deletePromises = oldRecords.map(record => {
          return new Promise<void>((resolve, reject) => {
            const deleteRequest = store.delete(record.id)
            deleteRequest.onsuccess = () => resolve()
            deleteRequest.onerror = () => reject(deleteRequest.error)
          })
        })

        Promise.all(deletePromises)
          .then(() => resolve())
          .catch(reject)
      }

      request.onerror = () => {
        reject(new Error(`Failed to clear old memories: ${request.error?.message}`))
      }
    })
  }

  /**
   * Ensure database is initialized
   */
  private async ensureDb(): Promise<void> {
    if (!this.db) {
      await this.init()
    }
  }

  /**
   * Create a composite key from namespace and key
   */
  private makeKey(namespace: string, key: string): string {
    return `${namespace}:${key}`
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<{
    totalRecords: number
    namespaces: Record<string, number>
    totalSize: number
  }> {
    await this.ensureDb()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly')
      const store = transaction.objectStore(this.storeName)
      const request = store.getAll()

      request.onsuccess = () => {
        const results = request.result || []
        const namespaces: Record<string, number> = {}
        let totalSize = 0

        for (const record of results) {
          namespaces[record.namespace] = (namespaces[record.namespace] || 0) + 1
          totalSize += JSON.stringify(record.value).length
        }

        resolve({
          totalRecords: results.length,
          namespaces,
          totalSize
        })
      }

      request.onerror = () => {
        reject(new Error(`Failed to get stats: ${request.error?.message}`))
      }
    })
  }
}

/**
 * Factory function to create a DeepAgent memory backend
 */
export function createDeepAgentMemoryBackend(dbName?: string): DeepAgentMemoryBackend {
  return new DeepAgentMemoryBackend(dbName)
}
