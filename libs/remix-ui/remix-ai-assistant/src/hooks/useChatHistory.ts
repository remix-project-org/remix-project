/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import { useState, useEffect, useCallback } from 'react'
import { ChatHistoryStorageManager } from '@remix/remix-ai-core'
import { ConversationMetadata, ChatMessage } from '../lib/types'

interface UseChatHistoryProps {
  storageManager: ChatHistoryStorageManager | null
  currentConversationId: string | null
  onConversationChange?: (id: string | null) => void
}

interface UseChatHistoryReturn {
  conversations: ConversationMetadata[]
  messages: ChatMessage[]
  loading: boolean
  error: string | null

  // Conversation management
  loadConversations: () => Promise<void>
  createConversation: () => Promise<string | null>
  loadConversation: (id: string) => Promise<void>
  deleteConversation: (id: string) => Promise<void>
  archiveConversation: (id: string) => Promise<void>

  // Message operations
  addMessage: (message: ChatMessage) => Promise<void>
  updateMessageSentiment: (messageId: string, sentiment: 'like' | 'dislike' | 'none') => Promise<void>

  // Search and filter
  searchConversations: (query: string) => Promise<ConversationMetadata[]>

  // Auto-archive
  autoArchive: (daysThreshold?: number) => Promise<string[]>
}

/**
 * Custom hook for managing chat history with IndexedDB storage
 * Provides all CRUD operations for conversations and messages
 */
export const useChatHistory = ({
  storageManager,
  currentConversationId,
  onConversationChange
}: UseChatHistoryProps): UseChatHistoryReturn => {
  const [conversations, setConversations] = useState<ConversationMetadata[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Load all conversations from storage
   */
  const loadConversations = useCallback(async () => {
    if (!storageManager) return

    setLoading(true)
    setError(null)

    try {
      const allConversations = await storageManager.getConversations()

      // Sort by lastAccessedAt descending
      const sorted = allConversations.sort((a, b) =>
        b.lastAccessedAt - a.lastAccessedAt
      )

      setConversations(sorted)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load conversations'
      setError(errorMessage)
      console.error('Failed to load conversations:', err)
    } finally {
      setLoading(false)
    }
  }, [storageManager])

  /**
   * Create a new conversation
   */
  const createConversation = useCallback(async (): Promise<string | null> => {
    if (!storageManager) return null

    setLoading(true)
    setError(null)

    try {
      const id = await storageManager.createConversation('default')
      await loadConversations() // Refresh list
      onConversationChange?.(id)
      return id
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create conversation'
      setError(errorMessage)
      console.error('Failed to create conversation:', err)
      return null
    } finally {
      setLoading(false)
    }
  }, [storageManager, loadConversations, onConversationChange])

  /**
   * Load messages for a specific conversation
   */
  const loadConversation = useCallback(async (id: string) => {
    if (!storageManager) return

    setLoading(true)
    setError(null)

    try {
      const conversationMessages = await storageManager.getMessages(id)
      setMessages(conversationMessages)

      // Touch conversation to update lastAccessedAt
      await storageManager.touchConversation(id)
      await loadConversations() // Refresh to update access time

      onConversationChange?.(id)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load conversation'
      setError(errorMessage)
      console.error('Failed to load conversation:', err)
    } finally {
      setLoading(false)
    }
  }, [storageManager, loadConversations, onConversationChange])

  /**
   * Delete a conversation
   */
  const deleteConversation = useCallback(async (id: string) => {
    if (!storageManager) return

    setLoading(true)
    setError(null)

    try {
      await storageManager.deleteConversation(id)
      await loadConversations() // Refresh list

      // If deleted conversation was current, clear messages
      if (id === currentConversationId) {
        setMessages([])
        onConversationChange?.(null)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete conversation'
      setError(errorMessage)
      console.error('Failed to delete conversation:', err)
    } finally {
      setLoading(false)
    }
  }, [storageManager, currentConversationId, loadConversations, onConversationChange])

  /**
   * Archive or unarchive a conversation
   */
  const archiveConversation = useCallback(async (id: string) => {
    if (!storageManager) return

    setLoading(true)
    setError(null)

    try {
      const conversation = await storageManager.getConversation(id)
      if (!conversation) {
        throw new Error('Conversation not found')
      }

      await storageManager.updateConversation(id, {
        archived: !conversation.archived,
        archivedAt: !conversation.archived ? Date.now() : undefined
      })

      await loadConversations() // Refresh list
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to archive conversation'
      setError(errorMessage)
      console.error('Failed to archive conversation:', err)
    } finally {
      setLoading(false)
    }
  }, [storageManager, loadConversations])

  /**
   * Add a message to the current conversation
   */
  const addMessage = useCallback(async (message: ChatMessage) => {
    if (!storageManager || !currentConversationId) return

    setError(null)

    try {
      const persistedMessage = {
        ...message,
        conversationId: currentConversationId
      }

      await storageManager.saveMessage(persistedMessage)

      // Optimistically update local state
      setMessages(prev => [...prev, message])

      // Reload conversations to update message count
      await loadConversations()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to add message'
      setError(errorMessage)
      console.error('Failed to add message:', err)
    }
  }, [storageManager, currentConversationId, loadConversations])

  /**
   * Update message sentiment (like/dislike)
   */
  const updateMessageSentiment = useCallback(async (
    messageId: string,
    sentiment: 'like' | 'dislike' | 'none'
  ) => {
    if (!storageManager) return

    setError(null)

    try {
      await storageManager.updateMessageSentiment(messageId, sentiment)

      // Update local state
      setMessages(prev => prev.map(msg =>
        msg.id === messageId ? { ...msg, sentiment } : msg
      ))
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update sentiment'
      setError(errorMessage)
      console.error('Failed to update message sentiment:', err)
    }
  }, [storageManager])

  /**
   * Search conversations by title or preview
   */
  const searchConversations = useCallback(async (query: string): Promise<ConversationMetadata[]> => {
    if (!storageManager) return []

    try {
      return await storageManager.searchConversations(query)
    } catch (err) {
      console.error('Failed to search conversations:', err)
      return []
    }
  }, [storageManager])

  /**
   * Auto-archive conversations older than threshold
   */
  const autoArchive = useCallback(async (daysThreshold: number = 30): Promise<string[]> => {
    if (!storageManager) return []

    try {
      const archivedIds = await storageManager.autoArchiveOldConversations(daysThreshold)

      if (archivedIds.length > 0) {
        await loadConversations() // Refresh list
      }

      return archivedIds
    } catch (err) {
      console.error('Failed to auto-archive:', err)
      return []
    }
  }, [storageManager, loadConversations])

  // Load conversations on mount or when storage manager changes
  useEffect(() => {
    if (storageManager) {
      loadConversations()
    }
  }, [storageManager, loadConversations])

  return {
    conversations,
    messages,
    loading,
    error,
    loadConversations,
    createConversation,
    loadConversation,
    deleteConversation,
    archiveConversation,
    addMessage,
    updateMessageSentiment,
    searchConversations,
    autoArchive
  }
}
