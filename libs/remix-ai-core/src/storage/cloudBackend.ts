/**
 * AWS S3 cloud backend for chat history synchronization
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  DeleteObjectCommand,
  ListObjectsV2Command
} from '@aws-sdk/client-s3'
import {
  ChatMessage,
  IChatHistoryBackend,
  ConversationMetadata,
  PersistedChatMessage,
  SyncResult,
  SyncOperation,
  CloudIndex,
  ConversationData,
  S3Config,
  SyncError
} from './interfaces'

/**
 * S3 cloud backend implementation for chat history storage
 * Provides cross-device synchronization of conversations and messages
 */
export class S3ChatHistoryBackend implements IChatHistoryBackend {
  name = 's3'
  private s3Client: S3Client
  private bucketName: string
  private userId: string
  private syncQueue: SyncOperation[] = []
  private isInitialized: boolean = false

  constructor(config: S3Config) {
    this.bucketName = config.bucketName
    this.userId = config.userId
    this.s3Client = new S3Client({
      region: config.region,
      credentials: config.credentials
    })
  }

  /**
   * Initialize and verify S3 access
   */
  async init(): Promise<void> {
    try {
      // Test S3 bucket access
      await this.s3Client.send(new HeadBucketCommand({
        Bucket: this.bucketName
      }))
      this.isInitialized = true
      console.log(`S3 backend initialized for bucket: ${this.bucketName}`)
    } catch (error) {
      console.error('S3 backend initialization failed:', error)
      this.isInitialized = false
      throw new SyncError(`Failed to initialize S3 backend: ${error.message}`)
    }
  }

  /**
   * Check if S3 backend is available
   */
  async isAvailable(): Promise<boolean> {
    if (!this.isInitialized) {
      return false
    }

    // Check if user is authenticated and has cloud sync enabled
    const token = localStorage.getItem('remix_pro_token')
    return !!token && !!this.userId
  }

  /**
   * Save conversation metadata to S3
   */
  async saveConversation(metadata: ConversationMetadata): Promise<void> {
    const key = this.getConversationKey(metadata.id)

    // Get existing conversation data or create new
    let conversationData: ConversationData
    try {
      const existing = await this.getObject(key)
      conversationData = JSON.parse(existing) as ConversationData
      conversationData.metadata = metadata
    } catch (error) {
      // Conversation doesn't exist yet, create new
      conversationData = {
        metadata,
        messages: []
      }
    }

    await this.putObject(key, JSON.stringify(conversationData, null, 2))
    await this.updateIndex()
  }

  /**
   * Get all conversations from S3
   */
  async getConversations(archived?: boolean): Promise<ConversationMetadata[]> {
    try {
      const index = await this.getIndex()
      let conversations = index.conversations

      if (archived !== undefined) {
        conversations = conversations.filter(conv => conv.archived === archived)
      }

      // Sort by lastAccessedAt descending
      return conversations.sort((a, b) => b.lastAccessedAt - a.lastAccessedAt)
    } catch (error) {
      console.error('Failed to get conversations from S3:', error)
      return []
    }
  }

  /**
   * Get a single conversation from S3
   */
  async getConversation(id: string): Promise<ConversationMetadata | null> {
    try {
      const key = this.getConversationKey(id)
      const data = await this.getObject(key)
      const conversationData = JSON.parse(data) as ConversationData
      return conversationData.metadata
    } catch (error) {
      console.error(`Failed to get conversation ${id} from S3:`, error)
      return null
    }
  }

  /**
   * Update conversation metadata
   */
  async updateConversation(id: string, updates: Partial<ConversationMetadata>): Promise<void> {
    const existing = await this.getConversation(id)
    if (!existing) {
      throw new SyncError(`Conversation ${id} not found`)
    }

    const updated = { ...existing, ...updates }
    await this.saveConversation(updated)
  }

  /**
   * Delete conversation from S3
   */
  async deleteConversation(id: string): Promise<void> {
    const key = this.getConversationKey(id)

    await this.s3Client.send(new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key
    }))

    await this.updateIndex()
  }

  /**
   * Save a single message to S3
   */
  async saveMessage(message: PersistedChatMessage): Promise<void> {
    const key = this.getConversationKey(message.conversationId)

    try {
      const data = await this.getObject(key)
      const conversationData = JSON.parse(data) as ConversationData

      // Add or update message
      const existingIndex = conversationData.messages.findIndex(m => m.id === message.id)
      if (existingIndex >= 0) {
        conversationData.messages[existingIndex] = message
      } else {
        conversationData.messages.push(message)
      }

      // Update message count
      conversationData.metadata.messageCount = conversationData.messages.length
      conversationData.metadata.updatedAt = Date.now()

      await this.putObject(key, JSON.stringify(conversationData, null, 2))
      await this.updateIndex()
    } catch (error) {
      throw new SyncError(`Failed to save message: ${error.message}`)
    }
  }

  /**
   * Save multiple messages in batch
   */
  async saveBatch(conversationId: string, messages: ChatMessage[]): Promise<void> {
    const key = this.getConversationKey(conversationId)

    try {
      const data = await this.getObject(key)
      const conversationData = JSON.parse(data) as ConversationData

      // Add messages with conversationId
      const persistedMessages = messages.map(msg => ({
        ...msg,
        conversationId
      }))

      conversationData.messages.push(...persistedMessages)
      conversationData.metadata.messageCount = conversationData.messages.length
      conversationData.metadata.updatedAt = Date.now()

      await this.putObject(key, JSON.stringify(conversationData, null, 2))
      await this.updateIndex()
    } catch (error) {
      throw new SyncError(`Failed to save batch: ${error.message}`)
    }
  }

  /**
   * Get all messages for a conversation
   */
  async getMessages(conversationId: string): Promise<ChatMessage[]> {
    try {
      const key = this.getConversationKey(conversationId)
      const data = await this.getObject(key)
      const conversationData = JSON.parse(data) as ConversationData
      return conversationData.messages
    } catch (error) {
      console.error(`Failed to get messages for conversation ${conversationId}:`, error)
      return []
    }
  }

  /**
   * Update message sentiment
   */
  async updateMessageSentiment(
    messageId: string,
    sentiment: 'like' | 'dislike' | 'none'
  ): Promise<void> {
    // Need to find which conversation contains this message
    // This is inefficient - in production, consider maintaining a message index
    const conversations = await this.getConversations()

    for (const conv of conversations) {
      const messages = await this.getMessages(conv.id)
      const messageIndex = messages.findIndex(m => m.id === messageId)

      if (messageIndex >= 0) {
        messages[messageIndex].sentiment = sentiment
        const key = this.getConversationKey(conv.id)
        const conversationData: ConversationData = {
          metadata: conv,
          messages
        }
        await this.putObject(key, JSON.stringify(conversationData, null, 2))
        return
      }
    }

    throw new SyncError(`Message ${messageId} not found`)
  }

  /**
   * Check if this backend supports sync operations
   */
  supportsSync(): boolean {
    return true
  }

  /**
   * Push local changes to S3 (from sync queue)
   */
  async push(): Promise<SyncResult> {
    const result: SyncResult = {
      success: false,
      conversationsSynced: 0,
      messagesSynced: 0,
      errors: [],
      timestamp: Date.now()
    }

    if (!this.isInitialized) {
      result.errors?.push('S3 backend not initialized')
      return result
    }

    try {
      // Process sync queue
      const conversationIds = new Set<string>()
      let messageCount = 0

      for (const operation of this.syncQueue) {
        try {
          await this.executeSyncOperation(operation)

          if (operation.type === 'conversation') {
            conversationIds.add(operation.data.id)
          } else if (operation.type === 'message') {
            messageCount++
            conversationIds.add(operation.data.conversationId)
          }
        } catch (error) {
          result.errors?.push(`Failed to sync ${operation.type}: ${error.message}`)
        }
      }

      result.conversationsSynced = conversationIds.size
      result.messagesSynced = messageCount
      result.success = (result.errors?.length || 0) === 0

      // Clear queue on success
      if (result.success) {
        this.syncQueue = []
        await this.setLastSyncTime(result.timestamp)
      }

      console.log(`Push completed: ${result.conversationsSynced} conversations, ${result.messagesSynced} messages`)
    } catch (error) {
      result.errors?.push(error.message)
    }

    return result
  }

  /**
   * Pull changes from S3 to local
   */
  async pull(): Promise<SyncResult> {
    const result: SyncResult = {
      success: false,
      conversationsSynced: 0,
      messagesSynced: 0,
      errors: [],
      timestamp: Date.now()
    }

    if (!this.isInitialized) {
      result.errors?.push('S3 backend not initialized')
      return result
    }

    try {
      // Get index from S3
      const index = await this.getIndex()

      result.conversationsSynced = index.conversations.length

      // Count total messages
      for (const conv of index.conversations) {
        result.messagesSynced += conv.messageCount
      }

      result.success = true
      console.log(`Pull completed: ${result.conversationsSynced} conversations, ${result.messagesSynced} messages`)
    } catch (error) {
      result.errors = [error.message]
    }

    return result
  }

  /**
   * Get last sync time
   */
  async getLastSyncTime(): Promise<number | null> {
    const time = localStorage.getItem('remix-ai-last-cloud-sync')
    return time ? parseInt(time) : null
  }

  /**
   * Set last sync time
   */
  private async setLastSyncTime(timestamp: number): Promise<void> {
    localStorage.setItem('remix-ai-last-cloud-sync', timestamp.toString())
  }

  /**
   * Execute a single sync operation
   */
  private async executeSyncOperation(operation: SyncOperation): Promise<void> {
    switch (operation.type) {
      case 'conversation':
        if (operation.action === 'create' || operation.action === 'update') {
          await this.saveConversation(operation.data)
        } else if (operation.action === 'delete') {
          await this.deleteConversation(operation.data.id)
        }
        break

      case 'message':
        if (operation.action === 'create') {
          await this.saveMessage(operation.data)
        } else if (operation.action === 'update') {
          await this.updateMessageSentiment(operation.data.messageId, operation.data.sentiment)
        }
        break
    }
  }

  /**
   * Get S3 key for a conversation
   */
  private getConversationKey(conversationId: string): string {
    return `user-${this.userId}/conversations/${conversationId}.json`
  }

  /**
   * Get S3 key for index file
   */
  private getIndexKey(): string {
    return `user-${this.userId}/index.json`
  }

  /**
   * Get index file from S3
   */
  private async getIndex(): Promise<CloudIndex> {
    try {
      const data = await this.getObject(this.getIndexKey())
      return JSON.parse(data) as CloudIndex
    } catch (error) {
      // Index doesn't exist yet, create empty one
      return {
        conversations: [],
        lastUpdated: Date.now()
      }
    }
  }

  /**
   * Update index file with current conversations
   */
  private async updateIndex(): Promise<void> {
    try {
      // List all conversation files
      const prefix = `user-${this.userId}/conversations/`
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix
      })

      const response = await this.s3Client.send(command)
      const conversations: ConversationMetadata[] = []

      if (response.Contents) {
        for (const item of response.Contents) {
          if (item.Key && item.Key.endsWith('.json')) {
            try {
              const data = await this.getObject(item.Key)
              const conversationData = JSON.parse(data) as ConversationData
              conversations.push(conversationData.metadata)
            } catch (error) {
              console.warn(`Failed to read conversation ${item.Key}:`, error)
            }
          }
        }
      }

      const index: CloudIndex = {
        conversations,
        lastUpdated: Date.now()
      }

      await this.putObject(this.getIndexKey(), JSON.stringify(index, null, 2))
    } catch (error) {
      console.error('Failed to update index:', error)
    }
  }

  /**
   * Get object from S3
   */
  private async getObject(key: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key
    })

    const response = await this.s3Client.send(command)

    if (!response.Body) {
      throw new SyncError('Empty response from S3')
    }

    return await response.Body.transformToString()
  }

  /**
   * Put object to S3
   */
  private async putObject(key: string, data: string): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: data,
      ContentType: 'application/json'
    })

    await this.s3Client.send(command)
  }

  /**
   * Queue a sync operation
   */
  queueSync(operation: SyncOperation): void {
    this.syncQueue.push(operation)

    // Limit queue size
    if (this.syncQueue.length > 1000) {
      this.syncQueue = this.syncQueue.slice(-1000)
    }
  }
}
