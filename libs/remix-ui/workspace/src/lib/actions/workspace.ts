import React from 'react'
import { bytesToHex } from '@ethereumjs/util'
import { trackMatomoEventAsync } from '@remix-api'
import { hash } from '@remix-project/remix-lib'
import { createNonClashingNameAsync } from '@remix-ui/helper'
import { cloudStore } from '../cloud/cloud-store'
import { isCloudProvider, switchToCloudWorkspace, renameCloudWorkspaceAction, deleteCloudWorkspaceAction, startFileChangeTracking, cloudLocalKey } from '../cloud/cloud-workspace-actions'
import { cloudSyncEngine } from '../cloud/cloud-sync-engine'
import { TEMPLATE_METADATA, TEMPLATE_NAMES } from '../utils/constants'
import { TemplateType } from '../types'
import IpfsHttpClient from 'ipfs-http-client'
import axios, { AxiosResponse } from 'axios'
import {
  addInputFieldSuccess,
  cloneRepositoryFailed,
  cloneRepositoryRequest,
  cloneRepositorySuccess,
  createWorkspaceError,
  createWorkspaceRequest,
  createWorkspaceSuccess,
  displayNotification,
  displayPopUp,
  fetchWorkspaceDirectoryError,
  fetchWorkspaceDirectoryRequest,
  fetchWorkspaceDirectorySuccess,
  hideNotification,
  setCurrentWorkspace,
  setCurrentWorkspaceBranches,
  setCurrentWorkspaceCurrentBranch,
  setDeleteWorkspace,
  setMode,
  setReadOnlyMode,
  setRenameWorkspace,
  setCurrentWorkspaceIsGitRepo,
  setGitConfig,
  setElectronRecentFolders,
  setCurrentWorkspaceHasGitSubmodules,
  setCurrentLocalFilePath,
} from './payload'
import { addSlash, checkSlash, checkSpecialChars } from '@remix-ui/helper'

import { FileTree, JSONStandardInput, WorkspaceTemplate } from '../types'
import { QueryParams } from '@remix-project/remix-lib'
import * as templateWithContent from '@remix-project/remix-ws-templates'
import { ROOT_PATH } from '../utils/constants'
// eslint-disable-next-line @nrwl/nx/enforce-module-boundaries
import { IndexedDBStorage } from '../../../../../../apps/remix-ide/src/app/files/filesystems/indexedDB'
import { getUncommittedFiles } from '../utils/gitStatusFilter'
import { AppModal, ModalTypes } from '@remix-ui/app'

import { gitUIPanels } from '@remix-ui/git'
import { Plugin } from "@remixproject/engine";
import { CustomRemixApi, branch, cloneInputType } from '@remix-api'
import { scriptTemplates } from './scriptTemplates'

declare global {
  interface Window {
    remixFileSystemCallback: IndexedDBStorage
  }
}
// eslint-disable-next-line @typescript-eslint/no-var-requires
const projectVersion = require('../../../../../../package.json').version
const LOCALHOST = ' - connect to localhost - '
const NO_WORKSPACE = ' - none - '
const ELECTRON = 'electron'
const queryParams = new QueryParams()
let plugin: any, dgitPlugin: Plugin<any, CustomRemixApi>,dispatch: React.Dispatch<any>

/** Guard flag to prevent concurrent default-workspace creation in cloud mode */
let _creatingDefaultCloudWorkspace = false

/**
 * Async mutex that serializes workspace-mutating operations.
 *
 * The root cause of many race conditions in Remix is that
 * `WorkspaceFileProvider.workspace` is a mutable singleton property read
 * lazily by every I/O call (via `removePrefix()`).  If a workspace
 * switch/create fires while another operation is still writing files the
 * provider silently redirects writes to the wrong directory.
 *
 * By funneling createWorkspace, switchToWorkspace, deleteWorkspace and
 * renameWorkspace through this queue we guarantee that only one of these
 * operations runs at a time – eliminating the interleaving.
 */
class WorkspaceOperationQueue {
  private _queue: Promise<void> = Promise.resolve()
  private _depth = 0
  private _nextOpId = 0
  private _queuedCount = 0
  private _debug: boolean

  constructor(options?: { debug?: boolean }) {
    this._debug = options?.debug ?? false
  }

  private _log(tag: string, opId: number, label: string, extra?: string) {
    if (!this._debug) return
    console.log(
      `%c[WorkspaceQueue]%c %c${tag}%c %c${label}%c #${opId} depth=${this._depth} queued=${this._queuedCount}${extra ? ' ' + extra : ''}`,
      'color:#e57a00;font-weight:bold', '',
      tag.includes('ERR') ? 'color:red;font-weight:bold' : tag.includes('OK') ? 'color:green' : 'color:#2196F3;font-weight:bold', '',
      'color:#9c27b0;font-weight:bold', ''
    )
  }

  /**
   * Enqueue `fn` so it runs only after every previously-enqueued operation
   * has settled (resolved **or** rejected).
   *
   * @param label  Human-readable name for this operation (e.g. "createWorkspace")
   *
   * **Re-entrant**: if we are already inside a queued operation (depth > 0)
   * the call is allowed through immediately.  This is critical because the
   * plugin architecture can create call cascades where operation A triggers
   * an event that calls operation B which tries to enter the queue – if we
   * blocked we'd deadlock.  JavaScript is single-threaded, so any call that
   * arrives while `_depth > 0` was necessarily spawned from the currently-
   * executing operation and can safely proceed.
   */
  /** Clear the busy flag when no operations are in-flight or waiting */
  private _drainCheck() {
    if (this._depth === 0 && this._queuedCount === 0) {
      cloudStore.setWorkspaceQueueBusy(false)
    }
  }

  run<T>(fn: () => Promise<T>, label?: string): Promise<T> {
    const opId = ++this._nextOpId
    const opLabel = label || fn.name || 'anonymous'

    if (this._depth > 0) {
      // Re-entrant call – bypass the queue to avoid deadlock.
      this._log('REENTRANT', opId, opLabel)
      this._depth++
      const t0 = performance.now()
      return fn().then(
        (v) => { this._depth--; this._log('REENTRANT-OK', opId, opLabel, `${(performance.now() - t0).toFixed(0)}ms`); this._drainCheck(); return v },
        (e) => { this._depth--; this._log('REENTRANT-ERR', opId, opLabel, `${(performance.now() - t0).toFixed(0)}ms ${e?.message || e}`); this._drainCheck(); throw e }
      )
    }

    this._queuedCount++
    this._log('ENQUEUE', opId, opLabel)

    let resolve!: (v: T) => void
    let reject!: (e: any) => void
    const p = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })
    // Chain onto the queue.  We use `.then(…, …)` with both branches so
    // that a rejection in an earlier operation doesn't skip later ones.
    const execute = async () => {
      this._queuedCount--
      this._depth++
      cloudStore.setWorkspaceQueueBusy(true)
      const t0 = performance.now()
      this._log('START', opId, opLabel)
      try {
        const result = await fn()
        this._log('OK', opId, opLabel, `${(performance.now() - t0).toFixed(0)}ms`)
        resolve(result)
      } catch (e: any) {
        this._log('ERROR', opId, opLabel, `${(performance.now() - t0).toFixed(0)}ms ${e?.message || e}`)
        reject(e)
      } finally {
        this._depth--
        this._drainCheck()
      }
    }
    this._queue = this._queue.then(execute, execute)
    return p
  }
}

const workspaceOperationQueue = new WorkspaceOperationQueue()

export const setPlugin = (filePanelPlugin, reducerDispatch) => {
  plugin = filePanelPlugin
  dgitPlugin = filePanelPlugin
  dispatch = reducerDispatch
  dgitPlugin.on('dgitApi', 'checkout', async () => {
    await checkGit()
  })
  dgitPlugin.on('dgitApi', 'init', async () => {
    await checkGit()
  })
  dgitPlugin.on('dgitApi', 'add', async () => {
    await checkGit()
  })
  dgitPlugin.on('dgitApi', 'commit', async () => {
    await checkGit()
  })
  dgitPlugin.on('dgitApi', 'branch', async () => {
    await checkGit()
  })
  dgitPlugin.on('dgitApi', 'clone', async () => {
    await checkGit()
  })
  plugin.on('config', 'configChanged', async () => {
    await getGitConfig()
  })
  plugin.on('settings', 'configChanged', async () => {
    await getGitConfig()
  })
  plugin.on('fileManager', 'fileAdded', async (filePath: string) => {
    if (filePath.includes('.gitmodules')) {
      await checkGit()
    }
  })
  plugin.on('fs', 'workingDirChanged', async (dir: string) => {
    dispatch(setCurrentLocalFilePath(dir))
    await checkGit()
  })
  checkGit()
  getGitConfig()
}

export const addInputField = async (type: 'file' | 'folder', path: string, cb?: (err: Error, result?: string | number | boolean | Record<string, any>) => void) => {
  const provider = plugin.fileManager.currentFileProvider()
  const promise: Promise<FileTree> = new Promise((resolve, reject) => {
    provider.resolveDirectory(path, (error, fileTree: FileTree) => {
      if (error) {
        cb && cb(error)
        return reject(error)
      }

      cb && cb(null, true)
      resolve(fileTree)
    })
  })

  promise
    .then((files) => {
      dispatch(addInputFieldSuccess(path, files, type))
    })
    .catch((error) => {
      console.error(error)
    })
  return promise
}

const removeSlash = (s: string) => {
  return s.replace(/^\/+/, '')
}

/**
 * Internal implementation of workspace creation.  Callers that already hold
 * the workspace operation queue lock (e.g. deleteWorkspace, switchToWorkspace)
 * must call this directly to avoid deadlocking on the queue.
 */
const _createWorkspaceInternal = async (
  workspaceName: string,
  workspaceTemplateName: WorkspaceTemplate,
  opts = null,
  isEmpty = false,
  cb?: (err: Error, result?: string | number | boolean | Record<string, any>) => void,
  isGitRepo: boolean = false,
  createCommit: boolean = true,
  contractContent?: string,
  contractName?: string,
) => {
  if (plugin.registry.get('platform').api.isDesktop()) {
    if (workspaceTemplateName) {
      await plugin.call('remix-templates', 'loadTemplateInNewWindow', workspaceTemplateName, opts, contractContent, contractName)
    }
    return
  }
  await plugin.fileManager.closeAllFiles()
  const metadata = TEMPLATE_METADATA[workspaceTemplateName]
  await createWorkspaceTemplate(workspaceName, workspaceTemplateName, metadata, contractContent, contractName)
  dispatch(createWorkspaceRequest())
  try {
    dispatch(createWorkspaceSuccess({ name: workspaceName, isGitRepo }))
    await plugin.setWorkspace({ name: workspaceName, isLocalhost: false })
    await plugin.workspaceCreated(workspaceName)

    // ── Cloud mode: the provider auto-called the API in createWorkspace.
    //    Now wire up sync engine + file tracking.
    try {
      if (cloudStore.isCloudMode) {
        const cloudProvider = plugin.fileProviders.workspace
        const cloudWs = cloudProvider.getLastCreated?.()
        if (cloudWs) {
          cloudStore.addCloudWorkspace(cloudWs)
          cloudStore.setActiveCloudWorkspace(cloudWs.uuid)
          startFileChangeTracking(cloudProvider, cloudWs.uuid)
          await cloudSyncEngine.activate(cloudWs.uuid)
        }
      }
    } catch (cloudErr) {
      console.error('[createWorkspace] Cloud sync setup failed:', cloudErr)
    }

    // Show left side panel if it's hidden after successful workspace creation
    try {
      const isHidden = await plugin.call('sidePanel', 'isPanelHidden')
      if (isHidden) {
        await plugin.call('sidePanel', 'togglePanel')
      }
    } catch (e) {
      console.log('Could not check/update side panel visibility:', e)
    }

    // ── Best-effort initial git commit ──
    // The workspace is already created at this point.  If git init or the
    // first commit fails (e.g. missing credentials) we must NOT let that
    // error propagate – the workspace is perfectly usable without the
    // commit and the UI should reflect a successful creation.
    if (isGitRepo && createCommit) {
      try {
        const name = await plugin.call('settings', 'get', 'settings/github-user-name')
        const email = await plugin.call('settings', 'get', 'settings/github-email')
        const currentBranch: branch = await dgitPlugin.call('dgitApi', 'currentbranch')

        if (!currentBranch) {
          await dgitPlugin.call('dgit', 'init')
          if (!isEmpty) {
            await loadWorkspacePreset(workspaceTemplateName, opts, contractContent, contractName)
          }

          // Only attempt the commit if we have usable credentials.
          if (name && email) {
            plugin.call('notification', 'toast', 'Creating initial git commit ...')
            const status = await dgitPlugin.call('dgitApi', 'status', { ref: 'HEAD' })

            await Promise.all(
              status.map(([filepath, , worktreeStatus]) =>
                worktreeStatus
                  ? dgitPlugin.call('dgitApi', 'add', {
                    filepath: removeSlash(filepath),
                  })
                  : dgitPlugin.call('dgitApi', 'rm', {
                    filepath: removeSlash(filepath),
                  })
              )
            )
            await dgitPlugin.call('dgitApi', 'commit', {
              author: {
                name,
                email,
              },
              message: `Initial commit: remix template ${workspaceTemplateName}`,
            })
          } else {
            plugin.call(
              'notification',
              'toast',
              'Git credentials not set – skipping initial commit. You can set them in Settings → GitHub.'
            )
          }
        }
      } catch (gitErr) {
        console.warn('[createWorkspace] Initial git commit failed (workspace is still usable):', gitErr)
        plugin.call(
          'notification',
          'toast',
          'Could not create initial git commit: ' + (gitErr.message || gitErr)
        )
      }
    }

    await populateWorkspace(workspaceTemplateName, opts, isEmpty, (err: Error) => { cb && cb(err, workspaceName) }, isGitRepo, createCommit, contractContent, contractName)
    // this call needs to be here after the callback because it calls dGitProvider which also calls this function and that would cause an infinite loop
    await plugin.setWorkspaces(await getWorkspaces())
  } catch (error) {
    dispatch(createWorkspaceError(error.message))
    cb && cb(error)
  }
}

export const createWorkspace = async (
  workspaceName: string,
  workspaceTemplateName: WorkspaceTemplate,
  opts = null,
  isEmpty = false,
  cb?: (err: Error, result?: string | number | boolean | Record<string, any>) => void,
  isGitRepo: boolean = false,
  createCommit: boolean = true,
  contractContent?: string,
  contractName?: string,
) => {
  return workspaceOperationQueue.run(() =>
    _createWorkspaceInternal(workspaceName, workspaceTemplateName, opts, isEmpty, cb, isGitRepo, createCommit, contractContent, contractName)
  , `createWorkspace(${workspaceName})`)
}

export const generateWorkspace = async () => {
  await plugin.call('notification', 'alert', 'Your request is being processed. Please wait while I generate the Workspace for you. It won\'t be long.')
}

export const populateWorkspace = async (
  workspaceTemplateName: WorkspaceTemplate,
  opts = null,
  isEmpty = false,
  cb?: (err: Error, result?: string | number | boolean | Record<string, any>) => void,
  isGitRepo: boolean = false,
  createCommit: boolean = false,
  contractContent?: string,
  contractName?: string,
) => {

  if (scriptTemplates.some(template => template.templateName === workspaceTemplateName)) {
    const templateArtefact = scriptTemplates.find(template => template.templateName === workspaceTemplateName)?.templateArtefact
    if (templateArtefact) {
      for (const file of templateArtefact.files) {
        const fileExists = await plugin.call('fileManager', 'exists', file)
        if (fileExists) {
          await plugin.call('notification', 'toast', 'File already exists in workspace. Nothing to do here!')
          return
        }
      }
    }
  }
  const metadata = TEMPLATE_METADATA[workspaceTemplateName]
  if (metadata && metadata.type === 'plugin') {
    plugin.call('notification', 'toast', 'Please wait while the Workspace is being populated with the template.')
    dispatch(cloneRepositoryRequest())
    try {
      // Give the workspace UI a moment to settle before calling the plugin.
      await new Promise((r) => setTimeout(r, 5000))
      await plugin.call(metadata.name, metadata.endpoint, ...metadata.params)
      dispatch(cloneRepositorySuccess())
    } catch (e) {
      dispatch(cloneRepositoryFailed())
      plugin.call('notification', 'toast', 'Error adding template: ' + (e.message || e))
    }
  } else if (!isEmpty && !(isGitRepo && createCommit)) {
    await loadWorkspacePreset(workspaceTemplateName, opts, contractContent, contractName)
  }
  cb && cb(null)
  if (isGitRepo) {
    await checkGit()
    const isActive = await plugin.call('manager', 'isActive', 'dgit')
    if (!isActive) await plugin.call('manager', 'activatePlugin', 'dgit')
  }
  if (workspaceTemplateName === 'semaphore' || workspaceTemplateName === 'hashchecker' || workspaceTemplateName === 'rln') {
    const isCircomActive = await plugin.call('manager', 'isActive', 'circuit-compiler')
    if (!isCircomActive) await plugin.call('manager', 'activatePlugin', 'circuit-compiler')
    await trackMatomoEventAsync(plugin, { category: 'circuit-compiler', action: 'template', name: 'create', value: workspaceTemplateName, isClick: false })
  }
  if (workspaceTemplateName === 'multNr' || workspaceTemplateName === 'stealthDropNr') {
    const isNoirActive = await plugin.call('manager', 'isActive', 'noir-compiler')
    if (!isNoirActive) await plugin.call('manager', 'activatePlugin', 'noir-compiler')
    await trackMatomoEventAsync(plugin, { category: 'noir-compiler', action: 'template', name: 'create', value: workspaceTemplateName, isClick: false })
  }
}

export const createWorkspaceTemplate = async (workspaceName: string, template: WorkspaceTemplate = 'remixDefault', metadata?: TemplateType, contractContent?: string, contractName?: string) => {
  if (!workspaceName) throw new Error('workspace name cannot be empty')
  if (checkSpecialChars(workspaceName) || checkSlash(workspaceName)) throw new Error('special characters are not allowed')
  if ((await workspaceExists(workspaceName)) && template === 'remixDefault') throw new Error('Workspace already exists')
  else if (metadata && metadata.type === 'git') {
    // Create the workspace directory first, then clone into it with
    // workspaceExists: true.  This prevents dgit from calling back into
    // filePanel.createWorkspace (which would re-enter the queue).
    const workspaceProvider = plugin.fileProviders.workspace
    await workspaceProvider.createWorkspace(workspaceName)
    // Set workspace metadata on file-panel BEFORE cloning so that dgit's
    // addIsomorphicGitConfigFS() → getCurrentWorkspace() returns the new
    // workspace's absolutePath instead of the previous one.
    await plugin.setWorkspace({ name: workspaceName, isLocalhost: false })
    dispatch(cloneRepositoryRequest())
    try {
      await dgitPlugin.call('dgitApi', 'clone', { url: metadata.url, branch: metadata.branch, workspaceName: workspaceName, workspaceExists: true, depth: 10 })
      dispatch(cloneRepositorySuccess())
    } catch (e) {
      dispatch(cloneRepositoryFailed())
      throw e // re-throw so _createWorkspaceInternal's catch handles it
    }
  } else {
    const workspaceProvider = plugin.fileProviders.workspace
    await workspaceProvider.createWorkspace(workspaceName)
  }
}

export type UrlParametersType = {
  gist: string
  code: string
  shareCode: string
  url: string
  language: string
  ghfolder: string
  remaps: string
}

/**
 * Decode a base64‑encoded string that was produced by TextEncoder with btoa().
 *
 * @param {string} b64Payload  The base64 payload you got from params.code
 */
export const decodeBase64 = (b64Payload: string) => {
  const raw = atob(decodeURIComponent(b64Payload));
  const bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

const isReadme = (path: string) => {
  return ['readme', 'readme.md', 'readme.txt'].includes(path.toLowerCase())
}

export const loadWorkspacePreset = async (template: WorkspaceTemplate = 'remixDefault', opts?, contractContent?: string, contractName?: string) => {
  const workspaceProvider = plugin.fileProviders.workspace
  const electronProvider = plugin.fileProviders.electron
  const params = queryParams.get() as UrlParametersType

  // ── Workspace snapshot (defense in depth) ──
  // Capture the current workspace at the start of this function so that all
  // file writes target the intended workspace even if `this.workspace` is
  // mutated by a concurrent operation that slips past the queue (e.g. init
  // code paths or external plugin calls).
  const _targetWorkspace = workspaceProvider.workspace

  /**
   * Write a file to the workspace that was active when loadWorkspacePreset
   * was called, regardless of what `workspaceProvider.workspace` points to
   * now.  Temporarily swaps the provider's workspace field, writes, and
   * restores it.
   */
  const writeToTargetWorkspace = async (path: string, content: string) => {
    const current = workspaceProvider.workspace
    if (current !== _targetWorkspace) {
      console.warn(
        `[loadWorkspacePreset] workspace drifted: expected "${_targetWorkspace}" but provider has "${current}". ` +
        `Forcing write to target workspace.`
      )
    }
    workspaceProvider.workspace = _targetWorkspace
    try {
      await workspaceProvider.set(path, content)
    } finally {
      // Only restore if nobody else changed it while we were writing.
      // If it was changed to something other than our target, that means
      // a legitimate switch happened and we shouldn't undo it.
      if (workspaceProvider.workspace === _targetWorkspace) {
        workspaceProvider.workspace = current
      }
    }
  }

  console.log('Loading workspace preset with template:', template, 'and URL params:', params)
  switch (template) {
  case 'code-template':
    // creates a new workspace code-sample and loads code from url params.
    try {
      let path = ''
      let content

      if (params.code) {
        await trackMatomoEventAsync(plugin, { category: 'workspace', action: 'template', name: 'code-template-code-param', isClick: false })
        const hashed = bytesToHex(hash.keccakFromString(params.code))

        path = 'contract-' + hashed.replace('0x', '').substring(0, 10) + (params.language && params.language.toLowerCase() === 'yul' ? '.yul' : '.sol')
        content = decodeBase64(params.code)
        if (params.remaps) {
          await trackMatomoEventAsync(plugin, { category: 'workspace', action: 'template', name: 'code-template-remaps-param', isClick: false })
          const remapsContent = decodeBase64(params.remaps)
          await writeToTargetWorkspace('remappings.txt', remapsContent)
        }
        await writeToTargetWorkspace(path, content)
      }
      if (params.shareCode) {
        await trackMatomoEventAsync(plugin, { category: 'workspace', action: 'template', name: 'code-template-shareCode-param', isClick: false })
        const host = '127.0.0.1'
        const port = 5001
        const protocol = 'http'
        // const projectId = ''
        // const projectSecret = ''
        // const auth = 'Basic ' + Buffer.from(projectId + ':' + projectSecret).toString('base64')

        const ipfs = IpfsHttpClient({ port, host, protocol
          , headers: {
            // authorization: auth
          }
        })
        const hashed = bytesToHex(hash.keccakFromString(params.shareCode))

        path = 'contract-' + hashed.replace('0x', '').substring(0, 10) + (params.language && params.language.toLowerCase() === 'yul' ? '.yul' : '.sol')
        const fileData = ipfs.get(params.shareCode)
        for await (const file of fileData) {
          const fileContent = []
          for await (const chunk of file.content) fileContent.push(chunk)
          content = Buffer.concat(fileContent).toString()
        }
        await writeToTargetWorkspace(path, content)
      }
      if (params.url) {
        await trackMatomoEventAsync(plugin, { category: 'workspace', action: 'template', name: 'code-template-url-param', isClick: false })
        const data = await plugin.call('contentImport', 'resolve', params.url)
        path = data.cleanUrl
        content = data.content
        try {
          content = JSON.parse(content) as any
          if (content.language && content.language === 'Solidity' && content.sources) {
            const standardInput: JSONStandardInput = content as JSONStandardInput
            for (const [fname, source] of Object.entries(standardInput.sources)) {
              await writeToTargetWorkspace(fname, source.content)
            }
            return Object.keys(standardInput.sources)[0]
          } else {
            // preserve JSON whitespace if this isn't a Solidity compiler JSON-input-output file
            content = data.content
            await writeToTargetWorkspace(path, content)
          }
        } catch (e) {
          console.log(e)
          await writeToTargetWorkspace(path, content)
        }
      }
      if (params.ghfolder) {
        try {
          await trackMatomoEventAsync(plugin, { category: 'workspace', action: 'template', name: 'code-template-ghfolder-param', isClick: false })
          const files = await plugin.call('contentImport', 'resolveGithubFolder', params.ghfolder)
          for (const [path, content] of Object.entries(files)) {
            await writeToTargetWorkspace(path, content as string)
          }
        } catch (e) {
          console.log(e)
        }
      }

      return path
    } catch (e) {
      console.error(e)
    }
    break

  case 'gist-template':
    // creates a new workspace gist-sample and get the file from gist
    try {
      await trackMatomoEventAsync(plugin, { category: 'workspace', action: 'template', name: 'gist-template', isClick: false })
      const gistId = params.gist
      const response: AxiosResponse = await axios.get(`https://api.github.com/gists/${gistId}`)
      const data = response.data as { files: any }

      if (!data.files) {
        return dispatch(
          displayNotification(
            'Gist load error',
            'No files found',
            'OK',
            null,
            () => {
              dispatch(hideNotification())
            },
            null
          )
        )
      }
      const obj = {}

      let openPath = ''
      for (const [element] of Object.entries(data.files)) {
        const path = element.replace(/\.\.\./g, '/')
        let value
        if (data.files[element].truncated) {
          const response: AxiosResponse = await axios.get(data.files[element].raw_url)
          value = { content: response.data }
        } else {
          value = { content: data.files[element].content }
        }

        if (data.files[element].type === 'application/json') {
          obj['/' + path] = { content: JSON.stringify(value.content, null, '\t') }
        } else
          obj['/' + path] = value

        if (!openPath || isReadme(path)) openPath = path
      }
      plugin.fileManager.setBatchFiles(obj, 'workspace', true, (errorLoadingFile) => {
        if (errorLoadingFile) {
          dispatch(displayNotification('', errorLoadingFile.message || errorLoadingFile, 'OK', null, () => {}, null))
        }
      })
      return openPath
    } catch (e) {
      dispatch(
        displayNotification(
          'Gist load error',
          e.message,
          'OK',
          null,
          () => {
            dispatch(hideNotification())
          },
          null
        )
      )
      console.error(e)
    }
    break

  default:
    try {
      let openPath = ''
      const templateList = Object.keys(templateWithContent)
      if (!templateList.includes(template)) break

      await trackMatomoEventAsync(plugin, { category: 'workspace', action: 'template', name: template, isClick: false })
      // @ts-ignore
      let files = {}
      if (template === 'ozerc20' || template === 'ozerc721' || template === 'ozerc1155') {
        files = await templateWithContent[template](opts, plugin, { contractContent, contractName })
      } else {
        files = await templateWithContent[template](opts, plugin)
      }
      if (files) {
        for (const file in files) {
          try {
            const uniqueFileName = await createNonClashingNameAsync(file, plugin.fileManager)
            if (file === 'remix.config.json') {
              const remixConfig = JSON.parse(files[file])

              remixConfig.project = template
              remixConfig.version = projectVersion
              remixConfig.IDE = window.location.hostname
              await writeToTargetWorkspace(uniqueFileName, JSON.stringify(remixConfig, null, 2))
            } else {
              await writeToTargetWorkspace(uniqueFileName, files[file])
            }
            if ((uniqueFileName.indexOf('contracts/') >= 0 || uniqueFileName.indexOf('src/') >= 0) && !openPath) {
              openPath = uniqueFileName
            } else if (isReadme(uniqueFileName)) {
              openPath = uniqueFileName
            }
          } catch (error) {
            console.error(error)
          }
        }
      }
      return openPath || (files && Object.keys(files)[0])
    } catch (e) {
      dispatch(
        displayNotification(
          'Workspace load error',
          e.message,
          'OK',
          null,
          () => {
            dispatch(hideNotification())
          },
          null
        )
      )
      console.error(e)
    }
    break
  }
}

export const workspaceExists = async (name: string) => {
  const workspaceProvider = plugin.fileProviders.workspace

  // Cloud mode: check the provider's name mapping instead of the filesystem
  if (workspaceProvider.workspaceNameExists) {
    return workspaceProvider.workspaceNameExists(name)
  }

  // Legacy mode: check filesystem
  const browserProvider = plugin.fileProviders.browser
  const workspacePath = 'browser/' + workspaceProvider.workspacesPath + '/' + name

  return await browserProvider.exists(workspacePath)
}

export const fetchWorkspaceDirectory = async (path: string) => {
  if (!path) return
  const provider = plugin.fileManager.currentFileProvider()
  const promise: Promise<FileTree> = new Promise((resolve, reject) => {
    provider.resolveDirectory(path, (error, fileTree: FileTree) => {
      if (error) {
        reject(error)
      }
      resolve(fileTree)
    })
  })

  dispatch(fetchWorkspaceDirectoryRequest())
  promise
    .then((fileTree) => {
      dispatch(fetchWorkspaceDirectorySuccess(path, fileTree))
    })
    .catch((error) => {
      dispatch(fetchWorkspaceDirectoryError(error.message))
    })
  return promise
}

export const renameWorkspace = async (oldName: string, workspaceName: string, cb?: (err: Error, result?: string | number | boolean | Record<string, any>) => void) => {
  return workspaceOperationQueue.run(async function renameWorkspace() {
    // ── Cloud mode: only API rename + update mapping (no local FS rename, dir is UUID) ──
    if (cloudStore.isCloudMode) {
      try {
        const cloudState = cloudStore.getState()
        const cloudWs = cloudState.cloudWorkspaces.find(w => w.name === oldName)
        if (cloudWs) {
          const updated = await renameCloudWorkspaceAction(cloudWs, workspaceName)
          cloudStore.updateCloudWorkspace(updated)
        }
        await dispatch(setRenameWorkspace(oldName, workspaceName))
        await plugin.setWorkspace({ name: workspaceName, isLocalhost: false })
        await plugin.workspaceRenamed(oldName, workspaceName)
        await plugin.setWorkspaces(await getWorkspaces())
        cb && cb(null, workspaceName)
      } catch (cloudErr) {
        console.error('[renameWorkspace] Cloud rename failed:', cloudErr)
        cb && cb(cloudErr as Error)
      }
      return
    }

    // ── Legacy mode ──
    await renameWorkspaceFromProvider(oldName, workspaceName)
    await dispatch(setRenameWorkspace(oldName, workspaceName))
    await plugin.setWorkspace({ name: workspaceName, isLocalhost: false })
    await plugin.deleteWorkspace(oldName)
    await plugin.workspaceRenamed(oldName, workspaceName)
    cb && cb(null, workspaceName)
  })
}

export const renameWorkspaceFromProvider = async (oldName: string, workspaceName: string) => {
  if (!workspaceName) throw new Error('name cannot be empty')
  if (checkSpecialChars(workspaceName) || checkSlash(workspaceName)) throw new Error('special characters are not allowed')
  if (await workspaceExists(workspaceName)) throw new Error('Workspace already exists')
  const browserProvider = plugin.fileProviders.browser
  const workspaceProvider = plugin.fileProviders.workspace
  const workspacesPath = workspaceProvider.workspacesPath
  await browserProvider.rename('browser/' + workspacesPath + '/' + oldName, 'browser/' + workspacesPath + '/' + workspaceName, true)
  await workspaceProvider.setWorkspace(workspaceName)
  await plugin.setWorkspaces(await getWorkspaces())
}

export const deleteWorkspace = async (workspaceName: string, cb?: (err: Error, result?: string | number | boolean | Record<string, any>) => void) => {
  return workspaceOperationQueue.run(async function deleteWorkspace() {
    // ── Cloud mode: delete via API + remove local UUID dir ──
    if (cloudStore.isCloudMode) {
      try {
        const cloudState = cloudStore.getState()
        const cloudWs = cloudState.cloudWorkspaces.find(w => w.name === workspaceName)
        if (cloudWs) {
          await deleteCloudWorkspaceAction(cloudWs)
          cloudStore.removeCloudWorkspace(cloudWs.uuid)
        }
        await dispatch(setDeleteWorkspace(workspaceName))
        plugin.workspaceDeleted(workspaceName)

        // Check remaining cloud workspaces
        const remaining = cloudStore.getState().cloudWorkspaces
        if (remaining.length > 0) {
          // Switch to the last remaining cloud workspace
          const nextWs = remaining[remaining.length - 1]
          try {
            cloudStore.setActiveCloudWorkspace(nextWs.uuid)
            cloudStore.updateSyncStatus(nextWs.uuid, { status: 'loading', lastSync: null, pendingChanges: 0 })
            await switchToCloudWorkspace(nextWs, (status) => {
              cloudStore.updateSyncStatus(nextWs.uuid, status)
            })
            const workspaceProvider = plugin.fileProviders.workspace
            startFileChangeTracking(workspaceProvider, nextWs.uuid)
            dispatch(setMode('browser'))
            dispatch(setCurrentWorkspace({ name: nextWs.name, isGitRepo: false }))
            dispatch(setReadOnlyMode(false))
            localStorage.setItem(cloudLocalKey('lastCloudWorkspace'), nextWs.name)
          } catch (switchErr) {
            console.error('[deleteWorkspace] Failed to switch to next cloud workspace:', switchErr)
          }
        } else {
          // No cloud workspaces left — create a new default one with template
          // Guard against double-creation: the React useEffect in workspace/topbar
          // will also fire switchWorkspace(NO_WORKSPACE) when the workspace list empties.
          if (_creatingDefaultCloudWorkspace) {
          } else {
            _creatingDefaultCloudWorkspace = true
            try {
              plugin.call('notification', 'toast', 'Creating default cloud workspace…')
              await _createWorkspaceInternal('cloud workspace', 'remixDefault')
            } finally {
              _creatingDefaultCloudWorkspace = false
            }
          }
        }

        await plugin.setWorkspaces(await getWorkspaces())
        cb && cb(null, workspaceName)
      } catch (cloudErr) {
        console.error('[deleteWorkspace] Cloud deletion failed:', cloudErr)
        cb && cb(cloudErr as Error)
      }
      return
    }

    // ── Legacy mode ──
    await deleteWorkspaceFromProvider(workspaceName)
    await dispatch(setDeleteWorkspace(workspaceName))
    plugin.workspaceDeleted(workspaceName)
    cb && cb(null, workspaceName)
  })
}

export const deleteAllWorkspaces = async () => {
  const workspaces = await getWorkspaces()
  for (const workspace of workspaces) {
    await deleteWorkspaceFromProvider(workspace.name)
    await dispatch(setDeleteWorkspace(workspace.name))
    plugin.workspaceDeleted(workspace.name)
  }
}

const deleteWorkspaceFromProvider = async (workspaceName: string) => {
  const workspacesPath = plugin.fileProviders.workspace.workspacesPath

  await plugin.fileManager.closeAllFiles()
  await plugin.fileProviders.browser.remove(workspacesPath + '/' + workspaceName)
  await plugin.setWorkspaces(await getWorkspaces())
}

export const switchToWorkspace = async (name: string) => {
  return workspaceOperationQueue.run(async function switchToWorkspace() {
    console.log('[switchToWorkspace] called with name=', name, 'isCloudMode=', cloudStore.isCloudMode, 'stack=', new Error().stack?.split('\\n').slice(1, 4).join(' | '))
    // ── Cloud mode: delegate to cloud workspace switch ──
    if (cloudStore.isCloudMode) {
      try {
        const cloudState = cloudStore.getState()
        const cloudWs = cloudState.cloudWorkspaces.find(w => w.name === name)
        if (cloudWs) {
          // Set active immediately so the UI can show loading state for this workspace
          cloudStore.setActiveCloudWorkspace(cloudWs.uuid)
          cloudStore.updateSyncStatus(cloudWs.uuid, { status: 'loading', lastSync: null, pendingChanges: 0 })
          await switchToCloudWorkspace(cloudWs, (status) => {
            cloudStore.updateSyncStatus(cloudWs.uuid, status)
          })
          // Set up file change tracking
          const workspaceProvider = plugin.fileProviders.workspace
          startFileChangeTracking(workspaceProvider, cloudWs.uuid)
          dispatch(setMode('browser'))
          dispatch(setCurrentWorkspace({ name, isGitRepo: false }))
          dispatch(setReadOnlyMode(false))
          localStorage.setItem(cloudLocalKey('lastCloudWorkspace'), name)
          return
        }
      } catch (e) {
        console.error('[switchToWorkspace] Cloud workspace switch failed:', e)
        return
      }
    }

    // ── Legacy mode ──
    await plugin.fileManager.closeAllFiles()
    if (name === LOCALHOST) {
      const isActive = await plugin.call('manager', 'isActive', 'remixd')

      if (!isActive) await plugin.call('manager', 'activatePlugin', 'remixd')
      dispatch(setMode('localhost'))
      plugin.emit('setWorkspace', { name: null, isLocalhost: true })
    } else if (name === NO_WORKSPACE) {
      // In both legacy and cloud mode, ensure at least one workspace exists.
      // In cloud mode, createWorkspace() will call the cloud provider which
      // registers the workspace on the API and sets up sync.
      // Guard: if deleteWorkspace is already creating a default, skip.
      if (cloudStore.isCloudMode && _creatingDefaultCloudWorkspace) {
        return
      }
      if (cloudStore.isCloudMode) _creatingDefaultCloudWorkspace = true
      try {
        plugin.call('notification', 'toast', `No workspace found! Creating default workspace ....`)
        await _createWorkspaceInternal('cloud workspace', 'remixDefault')
      } finally {
        if (cloudStore.isCloudMode) _creatingDefaultCloudWorkspace = false
      }
    } else if (name === ELECTRON) {
      await plugin.fileProviders.workspace.setWorkspace(name)
      await plugin.setWorkspace({ name, isLocalhost: false })
      dispatch(setMode('browser'))
      dispatch(setCurrentWorkspace({ name, isGitRepo: false }))

    } else {
      const isActive = await plugin.call('manager', 'isActive', 'remixd')

      if (isActive) await plugin.call('manager', 'deactivatePlugin', 'remixd')
      await plugin.fileProviders.workspace.setWorkspace(name)
      await plugin.setWorkspace({ name, isLocalhost: false })
      const isGitRepo = await plugin.fileManager.isGitRepo()
      dispatch(setMode('browser'))
      dispatch(setCurrentWorkspace({ name, isGitRepo }))
      dispatch(setReadOnlyMode(false))
    }
  })
}

const loadFile = (name, file, provider, cb?): void => {
  const fileReader = new FileReader()

  fileReader.onload = async function (event) {
    if (checkSpecialChars(file.name)) {
      return dispatch(displayNotification('File Upload Failed', 'Special characters are not allowed', 'Close', null, async () => {}))
    }
    try {
      await provider.set(name, event.target.result)
    } catch (error) {
      return dispatch(displayNotification('File Upload Failed', 'Failed to create file ' + name, 'Close', null, async () => {}))
    }

    const config = plugin.registry.get('config').api
    const editor = plugin.registry.get('editor').api

    if (config.get('currentFile') === name && editor.currentContent() !== event.target.result) {
      editor.setText(name, event.target.result)
    }
  }
  fileReader.readAsText(file)
  cb && cb(null, true)
}

export const uploadFile = async (target, targetFolder: string, cb?: (err: Error, result?: string | number | boolean | Record<string, any>) => void) => {
  // TODO The file explorer is merely a view on the current state of
  // the files module. Please ask the user here if they want to overwrite
  // a file and then just use `files.add`. The file explorer will
  // pick that up via the 'fileAdded' event from the files module.
  [...target.files].forEach(async (file) => {
    const workspaceProvider = plugin.fileProviders.workspace
    const name = targetFolder === '/' ? file.name : `${targetFolder}/${file.name}`

    if (!(await workspaceProvider.exists(name))) {
      loadFile(name, file, workspaceProvider, cb)
    } else {
      const modalContent: AppModal = {
        id: 'overwriteUploadFile',
        title: 'Confirm overwrite',
        message: `The file "${name}" already exists! Would you like to overwrite it?`,
        modalType: ModalTypes.confirm,
        okLabel: 'OK',
        cancelLabel: 'Cancel',
        okFn: () => {
          loadFile(name, file, workspaceProvider, cb)
        },
        cancelFn: () => {},
        hideFn: () => {},
      }
      plugin.call('notification', 'modal', modalContent)
    }
  })
}

export const uploadFolderExcludingRootFolder = async (target, targetFolder: string, cb?: (err: Error, result?: string | number | boolean | Record<string, any>) => void) => {
  for (const file of [...target.files]) {
    const workspaceProvider = plugin.fileProviders.workspace
    const name = targetFolder === '/' ? file.webkitRelativePath.split('/').slice(1).join('/') : `${targetFolder}/${file.webkitRelativePath}`
    if (!(await workspaceProvider.exists(name))) {
      loadFile(name, file, workspaceProvider, cb)
    } else {
      const modalContent: AppModal = {
        id: 'overwriteUploadFolderFile',
        title: 'Confirm overwrite',
        message: `The file "${name}" already exists! Would you like to overwrite it?`,
        modalType: ModalTypes.confirm,
        okLabel: 'OK',
        cancelLabel: 'Cancel',
        okFn: () => {
          loadFile(name, file, workspaceProvider, cb)
        },
        cancelFn: () => {},
        hideFn: () => {},
      }
      plugin.call('notification', 'modal', modalContent)
    }
  }
}

export const uploadFolder = async (target, targetFolder: string, cb?: (err: Error, result?: string | number | boolean | Record<string, any>) => void) => {
  for (const file of [...target.files]) {
    const workspaceProvider = plugin.fileProviders.workspace
    const name = targetFolder === '/' ? file.webkitRelativePath : `${targetFolder}/${file.webkitRelativePath}`
    if (!(await workspaceProvider.exists(name))) {
      loadFile(name, file, workspaceProvider, cb)
    } else {
      const modalContent: AppModal = {
        id: 'overwriteUploadFolderFile',
        title: 'Confirm overwrite',
        message: `The file "${name}" already exists! Would you like to overwrite it?`,
        modalType: ModalTypes.confirm,
        okLabel: 'OK',
        cancelLabel: 'Cancel',
        okFn: () => {
          loadFile(name, file, workspaceProvider, cb)
        },
        cancelFn: () => {},
        hideFn: () => {},
      }
      plugin.call('notification', 'modal', modalContent)
    }
  }
}

export type WorkspaceType = { name: string; isGitRepo: boolean; hasGitSubmodules: boolean; branches?: { remote: any; name: string }[]; currentBranch?: string; remoteId?: string; cloudUuid?: string }
export const getWorkspaces = async (): Promise<WorkspaceType[]> | undefined => {
  return workspaceOperationQueue.run(async function getWorkspaces() {
    try {
      // ── Cloud mode: return cloud workspaces from the store ──
      if (cloudStore.isCloudMode) {
        const cloudState = cloudStore.getState()
        const cloudWorkspaces: WorkspaceType[] = cloudState.cloudWorkspaces.map(cw => ({
          name: cw.name,
          isGitRepo: false,
          hasGitSubmodules: false,
          isGist: null,
          remoteId: cw.uuid,
          cloudUuid: cw.uuid,
        }))
        // Note: we intentionally do NOT call plugin.setWorkspaces() here to
        // avoid a cascading re-render loop.  The callers already setWorkspaces
        // explicitly when needed (e.g. after createWorkspace).
        return cloudWorkspaces
      }

      // ── Legacy mode: scan local .workspaces/ directory ──
      const workspaces: WorkspaceType[] = await new Promise((resolve, reject) => {
        const workspacesPath = plugin.fileProviders.workspace.workspacesPath
        plugin.fileProviders.browser.resolveDirectory('/' + workspacesPath, (error, items) => {

          if (error) {
            return reject(error)
          }
          Promise.all(
            Object.keys(items)
              .filter((item) => items[item].isDirectory)
              .map(async (folder) => {
                const name = folder.replace(workspacesPath + '/', '')
                const isGitRepo: boolean = await plugin.fileProviders.browser.exists('/' + folder + '/.git')
                const hasGitSubmodules: boolean = await plugin.fileProviders.browser.exists('/' + folder + '/.gitmodules')

                // Read remoteId from remix.config.json if it exists
                let remoteId: string | undefined
                try {
                  const configPath = '/' + folder + '/remix.config.json'
                  const configExists = await plugin.fileProviders.browser.exists(configPath)
                  if (configExists) {
                    const configContent = await plugin.fileProviders.browser.get(configPath)
                    const config = JSON.parse(configContent)
                    remoteId = config?.['remote-workspace']?.remoteId
                  }
                } catch (e) {
                  // ignore config read errors
                }

                if (isGitRepo) {
                  let branches = []
                  let currentBranch = null

                  branches = await getGitRepoBranches(folder)
                  currentBranch = await getGitRepoCurrentBranch(folder)
                  return {
                    name,
                    isGitRepo,
                    branches,
                    currentBranch,
                    hasGitSubmodules,
                    isGist: null,
                    remoteId
                  }
                } else {
                  return {
                    name,
                    isGitRepo,
                    hasGitSubmodules,
                    isGist: plugin.isGist(name), // plugin is filePanel
                    remoteId
                  }
                }
              })
          ).then((workspacesList) => resolve(workspacesList))
        })
      })
      // Filter out ghost workspaces with null/empty names (corrupted IndexedDB entries)
      const validWorkspaces = workspaces.filter(ws => ws && ws.name)
      await plugin.setWorkspaces(validWorkspaces)
      return validWorkspaces
    } catch (e) {
      console.error('[getWorkspaces] Failed to retrieve workspaces:', e)
      return []
    }
  })
}

export const cloneRepository = async (url: string) => {
  return workspaceOperationQueue.run(async function cloneRepository() {
    const config = plugin.registry.get('config').api
    const token = config.get('settings/gist-access-token')
    const repoConfig: cloneInputType = { url, token, depth: 10 }

    if (plugin.registry.get('platform').api.isDesktop()) {
      try {
        await dgitPlugin.call('dgitApi', 'clone', repoConfig)
      } catch (e) {
        console.log(e)
        plugin.call('notification', 'alert', {
          id: 'cloneGitRepository',
          message: e
        })
      }
    } else {
      try {
        const repoName = await getRepositoryTitle(url)

        await _createWorkspaceInternal(repoName, 'blank', null, true, null, true, false)

        dispatch(cloneRepositoryRequest())
        try {
          await dgitPlugin.call('dgitApi', 'clone', { ...repoConfig, workspaceExists: true, workspaceName: repoName, depth: 10 })

          if (!plugin.registry.get('platform').api.isDesktop()) {
            const isActive = await plugin.call('manager', 'isActive', 'dgit')
            if (!isActive) await plugin.call('manager', 'activatePlugin', 'dgit')
          }
          await fetchWorkspaceDirectory(ROOT_PATH)
          const workspacesPath = plugin.fileProviders.workspace.workspacesPath
          // Use the provider's internal workspace dir (UUID in cloud mode, name in legacy)
          const workspaceDir = plugin.fileProviders.workspace.workspace
          const branches = await getGitRepoBranches(workspacesPath + '/' + workspaceDir)

          dispatch(setCurrentWorkspaceBranches(branches))
          const currentBranch = await getGitRepoCurrentBranch(workspacesPath + '/' + workspaceDir)

          dispatch(setCurrentWorkspaceCurrentBranch(currentBranch))
          dispatch(cloneRepositorySuccess())
        } catch {
          const cloneModal = {
            id: 'cloneGitRepository',
            title: 'Clone Git Repository',
            message:
            'An error occurred: Please check that you have the correct URL for the repo. If the repo is private, you need to add your github credentials (with the valid token permissions) in the Git plugin',
            modalType: 'modal',
            okLabel: plugin.registry.get('platform').api.isDesktop() ? 'Select or create folder' : 'OK',
            okFn: async () => {
              await deleteWorkspace(repoName)
              dispatch(cloneRepositoryFailed())
            },
            hideFn: async () => {
              await deleteWorkspace(repoName)
              dispatch(cloneRepositoryFailed())
            }
          }
          plugin.call('notification', 'modal', cloneModal)
        }
      } catch (e) {
        dispatch(displayPopUp('An error occurred: ' + e))
      }
    }
  })
}

export const checkGit = async () => {
  try {
    const isGitRepo = await plugin.fileManager.isGitRepo()
    const hasGitSubmodule = await plugin.fileManager.hasGitSubmodules()
    dispatch(setCurrentWorkspaceIsGitRepo(isGitRepo))
    dispatch(setCurrentWorkspaceHasGitSubmodules(hasGitSubmodule))
    await refreshBranches()
    const currentBranch: branch = await dgitPlugin.call('dgitApi', 'currentbranch')
    dispatch(setCurrentWorkspaceCurrentBranch(currentBranch))
  } catch (e) {}
}

export const getRepositoryTitle = async (url: string) => {
  const urlArray = url.split('/')
  let name = urlArray.length > 0 ? urlArray[urlArray.length - 1] : ''

  if (!name) name = 'Undefined'
  let _counter
  let exist = true

  do {
    const isDuplicate = await workspaceExists(name + (_counter || ''))

    if (isDuplicate) _counter = (_counter || 0) + 1
    else exist = false
  } while (exist)
  const counter = _counter || ''

  return name + counter
}

export const getGitRepoBranches = async (workspacePath: string) => {
  const gitConfig: { fs: IndexedDBStorage; dir: string } = {
    fs: window.remixFileSystemCallback,
    dir: addSlash(workspacePath),
  }
  const branches: branch[] = await dgitPlugin.call('dgitApi', 'branches', { ...gitConfig })
  return branches
}

export const getGitRepoCurrentBranch = async (workspaceName: string) => {
  const gitConfig: { fs: IndexedDBStorage; dir: string } = {
    fs: window.remixFileSystemCallback,
    dir: addSlash(workspaceName),
  }
  const currentBranch: branch = await dgitPlugin.call('dgitApi', 'currentbranch', { ...gitConfig })
  return currentBranch
}

export const showAllBranches = async () => {
  if (plugin.registry.get('platform').api.isDesktop()) return
  const isActive = await plugin.call('manager', 'isActive', 'dgit')
  if (!isActive) await plugin.call('manager', 'activatePlugin', 'dgit')
  plugin.call('menuicons', 'select', 'dgit')
  plugin.call('dgit', 'open', gitUIPanels.BRANCHES)
}

export const getGitConfig = async () => {
  const username = await plugin.call('settings', 'get', 'settings/github-user-name')
  const email = await plugin.call('settings', 'get', 'settings/github-email')
  const token = await plugin.call('settings', 'get', 'settings/gist-access-token')
  const config = { username, email, token }
  dispatch(setGitConfig(config))
  return config
}

const refreshBranches = async () => {
  const workspacesPath = plugin.fileProviders.workspace.workspacesPath
  const workspaceName = plugin.fileProviders.workspace.workspace
  const branches = await getGitRepoBranches(workspacesPath + '/' + workspaceName)

  dispatch(setCurrentWorkspaceBranches(branches))
}

export const switchBranch = async (branch: branch) => {
  console.log('switch', branch)
  await plugin.call('fileManager', 'closeAllFiles')
  const localChanges = await hasLocalChanges()

  if (Array.isArray(localChanges) && localChanges.length > 0) {
    const cloneModal = {
      id: 'switchBranch',
      title: 'Switch Git Branch',
      message: `Your local changes to the following files would be overwritten by checkout.\n
      ${localChanges.join('\n')}\n
      Do you want to continue?`,
      modalType: 'modal',
      okLabel: 'Force Checkout',
      okFn: async () => {
        dispatch(cloneRepositoryRequest())
        dgitPlugin
          .call('dgitApi', 'checkout', { ref: branch.name, force: true, refresh: false })
          .then(async () => {
            await fetchWorkspaceDirectory(ROOT_PATH)
            dispatch(setCurrentWorkspaceCurrentBranch(branch))
            dispatch(cloneRepositorySuccess())
          })
          .catch(() => {
            dispatch(cloneRepositoryFailed())
          })
      },
      cancelLabel: 'Cancel',
      cancelFn: () => {},
      hideFn: () => {},
    }
    plugin.call('notification', 'modal', cloneModal)
  } else {
    dispatch(cloneRepositoryRequest())
    dgitPlugin
      .call('dgitApi', 'checkout', { ref: branch.name, force: true, refresh: false })
      .then(async () => {
        await fetchWorkspaceDirectory(ROOT_PATH)
        dispatch(setCurrentWorkspaceCurrentBranch(branch))
        dispatch(cloneRepositorySuccess())
      })
      .catch(() => {
        dispatch(cloneRepositoryFailed())
      })
  }
}

export const createNewBranch = async (branch: string) => {
  const promise = dgitPlugin.call('dgitApi', 'branch', { ref: branch, checkout: true, refresh: false })

  dispatch(cloneRepositoryRequest())
  promise
    .then(async () => {
      await fetchWorkspaceDirectory(ROOT_PATH)
      dispatch(setCurrentWorkspaceCurrentBranch({
        remote: null,
        name: branch,
      }))
      const workspacesPath = plugin.fileProviders.workspace.workspacesPath
      const workspaceName = plugin.fileProviders.workspace.workspace
      const branches = await getGitRepoBranches(workspacesPath + '/' + workspaceName)

      dispatch(setCurrentWorkspaceBranches(branches))
      dispatch(cloneRepositorySuccess())
    })
    .catch(() => {
      dispatch(cloneRepositoryFailed())
    })
  return promise
}

export const updateGitSubmodules = async () => {
  dispatch(cloneRepositoryRequest())
  try {
    const config = plugin.registry.get('config').api
    const token = config.get('settings/gist-access-token')
    const repoConfig = { token }
    await dgitPlugin.call('dgitApi', 'updateSubmodules', repoConfig)
    dispatch(cloneRepositorySuccess())
  } catch (e) {
    dispatch(cloneRepositoryFailed())
    plugin.call('notification', 'toast', 'Failed to update git submodules: ' + (e.message || e))
  }
}

export const checkoutRemoteBranch = async (branch: branch) => {
  const localChanges = await hasLocalChanges()

  if (Array.isArray(localChanges) && localChanges.length > 0) {
    const cloneModal = {
      id: 'checkoutRemoteBranch',
      title: 'Checkout Remote Branch',
      message: `Your local changes to the following files would be overwritten by checkout.\n
      ${localChanges.join('\n')}\n
      Do you want to continue?`,
      modalType: 'modal',
      okLabel: 'Force Checkout',
      okFn: async () => {
        dispatch(cloneRepositoryRequest())
        dgitPlugin
          .call('dgitApi', 'checkout', {
            ref: branch.name,
            force: true,
          })
          .then(async () => {
            await fetchWorkspaceDirectory(ROOT_PATH)
            dispatch(setCurrentWorkspaceCurrentBranch(branch))
            const workspacesPath = plugin.fileProviders.workspace.workspacesPath
            const workspaceName = plugin.fileProviders.workspace.workspace
            const branches = await getGitRepoBranches(workspacesPath + '/' + workspaceName)

            dispatch(setCurrentWorkspaceBranches(branches))
            dispatch(cloneRepositorySuccess())
          })
          .catch(() => {
            dispatch(cloneRepositoryFailed())
          })
      },
      cancelLabel: 'Cancel',
      cancelFn: () => {},
      hideFn: () => {},
    }
    plugin.call('notification', 'modal', cloneModal)
  } else {
    dispatch(cloneRepositoryRequest())
    dgitPlugin
      .call('dgitApi', 'checkout',{
        ref: branch.name,
        force: true,
        refresh: false,
      })
      .then(async () => {
        await fetchWorkspaceDirectory(ROOT_PATH)
        dispatch(setCurrentWorkspaceCurrentBranch(branch))
        const workspacesPath = plugin.fileProviders.workspace.workspacesPath
        const workspaceName = plugin.fileProviders.workspace.workspace
        const branches = await getGitRepoBranches(workspacesPath + '/' + workspaceName)

        dispatch(setCurrentWorkspaceBranches(branches))
        dispatch(cloneRepositorySuccess())
      })
      .catch(() => {
        dispatch(cloneRepositoryFailed())
      })
  }
}

export const openElectronFolder = async (path: string) => {
  await plugin.call('fs', 'openFolderInSameWindow', path)
}

export const getElectronRecentFolders = async () => {
  const folders = await plugin.call('fs', 'getRecentFolders')
  dispatch(setElectronRecentFolders(folders))
  return folders
}

export const removeRecentElectronFolder = async (path: string) => {
  await plugin.call('fs', 'removeRecentFolder', path)
  await getElectronRecentFolders()
}

export const hasLocalChanges = async () => {
  const filesStatus = await dgitPlugin.call('dgitApi', 'status')
  const uncommittedFiles = getUncommittedFiles(filesStatus)

  return uncommittedFiles
}