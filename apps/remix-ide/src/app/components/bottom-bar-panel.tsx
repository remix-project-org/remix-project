import React from 'react'
import { Plugin } from '@remixproject/engine'
import { PluginViewWrapper } from '@remix-ui/helper'
import * as packageJson from '../../../../../package.json'
import BottomBar from './bottom-bar'

const profile = {
  displayName: 'Bottom Bar',
  name: 'bottomBar',
  methods: ['startCreateDapp'],
  events: [],
  description: 'Editor bottom bar (renders above dragbar-terminal)',
  version: packageJson.version,
  kind: 'system'
}

export default class BottomBarPanel extends Plugin {
  private dispatch: ((state: any) => void) | null = null

  constructor() {
    super(profile)
  }

  setDispatch = (dispatch) => {
    this.dispatch = dispatch
  }

  onActivation() {
    this.renderComponent()
  }

  render() {
    return (
      <div className="panel" data-id="bottomBarPanelView">
        <PluginViewWrapper plugin={this} />
      </div>
    )
  }

  updateComponent() {
    return <BottomBar plugin={this} />
  }

  renderComponent() {
    this.dispatch && this.dispatch({})
  }

  async startCreateDapp() {
    if ((this as any).__startCreateDapp) {
      await (this as any).__startCreateDapp()
    }
  }
}
