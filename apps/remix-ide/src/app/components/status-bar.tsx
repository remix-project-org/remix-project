import React from 'react'
import { EventEmitter } from 'events'
import { Plugin } from '@remixproject/engine'
import packageJson from '../../../../../package.json'
import { PluginViewWrapper } from '@remix-ui/helper'
import { PluginProfile, StatusBarInterface } from '../../types'
import { RemixUIStatusBar } from '@remix-ui/statusbar'
import { FilePanelType } from '@remix-ui/workspace'
import { VerticalIcons } from './vertical-icons'
import { CustomRemixApi } from '@remix-api'
import { AppAction } from '@remix-ui/app'

const statusBarProfile: PluginProfile = {
  name: 'statusBar',
  displayName: 'Status Bar',
  description: 'Remix IDE status bar panel',
  methods: ['isAIActive'],
  version: packageJson.version,
}

export class StatusBar extends Plugin<any, CustomRemixApi> implements StatusBarInterface {
  htmlElement: HTMLDivElement
  events: EventEmitter
  filePanelPlugin: FilePanelType
  verticalIcons: VerticalIcons
  dispatch: React.Dispatch<any> = () => { }
  appStateDispatch: React.Dispatch<AppAction> = () => { }
  currentWorkspaceName: string = ''
  isGitRepo: boolean = false
  isAiActive: boolean = false
  constructor(filePanel: FilePanelType, veritcalIcons: VerticalIcons) {
    super(statusBarProfile)
    this.filePanelPlugin = filePanel
    this.verticalIcons = veritcalIcons
    this.events = new EventEmitter()
    this.htmlElement = document.createElement('div')
    this.htmlElement.setAttribute('id', 'status-bar')
    this.filePanelPlugin
  }

  async isWorkspaceAGitRepo() {
    const isGit = await this.call('fileManager', 'isGitRepo')
    if (!isGit) return
    this.isGitRepo = true
    this.renderComponent()
  }

  async setCurrentGitWorkspaceName() {
    if (!this.isGitRepo) return
    const workspaceName = localStorage.getItem('currentWorkspace')
    workspaceName && workspaceName.length > 0 ? this.currentWorkspaceName = workspaceName : this.currentWorkspaceName = 'unknown'
    this.renderComponent()
  }

  async isAIActive() {
    let aiActive
    this.on('settings', 'copilotChoiceUpdated', async (isChecked) => {
      aiActive = isChecked
      this.isAiActive = isChecked
    })
    this.renderComponent()
    return aiActive
  }

  onActivation(): void {
    this.on('filePanel', 'workspaceInitializationCompleted', async () => {
      const isGit = await this.call('fileManager', 'isGitRepo')
      if (!isGit) return
      const workspaceName = localStorage.getItem('currentWorkspace')
      workspaceName && workspaceName.length > 0 ? this.currentWorkspaceName = workspaceName : this.currentWorkspaceName = ''
    })
    this.on('filePanel', 'switchToWorkspace', async (workspace: string) => {
      await this.isWorkspaceAGitRepo()
      if (!this.isGitRepo) {
        this.currentWorkspaceName = 'Not a git repo'
        return
      }
      const workspaceName = localStorage.getItem('currentWorkspace')
      workspaceName && workspaceName.length > 0 ? this.currentWorkspaceName = workspaceName : this.currentWorkspaceName = 'error'
    })
    this.on('settings', 'copilotChoiceChanged', (isAiActive: boolean) => {
      this.isAiActive = isAiActive
    })

    this.renderComponent()
  }

  setDispatch(dispatch: React.Dispatch<any>) {
    this.dispatch = dispatch
  }

  setAppStateDispatch(appStateDispatch: React.Dispatch<AppAction>) {
    this.appStateDispatch = appStateDispatch
  }

  renderComponent() {
    this.dispatch({
      plugins: this,
    })
  }

  updateComponent(state: any) {
    return <RemixUIStatusBar statusBarPlugin={state.plugins} />
  }

  render() {
    return (
      <div data-id="status-bar-container">
        <PluginViewWrapper useAppContext={true} plugin={this} />
      </div>
    )
  }
}
