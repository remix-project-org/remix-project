import { Plugin } from '@remixproject/engine'
import { CustomRemixApi, NotificationItem, NotificationsResponse, UnreadCountResponse, MarkReadResponse, MarkAllReadResponse } from '@remix-api'
import { ApiClient, IApiClient } from '@remix-api'
import { endpointUrls } from '@remix-endpoints-helper'

const profile = {
  name: 'notificationCenter',
  displayName: 'Notification Center',
  description: 'In-app notification center for Remix IDE',
  methods: ['getNotifications', 'getUnreadCount', 'markAsRead', 'dismiss', 'markAllAsRead', 'startPolling', 'stopPolling', 'addLocalNotification', 'removeLocalNotification'],
  events: ['unreadCountChanged', 'notificationsUpdated'],
  version: '0.0.1'
}

const POLL_INTERVAL_FOCUSED = 30000 // 30 seconds when tab is focused
const POLL_INTERVAL_HIDDEN = 120000 // 2 minutes when tab is hidden/blurred
const LOCAL_NOTIFICATIONS_KEY = 'remix_local_notifications'
const ANON_TOKEN_KEY = 'remix_anonymous_notification_token'

interface LocalNotificationStore {
  notifications: NotificationItem[]
  keyMap: Record<string, number> // dedup key → notification id
  nextId: number
}

interface AnonymousTokenResponse {
  token: string
  expires_at: string
}

export class NotificationCenterPlugin extends Plugin<any, CustomRemixApi> {
  /** Set to true to enable verbose console.log output for debugging */
  private static DEBUG = false

  private apiClient: IApiClient
  private anonymousApiClient: IApiClient
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private lastUnreadCount = 0
  private cachedNotifications: NotificationItem[] = []
  private isAuthenticated = false
  private anonymousToken: string | null = null
  private localNotifications: NotificationItem[] = []
  private localKeyMap: Record<string, number> = {}
  private nextLocalId: number = -1
  private visibilityHandler: (() => void) | null = null

  /** Debug-gated logger – silent when DEBUG is false */
  private log(...args: any[]) {
    if (NotificationCenterPlugin.DEBUG) console.log(...args)
  }

  constructor() {
    super(profile)
    this.apiClient = new ApiClient(endpointUrls.notifications)
    this.anonymousApiClient = new ApiClient(`${endpointUrls.notifications}/anonymous`)
  }

  async onActivation(): Promise<void> {
    // Load local notifications from localStorage (these work without auth)
    this.loadLocalNotifications()
    this.emitMergedState()

    // Listen for auth state changes (login, logout, AND token refresh)
    this.on('auth' as any, 'authStateChanged', async (state: { isAuthenticated: boolean; token?: string }) => {
      const wasAuthenticated = this.isAuthenticated
      this.isAuthenticated = state.isAuthenticated

      if (state.isAuthenticated) {
        // Switching to authenticated mode
        // Use the token from the event if available, otherwise read from localStorage
        const token = state.token || localStorage.getItem('remix_access_token')
        if (token) {
          this.apiClient.setToken(token)
        }

        // If switching from anonymous → authenticated, stop anonymous polling first
        if (!wasAuthenticated) {
          this.stopPolling()
          this.cachedNotifications = []
        }

        // Only start polling if not already running (avoid restart on token refresh)
        if (!this.pollTimer) {
          await this.startPolling()
        }
      } else {
        // Switching to anonymous mode
        this.stopPolling()
        this.lastUnreadCount = 0
        this.cachedNotifications = []
        this.apiClient.setToken(null)

        // Switch back to anonymous notifications
        await this.initAnonymousNotifications()
      }
    })

    // Check initial auth state
    const token = localStorage.getItem('remix_access_token')
    if (token) {
      this.isAuthenticated = true
      this.apiClient.setToken(token)
      this.setupTokenRefresh()
      await this.startPolling()
    } else {
      // Not authenticated — initialize anonymous notifications
      await this.initAnonymousNotifications()
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
    this.removeVisibilityListener()
  }

  /* ==================== Anonymous Notifications ==================== */

  /**
   * Initialize anonymous notifications for non-authenticated users.
   * Registers a new anonymous token if none exists or if the existing one expired.
   * Anonymous tokens are stored in localStorage and passed via X-Anonymous-Token header.
   *
   * NOTE: This is separate from the membership-request claim tokens used by
   * the MembershipRequestPlugin for checking request approval status.
   * Anonymous notifications are server-side broadcast notifications targeted
   * at non-logged-in users via audience rules.
   */
  private async initAnonymousNotifications(): Promise<void> {
    this.anonymousToken = localStorage.getItem(ANON_TOKEN_KEY)

    if (this.anonymousToken) {
      // Validate the token is still alive with a lightweight call
      const isValid = await this.validateAnonymousToken()
      if (!isValid) {
        // Token expired — clear and register a new one
        this.clearAnonymousToken()
      }
    }

    if (!this.anonymousToken) {
      await this.registerAnonymousToken()
    }

    if (this.anonymousToken) {
      await this.startPolling()
    }
  }

  /**
   * Validate the stored anonymous token by making a lightweight unread-count call.
   * Returns true if the token is still valid, false if expired/invalid (401).
   */
  private async validateAnonymousToken(): Promise<boolean> {
    if (!this.anonymousToken) return false
    try {
      const response = await this.anonymousApiClient.get<UnreadCountResponse>('/unread-count', {
        headers: { 'X-Anonymous-Token': this.anonymousToken },
        skipTokenRefresh: true
      })
      if (response.status === 401) {
        return false
      }
      return response.ok
    } catch {
      // Network error — assume token might still be valid, don't discard
      return true
    }
  }

  /**
   * Register a new anonymous token with the server.
   * Stores the token in localStorage on success.
   */
  private async registerAnonymousToken(): Promise<void> {
    try {
      const response = await this.anonymousApiClient.post<AnonymousTokenResponse>('/register', undefined, {
        skipTokenRefresh: true
      })
      if (response.ok && response.data?.token) {
        this.anonymousToken = response.data.token
        localStorage.setItem(ANON_TOKEN_KEY, this.anonymousToken)
        this.log('[NotificationCenter] Anonymous token registered')
      } else {
        console.warn('[NotificationCenter] Failed to register anonymous token:', response.error)
      }
    } catch (e) {
      console.error('[NotificationCenter] Error registering anonymous token:', e)
    }
  }

  /**
   * Clear the stored anonymous token from memory and localStorage.
   */
  private clearAnonymousToken(): void {
    this.anonymousToken = null
    localStorage.removeItem(ANON_TOKEN_KEY)
  }

  /**
   * Get the headers for anonymous API calls.
   */
  private getAnonymousHeaders(): Record<string, string> {
    return this.anonymousToken ? { 'X-Anonymous-Token': this.anonymousToken } : {}
  }

  /**
   * Handle a 401 response from an anonymous API call.
   * Clears the expired token, registers a new one, and returns true if recovery succeeded.
   */
  private async handleAnonymous401(): Promise<boolean> {
    this.clearAnonymousToken()
    await this.registerAnonymousToken()
    return !!this.anonymousToken
  }

  /* ==================== Notification Methods ==================== */

  async getNotifications(limit = 20, offset = 0, unreadOnly = false): Promise<NotificationsResponse> {
    let serverNotifications: NotificationItem[] = []
    let serverTotal = 0
    let serverUnread = 0

    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
      ...(unreadOnly ? { unread_only: 'true' } : {}),
      include_dismissed: 'false'
    })

    if (this.isAuthenticated) {
      try {
        const response = await this.apiClient.get<NotificationsResponse>(`?${params.toString()}`)

        if (response.ok && response.data) {
          serverNotifications = response.data.notifications
          serverTotal = response.data.total
          serverUnread = response.data.unread
          this.cachedNotifications = serverNotifications
        }
      } catch (e) {
        console.error('[NotificationCenter] Failed to fetch notifications:', e)
        serverNotifications = this.cachedNotifications
        serverTotal = this.cachedNotifications.length
      }
    } else if (this.anonymousToken) {
      try {
        const response = await this.anonymousApiClient.get<NotificationsResponse>(
          `/?${params.toString()}`,
          { headers: this.getAnonymousHeaders(), skipTokenRefresh: true }
        )

        if (response.status === 401) {
          // Token expired — recover and retry once
          const recovered = await this.handleAnonymous401()
          if (recovered) {
            const retry = await this.anonymousApiClient.get<NotificationsResponse>(
              `/?${params.toString()}`,
              { headers: this.getAnonymousHeaders(), skipTokenRefresh: true }
            )
            if (retry.ok && retry.data) {
              serverNotifications = retry.data.notifications
              serverTotal = retry.data.total
              serverUnread = retry.data.unread
              this.cachedNotifications = serverNotifications
            }
          }
        } else if (response.ok && response.data) {
          serverNotifications = response.data.notifications
          serverTotal = response.data.total
          serverUnread = response.data.unread
          this.cachedNotifications = serverNotifications
        }
      } catch (e) {
        console.error('[NotificationCenter] Failed to fetch anonymous notifications:', e)
        serverNotifications = this.cachedNotifications
        serverTotal = this.cachedNotifications.length
      }
    }

    // Merge local notifications with server notifications
    const localFiltered = unreadOnly
      ? this.localNotifications.filter(n => n.read_status === null)
      : this.localNotifications
    const merged = this.mergeNotifications(localFiltered, serverNotifications)
    const localUnread = this.getLocalUnreadCount()
    const totalUnread = serverUnread + localUnread
    const totalCount = serverTotal + this.localNotifications.length

    // Emit updated state
    if (totalUnread !== this.lastUnreadCount) {
      this.lastUnreadCount = totalUnread
      this.emit('unreadCountChanged', this.lastUnreadCount)
    }
    this.emit('notificationsUpdated', merged)

    return { notifications: merged, total: totalCount, unread: totalUnread }
  }

  async getUnreadCount(): Promise<number> {
    let serverUnread = 0

    if (this.isAuthenticated) {
      try {
        const response = await this.apiClient.get<UnreadCountResponse>('/unread-count')
        if (response.ok && response.data) {
          serverUnread = response.data.unread
        }
      } catch (e) {
        console.error('[NotificationCenter] Failed to fetch unread count:', e)
      }
    } else if (this.anonymousToken) {
      try {
        const response = await this.anonymousApiClient.get<UnreadCountResponse>('/unread-count', {
          headers: this.getAnonymousHeaders(),
          skipTokenRefresh: true
        })
        if (response.status === 401) {
          const recovered = await this.handleAnonymous401()
          if (recovered) {
            const retry = await this.anonymousApiClient.get<UnreadCountResponse>('/unread-count', {
              headers: this.getAnonymousHeaders(),
              skipTokenRefresh: true
            })
            if (retry.ok && retry.data) {
              serverUnread = retry.data.unread
            }
          }
        } else if (response.ok && response.data) {
          serverUnread = response.data.unread
        }
      } catch (e) {
        console.error('[NotificationCenter] Failed to fetch anonymous unread count:', e)
      }
    }

    const totalUnread = serverUnread + this.getLocalUnreadCount()
    if (totalUnread !== this.lastUnreadCount) {
      this.lastUnreadCount = totalUnread
      this.emit('unreadCountChanged', this.lastUnreadCount)
    }

    return this.lastUnreadCount
  }

  async markAsRead(id: number): Promise<void> {
    if (this.isLocalNotification(id)) {
      const notification = this.localNotifications.find(n => n.id === id)
      if (notification && notification.read_status !== 'read') {
        notification.read_status = 'read'
        notification.read_at = new Date().toISOString()
        this.saveLocalNotifications()
        this.emitMergedState()
      }
      return
    }

    if (this.isAuthenticated) {
      try {
        const response = await this.apiClient.post<MarkReadResponse>(`/${id}/read`)
        if (response.ok) {
          const notification = this.cachedNotifications.find(n => n.id === id)
          if (notification && notification.read_status !== 'read') {
            notification.read_status = 'read'
            notification.read_at = new Date().toISOString()
            this.emitMergedState()
          }
        }
      } catch (e) {
        console.error('[NotificationCenter] Failed to mark as read:', e)
      }
    } else if (this.anonymousToken) {
      try {
        const response = await this.anonymousApiClient.post<MarkReadResponse>(`/${id}/read`, undefined, {
          headers: this.getAnonymousHeaders(),
          skipTokenRefresh: true
        })
        if (response.status === 401) {
          const recovered = await this.handleAnonymous401()
          if (recovered) {
            await this.anonymousApiClient.post<MarkReadResponse>(`/${id}/read`, undefined, {
              headers: this.getAnonymousHeaders(),
              skipTokenRefresh: true
            })
          }
        }
        // Update local cache
        const notification = this.cachedNotifications.find(n => n.id === id)
        if (notification && notification.read_status !== 'read') {
          notification.read_status = 'read'
          notification.read_at = new Date().toISOString()
          this.emitMergedState()
        }
      } catch (e) {
        console.error('[NotificationCenter] Failed to mark anonymous notification as read:', e)
      }
    }
  }

  async dismiss(id: number): Promise<void> {
    if (this.isLocalNotification(id)) {
      const wasPreviouslyUnread = this.localNotifications.find(n => n.id === id)?.read_status === null
      this.localNotifications = this.localNotifications.filter(n => n.id !== id)
      // Clean up key map entry
      for (const [key, mappedId] of Object.entries(this.localKeyMap)) {
        if (mappedId === id) {
          delete this.localKeyMap[key]
          break
        }
      }
      this.saveLocalNotifications()
      if (wasPreviouslyUnread) {
        this.lastUnreadCount = Math.max(0, this.lastUnreadCount - 1)
        this.emit('unreadCountChanged', this.lastUnreadCount)
      }
      this.emit('notificationsUpdated', this.getMergedNotifications())
      return
    }

    if (this.isAuthenticated) {
      try {
        const response = await this.apiClient.post<MarkReadResponse>(`/${id}/dismiss`)
        if (response.ok) {
          const wasPreviouslyUnread = this.cachedNotifications.find(n => n.id === id)?.read_status === null
          this.cachedNotifications = this.cachedNotifications.filter(n => n.id !== id)
          if (wasPreviouslyUnread) {
            this.lastUnreadCount = Math.max(0, this.lastUnreadCount - 1)
            this.emit('unreadCountChanged', this.lastUnreadCount)
          }
          this.emit('notificationsUpdated', this.getMergedNotifications())
        }
      } catch (e) {
        console.error('[NotificationCenter] Failed to dismiss notification:', e)
      }
    } else if (this.anonymousToken) {
      try {
        const response = await this.anonymousApiClient.post<MarkReadResponse>(`/${id}/dismiss`, undefined, {
          headers: this.getAnonymousHeaders(),
          skipTokenRefresh: true
        })
        if (response.status === 401) {
          const recovered = await this.handleAnonymous401()
          if (recovered) {
            await this.anonymousApiClient.post<MarkReadResponse>(`/${id}/dismiss`, undefined, {
              headers: this.getAnonymousHeaders(),
              skipTokenRefresh: true
            })
          }
        }
        const wasPreviouslyUnread = this.cachedNotifications.find(n => n.id === id)?.read_status === null
        this.cachedNotifications = this.cachedNotifications.filter(n => n.id !== id)
        if (wasPreviouslyUnread) {
          this.lastUnreadCount = Math.max(0, this.lastUnreadCount - 1)
          this.emit('unreadCountChanged', this.lastUnreadCount)
        }
        this.emit('notificationsUpdated', this.getMergedNotifications())
      } catch (e) {
        console.error('[NotificationCenter] Failed to dismiss anonymous notification:', e)
      }
    }
  }

  async markAllAsRead(): Promise<void> {
    // Mark local notifications as read
    let localChanged = false
    this.localNotifications = this.localNotifications.map(n => {
      if (n.read_status === null) {
        localChanged = true
        return { ...n, read_status: 'read' as const, read_at: new Date().toISOString() }
      }
      return n
    })
    if (localChanged) {
      this.saveLocalNotifications()
    }

    // Mark server notifications as read (authenticated or anonymous)
    if (this.isAuthenticated) {
      try {
        const response = await this.apiClient.post<MarkAllReadResponse>('/read-all')
        if (response.ok) {
          this.cachedNotifications = this.cachedNotifications.map(n => ({
            ...n,
            read_status: n.read_status === 'dismissed' ? 'dismissed' : 'read' as const,
            read_at: n.read_at || new Date().toISOString()
          }))
        }
      } catch (e) {
        console.error('[NotificationCenter] Failed to mark all as read:', e)
      }
    } else if (this.anonymousToken) {
      try {
        const response = await this.anonymousApiClient.post<MarkAllReadResponse>('/read-all', undefined, {
          headers: this.getAnonymousHeaders(),
          skipTokenRefresh: true
        })
        if (response.status === 401) {
          const recovered = await this.handleAnonymous401()
          if (recovered) {
            await this.anonymousApiClient.post<MarkAllReadResponse>('/read-all', undefined, {
              headers: this.getAnonymousHeaders(),
              skipTokenRefresh: true
            })
          }
        }
        this.cachedNotifications = this.cachedNotifications.map(n => ({
          ...n,
          read_status: n.read_status === 'dismissed' ? 'dismissed' : 'read' as const,
          read_at: n.read_at || new Date().toISOString()
        }))
      } catch (e) {
        console.error('[NotificationCenter] Failed to mark all anonymous as read:', e)
      }
    }

    this.lastUnreadCount = 0
    this.emit('unreadCountChanged', 0)
    this.emit('notificationsUpdated', this.getMergedNotifications())
  }

  /**
   * Sync the ApiClient token from localStorage as a safety net.
   * Covers edge cases where the authStateChanged event was missed.
   */
  private syncToken(): void {
    if (this.isAuthenticated) {
      const token = localStorage.getItem('remix_access_token')
      if (token) {
        this.apiClient.setToken(token)
      }
    }
  }

  async startPolling(): Promise<void> {
    this.stopPolling()
    // Fetch immediately
    this.syncToken()
    await this.getUnreadCount()

    // Start visibility-aware polling
    this.setupVisibilityListener()
    this.restartPollInterval()
  }

  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
    this.removeVisibilityListener()
  }

  /**
   * Get the appropriate poll interval based on tab visibility.
   */
  private getPollInterval(): number {
    return document.hidden ? POLL_INTERVAL_HIDDEN : POLL_INTERVAL_FOCUSED
  }

  /**
   * Restart the poll interval with the appropriate duration for current visibility.
   */
  private restartPollInterval(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
    }
    this.pollTimer = setInterval(async () => {
      this.syncToken()
      await this.getUnreadCount()
    }, this.getPollInterval())
  }

  /**
   * Listen for visibility changes to adjust polling frequency.
   * Polls every 30s when focused, every 120s when hidden, with immediate fetch on re-focus.
   */
  private setupVisibilityListener(): void {
    this.removeVisibilityListener()
    this.visibilityHandler = () => {
      // Restart interval with new timing
      this.restartPollInterval()
      // Immediately fetch when tab becomes visible again
      if (!document.hidden) {
        this.syncToken()
        this.getUnreadCount()
      }
    }
    document.addEventListener('visibilitychange', this.visibilityHandler)
  }

  private removeVisibilityListener(): void {
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler)
      this.visibilityHandler = null
    }
  }

  /* ==================== Local Notifications ==================== */

  /**
   * Add a client-side notification that persists in localStorage.
   * Used for notifications not originating from the server notification system
   * (e.g., membership request status updates for anonymous users).
   *
   * @param notification - A NotificationItem (the id field will be overridden)
   * @param key - Optional deduplication key. If a notification with this key
   *              already exists, the existing ID is returned without adding a duplicate.
   * @returns The assigned local notification ID (negative number)
   */
  async addLocalNotification(notification: NotificationItem, key?: string): Promise<number> {
    // Deduplication: if key exists and already stored, return existing ID
    if (key && this.localKeyMap[key] !== undefined) {
      return this.localKeyMap[key]
    }

    const id = this.nextLocalId--
    const localNotif: NotificationItem = {
      ...notification,
      id,
      read_status: null,
      read_at: null,
      created_at: notification.created_at || new Date().toISOString()
    }

    this.localNotifications.push(localNotif)
    if (key) {
      this.localKeyMap[key] = id
    }
    this.saveLocalNotifications()
    this.emitMergedState()

    return id
  }

  /**
   * Remove a local notification by ID.
   */
  async removeLocalNotification(id: number): Promise<void> {
    const wasPreviouslyUnread = this.localNotifications.find(n => n.id === id)?.read_status === null
    this.localNotifications = this.localNotifications.filter(n => n.id !== id)
    // Clean up key map
    for (const [key, mappedId] of Object.entries(this.localKeyMap)) {
      if (mappedId === id) {
        delete this.localKeyMap[key]
        break
      }
    }
    this.saveLocalNotifications()
    if (wasPreviouslyUnread) {
      this.lastUnreadCount = Math.max(0, this.lastUnreadCount - 1)
      this.emit('unreadCountChanged', this.lastUnreadCount)
    }
    this.emit('notificationsUpdated', this.getMergedNotifications())
  }

  /* ==================== Local Notification Helpers ==================== */

  private isLocalNotification(id: number): boolean {
    return id < 0
  }

  private getLocalUnreadCount(): number {
    return this.localNotifications.filter(n => n.read_status === null).length
  }

  private getMergedNotifications(): NotificationItem[] {
    return this.mergeNotifications(this.localNotifications, this.cachedNotifications)
  }

  private mergeNotifications(local: NotificationItem[], server: NotificationItem[]): NotificationItem[] {
    const merged = [...local, ...server]
    merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    return merged
  }

  private emitMergedState(): void {
    const merged = this.getMergedNotifications()
    const totalUnread = this.getLocalUnreadCount() +
      this.cachedNotifications.filter(n => n.read_status === null).length
    if (totalUnread !== this.lastUnreadCount) {
      this.lastUnreadCount = totalUnread
      this.emit('unreadCountChanged', this.lastUnreadCount)
    }
    this.emit('notificationsUpdated', merged)
  }

  private loadLocalNotifications(): void {
    try {
      const raw = localStorage.getItem(LOCAL_NOTIFICATIONS_KEY)
      if (raw) {
        const store: LocalNotificationStore = JSON.parse(raw)
        this.localNotifications = store.notifications || []
        this.localKeyMap = store.keyMap || {}
        this.nextLocalId = store.nextId ?? -1
        // Ensure nextLocalId is below all existing IDs
        for (const n of this.localNotifications) {
          if (n.id <= this.nextLocalId) {
            this.nextLocalId = n.id - 1
          }
        }
      }
    } catch (e) {
      console.error('[NotificationCenter] Failed to load local notifications:', e)
      this.localNotifications = []
      this.localKeyMap = {}
      this.nextLocalId = -1
    }
  }

  private saveLocalNotifications(): void {
    try {
      const store: LocalNotificationStore = {
        notifications: this.localNotifications,
        keyMap: this.localKeyMap,
        nextId: this.nextLocalId
      }
      localStorage.setItem(LOCAL_NOTIFICATIONS_KEY, JSON.stringify(store))
    } catch (e) {
      console.error('[NotificationCenter] Failed to save local notifications:', e)
    }
  }
}
