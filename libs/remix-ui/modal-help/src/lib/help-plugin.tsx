import { ViewPlugin } from '@remixproject/engine-web'
import React from 'react'
import { PluginViewWrapper } from '@remix-ui/helper'
import { useAuth } from '@remix-ui/app'
import { trackMatomoEvent as baseTrackMatomoEvent, HelpEvent, MatomoEvent } from '@remix-api'
import * as packageJson from '../../../../../package.json'

export type HelpTopic = 'beta-reel' | 'beta-info' | 'mcp' | 'cloud' | 'quickdapp' | 'beta-farewell'

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
export const BETA_FAREWELL_THRESHOLD_DAYS = 14

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
    description: 'Thank you! Take a short survey to claim 50% off your first 3 months of Remix Pro.',
    icon: 'fas fa-heart',
    color: '#e86baf',
    tag: 'Reward'
  },
]

/* ─── Side-panel React UI ─── */

import './help-panel.css'

const HelpPanelUI: React.FC<{ plugin: HelpPlugin }> = ({ plugin }) => {
  const { featureGroups } = useAuth()
  const isBeta = featureGroups?.some(fg => fg.name === 'beta')
  const activeModal = plugin.activeModal

  // Type-safe tracker defaulting to HelpEvent
  const trackMatomoEvent = <T extends MatomoEvent = HelpEvent>(event: T) => {
    baseTrackMatomoEvent(plugin, event)
  }

  if (!isBeta) {
    return (
      <div className="help-panel help-panel--locked">
        <div className="help-panel-locked-icon">
          <i className="fas fa-lock"></i>
        </div>
        <h5 className="help-panel-locked-title">Beta Required</h5>
        <p className="help-panel-locked-desc">
          Sign in with a beta account to access guides and feature walkthroughs.
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
          Beta Guides
        </div>
        <button
          className="help-panel-discord-btn"
          onClick={() => {
            trackMatomoEvent({ category: 'help', action: 'betaLinkClicked', name: 'discord', isClick: true })
            window.open('https://discord.gg/TWfKkZVwJW', '_blank')
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
        {TOPICS.map((topic) => (
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
          case 'discord': window.open('https://discord.gg/TWfKkZVwJW', '_blank'); break
          case 'docs': window.open('https://remix-ide.readthedocs.io/', '_blank'); break
          case 'blog': window.open('https://ethereumremix.substack.com/', '_blank'); break
          }
        }}
      />
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
