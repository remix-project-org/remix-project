/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import React, { useState, useEffect, useRef } from 'react'
import { ConversationMetadata } from '../lib/types'
import { CustomTooltip } from '@remix-ui/helper'

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
}

interface ConversationItemProps {
  conversation: ConversationMetadata
  active: boolean
  onClick: () => void
  onArchive: (e: React.MouseEvent) => void
  onDelete: (e: React.MouseEvent) => void
}

const ConversationItem: React.FC<ConversationItemProps> = ({
  conversation,
  active,
  onClick,
  onArchive,
  onDelete
}) => {
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))

    if (diffHours < 1) return 'Just now'
    if (diffHours < 24) return `${diffHours}h ago`

    const diffDays = Math.floor(diffHours / 24)
    if (diffDays === 1) return '1d ago'
    if (diffDays < 7) return `${diffDays}d ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
    return `${Math.floor(diffDays / 30)}mo ago`
  }

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false)
      }
    }
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showMenu])

  return (
    <div
      className={`conversation-item p-3 mb-1 rounded-3 cursor-pointer position-relative ${active ? 'conversation-item-active' : ''}`}
      onClick={onClick}
      data-id={`conversation-item-${conversation.id}`}
    >
      <div className="d-flex justify-content-between align-items-start">
        <div className="flex-grow-1 overflow-hidden pe-2">
          <div className="conversation-title text-truncate mb-1">
            {conversation.title || 'New Conversation'}
          </div>
          <div className="conversation-meta">
            {formatDate(conversation.lastAccessedAt)} · {conversation.messageCount} message{conversation.messageCount !== 1 ? 's' : ''}
          </div>
        </div>

        <div className="conversation-menu-trigger" ref={menuRef}>
          <button
            className="btn btn-sm p-0 conversation-menu-btn"
            onClick={(e) => {
              e.stopPropagation()
              setShowMenu(!showMenu)
            }}
            data-id={`conversation-menu-${conversation.id}`}
          >
            <i className="fas fa-ellipsis-v"></i>
          </button>

          {showMenu && (
            <div className="conversation-menu position-absolute end-0 mt-1 shadow-sm">
              <button
                className="conversation-menu-item w-100 text-start"
                onClick={(e) => {
                  e.stopPropagation()
                  onArchive(e)
                  setShowMenu(false)
                }}
              >
                <i className={`fas ${conversation.archived ? 'fa-inbox' : 'fa-archive'} me-2`}></i>
                {conversation.archived ? 'Unarchive' : 'Archive'}
              </button>
              <button
                className="conversation-menu-item conversation-menu-item-danger w-100 text-start"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(e)
                  setShowMenu(false)
                }}
              >
                <i className="fas fa-trash me-2"></i>
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
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
  isFloating = false
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
      className={`chat-history-sidebar d-flex flex-column h-100 ${isFloating ? 'chat-history-sidebar-floating border-end' : 'w-100'}`}
      style={isFloating ? { width: '300px', minWidth: '300px' } : {}}
      data-id="chat-history-sidebar"
    >
      {/* Header */}
      <div className="sidebar-header p-3">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h6 className="mb-0 fw-normal sidebar-title">Chat history <span className="text-muted">{filteredConversations.length}</span></h6>
          <CustomTooltip tooltipText="Close sidebar">
            <button
              className="btn btn-sm p-0 sidebar-close-btn"
              onClick={onClose}
              data-id="close-sidebar-btn"
            >
              <i className="fas fa-times"></i>
            </button>
          </CustomTooltip>
        </div>

        {/* New Conversation Button */}

        {/* Search Bar */}
        <div className="search-bar mb-3">
          <i className="fas fa-search search-icon"></i>
          <input
            type="text"
            className="form-control search-input ps-4 border"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-id="search-conversations-input"
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
          <span className="text-muted small">Workspace</span>
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
