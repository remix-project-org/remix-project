/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import React, { useState, useEffect } from 'react'
import { ConversationMetadata } from '../lib/types'
import { CustomTooltip } from '@remix-ui/helper'
import { ConversationItem } from './conversationItem'
import { ContractEnvironment } from './ContractEnvironment'

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
  /** AI-first user space */
  networkName?: string
  walletAddress?: string
  providers?: { name: string, displayName: string, category?: string }[]
  selectedProvider?: string
  accounts?: { account: string, alias?: string }[]
  onSelectNetwork?: (name: string) => void
  onSelectAccount?: (account: string) => void
}

const DAY_MS = 24 * 60 * 60 * 1000

type ConversationGroup = {
  label: string
  items: ConversationMetadata[]
}

// Group conversations into Today / Yesterday / Last 7 days / Older buckets,
// based on lastAccessedAt. Buckets are returned in display order, empty ones omitted.
function groupConversationsByDate(conversations: ConversationMetadata[]): ConversationGroup[] {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfYesterday = startOfToday - DAY_MS
  const startOf7DaysAgo = startOfToday - 7 * DAY_MS

  const today: ConversationMetadata[] = []
  const yesterday: ConversationMetadata[] = []
  const last7Days: ConversationMetadata[] = []
  const older: ConversationMetadata[] = []

  // Already sorted descending by lastAccessedAt upstream; keep that order.
  for (const conv of conversations) {
    const ts = conv.lastAccessedAt || conv.updatedAt || conv.createdAt || 0
    if (ts >= startOfToday) today.push(conv)
    else if (ts >= startOfYesterday) yesterday.push(conv)
    else if (ts >= startOf7DaysAgo) last7Days.push(conv)
    else older.push(conv)
  }

  return [
    { label: 'Today', items: today },
    { label: 'Yesterday', items: yesterday },
    { label: 'Last 7 days', items: last7Days },
    { label: 'Older', items: older }
  ].filter(group => group.items.length > 0)
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
  theme = 'dark',
  networkName,
  walletAddress,
  providers = [],
  selectedProvider,
  accounts = [],
  onSelectNetwork,
  onSelectAccount
}) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [filteredConversations, setFilteredConversations] = useState<ConversationMetadata[]>([])
  const [isSearching, setIsSearching] = useState(false)

  const isDark = theme.toLowerCase() === 'dark'

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
  const groups = groupConversationsByDate(filteredConversations)

  return (
    <div
      className={`chat-history-sidebar border-0 d-flex flex-column h-100 ${isFloating ? 'chat-history-sidebar-floating ' : isMaximized ? '' : 'w-100'}`}
      style={isMaximized && !isFloating ? { width: '280px', minWidth: '280px', maxWidth: '280px' } : isFloating ? { width: '280px', minWidth: '280px' } : { minWidth: '280px', backgroundColor: isDark ? 'var(--bs-dark)' : 'var(--bs-light)' }}
      data-id="chat-history-sidebar"
      data-theme={theme?.toLowerCase()}
    >
      <div className="border-0 p-3">
        <button
          className="btn btn-sm w-100 d-flex align-items-center gap-2 mb-3 new-chat-sidebar-btn"
          onClick={onNewConversation}
          data-id="sidebar-new-chat-btn"
          style={{
            backgroundColor: isDark ? '#3a3a52' : '#e0e5f0',
            color: isDark ? '#e8e8e8' : '#333',
            border: 'none',
            padding: '8px 12px',
            justifyContent: 'flex-start',
            fontWeight: 500
          }}
        >
          <i className="fas fa-pen-to-square"></i>
          <span>New chat</span>
        </button>
        <div className="search-bar mb-2 p-1">
          <i className={`fas ${isSearching ? 'fa-spinner fa-spin' : 'fa-search'} search-icon`}></i>
          <input
            type="text"
            className="form-control search-input ps-4 "
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-id="search-conversations-input"
            style={{ backgroundColor: isDark ? '#333446' : '#e4e8f1', color: isDark ? '#FFF' : '#333446' }}
          />
        </div>
        <div className="d-flex justify-content-end align-items-center gap-2">
          <button
            className={`btn btn-sm btn-archive-toggle ${showArchived ? 'active' : ''}`}
            onClick={onToggleArchived}
            data-id="toggle-archived-btn"
            style={{ fontSize: '11px' }}
          >
            <i className="fas fa-archive me-1"></i>
            {showArchived ? 'Active' : `Archived (${archivedCount})`}
          </button>
          {onDeleteAllConversations && filteredConversations.length > 0 && (
            <CustomTooltip tooltipText="Delete all conversations">
              <button
                className="btn btn-sm btn-danger"
                onClick={() => {
                  const confirmMsg = showArchived
                    ? `Delete all ${filteredConversations.length} archived conversations? This action cannot be undone.`
                    : `Delete all ${filteredConversations.length} conversations? This action cannot be undone.`
                  if (confirm(confirmMsg)) {
                    onDeleteAllConversations()
                  }
                }}
                data-id="delete-all-conversations-btn"
                style={{ fontSize: '11px' }}
              >
                <i className="fas fa-trash-alt"></i>
              </button>
            </CustomTooltip>
          )}
        </div>
      </div>
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
          groups.map(group => (
            <div key={group.label} className="mb-2">
              <div
                className="px-1 py-1 fw-bold text-uppercase"
                style={{ fontSize: '10px', opacity: 0.6, letterSpacing: '0.5px' }}
              >
                {group.label}
              </div>
              {group.items.map(conv => (
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
              ))}
            </div>
          ))
        )}
      </div>
      <ContractEnvironment
        networkName={networkName}
        walletAddress={walletAddress}
        providers={providers}
        selectedProvider={selectedProvider}
        accounts={accounts}
        onSelectNetwork={onSelectNetwork}
        onSelectAccount={onSelectAccount}
        theme={theme}
      />
    </div>
  )
}
