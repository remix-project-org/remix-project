/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import React, { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { ConversationMetadata } from '../lib/types'

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

  /** Short age: now, 2h, 3d, 2w, 1mo */
  const formatAge = (timestamp: number) => {
    const diffHours = Math.floor((Date.now() - timestamp) / (1000 * 60 * 60))
    if (diffHours < 1) return 'now'
    if (diffHours < 24) return `${diffHours}h`
    const diffDays = Math.floor(diffHours / 24)
    if (diffDays < 7) return `${diffDays}d`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w`
    return `${Math.floor(diffDays / 30)}mo`
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    // Keys pressed on the menu button are the button's
    if (event.target !== event.currentTarget) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onClick()
    }
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

  return (
    <div
      role="button"
      tabIndex={0}
      className={`ai-conv ${active ? 'ai-conv-active' : ''} ${showMenu ? 'ai-conv-menu-open' : ''}`}
      onClick={onClick}
      onKeyDown={onKeyDown}
      data-id={`conversation-item-${conversation.id}`}
    >
      <span className="ai-conv-title" title={conversation.title} data-id="conversation-item-title">{conversation.title}</span>
      <span className="ai-conv-time" data-id="conversation-item-meta">{formatAge(conversation.lastAccessedAt)}</span>
      <div className="conversation-menu-trigger" ref={menuContainerRef}>
        <button
          type="button"
          className="conversation-menu-btn"
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
          <i className="fas fa-ellipsis-h"></i>
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
    </div>
  )
}
