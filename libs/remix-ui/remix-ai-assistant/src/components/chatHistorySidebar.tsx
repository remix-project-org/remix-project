/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import React, { useState, useEffect, useRef } from 'react'
import { ConversationMetadata } from '../lib/types'
import { CustomTooltip } from '@remix-ui/helper'
import { ConversationItem } from './conversationItem'
import { AIPanelEmpty, AIPanelHeader } from './aiPanel'
import { useResizableWidth } from '../hooks/useResizableWidth'

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
  // AI mode: resizable column on the right of the chat, like the changes panel
  const { panelRef, width, startResize, resetWidth } = useResizableWidth({ storageKey: 'remix-ai-history-panel-width', minWidth: 260, defaultWidth: 320 })

  return (
    <div
      ref={isMaximized && !isFloating ? panelRef : undefined}
      className={`chat-history-sidebar border-0 d-flex flex-column h-100 ${isFloating ? 'chat-history-sidebar-floating ' : isMaximized ? 'chat-history-sidebar-maximized ai-resizable-panel' : 'w-100'}`}
      style={isFloating ? undefined : isMaximized ? { width } : { backgroundColor: theme === 'dark' ? 'var(--bs-dark)' : 'var(--bs-light)' }}
      data-id="chat-history-sidebar"
      data-theme={theme?.toLowerCase()}
    >
      {isMaximized && !isFloating && (
        <div
          className="ai-panel-resize-handle"
          role="separator"
          aria-orientation="vertical"
          title="Drag to resize, double-click to reset"
          onPointerDown={startResize}
          onDoubleClick={resetWidth}
          data-id="chat-history-resize-handle"
        />
      )}
      {/* Header: title + count (+ close in AI mode), search, list actions */}
      <AIPanelHeader
        title="Chat History"
        count={filteredConversations.length}
        titleDataId="chat-history-sidebar-title"
        onClose={isMaximized ? onClose : undefined}
        closeLabel="Close chat history"
        closeDataId="close-sidebar-btn"
        theme={theme}
        actions={onDeleteAllConversations && filteredConversations.length > 0 && (
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
      >
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
      </AIPanelHeader>

      {/* Conversation List */}
      <div className="sidebar-body flex-grow-1 overflow-y-auto p-2">
        {filteredConversations.length === 0 ? (
          searchQuery
            ? <AIPanelEmpty icon="fas fa-search" message="No conversations found" dataId="no-conversations-msg" />
            : showArchived
              ? <AIPanelEmpty icon="fas fa-archive" message="No archived conversations" dataId="no-conversations-msg" />
              : <AIPanelEmpty icon="fas fa-comments" message="No conversations yet" hint="Start a new conversation to begin" dataId="no-conversations-msg" />
        ) : (
          filteredConversations.map(conv => (
            <ConversationItem
              key={conv.id}
              conversation={conv}
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
