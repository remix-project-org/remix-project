/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import React, { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { ConversationMetadata } from '../lib/types'
import { AIPanelItem } from './aiPanel'

interface ConversationItemProps {
  conversation: ConversationMetadata
  active: boolean
  onClick: () => void
  onArchive: (e: React.MouseEvent) => void
  onDelete: (e: React.MouseEvent) => void
  theme?: string
}

export const ConversationItem: React.FC<ConversationItemProps> = ({
  conversation,
  active,
  onClick,
  onArchive,
  onDelete
}) => {
  const [showMenu, setShowMenu] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 })
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

  // Close menu when clicking outside (capture phase: some panels stop mousedown from bubbling) or on Escape
  useEffect(() => {
    if (!showMenu) return
    const handleClickOutside = (event: MouseEvent) => {
      if (menuContainerRef.current && !menuContainerRef.current.contains(event.target as Node)) {
        setShowMenu(false)
      }
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowMenu(false)
    }
    document.addEventListener('mousedown', handleClickOutside, true)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [showMenu])

  // Below the button, right-aligned with it, so it never covers the title; above it when there is no room below
  const getMenuPosition = (triggerRect: DOMRect, menuWidth = 170, menuHeight = 110) => {
    const gutter = 8
    const gap = 4
    const fitsBelow = triggerRect.bottom + gap + menuHeight <= window.innerHeight - gutter

    return {
      top: fitsBelow ? triggerRect.bottom + gap : Math.max(gutter, triggerRect.top - gap - menuHeight),
      left: Math.max(gutter, Math.min(triggerRect.right - menuWidth, window.innerWidth - menuWidth - gutter))
    }
  }

  // Measured before paint, so the menu does not jump once its real size is known
  useLayoutEffect(() => {
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

  const meta = `${formatDate(conversation.lastAccessedAt)} · ${conversation.messageCount} message${conversation.messageCount !== 1 ? 's' : ''}`

  return (
    <AIPanelItem
      title={conversation.title}
      titleTooltip={conversation.title}
      subtitle={meta}
      active={active}
      className={showMenu ? 'ai-panel-item-menu-open' : ''}
      onClick={onClick}
      dataId={`conversation-item-${conversation.id}`}
      titleDataId="conversation-item-title"
      subtitleDataId="conversation-item-meta"
      trailing={
        <div className="conversation-menu-trigger" ref={menuContainerRef}>
          <button
            className="btn btn-sm p-0 conversation-menu-btn"
            aria-label="Conversation actions"
            aria-expanded={showMenu}
            onClick={(e) => {
              e.stopPropagation()
              if (showMenu) {
                setShowMenu(false)
                return
              }

              setMenuPosition(getMenuPosition(e.currentTarget.getBoundingClientRect()))
              setShowMenu(true)
            }}
            data-id={`conversation-menu-${conversation.id}`}
            ref={menuButtonRef}
          >
            <i className="fas fa-ellipsis-v"></i>
          </button>

          {showMenu && (
            <div
              className="conversation-menu position-fixed shadow-sm"
              ref={menuPanelRef}
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
      }
    />
  )
}
