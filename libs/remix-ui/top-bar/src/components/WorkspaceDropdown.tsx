/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import React, { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Button, ButtonGroup, Dropdown, Overlay } from 'react-bootstrap'
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

export const WorkspacesDropdown: React.FC<WorkspacesDropdownProps> = ({ menuItems, NO_WORKSPACE, switchWorkspace, CustomToggle, createWorkspace, downloadCurrentWorkspace, restoreBackup, deleteAllWorkspaces, setCurrentMenuItemName, setMenuItems, renameCurrentWorkspace, deleteCurrentWorkspace, downloadWorkspaces, connectToLocalhost, openTemplateExplorer, onMigrateToCloud }) => {
  const [showMain, setShowMain] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [openSubmenuId, setOpenSubmenuId] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const global = useContext(TopbarContext)
  const platform = useContext(platformContext)
  const iconRefs = useRef({})
  const [currentWorkingDir, setCurrentWorkingDir] = useState<string>('')

  // ── Cloud state (from singleton store — works across React trees) ──
  const cloudState = useCloudStore()
  const { isCloudMode, loading: cloudLoading, syncStatus, activeWorkspaceId, workspaceQueueBusy } = cloudState
  const activeSyncStatus = activeWorkspaceId ? syncStatus[activeWorkspaceId] : null
  const isWorkspaceLoading = activeSyncStatus?.status === 'loading' || activeSyncStatus?.status === 'syncing'
  const isDropdownLocked = isWorkspaceLoading || workspaceQueueBusy

  const toggleSubmenu = (id: number) => {
    setOpenSubmenuId((current) => (current === id ? null : id))
  }

  const [selectedWorkspace, setSelectedWorkspace] = useState<WorkspaceMetadata>({} as WorkspaceMetadata)
  const mainRef = useRef<HTMLDivElement>(null)
  const subRefs = useMemo(
    () => menuItems.map(() => React.createRef<HTMLDivElement>()),
    [menuItems]
  )
  const [togglerText, setTogglerText] = useState<string>(NO_WORKSPACE)

  const filteredItems = useMemo(() => {
    const deduped = menuItems.filter((item, idx, arr) => arr.findIndex(i => i.name === item.name) === idx)
    const q = searchQuery.trim().toLowerCase()
    return q ? deduped.filter(item => item.name.toLowerCase().includes(q)) : deduped
  }, [menuItems, searchQuery])

  // ── Refresh workspace list when cloud mode changes ──
  useEffect(() => {
    if (platform === appPlatformTypes.desktop) return
    ;(async () => {
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

      global.plugin.on('fs', 'workingDirChanged', (dir: string) => {
        setCurrentWorkingDir(dir)
        if (dir) {
          const dirName = path.basename(dir)
          setTogglerText(dirName || dir)
        } else {
          setTogglerText('No project open')
        }
      })

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
  })

  const openFolder = async () => {
    try {
      await global.plugin.call('fs', 'openFolderInSameWindow')
    } catch (error) {
      console.error('Error opening folder:', error)
    }
  }

  const handleDownloadSnapshots = () => {
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
          className="workspacesSelect btn btn-sm w-100 border position-relative"
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

  // Web dropdown
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
        className="workspacesSelect btn btn-sm w-100 border position-relative"
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
        className="p-2 fws-dropdown-menu"
        data-id="topbar-custom-dropdown-items"
        show={showMain}
        as="div"
      >
        {/* ── Search ── */}
        <div className="fws-search-wrap mb-2">
          <div className="input-group input-group-sm">
            <span className="input-group-text fws-search-icon border-end-0">
              <i className="fas fa-search" style={{ fontSize: '11px' }} />
            </span>
            <input
              type="text"
              className="form-control fws-search-input border-start-0"
              placeholder="Find a workspace…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onClick={e => e.stopPropagation()}
              autoComplete="off"
            />
          </div>
        </div>

        {/* ── Workspace list ── */}
        <div
          className="overflow-y-auto"
          style={{
            maxHeight: 200,
            opacity: isDropdownLocked ? 0.5 : 1,
            pointerEvents: isDropdownLocked ? 'none' : 'auto',
          }}
        >
          {filteredItems.map((item, idx) => {
            const id = idx + 1
            if (!iconRefs.current[id]) iconRefs.current[id] = { current: null }
            const isActive = item.name === togglerText
            return (
              <div key={id} className="d-flex align-items-center">
                <Dropdown.Item
                  className="d-flex align-items-center gap-2 rounded py-1 flex-grow-1 small"
                  style={isActive ? { backgroundColor: 'rgba(var(--bs-primary-rgb), 0.08)' } : undefined}
                  onMouseDown={(e) => {
                    if (isDropdownLocked) { e.preventDefault(); return }
                    setDropdownOpen(false)
                    switchWorkspace(item.name)
                    e.preventDefault()
                  }}
                  data-id={`dropdown-item-${item.name}`}
                >
                  <span
                    className={`fws-status ${item.remoteId ? 'fws-status--synced' : 'fws-status--local'}`}
                    title={item.remoteId ? 'Synced to cloud' : 'Local only'}
                  />
                  {item.isGitRepo && item.currentBranch && (
                    <i className="fas fa-code-branch text-body-secondary" style={{ fontSize: '10px', flexShrink: 0 }} />
                  )}
                  <span className="text-truncate flex-grow-1">{item.name}</span>
                  {isActive && (
                    <i className="fas fa-check flex-shrink-0" style={{ fontSize: '10px', color: 'var(--bs-primary)' }} />
                  )}
                </Dropdown.Item>

                <div className="d-flex align-items-center flex-shrink-0" id="submenu-activate-button">
                  <Button
                    ref={(el) => (iconRefs.current[id].current = el)}
                    variant="link"
                    className="p-0 ms-1 text-muted submenu-trigger"
                    aria-label={`More actions for ${item.name}`}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      toggleSubmenu(id)
                    }}
                    data-id="workspacesubMenuIcon"
                  >
                    <FiMoreVertical size={14} />
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
                    transition={false}
                    onHide={() => setOpenSubmenuId(null)}
                  >
                    <section
                      id={`submenu-${id}`}
                      style={{ minWidth: 160, zIndex: 9999, position: 'relative' }}
                      data-id="workspacesubMenuOverlay"
                    >
                      <div className="fws-submenu">
                        <Dropdown.Item
                          as="button"
                          className="d-flex align-items-center gap-2 px-2 py-1 rounded"
                          data-id="workspacesubMenuRename"
                          onClick={(e) => {
                            e.stopPropagation()
                            renameCurrentWorkspace(item.name)
                            setOpenSubmenuId(null)
                          }}
                        >
                          <i className="far fa-edit fws-action-icon text-body-secondary" />
                          <span>Rename</span>
                        </Dropdown.Item>
                        <Dropdown.Item
                          as="button"
                          className="d-flex align-items-center gap-2 px-2 py-1 rounded"
                          data-id="workspacesubMenuDownload"
                          onClick={(e) => {
                            e.stopPropagation()
                            downloadCurrentWorkspace()
                            setCurrentMenuItemName(item.name)
                            setOpenSubmenuId(null)
                          }}
                        >
                          <i className="fas fa-download fws-action-icon text-body-secondary" />
                          <span>Download</span>
                        </Dropdown.Item>
                        <Dropdown.Item
                          as="button"
                          className="fws-danger-item d-flex align-items-center gap-2 px-2 py-1 rounded text-danger"
                          data-id="workspacesubMenuDelete"
                          onClick={(e) => {
                            e.stopPropagation()
                            deleteCurrentWorkspace(item.name)
                            setOpenSubmenuId(null)
                          }}
                        >
                          <i className="fas fa-trash fws-action-icon" />
                          <span>Delete</span>
                        </Dropdown.Item>
                      </div>
                    </section>
                  </Overlay>
                </div>
              </div>
            )
          })}
          {filteredItems.length === 0 && (
            <div className="text-center text-body-secondary small py-2">
              {searchQuery ? `No workspaces match "${searchQuery}"` : 'No workspaces'}
            </div>
          )}
        </div>

        {/* ── Footer actions ── */}
        <div className="border-top mt-2 pt-1">
          <button
            className="dropdown-item d-flex align-items-center gap-2 small rounded py-2"
            data-id="workspacecreate"
            onClick={() => { openTemplateExplorer(); setDropdownOpen(false) }}
          >
            <i className="fas fa-plus text-body-secondary fws-action-icon" />
            <span>New workspace</span>
          </button>

          {/* ── Cloud mode: sync status ── */}
          {isCloudMode && activeSyncStatus && (() => {
            const sp = getSyncIconProps(activeSyncStatus)
            return (
              <>
                <div className="dropdown-divider my-1" />
                <div
                  className="dropdown-item d-flex align-items-center gap-2 small py-1 text-body-secondary"
                  style={{ pointerEvents: 'none', fontSize: '0.8em' }}
                >
                  <i
                    className={`${sp.icon}${sp.animate ? ' ' + sp.animate : ''} fws-action-icon`}
                    style={{ color: sp.color }}
                  />
                  <span>
                    {activeSyncStatus.status === 'loading' && 'Loading workspace…'}
                    {activeSyncStatus.status === 'syncing' && 'Syncing to cloud…'}
                    {activeSyncStatus.status === 'idle' && activeSyncStatus.lastSync && `Synced ${new Date(activeSyncStatus.lastSync).toLocaleTimeString()}`}
                    {activeSyncStatus.status === 'idle' && !activeSyncStatus.lastSync && 'Cloud workspace'}
                    {activeSyncStatus.status === 'error' && `Sync error: ${activeSyncStatus.error || 'Unknown'}`}
                  </span>
                  {activeSyncStatus.pendingChanges > 0 && (
                    <span className="badge bg-warning ms-auto">{activeSyncStatus.pendingChanges}</span>
                  )}
                </div>
              </>
            )
          })()}

          {/* ── Cloud mode: migrate local workspaces ── */}
          {isCloudMode && onMigrateToCloud && (
            <button
              className="dropdown-item d-flex align-items-center gap-2 small rounded py-2"
              onClick={() => { onMigrateToCloud(); setDropdownOpen(false) }}
              data-id="workspaceMigrateToCloud"
            >
              <i className="fas fa-cloud-upload-alt fws-action-icon" style={{ color: 'var(--bs-info)' }} />
              <span>Migrate to cloud</span>
            </button>
          )}

          {/* ── Cloud mode: download backup snapshots ── */}
          {isCloudMode && (
            <button
              className="dropdown-item d-flex align-items-center gap-2 small rounded py-2"
              onClick={handleDownloadSnapshots}
              data-id="workspaceDownloadCloudSnapshots"
            >
              <i className="fas fa-history fws-action-icon" style={{ color: 'var(--bs-warning)' }} />
              <span>Download cloud snapshots</span>
            </button>
          )}

          {/* ── Non-cloud mode: backup, restore, localhost, delete all ── */}
          {!isCloudMode && (
            <>
              <div className="dropdown-divider my-1" />
              <div className="dropdown-item fws-desktop-item small rounded py-2">
                <DesktopDownload style={{ color: 'var(--fws-desktop-color, #FF8478)' }} variant="span" trackingContext="dropdown" />
              </div>
              <button
                className="dropdown-item d-flex align-items-center gap-2 small rounded py-2"
                onClick={() => { downloadWorkspaces(); setDropdownOpen(false) }}
              >
                <i className="far fa-download text-body-secondary fws-action-icon" />
                <span>Backup</span>
              </button>
              <button
                className="dropdown-item d-flex align-items-center gap-2 small rounded py-2"
                onClick={() => { restoreBackup(); setDropdownOpen(false) }}
              >
                <i className="fas fa-upload text-body-secondary fws-action-icon" />
                <span>Restore</span>
              </button>
              <div className="dropdown-divider my-1" />
              <button
                className="dropdown-item d-flex align-items-center gap-2 small rounded py-2"
                onClick={() => { connectToLocalhost(); setDropdownOpen(false) }}
              >
                <i className="fas fa-desktop text-body-secondary fws-action-icon" />
                <span>Connect to Localhost</span>
              </button>
              <button
                className="dropdown-item fws-danger-item d-flex align-items-center gap-2 small rounded py-2 text-danger"
                onClick={() => { deleteAllWorkspaces(); setDropdownOpen(false) }}
              >
                <i className="fas fa-trash-can fws-action-icon" />
                <span>Delete all workspaces</span>
              </button>
            </>
          )}
        </div>
      </Dropdown.Menu>
    </Dropdown>
  )
}
