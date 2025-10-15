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
    plugin.on('filePanel', 'setWorkspace', async () => {
      let recents = JSON.parse(localStorage.getItem('recentWorkspaces'))

      if (!recents) {
        recents = []
      } else {
        const filtered = recents.filter((workspace) => workspace !== null)

        setState((prevState) => {
          return { ...prevState, recentWorkspaces: filtered.slice(0, filtered.length <= 3 ? filtered.length : 3) }
        })
      }
    })

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
    <div className="justify-content-start d-flex flex-column my-5" id="hTFileSection">
      <div className="d-flex flex-column mb-5 remixui_recentworkspace">
        <label style={{ fontSize: '1rem', color: isDark ? 'white' : 'black' }} className="mt-1 mb-3">
                Recent Workspaces
        </label>
        <div className="d-flex flex-column ps-2">
          {
            Array.isArray(state.recentWorkspaces) && state.recentWorkspaces.map((workspace: any, index) => {
              const workspaceName = (workspace || {}).name ? workspace.name : workspace
              const workspaceTimestamp = (workspace || {}).timestamp ? workspace.timestamp : null

              return index < 3 ? (
                <div key={index} className="d-flex flex-row align-items-center mb-2">
                  { loadingWorkspace === workspace ? <i className="fad fa-spinner fa-spin me-2"></i> : <i className="fas fa-folder-tree me-2"></i> }
                  <div className="d-flex flex-row justify-content-between w-100 flex-wrap">
                    <a className="cursor-pointer text-decoration-none d-inline-block" href="#" onClick={(e) => handleSwitchToRecentWorkspace(e, workspaceName)} key={index}>
                      <span style={{ color: isDark ? 'white' : 'black' }}>{workspaceName}</span>
                    </a>
                    <span className="text-muted">created {getTimeAgo(workspaceTimestamp)}</span>
                  </div>
                </div>
              ) : null
            })
          }
        </div>
      </div>
    </div>
  )
}

export default HomeTabRecentWorkspaces
