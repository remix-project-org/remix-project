/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useState, useRef, useReducer, useEffect, useContext } from 'react'
import { ThemeContext } from '../themeContext'
import { HomeTabEvent, MatomoEvent } from '@remix-api'
import { TrackingContext } from '@remix-ide/tracking'
import { getTimeAgo } from '@remix-ui/helper'

interface HomeTabFileProps {
  plugin: any
}

function HomeTabRecentWorkspaces({ plugin }: HomeTabFileProps) {
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)

  // Component-specific tracker with default HomeTabEvent type
  const trackMatomoEvent = <T extends MatomoEvent = HomeTabEvent>(event: T) => {
    baseTrackEvent?.<T>(event)
  }
  const [state, setState] = useState<{
    recentWorkspaces: Array<string | { name: string, timestamp: number }>
  }>({
    recentWorkspaces: [],
  })
  const [loadingWorkspace, setLoadingWorkspace] = useState<string>(null)
  const theme = useContext(ThemeContext)
  const isDark = theme.name === 'dark'

  useEffect(() => {
    let recents = JSON.parse(localStorage.getItem('recentWorkspaces'))
    if (!recents) {
      recents = []
    } else {
      const filtered = recents.filter((workspace) => workspace !== null)

      setState((prevState) => {
        return { ...prevState, recentWorkspaces: filtered.slice(0, filtered.length <= 10 ? filtered.length : 10) }
      })
    }

    const deleteSavedWorkspace = (name) => {
      const recents = JSON.parse(localStorage.getItem('recentWorkspaces'))
      let newRecents = recents
      if (!recents) {
        newRecents = []
      } else {
        newRecents = recents.filter((el) => (el || {}).name ? el.name !== name : el !== name)
        localStorage.setItem('recentWorkspaces', JSON.stringify(newRecents))
      }
      setState((prevState) => {
        return { ...prevState, recentWorkspaces: newRecents.slice(0, newRecents.length <= 3 ? newRecents.length : 3) }
      })
    }
    plugin.on('filePanel', 'workspaceDeleted', async (deletedName) => {
      deleteSavedWorkspace(deletedName)
    })
    return () => {
      try {
        plugin.off('filePanel', 'setWorkspace')
        plugin.off('filePanel', 'workspaceDeleted')
      } catch (e) {}
    }
  }, [plugin])

  const handleSwitchToRecentWorkspace = async (e, workspaceName) => {
    e.preventDefault()
    setLoadingWorkspace(workspaceName)
    plugin.call('sidePanel', 'showContent', 'filePanel')
    plugin.verticalIcons.select('filePanel')
    trackMatomoEvent({
      category: 'hometab',
      action: 'recentWorkspacesCard',
      name: 'loadRecentWorkspace',
      isClick: true
    })
    await plugin.call('filePanel', 'switchToWorkspace', { name: workspaceName, isLocalhost: false })
    const workspaceFiles = await plugin.call('fileManager', 'readdir', '/')

    if (workspaceFiles['contracts'] && workspaceFiles['contracts'].isDirectory) {
      const contractFiles = await plugin.call('fileManager', 'readdir', '/contracts')
      const contractFilesArray = Object.keys(contractFiles)
      const contractFile = contractFilesArray[0]

      !contractFiles[contractFile].isDirectory && await plugin.call('fileManager', 'open', contractFile)
    } else if (workspaceFiles['circuits'] && workspaceFiles['circuits'].isDirectory) {
      const circuitFiles = await plugin.call('fileManager', 'readdir', '/circuits')
      const circuitFilesArray = Object.keys(circuitFiles)
      const circuitFile = circuitFilesArray[0]

      !circuitFiles[circuitFile].isDirectory && await plugin.call('fileManager', 'open', circuitFile)
    } else if (workspaceFiles['src'] && workspaceFiles['src'].isDirectory) {
      const srcFiles = await plugin.call('fileManager', 'readdir', '/src')
      const srcFilesArray = Object.keys(srcFiles)
      const srcFile = srcFilesArray[0]

      !srcFiles[srcFile].isDirectory && await plugin.call('fileManager', 'open', srcFile)
    } else if (workspaceFiles['README.txt'] && !workspaceFiles['README.txt'].isDirectory) {
      await plugin.call('fileManager', 'open', '/README.txt')
    } else if (workspaceFiles['README.md'] && !workspaceFiles['README.md'].isDirectory) {
      await plugin.call('fileManager', 'open', '/README.md')
    }
    setLoadingWorkspace(null)
  }

  return (
    <div className="flex flex-col my-5" id="hTFileSection">
      <div className="flex flex-col mb-5">
        <h3 className="text-base font-semibold mb-4 text-gray-900 dark:text-white">
          Recent Workspaces
        </h3>
        <div className="space-y-1">
          {
            Array.isArray(state.recentWorkspaces) && state.recentWorkspaces.length > 0 ?
            state.recentWorkspaces.map((workspace: any, index) => {
              const workspaceName = (workspace || {}).name ? workspace.name : workspace
              const workspaceTimestamp = (workspace || {}).timestamp ? workspace.timestamp : null

              return index < 10 ? (
                <div key={index} className="flex items-center px-1 py-1 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-md transition-colors cursor-pointer group"
                     onClick={(e) => handleSwitchToRecentWorkspace(e, workspaceName)}>
                  <div className="flex-shrink-0 w-5 flex justify-center mr-3">
                    { loadingWorkspace === workspace ?
                      <i className="fad fa-spinner fa-spin text-blue-600 dark:text-blue-400"></i> :
                      <i className="fas fa-folder text-blue-600 dark:text-blue-400"></i>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-sm font-medium text-gray-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {workspaceName}
                      </h4>
                      {workspaceTimestamp && (
                        <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                          {getTimeAgo(workspaceTimestamp)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ) : null
            })
            : (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                <i className="fas fa-folder-open text-3xl mb-3 block"></i>
                <p className="text-sm">No recent workspaces</p>
              </div>
            )
          }
        </div>
      </div>
    </div>
  )
}

export default HomeTabRecentWorkspaces
