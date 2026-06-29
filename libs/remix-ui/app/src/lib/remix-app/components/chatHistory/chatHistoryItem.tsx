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
  const menuContainerRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const menuPanelRef = useRef<HTMLDivElement>(null)

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
      if (menuContainerRef.current && !menuContainerRef.current.contains(event.target as Node)) {
        setShowMenu(false)
      }
    }
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showMenu])

  const getMenuPosition = (triggerRect: DOMRect, menuWidth = 170, menuHeight = 110) => {
    const gutter = 8
    const sidebarRect = menuButtonRef.current
      ?.closest('[data-id="chat-history-sidebar-maximized"]')
      ?.getBoundingClientRect()
    const preferredRightLeft = sidebarRect ? sidebarRect.right + gutter : triggerRect.right + gutter
    const shouldOpenLeft =
      preferredRightLeft + menuWidth > window.innerWidth &&
      triggerRect.left - gutter - menuWidth >= gutter

    return {
      top: Math.max(gutter, Math.min(triggerRect.top, window.innerHeight - menuHeight - gutter)),
      left: shouldOpenLeft
        ? triggerRect.left - menuWidth - gutter
        : Math.max(gutter, Math.min(preferredRightLeft, window.innerWidth - menuWidth - gutter))
    }
  }

  useEffect(() => {
    if (!showMenu || !menuButtonRef.current || !menuPanelRef.current) return

    const updateMenuPosition = () => {
      const triggerRect = menuButtonRef.current?.getBoundingClientRect()
      const menuWidth = menuPanelRef.current?.offsetWidth
      const menuHeight = menuPanelRef.current?.offsetHeight

      if (!triggerRect || !menuWidth || !menuHeight) return

      setMenuPosition(getMenuPosition(triggerRect, menuWidth, menuHeight))
    }

    updateMenuPosition()
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)

    return () => {
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
    }
  }, [showMenu])

  return (
    <div
      className={`conversation-item chat-history-item p-3 mb-2 rounded-3 cursor-pointer position-relative ${active ? (theme.toLowerCase() === 'light' ? 'conversation-item-active-light' : 'conversation-item-active') : ''}`}
      onClick={onClick}
      data-id={`conversation-item-${conversation.id}`}
      data-theme={theme.toLowerCase()}
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
        <div className={`conversation-title text-truncate flex-grow-1 mb-0 ${theme.toLowerCase() === 'dark' ? 'text-secondary' : 'text-dark'}`}>
          {conversation.title}
        </div>
        <div className={`conversation-meta text-nowrap ${theme.toLowerCase() === 'dark' ? 'text-secondary' : 'text-muted'} small`}>
          {formatDate(conversation.lastAccessedAt)} · {conversation.messageCount} message{conversation.messageCount !== 1 ? 's' : ''}
        </div>
        <div className="conversation-menu-trigger ms-1 flex-shrink-0" ref={menuContainerRef}>
          <button
            className="btn btn-sm p-0 conversation-menu-btn"
            onClick={(event) => {
              event.stopPropagation()
              if (showMenu) {
                setShowMenu(false)
                return
              }

              setMenuPosition(getMenuPosition(event.currentTarget.getBoundingClientRect()))
              setShowMenu(true)
            }}
            data-id={`conversation-menu-${conversation.id}`}
            ref={menuButtonRef}
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
              ref={menuPanelRef}
              data-theme={theme.toLowerCase()}
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
