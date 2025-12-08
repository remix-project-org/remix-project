// eslint-disable-next-line no-use-before-define
import React from 'react'
import { AbstractPanel } from './panel'
import { RemixPluginPanel } from '@remix-ui/panel'
import packageJson from '../../../../../package.json'
import { RemixUIPanelHeader } from '@remix-ui/panel'
import { PluginViewWrapper } from '@remix-ui/helper'
import { trackMatomoEvent } from '@remix-api'

const sidePanel = {
  name: 'sidePanel',
  displayName: 'Side Panel',
  description: 'Remix IDE side panel',
  version: packageJson.version,
  methods: ['addView', 'removeView', 'currentFocus', 'pinView', 'unPinView', 'focus', 'showContent', 'togglePanel', 'isPanelHidden']
}

export class SidePanel extends AbstractPanel {
  sideelement: any
  loggedState: any
  dispatch: React.Dispatch<any> = () => {}
  isHidden: boolean

  constructor() {
    super(sidePanel)
    this.sideelement = document.createElement('section')
    this.sideelement.setAttribute('class', 'panel plugin-manager')
  }

  onActivation() {
    this.renderComponent()
    // Initialize isHidden state from panelStates in localStorage
    const panelStatesStr = window.localStorage.getItem('panelStates')
    const panelStates = panelStatesStr ? JSON.parse(panelStatesStr) : {}

    if (panelStates.leftSidePanel) {
      this.isHidden = panelStates.leftSidePanel.isHidden || false
      // Apply d-none class to hide the panel on reload if it was hidden
      if (this.isHidden) {
        const sidePanel = document.querySelector('#side-panel')
        sidePanel?.classList.add('d-none')
        trackMatomoEvent(this, { category: 'topbar', action: 'leftSidePanel', name: 'hiddenOnLoad', isClick: false })
      }
    } else {
      // Initialize with default state if not found
      this.isHidden = false
      // Note: pluginProfile will be set when showContent is called
      panelStates.leftSidePanel = {
        isHidden: this.isHidden,
        pluginProfile: null
      }
      window.localStorage.setItem('panelStates', JSON.stringify(panelStates))
    }
    // Toggle content
    this.on('menuicons', 'toggleContent', (name) => {
      if (!this.plugins[name]) return

      // If panel is hidden, always show it when any icon is clicked
      if (this.isHidden) {
        this.isHidden = false

        // Immediately remove d-none class for instant visual feedback
        const sidePanel = document.querySelector('#side-panel')
        sidePanel?.classList.remove('d-none')

        // Update localStorage before showing content
        const panelStates = JSON.parse(window.localStorage.getItem('panelStates') || '{}')
        if (!panelStates.leftSidePanel) panelStates.leftSidePanel = {}
        panelStates.leftSidePanel.isHidden = false
        panelStates.leftSidePanel.pluginProfile = this.plugins[name]?.profile
        window.localStorage.setItem('panelStates', JSON.stringify(panelStates))

        trackMatomoEvent(this, { category: 'topbar', action: 'leftSidePanel', name: 'shownOnVerticalIconClick', isClick: false })
        this.showContent(name)
        this.emit('leftSidePanelShown')
        this.events.emit('leftSidePanelShown')
        return
      }

      // Panel is visible - check if plugin is active
      if (this.plugins[name].active) {
        // Plugin is active, so toggling will hide the panel
        this.isHidden = true

        // Immediately add d-none class for instant visual feedback
        const sidePanel = document.querySelector('#side-panel')
        sidePanel?.classList.add('d-none')

        // Update localStorage
        const panelStates = JSON.parse(window.localStorage.getItem('panelStates') || '{}')
        panelStates.leftSidePanel = {
          isHidden: true,
          pluginProfile: this.plugins[name]?.profile
        }
        window.localStorage.setItem('panelStates', JSON.stringify(panelStates))

        trackMatomoEvent(this, { category: 'topbar', action: 'leftSidePanel', name: 'hiddenOnVerticalIconClick', isClick: false })
        // Emit explicit panel state events for proper synchronization
        this.emit('leftSidePanelHidden')
        this.events.emit('leftSidePanelHidden')
        return
      }

      // Plugin is not active, show it
      const panelStates = JSON.parse(window.localStorage.getItem('panelStates') || '{}')
      if (!panelStates.leftSidePanel) panelStates.leftSidePanel = {}
      panelStates.leftSidePanel.isHidden = false
      panelStates.leftSidePanel.pluginProfile = this.plugins[name]?.profile
      window.localStorage.setItem('panelStates', JSON.stringify(panelStates))

      this.showContent(name)
      this.emit('leftSidePanelShown')
      this.events.emit('leftSidePanelShown')
    })
    // Force opening
    this.on('menuicons', 'showContent', (name) => {
      if (!this.plugins[name]) return

      // Read the saved state from localStorage to check if panel should stay hidden
      const panelStates = JSON.parse(window.localStorage.getItem('panelStates') || '{}')
      const savedIsHidden = panelStates.leftSidePanel?.isHidden

      // If panel is currently hidden AND it was intentionally hidden (saved in localStorage),
      // just load content without showing the panel (this happens during initialization)
      if (this.isHidden && savedIsHidden === true) {
        this.showContent(name)
        return
      }

      // Otherwise, force show the panel if it's hidden
      if (this.isHidden) {
        this.isHidden = false

        // Update localStorage
        if (!panelStates.leftSidePanel) panelStates.leftSidePanel = {}
        panelStates.leftSidePanel.isHidden = false
        panelStates.leftSidePanel.pluginProfile = this.plugins[name]?.profile
        window.localStorage.setItem('panelStates', JSON.stringify(panelStates))

        trackMatomoEvent(this, { category: 'topbar', action: 'leftSidePanel', name: 'shownOnForceShowContent', isClick: false })
        this.showContent(name)
        this.emit('leftSidePanelShown')
        this.events.emit('leftSidePanelShown')
      } else {
        // Panel is already visible, just switch content
        this.showContent(name)
      }
    })
  }

  focus(name) {
    this.emit('focusChanged', name)
    super.focus(name)
  }

  removeView(profile) {
    if (this.plugins[profile.name] && this.plugins[profile.name].active) this.call('menuicons', 'select', 'filePanel')
    super.removeView(profile)
    this.renderComponent()
  }

  addView(profile, view) {
    super.addView(profile, view)
    this.call('menuicons', 'linkContent', profile)
    this.renderComponent()
  }

  async pinView (profile) {
    const active = this.currentFocus()
    await this.call('rightSidePanel', 'pinView', profile, this.plugins[profile.name]?.view)
    if (this.plugins[profile.name].active) {
      this.call('menuicons', 'select', 'filePanel')
    }
    if (active === profile.name) this.call('menuicons', 'select', active.length > 1 ? active : 'filePanel')
    super.remove(profile.name)
    this.renderComponent()
  }

  async unPinView (profile, view) {
    const activePlugin = this.currentFocus()
    if (activePlugin === profile.name) throw new Error(`Plugin ${profile.name} already unpinned`)
    this.loggedState = await this.call('pluginStateLogger', 'getPluginState', profile.name)
    super.addView(profile, view)
    this.plugins[activePlugin].active = false
    this.plugins[profile.name].active = true
    if (profile.name !== 'remixaiassistant') {
      this.showContent(profile.name)
    }
    this.emit('focusChanged', profile.name)
    // this.showContent(profile.name)
  }

  /**
   * Display content and update the header
   * @param {String} name The name of the plugin to display
   */
  async showContent(name) {
    super.showContent(name)
    this.emit('focusChanged', name)
    // Save active plugin to panelStates
    const panelStates = JSON.parse(window.localStorage.getItem('panelStates') || '{}')
    if (!panelStates.leftSidePanel) panelStates.leftSidePanel = {}
    panelStates.leftSidePanel.pluginProfile = this.plugins[name]?.profile
    panelStates.leftSidePanel.isHidden = this.isHidden || false
    window.localStorage.setItem('panelStates', JSON.stringify(panelStates))
    this.renderComponent()
  }

  togglePanel() {
    const sidePanel = document.querySelector('#side-panel')
    if (this.isHidden) {
      this.isHidden = false
      sidePanel?.classList.remove('d-none')
      trackMatomoEvent(this, { category: 'topbar', action: 'leftSidePanel', name: 'shownOnToggleIconClick', isClick: false })
      this.emit('leftSidePanelShown')
      this.events.emit('leftSidePanelShown')
    } else {
      this.isHidden = true
      sidePanel?.classList.add('d-none')
      trackMatomoEvent(this, { category: 'topbar', action: 'leftSidePanel', name: 'hiddenOnToggleIconClick', isClick: false })
      this.emit('leftSidePanelHidden')
      this.events.emit('leftSidePanelHidden')
    }
    // Persist the hidden state and active plugin to panelStates
    const panelStates = JSON.parse(window.localStorage.getItem('panelStates') || '{}')
    const activePlugin = this.currentFocus()
    panelStates.leftSidePanel = {
      isHidden: this.isHidden,
      pluginProfile: this.plugins[activePlugin]?.profile
    }
    window.localStorage.setItem('panelStates', JSON.stringify(panelStates))
  }

  isPanelHidden() {
    return this.isHidden
  }

  setDispatch(dispatch: React.Dispatch<any>) {
    this.dispatch = dispatch
  }

  render() {
    return (
      <section className="panel plugin-manager">
        {' '}
        <PluginViewWrapper plugin={this} />
      </section>
    )
  }

  updateComponent(state: any) {
    return <RemixPluginPanel header={<RemixUIPanelHeader plugins={state.plugins} pinView={this.pinView.bind(this)} unPinView={this.unPinView.bind(this)}></RemixUIPanelHeader>} plugins={state.plugins} pluginState={state.pluginState} />
  }

  renderComponent() {
    this.dispatch({
      plugins: this.plugins,
      pluginState: this.loggedState
    })
  }
}
