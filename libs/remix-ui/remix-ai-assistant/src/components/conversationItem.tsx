/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import React, { useState, useEffect, useRef } from 'react'
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
  onDelete,
  theme
}) => {
  const [showMenu, setShowMenu] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 })
  const menuContainerRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const menuPanelRef = useRef<HTMLDivElement>(null)

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
    const shouldOpenLeft =
      triggerRect.right + gutter + menuWidth > window.innerWidth &&
      triggerRect.left - gutter - menuWidth >= gutter

    return {
      top: Math.max(gutter, Math.min(triggerRect.top, window.innerHeight - menuHeight - gutter)),
      left: shouldOpenLeft
        ? triggerRect.left - menuWidth - gutter
        : Math.max(gutter, Math.min(triggerRect.right + gutter, window.innerWidth - menuWidth - gutter))
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
      className={`conversation-item px-2 py-2 mb-1 rounded cursor-pointer position-relative ${active ? 'conversation-item-active' : ''}`}
      onClick={onClick}
      data-id={`conversation-item-${conversation.id}`}
      data-theme={theme?.toLowerCase()}
    >
      <div className="d-flex justify-content-between align-items-center">
        <div className="flex-grow-1 overflow-hidden pe-2">
          <div className="conversation-title text-truncate text-light-emphasis" data-id="conversation-item-title">
            {conversation.title}
          </div>
        </div>

        <div className="conversation-menu-trigger" ref={menuContainerRef}>
          <button
            className="btn btn-sm p-0 conversation-menu-btn"
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
      </div>
    </div>
  )
}
