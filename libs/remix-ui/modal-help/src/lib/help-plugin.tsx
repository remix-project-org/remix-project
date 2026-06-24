import { ViewPlugin } from '@remixproject/engine-web'
import React from 'react'
import { PluginViewWrapper, DISCORD_URL, REMIX_DOCS_URL } from '@remix-ui/helper'
import { useAuth } from '@remix-ui/app'
import { trackMatomoEvent as baseTrackMatomoEvent, HelpEvent, MatomoEvent, Features } from '@remix-api'
import * as packageJson from '../../../../../package.json'

export type HelpTopic = 'beta-reel' | 'beta-info' | 'mcp' | 'cloud' | 'quickdapp' | 'beta-farewell' | 'starter-guide' | 'pro-guide'

/**
 * Survey users complete to unlock their 50% off Pro reward. Kept here
 * (not in the modal component) so the help-plugin and any auto-open
 * caller can reference the same URL.
 */
export const BETA_FAREWELL_SURVEY_URL = 'https://docs.google.com/forms/d/1Iw-ggilEQfDAXvGR_pIdgKhPemDle4NTC5gGNZRWEB0/viewform'

/**
 * Days before `expires_at` at which we start auto-prompting the
 * farewell modal. Past that window the user has plenty of warning;
 * inside it we surface the survey at most once per session unless
 * the user dismissed it with "Don't show again".
 */
export const BETA_FAREWELL_THRESHOLD_DAYS = 7

/**
 * localStorage key for farewell dismissal state. Keyed on the beta
 * expiry date so a renewed beta grant gets a fresh prompt.
 * Values: 'never' — permanently dismissed; ISO timestamp — remind
 * after that time; missing — not yet seen.
 */
export const betaFarewellStorageKey = (expiresAt: string) =>
  `remix:beta-farewell:${expiresAt}`

const HELP_ICON = 'data:image/svg+xml;base64,' + btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#a2a3bd" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`)

const profile = {
  name: 'helpPlugin',
  displayName: 'Help & Guides',
  description: 'Contextual help, guides, and feature walkthroughs for beta users',
  methods: ['showModal', 'getTopics'],
  events: ['modalOpened', 'modalClosed'],
  icon: HELP_ICON,
  location: 'sidePanel',
  version: packageJson.version,
  maintainedBy: 'Remix'
}

export class HelpPlugin extends ViewPlugin {
  dispatch: React.Dispatch<any> = () => {}
  private _activeModal: HelpTopic | null = null

  // Type-safe tracker defaulting to HelpEvent
  private trackMatomoEvent = <T extends MatomoEvent = HelpEvent>(event: T) => {
    baseTrackMatomoEvent(this, event)
  }

  constructor() {
    super(profile)
  }

  /* ─── Lifecycle ─── */

  async onActivation(): Promise<void> {
    this.renderComponent()

  }

  /* ─── Public API ─── */

  /** Programmatically open a help modal */
  async showModal(topic: HelpTopic): Promise<void> {
    this._activeModal = topic
    this.renderComponent()
    this.emit('modalOpened', topic)
    this.trackMatomoEvent({ category: 'help', action: 'modalOpened', name: topic, isClick: true })

    // Also focus the side panel on this plugin
    try {
      await this.call('menuicons', 'select', 'helpPlugin')
    } catch { /* side panel might not be ready */ }
  }

  closeModal(): void {
    const prev = this._activeModal
    this._activeModal = null
    this.renderComponent()
    if (prev) {
      this.emit('modalClosed', prev)
      this.trackMatomoEvent({ category: 'help', action: 'modalClosed', name: prev, isClick: true })
    }
  }

  getTopics(): { id: HelpTopic; title: string; description: string }[] {
    return TOPICS
  }

  get activeModal(): HelpTopic | null {
    return this._activeModal
  }

  /* ─── Action handler — routes CTA clicks to other plugins ─── */

  async handleTopicAction(topic: HelpTopic): Promise<void> {
    this.trackMatomoEvent({ category: 'help', action: 'ctaAction', name: topic, isClick: true })
    switch (topic) {
    case 'mcp':
      await this.call('menuicons', 'select', 'settings')
      break
    case 'cloud':
      await this.call('menuicons', 'select', 'settings')
      break
    case 'quickdapp':
      await this.call('menuicons', 'select', 'quickDapp')
      break
    case 'beta-reel':
    case 'beta-info':
      // Opens the reel/info as a modal overlay
      this.showModal(topic)
      break
    }
  }

  /* ─── Render plumbing ─── */

  setDispatch(dispatch: React.Dispatch<any>): void {
    this.dispatch = dispatch
    this.renderComponent()
  }

  renderComponent(): void {
    this.dispatch({ plugin: this })
  }

  updateComponent(state: any): JSX.Element {
    return <HelpPanelUI plugin={state.plugin || this} />
  }

  render(): JSX.Element {
    return (
      <div id="helpPlugin" className="h-100">
        <PluginViewWrapper plugin={this} />
      </div>
    )
  }
}

/* ─── Topic registry ─── */

interface TopicDef {
  id: HelpTopic
  title: string
  description: string
  icon: string
  color: string
  tag?: string
  /**
   * Feature keys the user must have for this guide to be visible. When set,
   * the card only renders if every listed feature is enabled (plan-gated
   * guides). When omitted, the guide is treated as beta-only.
   */
  requiredFeatures?: string[]
}

const TOPICS: TopicDef[] = [
  {
    id: 'beta-reel',
    title: 'What\'s new in Beta',
    description: 'Tour the latest features unlocked for beta testers — AI models, MCP tools, cloud sync, and QuickDApp.',
    icon: 'fas fa-sparkles',
    color: '#2fbfb1',
    tag: 'Start here'
  },
  {
    id: 'mcp',
    title: 'MCP Integrations',
    description: 'Alchemy, Etherscan, The Graph, and ethSkills — on-chain data and verification directly in your AI chat.',
    icon: 'fas fa-plug',
    color: '#5b9cf5',
  },
  {
    id: 'cloud',
    title: 'Cloud Workspaces',
    description: 'Sync your projects to the cloud. Open any workspace from any device, anytime.',
    icon: 'fas fa-cloud',
    color: '#9b7dff',
  },
  {
    id: 'quickdapp',
    title: 'QuickDApp Builder',
    description: 'Generate a full frontend connected to your smart contract from a single prompt.',
    icon: 'fas fa-rocket',
    color: '#6bdb8a',
  },
  {
    id: 'beta-info',
    title: 'About the Beta Program',
    description: 'Learn what the beta program includes, how to give feedback, and how you\'re shaping the future of Remix.',
    icon: 'fas fa-flask',
    color: '#f0a030',
  },
  {
    // Always available so users can revisit the survey/discount link
    // after dismissing the auto-popup. The card itself doesn't reveal
    // expiry timing — the modal does.
    id: 'beta-farewell',
    title: 'Beta is wrapping up',
    description: 'Thank you! Take a short survey to get a discount on future products.',
    icon: 'fas fa-heart',
    color: '#e86baf',
    tag: 'Reward'
  },
  {
    // Plan-gated: visible to anyone whose plan includes the AI assistant.
    id: 'starter-guide',
    title: 'Get started with Starter',
    description: 'Make the most of your plan — AI chat, one-click compile fixes, and ready-made skills.',
    icon: 'fas fa-seedling',
    color: '#5b9cf5',
    tag: 'Starter',
    requiredFeatures: [Features.AI_SOLCODER]
  },
  {
    // Plan-gated: visible to plans that include the security auditor (Pro).
    id: 'pro-guide',
    title: 'Unlock Pro features',
    description: 'Sophisticated agents, advanced commands, security audits, gas optimisation, premium models, and live on-chain data.',
    icon: 'fas fa-crown',
    color: '#f0a030',
    tag: 'Pro',
    requiredFeatures: [Features.AI_AUDITOR]
  },
]

/* ─── Plan guide demo content (static, like the MCP/QuickDApp demos) ─── */

import type { PlanGuideDemo } from './plan-guide-modal'

const STARTER_DEMOS: PlanGuideDemo[] = [
  {
    key: 'chat', name: 'AI chat', color: '#5b9cf5',
    desc: 'Ask anything — generate contracts, explain code, or get Solidity help.',
    example: '"Write an ERC-20 with a capped supply"',
    prompt: 'Write an ERC-20 token with a capped supply and an owner-only mint function.',
    mockReply: 'Drafting <span class="plg-hl">CappedToken.sol</span>…\n\n' +
      '  • OpenZeppelin ERC20 + Ownable\n  • `cap` enforced in `_update`\n  • owner-only `mint`\n\n' +
      'Created the file in your workspace — hit Compile to try it.'
  },
  {
    key: 'compile', name: 'Compile & fix', color: '#2fbfb1',
    desc: 'Let the assistant compile the active file and fix any errors it finds.',
    example: '"/compile fix the errors in this file"',
    prompt: '/compile fix any errors in the active file',
    mockReply: 'Compiling <span class="plg-hl">MyContract.sol</span>…\n\n' +
      'Found 1 error: missing visibility on `transfer`.\nApplied fix → recompiled <span class="plg-hl">successfully</span>.'
  },
  {
    key: 'skills', name: 'Ready-made skills', color: '#6bdb8a',
    desc: 'Load a curated skill so the assistant follows a proven workflow.',
    example: '"Load a skill, then use it"',
    prompt: 'Load the available skills and apply one that fits writing a secure ERC-721.',
    mockReply: 'Added the selected skill to <span class="plg-hl">skills/</span>.\n\n' +
      'I\'ll follow its checklist as we build your ERC-721 — starting with access control and safe minting.'
  },
  {
    key: 'explain', name: 'Explain code', color: '#9b7dff',
    desc: 'Get a line-by-line walkthrough of any contract in your workspace.',
    example: '"Explain what this contract does"',
    prompt: 'Explain what the active contract does, function by function, and flag any risks.',
    mockReply: 'Walking through <span class="plg-hl">Vault.sol</span>…\n\n' +
      '  • `deposit()` — credits the sender\n  • `withdraw()` — ⚠️ external call before state update (reentrancy risk)\n\n' +
      'Want me to apply the checks-effects-interactions fix?'
  }
]

const PRO_DEMOS: PlanGuideDemo[] = [
  {
    key: 'audit', name: 'Security audit', color: '#f0a030',
    desc: 'Run the auditor against your contract using curated security checklists.',
    example: '"/audit this contract"',
    prompt: '/audit a contract — audit the open file against the security checklists in audits/.',
    mockReply: 'Auditing <span class="plg-hl">Token.sol</span> against the selected checklist…\n\n' +
      '  • Reentrancy: <span class="plg-hl">pass</span>\n  • Access control: 1 finding (unprotected `setOwner`)\n\n' +
      'Full report saved to <span class="plg-hl">audit_reports/</span>.'
  },
  {
    key: 'gas', name: 'Gas optimisation', color: '#6bdb8a',
    desc: 'Profile your contract and get concrete gas savings with before/after numbers.',
    example: '"/gas-audit this contract"',
    prompt: 'Run a gas optimization audit on the active contract and suggest concrete savings with estimates.',
    mockReply: 'Profiling <span class="plg-hl">Token.sol</span> for gas…\n\n' +
      '  • Cache `storage` reads in loops → <span class="plg-hl">−2,100 gas</span>\n' +
      '  • Use `calldata` for read-only args → <span class="plg-hl">−480 gas</span>\n' +
      '  • Pack two `uint128` fields into one slot → <span class="plg-hl">−20,000 gas</span> per write\n\n' +
      'Apply all, or pick one to start?'
  },
  {
    key: 'agents', name: 'Sophisticated agents', color: '#2fbfb1',
    desc: 'Pro enables specialized subagents — Comprehensive Auditor, Gas Optimizer, Solidity Engineer — that coordinate multi-step work for you.',
    example: '"Do a full review of my contract"',
    prompt: 'Run a comprehensive review of my contract — coordinate the security, gas, and code-quality agents.',
    mockReply: 'Spinning up subagents…\n\n' +
      '  • <span class="plg-hl">Comprehensive Auditor</span> — orchestrating\n' +
      '  • Security Auditor → 2 findings\n  • Gas Optimizer → 3 savings\n  • Code Reviewer → 1 nit\n\n' +
      'Merging everything into one prioritized report.'
  },
  {
    key: 'commands', name: 'Advanced commands', color: '#e86baf',
    desc: 'Pro unlocks advanced slash commands. Type “/” in the chat to reach them.',
    example: '"/audit", "/gas-audit"',
    prompt: '/audit a contract',
    mockReply: 'Advanced commands are now enabled:\n\n' +
      '  • <span class="plg-hl">/audit</span> — security audit against checklists\n' +
      '  • <span class="plg-hl">/gas-audit</span> — gas optimisation pass\n' +
      '  • <span class="plg-hl">/load-audit-checklist</span> — load curated checklists\n\n' +
      'Just type “/” in the assistant to use them.'
  },
  {
    key: 'models', name: 'Premium models', color: '#9b7dff',
    desc: 'Switch to Claude Opus / Sonnet for deeper reasoning on complex contracts.',
    example: '"Use the strongest model"',
    prompt: 'Switch to the most capable model and review my contract architecture for design flaws.',
    mockReply: 'Now using <span class="plg-hl">Claude Opus</span>.\n\n' +
      'Reviewing architecture… your proxy pattern mixes storage layouts — I\'ll outline a safe upgrade path.'
  },
  {
    key: 'mcp', name: 'Live on-chain data', color: '#5b9cf5',
    desc: 'Query Etherscan, Alchemy and The Graph directly from the assistant.',
    example: '"Verify my contract on Etherscan"',
    prompt: 'Use Etherscan to verify the contract I just deployed on Sepolia and show the status.',
    mockReply: 'Connecting to <span class="plg-hl">Etherscan (Sepolia)</span>…\n\n' +
      'Contract verified ✓ — source matches, compiler 0.8.20, MIT.'
  }
]

/* ─── Side-panel React UI ─── */

import './help-panel.css'

const HelpPanelUI: React.FC<{ plugin: HelpPlugin }> = ({ plugin }) => {
  const { featureGroups, features } = useAuth()
  const isBeta = featureGroups?.some(fg => fg.name === 'beta')
  const activeModal = plugin.activeModal

  const hasFeat = (f: string): boolean => {
    const e = features?.[f]
    if (e == null) return false
    if (typeof e === 'boolean') return e
    return e.is_enabled !== false && e.allowed !== false
  }

  const visibleTopics = TOPICS.filter(t =>
    t.requiredFeatures && t.requiredFeatures.length
      ? t.requiredFeatures.every(hasFeat)
      : isBeta
  )

  // Type-safe tracker defaulting to HelpEvent
  const trackMatomoEvent = <T extends MatomoEvent = HelpEvent>(event: T) => {
    baseTrackMatomoEvent(plugin, event)
  }

  if (visibleTopics.length === 0) {
    return (
      <div className="help-panel help-panel--locked">
        <div className="help-panel-locked-icon">
          <i className="fas fa-lock"></i>
        </div>
        <h5 className="help-panel-locked-title">No guides yet</h5>
        <p className="help-panel-locked-desc">
          Sign in with a paid plan or beta account to unlock guides and feature walkthroughs.
        </p>
      </div>
    )
  }

  return (
    <div className="help-panel">
      {/* Header */}
      <div className="help-panel-header">
        <div className="help-panel-header-badge">
          <span className="help-panel-header-dot" />
          {isBeta ? 'Beta Guides' : 'Guides'}
        </div>
        <button
          className="help-panel-discord-btn"
          onClick={() => {
            trackMatomoEvent({ category: 'help', action: 'betaLinkClicked', name: 'discord', isClick: true })
            window.open(DISCORD_URL, '_blank')
          }}
        >
          <i className="fab fa-discord"></i>
          Beta Feedback
        </button>
      </div>
      <p className="help-panel-header-sub">
        Deep dives into every feature unlocked for you.
      </p>

      {/* Topic cards */}
      <div className="help-panel-topics">
        {visibleTopics.map((topic) => (
          <div
            key={topic.id}
            className="help-panel-card"
            onClick={() => {
              trackMatomoEvent({ category: 'help', action: 'topicCardClicked', name: topic.id, isClick: true })
              plugin.showModal(topic.id)
            }}
            role="button"
            tabIndex={0}
          >
            <div className="help-panel-card-icon" style={{ '--hpc-color': topic.color } as React.CSSProperties}>
              <i className={topic.icon}></i>
            </div>
            <div className="help-panel-card-body">
              <div className="help-panel-card-row">
                <span className="help-panel-card-title">{topic.title}</span>
                {topic.tag && <span className="help-panel-card-tag">{topic.tag}</span>}
              </div>
              <span className="help-panel-card-desc">{topic.description}</span>
            </div>
            <i className="fas fa-chevron-right help-panel-card-arrow"></i>
          </div>
        ))}
      </div>

      {/* ── Modal overlay ── */}
      {activeModal && (
        <HelpModalOverlay
          topic={activeModal}
          plugin={plugin}
          onClose={() => plugin.closeModal()}
        />
      )}
    </div>
  )
}

/* ─── Modal overlay ─── */

import BetaFeatureReel from './beta-feature-reel'
import BetaWelcomeModal from './beta-welcome-modal'
import BetaFarewellModal, { FarewellDismissKind } from './beta-farewell-modal'
import McpHelpModal from './mcp-help-modal'
import CloudHelpModal from './cloud-help-modal'
import QuickDAppHelpModal from './quickdapp-help-modal'
import PlanGuideModal from './plan-guide-modal'

/** Snooze duration when the user picks "Remind me later" on the farewell modal. */
const BETA_FAREWELL_REMIND_DELAY_MS = 24 * 60 * 60 * 1000 // 1 day

const HelpModalOverlay: React.FC<{
  topic: HelpTopic
  plugin: HelpPlugin
  onClose: () => void
}> = ({ topic, plugin, onClose }) => {
  const { featureGroups } = useAuth()
  const betaGroup = featureGroups?.find(fg => fg.name === 'beta')

  // Type-safe tracker defaulting to HelpEvent
  const trackMatomoEvent = <T extends MatomoEvent = HelpEvent>(event: T) => {
    baseTrackMatomoEvent(plugin, event)
  }

  /**
   * Persist the user's choice when they actively dismiss the farewell
   * popup. Keyed on the current expiry timestamp so a refreshed beta
   * grant re-opens the conversation. Silently no-ops if localStorage is
   * unavailable (private mode, quota, etc.) — the modal still closes.
   */
  const persistFarewellDismiss = (kind: FarewellDismissKind) => {
    const expiresAt = betaGroup?.expires_at
    if (!expiresAt) return
    try {
      const key = betaFarewellStorageKey(expiresAt)
      if (kind === 'never') {
        localStorage.setItem(key, 'never')
      } else {
        const remindAt = new Date(Date.now() + BETA_FAREWELL_REMIND_DELAY_MS).toISOString()
        localStorage.setItem(key, remindAt)
      }
    } catch { /* storage unavailable — best-effort */ }
  }

  const renderContent = () => {
    const showReel = () => plugin.showModal('beta-reel')

    switch (topic) {
    case 'beta-reel':
      return (
        <BetaFeatureReel
          dismissible
          autoAdvanceMs={5000}
          onAction={(feature) => {
            trackMatomoEvent({ category: 'help', action: 'reelFeatureClicked', name: feature, isClick: true })
            // Switch directly to the corresponding help modal
            const map: Record<string, HelpTopic> = { mcp: 'mcp', cloud: 'cloud', quickdapp: 'quickdapp' }
            const target = map[feature]
            if (target) {
              plugin.showModal(target)
            }
          }}
          onDismiss={() => {
            trackMatomoEvent({ category: 'help', action: 'reelDismissed', isClick: true })
            onClose()
          }}
        />
      )
    case 'beta-info':
      return <BetaWelcomeModal open onClose={onClose}
        onFeature={(feature) => {
          trackMatomoEvent({ category: 'help', action: 'betaFeatureClicked', name: feature, isClick: true })
          const map: Record<string, HelpTopic> = { mcp: 'mcp', cloud: 'cloud', quickdapp: 'quickdapp', models: 'beta-reel' }
          const target = map[feature]
          if (target) plugin.showModal(target)
        }}
        onFeedback={() => {
          trackMatomoEvent({ category: 'help', action: 'betaFeedbackClicked', isClick: true })
          onClose()
          try { plugin.call('feedback', 'openFeedbackForm') } catch { /* feedback plugin may not be available */ }
        }}
        onLink={(link) => {
          trackMatomoEvent({ category: 'help', action: 'betaLinkClicked', name: link, isClick: true })
          switch (link) {
          case 'discord': window.open(DISCORD_URL, '_blank'); break
          case 'docs': window.open(REMIX_DOCS_URL, '_blank'); break
          case 'blog': window.open('https://ethereumremix.substack.com/', '_blank'); break
          }
        }}
      />
    case 'starter-guide':
      return (
        <PlanGuideModal
          open
          onClose={onClose}
          onShowReel={showReel}
          planName="Remix Starter"
          accent="#5b9cf5"
          intro="Your Starter plan unlocks the RemixAI assistant. Click any feature below to see how to put it to work."
          demos={STARTER_DEMOS}
        />
      )
    case 'pro-guide':
      return (
        <PlanGuideModal
          open
          onClose={onClose}
          onShowReel={showReel}
          planName="Remix Pro"
          accent="#f0a030"
          intro="You're on Pro. More sophisticated agents and advanced commands are now enabled — along with the security auditor, gas optimisation, premium models, and live on-chain data. Try a demo of each below."
          demos={PRO_DEMOS}
        />
      )
    case 'mcp':
      return <McpHelpModal open onClose={onClose} onShowReel={showReel} />
    case 'cloud':
      return <CloudHelpModal open onClose={onClose} onShowReel={showReel} />
    case 'quickdapp':
      return <QuickDAppHelpModal open onClose={onClose} onShowReel={showReel} />
    case 'beta-farewell':
      return (
        <BetaFarewellModal
          open
          expiresAt={betaGroup?.expires_at ?? null}
          surveyUrl={BETA_FAREWELL_SURVEY_URL}
          onTakeSurvey={() => {
            trackMatomoEvent({ category: 'help', action: 'betaFarewellSurveyOpened', isClick: true })
            // Opening the survey is implicit acceptance — don't badger
            // them again for this expiry window.
            persistFarewellDismiss('never')
            onClose()
          }}
          onDismiss={(kind) => {
            trackMatomoEvent({ category: 'help', action: 'betaFarewellDismissed', name: kind, isClick: true })
            persistFarewellDismiss(kind)
            onClose()
          }}
          onClose={() => {
            trackMatomoEvent({ category: 'help', action: 'betaFarewellClosed', isClick: true })
            onClose()
          }}
        />
      )
    default:
      return null
    }
  }

  return (
    <div
      className="help-modal-backdrop"
      data-id="help-modal-backdrop"
      onClick={onClose}
    >
      <div
        className="help-modal-container"
        data-id="help-modal-container"
        onClick={(e) => e.stopPropagation()}
      >
        {renderContent()}
      </div>
    </div>
  )
}
