import { branch } from '@remix-ui/git'
import { customAction } from '@remixproject/plugin-api'
import { createContext, SyntheticEvent } from 'react'
import { BrowserState } from '../reducers/workspace'
import { Plugin } from '@remixproject/engine'
import { CustomRemixApi } from '@remix-api'

export const FileSystemContext = createContext<{
  fs: any,
  plugin: any,
  theme: any,
  modal:(title: string | JSX.Element, message: string | JSX.Element, okLabel: string, okFn: () => void, cancelLabel?: string, cancelFn?: () => void) => void,
  dispatchFetchDirectory:(path: string) => Promise<void>,
  dispatchAddInputField:(path: string, type: 'file' | 'folder') => Promise<void>,
  dispatchRemoveInputField:(path: string) => Promise<void>,
  dispatchCreateWorkspace: (workspaceName: string, workspaceTemplateName: string, opts?, initGitRepo?: boolean) => Promise<void>,
  toast: (toasterMsg: string) => void,
  dispatchFetchWorkspaceDirectory: (path: string) => Promise<void>,
  dispatchSwitchToWorkspace: (name: string) => Promise<void>,
  dispatchRenameWorkspace: (oldName: string, workspaceName: string) => Promise<void>,
  dispatchDeleteWorkspace: (workspaceName: string) => Promise<void>,
  dispatchDeleteAllWorkspaces: () => Promise<void>,
  dispatchPublishToGist: (path?: string, type?: string) => Promise<void>,
  dispatchPublishFilesToGist: (selectedFiles: { key: string, type: 'file' | 'folder', content: string }[]) => void,
  dispatchUploadFile: (target?: SyntheticEvent, targetFolder?: string) => Promise<void>,
  dispatchUploadFolder: (target?: SyntheticEvent, targetFolder?: string) => Promise<void>,
  dispatchCreateNewFile: (path: string, rootDir: string) => Promise<void>,
  dispatchSetFocusElement: (elements: { key: string, type: 'file' | 'folder' }[]) => Promise<void>,
  dispatchCreateNewFolder: (path: string, rootDir: string) => Promise<void>,
  dispatchDeletePath: (path: string[]) => Promise<void>,
  dispatchRenamePath: (oldPath: string, newPath: string) => Promise<void>,
  dispatchDownloadPath: (path:string) => Promise<void>,
  dispatchCopyFile: (src: string, dest: string) => Promise<void>,
  dispatchCopyShareURL: (path: string) => Promise<void>,
  dispatchCopyFolder: (src: string, dest: string) => Promise<void>,
  dispatchRunScript: (path: string) => Promise<void>,
  dispatchSignTypedData: (path: string) => Promise<void>,
  dispatchEmitContextMenuEvent: (cmd: customAction) => Promise<void>,
  dispatchHandleClickFile: (path: string, type: 'file' | 'folder' ) => Promise<void>
  dispatchHandleExpandPath: (paths: string[]) => Promise<void>,
  dispatchHandleDownloadFiles: () => Promise<void>,
  dispatchHandleDownloadWorkspace: () => Promise<void>,
  dispatchHandleRestoreBackup: () => Promise<void>
  dispatchCloneRepository: (url: string) => Promise<void>,
  dispatchMoveFile: (src: string, dest: string) => Promise<void>,
  dispatchMoveFolder: (src: string, dest: string) => Promise<void>,
  dispatchMoveFiles: (src: string[], dest: string) => Promise<void>,
  dispatchMoveFolders: (src: string[], dest: string) => Promise<void>,
  dispatchShowAllBranches: () => Promise<void>,
  dispatchSwitchToBranch: (branch: branch) => Promise<void>,
  dispatchCreateNewBranch: (name: string) => Promise<void>,
  dispatchCheckoutRemoteBranch: (branch: branch) => Promise<void>,
  dispatchOpenElectronFolder: (path: string) => Promise<void>
  dispatchGetElectronRecentFolders: () => Promise<void>
  dispatchRemoveRecentFolder: (path: string) => Promise<void>
  dispatchOpenElectronFolderInNewWindow: (path: string) => Promise<void>
  dispatchRevealElectronFolderInExplorer: (path: string) => Promise<void>
  dispatchUpdateGitSubmodules: () => Promise<void>
    }>(null)

