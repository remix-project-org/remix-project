// eslint-disable-next-line no-use-before-define
import React from 'react'
import packageJson from '../../../../../package.json'
import { Plugin } from '@remixproject/engine'
import { EventEmitter } from 'events'
import { IconRecord, RemixUiVerticalIconsPanel } from '@remix-ui/vertical-icons-panel'
import { Profile } from '@remixproject/plugin-utils'
import { PluginViewWrapper } from '@remix-ui/helper'
import { profile as quickDappProfile } from '../plugins/quick-dapp-v2'

const profile = {
  name: 'menuicons',
  displayName: 'Vertical Icons',
  description: 'Remix IDE vertical icons',
  version: packageJson.version,
  methods: ['select', 'unlinkContent', 'linkContent', 'activateAndSelect', 'getPluginState', 'toggle'],
  events: ['toggleContent', 'showContent']
}

export class VerticalIcons extends Plugin {
  events: EventEmitter
  htmlElement: HTMLDivElement
  icons: Record<string, IconRecord> = {}
  dispatch: React.Dispatch<any> = () => {}
  pendingPinnedPlugin: any = null
  rightPanelHidden = false
  leftPanelHidden = false
  constructor() {
    super(profile)
    this.events = new EventEmitter()
    this.htmlElement = document.createElement('div')
    this.htmlElement.setAttribute('id', 'icon-panel')
  }

  renderComponent() {
    // These three icons must always appear last, in this order, no matter what.
    const lastOrder = ['helpPlugin', 'planManager']
    const fixedOrder = ['remixaiassistant', 'filePanel', 'search', 'solidity', 'udapp', 'debugger', 'solidityStaticAnalysis', 'solidityUnitTesting', 'quick-dapp-v2']

    const divived = Object.values(this.icons)
      .map((value) => {
        return {
          ...value,
          isRequired: fixedOrder.indexOf(value.profile.name) > -1,
          isLast: lastOrder.indexOf(value.profile.name) > -1
        }
      })
      .sort((a, b) => {
        return a.timestamp - b.timestamp
      })

    const required = divived
      .filter((value) => value.isRequired)
      .sort((a, b) => {
        return fixedOrder.indexOf(a.profile.name) - fixedOrder.indexOf(b.profile.name)
      })

    const last = divived
      .filter((value) => value.isLast)
      .sort((a, b) => {
        return lastOrder.indexOf(a.profile.name) - lastOrder.indexOf(b.profile.name)
      })

    const sorted: IconRecord[] = [
      ...required,
      ...divived.filter((value) => {
        return !value.isRequired && !value.isLast
      }),
      ...last
    ]

    this.dispatch({
      verticalIconsPlugin: this,
      icons: sorted,
      rightPanelHidden: this.rightPanelHidden,
      leftPanelHidden: this.leftPanelHidden
    })
  }

  setDispatch(dispatch: React.Dispatch<any>) {
    this.dispatch = dispatch
  }

  onActivation() {
    this.renderComponent()
    // quick-dapp-v2 lives in the mainPanel (it's a tab, not a sidePanel view) so it never
    // goes through sidePanel.addView -> menuicons.linkContent like other icons do. Register
    // it here so it still gets a rail icon; the icon's click handler activates/focuses the tab.
    this.linkContent(quickDappProfile)
    this.on('sidePanel', 'focusChanged', (name: string) => {
      Object.keys(this.icons).map((o) => {
        this.icons[o].active = false
      })

      if (this.icons[name]) {
        this.icons[name].active = true
      }
      this.renderComponent()
    })

    // same reasoning as rightSidePanel below: "active" only reflects which plugin was last
    // focused, not whether the panel is actually visible — closing it via its own icon
    // shouldn't leave that icon's highlight behind
    this.on('sidePanel', 'leftSidePanelShown', () => {
      this.leftPanelHidden = false
      this.renderComponent()
    })
    this.on('sidePanel', 'leftSidePanelHidden', () => {
      this.leftPanelHidden = true
      this.renderComponent()
    })

    // mainPanel plugins (currently just quick-dapp-v2) are tabs, not sidePanel views, so their
    // "active" state tracks which tab is focused instead of sidePanel's focusChanged. Scoped to
    // location === 'mainPanel' only, so this never touches sidePanel/rightSidePanel icons.
    this.on('tabs', 'switchApp', (name: string) => {
      let changed = false
      Object.keys(this.icons).forEach((key) => {
        if ((this.icons[key].profile as any).location === 'mainPanel') {
          const active = key === name
          if (this.icons[key].active !== active) changed = true
          this.icons[key].active = active
        }
      })
      if (changed) this.renderComponent()
    })

    this.on('rightSidePanel', 'pinnedPlugin', (profile) => {
      if (this.icons[profile.name]) {
        Object.keys(this.icons).map((icon) => {
          if (this.icons[icon].profile.name === profile.name) {
            this.icons[icon].pinned = true
          } else {
            this.icons[icon].pinned = false
          }
        })
        this.renderComponent()
      } else {
        // Icon doesn't exist yet, store for when it's created
        this.pendingPinnedPlugin = profile
      }
    })

    this.on('rightSidePanel', 'unPinnedPlugin', (profile) => {
      if (this.icons[profile.name]) {
        this.icons[profile.name].pinned = false
      }
      this.renderComponent()
    })

    // whichever plugin is pinned to rightSidePanel only reads as "active" while that panel
    // is actually visible — collapsing/hiding it shouldn't leave a stale highlight behind
    this.on('rightSidePanel', 'rightSidePanelShown', () => {
      this.rightPanelHidden = false
      this.renderComponent()
    })
    this.on('rightSidePanel', 'rightSidePanelRestored', () => {
      this.rightPanelHidden = false
      this.renderComponent()
    })
    this.on('rightSidePanel', 'rightSidePanelHidden', () => {
      this.rightPanelHidden = true
      this.renderComponent()
    })
  }

  async getPluginState (pluginName: string) {
    return this.icons && this.icons[pluginName]
  }

  async linkContent(profile: Profile) {
    if (!profile.icon) return
    if (!profile.kind) profile.kind = 'none'

    // Check if this plugin is pinned on the right side panel from localStorage
    let isPinned = false
    try {
      const panelStatesStr = window.localStorage.getItem('panelStates')
      if (panelStatesStr) {
        const panelStates = JSON.parse(panelStatesStr)
        if (panelStates.rightSidePanel && panelStates.rightSidePanel.pluginProfile) {
          isPinned = panelStates.rightSidePanel.pluginProfile.name === profile.name
        }
      }
    } catch (e) {
      isPinned = false
    }

    const canbeDeactivated = await this.call('manager', 'canDeactivate', this.profile, profile)

    // Apply pending pinnedPlugin event if it matches this profile
    if (this.pendingPinnedPlugin && this.pendingPinnedPlugin.name === profile.name) {
      isPinned = true
      Object.keys(this.icons).forEach((icon) => {
        this.icons[icon].pinned = false
      })
      this.pendingPinnedPlugin = null
    }

    this.icons[profile.name] = {
      profile: profile,
      active: false,
      pinned: isPinned,
      canbeDeactivated: canbeDeactivated,
      timestamp: Date.now()
    }
    this.renderComponent()
  }

  unlinkContent(profile: Profile) {
    // quick-dapp-v2's icon is manually pinned in onActivation (see linkContent(quickDappProfile)
    // above) since it's a mainPanel tab, not a sidePanel view — closing its tab still runs
    // through the normal removeView -> unlinkContent flow, but the icon should stay in the
    // rail regardless, just no longer "active"
    if (profile.name === quickDappProfile.name) {
      if (this.icons[profile.name]) this.icons[profile.name].active = false
      this.renderComponent()
      return
    }
    delete this.icons[profile.name]
    this.renderComponent()
  }

  async activateHome() {
    await this.call('manager', 'activatePlugin', 'home')
    await this.call('tabs', 'focus', 'home')
  }

  /**
   * Set an icon as active
   * @param {string} name Name of profile of the module to activate
   */
  select(name: string) {
    // TODO: Only keep `this.emit` (issue#2210)
    this.emit('showContent', name)
    this.events.emit('showContent', name)
  }

  async activateAndSelect(name: string) {
    // Check if the plugin is pinned on the right side panel
    // Use localStorage as source of truth since iconRecord.pinned might be out of sync
    let isPinnedOnRightPanel = this.icons[name] && this.icons[name].pinned

    // Also check localStorage if iconRecord says not pinned
    if (!isPinnedOnRightPanel) {
      try {
        const panelStatesStr = window.localStorage.getItem('panelStates')
        if (panelStatesStr) {
          const panelStates = JSON.parse(panelStatesStr)
          isPinnedOnRightPanel = panelStates.rightSidePanel?.pluginProfile?.name === name
        }
      } catch (e) {
        console.error('Error checking localStorage:', e)
      }
    }

    if (isPinnedOnRightPanel) {
      // For pinned plugins, ensure rightSidePanel is active and show it
      try {
        const isRightSidePanelActive = await this.call('manager', 'isActive', 'rightSidePanel')
        if (!isRightSidePanelActive) {
          // Activate rightSidePanel and wait for activation to complete
          await this.call('manager', 'activatePlugin', 'rightSidePanel')
          // Wait a bit for the plugin to fully activate
          await new Promise(resolve => setTimeout(resolve, 100))
        }
        // Show the plugin on the right side panel
        await this.call('rightSidePanel', 'highlight')
      } catch (error) {
        console.error('Error activating right side panel:', error)
        // Fallback: directly manipulate DOM if plugin system fails
        const pinnedPanel = document.querySelector('#right-side-panel')
        pinnedPanel?.classList.remove('d-none')
      }
    } else {
      // For left panel plugins, activate if needed and show
      const isActive = await this.call('manager', 'isActive', name)
      if (!isActive) {
        await this.call('manager', 'activatePlugin', name)
      }
      this.select(name)
    }
  }

  /**
   * Toggles the side panel for plugin
   * @param {string} name Name of profile of the module to activate
   */
  async toggle(name: string) {
    // Check if this plugin is actually pinned on the right side panel
    // This handles cases where iconRecord.pinned state is out of sync
    try {
      const panelStatesStr = window.localStorage.getItem('panelStates')
      if (panelStatesStr) {
        const panelStates = JSON.parse(panelStatesStr)
        if (panelStates.rightSidePanel?.pluginProfile?.name === name) {
          // Plugin is pinned on right side panel, use activateAndSelect
          await this.activateAndSelect(name)
          return
        }
      }
    } catch (e) {
      console.error('Error checking pinned state:', e)
    }

    // Not pinned, use normal toggle for left panel
    this.emit('toggleContent', name)
    this.events.emit('toggleContent', name)
  }

  updateComponent(state: any) {
    return <RemixUiVerticalIconsPanel verticalIconsPlugin={state.verticalIconsPlugin} icons={state.icons} rightPanelHidden={state.rightPanelHidden} leftPanelHidden={state.leftPanelHidden} />
  }

  render() {
    return (
      <div id="icon-panel">
        <PluginViewWrapper plugin={this} />
      </div>
    )
  }
}
