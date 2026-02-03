import { ViewPlugin } from '@remixproject/engine-web'
import React from 'react'
import { AccountOverlay } from '@remix-ui/account-overlay'
import { PluginViewWrapper } from '@remix-ui/helper'
import * as packageJson from '../../../../../package.json'

const profile = {
  name: 'account',
  displayName: 'Account',
  description: 'Manage your account, credits, billing, and connected accounts',
  methods: ['open', 'close', 'isOpen'],
  events: ['opened', 'closed'],
  icon: '',
  location: 'overlay',
  version: packageJson.version,
  maintainedBy: 'Remix'
}

export class AccountPlugin extends ViewPlugin {
  dispatch: React.Dispatch<any> = () => {}

  constructor() {
    super(profile)
  }

  async onActivation(): Promise<void> {
    // Plugin is activated but overlay is not shown by default
    this.renderComponent()
  }

  /**
   * Open the account overlay
   */
  async open(): Promise<void> {
    // Add view to overlay panel if not already added
    try {
      await this.call('overlay', 'addView', this.profile, this.render())
    } catch (e) {
      // View might already be added
    }
    await this.call('overlay', 'showContent', 'account')
    await this.call('overlay', 'showOverlay', true)
    this.renderComponent()
    this.emit('opened')
  }

  /**
   * Close the account overlay
   */
  async close(): Promise<void> {
    await this.call('overlay', 'hideOverlay')
    this.emit('closed')
  }

  /**
   * Check if overlay is currently open
   */
  async isOpen(): Promise<boolean> {
    try {
      return await this.call('overlay', 'isOverlayVisible')
    } catch {
      return false
    }
  }

  setDispatch(dispatch: React.Dispatch<any>): void {
    this.dispatch = dispatch
    this.renderComponent()
  }

  renderComponent(): void {
    this.dispatch({
      plugin: this
    })
  }

  updateComponent(state: any): JSX.Element {
    return <AccountOverlay plugin={state.plugin || this} />
  }

  render(): JSX.Element {
    return (
      <div id="account-plugin" className="h-100">
        <PluginViewWrapper plugin={this} />
      </div>
    )
  }
}
