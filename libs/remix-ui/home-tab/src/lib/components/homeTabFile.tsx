/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useState, useRef, useReducer, useEffect, useContext } from 'react'
import { FormattedMessage } from 'react-intl'
import {Toaster} from '@remix-ui/toaster' // eslint-disable-line
import { CustomTooltip } from '@remix-ui/helper'
import { TrackingContext } from '@remix-ide/tracking'
import { HomeTabEvent, MatomoEvent } from '@remix-api'

interface HomeTabFileProps {
  plugin: any
}

function HomeTabFile({ plugin }: HomeTabFileProps) {
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)

  // Component-specific tracker with default HomeTabEvent type
  const trackMatomoEvent = <T extends MatomoEvent = HomeTabEvent>(event: T) => {
    baseTrackEvent?.<T>(event)
  }
  const [state, setState] = useState<{
    searchInput: string
    showModalDialog: boolean
    modalInfo: {
      title: string
      loadItem: string
      examples: Array<string>
      prefix?: string
    }
    importSource: string
    toasterMsg: string
    recentWorkspaces: Array<string>
  }>({
    searchInput: '',
    showModalDialog: false,
    modalInfo: { title: '', loadItem: '', examples: [], prefix: '' },
    importSource: '',
    toasterMsg: '',
    recentWorkspaces: [],
  })

  useEffect(() => {
    plugin.on('filePanel', 'setWorkspace', async () => {
      let recents = JSON.parse(localStorage.getItem('recentWorkspaces'))

      if (!recents) {
        recents = []
      } else {
        const filtered = recents.filter((workspace) => {
          return workspace !== null
        })
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
        newRecents = recents.filter((el) => {
          return el !== name
        })
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

  const toast = (message: string) => {
    setState((prevState) => {
      return { ...prevState, toasterMsg: message }
    })
  }

  const startCoding = async () => {
    trackMatomoEvent({
      category: 'hometab',
      action: 'filesSection',
      name: 'startCoding',
      isClick: true
    })
    plugin.verticalIcons.select('filePanel')

    const wName = 'Playground'
    const workspaces = await plugin.call('filePanel', 'getWorkspaces')
    let createFile = true
    if (!workspaces.find((workspace) => workspace.name === wName)) {
      await plugin.call('filePanel', 'createWorkspace', wName, 'playground')
      createFile = false
    }
    await plugin.call('filePanel', 'switchToWorkspace', { name: wName, isLocalHost: false })
    await plugin.call('filePanel', 'switchToWorkspace', { name: wName, isLocalHost: false }) // calling once is not working.
    const content = `// SPDX-License-Identifier: MIT
        pragma solidity >=0.6.12 <0.9.0;

        contract HelloWorld {
          /**
           * @dev Prints Hello World string
           */
          function print() public pure returns (string memory) {
            return "Hello World!";
          }
        }
      `
    if (createFile) {
      const { newPath } = await plugin.call('fileManager', 'writeFileNoRewrite', '/contracts/HelloWorld.sol', content)
      await plugin.call('fileManager', 'open', newPath)
    } else {
      await plugin.call('fileManager', 'open', '/contracts/HelloWorld.sol')
    }
  }

  const uploadFile = async (target) => {
    trackMatomoEvent({
      category: 'hometab',
      action: 'filesSection',
      name: 'uploadFile',
      isClick: true
    })
    await plugin.call('filePanel', 'uploadFile', target)
  }

  const connectToLocalhost = () => {
    trackMatomoEvent({
      category: 'hometab',
      action: 'filesSection',
      name: 'connectToLocalhost',
      isClick: true
    })
    plugin.appManager.activatePlugin('remixd')
  }
  const importFromGist = () => {
    trackMatomoEvent({
      category: 'hometab',
      action: 'filesSection',
      name: 'importFromGist',
      isClick: true
    })
    plugin.call('gistHandler', 'load', '')
    plugin.verticalIcons.select('filePanel')
  }

  const handleSwitchToRecentWorkspace = async (e, workspaceName) => {
    e.preventDefault()
    plugin.call('sidePanel', 'showContent', 'filePanel')
    plugin.verticalIcons.select('filePanel')
    trackMatomoEvent({
      category: 'hometab',
      action: 'filesSection',
      name: 'loadRecentWorkspace',
      isClick: true
    })
    await plugin.call('filePanel', 'switchToWorkspace', { name: workspaceName, isLocalhost: false })
  }

  return (
    <>
      <Toaster message={state.toasterMsg} />
      <div className="justify-start p-2 flex flex-col" id="hTFileSection">
        <div className="mb-1">
          {(state.recentWorkspaces[0] || state.recentWorkspaces[1] || state.recentWorkspaces[2]) && (
            <div className="flex flex-col mb-5 remixui_recentworkspace">
              <label style={{ fontSize: '0.8rem' }} className="mt-1">
                <FormattedMessage id="home.recentWorkspaces" />
              </label>
              {state.recentWorkspaces[0] && state.recentWorkspaces[0] !== '' && (
                <a className="cursor-pointer mb-1 ml-2" href="#" onClick={(e) => handleSwitchToRecentWorkspace(e, state.recentWorkspaces[0])}>
                  {state.recentWorkspaces[0]}
                </a>
              )}
              {state.recentWorkspaces[1] && state.recentWorkspaces[1] !== '' && (
                <a className="cursor-pointer mb-1 ml-2" href="#" onClick={(e) => handleSwitchToRecentWorkspace(e, state.recentWorkspaces[1])}>
                  {state.recentWorkspaces[1]}
                </a>
              )}
              {state.recentWorkspaces[2] && state.recentWorkspaces[2] !== '' && (
                <a className="cursor-pointer ml-2" href="#" onClick={(e) => handleSwitchToRecentWorkspace(e, state.recentWorkspaces[2])}>
                  {state.recentWorkspaces[2]}
                </a>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-col flex-nowrap mt-4">
          <label style={{ fontSize: '1.2rem' }}>
            <FormattedMessage id="home.files" />
          </label>
          <div className="flex flex-row flex-wrap">
            <CustomTooltip placement={'top'} tooltipId="overlay-tooltip" tooltipClasses="whitespace-nowrap" tooltipText={<FormattedMessage id="home.newFileTooltip" />} tooltipTextClasses="border bg-light text-dark p-1 pr-3">
              <button className="px-4 py-2 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 whitespace-nowrap mr-2 border border-theme my-1 mb-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors" data-id="homeTabNewFile" style={{ width: 'fit-content' }} onClick={async () => {
                trackMatomoEvent({
                  category: 'hometab',
                  action: 'filesSection',
                  name: 'newFile',
                  isClick: true
                })
                await plugin.call('menuicons', 'select', 'filePanel')
                await plugin.call('filePanel', 'createNewFile')
              }}>
                <i className="far fa-file pl-1 pr-2"></i>
                <FormattedMessage id="home.newFile" />
              </button>
            </CustomTooltip>
            <CustomTooltip placement={'top'} tooltipId="overlay-tooltip" tooltipClasses="whitespace-nowrap" tooltipText={<FormattedMessage id="home.openFileTooltip" />} tooltipTextClasses="border bg-light text-dark p-1 pr-3">
              <span>
                <label className="px-4 py-2 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 whitespace-nowrap mr-2 border border-theme my-1 mb-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer inline-block" style={{ width: 'fit-content' }} htmlFor="openFileInput">
                  <i className="far fa-upload pl-1 pr-2"></i>
                  <FormattedMessage id="home.openFile" />
                </label>
                <input
                  type="file"
                  id="openFileInput"
                  onChange={async (event) => {
                    event.stopPropagation()
                    await plugin.call('menuicons', 'select', 'filePanel')
                    uploadFile(event.target)
                  }}
                  multiple
                />
              </span>
            </CustomTooltip>
            <CustomTooltip placement={'top'} tooltipId="overlay-tooltip" tooltipClasses="whitespace-nowrap" tooltipText={<FormattedMessage id="home.gistTooltip" />} tooltipTextClasses="border bg-light text-dark p-1 pr-3"
            >
              <button className="px-4 py-2 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 whitespace-nowrap mr-2 border border-theme my-1 mb-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors" data-id="landingPageImportFromGistButton" onClick={() => importFromGist()}>
                <i className="fab fa-github pl-1 pr-2"></i>
                <FormattedMessage id="home.gist" />
              </button>
            </CustomTooltip>
            <CustomTooltip placement={'top'} tooltipId="overlay-tooltip" tooltipClasses="whitespace-nowrap" tooltipText={<FormattedMessage id="home.gitCloneTooltip" />} tooltipTextClasses="border bg-light text-dark p-1 pr-3"
            >
              <button className="px-4 py-2 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 whitespace-nowrap mr-2 border border-theme my-1 mb-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors" data-id="landingPageImportFromGitHubButton" onClick={async () => {
                trackMatomoEvent({
                  category: 'hometab',
                  action: 'filesSection',
                  name: 'Git Clone',
                  isClick: true
                })
                await plugin.call('filePanel', 'clone')
              }}>
                <i className="fa-brands fa-github-alt pl-1 pr-2"></i>
                <FormattedMessage id="home.clone" />
              </button>
            </CustomTooltip>
            <CustomTooltip placement={'top'} tooltipId="overlay-tooltip" tooltipClasses="whitespace-nowrap" tooltipText={<FormattedMessage id="home.connectToLocalhost" />} tooltipTextClasses="border bg-light text-dark p-1 pr-3">
              <button className="px-4 py-2 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 whitespace-nowrap border border-theme my-1 mb-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors" onClick={() => connectToLocalhost()}>
                <i className="fa-regular fa-desktop pr-2"></i>
                <FormattedMessage id="home.accessFileSystem" />
              </button>
            </CustomTooltip>
          </div>
        </div>
      </div>
    </>
  )
}

export default HomeTabFile
