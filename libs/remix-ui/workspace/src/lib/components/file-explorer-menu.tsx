import React, {useState, useContext, useRef, useEffect} from 'react' //eslint-disable-line

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
  const folderInputRef = useRef<HTMLInputElement>(null)

  const [isDappWorkspace, setIsDappWorkspace] = useState(false)
  interface DappMappingInfo {
    address: string
    dappWorkspace: string
    sourceWorkspace: string
    chainId?: string
    contractName?: string
    createdAt?: number
  }
  const [dappMappings, setDappMappings] = useState<DappMappingInfo[]>([])
  const [sourceWorkspaceTarget, setSourceWorkspaceTarget] = useState<string | null>(null)
  const [navigationRefreshCounter, setNavigationRefreshCounter] = useState(0)
  const [showDappSelectModal, setShowDappSelectModal] = useState(false)
  const [selectedDappIndex, setSelectedDappIndex] = useState(0)
  const [isCheckingDappMappings, setIsCheckingDappMappings] = useState(false)
  const [isSwitchingToContract, setIsSwitchingToContract] = useState(false)
  const [isSwitchingToDapp, setIsSwitchingToDapp] = useState(false)

  let menuItems = [
    {
      action: 'newBlankFile',
      title: 'New file',
      icon: 'far fa-plus',
      placement: 'top',
      platforms:[appPlatformTypes.web, appPlatformTypes.desktop]
    },
    {
      action: 'createNewFile',
      title: 'New file using Template',
      icon: 'far fa-file',
      placement: 'top',
      platforms:[appPlatformTypes.web, appPlatformTypes.desktop]
    },
    {
      action: 'createNewFolder',
      title: 'New folder',
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
      action: 'importFromIpfs',
      title: 'Import files from IPFS',
      icon: 'fa-regular fa-cube',
      placement: 'top',
      platforms: [appPlatformTypes.web, appPlatformTypes.desktop]
    },
    {
      action: 'importFromHttps',
      title: 'Import files from HTTPS',
      icon: 'fa-solid fa-link',
      placement: 'top',
      platforms: [appPlatformTypes.web, appPlatformTypes.desktop]
    },
    {
      action: 'localFileSystem',
      title: 'Upload files',
      icon: 'fa-solid fa-upload',
      placement: 'top',
      platforms: [appPlatformTypes.web]
    },
    {
      action: 'uploadFolder',
      title: 'Upload folders',
      icon: 'fa-solid fa-folder-upload',
      placement: 'top',
      platforms:[appPlatformTypes.web]
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

  menuItems = menuItems.filter((item) => item.platforms.includes(platform))

  // Reset loading states when workspace type changes
  // This ensures smooth button transitions: switching button visibility syncs with loading state reset
  useEffect(() => {
    if (isSwitchingToContract && !isDappWorkspace) {
      // We were switching from DApp to Contract, and now we're on Contract
      setIsSwitchingToContract(false)
    }
    if (isSwitchingToDapp && isDappWorkspace) {
      // We were switching from Contract to DApp, and now we're on DApp
      setIsSwitchingToDapp(false)
    }
  }, [isDappWorkspace])

  useEffect(() => {
    const detectWorkspaceType = async () => {
      const currentWorkspace = global.fs.browser.currentWorkspace

      if (!currentWorkspace) {
        return
      }

      if (currentWorkspace.startsWith('dapp-')) {
        setIsDappWorkspace(true)
        setDappMappings([])

        try {
          const configContent = await global.plugin.call('fileManager', 'readFile', 'dapp.config.json')
          const config = JSON.parse(configContent)
          if (config.sourceWorkspace?.name) {
            setSourceWorkspaceTarget(config.sourceWorkspace.name)
          } else {
            setSourceWorkspaceTarget(null)
          }
        } catch (e) {
          setSourceWorkspaceTarget(null)
        }
      } else {
        setIsDappWorkspace(false)
        setSourceWorkspaceTarget(null)
        setDappMappings([])
        setIsCheckingDappMappings(true)
      }
    }

    const checkDappMappingsDeferred = () => {
      const currentWorkspace = global.fs.browser.currentWorkspace
      if (!currentWorkspace || currentWorkspace.startsWith('dapp-')) {
        return
      }

      const checkMappings = async () => {
        try {
          const mappingsDir = '.deploys/dapp-mappings'
          const exists = await global.plugin.call('fileManager', 'exists', mappingsDir)

          if (!exists) {
            setDappMappings([])
            setIsCheckingDappMappings(false)
            return
          }

          const files = await global.plugin.call('fileManager', 'readdir', mappingsDir)

          if (!files || Object.keys(files).length === 0) {
            setDappMappings([])
            setIsCheckingDappMappings(false)
            return
          }

          const validMappings: DappMappingInfo[] = []
          const pinnedDir = '.deploys/pinned-contracts'
          const pinnedDirExists = await global.plugin.call('fileManager', 'exists', pinnedDir)

          for (const filePath of Object.keys(files)) {
            try {
              const fileName = filePath.split('/').pop()
              if (!fileName) continue

              const mappingContent = await global.plugin.call('fileManager', 'readFile', `${mappingsDir}/${fileName}`)
              const mapping = JSON.parse(mappingContent)

              if (!mapping.dappWorkspace) continue

              const workspaceExists = await global.plugin.call('filePanel', 'workspaceExists', mapping.dappWorkspace)
              if (!workspaceExists) continue

              const address = mapping.address
              if (!address) continue

              let pinnedContractExists = false
              let foundChainId = ''

              if (pinnedDirExists) {
                const chainFolders = await global.plugin.call('fileManager', 'readdir', pinnedDir)
                for (const chainPath of Object.keys(chainFolders)) {
                  const chainFolder = chainPath.split('/').pop()
                  const pinnedFilePath = `${pinnedDir}/${chainFolder}/${address}.json`
                  try {
                    const pinnedExists = await global.plugin.call('fileManager', 'exists', pinnedFilePath)
                    if (pinnedExists) {
                      pinnedContractExists = true
                      foundChainId = chainFolder || ''
                      break
                    }
                  } catch (e) {}
                }
              }

              if (!pinnedContractExists) {
                try {
                  await global.plugin.call('fileManager', 'remove', `${mappingsDir}/${fileName}`)
                } catch (e) {}
                continue
              }

              validMappings.push({
                address: address,
                dappWorkspace: mapping.dappWorkspace,
                sourceWorkspace: mapping.sourceWorkspace || '',
                chainId: foundChainId,
                createdAt: mapping.createdAt
              })
            } catch (e) {}
          }

          setDappMappings(validMappings)
          setIsCheckingDappMappings(false)

        } catch (e) {
          setDappMappings([])
          setIsCheckingDappMappings(false)
        }
      }

      checkMappings()
    }

    // Defer all async operations to avoid blocking file tree rendering
    const timeoutId = setTimeout(() => {
      detectWorkspaceType()
      checkDappMappingsDeferred()
    }, 1500)

    return () => clearTimeout(timeoutId)
  }, [global.fs.browser.currentWorkspace, navigationRefreshCounter])

  useEffect(() => {
    const handleWorkspaceChange = () => {
      setTimeout(() => {
        setNavigationRefreshCounter(prev => prev + 1)
      }, 500)
    }

    global.plugin.on('filePanel', 'setWorkspace', handleWorkspaceChange)

    return () => {
      global.plugin.off('filePanel', 'setWorkspace', handleWorkspaceChange)
    }
  }, [])

  const handleGoToDapp = async () => {

    if (dappMappings.length === 0) {
      return
    }

    const selectedWorkspace: string | null = null

    if (dappMappings.length === 1) {
      await navigateToDapp(dappMappings[0].dappWorkspace)
    } else {
      setSelectedDappIndex(0)
      setShowDappSelectModal(true)
    }
  }

  const navigateToDapp = async (workspaceName: string) => {
    setIsSwitchingToDapp(true)
    try {
      if (global.dispatchSwitchToWorkspace) {
        await global.dispatchSwitchToWorkspace(workspaceName)
      } else {
        await global.plugin.call('filePanel', 'switchToWorkspace', workspaceName)
      }
      await new Promise(resolve => setTimeout(resolve, 500))

      await global.plugin.call('menuicons', 'select', 'quick-dapp-v2')

      try {
        await global.plugin.call('quick-dapp-v2', 'openDapp', workspaceName)
      } catch (e) {
        console.warn('[FileExplorerMenu] Could not open DApp detail:', e)
      }
      // Note: Don't reset isSwitchingToDapp here - useEffect will handle it when isDappWorkspace changes
    } catch (e) {
      console.error('[FileExplorerMenu] Failed to switch to DApp workspace:', e)
      setIsSwitchingToDapp(false) // Only reset on error
    }
  }

  const handleDappSelectConfirm = async () => {
    setShowDappSelectModal(false)
    if (dappMappings[selectedDappIndex]) {
      await navigateToDapp(dappMappings[selectedDappIndex].dappWorkspace)
    }
  }

  const handleGoToContract = async () => {
    if (!sourceWorkspaceTarget || isSwitchingToContract) {
      return
    }
    setIsSwitchingToContract(true)
    try {
      if (global.dispatchSwitchToWorkspace) {
        await global.dispatchSwitchToWorkspace(sourceWorkspaceTarget)
      } else {
        await global.plugin.call('filePanel', 'switchToWorkspace', sourceWorkspaceTarget)
      }
      await new Promise(resolve => setTimeout(resolve, 500))
      await global.plugin.call('menuicons', 'select', 'filePanel')
      // Note: Don't reset isSwitchingToContract here - useEffect will handle it when isDappWorkspace changes
    } catch (e) {
      console.error('[FileExplorerMenu] Failed to switch to source workspace:', e)
      setIsSwitchingToContract(false) // Only reset on error
    }
  }

  const itemAction = async (action: string) => {

    if (action === 'localFileSystem') {
      inputRef.current?.click()
    }
    if (action === 'uploadFolder') {
      folderInputRef.current?.click()
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
      <input
        ref={folderInputRef}
        id="uploadFolderInput"
        data-id="fileExplorerUploadFolder"
        type="file"
        multiple
        {...enableDirUpload}
        onChange={(e) => {
          e.stopPropagation()
          props.uploadFolder(e.target)
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
                {menuItems.filter((item) => item.action === 'uploadFolder').map(({ action, title, icon, placement, platforms }, index) => {
                  return (
                    <Dropdown.Item
                      data-id="fileExplorerCreateButton-uploadFolder"
                      key={index}
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        itemAction(action)
                        trackMatomoEvent({
                          category: MatomoCategories.FILE_EXPLORER,
                          action: 'uploadFolder',
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

          {!isDappWorkspace && (isCheckingDappMappings || isSwitchingToDapp || dappMappings.length > 0) && (
            <span className="ps-0 pb-1 w-50">
              <Button
                variant="primary"
                className="w-100 mb-1 d-flex flex-row align-items-center justify-content-center"
                data-id="fileExplorerGoToDappButton"
                onClick={handleGoToDapp}
                disabled={isCheckingDappMappings || isSwitchingToDapp || dappMappings.length === 0}
              >
                {isSwitchingToDapp ? (
                  <>
                    <i className="fas fa-spinner fa-spin me-2"></i>
                    <span>Switching...</span>
                  </>
                ) : isCheckingDappMappings ? (
                  <>
                    <i className="fas fa-spinner fa-spin me-2"></i>
                    <span>Checking DApps...</span>
                  </>
                ) : (
                  <>
                    <i className="far fa-rocket me-2"></i>
                    <span>Go to DApp{dappMappings.length > 1 ? ` (${dappMappings.length})` : ''}</span>
                  </>
                )}
              </Button>
            </span>
          )}

          {isDappWorkspace && sourceWorkspaceTarget && (
            <span className="ps-0 pb-1 w-50">
              <Button
                variant="success"
                className="w-100 mb-1 d-flex flex-row align-items-center justify-content-center"
                data-id="fileExplorerGoToContractButton"
                onClick={handleGoToContract}
                disabled={isSwitchingToContract}
              >
                {isSwitchingToContract ? (
                  <>
                    <i className="fas fa-spinner fa-spin me-2"></i>
                    <span>Switching...</span>
                  </>
                ) : (
                  <>
                    <i className="far fa-file-code me-2"></i>
                    <span>Go to Contract</span>
                  </>
                )}
              </Button>
            </span>
          )}

          {showDappSelectModal && (
            <div
              className="modal d-block"
              style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
              onClick={() => setShowDappSelectModal(false)}
            >
              <div
                className="modal-dialog modal-dialog-centered"
                onClick={e => e.stopPropagation()}
              >
                <div className="modal-content">
                  <div className="modal-header">
                    <h5 className="modal-title">Select DApp</h5>
                    <button
                      type="button"
                      className="btn-close"
                      onClick={() => setShowDappSelectModal(false)}
                    />
                  </div>
                  <div className="modal-body" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                    {dappMappings.map((mapping, index) => (
                      <div
                        key={index}
                        className={`d-flex align-items-start mb-2 p-3 border rounded ${selectedDappIndex === index ? 'border-primary' : ''}`}
                        style={{
                          cursor: 'pointer',
                          backgroundColor: selectedDappIndex === index ? 'var(--primary)' : 'transparent',
                          opacity: selectedDappIndex === index ? 0.9 : 1
                        }}
                        onClick={() => setSelectedDappIndex(index)}
                      >
                        <input
                          className="form-check-input mt-1 me-3"
                          type="radio"
                          name="dappSelection"
                          id={`dapp-${index}`}
                          checked={selectedDappIndex === index}
                          onChange={() => setSelectedDappIndex(index)}
                          style={{ flexShrink: 0 }}
                        />
                        <div className="flex-grow-1">
                          <strong style={{ color: selectedDappIndex === index ? 'white' : 'inherit' }}>
                            {mapping.dappWorkspace}
                          </strong>
                          <br/>
                          <small style={{ color: selectedDappIndex === index ? 'rgba(255,255,255,0.8)' : 'var(--text-muted)' }}>
                            Network: {mapping.chainId || 'Unknown'}<br/>
                            Address: {mapping.address.substring(0, 15)}...
                          </small>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="modal-footer">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setShowDappSelectModal(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleDappSelectConfirm}
                    >
                      OK
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>}
    </>
  )
}

export default FileExplorerMenu
