/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import React from 'react'
import { AppAction } from '@remix-ui/app'
import { PluginViewWrapper } from '@remix-ui/helper'
import { Plugin } from '@remixproject/engine'
import { EventEmitter } from 'events'
import * as packageJson from '../../../../../package.json'
import { TemplateExplorerProvider } from 'libs/remix-ui/template-explorer-modal/context/template-explorer-context'
import { WorkspaceTemplate } from 'libs/remix-ui/workspace/src/lib/types'
import { TemplateExplorerModalFacade } from 'libs/remix-ui/template-explorer-modal/src/utils/workspaceUtils'

const pluginProfile = {
  name: 'templateexplorermodal',
  displayName: 'Template Explorer Modal',
  description: 'Template Explorer Modal',
  methods: ['addArtefactsToWorkspace', 'updateTemplateExplorerInFileMode', 'importFromExternal', 'resetIpfsMode', 'resetFileMode', 'importFromHttps', 'resetHttpsMode'],
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
  event: EventEmitter
  appStateDispatch: any
  fileMode: boolean
  ipfsMode: boolean
  httpImportMode: boolean

  constructor() {
    super(pluginProfile)
    this.element = document.createElement('div')
    this.element.setAttribute('id', 'template-explorer-modal')
    this.dispatch = () => { }
    this.event = new EventEmitter()
    this.fileMode = false
    this.ipfsMode = false
    this.httpImportMode = false
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

  updateTemplateExplorerInFileMode(fileMode: boolean) {
    if (this.fileMode === fileMode) return
    this.fileMode = fileMode
    this.renderComponent()
  }

  resetFileMode() {
    this.fileMode = false
    this.renderComponent()
  }

  resetIpfsMode() {
    this.ipfsMode = false
    this.renderComponent()
  }

  resetHttpsMode() {
    this.httpImportMode = false
    this.renderComponent()
  }

  importFromExternal(ipfsMode: boolean) {
    if (this.ipfsMode === ipfsMode) return
    this.ipfsMode = ipfsMode
    this.renderComponent()
  }

  importFromHttps(httpImportMode: boolean) {
    if (this.httpImportMode === httpImportMode) return
    this.httpImportMode = httpImportMode
    this.renderComponent()
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

  renderComponent() {
    this.dispatch({
      ...this,
      ipfsMode: this.ipfsMode,
      fileMode: this.fileMode,
      httpImportMode: this.httpImportMode,
    })
  }

  updateComponent(state: any) {
    return (
      <TemplateExplorerProvider fileMode={state.fileMode} plugin={state} ipfsMode={state.ipfsMode} httpImportMode={state.httpImportMode} />
    )
  }
}
