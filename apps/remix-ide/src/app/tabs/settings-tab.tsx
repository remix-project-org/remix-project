/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react' // eslint-disable-line
import { ViewPlugin } from '@remixproject/engine-web'
import * as packageJson from '../../../../../package.json'
import { RemixUiSettings } from '@remix-ui/settings' //eslint-disable-line
import { Registry } from '@remix-project/remix-lib'
import { PluginViewWrapper } from '@remix-ui/helper'
import { InitializationPattern, TrackingMode, MatomoState, CustomRemixApi } from '@remix-api'

const profile = {
  name: 'settings',
  displayName: 'Settings',
  methods: ['get', 'updateCopilotChoice', 'getCopilotSetting', 'set', 'updateMatomoPerfAnalyticsChoice'],
  events: [],
  icon: 'assets/img/settings.webp',
  description: 'Remix-IDE settings',
  kind: 'settings',
  location: 'mainPanel',
  documentation: 'https://remix-ide.readthedocs.io/en/latest/settings.html',
  version: packageJson.version,
  permission: true,
  maintainedBy: 'Remix',
  show: false
}

export default class SettingsTab extends ViewPlugin {
  config: any = {}
  editor: any

  // Type-safe method for Matomo plugin calls
  private async callMatomo<K extends keyof CustomRemixApi['matomo']['methods']>(
    method: K,
    ...args: Parameters<CustomRemixApi['matomo']['methods'][K]>
  ): Promise<ReturnType<CustomRemixApi['matomo']['methods'][K]>> {
    return await this.call('matomo', method, ...args)
  }
  private _deps: {
    themeModule: any
  }
  element: HTMLDivElement
  public useMatomoAnalytics: any
  public useMatomoPerfAnalytics: boolean
  dispatch: React.Dispatch<any> = () => { }
  constructor(config, editor) {
    super(profile)
    this.config = config
    this.config.events.on('configChanged', (changedConfig) => {
      this.emit('configChanged', changedConfig)
    })
    this.editor = editor
    this._deps = {
      themeModule: Registry.getInstance().get('themeModule').api,
    }
    this.element = document.createElement('div')
    this.element.setAttribute('id', 'settingsTab')
    this.useMatomoAnalytics = null
    this.useMatomoPerfAnalytics = null
  }

  setDispatch(dispatch: React.Dispatch<any>) {
    this.dispatch = dispatch
    this.renderComponent()
  }

  onActivation(): void {
  }

  render() {
    return (
      <div id="settingsTab" className="bg-light overflow-hidden">
        <PluginViewWrapper plugin={this} />
      </div>
    )
  }

  updateComponent(state: any) {
    return (
      <RemixUiSettings
        plugin={this}
        config={state.config}
        editor={state.editor}
        _deps={state._deps}
        useMatomoPerfAnalytics={state.useMatomoPerfAnalytics}
        useCopilot={state.useCopilot}
        themeModule={state._deps.themeModule}
      />
    )
  }

  renderComponent() {
    this.dispatch(this)
  }

  get(key) {
    return this.config.get(key)
  }

  set(key, value){
    this.config.set(key, value)
  }

  updateCopilotChoice(isChecked) {
    this.config.set('settings/copilot/suggest/activate', isChecked)
    this.emit('copilotChoiceUpdated', isChecked)
    this.dispatch({
      ...this
    })
  }

  getCopilotSetting() {
    return this.get('settings/copilot/suggest/activate')
  }

  async updateMatomoPerfAnalyticsChoice(isChecked) {
    console.log('[Matomo][settings] updateMatomoPerfAnalyticsChoice called with', isChecked)
    this.config.set('settings/matomo-perf-analytics', isChecked)
    // Timestamp consent indicator (we treat enabling perf as granting cookie consent; disabling as revoking)
    localStorage.setItem('matomo-analytics-consent', Date.now().toString())
    this.useMatomoPerfAnalytics = isChecked

    const mode: TrackingMode = isChecked ? 'cookie' : 'anonymous'
    const matomoState = await this.callMatomo('getState')
    if (matomoState.initialized == false) {
      const pattern: InitializationPattern = isChecked ? "immediate" : "anonymous"
      await this.callMatomo('initialize', pattern)
      console.log('[Matomo][settings] Matomo initialized with mode', pattern)
      await this.callMatomo('processPreInitQueue')
    } else {
      await this.callMatomo('switchMode', mode)
    }

    this.useMatomoAnalytics = true
    this.emit('matomoPerfAnalyticsChoiceUpdated', isChecked);
    this.dispatch({ ...this })
  }

}
