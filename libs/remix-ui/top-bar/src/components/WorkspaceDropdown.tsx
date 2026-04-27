/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import { CustomTopbarMenu, CustomToggle } from '@remix-ui/helper'
import React, { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Button, ButtonGroup, Dropdown, Overlay, Popover } from 'react-bootstrap'
import { remote } from '@remix-api'
import { FiMoreVertical } from 'react-icons/fi'
import { TopbarContext } from '../context/topbarContext'
import { getWorkspaces } from 'libs/remix-ui/workspace/src/lib/actions'
import { WorkspaceMetadata } from 'libs/remix-ui/workspace/src/lib/types'
import { appPlatformTypes, platformContext } from '@remix-ui/app'
import path from 'path'
import { DesktopDownload } from 'libs/remix-ui/desktop-download'
import { ElectronWorkspaceMenu } from './ElectronWorkspaceMenu'
import { useCloudStore } from 'libs/remix-ui/workspace/src/lib/cloud/cloud-store'
import { CloudSyncStatusIcon, getSyncIconProps } from 'libs/remix-ui/workspace/src/lib/cloud/cloud-sync-status-icon'
import { downloadBackupSnapshots } from 'libs/remix-ui/workspace/src/lib/cloud/cloud-workspace-actions'

interface Branch {
  name: string
  remote: remote
}

interface SubItem {
  label: string
  onClick: (workspaceName?: string) => void
  icon: string
}

interface MenuItem {
  name: string
  isGitRepo: boolean
  hasGitSubmodules?: boolean
  branches?: Branch[]
  currentBranch?: Branch
  isGist: string
  remoteId?: string
  submenu: SubItem[]
}

interface WorkspacesDropdownProps {
  menuItems: MenuItem[]
  toggleDropdown: any
  showDropdown: boolean
  currentWorkspace: any
  NO_WORKSPACE: string
  switchWorkspace: any
  ShowNonLocalHostMenuItems: () => JSX.Element
  CustomToggle: any
  showSubMenuFlyOut: boolean
  setShowSubMenuFlyOut: (show: boolean) => void
  createWorkspace: () => void
  renameCurrentWorkspace: (workspaceName?: string) => void
  downloadCurrentWorkspace: () => void
  deleteCurrentWorkspace: (workspaceName?: string) => void
  downloadWorkspaces: () => void
  restoreBackup: () => void
  deleteAllWorkspaces: () => void
  setCurrentMenuItemName: (workspaceName: string) => void
  setMenuItems: (menuItems: MenuItem[]) => void
  connectToLocalhost: () => void
  openTemplateExplorer: () => void
  onMigrateToCloud?: () => void
}

function useClickOutside(refs: React.RefObject<HTMLElement>[], handler: () => void) {
  useEffect(() => {
    const listener = (e: MouseEvent) => {
      for (const ref of refs) {
        if (ref.current?.contains(e.target as Node)) return
      }
      handler()
    }
    document.addEventListener('click', listener)
    return () => document.removeEventListener('click', listener)
  }, [refs, handler])
}

const ITEM_LABELS = [
  "First item",
  "Second item",
  "Third item",
  "Fourth item",
  "Fifth item",
]

export const WorkspacesDropdown: React.FC<WorkspacesDropdownProps> = ({ menuItems, NO_WORKSPACE, switchWorkspace, CustomToggle, createWorkspace, downloadCurrentWorkspace, restoreBackup, deleteAllWorkspaces, setCurrentMenuItemName, setMenuItems, renameCurrentWorkspace, deleteCurrentWorkspace, downloadWorkspaces, connectToLocalhost, openTemplateExplorer, onMigrateToCloud }) => {
  const [showMain, setShowMain] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [openSub, setOpenSub] = useState<number | null>(null)
  const global = useContext(TopbarContext)
  const platform = useContext(platformContext)
  const [openSubmenuId, setOpenSubmenuId] = useState(null);
  const iconRefs = useRef({});
  const [currentWorkingDir, setCurrentWorkingDir] = useState<string>('')

  // ── Cloud state (from singleton store — works across React trees) ──
  const cloudState = useCloudStore()
  const { isCloudMode, loading: cloudLoading, syncStatus, activeWorkspaceId, workspaceQueueBusy } = cloudState
  const activeSyncStatus = activeWorkspaceId ? syncStatus[activeWorkspaceId] : null
  const isWorkspaceLoading = activeSyncStatus?.status === 'loading' || activeSyncStatus?.status === 'syncing'
  const isDropdownLocked = isWorkspaceLoading || workspaceQueueBusy

  const toggleSubmenu = (id: any) => {
    setOpenSubmenuId((current) => (current === id ? null : id));
  }
  const [selectedWorkspace, setSelectedWorkspace] = useState<WorkspaceMetadata>({} as WorkspaceMetadata)
  const mainRef = useRef<HTMLDivElement>(null)
  const subRefs = useMemo( // useMemo or else rules of hooks is broken.
    () => menuItems.map(() => React.createRef<HTMLDivElement>()),
    [menuItems]
  )
  const [togglerText, setTogglerText] = useState<string>(NO_WORKSPACE)

  // ── Refresh workspace list when cloud mode changes ──
  useEffect(() => {
    if (platform === appPlatformTypes.desktop) return
    ; (async () => {
      try {
        const workspaces = await getWorkspaces()
        const updated = (workspaces || []).map((workspace) => {
          (workspace as any).submenu = subItems
          return workspace as any
        })
        setMenuItems(updated)
      } catch (error) {
        console.info('[WorkspaceDropdown] Error fetching workspaces on cloud mode change:', error)
      }
    })()
  }, [isCloudMode, cloudState.cloudWorkspaces.length, platform])

  const subItems = useMemo(() => {
    return [
      { label: 'Rename', onClick: renameCurrentWorkspace, icon: 'far fa-edit' },
      // { label: 'Duplicate', onClick: downloadCurrentWorkspace, icon: 'fas fa-copy' },
      { label: 'Download', onClick: downloadCurrentWorkspace, icon: 'fas fa-download' },
      { label: 'Delete', onClick: deleteCurrentWorkspace, icon: 'fas fa-trash' }
    ]
  }, [])

  // For desktop platform, listen to working directory changes
  useEffect(() => {
    if (platform === appPlatformTypes.desktop) {
      const getWorkingDir = async () => {
        try {
          const workingDir = await global.plugin.call('fs', 'getWorkingDir')
          setCurrentWorkingDir(workingDir)
          if (workingDir) {
            const dirName = path.basename(workingDir)
            setTogglerText(dirName || workingDir)
          } else {
            setTogglerText('No project open')
          }
        } catch (error) {
          console.error('Error getting working directory:', error)
          setTogglerText('No project open')
        }
      }

      // Listen for working directory changes
      global.plugin.on('fs', 'workingDirChanged', (dir: string) => {
        setCurrentWorkingDir(dir)
        if (dir) {
          const dirName = path.basename(dir)
          setTogglerText(dirName || dir)
        } else {
          setTogglerText('No project open')
        }
      })

      // Get initial working directory
      getWorkingDir()

      return () => {
        global.plugin.off('fs', 'workingDirChanged')
      }
    }
  }, [platform, global.plugin])

  useEffect(() => {
    if (platform !== appPlatformTypes.desktop) {
      global.plugin.on('filePanel', 'setWorkspace', async (workspace: any) => {
        setTogglerText(workspace.name)
        let workspaces: any[] | undefined = []
        const fromLocalStore = localStorage.getItem('currentWorkspace')
        workspaces = await getWorkspaces()
        const current = workspaces?.find((workspace) => workspace.name === fromLocalStore)
        setSelectedWorkspace(current)
      })

      return () => {
        global.plugin.off('filePanel', 'setWorkspace')
      }
    }
  }, [global.plugin.filePanel.currentWorkspaceMetadata, platform])

  useEffect(() => {
    if (platform !== appPlatformTypes.desktop) {
      let workspaces: any[] | undefined = []

      try {
        setTimeout(async () => {
          workspaces = await getWorkspaces()
          const updated = (workspaces || []).map((workspace) => {
            (workspace as any).submenu = subItems
            return workspace as any
          })
          setMenuItems(updated)
        }, 150)
      } catch (error) {
        console.info('Error fetching workspaces:', error)
      }
    }
  }, [togglerText, openSubmenuId, platform])

  useClickOutside([mainRef, ...subRefs], () => {
    setShowMain(false)
    setOpenSub(null)
  })

  const toggleSub = (idx: number) =>
    setOpenSub(prev => (prev === idx ? null : idx))

  const openFolder = async () => {
    console.log('Opening folder...')
    try {
      await global.plugin.call('fs', 'openFolderInSameWindow')
    } catch (error) {
      console.error('Error opening folder:', error)
    }
  }

  // Render simplified dropdown for desktop
  if (platform === appPlatformTypes.desktop) {
    return (
      <Dropdown
        as={ButtonGroup}
        style={{ minWidth: '70%' }}
        className="d-flex rounded-md"
        id="workspacesSelect"
        data-id="workspacesSelect"
      >
        <Dropdown.Toggle
          as={CustomToggle}
          className="btn btn-sm w-100 border position-relative"
          variant="secondary"
          data-id="workspacesMenuDropdown"
        >
          <div
            data-id="workspacesSelect-togglerText"
            className="text-truncate position-absolute start-50 translate-middle"
          >
            {togglerText}
          </div>
        </Dropdown.Toggle>
        <ElectronWorkspaceMenu
          showMain={showMain}
          setShowMain={setShowMain}
          openFolder={openFolder}
          createWorkspace={createWorkspace}
        />
      </Dropdown>
    )
  }

  // Original web dropdown implementation

  // Original web dropdown implementation
  return (
    <Dropdown
      as={ButtonGroup}
      show={dropdownOpen}
      onToggle={(open) => { if (isDropdownLocked && open) return; setDropdownOpen(open) }}
      style={{ minWidth: '70%' }}
      className="d-flex rounded-md"
      id="workspacesSelect"
      data-id="workspacesSelect"
      data-disabled={isDropdownLocked ? 'true' : undefined}
    >
      <Dropdown.Toggle
        as={CustomToggle}
        className="btn btn-sm w-100 border position-relative"
        variant="secondary"
        data-id="workspacesMenuDropdown"
        icon={selectedWorkspace && selectedWorkspace.isGitRepo ? 'fas fa-code-branch' : null}
      >
        <div
          data-id="workspacesSelect-togglerText"
          className="text-truncate position-absolute start-50 translate-middle d-flex align-items-center"
        >
          {isCloudMode && (() => {
            const props = getSyncIconProps(activeSyncStatus)
            return (
              <i
                className={`${props.icon}${props.animate ? ' ' + props.animate : ''} me-2`}
                style={{ color: props.color, fontSize: '0.8em' }}
                title={props.title}
              />
            )
          })()}
          {cloudLoading ? 'Loading workspaces...' : togglerText}
          {!isCloudMode && selectedWorkspace && selectedWorkspace.remoteId && (
            <CloudSyncStatusIcon remoteId={selectedWorkspace.remoteId} className="ms-2" />
          )}
        </div>
      </Dropdown.Toggle>
      <Dropdown.Menu
        style={{ minWidth: '100%' }}
        className="px-2"
        data-id="topbar-custom-dropdown-items"
        show={showMain}
        as={"div"}
      >
        <div id="scrollable-section" className="overflow-y-scroll" style={{ maxHeight: '160px', opacity: isDropdownLocked ? 0.5 : 1, pointerEvents: isDropdownLocked ? 'none' : 'auto' }}>
          {/* Deduplicate by name — multiple async refresh paths can race and
              produce duplicates during workspace creation (especially git-based
              templates that trigger clone → checkGit → setWorkspaces cascades). */}
          {menuItems.filter((item, idx, arr) => arr.findIndex(i => i.name === item.name) === idx).map((item, idx) => {
            const id = idx + 1
            if (!iconRefs.current[id]) iconRefs.current[id] = { current: null }
            return (
              <div key={id} className="d-flex flex-row">
                <Dropdown.Item
                  key={id}
                  className="dropdown-item d-flex align-items-center position-relative"
                  onMouseDown={(e) => {
                    if (isDropdownLocked) { e.preventDefault(); return }
                    setDropdownOpen(false)
                    switchWorkspace(item.name)
                    e.preventDefault()
                  }}
                  data-id={`dropdown-item-${item.name}`}
                >
                  {item.isGitRepo && item.currentBranch && (
                    <i className="fas fa-code-branch pt-1 me-2"></i>
                  )}
                  {item.remoteId && (
                    <CloudSyncStatusIcon remoteId={item.remoteId} className="pt-1 me-2" />
                  )}
                  <span className="pl-1">{item.name}</span>
                </Dropdown.Item>
                <div className="d-flex align-items-center" id="submenu-activate-button">
                  <Button
                    ref={(el) => (iconRefs.current[id].current = el)}
                    variant="link"
                    className="p-0 ms-2 text-muted submenu-trigger"
                    aria-label={`More actions for ${item.name}`}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      toggleSubmenu(id)
                    }}
                    data-id="workspacesubMenuIcon"
                  >
                    <FiMoreVertical size={18} />
                  </Button>

                  <Overlay
                    show={openSubmenuId === id}
                    target={iconRefs.current[id].current}
                    placement="right-start"
                    container={document.body}
                    popperConfig={{
                      modifiers: [
                        { name: "offset", options: { offset: [8, 22]} },
                        { name: "preventOverflow", options: { boundary: "viewport", padding: 8 } },
                        { name: 'flip', options: { enabled: false } }
                      ],
                    }}
                    rootClose
                    transition={false} //fix flickering and hopefully e2e as well
                    onHide={() => setOpenSubmenuId(null)}
                  >
                    <section
                      id={`submenu-${id}`}
                      style={{
                        minWidth: 160,
                        zIndex: 9999,
                        position: 'relative',
                      }}
                      data-id="workspacesubMenuOverlay"
                    >
                      <div className="p-0 rounded w-75 border-warning">
                        <div className="d-grid gap-0">
                          <Button
                            variant="light"
                            className="border d-flex align-items-center text-decoration-none rounded-start-0"
                            data-id="workspacesubMenuRename"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              renameCurrentWorkspace(item.name)
                              setOpenSubmenuId(null)
                            }}
                            style={{
                              color: 'var(--bs-body-color)',
                              borderBottomRightRadius: 0,
                              borderTopRightRadius: 4,
                              borderTopLeftRadius: 20,
                              borderBottomLeftRadius: 4,
                            }}
                          >
                            <span className="me-2">
                              <i className="far fa-edit" />
                            </span>
                            <span>Rename</span>
                          </Button>
                          <Button
                            variant="light"
                            size="sm"
                            style={{
                              color: 'var(--bs-body-color)'
                            }}
                            className="border border-top-0 border-bottom-0 d-flex align-items-center text-decoration-none rounded-0"
                            data-id="workspacesubMenuDownload"
                            onClick={(e) => {
                              e.stopPropagation()
                              downloadCurrentWorkspace()
                              setCurrentMenuItemName(item.name)
                              setOpenSubmenuId(null)
                            }}
                          >
                            <span className="me-2">
                              <i className="fas fa-download" />
                            </span>
                            <span>Download</span>
                          </Button>
                          <Button
                            variant="light"
                            size="sm"
                            style={{
                              color: 'var(--bs-body-color)',
                              borderBottomRightRadius: 4,
                              borderTopRightRadius: 0,
                              borderTopLeftRadius: 0,
                              borderBottomLeftRadius: 4,
                            }}
                            className="border d-flex align-items-center text-decoration-none"
                            data-id="workspacesubMenuDelete"
                            onClick={(e) => {
                              deleteCurrentWorkspace(item.name)
                              e.stopPropagation()
                              setOpenSubmenuId(null)
                            }}
                          >
                            <span className="me-2">
                              <i className="fas fa-trash" />
                            </span>
                            <span>Delete</span>
                          </Button>
                        </div>
                      </div>
                    </section>
                  </Overlay>
                </div>
              </div>
            )
          })}
        </div>
        <div className="d-grid gap-2">
          <Dropdown.Item
            data-id="workspacecreate"
            onClick={(e) => {
              openTemplateExplorer()
              setOpenSub(null)
            }}
            style={{
              backgroundColor: 'transparent',
              color: 'inherit',
            }}
          >
            <button className="w-100 btn btn-primary font-weight-light text-decoration-none mb-2 rounded-lg" onClick={(e) => {
              openTemplateExplorer()
              setShowMain(false)
              setOpenSub(null)
            }}>
              <i className="fas fa-plus me-2"></i>
              Create a new Workspace
            </button>
          </Dropdown.Item>

          {/* ── Cloud mode: show sync status ── */}
          {isCloudMode && activeSyncStatus && (() => {
            const statusProps = getSyncIconProps(activeSyncStatus)
            return (
              <>
                <Dropdown.Divider className="border mb-0 mt-0 remixui_menuhr" style={{ pointerEvents: 'none' }} />
                <Dropdown.Item disabled style={{ fontSize: '0.85em', opacity: 0.8 }}>
                  <span className="d-flex align-items-center">
                    <i className={`${statusProps.icon}${statusProps.animate ? ' ' + statusProps.animate : ''} me-2`}
                      style={{ color: statusProps.color }} />
                    {activeSyncStatus.status === 'loading' && 'Loading workspace…'}
                    {activeSyncStatus.status === 'syncing' && 'Syncing to cloud…'}
                    {activeSyncStatus.status === 'idle' && activeSyncStatus.lastSync && `Synced ${new Date(activeSyncStatus.lastSync).toLocaleTimeString()}`}
                    {activeSyncStatus.status === 'idle' && !activeSyncStatus.lastSync && 'Cloud workspace'}
                    {activeSyncStatus.status === 'error' && `Sync error: ${activeSyncStatus.error || 'Unknown'}`}
                    {activeSyncStatus.pendingChanges > 0 && (
                      <span className="badge bg-warning ms-2">{activeSyncStatus.pendingChanges}</span>
                    )}
                  </span>
                </Dropdown.Item>
              </>
            )
          })()}

          {/* ── Cloud mode: migrate local workspaces button ── */}
          {isCloudMode && onMigrateToCloud && (
            <>
              <Dropdown.Divider className="border mb-0 mt-0 remixui_menuhr" style={{ pointerEvents: 'none' }} />
              <Dropdown.Item
                onClick={(e) => {
                  onMigrateToCloud()
                  setDropdownOpen(false)
                }}
                data-id="workspaceMigrateToCloud"
              >
                <span className="d-flex align-items-center">
                  <i className="fas fa-cloud-upload-alt me-2" style={{ color: 'var(--bs-info)' }}></i>
                  Migrate local workspaces to cloud
                </span>
              </Dropdown.Item>
            </>
          )}

          {/* ── Cloud mode: download backup snapshots ── */}
          {isCloudMode && (
            <>
              <Dropdown.Item
                onClick={(e) => {
                  setDropdownOpen(false)
                  global.modal(
                    'Download Cloud Snapshots',
                    <div>
                      <p className="mb-2">
                        <i className="fas fa-history me-2" style={{ color: 'var(--bs-warning)' }}></i>
                        <strong>What are these?</strong>
                      </p>
                      <p className="small mb-2">
                        Periodic snapshots are taken automatically while you work. They are <strong>not</strong> complete
                        backups — each one captures the workspace state at a single point in time, potentially
                        seconds to minutes behind your actual files.
                      </p>
                      <p className="small mb-2">
                        Snapshots expire after 7 days. This will download all available snapshots
                        as a single zip file you can inspect locally.
                      </p>
                      <p className="small text-muted mb-0">
                        <i className="fas fa-info-circle me-1"></i>
                        No changes will be made to your current workspace.
                      </p>
                    </div>,
                    'Download',
                    async () => {
                      try {
                        const count = await downloadBackupSnapshots()
                        if (count === 0) {
                          global.modal('No Snapshots', 'No backup snapshots were found for this workspace. Snapshots are created automatically after file changes and expire after 7 days.', 'OK', () => {})
                        }
                      } catch (err) {
                        global.modal('Download Failed', `Could not download snapshots: ${err.message || err}`, 'OK', () => {})
                      }
                    },
                    'Cancel'
                  )
                }}
                data-id="workspaceDownloadCloudSnapshots"
              >
                <span className="d-flex align-items-center">
                  <i className="fas fa-history me-2" style={{ color: 'var(--bs-warning)' }}></i>
                  Download cloud snapshots
                </span>
              </Dropdown.Item>
            </>
          )}

          {/* ── Legacy mode only: Backup, Restore, Localhost, Delete All ── */}
          {!isCloudMode && (
            <>
              <Dropdown.Divider className="border mb-0 mt-0 remixui_menuhr" style={{ pointerEvents: 'none' }} />
              <Dropdown.Item>
                <DesktopDownload style={{ color: '#D678FF' }} variant="span" trackingContext="dropdown" />
              </Dropdown.Item>
              <Dropdown.Item onClick={() => {
                downloadWorkspaces()
                setShowMain(false)
                setOpenSub(null)
              }}>
                <span className="pl-2" onClick={() => {
                  downloadWorkspaces()
                  setShowMain(false)
                  setOpenSub(null)
                }}>
                  <i className="far fa-download me-2"></i>
                  Backup
                </span>
              </Dropdown.Item>
              <Dropdown.Item onClick={() => {
                restoreBackup()
                setShowMain(false)
                setOpenSub(null)
              }}>
                <span className="pl-2" onClick={() => {
                  restoreBackup()
                  setShowMain(false)
                  setOpenSub(null)
                }}>
                  <i className="fas fa-upload me-2"></i>
                  Restore
                </span>
              </Dropdown.Item>
              <Dropdown.Divider />
              <Dropdown.Item onClick={() => {
                connectToLocalhost()
                setShowMain(false)
                setOpenSub(null)
              }}>
                <span className="pl-2" onClick={() => {
                  connectToLocalhost()
                  setShowMain(false)
                  setOpenSub(null)
                }}>
                  <i className="fas fa-desktop me-2"></i>
                  Connect to Localhost
                </span>
              </Dropdown.Item>
              <Dropdown.Item
                style={{
                  backgroundColor: 'transparent',
                  color: 'inherit',
                }}
              >
                <button className="w-100 btn btn-danger font-weight-light text-decoration-none" onClick={() => {
                  deleteAllWorkspaces()
                  setShowMain(false)
                  setOpenSub(null)
                }}>
                  <span className="pl-2 text-white" onClick={() => {
                    deleteAllWorkspaces()
                    setShowMain(false)
                    setOpenSub(null)
                  }}>
                    <i className="fas fa-trash-can me-2"></i>
                    Delete all Workspaces
                  </span>
                </button>
              </Dropdown.Item>
            </>
          )}
        </div>
      </Dropdown.Menu>
    </Dropdown>
  )
}
