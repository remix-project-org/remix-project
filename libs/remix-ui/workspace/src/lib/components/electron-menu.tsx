import React, { MouseEventHandler, useContext, useEffect, useState } from "react"
import { FileSystemContext } from "../contexts"
import { appPlatformTypes, platformContext } from '@remix-ui/app'
import { FormattedMessage, useIntl } from "react-intl"
import '../css/electron-menu.css'
import { CustomTooltip } from '@remix-ui/helper'

export const ElectronMenu = (props: {
  clone: () => void,
  createWorkspace: () => void,
 }) => {
  const platform = useContext(platformContext)
  const global = useContext(FileSystemContext)
  const intl = useIntl()

  useEffect(() => {
    if (platform === appPlatformTypes.desktop) {
      global.dispatchGetElectronRecentFolders()
    }
  }, [])

  const openFolderElectron = async (path: string) => {
    global.dispatchOpenElectronFolder(path)
  }

  const lastFolderName = (path: string) => {
    const pathArray = path.split('/')
    return pathArray[pathArray.length - 1]
  }

  return (
    (platform !== appPlatformTypes.desktop) ? null :
      (global.fs.browser.isSuccessfulWorkspace ? null :
        <div className="p-3 flex flex-col h-full">
          <div>
            <div data-id="openFolderButton" onClick={async () => { await openFolderElectron(null) }} className='inline-flex items-center px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors mb-2 w-full'><FormattedMessage id="electron.openFolder" /></div>
            <div data-id="createWorkspaceButton" onClick={async () => { await props.createWorkspace() }} className='inline-flex items-center px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors mb-2 w-full'><FormattedMessage id="electron.createProject" /></div>
            <div data-id="cloneFromGitButton" onClick={async () => { props.clone() }} className='inline-flex items-center px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors mb-3 w-full'><FormattedMessage id="electron.gitClone" /></div>
          </div>

          {global.fs.browser.recentFolders.length > 0 ?
            <div className="border-t pt-3 flex flex-col flex-1 recent-folders-section">
              <div className="recent-folders-label mb-2 font-bold uppercase">
                <FormattedMessage id="electron.recentFolders" />
              </div>
              <ul className="recent-folders-list gap-2">
                {global.fs.browser.recentFolders.map((folder, index) => {
                  return <li key={index}>
                    <div className="recentfolder p-2">
                      <div className="recentfolder_header mb-1">
                        <div className="recentfolder_content" onClick={async () => { await openFolderElectron(folder) }}>
                          <div className="recentfolder_name fw-semibold">{lastFolderName(folder)}</div>
                          <CustomTooltip
                            tooltipText={folder}
                            tooltipId={`electron-recent-folder-path-${index}`}
                            placement='bottom'
                          >
                            <div className="recentfolder_path text-gray-500 dark:text-gray-400 small" data-id={`recent_folder_${folder}`}>{folder}</div>
                          </CustomTooltip>
                        </div>

                        <div className="recentfolder_actions gap-1">
                          <CustomTooltip tooltipText={intl.formatMessage({ id: 'filePanel.openInNewWindow' })} placement="top">
                            <div
                              className="recentfolder_action new-window p-1"
                              onClick={async () => {
                                await global.dispatchOpenElectronFolderInNewWindow(folder)
                              }}
                            >
                              <i className="fas fa-clone" />
                            </div>
                          </CustomTooltip>

                          <CustomTooltip tooltipText={intl.formatMessage({ id: 'filePanel.showInFolder' })} placement="top">
                            <div
                              className="recentfolder_action show-folder p-1"
                              onClick={async () => {
                                await global.dispatchRevealElectronFolderInExplorer(folder)
                              }}
                            >
                              <i className="fas fa-eye" />
                            </div>
                          </CustomTooltip>

                          <CustomTooltip tooltipText={intl.formatMessage({ id: 'filePanel.removeFromRecent' })} placement="top">
                            <div
                              className="recentfolder_action remove p-1"
                              onClick={() => {
                                global.dispatchRemoveRecentFolder(folder)
                              }}
                            >
                              <i className="fas fa-times" />
                            </div>
                          </CustomTooltip>
                        </div>
                      </div>
                    </div>
                  </li>
                })}
              </ul>
            </div>
            : null}
        </div>
      )
  )
}