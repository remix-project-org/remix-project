import { Plugin } from '@remixproject/engine'
import React from 'react'
import { PluginViewWrapper } from '@remix-ui/helper'
import { useAuth } from '@remix-ui/app'
import * as packageJson from '../../../../../package.json'
import './beta-corner-widget.css'

declare global {
  interface Window { __IS_E2E_TEST__?: boolean }
}

/* ─── Constants ─── */

const DEBUG = false
const log = (...args: any[]) => { if (DEBUG) console.log('[BetaCornerWidget]', ...args) }

const DISMISSED_KEY = 'remix_beta_corner_dismissed'
const TOKEN_STORAGE_KEY = 'remix_anonymous_request_tokens'

/*
 * Activity-based trigger — the widget only appears after the user demonstrates
 * real development engagement.  Each action earns points:
 *   • File save            → 1 pt
 *   • Successful compile   → 3 pts
 *   • Deploy transaction   → 4 pts
 * The widget surfaces once the score reaches ACTIVITY_THRESHOLD **and** at least
 * MIN_SESSION_MS have elapsed (so it never flash-appears on first load).
 */
const ACTIVITY_THRESHOLD = 10
const MIN_SESSION_MS = 5_000 // 5 seconds minimum

/* ─── Plugin profile ─── */

const profile = {
  name: 'betaCornerWidget',
  displayName: 'Beta Corner Widget',
  description: 'Non-intrusive floating widget that promotes beta sign-up after detecting real dev activity',
  methods: ['dismiss', 'dismissPermanent', 'show'],
  events: [],
  icon: '',
  location: 'none',
  version: packageJson.version,
  maintainedBy: 'Remix'
}

/* ─── State shape ─── */

export interface BetaCornerWidgetState {
  visible: boolean
  animateOut: boolean
  dismissed: boolean
  closedThisSession: boolean
}

/* ─── Helper ─── */

function hasExistingBetaToken(): boolean {
  try {
    const raw = localStorage.getItem(TOKEN_STORAGE_KEY)
    if (!raw) return false
    const tokens = JSON.parse(raw) as { group_name: string }[]
    return tokens.some(t => t.group_name === 'beta')
  } catch {
    return false
  }
}

/* ─── Plugin class ─── */

export class BetaCornerWidgetPlugin extends Plugin {
  dispatch: React.Dispatch<any> = () => { }

  private score = 0
  private sessionStart = Date.now()
  private shown = false
  private fallbackTimer: ReturnType<typeof setTimeout> | null = null

  private state: BetaCornerWidgetState = {
    visible: false,
    animateOut: false,
    dismissed: localStorage.getItem(DISMISSED_KEY) === 'true',
    closedThisSession: false
  }

  constructor() {
    super(profile)
  }

  /* ─── Lifecycle ─── */

  async onActivation(): Promise<void> {
    // Disable the plugin behavior in E2E runs to avoid invite-modal flakiness.
    if (window.__IS_E2E_TEST__) {
      this.renderComponent()
      return
    }

    // Don't bother listening if already permanently dismissed or already beta
    if (this.state.dismissed || await this.hasBetaAccess()) {
      this.renderComponent()
      return
    }

    // Listen for dev-activity events via the plugin engine (proper namespaced listeners)
    this.on('fileManager', 'fileSaved', () => this.addScore(1))
    this.on('solidity', 'compilationFinished', () => this.addScore(3))
    this.on('udapp', 'newTransaction', () => this.addScore(4))

    // Hide widget if the user just submitted a beta request or got approved
    this.on('membershipRequest', 'requestSubmitted', () => this.autoDismiss())
    this.on('membershipRequest', 'requestApproved', () => this.autoDismiss())

    // Hide when a beta invite is redeemed through the invitation system
    this.on('invitationManager' as any, 'inviteRedeemed', async () => {
      // Any successful invite redemption could grant beta — re-check token
      if (await this.hasBetaAccess()) {
        this.autoDismiss()
      }
    })

    // Hide when auth state changes and the user now has beta access
    this.on('auth' as any, 'authStateChanged', async () => {
      if (await this.hasBetaAccess()) {
        this.autoDismiss()
      }
    })

    // Fallback: if the user has been active a long time but hasn't hit the
    // threshold (e.g., reading docs, browsing files), still show eventually
    this.fallbackTimer = setTimeout(() => {
      if (!this.shown && this.score > 0) {
        this.showWidget()
      }
    }, 5 * 60_000) // 5 minutes

    this.renderComponent()
  }

  onDeactivation(): void {
    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer)
      this.fallbackTimer = null
    }
    this.off('fileManager', 'fileSaved')
    this.off('solidity', 'compilationFinished')
    this.off('udapp', 'newTransaction')
    this.off('membershipRequest', 'requestSubmitted')
    this.off('membershipRequest', 'requestApproved')
    this.off('invitationManager' as any, 'inviteRedeemed')
    this.off('auth' as any, 'authStateChanged')
  }

  /* ─── Scoring logic ─── */

  private addScore(pts: number): void {
    log(`Adding ${pts} points for activity. Current score: ${this.score + pts}`)
    this.score += pts
    this.tryShow()
  }

  private tryShow(): void {
    if (this.shown) return
    const elapsed = Date.now() - this.sessionStart
    if (this.score >= ACTIVITY_THRESHOLD && elapsed >= MIN_SESSION_MS) {
      log(`Activity threshold met (score: ${this.score}, elapsed: ${elapsed}ms). Showing widget.`)
      this.showWidget()
    }
  }

  private async showWidget(): Promise<void> {
    if (window.__IS_E2E_TEST__) return

    // Never show widget or invite modal when beta access is already present.
    if (await this.hasBetaAccess()) {
      this.autoDismiss()
      return
    }

    const autoInviteToken = await this.call('auth' as any, 'getAppConfigValue', 'auto_invite_token', '')
    console.log('Retrieved auto_invite_token from appConfig:', autoInviteToken)
    if (autoInviteToken && typeof autoInviteToken === 'string' && autoInviteToken.trim() !== '') {
      log('auto_invite_token found in appConfig, delegating to invitationManager')
      this.shown = true
      this.state = { ...this.state, closedThisSession: true }
      this.renderComponent()
      this.call('invitationManager' as any, 'showInvite', autoInviteToken, (action: 'later' | 'never') => {
        if (action === 'never') {
          this.dismissPermanent()
          return
        }
        this.dismiss()
      }).catch((err) => {
        log('Failed to show invite via invitationManager', err)
      })
      return
    }
    this.shown = true
    this.state = { ...this.state, visible: true }
    this.renderComponent()
  }

  private async hasBetaAccess(): Promise<boolean> {
    if (hasExistingBetaToken()) return true

    try {
      const isAuthenticated = await this.call('auth' as any, 'isAuthenticated')
      if (!isAuthenticated) return false

      const permissions = await this.call('auth' as any, 'getAllPermissions')
      const groups = permissions?.feature_groups || []
      return groups.some((g: any) => g?.name === 'beta')
    } catch {
      return false
    }
  }

  /** Auto-hide after the user submits a request or gets approved */
  private autoDismiss(): void {
    this.state = { ...this.state, closedThisSession: true }
    this.renderComponent()
  }

  /* ─── Public methods (callable by other plugins) ─── */

  /** Show the widget immediately (for testing or manual trigger) */
  show(): void {
    this.showWidget()
  }

  /** Close for this session only (X button) */
  dismiss(): void {
    this.state = { ...this.state, animateOut: true }
    this.renderComponent()
    this.call('matomo', 'trackEvent', 'cornerWidget', 'betaPromo', 'closedSession', undefined).catch(() => { })
    setTimeout(() => {
      this.state = { ...this.state, closedThisSession: true }
      this.renderComponent()
    }, 300)
  }

  /** Never show again (permanent) */
  dismissPermanent(): void {
    this.state = { ...this.state, animateOut: true }
    this.renderComponent()
    localStorage.setItem(DISMISSED_KEY, 'true')
    this.call('matomo', 'trackEvent', 'cornerWidget', 'betaPromo', 'dismissedPermanent', undefined).catch(() => { })
    setTimeout(() => {
      this.state = { ...this.state, dismissed: true }
      this.renderComponent()
    }, 300)
  }

  /** Called when the user clicks "Register now" */
  private handleRegisterClick(): void {
    this.call('membershipRequest', 'showRequestForm', 'beta')
    this.call('matomo', 'trackEvent', 'cornerWidget', 'betaPromo', 'joinClicked', undefined).catch(() => { })
  }

  /* ─── Rendering ─── */

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

  updateComponent(dispatchState: { state: BetaCornerWidgetState; plugin: BetaCornerWidgetPlugin }): JSX.Element {
    return (
      <BetaCornerWidgetUI
        state={dispatchState.state}
        onRegister={() => this.handleRegisterClick()}
        onDismiss={() => this.dismiss()}
        onDismissPermanent={() => this.dismissPermanent()}
      />
    )
  }

  render(): JSX.Element | null {
    if (window.__IS_E2E_TEST__) {
      return null // Don't render the widget at all during E2E tests to avoid flakiness
    }
    return (
      <div id="beta-corner-widget">
        <PluginViewWrapper plugin={this} />
      </div>
    )
  }
}

/* ─── Pure React UI component ─── */

interface BetaCornerWidgetUIProps {
  state: BetaCornerWidgetState
  onRegister: () => void
  onDismiss: () => void
  onDismissPermanent: () => void
}

function BetaCornerWidgetUI({ state, onRegister, onDismiss, onDismissPermanent }: BetaCornerWidgetUIProps) {
  const { isAuthenticated, featureGroups } = useAuth()
  const hasBeta = featureGroups?.some(fg => fg.name === 'beta')

  if (state.dismissed || state.closedThisSession || !state.visible || isAuthenticated || hasBeta || hasExistingBetaToken()) {
    return null
  }

  return (
    <div
      className={`beta-corner-widget ${state.animateOut ? 'beta-corner-widget--out' : ''}`}
      data-id="beta-corner-widget"
    >
      <button
        className="beta-corner-widget-close"
        onClick={(e) => { e.stopPropagation(); onDismiss() }}
        title="Dismiss"
      >
        <i className="fas fa-times"></i>
      </button>

      <div className="beta-corner-widget-body" onClick={onRegister}>
        <div className="beta-corner-widget-illustration">
          <div className="beta-corner-widget-icon-wrap">
            <i className="fas fa-robot"></i>
          </div>
        </div>

        <h6 className="beta-corner-widget-title">Remix AI beta testing</h6>
        <p className="beta-corner-widget-desc">
          Help shape the future of AI-powered Solidity development. Get early access to premium models, cloud storage &amp; more.
        </p>
        <span className="beta-corner-widget-cta">
          Register now <i className="fas fa-chevron-right"></i>
        </span>
      </div>
      <button
        className="beta-corner-widget-never"
        onClick={(e) => { e.stopPropagation(); onDismissPermanent() }}
      >
        Don&apos;t show this again
      </button>
    </div>
  )
}
