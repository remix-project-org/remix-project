/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import { ConversationMetadata } from '@remix/remix-ai-core'
import React, { useState, useEffect, useRef } from 'react'

interface ChatHistoryItemProps {
  conversation: ConversationMetadata
  active: boolean
  onClick: () => void
  onArchive: (e: React.MouseEvent) => void
  onDelete: (e: React.MouseEvent) => void
  theme?: string
}

export const ChatHistoryItem: React.FC<ChatHistoryItemProps> = ({
  conversation,
  active,
  onClick,
  onArchive,
  onDelete,
  theme = 'dark'
}) => {
  const [showMenu, setShowMenu] = useState(false)
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
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
    const handleClickOutside = (event: any) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false)
      }
    }
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showMenu])

  const toggleMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (showMenu) {
      setShowMenu(false)
      return
    }

    const triggerRect = event.currentTarget.getBoundingClientRect()
    const sidebar = event.currentTarget.closest('[data-id="chat-history-sidebar-maximized"]')
    const sidebarRect = sidebar?.getBoundingClientRect()
    const flyoutWidth = 170
    const flyoutLeft = sidebarRect ? sidebarRect.right + 8 : triggerRect.right + 8
    const safeLeft = Math.min(flyoutLeft, window.innerWidth - flyoutWidth - 8)
    const safeTop = Math.max(8, Math.min(triggerRect.top, window.innerHeight - 110))

    setMenuPosition({
      top: safeTop,
      left: safeLeft
    })
    setShowMenu(true)
  }

  return (
    <div
      className={`conversation-item chat-history-item p-3 mb-2 rounded-3 cursor-pointer position-relative
        ${active ? 'conversation-item-active' : ''}`}
      onClick={onClick}
      data-id={`conversation-item-${conversation.id}`}
      style={{
        backgroundColor: theme.toLowerCase() === 'dark' ? '#2a2c3f' : 'var(--bs-body-bg)',
        transition: 'background-color 0.2s ease',
        cursor: 'pointer'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = theme.toLowerCase() === 'dark' ? '#2a2c3f' : 'var(--bs-body-bg)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = theme.toLowerCase() === 'dark' ? '#2a2c3f' : 'var(--bs-body-bg)'
      }}
    >
      <div className="d-flex align-items-center gap-2 flex-nowrap">
        <div className="conversation-title text-truncate flex-grow-1 mb-0">
          {conversation.title || 'New Conversation'}
        </div>
        <div className="conversation-meta text-nowrap">
          {formatDate(conversation.lastAccessedAt)} · {conversation.messageCount} message{conversation.messageCount !== 1 ? 's' : ''}
        </div>
        <div className="conversation-menu-trigger ms-1 flex-shrink-0" ref={menuRef}>
          <button
            className="btn btn-sm p-0 conversation-menu-btn"
            onClick={toggleMenu}
            data-id={`conversation-menu-${conversation.id}`}
            style={{
              color: theme.toLowerCase() === 'dark' ? '#888' : 'var(--text-color)',
              transition: 'color 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = theme.toLowerCase() === 'dark' ? '#ffffff' : 'var(--text-color)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = theme.toLowerCase() === 'dark' ? '#888' : 'var(--text-color)'
            }}
          >
            <i className="fas fa-ellipsis-v"></i>
          </button>

          {showMenu && (
            <div
              className="conversation-menu position-fixed shadow-sm"
              style={{
                top: `${menuPosition.top}px`,
                left: `${menuPosition.left}px`,
                zIndex: 1100
              }}
            >
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
