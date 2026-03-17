// Re-export types from core storage layer to maintain backward compatibility
export type { ChatMessage, ConversationMetadata } from '@remix/remix-ai-core'

export const assistantAvatar = 'assets/img/remixai-logoDefault.webp'//'assets/img/aiLogo.svg'
export const assitantAvatarLight = 'assets/img/remixai-logoDefaultlightTheme.webp'

export type ActivityType =
  | 'typing'
  | 'button'
  | 'promptSend'
  | 'streamStart'
  | 'streamEnd'

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
