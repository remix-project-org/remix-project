/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import React, { useState, useEffect } from 'react'
import { ConversationMetadata } from '../lib/types'
import { CustomTooltip } from '@remix-ui/helper'
import { ConversationItem } from './conversationItem'

interface ChatHistorySidebarProps {
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
  theme?: string
}

export const ChatHistorySidebar: React.FC<ChatHistorySidebarProps> = ({
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
  theme = 'dark'
}) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [filteredConversations, setFilteredConversations] = useState<ConversationMetadata[]>([])

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

  const archivedCount = conversations.filter(c => c.archived).length

  return (
    <div
      className={`chat-history-sidebar border-0 d-flex flex-column h-100 ${isFloating ? 'chat-history-sidebar-floating ' : isMaximized ? '' : 'w-100'}`}
      style={isMaximized && !isFloating ? { width: '350px', minWidth: '350px', maxWidth: '350px' } : isFloating ? { width: '350px', minWidth: '350px' } : { minWidth: '350px', backgroundColor: theme === 'dark' ? 'var(--bs-dark)' : 'var(--bs-light)' }}
      data-id="chat-history-sidebar"
      data-theme={theme?.toLowerCase()}
    >
      {/* Header */}
      <div className="border-0 p-3" style={{ backgroundColor: theme.toLowerCase() === 'dark' ? '#222336' : '#eff1f5' }}>
        <div className="d-flex justify-content-between align-items-center mb-3">
          {isMaximized && (
            <CustomTooltip tooltipText="Close sidebar">
              <button
                className="btn btn-sm p-0 sidebar-close-btn"
                onClick={onClose}
                data-id="close-sidebar-btn"
              >
                <i className="fas fa-times"></i>
              </button>
            </CustomTooltip>
          )}
        </div>

        {/* Search Bar */}
        <div className="search-bar mb-2 p-1">
          <i className="fas fa-search search-icon"></i>
          <input
            type="text"
            className="form-control search-input ps-4 "
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-id="search-conversations-input"
            style={{ backgroundColor: theme.toLowerCase() === 'dark' ? '#333446' : '#e4e8f1', color: theme.toLowerCase() === 'dark' ? '#FFF' : '#333446' }}
          />
        </div>

        {/* Archive Toggle */}
        <div className="d-flex justify-content-between align-items-center">
          <h6 className="mb-0 fw-normal sidebar-title" data-id="chat-history-sidebar-title">
            {'Chat history'} <span className="ms-2 text-muted">{filteredConversations.length}</span>
          </h6>
          <button
            className={`btn btn-sm btn-archive-toggle ${showArchived ? 'active' : ''}`}
            onClick={onToggleArchived}
            data-id="toggle-archived-btn"
          >
            <i className="fas fa-archive me-2"></i>
            {showArchived ? 'Show Active' : `Archived (${archivedCount})`}
          </button>
        </div>
      </div>

      {/* Conversation List */}
      <div className="sidebar-body flex-grow-1 overflow-y-auto p-2">
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
            <ConversationItem
              key={conv.id}
              conversation={conv}
              theme={theme}
              active={conv.id === currentConversationId}
              onClick={() => {
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
