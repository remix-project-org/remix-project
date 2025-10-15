import React, {useRef, useEffect, useState, useContext} from 'react' // eslint-disable-line
import { useIntl } from 'react-intl'
import { action, FileExplorerContextMenuProps } from '../types'

import '../css/file-explorer-context-menu.css'
import { customAction } from '@remixproject/plugin-api'
import UploadFile from './upload-file'
import { appPlatformTypes, platformContext, AppContext } from '@remix-ui/app'
import { TrackingContext } from '@remix-ide/tracking'
import { FileExplorerEvent, MatomoEvent } from '@remix-api'

export const FileExplorerContextMenu = (props: FileExplorerContextMenuProps) => {
  const platform = useContext(platformContext)
  const appContext = useContext(AppContext)
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)
  const trackMatomoEvent = <T extends MatomoEvent = FileExplorerEvent>(event: T) => {
    baseTrackEvent?.<T>(event)
  }
  const {
    actions,
    createNewFile,
    createNewFolder,
    deletePath,
    renamePath,
    hideContextMenu,
    pushChangesToGist,
    publishFileToGist,
    publishFolderToGist,
    copy,
    copyFileName,
    copyShareURL,
    copyPath,
    paste,
    runScript,
    emit,
    pageX,
    pageY,
    path,
    type,
    focus,
    downloadPath,
    uploadFile,
    publishManyFilesToGist,
    signTypedData,
    ...otherProps
  } = props
  const contextMenuRef = useRef(null)
  const intl = useIntl()
  const [showFileExplorer, setShowFileExplorer] = useState(false)

  useEffect(() => {
    contextMenuRef.current.focus()
  }, [])

  useEffect(() => {
    const menuItemsContainer = contextMenuRef.current
    const boundary = menuItemsContainer.getBoundingClientRect()

    if (boundary.bottom > (window.innerHeight || document.documentElement.clientHeight)) {
      menuItemsContainer.style.position = 'fixed'
      menuItemsContainer.style.bottom = '10px'
      menuItemsContainer.style.top = null
    }
  }, [pageX, pageY])

  const filterItem = (item: action) => {
    /**
     * if there are multiple elements focused we need to take this and all conditions must be met
     * for example : 'downloadAsZip' with type ['file','folder'] will work on files and folders when multiple are selected
     **/
    const nonRootFocus = focus.filter((el) => {
      return !(el.key === '' && el.type === 'folder')
    })

    if (focus?.length && focus[0].key === 'contextMenu') {
      return true
    }

    if (nonRootFocus.length > 1) {
      for (const element of nonRootFocus) {
        if (!itemMatchesCondition(item, element.type, element.key)) return false
      }
      return true
    } else {
      return itemMatchesCondition(item, type, path)
    }
  }

  const itemMatchesCondition = (item: action, itemType: string, itemPath: string) => {
    if ( platform === appPlatformTypes.desktop && item.platform && item.platform === appPlatformTypes.web) return false
    else if (item.type && Array.isArray(item.type) && (item.type.findIndex(name => name === itemType) !== -1)) return true
    else if (item.path && Array.isArray(item.path) && (item.path.findIndex(key => key === itemPath) !== -1)) return true
    else if (item.extension && Array.isArray(item.extension) && (item.extension.findIndex(ext => itemPath.endsWith(ext)) !== -1)) return true
    else if (item.pattern && Array.isArray(item.pattern) && (item.pattern.filter(value => itemPath.match(new RegExp(value))).length > 0)) return true
    else return false
  }

  const getPath = () => {
    if (focus.length > 1) {
      return focus.map((element) => element.key)
    } else {
      return path
    }
  }

  const menu = () => {
    let group = 0
    const groupedActions = actions
      .filter((item) => filterItem(item))
      .reduce((acc, item) => {
        if (item.group === undefined || item.group === null) item.group = 99
        if (!acc[item.group]) acc[item.group] = []
        acc[item.group].push(item)
        return acc
      }, [])
    let key = -1
    return groupedActions.map((groupItem, groupIndex) =>
      groupItem.map((item, index) => {
        key++
        const className = `px-3 remixui_liitem ${group !== item.group ? 'border-top' : ''}`
        group = item.group
        if (item.name === 'Upload File') {
          return (
            <li
              id={`menuitem${item.name.toLowerCase()}`}
              data-id={`contextMenuItem${item.id}`}
              key={key}
              className={className}
              onClick={() => {
                trackMatomoEvent({ category: 'fileExplorer', action: 'contextMenu', name: 'uploadFile', isClick: true })
                setShowFileExplorer(true)
              }}
            >
              {intl.formatMessage({
                id: `filePanel.${item.id}`,
                defaultMessage: item.label || item.name
              })}
            </li>
          )
        }

        if (item.name === 'Load a Local File') {
          return (
            <li
              id={`menuitem${item.name.toLowerCase()}`}
              data-id={`contextMenuItem${item.id}`}
              key={key}
              className={className}
              onClick={() => {
                trackMatomoEvent({ category: 'fileExplorer', action: 'contextMenu', name: 'uploadFile', isClick: true })
                setShowFileExplorer(true)
              }}
            >
              {intl.formatMessage({
                id: `filePanel.${item.id}`,
                defaultMessage: item.label || item.name
              })}
            </li>
          )
        }
        return (
          <li
            id={`menuitem${item.name.toLowerCase()}`}
            data-id={`contextMenuItem${item.id}`}
            key={key}
            className={className}
            onClick={(e) => {
              e.stopPropagation()
              switch (item.name) {
              case 'New File':
                createNewFile(path)
                trackMatomoEvent({ category: 'fileExplorer', action: 'contextMenu', name: 'newFile', isClick: true })
                break
              case 'New Folder':
                createNewFolder(path)
                trackMatomoEvent({ category: 'fileExplorer', action: 'contextMenu', name: 'newFolder', isClick: true })
                break
              case 'Rename':
                renamePath(path, type)
                trackMatomoEvent({ category: 'fileExplorer', action: 'contextMenu', name: 'rename', isClick: true })
                break
              case 'Delete':
                deletePath(getPath())
                trackMatomoEvent({ category: 'fileExplorer', action: 'contextMenu', name: 'delete', isClick: true })
                break
              case 'Download':
                downloadPath(path)
                trackMatomoEvent({ category: 'fileExplorer', action: 'contextMenu', name: 'download', isClick: true })
                break
              case 'Push changes to gist':
                trackMatomoEvent({ category: 'fileExplorer', action: 'contextMenu', name: 'pushToChangesoGist', isClick: true })
                pushChangesToGist(path)
                break
              case 'Publish folder to gist':
                trackMatomoEvent({ category: 'fileExplorer', action: 'contextMenu', name: 'publishFolderToGist', isClick: true })
                publishFolderToGist(path)
                break
              case 'Publish file to gist':
                trackMatomoEvent({ category: 'fileExplorer', action: 'contextMenu', name: 'publishFileToGist', isClick: true })
                publishFileToGist(path)
                break
              case 'Publish files to gist':
                trackMatomoEvent({ category: 'fileExplorer', action: 'contextMenu', name: 'publishFilesToGist', isClick: true })
                publishManyFilesToGist()
                break
              case 'Run':
                trackMatomoEvent({ category: 'fileExplorer', action: 'contextMenu', name: 'runScript', isClick: true })
                runScript(path)
                break
              case 'Copy':
                copy(path, type)
                trackMatomoEvent({ category: 'fileExplorer', action: 'contextMenu', name: 'copy', isClick: true })
                break
              case 'Copy name':
                copyFileName(path, type)
                trackMatomoEvent({ category: 'fileExplorer', action: 'contextMenu', name: 'copyName', isClick: true })
                break
              case 'Copy path':
                copyPath(path, type)
                trackMatomoEvent({ category: 'fileExplorer', action: 'contextMenu', name: 'copyPath', isClick: true })
                break
              case 'Copy share URL':
                copyShareURL(path, type)
                trackMatomoEvent({ category: 'fileExplorer', action: 'contextMenu', name: 'copyShareURL', isClick: true })
                break
              case 'Paste':
                paste(path, type)
                trackMatomoEvent({ category: 'fileExplorer', action: 'contextMenu', name: 'paste', isClick: true })
                break
              case 'Delete All':
                deletePath(getPath())
                trackMatomoEvent({ category: 'fileExplorer', action: 'contextMenu', name: 'deleteAll', isClick: true })
                break
              case 'Publish Workspace to Gist':
                trackMatomoEvent({ category: 'fileExplorer', action: 'contextMenu', name: 'publishWorkspace', isClick: true })
                publishFolderToGist(path)
                break
              case 'Sign Typed Data':
                trackMatomoEvent({ category: 'fileExplorer', action: 'contextMenu', name: 'signTypedData', isClick: true })
                signTypedData(path)
                break
              default:
                trackMatomoEvent({ category: 'fileExplorer', action: 'contextMenu', name: `${item.id}/${item.name}`, isClick: true })
                emit && emit({ ...item, path: [path]} as customAction)
                break
              }
              hideContextMenu()
            }}
          >
            {intl.formatMessage({
              id: `filePanel.${item.id}`,
              defaultMessage: item.label || item.name
            })}
          </li>
        )
      })
    )
  }

  return (
    <div
      id="menuItemsContainer"
      className="p-1 remixui_contextContainer bg-light shadow border"
      style={{ left: pageX, top: pageY }}
      ref={contextMenuRef}
      onBlur={hideContextMenu}
      tabIndex={500}
      {...otherProps}
    >
      {showFileExplorer && (
        <UploadFile
          onUpload={(target) => {
            uploadFile(target)
          }}
          multiple
        />
      )}
      <ul id="remixui_menuitems">{menu()}</ul>
    </div>
  )
}

export default FileExplorerContextMenu
