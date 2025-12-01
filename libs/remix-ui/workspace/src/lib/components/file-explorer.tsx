import React, { useEffect, useState, useRef, SyntheticEvent, useContext, useCallback } from 'react' // eslint-disable-line
import { useIntl } from 'react-intl'
import { TreeView } from '@remix-ui/tree-view' // eslint-disable-line
import { FileExplorerMenu } from './file-explorer-menu' // eslint-disable-line
import { FileExplorerContextMenu } from './file-explorer-context-menu' // eslint-disable-line
import { FileExplorerProps, FileType, WorkSpaceState, WorkspaceElement } from '../types'

import '../css/file-explorer.css'
import { checkSpecialChars, extractNameFromKey, extractParentFromKey, getPathIcon, joinPath } from '@remix-ui/helper'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ROOT_PATH } from '../utils/constants'
import { copyFile, moveFileIsAllowed, moveFilesIsAllowed, moveFolderIsAllowed, moveFoldersIsAllowed } from '../actions'
import { FlatTree } from './flat-tree'
import { FileSystemContext } from '../contexts'
import { AppContext } from '@remix-ui/app'
import { TrackingContext } from '@remix-ide/tracking'
import { FileExplorerEvent } from '@remix-api'

export const FileExplorer = (props: FileExplorerProps) => {
  const intl = useIntl()
  const {
    name,
    contextMenuItems,
    removedContextMenuItems,
    files,
    flatTree,
    workspaceState,
    toGist,
    addMenuItems,
    removeMenuItems,
    handleContextMenu,
    handleNewFileInput,
    handleNewFolderInput,
    handleMultiCopies,
    handlePasteClick,
    handleCopyClick,
    deletePath,
    uploadFile,
    uploadFolder,
    fileState,
    canPaste,
    feTarget,
    setFeTarget,
    setHasCopied
  } = props
  const [state, setState] = useState<WorkSpaceState>(workspaceState)
  // const [isPending, startTransition] = useTransition();
  const treeRef = useRef<HTMLDivElement>(null)
  const [cutActivated, setCutActivated] = useState(false)

  const { plugin, dispatchRevealElectronFolderInExplorer } = useContext(FileSystemContext)
  const appContext = useContext(AppContext)
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)
  const trackMatomoEvent = <T extends FileExplorerEvent = FileExplorerEvent>(event: T) => baseTrackEvent?.<T>(event)
  const [filesSelected, setFilesSelected] = useState<string[]>([])
  const feWindow = (window as any)

  useEffect(() => {
    if (contextMenuItems) {
      addMenuItems(contextMenuItems)
    }
  }, [contextMenuItems])

  useEffect(() => {
    if (removedContextMenuItems) {
      removeMenuItems(removedContextMenuItems)
    }
  }, [contextMenuItems])

  useEffect(() => {
    if (props.focusEdit) {
      setState((prevState) => {
        return {
          ...prevState,
          focusEdit: {
            element: props.focusEdit,
            type: 'file',
            isNew: true,
            lastEdit: null
          }
        }
      })
    }
  }, [props.focusEdit])

  useEffect(() => {
    setState(workspaceState)
  }, [workspaceState])

  useEffect(() => {
    if (treeRef.current) {
      const keyPressHandler = (e: KeyboardEvent) => {
        if (e.shiftKey) {
          setState((prevState) => {
            return { ...prevState, ctrlKey: true }
          })
        }
      }

      const keyUpHandler = (e: KeyboardEvent) => {
        if (!e.shiftKey) {
          setState((prevState) => {
            return { ...prevState, ctrlKey: false }
          })
        }
      }
      const targetDocument = treeRef.current

      targetDocument.addEventListener('keydown', keyPressHandler)
      targetDocument.addEventListener('keyup', keyUpHandler)
      return () => {
        targetDocument.removeEventListener('keydown', keyPressHandler)
        targetDocument.removeEventListener('keyup', keyUpHandler)
      }
    }
  }, [treeRef.current])

  useEffect(() => {
    const performDeletion = async () => {
      const path: string[] = []
      if (feTarget?.length > 0 && feTarget[0]?.key.length > 0) {
        feTarget.forEach((one) => {
          path.push(one.key)
        })
        await deletePath(path)
      }
    }

    if (treeRef.current) {
      const deleteKeyPressHandler = async (eve: KeyboardEvent) => {
        if (eve.key === 'Delete' ) {
          trackMatomoEvent({ category: 'fileExplorer', action: 'deleteKey', name: 'deletePath', isClick: false })
          setState((prevState) => {
            return { ...prevState, deleteKey: true }
          })
          performDeletion()
          return
        }
        if (eve.metaKey) {
          if (eve.key === 'Backspace') {
            trackMatomoEvent({ category: 'fileExplorer', action: 'osxDeleteKey', name: 'deletePath', isClick: false })
            setState((prevState) => {
              return { ...prevState, deleteKey: true }
            })
            performDeletion()
            return
          }
        }
      }
      const deleteKeyPressUpHandler = async (eve: KeyboardEvent) => {
        if (eve.key === 'Delete' ) {
          setState((prevState) => {
            return { ...prevState, deleteKey: false }
          })
          return
        }
        if (eve.metaKey) {
          if (eve.key === 'Backspace') {
            setState((prevState) => {
              return { ...prevState, deleteKey: false }
            })
            return
          }
        }
      }

      treeRef.current?.addEventListener('keydown', deleteKeyPressHandler)
      treeRef.current?.addEventListener('keyup', deleteKeyPressUpHandler)
      return () => {
        treeRef.current?.removeEventListener('keydown', deleteKeyPressHandler)
        treeRef.current?.removeEventListener('keyup', deleteKeyPressUpHandler)
      }
    }
  }, [treeRef.current, feTarget])

  useEffect(() => {
    const performRename = async () => {
      if (feTarget?.length > 1 && feTarget[0]?.key.length > 1) {
        await plugin.call('notification', 'alert', { id: 'renameAlert', message: 'You cannot rename multiple files at once!' })
      }
      props.editModeOn(feTarget[0].key, feTarget[0].type, false)
    }

    if (treeRef.current) {
      const F2KeyPressHandler = async (eve: KeyboardEvent) => {
        if (eve.key === 'F2' ) {
          trackMatomoEvent({ category: 'fileExplorer', action: 'f2ToRename', name: 'RenamePath', isClick: false })
          await performRename()
          setState((prevState) => {
            return { ...prevState, F2Key: true }
          })
          return
        }
      }
      const F2KeyPressUpHandler = async (eve: KeyboardEvent) => {
        if (eve.key === 'F2' ) {
          setState((prevState) => {
            return { ...prevState, F2Key: false }
          })
          return
        }
      }

      treeRef.current?.addEventListener('keydown', F2KeyPressHandler)
      treeRef.current?.addEventListener('keyup', F2KeyPressUpHandler)
      return () => {
        treeRef.current?.removeEventListener('keydown', F2KeyPressHandler)
        treeRef.current?.removeEventListener('keyup', F2KeyPressUpHandler)
      }
    }
  }, [treeRef.current, feTarget])

  useEffect(() => {
    const performCopy = async () => {
      if (feTarget?.length > 0 && feTarget[0]?.key.length > 0) {
        if (feTarget?.length > 1) {
          handleMultiCopies(feTarget)
          setHasCopied(false)
        } else {
          handleCopyClick(feTarget[0].key, feTarget[0].type)
          setHasCopied(false)
        }
      }
    }

    const performCut = async () => {
      if (feTarget) {
        if (feTarget.length > 0 && feTarget[0].key.length > 0) {
          handleMultiCopies(feTarget)
          setCutActivated(true)
        } else {
          handleCopyClick(feTarget[0].key, feTarget[0].type)
          setCutActivated(true)
        }
      }
    }

    const performPaste = async () => {
      if (feTarget.length > 0 && feTarget[0]?.key.length >= 0) {
        if (cutActivated) {
          if (state.copyElement.length > 1) {
            const promisesToKeep = state.copyElement.filter(x => x).map(async (item) => {
              if (item.type === 'file') {
                props.dispatchMoveFile(item.key, feTarget[0].key)
                setCutActivated(false)
              } else {
                props.dispatchMoveFolder(item.key, feTarget[0].key)
                setCutActivated(false)
              }
            })
            await Promise.all(promisesToKeep)
          } else {
            if (state.copyElement[0]?.type === 'file') {
              props.dispatchMoveFile(state.copyElement[0]?.key, feTarget[0].key)
              setState((prev) => {
                return { ...prev, copyElement: []}
              })
              setCutActivated(false)
            } else {
              props.dispatchMoveFolder(state.copyElement[0]?.key, feTarget[0].key)
              setCutActivated(false)
            }
          }
        } else {
          handlePasteClick(feTarget[0].key, feTarget[0].type)
        }
      }
    }

    if (treeRef.current) {
      const targetDocument = treeRef.current

      const CopyComboHandler = async (eve: KeyboardEvent) => {
        if ((eve.metaKey || eve.ctrlKey) && (eve.key === 'c' || eve.code === 'KeyC')) {
          await performCopy()
          trackMatomoEvent({ category: 'fileExplorer', action: 'copyCombo', name: 'copyFilesOrFile', isClick: false })
          return
        }
      }

      const CutHandler = async (eve: KeyboardEvent) => {
        if ((eve.metaKey || eve.ctrlKey) && (eve.key === 'x' || eve.code === 'KeyX')) {
          await performCut()
          trackMatomoEvent({ category: 'fileExplorer', action: 'cutCombo', name: 'cutFilesOrFile', isClick: false })
          return
        }
      }

      const pasteHandler = async (eve: KeyboardEvent) => {
        if ((eve.metaKey || eve.ctrlKey) && (eve.key === 'v' || eve.code === 'KeyV')) {
          performPaste()
          trackMatomoEvent({ category: 'fileExplorer', action: 'pasteCombo', name: 'PasteCopiedContent', isClick: false })
          return
        }
      }

      targetDocument?.addEventListener('keydown', CopyComboHandler)
      targetDocument?.addEventListener('keydown', CutHandler)
      targetDocument?.addEventListener('keydown', pasteHandler)

      return () => {
        targetDocument?.removeEventListener('keydown', pasteHandler)
        targetDocument?.removeEventListener('keydown', CutHandler)
        targetDocument?.removeEventListener('keydown', CopyComboHandler)
      }
    }
  }, [treeRef.current, feTarget, feTarget.length, canPaste, state.copyElement, state.copyElement.length])

  const hasReservedKeyword = (content: string): boolean => {
    if (state.reservedKeywords.findIndex((value) => content.startsWith(value)) !== -1) return true
    else return false
  }

  const createNewFile = async (newFilePath: string) => {
    try {
      props.dispatchCreateNewFile(newFilePath, ROOT_PATH)
    } catch (error) {
      return props.modal(
        intl.formatMessage({ id: 'filePanel.fileCreationFailed' }),
        typeof error === 'string' ? error : error.message,
        intl.formatMessage({ id: 'filePanel.close' }),
        async () => { }
      )
    }
  }

  const createNewFolder = async (newFolderPath: string) => {
    try {
      props.dispatchCreateNewFolder(newFolderPath, ROOT_PATH)
    } catch (e) {
      return props.modal(
        intl.formatMessage({ id: 'filePanel.folderCreationFailed' }),
        typeof e === 'string' ? e : e.message,
        intl.formatMessage({ id: 'filePanel.close' }),
        async () => { }
      )
    }
  }

  const renamePath = async (oldPath: string, newPath: string) => {
    try {
      if (oldPath === newPath) return
      props.dispatchRenamePath(oldPath, newPath)
    } catch (error) {
      props.modal(
        intl.formatMessage({ id: 'filePanel.renameFileFailed' }),
        intl.formatMessage({ id: 'filePanel.renameFileFailedMsg' }, { error: typeof error === 'string' ? error : error.message }),
        intl.formatMessage({ id: 'filePanel.close' }),
        async () => { }
      )
    }
  }

  const handleClickFile = (path: string, type: WorkspaceElement) => {
    if (!state.ctrlKey) {
      props.dispatchHandleClickFile(path, type)
    } else {
      if (props.focusElement.findIndex((item) => item.key === path) !== -1) {
        const focusElement = props.focusElement.filter((item) => item.key !== path)

        props.dispatchSetFocusElement(focusElement)
      } else {
        const nonRootFocus = props.focusElement.filter((el) => {
          return !(el.key === '' && el.type === 'folder')
        })

        nonRootFocus.push({ key: path, type })
        props.dispatchSetFocusElement(nonRootFocus)
      }
    }
  }

  const handleClickFolder = async (path: string, type: 'folder' | 'file' ) => {
    if (state.ctrlKey) {
      if (props.focusElement.findIndex((item) => item.key === path) !== -1) {
        const focusElement = props.focusElement.filter((item) => item.key !== path)

        props.dispatchSetFocusElement(focusElement)
      } else {
        const nonRootFocus = props.focusElement.filter((el) => {
          return !(el.key === '' && el.type === 'folder')
        })

        nonRootFocus.push({ key: path, type })
        props.dispatchSetFocusElement(nonRootFocus)
      }
    } else {
      let expandPath = []

      if (!props.expandPath.includes(path)) {
        expandPath = [...new Set([...props.expandPath, path])]
        props.dispatchFetchDirectory(path)
      } else {
        expandPath = [...new Set(props.expandPath.filter((key) => key && typeof key === 'string' && !key.startsWith(path)))]
      }
      props.dispatchSetFocusElement([{ key: path, type }])
      props.dispatchHandleExpandPath(expandPath)
    }
  }

  const editModeOff = async (content: string) => {
    if (typeof content === 'string') content = content.trim()
    const parentFolder = extractParentFromKey(state.focusEdit.element)

    if (!content || content.trim() === '') {
      if (state.focusEdit.isNew) {
        props.dispatchRemoveInputField(parentFolder)
        setState((prevState) => {
          return {
            ...prevState,
            focusEdit: { element: null, isNew: false, type: '', lastEdit: '' }
          }
        })
      } else {
        setState((prevState) => {
          return {
            ...prevState,
            focusEdit: { element: null, isNew: false, type: '', lastEdit: '' }
          }
        })
      }
    } else {
      if (state.focusEdit.lastEdit === content && state.focusEdit.isNew === false) {
        return setState((prevState) => {
          return {
            ...prevState,
            focusEdit: { element: null, isNew: false, type: '', lastEdit: '' }
          }
        })
      }
      if (checkSpecialChars(content)) {
        props.modal(
          intl.formatMessage({ id: 'filePanel.validationError' }),
          intl.formatMessage({ id: 'filePanel.validationErrorMsg' }),
          intl.formatMessage({ id: 'filePanel.ok' }),
          () => { }
        )
      } else {
        if (state.focusEdit.isNew) {
          if (hasReservedKeyword(content)) {
            props.dispatchRemoveInputField(parentFolder)
            props.modal(
              intl.formatMessage({ id: 'filePanel.reservedKeyword' }),
              intl.formatMessage({ id: 'filePanel.reservedKeywordMsg' }, { content }),
              intl.formatMessage({ id: 'filePanel.close' }),
              () => { }
            )
          } else {
            state.focusEdit.type === 'file' ? createNewFile(joinPath(parentFolder, content)) : createNewFolder(joinPath(parentFolder, content))
            props.dispatchRemoveInputField(parentFolder)
          }
        } else {
          if (hasReservedKeyword(content)) {
            props.modal(
              intl.formatMessage({ id: 'filePanel.reservedKeyword' }),
              intl.formatMessage({ id: 'filePanel.reservedKeywordMsg' }, { content }),
              intl.formatMessage({ id: 'filePanel.close' }),
              () => { }
            )
          } else {
            if (state.focusEdit.element) {
              const oldPath: string = state.focusEdit.element
              const oldName = extractNameFromKey(oldPath)
              const newPath = oldPath.replace(oldName, content)

              renamePath(oldPath, newPath)
            }
          }
        }
        setState((prevState) => {
          return {
            ...prevState,
            focusEdit: { element: null, isNew: false, type: '', lastEdit: '' }
          }
        })
      }
    }
  }

  const handleFileExplorerMenuClick = (e: SyntheticEvent) => {
    e.stopPropagation()
    if (e && (e.target as any).getAttribute('data-id') === 'fileExplorerUploadFileuploadFile') return // we don't want to let propagate the input of type file
    if (e && (e.target as any).getAttribute('data-id') === 'fileExplorerFileUpload') return // we don't want to let propagate the input of type file
    let expandPath = []

    if (!props.expandPath.includes(ROOT_PATH)) {
      expandPath = [ROOT_PATH, ...new Set([...props.expandPath])]
    } else {
      expandPath = [...new Set(props.expandPath.filter((key) => key && typeof key === 'string'))]
    }
    props.dispatchHandleExpandPath(expandPath)
  }

  /**
   * This offers the ability to move a file to a new location
   * without showing a modal dialong to the user.
   * @param dest path of the destination
   * @param src path of the source
   * @returns {Promise<void>}
   */
  const moveFileSilently = async (dest: string, src: string) => {
    if (dest.length === 0 || src.length === 0) return
    if (await moveFileIsAllowed(src, dest) === false) return
    try {
      props.dispatchMoveFile(src, dest)
    } catch (error) {
      props.modal(
        intl.formatMessage({ id: 'filePanel.movingFileFailed' }),
        intl.formatMessage({ id: 'filePanel.movingFileFailedMsg' }, { src }),
        intl.formatMessage({ id: 'filePanel.close' }),
        async () => { }
      )
    }
  }

  const resetMultiselect = () => {
    setState((prevState) => {
      return { ...prevState, ctrlKey: false }
    })
  }

  /**
   * This offers the ability to move a folder to a new location
   * without showing a modal dialong to the user.
   * @param dest path of the destination
   * @param src path of the source
   * @returns {Promise<void>}
   */
  const moveFolderSilently = async (dest: string, src: string) => {
    if (dest.length === 0 || src.length === 0) return
    if (await moveFolderIsAllowed(src, dest) === false) return
    try {
      props.dispatchMoveFolder(src, dest)
    } catch (error) {
      props.modal(
        intl.formatMessage({ id: 'filePanel.movingFolderFailed' }),
        intl.formatMessage({ id: 'filePanel.movingFolderFailedMsg' }, { src }),
        intl.formatMessage({ id: 'filePanel.close' }),
        async () => { }
      )
    }
  }

  const warnMovingItems = async (src: string[], dest: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      props.modal(
        intl.formatMessage({ id: 'filePanel.moveFile' }),
        intl.formatMessage({ id: 'filePanel.moveFileMsg1' }, { src: src.join(', '), dest }),
        intl.formatMessage({ id: 'filePanel.yes' }),
        () => resolve(null),
        intl.formatMessage({ id: 'filePanel.cancel' }),
        () => reject()
      )
    })
  }

  const handleTreeClick = (event: SyntheticEvent) => {
    let target = event.target as HTMLElement
    while (target && target.getAttribute && !target.getAttribute('data-path')) {
      target = target.parentElement
    }
    if (target && target.getAttribute) {
      const path = target.getAttribute('data-path')
      const type = target.getAttribute('data-type')
      if (path && type === 'file') {
        event.stopPropagation()
        if (state.focusEdit.element !== path) handleClickFile(path, type)

      } else if (path && type === 'folder') {
        event.stopPropagation()
        if (state.focusEdit.element !== path) handleClickFolder(path, type)

      }
      if (props.showIconsMenu === true) props.hideIconsMenu(!props.showIconsMenu)
    }

  }

  return (
    <div className="h-100 remixui_treeview" data-id="filePanelFileExplorerTree">
      <div ref={treeRef} tabIndex={0} style={{
        outline: 'none',
        display: 'flex',
        flexDirection: 'column'
      }}
      className="h-100 ms-0 ps-1"
      >

        <div key={`treeViewLiMenu`} data-id={`treeViewLiMenu`}>
          <div
            key={`treeViewDivMenu`}
            data-id={`treeViewDivMenu`}
            className={`d-flex flex-row align-items-center`}
          >

          </div>
        </div>
        <FlatTree
          handleTreeClick={handleTreeClick}
          focusEdit={state.focusEdit}
          focusElement={props.focusElement}
          focusContext={state.focusContext}
          editModeOff={editModeOff}
          files={files}
          flatTree={flatTree}
          fileState={fileState}
          expandPath={props.expandPath}
          handleContextMenu={handleContextMenu}
          warnMovingItems={warnMovingItems}
          moveFolderSilently={moveFolderSilently}
          moveFileSilently={moveFileSilently}
          resetMultiselect={resetMultiselect}
          setFilesSelected={setFilesSelected}
          handleClickFolder={handleClickFolder}
          createNewFile={props.createNewFile}
          createNewFolder={props.createNewFolder}
          deletePath={deletePath}
          editPath={props.editModeOn}
          fileTarget={feTarget}
          setTargetFiles={setFeTarget}
        />
      </div>
    </div>
  )
}

export const MessageWrapper = () => {
  return (
    <p>e.g ipfs://QmQQfBMkpDgmxKzYaoAtqfaybzfgGm9b2LWYyT56Chv6xH</p>
  )
}

export default FileExplorer
