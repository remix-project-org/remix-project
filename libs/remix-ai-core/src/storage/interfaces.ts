/**
 * Storage abstraction layer for RemixAI chat history persistence.
 * Supports pluggable backends (IndexedDB, S3, etc.)
 */

/**
 * Chat message structure (duplicated here to avoid circular dependencies)
 */
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  sentiment?: 'none' | 'like' | 'dislike'
  isExecutingTools?: boolean
  executingToolName?: string
  executingToolArgs?: Record<string, any>
}

/**
 * Metadata for a conversation thread
 */
export interface ConversationMetadata {
  id: string
  title: string                 // Auto-generated from first prompt (max 50 chars)
  createdAt: number
  updatedAt: number
  lastAccessedAt: number        // For auto-archive logic
  archived: boolean
  archivedAt?: number           // When it was archived
  messageCount: number
  preview: string               // First 100 chars of first message
}

/**
 * Chat message with conversation association for persistence
 */
export interface PersistedChatMessage extends ChatMessage {
  conversationId: string
  // Inherits from ChatMessage:
  // - id: string
  // - role: 'user' | 'assistant'
  // - content: string
  // - timestamp: number
  // - sentiment?: 'none' | 'like' | 'dislike'
}

/**
 * Result of a sync operation
 */
export interface SyncResult {
  success: boolean
  conversationsSynced: number
  messagesSynced: number
  errors?: string[]
  timestamp: number
}

/**
 * Sync operation for queuing
 */
export interface SyncOperation {
  type: 'conversation' | 'message'
  action: 'create' | 'update' | 'delete'
  data: any
  timestamp: number
}

/**
 * Cloud index file structure
 */
export interface CloudIndex {
  conversations: ConversationMetadata[]
  lastUpdated: number
}

/**
 * Complete conversation data for cloud storage
 */
export interface ConversationData {
  metadata: ConversationMetadata
  messages: ChatMessage[]
}

/**
 * Base interface for all storage backends
 */
export interface IChatHistoryBackend {
  name: string

  // Initialization
  init(): Promise<void>
  isAvailable(): Promise<boolean>

  // Conversation operations
  saveConversation(metadata: ConversationMetadata): Promise<void>
  getConversations(archived?: boolean): Promise<ConversationMetadata[]>
  getConversation(id: string): Promise<ConversationMetadata | null>
  updateConversation(id: string, updates: Partial<ConversationMetadata>): Promise<void>
  deleteConversation(id: string): Promise<void>

  // Message operations
  saveMessage(message: PersistedChatMessage): Promise<void>
  saveBatch(conversationId: string, messages: ChatMessage[]): Promise<void>
  getMessages(conversationId: string): Promise<ChatMessage[]>
  updateMessageSentiment?(messageId: string, sentiment: 'like' | 'dislike' | 'none'): Promise<void>

  // Optional convenience methods
  searchConversations?(query: string): Promise<ConversationMetadata[]>
  autoArchiveOldConversations?(daysThreshold: number): Promise<string[]>
  touchConversation?(id: string): Promise<void>
  clearAll?(): Promise<void>

  // Sync operations (for cloud backends)
  supportsSync(): boolean
  push?(): Promise<SyncResult>
  pull?(): Promise<SyncResult>
  getLastSyncTime?(): Promise<number | null>
}

/**
 * Configuration for S3 cloud backend
 */
export interface S3Config {
  bucketName: string
  region: string
  userId: string
  credentials: {
    accessKeyId: string
    secretAccessKey: string
  }
}

/**
 * Error types for storage operations
 */
export class StorageError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message)
    this.name = 'StorageError'
  }
}

export class QuotaExceededError extends StorageError {
  constructor(message: string) {
    super(message, 'QUOTA_EXCEEDED')
  }
}

export class SyncError extends StorageError {
  constructor(message: string) {
    super(message, 'SYNC_ERROR')
  }
}
