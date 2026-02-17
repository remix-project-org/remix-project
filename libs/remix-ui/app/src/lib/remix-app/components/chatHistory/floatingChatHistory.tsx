/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import React, { useState, useEffect, useCallback } from 'react'
import { ConversationMetadata } from '@remix/remix-ai-core'
import { CustomTooltip } from '@remix-ui/helper'
import { ChatHistoryItem } from './chatHistoryItem'

interface FloatingChatHistoryProps {
  conversations: ConversationMetadata[]
  currentConversationId: string | null
  showArchived: boolean
  onNewConversation: () => void
  onLoadConversation: (id: string) => void
  onArchiveConversation: (id: string) => void
  onDeleteConversation: (id: string) => void
  onToggleArchived: () => void
  onClose: () => void
  isFloating?: boolean
  isMaximized?: boolean
  panelWidth?: number | string
  theme?: string
}

export const FloatingChatHistory: React.FC<FloatingChatHistoryProps> = ({
  conversations,
  currentConversationId,
  showArchived,
  onNewConversation,
  onLoadConversation,
  onArchiveConversation,
  onDeleteConversation,
  onToggleArchived,
  onClose,
  isFloating = false,
  isMaximized = false,
  panelWidth,
  theme = 'dark'
}) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [filteredConversations, setFilteredConversations] = useState<ConversationMetadata[]>([])
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(currentConversationId)
  const defaultPanelWidth = '350px'
  const resolvedPanelWidth = panelWidth !== undefined
    ? typeof panelWidth === 'number' ? `${panelWidth}px` : panelWidth
    : defaultPanelWidth
  const sidebarStyle = isMaximized && !isFloating
    ? { width: resolvedPanelWidth, minWidth: resolvedPanelWidth, maxWidth: resolvedPanelWidth }
    : isFloating
      ? { width: resolvedPanelWidth, minWidth: resolvedPanelWidth }
      : panelWidth !== undefined
        ? { width: resolvedPanelWidth, minWidth: resolvedPanelWidth, maxWidth: resolvedPanelWidth, backgroundColor: theme.toLowerCase() === 'dark' ? '#2a2c3f' : 'var(--light-background-color)' }
        : { minWidth: defaultPanelWidth, backgroundColor: 'transparent' }

  useEffect(() => {
    let filtered = conversations

    // Filter by archived status
    filtered = filtered.filter(conv => conv.archived === showArchived)

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(conv =>
        conv.title.toLowerCase().includes(query) ||
        conv.preview.toLowerCase().includes(query)
      )
    }

    setFilteredConversations(filtered)
  }, [conversations, showArchived, searchQuery])

  useEffect(() => {
    setSelectedConversationId(currentConversationId)
  }, [currentConversationId])

  const archivedCount = conversations.filter(c => c.archived).length

  return (
    <div
      className={`d-flex flex-column h-100 ${isFloating ? 'border-end' : isMaximized ? 'border-end' : 'w-100'}`}
      style={sidebarStyle}
      data-id="chat-history-sidebar-maximized"
    >
      {/* Header */}
      <div className="p-3">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h6 className={`mb-0 fw-normal ${theme.toLowerCase() === 'dark' ? 'text-light' : ''} sidebar-title`}>
            {isMaximized ? 'Your chats' : 'Chat history'} <span className="text-muted">{filteredConversations.length}</span>
          </h6>
        </div>

        {/* New Conversation Button */}

        {/* Search Bar */}
        <div className="mb-2 p-1">
          <i className="fas fa-search search-icon"></i>
          <input
            type="text"
            className="form-control ps-4"
            style={{ backgroundColor: theme.toLowerCase() === 'dark' ? '#333446' : 'var(--light-background-color)', color: theme.toLowerCase() === 'dark' ? 'var(--text-color)' : '#333446' }}
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-id="search-conversations-input-maximized"
          />
        </div>

        {/* Archive Toggle */}
        <div className="d-flex justify-content-between align-items-center">
          <button
            className={`btn btn-sm btn-archive-toggle ${showArchived ? 'active' : ''}`}
            onClick={onToggleArchived}
            data-id="toggle-archived-btn"
          >
            <i className="fas fa-archive me-2"></i>
            {showArchived ? 'Show Active' : `Archived (${archivedCount})`}
          </button>
          {/* <span className="text-muted small">Workspace</span> */}
        </div>
      </div>

      {/* Conversation List */}
      <div
        className="sidebar-body flex-grow-1 overflow-y-auto p-2"
        style={{
          backgroundColor: theme.toLowerCase() === 'dark' ? '#1e1e2e' : 'var(--light-background-color)',
          overflowX: 'hidden',
          overflowY: 'auto',
          flex: 1,
          minHeight: 0
        }}
      >
        {filteredConversations.length === 0 ? (
          <div className="text-center text-muted mt-4">
            {searchQuery ? (
              <>
                <i className="fas fa-search fa-2x mb-2"></i>
                <p>No conversations found</p>
              </>
            ) : showArchived ? (
              <>
                <i className="fas fa-archive fa-2x mb-2"></i>
                <p>No archived conversations</p>
              </>
            ) : (
              <>
                <i className="fas fa-comments fa-2x mb-2"></i>
                <p>No conversations yet</p>
                <small>Start a new conversation to begin</small>
              </>
            )}
          </div>
        ) : (
          filteredConversations.map(conv => (
            <ChatHistoryItem
              key={conv.id}
              conversation={conv}
              active={conv.id === selectedConversationId}
              theme={theme}
              onClick={() => {
                setSelectedConversationId(conv.id)
                // Automatically unarchive if the conversation is archived
                if (conv.archived) {
                  onArchiveConversation(conv.id)
                }
                onLoadConversation(conv.id)
              }}
              onArchive={(e) => {
                e.stopPropagation()
                onArchiveConversation(conv.id)
              }}
              onDelete={(e) => {
                e.stopPropagation()
                if (confirm(`Delete conversation "${conv.title}"?`)) {
                  onDeleteConversation(conv.id)
                }
              }}
            />
          ))
        )}
      </div>
    </div>
  )
}
