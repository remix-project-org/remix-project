/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import React, { createElement, useEffect, useRef, useState } from 'react' // eslint-disable-line
import { createPortal } from 'react-dom'
import { RunTabUI } from '@remix-ui/run-tab'
import { ViewPlugin } from '@remixproject/engine-web'
import { addressToString, PluginViewWrapper } from '@remix-ui/helper'
import * as packageJson from '../../../../../package.json'
import { EventManager } from '@remix-project/remix-lib'
import type { Blockchain } from '../../blockchain/blockchain'
import type { CompilerArtefacts } from '@remix-project/core-plugin'

const profile = {
  name: 'udapp',
  displayName: 'Deploy & run transactions',
  icon: 'assets/img/deployAndRun.webp',
  description: 'Execute, save and replay transactions',
  kind: 'udapp',
  location: 'sidePanel',
  documentation: 'https://remix-ide.readthedocs.io/en/latest/run.html',
  version: packageJson.version,
  maintainedBy: 'Remix',
  permission: true,
  events: ['newTransaction'],
  methods: ['showPluginDetails']
}

const INSTALL_REPO = 'remix-project-org/remix-ai-plugin'
const CLAUDE_CODE_STEPS = [
  'claude plugin marketplace add remix-project-org/remix-ai-plugin',
  'claude plugin install remix-solidity@remixlabs',
  'claude plugin list',
]

const UDAPP_TAB_KEY = 'udapp.activeTab'
const EV_DEPLOYED = 'udapp:deployedCountChanged'
const EV_TX = 'udapp:txCountChanged'
const EV_SWITCH_TAB = 'udapp:switchTab'
const EV_EEZ_NETWORK = 'udapp:eezNetworkChanged'
let isEezNetworkActive = false

type UdappTab = 'deploy' | 'contracts' | 'history' | 'eez'

function UdappBody() {
  const [tab, setTab] = useState<UdappTab>(() => (localStorage.getItem(UDAPP_TAB_KEY) as UdappTab) || 'deploy')
  const [showClaudeModal, setShowClaudeModal] = useState(false)
  const [claudeTab, setClaudeTab] = useState<'web' | 'code' | 'desktop'>('web')
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null)

  const copyCmd = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedCmd(key)
      setTimeout(() => setCopiedCmd(null), 2000)
    })
  }
  const [isEezNetwork, setIsEezNetwork] = useState(isEezNetworkActive)
  const activeTab: UdappTab = tab === 'eez' && !isEezNetwork ? 'deploy' : tab
  const [deployedCount, setDeployedCount] = useState(0)
  const [txCount, setTxCount] = useState(0)
  const prevUnpinnedRef = useRef(0)

  const switchTab = (next: UdappTab) => {
    setTab(next)
    localStorage.setItem(UDAPP_TAB_KEY, next)
  }

  useEffect(() => {
    const onDeployed = (e: Event) => {
      const { count, unpinnedCount } = (e as CustomEvent<{ count: number; unpinnedCount: number }>).detail
      setDeployedCount(count)
      // pinned contracts reloaded on a network or workspace change are not new deployments
      if (unpinnedCount > prevUnpinnedRef.current) {
        setTab('contracts')
        localStorage.setItem(UDAPP_TAB_KEY, 'contracts')
      }
      prevUnpinnedRef.current = unpinnedCount
    }
    const onTx = (e: Event) => {
      setTxCount((e as CustomEvent<{ count: number }>).detail.count)
    }
    const onSwitchTab = (e: Event) => {
      const nextTab = (e as CustomEvent<{ tab: UdappTab }>).detail?.tab
      if (nextTab) switchTab(nextTab)
    }
    const onEezNetwork = (e: Event) => {
      setIsEezNetwork((e as CustomEvent<{ isEezNetwork: boolean }>).detail.isEezNetwork)
    }
    window.addEventListener(EV_DEPLOYED, onDeployed)
    window.addEventListener(EV_TX, onTx)
    window.addEventListener(EV_SWITCH_TAB, onSwitchTab)
    window.addEventListener(EV_EEZ_NETWORK, onEezNetwork)
    return () => {
      window.removeEventListener(EV_DEPLOYED, onDeployed)
      window.removeEventListener(EV_TX, onTx)
      window.removeEventListener(EV_SWITCH_TAB, onSwitchTab)
      window.removeEventListener(EV_EEZ_NETWORK, onEezNetwork)
    }
  }, [])

  return (
    <div className="udapp-body">
      <div className="udapp-sticky-header">
        <div id="udappEnvComponent"></div>
        <nav className="udapp-tabs" role="tablist">
          <button data-id="udappDeployTab" role="tab" aria-selected={activeTab === 'deploy'} className={`ms-3 udapp-tab${activeTab === 'deploy' ? ' active' : ''}`} onClick={() => switchTab('deploy')}>
            Deploy
          </button>
          <button data-id="udappDeployedContractsTab" role="tab" aria-selected={activeTab === 'contracts'} className={`udapp-tab${activeTab === 'contracts' ? ' active' : ''}`} onClick={() => switchTab('contracts')}>
            Deployed Contracts
            {deployedCount > 0 && <span className="udapp-tab-badge">{deployedCount}</span>}
          </button>
          <button data-id="udappTransactionsHistoryTab" role="tab" aria-selected={activeTab === 'history'} className={`udapp-tab${activeTab === 'history' ? ' active' : ''}`} onClick={() => switchTab('history')}>
            Transaction History
            {txCount > 0 && <span className="udapp-tab-badge">{txCount}</span>}
          </button>
          {isEezNetwork && (
            <button data-id="udappEezTab" role="tab" aria-selected={activeTab === 'eez'} className={`udapp-tab${activeTab === 'eez' ? ' active' : ''}`} onClick={() => switchTab('eez')}>
              EEZ
            </button>
          )}
        </nav>
      </div>
      <div id="udappScrollableContent" onScroll={(e) => {
        const target = e.currentTarget
        const header = target.closest('.udapp-body')?.querySelector('.udapp-sticky-header') as HTMLElement
        if (header) header.classList.toggle('scrolled', target.scrollTop > 0)
      }}>
        <div id="udappDeployComponent" style={{ display: activeTab === 'deploy' ? '' : 'none' }}></div>
        <div id="udappDeployedContractsComponent" style={{ display: activeTab === 'contracts' ? '' : 'none' }}></div>
        <div id="udappTransactionsComponent" style={{ display: activeTab === 'history' ? '' : 'none' }}></div>
        <div id="udappEezComponent" style={{ display: activeTab === 'eez' ? '' : 'none' }}></div>
      </div>
      <div className="udapp-claude-footer">
        <button className="udapp-claude-promo" onClick={() => setShowClaudeModal(true)}>
          <i className="fa-solid fa-sparkles"></i>
          Deploy directly from Claude
          <i className="fa-solid fa-chevron-right" style={{ fontSize: '9px' }}></i>
        </button>
      </div>

      {showClaudeModal && createPortal(
        <div className="ai-install-overlay" onClick={() => setShowClaudeModal(false)}>
          <div className="ai-install-modal" onClick={e => e.stopPropagation()}>
            <div className="ai-install-modal-header">
              <span><i className="fa-solid fa-sparkles" style={{ marginRight: '8px' }}></i>Deploy directly from Claude</span>
              <button className="ai-install-modal-close" onClick={() => setShowClaudeModal(false)}><i className="fa-solid fa-xmark"></i></button>
            </div>
            <div className="ai-install-tab-bar">
              <button className={`ai-install-tab-btn${claudeTab === 'web' ? ' active' : ''}`} onClick={() => setClaudeTab('web')}><i className="fa-solid fa-globe"></i> claude.ai</button>
              <button className={`ai-install-tab-btn${claudeTab === 'code' ? ' active' : ''}`} onClick={() => setClaudeTab('code')}><i className="fa-solid fa-terminal"></i> Claude Code</button>
              <button className={`ai-install-tab-btn${claudeTab === 'desktop' ? ' active' : ''}`} onClick={() => setClaudeTab('desktop')}><i className="fa-solid fa-desktop"></i> Claude Desktop</button>
            </div>
            {claudeTab === 'web' && (
              <ol className="ai-install-steps">
                <li>Go to <strong>claude.ai</strong> and open <strong>Customize</strong> in the left sidebar.</li>
                <li>Open the <strong>Plugins</strong> tab. In <strong>Personal plugins</strong>, click <strong>+</strong> → <strong>Add marketplace</strong>.</li>
                <li>
                  Choose <strong>Add from a repository</strong>, enter the GitHub repo, then click <strong>Sync</strong>.
                  <span className="ai-install-step-cmd">
                    <code className="ai-install-code">{INSTALL_REPO}</code>
                    <button className="ai-install-copy-btn" onClick={() => copyCmd(INSTALL_REPO, 'web-repo')}>
                      <i className={copiedCmd === 'web-repo' ? 'fa-solid fa-check ai-install-copied' : 'fa-regular fa-copy'}></i>
                    </button>
                  </span>
                </li>
                <li>Find <strong>remix-solidity</strong> in the plugin list and click <strong>Install</strong>.</li>
                <li>Use skills like <code className="ai-install-code-inline">deploy-contract</code> and <code className="ai-install-code-inline">call-contract</code> in any chat.</li>
              </ol>
            )}
            {claudeTab === 'code' && (
              <ol className="ai-install-steps">
                <li>
                  Add the Remix marketplace.
                  <span className="ai-install-step-cmd">
                    <code className="ai-install-code">{CLAUDE_CODE_STEPS[0]}</code>
                    <button className="ai-install-copy-btn" onClick={() => copyCmd(CLAUDE_CODE_STEPS[0], 'code-0')}>
                      <i className={copiedCmd === 'code-0' ? 'fa-solid fa-check ai-install-copied' : 'fa-regular fa-copy'}></i>
                    </button>
                  </span>
                </li>
                <li>
                  Install the Remix Solidity plugin.
                  <span className="ai-install-step-cmd">
                    <code className="ai-install-code">{CLAUDE_CODE_STEPS[1]}</code>
                    <button className="ai-install-copy-btn" onClick={() => copyCmd(CLAUDE_CODE_STEPS[1], 'code-1')}>
                      <i className={copiedCmd === 'code-1' ? 'fa-solid fa-check ai-install-copied' : 'fa-regular fa-copy'}></i>
                    </button>
                  </span>
                </li>
                <li>
                  Verify — <strong>remix-solidity</strong> should appear in the list.
                  <span className="ai-install-step-cmd">
                    <code className="ai-install-code">{CLAUDE_CODE_STEPS[2]}</code>
                    <button className="ai-install-copy-btn" onClick={() => copyCmd(CLAUDE_CODE_STEPS[2], 'code-2')}>
                      <i className={copiedCmd === 'code-2' ? 'fa-solid fa-check ai-install-copied' : 'fa-regular fa-copy'}></i>
                    </button>
                  </span>
                </li>
              </ol>
            )}
            {claudeTab === 'desktop' && (
              <ol className="ai-install-steps">
                <li>Open <strong>Claude Desktop</strong>, go to the <strong>Cowork</strong> tab, and click <strong>Customize</strong> in the left sidebar.</li>
                <li>Open the <strong>Plugins</strong> tab. In <strong>Personal plugins</strong>, click <strong>+</strong> → <strong>Add marketplace</strong>.</li>
                <li>
                  Choose <strong>Add from a repository</strong>, enter the GitHub repo, then click <strong>Sync</strong>.
                  <span className="ai-install-step-cmd">
                    <code className="ai-install-code">{INSTALL_REPO}</code>
                    <button className="ai-install-copy-btn" onClick={() => copyCmd(INSTALL_REPO, 'desktop-repo')}>
                      <i className={copiedCmd === 'desktop-repo' ? 'fa-solid fa-check ai-install-copied' : 'fa-regular fa-copy'}></i>
                    </button>
                  </span>
                </li>
                <li>Find <strong>remix-solidity</strong> in the plugin list and click <strong>Install</strong>.</li>
                <li>Use skills like <code className="ai-install-code-inline">deploy-contract</code> and <code className="ai-install-code-inline">call-contract</code> in any Cowork task.</li>
              </ol>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

export class RunTab extends ViewPlugin {
  event: EventManager
  engine: any
  blockchain: Blockchain

  private dispatch: (state: any) => void = () => {}
  private envUI: React.ReactNode = null
  private deployUI: React.ReactNode = null
  private deployedContractsUI: React.ReactNode = null
  private transactionsUI: React.ReactNode = null
  private eezUI: React.ReactNode = null

  constructor(blockchain: Blockchain, engine: any) {
    super(profile)
    this.event = new EventManager()
    this.engine = engine
    this.blockchain = blockchain
  }

  onActivation(): void {
    this.on('manager', 'activate', async (profile: { name: string }) => {
      if (profile.name === 'udappEnv') {
        this.envUI = await this.call('udappEnv', 'getUI', this.engine, this.blockchain)
        this.renderComponent()
      }
      if (profile.name === 'udappDeploy') {
        this.deployUI = await this.call('udappDeploy', 'getUI')
        this.renderComponent()
      }
      if (profile.name === 'udappDeployedContracts') {
        this.deployedContractsUI = await this.call('udappDeployedContracts', 'getUI')
        this.renderComponent()
        this.on('udappDeployedContracts', 'deployedInstanceUpdated', (instances: any[]) => {
          const unpinnedCount = instances.filter((instance) => !instance.isPinned).length
          window.dispatchEvent(new CustomEvent(EV_DEPLOYED, { detail: { count: instances.length, unpinnedCount } }))
        })
      }
      if (profile.name === 'udappTransactions') {
        this.transactionsUI = await this.call('udappTransactions', 'getUI')
        this.renderComponent()
        this.on('udappTransactions', 'transactionRecorderUpdated', (txs: any[]) => {
          window.dispatchEvent(new CustomEvent(EV_TX, { detail: { count: txs.length } }))
        })
      }
      if (profile.name === 'udappEez') {
        this.eezUI = await this.call('udappEez', 'getUI')
        this.renderComponent()
        this.on('udappEez', 'networksChanged', (networks: any[]) => this.setEezNetwork(networks?.length > 0))
        const networks = await this.call('udappEez', 'getNetworks').catch((): any[] => [])
        this.setEezNetwork(networks?.length > 0)
      }
    })
  }

  private setEezNetwork(isEezNetwork: boolean) {
    isEezNetworkActive = isEezNetwork
    window.dispatchEvent(new CustomEvent(EV_EEZ_NETWORK, { detail: { isEezNetwork } }))
  }

  showPluginDetails() {
    return profile
  }

  setDispatch(dispatch: (state: any) => void) {
    this.dispatch = dispatch
    this.renderComponent()
  }

  renderComponent() {
    this.dispatch && this.dispatch({
      ...this,
      envUI: this.envUI,
      deployUI: this.deployUI,
      deployedContractsUI: this.deployedContractsUI,
      transactionsUI: this.transactionsUI,
      eezUI: this.eezUI
    })
  }

  updateComponent() {
    const eezContainer = document.getElementById('udappEezComponent')
    return (<>
      { this.envUI && createPortal(this.envUI, document.getElementById('udappEnvComponent')) }
      { this.deployUI && createPortal(this.deployUI, document.getElementById('udappDeployComponent')) }
      { this.deployedContractsUI && createPortal(this.deployedContractsUI, document.getElementById('udappDeployedContractsComponent')) }
      { this.transactionsUI && createPortal(this.transactionsUI, document.getElementById('udappTransactionsComponent')) }
      { this.eezUI && eezContainer && createPortal(this.eezUI, eezContainer) }
    </>)
  }

  render() {
    return (
      <div id="runTabView" style={{ position: 'relative', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <UdappBody />
        <PluginViewWrapper plugin={this} />
      </div>
    )
  }
}
