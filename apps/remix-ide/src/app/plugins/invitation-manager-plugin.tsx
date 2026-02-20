import { Plugin } from '@remixproject/engine'
import React from 'react'
import { InviteOverlay, InviteState } from '@remix-ui/invites'
import { PluginViewWrapper } from '@remix-ui/helper'
import { InviteValidateResponse, InviteRedeemResponse } from '@remix-api'
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

  async onActivation(): Promise<void> {
    // Listen for auth state changes
    this.on('auth', 'authStateChanged', async (isAuthenticated: boolean) => {
      console.log('[InvitationManager] Auth state changed:', isAuthenticated)
      if (this.state.show) {
        this.state = { ...this.state, isAuthenticated }
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
  async showInvite(token: string): Promise<void> {
    // Validate the token first
    const validation = await this.validateToken(token)

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
   * Close the invite modal
   */
  async close(): Promise<void> {
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
   */
  private async checkUrlForInvite(): Promise<void> {
    const hash = window.location.hash
    const match = hash.match(/[#&]invite=([A-Za-z0-9_-]+)/)

    if (match) {
      const token = match[1]
      console.log('[InvitationManager] Found invite token in URL:', token)

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
        onClose={() => this.close()}
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
