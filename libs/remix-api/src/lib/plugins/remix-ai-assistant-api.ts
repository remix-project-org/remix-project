/* eslint-disable @typescript-eslint/ban-types */
import { Profile, StatusEvents } from '@remixproject/plugin-utils'

export interface IRemixAiAssistantApi {
  events: {} & StatusEvents
  methods: {
    chatPipe(message: string): void
    handleExternalMessage(message: string): void
    deleteConversation(id: string): Promise<void>
    loadConversations(): Promise<void>
    newConversation(): Promise<void>
    archiveConversation(id: string): Promise<void>
  }
}
