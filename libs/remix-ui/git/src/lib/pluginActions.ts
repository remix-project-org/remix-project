
import { fileStatusResult, gitActionDispatch, gitState } from "../types"
import { fileDecoration, fileDecorationType } from "@remix-ui/file-decorators"
import { removeSlash } from "../utils"
import { getFilesByStatus } from "./fileHelpers"
import { commitChange, CustomRemixApi } from "@remix-api";
import { Plugin } from "@remixproject/engine";

let plugin: Plugin<any, CustomRemixApi>, gitDispatch: React.Dispatch<gitActionDispatch>, loaderDispatch: React.Dispatch<any>

export const setPlugin = (p: Plugin<any, CustomRemixApi>, gitDispatcher: React.Dispatch<gitActionDispatch>, loaderDispatcher: React.Dispatch<any>) => {
  plugin = p
  gitDispatch = gitDispatcher
  loaderDispatch = loaderDispatcher
}

export const statusChanged = (badges: number) => {
  if (!plugin) return
  plugin.emit('statusChanged', {
    key: badges === 0 ? 'none' : badges,
    type: badges === 0 ? '' : 'success',
    title: 'Git changes'
  })
}

export const openFile = async (path: string) => {
  if (!plugin) return
  await plugin.call('fileManager', 'open', path)
}

export const openDiff = async (change: commitChange) => {
  if (!plugin) return
  plugin.call('fileManager', 'diff', change)
}

export const saveToken = async (token: string) => {
  if (!plugin) return
  await plugin.call('config', 'setAppParameter', 'settings/gist-access-token', token)
}

export const setFileDecorators = async (files: fileStatusResult[]) => {

  if (!plugin) return
  const modified = getFilesByStatus('modified', files)
  const untracked = getFilesByStatus('untracked', files)
  const unmodified = getFilesByStatus('unmodified', files)

  await setModifiedDecorator(modified)
  await setUntrackedDecorator(untracked)
  unmodified.forEach((file) => {
    clearFileDecorator(removeSlash(file.filename))
  })
}

export const setModifiedDecorator = async (files: fileStatusResult[]) => {
  const decorators: fileDecoration[] = []
  for (const file of files) {
    const decorator: fileDecoration = {
      path: removeSlash(file.filename),
      isDirectory: false,
      fileStateType: fileDecorationType.Custom,
      fileStateLabelClass: 'text-warning',
      fileStateIconClass: 'text-warning',
      fileStateIcon: '',
      text: 'M',
      owner: 'git',
      bubble: true,
      comment: 'Modified'
    }
    decorators.push(decorator)
  }

  await plugin.call('fileDecorator', 'setFileDecorators', decorators)
}

export const setUntrackedDecorator = async (files: fileStatusResult[]) => {
  const decorators: fileDecoration[] = []
  for (const file of files) {
    const decorator: fileDecoration = {
      path: removeSlash(file.filename),
      isDirectory: false,
      fileStateType: fileDecorationType.Custom,
      fileStateLabelClass: 'text-success',
      fileStateIconClass: 'text-success',
      fileStateIcon: '',
      text: 'U',
      owner: 'git',
      bubble: true,
      comment: 'Untracked'
    }
    decorators.push(decorator)
  }

  await plugin.call('fileDecorator', 'setFileDecorators', decorators)
}

export const clearFileDecorator = async(path: string) => {
  await plugin.call('fileDecorator', 'clearFileDecorators', path)
}

export const openFolderInSameWindow = async (path: string) => {
  await plugin.call('fs', 'openFolderInSameWindow', path)
}

export const openCloneDialog = async () => {
  plugin.call('filePanel', 'clone')
}

export const loginWithGitHub = async () => {
  plugin && await plugin.call('githubAuthHandler', 'login');
}
