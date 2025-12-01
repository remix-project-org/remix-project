// eslint-disable-next-line no-use-before-define
import React from 'react'
import packageJson from '../../../../../package.json'
import { Plugin } from '@remixproject/engine'
import { EventEmitter } from 'events'
import { IconRecord, RemixUiVerticalIconsPanel } from '@remix-ui/vertical-icons-panel'
import { Profile } from '@remixproject/plugin-utils'
import { PluginViewWrapper } from '@remix-ui/helper'

const profile = {
  name: 'menuicons',
  displayName: 'Vertical Icons',
  description: 'Remix IDE vertical icons',
  version: packageJson.version,
  methods: ['select', 'unlinkContent', 'linkContent', 'activateAndSelect'],
  events: ['toggleContent', 'showContent']
}

export class VerticalIcons extends Plugin {
  events: EventEmitter
  htmlElement: HTMLDivElement
  icons: Record<string, IconRecord> = {}
  dispatch: React.Dispatch<any> = () => {}
  constructor() {
    super(profile)
    this.events = new EventEmitter()
    this.htmlElement = document.createElement('div')
    this.htmlElement.setAttribute('id', 'icon-panel')
  }

  renderComponent() {
    const fixedOrder = ['remixaiassistant', 'filePanel', 'search', 'solidity', 'udapp', 'debugger', 'solidityStaticAnalysis', 'solidityUnitTesting', 'pluginManager']

    const divived = Object.values(this.icons)
      .map((value) => {
        return {
          ...value,
          isRequired: fixedOrder.indexOf(value.profile.name) > -1
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

    const sorted: IconRecord[] = [
      ...required,
      ...divived.filter((value) => {
        return !value.isRequired
      })
    ]

    this.dispatch({
      verticalIconsPlugin: this,
      icons: sorted
    })
  }

  setDispatch(dispatch: React.Dispatch<any>) {
    this.dispatch = dispatch
  }

  onActivation() {
    this.renderComponent()
    this.on('sidePanel', 'focusChanged', (name: string) => {
      Object.keys(this.icons).map((o) => {
        this.icons[o].active = false
      })

      if (this.icons[name]) {
        this.icons[name].active = true
      }
      this.renderComponent()
    })

    this.on('rightSidePanel', 'pinnedPlugin', (profile) => {
      Object.keys(this.icons).map((icon) => {
        if (this.icons[icon].profile.name === profile.name) {
          this.icons[icon].pinned = true
        } else {
          this.icons[icon].pinned = false
        }
      })
      this.renderComponent()
    })

    this.on('rightSidePanel', 'unPinnedPlugin', (profile) => {
      if (this.icons[profile.name]) this.icons[profile.name].pinned = false
      this.renderComponent()
    })
  }

  async linkContent(profile: Profile) {
    if (!profile.icon) return
    if (!profile.kind) profile.kind = 'none'
    this.icons[profile.name] = {
      profile: profile,
      active: false,
      pinned: false,
      canbeDeactivated: await this.call('manager', 'canDeactivate', this.profile, profile),
      timestamp: Date.now()
    }
    this.renderComponent()
  }

  unlinkContent(profile: Profile) {
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
    const isActive = await this.call('manager', 'isActive', name)

    if (!isActive) {
      await this.call('manager', 'activatePlugin', name)
    }
    this.select(name)
  }

  /**
   * Toggles the side panel for plugin
   * @param {string} name Name of profile of the module to activate
   */
  toggle(name: string) {
    // TODO: Only keep `this.emit` (issue#2210)
    this.emit('toggleContent', name)
    this.events.emit('toggleContent', name)
  }

  updateComponent(state: any) {
    return <RemixUiVerticalIconsPanel verticalIconsPlugin={state.verticalIconsPlugin} icons={state.icons} />
  }

  render() {
    return (
      <div id="icon-panel">
        <PluginViewWrapper plugin={this} />
      </div>
    )
  }
}
