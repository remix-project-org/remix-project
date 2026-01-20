/**
 * IndexedDB backend for local chat history persistence
 */

import { ChatMessage } from '@remix-ui/remix-ai-assistant'
import {
  IChatHistoryBackend,
  ConversationMetadata,
  PersistedChatMessage,
  StorageError,
  QuotaExceededError
} from './interfaces'

export class IndexedDBChatHistoryBackend implements IChatHistoryBackend {
  name = 'indexeddb'
  private db: IDBDatabase | null = null
  private readonly dbName = 'RemixAIChatHistory'
  private readonly dbVersion = 1

  /**
   * Initialize the IndexedDB database
   */
  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion)

      request.onerror = () => {
        reject(new StorageError('Failed to open IndexedDB', 'INIT_ERROR'))
      }

      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result

        // Create conversations object store
        if (!db.objectStoreNames.contains('conversations')) {
          const conversationStore = db.createObjectStore('conversations', { keyPath: 'id' })
          conversationStore.createIndex('createdAt', 'createdAt', { unique: false })
          conversationStore.createIndex('archived', 'archived', { unique: false })
          conversationStore.createIndex('lastAccessedAt', 'lastAccessedAt', { unique: false })
        }

        // Create messages object store
        if (!db.objectStoreNames.contains('messages')) {
          const messageStore = db.createObjectStore('messages', { keyPath: 'id' })
          messageStore.createIndex('conversationId', 'conversationId', { unique: false })
          messageStore.createIndex('timestamp', 'timestamp', { unique: false })
          messageStore.createIndex('role', 'role', { unique: false })
        }
      }
    })
  }

  /**
   * Check if IndexedDB is available
   */
  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      if (!window.indexedDB) {
        resolve(false)
        return
      }

      const testRequest = indexedDB.open('RemixAITest')
      testRequest.onsuccess = () => {
        indexedDB.deleteDatabase('RemixAITest')
        resolve(true)
      }
      testRequest.onerror = () => {
        resolve(false)
      }
    })
  }

  /**
   * Save conversation metadata
   */
  async saveConversation(metadata: ConversationMetadata): Promise<void> {
    if (!this.db) throw new StorageError('Database not initialized', 'NOT_INITIALIZED')

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction(['conversations'], 'readwrite')
        const store = transaction.objectStore('conversations')
        const request = store.put(metadata)

        request.onsuccess = () => resolve()
        request.onerror = () => {
          if (request.error?.name === 'QuotaExceededError') {
            reject(new QuotaExceededError('Storage quota exceeded'))
          } else {
            reject(new StorageError('Failed to save conversation', 'SAVE_ERROR'))
          }
        }
      } catch (error) {
        reject(new StorageError('Transaction failed', 'TRANSACTION_ERROR'))
      }
    })
  }

  /**
   * Get all conversations, optionally filtered by archived status
   */
  async getConversations(archived?: boolean): Promise<ConversationMetadata[]> {
    if (!this.db) throw new StorageError('Database not initialized', 'NOT_INITIALIZED')

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['conversations'], 'readonly')
      const store = transaction.objectStore('conversations')
      const request = store.getAll()

      request.onsuccess = () => {
        let conversations = request.result as ConversationMetadata[]

        // Filter by archived status if specified
        if (archived !== undefined) {
          conversations = conversations.filter(conv => conv.archived === archived)
        }

        // Sort by lastAccessedAt descending (most recent first)
        conversations.sort((a, b) => b.lastAccessedAt - a.lastAccessedAt)

        resolve(conversations)
      }

      request.onerror = () => {
        reject(new StorageError('Failed to get conversations', 'FETCH_ERROR'))
      }
    })
  }

  /**
   * Get a single conversation by ID
   */
  async getConversation(id: string): Promise<ConversationMetadata | null> {
    if (!this.db) throw new StorageError('Database not initialized', 'NOT_INITIALIZED')

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['conversations'], 'readonly')
      const store = transaction.objectStore('conversations')
      const request = store.get(id)

      request.onsuccess = () => {
        resolve(request.result || null)
      }

      request.onerror = () => {
        reject(new StorageError('Failed to get conversation', 'FETCH_ERROR'))
      }
    })
  }

  /**
   * Update conversation metadata
   */
  async updateConversation(id: string, updates: Partial<ConversationMetadata>): Promise<void> {
    if (!this.db) throw new StorageError('Database not initialized', 'NOT_INITIALIZED')

    const existing = await this.getConversation(id)
    if (!existing) {
      throw new StorageError('Conversation not found', 'NOT_FOUND')
    }

    const updated = {
      ...existing,
      ...updates,
      id, // Ensure ID doesn't change
      updatedAt: Date.now()
    }

    await this.saveConversation(updated)
  }

  /**
   * Delete a conversation and all its messages
   */
  async deleteConversation(id: string): Promise<void> {
    if (!this.db) throw new StorageError('Database not initialized', 'NOT_INITIALIZED')

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['conversations', 'messages'], 'readwrite')

      // Delete conversation metadata
      const convStore = transaction.objectStore('conversations')
      convStore.delete(id)

      // Delete all messages in this conversation
      const msgStore = transaction.objectStore('messages')
      const index = msgStore.index('conversationId')
      const request = index.openCursor(IDBKeyRange.only(id))

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result
        if (cursor) {
          cursor.delete()
          cursor.continue()
        }
      }

      transaction.oncomplete = () => resolve()
      transaction.onerror = () => {
        reject(new StorageError('Failed to delete conversation', 'DELETE_ERROR'))
      }
    })
  }

  /**
   * Save a single message
   */
  async saveMessage(message: PersistedChatMessage): Promise<void> {
    if (!this.db) throw new StorageError('Database not initialized', 'NOT_INITIALIZED')

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction(['messages', 'conversations'], 'readwrite')

        // Save message
        const msgStore = transaction.objectStore('messages')
        msgStore.put(message)

        // Update conversation metadata
        const convStore = transaction.objectStore('conversations')
        const convRequest = convStore.get(message.conversationId)

        convRequest.onsuccess = () => {
          const conversation = convRequest.result as ConversationMetadata
          if (conversation) {
            conversation.messageCount = (conversation.messageCount || 0) + 1
            conversation.updatedAt = Date.now()
            conversation.lastAccessedAt = Date.now()
            convStore.put(conversation)
          }
        }

        transaction.oncomplete = () => resolve()
        transaction.onerror = () => {
          if (transaction.error?.name === 'QuotaExceededError') {
            reject(new QuotaExceededError('Storage quota exceeded'))
          } else {
            reject(new StorageError('Failed to save message', 'SAVE_ERROR'))
          }
        }
      } catch (error) {
        reject(new StorageError('Transaction failed', 'TRANSACTION_ERROR'))
      }
    })
  }

  /**
   * Save multiple messages in a batch
   */
  async saveBatch(conversationId: string, messages: ChatMessage[]): Promise<void> {
    if (!this.db) throw new StorageError('Database not initialized', 'NOT_INITIALIZED')

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction(['messages', 'conversations'], 'readwrite')

        // Save all messages
        const msgStore = transaction.objectStore('messages')
        messages.forEach(msg => {
          const persistedMsg: PersistedChatMessage = {
            ...msg,
            conversationId
          }
          msgStore.put(persistedMsg)
        })

        // Update conversation metadata
        const convStore = transaction.objectStore('conversations')
        const convRequest = convStore.get(conversationId)

        convRequest.onsuccess = () => {
          const conversation = convRequest.result as ConversationMetadata
          if (conversation) {
            conversation.messageCount = (conversation.messageCount || 0) + messages.length
            conversation.updatedAt = Date.now()
            conversation.lastAccessedAt = Date.now()
            convStore.put(conversation)
          }
        }

        transaction.oncomplete = () => resolve()
        transaction.onerror = () => {
          if (transaction.error?.name === 'QuotaExceededError') {
            reject(new QuotaExceededError('Storage quota exceeded'))
          } else {
            reject(new StorageError('Failed to save messages', 'SAVE_ERROR'))
          }
        }
      } catch (error) {
        reject(new StorageError('Transaction failed', 'TRANSACTION_ERROR'))
      }
    })
  }

  /**
   * Get all messages for a conversation
   */
  async getMessages(conversationId: string): Promise<ChatMessage[]> {
    if (!this.db) throw new StorageError('Database not initialized', 'NOT_INITIALIZED')

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['messages'], 'readonly')
      const store = transaction.objectStore('messages')
      const index = store.index('conversationId')
      const request = index.getAll(conversationId)

      request.onsuccess = () => {
        const messages = request.result as PersistedChatMessage[]

        // Sort by timestamp ascending (oldest first)
        messages.sort((a, b) => a.timestamp - b.timestamp)

        // Strip conversationId before returning
        const chatMessages: ChatMessage[] = messages.map(({ conversationId, ...msg }) => msg)

        resolve(chatMessages)
      }

      request.onerror = () => {
        reject(new StorageError('Failed to get messages', 'FETCH_ERROR'))
      }
    })
  }

  /**
   * Update message sentiment
   */
  async updateMessageSentiment(
    messageId: string,
    sentiment: 'like' | 'dislike' | 'none'
  ): Promise<void> {
    if (!this.db) throw new StorageError('Database not initialized', 'NOT_INITIALIZED')

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['messages'], 'readwrite')
      const store = transaction.objectStore('messages')
      const request = store.get(messageId)

      request.onsuccess = () => {
        const message = request.result as PersistedChatMessage
        if (message) {
          message.sentiment = sentiment
          store.put(message)
        }
      }

      transaction.oncomplete = () => resolve()
      transaction.onerror = () => {
        reject(new StorageError('Failed to update sentiment', 'UPDATE_ERROR'))
      }
    })
  }

  /**
   * Search conversations by title or preview
   */
  async searchConversations(query: string): Promise<ConversationMetadata[]> {
    const allConversations = await this.getConversations(false) // Non-archived only
    const lowerQuery = query.toLowerCase()

    return allConversations.filter(conv =>
      conv.title.toLowerCase().includes(lowerQuery) ||
      conv.preview.toLowerCase().includes(lowerQuery)
    )
  }

  /**
   * Auto-archive conversations older than threshold
   */
  async autoArchiveOldConversations(daysThreshold: number): Promise<string[]> {
    const cutoffTime = Date.now() - (daysThreshold * 24 * 60 * 60 * 1000)
    const conversations = await this.getConversations(false) // Non-archived only

    const toArchive = conversations.filter(conv => conv.lastAccessedAt < cutoffTime)
    const archivedIds: string[] = []

    for (const conv of toArchive) {
      await this.updateConversation(conv.id, {
        archived: true,
        archivedAt: Date.now()
      })
      archivedIds.push(conv.id)
    }

    return archivedIds
  }

  /**
   * Touch conversation to update lastAccessedAt
   */
  async touchConversation(id: string): Promise<void> {
    await this.updateConversation(id, {
      lastAccessedAt: Date.now()
    })
  }

  /**
   * Clear all data (for testing/reset)
   */
  async clearAll(): Promise<void> {
    if (!this.db) throw new StorageError('Database not initialized', 'NOT_INITIALIZED')

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['conversations', 'messages'], 'readwrite')

      transaction.objectStore('conversations').clear()
      transaction.objectStore('messages').clear()

      transaction.oncomplete = () => resolve()
      transaction.onerror = () => {
        reject(new StorageError('Failed to clear data', 'CLEAR_ERROR'))
      }
    })
  }

  /**
   * This backend doesn't support sync
   */
  supportsSync(): boolean {
    return false
  }
}
