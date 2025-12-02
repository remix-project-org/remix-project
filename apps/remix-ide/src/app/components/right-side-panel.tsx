// eslint-disable-next-line no-use-before-define
import React from 'react'
import { AbstractPanel } from './panel'
import { PluginRecord, RemixPluginPanel } from '@remix-ui/panel'
import packageJson from '../../../../../package.json'
import { RemixUIPanelHeader } from '@remix-ui/panel'
import { PluginViewWrapper } from '@remix-ui/helper'
import { trackMatomoEvent } from '@remix-api'

const rightSidePanel = {
  name: 'rightSidePanel',
  displayName: 'Right Side Panel',
  description: 'Remix IDE right side panel',
  version: packageJson.version,
  methods: ['addView', 'removeView', 'currentFocus', 'pinView', 'unPinView', 'highlight',
    'getHiddenPlugin', 'togglePanel', 'isPanelHidden'
  ],
  events: []
}

export class RightSidePanel extends AbstractPanel {
  dispatch: React.Dispatch<any> = () => {}
  loggedState: Record<string, any>
  rightSidePanelState: Record<string, any> // pluginProfile, isHidden
  highlightStamp: number
  hiddenPlugin: any
  isHidden: boolean

  constructor() {
    super(rightSidePanel)
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

    // Initialize isHidden state from panelStates in localStorage
    const panelStatesStr = window.localStorage.getItem('panelStates')
    const panelStates = panelStatesStr ? JSON.parse(panelStatesStr) : {}

    if (panelStates.rightSidePanel) {
      // If no plugin profile exists, ensure the panel is hidden
      if (!panelStates.rightSidePanel.pluginProfile) {
        this.isHidden = true
        this.hiddenPlugin = null
      } else {
        this.isHidden = panelStates.rightSidePanel.isHidden || false
        // Apply d-none class to hide the panel on reload if it was hidden
        if (this.isHidden) {
          this.hiddenPlugin = panelStates.rightSidePanel.pluginProfile
        } else {
          this.hiddenPlugin = null
        }
      }

      if (this.isHidden) {
        const pinnedPanel = document.querySelector('#right-side-panel')
        pinnedPanel?.classList.add('d-none')
        trackMatomoEvent(this, { category: 'topbar', action: 'rightSidePanel', name: 'hiddenOnLoad', isClick: false })
        this.emit('rightSidePanelHidden')
        this.events.emit('rightSidePanelHidden')
      }
    } else {
      // Initialize with default state if not found - no plugin pinned means hidden
      this.isHidden = true
      this.hiddenPlugin = null
      // Note: pluginProfile will be set when a plugin is pinned
      panelStates.rightSidePanel = {
        isHidden: this.isHidden,
        pluginProfile: null
      }
      window.localStorage.setItem('panelStates', JSON.stringify(panelStates))
      const pinnedPanel = document.querySelector('#right-side-panel')
      pinnedPanel?.classList.add('d-none')
      trackMatomoEvent(this, { category: 'topbar', action: 'rightSidePanel', name: 'InitializeDefaultAndHiddenOnLoad', isClick: false })
      this.emit('rightSidePanelHidden')
      this.events.emit('rightSidePanelHidden')
    }
  }

  async pinView (profile, view) {
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

    // When pinning a plugin, check if panel was hidden because no plugin was pinned
    const panelStates = JSON.parse(window.localStorage.getItem('panelStates') || '{}')
    const wasHiddenWithNoPlugin = this.isHidden && !panelStates.rightSidePanel?.pluginProfile

    // Show the panel if it was hidden due to no plugin being pinned
    if (wasHiddenWithNoPlugin) {
      const pinnedPanel = document.querySelector('#right-side-panel')
      pinnedPanel?.classList.remove('d-none')
      this.hiddenPlugin = null
      this.isHidden = false
      this.events.emit('rightSidePanelShown')
      this.emit('rightSidePanelShown')
    } else if (this.hiddenPlugin && this.hiddenPlugin.name !== profile.name) {
      // Only show the panel if we're pinning a different plugin than the one that's currently hidden
      const pinnedPanel = document.querySelector('#right-side-panel')
      pinnedPanel?.classList.remove('d-none')
      this.hiddenPlugin = null
      this.isHidden = false
      this.events.emit('rightSidePanelShown')
      this.emit('rightSidePanelShown')
    } else if (this.hiddenPlugin && this.hiddenPlugin.name === profile.name) {
      // If we're pinning the same plugin that was hidden, keep it hidden
      const pinnedPanel = document.querySelector('#right-side-panel')
      pinnedPanel?.classList.add('d-none')
      this.hiddenPlugin = profile
      this.isHidden = true
    }

    if (!this.isHidden && !this.hiddenPlugin) {
      this.events.emit('rightSidePanelShown')
      this.emit('rightSidePanelShown')
    }
    trackMatomoEvent(this, { category: 'topbar', action: 'rightSidePanel', name: 'shownOnPluginPinned', isClick: false })
    // Save pinned plugin profile to panelStates
    const updatedPanelStates = JSON.parse(window.localStorage.getItem('panelStates') || '{}')
    updatedPanelStates.rightSidePanel = {
      isHidden: this.isHidden,
      pluginProfile: profile
    }
    window.localStorage.setItem('panelStates', JSON.stringify(updatedPanelStates))
    this.renderComponent()
    this.events.emit('pinnedPlugin', profile, this.isHidden)
    this.emit('pinnedPlugin', profile, this.isHidden)
  }

  async unPinView (profile) {
    const activePlugin = this.currentFocus()

    if (activePlugin !== profile.name) throw new Error(`Plugin ${profile.name} is not pinned`)
    await this.call('sidePanel', 'unPinView', profile, this.plugins[profile.name].view)
    super.remove(profile.name)
    // Clear hiddenPlugin and set panel to hidden state when no plugin is pinned
    this.hiddenPlugin = null
    this.isHidden = true
    const pinnedPanel = document.querySelector('#right-side-panel')
    pinnedPanel?.classList.add('d-none')
    const panelStates = JSON.parse(window.localStorage.getItem('panelStates') || '{}')
    panelStates.rightSidePanel = {
      isHidden: true,
      pluginProfile: null
    }
    window.localStorage.setItem('panelStates', JSON.stringify(panelStates))
    trackMatomoEvent(this, { category: 'topbar', action: 'rightSidePanel', name: 'hiddenOnPluginUnpinned', isClick: false })
    this.renderComponent()
    this.events.emit('unPinnedPlugin', profile)
    this.emit('unPinnedPlugin', profile)
    this.emit('rightSidePanelHidden')
    this.events.emit('rightSidePanelHidden')
  }

  getHiddenPlugin() {
    return this.hiddenPlugin
  }

  togglePanel () {
    const pinnedPanel = document.querySelector('#right-side-panel')
    // Persist the hidden state to panelStates, preserving pluginProfile
    const panelStates = JSON.parse(window.localStorage.getItem('panelStates') || '{}')
    const currentPlugin = this.currentFocus()
    const pluginProfile = currentPlugin && this.plugins[currentPlugin] ? this.plugins[currentPlugin].profile : null

    // Check if no plugin is pinned
    if (!pluginProfile) {
      this.call('notification', 'toast', 'No plugin pinned on the Right Side Panel.')
      // Ensure the panel is hidden and toggle icon is off
      if (!this.isHidden) {
        this.isHidden = true
        trackMatomoEvent(this, { category: 'topbar', action: 'rightSidePanel', name: 'hiddenOnToggleIconClickAndNoPluginPinned', isClick: false })
        pinnedPanel?.classList.add('d-none')
        this.emit('rightSidePanelHidden')
        this.events.emit('rightSidePanelHidden')
        panelStates.rightSidePanel = {
          isHidden: this.isHidden,
          pluginProfile: null
        }
        window.localStorage.setItem('panelStates', JSON.stringify(panelStates))
        this.renderComponent()
      }
      return
    }

    if (this.isHidden) {
      this.isHidden = false
      pinnedPanel?.classList.remove('d-none')
      trackMatomoEvent(this, { category: 'topbar', action: 'rightSidePanel', name: 'shownOnToggleIconClick', isClick: false })
      this.emit('rightSidePanelShown')
      this.events.emit('rightSidePanelShown')
    } else {
      this.isHidden = true
      this.hiddenPlugin = pluginProfile
      pinnedPanel?.classList.add('d-none')
      trackMatomoEvent(this, { category: 'topbar', action: 'rightSidePanel', name: 'hiddenOnToggleIconClick', isClick: false })
      this.emit('rightSidePanelHidden')
      this.events.emit('rightSidePanelHidden')
    }
    panelStates.rightSidePanel = {
      isHidden: this.isHidden,
      pluginProfile: pluginProfile
    }
    window.localStorage.setItem('panelStates', JSON.stringify(panelStates))
    // Re-render to update the toggle icon
    this.renderComponent()
  }

  isPanelHidden() {
    return this.isHidden
  }

  highlight () {
    // If the right side panel is hidden, unhide it when a pinned icon is clicked
    if (this.isHidden) {
      const pinnedPanel = document.querySelector('#right-side-panel')
      this.isHidden = false
      this.hiddenPlugin = null
      pinnedPanel?.classList.remove('d-none')
      trackMatomoEvent(this, { category: 'topbar', action: 'rightSidePanel', name: 'shownOnVerticalIconClick', isClick: false })
      this.emit('rightSidePanelShown')
      this.events.emit('rightSidePanelShown')

      // Update localStorage
      const panelStates = JSON.parse(window.localStorage.getItem('panelStates') || '{}')
      const currentPlugin = this.currentFocus()
      const pluginProfile = currentPlugin && this.plugins[currentPlugin] ? this.plugins[currentPlugin].profile : null
      panelStates.rightSidePanel = {
        isHidden: false,
        pluginProfile: pluginProfile
      }
      window.localStorage.setItem('panelStates', JSON.stringify(panelStates))
    }

    this.highlightStamp = Date.now()
    this.renderComponent()
  }

  setDispatch (dispatch: React.Dispatch<any>) {
    this.dispatch = dispatch
  }

  render() {
    return (
      <section className='panel right-side-panel'> <PluginViewWrapper plugin={this} /></section>
    )
  }

  updateComponent(state: any) {
    return <RemixPluginPanel header={<RemixUIPanelHeader plugins={state.plugins} pinView={this.pinView.bind(this)} unPinView={this.unPinView.bind(this)} togglePanel={this.togglePanel.bind(this)}></RemixUIPanelHeader>} { ...state } />
  }

  renderComponent() {
    this.dispatch({
      plugins: this.plugins,
      pluginState: this.loggedState,
      highlightStamp: this.highlightStamp
    })
  }
}
