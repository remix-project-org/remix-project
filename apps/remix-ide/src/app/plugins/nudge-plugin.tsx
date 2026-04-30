import { Plugin } from '@remixproject/engine'
import React from 'react'
import { PluginViewWrapper } from '@remix-ui/helper'
import { NudgeEngine, all, any } from '@remix-project/remix-lib'
import type { NudgeRule, NudgeAction, SerializedNudgeRule } from '@remix-project/remix-lib'
import { trackMatomoEvent as baseTrackMatomoEvent, NudgeEvent, MatomoEvent } from '@remix-api'
import * as packageJson from '../../../../../package.json'
import './nudge-widget.css'

declare global {
  interface Window { __IS_E2E_TEST__?: boolean }
}

/* ─── Inline SVG icons (avoids FA version issues) ─── */
const MCP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><circle cx="4.5" cy="4.5" r="2"/><circle cx="19.5" cy="4.5" r="2"/><circle cx="4.5" cy="19.5" r="2"/><circle cx="19.5" cy="19.5" r="2"/><line x1="6.3" y1="6.3" x2="10" y2="10"/><line x1="17.7" y1="6.3" x2="14" y2="10"/><line x1="6.3" y1="17.7" x2="10" y2="14"/><line x1="17.7" y1="17.7" x2="14" y2="14"/></svg>`

const CLAUDE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" fill="currentColor"><path d="M164.4 404.5L265.1 348L266.8 343.1L265.1 340.4L260.2 340.4L243.4 339.4L185.9 337.8L136 335.7L87.7 333.1L75.5 330.5L64.1 315.5L65.3 308L75.5 301.1L90.2 302.4C109.1 303.7 136.1 305.5 171.2 308L206.4 310.1L258.6 315.5L266.9 315.5L268.1 312.1L265.3 310L263.1 307.9L212.8 273.8L158.4 237.8L129.9 217.1L114.5 206.6L106.7 196.8L103.3 175.3L117.3 159.9L136.1 161.2L140.9 162.5L159.9 177.2L200.6 208.7L253.7 247.8L261.5 254.3L264.6 252.1L265 250.5L261.5 244.7L232.6 192.5L201.8 139.4L188.1 117.4L184.5 104.2C183.2 98.8 182.3 94.2 182.3 88.7L198.2 67.1L207 64.3L228.2 67.1L237.1 74.9L250.3 105.1L271.7 152.6L304.9 217.2L314.6 236.4L319.8 254.2L321.7 259.6L325.1 259.6L325.1 256.5L327.8 220.1L332.8 175.4L337.7 117.9L339.4 101.7L347.4 82.3L363.3 71.8L375.7 77.7L385.9 92.4L384.5 101.9L378.4 141.4L366.5 203.3L358.7 244.8L363.2 244.8L368.4 239.6L389.4 211.8L424.6 167.7L440.1 150.2L458.2 130.9L469.8 121.7L491.8 121.7L508 145.8L500.7 170.7L478 199.4L459.2 223.8L432.2 260.1L415.4 289.1L417 291.4L421 291L481.9 278L514.8 272.1L554.1 265.4L571.9 273.7L573.8 282.1L566.8 299.3L524.8 309.7L475.6 319.5L402.3 336.8L401.4 337.5L402.4 338.8L435.4 341.9L449.5 342.7L484.1 342.7L548.5 347.5L565.3 358.6L575.4 372.2L573.7 382.6L547.8 395.8C532.3 392.1 493.4 382.9 431.2 368.1L403.2 361.1L399.3 361.1L399.3 363.4L422.6 386.2L465.3 424.8L518.8 474.6L521.5 486.9L514.6 496.6L507.3 495.6L460.3 460.2L442.2 444.3L401.1 409.7L398.4 409.7L398.4 413.3L407.9 427.2L457.9 502.4L460.5 525.4L456.9 532.9L443.9 537.4L429.7 534.8L400.4 493.7L370.2 447.4L345.8 405.9L342.8 407.6L328.4 562.4L321.7 570.3L306.2 576.2L293.2 566.4L286.3 550.5L293.2 519L301.5 477.9L308.2 445.2L314.3 404.6L317.9 391.1L317.7 390.2L314.7 390.6L284.1 432.6L237.6 495.5L200.8 534.9L192 538.4L176.7 530.5L178.1 516.4L186.6 503.8L237.5 439L268.2 398.8L288 375.6L287.9 372.2L286.7 372.2L151.4 460L127.3 463.1L116.9 453.4L118.2 437.5L123.1 432.3L163.8 404.3L163.7 404.4L163.7 404.5z"/></svg>`

/* ─── Plugin profile ─── */

const profile = {
  name: 'nudgePlugin',
  displayName: 'Nudge Plugin',
  description: 'Contextual feature discovery widget — surfaces tips, CTAs, and hints based on user context',
  methods: ['dismiss', 'dismissPermanent', 'addRule', 'addRules', 'fire', 'clearActive'],
  events: ['nudgeTriggered', 'nudgeDismissed'],
  icon: '',
  location: 'none',
  version: packageJson.version,
  maintainedBy: 'Remix'
}

/* ─── State shape ─── */

export interface NudgePluginState {
    activeNudge: NudgeRule | null
    queue: NudgeRule[]
    animateOut: boolean
    /** Map of element‑id → decoration style for the hint layer */
    decorations: Map<string, NudgeDecoration>
}

export interface NudgeDecoration {
    elementId: string
    style: 'pulse' | 'glow' | 'badge'
    tooltip?: string
    nudgeId: string
    color?: string // CSS color override
}

/* ─── Plugin class ─── */

export class NudgePlugin extends Plugin {
  dispatch: React.Dispatch<any> = () => { }
  engine_: NudgeEngine
  private state: NudgePluginState
  debug: boolean

  // Type-safe tracker defaulting to NudgeEvent
  private trackMatomoEvent = <T extends MatomoEvent = NudgeEvent>(event: T) => {
    baseTrackMatomoEvent(this, event)
  }

  constructor(options?: { debug?: boolean }) {
    super(profile)
    this.debug = options?.debug || false
    this.engine_ = new NudgeEngine({ debug: this.debug })
    this.state = {
      activeNudge: null,
      queue: [],
      animateOut: false,
      decorations: new Map()
    }
  }

  /* ─── Lifecycle ─── */

  async onActivation(): Promise<void> {
    // Skip all nudge logic during E2E tests — nudges overlay UI and block selectors
    if (window.__IS_E2E_TEST__) return

    // Subscribe to nudge triggers from the engine
    this.engine_.onNudge((rule) => {
      if (rule.action.type === 'hint') {
        this._handleHint(rule)
      } else if (rule.action.type === 'widget' || rule.action.type === 'toast' || rule.action.type === 'modal') {
        this._enqueue(rule)
      }
      this.emit('nudgeTriggered', { id: rule.id, action: rule.action })
      this.trackMatomoEvent({ category: 'nudge', action: 'triggered', name: rule.id, isClick: false })
    })

    this._setupBuiltinRules()
    this._setupEventListeners()
    this.renderComponent()
  }

  onDeactivation(): void {
    // NudgeEngine has no teardown needed
  }

  /* ─── Event listeners — bridge plugin events into the nudge engine ─── */

  private _setupEventListeners(): void {
    // Auth state changes
    this.on('auth', 'authStateChanged', (state: { isAuthenticated: boolean }) => {
      if (state?.isAuthenticated) {
        this._setAuthState(true)
        this._checkBetaMembership()
      } else {
        this._setAuthState(false)
      }
    })

    // Check current auth state (auth may have already emitted before we started listening)
    this._checkInitialAuthState()

    // Fetch registration mode / app config on activation so we can fire config events
    this._fetchConfigEvents()

    // Solidity file opened in editor
    this.on('fileManager', 'currentFileChanged', (file: string) => {
      if (file && file.endsWith('.sol')) {
        this.engine_.fire('editor:solidity_active')
      }
    })

    // Contract compiled successfully
    this.on('solidity', 'compilationFinished', (_fileName: string, _source: any, _languageVersion: string, data: any) => {
      // Only fire if compilation has no errors
      if (data && (!data.errors || data.errors.every((e: any) => e.severity !== 'error'))) {
        this.engine_.fire('contract:compiled')
      }
    })

    // Contract deployed or interacted with
    // Using 'blockchain' plugin directly — 'udapp' newTransaction only fires after RunTabUI mounts
    this.on('blockchain', 'transactionExecuted', (_error: any, _from: string, to: string) => {

      this.engine_.fire('contract:deployed')

    })

    // Workspace dropdown opened
    this.on('filePanel', 'setWorkspace', (workspace: { name: string }) => {
      if (workspace.name !== 'default_workspace')
        this.engine_.fire('workspace:switched')
    })

    // AI chat panel opened
    this.on('sidePanel', 'focusChanged', (name: string) => {
      if (name === 'remixaiassistant') {
        this.engine_.fire('ai:chat_opened')
      }
    })

    // AI model changed
    this.on('remixAI', 'modelChanged', (modelId: string) => {
      this.engine_.fire('ai:model_changed')
    })

    // User sent a chat message
    this.on('remixAI', 'chatMessageSent', () => {
      this.engine_.fire('ai:chat_message')
      // Fire a real-time auth check event for unauthenticated nudges
      // (can't rely on accumulated 'user:not_logged_in' — it fires on load before auth resolves)
      this.call('auth' as any, 'isAuthenticated').then((isAuth: boolean) => {
        if (!isAuth) this.engine_.fire('ai:chat_while_logged_out')
      }).catch(() => {})
    })

    // User requested code explanation (right-click → "Explain")
    this.on('remixAI', 'codeExplainRequested', () => {
      this.engine_.fire('ai:code_explain')
    })

    // User requested error explanation
    this.on('remixAI', 'errorExplainRequested', () => {
      this.engine_.fire('ai:error_explain')
    })

    // User ran a vulnerability / security check
    this.on('remixAI', 'vulnerabilityCheckRequested', () => {
      this.engine_.fire('ai:security_check')
    })

    // AI-generated workspace created
    this.on('remixAI', 'workspaceGenerated', () => {
      this.engine_.fire('ai:workspace_generated')
    })

    // MCP toggled on/off
    this.on('remixAI', 'mcpEnabled', () => {
      this.engine_.fire('ai:mcp_enabled')
    })
    this.on('remixAI', 'mcpDisabled', () => {
      this.engine_.fire('ai:mcp_disabled')
    })

    // Git operations
    this.on('dgitApi' as any, 'commit', () => {
      this.engine_.fire('git:committed')
    })
    this.on('dgitApi' as any, 'clone', () => {
      this.engine_.fire('git:cloned')
    })
    this.on('dgitApi' as any, 'init', () => {
      this.engine_.fire('git:initialized')
    })

    // File saved
    this.on('fileManager', 'fileSaved', (path: string) => {
      this.engine_.fire('file:saved')
    })

    // Credits updated
    this.on('auth' as any, 'creditsUpdated', () => {
      this.engine_.fire('user:credits_updated')
    })
  }

  private async _fetchConfigEvents(): Promise<void> {
    try {
      const regMode = await this.call('auth' as any, 'getRegistrationMode')
      if (regMode === 'open') {
        this.engine_.fire('config:registration_open')
      } else if (regMode === 'invite_required' || regMode === 'invite_only') {
        this.engine_.fire('config:invite_only')
      }

      const appConfig = await this.call('auth' as any, 'getAppConfig')
      if (appConfig?.['auth.sign_in_button_mode'] !== 'hidden') {
        this.engine_.fire('config:login_enabled')
      }
    } catch {
      // Auth plugin may not be ready yet — config events won't fire, which is fine
    }
  }

  private async _checkInitialAuthState(): Promise<void> {
    try {
      const isAuth = await this.call('auth' as any, 'isAuthenticated')
      if (isAuth) {
        this._setAuthState(true)
        this._checkBetaMembership()
      } else {
        this._setAuthState(false)
      }
    } catch {
      // Auth not ready yet — we'll catch it via the event listener
    }
  }

  private _setAuthState(isAuthenticated: boolean): void {
    if (isAuthenticated) {
      this.engine_.unfire('user:not_logged_in')
      this.engine_.fire('user:logged_in')
      return
    }

    this.engine_.unfire('user:logged_in')
    this.engine_.unfire('user:logged_in_beta')
    this.engine_.fire('user:not_logged_in')
  }

  private async _checkBetaMembership(): Promise<void> {
    try {
      const permissions = await this.call('auth' as any, 'getAllPermissions')
      if (this.debug)console.log('User permissions:', permissions)
      const groups = permissions?.feature_groups || []
      if (groups.some((g: any) => g.name === 'beta')) {
        this.engine_.fire('user:logged_in_beta')
      }
    } catch {
      // Permissions not available — skip beta check
    }
  }

  /* ─── Built-in rules ─── */

  private _setupBuiltinRules(): void {

    /* ─── Unauthenticated nudges ─── */

    // Sign up prompt — shown to unauthenticated users when registration is open
    /*
    this.engine_.addRule({
      id: 'nudge-sign-up',
      condition: all('user:not_logged_in', 'config:registration_open', 'config:login_enabled'),
      action: {
        type: 'widget',
        title: 'Unlock the Full Experience',
        message: 'Create a free account to access AI code assistance, Cloud Workspaces, premium models, and more.',
        actionLabel: 'Sign Up',
        actionTarget: 'membershipRequest::showRequestForm::beta',
        icon: 'fas fa-user-plus',
        widgetColor: '#3498db',
        widgetBg: 'rgba(52, 152, 219, 0.1)'
      },
      showOnce: true,
      priority: 12
    })*/

    // Beta invite prompt — shown when registration is invite-only
    this.engine_.addRule({
      id: 'nudge-join-beta',
      condition: all('user:not_logged_in', 'config:invite_only', 'config:login_enabled'),
      action: {
        type: 'widget',
        title: 'Join the Beta Program',
        message: 'Get early access to advanced AI models, Cloud Workspaces, MCP Integrations, and QuickDApp — free for Beta Testers.',
        actionLabel: 'Apply for Access',
        actionTarget: 'membershipRequest::showRequestForm::beta',
        icon: 'fas fa-rocket',
        widgetColor: '#2fbfb1',
        widgetBg: 'rgba(47, 191, 177, 0.08)'
      },
      showOnce: true,
      priority: 11
    })

    /* ─── Authenticated — contextual feature discovery ─── */

    // Beta welcome — first thing a beta tester sees after logging in
    this.engine_.addRule({
      id: 'beta-welcome',
      condition: 'user:logged_in_beta',
      action: {
        type: 'widget',
        title: 'Welcome to Remix Beta',
        message: 'You\'ve unlocked premium AI models, MCP Integrations, cloud sync, and QuickDApp. Tap to take a quick tour.',
        actionLabel: 'Take the Tour',
        actionTarget: 'helpPlugin::showModal::beta-reel',
        icon: 'fas fa-sparkles',
        widgetColor: '#2fbfb1',
        widgetBg: 'rgba(47, 191, 177, 0.1)'
      },
      showOnce: true,
      priority: 15
    })

    // Premium AI models — triggers when user opens the AI chat
    this.engine_.addRule({
      id: 'try-opus-model',
      condition: all('user:logged_in_beta', 'ai:chat_opened'),
      action: {
        type: 'widget',
        title: 'Try a Premium Model',
        message: 'You have access to Claude Opus — it excels at complex Solidity patterns and audits.',
        actionLabel: 'Learn More',
        actionTarget: 'helpPlugin::showModal::beta-info',
        icon: CLAUDE_SVG,
        widgetColor: '#7289da',
        widgetBg: 'rgba(114, 137, 218, 0.1)'
      },
      showOnce: 'session',
      priority: 10
    })

    // Cloud Workspaces — triggers when user switches workspaces
    this.engine_.addRule({
      id: 'try-cloud-workspaces',
      condition: all('user:logged_in_beta', 'workspace:switched'),
      action: {
        type: 'widget',
        title: 'Try Cloud Workspaces',
        message: 'Your projects are only stored locally. Enable cloud sync to access them from any device, anytime.',
        actionLabel: 'Learn More',
        actionTarget: 'helpPlugin::showModal::cloud',
        icon: 'fas fa-cloud-upload-alt',
        widgetColor: '#1abc9c',
        widgetBg: 'rgba(26, 188, 156, 0.1)'
      },
      showOnce: 'session',
      priority: 9
    })

    // MCP Tools — triggers when user opens AI chat (they'll likely want on-chain data)
    this.engine_.addRule({
      id: 'try-mcp-tools',
      condition: all('user:logged_in_beta', 'ai:chat_opened'),
      action: {
        type: 'widget',
        title: 'AI with Superpowers',
        message: 'Your AI assistant connects to Alchemy, Etherscan, The Graph, and more through MCP — ask it to fetch on-chain data or verify contracts directly in chat.',
        actionLabel: 'Learn More',
        actionTarget: 'helpPlugin::showModal::mcp',
        icon: MCP_SVG,
        widgetColor: '#8b5cf6',
        widgetBg: 'rgba(139, 92, 246, 0.08)'
      },
      showOnce: 'session',
      priority: 8
    })

    // QuickDApp — triggers when user compiles a contract successfully
    this.engine_.addRule({
      id: 'try-quickdapp',
      condition: all('user:logged_in_beta', 'contract:compiled'),
      action: {
        type: 'widget',
        title: 'Try QuickDApp',
        message: 'Your contract compiled! Generate a ready-to-use frontend dashboard to interact with it — no front-end code needed.',
        actionLabel: 'Learn More',
        actionTarget: 'helpPlugin::showModal::quickdapp',
        icon: 'fas fa-rocket',
        widgetColor: '#e67e22',
        widgetBg: 'rgba(230, 126, 34, 0.1)'
      },
      showOnce: 'session',
      priority: 7
    })

    // Cloud Workspaces — persistent nudge for local-only users
    this.engine_.addRule({
      id: 'try-cloud-toggle',
      condition: all('user:logged_in_beta', 'workspace:local_only', 'lifecycle:APP_LOADED'),
      action: {
        type: 'widget',
        title: 'Cloud Workspaces',
        message: 'Your projects are only stored locally. Enable cloud sync to access them anywhere.',
        actionLabel: 'Learn More',
        actionTarget: 'helpPlugin::showModal::cloud',
        icon: 'fas fa-cloud-upload-alt'
      },
      showOnce: true,
      priority: 5
    })

    // Solidity-specific hint — when editing a .sol file, suggest the AI for help
    this.engine_.addRule({
      id: 'hint-ai-for-solidity',
      condition: all('user:logged_in_beta', 'editor:solidity_active'),
      action: {
        type: 'widget',
        title: 'RemixAI Knows Solidity',
        message: 'Ask RemixAI to explain, audit, or optimize your contract. It understands your project context through MCP.',
        actionLabel: 'Learn More',
        actionTarget: 'helpPlugin::showModal::mcp',
        icon: 'fas fa-robot',
        widgetColor: '#27ae60',
        widgetBg: 'rgba(39, 174, 96, 0.08)'
      },
      showOnce: true,
      priority: 6
    })

    // Deployment nudge — after deploying a contract, suggest QuickDapp
    this.engine_.addRule({
      id: 'quickdapp-after-deploy',
      condition: all('user:logged_in_beta', 'contract:deployed'),
      action: {
        type: 'widget',
        title: 'Build a DApp from This',
        message: 'You just deployed a contract — now generate a dApp to get an instant front-end to interact with it.',
        actionLabel: 'Learn More',
        actionTarget: 'helpPlugin::showModal::quickdapp',
        icon: 'fas fa-magic',
        widgetColor: '#9b59b6',
        widgetBg: 'rgba(155, 89, 182, 0.08)'
      },
      showOnce: 'session',
      priority: 8
    })

    /* ─── Unauthenticated AI nudges — show login prompt after AI engagement ─── */

    // User chatted but isn't logged in — nudge to sign up for better models
    this.engine_.addRule({
      id: 'signup-after-chat',
      condition: all('ai:chat_while_logged_out', 'config:invite_only'),
      action: {
        type: 'widget',
        title: 'Unlock Premium AI Models',
        message: 'You\'re using the free tier. Sign up to access Claude Opus, GPT-4, and MCP-powered tools for deeper contract analysis.',
        actionLabel: 'Sign Up Free',
        actionTarget: 'membershipRequest::showRequestForm::beta',
        icon: CLAUDE_SVG,
        widgetColor: '#7289da',
        widgetBg: 'rgba(114, 137, 218, 0.1)'
      },
      showOnce: true,
      priority: 13
    })

    /* ─── Authenticated — AI engagement nudges ─── */

    // After AI generates a workspace, suggest cloud sync
    this.engine_.addRule({
      id: 'cloud-after-ai-workspace',
      condition: all('user:logged_in_beta', 'ai:workspace_generated'),
      action: {
        type: 'widget',
        title: 'Save This to the Cloud',
        message: 'Your AI-generated workspace is local only. Did you know you can sync it to the cloud and access it from anywhere?',
        actionLabel: 'Learn More',
        actionTarget: 'helpPlugin::showModal::cloud',
        icon: 'fas fa-cloud-upload-alt',
        widgetColor: '#1abc9c',
        widgetBg: 'rgba(26, 188, 156, 0.1)'
      },
      showOnce: true,
      priority: 8
    })

    // After chatting a few times, hint about code explain shortcut
    this.engine_.addRule({
      id: 'hint-code-explain',
      condition: all('user:logged_in_beta', 'ai:chat_message', 'editor:solidity_active'),
      action: {
        type: 'widget',
        title: 'Quick Tip: Explain Code',
        message: 'Right-click any code and select "Explain this" — RemixAI will break it down for you instantly.',
        actionLabel: 'Got It',
        actionTarget: '',
        icon: 'fas fa-lightbulb',
        widgetColor: '#f39c12',
        widgetBg: 'rgba(243, 156, 18, 0.08)'
      },
      showOnce: true,
      priority: 5
    })

    /* ─── Hint decorations (pulsating dots / glows on UI elements) ─── */

  }

  /* ─── Public methods (callable by other plugins) ─── */

  /** Fire a context event into the nudge engine */
  fire(eventId: string): void {
    this.engine_.fire(eventId)
  }

  /** Add a rule programmatically from another plugin */
  addRule(rule: NudgeRule): void {
    this.engine_.addRule(rule)
  }

  /** Add multiple rules */
  addRules(rules: NudgeRule[]): void {
    this.engine_.addRules(rules)
  }

  /** Dismiss the currently active nudge (X button / session only) */
  dismiss(): void {
    if (!this.state.activeNudge) return
    const id = this.state.activeNudge.id
    this.state = { ...this.state, animateOut: true }
    this.renderComponent()
    this.emit('nudgeDismissed', { id, permanent: false })
    this.trackMatomoEvent({ category: 'nudge', action: 'dismissed', name: id, isClick: true })
    setTimeout(() => {
      this._dequeueNext()
    }, 300)
  }

  /** Permanently dismiss the active nudge (never show again) */
  dismissPermanent(): void {
    if (!this.state.activeNudge) return
    const id = this.state.activeNudge.id
    this.engine_.disableRule(id)
    this.state = { ...this.state, animateOut: true }
    this.renderComponent()
    this.emit('nudgeDismissed', { id, permanent: true })
    this.trackMatomoEvent({ category: 'nudge', action: 'dismissedPermanent', name: id, isClick: true })
    // Persist in localStorage
    try {
      const key = 'remix_nudge_dismissed_permanent'
      const raw = localStorage.getItem(key)
      const dismissed: string[] = raw ? JSON.parse(raw) : []
      if (!dismissed.includes(id)) {
        dismissed.push(id)
        localStorage.setItem(key, JSON.stringify(dismissed))
      }
    } catch { }
    setTimeout(() => {
      this._dequeueNext()
    }, 300)
  }

  /** Clear all active nudges and queue */
  clearActive(): void {
    this.state = {
      ...this.state,
      activeNudge: null,
      queue: [],
      animateOut: false,
      decorations: new Map()
    }
    this.renderComponent()
  }

  /* ─── CTA handler ─── */

  async handleAction(target: string): Promise<void> {
    const activeId = this.state.activeNudge?.id || 'unknown'
    this.trackMatomoEvent({ category: 'nudge', action: 'ctaClicked', name: activeId, value: target, isClick: true })
    // Parse actionTarget format: 'pluginName::method::arg1::arg2'
    const parts = target.split('::')
    if (parts.length >= 2) {
      const [pluginName, method, ...args] = parts
      try {
        await this.call(pluginName as any, method as any, ...args)
      } catch (e) {
        console.warn(`[NudgePlugin] Failed to call ${pluginName}.${method}:`, e)
      }
    }
    this.dismiss()
  }

  /* ─── Queue management ─── */

  private _enqueue(rule: NudgeRule): void {
    // Check permanent dismissal
    try {
      const raw = localStorage.getItem('remix_nudge_dismissed_permanent')
      const dismissed: string[] = raw ? JSON.parse(raw) : []
      if (dismissed.includes(rule.id)) return
    } catch { }

    if (this.state.activeNudge) {
      // Insert into queue sorted by priority (higher first)
      const queue = [...this.state.queue, rule].sort(
        (a, b) => (b.priority ?? 0) - (a.priority ?? 0)
      )
      this.state = { ...this.state, queue }
    } else {
      this.state = { ...this.state, activeNudge: rule, animateOut: false }
    }
    this.renderComponent()
  }

  private _dequeueNext(): void {
    const [next, ...rest] = this.state.queue
    this.state = {
      ...this.state,
      activeNudge: next || null,
      queue: rest,
      animateOut: false
    }
    this.renderComponent()
  }

  /* ─── Hint / decoration management ─── */

  private _handleHint(rule: NudgeRule): void {
    if (!rule.action.actionTarget) return
    const decoration: NudgeDecoration = {
      elementId: rule.action.actionTarget,
      style: rule.action.hintStyle || 'pulse',
      tooltip: rule.action.message,
      nudgeId: rule.id,
      color: rule.action.hintColor
    }
    const decorations = new Map(this.state.decorations)
    decorations.set(rule.action.actionTarget, decoration)
    this.state = { ...this.state, decorations }
    this.renderComponent()
  }

  /** Remove a decoration (e.g. after user interacts with the decorated element) */
  removeDecoration(elementId: string): void {
    const decorations = new Map(this.state.decorations)
    decorations.delete(elementId)
    this.state = { ...this.state, decorations }
    this.renderComponent()
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

  updateComponent(dispatchState: { state: NudgePluginState; plugin: NudgePlugin }): JSX.Element {
    return (
      <NudgeWidgetUI
        state={dispatchState.state}
        onAction={(target) => this.handleAction(target)}
        onDismiss={() => this.dismiss()}
        onDismissPermanent={() => this.dismissPermanent()}
        onDecorationClick={(elementId) => this.removeDecoration(elementId)}
      />
    )
  }

  render(): JSX.Element {
    if (window.__IS_E2E_TEST__) return <></>
    return (
      <div id="nudge-widget-container">
        <PluginViewWrapper plugin={this} />
      </div>
    )
  }
}

/* ─── Pure React UI Component: Widget ─── */

interface NudgeWidgetUIProps {
    state: NudgePluginState
    onAction: (target: string) => void
    onDismiss: () => void
    onDismissPermanent: () => void
    onDecorationClick: (elementId: string) => void
}

function NudgeWidgetUI({ state, onAction, onDismiss, onDismissPermanent, onDecorationClick }: NudgeWidgetUIProps) {
  const nudge = state.activeNudge

  return (
    <>
      {/* Corner widget for active nudges */}
      {nudge && nudge.action.type !== 'hint' && (
        <div
          className={`nudge-widget ${state.animateOut ? 'nudge-widget--out' : ''}`}
          data-id="nudge-widget"
          style={{
            ...(nudge.action.widgetColor ? { '--nw-accent': nudge.action.widgetColor } as React.CSSProperties : {}),
            ...(nudge.action.widgetBg ? { '--nw-bg': nudge.action.widgetBg } as React.CSSProperties : {})
          }}
        >
          {(nudge.action.dismissable !== false) && (
            <button
              className="nudge-widget-close"
              onClick={(e) => { e.stopPropagation(); onDismiss() }}
              title="Dismiss"
            >
              <i className="fas fa-times"></i>
            </button>
          )}

          <div
            className="nudge-widget-body"
            onClick={() => onAction(nudge.action.actionTarget || '')}
          >
            {nudge.action.icon && (
              <div className="nudge-widget-illustration">
                <div className="nudge-widget-icon-wrap">
                  {nudge.action.icon.trim().startsWith('<svg')
                    ? <span dangerouslySetInnerHTML={{ __html: nudge.action.icon }} />
                    : <i className={nudge.action.icon}></i>
                  }
                </div>
              </div>
            )}

            {nudge.action.title && (
              <h6 className="nudge-widget-title">{nudge.action.title}</h6>
            )}
            <p className="nudge-widget-desc">{nudge.action.message}</p>

            {nudge.action.actionLabel && (
              <span className="nudge-widget-cta">
                {nudge.action.actionLabel} <i className="fas fa-chevron-right"></i>
              </span>
            )}
          </div>

          {(nudge.action.dismissable !== false) && (
            <button
              className="nudge-widget-never"
              onClick={(e) => { e.stopPropagation(); onDismissPermanent() }}
            >
                            Don&apos;t show this again
            </button>
          )}
        </div>
      )}

      {/* Decorations layer for hint-type nudges */}
      {state.decorations.size > 0 && (
        <NudgeDecorations
          decorations={state.decorations}
          onClick={onDecorationClick}
        />
      )}
    </>
  )
}

/* ─── Nudge Decorations (pulsating dots, glowing borders, tooltips) ─── */

interface NudgeDecorationsProps {
    decorations: Map<string, NudgeDecoration>
    onClick: (elementId: string) => void
}

function NudgeDecorations({ decorations, onClick }: NudgeDecorationsProps) {
  return (
    <>
      {[...decorations.values()].map((dec) => (
        <NudgeDecorationOverlay key={dec.elementId} decoration={dec} onClick={onClick} />
      ))}
    </>
  )
}

function NudgeDecorationOverlay({ decoration, onClick }: { decoration: NudgeDecoration; onClick: (id: string) => void }) {
  const [pos, setPos] = React.useState<{ top: number; left: number; width: number; height: number } | null>(null)
  const [showTooltip, setShowTooltip] = React.useState(false)

  React.useEffect(() => {
    // Try data-id first, then fall back to any data-* attribute matching the value
    const el = (
            document.querySelector(`[data-id="${decoration.elementId}"]`) ||
            document.querySelector(`[data-assist-btn="${decoration.elementId}"]`) ||
            document.querySelector(`#${decoration.elementId}`)
        ) as HTMLElement
    if (!el) return

    const update = () => {
      const rect = el.getBoundingClientRect()
      setPos({ top: rect.top, left: rect.left, width: rect.width, height: rect.height })
    }
    update()

    // Re-position on scroll/resize
    const observer = new ResizeObserver(update)
    observer.observe(el)
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)

    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [decoration.elementId])

  if (!pos) return null

  const colorStyle = decoration.color ? { '--nudge-color': decoration.color } as React.CSSProperties : {}

  return (
    <div
      className={`nudge-decoration nudge-decoration--${decoration.style}`}
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        width: pos.width,
        height: pos.height,
        pointerEvents: 'none',
        zIndex: 8999,
        ...colorStyle
      }}
    >
      {/* Pulsating dot indicator */}
      {decoration.style === 'pulse' && (
        <div
          className="nudge-pulse-dot"
          style={{ pointerEvents: 'auto', ...(decoration.color ? { background: decoration.color } : {}) }}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          onClick={() => onClick(decoration.elementId)}
        />
      )}

      {/* Tooltip */}
      {showTooltip && decoration.tooltip && (
        <div className="nudge-tooltip">
          {decoration.tooltip}
        </div>
      )}
    </div>
  )
}
