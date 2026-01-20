import { ChatEntry } from "../types/types"
import { ChatHistoryStorageManager } from "../storage/storageManager"

export abstract class ChatHistory{

  private static chatEntries:ChatEntry[] = []
  static queueSize:number = 7 // change the queue size wrt the GPU size
  private static storage: ChatHistoryStorageManager | null = null
  private static currentConversationId: string | null = null

  /**
   * Initialize the storage backend
   */
  public static async init(storage: ChatHistoryStorageManager): Promise<void> {
    this.storage = storage
    await this.storage.init()
  }

  /**
   * Set the current conversation ID
   */
  public static setCurrentConversation(id: string | null): void {
    this.currentConversationId = id
  }

  /**
   * Get the current conversation ID
   */
  public static getCurrentConversation(): string | null {
    return this.currentConversationId
  }

  /**
   * Start a new conversation
   */
  public static async startNewConversation(workspace: string = 'default'): Promise<string> {
    if (!this.storage) {
      throw new Error('Storage not initialized')
    }

    this.currentConversationId = await this.storage.createConversation(workspace)
    this.clearHistory() // Clear in-memory context for new conversation
    return this.currentConversationId
  }

  /**
   * Load an existing conversation
   */
  public static async loadConversation(id: string): Promise<void> {
    if (!this.storage) {
      throw new Error('Storage not initialized')
    }

    const messages = await this.storage.getMessages(id)
    this.currentConversationId = id

    // Rebuild chatEntries from last N messages for context
    this.chatEntries = []
    const contextMessages = messages.slice(-this.queueSize)

    // Convert messages to ChatEntry tuples (prompt, result pairs)
    for (let i = 0; i < contextMessages.length; i += 2) {
      const userMsg = contextMessages[i]
      const assistantMsg = contextMessages[i + 1]

      if (userMsg && userMsg.role === 'user' && assistantMsg && assistantMsg.role === 'assistant') {
        this.chatEntries.push([userMsg.content, assistantMsg.content])
      }
    }

    // Touch conversation to update lastAccessedAt
    await this.storage.touchConversation(id)
  }

  public static pushHistory(prompt, result){
    if (result === "" || !result) return // do not allow empty assistant message due to nested stream handles on toolcalls

    // Check if an entry with the same prompt already exists
    const existingEntryIndex = this.chatEntries.findIndex(entry => entry[0] === prompt)

    if (existingEntryIndex !== -1) {
      this.chatEntries[existingEntryIndex][1] = result
    } else {
      const chat:ChatEntry = [prompt, result]
      this.chatEntries.push(chat)
      if (this.chatEntries.length > this.queueSize){this.chatEntries.shift()}
    }

    // Persist to storage if enabled and conversation is active
    if (this.storage && this.currentConversationId) {
      this.persistMessages(prompt, result).catch(err => {
        console.error('Failed to persist chat history:', err)
      })
    }
  }

  /**
   * Persist user and assistant messages to storage
   */
  private static async persistMessages(prompt: string, result: string): Promise<void> {
    if (!this.storage || !this.currentConversationId) return

    const now = Date.now()

    // Create user message
    const userMessage = {
      id: this.generateMessageId(),
      role: 'user' as const,
      content: prompt,
      timestamp: now,
      conversationId: this.currentConversationId
    }

    // Create assistant message
    const assistantMessage = {
      id: this.generateMessageId(),
      role: 'assistant' as const,
      content: result,
      timestamp: now + 1, // Slightly later timestamp
      conversationId: this.currentConversationId
    }

    await this.storage.saveBatch(this.currentConversationId, [userMessage, assistantMessage])
  }

  public static getHistory(){
    return this.chatEntries
  }

  public static clearHistory(){
    this.chatEntries = []
  }

  /**
   * Get the storage manager instance
   */
  public static getStorage(): ChatHistoryStorageManager | null {
    return this.storage
  }

  /**
   * Generate a unique message ID
   */
  private static generateMessageId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }
}
