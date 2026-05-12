import React, { useEffect, useRef, createRef } from 'react'
import { ViewPlugin } from '@remixproject/engine-web'
import * as packageJson from '../../../../../package.json'
import { PluginViewWrapper } from '@remix-ui/helper'
import { ChatMessage, RemixUiRemixAiAssistant, RemixUiRemixAiAssistantHandle, ConversationMetadata } from '@remix-ui/remix-ai-assistant'
import { EventEmitter } from 'events'
import { trackMatomoEvent } from '@remix-api'
import { ChatHistory, ChatHistoryStorageManager, IndexedDBChatHistoryBackend } from '@remix/remix-ai-core'
import { appActionTypes, AppAction } from '@remix-ui/app'

const profile = {
  name: 'remixaiassistant',
  displayName: 'RemixAI Assistant',
  icon: 'assets/img/remixai-logoAI.webp',
  description: 'AI code assistant for Remix IDE',
  kind: '',
  location: 'sidePanel',
  documentation: 'https://remix-ide.readthedocs.io/en/latest/ai.html',
  version: packageJson.version,
  maintainedBy: 'Remix',
  permission: true,
  events: [],
  methods: ['chatPipe', 'handleExternalMessage', 'getProfile', 'deleteConversation','loadConversations', 'newConversation', 'archiveConversation']
}

export class RemixAIAssistant extends ViewPlugin {
  element: HTMLDivElement
  dispatch: React.Dispatch<any> = () => { }
  appStateDispatch: React.Dispatch<AppAction> = () => { }
  queuedMessage: { text: string, timestamp: number } | null = null
  event: any
  chatRef: React.RefObject<RemixUiRemixAiAssistantHandle>
  history: ChatMessage[] = []
  externalMessage: string
  storageManager: ChatHistoryStorageManager | null = null
  currentConversationId: string | null = null
  conversations: ConversationMetadata[] = []
  showHistorySidebar: boolean = false
  isMaximized: boolean = false
  private _initializing: boolean = true
  private _initStarted: boolean = false

  constructor() {
    super(profile)
    this.event = new EventEmitter()
    this.element = document.createElement('div')
    this.element.setAttribute('id', 'remix-ai-assistant')
    this.chatRef = createRef<RemixUiRemixAiAssistantHandle>()
    ;(window as any).remixAIChat = this.chatRef

    // Load sidebar visibility preference
    const sidebarPref = localStorage.getItem('remix-ai-history-sidebar-visible')
    this.showHistorySidebar = sidebarPref === 'true'
  }

  getProfile() {
    return profile
  }

  async onActivation() {
    if (!localStorage.getItem('remixaiassistant_firstload_flag')) {
      this.call('sidePanel', 'pinView', this.profile)
      await this.call('layout', 'maximiseSidePanel')
    }
    localStorage.setItem('remixaiassistant_firstload_flag', '1')

    // Listen to layout events for maximization state
    this.on('layout', 'maximiseRightSidePanel', () => {
      this.setMaximized(true)
    })
    this.on('layout', 'resetRightSidePanel', () => {
      this.setMaximized(false)
    })
    this.on('layout', 'enhanceRightSidePanel', () => {
      this.setMaximized(true)
    })

    // Initialize storage
    try {
      await this.initializeStorage()
    } catch (error) {
      console.error('Failed to initialize chat history storage:', error)
    }
  }

  async initializeStorage() {
    this._initStarted = true
    this._initializing = true
    this.renderComponent()
    try {
      //if a timeout is set here the spinner become visible
      // Create IndexedDB backend
      const indexedDBBackend = new IndexedDBChatHistoryBackend()

      // Initialize storage manager with local backend only for now
      // Cloud backend can be added later
      this.storageManager = new ChatHistoryStorageManager(indexedDBBackend)
      await this.storageManager.init()

      // Initialize ChatHistory with storage
      await ChatHistory.init(this.storageManager)

      // Load conversations
      await this.loadConversations()

      // Check for existing conversation or create new one
      if (this.conversations.length > 0) {
        // Load the most recent conversation
        const recent = this.conversations[0]
        await this.loadConversation(recent.id)
      } else {
        // Create first conversation
        await this.newConversation()
      }

      // Run auto-archive check
      await this.autoArchiveCheck()
    } finally {
      this._initializing = false
      this.renderComponent()
    }
  }

  async loadConversations() {
    if (!this.storageManager) return

    try {
      // Load ALL conversations (both archived and non-archived).
      // The sidebar filters them by the showArchived toggle.
      const allConversations = await this.storageManager.getConversations()

      const emptyNewConversations = allConversations.filter(
        conv => conv.title === 'New Conversation' && conv.messageCount === 0
      )
      const otherConversations = allConversations.filter(
        conv => !(conv.title === 'New Conversation' && conv.messageCount === 0)
      )

      // Purge stale empty "New Conversation" duplicates that accumulate every
      // time the page reloads before the user sends a message.  Prefer the
      // currently active one; fall back to the most-recently accessed (index 0
      // from the already-descending-sorted list).
      if (emptyNewConversations.length > 1) {
        const keepId = (emptyNewConversations.find(c => c.id === this.currentConversationId)
          ?? emptyNewConversations[0]).id
        for (const stale of emptyNewConversations.filter(c => c.id !== keepId)) {
          await this.storageManager.deleteConversation(stale.id)
        }
        const kept = emptyNewConversations.find(c => c.id === keepId)
        emptyNewConversations.length = 0
        if (kept) emptyNewConversations.push(kept)
      }

      this.conversations = [
        ...otherConversations,
        ...(emptyNewConversations.length > 0 ? [emptyNewConversations[0]] : [])
      ]
      trackMatomoEvent(this, { category: 'ai', action: 'remixAI', name: 'load_conversation', isClick: false })
      this.renderComponent()
    } catch (error) {
      console.error('Failed to load conversations:', error)
    }
  }

  async newConversation() {
    if (!this.storageManager) return

    try {
      // Reuse an existing untitled empty conversation rather than creating a new
      // DB record on every call.  Multiple page reloads without sending a message
      // were the root cause of "different IDs, same title" in the sidebar.
      const emptyExisting = this.conversations.find(
        c => c.title === 'New Conversation' && c.messageCount === 0
      )
      if (emptyExisting) {
        this.currentConversationId = emptyExisting.id
        this.history = []
        ChatHistory.setCurrentConversation(emptyExisting.id)
        ChatHistory.clearHistory()
        this.renderComponent()
        return
      }

      const workspace = 'default'
      this.currentConversationId = await ChatHistory.startNewConversation(workspace)
      this.history = []
      await this.loadConversations()
      trackMatomoEvent(this, { category: 'ai', action: 'remixAI', name: 'create_new_conversation', isClick: true })
      this.renderComponent()
    } catch (error) {
      console.error('Failed to create new conversation:', error)
    }
  }

  async loadConversation(id: string) {
    if (!this.storageManager) return

    try {
      // Load messages from storage
      const messages = await this.storageManager.getMessages(id)
      this.history = messages
      this.currentConversationId = id

      // Update ChatHistory context
      await ChatHistory.loadConversation(id)
      trackMatomoEvent(this, { category: 'ai', action: 'remixAI', name: 'load_conversation', isClick: true })
      this.renderComponent()
    } catch (error) {
      console.error('Failed to load conversation:', error)
    }
  }

  async archiveConversation(id: string) {
    if (!this.storageManager) return

    try {
      const conversation = await this.storageManager.getConversation(id)
      if (conversation) {
        await this.storageManager.updateConversation(id, {
          archived: !conversation.archived,
          archivedAt: !conversation.archived ? Date.now() : undefined
        })
        trackMatomoEvent(this, { category: 'ai', action: 'remixAI', name: 'archive_conversation', isClick: true })

        // Reload conversations
        await this.loadConversations()

        // If we archived the current conversation, create a new one, clear AI chat history
        if (id === this.currentConversationId && !conversation.archived) {
          ChatHistory.clearHistory()
          await this.newConversation()
          trackMatomoEvent(this, { category: 'ai', action: 'remixAI', name: 'new_conversation', isClick: false })
        }
      }
    } catch (error) {
      console.error('Failed to archive conversation:', error)
    }
  }

  async deleteConversation(id: string) {
    if (!this.storageManager) return

    try {
      await this.storageManager.deleteConversation(id)
      trackMatomoEvent(this, { category: 'ai', action: 'remixAI', name: 'delete_conversation', isClick: true })
      // Reload conversations
      await this.loadConversations()

      // If we deleted the current conversation, create a new one
      if (id === this.currentConversationId) {
        await this.newConversation()
        trackMatomoEvent(this, { category: 'ai', action: 'remixAI', name: 'create_new_conversation', isClick: false })
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error)
    }
  }

  async deleteAllConversations() {
    if (!this.storageManager) return

    try {
      const deletePromises = this.conversations.map(conv =>
        this.storageManager.deleteConversation(conv.id)
      )
      await Promise.all(deletePromises)

      trackMatomoEvent(this, { category: 'ai', action: 'remixAI', name: 'delete_all_conversations', isClick: true })

      await this.loadConversations()

      await this.newConversation()
      trackMatomoEvent(this, { category: 'ai', action: 'remixAI', name: 'create_new_conversation', isClick: false })
    } catch (error) {
      console.error('Failed to delete all conversations:', error)
    }
  }

  onFirstPromptSent(conversationId: string, prompt: string) {
    if (!conversationId) return

    const title = prompt.substring(0, 50)
    const preview = prompt.substring(0, 100)

    // Optimistic in-memory update so the sidebar shows the title immediately.
    // messageCount stays at its current DB value (0) — the actual increment
    // happens once saveBatch completes.  We set it to 1 here only to satisfy
    // the sidebar's `messageCount > 0` visibility filter during streaming.
    this.conversations = this.conversations.map(conv => {
      if (conv.id !== conversationId || conv.messageCount > 0) return conv
      return { ...conv, title, preview, messageCount: 1, updatedAt: Date.now() }
    })
    this.renderComponent()

    // Persist the title to DB immediately so that any loadConversations() call
    // during streaming (e.g. triggered by touchConversation) reads the correct
    // title rather than 'New Conversation', which previously caused the
    // conversation to be mis-classified in the emptyNewConversations filter.
    if (this.storageManager) {
      this.storageManager.updateConversation(conversationId, {
        title,
        preview,
        updatedAt: Date.now()
      }).catch(err => console.error('Failed to persist conversation title:', err))
    }
  }

  toggleHistorySidebar() {
    this.showHistorySidebar = !this.showHistorySidebar
    localStorage.setItem('remix-ai-history-sidebar-visible', this.showHistorySidebar.toString())
    this.renderComponent()
  }

  setMaximized(maximized: boolean) {
    this.isMaximized = maximized
    this.renderComponent()
  }

  async autoArchiveCheck() {
    if (!this.storageManager) return

    try {
      const threshold = parseInt(localStorage.getItem('remix-ai-chat-archive-threshold') || '30')
      const archivedIds = await this.storageManager.autoArchiveOldConversations(threshold)

      if (archivedIds.length > 0) {
        await this.loadConversations()
      }
    } catch (error) {
      console.error('Failed to auto-archive conversations:', error)
    }
  }

  async searchConversations(query: string): Promise<ConversationMetadata[]> {
    if (!query.trim()) return this.conversations
    if (!this.storageManager) return this.conversations

    // Delegate to the storage backend's indexed title+preview search.
    // The previous implementation fell through to a full message-content scan
    // (N sequential getMessages() calls for N conversations) which is O(N·M)
    // and blocks the main thread noticeably with large histories.
    trackMatomoEvent(this, { category: 'ai', action: 'remixAI', name: 'search_conversations', isClick: true })
    return this.storageManager.searchConversations(query)
  }

  onDeactivation() {}

  async makePluginCall(pluginName: string, methodName: string, payload: any) {
    try {
      const result = await this.call(pluginName, methodName, payload)
      return result
    } catch (error) {
      if (pluginName === 'fileManager' && methodName === 'getCurrentFile') {
        await this.call('notification', 'alert', 'No file is open')
        return null
      }
      console.error(error)
      return null
    }
  }

  getInitialState() {
    return {
      isInitializing: this._initializing,
      queuedMessage: this.queuedMessage,
      conversations: this.conversations,
      currentConversationId: this.currentConversationId,
      showHistorySidebar: this.showHistorySidebar,
      isMaximized: this.isMaximized
    }
  }

  setAppStateDispatch(appStateDispatch: React.Dispatch<AppAction>) {
    this.appStateDispatch = appStateDispatch
  }

  setDispatch(dispatch: React.Dispatch<any>) {
    this.dispatch = dispatch
    // Safety: if React wired up but initializeStorage was never called
    // (onActivation not triggered), clear the spinner so it doesn't hang.
    if (this._initializing && !this._initStarted) {
      this._initializing = false
    }
    this.renderComponent()
  }

  renderComponent() {
    this.dispatch({
      isInitializing: this._initializing,
      queuedMessage: this.queuedMessage,
      conversations: this.conversations,
      currentConversationId: this.currentConversationId,
      showHistorySidebar: this.showHistorySidebar,
      isMaximized: this.isMaximized
    })
  }

  chatPipe = (message: string) => {
    // Show right side panel if it's hidden
    this.call('rightSidePanel', 'isPanelHidden').then((isPanelHidden) => {
      if (isPanelHidden) {
        this.call('rightSidePanel', 'togglePanel')
      }
    })

    // Navigate back to chat view if the history sidebar is open
    if (this.showHistorySidebar) {
      this.showHistorySidebar = false
      localStorage.setItem('remix-ai-history-sidebar-visible', 'false')
      this.renderComponent()
    }

    // If the inner component is mounted, call it directly
    if (this.chatRef?.current) {
      this.chatRef.current.sendChat(message)
      return
    }

    // Otherwise queue it for first render
    this.queuedMessage = {
      text: message,
      timestamp: Date.now()
    }
    this.renderComponent()
  }

  handleExternalMessage = (message: string) => {
    this.externalMessage = message
    this.renderComponent()
  }

  onReady() {
    console.log('RemixAiAssistant onReady')
  }

  render() {
    return (
      <div id="remix-ai-assistant"
        data-id="remix-ai-assistant"
        className="ai-assistant-bg"
      >
        <PluginViewWrapper plugin={this} />
      </div>
    )
  }

  async handleActivity(type: string, payload: any) {
    // Never log user prompts - only track the activity type
    const eventName = type === 'promptSend' ? 'remixai-assistant-promptSend' : `remixai-assistant-${type}-${payload}`;
    trackMatomoEvent(this, { category: 'ai', action: 'remixAI', name: `chatting${type}-${payload}`, isClick: true })
  }

  updateComponent(state: {
    isInitializing: boolean
    queuedMessage: { text: string, timestamp: number } | null
    conversations: ConversationMetadata[]
    currentConversationId: string | null
    showHistorySidebar: boolean
    isMaximized: boolean
  }) {
    return (
      <RemixUiRemixAiAssistant
        onActivity={this.handleActivity.bind(this)}
        ref={this.chatRef}
        plugin={this}
        onOpenSkillsModal={() => this.appStateDispatch({ type: appActionTypes.showSkillsModal, payload: true })}
        isInitializing={state.isInitializing}
        initialMessages={this.history}
        onMessagesChange={(msgs) => { this.history = msgs }}
        queuedMessage={state.queuedMessage}
        conversations={state.conversations}
        currentConversationId={state.currentConversationId}
        showHistorySidebar={state.showHistorySidebar}
        isMaximized={state.isMaximized}
        onNewConversation={this.newConversation.bind(this)}
        onLoadConversation={this.loadConversation.bind(this)}
        onArchiveConversation={this.archiveConversation.bind(this)}
        onDeleteConversation={this.deleteConversation.bind(this)}
        onDeleteAllConversations={this.deleteAllConversations.bind(this)}
        onToggleHistorySidebar={this.toggleHistorySidebar.bind(this)}
        onSearch={this.searchConversations.bind(this)}
      />
    )
  }

}
