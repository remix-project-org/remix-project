import path from 'path'
import { extractNameFromKey, extractParentFromKey } from '@remix-ui/helper'
import { action, Actions, FileType, WorkspaceElement } from '../types'
import * as _ from 'lodash'
import { fileDecoration } from '@remix-ui/file-decorators'
import { ROOT_PATH } from '../utils/constants'
import isElectron from 'is-electron'
import { fileKeySort } from '../utils'
import { branch } from '@remix-ui/git'
import { current } from '@reduxjs/toolkit'
export interface BrowserState {
  browser: {
    currentWorkspace: string
    workspaces: {
      name: string
      isGitRepo: boolean
      hasGitSubmodules?: boolean
      branches?: branch[]
      currentBranch?: branch
      isGist: string
      remoteId?: string
    }[]
    files: {[x: string]: Record<string, FileType>}
    flatTree: FileType[]
    expandPath: string[]
    isRequestingDirectory: boolean
    isSuccessfulDirectory: boolean
    isRequestingWorkspace: boolean
    isSuccessfulWorkspace: boolean
    isRequestingCloning: boolean
    isSuccessfulCloning: boolean
    error: string
    contextMenu: {
      registeredMenuItems: action[]
      removedMenuItems: action[]
      error: string
    }
    fileState: fileDecoration[]
    recentFolders: string[]
    currentLocalFilePath?: string
  }
  localhost: {
    sharedFolder: string
    files: {[x: string]: Record<string, FileType>}
    flatTree: FileType[]
    expandPath: string[]
    isRequestingDirectory: boolean
    isSuccessfulDirectory: boolean
    isRequestingLocalhost: boolean
    isSuccessfulLocalhost: boolean
    error: string
    contextMenu: {
      registeredMenuItems: action[]
      removedMenuItems: action[]
      error: string
    }
    fileState: []
  }
  mode: 'browser' | 'localhost'
  notification: {
    title: string
    message: string
    actionOk: () => void
    actionCancel: (() => void) | null
    labelOk: string
    labelCancel: string
  }
  readonly: boolean
  popup: string
  focusEdit: string
  focusElement: {key: string; type: WorkspaceElement}[]
  initializingFS: boolean
  gitConfig: {username: string; email: string; token: string}
}

export const browserInitialState: BrowserState = {
  browser: {
    currentWorkspace: '',
    workspaces: [],
    files: {},
    flatTree: [],
    expandPath: [],
    isRequestingDirectory: false,
    isSuccessfulDirectory: false,
    isRequestingWorkspace: false,
    isSuccessfulWorkspace: false,
    isRequestingCloning: false,
    isSuccessfulCloning: false,
    error: null,
    contextMenu: {
      registeredMenuItems: [],
      removedMenuItems: [],
      error: null
    },
    fileState: [],
    recentFolders: [],
    currentLocalFilePath: ''
  },
  localhost: {
    sharedFolder: '',
    files: {},
    flatTree: [],
    expandPath: [],
    isRequestingDirectory: false,
    isSuccessfulDirectory: false,
    isRequestingLocalhost: false,
    isSuccessfulLocalhost: false,
    error: null,
    contextMenu: {
      registeredMenuItems: [],
      removedMenuItems: [],
      error: null
    },
    fileState: []
  },
  mode: 'browser',
  notification: {
    title: '',
    message: '',
    actionOk: () => {},
    actionCancel: () => {},
    labelOk: '',
    labelCancel: ''
  },
  readonly: false,
  popup: '',
  focusEdit: '',
  focusElement: [],
  initializingFS: true,
  gitConfig: { username: '', email: '', token: '' }
}

export const browserReducer = (state = browserInitialState, action: Actions) => {
  switch (action.type) {
  case 'SET_CURRENT_WORKSPACE': {
    const payload = action.payload
    const workspaces = state.browser.workspaces.find(
      ({ name }) => name === payload.name
    )
      ? state.browser.workspaces
      : [...state.browser.workspaces, action.payload]

    return {
      ...state,
      browser: {
        ...state.browser,
        currentWorkspace: payload.name,
        workspaces: workspaces.filter((workspace) => workspace)
      }
    }
  }

  case 'SET_WORKSPACES': {
    const payload = action.payload
    return {
      ...state,
      browser: {
        ...state.browser,
        workspaces: payload.filter((workspace) => workspace)
      }
    }
  }

  case 'SET_MODE': {
    const payload = action.payload

    return {
      ...state,
      mode: payload
    }
  }

  case 'FETCH_DIRECTORY_REQUEST': {
    return {
      ...state,
      browser: {
        ...state.browser,
        isRequestingDirectory: state.mode === 'browser',
        isSuccessfulDirectory: false,
        error: null
      },
      localhost: {
        ...state.localhost,
        isRequestingDirectory: state.mode === 'localhost',
        isSuccessfulDirectory: false,
        error: null
      }
    }
  }

  case 'FETCH_DIRECTORY_SUCCESS': {
    const payload = action.payload
    const fd = fetchDirectoryContent(state, payload)
    const flatTree = flattenTree(fd, state.mode === 'browser'? state.browser.expandPath : state.localhost.expandPath)

    return {
      ...state,
      browser: {
        ...state.browser,
        files:
            state.mode === 'browser'
              ? fd
              : state.browser.files,
        flatTree: state.mode === 'browser' ? flatTree : state.browser.flatTree,
        isRequestingDirectory: false,
        isSuccessfulDirectory: true,
        error: null
      },
      localhost: {
        ...state.localhost,
        files:
            state.mode === 'localhost'
              ? fd
              : state.localhost.files,
        flatTree: state.mode === 'localhost' ? flatTree : state.localhost.flatTree,
        isRequestingDirectory: false,
        isSuccessfulDirectory: true,
        error: null
      }
    }
  }

  case 'FETCH_DIRECTORY_ERROR': {
    return {
      ...state,
      browser: {
        ...state.browser,
        isRequestingDirectory: false,
        isSuccessfulDirectory: false,
        error: state.mode === 'browser' ? action.payload : null
      },
      localhost: {
        ...state.localhost,
        isRequestingDirectory: false,
        isSuccessfulDirectory: false,
        error: state.mode === 'localhost' ? action.payload : null
      }
    }
  }

  case 'FETCH_WORKSPACE_DIRECTORY_REQUEST': {
    return {
      ...state,
      browser: {
        ...state.browser,
        isRequestingWorkspace: state.mode === 'browser',
        isSuccessfulWorkspace: false,
        error: null
      },
      localhost: {
        ...state.localhost,
        isRequestingWorkspace: state.mode === 'localhost',
        isSuccessfulWorkspace: false,
        error: null
      }
    }
  }

  case 'FETCH_WORKSPACE_DIRECTORY_SUCCESS': {
    const payload = action.payload
    const fd = fetchWorkspaceDirectoryContent(state, payload)
    const flatTree = flattenTree(fd, state.mode === 'browser'? state.browser.expandPath : state.localhost.expandPath)

    return {
      ...state,
      browser: {
        ...state.browser,
        files:
            state.mode === 'browser'
              ? fd
              : state.browser.files,
        flatTree: state.mode === 'browser' ? flatTree : state.browser.flatTree,
        isRequestingWorkspace: false,
        isSuccessfulWorkspace: true,
        error: null
      },
      localhost: {
        ...state.localhost,
        files:
            state.mode === 'localhost'
              ? fd
              : state.localhost.files,
        flatTree: state.mode === 'localhost' ? flatTree : state.localhost.flatTree,
        isRequestingWorkspace: false,
        isSuccessfulWorkspace: true,
        error: null,
        sharedFolder: null
      }
    }
  }

  case 'FETCH_WORKSPACE_DIRECTORY_ERROR': {
    return {
      ...state,
      browser: {
        ...state.browser,
        isRequestingWorkspace: false,
        isSuccessfulWorkspace: false,
        error: state.mode === 'browser' ? action.payload : null
      },
      localhost: {
        ...state.localhost,
        isRequestingWorkspace: false,
        isSuccessfulWorkspace: false,
        error: state.mode === 'localhost' ? action.payload : null
      }
    }
  }

  case 'DISPLAY_NOTIFICATION': {
    const payload = action.payload

    return {
      ...state,
      notification: {
        title: payload.title,
        message: payload.message,
        actionOk:
            payload.actionOk || browserInitialState.notification.actionOk,
        actionCancel:
            payload.actionCancel ||
            browserInitialState.notification.actionCancel,
        labelOk: payload.labelOk,
        labelCancel: payload.labelCancel
      }
    }
  }

  case 'HIDE_NOTIFICATION': {
    return {
      ...state,
      notification: browserInitialState.notification
    }
  }

  case 'FILE_ADDED_SUCCESS': {
    const payload = action.payload

    const check = checkCurrentParentPathInView(payload, state.mode === 'browser' ? state.browser.expandPath : state.localhost.expandPath)
    const fd = fileAdded(state, payload)
    const browserExpandPath = state.mode === 'browser' && !isElectron() && check.inView && !payload.includes('.deps') ? [...new Set([...state.browser.expandPath, payload])] : state.browser.expandPath
    const localhostExpandPath = state.mode === 'localhost' && check.inView && !payload.includes('.deps') ? [...new Set([...state.localhost.expandPath, payload])] : state.localhost.expandPath
    const flatTree = flattenTree(fd, state.mode === 'browser'? browserExpandPath : localhostExpandPath)
    return {
      ...state,
      browser: {
        ...state.browser,
        files:
            state.mode === 'browser'
              ? fd
              : state.browser.files,
        flatTree: state.mode === 'browser' ? flatTree : state.browser.flatTree,
        expandPath:
          browserExpandPath
      },
      localhost: {
        ...state.localhost,
        files:
            state.mode === 'localhost'
              ? fd
              : state.localhost.files,
        flatTree: state.mode === 'localhost' ? flatTree : state.localhost.flatTree,
        expandPath:
            localhostExpandPath
      }
    }
  }

  case 'FOLDER_ADDED_SUCCESS': {
    const payload = action.payload
    const fd = fetchDirectoryContent(state, payload)

    const check = checkCurrentParentPathInView(payload.folderPath, state.mode === 'browser' ? state.browser.expandPath : state.localhost.expandPath)
    const inView = check.inView || check.rootViewToAdd
    payload.folderPath = check.inView ? payload.folderPath : check.rootViewToAdd ? check.rootFolder : ''

    const browserExpandPath = state.mode === 'browser' && !isElectron() && inView && !payload.folderPath.includes('.deps') ? [...new Set([...state.browser.expandPath, payload.folderPath])] : state.browser.expandPath
    const localhostExpandPath = state.mode === 'localhost' && inView && !payload.folderPath.includes('.deps') ? [...new Set([...state.localhost.expandPath, payload.folderPath])] : state.localhost.expandPath
    const flatTree = flattenTree(fd, state.mode === 'browser'? browserExpandPath : localhostExpandPath)
    return {
      ...state,
      browser: {
        ...state.browser,
        files:
            state.mode === 'browser'
              ? fd
              : state.browser.files,
        flatTree: state.mode === 'browser' ? flatTree : state.browser.flatTree,
        expandPath:
          browserExpandPath
      },
      localhost: {
        ...state.localhost,
        files:
            state.mode === 'localhost'
              ? fd
              : state.localhost.files,
        flatTree: state.mode === 'localhost' ? flatTree : state.localhost.flatTree,
        expandPath:
            localhostExpandPath
      }
    }
  }

  case 'FILE_REMOVED_SUCCESS': {
    const payload = action.payload
    const fd = fileRemoved(state, payload)
    const browserExpandPath = state.mode === 'browser' && !isElectron() ? [...state.browser.expandPath.filter((path) => path !== payload)] : state.browser.expandPath
    const localhostExpandPath = state.mode === 'localhost' ? [...state.localhost.expandPath.filter((path) => path !== payload)] : state.localhost.expandPath
    const flatTree = flattenTree(fd, state.mode === 'browser'? browserExpandPath : localhostExpandPath)

    return {
      ...state,
      browser: {
        ...state.browser,
        files:
            state.mode === 'browser'
              ? fd
              : state.browser.files,
        flatTree: state.mode === 'browser' ? flatTree : state.browser.flatTree,
        expandPath:
          browserExpandPath
      },
      localhost: {
        ...state.localhost,
        files:
            state.mode === 'localhost'
              ? fd
              : state.localhost.files,
        flatTree: state.mode === 'localhost' ? flatTree : state.localhost.flatTree,
        expandPath:
            localhostExpandPath
      }
    }
  }

  case 'ROOT_FOLDER_CHANGED': {
    const payload = action.payload as string
    return {
      ...state,
      localhost: {
        ...state.localhost,
        sharedFolder: payload,
        files: {}
      }
    }
  }

  case 'ADD_INPUT_FIELD': {
    const payload = action.payload
    const fd = fetchDirectoryContent(state, payload)
    const flatTree = flattenTree(fd, state.mode === 'browser'? state.browser.expandPath : state.localhost.expandPath)
    return {
      ...state,
      browser: {
        ...state.browser,
        files:
            state.mode === 'browser'
              ? fd
              : state.browser.files,
        flatTree: state.mode === 'browser' ? flatTree : state.browser.flatTree,
      },
      localhost: {
        ...state.localhost,
        files:
            state.mode === 'localhost'
              ? fd
              : state.localhost.files,
        flatTree: state.mode === 'localhost' ? flatTree : state.localhost.flatTree,
      },
      focusEdit: payload.path + '/' + '....blank'
    }
  }

  case 'REMOVE_INPUT_FIELD': {
    const payload = action.payload
    const fd = removeInputField(state, payload.path)
    const flatTree = flattenTree(fd, state.mode === 'browser'? state.browser.expandPath : state.localhost.expandPath)
    return {
      ...state,
      browser: {
        ...state.browser,
        files:
            state.mode === 'browser'
              ? fd
              : state.browser.files,
        flatTree: state.mode === 'browser' ? flatTree : state.browser.flatTree,
      },
      localhost: {
        ...state.localhost,
        files:
            state.mode === 'localhost'
              ? fd
              : state.localhost.files,
        flatTree: state.mode === 'localhost' ? flatTree : state.localhost.flatTree,
      },
      focusEdit: null
    }
  }

  case 'SET_READ_ONLY_MODE': {
    const payload = action.payload

    return {
      ...state,
      readonly: payload
    }
  }

  case 'FILE_RENAMED_SUCCESS': {
    const payload = action.payload
    const fd = fetchDirectoryContent(state, payload, payload.oldPath)
    const flatTree = flattenTree(fd, state.mode === 'browser'? state.browser.expandPath : state.localhost.expandPath)
    return {
      ...state,
      browser: {
        ...state.browser,
        files:
            state.mode === 'browser'
              ? fd
              : state.browser.files,
        flatTree: state.mode === 'browser' ? flatTree : state.browser.flatTree,
      },
      localhost: {
        ...state.localhost,
        files:
            state.mode === 'localhost'
              ? fd
              : state.localhost.files,
        flatTree: state.mode === 'localhost' ? flatTree : state.localhost.flatTree,
      }
    }
  }

  case 'CREATE_WORKSPACE_REQUEST': {
    return {
      ...state,
      browser: {
        ...state.browser,
        isRequestingWorkspace: true,
        isSuccessfulWorkspace: false,
        error: null
      }
    }
  }

  case 'CREATE_WORKSPACE_SUCCESS': {
    const payload = action.payload
    const workspaces = state.browser.workspaces.find(
      ({ name }) => name === payload.name
    )
      ? state.browser.workspaces
      : [...state.browser.workspaces, action.payload]

    return {
      ...state,
      browser: {
        ...state.browser,
        currentWorkspace: payload.name,
        workspaces: workspaces.filter((workspace) => workspace),
        isRequestingWorkspace: false,
        isSuccessfulWorkspace: true,
        error: null
      }
    }
  }

  case 'CREATE_WORKSPACE_ERROR': {
    return {
      ...state,
      browser: {
        ...state.browser,
        isRequestingWorkspace: false,
        isSuccessfulWorkspace: false,
        error: action.payload
      }
    }
  }

  case 'RENAME_WORKSPACE': {
    const payload = action.payload
    let renamedWorkspace
    const workspaces = state.browser.workspaces.filter(
      ({ name, isGitRepo, branches, currentBranch }) => {
        if (name && name !== payload.oldName) {
          return true
        } else {
          renamedWorkspace = {
            name: payload.workspaceName,
            isGitRepo,
            branches,
            currentBranch
          }
          return false
        }
      }
    )

    return {
      ...state,
      browser: {
        ...state.browser,
        currentWorkspace: payload.workspaceName,
        workspaces: [...workspaces, renamedWorkspace],
        expandPath: []
      }
    }
  }

  case 'DELETE_WORKSPACE': {
    const payload = action.payload
    const workspaces = state.browser.workspaces.filter(
      ({ name }) => name && name !== payload
    )

    return {
      ...state,
      browser: {
        ...state.browser,
        workspaces: workspaces
      }
    }
  }

  case 'DISPLAY_POPUP_MESSAGE': {
    const payload = action.payload

    return {
      ...state,
      popup: payload
    }
  }

  case 'HIDE_POPUP_MESSAGE': {
    return {
      ...state,
      popup: ''
    }
  }

  case 'SET_FOCUS_ELEMENT': {
    const payload = action.payload

    return {
      ...state,
      focusElement: payload
    }
  }

  case 'REMOVE_FOCUS_ELEMENT': {
    const payload = action.payload

    return {
      ...state,
      focusElement: state.focusElement.filter(
        (element) => element.key !== payload
      )
    }
  }

  case 'SET_CONTEXT_MENU_ITEM': {
    const payload = action.payload

    return {
      ...state,
      browser: {
        ...state.browser,
        contextMenu: addContextMenuItem(state, payload)
      },
      localhost: {
        ...state.localhost,
        contextMenu: addContextMenuItem(state, payload)
      }
    }
  }

  case 'REMOVE_CONTEXT_MENU_ITEM': {
    const payload = action.payload

    return {
      ...state,
      browser: {
        ...state.browser,
        contextMenu: removeContextMenuItem(state, payload)
      },
      localhost: {
        ...state.localhost,
        contextMenu: removeContextMenuItem(state, payload)
      }
    }
  }

  case 'SET_EXPAND_PATH': {
    const payload = action.payload as string[]
    const flatTree = flattenTree(state.mode === 'browser' ? state.browser.files : state.localhost.files, payload)
    return {
      ...state,
      browser: {
        ...state.browser,
        flatTree: state.mode === 'browser' ? flatTree : state.browser.flatTree,
        expandPath: payload
      },
      localhost: {
        ...state.localhost,
        flatTree: state.mode === 'localhost' ? flatTree : state.localhost.flatTree,
        expandPath: payload
      }
    }
  }

  case 'LOAD_LOCALHOST_REQUEST': {
    return {
      ...state,
      localhost: {
        ...state.localhost,
        isRequestingLocalhost: true,
        isSuccessfulLocalhost: false,
        error: null
      }
    }
  }

  case 'LOAD_LOCALHOST_SUCCESS': {
    return {
      ...state,
      localhost: {
        ...state.localhost,
        isRequestingLocalhost: false,
        isSuccessfulLocalhost: true,
        error: null
      }
    }
  }

  case 'LOAD_LOCALHOST_ERROR': {
    const payload = action.payload as string

    return {
      ...state,
      localhost: {
        ...state.localhost,
        isRequestingLocalhost: false,
        isSuccessfulLocalhost: false,
        error: payload
      }
    }
  }

  case 'CLONE_REPOSITORY_REQUEST': {
    return {
      ...state,
      browser: {
        ...state.browser,
        isRequestingCloning: true,
        isSuccessfulCloning: false
      }
    }
  }

  case 'CLONE_REPOSITORY_SUCCESS': {
    return {
      ...state,
      browser: {
        ...state.browser,
        isRequestingCloning: false,
        isSuccessfulCloning: true
      }
    }
  }

  case 'CLONE_REPOSITORY_FAILED': {
    return {
      ...state,
      browser: {
        ...state.browser,
        isRequestingCloning: false,
        isSuccessfulCloning: false
      }
    }
  }

  case 'FS_INITIALIZATION_COMPLETED': {
    return {
      ...state,
      initializingFS: false
    }
  }

  case 'SET_FILE_DECORATION_SUCCESS': {
    return {
      ...state,
      browser: {
        ...state.browser,
        fileState: action.payload
      }
    }
  }

  case 'SET_CURRENT_WORKSPACE_BRANCHES': {
    const payload = action.payload

    return {
      ...state,
      browser: {
        ...state.browser,
        workspaces: state.browser.workspaces.map((workspace) => {
          if (workspace.name === state.browser.currentWorkspace)
            workspace.branches = payload
          return workspace
        })
      }
    }
  }

  case 'SET_CURRENT_WORKSPACE_CURRENT_BRANCH': {
    const payload = action.payload

    return {
      ...state,
      browser: {
        ...state.browser,
        workspaces: state.browser.workspaces.map((workspace) => {
          if (workspace.name === state.browser.currentWorkspace)
            workspace.currentBranch = payload
          return workspace
        })
      }
    }
  }

  case 'SET_CURRENT_WORKSPACE_IS_GITREPO': {
    const payload = action.payload

    return {
      ...state,
      browser: {
        ...state.browser,
        workspaces: state.browser.workspaces.map((workspace) => {
          if (workspace.name === state.browser.currentWorkspace)
            workspace.isGitRepo = payload
          return workspace
        })
      }
    }
  }

  case 'SET_CURRENT_WORKSPACE_HAS_GIT_SUBMODULES': {
    const payload = action.payload

    return {
      ...state,
      browser: {
        ...state.browser,
        workspaces: state.browser.workspaces.map((workspace) => {
          if (workspace.name === state.browser.currentWorkspace)
            workspace.hasGitSubmodules = payload
          return workspace
        })
      }
    }
  }

  case 'SET_GIT_CONFIG': {
    const payload =
        action.payload
    return {
      ...state,
      gitConfig: payload
    }
  }

  case 'SET_ELECTRON_RECENT_FOLDERS': {
    const payload: string[] = action.payload
    return {
      ...state,
      browser: {
        ...state.browser,
        recentFolders: payload
      }
    }
  }

  case 'SET_CURRENT_LOCAL_FILE_PATH': {
    const payload: string = action.payload
    return {
      ...state,
      browser: {
        ...state.browser,
        currentLocalFilePath: payload
      }
    }
  }

  default:
    throw new Error()
  }
}

const flattenTree = (files, expandPath: string[]) =>{
  const flatTree = []
  const mapChild = (file: FileType) => {

    if (!file || !file.path) return

    flatTree.push(file)

    if (file.isDirectory && file.child && expandPath && expandPath.find((path) => path === file.path || path.startsWith(file.path + '/')) ) {
      const sorted = fileKeySort(file.child)
      Object.keys(sorted).map((key) => {
        mapChild(sorted[key])
      })
    }
  }
  if (files){
    const sorted = fileKeySort(files[ROOT_PATH])
    Object.keys(sorted).map((key) => {
      mapChild(sorted[key])
    })
  }

  return flatTree
}

const fileAdded = (
  state: BrowserState,
  path: string
): {[x: string]: Record<string, FileType>} => {
  let files =
    state.mode === 'browser' ? state.browser.files : state.localhost.files
  if (!path) return files
  const _path = splitPath(state, path)
  const childPath = _path.slice(0, _path.length - 1)

  files = _.setWith(
    files,
    _path,
    {
      path: path,
      name: extractNameFromKey(path),
      isDirectory: false,
      type: 'file'
    },
    Object
  )
  const prevFiles = _.get(files, childPath)

  files = _.setWith(
    files,
    childPath,
    {
      ...prevFiles
    },
    Object
  )

  return files
}

const fileRemoved = (
  state: BrowserState,
  path: string
): {[x: string]: Record<string, FileType>} => {
  const files =
    state.mode === 'browser' ? state.browser.files : state.localhost.files
  const _path = splitPath(state, path)

  _.unset(files, _path)
  return files
}

const removeInputField = (
  state: BrowserState,
  path: string
): {[x: string]: Record<string, FileType>} => {
  let files =
    state.mode === 'browser' ? state.browser.files : state.localhost.files
  const root = ROOT_PATH
  if (path === root) {
    delete files[root][path + '/' + '....blank']
    return files
  }
  const _path = splitPath(state, path)
  const prevFiles = _.get(files, _path)

  if (prevFiles) {
    prevFiles.child &&
      prevFiles.child[path + '/' + '....blank'] &&
      delete prevFiles.child[path + '/' + '....blank']
    files = _.setWith(
      files,
      _path,
      {
        isDirectory: true,
        path,
        name: extractNameFromKey(path),
        type: 'folder',
        child: prevFiles ? prevFiles.child : {}
      },
      Object
    )
  }

  return files
}

// IDEA: Modify function to remove blank input field without fetching content
const fetchDirectoryContent = (
  state: BrowserState,
  payload: {fileTree; path: string; type?: 'file' | 'folder'},
  deletePath?: string
): {[x: string]: Record<string, FileType>} => {
  if (!payload.fileTree)
    return state.mode === 'browser'
      ? state.browser.files
      : state[state.mode].files
  if (state.mode === 'browser') {
    if (payload.path === ROOT_PATH) {
      let files = normalize(payload.fileTree, ROOT_PATH, payload.type)
      files = _.merge(files, state.browser.files[ROOT_PATH])
      if (deletePath) delete files[deletePath]
      return { [ROOT_PATH]: files }
    } else {
      let files = state.browser.files
      const _path = splitPath(state, payload.path)
      let prevFiles = _.get(files, _path)

      if (!prevFiles) {
        const object = {}
        let o = object
        for (const pa of _path) {
          o = o[pa] = {}
        }
        files = _.defaultsDeep(files, object)
        prevFiles = _.get(files, _path)
      }

      if (prevFiles) {
        prevFiles.child = _.merge(
          normalize(payload.fileTree, payload.path, payload.type),
          prevFiles.child
        )
        if (deletePath) {
          if (deletePath.endsWith('/....blank')) delete prevFiles.child[deletePath]
          else {
            deletePath = extractNameFromKey(deletePath)
            delete prevFiles.child[deletePath]
          }
        }
        files = _.setWith(files, _path, prevFiles, Object)
      } else if (payload.fileTree && payload.path) {
        files = {
          [payload.path]: normalize(
            payload.fileTree,
            payload.path,
            payload.type
          )
        }
      }
      return files
    }
  } else {
    if (payload.path === ROOT_PATH) {
      let files = normalize(payload.fileTree, ROOT_PATH, payload.type)
      files = _.merge(files, state.localhost.files[ROOT_PATH])
      if (deletePath) delete files[deletePath]
      return { [ROOT_PATH]: files }
    } else {
      let files = state.localhost.files
      const _path = splitPath(state, payload.path)
      const prevFiles = _.get(files, _path)

      if (prevFiles) {
        prevFiles.child = _.merge(
          normalize(payload.fileTree, payload.path, payload.type),
          prevFiles.child
        )
        if (deletePath) {
          if (deletePath.endsWith('/....blank')) delete prevFiles.child[deletePath]
          else {
            deletePath = extractNameFromKey(deletePath)
            delete prevFiles.child[deletePath]
          }
        }
        files = _.setWith(files, _path, prevFiles, Object)
      } else {
        files = {
          [payload.path]: normalize(
            payload.fileTree,
            payload.path,
            payload.type
          )
        }
      }
      return files
    }
  }
}

const checkCurrentParentPathInView = (currentPath: string, expandPath: string[]) => {
  try {
    let rootViewToAdd = false
    let inView = false
    let rootFolder
    const parent = path.dirname(currentPath)
    if (parent === '.') {
      // this folder is at the root.
      rootFolder = currentPath
      if (!expandPath.includes(currentPath)) { // But at least show the root if it's not already there.
        rootFolder = currentPath
        rootViewToAdd = true
      }
    } else {
      const root = currentPath.split('/')[0]
      if (!expandPath.includes(parent)) { // current path is not yet displayed
        inView = false
        if (!expandPath.includes(root)) { // But at least show the root if it's not already there.
          rootFolder = root
          rootViewToAdd = true
        }
      } else
        inView = true
    }
    return {
      rootFolder,
      rootViewToAdd,
      inView
    }
  } catch (e) {
    console.log(e)
    return {
      rootFolder:undefined,
      rootViewToAdd: false,
      inView: true
    }
  }
}

const fetchWorkspaceDirectoryContent = (
  state: BrowserState,
  payload: {fileTree; path: string}
): {[x: string]: Record<string, FileType>} => {
  const files = normalize(payload.fileTree, ROOT_PATH)

  return { [ROOT_PATH]: files }
}

const normalize = (
  filesList,
  directory?: string,
  newInputType?: 'folder' | 'file'
): Record<string, FileType> => {
  const folders = {}
  const files = {}

  Object.keys(filesList || {}).forEach((key) => {
    key = key.replace(/^\/|\/$/g, '') // remove first and last slash
    let path = key
    path = path.replace(/^\/|\/$/g, '') // remove first and last slash

    if (filesList[key].isDirectory) {
      folders[extractNameFromKey(key)] = {
        path,
        name: extractNameFromKey(path),
        isDirectory: filesList[key].isDirectory,
        type: 'folder'
      }
    } else {
      files[extractNameFromKey(key)] = {
        path,
        name: extractNameFromKey(path),
        isDirectory: filesList[key].isDirectory,
        type: 'file'
      }
    }
  })

  if (newInputType === 'folder') {
    const path = directory + '/....blank'

    folders[path] = {
      path: path,
      name: '',
      isDirectory: true,
      type: 'folder'
    }
  } else if (newInputType === 'file') {
    const path = directory + '/....blank'

    files[path] = {
      path: path,
      name: '',
      isDirectory: false,
      type: 'file'
    }
  }

  return Object.assign({}, folders, files)
}

const splitPath = (state: BrowserState, path: string): string[] | string => {
  const root = ROOT_PATH
  const pathArr: string[] = (path || '').split('/').filter((value) => value)

  if (pathArr[0] !== root) pathArr.unshift(root)
  const _path = pathArr
    .map((key, index) => (index > 1 ? ['child', key] : key))
    .reduce((acc: string[], cur) => {
      return Array.isArray(cur) ? [...acc, ...cur] : [...acc, cur]
    }, [])

  return _path
}

const addContextMenuItem = (
  state: BrowserState,
  item: action
): {
  registeredMenuItems: action[]
  removedMenuItems: action[]
  error: string
} => {
  let registeredItems = state[state.mode].contextMenu.registeredMenuItems
  let removedItems = state[state.mode].contextMenu.removedMenuItems
  let error = null

  if (
    registeredItems.filter((o) => {
      return o.id === item.id && o.name === item.name
    }).length
  ) {
    error = `Action ${item.name} already exists on ${item.id}`
    return {
      registeredMenuItems: registeredItems,
      removedMenuItems: removedItems,
      error
    }
  }
  registeredItems = [...registeredItems, item]
  removedItems = removedItems.filter((menuItem) => item.id !== menuItem.id)
  return {
    registeredMenuItems: registeredItems,
    removedMenuItems: removedItems,
    error
  }
}

const removeContextMenuItem = (
  state: BrowserState,
  plugin: {name: string}
): {
  registeredMenuItems: action[]
  removedMenuItems: action[]
  error: string
} => {
  let registeredItems = state[state.mode].contextMenu.registeredMenuItems
  const removedItems = state[state.mode].contextMenu.removedMenuItems
  const error = null

  registeredItems = registeredItems.filter((item) => {
    if (item.id !== plugin.name || item.sticky === true) return true
    else {
      removedItems.push(item)
      return false
    }
  })
  return {
    registeredMenuItems: registeredItems,
    removedMenuItems: removedItems,
    error
  }
}
