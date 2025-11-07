// eslint-disable-next-line no-use-before-define
import React from 'react'
import { AbstractPanel } from './panel'
import { PluginRecord, RemixPluginPanel } from '@remix-ui/panel'
import packageJson from '../../../../../package.json'
import { RemixUIPanelHeader } from '@remix-ui/panel'
import { PluginViewWrapper } from '@remix-ui/helper'

const pinnedPanel = {
  name: 'pinnedPanel',
  displayName: 'Pinned Panel',
  description: 'Remix IDE pinned panel',
  version: packageJson.version,
  methods: ['addView', 'removeView', 'currentFocus', 'pinView', 'unPinView', 'highlight', 'closePlugin', 'maximizePlugin',
    'getClosedPlugin'
  ],
  events: ['pluginClosed', 'pluginMaximized']
}

export class PinnedPanel extends AbstractPanel {
  dispatch: React.Dispatch<any> = () => {}
  loggedState: Record<string, any>
  pinnedPanelState: Record<string, any> // pluginProfile, isClosed 
  highlightStamp: number
  closedPlugin: any

  constructor() {
    super(pinnedPanel)
  }

  onActivation() {
    this.renderComponent()
    this.on('sidePanel', 'pluginDisabled', (name) => {
      if (this.plugins[name] && this.plugins[name].active) {
        this.emit('unPinnedPlugin', name)
        this.events.emit('unPinnedPlugin', name)
        super.remove(name)
      }
    })

    let pinnedPanelState = window.localStorage.getItem('pinnedPanelState')
    if (!pinnedPanelState) window.localStorage.setItem('pinnedPanelState', JSON.stringify({}))
  }

  async pinView (profile, view) {
    if (this.closedPlugin) {
      this.maximizePlugin(this.closedPlugin)
    }
    const activePlugin = this.currentFocus()

    if (activePlugin === profile.name) throw new Error(`Plugin ${profile.name} already pinned`)
    if (activePlugin) {
      await this.call('sidePanel', 'unPinView', this.plugins[activePlugin].profile, this.plugins[activePlugin].view)
      this.remove(activePlugin)
    }
    this.loggedState = await this.call('pluginStateLogger', 'getPluginState', profile.name)
    this.addView(profile, view)
    this.plugins[profile.name].pinned = true
    this.plugins[profile.name].active = true
    let pinnedPanelState = window.localStorage.getItem('pinnedPanelState')
    let isClosed = false
    if (pinnedPanelState) {
      pinnedPanelState = JSON.parse(pinnedPanelState)
      if (pinnedPanelState['isClosed']) {    
        isClosed = true
        await this.closePlugin(profile)
      }
    }
    this.renderComponent()
    this.events.emit('pinnedPlugin', profile, isClosed)
    this.emit('pinnedPlugin', profile, isClosed)
  }

  async unPinView (profile) {
    const activePlugin = this.currentFocus()

    if (activePlugin !== profile.name) throw new Error(`Plugin ${profile.name} is not pinned`)
    await this.call('sidePanel', 'unPinView', profile, this.plugins[profile.name].view)
    super.remove(profile.name)
    this.renderComponent()
    this.events.emit('unPinnedPlugin', profile)
    this.emit('unPinnedPlugin', profile)
  }

  getClosedPlugin() {
    return this.closedPlugin
  }

  async closePlugin (profile) {
    const pinnedPanel = document.querySelector('#pinned-panel')
    pinnedPanel.classList.add('d-none')
    this.closedPlugin = profile
    window.localStorage.setItem('pinnedPanelState', JSON.stringify({pluginProfile: profile, isClosed: true}))
    this.events.emit('pluginClosed', profile)
    this.emit('pluginClosed', profile)
  }

  async maximizePlugin (profile) {
    const pinnedPanel = document.querySelector('#pinned-panel')
    pinnedPanel.classList.remove('d-none')
    this.closedPlugin = null
    window.localStorage.setItem('pinnedPanelState', JSON.stringify({pluginProfile: profile, isClosed: false}))
    this.events.emit('pluginMaximized', profile)
    this.emit('pluginMaximized', profile)
  }

  highlight () {
    this.highlightStamp = Date.now()
    this.renderComponent()
  }

  setDispatch (dispatch: React.Dispatch<any>) {
    this.dispatch = dispatch
  }

  render() {
    return (
      <section className='panel pinned-panel'> <PluginViewWrapper plugin={this} /></section>
    )
  }

  updateComponent(state: any) {
    return <RemixPluginPanel header={<RemixUIPanelHeader plugins={state.plugins} pinView={this.pinView.bind(this)} unPinView={this.unPinView.bind(this)} closePlugin={this.closePlugin.bind(this)} maximizePlugin={this.maximizePlugin.bind(this)}></RemixUIPanelHeader>} { ...state } />
  }

  renderComponent() {
    this.dispatch({
      plugins: this.plugins,
      pluginState: this.loggedState,
      highlightStamp: this.highlightStamp
    })
  }
}
