/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import React, { useContext, useState, useEffect } from 'react'
import { Button, Dropdown } from 'react-bootstrap'
import { TopbarContext } from '../context/topbarContext'
import { appPlatformTypes, platformContext } from '@remix-ui/app'
import { CustomTooltip } from '@remix-ui/helper'
import path from 'path'

interface ElectronWorkspaceMenuProps {
  showMain: boolean
  setShowMain: (show: boolean) => void
  openFolder: () => Promise<void>
  createWorkspace: () => void
}

export const ElectronWorkspaceMenu: React.FC<ElectronWorkspaceMenuProps> = ({
  showMain,
  setShowMain,
  openFolder,
  createWorkspace
}) => {
  const [showAllRecent, setShowAllRecent] = useState(false)
  const global = useContext(TopbarContext)
  const platform = useContext(platformContext)

  // Get recent folders methods from context
  const { recentFolders, openRecentFolder, openRecentFolderInNewWindow, removeRecentFolder, revealRecentFolderInExplorer } = global || {}

  // Reset show all state when dropdown closes
  useEffect(() => {
    if (!showMain) {
      setShowAllRecent(false)
    }
  }, [showMain])

  // Only render on desktop platform
  if (platform !== appPlatformTypes.desktop) {
    return null
  }

  return (
    <Dropdown.Menu
      style={{ minWidth: '100%' }}
      className="px-2"
      data-id="topbar-custom-dropdown-items"
      show={showMain}
    >
      {/* Recent Folders Section */}
      {recentFolders && recentFolders.length > 0 && (
        <>
          <div className="px-2 py-1 small text-gray-500 dark:text-gray-400">
            Recent Folders
          </div>
          <div className="recent-folders-section" style={{ maxHeight: '200px', overflowY: 'auto' }}>
            {(showAllRecent ? recentFolders : recentFolders.slice(0, 8)).map((folder, index) => {
              const folderName = path.basename(folder)
              return (
                <div
                  key={index}
                  className="flex items-center mb-1 px-1 py-1 rounded"
                  style={{
                    cursor: 'pointer'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(0, 123, 255, 0.1)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                >
                  <div className="flex-grow-1 flex items-center">
                    <CustomTooltip
                      placement="top"
                      tooltipId="recent-folder-open-tooltip"
                      tooltipText={`Open ${folder}`}
                    >
                      <Button
                        variant="link"
                        className="flex-grow-1 flex items-center py-1 px-2 text-left truncate"
                        onClick={(e) => {
                          openRecentFolder(folder)
                          setShowMain(false)
                        }}
                        style={{
                          backgroundColor: 'transparent',
                          color: 'inherit',
                          textDecoration: 'none',
                          border: 'none',
                          boxShadow: 'none'
                        }}
                      >
                        <i className="fas fa-folder mr-2"></i>
                        <span className="truncate">{folderName}</span>
                      </Button>
                    </CustomTooltip>
                    <CustomTooltip
                      placement="top"
                      tooltipId="recent-folder-new-window-tooltip"
                      tooltipText="Open in new window"
                    >
                      <Button
                        variant="link"
                        size="sm"
                        className="p-1 ml-1 text-gray-500 dark:text-gray-400 opacity-75"
                        onClick={(e) => {
                          e.stopPropagation()
                          openRecentFolderInNewWindow(folder)
                          setShowMain(false)
                        }}
                        style={{ }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.opacity = '1'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.opacity = '0.75'
                        }}
                      >
                        <i className="fas fa-clone"></i>
                      </Button>
                    </CustomTooltip>
                    <CustomTooltip
                      placement="top"
                      tooltipId="recent-folder-reveal-tooltip"
                      tooltipText="Show in Folder"
                    >
                      <Button
                        variant="link"
                        size="sm"
                        className="p-1 ml-1 text-gray-500 dark:text-gray-400 opacity-75"
                        onClick={(e) => {
                          e.stopPropagation()
                          revealRecentFolderInExplorer(folder)
                        }}
                        style={{ }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.opacity = '1'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.opacity = '0.75'
                        }}
                      >
                        <i className="fas fa-eye"></i>
                      </Button>
                    </CustomTooltip>
                  </div>
                  <CustomTooltip
                    placement="top"
                    tooltipId="recent-folder-remove-tooltip"
                    tooltipText="Remove from recent"
                  >
                    <Button
                      variant="link"
                      size="sm"
                      className="p-1 ml-1 text-gray-500 dark:text-gray-400 opacity-50"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeRecentFolder(folder)
                      }}
                      style={{ }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.opacity = '1'
                        e.currentTarget.style.color = '#dc3545'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = '0.5'
                        e.currentTarget.style.color = ''
                      }}
                    >
                      <i className="fas fa-times"></i>
                    </Button>
                  </CustomTooltip>
                </div>
              )
            })}
            {recentFolders.length > 8 && !showAllRecent && (
              <div className="px-2 py-1 text-center">
                <Button
                  variant="link"
                  size="sm"
                  className="text-gray-500 dark:text-gray-400 p-1"
                  onClick={() => setShowAllRecent(true)}
                >
                  <small>Show {recentFolders.length - 8} more recent folder{recentFolders.length - 8 > 1 ? 's' : ''}</small>
                </Button>
              </div>
            )}
            {recentFolders.length > 8 && showAllRecent && (
              <div className="px-2 py-1 text-center">
                <Button
                  variant="link"
                  size="sm"
                  className="text-gray-500 dark:text-gray-400 p-1"
                  onClick={() => setShowAllRecent(false)}
                >
                  <small>Show less</small>
                </Button>
              </div>
            )}
          </div>
          <Dropdown.Divider className="border mb-2 mt-1" />
        </>
      )}

      <div className="d-grid gap-2">
        <Dropdown.Item
          data-id="workspaceOpenFolder"
          onClick={(e) => {
            openFolder()
            setShowMain(false)
          }}
          style={{
            backgroundColor: 'transparent',
            color: 'inherit',
          }}
        >
          <button className="w-full inline-flex items-center px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors font-weight-light no-underline mb-2 rounded-lg">
            <i className="fas fa-folder-open mr-2"></i>
            Open Folder
          </button>
        </Dropdown.Item>
        <Dropdown.Item
          data-id="workspacecreate"
          onClick={(e) => {
            createWorkspace()
            setShowMain(false)
          }}
          style={{
            backgroundColor: 'transparent',
            color: 'inherit',
          }}
        >
          <button className="w-full inline-flex items-center px-4 py-2 border border-primary text-primary rounded-md hover:bg-primary hover:text-white transition-colors font-weight-light no-underline mb-2 rounded-lg">
            <i className="fas fa-plus mr-2"></i>
            Create New Project
          </button>
        </Dropdown.Item>
      </div>
    </Dropdown.Menu>
  )
}
