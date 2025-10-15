import { ViewPlugin } from '@remixproject/engine-web'
import React from 'react' // eslint-disable-line
import { RemixUiPluginManager } from '@remix-ui/plugin-manager' // eslint-disable-line
import * as packageJson from '../../../../../package.json'
import { PluginViewWrapper } from '@remix-ui/helper'
import { trackMatomoEvent } from '@remix-api'
import { Profile } from '@remixproject/plugin-utils'
import { RemixAppManager } from '../../remixAppManager'
import { RemixEngine } from '../../remixEngine'

const profile = {
  name: 'pluginManager',
  displayName: 'Plugin manager',
  methods: [],
  events: [],
  icon: 'assets/img/pluginManager.webp',
  description: 'Start/stop services, modules and plugins',
  kind: 'settings',
  location: 'sidePanel',
  documentation: 'https://remix-ide.readthedocs.io/en/latest/plugin_manager.html',
  version: packageJson.version,
  maintainedBy: "Remix"
}

export class PluginManagerComponent extends ViewPlugin {
  appManager: RemixAppManager
  engine: RemixEngine
  htmlElement: HTMLDivElement
  filter: string
  activePlugins: Profile[]
  inactivePlugins: Profile[]
  activeProfiles: string[]
  dispatch: (state: unknown) => void | null
  private _paq: string[] | string
  constructor (appManager: RemixAppManager, engine: RemixEngine) {
    super(profile)
    this.appManager = appManager
    this.engine = engine
    this.htmlElement = document.createElement('div')
    this.htmlElement.setAttribute('id', 'pluginManager')
    this.filter = ''

    this.activePlugins = []
    this.inactivePlugins = []
    this.activeProfiles = this.appManager.actives
    this.dispatch = null
    this.listenOnEvent()
  }

  /**
   * Checks and returns true or false if plugin name
   * passed in exists in the actives string array in
   * RemixAppManager
   * @param {string} name name of Plugin
   */
  isActive = (name) =>{
    return this.appManager.actives.includes(name)
  }

  /**
   * Delegates to method activatePlugin in
   * RemixAppManager to enable plugin activation
   * @param {string} name name of Plugin
   */
  activateP = (name) => {
    this.appManager.activatePlugin(name)
    trackMatomoEvent(this, { category: 'manager', action: 'activate', name: name, isClick: true })
  }

  /**
   * Takes the name of a local plugin and does both
   * activation and registration
   * @param {Profile} pluginName
   * @returns {void}
   */
  activateAndRegisterLocalPlugin = async (localPlugin) => {
    if (localPlugin) {
      this.engine.register(localPlugin)
      this.appManager.activatePlugin(localPlugin.profile.name)
      this.getAndFilterPlugins()
      localStorage.setItem('plugins/local', JSON.stringify(localPlugin.profile))
    }
  }

  /**
   * Calls and triggers the event deactivatePlugin
   * with with manager permission passing in the name
   * of the plugin
   * @param {string} name name of Plugin
   */
  deactivateP = (name) => {
    this.call('manager', 'deactivatePlugin', name)
    trackMatomoEvent(this, { category: 'manager', action: 'deactivate', name: name, isClick: true })
  }

  setDispatch (dispatch) {
    this.dispatch = dispatch
    this.renderComponent()
  }

  updateComponent(state){
    return <RemixUiPluginManager pluginComponent={state} />
  }

  renderComponent () {
    if (this.dispatch) this.dispatch({ ...this, activePlugins: this.activePlugins, inactivePlugins: this.inactivePlugins })
  }

  render () {
    return (
      <div id='pluginManager'><PluginViewWrapper plugin={this} /></div>
    );

  }

  getAndFilterPlugins = (filter: string= '') => {
    this.filter = typeof filter === 'string' ? filter.toLowerCase() : this.filter
    const isFiltered = (profile) => (profile.displayName + profile.name + profile.description).toLowerCase().includes(this.filter)
    const isNotRequired = (profile) => !this.appManager.isRequired(profile.name)
    const isNotDependent = (profile) => !this.appManager.isDependent(profile.name)
    const isNotHome = (profile) => profile.name !== 'home'
    const sortByName = (profileA, profileB) => {
      const nameA = ((profileA.displayName) ? profileA.displayName : profileA.name).toUpperCase()
      const nameB = ((profileB.displayName) ? profileB.displayName : profileB.name).toUpperCase()
      return (nameA < nameB) ? -1 : (nameA > nameB) ? 1 : 0
    }
    const activatedPlugins = []
    const deactivatedPlugins = []
    const tempArray = this.appManager.getAll()
      .filter(isFiltered)
      .filter(isNotRequired)
      .filter(isNotDependent)
      .filter(isNotHome)
      .sort(sortByName)

    tempArray.forEach(profile => {
      if (this.appManager.actives.includes(profile.name)) {
        activatedPlugins.push(profile)
      } else {
        deactivatedPlugins.push(profile)
      }
    })
    this.activePlugins = activatedPlugins
    this.inactivePlugins = deactivatedPlugins
    this.renderComponent()
  }

  listenOnEvent () {
    this.engine.event.on('onRegistration', () => this.getAndFilterPlugins())
    this.appManager.event.on('activate', () => {
      this.getAndFilterPlugins()
    })
    this.appManager.event.on('deactivate', () => {
      this.getAndFilterPlugins()
    })
  }
}
