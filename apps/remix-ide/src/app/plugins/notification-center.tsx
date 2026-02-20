import { Plugin } from '@remixproject/engine'
import { CustomRemixApi, NotificationItem, NotificationsResponse, UnreadCountResponse, MarkReadResponse, MarkAllReadResponse } from '@remix-api'
import { ApiClient, IApiClient } from '@remix-api'
import { endpointUrls } from '@remix-endpoints-helper'

const profile = {
  name: 'notificationCenter',
  displayName: 'Notification Center',
  description: 'In-app notification center for Remix IDE',
  methods: ['getNotifications', 'getUnreadCount', 'markAsRead', 'dismiss', 'markAllAsRead', 'startPolling', 'stopPolling'],
  events: ['unreadCountChanged', 'notificationsUpdated'],
  version: '0.0.1'
}

const POLL_INTERVAL = 30000 // 30 seconds

export class NotificationCenterPlugin extends Plugin<any, CustomRemixApi> {
  private apiClient: IApiClient
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private lastUnreadCount = 0
  private cachedNotifications: NotificationItem[] = []
  private isAuthenticated = false

  constructor() {
    super(profile)
    this.apiClient = new ApiClient(endpointUrls.notifications)
  }

  async onActivation(): Promise<void> {
    // Listen for auth state changes (login, logout, AND token refresh)
    this.on('auth' as any, 'authStateChanged', async (state: { isAuthenticated: boolean; token?: string }) => {
      this.isAuthenticated = state.isAuthenticated
      if (state.isAuthenticated) {
        // Use the token from the event if available, otherwise read from localStorage
        const token = state.token || localStorage.getItem('remix_access_token')
        if (token) {
          this.apiClient.setToken(token)
        }
        // Only start polling if not already running (avoid restart on token refresh)
        if (!this.pollTimer) {
          await this.startPolling()
        }
      } else {
        this.stopPolling()
        this.lastUnreadCount = 0
        this.cachedNotifications = []
        this.apiClient.setToken(null)
        this.emit('unreadCountChanged', 0)
        this.emit('notificationsUpdated', [])
      }
    })

    // Check initial auth state
    const token = localStorage.getItem('remix_access_token')
    if (token) {
      this.isAuthenticated = true
      this.apiClient.setToken(token)
      this.setupTokenRefresh()
      await this.startPolling()
    }
  }

  /**
   * Configure the ApiClient to handle 401s by triggering a real token refresh
   * through the auth plugin, not just reading (possibly stale) localStorage.
   */
  private setupTokenRefresh(): void {
    this.apiClient.setTokenRefreshCallback(async () => {
      try {
        // Ask the auth plugin to refresh — this triggers a real refresh-token exchange
        // and emits authStateChanged with the new token, which we also listen to above.
        const newToken = await this.call('auth' as any, 'getToken')
        return newToken
      } catch {
        return null
      }
    })
  }

  onDeactivation(): void {
    this.stopPolling()
  }

  async getNotifications(limit = 20, offset = 0, unreadOnly = false): Promise<NotificationsResponse> {
    if (!this.isAuthenticated) {
      return { notifications: [], total: 0, unread: 0 }
    }

    try {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
        ...(unreadOnly ? { unread_only: 'true' } : {}),
        include_dismissed: 'false'
      })
      const response = await this.apiClient.get<NotificationsResponse>(`?${params.toString()}`)

      if (response.ok && response.data) {
        this.cachedNotifications = response.data.notifications
        this.emit('notificationsUpdated', this.cachedNotifications)

        if (response.data.unread !== this.lastUnreadCount) {
          this.lastUnreadCount = response.data.unread
          this.emit('unreadCountChanged', this.lastUnreadCount)
        }

        return response.data
      }
    } catch (e) {
      console.error('[NotificationCenter] Failed to fetch notifications:', e)
    }

    return { notifications: this.cachedNotifications, total: this.cachedNotifications.length, unread: this.lastUnreadCount }
  }

  async getUnreadCount(): Promise<number> {
    if (!this.isAuthenticated) return 0

    try {
      const response = await this.apiClient.get<UnreadCountResponse>('/unread-count')
      if (response.ok && response.data) {
        const newCount = response.data.unread
        if (newCount !== this.lastUnreadCount) {
          this.lastUnreadCount = newCount
          this.emit('unreadCountChanged', this.lastUnreadCount)
        }
        return newCount
      }
    } catch (e) {
      console.error('[NotificationCenter] Failed to fetch unread count:', e)
    }

    return this.lastUnreadCount
  }

  async markAsRead(id: number): Promise<void> {
    if (!this.isAuthenticated) return

    try {
      const response = await this.apiClient.post<MarkReadResponse>(`/${id}/read`)
      if (response.ok) {
        // Update cached notification
        const notification = this.cachedNotifications.find(n => n.id === id)
        if (notification && notification.read_status !== 'read') {
          notification.read_status = 'read'
          notification.read_at = new Date().toISOString()
          this.lastUnreadCount = Math.max(0, this.lastUnreadCount - 1)
          this.emit('unreadCountChanged', this.lastUnreadCount)
          this.emit('notificationsUpdated', [...this.cachedNotifications])
        }
      }
    } catch (e) {
      console.error('[NotificationCenter] Failed to mark as read:', e)
    }
  }

  async dismiss(id: number): Promise<void> {
    if (!this.isAuthenticated) return

    try {
      const response = await this.apiClient.post<MarkReadResponse>(`/${id}/dismiss`)
      if (response.ok) {
        const wasPreviouslyUnread = this.cachedNotifications.find(n => n.id === id)?.read_status === null
        this.cachedNotifications = this.cachedNotifications.filter(n => n.id !== id)
        if (wasPreviouslyUnread) {
          this.lastUnreadCount = Math.max(0, this.lastUnreadCount - 1)
          this.emit('unreadCountChanged', this.lastUnreadCount)
        }
        this.emit('notificationsUpdated', [...this.cachedNotifications])
      }
    } catch (e) {
      console.error('[NotificationCenter] Failed to dismiss notification:', e)
    }
  }

  async markAllAsRead(): Promise<void> {
    if (!this.isAuthenticated) return

    try {
      const response = await this.apiClient.post<MarkAllReadResponse>('/read-all')
      if (response.ok) {
        this.cachedNotifications = this.cachedNotifications.map(n => ({
          ...n,
          read_status: n.read_status === 'dismissed' ? 'dismissed' : 'read' as const,
          read_at: n.read_at || new Date().toISOString()
        }))
        this.lastUnreadCount = 0
        this.emit('unreadCountChanged', 0)
        this.emit('notificationsUpdated', [...this.cachedNotifications])
      }
    } catch (e) {
      console.error('[NotificationCenter] Failed to mark all as read:', e)
    }
  }

  /**
   * Sync the ApiClient token from localStorage as a safety net.
   * Covers edge cases where the authStateChanged event was missed.
   */
  private syncToken(): void {
    const token = localStorage.getItem('remix_access_token')
    if (token) {
      this.apiClient.setToken(token)
    }
  }

  async startPolling(): Promise<void> {
    this.stopPolling()
    // Fetch immediately
    this.syncToken()
    await this.getUnreadCount()
    // Then poll — sync token each cycle in case it was refreshed between polls
    this.pollTimer = setInterval(async () => {
      this.syncToken()
      await this.getUnreadCount()
    }, POLL_INTERVAL)
  }

  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  }
}
