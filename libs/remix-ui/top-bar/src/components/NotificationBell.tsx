/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import React, { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { CustomTooltip } from '@remix-ui/helper'
import { NotificationItem, NotificationType, NotificationPriority } from '@remix-api'
import { TopbarContext } from '../context/topbarContext'
import './notification-center.css'

interface NotificationBellProps {
  className?: string
}

const TYPE_ICONS: Record<NotificationType, string> = {
  info: 'fa-info-circle text-info',
  warning: 'fa-exclamation-triangle text-warning',
  success: 'fa-check-circle text-success',
  error: 'fa-times-circle text-danger',
  announcement: 'fa-bullhorn text-primary',
  update: 'fa-arrow-circle-up text-info'
}

function timeAgo(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 30) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

export function NotificationBell({ className = '' }: NotificationBellProps) {
  const { plugin } = useContext(TopbarContext)
  const [isOpen, setIsOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Listen for unread count changes
  useEffect(() => {
    if (!plugin) return

    const handleUnreadCount = (count: number) => {
      setUnreadCount(count)
    }

    const handleNotificationsUpdated = (items: NotificationItem[]) => {
      setNotifications(items)
    }

    plugin.on('notificationCenter', 'unreadCountChanged', handleUnreadCount)
    plugin.on('notificationCenter', 'notificationsUpdated', handleNotificationsUpdated)

    // Initial fetch
    plugin.call('notificationCenter', 'getUnreadCount' as any).then((count: number) => {
      setUnreadCount(count)
    }).catch(() => {})

    return () => {
      plugin.off('notificationCenter', 'unreadCountChanged')
      plugin.off('notificationCenter', 'notificationsUpdated')
    }
  }, [plugin])

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const toggleDropdown = useCallback(async () => {
    const willOpen = !isOpen
    setIsOpen(willOpen)
    if (willOpen) {
      setLoading(true)
      try {
        const result = await plugin.call('notificationCenter', 'getNotifications' as any, 20, 0, false)
        if (result) {
          setNotifications(result.notifications || [])
          setUnreadCount(result.unread || 0)
        }
      } catch (e) {
        console.error('[NotificationBell] Failed to load notifications:', e)
      }
      setLoading(false)
    }
  }, [isOpen, plugin])

  const handleMarkAsRead = useCallback(async (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await plugin.call('notificationCenter', 'markAsRead' as any, id)
    } catch (e) {
      console.error('[NotificationBell] Failed to mark as read:', e)
    }
  }, [plugin])

  const handleDismiss = useCallback(async (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await plugin.call('notificationCenter', 'dismiss' as any, id)
    } catch (e) {
      console.error('[NotificationBell] Failed to dismiss:', e)
    }
  }, [plugin])

  const handleMarkAllAsRead = useCallback(async () => {
    try {
      await plugin.call('notificationCenter', 'markAllAsRead' as any)
    } catch (e) {
      console.error('[NotificationBell] Failed to mark all as read:', e)
    }
  }, [plugin])

  const handleActionClick = useCallback((actionUrl: string) => {
    setIsOpen(false)
    // Navigate within the app
    if (actionUrl.startsWith('/')) {
      // Try to activate and focus the plugin matching the route
      const pluginName = actionUrl.replace('/', '')
      plugin.call('tabs', 'focus', pluginName).catch(() => {
        // If it's not a tab, try opening it as a side panel plugin
        plugin.call('menuicons', 'select', pluginName).catch(() => {})
      })
    } else if (actionUrl.startsWith('http')) {
      window.open(actionUrl, '_blank')
    }
  }, [plugin])

  const getPriorityClass = (priority: NotificationPriority) => {
    switch (priority) {
    case 'critical': return 'notification-priority-critical'
    case 'high': return 'notification-priority-high'
    default: return ''
    }
  }

  return (
    <div className={`notification-bell-container ${className}`} ref={dropdownRef}>
      <CustomTooltip placement="bottom" tooltipText="Notifications">
        <span
          className="notification-bell-icon"
          onClick={toggleDropdown}
          data-id="notification-bell"
        >
          <i className="fa fa-bell"></i>
          {unreadCount > 0 && (
            <span className="notification-badge" data-id="notification-badge">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </span>
      </CustomTooltip>

      {isOpen && (
        <div className="notification-dropdown" data-id="notification-dropdown">
          <div className="notification-dropdown-header">
            <span className="notification-dropdown-title">Notifications</span>
            {unreadCount > 0 && (
              <button
                className="notification-mark-all-btn"
                onClick={handleMarkAllAsRead}
                title="Mark all as read"
              >
                <i className="fa fa-check-double me-1"></i>
                Mark all read
              </button>
            )}
          </div>

          <div className="notification-dropdown-body">
            {loading && (
              <div className="notification-loading">
                <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                Loading...
              </div>
            )}

            {!loading && notifications.length === 0 && (
              <div className="notification-empty">
                <i className="fa fa-bell-slash fa-2x mb-2 opacity-50"></i>
                <div>No notifications</div>
              </div>
            )}

            {!loading && notifications.map(notification => (
              <div
                key={notification.id}
                className={`notification-item ${notification.read_status === null ? 'notification-unread' : ''} ${getPriorityClass(notification.priority)}`}
                onClick={(e) => {
                  if (notification.read_status === null) handleMarkAsRead(notification.id, e)
                  if (notification.action_url) handleActionClick(notification.action_url)
                }}
                data-id={`notification-item-${notification.id}`}
              >
                <div className="notification-item-icon">
                  <i className={`fa ${TYPE_ICONS[notification.type] || TYPE_ICONS.info}`}></i>
                </div>
                <div className="notification-item-content">
                  <div className="notification-item-header">
                    <span className={`notification-item-title ${notification.priority === 'high' || notification.priority === 'critical' ? 'fw-bold' : ''}`}>
                      {notification.title}
                    </span>
                    <span className="notification-item-time">{timeAgo(notification.created_at)}</span>
                  </div>
                  <div className="notification-item-body">{notification.body}</div>
                  <div className="notification-item-actions">
                    {notification.action_url && (
                      <button
                        className="notification-action-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleActionClick(notification.action_url!)
                        }}
                      >
                        {notification.action_label || 'View'}
                      </button>
                    )}
                    <button
                      className="notification-dismiss-btn"
                      onClick={(e) => handleDismiss(notification.id, e)}
                      title="Dismiss"
                    >
                      <i className="fa fa-times"></i>
                    </button>
                  </div>
                </div>
                {notification.read_status === null && (
                  <div className="notification-unread-dot"></div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
