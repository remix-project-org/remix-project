import React, { useContext, useRef, useState, useEffect } from 'react'
// @ts-ignore
import './remix-ui-home-tab.css'
import { ThemeContext, themes } from './themeContext'
import { appActionTypes, AppContext, useAuth } from '@remix-ui/app'
import { HomeTabEvent, MatomoEvent } from '@remix-api'
import { TrackingContext } from '@remix-ide/tracking'
import { FormattedMessage } from 'react-intl'
import { uploadFolderExcludingRootFolder } from '@remix-ui/workspace'

export interface RemixUiHomeTabProps {
  plugin: any
}

export const RemixUiHomeTab = (props: RemixUiHomeTabProps) => {
  const appContext = useContext(AppContext)
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)
  const { plugin } = props
  const uploadFileRef = useRef<HTMLInputElement>(null)
  const remiAudioRef = useRef<HTMLAudioElement>(null)

  const trackMatomoEvent = <T extends MatomoEvent = HomeTabEvent>(event: T) => {
    baseTrackEvent?.<T>(event)
  }

  const [state, setState] = useState<{ themeQuality: { filter: string; name: string } }>({
    themeQuality: themes.light
  })

  const { features } = useAuth()
  const hasAuditorPermission = features['ai:auditor']?.is_enabled === true
  const hasSkillsPermission = features['ai:skills']?.is_enabled === true

  useEffect(() => {
    plugin.call('theme', 'currentTheme').then((theme: any) => {
      setState((prev) => ({ ...prev, themeQuality: theme.quality === 'dark' ? themes.dark : themes.light }))
    })
    plugin.on('theme', 'themeChanged', (theme: any) => {
      setState((prev) => ({ ...prev, themeQuality: theme.quality === 'dark' ? themes.dark : themes.light }))
    })
  }, [])

  // ─── Start ───

  const openTemplateSelection = async () => {
    await plugin.call('templateexplorermodal', 'updateTemplateExplorerInFileMode', false)
    appContext.appStateDispatch({ type: appActionTypes.showGenericModal, payload: true })
    trackMatomoEvent({ category: 'hometab', action: 'filesSection', name: 'Create a new workspace', isClick: true })
  }

  const startCoding = async () => {
    plugin.verticalIcons.select('filePanel')
    const wName = 'Playground'
    const workspaces = await plugin.call('filePanel', 'getWorkspaces')
    let createFile = true
    if (!workspaces.find((workspace: any) => workspace.name === wName)) {
      await plugin.call('filePanel', 'createWorkspace', wName, 'playground')
      createFile = false
    }
    await plugin.call('filePanel', 'switchToWorkspace', { name: wName, isLocalHost: false })
    await plugin.call('filePanel', 'switchToWorkspace', { name: wName, isLocalHost: false })
    const content = `// SPDX-License-Identifier: MIT
pragma solidity >=0.6.12 <0.9.0;

contract HelloWorld {
  function print() public pure returns (string memory) {
    return "Hello World!";
  }
}`
    if (createFile) {
      const { newPath } = await plugin.call('fileManager', 'writeFileNoRewrite', '/contracts/HelloWorld.sol', content)
      await plugin.call('fileManager', 'open', newPath)
    } else {
      await plugin.call('fileManager', 'open', '/contracts/HelloWorld.sol')
    }
    trackMatomoEvent({ category: 'hometab', action: 'filesSection', name: 'startCoding', isClick: true })
  }

  // ─── Open ───

  const uploadFile = async (target: any) => {
    await plugin.call('menuicons', 'select', 'filePanel')
    await plugin.call('filePanel', 'uploadFile', target)
    trackMatomoEvent({ category: 'hometab', action: 'filesSection', name: 'uploadFile', isClick: true })
  }

  const cloneFromGitHub = async () => {
    await plugin.call('filePanel', 'clone')
    trackMatomoEvent({ category: 'hometab', action: 'filesSection', name: 'Git Clone', isClick: true })
  }

  const importFromGist = () => {
    plugin.call('gistHandler', 'load', '')
    plugin.verticalIcons.select('filePanel')
    trackMatomoEvent({ category: 'hometab', action: 'filesSection', name: 'importFromGist', isClick: true })
  }

  // ─── Learn ───

  const startLearnEth = async () => {
    if (await plugin.appManager.isActive('LearnEth')) {
      plugin.verticalIcons.select('LearnEth')
    } else {
      await plugin.appManager.activatePlugin(['LearnEth', 'solidity', 'solidityUnitTesting'])
      plugin.verticalIcons.select('LearnEth')
    }
    trackMatomoEvent({ category: 'hometab', action: 'header', name: 'Start Learning', isClick: true })
  }

  // ─── AI (gated) ───

  const openSkillsSelection = async () => {
    appContext.appStateDispatch({ type: appActionTypes.showSkillsModal, payload: true })
    trackMatomoEvent({ category: 'hometab', action: 'header', name: 'Explore Skills', isClick: true })
  }

  const openAuditsSelection = async () => {
    appContext.appStateDispatch({ type: appActionTypes.showChecklistModal, payload: true })
    trackMatomoEvent({ category: 'hometab', action: 'header', name: 'Explore Audits', isClick: true })
  }

  const startGasOptimization = async () => {
    await plugin.call('manager', 'activatePlugin', 'remixaiassistant')
    await plugin.call('menuicons', 'select', 'remixaiassistant')
    await plugin.call('remixaiassistant', 'newConversation')
    try {
      await plugin.call('skillsexplorermodal', 'loadSkill', 'coding-solidity-gas-optimization')
    } catch (e: any) {
      plugin.call('notification', 'toast', `Error loading Gas optimization skills ${e.message}`)
    }
    setTimeout(() => {
      plugin.call('remixaiassistant', 'chatPipe', `Start gas optimization checks. Use the skill solidity-gas-optimization for reference and propose me to go over some specific focussed areas instead of general checks. Ask me which contract file to optimize.`, true)
    })
  }

  return (
    <div className="ht-root d-flex flex-column w-100" data-id="remixUIHTAll">
      <ThemeContext.Provider value={state.themeQuality}>
        <div className="ht-layout">
          <div className="ht-panel">
            <div className="ht-header" >
              <a className="ht-logo-container" href="https://remix.live" target="_blank" rel="noreferrer">
                <audio id="remiAudio" muted={false} src="assets/audio/remiGuitar-single-power-chord-A-minor.mp3" ref={remiAudioRef}></audio>
                <div className="ht-logo" onClick={() => remiAudioRef.current?.play()} style={{ cursor: 'pointer' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 105 100" style={{ height: '22px' }}>
                    <path fill="currentColor" d="M91.84,35a.09.09,0,0,1-.1-.07,41,41,0,0,0-79.48,0,.09.09,0,0,1-.1.07C9.45,35,1,35.35,1,42.53c0,8.56,1,16,6,20.32,2.16,1.85,5.81,2.3,9.27,2.22a44.4,44.4,0,0,0,6.45-.68.09.09,0,0,0,.06-.15A34.81,34.81,0,0,1,17,45c0-.1,0-.21,0-.31a35,35,0,0,1,70,0c0,.1,0,.21,0,.31a34.81,34.81,0,0,1-5.78,19.24.09.09,0,0,0,.06.15,44.4,44.4,0,0,0,6.45.68c3.46.08,7.11-.37,9.27-2.22,5-4.27,6-11.76,6-20.32C103,35.35,94.55,35,91.84,35Z" />
                    <path fill="currentColor" d="M52,74,25.4,65.13a.1.1,0,0,0-.1.17L51.93,91.93a.1.1,0,0,0,.14,0L78.7,65.3a.1.1,0,0,0-.1-.17L52,74A.06.06,0,0,1,52,74Z" />
                    <path fill="currentColor" d="M75.68,46.9,82,45a.09.09,0,0,0,.08-.09,29.91,29.91,0,0,0-.87-6.94.11.11,0,0,0-.09-.08l-6.43-.58a.1.1,0,0,1-.06-.18l4.78-4.18a.13.13,0,0,0,0-.12,30.19,30.19,0,0,0-3.65-6.07.09.09,0,0,0-.11,0l-5.91,2a.1.1,0,0,1-.12-.14L72.19,23a.11.11,0,0,0,0-.12,29.86,29.86,0,0,0-5.84-4.13.09.09,0,0,0-.11,0l-4.47,4.13a.1.1,0,0,1-.17-.07l.09-6a.1.1,0,0,0-.07-.1,30.54,30.54,0,0,0-7-1.47.1.1,0,0,0-.1.07l-2.38,5.54a.1.1,0,0,1-.18,0l-2.37-5.54a.11.11,0,0,0-.11-.06,30,30,0,0,0-7,1.48.12.12,0,0,0-.07.1l.08,6.05a.09.09,0,0,1-.16.07L37.8,18.76a.11.11,0,0,0-.12,0,29.75,29.75,0,0,0-5.83,4.13.11.11,0,0,0,0,.12l2.59,5.6a.11.11,0,0,1-.13.14l-5.9-2a.11.11,0,0,0-.12,0,30.23,30.23,0,0,0-3.62,6.08.11.11,0,0,0,0,.12l4.79,4.19a.1.1,0,0,1-.06.17L23,37.91a.1.1,0,0,0-.09.07A29.9,29.9,0,0,0,22,44.92a.1.1,0,0,0,.07.1L28.4,47a.1.1,0,0,1,0,.18l-5.84,3.26a.16.16,0,0,0,0,.11,30.17,30.17,0,0,0,2.1,6.76c.32.71.67,1.4,1,2.08a.1.1,0,0,0,.06,0L52,68.16H52l26.34-8.78a.1.1,0,0,0,.06-.05,30.48,30.48,0,0,0,3.11-8.88.1.1,0,0,0-.05-.11l-5.83-3.26A.1.1,0,0,1,75.68,46.9Z" />
                  </svg>
                  <span className="ht-logo-wordmark">Remix</span>
                </div>
                <span className="ht-tagline">
                  <FormattedMessage id="home.projectTemplates" />{' '}
                  <span style={{ color: 'var(--ht-accent)' }}><FormattedMessage id="home.projectTemplates2" /></span>
                </span>
              </a>
            </div>

            {/* Start */}
            <div className="ht-section">
              <div className="ht-section-header">
                <span className="ht-section-title"><FormattedMessage id="home.start" defaultMessage="Start" /></span>
              </div>
              <button className="ht-row ht-row-cta" data-id="landingPageImportFromTemplate" onClick={openTemplateSelection}>
                <span className="ht-row-icon ht-row-icon-cta"><i className="fa-solid fa-plus"></i></span>
                <span className="ht-row-text">
                  <strong><FormattedMessage id="home.createNewWorkspace" /></strong>
                  <small>Start from a template</small>
                </span>
              </button>
              <button className="ht-cta-secondary" data-id="homeTabStartCoding" onClick={startCoding}>
                <span className="ht-cta-secondary-icon"><i className="fa-solid fa-play"></i></span>
                <span className="ht-cta-secondary-text">
                  <strong><FormattedMessage id="home.startCoding" defaultMessage="Start coding" /></strong>
                  <span>Open a blank Playground workspace</span>
                </span>
              </button>
              <button className="ht-cta-secondary" onClick={startLearnEth}>
                <span className="ht-cta-secondary-icon"><i className="fa-solid fa-book"></i></span>
                <span className="ht-cta-secondary-text">
                  <strong><FormattedMessage id="home.startLearning" /></strong>
                  <span>Interactive Solidity tutorial</span>
                </span>
              </button>
            </div>

            {/* Open */}
            <div className="ht-section">
              <div className="ht-section-header">
                <span className="ht-section-title"><FormattedMessage id="home.open" defaultMessage="Open" /></span>
              </div>
              <input
                id="ht-upload-input"
                ref={uploadFileRef}
                type="file"
                style={{ display: 'none' }}
                // @ts-ignore
                webkitdirectory=""
                onChange={async (e) => {
                  e.stopPropagation()
                  await plugin.call('menuicons', 'select', 'filePanel')
                  await uploadFolderExcludingRootFolder(e.target, '/')
                }}
              />
              <div className="ht-action-grid">
                <label className="ht-action-btn" htmlFor="ht-upload-input">
                  <i className="fa-solid fa-folder-open"></i>
                  <FormattedMessage id="home.openFolder" defaultMessage="Open Folder" />
                </label>
                <button className="ht-action-btn" data-id="landingPageImportFromGitHubButton" onClick={cloneFromGitHub}>
                  <i className="fa-brands fa-github"></i>
                  <FormattedMessage id="home.clone" />
                </button>
                <button className="ht-action-btn" data-id="landingPageImportFromGistButton" onClick={importFromGist}>
                  <i className="fa-brands fa-github-alt"></i>
                  <FormattedMessage id="home.gist" />
                </button>
              </div>
            </div>

            {/* Desktop download */}
            <div className="ht-section">
              <div className="ht-section-header">
                <span className="ht-section-title"><FormattedMessage id="home.desktop" defaultMessage="Desktop App" /></span>
              </div>
              <a className="ht-cta-secondary" href="https://remix.live/desktop" target="_blank" rel="noreferrer">
                <span className="ht-cta-secondary-icon"><i className="fa-solid fa-desktop"></i></span>
                <span className="ht-cta-secondary-text">
                  <strong><FormattedMessage id="home.downloadDesktop" defaultMessage="Download Remix Desktop" /></strong>
                  <span>Available for Windows, macOS and Linux</span>
                </span>
              </a>
            </div>

            {/* AI — gated */}
            {(hasSkillsPermission || hasAuditorPermission) && (
              <div className="ht-section">
                <div className="ht-section-header">
                  <span className="ht-section-title">AI</span>
                </div>
                {hasSkillsPermission && (
                  <button className="ht-row" style={{ border: '1px solid var(--bs-border-color)' }} data-id="landingPageLoadSkills" onClick={openSkillsSelection}>
                    <span className="ht-row-icon" style={{ color: 'var(--custom-ai-color)' }}><i className="fa-solid fa-cube"></i></span>
                    <span className="ht-row-text">
                      <strong><FormattedMessage id="home.loadSkills" /></strong>
                      <small>AI skill modules</small>
                    </span>
                  </button>
                )}
                {hasAuditorPermission && (
                  <>
                    <button className="ht-row" style={{ border: '1px solid var(--bs-border-color)' }} data-id="landingPageLoadAudits" onClick={openAuditsSelection}>
                      <span className="ht-row-icon" style={{ color: 'var(--custom-ai-color)' }}><i className="fa-solid fa-shield-halved"></i></span>
                      <span className="ht-row-text">
                        <strong><FormattedMessage id="home.loadAudits" /></strong>
                        <small>Security audit checklists</small>
                      </span>
                    </button>
                    <button className="ht-row" style={{ border: '1px solid var(--bs-border-color)' }} data-id="landingPageGasOptimization" onClick={startGasOptimization}>
                      <span className="ht-row-icon" style={{ color: 'var(--custom-ai-color)' }}><i className="fa-solid fa-gauge-high"></i></span>
                      <span className="ht-row-text">
                        <strong><FormattedMessage id="home.startGasOptimizationBtn" /></strong>
                        <small>Optimize gas usage</small>
                      </span>
                    </button>
                  </>
                )}
              </div>
            )}

          </div>

        </div>
      </ThemeContext.Provider>
    </div>
  )
}

export default RemixUiHomeTab