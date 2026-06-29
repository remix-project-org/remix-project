import { remixAILogger } from '../helpers/logger'
import { ChatEntry } from "../types/types"
import { ChatHistoryStorageManager } from "../storage/storageManager"

export abstract class ChatHistory{

  private static chatEntries:ChatEntry[] = []
  static queueSize:number = 7 // change the queue size wrt the GPU size legacy recent-context window for consumers that request capped history
  private static storage: ChatHistoryStorageManager | null = null
  private static currentConversationId: string | null = null

  /**
   * Initialize the storage backend.
   * Callers are responsible for calling storage.init() before passing it here.
   * Calling init() again here was causing a second IDBOpenDBRequest, leaking the
   * first connection handle.
   */
  public static async init(storage: ChatHistoryStorageManager): Promise<void> {
    this.storage = storage
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

    // Rebuild chatEntries from the full stored conversation so callers can
    // decide later whether to use the entire thread or only a recent window.
    this.chatEntries = []
    if (this.queueSize === 0) return // zero means no history context
    const startIdx = messages[0]?.role === 'assistant' ? 1 : 0 // Ensure we start with a user message
    const contextMessages = messages.slice(startIdx) // Skip the first message if it's an assistant message without a preceding user message
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

  public static pushHistory(prompt, result): Promise<void> | undefined {
    if (result === "" || !result) return // do not allow empty assistant message due to nested stream handles on toolcalls

    const lastEntry = this.chatEntries[this.chatEntries.length - 1]
    if (lastEntry && lastEntry[0] === prompt && lastEntry[1] === result) {
      return
    }

    const chat:ChatEntry = [prompt, result]
    this.chatEntries.push(chat)

    if (this.storage && this.currentConversationId) {
      return this.persistMessages(prompt, result).catch(err => {
        remixAILogger.error('Failed to persist chat history:', err)
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
   * Generate a unique message ID using the Web Crypto API, consistent with
   * the rest of the codebase (e.g. crypto.randomUUID() in sendPrompt).
   */
  private static generateMessageId(): string {
    return crypto.randomUUID()
  }
}
