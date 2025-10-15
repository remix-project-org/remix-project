/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import React from 'react'
import { extractNameFromKey, createNonClashingNameAsync } from '@remix-ui/helper'
import Gists from 'gists'
import { customAction } from '@remixproject/plugin-api'
import { trackMatomoEventAsync } from '@remix-api'
import { displayNotification, displayPopUp, fetchDirectoryError, fetchDirectoryRequest, fetchDirectorySuccess, focusElement, fsInitializationCompleted, hidePopUp, removeInputFieldSuccess, setCurrentLocalFilePath, setCurrentWorkspace, setExpandPath, setMode, setWorkspaces } from './payload'
import { listenOnPluginEvents, listenOnProviderEvents } from './events'
import { createWorkspaceTemplate, getWorkspaces, loadWorkspacePreset, setPlugin, workspaceExists } from './workspace'
import { QueryParams, Registry } from '@remix-project/remix-lib'
import { fetchContractFromEtherscan, fetchContractFromBlockscout } from '@remix-project/core-plugin' // eslint-disable-line
import JSZip from 'jszip'
import { Actions, FileTree } from '../types'
import IpfsHttpClient from 'ipfs-http-client'
import { AppModal, ModalTypes } from '@remix-ui/app'
import { Topbar } from 'apps/remix-ide/src/app/components/top-bar'

export * from './events'
export * from './workspace'

const queryParams = new QueryParams()

let plugin, dispatch: React.Dispatch<Actions>

export type UrlParametersType = {
  gist: string,
  code: string,
  shareCode: string,
  url: string,
  address: string
  opendir: string,
  blockscout: string,
  ghfolder: string
  endpoint: string
}

const basicWorkspaceInit = async (workspaces: { name: string; isGitRepo: boolean; }[], workspaceProvider) => {
  if (workspaces.length === 0) {
    await createWorkspaceTemplate('default_workspace', 'remixDefault')
    plugin.setWorkspace({ name: 'default_workspace', isLocalhost: false })
    dispatch(setCurrentWorkspace({ name: 'default_workspace', isGitRepo: false }))
    await loadWorkspacePreset('remixDefault')
  } else {
    if (workspaces.length > 0) {
      const workspace = workspaces[workspaces.length - 1]
      const workspaceName = (workspace || {}).name

      workspaceProvider.setWorkspace(workspaceName)
      plugin.setWorkspace({ name: workspaceName, isLocalhost: false })
      dispatch(setCurrentWorkspace(workspace))
    }
  }
}

export const initWorkspace = (filePanelPlugin) => async (reducerDispatch: React.Dispatch<Actions>) => {
  if (filePanelPlugin) {
    plugin = filePanelPlugin
    dispatch = reducerDispatch
    setPlugin(plugin, dispatch)
    const workspaceProvider = filePanelPlugin.fileProviders.workspace
    const localhostProvider = filePanelPlugin.fileProviders.localhost
    const electrOnProvider = filePanelPlugin.fileProviders.electron
    const params = queryParams.get() as UrlParametersType
    let editorMounted = false
    let filePathToOpen = null
    let workspaces = []
    plugin.on('editor', 'editorMounted', async () => {
      editorMounted = true
      if (filePathToOpen){
        setTimeout(async () => {
          await plugin.fileManager.openFile(filePathToOpen)
          filePathToOpen = null
        }, 1000)
      }
    })
    if (!(Registry.getInstance().get('platform').api.isDesktop())) {
      workspaces = await getWorkspaces() || []
      dispatch(setWorkspaces(workspaces))
    }
    if (params.gist) {
      const name = 'gist ' + params.gist
      await createWorkspaceTemplate(name, 'gist-template')
      plugin.setWorkspace({ name, isLocalhost: false })
      dispatch(setCurrentWorkspace({ name, isGitRepo: false }))
      await loadWorkspacePreset('gist-template')
    } else if (params.code || params.url || params.shareCode || params.ghfolder) {
      await createWorkspaceTemplate('code-sample', 'code-template')
      plugin.setWorkspace({ name: 'code-sample', isLocalhost: false })
      dispatch(setCurrentWorkspace({ name: 'code-sample', isGitRepo: false }))
      const filePath = await loadWorkspacePreset('code-template')
      plugin.on('filePanel', 'workspaceInitializationCompleted', async () => {
        if (editorMounted){
          setTimeout(async () => {
            await plugin.fileManager.openFile(filePath)}, 1000)
        } else {
          filePathToOpen = filePath
        }
      })
    } else if (params.address && params.blockscout) {
      if (params.address.startsWith('0x') && params.address.length === 42 && params.blockscout.length > 0) {
        const contractAddress = params.address
        const blockscoutUrl = params.blockscout
        plugin.call('notification', 'toast', `Looking for contract(s) verified on ${blockscoutUrl} for contract address ${contractAddress} .....`)
        let data
        let count = 0
        try {
          const workspaceName = 'code-sample'
          let filePath
          const target = `/${blockscoutUrl}/${contractAddress}`

          data = await fetchContractFromBlockscout(plugin, blockscoutUrl, contractAddress, target, false)
          if (await workspaceExists(workspaceName)) workspaceProvider.setWorkspace(workspaceName)
          else await createWorkspaceTemplate(workspaceName, 'code-template')
          plugin.setWorkspace({ name: workspaceName, isLocalhost: false })
          dispatch(setCurrentWorkspace({ name: workspaceName, isGitRepo: false }))
          count = count + (Object.keys(data.compilationTargets)).length
          for (filePath in data.compilationTargets)
            await workspaceProvider.set(filePath, data.compilationTargets[filePath]['content'])

          plugin.on('filePanel', 'workspaceInitializationCompleted', async () => {
            if (editorMounted){
              setTimeout(async () => {
                await plugin.fileManager.openFile(filePath)}, 1000)
            } else {
              filePathToOpen = filePath
            }
          })
          plugin.call('notification', 'toast', `Added ${count} verified contract${count === 1 ? '' : 's'} from ${blockscoutUrl} network for contract address ${contractAddress} !!`)
        } catch (error) {
          await basicWorkspaceInit(workspaces, workspaceProvider)
        }
      } else await basicWorkspaceInit(workspaces, workspaceProvider)
    } else if (params.address) {
      if (params.address.startsWith('0x') && params.address.length === 42) {
        const contractAddress = params.address
        plugin.call('notification', 'toast', `Looking for contract(s) verified on different networks of Etherscan for contract address ${contractAddress} .....`)
        let data
        let count = 0
        try {
          let etherscanKey = await plugin.call('config', 'getAppParameter', 'etherscan-access-token')
          if (!etherscanKey) etherscanKey = '2HKUX5ZVASZIKWJM8MIQVCRUVZ6JAWT531'
          const workspaceName = 'code-sample'
          let filePath
          const foundOnNetworks = []
          const endpoint = params.endpoint || 'api.etherscan.io'
          try {
            data = await fetchContractFromEtherscan(plugin, endpoint, contractAddress, '', false, etherscanKey)
          } catch (error) {
            return await basicWorkspaceInit(workspaces, workspaceProvider)
          }
          if (await workspaceExists(workspaceName)) workspaceProvider.setWorkspace(workspaceName)
          else await createWorkspaceTemplate(workspaceName, 'code-template')
          plugin.setWorkspace({ name: workspaceName, isLocalhost: false })
          dispatch(setCurrentWorkspace({ name: workspaceName, isGitRepo: false }))
          count = count + (Object.keys(data.compilationTargets)).length
          for (filePath in data.compilationTargets)
            await workspaceProvider.set(filePath, data.compilationTargets[filePath]['content'])

          if (data.config) {
            await workspaceProvider.set('compiler_config.json', JSON.stringify(data.config, null, '\t'))
          }

          plugin.on('filePanel', 'workspaceInitializationCompleted', async () => {
            if (editorMounted){
              setTimeout(async () => {
                await plugin.fileManager.openFile(filePath)}, 1000)
            } else {
              filePathToOpen = filePath
            }
          })
          plugin.call('notification', 'toast', `Added ${count} verified contract${count === 1 ? '' : 's'} from ${foundOnNetworks.join(',')} network${foundOnNetworks.length === 1 ? '' : 's'} of Etherscan for contract address ${contractAddress} !!`)
        } catch (error) {
          await basicWorkspaceInit(workspaces, workspaceProvider)
        }
      } else await basicWorkspaceInit(workspaces, workspaceProvider)
    } else if (Registry.getInstance().get('platform').api.isDesktop()) {
      if (params.opendir) {
        params.opendir = decodeURIComponent(params.opendir)
        plugin.call('notification', 'toast', `opening ${params.opendir}...`)
        await plugin.call('fs', 'setWorkingDir', params.opendir)
      }
      const currentPath = await plugin.call('fs', 'getWorkingDir')
      dispatch(setCurrentLocalFilePath(currentPath))
      plugin.setWorkspace({ name: 'electron', isLocalhost: false })

      dispatch(setCurrentWorkspace({ name: 'electron', isGitRepo: false }))
      electrOnProvider.init()
      listenOnProviderEvents(electrOnProvider)(dispatch)
      listenOnPluginEvents(plugin)
      dispatch(setMode('browser'))
      dispatch(fsInitializationCompleted())
      plugin.emit('workspaceInitializationCompleted')
      return

    } else if (localStorage.getItem("currentWorkspace")) {
      const index = workspaces.findIndex(element => element.name == localStorage.getItem("currentWorkspace"))
      if (index !== -1) {
        const name = localStorage.getItem("currentWorkspace")
        workspaceProvider.setWorkspace(name)
        plugin.setWorkspace({ name: name, isLocalhost: false })
        dispatch(setCurrentWorkspace({ name: name, isGitRepo: false }))
      } else {
        await trackMatomoEventAsync(plugin, { category: 'Storage', action: 'error', name: `Workspace in localstorage not found: ${localStorage.getItem("currentWorkspace")}`, isClick: false });
        await basicWorkspaceInit(workspaces, workspaceProvider)
      }
    } else {
      await basicWorkspaceInit(workspaces, workspaceProvider)
    }

    listenOnPluginEvents(plugin)
    listenOnProviderEvents(workspaceProvider)(dispatch)
    listenOnProviderEvents(localhostProvider)(dispatch)
    listenOnProviderEvents(electrOnProvider)(dispatch)
    if (Registry.getInstance().get('platform').api.isDesktop()) {
      dispatch(setMode('browser'))
    } else {
      dispatch(setMode('browser'))
    }

    plugin.setWorkspaces(await getWorkspaces())
    dispatch(fsInitializationCompleted())
    plugin.emit('workspaceInitializationCompleted')
  } else if (filePanelPlugin instanceof Topbar) {
    plugin = filePanelPlugin.filePanel
    dispatch = reducerDispatch
    setPlugin(plugin, dispatch)
    const workspaceProvider = plugin.fileProviders.workspace
    const localhostProvider = plugin.fileProviders.localhost
    const electrOnProvider = plugin.fileProviders.electron
    const params = queryParams.get() as UrlParametersType
    let editorMounted = false
    let filePathToOpen = null
    let workspaces = []
    plugin.on('editor', 'editorMounted', async () => {
      editorMounted = true
      if (filePathToOpen){
        setTimeout(async () => {
          await plugin.fileManager.openFile(filePathToOpen)
          filePathToOpen = null
        }, 1000)
      }
    })
    if (!(Registry.getInstance().get('platform').api.isDesktop())) {
      workspaces = await getWorkspaces() || []
      dispatch(setWorkspaces(workspaces))
    }
    if (params.gist) {
      const name = 'gist ' + params.gist
      await createWorkspaceTemplate(name, 'gist-template')
      plugin.setWorkspace({ name, isLocalhost: false })
      dispatch(setCurrentWorkspace({ name, isGitRepo: false }))
      await loadWorkspacePreset('gist-template')
    } else if (params.code || params.url || params.shareCode || params.ghfolder) {
      await createWorkspaceTemplate('code-sample', 'code-template')
      plugin.setWorkspace({ name: 'code-sample', isLocalhost: false })
      dispatch(setCurrentWorkspace({ name: 'code-sample', isGitRepo: false }))
      const filePath = await loadWorkspacePreset('code-template')
      plugin.on('filePanel', 'workspaceInitializationCompleted', async () => {
        if (editorMounted){
          setTimeout(async () => {
            await plugin.fileManager.openFile(filePath)}, 1000)
        } else {
          filePathToOpen = filePath
        }
      })
    } else if (params.address && params.blockscout) {
      if (params.address.startsWith('0x') && params.address.length === 42 && params.blockscout.length > 0) {
        const contractAddress = params.address
        const blockscoutUrl = params.blockscout
        plugin.call('notification', 'toast', `Looking for contract(s) verified on ${blockscoutUrl} for contract address ${contractAddress} .....`)
        let data
        let count = 0
        try {
          const workspaceName = 'code-sample'
          let filePath
          const target = `/${blockscoutUrl}/${contractAddress}`

          data = await fetchContractFromBlockscout(plugin, blockscoutUrl, contractAddress, target, false)
          if (await workspaceExists(workspaceName)) workspaceProvider.setWorkspace(workspaceName)
          else await createWorkspaceTemplate(workspaceName, 'code-template')
          plugin.setWorkspace({ name: workspaceName, isLocalhost: false })
          dispatch(setCurrentWorkspace({ name: workspaceName, isGitRepo: false }))
          count = count + (Object.keys(data.compilationTargets)).length
          for (filePath in data.compilationTargets)
            await workspaceProvider.set(filePath, data.compilationTargets[filePath]['content'])

          plugin.on('filePanel', 'workspaceInitializationCompleted', async () => {
            if (editorMounted){
              setTimeout(async () => {
                await plugin.fileManager.openFile(filePath)}, 1000)
            } else {
              filePathToOpen = filePath
            }
          })
          plugin.call('notification', 'toast', `Added ${count} verified contract${count === 1 ? '' : 's'} from ${blockscoutUrl} network for contract address ${contractAddress} !!`)
        } catch (error) {
          await basicWorkspaceInit(workspaces, workspaceProvider)
        }
      } else await basicWorkspaceInit(workspaces, workspaceProvider)
    } else if (params.address) {
      if (params.address.startsWith('0x') && params.address.length === 42) {
        const contractAddress = params.address
        plugin.call('notification', 'toast', `Looking for contract(s) verified on different networks of Etherscan for contract address ${contractAddress} .....`)
        let data
        let count = 0
        try {
          let etherscanKey = await plugin.call('config', 'getAppParameter', 'etherscan-access-token')
          if (!etherscanKey) etherscanKey = '2HKUX5ZVASZIKWJM8MIQVCRUVZ6JAWT531'
          const workspaceName = 'code-sample'
          let filePath
          const foundOnNetworks = []
          const endpoint = params.endpoint || 'api.etherscan.io'
          try {
            data = await fetchContractFromEtherscan(plugin, endpoint, contractAddress, '', false, etherscanKey)
          } catch (error) {
            return await basicWorkspaceInit(workspaces, workspaceProvider)
          }
          if (await workspaceExists(workspaceName)) workspaceProvider.setWorkspace(workspaceName)
          else await createWorkspaceTemplate(workspaceName, 'code-template')
          plugin.setWorkspace({ name: workspaceName, isLocalhost: false })
          dispatch(setCurrentWorkspace({ name: workspaceName, isGitRepo: false }))
          count = count + (Object.keys(data.compilationTargets)).length
          for (filePath in data.compilationTargets)
            await workspaceProvider.set(filePath, data.compilationTargets[filePath]['content'])

          if (data.config) {
            await workspaceProvider.set('compiler_config.json', JSON.stringify(data.config, null, '\t'))
          }

          plugin.on('filePanel', 'workspaceInitializationCompleted', async () => {
            if (editorMounted){
              setTimeout(async () => {
                await plugin.fileManager.openFile(filePath)}, 1000)
            } else {
              filePathToOpen = filePath
            }
          })
          plugin.call('notification', 'toast', `Added ${count} verified contract${count === 1 ? '' : 's'} from ${foundOnNetworks.join(',')} network${foundOnNetworks.length === 1 ? '' : 's'} of Etherscan for contract address ${contractAddress} !!`)
        } catch (error) {
          await basicWorkspaceInit(workspaces, workspaceProvider)
        }
      } else await basicWorkspaceInit(workspaces, workspaceProvider)
    } else if (Registry.getInstance().get('platform').api.isDesktop()) {
      if (params.opendir) {
        params.opendir = decodeURIComponent(params.opendir)
        plugin.call('notification', 'toast', `opening ${params.opendir}...`)
        await plugin.call('fs', 'setWorkingDir', params.opendir)
      }
      const currentPath = await plugin.call('fs', 'getWorkingDir')
      dispatch(setCurrentLocalFilePath(currentPath))
      plugin.setWorkspace({ name: 'electron', isLocalhost: false })

      dispatch(setCurrentWorkspace({ name: 'electron', isGitRepo: false }))
      electrOnProvider.init()
      listenOnProviderEvents(electrOnProvider)(dispatch)
      listenOnPluginEvents(plugin)
      dispatch(setMode('browser'))
      dispatch(fsInitializationCompleted())
      plugin.emit('workspaceInitializationCompleted')
      return

    } else if (localStorage.getItem("currentWorkspace")) {
      const index = workspaces.findIndex(element => element.name == localStorage.getItem("currentWorkspace"))
      if (index !== -1) {
        const name = localStorage.getItem("currentWorkspace")
        workspaceProvider.setWorkspace(name)
        plugin.setWorkspace({ name: name, isLocalhost: false })
        dispatch(setCurrentWorkspace({ name: name, isGitRepo: false }))
      } else {
        await trackMatomoEventAsync(plugin, { category: 'Storage', action: 'error', name: `Workspace in localstorage not found: ${localStorage.getItem("currentWorkspace")}`, isClick: false });
        await basicWorkspaceInit(workspaces, workspaceProvider)
      }
    } else {
      await basicWorkspaceInit(workspaces, workspaceProvider)
    }

    listenOnPluginEvents(plugin)
    listenOnProviderEvents(workspaceProvider)(dispatch)
    listenOnProviderEvents(localhostProvider)(dispatch)
    listenOnProviderEvents(electrOnProvider)(dispatch)
    if (Registry.getInstance().get('platform').api.isDesktop()) {
      dispatch(setMode('browser'))
    } else {
      dispatch(setMode('browser'))
    }

    plugin.setWorkspaces(await getWorkspaces())
    dispatch(fsInitializationCompleted())
    plugin.emit('workspaceInitializationCompleted')
  }
}

export const fetchDirectory = async (path: string) => {
  const provider = plugin.fileManager.currentFileProvider()
  const promise = new Promise((resolve) => {
    provider.resolveDirectory(path, (error, fileTree: FileTree) => {
      if (error) console.error(error)

      resolve(fileTree)
    })
  })

  dispatch(fetchDirectoryRequest())
  promise.then((fileTree: FileTree) => {
    dispatch(fetchDirectorySuccess(path, fileTree))
  }).catch((error: ErrorEvent) => {
    dispatch(fetchDirectoryError(error.message))
  })
  return promise
}

export const removeInputField = async (path: string) => {
  dispatch(removeInputFieldSuccess(path))
}

export type SolidityConfiguration = {
  version: string,
  optimize: string,
  runs: string
}

const buildGistPayload = (selectedFiles: { key: string, type: 'file' | 'folder', content: string }[]) => {
  if (!selectedFiles || selectedFiles.length === 0) return

  const files: { [key: string]: { content: string }} = {}
  for (const file of selectedFiles) {
    const resultingSplits = file.key.split('/')
    files[resultingSplits[resultingSplits.length - 1]] = { content: file.content }
  }
  return files
}

export const publishFilesToGist = (arrayOfSelectedFiles: any) => {
  const gistPayload = buildGistPayload(arrayOfSelectedFiles)
  if (!gistPayload) {
    return;
  }
  console.log('primed and ready', gistPayload)
  const config = plugin.registry.get('config').api
  const accessToken = config.get('settings/gist-access-token')
  if (!accessToken) {
    dispatch(displayNotification('Authorize Token', 'Remix requires an access token (which includes gists creation permission). Please go to the settings tab to create one.', 'Close', null, () => { }))
    return
  }

  try {
    const params = queryParams.get() as SolidityConfiguration
    const description = 'Created using remix-ide: Realtime Ethereum Contract Compiler and Runtime. \n Load this file by pasting this gists URL or ID at https://remix.ethereum.org/#version=' + params.version + '&optimize=' + params.optimize + '&runs=' + params.runs + '&gist='
    const gists = new Gists({ token: accessToken })
    dispatch(displayPopUp('Creating a new gist ...'))

    gists.create({
      description: description,
      public: true,
      files: gistPayload
    }, (error, result) => {
      handleGistResponse(error, result)
    })
    console.log('publishFilesToGistIsDone')
  } catch (error) {
    console.log('There was an error', error)
  }
}

export const publishToGist = async (path?: string) => {
  // If 'id' is not defined, it is not a gist update but a creation so we have to take the files from the browser explorer.
  const folder = path || '/'
  try {
    let id
    if (path) {
      // check if the current folder is a gist folder
      id = await plugin.call('filePanel', 'isGist', extractNameFromKey(path))
    } else {
      // check if the current workspace is a gist workspace
      id = await plugin.call('filePanel', 'isGist')
    }
    const packaged = await packageGistFiles(folder)
    // check for token
    const config = plugin.registry.get('config').api
    const accessToken = config.get('settings/gist-access-token')

    if (!accessToken) {
      dispatch(displayNotification('Authorize Token', 'Remix requires an access token (which includes gists creation permission). Please go to the settings tab to create one.', 'Close', null, () => { }))
    } else {
      const params = queryParams.get() as SolidityConfiguration
      const description = 'Created using remix-ide: Realtime Ethereum Contract Compiler and Runtime. \n Load this file by pasting this gists URL or ID at https://remix.ethereum.org/#version=' +
        params.version + '&optimize=' + params.optimize + '&runs=' + params.runs + '&gist='
      const gists = new Gists({ token: accessToken })

      if (id) {
        const originalFileList = await getOriginalFiles(id)
        // Telling the GIST API to remove files
        const updatedFileList = Object.keys(packaged)
        const allItems = Object.keys(originalFileList)
          .filter(fileName => updatedFileList.indexOf(fileName) === -1)
          .reduce((acc, deleteFileName) => ({
            ...acc,
            [deleteFileName]: null
          }), originalFileList)
        // adding new files
        updatedFileList.forEach((file) => {
          const _items = file.split('/')
          const _fileName = _items[_items.length - 1]
          allItems[_fileName] = packaged[file]
        })

        dispatch(displayPopUp('Saving gist (' + id + ') ...'))
        gists.edit({
          description: description,
          public: true,
          files: allItems,
          id: id
        }, (error, result) => {
          handleGistResponse(error, result)
          if (!error) {
            for (const key in allItems) {
              if (allItems[key] === null) delete allItems[key]
            }
          }
        })
      } else {
        // id is not existing, need to create a new gist
        dispatch(displayPopUp('Creating a new gist ...'))
        gists.create({
          description: description,
          public: true,
          files: packaged
        }, (error, result) => {
          handleGistResponse(error, result)
        })
      }
      // fire event for cleanup of temp folder
      plugin.emit('FinishedGistPublish', folder)
    }
  } catch (error) {
    console.log(error)
    dispatch(displayNotification('Publish to gist Failed', 'Failed to create gist: ' + error.message, 'Close', null, async () => { }))
  }
}

export const clearPopUp = async () => {
  dispatch(hidePopUp())
}

export const createNewFile = async (path: string, rootDir: string) => {
  const fileManager = plugin.fileManager
  const newName = await createNonClashingNameAsync(path, fileManager)
  const createFile = await fileManager.writeFile(newName, '')

  if (!createFile) {
    return dispatch(displayPopUp('Failed to create file ' + newName))
  } else {
    let path = newName.indexOf(rootDir + '/') === 0 ? newName.replace(rootDir + '/', '') : newName
    // remove leading slash
    path = path.indexOf('/') === 0 ? path.slice(1) : path
    await fileManager.open(path)
    setFocusElement([{ key: path, type: 'file' }])
  }
}

export const setFocusElement = async (elements: { key: string, type: 'file' | 'folder' }[]) => {
  dispatch(focusElement(elements))
}

export const createNewFolder = async (path: string, rootDir: string) => {
  const fileManager = plugin.fileManager
  const dirName = path + '/'
  const exists = await fileManager.exists(dirName)

  if (exists) {
    return dispatch(displayNotification('Failed to create folder', `A folder ${extractNameFromKey(path)} already exists at this location. Please choose a different name.`, 'Close', null, () => { }))
  }
  await fileManager.mkdir(dirName)
  path = path.indexOf(rootDir + '/') === 0 ? path.replace(rootDir + '/', '') : path
  // remove leading slash
  path = path.indexOf('/') === 0 ? path.slice(1) : path
  dispatch(focusElement([{ key: path, type: 'folder' }]))
}

export const deletePath = async (path: string[]) => {
  const fileManager = plugin.fileManager

  for (const p of path) {
    try {
      await fileManager.remove(p)
    } catch (e) {
      const isDir = await fileManager.isDirectory(p)

      dispatch(displayPopUp(`Failed to remove ${isDir ? 'folder' : 'file'} ${p}.`))
    }
  }
}

export const renamePath = async (oldPath: string, newPath: string) => {
  const fileManager = plugin.fileManager
  const exists = await fileManager.exists(newPath)

  if (exists) {
    dispatch(displayNotification('Rename File Failed', `A file or folder ${extractNameFromKey(newPath)} already exists at this location. Please choose a different name.`, 'Close', null, () => { }))
  } else {
    await fileManager.rename(oldPath, newPath)
  }
}

export const downloadPath = async (path: string) => {
  const fileManager = plugin.fileManager
  try {
    await fileManager.download(path)
  } catch (error) {
    dispatch(displayPopUp('Oops! An error occurred while downloading.' + error))
  }
}

export const copyFile = async (src: string, dest: string) => {
  const fileManager = plugin.fileManager

  try {
    await fileManager.copyFile(src, dest)
  } catch (error) {
    dispatch(displayPopUp('Oops! An error occurred while performing copyFile operation.' + error))
  }
}

export const copyShareURL = async (path: string) => {
  const fileManager = plugin.fileManager

  try {
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

    const fileContent = await fileManager.readFile(path)
    const result = await ipfs.add(fileContent)
    const hash = result.cid.string
    const shareUrl = `${window.location.origin}/#shareCode=${hash}`
    navigator.clipboard.writeText(shareUrl)
  } catch (error) {
    dispatch(displayPopUp('Oops! An error occurred while performing copyShareURL operation.' + error))
  }
}

export const copyFolder = async (src: string, dest: string) => {
  const fileManager = plugin.fileManager

  try {
    await fileManager.copyDir(src, dest)
  } catch (error) {
    dispatch(displayPopUp('Oops! An error occurred while performing copyDir operation.' + error))
  }
}

export const runScript = async (path: string) => {
  const provider = plugin.fileManager.currentFileProvider()

  provider.get(path, (error, content: string) => {
    if (error) {
      return dispatch(displayPopUp(error))
    }
    plugin.call('scriptRunnerBridge', 'execute', content, path)
  })
}

export const signTypedData = async (path: string) => {
  const typedData = await plugin.call('fileManager', 'readFile', path)
  const web3 = await plugin.call('blockchain', 'web3')
  const settings = await plugin.call('udapp', 'getSettings')
  let parsed
  try {
    parsed = JSON.parse(typedData)
  } catch (err) {
    dispatch(displayPopUp(`${path} isn't a valid JSON.`))
    return
  }

  try {
    const result = await web3.currentProvider.request({
      method: 'eth_signTypedData_v4',
      params: [settings.selectedAccount, parsed]
    })

    plugin.call('terminal', 'log', { type: 'log', value: `${path} signature using ${settings.selectedAccount} : ${result}` })
  } catch (e) {
    console.error(e)
    plugin.call('terminal', 'log', { type: 'error', value: `error while signing ${path}: ${e.message || e}` })
    dispatch(displayPopUp(e.message))
  }
}

export const emitContextMenuEvent = async (cmd: customAction) => {
  await plugin.call(cmd.id, cmd.name, cmd)
}

export const handleClickFile = async (path: string, type: 'file' | 'folder' ) => {
  if (type === 'file' && path.endsWith('.md')) {
    // just opening the preview
    await plugin.call('doc-viewer' as any, 'viewDocs', [path])
    plugin.call('tabs' as any, 'focus', 'doc-viewer')
  } else {
    await plugin.fileManager.open(path)
    dispatch(focusElement([{ key: path, type }]))
  }
}

export const handleExpandPath = (paths: string[]) => {
  plugin.emit('expandPathChanged', paths)
  dispatch(setExpandPath(paths))
}

export const handleDownloadFiles = async () => {
  try {
    plugin.call('notification', 'toast', 'preparing files for download, please wait..')
    const zip = new JSZip()

    zip.file("readme.txt", "This is a Remix backup file.\nThis zip should be used by the restore backup tool in Remix.\nThe .workspaces directory contains your workspaces.")
    const browserProvider = plugin.fileManager.getProvider('browser')

    await browserProvider.copyFolderToJson('/', ({ path, content }) => {
      zip.file(path, content)
    })
    zip.generateAsync({ type: 'blob' }).then(async function (blob) {
      const today = new Date()
      const date = today.getFullYear() + '-' + (today.getMonth() + 1) + '-' + today.getDate()
      const time = today.getHours() + 'h' + today.getMinutes() + 'min'

      saveAs(blob, `remix-backup-at-${time}-${date}.zip`)
      await trackMatomoEventAsync(plugin, { category: 'Backup', action: 'download', name: 'home', isClick: true });
    }).catch(async (e) => {
      await trackMatomoEventAsync(plugin, { category: 'Backup', action: 'error', name: e.message, isClick: false });
      plugin.call('notification', 'toast', e.message)
    })
  } catch (e) {
    plugin.call('notification', 'toast', e.message)
  }
}

export const handleDownloadWorkspace = async () => {
  try {
    const zip = new JSZip()
    const workspaceProvider = plugin.fileProviders.workspace
    await workspaceProvider.copyFolderToJson('/', ({ path, content }) => {
      zip.file(path, content)
    })
    const blob = await zip.generateAsync({ type: 'blob' })
    saveAs(blob, `${workspaceProvider.workspace}.zip`)
  } catch (e) {
    console.error(e)
    plugin.call('notification', 'toast', e.message)
  }
}

export const restoreBackupZip = async () => {
  await plugin.appManager.activatePlugin(['restorebackupzip'])
  await plugin.call('mainPanel', 'showContent', 'restorebackupzip')
  await trackMatomoEventAsync(plugin, { category: 'Backup', action: 'userActivate', name: 'restorebackupzip', isClick: true });
}

const packageGistFiles = async (directory) => {
  const workspaceProvider = plugin.fileProviders.workspace
  const isFile = await workspaceProvider.isFile(directory)
  return new Promise((resolve, reject) => {
    const ret = {}

    if (isFile) {
      try {
        workspaceProvider.get(directory, (error, content) => {
          if (error) throw new Error('An error occurred while getting file content. ' + directory)
          if (/^\s+$/.test(content) || !content.length) {
            content = '// this line is added to create a gist. Empty file is not allowed.'
          }
          directory = directory.replace(/\//g, '...')
          ret[directory] = { content }
          return resolve(ret)
        })
      } catch (e) {
        return reject(e)
      }
    } else {
      try {
        (async () => {
          await workspaceProvider.copyFolderToJson(directory, ({ path, content }) => {
            if (/^\s+$/.test(content) || !content.length) {
              content = '// this line is added to create a gist. Empty file is not allowed.'
            }
            path = path.replace(/\//g, '...')
            ret[path] = { content }
          })
          resolve(ret)
        })()
      } catch (e) {
        return reject(e)
      }
    }
  })
}

const handleGistResponse = (error, data) => {
  if (error) {
    dispatch(displayNotification('Publish to gist Failed', 'Failed to manage gist: ' + error, 'Close', null))
  } else {
    if (data.html_url) {
      dispatch(displayNotification('Gist is ready', `The gist is at ${data.html_url}. Would you like to open it in a new window?`, 'OK', 'Cancel', () => {
        window.open(data.html_url, '_blank')
      }, () => { }))
    } else {
      const error = JSON.stringify(data.errors, null, '\t') || ''
      const message = data.message === 'Not Found' ? data.message + '. Please make sure the API token has right to create a gist.' : data.message

      dispatch(displayNotification('Publish to gist Failed', message + ' ' + data.documentation_url + ' ' + error, 'Close', null))
    }
  }
}

/**
   * This function is to get the original content of given gist
   * @params id is the gist id to fetch
   */
const getOriginalFiles = async (id) => {
  if (!id) {
    return []
  }

  const url = `https://api.github.com/gists/${id}`
  const res = await fetch(url)
  const data = await res.json()
  return data.files || []
}

const saveAs = (blob, name) => {
  const node = document.createElement('a')

  node.download = name
  node.rel = 'noopener'
  node.href = URL.createObjectURL(blob)
  setTimeout(function () { URL.revokeObjectURL(node.href) }, 4E4) // 40s
  setTimeout(function () {
    try {
      node.dispatchEvent(new MouseEvent('click'))
    } catch (e) {
      const evt = document.createEvent('MouseEvents')

      evt.initMouseEvent('click', true, true, window, 0, 0, 0, 80,
        20, false, false, false, false, 0, null)
      node.dispatchEvent(evt)
    }
  }, 0) // 40s
}

export const moveFile = async (src: string, dest: string) => {
  const fileManager = plugin.fileManager

  if (src === dest) return // if you cut and paste to the same location then no need to move anything
  try {
    const isFile = await fileManager.isFile(dest)
    if (isFile) {
      const updatedDestPath = await fileManager.currentPath()
      await fileManager.moveFile(src, updatedDestPath)
    } else {
      await fileManager.moveFile(src, dest)
    }
  } catch (error) {
    dispatch(displayPopUp('Oops! An error occurred while performing moveFile operation.' + error))
  }
}

export const moveFolder = async (src: string, dest: string) => {
  const fileManager = plugin.fileManager

  if (src === dest) return // if you cut and paste to the same location then no need to move anything

  try {
    const isFile = await fileManager.isFile(dest)
    if (!isFile) {
      await fileManager.moveDir(src, dest)
    } else {
      const updatedDestPath = await fileManager.currentPath()
      await fileManager.moveDir(src, updatedDestPath)
    }
  } catch (error) {
    dispatch(displayPopUp('Oops! An error occurred while performing moveDir operation.' + error))
  }
}

export const moveFileIsAllowed = async (src: string, dest: string) => {
  const fileManager = plugin.fileManager
  const isAllowed = await fileManager.moveFileIsAllowed(src, dest)
  return isAllowed
}

export const moveFolderIsAllowed = async (src: string, dest: string) => {
  const fileManager = plugin.fileManager
  const isAllowed = await fileManager.moveDirIsAllowed(src, dest)
  return isAllowed
}

export const moveFilesIsAllowed = async (src: string[], dest: string) => {
  const fileManager = plugin.fileManager
  const boolArray: boolean[] = []
  for (const srcFile of src) {
    boolArray.push(await fileManager.moveFileIsAllowed(srcFile, dest))
  }
  return boolArray.every(p => p === true) || false
}

export const moveFoldersIsAllowed = async (src: string[], dest: string) => {
  const fileManager = plugin.fileManager
  const boolArray: boolean[] = []
  for (const srcFile of src) {
    boolArray.push(await fileManager.moveDirIsAllowed(srcFile, dest))
  }
  return boolArray.every(p => p === true) || false
}

