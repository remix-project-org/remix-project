/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react' // eslint-disable-line
import { ViewPlugin } from '@remixproject/engine-web'
import * as packageJson from '../../../../../package.json'
import {RemixUiSettings} from '@remix-ui/settings' //eslint-disable-line
import { Registry } from '@remix-project/remix-lib'
import { PluginViewWrapper } from '@remix-ui/helper'
declare global {
  interface Window {
    _paq: any
  }
}
const _paq = (window._paq = window._paq || [])

const profile = {
  name: 'settings',
  displayName: 'Settings',
  methods: ['get', 'updateCopilotChoice', 'getCopilotSetting', 'updateMatomoPerfAnalyticsChoice'],
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
  private _deps: {
    themeModule: any
  }
  element: HTMLDivElement
  public useMatomoAnalytics: any
  public useMatomoPerfAnalytics: boolean
  dispatch: React.Dispatch<any> = () => {}
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

  updateCopilotChoice(isChecked) {
    this.config.set('settings/copilot/suggest/activate', isChecked)
    this.emit('copilotChoiceUpdated', isChecked)
    this.dispatch({
      ...this
    })
  }

  getCopilotSetting(){
    return this.get('settings/copilot/suggest/activate')
  }

  updateMatomoAnalyticsChoice(isChecked) {
    this.config.set('settings/matomo-analytics', isChecked)
    // set timestamp to local storage to track when the user has given consent
    localStorage.setItem('matomo-analytics-consent', Date.now().toString())
    this.useMatomoAnalytics = isChecked
    if (!isChecked) {
      // revoke tracking consent
      _paq.push(['forgetConsentGiven']);
    } else {
      // user has given consent to process their data
      _paq.push(['setConsentGiven']);
    }
    this.dispatch({
      ...this
    })
  }

  updateMatomoPerfAnalyticsChoice(isChecked) {
    this.config.set('settings/matomo-perf-analytics', isChecked)
    // set timestamp to local storage to track when the user has given consent
    localStorage.setItem('matomo-analytics-consent', Date.now().toString())
    this.useMatomoPerfAnalytics = isChecked
    this.emit('matomoPerfAnalyticsChoiceUpdated', isChecked)
    if (!isChecked) {
      // revoke tracking consent for performance data
      _paq.push(['disableCookies'])
    } else {
      // user has given consent to process their performance data
      _paq.push(['setCookieConsentGiven'])
    }
    this.dispatch({
      ...this
    })
  }
}
