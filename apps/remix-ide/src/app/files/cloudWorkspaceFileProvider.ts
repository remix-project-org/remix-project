/**
 * CloudWorkspaceFileProvider
 *
 * Extends WorkspaceFileProvider to transparently map human-readable workspace
 * display names to UUID-based directory names on disk.
 *
 * Storage layout:
 *   /.cloud-workspaces/<uuid>/contracts/Token.sol
 *
 * Callers always use display names ("My Project").
 * Internally this.workspace is set to the UUID so that the inherited
 * removePrefix / resolveDirectory / _normalizePath / set / get / etc.
 * all route to the correct physical path without any changes.
 *
 * This provider is swapped in at runtime when the user logs in,
 * and swapped back to the normal WorkspaceFileProvider on logout.
 */

import WorkspaceFileProvider from './workspaceFileProvider'

export default class CloudWorkspaceFileProvider extends WorkspaceFileProvider {
  _nameToUuid: Map<string, string>
  _uuidToName: Map<string, string>
  _displayName: string | null
  _lastCreated: any
  _apiCreate: ((name: string) => Promise<any>) | null

  constructor () {
    super()
    this.workspacesPath = '.cloud-workspaces'
    this._nameToUuid = new Map()
    this._uuidToName = new Map()
    this._displayName = null
    this._lastCreated = null
    this._apiCreate = null
  }

  // ── API Injection ──────────────────────────────────────────

  /**
   * Inject the cloud API create function.
   * This is called once when the provider is instantiated.
   * The function should call the REST API and return { uuid, name, ... }.
   */
  setApiCreate (fn: (name: string) => Promise<any>) {
    this._apiCreate = fn
  }

  // ── Name ↔ UUID Mapping ───────────────────────────────────

  /**
   * Populate the full name↔UUID mapping from the cloud workspace list.
   */
  setWorkspaceMappings (workspaces: Array<{ uuid: string; name: string }>) {
    this._nameToUuid.clear()
    this._uuidToName.clear()
    for (const ws of workspaces) {
      this._nameToUuid.set(ws.name, ws.uuid)
      this._uuidToName.set(ws.uuid, ws.name)
    }
  }

  addWorkspaceMapping (uuid: string, name: string) {
    this._nameToUuid.set(name, uuid)
    this._uuidToName.set(uuid, name)
  }

  removeWorkspaceMapping (nameOrUuid: string) {
    const uuid = this._nameToUuid.get(nameOrUuid) || nameOrUuid
    const name = this._uuidToName.get(uuid) || nameOrUuid
    this._nameToUuid.delete(name)
    this._uuidToName.delete(uuid)
  }

  renameWorkspaceMapping (oldName: string, newName: string) {
    const uuid = this._nameToUuid.get(oldName)
    if (uuid) {
      this._nameToUuid.delete(oldName)
      this._nameToUuid.set(newName, uuid)
      this._uuidToName.set(uuid, newName)
    }
  }

  /** Resolve a display name → UUID (or null if unknown). */
  resolveDisplayName (name: string): string | null {
    return this._nameToUuid.get(name) || null
  }

  /** Resolve a UUID → display name (or null if unknown). */
  resolveUuid (uuid: string): string | null {
    return this._uuidToName.get(uuid) || null
  }

  /** Check whether a workspace with this display name exists in the mapping. */
  workspaceNameExists (name: string): boolean {
    return this._nameToUuid.has(name)
  }

  /** Get the FS directory name for a workspace by display name. */
  getWorkspaceDirName (displayName: string): string {
    return this._nameToUuid.get(displayName) || displayName
  }

  /** Get metadata of the last workspace created via createWorkspace. */
  getLastCreated (): any {
    return this._lastCreated
  }

  /** Get all workspace mappings. */
  listWorkspaceMappings (): Array<{ name: string; uuid: string }> {
    return Array.from(this._nameToUuid.entries()).map(([name, uuid]) => ({ name, uuid }))
  }

  // ── Overrides ──────────────────────────────────────────────

  /**
   * Set the active workspace by display name (or UUID).
   * Internally stores the UUID as `this.workspace` so that all inherited
   * path-resolution methods (removePrefix, resolveDirectory, etc.) work
   * against the correct physical directory.
   */
  setWorkspace (workspace: any) {
    let name = (workspace || {}).name ? workspace.name : workspace
    if (!name) return
    name = (name + '').replace(/^\/|\/$/g, '')

    const uuid = this._nameToUuid.get(name)
    if (uuid) {
      // Input is a display name → store UUID internally
      this.workspace = uuid
      this._displayName = name
    } else if (this._uuidToName.has(name)) {
      // Input is already a UUID
      this.workspace = name
      this._displayName = this._uuidToName.get(name) || name
    } else {
      // Unknown — treat as literal (fallback)
      this.workspace = name
      this._displayName = name
    }
  }

  /**
   * Returns the human-readable display name, not the UUID.
   */
  getWorkspace (): string {
    return this._displayName || this.workspace
  }

  /**
   * Create a cloud workspace.
   *
   * If an API create function was injected, it is called to obtain a UUID.
   * Otherwise the mapping must have been pre-registered via addWorkspaceMapping.
   *
   * Creates the physical directory as /.cloud-workspaces/<uuid>/
   * then sets it as the active workspace.
   *
   * IMPORTANT: We do NOT use the inherited forceCreateDir here because it
   * emits `folderAdded` events for every intermediate directory it creates.
   * When `.cloud-workspaces` doesn't exist yet, forceCreateDir would emit
   * folderAdded('.cloud-workspaces') which the event handler in events.ts
   * passes to resolveDirectory → removePrefix, which prepends the current
   * workspace path, producing an invalid nested path like
   * `.cloud-workspaces/<uuid>/.cloud-workspaces` → ENOENT.
   *
   * Instead we silently ensure the root dir exists, then mkdir the workspace.
   */
  async createWorkspace (displayName: string) {
    if (!displayName) displayName = 'default_workspace'

    // If the mapping doesn't exist yet, call the API to create it
    if (!this._nameToUuid.has(displayName) && this._apiCreate) {
      const cloudWs = await this._apiCreate(displayName)
      this.addWorkspaceMapping(cloudWs.uuid, displayName)
      this._lastCreated = cloudWs
    }

    const dirName = this._nameToUuid.get(displayName) || displayName
    const fs = (window as any).remixFileSystem

    // 1. Silently ensure the /.cloud-workspaces root exists (no events)
    const rootPath = '/' + this.workspacesPath
    try { await fs.stat(rootPath) } catch { await fs.mkdir(rootPath) }

    // 2. Create the workspace directory /.cloud-workspaces/<uuid>
    const wsPath = rootPath + '/' + dirName
    try { await fs.stat(wsPath) } catch { await fs.mkdir(wsPath) }

    this.workspace = dirName
    this._displayName = displayName
    this.event.emit('createWorkspace', displayName)
  }
}
