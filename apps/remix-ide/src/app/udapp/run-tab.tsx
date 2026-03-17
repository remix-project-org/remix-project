/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import React, { createElement } from 'react' // eslint-disable-line
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
      }
      if (profile.name === 'udappTransactions') {
        this.transactionsUI = await this.call('udappTransactions', 'getUI')
        this.renderComponent()
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
      <div id="runTabView" style={{ position: 'relative', height: '100%', overflow: 'auto' }}>
        <div id="udappEnvComponent" style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--body-bg)' }}></div>
        <div id="udappDeployComponent"></div>
        <div id="udappDeployedContractsComponent"></div>
        <div id="udappTransactionsComponent"></div>
        <PluginViewWrapper plugin={this} />
      </div>
    )
  }
}
