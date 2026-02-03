import React from 'react'
import { AbstractPanel } from './panel'
import { PluginRecord, RemixPluginPanel } from '@remix-ui/panel'
import packageJson from '../../../../../package.json'
import { PluginViewWrapper } from '@remix-ui/helper'
import { EventEmitter } from 'events'
import { AppAction, appActionTypes, AppState } from '@remix-ui/app'

const profile = {
  name: 'overlay',
  displayName: 'Overlay Panel',
  description: 'Remix IDE overlay panel for full-screen plugin views',
  version: packageJson.version,
  events: ['overlayOpened', 'overlayClosed'],
  methods: ['addView', 'removeView', 'showContent', 'showOverlay', 'hideOverlay', 'isOverlayVisible']
}

type OverlayPanelState = {
  plugins: Record<string, PluginRecord>
}

export class OverlayPanel extends AbstractPanel {
  element: HTMLDivElement
  dispatch: React.Dispatch<any> = () => {}
  appStateDispatch: React.Dispatch<AppAction> = () => {}
  isVisible: boolean = false

  constructor(config = null) {
    super(profile)
    this.event = new EventEmitter()
  }

  setDispatch(dispatch: React.Dispatch<any>) {
    this.dispatch = dispatch
  }

  setAppStateDispatch(appStateDispatch: React.Dispatch<AppAction>) {
    this.appStateDispatch = appStateDispatch
  }

  onActivation() {
    this.renderComponent()
  }

  focus(name: string) {
    this.emit('focusChanged', name)
    super.focus(name)
    this.renderComponent()
  }

  addView(profile: any, view: any) {
    super.addView(profile, view)
    this.renderComponent()
  }

  removeView(profile: any) {
    super.removeView(profile)
    this.renderComponent()
  }

  async showContent(name: string) {
    super.showContent(name)
    this.renderComponent()
  }

  async showOverlay(show: boolean = true) {
    this.isVisible = show
    this.appStateDispatch({
      type: appActionTypes.setShowOverlayPanel,
      payload: show
    })
    if (show) {
      this.emit('overlayOpened')
      this.events.emit('overlayOpened')
    } else {
      this.emit('overlayClosed')
      this.events.emit('overlayClosed')
    }
    this.renderComponent()
  }

  async hideOverlay() {
    await this.showOverlay(false)
  }

  isOverlayVisible(): boolean {
    return this.isVisible
  }

  renderComponent() {
    this.dispatch({
      plugins: this.plugins
    })
  }

  render() {
    return <PluginViewWrapper useAppContext={true} plugin={this} />
  }

  updateComponent(state: OverlayPanelState, appState: Partial<AppState>) {
    const activePluginName = this.currentFocus()
    const activePlugin = activePluginName ? state.plugins[activePluginName] : null

    return (
      <div
        className={`overlay-panel ${appState?.showOverlayPanel ? 'd-flex' : 'd-none'}`}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1000,
          background: 'var(--bs-body-bg)',
          overflow: 'hidden'
        }}
        data-id="overlayPanelContainer"
      >
        <div className="d-flex flex-column w-100 h-100" style={{ background: 'var(--bs-body-bg)' }}>
          {/* Header with close button */}
          <div
            className="d-flex align-items-center justify-content-between px-3 py-2 border-bottom"
            style={{
              backgroundColor: 'var(--bs-secondary-bg)',
              minHeight: '48px'
            }}
          >
            <div className="d-flex align-items-center">
              {activePlugin?.profile?.icon && (
                <img
                  src={activePlugin.profile.icon}
                  alt=""
                  className="mr-2"
                  style={{ width: '24px', height: '24px' }}
                />
              )}
              <span className="h5 mb-0">
                {activePlugin?.profile?.displayName || 'Overlay'}
              </span>
            </div>
            <button
              className="btn btn-sm"
              onClick={() => this.hideOverlay()}
              data-id="overlayPanelClose"
              aria-label="Close overlay"
            >
              <i className="fas fa-times fa-lg"></i>
            </button>
          </div>

          {/* Content area */}
          <div className="flex-grow-1 overflow-auto" style={{ background: 'var(--bs-body-bg)' }}>
            <RemixPluginPanel
              header={<></>}
              plugins={state.plugins}
            />
          </div>
        </div>
      </div>
    )
  }
}
