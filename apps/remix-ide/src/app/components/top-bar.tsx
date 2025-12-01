/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import React from 'react'
import { TopbarProvider } from '@remix-ui/top-bar'
import packageJson from '../../../../../package.json'
import { EventEmitter } from 'events'
import { Plugin } from '@remixproject/engine'
import { PluginViewWrapper } from '@remix-ui/helper'
import { AppAction } from 'libs/remix-ui/app/src/lib/remix-app/actions/app'
import FilePanel from '../panels/file-panel'
import { WorkspaceMetadata } from 'libs/remix-ui/workspace/src/lib/types'
import { gitUIPanels } from '@remix-ui/git'
import { HOME_TAB_NEW_UPDATES } from 'libs/remix-ui/home-tab/src/lib/components/constant'
import axios from 'axios'
import { UpdateInfo } from 'libs/remix-ui/home-tab/src/lib/components/types/carouselTypes'
import { GitPlugin } from '../plugins/git'
import { createWorkspace, deleteWorkspace, getWorkspaces, renameWorkspace, WorkspaceType } from 'libs/remix-ui/workspace/src/lib/actions'
import { Registry } from '@remix-project/remix-lib'

const TopBarProfile = {
  name: 'topbar',
  displayName: 'Top Bar',
  description: '',
  version: packageJson.version,
  icon: '',
  location: 'none',
  methods: ['getWorkspaces', 'createWorkspace', 'renameWorkspace', 'deleteWorkspace', 'getCurrentWorkspace', 'setWorkspace'],
  events: ['setWorkspace', 'workspaceRenamed', 'workspaceDeleted', 'workspaceCreated'],
}

export class Topbar extends Plugin {
  dispatch: React.Dispatch<any> = () => { }
  appStateDispatch: React.Dispatch<AppAction> = () => { }
  htmlElement: HTMLDivElement
  event: EventEmitter
  topbarExpandPath: string
  filePanel: FilePanel
  git: GitPlugin
  workspaces: WorkspaceMetadata[] | WorkspaceType[]
  currentWorkspaceMetadata: WorkspaceMetadata
  registry: Registry
  fileProviders: any
  fileManager: any
  desktopClientMode: boolean

  constructor(filePanel: FilePanel, git: GitPlugin, desktopClientMode = false) {
    super(TopBarProfile)
    this.filePanel = filePanel
    this.registry = Registry.getInstance()
    this.event = new EventEmitter()
    this.fileProviders = this.registry.get('fileproviders').api
    this.fileManager = this.registry.get('filemanager').api
    this.git = git
    this.workspaces = []
    this.currentWorkspaceMetadata = null
    this.desktopClientMode = desktopClientMode
  }

  onActivation(): void {
    this.renderComponent()
  }

  onDeactivation(): void {

  }

  getCurrentWorkspace() {
    return this.currentWorkspaceMetadata
  }

  async getWorkspaces() {
    this.workspaces = await getWorkspaces()
    return this.workspaces
  }

  async createWorkspace(workspaceName, workspaceTemplateName, isEmpty) {
    try {
      await createWorkspace(workspaceName, workspaceTemplateName, isEmpty)
      this.emit('workspaceCreated', workspaceName, workspaceTemplateName, isEmpty)
    } catch (error) {
      console.error('Error creating workspace:', error)
    }
  }

  async renameWorkspace(oldName, workspaceName) {
    try {
      await renameWorkspace(oldName, workspaceName)
      this.emit('workspaceRenamed', oldName, workspaceName)
    } catch (error) {
      console.error('Error renaming workspace:', error)
    }
  }

  async deleteWorkspace(workspaceName) {
    try {
      await deleteWorkspace(workspaceName)
      this.emit('workspaceDeleted', workspaceName)
    } catch (error) {
      console.error('Error deleting workspace:', error)
    }
  }

  async getCurrentWorkspaceMetadata() {
    this.currentWorkspaceMetadata = await this.fileManager.getCurrentWorkspace()
    return this.currentWorkspaceMetadata
  }

  setWorkspace(workspace) {
    const workspaceProvider = this.fileProviders.workspace
    const current = this.currentWorkspaceMetadata
    this.currentWorkspaceMetadata = {
      name: workspace.name,
      isLocalhost: workspace.isLocalhost,
      absolutePath: `${workspaceProvider.workspacesPath}/${workspace.name}`,
    }
    if (this.currentWorkspaceMetadata.name !== current.name) {
      this.saveRecent(workspace.name)
    }
    if (workspace.name !== ' - connect to localhost - ') {
      localStorage.setItem('currentWorkspace', workspace.name)
    }
    this.emit('setWorkspace', workspace)
  }
  saveRecent(name: any) {
    throw new Error('Method not implemented.')
  }

  switchToWorkspace(workspaceName) {
    this.emit('switchToWorkspace', workspaceName)
  }

  workspaceRenamed(oldName, workspaceName) {
    this.emit('workspaceRenamed', oldName, workspaceName)
  }

  workspaceDeleted(workspace) {
    this.emit('workspaceDeleted', workspace)
  }

  workspaceCreated(workspace) {
    this.emit('workspaceCreated', workspace)
  }

  async logInGithub () {
    await this.call('menuicons', 'select', 'dgit')
    await this.call('dgit', 'open', gitUIPanels.GITHUB)
  }

  async getLatestUpdates() {
    try {
      const response = await axios.get(HOME_TAB_NEW_UPDATES)
      return response.data
    } catch (error) {
      console.error('Error fetching plugin list:', error)
    }
  }

  async getLatestReleaseNotesUrl () {
    const response = await this.getLatestUpdates()
    const data: UpdateInfo[] = response
    const interim = data.find(x => x.action.label.toLowerCase().includes('release notes'))
    const targetUrl = interim?.action?.url
    const currentReleaseVersion = packageJson.version
    return [targetUrl, currentReleaseVersion]
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
    return <TopbarProvider plugin={this} />
  }

  render() {
    return (
      <div data-id="top-bar-container">
        <PluginViewWrapper useAppContext={true} plugin={this} />
      </div>
    )
  }

}
