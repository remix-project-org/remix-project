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
const UNREDEEMED_KEY = 'remix_unredeemed_invite_tokens'

interface StoredToken {
  token: string
  group_id: number
  group_name: string
  created_at: string
}

interface UnredeemedInvite {
  invite_token: string
  group_name: string
  stored_at: string
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
  private invitationManagerBusy = false
  debugEnabled = false
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
    this.debugEnabled = false
    const queryParams = new QueryParams()
    const allParams = queryParams.get() as Record<string, string>
    const apiKey = allParams.e2e_pool_key
    if (apiKey) {
      console.warn('[MembershipRequest] Using API key from URL query parameters. This is intended for testing purposes only.')
      this.apiClient.setToken(apiKey)
    }
  }

  private log(message: string, ...args: any[]): void {
    if (this.debugEnabled) console.log(`[MembershipRequest] ${message}`, ...args)
  }

  async onActivation(): Promise<void> {
    this.log('activated')
    // Track whether invitationManager is currently showing a modal
    this.on('invitationManager' as any, 'inviteShown', () => {
      this.log('invitationManager busy — invite shown')
      this.invitationManagerBusy = true
    })
    this.on('invitationManager' as any, 'inviteClosed', (data: { token: string | null }) => {
      this.invitationManagerBusy = false
      this.log('invite closed (later)', { token: data?.token })
      // User clicked "I'll do this later" — persist the token so we can show the modal again later
      if (data?.token) {
        this.storeUnredeemedInvite({
          invite_token: data.token,
          group_name: '',
          stored_at: new Date().toISOString()
        })
        this.log('stored unredeemed invite for later', data.token)
      }
    })
    this.on('invitationManager' as any, 'inviteRedeemed', (data: { token: string }) => {
      this.invitationManagerBusy = false
      this.log('invite redeemed — removing from storage', data?.token)
      // Clean up unredeemed storage when the invite is actually redeemed
      if (data?.token) this.removeUnredeemedInvite(data.token)
    })
    this.on('invitationManager' as any, 'inviteDismissedForever', (data: { token: string }) => {
      this.invitationManagerBusy = false
      this.log('invite dismissed forever — removing from storage', data?.token)
      // User chose "Don't show me again" — remove from unredeemed storage
      if (data?.token) this.removeUnredeemedInvite(data.token)
    })

    // When the user authenticates, silently clean up any unredeemed invite tokens
    // that were already redeemed server-side (e.g. auto-redeemed on account creation).
    this.on('auth', 'authStateChanged', async (state: { isAuthenticated: boolean } | boolean) => {
      const isAuthenticated = typeof state === 'boolean' ? state : !!state?.isAuthenticated
      this.log('authStateChanged', { isAuthenticated })
      if (isAuthenticated) {
        await this.purgeRedeemedInvites()
      }
      await this.checkUnredeemedInvites()
    })

    // Fallback sync: if auth resolved before this plugin subscribed, pull current state
    // from auth plugin and run the same invite reconciliation flow.
    try {
      await this.call('auth', 'waitForAuthResolution')
      const isAuthenticated = await this.call('auth', 'isAuthenticated') as boolean
      this.log('initial auth sync from auth plugin', { isAuthenticated })
      if (isAuthenticated) {
        await this.purgeRedeemedInvites()
      }
      await this.checkUnredeemedInvites()
    } catch (e) {
      this.log('initial auth sync failed', e)
    }

    

    // Check pending requests on startup
    //await this.checkPendingRequests()
    // Try to show any unredeemed invites from previous sessions
   
    // Start polling if there are still pending tokens
    const stored = this.getStoredTokens()
    this.log(`found ${stored.length} pending claim token(s) in storage`)
    if (stored.length > 0) {
      this.startPolling()
    }
    this.renderComponent()
  }

  onDeactivation(): void {
    this.log('deactivated — stopping poller')
    this.stopPolling()
  }

  /**
   * Show the membership request form for a specific group (or all groups).
   * Called by other plugins: this.call('membershipRequest', 'showRequestForm', 'beta_program')
   */
  async showRequestForm(groupName?: string): Promise<void> {
    this.log('showRequestForm', { groupName })
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
          this.log('found existing claim token for group', groupName, pending.token)
          const statusResponse = await this.checkTokenStatus(pending.token)
          if (statusResponse && statusResponse.request.status === 'pending') {
            this.log('request still pending — showing pending view')
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
            this.log('request no longer pending — injecting notifications and removing token', { status: statusResponse.request.status })
            await this.injectNotifications(statusResponse.notifications, pending.token)
            this.removeStoredToken(pending.token)
          }
        }
      }

      // Fetch available groups
      this.log('fetching available groups')
      const response = await this.apiClient.get<MembershipGroupsResponse>('/groups')
      if (!response.ok || !response.data) {
        throw new Error(response.error || 'Failed to fetch available groups')
      }

      const groups = response.data.groups
      this.log(`received ${groups.length} group(s)`, groups.map(g => g.name))
      let selectedGroup: MembershipGroup | null = null

      if (groupName) {
        selectedGroup = groups.find(g => g.name === groupName) || null
      }
      if (!selectedGroup && groups.length > 0) {
        selectedGroup = groups[0]
      }
      this.log('selected group', selectedGroup?.name)

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
    this.log(`checkPendingRequests — ${stored.length} token(s)`)
    if (stored.length === 0) return

    for (const item of stored) {
      try {
        this.log('checking status for token', item.token, `(group: ${item.group_name})`)
        const statusResponse = await this.checkTokenStatus(item.token)
        if (!statusResponse) {
          this.log('no response for token', item.token)
          continue
        }

        const { status } = statusResponse.request
        this.log('token status', { token: item.token, status })

        if (status === 'approved' || status === 'rejected' || status === 'expired') {
          // Inject all notifications from the response into the notification bell.
          // The bell's action routing handles invite acceptance, plugin calls, etc.
          await this.injectNotifications(statusResponse.notifications, item.token)

          if (status === 'approved') {
            const inviteNotification = statusResponse.notifications?.find(
              n => n.action?.invite_token
            )
            if (inviteNotification?.action?.invite_token) {
              this.log('request approved — emitting requestApproved and storing invite token', inviteNotification.action.invite_token)
              this.emit('requestApproved', {
                group: item.group_name,
                inviteToken: inviteNotification.action.invite_token
              })
              // Store as unredeemed so we can show the invite later if needed
              this.storeUnredeemedInvite({
                invite_token: inviteNotification.action.invite_token,
                group_name: item.group_name,
                stored_at: new Date().toISOString()
              })
              // Show invite modal only if invitationManager is not already busy
              if (!this.invitationManagerBusy) {
                this.log('showing invite modal for approved token', inviteNotification.action.invite_token)
                try {
                  await this.call('invitationManager' as any, 'showInvite', inviteNotification.action.invite_token)
                } catch (e) {
                  console.error('[MembershipRequest] Failed to show invite modal:', e)
                }
              } else {
                this.log('invitationManager busy — skipping auto-show of invite modal')
              }
            }
          } else {
            this.log(`request ${status} — emitting requestStatusChanged`)
            this.emit('requestStatusChanged', { token: item.token, status })
          }

          this.log('removing resolved token from storage', item.token)
          this.removeStoredToken(item.token)
        } else {
          this.log('token still pending — keeping in storage', item.token)
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
    this.log('close')
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
    this.log('handleSubmit', { groupId, nickname, email: email ? '(provided)' : '(empty)', comment: comment ? '(provided)' : '(empty)' })
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
      this.log('request submitted — storing claim token', response.data.claim_token, `(group: ${group?.name})`)
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
    this.log('handleLogin — triggering auth.login')
    try {
      await this.call('auth', 'login')
    } catch (e) {
      console.error('[MembershipRequest] Login error:', e)
    }
  }

  /* ==================== Polling ==================== */

  private startPolling(): void {
    this.log('startPolling')
    this.stopPolling()
    this.pollStartTime = Date.now()
    this.schedulePoll()
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      this.log('stopPolling')
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
    this.log(`schedulePoll — next check in ${interval / 1000}s`)
    this.pollTimer = setTimeout(async () => {
      await this.checkPendingRequests()
      // Continue polling if there are still pending tokens
      const remaining = this.getStoredTokens()
      if (remaining.length > 0) {
        this.schedulePoll()
      } else {
        this.log('no more pending tokens — polling stopped')
      }
    }, interval)
  }

  /* ==================== Token Status ==================== */

  private async checkTokenStatus(token: string): Promise<MembershipStatusResponse | null> {
    this.log('checkTokenStatus', token)
    try {
      const response = await this.apiClient.get<MembershipStatusResponse>(`/${token}`)
      if (response.ok && response.data) {
        this.log('checkTokenStatus result', { token, status: response.data.request.status })
        return response.data
      }
      this.log('checkTokenStatus non-ok response', { token, status: response.status })
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
    if (!notifications || notifications.length === 0) {
      this.log('injectNotifications — no notifications to inject')
      return
    }
    this.log(`injectNotifications — injecting ${notifications.length} notification(s) for token`, claimToken)

    for (let i = 0; i < notifications.length; i++) {
      const notification = notifications[i]
      const key = `membership_${claimToken}_${i}`
      try {
        await this.call('notificationCenter', 'addLocalNotification', notification, key)
        this.log('injected notification', { key, title: notification.title })
      } catch (e) {
        console.error('[MembershipRequest] Failed to inject notification:', e)
      }
    }
  }

  /* ==================== Unredeemed Invite Tokens ==================== */

  /**
   * Silently validate all stored unredeemed invite tokens and remove any that
   * the API reports as already redeemed. Called after the user authenticates
   * so tokens auto-redeemed on account creation are cleaned up immediately.
   */
  private async purgeRedeemedInvites(): Promise<void> {
    const unredeemed = this.getUnredeemedInvites()
    this.log(`purgeRedeemedInvites — checking ${unredeemed.length} unredeemed invite(s)`)
    if (unredeemed.length === 0) return

    for (const item of unredeemed) {
      try {
        const validation = await this.call('invitationManager' as any, 'validateToken', item.invite_token)
        if (validation?.already_redeemed || !validation?.valid) {
          this.log('purging invite token (already redeemed or invalid)', item.invite_token)
          this.removeUnredeemedInvite(item.invite_token)
        }
      } catch (e) {
        // Ignore — will be caught next time
      }
    }
  }

  /**
   * Check unredeemed invite tokens on app load.
   * If the token is already redeemed, remove it. If invitationManager is busy
   * (e.g. showing a URL invite), skip and wait for next round.
   */
  private async checkUnredeemedInvites(): Promise<void> {
    const unredeemed = this.getUnredeemedInvites()
    this.log(`checkUnredeemedInvites — ${unredeemed.length} stored unredeemed invite(s)`)
    if (unredeemed.length === 0) return

    for (const item of unredeemed) {
      try {
        this.log('validating unredeemed invite token', item.invite_token)
        // Check if the invite token has already been redeemed
        const validation = await this.call('invitationManager' as any, 'validateToken', item.invite_token)
        this.log('validation result for unredeemed invite', validation)
        if (validation?.already_redeemed) {
          this.log('invite already redeemed — removing', item.invite_token)
          this.removeUnredeemedInvite(item.invite_token)
          continue
        }
        if (!validation?.valid) {
          this.log('invite invalid/expired — removing', item.invite_token)
          // Token is invalid/expired — remove it
          this.removeUnredeemedInvite(item.invite_token)
          continue
        }

        // If invitationManager is already showing an invite, skip for now
        if (this.invitationManagerBusy) {
          this.log('invitationManager busy — skipping unredeemed invite for now', item.invite_token)
          continue
        }

        // Show the invite modal
        this.log('showing unredeemed invite modal', item.invite_token)
        try {
          await this.call('invitationManager' as any, 'showInvite', item.invite_token)
        } catch (e) {
          console.error('[MembershipRequest] Failed to show unredeemed invite:', e)
        }
        // Only show one at a time
        break
      } catch (e) {
        console.error('[MembershipRequest] Error checking unredeemed invite:', e)
      }
    }
  }

  private getUnredeemedInvites(): UnredeemedInvite[] {
    try {
      const raw = localStorage.getItem(UNREDEEMED_KEY)
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  }

  private storeUnredeemedInvite(item: UnredeemedInvite): void {
    const invites = this.getUnredeemedInvites()
    if (!invites.find(i => i.invite_token === item.invite_token)) {
      invites.push(item)
      localStorage.setItem(UNREDEEMED_KEY, JSON.stringify(invites))
      this.log('stored unredeemed invite', item.invite_token, `(group: ${item.group_name})`)
    } else {
      this.log('unredeemed invite already in storage — skipping', item.invite_token)
    }
  }

  private removeUnredeemedInvite(inviteToken: string): void {
    this.log('removeUnredeemedInvite', inviteToken)
    const invites = this.getUnredeemedInvites().filter(i => i.invite_token !== inviteToken)
    localStorage.setItem(UNREDEEMED_KEY, JSON.stringify(invites))
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
      this.log('stored claim token', item.token, `(group: ${item.group_name})`)
    } else {
      this.log('claim token already in storage — skipping', item.token)
    }
  }

  private removeStoredToken(token: string): void {
    this.log('removeStoredToken', token)
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
