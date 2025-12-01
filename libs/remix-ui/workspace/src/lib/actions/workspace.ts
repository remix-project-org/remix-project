import React from 'react'
import { bytesToHex } from '@ethereumjs/util'
import { trackMatomoEventAsync } from '@remix-api'
import { hash } from '@remix-project/remix-lib'
import { createNonClashingNameAsync } from '@remix-ui/helper'
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
import * as templates from '@remix-project/remix-ws-templates'
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
  if (plugin.registry.get('platform').api.isDesktop()) {
    if (workspaceTemplateName) {
      await plugin.call('remix-templates', 'loadTemplateInNewWindow', workspaceTemplateName, opts, contractContent, contractName)
    }
    return
  }
  await plugin.fileManager.closeAllFiles()
  const metadata = TEMPLATE_METADATA[workspaceTemplateName]
  const promise = createWorkspaceTemplate(workspaceName, workspaceTemplateName, metadata, contractContent, contractName)
  dispatch(createWorkspaceRequest())
  promise.then(async () => {
    dispatch(createWorkspaceSuccess({ name: workspaceName, isGitRepo }))
    await plugin.setWorkspace({ name: workspaceName, isLocalhost: false })
    await plugin.workspaceCreated(workspaceName)

    if (isGitRepo && createCommit) {
      const name = await plugin.call('settings', 'get', 'settings/github-user-name')
      const email = await plugin.call('settings', 'get', 'settings/github-email')
      const currentBranch: branch = await dgitPlugin.call('dgitApi', 'currentbranch')

      if (!currentBranch) {
        // if (!name || !email) {
        //   await plugin.call('notification', 'toast', 'To use Git features, add username and email to the Github section of the Git plugin.')
        // } else {
        // commit the template as first commit
        plugin.call('notification', 'toast', 'Creating initial git commit ...')

        await dgitPlugin.call('dgit', 'init')
        if (!isEmpty) await loadWorkspacePreset(workspaceTemplateName, opts, contractContent, contractName)
        const status = await dgitPlugin.call('dgitApi', 'status', { ref: 'HEAD' })

        Promise.all(
          status.map(([filepath, , worktreeStatus]) =>
            worktreeStatus
              ? dgitPlugin.call('dgitApi', 'add', {
                filepath: removeSlash(filepath),
              })
              : dgitPlugin.call('dgitApi', 'rm', {
                filepath: removeSlash(filepath),
              })
          )
        ).then(async () => {
          await dgitPlugin.call('dgitApi', 'commit', {
            author: {
              name,
              email,
            },
            message: `Initial commit: remix template ${workspaceTemplateName}`,
          })
        })
      }
      // }
    }

    await populateWorkspace(workspaceTemplateName, opts, isEmpty, (err: Error) => { cb && cb(err, workspaceName) }, isGitRepo, createCommit, contractContent, contractName)
    // this call needs to be here after the callback because it calls dGitProvider which also calls this function and that would cause an infinite loop
    await plugin.setWorkspaces(await getWorkspaces())
  }).catch((error) => {
    dispatch(createWorkspaceError(error.message))
    cb && cb(error)
  })
  return promise
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
    setTimeout(() => {
      plugin.call(metadata.name, metadata.endpoint, ...metadata.params).then(() => {
        dispatch(cloneRepositorySuccess())
      }).catch((e) => {
        dispatch(cloneRepositorySuccess())
        plugin.call('notification', 'toast', 'error adding template ' + (e.message || e))
      })
    }, 5000)
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
    dispatch(cloneRepositoryRequest())
    await dgitPlugin.call('dgitApi', 'clone', { url: metadata.url, branch: metadata.branch, workspaceName: workspaceName, depth: 10 })
    dispatch(cloneRepositorySuccess())
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

export const loadWorkspacePreset = async (template: WorkspaceTemplate = 'remixDefault', opts?, contractContent?: string, contractName?: string) => {
  const workspaceProvider = plugin.fileProviders.workspace
  const electronProvider = plugin.fileProviders.electron
  const params = queryParams.get() as UrlParametersType

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
        await workspaceProvider.set(path, content)
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
        await workspaceProvider.set(path, content)
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
              await workspaceProvider.set(fname, source.content)
            }
            return Object.keys(standardInput.sources)[0]
          } else {
            // preserve JSON whitespace if this isn't a Solidity compiler JSON-input-output file
            content = data.content
            await workspaceProvider.set(path, content)
          }
        } catch (e) {
          console.log(e)
          await workspaceProvider.set(path, content)
        }
      }
      if (params.ghfolder) {
        try {
          await trackMatomoEventAsync(plugin, { category: 'workspace', action: 'template', name: 'code-template-ghfolder-param', isClick: false })
          const files = await plugin.call('contentImport', 'resolveGithubFolder', params.ghfolder)
          for (const [path, content] of Object.entries(files)) {
            await workspaceProvider.set(path, content)
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
      }
      plugin.fileManager.setBatchFiles(obj, 'workspace', true, (errorLoadingFile) => {
        if (errorLoadingFile) {
          dispatch(displayNotification('', errorLoadingFile.message || errorLoadingFile, 'OK', null, () => {}, null))
        }
      })
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
      const templateList = Object.keys(templateWithContent)
      if (!templateList.includes(template)) break

      await trackMatomoEventAsync(plugin, { category: 'workspace', action: 'template', name: template, isClick: false })
      // @ts-ignore
      let files = {}
      if (template === 'ozerc20' || template === 'ozerc721' || template === 'ozerc1155') {
        files = await templateWithContent[template](opts, contractContent, contractName)
      }
      else {
        files = await templateWithContent[template](opts, plugin)
      }
      for (const file in files) {
        try {
          const uniqueFileName = await createNonClashingNameAsync(file, plugin.fileManager)
          if (file === 'remix.config.json') {
            const remixConfig = JSON.parse(files[file])

            remixConfig.project = template
            remixConfig.version = projectVersion
            remixConfig.IDE = window.location.hostname
            await workspaceProvider.set(uniqueFileName, JSON.stringify(remixConfig, null, 2))
          } else {
            await workspaceProvider.set(uniqueFileName, files[file])
          }
        } catch (error) {
          console.error(error)
        }
      }
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
  await renameWorkspaceFromProvider(oldName, workspaceName)
  await dispatch(setRenameWorkspace(oldName, workspaceName))
  await plugin.setWorkspace({ name: workspaceName, isLocalhost: false })
  await plugin.deleteWorkspace(oldName)
  await plugin.workspaceRenamed(oldName, workspaceName)
  cb && cb(null, workspaceName)
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
  await deleteWorkspaceFromProvider(workspaceName)
  await dispatch(setDeleteWorkspace(workspaceName))
  plugin.workspaceDeleted(workspaceName)
  cb && cb(null, workspaceName)
}

export const deleteAllWorkspaces = async () => {
  await (
    await getWorkspaces()
  ).map(async (workspace) => {
    await deleteWorkspaceFromProvider(workspace.name)
    await dispatch(setDeleteWorkspace(workspace.name))
    plugin.workspaceDeleted(workspace.name)
  })
}

const deleteWorkspaceFromProvider = async (workspaceName: string) => {
  const workspacesPath = plugin.fileProviders.workspace.workspacesPath

  await plugin.fileManager.closeAllFiles()
  await plugin.fileProviders.browser.remove(workspacesPath + '/' + workspaceName)
  await plugin.setWorkspaces(await getWorkspaces())
}

export const switchToWorkspace = async (name: string) => {
  await plugin.fileManager.closeAllFiles()
  if (name === LOCALHOST) {
    const isActive = await plugin.call('manager', 'isActive', 'remixd')

    if (!isActive) await plugin.call('manager', 'activatePlugin', 'remixd')
    dispatch(setMode('localhost'))
    plugin.emit('setWorkspace', { name: null, isLocalhost: true })
  } else if (name === NO_WORKSPACE) {
    // if there is no other workspace, create remix default workspace
    plugin.call('notification', 'toast', `No workspace found! Creating default workspace ....`)
    await createWorkspace('default_workspace', 'remixDefault')
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

export type WorkspaceType = { name: string; isGitRepo: boolean; hasGitSubmodules: boolean; branches?: { remote: any; name: string }[]; currentBranch?: string }
export const getWorkspaces = async (): Promise<WorkspaceType[]> | undefined => {
  try {
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
                  isGist: null
                }
              } else {
                return {
                  name,
                  isGitRepo,
                  hasGitSubmodules,
                  isGist: plugin.isGist(name) // plugin is filePanel
                }
              }
            })
        ).then((workspacesList) => resolve(workspacesList))
      })
    })
    await plugin.setWorkspaces(workspaces)
    return workspaces
  } catch (e) {}
}

export const cloneRepository = async (url: string) => {
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

      await createWorkspace(repoName, 'blank', null, true, null, true, false)
      const promise = dgitPlugin.call('dgitApi', 'clone', { ...repoConfig, workspaceExists: true, workspaceName: repoName, depth:10 })

      dispatch(cloneRepositoryRequest())
      promise
        .then(async () => {
          if (!plugin.registry.get('platform').api.isDesktop()) {
            const isActive = await plugin.call('manager', 'isActive', 'dgit')
            if (!isActive) await plugin.call('manager', 'activatePlugin', 'dgit')
          }
          await fetchWorkspaceDirectory(ROOT_PATH)
          const workspacesPath = plugin.fileProviders.workspace.workspacesPath
          const branches = await getGitRepoBranches(workspacesPath + '/' + repoName)

          dispatch(setCurrentWorkspaceBranches(branches))
          const currentBranch = await getGitRepoCurrentBranch(workspacesPath + '/' + repoName)

          dispatch(setCurrentWorkspaceCurrentBranch(currentBranch))
          dispatch(cloneRepositorySuccess())
        }).catch(() => {
          const cloneModal = {
            id: 'cloneGitRepository',
            title: 'Clone Git Repository',
            message:
            'An error occurred: Please check that you have the correct URL for the repo. If the repo is private, you need to add your github credentials (with the valid token permissions) in the Git plugin',
            modalType: 'modal',
            okLabel: plugin.registry.get('platform').api.isDesktop() ? 'Select or create folder':'OK',
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
        })
    } catch (e) {
      dispatch(displayPopUp('An error occurred: ' + e))
    }
  }
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
  const config = plugin.registry.get('config').api
  const token = config.get('settings/gist-access-token')
  const repoConfig = { token }
  await dgitPlugin.call('dgitApi', 'updateSubmodules', repoConfig)
  dispatch(cloneRepositorySuccess())
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
