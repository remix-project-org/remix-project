import { StatusEvents } from '@remixproject/plugin-utils'

// ==================== Notification Types ====================

export type NotificationType = 'info' | 'warning' | 'success' | 'error' | 'announcement' | 'update'
export type NotificationPriority = 'low' | 'normal' | 'high' | 'critical'
export type NotificationReadStatus = 'read' | 'dismissed' | null

export type NotificationActionType = 'plugin' | 'invitation' | 'feedback_form' | 'url'

export interface NotificationAction {
  id: number
  notification_id: number
  action_type: NotificationActionType
  action_label: string | null
  // plugin action fields
  plugin_name: string | null
  plugin_method: string | null
  plugin_params: string | null
  // feedback form fields
  feedback_form_id: number | null
  feedback_form_title: string | null
  feedback_form_url: string | null
  // invitation fields
  invite_token_id: number | null
  invite_token: string | null
  invite_token_name: string | null
  created_at: string
}

export interface NotificationItem {
  id: number
  title: string
  body: string
  type: NotificationType
  priority: NotificationPriority
  action_url: string | null
  action_label: string | null
  action: NotificationAction | null
  scope: string
  read_status: NotificationReadStatus
  read_at: string | null
  created_at: string
  expires_at: string | null
}

export interface NotificationsResponse {
  notifications: NotificationItem[]
  total: number
  unread: number
}

export interface UnreadCountResponse {
  unread: number
}

export interface MarkReadResponse {
  success: boolean
}

export interface MarkAllReadResponse {
  success: boolean
  marked: number
}

// ==================== Plugin API Interface ====================

export interface INotificationCenterApi {
  events: {
    unreadCountChanged: (count: number) => void
    notificationsUpdated: (notifications: NotificationItem[]) => void
  } & StatusEvents
  methods: {
    getNotifications(limit?: number, offset?: number, unreadOnly?: boolean): Promise<NotificationsResponse>
    getUnreadCount(): Promise<number>
    markAsRead(id: number): Promise<void>
    dismiss(id: number): Promise<void>
    markAllAsRead(): Promise<void>
    startPolling(): Promise<void>
    stopPolling(): Promise<void>
    addLocalNotification(notification: NotificationItem, key?: string): Promise<number>
    removeLocalNotification(id: number): Promise<void>
  }
}
