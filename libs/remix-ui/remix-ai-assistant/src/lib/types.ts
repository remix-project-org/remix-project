export type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  sentiment?: 'none' | 'like' | 'dislike'
  isExecutingTools?: boolean
  executingToolName?: string
  executingToolArgs?: Record<string, any>
}

export const assistantAvatar = 'assets/img/remixai-logoDefault.webp'//'assets/img/aiLogo.svg'

export type ActivityType =
  | 'typing'
  | 'button'
  | 'promptSend'
  | 'streamStart'
  | 'streamEnd'

/**
 * Conversation metadata for chat history
 */
export interface ConversationMetadata {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  lastAccessedAt: number
  archived: boolean
  archivedAt?: number
  messageCount: number
  preview: string
}

/**
 * Sync status for cloud sync
 */
export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error'

/**
 * Props for conversation management callbacks
 */
export interface ConversationCallbacks {
  onNewConversation: () => void
  onLoadConversation: (id: string) => void
  onArchiveConversation: (id: string) => void
  onDeleteConversation: (id: string) => void
  onSearchConversations: (query: string) => void
}