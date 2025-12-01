import { ViewPlugin } from '@remixproject/engine-web'

import * as packageJson from '../../../../../package.json'
import React from 'react' // eslint-disable-line
import { FileSystemProvider } from '@remix-ui/workspace' // eslint-disable-line
import {Registry} from '@remix-project/remix-lib'
import { RemixdHandle } from '../plugins/remixd-handle'
import {PluginViewWrapper} from '@remix-ui/helper'
const { TruffleHandle } = require('../files/truffle-handle.js')

/*
  Overview of APIs:
   * fileManager: @args fileProviders (browser, shared-folder, swarm, github, etc ...) & config & editor
      - listen on browser & localhost file provider (`fileRenamed` & `fileRemoved`)
      - update the tabs, switchFile
      - trigger `currentFileChanged`
      - set the current file in the config
   * fileProvider: currently browser, swarm, localhost, github, gist
      - link to backend
      - provide properties `type`, `readonly`
      - provide API `resolveDirectory`, `remove`, `exists`, `rename`, `get`, `set`
      - trigger `fileExternallyChanged`, `fileRemoved`, `fileRenamed`, `fileRenamedError`, `fileAdded`
   * file-explorer: treeview @args fileProvider
      - listen on events triggered by fileProvider
      - call fileProvider API
*/

const profile = {
  name: 'filePanel',
  displayName: 'File explorer',
  methods: [
    'createNewFile',
    'uploadFile',
    'uploadFolder',
    'echoCall',
    'getCurrentWorkspace',
    'getAvailableWorkspaceName',
    'getWorkspaces',
    'createWorkspace',
    'switchToWorkspace',
    'setWorkspace',
    'registerContextMenuItem',
    'renameWorkspace',
    'deleteWorkspace',
    'loadTemplate',
    'clone',
    'isExpanded',
    'isGist',
    'workspaceExists'
  ],
  events: ['setWorkspace', 'workspaceRenamed', 'workspaceDeleted', 'workspaceCreated'],
  icon: 'assets/img/fileManager.webp',
  description: 'Remix IDE file explorer',
  kind: 'fileexplorer',
  location: 'sidePanel',
  documentation: 'https://remix-ide.readthedocs.io/en/latest/file_explorer.html',
  version: packageJson.version,
  maintainedBy: 'Remix'
}
export default class Filepanel extends ViewPlugin {
  constructor(appManager, contentImport) {
    super(profile)
    this.registry = Registry.getInstance()
    this.fileProviders = this.registry.get('fileproviders').api
    this.fileManager = this.registry.get('filemanager').api

    this.el = document.createElement('div')
    this.el.setAttribute('id', 'fileExplorerView')

    this.remixdHandle = new RemixdHandle(this.fileProviders.localhost, appManager)
    this.truffleHandle = new TruffleHandle()
    this.contentImport = contentImport
    this.workspaces = []
    this.appManager = appManager
    this.currentWorkspaceMetadata = null

    this.expandPath = []
  }

  setDispatch(dispatch) {
    this.dispatch = dispatch
    this.renderComponent()
  }

  render() {
    return (
      <div id="fileExplorerView">
        <PluginViewWrapper plugin={this} />
      </div>
    )
  }
  updateComponent(state) {
    return (
      <FileSystemProvider plugin={state.plugin} />
    )
  }

  renderComponent() {
    this.dispatch({
      plugin: this,
    })
  }

  /**
   * @param item { id: string, name: string, type?: string[], path?: string[], extension?: string[], pattern?: string[] }
   * typically:
   * group 0 for file manipulations
   * group 1 for download operations
   * group 2 for running operations (script for instance)
   * group 3 for publishing operations (gist)
   * group 4 for copying operations
   * group 5 for solidity file operations (flatten for instance)
   * group 6 for compiling operations
   * group 7 for generating resource files (UML, documentation, ...)
   * @param callback (...args) => void
   */
  registerContextMenuItem(item) {
    return new Promise((resolve, reject) => {
      this.emit('registerContextMenuItemReducerEvent', item)
      resolve(item)
    })
  }

  removePluginActions(plugin) {
    return new Promise((resolve, reject) => {
      this.emit('removePluginActionsReducerEvent', plugin, (err, data) => {
        if (err) reject(err)
        else resolve(data)
      })
    })
  }

  /**
   * return the gist id if the current workspace is a gist workspace, otherwise returns null
   * @argument {String} workspaceName - the name of the workspace to check against. default to the current workspace.
   * @returns {string} gist id or null
   */
  isGist (workspaceName) {
    workspaceName = workspaceName || this.currentWorkspaceMetadata && this.currentWorkspaceMetadata.name
    const isGist = workspaceName.startsWith('gist')
    if (isGist) {
      return workspaceName.split(' ')[1]
    }
    return null
  }

  getCurrentWorkspace() {
    return this.currentWorkspaceMetadata
  }

  getWorkspaces() {
    return this.workspaces
  }

  workspaceExists(name) {
    if (!this.workspaces) return false
    return this.workspaces.find((workspace) => workspace.name === name)
  }

  getAvailableWorkspaceName(name) {
    if (!this.workspaces) return name
    let index = 1
    let workspace = this.workspaces.find((workspace) => workspace.name === name + ' - ' + index)
    while (workspace) {
      index++
      workspace = this.workspaces.find((workspace) => workspace.name === name + ' - ' + index)
    }
    return name + ' - ' + index
  }

  setWorkspaces(workspaces) {
    this.workspaces = workspaces
  }

  createNewFile() {
    return new Promise((resolve, reject) => {
      this.emit('createNewFileInputReducerEvent', '/', (err, data) => {
        if (err) reject(err)
        else resolve(data)
      })
    })
  }

  uploadFile(target) {
    return new Promise((resolve, reject) => {
      return this.emit('uploadFileReducerEvent', '/', target, (err, data) => {
        if (err) reject(err)
        else resolve(data)
      })
    })
  }

  uploadFolder(target) {
    return new Promise((resolve, reject) => {
      this.emit('uploadFolderReducerEvent', '/', target, (err, data) => {
        if (err) reject(err)
        else resolve(data)
      })
    })
  }

  createWorkspace(workspaceName, workspaceTemplateName, isEmpty) {
    return new Promise((resolve, reject) => {
      this.emit('createWorkspaceReducerEvent', workspaceName, workspaceTemplateName, isEmpty, (err, data) => {
        if (err) reject(err)
        else resolve(data || true)
      })
    }, false)
  }

  renameWorkspace(oldName, workspaceName) {
    return new Promise((resolve, reject) => {
      this.emit('renameWorkspaceReducerEvent', oldName, workspaceName, (err, data) => {
        if (err) reject(err)
        else resolve(data || true)
      })
    })
  }

  deleteWorkspace(workspaceName) {
    return new Promise((resolve, reject) => {
      this.emit('deleteWorkspaceReducerEvent', workspaceName, (err, data) => {
        if (err) reject(err)
        else resolve(data || true)
      })
    })
  }

  saveRecent(workspaceName) {
    if (typeof workspaceName !== 'string') return
    if (workspaceName === 'code-sample') return
    if (!localStorage.getItem('recentWorkspaces')) {
      localStorage.setItem('recentWorkspaces', JSON.stringify([ { name: workspaceName, timestamp: Date.now() } ]))
    } else {
      let recents = JSON.parse(localStorage.getItem('recentWorkspaces'))
      // checking if we have a duplication
      if (!recents.find((el) => (el || {}).name ? el.name === workspaceName : el === workspaceName)) {
        recents = ([{ name: workspaceName, timestamp: Date.now() }, ...recents])
        recents = recents.filter((el) => (el || {}).name ? el.name !== '' : el !== '')
        localStorage.setItem('recentWorkspaces', JSON.stringify(recents))
      }
    }
  }

  setWorkspace(workspace) {
    const workspaceProvider = this.fileProviders.workspace
    const current = this.currentWorkspaceMetadata
    this.currentWorkspaceMetadata = {
      name: workspace.name,
      isLocalhost: workspace.isLocalhost,
      absolutePath: `${workspaceProvider.workspacesPath}/${workspace.name}`,
    }
    if (this.currentWorkspaceMetadata.name !== current) {
      this.saveRecent(workspace.name)
    }
    if (workspace.name !== ' - connect to localhost - ') {
      localStorage.setItem('currentWorkspace', workspace.name)
    }
    this.emit('setWorkspace', workspace)
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

  isExpanded(path) {
    if(path === '/') return true
    // remove leading slash
    path = path.replace(/^\/+/, '')
    return this.expandPath.includes(path)
  }

  /** end section */
}
