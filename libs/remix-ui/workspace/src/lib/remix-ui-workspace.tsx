import React, {useState, useEffect, useRef, useContext, ChangeEvent, useReducer} from 'react' // eslint-disable-line
import { FormattedMessage, useIntl } from 'react-intl'
import { Dropdown } from 'react-bootstrap'
import { CustomIconsToggle, CustomMenu, CustomToggle, CustomTooltip, extractNameFromKey, extractParentFromKey } from '@remix-ui/helper'
import { CopyToClipboard } from '@remix-ui/clipboard'
import {FileExplorer} from './components/file-explorer' // eslint-disable-line
import {ModalDialog, ValidationResult} from '@remix-ui/modal-dialog' // eslint-disable-line
import { FileSystemContext } from './contexts'
import './css/remix-ui-workspace.css'
import { ROOT_PATH, TEMPLATE_NAMES } from './utils/constants'
import { HamburgerMenu } from './components/workspace-hamburger'

import { MenuItems, WorkSpaceState, WorkspaceMetadata } from './types'
import { contextMenuActions } from './utils'
import FileExplorerContextMenu from './components/file-explorer-context-menu'
import { customAction } from '@remixproject/plugin-api'
import { appActionTypes, AppContext, appPlatformTypes, platformContext } from '@remix-ui/app'
import { TrackingContext } from '@remix-ide/tracking'
import { MatomoEvent, HomeTabEvent, WorkspaceEvent } from '@remix-api'
import { ElectronMenu } from './components/electron-menu'
import { ElectronWorkspaceName } from './components/electron-workspace-name'
import { branch } from '@remix-api'
import { gitUIPanels } from '@remix-ui/git'
import { createModalMessage } from './components/createModal'
import FileExplorerMenu from './components/file-explorer-menu'

const canUpload = window.File || window.FileReader || window.FileList || window.Blob

export function Workspace() {
  const platform = useContext(platformContext)
  const LOCALHOST = ' - connect to localhost - '
  const NO_WORKSPACE = ' - none - '
  const [currentWorkspace, setCurrentWorkspace] = useState<string>(NO_WORKSPACE)
  const [selectedWorkspace, setSelectedWorkspace] = useState<WorkspaceMetadata>(null)
  const [workspaceHeight, setWorkspaceHeight] = useState(window.innerHeight < 750 ? 87 : window.innerHeight < 1000 ? 89.6 : 92)
  const [showDropdown, setShowDropdown] = useState<boolean>(false)
  const [showIconsMenu, hideIconsMenu] = useState<boolean>(false)
  const [showBranches, setShowBranches] = useState<boolean>(false)
  const [highlightUpdateSubmodules, setHighlightUpdateSubmodules] = useState<boolean>(false)
  const [branchFilter, setBranchFilter] = useState<string>('')
  const displayOzCustomRef = useRef<HTMLDivElement>()
  const mintableCheckboxRef = useRef()
  const burnableCheckboxRef = useRef()
  const pausableCheckboxRef = useRef()
  const transparentRadioRef = useRef()
  const uupsRadioRef = useRef()
  const global = useContext(FileSystemContext)
  const workspaceRenameInput = useRef()
  const intl = useIntl()
  const cloneUrlRef = useRef<HTMLInputElement>()
  const fileExplorerRef = useRef<HTMLDivElement>()
  const [fileExplorerWidth, setFileExplorerWidth] = useState<number>(320)
  const filteredBranches = selectedWorkspace ? (selectedWorkspace.branches || []).filter((branch) => branch.name.includes(branchFilter) && branch.name !== 'HEAD').slice(0, 20) : []
  const currentBranch = selectedWorkspace ? selectedWorkspace.currentBranch : null

  const [canPaste, setCanPaste] = useState(false)

  const appContext = useContext(AppContext)
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)
  const trackMatomoEvent = <T extends MatomoEvent = WorkspaceEvent>(event: T) => {
    baseTrackEvent?.<T>(event)
  }

  const [state, setState] = useState<WorkSpaceState>({
    ctrlKey: false,
    cutShortcut: false,
    deleteKey: false,
    F2Key: false,
    newFileName: '',
    actions: contextMenuActions,
    focusContext: {
      element: null,
      x: null,
      y: null,
      type: ''
    },
    focusEdit: {
      element: null,
      type: '',
      isNew: false,
      lastEdit: ''
    },
    mouseOverElement: null,
    showContextMenu: false,
    reservedKeywords: [ROOT_PATH],
    copyElement: [],
    dragStatus: false
  })

  useEffect(() => {
    if (canPaste) {
      addMenuItems([
        {
          id: 'paste',
          name: 'Paste',
          type: ['folder', 'file', 'workspace'],
          path: [],
          extension: [],
          pattern: [],
          multiselect: false,
          label: '',
          group: 4
        }
      ])
    } else {
      removeMenuItems([
        {
          id: 'paste',
          name: 'Paste',
          type: ['folder', 'file', 'workspace'],
          path: [],
          extension: [],
          pattern: [],
          multiselect: false,
          label: '',
          group: 4
        }
      ])
    }
  }, [canPaste])

  const [modalState, setModalState] = useState<{
    searchInput: string
    showModalDialog: boolean
    // modalValidation?: ValidationResult
    modalInfo: {
      title: string
      loadItem: string
      examples: Array<string>
      prefix?: string
    }
    importSource: string
    toasterMsg: string
  }>({
    searchInput: '',
    showModalDialog: false,
    // modalValidation: {} as ValidationResult,
    modalInfo: { title: '', loadItem: '', examples: [], prefix: '' },
    importSource: '',
    toasterMsg: ''
  })

  const [validationResult, setValidationResult] = useState<ValidationResult>({ valid: true, message: '' })
  const [feTarget, setFeTarget] = useState<{ key: string, type: 'file' | 'folder' }[]>({} as { key: string, type: 'file' | 'folder' }[])

  const loadingInitialState = {
    tooltip: '',
    showModalDialog: false,
    importSource: '',
  }

  const loadingReducer = (state = loadingInitialState, action) => {
    return {
      ...state,
      tooltip: action.tooltip,
      showModalDialog: false,
      importSource: '',
    }
  }
  const inputValue = useRef(null)
  const [, dispatch] = useReducer(loadingReducer, loadingInitialState)
  const [hasCopied, setHasCopied] = useState(false)

  const toast = (message: string) => {
    setModalState((prevState) => {
      return { ...prevState, toasterMsg: message }
    })
  }

  const nameGistFolder = (filePath: string) => {
    const prepend = `Gist_${filePath}`
    const append = `${prepend}-folder`
    return append
  }

  /**
   * Void action to ensure multiselected files are published
   * folders are not handled
   */
  const handlePublishingMultiSelectedFilesToGist = async () => {
    try {
      const selectedFiles = []
      for (const one of feTarget) {
        if (one.type === 'folder') return
        const content = await global.plugin.call('fileManager', 'readFile', one.key)
        selectedFiles.push({ key: one.key, type: one.type, content: content })
      }
      global.dispatchPublishFilesToGist(selectedFiles)
    } catch (error) {
      await global.plugin.call('notification', 'toast', 'Could not publish files to gist. There was an error')
      await global.plugin.call('notification', 'toast', typeof(error) === 'string' ? error : `${console.log(error)} check the console for more details`)
    }
  }

  useEffect(() => {
    global.plugin.on('finishedGistPublish', (folderName) => {
    })
  }, [])

  useEffect(() => {
    if (!fileExplorerRef.current) return

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setFileExplorerWidth(entry.contentRect.width)
      }
    })

    resizeObserver.observe(fileExplorerRef.current)

    return () => {
      resizeObserver.disconnect()
    }
  }, [fileExplorerRef.current])

  const showFullMessage = async (title: string, loadItem: string, examples: Array<string>, prefix = '') => {
    setModalState((prevState) => {
      return {
        ...prevState,
        showModalDialog: true,
        modalInfo: {
          title: title,
          loadItem: loadItem,
          examples: examples,
          prefix,
        },
      }
    })
  }

  const hideFullMessage = () => {
    //eslint-disable-line
    setModalState((prevState) => {
      return { ...prevState, showModalDialog: false, importSource: '' }
    })
  }

  const examples = modalState.modalInfo.examples.map((urlEl, key) => (
    <div key={key} className="p-1 user-select-auto">
      <a>{urlEl}</a>
    </div>
  ))

  const processLoading = (type: string) => {
    trackMatomoEvent<HomeTabEvent>({ category: 'hometab', action: 'filesSection', name: 'importFrom' + type, isClick: true })
    const contentImport = global.plugin.contentImport
    const workspace = global.plugin.fileManager.getProvider('workspace')
    const startsWith = modalState.importSource.substring(0, 4)
    if ((type === 'ipfs' || type === 'IPFS') && startsWith !== 'ipfs' && startsWith !== 'IPFS') {
      setModalState((prevState) => {
        return { ...prevState, importSource: startsWith + modalState.importSource }
      })
    }

    contentImport.import(
      modalState.modalInfo.prefix + modalState.importSource,
      (loadingMsg) => dispatch({ tooltip: loadingMsg }),
      async (error, content, cleanUrl, type, url) => {
        if (error) {
          toast(error.message || error)
        } else {
          try {
            if (await workspace.exists(type + '/' + cleanUrl)) toast('File already exists in workspace')
            else {
              workspace.addExternal(type + '/' + cleanUrl, content, url)
              global.plugin.call('menuicons', 'select', 'filePanel')
            }
          } catch (e) {
            toast(e.message)
          }
        }
      }
    )
    setModalState((prevState) => {
      return { ...prevState, showModalDialog: false, importSource: '' }
    })
  }

  /**
   * show modal for either ipfs or https icons in file explorer menu
   * @returns void
   */
  const importFromUrl = (title: string, loadItem: string, examples: Array<string>, prefix = '') => {
    showFullMessage(title, loadItem, examples, prefix)
  }

  /**
   * Validate the url fed into the modal for ipfs and https imports
   * @returns {ValidationResult}
   */
  const validateUrlForImport = (input: any) => {
    if ((input.trim().startsWith('ipfs://') && input.length > 7) || input.trim().startsWith('https://') || input.trim() !== '') {
      return { valid: true, message: '' }
    } else {
      global.plugin.call('notification', 'alert', { id: 'homeTabAlert', message: 'The provided value is invalid!' })
      return { valid: false, message: 'The provided value is invalid!' }
    }
  }

  useEffect(() => {
    let workspaceName = localStorage.getItem('currentWorkspace')
    if (!workspaceName && global.fs.browser.workspaces.length) {
      workspaceName = global.fs.browser.workspaces[0].name
    }
    setCurrentWorkspace(workspaceName)
    resetFocus()

    // expose some UI to the plugin, perhaps not the best way to do it
    if (global.plugin) {
      global.plugin.loadTemplate = async () => {
        await global.plugin.call('menuicons', 'select', 'filePanel')
        createWorkspace()
      }
      global.plugin.clone = async () => {
        await global.plugin.call('menuicons', 'select', 'filePanel')
        cloneGitRepository()
      }
    }

    global.plugin.on('dgitApi', 'repositoryWithSubmodulesCloned', () => {
      setHighlightUpdateSubmodules(true)
    })
  }, [])

  useEffect(() => {
    if (global.fs.mode === 'browser') {
      if (global.fs.browser.currentWorkspace) {
        setCurrentWorkspace(global.fs.browser.currentWorkspace)
        global.dispatchFetchWorkspaceDirectory(ROOT_PATH)
      } else {
        setCurrentWorkspace(NO_WORKSPACE)
      }
    } else if (global.fs.mode === 'localhost') {
      global.dispatchFetchWorkspaceDirectory(ROOT_PATH)
      setCurrentWorkspace(LOCALHOST)
    }
  }, [global.fs.browser.currentWorkspace, global.fs.localhost.sharedFolder, global.fs.mode])

  useEffect(() => {
    if (global.fs.browser.currentWorkspace && !global.fs.browser.workspaces.find(({ name }) => name === global.fs.browser.currentWorkspace)) {
      if (global.fs.browser.workspaces.length > 0) {
        switchWorkspace(global.fs.browser.workspaces[global.fs.browser.workspaces.length - 1].name)
      } else {
        switchWorkspace(NO_WORKSPACE)
      }
    }
  }, [global.fs.browser.workspaces])

  useEffect(() => {
    const workspace = global.fs.browser.workspaces.find((workspace) => workspace.name === currentWorkspace)
    setSelectedWorkspace(workspace)
  }, [currentWorkspace])

  const renameCurrentWorkspace = () => {
    global.modal(
      intl.formatMessage({ id: 'filePanel.workspace.rename' }),
      renameModalMessage(),
      intl.formatMessage({ id: 'filePanel.save' }),
      onFinishRenameWorkspace,
      intl.formatMessage({ id: 'filePanel.cancel' })
    )
  }

  const [counter, setCounter] = useState(1)
  const createBlankWorkspace = async () => {
    const username = await global.plugin.call('settings', 'get', 'settings/github-user-name')
    const email = await global.plugin.call('settings', 'get', 'settings/github-email')
    const gitNotSet = !username || !email
    const defaultName = await global.plugin.call('filePanel', 'getAvailableWorkspaceName', 'blank')
    let workspace = defaultName
    let gitInit = false
    setCounter((previous) => {
      return previous + 1
    })
    global.modal(
      intl.formatMessage({ id: 'filePanel.workspace.createBlank' }),
      await createModalMessage(workspace ? workspace: `blank - ${counter}`, gitNotSet, (value) => { workspace = value }, (value) => {gitInit = value === 'on'}),
      intl.formatMessage({ id: 'filePanel.ok' }),
      () => global.dispatchCreateWorkspace(workspace ? workspace: `blank - ${counter}`, 'blank', null, gitInit),
      intl.formatMessage({ id: 'filePanel.cancel' })
    )
  }

  const saveSampleCodeWorkspace = () => {
    const workspaceName = global.plugin.getAvailableWorkspaceName('code-sample')
    global.modal(
      intl.formatMessage({ id: 'filePanel.workspace.save_workspace' }),
      renameModalMessage(workspaceName),
      intl.formatMessage({ id: 'filePanel.save' }),
      onFinishRenameWorkspace,
      intl.formatMessage({ id: 'filePanel.cancel' })
    )
  }

  const downloadCurrentWorkspace = () => {
    global.modal(
      intl.formatMessage({ id: 'filePanel.workspace.download' }),
      intl.formatMessage({ id: 'filePanel.workspace.downloadConfirm' }),
      intl.formatMessage({ id: 'filePanel.ok' }),
      onFinishDownloadWorkspace,
      intl.formatMessage({ id: 'filePanel.cancel' })
    )
  }
  const createWorkspace = async () => {
    await global.plugin.call('templateexplorermodal', 'updateTemplateExplorerInFileMode', false)
    appContext.appStateDispatch({
      type: appActionTypes.showGenericModal,
      payload: true
    })
  }

  const deleteCurrentWorkspace = () => {
    global.modal(
      intl.formatMessage({ id: 'filePanel.workspace.delete' }),
      intl.formatMessage({ id: 'filePanel.workspace.deleteConfirm' }),
      intl.formatMessage({ id: 'filePanel.ok' }),
      onFinishDeleteWorkspace,
      intl.formatMessage({ id: 'filePanel.cancel' })
    )
  }

  const deleteAllWorkspaces = () => {
    global.modal(
      intl.formatMessage({ id: 'filePanel.workspace.deleteAll' }),
      <>
        <div className="d-flex flex-column">
          <span className="pb-1">{intl.formatMessage({ id: 'filePanel.workspace.deleteAllConfirm1' })}</span>
          <span>{intl.formatMessage({ id: 'filePanel.workspace.deleteAllConfirm2' })}</span>
        </div>
      </>,
      intl.formatMessage({ id: 'filePanel.ok' }),
      onFinishDeleteAllWorkspaces,
      intl.formatMessage({ id: 'filePanel.cancel' })
    )
  }

  const addMenuItems = (items: MenuItems) => {
    setState((prevState) => {
      // filter duplicate items
      const actions = items.filter(({ name }) => prevState.actions.findIndex((action) => action.name === name) === -1)

      return { ...prevState, actions: [...prevState.actions, ...actions]}
    })
  }

  const removeMenuItems = (items: MenuItems) => {
    setState((prevState) => {
      const actions = prevState.actions.filter(({ id, name }) => items.findIndex((item) => id === item.id && name === item.name) === -1)
      return { ...prevState, actions }
    })
  }

  const cloneGitRepository = () => {
    global.modal(
      intl.formatMessage({ id: 'filePanel.workspace.clone' }),
      cloneModalMessage(),
      intl.formatMessage({ id:  (platform !== appPlatformTypes.desktop)? 'filePanel.ok':'filePanel.selectFolder' }),
      handleTypingUrl,
      intl.formatMessage({ id: 'filePanel.cancel' })
    )
  }

  const downloadWorkspaces = async () => {
    try {
      await global.dispatchHandleDownloadFiles()
    } catch (e) {
      console.error(e)
    }
  }

  const restoreBackup = async () => {
    try {
      await global.dispatchHandleRestoreBackup()
    } catch (e) {
      console.error(e)
    }
  }

  const onFinishRenameWorkspace = async () => {
    if (workspaceRenameInput.current === undefined) return
    // @ts-ignore: Object is possibly 'null'.
    const workspaceName = workspaceRenameInput.current.value

    try {
      await global.dispatchRenameWorkspace(currentWorkspace, workspaceName)
    } catch (e) {
      global.modal(
        intl.formatMessage({ id: 'filePanel.workspace.rename' }),
        e.message,
        intl.formatMessage({ id: 'filePanel.ok' }),
        () => {},
        intl.formatMessage({ id: 'filePanel.cancel' })
      )
      console.error(e)
    }
  }

  const onFinishDownloadWorkspace = async () => {
    try {
      await global.dispatchHandleDownloadWorkspace()
    } catch (e) {
      global.modal(
        intl.formatMessage({ id: 'filePanel.workspace.download' }),
        e.message,
        intl.formatMessage({ id: 'filePanel.ok' }),
        () => {},
        intl.formatMessage({ id: 'filePanel.cancel' })
      )
      console.error(e)
    }
  }

  const onFinishDeleteWorkspace = async () => {
    try {
      await global.dispatchDeleteWorkspace(global.fs.browser.currentWorkspace)
    } catch (e) {
      global.modal(
        intl.formatMessage({ id: 'filePanel.workspace.delete' }),
        e.message,
        intl.formatMessage({ id: 'filePanel.ok' }),
        () => {},
        intl.formatMessage({ id: 'filePanel.cancel' })
      )
      console.error(e)
    }
  }

  const onFinishDeleteAllWorkspaces = async () => {
    try {
      await global.dispatchDeleteAllWorkspaces()
    } catch (e) {
      global.modal(
        intl.formatMessage({ id: 'filePanel.workspace.deleteAll' }),
        e.message,
        intl.formatMessage({ id: 'filePanel.ok' }),
        () => {},
        intl.formatMessage({ id: 'filePanel.cancel' })
      )
      console.error(e)
    }
  }

  const resetFocus = () => {
    global.dispatchSetFocusElement([{ key: '', type: 'folder' }])
  }

  const switchWorkspace = async (name: string) => {
    try {
      await global.dispatchSwitchToWorkspace(name)
      global.dispatchHandleExpandPath([])
      trackMatomoEvent({ category: 'workspace', action: 'switchWorkspace', name: name, isClick: true })
    } catch (e) {
      global.modal(
        intl.formatMessage({ id: 'filePanel.workspace.switch' }),
        e.message,
        intl.formatMessage({ id: 'filePanel.ok' }),
        () => {},
        intl.formatMessage({ id: 'filePanel.cancel' })
      )
      console.error(e)
    }
  }

  const updateWsName = () => {
    // @ts-ignore
    if (workspaceCreateTemplateInput.current.value.startsWith('oz') && displayOzCustomRef && displayOzCustomRef.current) {
      displayOzCustomRef.current.style.display = 'block'
      // @ts-ignore
      mintableCheckboxRef.current.checked = false
      // @ts-ignore
      burnableCheckboxRef.current.checked = false
      // @ts-ignore
      pausableCheckboxRef.current.checked = false
      // @ts-ignore
      transparentRadioRef.current.checked = false
      // @ts-ignore
      uupsRadioRef.current.checked = false
    } else displayOzCustomRef.current.style.display = 'none'
    // @ts-ignore
    let displayName = TEMPLATE_NAMES[(workspaceCreateTemplateInput.current && workspaceCreateTemplateInput.current.value) || 'remixDefault']
    displayName = global.plugin.getAvailableWorkspaceName(displayName)
    // @ts-ignore
    workspaceCreateInput.current.value = displayName
  }

  const handleTypingUrl = () => {
    const url = cloneUrlRef.current.value

    if (url) {
      global.dispatchCloneRepository(url)
    } else {
      global.modal(
        intl.formatMessage({ id: 'filePanel.workspace.clone' }),
        intl.formatMessage({ id: 'filePanel.workspace.cloneMessage' }),
        intl.formatMessage({ id: (platform !== appPlatformTypes.desktop)? 'filePanel.ok':'filePanel.selectFolder' }),
        () => {},
        intl.formatMessage({ id: 'filePanel.cancel' })
      )
    }
  }

  const handleMultipleItemCopies = (copied: {key: string, type: 'folder' | 'file' | 'workspace'}[]) => {
    setState((prevState) => {
      return { ...prevState, copyElement: copied }
    })
    setCanPaste(true)
    const path = copied[0].key
    global.toast(intl.formatMessage({ id: 'filePanel.copiedToClipboard' }, { path }))
    setHasCopied(true)
  }

  const handleCopyClick = (path: string, type: 'folder' | 'file' | 'workspace') => {
    setState((prevState) => {
      return { ...prevState, copyElement: [{ key: path, type }]}
    })
    setCanPaste(true)
    global.toast(intl.formatMessage({ id: 'filePanel.copiedToClipboard' }, { path }))
    setHasCopied(true)
  }

  const handlePasteClick = (dest: string, destType: string) => {
    dest = destType === 'file' ? extractParentFromKey(dest) || ROOT_PATH : dest
    state.copyElement.map(({ key, type }) => {
      type === 'file' ? copyFile(key, dest) : copyFolder(key, dest)
    })
  }

  const downloadPath = async (path: string) => {
    try {
      global.dispatchDownloadPath(path)
    } catch (error) {
      global.modal(
        intl.formatMessage({ id: 'filePanel.downloadFailed' }),
        intl.formatMessage({ id: 'filePanel.copiedToClipboard' }, { error: typeof error === 'string' ? error : error.message }),
        intl.formatMessage({ id: 'filePanel.close' }),
        async () => {}
      )
    }
  }

  const copyFile = (src: string, dest: string) => {
    try {
      global.dispatchCopyFile(src, dest)
    } catch (error) {
      global.modal(
        intl.formatMessage({ id: 'filePanel.copyFileFailed' }),
        intl.formatMessage({ id: 'filePanel.copyFileFailedMsg' }, { src }),
        intl.formatMessage({ id: 'filePanel.close' }),
        async () => {}
      )
    }
  }

  const copyFolder = (src: string, dest: string) => {
    try {
      global.dispatchCopyFolder(src, dest)
    } catch (error) {
      global.modal(
        intl.formatMessage({ id: 'filePanel.copyFolderFailed' }),
        intl.formatMessage({ id: 'filePanel.copyFolderFailedMsg' }, { src }),
        intl.formatMessage({ id: 'filePanel.close' }),
        async () => {}
      )
    }
  }

  const handleContextMenu = (pageX: number, pageY: number, path: string, content: string, type: string) => {
    if (!content) return
    setState((prevState) => {
      return {
        ...prevState,
        focusContext: { element: path, x: pageX, y: pageY, type },
        focusEdit: { ...prevState.focusEdit, element: null, lastEdit: content },
        showContextMenu: prevState.focusEdit.element !== path
      }
    })
  }
  const getFocusedFolder = () => {
    const focusElement = global.fs.focusElement
    if (focusElement[0]) {
      if (focusElement[0].type === 'folder' && focusElement[0].key) return focusElement[0].key
      else if (focusElement[0].type === 'file' && focusElement[0].key) return extractParentFromKey(focusElement[0].key) ? extractParentFromKey(focusElement[0].key) : ROOT_PATH
      else return ROOT_PATH
    }
  }

  const uploadFile = (target) => {
    const parentFolder = getFocusedFolder()
    const expandPath = [...new Set([...global.fs.browser.expandPath, parentFolder].filter(path => !path.includes('.deps')))]

    global.dispatchHandleExpandPath(expandPath)
    global.dispatchUploadFile(target, parentFolder)
  }

  const uploadFolder = (target) => {
    const parentFolder = getFocusedFolder()
    const expandPath = [...new Set([...global.fs.browser.expandPath, parentFolder].filter(path => !path.includes('.deps')))]

    global.dispatchHandleExpandPath(expandPath)
    global.dispatchUploadFolder(target, parentFolder)
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleCopyFileNameClick = (path: string, _type: string) => {
    const fileName = extractNameFromKey(path)
    navigator.clipboard.writeText(fileName)
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleCopyShareURLClick = (path: string, _type: string) => {
    global.dispatchCopyShareURL(path)
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleCopyFilePathClick = (path: string, _type: string) => {
    navigator.clipboard.writeText(path)
  }

  const hideContextMenu = () => {
    setState((prevState) => {
      return {
        ...prevState,
        focusContext: { element: null, x: 0, y: 0, type: '' },
        showContextMenu: false
      }
    })
  }

  const runScript = async (path: string) => {
    try {
      global.dispatchRunScript(path)
    } catch (error) {
      global.toast(intl.formatMessage({ id: 'filePanel.runScriptFailed' }))
    }
  }

  const signTypedData = async (path: string) => {
    try {
      global.dispatchSignTypedData(path)
    } catch (error) {
      global.toast(intl.formatMessage({ id: 'filePanel.signTypedDataError' }))
    }
  }

  const emitContextMenuEvent = (cmd: customAction) => {
    try {
      global.dispatchEmitContextMenuEvent(cmd)
    } catch (error) {
      global.toast(error)
    }
  }

  const pushChangesToGist = (path?: string) => {
    global.modal(
      intl.formatMessage({ id: 'filePanel.createPublicGist' }),
      intl.formatMessage({ id: 'filePanel.createPublicGistMsg1' }),
      intl.formatMessage({ id: 'filePanel.ok' }),
      () => toGist(path),
      intl.formatMessage({ id: 'filePanel.cancel' }),
      () => {}
    )
  }

  const publishFolderToGist = (path?: string) => {
    global.modal(
      intl.formatMessage({ id: 'filePanel.createPublicGist' }),
      intl.formatMessage({ id: 'filePanel.createPublicGistMsg2' }, { path }),
      intl.formatMessage({ id: 'filePanel.ok' }),
      () => toGist(path),
      intl.formatMessage({ id: 'filePanel.cancel' }),
      () => {}
    )
  }

  const publishFileToGist = (path?: string) => {
    global.modal(
      intl.formatMessage({ id: 'filePanel.createPublicGist' }),
      intl.formatMessage({ id: 'filePanel.createPublicGistMsg3' }, { path }),
      intl.formatMessage({ id: 'filePanel.ok' }),
      () => toGist(path),
      intl.formatMessage({ id: 'filePanel.cancel' }),
      () => {}
    )
  }

  const deleteMessage = (path: string[]) => {
    return (
      <div>
        <div>
          <FormattedMessage id="filePanel.deleteMsg" /> {path.length > 1 ? <FormattedMessage id="filePanel.theseItems" /> : <FormattedMessage id="filePanel.thisItem" />}?
        </div>
        {path.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </div>
    )
  }

  const deletePath = async (path: string[]) => {
    if (global.fs.readonly) return global.toast('cannot delete file. ' + name + ' is a read only explorer')
    if (!Array.isArray(path)) path = [path]

    global.modal(
      path.length > 1 ? intl.formatMessage({ id: 'filePanel.deleteItems' }) : intl.formatMessage({ id: 'filePanel.deleteItem' }),
      deleteMessage(path),
      intl.formatMessage({ id: 'filePanel.ok' }),
      () => {
        global.dispatchDeletePath(path)
      },
      intl.formatMessage({ id: 'filePanel.cancel' }),
      () => {}
    )
  }

  const toGist = (path?: string) => {
    global.dispatchPublishToGist(path)
  }

  const editModeOn = (path: string, type: string, isNew = false) => {
    if (global.fs.readonly) return global.toast(intl.formatMessage({ id: 'filePanel.globalToast' }))
    setState((prevState) => {
      return {
        ...prevState,
        focusEdit: { ...prevState.focusEdit, element: path, isNew, type }
      }
    })
  }

  const dragStatus = (status: boolean) => {
    setState((prevState) => {
      return {
        ...prevState,
        dragStatus: status
      }
    })
  }

  const handleNewFileInput = async (parentFolder?: string) => {
    if (!parentFolder) parentFolder = getFocusedFolder()
    const expandPath = [...new Set([...global.fs.browser.expandPath, parentFolder].filter(path => !path.includes('.deps')))]

    await global.dispatchAddInputField(parentFolder, 'file')
    global.dispatchHandleExpandPath(expandPath)
    editModeOn(parentFolder + '/....blank', 'file', true)
  }

  const handleNewFolderInput = async (parentFolder?: string) => {
    if (!parentFolder) parentFolder = getFocusedFolder()
    else if (parentFolder.indexOf('.sol') !== -1 || parentFolder.indexOf('.js') !== -1) parentFolder = extractParentFromKey(parentFolder)
    const expandPath = [...new Set([...global.fs.browser.expandPath, parentFolder].filter(path => !path.includes('.deps')))]

    await global.dispatchAddInputField(parentFolder, 'folder')
    global.dispatchHandleExpandPath(expandPath)
    editModeOn(parentFolder + '/....blank', 'folder', true)
  }

  const toggleDropdown = (isOpen: boolean) => {
    setShowDropdown(isOpen)
  }

  const toggleBranches = (isOpen: boolean) => {
    setShowBranches(isOpen)
  }

  const updateSubModules = async () => {
    try {
      setHighlightUpdateSubmodules(false)
      await global.dispatchUpdateGitSubmodules()
    } catch (e) {
      console.error(e)
    }
  }

  const handleBranchFilterChange = (e: ChangeEvent<HTMLInputElement>) => {
    const branchFilter = e.target.value

    setBranchFilter(branchFilter)
  }

  const showAllBranches = () => {
    global.dispatchShowAllBranches()
  }

  const switchToBranch = async (branch: branch) => {
    console.log('switchToBranch', branch)
    try {
      if (branch.remote) {
        await global.dispatchCheckoutRemoteBranch(branch)
        trackMatomoEvent({ category: 'workspace', action: 'GIT', name: 'checkout_remote_branch', isClick: true })
      } else {
        await global.dispatchSwitchToBranch(branch)
        trackMatomoEvent({ category: 'workspace', action: 'GIT', name: 'switch_to_existing_branch', isClick: true })
      }
    } catch (e) {
      console.error(e)
      global.modal(
        intl.formatMessage({ id: 'filePanel.checkoutGitBranch' }),
        e.message,
        intl.formatMessage({ id: 'filePanel.ok' }),
        () => {},
        intl.formatMessage({ id: 'filePanel.cancel' })
      )
    }
  }

  const switchToNewBranch = async () => {
    try {
      await global.dispatchCreateNewBranch(branchFilter)
      trackMatomoEvent({ category: 'workspace', action: 'GIT', name: 'switch_to_new_branch', isClick: true })
    } catch (e) {
      global.modal(
        intl.formatMessage({ id: 'filePanel.checkoutGitBranch' }),
        e.message,
        intl.formatMessage({ id: 'filePanel.ok' }),
        () => {},
        intl.formatMessage({ id: 'filePanel.cancel' })
      )
    }
  }

  const renameModalMessage = (workspaceName?: string) => {
    return (
      <div className='d-flex flex-column'>
        <label><FormattedMessage id="filePanel.name" /></label>
        <input type="text" data-id="modalDialogCustomPromptTextRename" defaultValue={workspaceName || currentWorkspace} ref={workspaceRenameInput} className="form-control" />
      </div>
    )
  }

  const formatNameForReadonly = (name: string) => {
    return global.fs.readonly ? name + ` (${intl.formatMessage({ id: 'filePanel.readOnly' })})` : name
  }

  const cloneModalMessage = () => {
    return (
      <>
        <input
          type="text"
          data-id="modalDialogCustomPromptTextClone"
          placeholder={intl.formatMessage({
            id: 'filePanel.workspace.enterGitUrl'
          })}
          ref={cloneUrlRef}
          className="form-control"
        />
      </>
    )
  }

  const logInGithub = async () => {
    await global.plugin.call('menuicons', 'select', 'dgit');
    await global.plugin.call('dgit', 'open', gitUIPanels.GITHUB)
    trackMatomoEvent({ category: 'workspace', action: 'GIT', name: 'login', isClick: true })
  }

  const IsGitRepoDropDownMenuItem = (props: { isGitRepo: boolean, mName: string}) => {
    return (
      <>
        {props.isGitRepo ? (
          <div className="d-flex justify-content-between">
            <span>{currentWorkspace === props.mName ? <span>&#10003; {props.mName} </span> : <span className="ps-3">{props.mName}</span>}</span>
            <i className="fas fa-code-branch pt-1"></i>
          </div>
        ) : (
          <span>{currentWorkspace === props.mName ? <span>&#10003; {props.mName} </span> : <span className="ps-3">{props.mName}</span>}</span>
        )}
      </>
    )
  }

  const ShowNonLocalHostMenuItems = () => {
    const cachedFilter = global.fs.browser.workspaces.filter(x => !x.name.includes('localhost'))
    return (
      <>
        {
          currentWorkspace === LOCALHOST && cachedFilter.length > 0 ? cachedFilter.map(({ name, isGitRepo }, index) => (
            <Dropdown.Item
              key={index}
              onClick={() => {
                switchWorkspace(name)
              }}
              data-id={`dropdown-item-${name}`}
            >
              <IsGitRepoDropDownMenuItem isGitRepo={isGitRepo} mName={name} />
            </Dropdown.Item>
          )) : <ShowAllMenuItems />
        }
      </>
    )
  }

  const ShowAllMenuItems = () => {
    return (
      <>
        { global.fs.browser.workspaces.map(({ name, isGitRepo }, index) => (
          <Dropdown.Item
            key={index}
            onClick={() => { switchWorkspace(name) }}
            data-id={`dropdown-item-${name}`}
          >
            <IsGitRepoDropDownMenuItem isGitRepo={isGitRepo} mName={name} />
          </Dropdown.Item>
        ))}
      </>
    )
  }
  const [togglerText, setTogglerText] = useState<'Connecting' | 'Connected to Local FileSystem'>('Connecting')

  useEffect(() => {
    setTimeout(() => {
      setTogglerText('Connected to Local FileSystem')
    }, 1000)
  }, [selectedWorkspace])

  const WorkspaceDropdownToggle = () => {
    const [togglerText, setTogglerText] = useState<'Connecting' | 'Connected to Local FileSystem'>('Connecting')

    useEffect(() => {
      setTimeout(() => {
        setTogglerText('Connected to Local FileSystem')
      }, 1000)
    }, [selectedWorkspace])

    return (
      <Dropdown.Toggle
        as={CustomToggle}
        id="dropdown-custom-components"
        className="btn btn-light btn-block w-100 d-inline-block border form-select mt-1"
        icon={selectedWorkspace && selectedWorkspace.isGitRepo && !(currentWorkspace === LOCALHOST) ? 'far fa-code-branch' : null}
      >
        {selectedWorkspace ? selectedWorkspace.name === LOCALHOST ? togglerText : selectedWorkspace.name : currentWorkspace === LOCALHOST ? formatNameForReadonly('localhost') : NO_WORKSPACE}
      </Dropdown.Toggle>
    )
  }

  const handleGitInit = async () => {
    const isActive = await global.plugin.call('manager', 'isActive', 'dgit')
    if (!isActive) await global.plugin.call('manager', 'activatePlugin', 'dgit')
    await global.plugin.call('dgit', 'init')
  }
  const publishToGist = (path?: string) => {
    const name = 'localhost'
    global.modal(
      intl.formatMessage({ id: 'filePanel.createPublicGist' }),
      intl.formatMessage({ id: 'filePanel.createPublicGistMsg4' }, { name }),
      intl.formatMessage({ id: 'filePanel.ok' }),
      () => toGist(path),
      intl.formatMessage({ id: 'filePanel.cancel' }),
      () => { }
    )
  }

  return (
    <div className="d-flex flex-column h-100">
      <div className="w-100 px-2 mt-3">
        <div>
          <FileExplorerMenu
            title={''}
            menuItems={['createNewFile', 'createNewFolder', selectedWorkspace && selectedWorkspace.isGist ? 'updateGist' : 'publishToGist', canUpload ? 'uploadFile' : '', canUpload ? 'uploadFolder' : '', 'importFromIpfs','importFromHttps', 'initializeWorkspaceAsGitRepo', 'revealInExplorer']}
            createNewFile={handleNewFileInput}
            createNewFolder={handleNewFolderInput}
            publishToGist={publishToGist}
            uploadFile={uploadFile}
            uploadFolder={uploadFolder}
            importFromIpfs={importFromUrl}
            importFromHttps={importFromUrl}
            handleGitInit={handleGitInit}
            revealInExplorer={() => global.dispatchRevealElectronFolderInExplorer(null)}
          />
        </div>
      </div>
      <div
        ref={fileExplorerRef}
        className="remixui_container overflow-auto h-100"
        style={{
          display: 'flex',
          flex: '1 1 auto',
          minHeight: 0
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          handleContextMenu(e.pageX, e.pageY, ROOT_PATH, 'workspace', 'workspace')
        }}
      >
        <div className="d-flex flex-column w-100 remixui_fileexplorer" data-id="remixUIWorkspaceExplorer" onClick={resetFocus}>
          <ElectronMenu createWorkspace={createWorkspace} clone={cloneGitRepository}></ElectronMenu>
          <div
            className="h-100 remixui_fileExplorerTree mt-2 mb-2"
            onFocus={() => {
              toggleDropdown(false)
            }}
          >
            <div className="h-100">
              {(global.fs.browser.isRequestingWorkspace || global.fs.browser.isRequestingCloning) && (
                <div className="text-center py-5">
                  <i className="fas fa-spinner fa-pulse fa-2x"></i>
                </div>
              )}
              {!(global.fs.browser.isRequestingWorkspace || global.fs.browser.isRequestingCloning) && global.fs.mode === 'browser' && currentWorkspace !== NO_WORKSPACE && (
                <FileExplorer
                  fileState={global.fs.browser.fileState}
                  name={currentWorkspace}
                  menuItems={['createNewFile', 'createNewFolder', selectedWorkspace && selectedWorkspace.isGist ? 'updateGist' : 'publishToGist', canUpload ? 'uploadFile' : '', canUpload ? 'uploadFolder' : '', 'importFromIpfs','importFromHttps', 'initializeWorkspaceAsGitRepo', 'revealInExplorer']}
                  contextMenuItems={global.fs.browser.contextMenu.registeredMenuItems}
                  removedContextMenuItems={global.fs.browser.contextMenu.removedMenuItems}
                  files={global.fs.browser.files}
                  flatTree={global.fs.browser.flatTree}
                  workspaceState={state}
                  feTarget={feTarget}
                  setFeTarget={setFeTarget}
                  publishManyFilesToGist={handlePublishingMultiSelectedFilesToGist}
                  expandPath={global.fs.browser.expandPath}
                  focusEdit={global.fs.focusEdit}
                  focusElement={global.fs.focusElement}
                  hideIconsMenu={hideIconsMenu}
                  showIconsMenu={showIconsMenu}
                  dispatchCreateNewFile={global.dispatchCreateNewFile}
                  modal={global.modal}
                  dispatchCreateNewFolder={global.dispatchCreateNewFolder}
                  readonly={global.fs.readonly}
                  toast={global.toast}
                  dispatchDeletePath={global.dispatchDeletePath}
                  dispatchRenamePath={global.dispatchRenamePath}
                  dispatchDownloadPath={global.dispatchDownloadPath}
                  dispatchUploadFile={global.dispatchUploadFile}
                  dispatchUploadFolder={global.dispatchUploadFolder}
                  dispatchCopyFile={global.dispatchCopyFile}
                  dispatchCopyShareURL={global.dispatchCopyShareURL}
                  dispatchCopyFolder={global.dispatchCopyFolder}
                  dispatchPublishToGist={global.dispatchPublishToGist}
                  dispatchRunScript={global.dispatchRunScript}
                  dispatchSignTypedData={global.dispatchSignTypedData}
                  dispatchEmitContextMenuEvent={global.dispatchEmitContextMenuEvent}
                  dispatchHandleClickFile={global.dispatchHandleClickFile}
                  dispatchSetFocusElement={global.dispatchSetFocusElement}
                  dispatchFetchDirectory={global.dispatchFetchDirectory}
                  dispatchRemoveInputField={global.dispatchRemoveInputField}
                  dispatchAddInputField={global.dispatchAddInputField}
                  dispatchHandleExpandPath={global.dispatchHandleExpandPath}
                  dispatchMoveFile={global.dispatchMoveFile}
                  dispatchMoveFiles={global.dispatchMoveFiles}
                  dispatchMoveFolder={global.dispatchMoveFolder}
                  dispatchMoveFolders={global.dispatchMoveFolders}
                  handleCopyClick={handleCopyClick}
                  handleMultiCopies={handleMultipleItemCopies}
                  handlePasteClick={handlePasteClick}
                  addMenuItems={addMenuItems}
                  removeMenuItems={removeMenuItems}
                  handleContextMenu={handleContextMenu}
                  uploadFile={uploadFile}
                  uploadFolder={uploadFolder}
                  getFocusedFolder={getFocusedFolder}
                  toGist={toGist}
                  editModeOn={editModeOn}
                  handleNewFileInput={handleNewFileInput}
                  handleNewFolderInput={handleNewFolderInput}
                  dragStatus={dragStatus}
                  createNewFile={handleNewFileInput}
                  createNewFolder={handleNewFolderInput}
                  deletePath={deletePath}
                  renamePath={editModeOn}
                  importFromIpfs={importFromUrl}
                  importFromHttps={importFromUrl}
                  canPaste={canPaste}
                  hasCopied={hasCopied}
                  setHasCopied={setHasCopied}
                />

              )}
              {global.fs.localhost.isRequestingLocalhost && (
                <div className="text-center py-5">
                  <i className="fas fa-spinner fa-pulse fa-2x"></i>
                </div>
              )}
              {global.fs.mode === 'localhost' && global.fs.localhost.isSuccessfulLocalhost && (
                <FileExplorer
                  name="localhost"
                  menuItems={['createNewFile', 'createNewFolder', 'revealInExplorer']}
                  contextMenuItems={global.fs.localhost.contextMenu.registeredMenuItems}
                  removedContextMenuItems={global.fs.localhost.contextMenu.removedMenuItems}
                  files={global.fs.localhost.files}
                  flatTree={global.fs.localhost.flatTree}
                  fileState={[]}
                  canPaste={canPaste}
                  workspaceState={state}
                  feTarget={feTarget}
                  setFeTarget={setFeTarget}
                  publishManyFilesToGist={handlePublishingMultiSelectedFilesToGist}
                  expandPath={global.fs.localhost.expandPath}
                  focusEdit={global.fs.focusEdit}
                  focusElement={global.fs.focusElement}
                  hideIconsMenu={hideIconsMenu}
                  showIconsMenu={showIconsMenu}
                  dispatchCreateNewFile={global.dispatchCreateNewFile}
                  modal={global.modal}
                  dispatchCreateNewFolder={global.dispatchCreateNewFolder}
                  readonly={global.fs.readonly}
                  toast={global.toast}
                  dispatchDeletePath={global.dispatchDeletePath}
                  dispatchRenamePath={global.dispatchRenamePath}
                  dispatchDownloadPath={global.dispatchDownloadPath}
                  dispatchUploadFile={global.dispatchUploadFile}
                  dispatchUploadFolder={global.dispatchUploadFolder}
                  dispatchCopyFile={global.dispatchCopyFile}
                  dispatchCopyShareURL={global.dispatchCopyShareURL}
                  dispatchCopyFolder={global.dispatchCopyFolder}
                  dispatchPublishToGist={global.dispatchPublishToGist}
                  dispatchRunScript={global.dispatchRunScript}
                  dispatchSignTypedData={global.dispatchSignTypedData} //
                  dispatchEmitContextMenuEvent={global.dispatchEmitContextMenuEvent}
                  dispatchHandleClickFile={global.dispatchHandleClickFile}
                  dispatchSetFocusElement={global.dispatchSetFocusElement}
                  dispatchFetchDirectory={global.dispatchFetchDirectory}
                  dispatchRemoveInputField={global.dispatchRemoveInputField}
                  dispatchAddInputField={global.dispatchAddInputField}
                  dispatchHandleExpandPath={global.dispatchHandleExpandPath}
                  dispatchMoveFile={global.dispatchMoveFile}
                  dispatchMoveFiles={global.dispatchMoveFiles}
                  dispatchMoveFolder={global.dispatchMoveFolder}
                  dispatchMoveFolders={global.dispatchMoveFolders}
                  handleCopyClick={handleCopyClick}
                  handleMultiCopies={handleMultipleItemCopies}
                  handlePasteClick={handlePasteClick}
                  addMenuItems={addMenuItems}
                  removeMenuItems={removeMenuItems}
                  handleContextMenu={handleContextMenu}
                  uploadFile={uploadFile}
                  uploadFolder={uploadFolder}
                  getFocusedFolder={getFocusedFolder}
                  toGist={toGist}
                  editModeOn={editModeOn}
                  handleNewFileInput={handleNewFileInput}
                  handleNewFolderInput={handleNewFolderInput}
                  createNewFile={handleNewFileInput}
                  createNewFolder={handleNewFolderInput}
                  deletePath={deletePath}
                  renamePath={editModeOn}
                  dragStatus={dragStatus}
                  importFromIpfs={importFromUrl}
                  importFromHttps={importFromUrl}
                  hasCopied={hasCopied}
                  setHasCopied={setHasCopied}
                />
              )}
            </div>
          </div>
        </div>
      </div>
      { (selectedWorkspace && selectedWorkspace.isGitRepo) && (
        <div className={`bg-light border-top d-flex justify-content-between align-items-center`} data-id="workspaceGitPanel" style={{
          minHeight: '4rem',
          marginBottom: '0 !important',
          flexShrink: 0
        }}>
          <div className="d-flex justify-content-between p-1 w-100 mb-2">
            <div className="text-uppercase text-dark pt-1 px-1">GIT</div>
            { selectedWorkspace.hasGitSubmodules?
              <>
                <div className="pe-1">
                  { global.fs.browser.isRequestingCloning ?
                    <CustomTooltip
                      placement="top"
                      tooltipId="updatingSubmodules"
                      tooltipClasses="text-nowrap"
                      tooltipText={"Updating submodules"}
                    >
                      <button style={{ height: 30, minWidth: "9rem" }} className='btn btn-sm border text-dark'>
                        <i className="fad fa-spinner fa-spin me-2"></i>
                        Updating...
                      </button>
                    </CustomTooltip> :
                    <CustomTooltip
                      placement="top"
                      tooltipId="updateSubmodules"
                      tooltipClasses="text-nowrap"
                      tooltipText={<FormattedMessage id="filePanel.updateSubmodules" />}
                    >
                      <button style={{ height: 30, minWidth: "9rem" }} onClick={updateSubModules} data-id='updatesubmodules' className={`btn btn-sm border  ${highlightUpdateSubmodules ? 'text-warning' : 'text-dark'}`}>
                       Update submodules
                      </button>
                    </CustomTooltip>
                  }
                </div>
              </>
              : null
            }
            <CustomTooltip
              placement="right"
              tooltipId="branchesDropdown"
              tooltipClasses="text-nowrap"
              tooltipText={'Current branch: ' + (currentBranch && currentBranch.name) || 'Branches'}
              hide={showBranches}
            >
              <div className="pt-0 me-2" data-id="workspaceGitBranchesDropdown">
                <Dropdown style={{ height: 30, maxWidth: "6rem", minWidth: "6rem" }} onToggle={toggleBranches} show={showBranches} drop={'up'}>
                  <Dropdown.Toggle
                    as={CustomToggle}
                    id="dropdown-custom-components"
                    className="btn btn-sm btn-light d-inline-block border form-select h-100 p-0 ps-2 pe-2 text-dark"
                    icon={null}
                  >
                    {global.fs.browser.isRequestingCloning ? <i className="fad fa-spinner fa-spin"></i> : (currentBranch && currentBranch.name) || '-none-'}
                  </Dropdown.Toggle>
                  <Dropdown.Menu as={CustomMenu} className="form-select branches-dropdown" style={{ width: `${fileExplorerWidth * 0.7}px` }}>
                    <div data-id="custom-dropdown-menu">
                      <div className="d-flex text-dark" style={{ fontSize: 14, fontWeight: 'bold' }}>
                        <span className="mb-2 ms-2 me-auto">
                          <FormattedMessage id="filePanel.switchBranches" />
                        </span>
                        <div
                          className="pe-2"
                          onClick={() => {
                            toggleBranches(false)
                          }}
                        >
                          <i className="fa fa-close"></i>
                        </div>
                      </div>
                      <div className="border-top py-2">
                        <input
                          className="form-control border checkout-input bg-light"
                          placeholder={intl.formatMessage({
                            id: 'filePanel.findOrCreateABranch'
                          })}
                          style={{ minWidth: 225 }}
                          onChange={handleBranchFilterChange}
                          data-id="workspaceGitInput"
                        />
                      </div>
                      <div className="border-top" style={{ maxHeight: 150, overflowY: 'scroll' }} data-id="custom-dropdown-items">
                        {filteredBranches.length > 0 ? (
                          filteredBranches.map((branch, index) => {
                            return (
                              <CustomTooltip
                                key={index}
                                placement="right"
                                tooltipId={`branchTooltip-${index}`}
                                tooltipClasses="text-nowrap"
                                tooltipText={intl.formatMessage({ id: `filePanel.switchToBranch${branch.remote ? 'Title1' : 'Title2'}` })}
                              >
                                <Dropdown.Item
                                  onClick={() => {
                                    switchToBranch(branch)
                                  }}
                                  className='p-1'
                                >
                                  <div data-id={`workspaceGit-${branch.remote ? `${branch.remote.name}/${branch.name}` : branch.name}`}>
                                    {currentBranch && currentBranch.name === branch.name && !branch.remote ? (
                                      <span className="ms-1">
                                        &#10003; <i className="far fa-code-branch"></i>
                                        <span className="ps-1">{branch.name}</span>
                                      </span>
                                    ) : (
                                      <span className="ps-3">
                                        <i className={`far ${branch.remote ? 'fa-cloud' : 'fa-code-branch'}`}></i>
                                        <span className="ps-1">{branch.remote ? `${branch.remote.name}/${branch.name}` : branch.name}</span>
                                      </span>
                                    )}
                                  </div>
                                </Dropdown.Item>
                              </CustomTooltip>
                            )
                          })
                        ) : (
                          <Dropdown.Item onClick={switchToNewBranch}>
                            <div className="ps-1 pe-1" data-id="workspaceGitCreateNewBranch">
                              <i className="fas fa-code-branch pe-2"></i>
                              <span>
                                <FormattedMessage id="filePanel.createBranch" />: {branchFilter} from '{currentBranch && currentBranch.name}'
                              </span>
                            </div>
                          </Dropdown.Item>
                        )}
                      </div>
                      {(selectedWorkspace.branches || []).length > 4 && (
                        <button className="btn btn-sm w-100" style={{ cursor: "pointer" }} onClick={showAllBranches}>
                          <FormattedMessage id="filePanel.viewAllBranches" />
                        </button>
                      )}
                    </div>
                  </Dropdown.Menu>
                </Dropdown>
              </div>
            </CustomTooltip>
          </div>
        </div>
      )}
      {state.showContextMenu && (
        <FileExplorerContextMenu
          actions={(global.fs.focusElement.length > 1 || feTarget.length > 1) ? state.actions.filter((item) => item.multiselect) : state.actions.filter((item) => !item.multiselect)}
          hideContextMenu={hideContextMenu}
          createNewFile={handleNewFileInput}
          createNewFolder={handleNewFolderInput}
          deletePath={deletePath}
          renamePath={editModeOn}
          runScript={runScript}
          signTypedData={signTypedData}
          copy={handleCopyClick}
          paste={handlePasteClick}
          copyFileName={handleCopyFileNameClick}
          copyPath={handleCopyFilePathClick}
          copyShareURL={handleCopyShareURLClick}
          emit={emitContextMenuEvent}
          pageX={state.focusContext.x}
          pageY={state.focusContext.y}
          path={state.focusContext.element}
          type={state.focusContext.type}
          focus={global.fs.focusElement}
          pushChangesToGist={pushChangesToGist}
          publishFolderToGist={publishFolderToGist}
          publishFileToGist={publishFileToGist}
          uploadFile={uploadFile}
          downloadPath={downloadPath}
          publishManyFilesToGist={handlePublishingMultiSelectedFilesToGist}
        />
      )}

      <ModalDialog id="homeTab" title={'Import from ' + modalState.modalInfo.title}
        okLabel="Import" hide={!modalState.showModalDialog} handleHide={() => hideFullMessage()}
        okFn={() => processLoading(modalState.modalInfo.title)} validationFn={validateUrlForImport}
      >
        <div className="p-2 user-select-auto">
          {modalState.modalInfo.loadItem !== '' && <span>Enter the {modalState.modalInfo.loadItem} you would like to load.</span>}
          {modalState.modalInfo.examples.length !== 0 && (
            <>
              <div>e.g</div>
              <div>{examples}</div>
            </>
          )}
          <div className="d-flex flex-row">
            {modalState.modalInfo.prefix && <span className="text-nowrap align-self-center me-2">ipfs://</span>}
            <input
              ref={inputValue}
              type="text"
              name="prompt_text"
              id="inputPrompt_text"
              className="w-100 mt-1 form-control"
              data-id="homeTabModalDialogCustomPromptText"
              value={modalState.importSource}
              onInput={(e) => {
                setModalState((prevState) => {
                  return { ...prevState, importSource: inputValue.current.value }
                })
              }}
            />
          </div>
        </div>
      </ModalDialog>
    </div>
  )
}

export default Workspace
