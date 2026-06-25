import { ViewPlugin } from '@remixproject/engine-web'
import React from 'react'
import { PluginViewWrapper, DISCORD_URL, REMIX_DOCS_URL } from '@remix-ui/helper'
import { useAuth } from '@remix-ui/app'
import { trackMatomoEvent as baseTrackMatomoEvent, HelpEvent, MatomoEvent, Features } from '@remix-api'
import * as packageJson from '../../../../../package.json'

export type HelpTopic = 'beta-reel' | 'beta-info' | 'mcp' | 'cloud' | 'quickdapp' | 'beta-farewell' | 'free-guide' | 'starter-guide' | 'pro-guide'

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
    // The RemixAI assistant is the free baseline, so this shows for everyone
    // signed in with the assistant.
    id: 'free-guide',
    title: 'What you get for free',
    description: 'RemixAI Assistant, QuickDApp generation, basic AI skills, usage-based models, and bring-your-own API key.',
    icon: 'fas fa-gift',
    color: '#6bdb8a',
    tag: 'Free',
    requiredFeatures: [Features.AI_SOLCODER]
  },
  {
    // "Full AI Skills" (advanced skills) marks Starter and up.
    id: 'starter-guide',
    title: 'Get started with Starter',
    description: 'Full AI skills, the Code Helper, Web Search & OpenZeppelin connectors, local LLMs (Ollama), ENS/Enscribe naming, and cloud workspaces.',
    icon: 'fas fa-seedling',
    color: '#5b9cf5',
    tag: 'Starter',
    requiredFeatures: [Features.SKILLS_ADVANCED]
  },
  {
    // The auditor agent is Pro-only.
    id: 'pro-guide',
    title: 'Unlock Pro features',
    description: 'Everything in Starter, plus the auditor agent, gas-consumption checks, The Graph / Etherscan / Alchemy connectors, and unlimited dapp hosting.',
    icon: 'fas fa-crown',
    color: '#f0a030',
    tag: 'Pro',
    requiredFeatures: [Features.AI_AUDITOR]
  },
]

/* ─── Plan guide demo content (static, like the MCP/QuickDApp demos) ─── */

import type { PlanGuideDemo } from './plan-guide-modal'

const FREE_DEMOS: PlanGuideDemo[] = [
  {
    key: 'assistant', name: 'RemixAI Assistant', color: '#5b9cf5',
    desc: 'Ask anything — generate contracts, explain code, and fix errors right in the editor.',
    example: '"Write an ERC-20 with a capped supply"',
    prompt: 'Write an ERC-20 token with a capped supply and an owner-only mint function.',
    mockReply: 'Drafting <span class="plg-hl">CappedToken.sol</span>…\n\n' +
      '  • OpenZeppelin ERC20 + Ownable\n  • `cap` enforced in `_update`\n  • owner-only `mint`\n\n' +
      'Created the file in your workspace — hit Compile to try it.'
  },
  {
    key: 'quickdapp', name: 'QuickDApp Generation', color: '#6bdb8a',
    desc: 'Generate a frontend wired to your contract from a prompt (hosting is a paid add-on).',
    example: '"Create a dapp for my contract"',
    prompt: 'Generate a frontend dapp for my deployed contract with connect-wallet and the main calls.',
    mockReply: 'Generating your dapp…\n\n  • Wallet connect\n  • Read/write forms per function\n  • Vite + React scaffold\n\n' +
      'Frontend created in <span class="plg-hl">/frontend</span>. Run it locally, or upgrade to host it.'
  },
  {
    key: 'skills', name: 'Basic AI Skills', color: '#9b7dff',
    desc: 'Load curated basic skills so the assistant follows proven workflows.',
    example: '"Load a skill, then use it"',
    prompt: 'Load the available basic skills and apply one that fits writing a secure ERC-721.',
    mockReply: 'Added the selected skill to <span class="plg-hl">skills/</span>.\n\n' +
      'I\'ll follow its checklist as we build your ERC-721 — starting with access control and safe minting.'
  },
  {
    key: 'models', name: 'Usage-based Models', color: '#2fbfb1',
    desc: 'Pay-as-you-go access to AI models — you only pay for what you use.',
    example: '"What does this model cost?"',
    prompt: 'Explain how usage-based pricing works for the AI models on the free plan.',
    mockReply: 'On Free, models are <span class="plg-hl">usage-based</span> — you\'re billed per request from your credit balance, with no monthly fee. Upgrade for a monthly credit gift.'
  },
  {
    key: 'apikey', name: 'Bring Your Own API Keys', color: '#f0a030',
    desc: 'Plug in your own provider API key to use the assistant with your own account.',
    example: '"Use my own API key"',
    prompt: 'How do I configure RemixAI to use my own provider API key?',
    mockReply: 'Open <span class="plg-hl">RemixAI settings</span> → API keys, paste your provider key, and the assistant will route requests through your account.'
  }
]

const STARTER_DEMOS: PlanGuideDemo[] = [
  {
    key: 'skills', name: 'Full AI Skills', color: '#6bdb8a',
    desc: 'Starter unlocks the full skills library — load and import any advanced skill.',
    example: '"Load the advanced skills"',
    prompt: 'Load the full advanced skills library and apply the one best suited to my contract.',
    mockReply: 'Full skills access enabled. Added the selected advanced skill to <span class="plg-hl">skills/</span> — I\'ll follow its expert workflow from here.'
  },
  {
    key: 'codehelper', name: 'RemixAI Code Helper', color: '#5b9cf5',
    desc: 'A focused coding helper that writes, refactors, and fixes Solidity alongside you.',
    example: '"Can you analyze this function for security issues?"',
    prompt: 'How do I use the code helper to analyze my code?',
    mockReply: 'Select a function or snippet in the editor, then a `Code Analysis` block will appear with suggestions.\n\n' +
      '<img src="https://raw.githubusercontent.com/remix-project-org/remix-dynamics/main/gifs/code_analyzis.gif" alt="Code Analysis" style="max-width:100%;border-radius:6px;" />'
  },
  {
    key: 'connectors', name: 'Web Search & OpenZeppelin', color: '#9b7dff',
    desc: 'Starter connectors: live Web Search and the OpenZeppelin library, built in.',
    example: '"Scaffold an ERC20 with OpenZeppelin"',
    prompt: 'Use the OpenZeppelin connector to scaffold a mintable, pausable ERC20, and web-search the latest best practices.',
    mockReply: 'Pulling from the <span class="plg-hl">OpenZeppelin</span> connector…\n\n' +
      'Generated `Token.sol` (ERC20 + ERC20Pausable + Ownable). Web Search confirms it matches current OZ v5 guidance.'
  },
  {
    key: 'ollama', name: 'Local & Private LLMs', color: '#2fbfb1',
    desc: 'Run models locally and privately with Ollama or llama-server — your code never leaves your machine.',
    example: '"Use my local Ollama model"',
    prompt: 'Connect to my local Ollama instance and use it for this session.',
    mockReply: 'Connected to <span class="plg-hl">Ollama</span> on localhost. The assistant now runs fully locally — private and offline-capable.'
  },
  {
    key: 'ens', name: 'Name with ENS/Enscribe', color: '#f0a030',
    desc: 'Give your deployed contracts a human-readable ENS / Enscribe name.',
    example: '"Register my contract to ENS"',
    prompt: 'Register my deployed contract address to an ENS name I own using Enscribe.',
    mockReply: 'Linking <span class="plg-hl">mytoken.eth</span> → 0x9a2…3b1 via Enscribe…\n\nResolver record set — your contract is now reachable by name.'
  },
  {
    key: 'cloud', name: 'Cloud Workspaces', color: '#5b9cf5',
    desc: 'Sync your projects to the cloud and open any workspace from any device.',
    example: '"Save this workspace to the cloud"',
    prompt: 'Sync my current workspace to the cloud so I can open it from another device.',
    mockReply: 'Workspace synced to your <span class="plg-hl">cloud account</span>. Sign in anywhere and it\'ll be waiting for you.'
  }
]

const PRO_DEMOS: PlanGuideDemo[] = [
  {
    key: 'auditor', name: 'Auditor Agent', color: '#f0a030',
    desc: 'The RemixAI auditor agent reviews your contract against curated security checklists.',
    example: '"/audit the current contract in the editor"',
    prompt: '/audit a contract — audit the open file against the security checklists in audits/.',
    mockReply: 'Auditing <span class="plg-hl">Token.sol</span> against the selected checklist…\n\n' +
      '  • Reentrancy: <span class="plg-hl">pass</span>\n  • Access control: 1 finding (unprotected `setOwner`)\n\n' +
      'Full report saved to <span class="plg-hl">audit_reports/</span>.'
  },
  {
    key: 'gas', name: 'Gas Consumption Checks', color: '#6bdb8a',
    desc: 'Profile your contract and get concrete gas savings with before/after numbers.',
    example: '"/gas-audit the current contract in the editor"',
    prompt: 'Run a gas-consumption check on the active contract and suggest concrete savings with estimates.',
    mockReply: 'Profiling <span class="plg-hl">Token.sol</span> for gas…\n\n' +
      '  • Cache `storage` reads in loops → <span class="plg-hl">−2,100 gas</span>\n' +
      '  • Use `calldata` for read-only args → <span class="plg-hl">−480 gas</span>\n' +
      '  • Pack two `uint128` fields into one slot → <span class="plg-hl">−20,000 gas</span> per write\n\n' +
      'Apply all, or pick one to start?'
  },
  {
    key: 'connectors', name: 'TheGraph / Etherscan / Alchemy', color: '#5b9cf5',
    desc: 'Pro adds The Graph, Etherscan and Alchemy — live on-chain data and verification in chat.',
    example: '"Verify my contract on Etherscan"',
    prompt: 'Use Etherscan to verify the contract I just deployed on Sepolia and show the status.',
    mockReply: 'Connecting to <span class="plg-hl">Etherscan (Sepolia)</span>…\n\n' +
      'Contract verified ✓ — source matches, compiler 0.8.20, MIT.\n\nThe Graph and Alchemy connectors are ready too — just ask.'
  },
  {
    key: 'hosting', name: 'Unlimited Dapp Hosting', color: '#9b7dff',
    desc: 'Generate and host your dapps with QuickDApp — unlimited hosting on Pro.',
    example: '"Host this dapp"',
    prompt: 'Host my generated dapp and give me a shareable URL.',
    mockReply: 'Deploying your frontend…\n\nLive at <span class="plg-hl">https://your-dapp.remix.host</span>\n\nPro includes <span class="plg-hl">unlimited hosting</span> — ship as many dapps as you like.'
  },
  {
    key: 'commands', name: 'Advanced Commands', color: '#e86baf',
    desc: 'Pro unlocks advanced slash commands for the auditor and gas agents. Type “/” to reach them.',
    example: '"/audit", "/gas-audit"',
    prompt: '/audit a contract',
    mockReply: 'Advanced commands are enabled:\n\n' +
      '  • <span class="plg-hl">/audit</span> — security audit against checklists\n' +
      '  • <span class="plg-hl">/gas-audit</span> — gas-consumption check\n' +
      '  • <span class="plg-hl">/load-audit-checklist</span> — load curated checklists\n\n' +
      'Just type “/” in the assistant to use them.'
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

  // The modal overlay must render independently of the topic cards: a guide
  // can be auto-opened (e.g. the post-login free guide or a post-upgrade plan
  // guide) before the user's features have loaded, when the panel would
  // otherwise show its locked/empty state.
  const modalOverlay = activeModal && (
    <HelpModalOverlay
      topic={activeModal}
      plugin={plugin}
      onClose={() => plugin.closeModal()}
    />
  )

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
        {modalOverlay}
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
      {modalOverlay}
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
    case 'free-guide':
      return (
        <PlanGuideModal
          open
          onClose={onClose}
          onShowReel={showReel}
          planName="Remix Free"
          accent="#6bdb8a"
          intro="Welcome to Remix! On the free plan you get the RemixAI assistant, QuickDApp frontend generation, basic AI skills, usage-based models, and the option to bring your own API key. Click any feature to see it in action."
          demos={FREE_DEMOS}
        />
      )
    case 'starter-guide':
      return (
        <PlanGuideModal
          open
          onClose={onClose}
          onShowReel={showReel}
          planName="Remix Starter"
          accent="#5b9cf5"
          intro="Your Starter plan adds full AI skills, the Code Helper, Web Search & OpenZeppelin connectors, local LLMs via Ollama, ENS/Enscribe naming, cloud workspaces, and a 40,000-credit ($4) gift. Try a demo of each below."
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
          intro="You're on Pro — everything in Starter, plus the RemixAI auditor agent, gas-consumption checks, The Graph / Etherscan / Alchemy connectors, unlimited dapp hosting, and a 120,000-credit ($12) gift. Try a demo of each below."
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
