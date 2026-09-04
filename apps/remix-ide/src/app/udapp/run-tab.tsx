/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import React, { createElement, useEffect, useRef, useState } from 'react' // eslint-disable-line
import { createPortal } from 'react-dom'
import { RunTabUI } from '@remix-ui/run-tab'
import { trackMatomoEvent } from '@remix-api'
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

const UDAPP_TAB_KEY = 'udapp.activeTab'
const EV_DEPLOYED = 'udapp:deployedCountChanged'
const EV_TX = 'udapp:txCountChanged'

type UdappTab = 'deploy' | 'contracts' | 'history'

function UdappBody() {
  const [tab, setTab] = useState<UdappTab>(() => {
    return (localStorage.getItem(UDAPP_TAB_KEY) as UdappTab) || 'deploy'
  })
  const [deployedCount, setDeployedCount] = useState(0)
  const [txCount, setTxCount] = useState(0)
  const prevDeployedRef = useRef(0)

  const switchTab = (next: UdappTab) => {
    setTab(next)
    localStorage.setItem(UDAPP_TAB_KEY, next)
  }

  useEffect(() => {
    const onDeployed = (e: Event) => {
      const count = (e as CustomEvent<{ count: number }>).detail.count
      setDeployedCount(count)
      if (count > prevDeployedRef.current) {
        setTab('contracts')
        localStorage.setItem(UDAPP_TAB_KEY, 'contracts')
      }
      prevDeployedRef.current = count
    }
    const onTx = (e: Event) => {
      setTxCount((e as CustomEvent<{ count: number }>).detail.count)
    }
    window.addEventListener(EV_DEPLOYED, onDeployed)
    window.addEventListener(EV_TX, onTx)
    return () => {
      window.removeEventListener(EV_DEPLOYED, onDeployed)
      window.removeEventListener(EV_TX, onTx)
    }
  }, [])

  return (
    <div className="udapp-body">
      <div className="udapp-sticky-header">
        <div id="udappEnvComponent"></div>
        <nav className="udapp-tabs" role="tablist">
          <button data-id="udappDeployTab" role="tab" aria-selected={tab === 'deploy'} className={`ms-3 udapp-tab${tab === 'deploy' ? ' active' : ''}`} onClick={() => switchTab('deploy')}>
            Deploy
          </button>
          <button data-id="udappDeployedContractsTab" role="tab" aria-selected={tab === 'contracts'} className={`udapp-tab${tab === 'contracts' ? ' active' : ''}`} onClick={() => switchTab('contracts')}>
            Deployed contracts
            {deployedCount > 0 && <span className="udapp-tab-badge">{deployedCount}</span>}
          </button>
          <button data-id="udappTransactionsHistoryTab" role="tab" aria-selected={tab === 'history'} className={`udapp-tab${tab === 'history' ? ' active' : ''}`} onClick={() => switchTab('history')}>
            Transactions history
            {txCount > 0 && <span className="udapp-tab-badge">{txCount}</span>}
          </button>
        </nav>
      </div>
      <div id="udappScrollableContent" onScroll={(e) => {
        const target = e.currentTarget
        const header = target.closest('.udapp-body')?.querySelector('.udapp-sticky-header') as HTMLElement
        if (header) header.classList.toggle('scrolled', target.scrollTop > 0)
      }}>
        <div id="udappDeployComponent" style={{ display: tab === 'deploy' ? '' : 'none' }}></div>
        <div id="udappDeployedContractsComponent" style={{ display: tab === 'contracts' ? '' : 'none' }}></div>
        <div id="udappTransactionsComponent" style={{ display: tab === 'history' ? '' : 'none' }}></div>
      </div>
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
          window.dispatchEvent(new CustomEvent(EV_DEPLOYED, { detail: { count: instances.length } }))
        })
      }
      if (profile.name === 'udappTransactions') {
        this.transactionsUI = await this.call('udappTransactions', 'getUI')
        this.renderComponent()
        this.on('udappTransactions', 'transactionRecorderUpdated', (txs: any[]) => {
          window.dispatchEvent(new CustomEvent(EV_TX, { detail: { count: txs.length } }))
        })
      }
    })
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
      transactionsUI: this.transactionsUI
    })
  }

  updateComponent() {
    return (<>
      { this.envUI && createPortal(this.envUI, document.getElementById('udappEnvComponent')) }
      { this.deployUI && createPortal(this.deployUI, document.getElementById('udappDeployComponent')) }
      { this.deployedContractsUI && createPortal(this.deployedContractsUI, document.getElementById('udappDeployedContractsComponent')) }
      { this.transactionsUI && createPortal(this.transactionsUI, document.getElementById('udappTransactionsComponent')) }
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
