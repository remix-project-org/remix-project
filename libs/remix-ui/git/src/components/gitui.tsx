import React, { useEffect, useReducer, useState, useContext } from 'react'
import { add, addall, checkout, checkoutfile, clone, commit, createBranch, remoteBranches, repositories, rm, getCommitChanges, diff, resolveRef, getBranchCommits, setUpstreamRemote, loadGitHubUserFromToken, getBranches, getRemotes, remoteCommits, saveGitHubCredentials, getGitHubCredentialsFromLocalStorage, fetch, pull, push, setDefaultRemote, addRemote, removeRemote, sendToGitLog, clearGitLog, getBranchDifferences, getFileStatusMatrix, init, showAlert, gitlog, setStateGitLogCount } from '../lib/gitactions'
import { loadFiles, setCallBacks } from '../lib/listeners'
import { openDiff, openFile, openFolderInSameWindow, saveToken, setModifiedDecorator, setPlugin, setUntrackedDecorator, statusChanged, loginWithGitHub } from '../lib/pluginActions'
import { gitActionsContext, pluginActionsContext } from '../state/context'
import { gitReducer } from '../state/gitreducer'
import { TrackingContext } from '@remix-ide/tracking'
import { GitEvent, MatomoEvent } from '@remix-api'
import { IGitUi, defaultGitState, defaultLoaderState, gitMatomoEventTypes, gitState, gitUIPanels, loaderState } from '../types'
import { Accordion, Button } from "react-bootstrap";
import { CommitMessage } from './buttons/commitmessage'
import { Commits } from './panels/commits'
import { Branches } from './panels/branches'
import { SourceControlNavigation } from './navigation/sourcecontrol'
import { BranchesNavigation } from './navigation/branches'
import { CommitsNavigation } from './navigation/commits'
import '../style/index.css'
import { CloneNavigation } from './navigation/clone'
import { Clone } from './panels/clone'
import { Commands } from './panels/commands'
import { CommandsNavigation } from './navigation/commands'
import { RemotesNavigation } from './navigation/remotes'
import { Remotes } from './panels/remotes'
import { GitHubNavigation } from './navigation/github'
import { loaderReducer } from '../state/loaderReducer'
import { ConnectToGitHub } from './github/devicecode'
import { LogNavigation } from './navigation/log'
import LogViewer from './panels/log'
import { SourceControlBase } from './buttons/sourceControlBase'
import { BranchHeader } from './branchHeader'
import { SourceControl } from './panels/sourcontrol'
import { GitHubCredentials } from './panels/githubcredentials'
import { Setup } from './panels/setup'
import { Init } from './panels/init'
import { Disabled } from './disabled'
import { appActionTypes, AppContext, appPlatformTypes, platformContext } from '@remix-ui/app'
import { Version } from './panels/version'

export const gitPluginContext = React.createContext<gitState>(defaultGitState)
export const loaderContext = React.createContext<loaderState>(defaultLoaderState)

export const GitUI = (props: IGitUi) => {
  const plugin = props.plugin
  const [gitState, gitDispatch] = useReducer(gitReducer, defaultGitState)
  const [loaderState, loaderDispatch] = useReducer(loaderReducer, defaultLoaderState)
  const [activePanel, setActivePanel] = useState<string>("0")
  const [setup, setSetup] = useState<boolean>(false)
  const [needsInit, setNeedsInit] = useState<boolean>(true)
  const [appLoaded, setAppLoaded] = useState<boolean>(false)
  const appContext = useContext(AppContext)

  const platform = useContext(platformContext)
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)

  // Component-specific tracker with default GitEvent type
  const trackMatomoEvent = <T extends MatomoEvent = GitEvent>(event: T) => {
    baseTrackEvent?.<T>(event)
  }

  useEffect(() => {
    plugin.emit('statusChanged', {
      key: 'loading',
      type: 'info',
      title: 'Loading Git Plugin'
    })
    setTimeout(() => {
      setAppLoaded(true)
    }, 2000)
  }, [])

  useEffect(() => {
    if (!appLoaded) return
    setCallBacks(plugin, gitDispatch, appContext.appStateDispatch, loaderDispatch, setActivePanel, platform)
    setPlugin(plugin, gitDispatch, loaderDispatch)
    loaderDispatch({ type: 'plugin', payload: true })

  }, [appLoaded])

  useEffect(() => {
    if (!appLoaded) return
    gitlog(gitState.gitLogCount)
  }, [gitState.timestamp, gitState.gitLogCount])

  useEffect(() => {
    if (!appLoaded) return
    async function checkconfig() {

      const username = await plugin.call('settings', 'get', 'settings/github-user-name')
      const email = await plugin.call('settings', 'get', 'settings/github-email')
      const token = await plugin.call('settings', 'get', 'settings/gist-access-token')

      setSetup(!(username && email))
    }
    checkconfig()
  }, [gitState.gitHubAccessToken, gitState.gitHubUser, gitState.userEmails, gitState.commits, gitState.branches])

  useEffect(() => {
    if (!appLoaded) return
    async function setDecorators(gitState: gitState) {
      await plugin.call('fileDecorator', 'clearFileDecorators')
      await setModifiedDecorator(gitState.modified)
      await setUntrackedDecorator(gitState.untracked)
    }

    setTimeout(() => {
      setDecorators(gitState)
    })

  }, [gitState.fileStatusResult])

  useEffect(() => {
    if (!appLoaded) return
    async function updatestate() {

      if (gitState.currentBranch && gitState.currentBranch.remote && gitState.currentBranch.remote.url) {
        remoteCommits(gitState.currentBranch.remote.url, gitState.currentBranch.name, 1)
      }
    }
    setTimeout(() => {
      updatestate()
    })

    let needsInit = false
    if (!(gitState.currentBranch && gitState.currentBranch.name !== '') && (!gitState.currentHead || gitState.currentHead === '')) {
      needsInit = true
    }

    setNeedsInit(needsInit)
    appContext.appStateDispatch({ type: appActionTypes.setNeedsGitInit, payload: needsInit })
    appContext.appStateDispatch({ type: appActionTypes.setCurrentBranch, payload: gitState.currentBranch || null })

  }, [gitState.gitHubUser, gitState.currentBranch, gitState.remotes, gitState.gitHubAccessToken, gitState.currentHead])

  useEffect(() => {
    appContext.appStateDispatch({ type: appActionTypes.setCanUseGit, payload: gitState.canUseApp })
  },[gitState.canUseApp])

  useEffect(() => {
    const panelName = Object.keys(gitUIPanels)
      .filter(k => gitUIPanels[k] === activePanel);
    if (!(panelName && panelName[0])) return
    trackMatomoEvent({
      category: 'git',
      action: 'PANEL_NAVIGATION',
      name: panelName[0],
      isClick: true
    })
  }, [activePanel])

  const gitActionsProviderValue = {
    commit,
    addall,
    add,
    checkoutfile,
    rm,
    checkout,
    createBranch,
    clone,
    repositories,
    remoteBranches,
    getCommitChanges,
    getBranchCommits,
    getBranchDifferences,
    diff,
    resolveRef,
    setUpstreamRemote,
    loadGitHubUserFromToken,
    getBranches,
    getRemotes,
    fetch,
    pull,
    push,
    setDefaultRemote,
    addRemote,
    removeRemote,
    sendToGitLog,
    clearGitLog,
    getFileStatusMatrix,
    gitlog,
    init,
    setStateGitLogCount
  }

  const pluginActionsProviderValue = {
    statusChanged,
    loadFiles,
    openFile,
    openDiff,
    saveToken,
    saveGitHubCredentials,
    getGitHubCredentialsFromLocalStorage,
    showAlert,
    openFolderInSameWindow,
    loginWithGitHub
  }

  return (
    <>{(!gitState.canUseApp) ? <Disabled></Disabled> :
      <div className="px-3">
        <gitPluginContext.Provider value={gitState}>
          <loaderContext.Provider value={loaderState}>
            <gitActionsContext.Provider value={gitActionsProviderValue}>
              <pluginActionsContext.Provider value={pluginActionsProviderValue}>
                <BranchHeader />
                {setup ? <Setup callback={setActivePanel}></Setup> : null}
                <Accordion activeKey={activePanel} defaultActiveKey="0" className="">
                  {!setup && !needsInit ? <>
                    <SourceControlNavigation eventKey={gitUIPanels.SOURCECONTROL} activePanel={activePanel} callback={setActivePanel} />
                    <Accordion.Collapse className='bg-light' eventKey={gitUIPanels.SOURCECONTROL}>
                      <div className="px-2 py-2">
                        <SourceControlBase><CommitMessage /></SourceControlBase>
                        <SourceControl />
                      </div>
                    </Accordion.Collapse>
                    <hr></hr>
                    <CommandsNavigation eventKey={gitUIPanels.COMMANDS} activePanel={activePanel} callback={setActivePanel} />
                    <Accordion.Collapse className="bg-light" eventKey={gitUIPanels.COMMANDS}>
                      <div className="px-2 py-2">
                        <Commands></Commands>
                      </div>
                    </Accordion.Collapse>
                    <hr></hr>
                    <CommitsNavigation title={`COMMITS`} eventKey={gitUIPanels.COMMITS} activePanel={activePanel} callback={setActivePanel} showButtons={true} />
                    <Accordion.Collapse className='bg-light' eventKey={gitUIPanels.COMMITS}>
                      <div className="px-2 py-2">
                        <Commits />
                      </div>
                    </Accordion.Collapse>
                    <hr></hr>
                    <BranchesNavigation eventKey={gitUIPanels.BRANCHES} activePanel={activePanel} callback={setActivePanel} />
                    <Accordion.Collapse className='bg-light' eventKey={gitUIPanels.BRANCHES}>
                      <div className="px-2 py-2">
                        <Branches />
                      </div>
                    </Accordion.Collapse>
                    <hr></hr>
                    <RemotesNavigation eventKey={gitUIPanels.REMOTES} activePanel={activePanel} callback={setActivePanel} />
                    <Accordion.Collapse className='bg-light' eventKey={gitUIPanels.REMOTES}>
                      <div className="px-2 py-2">
                        <Remotes></Remotes>
                      </div>
                    </Accordion.Collapse>
                    <hr></hr>
                  </> : null}
                  {needsInit ? <>
                    <Init /></> : null}
                  <CloneNavigation eventKey={gitUIPanels.CLONE} activePanel={activePanel} callback={setActivePanel} />
                  <Accordion.Collapse className='bg-light' eventKey={gitUIPanels.CLONE}>
                    <div className="px-2 py-2">
                      <Clone /></div>
                  </Accordion.Collapse>
                  <hr></hr>

                  <GitHubNavigation eventKey={gitUIPanels.GITHUB} activePanel={activePanel} callback={setActivePanel} />
                  <Accordion.Collapse className='bg-light' eventKey={gitUIPanels.GITHUB}>
                    <div className="px-2 py-2">
                      <ConnectToGitHub></ConnectToGitHub>
                      <hr></hr>
                      <GitHubCredentials></GitHubCredentials>
                    </div>
                  </Accordion.Collapse>
                  <hr></hr>
                  <LogNavigation eventKey={gitUIPanels.LOG} activePanel={activePanel} callback={setActivePanel} />
                  <Accordion.Collapse className='bg-light' eventKey={gitUIPanels.LOG}>
                    <div className="px-2 py-2">
                      <LogViewer />
                    </div>
                  </Accordion.Collapse>
                </Accordion>
                { platform === appPlatformTypes.desktop &&
                <Version /> }
              </pluginActionsContext.Provider>
            </gitActionsContext.Provider>
          </loaderContext.Provider>
        </gitPluginContext.Provider>
      </div>}
    </>
  )
}
