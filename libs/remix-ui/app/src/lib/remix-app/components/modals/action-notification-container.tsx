import React, { useContext, useCallback } from 'react'
import { ActionNotificationAction } from '../../interface'
import { useDialogs } from '../../context/provider'
import { AppContext } from '../../context/context'
import ActionNotificationBar from './action-notification-bar'

/**
 * Container that renders action notifications at the bottom-right of the viewport.
 * These are non-intrusive, VS Code-style suggestion bars that don't block the UI.
 * Actions can trigger plugin calls or direct callbacks.
 */
const ActionNotificationContainer = () => {
  const { actionNotifications } = useDialogs()
  const app = useContext(AppContext)

  const handleActionClick = useCallback(async (action: ActionNotificationAction, notificationId: string) => {
    // If there's a direct function callback, call it
    if (action.fn) {
      action.fn()
      return
    }
    // Otherwise, make a plugin call
    if (action.plugin && action.method && app?.appManager) {
      try {
        await app.appManager.call(action.plugin, action.method, ...(action.args || []))
      } catch (err) {
        console.error(`ActionNotification: failed to call ${action.plugin}.${action.method}`, err)
      }
    }
  }, [app])

  if (!actionNotifications || actionNotifications.length === 0) return null

  return (
    <div
      className="action-notification-container"
      style={{
        position: 'fixed',
        bottom: '30px',
        right: '16px',
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column-reverse',
        pointerEvents: 'auto',
        maxHeight: '60vh',
        overflowY: 'auto'
      }}
    >
      {actionNotifications.map((notification) => (
        <ActionNotificationBar
          key={notification.id}
          notification={notification}
          onActionClick={handleActionClick}
        />
      ))}
    </div>
  )
}

export default ActionNotificationContainer
