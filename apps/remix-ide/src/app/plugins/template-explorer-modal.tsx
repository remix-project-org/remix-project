/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import React from 'react'
import { AppAction } from '@remix-ui/app'
import { PluginViewWrapper } from '@remix-ui/helper'
import { Plugin } from '@remixproject/engine'
import { EventEmitter } from 'events'
import * as packageJson from '../../../../../package.json'
import { TemplateExplorerProvider } from 'libs/remix-ui/template-explorer-modal/context/template-explorer-context'
import { WorkspaceTemplate } from 'libs/remix-ui/workspace/src/lib/types'

const pluginProfile = {
  name: 'templateexplorermodal',
  displayName: 'Template Explorer Modal',
  description: 'Template Explorer Modal',
  methods: ['addArtefactsToWorkspace'],
  events: [],
  maintainedBy: 'Remix',
  kind: 'templateexplorermodal',
  location: 'none',
  version: packageJson.version,
  permission: true,
  documentation: ''
}

export class TemplateExplorerModalPlugin extends Plugin {
  element: HTMLDivElement
  dispatch: React.Dispatch<any> = () => { }
  event: any
  appStateDispatch: any
  constructor() {
    super(pluginProfile)
    this.element = document.createElement('div')
    this.element.setAttribute('id', 'template-explorer-modal')
    this.dispatch = () => { }
    this.event = new EventEmitter()
  }

  async onActivation(): Promise<void> {

  }

  async addArtefactsToWorkspace(workspaceTemplateName: WorkspaceTemplate, opts: any, isEmpty: boolean, cb: (err: Error) => void) {
    this.emit('addTemplateToWorkspaceReducerEvent', workspaceTemplateName, opts, isEmpty, (err: Error) => {
      if (err) {
        console.error(err)
      }
    })
  }

  onDeactivation(): void {

  }

  setDispatch(dispatch: React.Dispatch<any>) {
    this.dispatch = dispatch
    this.renderComponent()
  }

  setAppStateDispatch(appStateDispatch: React.Dispatch<AppAction>) {
    this.appStateDispatch = appStateDispatch
  }

  render() {
    return (
      <div id="inner-remix-template-explorer-modal">
        <PluginViewWrapper plugin={this} useAppContext={true} />
      </div>
    )
  }

  renderComponent(): void {
    this.dispatch({
      ...this
    })
  }

  updateComponent(state: any) {
    return (
      <TemplateExplorerProvider plugin={state} />
    )
  }
}
