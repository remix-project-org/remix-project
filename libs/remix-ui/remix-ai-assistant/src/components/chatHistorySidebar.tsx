/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import React, { useState, useEffect, useRef } from 'react'
import { ConversationMetadata } from '../lib/types'
import { CustomTooltip } from '@remix-ui/helper'
import { ConversationItem } from './conversationItem'

interface ChatHistorySidebarProps {
  conversations: ConversationMetadata[]
  currentConversationId: string | null
  showArchived: boolean
  onNewConversation: () => void
  onLoadConversation: (id: string) => Promise<void>
  onArchiveConversation: (id: string) => Promise<void>
  onDeleteConversation: (id: string) => Promise<void>
  onDeleteAllConversations?: () => void
  onToggleArchived: () => void
  onClose: () => void
  onSearch?: (query: string) => Promise<ConversationMetadata[]>
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
  onDeleteAllConversations,
  onToggleArchived,
  onClose,
  onSearch,
  isFloating = false,
  isMaximized = false,
  theme = 'dark'
}) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [filteredConversations, setFilteredConversations] = useState<ConversationMetadata[]>([])
  const [isSearching, setIsSearching] = useState(false)
  // List actions (Delete all) menu in the header
  const [showListMenu, setShowListMenu] = useState(false)
  const listMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showListMenu) return
    const handleClickOutside = (event: MouseEvent) => {
      if (listMenuRef.current && !listMenuRef.current.contains(event.target as Node)) setShowListMenu(false)
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowListMenu(false)
    }
    document.addEventListener('mousedown', handleClickOutside, true)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [showListMenu])

  useEffect(() => {
    let cancelled = false

    const doFilter = async () => {
      if (searchQuery.trim() && onSearch) {
        setIsSearching(true)
        try {
          const results = await onSearch(searchQuery)
          if (!cancelled) {
            setFilteredConversations(results.filter(conv => conv.archived === showArchived && conv.messageCount > 0))
          }
        } finally {
          if (!cancelled) setIsSearching(false)
        }
        return
      }

      // Local filter: archived status + title/preview
      let filtered = conversations.filter(conv => conv.archived === showArchived && conv.messageCount > 0)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        filtered = filtered.filter(conv =>
          conv.title.toLowerCase().includes(query) ||
          conv.preview.toLowerCase().includes(query)
        )
      }
      if (!cancelled) setFilteredConversations(filtered)
    }

    doFilter()
    return () => { cancelled = true }
  }, [conversations, showArchived, searchQuery, onSearch])

  const archivedCount = conversations.filter(c => c.archived && c.messageCount > 0).length

  return (
    <div
      className={`chat-history-sidebar border-0 d-flex flex-column h-100 ${isFloating ? 'chat-history-sidebar-floating ' : isMaximized ? 'chat-history-sidebar-maximized' : 'w-100'}`}
      style={isMaximized || isFloating ? undefined : { backgroundColor: theme === 'dark' ? 'var(--bs-dark)' : 'var(--bs-light)' }}
      data-id="chat-history-sidebar"
      data-theme={theme?.toLowerCase()}
    >
      {/* Header: title + count (+ close in AI mode), search, list actions */}
      <div className="chat-history-sidebar-header border-0 px-3 pt-3 pb-2" style={{ backgroundColor: theme.toLowerCase() === 'dark' ? '#222336' : '#eff1f5' }}>
        <div className="d-flex justify-content-between align-items-center mb-2">
          <h6 className="mb-0 fw-semibold sidebar-title text-truncate" data-id="chat-history-sidebar-title">
            {'Chat History'} <span className="ms-1 fw-normal text-muted">{filteredConversations.length}</span>
          </h6>
          <div className="d-flex align-items-center gap-1">
            {onDeleteAllConversations && filteredConversations.length > 0 && (
              <div className="position-relative" ref={listMenuRef}>
                <CustomTooltip tooltipText="More actions">
                  <button
                    className="btn btn-sm p-0 conversation-menu-btn chat-history-menu-btn"
                    onClick={() => setShowListMenu(!showListMenu)}
                    aria-label="More actions"
                    aria-expanded={showListMenu}
                    data-id="chat-history-menu-btn"
                  >
                    <i className="fas fa-ellipsis-v"></i>
                  </button>
                </CustomTooltip>
                {showListMenu && (
                  <div className="conversation-menu position-absolute end-0 mt-1 shadow-sm" style={{ zIndex: 1100 }} data-id="chat-history-menu">
                    <button
                      className="conversation-menu-item conversation-menu-item-danger w-100 text-start text-nowrap"
                      onClick={() => {
                        setShowListMenu(false)
                        const confirmMsg = showArchived
                          ? `Delete all ${filteredConversations.length} archived conversations? This action cannot be undone.`
                          : `Delete all ${filteredConversations.length} conversations? This action cannot be undone.`
                        if (confirm(confirmMsg)) {
                          onDeleteAllConversations()
                        }
                      }}
                      data-id="delete-all-conversations-btn"
                    >
                      <i className="fas fa-trash me-2"></i>
                      {showArchived ? 'Delete all archived' : 'Delete all conversations'}
                    </button>
                  </div>
                )}
              </div>
            )}
            {isMaximized && (
              <CustomTooltip tooltipText="Close chat history">
                <button
                  className="btn btn-sm p-0 sidebar-close-btn d-inline-flex align-items-center"
                  onClick={onClose}
                  data-id="close-sidebar-btn"
                >
                  <i className="fas fa-times"></i>
                </button>
              </CustomTooltip>
            )}
          </div>
        </div>

        {/* Search Bar */}
        <div className="search-bar mb-2">
          <i className={`fas ${isSearching ? 'fa-spinner fa-spin' : 'fa-search'} search-icon`}></i>
          <input
            type="text"
            className="form-control form-control-sm search-input"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-id="search-conversations-input"
            style={{ paddingLeft: '2.25rem', backgroundColor: theme.toLowerCase() === 'dark' ? '#333446' : '#e4e8f1', color: theme.toLowerCase() === 'dark' ? '#FFF' : '#333446' }}
          />
        </div>

        <div className="d-flex align-items-center">
          <button
            className={`btn btn-sm btn-archive-toggle chat-history-action ${showArchived ? 'active' : ''}`}
            onClick={onToggleArchived}
            data-id="toggle-archived-btn"
          >
            <i className={`fas ${showArchived ? 'fa-arrow-left' : 'fa-archive'} me-1`}></i>
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
                <p data-id="no-conversations-msg">No conversations found</p>
              </>
            ) : showArchived ? (
              <>
                <i className="fas fa-archive fa-2x mb-2"></i>
                <p data-id="no-conversations-msg">No archived conversations</p>
              </>
            ) : (
              <>
                <i className="fas fa-comments fa-2x mb-2"></i>
                <p data-id="no-conversations-msg">No conversations yet</p>
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
              onClick={async () => {
                // Automatically unarchive if the conversation is archived
                if (conv.archived) {
                  await onArchiveConversation(conv.id)
                }
                await onLoadConversation(conv.id)
              }}
              onArchive={async (e) => {
                e.stopPropagation()
                await onArchiveConversation(conv.id)
              }}
              onDelete={async (e) => {
                e.stopPropagation()
                if (confirm(`Delete conversation "${conv.title}"?`)) {
                  await onDeleteConversation(conv.id)
                }
              }}
            />
          ))
        )}
      </div>
    </div>
  )
}
