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
    'getHiddenPlugin', 'togglePanel', 'isPanelHidden', 'maximizePanel'
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
  isMaximized: boolean
  maximizedState: { leftPanelHidden: boolean, terminalPanelHidden: boolean }

  constructor() {
    super(rightSidePanel)
    this.isHidden = true
    this.hiddenPlugin = null
    this.isMaximized = false
    this.maximizedState = { leftPanelHidden: false, terminalPanelHidden: false }
  }

  async onActivation() {
    this.renderComponent()

    // Restore pinned plugin from localStorage if panel was previously deactivated
    const panelStatesStr = window.localStorage.getItem('panelStates')
    const panelStates = panelStatesStr ? JSON.parse(panelStatesStr) : {}
    if (panelStates.rightSidePanel?.pluginProfile) {
      const profile = panelStates.rightSidePanel.pluginProfile
      // Check if the plugin view needs to be restored
      if (!this.plugins[profile.name]) {
        try {
          // The plugin should already be activated, just need to get its view
          const isActive = await this.call('manager', 'isActive', profile.name)
          if (isActive) {
            // Plugin is active, get its view and add it to the panel
            // Note: The view will be added via the normal plugin activation flow
            // This ensures the panel knows about the pinned plugin
          }
        } catch (e) {
          console.warn('Could not restore pinned plugin on rightSidePanel activation:', e)
        }
      }
    }

    this.on('sidePanel', 'pluginDisabled', (name) => {
      if (this.plugins[name] && this.plugins[name].active) {
        this.emit('unPinnedPlugin', name)
        this.events.emit('unPinnedPlugin', name)
        super.remove(name)
      }
    })

    // Listen for terminal panel being shown - auto-restore right panel if maximized
    this.on('terminal', 'terminalPanelShown', () => {
      if (this.isMaximized) {
        this.maximizePanel() // This will toggle and restore the panel
      }
    })

    // Listen for file changes - auto-restore right panel if maximized when main panel is used
    this.on('fileManager', 'currentFileChanged', () => {
      if (this.isMaximized) {
        this.maximizePanel() // This will toggle and restore the panel
      }
    })

    // Listen for tab/app switches - auto-restore right panel if maximized (includes home tab, file tabs, etc.)
    this.on('tabs', 'switchApp', () => {
      if (this.isMaximized) {
        this.maximizePanel() // This will toggle and restore the panel
      }
    })

    // Initialize isHidden state from panelStates in localStorage
    // Reuse panelStates from earlier in the function
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

      // Sync DOM state with localStorage state
      const pinnedPanel = document.querySelector('#right-side-panel')
      if (this.isHidden) {
        pinnedPanel?.classList.add('d-none')
        trackMatomoEvent(this, { category: 'topbar', action: 'rightSidePanel', name: 'hiddenOnLoad', isClick: false })
        this.emit('rightSidePanelHidden')
        this.events.emit('rightSidePanelHidden')
      } else {
        // Explicitly remove d-none class when panel should be visible
        pinnedPanel?.classList.remove('d-none')
        if (panelStates.rightSidePanel.pluginProfile) {
          trackMatomoEvent(this, { category: 'topbar', action: 'rightSidePanel', name: 'shownOnLoad', isClick: false })
          this.emit('rightSidePanelShown')
          this.events.emit('rightSidePanelShown')
        }
      }

      // Notify vertical-icons about the pinned plugin on load
      if (panelStates.rightSidePanel.pluginProfile) {
        this.events.emit('pinnedPlugin', panelStates.rightSidePanel.pluginProfile, this.isHidden)
        this.emit('pinnedPlugin', panelStates.rightSidePanel.pluginProfile, this.isHidden)
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

    // Determine if we should show the panel when pinning
    const pinnedPanel = document.querySelector('#right-side-panel')

    // Keep panel hidden only if we're re-pinning the exact same plugin that was explicitly hidden
    const shouldStayHidden = this.isHidden && this.hiddenPlugin && this.hiddenPlugin.name === profile.name

    if (shouldStayHidden) {
      // Keep the panel hidden for the same plugin
      pinnedPanel?.classList.add('d-none')
      this.hiddenPlugin = profile
      this.isHidden = true
    } else {
      // Show the panel for any new plugin or when switching plugins
      pinnedPanel?.classList.remove('d-none')
      this.hiddenPlugin = null
      this.isHidden = false
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

    // If the panel is maximized, restore left and main panels but not terminal
    if (this.isMaximized) {
      const leftPanelHidden = await this.call('sidePanel', 'isPanelHidden')

      // Restore left panel if it was visible before maximizing
      if (!this.maximizedState.leftPanelHidden && leftPanelHidden) {
        await this.call('sidePanel', 'togglePanel')
      }

      // Show main panel
      const mainPanel = document.querySelector('#main-panel')
      mainPanel?.classList.remove('d-none')

      // Remove full width from right panel
      const rightPanel = document.querySelector('#right-side-panel')
      rightPanel?.classList.remove('right-panel-maximized')

      this.isMaximized = false
      trackMatomoEvent(this, { category: 'topbar', action: 'rightSidePanel', name: 'restoredOnUnpin', isClick: false })
      this.emit('rightSidePanelRestored')
      this.events.emit('rightSidePanelRestored')
    }

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

  async togglePanel () {
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
      // If the panel is maximized, restore all panels before hiding
      if (this.isMaximized) {
        await this.maximizePanel() // This will toggle and restore the panels
      }

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

  async maximizePanel() {
    if (!this.isMaximized) {
      // Store the current state of panels before maximizing
      const leftPanelHidden = await this.call('sidePanel', 'isPanelHidden')
      const terminalPanelHidden = await this.call('terminal', 'isPanelHidden')

      this.maximizedState = { leftPanelHidden, terminalPanelHidden }

      // Hide left panel if it's visible
      if (!leftPanelHidden) {
        await this.call('sidePanel', 'togglePanel')
      }

      // Hide terminal panel if it's visible
      if (!terminalPanelHidden) {
        await this.call('terminal', 'togglePanel')
      }

      // Hide main panel (center panel with editor)
      const mainPanel = document.querySelector('#main-panel')
      mainPanel?.classList.add('d-none')

      // Make right panel take full width
      const rightPanel = document.querySelector('#right-side-panel')
      rightPanel?.classList.add('right-panel-maximized')

      this.isMaximized = true
      trackMatomoEvent(this, { category: 'topbar', action: 'rightSidePanel', name: 'maximized', isClick: false })
      this.emit('rightSidePanelMaximized')
      this.events.emit('rightSidePanelMaximized')
    } else {
      // Restore panels to their previous state
      const leftPanelHidden = await this.call('sidePanel', 'isPanelHidden')
      const terminalPanelHidden = await this.call('terminal', 'isPanelHidden')

      // Restore left panel if it was visible before maximizing
      if (!this.maximizedState.leftPanelHidden && leftPanelHidden) {
        await this.call('sidePanel', 'togglePanel')
      }

      // Restore terminal panel if it was visible before maximizing
      if (!this.maximizedState.terminalPanelHidden && terminalPanelHidden) {
        await this.call('terminal', 'togglePanel')
      }

      // Show main panel
      const mainPanel = document.querySelector('#main-panel')
      mainPanel?.classList.remove('d-none')

      // Remove full width from right panel
      const rightPanel = document.querySelector('#right-side-panel')
      rightPanel?.classList.remove('right-panel-maximized')

      this.isMaximized = false
      trackMatomoEvent(this, { category: 'topbar', action: 'rightSidePanel', name: 'restored', isClick: false })
      this.emit('rightSidePanelRestored')
      this.events.emit('rightSidePanelRestored')
    }

    this.renderComponent()
  }

  highlight () {
    // If the right side panel is hidden, unhide it when a pinned icon is clicked
    const pinnedPanel = document.querySelector('#right-side-panel')
    const isPanelHiddenInDOM = pinnedPanel?.classList.contains('d-none')

    // Check both the state variable and actual DOM state to ensure proper visibility
    if (this.isHidden || isPanelHiddenInDOM) {
      this.isHidden = false
      this.hiddenPlugin = null
      pinnedPanel?.classList.remove('d-none')
      trackMatomoEvent(this, { category: 'topbar', action: 'rightSidePanel', name: 'shownOnVerticalIconClick', isClick: false })
      this.emit('rightSidePanelShown')
      this.events.emit('rightSidePanelShown')

      // Update localStorage
      const panelStates = JSON.parse(window.localStorage.getItem('panelStates') || '{}')
      const currentPlugin = this.currentFocus()

      // If no plugin in panel yet, try to get from localStorage
      let pluginProfile = currentPlugin && this.plugins[currentPlugin] ? this.plugins[currentPlugin].profile : null
      if (!pluginProfile && panelStates.rightSidePanel?.pluginProfile) {
        pluginProfile = panelStates.rightSidePanel.pluginProfile
      }

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
    return <RemixPluginPanel header={<RemixUIPanelHeader sourcePlugin={this} plugins={state.plugins} pinView={this.pinView.bind(this)} unPinView={this.unPinView.bind(this)} togglePanel={this.togglePanel.bind(this)} maximizePanel={this.maximizePanel.bind(this)} isMaximized={this.isMaximized}></RemixUIPanelHeader>} { ...state } />
  }

  renderComponent() {
    this.dispatch({
      plugins: this.plugins,
      pluginState: this.loggedState,
      highlightStamp: this.highlightStamp
    })
  }
}
