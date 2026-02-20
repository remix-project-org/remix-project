import React, { useEffect, useRef, createRef } from 'react'
import { ViewPlugin } from '@remixproject/engine-web'
import * as packageJson from '../../../../../package.json'
import { PluginViewWrapper } from '@remix-ui/helper'
import { ChatMessage, RemixUiRemixAiAssistant, RemixUiRemixAiAssistantHandle, ConversationMetadata } from '@remix-ui/remix-ai-assistant'
import { EventEmitter } from 'events'
import { trackMatomoEvent } from '@remix-api'
import { ChatHistory, ChatHistoryStorageManager, IndexedDBChatHistoryBackend } from '@remix/remix-ai-core'

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
  }

  async loadConversations() {
    if (!this.storageManager) return

    try {
      // Load ALL conversations (both archived and non-archived)
      // The sidebar will filter them based on showArchived toggle
      const allConversations = await this.storageManager.getConversations()

      // Filter out empty "New Conversation" sessions, keeping only one
      const emptyNewConversations = allConversations.filter(
        conv => conv.title === 'New Conversation' && conv.messageCount === 0
      )
      const otherConversations = allConversations.filter(
        conv => !(conv.title === 'New Conversation' && conv.messageCount === 0)
      )

      // Keep only the most recent empty "New Conversation"
      const filteredConversations = [
        ...otherConversations,
        ...(emptyNewConversations.length > 0 ? [emptyNewConversations[0]] : [])
      ]

      this.conversations = filteredConversations
      this.renderComponent()
    } catch (error) {
      console.error('Failed to load conversations:', error)
    }
  }

  async newConversation() {
    if (!this.storageManager) return

    try {
      const workspace = 'default' // Can be enhanced to get actual workspace name
      this.currentConversationId = await this.storageManager.createConversation(workspace)
      ChatHistory.setCurrentConversation(this.currentConversationId)

      // Clear current messages
      this.history = []

      // Reload conversations list
      await this.loadConversations()

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

        // Reload conversations
        await this.loadConversations()

        // If we archived the current conversation, create a new one
        if (id === this.currentConversationId && !conversation.archived) {
          await this.newConversation()
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

      // Reload conversations
      await this.loadConversations()

      // If we deleted the current conversation, create a new one
      if (id === this.currentConversationId) {
        await this.newConversation()
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error)
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
        console.log(`Auto-archived ${archivedIds.length} conversations older than ${threshold} days`)
        await this.loadConversations()
      }
    } catch (error) {
      console.error('Failed to auto-archive conversations:', error)
    }
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

  setDispatch(dispatch: React.Dispatch<any>) {
    this.dispatch = dispatch
    this.renderComponent()
  }

  renderComponent() {
    this.dispatch({
      queuedMessage: this.queuedMessage,
      conversations: this.conversations,
      currentConversationId: this.currentConversationId,
      showHistorySidebar: this.showHistorySidebar,
      isMaximized: this.isMaximized
    })
  }

  chatPipe = (message: string) => {
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
        onToggleHistorySidebar={this.toggleHistorySidebar.bind(this)}
      />
    )
  }

}
