import React from 'react' // eslint-disable-line
import { ViewPlugin } from '@remixproject/engine-web'
import { PluginViewWrapper } from '@remix-ui/helper'
import './style/environment-explorer.css'
import { EnvironmentExplorerUI, Provider } from '@remix-ui/environment-explorer'

import * as packageJson from '../../../../../package.json'

const profile = {
  name: 'environmentExplorer',
  displayName: 'Environment Explorer',
  icon: 'assets/img/EnvironmentExplorerLogo.webp',
  description: 'Customize the Environments list in Deploy & Run',
  location: 'mainPanel',
  documentation: 'https://remix-ide.readthedocs.io/en/latest/run.html',
  version: packageJson.version,
  maintainedBy: 'Remix',
  permission: true,
  events: [],
  methods: []
}

type EnvironmentExplorerState = {
  providersFlat: { [key: string]: Provider },
  pinnedProviders: string[],
}

export class EnvironmentExplorer extends ViewPlugin {
  dispatch: React.Dispatch<any> = () => { }
  state: EnvironmentExplorerState
  constructor() {
    super(profile)
    this.state = {
      providersFlat: {},
      pinnedProviders: [],
    }
  }

  async onActivation(): Promise<void> {
    this.on('blockchain', 'providersChanged', this.updateProviders.bind(this))
    await this.updateProviders()
  }

  async updateProviders() {
    this.state.providersFlat = await this.call('blockchain', 'getAllProviders')
    this.state.pinnedProviders = await this.call('blockchain', 'getPinnedProviders')
    this.renderComponent()
  }

  setDispatch(dispatch: React.Dispatch<any>): void {
    this.dispatch = dispatch
    this.renderComponent()
  }
  render() {
    return (
      <div className="bg-dark" id="environmentExplorer">
        <PluginViewWrapper plugin={this} />
      </div>
    )
  }

  async pinStateCallback(provider: Provider, pinned: boolean) {
    if (pinned) {
      this.emit('providerPinned', provider.name, provider)
      this.call('notification', 'toast', `"${provider.displayName}" has been added to the Environment list of the Deploy & Run Transactions plugin.`)
    } else {
      const providerName = await this.call('blockchain', 'getProvider')
      if (providerName !== provider.name) {
        this.emit('providerUnpinned', provider.name, provider)
        this.call('notification', 'toast', `"${provider.displayName}" has been removed from the Environment list of the Deploy & Run Transactions plugin.`)
        return true
      } else {
        this.call('notification', 'toast', 'Cannot unpin the current selected provider')
        return false
      }
    }
  }

  async deleteForkedState (provider) {
    const providerName = await this.call('blockchain', 'getProvider')
    if (providerName !== provider.name) {
      await this.call('fileManager', 'remove', `.states/forked_states/${provider.displayName}.json`)
      await this.call('blockchain', 'removeProvider', provider.name)
      this.call('notification', 'toast', `Environment "${provider.displayName}" deleted successfully.`)
    } else this.call('notification', 'toast', 'Cannot delete the current selected environment')
  }

  async showPinnedContracts (provider) {
    if (await this.call('fileManager', 'exists', `.deploys/pinned-contracts/${provider.name}`)) {
      const files = await this.call('fileManager', 'readdir', `.deploys/pinned-contracts/${provider.name}`)
      if (!files) {
        await this.call('terminal', 'log', { type: 'info', value: 'No pinned contract.' })
        return
      }
      if (!Object.keys(files).length) {
        await this.call('terminal', 'log', { type: 'info', value: 'No pinned contract.' })
        return
      }
      for (const file in files) {
        if (file.endsWith('.json')) {
          const content = JSON.parse(await this.call('fileManager', 'readFile', file))
          const msg = `Contract ${content.name} (${content.filePath}) deployed at ${content.address} on ${new Date(content.pinnedAt).toString()}`
          await this.call('terminal', 'log', { type: 'info', value: msg })
        }
      }
    } else {
      await this.call('terminal', 'log', { type: 'info', value: 'No pinned contract.' })
    }
  }

  renderComponent() {
    this.dispatch({
      ...this.state
    })
  }

  updateComponent(state: EnvironmentExplorerState) {
    return (<>
      <EnvironmentExplorerUI
        pinStateCallback={this.pinStateCallback.bind(this)}
        deleteForkedState={this.deleteForkedState.bind(this)}
        showPinnedContracts={this.showPinnedContracts.bind(this)}
        profile={profile}
        state={state}
      />
    </>)
  }
}
