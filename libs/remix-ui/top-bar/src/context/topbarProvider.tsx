/* eslint-disable @nrwl/nx/enforce-module-boundaries */
// eslint-disable-next-line no-use-before-define
import React, { useReducer, useState, useEffect, SyntheticEvent, useContext } from 'react'
import {ModalDialog} from '@remix-ui/modal-dialog' // eslint-disable-line
import {Toaster} from '@remix-ui/toaster' // eslint-disable-line
import { browserReducer, browserInitialState } from 'libs/remix-ui/workspace/src/lib/reducers/workspace'
import { branch } from '@remix-ui/git'
import { appPlatformTypes, platformContext } from '@remix-ui/app'
import {
  initWorkspace,
  fetchDirectory,
  removeInputField,
  deleteWorkspace,
  deleteAllWorkspaces,
  clearPopUp,
  publishToGist,
  publishFilesToGist,
  createNewFile,
  setFocusElement,
  createNewFolder,
  deletePath,
  renamePath,
  downloadPath,
  copyFile,
  copyShareURL,
  copyFolder,
  runScript,
  signTypedData,
  emitContextMenuEvent,
  handleClickFile,
  handleExpandPath,
  addInputField,
  createWorkspace,
  fetchWorkspaceDirectory,
  renameWorkspace,
  switchToWorkspace,
  uploadFile,
  uploadFolder,
  handleDownloadWorkspace,
  handleDownloadFiles,
  restoreBackupZip,
  cloneRepository,
  moveFile,
  moveFolder,
  showAllBranches,
  switchBranch,
  createNewBranch,
  checkoutRemoteBranch,
  openElectronFolder,
  getElectronRecentFolders,
  removeRecentElectronFolder,
  updateGitSubmodules
} from 'libs/remix-ui/workspace/src/lib/actions'
import { Modal } from 'libs/remix-ui/workspace/src/lib/types'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { TopbarContext } from './topbarContext'
import { Topbar } from 'apps/remix-ide/src/app/components/top-bar'
import { RemixUiTopbar } from '..'

export interface TopbarProviderProps {
  plugin: Topbar
}

export const TopbarProvider = (props: TopbarProviderProps) => {
  const { plugin } = props
  const platform = useContext(platformContext)
  const [fs, fsDispatch] = useReducer(browserReducer, browserInitialState)
  const [focusModal, setFocusModal] = useState<Modal>({
    hide: true,
    title: '',
    message: '',
    okLabel: '',
    okFn: () => {},
    cancelLabel: '',
    cancelFn: () => {}
  })
  const [modals, setModals] = useState<Modal[]>([])
  const [focusToaster, setFocusToaster] = useState<string>('')
  const [toasters, setToasters] = useState<string[]>([])
  const [recentFolders, setRecentFolders] = useState<string[]>([])

  const fetchRecentFolders = async () => {
    try {
      const folders = await plugin.call('fs', 'getRecentFolders')
      setRecentFolders(folders || [])
    } catch (error) {
      console.error('Error fetching recent folders:', error)
      setRecentFolders([])
    }
  }

  const openRecentFolder = async (path: string) => {
    try {
      await plugin.call('fs', 'setWorkingDir', path)
      // Refresh recent folders list since order might have changed
      setTimeout(fetchRecentFolders, 200)
    } catch (error) {
      console.error('Error opening recent folder:', error)
    }
  }

  const openRecentFolderInNewWindow = async (path: string) => {
    try {
      await plugin.call('fs', 'openFolder', path)
    } catch (error) {
      console.error('Error opening recent folder in new window:', error)
    }
  }

  const removeRecentFolder = async (path: string) => {
    try {
      await plugin.call('fs', 'removeRecentFolder', path)
      // Refresh the recent folders list
      setTimeout(fetchRecentFolders, 100)
    } catch (error) {
      console.error('Error removing recent folder:', error)
    }
  }

  const revealRecentFolderInExplorer = async (path: string) => {
    try {
      await plugin.call('fs', 'revealInExplorer', { path: [path]}, true)
    } catch (error) {
      console.error('Error revealing folder in explorer:', error)
    }
  }

  // Fetch recent folders on desktop platform initialization
  useEffect(() => {
    if (platform === appPlatformTypes.desktop) {
      // Fetch recent folders after a delay to ensure workspace is initialized
      fetchRecentFolders()

    }
  }, [platform])

  useEffect(() => {
    if (modals.length > 0) {
      setFocusModal(() => {
        const focusModal = {
          hide: false,
          title: modals[0].title,
          message: modals[0].message,
          okLabel: modals[0].okLabel,
          okFn: modals[0].okFn,
          cancelLabel: modals[0].cancelLabel,
          cancelFn: modals[0].cancelFn
        }
        return focusModal
      })
      const modalList = modals.slice()

      modalList.shift()
      setModals(modalList)
    }
  }, [modals])

  useEffect(() => {
    if (toasters.length > 0) {
      setFocusToaster(() => {
        return toasters[0]
      })
      const toasterList = toasters.slice()

      toasterList.shift()
      setToasters(toasterList)
    }
  }, [toasters])

  useEffect(() => {
    if (fs.notification.title) {
      modal(fs.notification.title, fs.notification.message, fs.notification.labelOk, fs.notification.actionOk, fs.notification.labelCancel, fs.notification.actionCancel)
    }
  }, [fs.notification])

  useEffect(() => {
    if (fs.popup) {
      toast(fs.popup)
    }
  }, [fs.popup])

  const handleHideModal = () => {
    setFocusModal((modal) => {
      return { ...modal, hide: true, message: null }
    })
  }

  const modal = (title: string, message: string | JSX.Element, okLabel: string, okFn: () => void, cancelLabel?: string, cancelFn?: () => void) => {
    setModals((modals) => {
      modals.push({ message, title, okLabel, okFn, cancelLabel, cancelFn })
      return [...modals]
    })
  }

  const handleToaster = () => {
    setFocusToaster('')
    clearPopUp()
  }

  const toast = (toasterMsg: string) => {
    setToasters((messages) => {
      messages.push(toasterMsg)
      return [...messages]
    })
  }

  const value = {
    fs,
    plugin: plugin as unknown as Topbar,
    modal,
    toast,
    recentFolders,
    fetchRecentFolders,
    openRecentFolder,
    openRecentFolderInNewWindow,
    removeRecentFolder,
    revealRecentFolderInExplorer,
    desktopClientMode: plugin.desktopClientMode
  }

  return (
    <TopbarContext.Provider value={value}>
      <RemixUiTopbar />
      <ModalDialog id="topbarModal" {...focusModal} handleHide={handleHideModal} />
      <Toaster message={focusToaster} handleHide={handleToaster} />
    </TopbarContext.Provider>
  )
}

export default TopbarProvider
