/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import React, { Dispatch } from 'react'
import { customAction } from '@remixproject/plugin-api'
import { fileDecoration } from '@remix-ui/file-decorators'
import { RemixAppManager } from 'libs/remix-ui/plugin-manager/src/types'
import { ViewPlugin } from '@remixproject/engine-web'
import { appPlatformTypes } from '@remix-ui/app'
import { Placement } from 'react-bootstrap/esm/types'
import { branch } from '@remix-api'

export type action = { name: string, type?: Array<WorkspaceElement>, path?: string[], extension?: string[], pattern?: string[], id: string, multiselect: boolean, label: string, sticky?: boolean, group: number, platform?: appPlatformTypes }
export interface JSONStandardInput {
  language: 'Solidity'
  settings?: any
  sources: {
    [globalName: string]: {
      keccak256?: string
      content: string
    }
  }
}
export type MenuItems = action[]
export type WorkspaceTemplate = 'gist-template' | 'code-template' | 'remixDefault' | 'blank' | 'ozerc20' | 'zeroxErc20' | 'ozerc721' | 'ozerc1155' | 'playground' | 'semaphore' | 'hashchecker' | 'rln' | 'breakthroughLabsUniswapv4Hooks' | 'uniswapV4Template' | 'uniswapV4HookBookMultiSigSwapHook' | 'multNr' | 'stealthDropNr'
export interface WorkspaceProps {
  plugin: FilePanelType
}
export interface WorkspaceState {
  hideRemixdExplorer: boolean
  displayNewFile: boolean
  loadingLocalhost: boolean
}

export interface Modal {
  hide?: boolean
  title: string
  message: string | JSX.Element
  okLabel: string
  okFn: () => void
  cancelLabel: string
  cancelFn: () => void
}

export interface FileType {
  path: string
  name: string
  isDirectory: boolean
  type: 'folder' | 'file'
  child?: File[]
}

export type WorkspaceMetadata = {
  name: string
  isGitRepo?: boolean
  hasGitSubmodules?: boolean
  branches?: branch[]
  currentBranch?: branch
  isGist?: string
  isLocalhost?: boolean
  absolutePath?: string
}

export type TemplateType = {
  type: 'git' | 'plugin'
  url?: string
  branch?: string
  name?: string
  endpoint?: string
  params?: any[]
  desktopCompatible?: boolean
  forceCreateNewWorkspace?: boolean
  disabled?: boolean
}

export interface FilePanelType extends ViewPlugin {
  setWorkspace: ({ name, isLocalhost }, setEvent: boolean) => void
  createWorkspace: (name: string, workspaceTemplateName: string) => void
  renameWorkspace: (oldName: string, newName: string) => void
  compileContractForUml?: (path: string) => void
  workspaceRenamed: ({ name }) => void
  workspaceCreated: ({ name }) => void
  workspaceDeleted: ({ name }) => void
  workspace?: any // workspace provider,
  browser?: any // browser provider
  localhost?: any // localhost provider
  fileManager?: any
  appManager: RemixAppManager
  registry?: any // registry
  pluginApi?: any
  request?: {
    createWorkspace: () => void
    setWorkspace: (workspaceName: string) => void
    createNewFile: () => void
    uploadFile: (target: EventTarget & HTMLInputElement) => void
    getCurrentWorkspace: () => void
  } // api request,
  workspaces: any
  registeredMenuItems?: MenuItems // menu items
  removedMenuItems?: MenuItems
  initialWorkspace?: string
  resetNewFile?: () => void
  getWorkspaces: () => string[]
  expandPath: string[]
}

/* eslint-disable-next-line */
export interface FileExplorerProps {
    name: string,
    menuItems?: string[],
    canPaste: boolean
    contextMenuItems: MenuItems,
    removedContextMenuItems: MenuItems,
    files: { [x: string]: Record<string, FileType> },
    flatTree: FileType[],
    workspaceState: WorkSpaceState,
    fileState: fileDecoration[],
    expandPath: string[],
    focusEdit: string,
    hideIconsMenu: React.Dispatch<React.SetStateAction<boolean>>,
    showIconsMenu: boolean,
    focusElement: { key: string, type: WorkspaceElement }[],
    dispatchCreateNewFile: (path: string, rootDir: string) => Promise<void>,
    // eslint-disable-next-line no-undef
    modal:(title: string, message: string | JSX.Element, okLabel: string, okFn: () => void, cancelLabel?: string, cancelFn?: () => void) => void,
    dispatchCreateNewFolder: (path: string, rootDir: string) => Promise<void>,
    readonly: boolean,
    toast: (toasterMsg: string) => void,
    dispatchDeletePath: (path: string[]) => Promise<void>,
    dispatchRenamePath: (oldPath: string, newPath: string) => Promise<void>,
    dispatchDownloadPath: (path: string) => Promise<void>,
    dispatchUploadFile: (target?: React.SyntheticEvent, targetFolder?: string) => Promise<void>,
    dispatchUploadFolder: (target?: React.SyntheticEvent, targetFolder?: string) => Promise<void>,
    dispatchCopyFile: (src: string, dest: string) => Promise<void>,
    dispatchCopyShareURL: (path:string) => Promise<void>,
    dispatchCopyFolder: (src: string, dest: string) => Promise<void>,
    dispatchRunScript: (path: string) => Promise<void>,
    dispatchSignTypedData: (path: string) => Promise<void>,
    dispatchPublishToGist: (path?: string, type?: string) => Promise<void>,
    dispatchEmitContextMenuEvent: (cmd: customAction) => Promise<void>,
    dispatchHandleClickFile: (path: string, type: WorkspaceElement) => Promise<void>,
    dispatchSetFocusElement: (elements: { key: string, type: WorkspaceElement }[]) => Promise<void>,
    dispatchFetchDirectory:(path: string) => Promise<void>,
    dispatchRemoveInputField:(path: string) => Promise<void>,
    dispatchAddInputField:(path: string, type: 'file' | 'folder') => Promise<void>,
    dispatchHandleExpandPath: (paths: string[]) => Promise<void>,
    dispatchMoveFile: (src: string, dest: string) => Promise<void>,
    dispatchMoveFiles: (src: string[], dest: string) => Promise<void>,
    dispatchMoveFolders: (src: string[], dest: string) => Promise<void>,
    dispatchMoveFolder: (src: string, dest: string) => Promise<void>,
    handlePasteClick: (dest: string, destType: string) => void
    handleCopyClick: (path: string, type: WorkspaceElement) => void
    addMenuItems: (items: MenuItems) => void
    removeMenuItems: (items: MenuItems) => void
    handleContextMenu: (pageX: number, pageY: number, path: string, content: string, type: string) => void
    uploadFile: (target) => void
    uploadFolder: (target) => void
    getFocusedFolder: () => string
    editModeOn: (path: string, type: string, isNew: boolean) => void
    toGist: (path?: string, type?: string) => void
    handleNewFileInput: (parentFolder?: string) => Promise<void>
    handleNewFolderInput: (parentFolder?: string) => Promise<void>
    deletePath?: (path: string[]) => Promise<void>
    createNewFile:(parentFolder?: string) => Promise<void>
    createNewFolder:(parentFolder?: string) => Promise<void>
    renamePath:(path: string, type: string, isNew?: boolean) => void
    dragStatus: (status: boolean) => void
    importFromIpfs: any
    importFromHttps: any
    handleGitInit?: () => Promise<void>
    handleMultiCopies: any
    feTarget: { key: string, type: 'file' | 'folder' }[]
    setFeTarget: Dispatch<React.SetStateAction<{
      key: string;
      type: "file" | "folder";
  }[]>>
    publishManyFilesToGist: () => Promise<void>
    hasCopied: boolean
    setHasCopied: Dispatch<React.SetStateAction<boolean>>
}

export interface FileExplorerMenuProps {
  title: string
  menuItems: string[]
  createNewFile: (folder?: string) => void
  createNewFolder: (parentFolder?: string) => void
  publishToGist: (path?: string) => void
  uploadFile: (target: EventTarget & HTMLInputElement) => void
  uploadFolder: (target: EventTarget & HTMLInputElement) => void
  importFromIpfs: any
  importFromHttps: any
  connectToLocalFileSystem?: any
  handleGitInit?: () => Promise<void>
  revealInExplorer?: () => void
  tooltipPlacement?: Placement
}
export interface FileExplorerContextMenuProps {
  actions: action[]
  createNewFile: (folder?: string) => void
  createNewFolder: (parentFolder?: string) => void
  deletePath: (path: string | string[]) => void
  renamePath: (path: string, type: string) => void
  downloadPath: (path: string) => void
  hideContextMenu: () => void
  publishToGist?: (path?: string) => void
  pushChangesToGist?: (path?: string) => void
  publishFolderToGist?: (path?: string) => void
  publishFileToGist?: (path?: string) => void
  signTypedData?: (path?: string) => void
  runScript?: (path: string) => void
  emit?: (cmd: customAction) => void
  pageX: number
  pageY: number
  path: string
  type: string
  focus: { key: string; type: string }[]
  onMouseOver?: (...args) => void
  copy?: (path: string, type: string) => void
  paste?: (destination: string, type: string) => void
  copyFileName?: (path: string, type: string) => void
  copyShareURL?: (path: string, type: string) => void
  copyPath?: (path: string, type: string) => void
  generateUml?: (path: string) => Promise<void>
  uploadFile?: (target: EventTarget & HTMLInputElement) => void
  publishManyFilesToGist: () => Promise<void>
}

export interface WorkSpaceState {
    ctrlKey: boolean
    deleteKey?: boolean
    F2Key?: boolean
    cutShortcut: boolean
    newFileName: string
    actions: {
      id: string
      name: string
      type?: Array<WorkspaceElement>
      path?: string[]
      extension?: string[]
      pattern?: string[]
      multiselect: boolean
      label: string,
      group: number
    }[]
    focusContext: FileFocusContextType
    focusEdit: {
      element: string
      type: string
      isNew: boolean
      lastEdit: string
    }
    mouseOverElement: string
    showContextMenu: boolean
    reservedKeywords: string[]
    copyElement: CopyElementType[]
    dragStatus: boolean
}

export type FileFocusContextType = {
  element: string
  x: number
  y: number
  type: string
}

export type CopyElementType = {
  key: string
  type: WorkspaceElement
}

export type FileTree = {
  [x: string]: {
    isDirectory: boolean
  }
}

export interface ActionPayloadTypes {
  SET_CURRENT_WORKSPACE: {
    name: string
    isGitRepo: boolean
    branches?: branch[]
    currentBranch?: branch
  },
  SET_WORKSPACES: {
    name: string
    isGitRepo: boolean
    branches?: branch[]
    currentBranch?: branch
  }[],
  SET_MODE: 'browser' | 'localhost',
  FETCH_DIRECTORY_REQUEST: undefined | null,
  FETCH_DIRECTORY_SUCCESS: { path: string; fileTree: FileTree },
  FETCH_DIRECTORY_ERROR: string,
  FETCH_WORKSPACE_DIRECTORY_REQUEST: undefined | null,
  FETCH_WORKSPACE_DIRECTORY_SUCCESS: { path: string; fileTree: FileTree },
  FETCH_WORKSPACE_DIRECTORY_ERROR: string,
  DISPLAY_NOTIFICATION: {
    title: string
    message: string
    actionOk: () => void
    actionCancel: () => void
    labelOk: string
    labelCancel: string
  },
  HIDE_NOTIFICATION: undefined | null,
  FILE_ADDED_SUCCESS: string,
  FOLDER_ADDED_SUCCESS: {
    path: string
    folderPath: string
    fileTree: FileTree
  },
  FILE_REMOVED_SUCCESS: string,
  ROOT_FOLDER_CHANGED: string,
  ADD_INPUT_FIELD: {
    path: string
    fileTree: FileTree
    type: 'file' | 'folder'
  },
  REMOVE_INPUT_FIELD: { path: string; },
  SET_READ_ONLY_MODE: boolean,
  FILE_RENAMED_SUCCESS: {
    path: string
    oldPath: string
    fileTree: FileTree
  },
  CREATE_WORKSPACE_REQUEST: undefined | null,
  CREATE_WORKSPACE_SUCCESS: {
    name: string
    isGitRepo: boolean
    branches?: branch[]
    currentBranch?: branch
  },
  CREATE_WORKSPACE_ERROR: string,
  RENAME_WORKSPACE: { oldName: string; workspaceName: string },
  DELETE_WORKSPACE: string,
  DISPLAY_POPUP_MESSAGE: string,
  HIDE_POPUP_MESSAGE: undefined | null,
  SET_FOCUS_ELEMENT: {
    key: string
    type: WorkspaceElement
  }[],
  REMOVE_FOCUS_ELEMENT: string,
  SET_CONTEXT_MENU_ITEM: action,
  REMOVE_CONTEXT_MENU_ITEM: { name: string },
  SET_EXPAND_PATH: string[],
  LOAD_LOCALHOST_REQUEST: undefined | null,
  LOAD_LOCALHOST_SUCCESS: undefined | null,
  LOAD_LOCALHOST_ERROR: string,
  CLONE_REPOSITORY_REQUEST: undefined | null,
  CLONE_REPOSITORY_SUCCESS: undefined | null,
  CLONE_REPOSITORY_FAILED: undefined | null,
  FS_INITIALIZATION_COMPLETED: undefined | null,
  SET_FILE_DECORATION_SUCCESS: fileDecoration[],
  SET_CURRENT_WORKSPACE_BRANCHES: branch[],
  SET_CURRENT_WORKSPACE_CURRENT_BRANCH: branch,
  SET_CURRENT_WORKSPACE_IS_GITREPO: boolean,
  SET_CURRENT_WORKSPACE_HAS_GIT_SUBMODULES: boolean,
  SET_GIT_CONFIG: {
    username: string;
    token: string;
    email: string
  },
  SET_ELECTRON_RECENT_FOLDERS: string[]
  SET_CURRENT_LOCAL_FILE_PATH: string
}

export interface Action<T extends keyof ActionPayloadTypes> {
  type: T,
  payload: ActionPayloadTypes[T]
}

export type Actions = {[A in keyof ActionPayloadTypes]: Action<A>}[keyof ActionPayloadTypes]

export type WorkspaceElement = 'folder' | 'file' | 'workspace'

export interface FlatTreeDropProps {
  resetMultiselect: () => void
  moveFolderSilently: (dest: string, src: string) => Promise<void>
  moveFileSilently: (dest: string, src: string) => Promise<void>
  setFilesSelected: Dispatch<React.SetStateAction<string[]>>
  getFlatTreeItem: (path: string) => FileType
  handleClickFolder: (path: string, type: string) => void
  dragSource: FileType
  children: React.ReactNode
  expandPath: string[]
  selectedItems: DragStructure[]
  setSelectedItems: Dispatch<React.SetStateAction<DragStructure[]>>
  warnMovingItems: (srcs: string[], dest: string) => Promise<void>
}

export type DragStructure = {
  position: {
    top: number
    left: number
  }
  path: string
  type: string
  content: string
}
