import React, {useState, useContext, useRef} from 'react' //eslint-disable-line
import { FileExplorerMenuProps } from '../types'
import { FileSystemContext } from '../contexts'
import { appActionTypes, AppContext, appPlatformTypes, platformContext } from '@remix-ui/app'
import { TrackingContext } from '@remix-ide/tracking'
import { MatomoEvent, FileExplorerEvent, MatomoCategories } from '@remix-api'
import { Button, Dropdown } from 'react-bootstrap'
import { createNewFile } from '../actions'

export const FileExplorerMenu = (props: FileExplorerMenuProps) => {
  const global = useContext(FileSystemContext)
  const platform = useContext(platformContext)
  const appContext = useContext(AppContext)
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)
  const trackMatomoEvent = <T extends MatomoEvent = FileExplorerEvent>(event: T) => {
    baseTrackEvent?.<T>(event)
  }
  const inputRef = useRef<HTMLInputElement>(null)
  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false)

  const menuItems = [
    {
      action: 'newBlankFile',
      title: 'New blank file',
      icon: 'far fa-plus',
      placement: 'top',
      platforms:[appPlatformTypes.web, appPlatformTypes.desktop]
    },
    {
      action: 'createNewFile',
      title: 'Create new file',
      icon: 'far fa-file',
      placement: 'top',
      platforms:[appPlatformTypes.web, appPlatformTypes.desktop]
    },
    {
      action: 'createNewFolder',
      title: 'Create new folder',
      icon: 'far fa-folder',
      placement: 'top',
      platforms:[appPlatformTypes.web, appPlatformTypes.desktop]
    },
    {
      action: 'uploadFile',
      title: 'Upload files into current Workspace',
      icon: 'far fa-upload',
      placement: 'top',
      platforms:[appPlatformTypes.web]
    },
    {
      action: 'uploadFolder',
      title: 'Upload folder into current Workspace',
      icon: 'far fa-folder-upload',
      placement: 'top',
      platforms:[appPlatformTypes.web]
    },
    {
      action: 'importFromIpfs',
      title: 'Import files from ipfs',
      icon: 'fa-regular fa-cube',
      placement: 'top',
      platforms: [appPlatformTypes.web, appPlatformTypes.desktop]
    },
    {
      action: 'localFileSystem',
      title: 'Import files from local file system',
      icon: 'fa-solid fa-upload',
      placement: 'top',
      platforms: [appPlatformTypes.web, appPlatformTypes.desktop]
    },
    {
      action: 'importFromHttps',
      title: 'Import files with https',
      icon: 'fa-solid fa-link',
      placement: 'top',
      platforms: [appPlatformTypes.web, appPlatformTypes.desktop]
    },
    {
      action: 'initializeWorkspaceAsGitRepo',
      title: 'Initialize Workspace as a git repository',
      icon: 'fa-brands fa-git-alt',
      placement: 'top',
      platforms: [appPlatformTypes.web, appPlatformTypes.desktop]
    },
    {
      action: 'revealInExplorer',
      title: 'Reveal Workspace in explorer',
      icon: 'fas fa-eye',
      placement: 'top',
      platforms: [appPlatformTypes.desktop]
    }
  ]

  const itemAction = async (action: string) => {
    if (action === 'localFileSystem') {
      inputRef.current?.click()
    }
  }

  const enableDirUpload = { directory: '', webkitdirectory: '' }

  return (
    <>
      <input
        ref={inputRef}
        id="localFileSystemUpload"
        data-id="fileExplorerLocalFileSystemUpload"
        type="file"
        onChange={(e) => {
          e.stopPropagation()
          props.uploadFile(e.target)
          e.target.value = null
          setIsCreateMenuOpen(false)
        }}
      />
      {!global.fs.browser.isSuccessfulWorkspace ? null :
        <>

          <span data-id="spanContaining" className="ps-0 pb-1 w-50">
            <Dropdown show={isCreateMenuOpen} onToggle={(next) => setIsCreateMenuOpen(next)}>
              <Dropdown.Toggle
                as={Button}
                variant="secondary"
                className="w-100 mb-1 d-flex flex-row align-items-center justify-content-center border"
                data-id="fileExplorerCreateButton"
                onClick={() => {
                  setIsCreateMenuOpen((prev) => !prev)
                  trackMatomoEvent({
                    category: MatomoCategories.FILE_EXPLORER,
                    action: 'createMenuButtonOpen',
                    isClick: true
                  })
                }}
                style={{
                  color: '#fff'
                }}
              >
                <div className="w-50"></div>
                <div
                  className="d-flex flex-row align-items-center justify-items-start me-5 w-50"
                >
                  <i className="far fa-plus text-white me-2"></i>
                  <span className="text-white fw-semibold" style={{ fontSize: '1.05rem' }}>Create</span>
                </div>
              </Dropdown.Toggle>
              <Dropdown.Menu className="w-100 custom-dropdown-items bg-light">
                {menuItems.filter((item) => item.action === 'newBlankFile').map(({ action, title, icon, placement, platforms }, index) => {
                  return (
                    <Dropdown.Item
                      data-id="fileExplorerCreateButton-newBlankFile"
                      key={index}
                      onClick={async () => {
                        props.createNewFile()
                        await global.plugin.call('notification', 'toast', 'File created successfully')
                        trackMatomoEvent({
                          category: MatomoCategories.FILE_EXPLORER,
                          action: 'createBlankFile',
                          isClick: true
                        })
                      }}
                    >
                      <span className="text-decoration-none">
                        <i className={icon}></i>
                        <span className="ps-2">{title}</span>
                      </span>
                    </Dropdown.Item>
                  )
                })}
                {menuItems.filter((item) => item.action === 'createNewFile').map(({ action, title, icon, placement, platforms }, index) => {
                  return (
                    <Dropdown.Item
                      data-id="fileExplorerCreateButton-createNewFile"
                      key={index}
                      onClick={async () => {
                        await global.plugin.call('templateexplorermodal', 'updateTemplateExplorerInFileMode', true)
                        appContext.appStateDispatch({
                          type: appActionTypes.showGenericModal,
                          payload: true
                        })
                        trackMatomoEvent({
                          category: MatomoCategories.FILE_EXPLORER,
                          action: 'createNewFile',
                          isClick: true
                        })
                      }}
                    >
                      <span className="text-decoration-none">
                        <i className={icon}></i>
                        <span className="ps-2">{title}</span>
                      </span>
                    </Dropdown.Item>
                  )
                })}
                {menuItems.filter((item) => item.action === 'createNewFolder').map(({ action, title, icon, placement, platforms }, index) => {
                  return (
                    <Dropdown.Item
                      data-id="fileExplorerCreateButton-createNewFolder"
                      key={index}
                      onClick={async () => {
                        props.createNewFolder()
                        trackMatomoEvent({
                          category: MatomoCategories.FILE_EXPLORER,
                          action: 'createNewFolder',
                          isClick: true
                        })
                      }}
                    >
                      <span className="text-decoration-none">
                        <i className={icon}></i>
                        <span className="ps-2">{title}</span>
                      </span>
                    </Dropdown.Item>
                  )
                })}
                {menuItems.filter((item) => item.action === 'importFromIpfs').map(({ action, title, icon, placement, platforms }, index) => {
                  return (
                    <Dropdown.Item
                      data-id="fileExplorerCreateButton-importFromIpfs"
                      key={index}
                      onClick={async () => {
                        await global.plugin.call('templateexplorermodal', 'importFromExternal', true)
                        appContext.appStateDispatch({
                          type: appActionTypes.showGenericModal,
                          payload: true
                        })
                        trackMatomoEvent({
                          category: MatomoCategories.FILE_EXPLORER,
                          action: 'importFromIpfs',
                          isClick: true
                        })
                      }}
                    >
                      <span className="text-decoration-none">
                        <i className={icon}></i>
                        <span className="ps-2">{title}</span>
                      </span>
                    </Dropdown.Item>
                  )
                })}
                {menuItems.filter((item) => item.action === 'localFileSystem').map(({ action, title, icon, placement, platforms }, index) => {
                  return (
                    <Dropdown.Item
                      data-id="fileExplorerCreateButton-localFileSystem"
                      key={index}
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        itemAction(action)
                        trackMatomoEvent({
                          category: MatomoCategories.FILE_EXPLORER,
                          action: 'importFromLocalFileSystem',
                          isClick: true
                        })
                      }}
                    >
                      <span className="text-decoration-none">
                        <i className={icon}></i>
                        <span className="ps-2">{title}</span>
                      </span>
                    </Dropdown.Item>
                  )
                })}
                {menuItems.filter((item) => item.action === 'importFromHttps').map(({ action, title, icon, placement, platforms }, index) => {
                  return (
                    <Dropdown.Item
                      data-id="fileExplorerCreateButton-importFromHttps"
                      key={index}
                      onClick={async () => {
                        await global.plugin.call('templateexplorermodal', 'importFromHttps', true)
                        appContext.appStateDispatch({
                          type: appActionTypes.showGenericModal,
                          payload: true
                        })
                        trackMatomoEvent({
                          category: MatomoCategories.FILE_EXPLORER,
                          action: 'importFromHttps',
                          isClick: true
                        })
                      }}
                    >
                      <span className="text-decoration-none">
                        <i className={icon}></i>
                        <span className="ps-2">{title}</span>
                      </span>
                    </Dropdown.Item>
                  )
                })}
              </Dropdown.Menu>
            </Dropdown>
          </span>
        </>}
    </>
  )
}

export default FileExplorerMenu
