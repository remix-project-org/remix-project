import { Plugin } from '@remixproject/engine'
import React from 'react'
import { InviteOverlay, InviteState } from '@remix-ui/invites'
import { PluginViewWrapper } from '@remix-ui/helper'
import { InviteValidateResponse, InviteRedeemResponse } from '@remix-api'
import { Registry } from '@remix-project/remix-lib'
import * as packageJson from '../../../../../package.json'

const profile = {
  name: 'invitationManager',
  displayName: 'Invitation Manager',
  description: 'Manages invite token validation and redemption',
  methods: ['showInvite', 'validateToken', 'redeemToken', 'close'],
  events: ['inviteShown', 'inviteClosed', 'inviteRedeemed'],
  icon: '',
  location: 'none',
  version: packageJson.version,
  maintainedBy: 'Remix'
}

export class InvitationManagerPlugin extends Plugin {
  /** Set to true to enable verbose console.log output for debugging */
  private static DEBUG = false

  private onShowInviteDismissAction: ((action: 'later' | 'never') => void) | null = null

  dispatch: React.Dispatch<any> = () => {}
  private state: InviteState = {
    show: false,
    token: null,
    validation: null,
    isAuthenticated: false,
    redeeming: false,
    redeemResult: null,
    error: null
  }

  constructor() {
    super(profile)
  }

  /** Debug-gated logger – silent when DEBUG is false */
  private log(...args: any[]) {
    if (InvitationManagerPlugin.DEBUG) console.log(...args)
  }

  async onActivation(): Promise<void> {
    // Listen for auth state changes
    this.on('auth', 'authStateChanged', async (isAuthenticated: boolean) => {
      this.log('[InvitationManager] Auth state changed:', isAuthenticated)
      if (this.state.show) {
        this.state = { ...this.state, isAuthenticated }
        this.renderComponent()
      }
    })

    // Listen for invite token redeemed (e.g. auto-redeemed after login or already
    // redeemed during the login/registration flow on the backend). This transitions
    // the modal straight to the success state so the user never sees a stale
    // "Redeem" button for a token that was already consumed.
    this.on('auth', 'inviteTokenRedeemed', (data: { token: string; actions: any[] }) => {
      this.log('[InvitationManager] Invite redeemed via auth plugin:', data.token)
      if (this.state.show && this.state.token === data.token) {
        this.state = {
          ...this.state,
          redeeming: false,
          redeemResult: { success: true, actions_applied: data.actions },
          error: null
        }
        this.renderComponent()
      }
    })

    // Check for pending invite on activation (handles page refresh)
    await this.checkPendingInvite()

    // Check URL for invite token
    await this.checkUrlForInvite()

    this.renderComponent()
  }

  /**
   * Show the invite modal with a specific token
   * Can be called by any plugin: this.call('invitationManager', 'showInvite', 'TOKEN')
   */
  async showInvite(token: string, onDismissAction?: (action: 'later' | 'never') => void): Promise<void> {
    this.onShowInviteDismissAction = typeof onDismissAction === 'function' ? onDismissAction : null

    // Validate the token first
    const validation = await this.validateToken(token)

    // ── "request" invite type ──
    // Instead of granting access, these tokens trigger the membership request
    // flow.  Each action with type === 'membership_request' maps to a feature
    // group.  For 'beta' we open the AI interest survey; for anything else we
    // open the default membership request form.
    if (validation.valid && validation.invite_type === 'request') {
      const membershipActions = (validation.actions || []).filter(
        a => a.type === 'membership_request' && a.feature_group_name
      )

      if (membershipActions.length > 0) {
        // Pick the first membership_request action to determine which form to show
        const action = membershipActions[0]
        this.log(
          '[InvitationManager] "request" invite detected – routing to membershipRequest for group:',
          action.feature_group_name
        )
        await this.call('membershipRequest', 'showRequestForm', action.feature_group_name)
        return
      }
    }

    // Check auth state
    const isAuthenticated = await this.checkAuthState()

    // Update state and show modal
    this.state = {
      ...this.state,
      show: true,
      token,
      validation,
      isAuthenticated,
      redeeming: false,
      redeemResult: null,
      error: null
    }

    // Store as pending (for after login if needed)
    await this.call('auth', 'setPendingInviteToken', token)
    await this.call('auth', 'setPendingInviteValidation', token, validation)

    this.renderComponent()
    this.emit('inviteShown', { token, validation })
  }

  /**
   * Validate a token (no auth required)
   */
  async validateToken(token: string): Promise<InviteValidateResponse> {
    try {
      return await this.call('auth', 'validateInviteToken', token)
    } catch (e: any) {
      return {
        valid: false,
        error: e.message || 'Failed to validate token',
        error_code: 'NOT_FOUND'
      }
    }
  }

  /**
   * Redeem a token (auth required)
   */
  async redeemToken(token: string): Promise<InviteRedeemResponse> {
    this.state = { ...this.state, redeeming: true, error: null }
    this.renderComponent()

    try {
      const result = await this.call('auth', 'redeemInviteToken', token)

      this.state = {
        ...this.state,
        redeeming: false,
        redeemResult: result,
        error: result.success ? null : (result.error || 'Failed to redeem')
      }

      if (result.success) {
        // Clear pending token
        await this.call('auth', 'clearPendingInviteToken')
        // Reload permissions so UI (top bar, badges) updates immediately
        await this.call('auth', 'refreshPermissions')
        this.emit('inviteRedeemed', { token, result })
      }

      this.renderComponent()
      return result
    } catch (e: any) {
      const result: InviteRedeemResponse = {
        success: false,
        error: e.message || 'Failed to redeem invite'
      }
      this.state = {
        ...this.state,
        redeeming: false,
        redeemResult: result,
        error: result.error!
      }
      this.renderComponent()
      return result
    }
  }

  /**
   * Start a walkthrough via the walkthrough plugin
   */
  async startWalkthrough(slug: string): Promise<void> {
    try {
      this.log('[InvitationManager] Starting walkthrough:', slug)
      await this.call('walkthrough' as any, 'start', slug)
    } catch (e) {
      console.error('[InvitationManager] Failed to start walkthrough:', e)
    }
  }

  /**
   * Close the invite modal
   */
  async close(reason: 'close' | 'later' | 'never' = 'close'): Promise<void> {
    this.state = {
      show: false,
      token: null,
      validation: null,
      isAuthenticated: false,
      redeeming: false,
      redeemResult: null,
      error: null
    }

    // Clear pending invite
    try {
      await this.call('auth', 'clearPendingInviteToken')
    } catch (e) {
      // Ignore
    }

    if (this.onShowInviteDismissAction) {
      const callback = this.onShowInviteDismissAction
      this.onShowInviteDismissAction = null
      const action: 'later' | 'never' = reason === 'never' ? 'never' : 'later'
      try {
        callback(action)
      } catch (e) {
        console.error('[InvitationManager] Invite dismiss callback failed:', e)
      }
    }

    this.emit('inviteClosed')
    this.renderComponent()
  }

  /**
   * Called when user logs in - refresh auth state and show redeem button
   */
  async onAuthStateChanged(isAuthenticated: boolean): Promise<void> {
    if (this.state.show) {
      this.state = { ...this.state, isAuthenticated }
      this.renderComponent()
    }
  }

  /**
   * Check if user is authenticated
   */
  private async checkAuthState(): Promise<boolean> {
    try {
      return await this.call('auth', 'isAuthenticated')
    } catch {
      return false
    }
  }

  /**
   * Check for pending invite (from previous session or after login)
   */
  private async checkPendingInvite(): Promise<void> {
    try {
      const pending = await this.call('auth', 'getPendingInviteValidation')
      if (pending && pending.token && pending.validation) {
        const isAuthenticated = await this.checkAuthState()
        this.state = {
          ...this.state,
          show: true,
          token: pending.token,
          validation: pending.validation,
          isAuthenticated
        }

        this.renderComponent()
      }
    } catch (e) {
      console.error('[InvitationManager] Error checking pending invite:', e)
    }
  }

  /**
   * Check URL for invite token on startup
   * Supports: ?invite=TOKEN, ?invite_token=TOKEN, and #invite=TOKEN
   */
  private async checkUrlForInvite(): Promise<void> {
    // Read invite token from Registry (set early by app.ts) so it survives URL
    // param cleanup.  Fall back to reading from the URL directly.
    let queryToken: string | null = null
    try {
      const entry = Registry.getInstance().get('inviteToken')
      this.log('[InvitationManager] Invite token from Registry on URL check:', entry)
      if (entry && entry.api) queryToken = entry.api as string
    } catch {}
    if (!queryToken) {
      const params = new URLSearchParams(window.location.search)
      queryToken = params.get('invite') || params.get('invite_token')
    }

    if (queryToken) {

      await this.showInvite(queryToken)
      return
    }

    // Fallback: check hash (#invite=TOKEN)
    const hash = window.location.hash
    const match = hash.match(/[#&]invite=([A-Za-z0-9_-]+)/)

    if (match) {
      const token = match[1]
      this.log('[InvitationManager] Found invite token in URL hash:', token)

      // Clean URL
      this.cleanInviteFromUrl()

      // Show the invite modal
      await this.showInvite(token)
    }
  }

  /**
   * Clean invite parameter from URL hash
   */
  private cleanInviteFromUrl(): void {
    const hash = window.location.hash.substring(1)
    if (!hash) return

    const params: Record<string, string> = {}
    hash.split('&').forEach(part => {
      const [key, value] = part.split('=')
      if (key && key !== 'invite') {
        params[key] = value || ''
      }
    })

    const remainingKeys = Object.keys(params)
    if (remainingKeys.length > 0) {
      const newHash = '#' + remainingKeys.map(k => params[k] ? `${k}=${params[k]}` : k).join('&')
      window.history.replaceState(null, '', window.location.pathname + window.location.search + newHash)
    } else {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
  }

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

  updateComponent(dispatchState: { state: InviteState; plugin: InvitationManagerPlugin }): JSX.Element {
    return (
      <InviteOverlay
        state={dispatchState.state}
        onRedeem={(token) => this.redeemToken(token)}
        onClose={() => this.close('close')}
        onDoLater={this.onShowInviteDismissAction ? () => this.close('later') : undefined}
        onDismissPermanent={this.onShowInviteDismissAction ? () => this.close('never') : undefined}
        onStartWalkthrough={(slug) => this.startWalkthrough(slug)}
        plugin={dispatchState.plugin}
      />
    )
  }

  render(): JSX.Element {
    return (
      <div id="invitation-manager" className="h-100">
        <PluginViewWrapper plugin={this} />
      </div>
    )
  }
}
