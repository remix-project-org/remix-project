import React, { useEffect, useRef, useCallback } from 'react'
import { ActionNotification, ActionNotificationAction } from '../../interface'
import { useDialogDispatchers } from '../../context/provider'
import { useIntl } from 'react-intl'

interface ActionNotificationBarProps {
  notification: ActionNotification
  onActionClick: (action: ActionNotificationAction, notificationId: string) => void
}

/**
 * A single non-intrusive notification bar (VS Code-style).
 * Sits at the bottom-right, shows a message with action buttons.
 */
const ActionNotificationBar = ({ notification, onActionClick }: ActionNotificationBarProps) => {
  const { hideActionNotification } = useDialogDispatchers()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const intl = useIntl()

  useEffect(() => {
    if (notification.timeout && notification.timeout > 0) {
      timerRef.current = setTimeout(() => {
        hideActionNotification(notification.id)
      }, notification.timeout)
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [notification.id, notification.timeout])

  const handleDismiss = useCallback(() => {
    hideActionNotification(notification.id)
  }, [notification.id])

  const handleAction = useCallback((action: ActionNotificationAction) => {
    onActionClick(action, notification.id)
    hideActionNotification(notification.id)
  }, [notification.id, onActionClick])

  return (
    <div className="action-notification-bar d-flex flex-column border rounded shadow-sm p-3 mb-2 bg-light"
      style={{
        minWidth: '360px',
        maxWidth: '480px',
        animation: 'slideInUp 0.25s ease-out'
      }}
    >
      <div className="d-flex justify-content-between align-items-start mb-1">
        <span className="fw-bold small text-dark">{notification.title}</span>
        <button
          type="button"
          className="btn-close ms-2"
          aria-label={intl.formatMessage({ id: 'remixApp.closeNotification' })}
          style={{ fontSize: '0.65rem' }}
          onClick={handleDismiss}
        />
      </div>
      <div className="small text-body mb-2" style={{ lineHeight: '1.4' }}>
        {notification.message}
      </div>
      {notification.actions && notification.actions.length > 0 && (
        <div className="d-flex flex-wrap gap-1 justify-content-end">
          {notification.actions.map((action, idx) => (
            <button
              key={idx}
              className={`btn btn-sm btn-${action.variant || 'primary'}`}
              onClick={() => handleAction(action)}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default ActionNotificationBar
