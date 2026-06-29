import { Plugin } from '@remixproject/engine'
import React from 'react'
import { MembershipRequestOverlay, MembershipRequestState } from '@remix-ui/invites'
import { PluginViewWrapper } from '@remix-ui/helper'
import { ApiClient } from '@remix-api'
import { endpointUrls } from '@remix-endpoints-helper'
import {
  MembershipGroup,
  MembershipGroupsResponse,
  MembershipSubmitResponse,
  MembershipStatusResponse,
  NotificationItem
} from '@remix-api'
import { QueryParams } from '@remix-project/remix-lib'
import * as packageJson from '../../../../../package.json'

const STORAGE_KEY = 'remix_anonymous_request_tokens'

interface StoredToken {
  token: string
  group_id: number
  group_name: string
  created_at: string
}

const profile = {
  name: 'membershipRequest',
  displayName: 'Membership Request',
  description: 'Anonymous membership request for feature groups',
  methods: ['showRequestForm', 'checkPendingRequests', 'close'],
  events: ['requestSubmitted', 'requestStatusChanged', 'requestApproved'],
  icon: '',
  location: 'none',
  version: packageJson.version,
  maintainedBy: 'Remix'
}

export class MembershipRequestPlugin extends Plugin {
  dispatch: React.Dispatch<any> = () => {}
  private apiClient: ApiClient
  private pollTimer: ReturnType<typeof setTimeout> | null = null
  private pollStartTime: number = 0
  private state: MembershipRequestState = {
    show: false,
    view: 'loading',
    groups: [],
    selectedGroup: null,
    pendingStatus: null,
    error: null
  }

  constructor() {
    super(profile)
    this.apiClient = new ApiClient(endpointUrls.membershipRequests)
    const queryParams = new QueryParams()
    const allParams = queryParams.get() as Record<string, string>
    const apiKey = allParams.e2e_pool_key
    if (apiKey) {
      console.warn('[MembershipRequest] Using API key from URL query parameters. This is intended for testing purposes only.')
      this.apiClient.setToken(apiKey)
    }
  }

  async onActivation(): Promise<void> {
    // Check pending requests on startup
    await this.checkPendingRequests()
    // Start polling if there are still pending tokens
    const stored = this.getStoredTokens()
    if (stored.length > 0) {
      this.startPolling()
    }
    this.renderComponent()
  }

  onDeactivation(): void {
    this.stopPolling()
  }

  /**
   * Show the membership request form for a specific group (or all groups).
   * Called by other plugins: this.call('membershipRequest', 'showRequestForm', 'beta_program')
   */
  async showRequestForm(groupName?: string): Promise<void> {
    if (groupName) {
      try {
        const [autoInviteToken, autoInviteGroup] = await Promise.all([
          this.call('auth' as any, 'getAppConfigValue', 'auto_invite_token', ''),
          this.call('auth' as any, 'getAppConfigValue', 'auto_invite_group', '')
        ])

        if (
          typeof autoInviteToken === 'string' && autoInviteToken.trim() !== '' &&
          typeof autoInviteGroup === 'string' && autoInviteGroup.trim() === groupName
        ) {
          await this.call('invitationManager' as any, 'showInvite', autoInviteToken.trim())
          return
        }
      } catch {
        // Fall back to the normal membership request flow if app config is unavailable.
      }
    }

    this.state = {
      ...this.state,
      show: true,
      view: 'loading',
      error: null,
      pendingStatus: null
    }
    this.renderComponent()

    try {
      // Check if user already has a pending request for this group
      if (groupName) {
        const pending = this.findPendingToken(groupName)
        if (pending) {
          const statusResponse = await this.checkTokenStatus(pending.token)
          if (statusResponse && statusResponse.request.status === 'pending') {
            this.state = {
              ...this.state,
              view: 'pending',
              pendingStatus: statusResponse
            }
            this.renderComponent()
            return
          }
          // If not pending anymore, inject notifications into the bell and clean up
          if (statusResponse && statusResponse.request.status !== 'pending') {
            await this.injectNotifications(statusResponse.notifications, pending.token)
            this.removeStoredToken(pending.token)
          }
        }
      }

      // Fetch available groups
      const response = await this.apiClient.get<MembershipGroupsResponse>('/groups')
      if (!response.ok || !response.data) {
        throw new Error(response.error || 'Failed to fetch available groups')
      }

      const groups = response.data.groups
      let selectedGroup: MembershipGroup | null = null

      if (groupName) {
        selectedGroup = groups.find(g => g.name === groupName) || null
      }
      if (!selectedGroup && groups.length > 0) {
        selectedGroup = groups[0]
      }

      this.state = {
        ...this.state,
        view: 'form',
        groups,
        selectedGroup
      }
    } catch (e: any) {
      console.error('[MembershipRequest] Error fetching groups:', e)
      this.state = {
        ...this.state,
        view: 'error',
        error: e.message || 'Failed to load. Please try again later.'
      }
    }

    this.renderComponent()
  }

  /**
   * Check status of all pending requests stored in localStorage.
   * Resolved requests have their notifications injected into the notification
   * bell so the user can act on them (e.g., accept an invite) without being
   * interrupted by an overlay.
   */
  async checkPendingRequests(): Promise<void> {
    const stored = this.getStoredTokens()
    if (stored.length === 0) return

    for (const item of stored) {
      try {
        const statusResponse = await this.checkTokenStatus(item.token)
        if (!statusResponse) {
          continue
        }

        const { status } = statusResponse.request

        if (status === 'approved' || status === 'rejected' || status === 'expired') {
          // Inject all notifications from the response into the notification bell.
          // The bell's action routing handles invite acceptance, plugin calls, etc.
          await this.injectNotifications(statusResponse.notifications, item.token)

          if (status === 'approved') {
            const inviteNotification = statusResponse.notifications?.find(
              n => n.action?.invite_token
            )
            if (inviteNotification?.action?.invite_token) {
              this.emit('requestApproved', {
                group: item.group_name,
                inviteToken: inviteNotification.action.invite_token
              })
            }
          } else {
            this.emit('requestStatusChanged', { token: item.token, status })
          }

          this.removeStoredToken(item.token)
        }
        // 'pending' => keep polling
      } catch (e) {
        console.error('[MembershipRequest] Error checking token status:', e)
      }
    }
  }

  /**
   * Close the membership request overlay
   */
  async close(): Promise<void> {
    this.state = {
      show: false,
      view: 'loading',
      groups: [],
      selectedGroup: null,
      pendingStatus: null,
      error: null
    }
    this.renderComponent()
  }

  /**
   * Handle form submission
   */
  private async handleSubmit(groupId: number, nickname: string, email: string, comment: string): Promise<void> {
    this.state = { ...this.state, view: 'submitting', error: null }
    this.renderComponent()

    try {
      const body: Record<string, unknown> = { feature_group_id: groupId }
      if (nickname.trim()) body.nickname = nickname.trim()
      if (email.trim()) body.email = email.trim()
      if (comment.trim()) body.comment = comment.trim()

      const response = await this.apiClient.post<MembershipSubmitResponse>('', body)

      if (!response.ok || !response.data) {
        const errorMsg = response.status === 429
          ? 'You\'ve submitted too many requests. Please wait a moment and try again.'
          : (response.error || 'Failed to submit request')
        throw new Error(errorMsg)
      }

      // Store the claim token
      const group = this.state.selectedGroup
      this.storeToken({
        token: response.data.claim_token,
        group_id: groupId,
        group_name: group?.name || '',
        created_at: new Date().toISOString()
      })

      this.state = { ...this.state, view: 'success' }
      this.emit('requestSubmitted', {
        token: response.data.claim_token,
        groupId,
        groupName: group?.name
      })

      // Start polling for this token
      this.startPolling()
    } catch (e: any) {
      console.error('[MembershipRequest] Submit error:', e)
      this.state = {
        ...this.state,
        view: 'form',
        error: e.message || 'Failed to submit request'
      }
    }

    this.renderComponent()
  }

  /**
   * Trigger login flow
   */
  private async handleLogin(): Promise<void> {
    try {
      await this.call('auth', 'login')
    } catch (e) {
      console.error('[MembershipRequest] Login error:', e)
    }
  }

  /* ==================== Polling ==================== */

  private startPolling(): void {
    this.stopPolling()
    this.pollStartTime = Date.now()
    this.schedulePoll()
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer)
      this.pollTimer = null
    }
  }

  private getAdaptiveInterval(): number {
    const elapsed = Date.now() - this.pollStartTime
    const TEN_MIN = 10 * 60 * 1000
    const ONE_HOUR = 60 * 60 * 1000

    if (elapsed < TEN_MIN) return 30000 // 30s
    if (elapsed < ONE_HOUR) return 120000 // 2 min
    return 600000 // 10 min
  }

  private schedulePoll(): void {
    const interval = this.getAdaptiveInterval()
    this.pollTimer = setTimeout(async () => {
      await this.checkPendingRequests()
      // Continue polling if there are still pending tokens
      const remaining = this.getStoredTokens()
      if (remaining.length > 0) {
        this.schedulePoll()
      }
    }, interval)
  }

  /* ==================== Token Status ==================== */

  private async checkTokenStatus(token: string): Promise<MembershipStatusResponse | null> {
    try {
      const response = await this.apiClient.get<MembershipStatusResponse>(`/${token}`)
      if (response.ok && response.data) {
        return response.data
      }
    } catch (e) {
      console.error('[MembershipRequest] Status check failed:', e)
    }
    return null
  }

  /* ==================== Notification Injection ==================== */

  /**
   * Inject notifications from a membership status response into the
   * notification bell. Uses the claim token as a deduplication key so
   * the same notification is never added twice (even across polls).
   */
  private async injectNotifications(notifications: NotificationItem[], claimToken: string): Promise<void> {
    if (!notifications || notifications.length === 0) return

    for (let i = 0; i < notifications.length; i++) {
      const notification = notifications[i]
      const key = `membership_${claimToken}_${i}`
      try {
        await this.call('notificationCenter', 'addLocalNotification', notification, key)
      } catch (e) {
        console.error('[MembershipRequest] Failed to inject notification:', e)
      }
    }
  }

  /* ==================== LocalStorage ==================== */

  private getStoredTokens(): StoredToken[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  }

  private storeToken(item: StoredToken): void {
    const tokens = this.getStoredTokens()
    // Avoid duplicates
    if (!tokens.find(t => t.token === item.token)) {
      tokens.push(item)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens))
    }
  }

  private removeStoredToken(token: string): void {
    const tokens = this.getStoredTokens().filter(t => t.token !== token)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens))
  }

  private findPendingToken(groupName: string): StoredToken | undefined {
    return this.getStoredTokens().find(t => t.group_name === groupName)
  }

  /* ==================== Rendering ==================== */

  setDispatch(dispatch: React.Dispatch<any>): void {
    this.dispatch = dispatch
    this.renderComponent()
  }

  renderComponent(): void {
    this.dispatch({
      state: this.state,
      plugin: this
    })
  }

  updateComponent(dispatchState: { state: MembershipRequestState; plugin: MembershipRequestPlugin }): JSX.Element {
    return (
      <MembershipRequestOverlay
        state={dispatchState.state}
        onSubmit={(groupId, nickname, email, comment) => this.handleSubmit(groupId, nickname, email, comment)}
        onClose={() => this.close()}
        onLogin={() => this.handleLogin()}
      />
    )
  }

  render(): JSX.Element {
    return (
      <div id="membership-request" className="h-100">
        <PluginViewWrapper plugin={this} />
      </div>
    )
  }
}
