import React from 'react' // eslint-disable-line
import { AbstractPanel } from './panel'
import { RemixPluginPanel } from '@remix-ui/panel'
import packageJson from '../../../../../package.json'
import { PluginViewWrapper } from '@remix-ui/helper'

const profile = {
  name: 'mainPanel',
  displayName: 'Main Panel',
  description: 'Remix IDE main panel',
  version: packageJson.version,
  methods: ['addView', 'removeView', 'showContent']
}

export class MainPanel extends AbstractPanel {
  element: HTMLDivElement
  dispatch: React.Dispatch<any> = () => {}
  constructor(config = null) {
    super(profile)
    this.element = document.createElement('div')
    this.element.setAttribute('data-id', 'mainPanelPluginsContainer')
    this.element.setAttribute('style', 'height: 100%; width: 100%;')
    // this.config = config
  }

  setDispatch(dispatch: React.Dispatch<any>) {
    this.dispatch = dispatch
  }

  onActivation() {
    this.renderComponent()
  }

  focus(name) {
    this.emit('focusChanged', name)
    super.focus(name)
    this.renderComponent()
  }

  addView(profile, view) {
    super.addView(profile, view)
    this.renderComponent()
  }

  removeView(profile) {
    super.removeView(profile)
    this.renderComponent()
  }

  async showContent(name) {
    super.showContent(name)
    this.renderComponent()
  }

  renderComponent() {
    this.dispatch({
      plugins: this.plugins
    })
  }

  render() {
    return (
      <div style={{ height: '100%', width: '100%' }} data-id="mainPanelPluginsContainer">
        <PluginViewWrapper plugin={this} />
      </div>
    )
  }

  updateComponent(state: any) {
    return <RemixPluginPanel sourcePlugin={this} header={<></>} plugins={state.plugins} />
  }
}
