/**
 * Storage manager that coordinates multiple backends (local + cloud)
 */

import {
  ChatMessage,
  IChatHistoryBackend,
  ConversationMetadata,
  PersistedChatMessage,
  SyncResult,
  SyncOperation,
  StorageError
} from './interfaces'

export class ChatHistoryStorageManager {
  private localBackend: IChatHistoryBackend
  private cloudBackend?: IChatHistoryBackend
  private syncEnabled: boolean = false
  private syncQueue: SyncOperation[] = []
  private syncTimer?: NodeJS.Timeout

  constructor(local: IChatHistoryBackend, cloud?: IChatHistoryBackend) {
    this.localBackend = local
    this.cloudBackend = cloud
  }

  /**
   * Initialize both backends
   */
  async init(): Promise<void> {
    // Always initialize local backend
    await this.localBackend.init()

    // Initialize cloud backend if available
    if (this.cloudBackend) {
      try {
        await this.cloudBackend.init()
        this.syncEnabled = await this.cloudBackend.isAvailable()

        if (this.syncEnabled) {
          // Start background sync timer (every 5 minutes)
          this.startBackgroundSync()
        }
      } catch (error) {
        console.warn('Cloud backend unavailable, continuing with local-only mode:', error)
        this.syncEnabled = false
      }
    }
  }

  /**
   * Check if storage is available
   */
  async isAvailable(): Promise<boolean> {
    return await this.localBackend.isAvailable()
  }

  /**
   * Create a new conversation
   */
  async createConversation(workspace: string): Promise<string> {
    const id = this.generateUUID()
    const now = Date.now()

    const metadata: ConversationMetadata = {
      id,
      title: 'New Conversation', // Will be updated with first message
      createdAt: now,
      updatedAt: now,
      lastAccessedAt: now,
      archived: false,
      messageCount: 0,
      preview: ''
    }

    await this.localBackend.saveConversation(metadata)

    // Queue cloud sync if enabled
    if (this.syncEnabled) {
      this.queueSync({
        type: 'conversation',
        action: 'create',
        data: metadata,
        timestamp: now
      })
    }

    return id
  }

  /**
   * Save a conversation
   */
  async saveConversation(metadata: ConversationMetadata): Promise<void> {
    await this.localBackend.saveConversation(metadata)

    if (this.syncEnabled) {
      this.queueSync({
        type: 'conversation',
        action: 'update',
        data: metadata,
        timestamp: Date.now()
      })
    }
  }

  /**
   * Get all conversations
   */
  async getConversations(archived?: boolean): Promise<ConversationMetadata[]> {
    return await this.localBackend.getConversations(archived)
  }

  /**
   * Get a single conversation
   */
  async getConversation(id: string): Promise<ConversationMetadata | null> {
    return await this.localBackend.getConversation(id)
  }

  /**
   * Update conversation metadata
   */
  async updateConversation(id: string, updates: Partial<ConversationMetadata>): Promise<void> {
    await this.localBackend.updateConversation(id, updates)

    if (this.syncEnabled) {
      this.queueSync({
        type: 'conversation',
        action: 'update',
        data: { id, ...updates },
        timestamp: Date.now()
      })
    }
  }

  /**
   * Delete a conversation
   */
  async deleteConversation(id: string): Promise<void> {
    await this.localBackend.deleteConversation(id)

    if (this.syncEnabled) {
      this.queueSync({
        type: 'conversation',
        action: 'delete',
        data: { id },
        timestamp: Date.now()
      })
    }
  }

  /**
   * Save a single message
   */
  async saveMessage(message: PersistedChatMessage): Promise<void> {
    await this.localBackend.saveMessage(message)

    // Update conversation title and preview if this is the first user message
    const conversation = await this.getConversation(message.conversationId)
    if (conversation && conversation.messageCount === 1 && message.role === 'user') {
      const title = message.content.substring(0, 50)
      const preview = message.content.substring(0, 100)

      await this.updateConversation(message.conversationId, {
        title,
        preview
      })
    }

    if (this.syncEnabled) {
      this.queueSync({
        type: 'message',
        action: 'create',
        data: message,
        timestamp: Date.now()
      })
    }
  }

  /**
   * Save multiple messages
   */
  async saveBatch(conversationId: string, messages: ChatMessage[]): Promise<void> {
    await this.localBackend.saveBatch(conversationId, messages)

    // Update conversation title and preview from first user message
    const conversation = await this.getConversation(conversationId)
    if (conversation) {
      const firstUserMsg = messages.find(m => m.role === 'user')
      if (firstUserMsg && conversation.messageCount === messages.length) {
        const title = firstUserMsg.content.substring(0, 50)
        const preview = firstUserMsg.content.substring(0, 100)

        await this.updateConversation(conversationId, {
          title,
          preview
        })
      }
    }

    if (this.syncEnabled) {
      messages.forEach(msg => {
        this.queueSync({
          type: 'message',
          action: 'create',
          data: { ...msg, conversationId },
          timestamp: Date.now()
        })
      })
    }
  }

  /**
   * Get all messages for a conversation
   */
  async getMessages(conversationId: string): Promise<ChatMessage[]> {
    return await this.localBackend.getMessages(conversationId)
  }

  /**
   * Update message sentiment
   */
  async updateMessageSentiment(
    messageId: string,
    sentiment: 'like' | 'dislike' | 'none'
  ): Promise<void> {
    if (this.localBackend.updateMessageSentiment) {
      await this.localBackend.updateMessageSentiment(messageId, sentiment)
    }

    if (this.syncEnabled) {
      this.queueSync({
        type: 'message',
        action: 'update',
        data: { messageId, sentiment },
        timestamp: Date.now()
      })
    }
  }

  /**
   * Search conversations
   */
  async searchConversations(query: string): Promise<ConversationMetadata[]> {
    if (this.localBackend.searchConversations) {
      return await this.localBackend.searchConversations(query)
    }
    // Fallback: filter all conversations
    const all = await this.getConversations(false)
    const lowerQuery = query.toLowerCase()
    return all.filter(conv =>
      conv.title.toLowerCase().includes(lowerQuery) ||
      conv.preview.toLowerCase().includes(lowerQuery)
    )
  }

  /**
   * Auto-archive old conversations
   */
  async autoArchiveOldConversations(daysThreshold: number): Promise<string[]> {
    if (this.localBackend.autoArchiveOldConversations) {
      return await this.localBackend.autoArchiveOldConversations(daysThreshold)
    }
    return []
  }

  /**
   * Touch conversation to update access time
   */
  async touchConversation(id: string): Promise<void> {
    if (this.localBackend.touchConversation) {
      await this.localBackend.touchConversation(id)
    }
  }

  /**
   * Clear all data
   */
  async clearAll(): Promise<void> {
    if (this.localBackend.clearAll) {
      await this.localBackend.clearAll()
    }
  }

  /**
   * Pull data from cloud on startup
   */
  async pullFromCloud(): Promise<SyncResult | null> {
    if (!this.cloudBackend?.pull || !this.syncEnabled) {
      return null
    }

    try {
      const result = await this.cloudBackend.pull()
      if (result.success) {
        // Cloud backend will return data, we need to merge it
        // This is handled by the cloud backend's pull implementation
        console.log(`Pulled ${result.conversationsSynced} conversations, ${result.messagesSynced} messages from cloud`)
      }
      return result
    } catch (error) {
      console.error('Failed to pull from cloud:', error)
      return {
        success: false,
        conversationsSynced: 0,
        messagesSynced: 0,
        errors: [error.message],
        timestamp: Date.now()
      }
    }
  }

  /**
   * Manually trigger cloud sync
   */
  async syncToCloud(): Promise<SyncResult | null> {
    if (!this.cloudBackend?.push || !this.syncEnabled) {
      return null
    }

    try {
      const result = await this.cloudBackend.push()
      if (result.success) {
        // Clear sync queue on success
        this.syncQueue = []
        console.log(`Synced ${result.conversationsSynced} conversations, ${result.messagesSynced} messages to cloud`)
      }
      return result
    } catch (error) {
      console.error('Failed to sync to cloud:', error)
      return {
        success: false,
        conversationsSynced: 0,
        messagesSynced: 0,
        errors: [error.message],
        timestamp: Date.now()
      }
    }
  }

  /**
   * Get last sync time
   */
  async getLastSyncTime(): Promise<number | null> {
    if (this.cloudBackend?.getLastSyncTime && this.syncEnabled) {
      return await this.cloudBackend.getLastSyncTime()
    }
    return null
  }

  /**
   * Check if cloud sync is enabled
   */
  isSyncEnabled(): boolean {
    return this.syncEnabled
  }

  /**
   * Queue a sync operation
   */
  private queueSync(operation: SyncOperation): void {
    this.syncQueue.push(operation)

    // Limit queue size to prevent memory issues (keep last 1000 operations)
    if (this.syncQueue.length > 1000) {
      this.syncQueue = this.syncQueue.slice(-1000)
    }
  }

  /**
   * Start background sync timer
   */
  private startBackgroundSync(): void {
    // Sync every 5 minutes
    this.syncTimer = setInterval(() => {
      if (this.syncQueue.length > 0) {
        this.syncToCloud().catch(err => {
          console.error('Background sync failed:', err)
        })
      }
    }, 5 * 60 * 1000)
  }

  /**
   * Stop background sync
   */
  stopBackgroundSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer)
      this.syncTimer = undefined
    }
  }

  /**
   * Generate UUID v4
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0
      const v = c === 'x' ? r : (r & 0x3 | 0x8)
      return v.toString(16)
    })
  }

  /**
   * Cleanup on destroy
   */
  destroy(): void {
    this.stopBackgroundSync()
  }
}
