/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import React, { useState, useEffect, useRef } from 'react'
import { ConversationMetadata } from '../lib/types'
import { CustomTooltip } from '@remix-ui/helper'
import { ConversationItem } from './conversationItem'
import { AIPanelEmpty } from './aiPanel'
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

const DAY = 24 * 60 * 60 * 1000

/** Today / Yesterday / Previous 7 days / Older, by calendar day */
const dateGroupOf = (timestamp: number) => {
  const startOfToday = new Date().setHours(0, 0, 0, 0)
  if (timestamp >= startOfToday) return 'Today'
  if (timestamp >= startOfToday - DAY) return 'Yesterday'
  if (timestamp >= startOfToday - 7 * DAY) return 'Previous 7 days'
  return 'Older'
}

/** Consecutive runs of the same date group, newest first */
const groupByDate = (conversations: ConversationMetadata[]) => {
  const groups: { name: string, items: ConversationMetadata[] }[] = []
  ;[...conversations].sort((a, b) => b.lastAccessedAt - a.lastAccessedAt).forEach((conv) => {
    const name = dateGroupOf(conv.lastAccessedAt)
    const last = groups[groups.length - 1]
    if (last && last.name === name) last.items.push(conv)
    else groups.push({ name, items: [conv]})
  })
  return groups
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
      className={`ai-history d-flex flex-column h-100 ${isFloating ? 'chat-history-sidebar-floating ' : isMaximized ? 'chat-history-sidebar-maximized ai-resizable-panel' : 'w-100'}`}
      style={isMaximized && !isFloating ? { width } : undefined}
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
      {/* The archived list goes back to the chat history (the docked view's own back row is hidden then) */}
      {showArchived && (
        <div className="ai-panel-back-row">
          <button type="button" className="ai-panel-back-btn" onClick={onToggleArchived} data-id="toggle-archived-btn">
            <i className="fas fa-chevron-left"></i>
            <span>Chat history</span>
          </button>
        </div>
      )}
      <div className="ai-history-head">
        <span className="ai-history-title text-truncate" data-id="chat-history-sidebar-title">{showArchived ? 'Archived' : 'Chat history'}</span>
        <div className="d-flex align-items-center gap-1">
          {onDeleteAllConversations && filteredConversations.length > 0 && (
            <div className="position-relative" ref={listMenuRef}>
              <CustomTooltip tooltipText="More actions">
                <button
                  type="button"
                  className="ai-history-icon-btn chat-history-menu-btn"
                  onClick={() => setShowListMenu(!showListMenu)}
                  aria-label="More actions"
                  aria-expanded={showListMenu}
                  data-id="chat-history-menu-btn"
                >
                  <i className="fas fa-ellipsis-h"></i>
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
              <button type="button" className="ai-history-icon-btn" onClick={onClose} aria-label="Close chat history" data-id="close-sidebar-btn">
                <i className="fas fa-times"></i>
              </button>
            </CustomTooltip>
          )}
        </div>
      </div>

      <div className="ai-history-search">
        <i className={`fas ${isSearching ? 'fa-spinner fa-spin' : 'fa-search'}`}></i>
        <input
          type="text"
          placeholder="Search conversations"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          data-id="search-conversations-input"
        />
      </div>

      {/* Conversation list, in date groups */}
      <div className="ai-history-list">
        {filteredConversations.length === 0 ? (
          searchQuery
            ? <AIPanelEmpty icon="fas fa-search" message="No conversations found" dataId="no-conversations-msg" />
            : showArchived
              ? <AIPanelEmpty icon="fas fa-archive" message="No archived conversations" dataId="no-conversations-msg" />
              : <AIPanelEmpty icon="fas fa-comments" message="No conversations yet" hint="Start a new conversation to begin" dataId="no-conversations-msg" />
        ) : (
          groupByDate(filteredConversations).map(group => (
            <div key={group.name}>
              <div className="ai-history-group">{group.name}</div>
              {group.items.map(conv => (
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
              ))}
            </div>
          ))
        )}
        {!showArchived && !searchQuery && archivedCount > 0 && (
          <button type="button" className="ai-conv ai-history-archived-row" onClick={onToggleArchived} data-id="toggle-archived-btn">
            <i className="fas fa-archive"></i>
            <span className="ai-conv-title">Archived</span>
            <span className="ai-conv-time">{archivedCount}</span>
            <i className="fas fa-chevron-right ai-history-chevron"></i>
          </button>
        )}
      </div>
    </div>
  )
}
