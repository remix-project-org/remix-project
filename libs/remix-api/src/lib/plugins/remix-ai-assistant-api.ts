/* eslint-disable @typescript-eslint/ban-types */
import { Profile, StatusEvents } from '@remixproject/plugin-utils'

/**
 * Provenance metadata attached to a chatPipe prompt so analytics can tell
 * user-typed prompts apart from programmatic / preset prompts.
 */
export interface ChatPromptMetadata {
  /**
   * Coarse origin of the prompt, e.g. 'user' | 'editor' | 'home-tab' |
   * 'run-tab' | 'quick-dapp' | 'compiler-error'. Defaults to 'user' for
   * prompts the user typed into the composer.
   */
  source?: string
  /**
   * Specific canned-prompt identifier for preset prompts fired by a button
   * or menu, e.g. 'quickdapp-start', 'explain-function'. Absent for
   * user-typed prompts.
   */
  presetId?: string
}

export interface IRemixAiAssistantApi {
  events: {} & StatusEvents
  methods: {
    chatPipe(message: string, isEditorCodeAnalysis?: boolean, metadata?: ChatPromptMetadata): void
    handleExternalMessage(message: string): void
    deleteConversation(id: string): Promise<void>
    loadConversations(): Promise<void>
    newConversation(): Promise<void>
    archiveConversation(id: string): Promise<void>
  }
}
