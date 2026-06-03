// Re-export types from core storage layer to maintain backward compatibility
export type { ChatMessage, ConversationMetadata } from '@remix/remix-ai-core'

export const assistantAvatar = 'assets/img/remixai-logoDefault.webp'//'assets/img/aiLogo.svg'
export const assitantAvatarLight = 'assets/img/remixai-logoDefaultlightTheme.webp'

export type ActivityType =
  | 'typing'
  | 'button'
  | 'promptSend'
  | 'presetSend'
  | 'streamStart'
  | 'streamEnd'
  | 'conversationSize'

/**
 * Identifies where a prompt originated. `typed` means the user authored it in
 * the chat textarea; every other value is a preset / programmatic prompt that
 * we want to be able to filter out of "real" chat metrics.
 */
export type PromptSource =
  | 'typed'
  | 'button'
  | 'sparkle'
  | 'errorExplain'
  | 'homeTab'
  | 'quickDapp'
  | 'template'
  | 'tabsAi'
  | 'ampSql'
  | 'firstTimeUser'
  | 'deployedContract'
  | 'external'

export interface PromptMeta {
  source: PromptSource
  /** Stable identifier for the specific preset (e.g. `review_file`, `audit_contract`). */
  presetId?: string
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
