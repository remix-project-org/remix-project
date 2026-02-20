'use strict'

const EventManager = require('events')
import FileProvider from "./fileProvider"

/**
 * Cloud workspace mode constants.
 * When cloud mode is active, workspaces are stored in .cloud-workspaces/{uuid}/
 * instead of .workspaces/{display-name}/. The display name is tracked separately.
 */
const LEGACY_WORKSPACES_PATH = '.workspaces'
const CLOUD_WORKSPACES_PATH = '.cloud-workspaces'

export default class WorkspaceFileProvider extends FileProvider {
  constructor () {
    super('')
    this.workspacesPath = LEGACY_WORKSPACES_PATH
    this.workspace = null
    this.event = new EventManager()

    /**
     * Cloud mode state.
     * When true, workspaces are stored under .cloud-workspaces/{uuid}/ and the
     * `workspace` field contains a UUID instead of a display name.
     */
    this.cloudMode = false

    /**
     * In cloud mode, the display name of the current workspace.
     * In legacy mode, this mirrors `this.workspace`.
     */
    this.workspaceDisplayName = null

    /**
     * In cloud mode, the UUID of the current workspace.
     * In legacy mode, this is null.
     */
    this.workspaceId = null

    try {
      // make sure "code-sample" has been removed
      window.remixFileSystem.exists(this.workspacesPath + '/code-sample').then((exist) => {
        if (exist) window.remixFileSystem.unlink(this.workspacesPath + '/code-sample').catch((e) => {
          console.log(e)
        })
      }).catch((e) => {
        console.log(e)
      })
    } catch (e) {
      // we don't need to log error if this throws an error
    }
  }

  // ==================== Cloud Mode ====================

  /**
   * Enable cloud workspace mode.
   * Switches the workspaces path to .cloud-workspaces/ and uses UUIDs as directory names.
   */
  enableCloudMode () {
    this.cloudMode = true
    this.workspacesPath = CLOUD_WORKSPACES_PATH
    console.log('[WorkspaceFileProvider] Cloud mode enabled, workspacesPath:', this.workspacesPath)
  }

  /**
   * Disable cloud workspace mode.
   * Switches back to the legacy .workspaces/ with display names as directory names.
   */
  disableCloudMode () {
    this.cloudMode = false
    this.workspacesPath = LEGACY_WORKSPACES_PATH
    this.workspaceId = null
    this.workspaceDisplayName = null
    console.log('[WorkspaceFileProvider] Cloud mode disabled, workspacesPath:', this.workspacesPath)
  }

  /**
   * Check if cloud mode is active
   */
  isCloudMode () {
    return this.cloudMode
  }

  // ==================== Workspace Management ====================

  setWorkspace (workspace) {
    const workspaceName = (workspace || {}).name ? workspace.name : workspace
  
    if (!workspaceName) return
    const cleanName = workspaceName.replace(/^\/|\/$/g, '') // remove first and last slash
    this.workspace = cleanName

    if (!this.cloudMode) {
      // Legacy mode: display name = directory name
      this.workspaceDisplayName = cleanName
      this.workspaceId = null
    }
  }

  /**
   * Set the workspace in cloud mode using UUID + display name.
   * @param {string} uuid - The UUID directory name under .cloud-workspaces/
   * @param {string} displayName - The human-readable workspace name
   */
  setCloudWorkspace (uuid, displayName) {
    if (!uuid) return
    this.workspace = uuid.replace(/^\/|\/$/g, '')
    this.workspaceId = this.workspace
    this.workspaceDisplayName = displayName || this.workspace
    console.log('[WorkspaceFileProvider] setCloudWorkspace:', this.workspace, '→', this.workspaceDisplayName)
  }

  getWorkspace () {
    return this.workspace
  }

  /**
   * Get the display name of the current workspace.
   * In cloud mode this is the human-readable name.
   * In legacy mode this equals the workspace directory name.
   */
  getWorkspaceDisplayName () {
    return this.workspaceDisplayName || this.workspace
  }

  /**
   * Get the UUID of the current workspace (cloud mode only).
   * Returns null in legacy mode.
   */
  getWorkspaceId () {
    return this.workspaceId
  }

  isReady () {
    return this.workspace !== null
  }

  clearWorkspace () {
    this.workspace = null
    this.workspaceDisplayName = null
    this.workspaceId = null
  }

  removePrefix (path) {
    if (!path) path = '/'
    path = path.replace(/^\/|\/$/g, '') // remove first and last slash
    path = path.replace(/^\.\/+/, '') // remove ./ from start of string
    if (path.startsWith(this.workspacesPath + '/' + this.workspace)) return path
    path = super.removePrefix(path)
    let ret = this.workspacesPath + '/' + this.workspace + '/' + (path === '/' ? '' : path)

    ret = ret.replace(/^\/|\/$/g, '')
    if (!this.isSubDirectory(this.workspacesPath + '/' + this.workspace, ret)) throw new Error('Cannot read/write to path outside workspace')
    return ret
  }

  resolveDirectory (path, callback) {
    super.resolveDirectory(path, (error, files) => {
      if (error) return callback(error)
      const unscoped = {}
      for (const file in files) {
        unscoped[file.replace(this.workspacesPath + '/' + this.workspace + '/', '')] = files[file]
      }
      callback(null, unscoped)
    })
  }

  async copyFolderToJson (directory, visitFile, visitFolder) {
    visitFile = visitFile || function () { /* do nothing. */ }
    visitFolder = visitFolder || function () { /* do nothing. */ }
    // Use the active workspacesPath (.workspaces or .cloud-workspaces) for stripping
    const escapedPath = this.workspacesPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const escapedWorkspace = this.workspace.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`${escapedPath}/${escapedWorkspace}/`, 'g')
    let json = await super._copyFolderToJsonInternal(directory, ({ path, content }) => {
      visitFile({ path: path.replace(regex, ''), content })
    }, ({ path }) => {
      visitFolder({ path: path.replace(regex, '') })
    })
    json = JSON.stringify(json).replace(regex, '')
    return JSON.parse(json)
  }

  _normalizePath (path) {
    return path.replace(this.workspacesPath + '/' + this.workspace + '/', '')
  }

  async createWorkspace (name) {
    try {
      if (!name) name = 'default_workspace'
      const path = this.workspacesPath + '/' + name

      await super.forceCreateDir(path)
      this.setWorkspace(name)
      this.event.emit('createWorkspace', name)
    } catch (e) {
      throw new Error(e)
    }
  }

  /**
   * Create a workspace in cloud mode with a UUID directory
   * @param {string} uuid - The UUID to use as directory name
   * @param {string} displayName - The human-readable workspace name
   */
  async createCloudWorkspace (uuid, displayName) {
    try {
      if (!uuid) throw new Error('UUID is required for cloud workspace')
      const path = CLOUD_WORKSPACES_PATH + '/' + uuid

      await super.forceCreateDir(path)
      this.setCloudWorkspace(uuid, displayName)
      this.event.emit('createWorkspace', displayName)
    } catch (e) {
      throw new Error(e)
    }
  }
}

module.exports = WorkspaceFileProvider
