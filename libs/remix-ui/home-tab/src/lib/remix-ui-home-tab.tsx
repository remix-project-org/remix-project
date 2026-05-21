import React, { useContext, useState, useEffect } from 'react'
import './remix-ui-home-tab.css'
import { ThemeContext, themes } from './themeContext'
import HomeTabTitle from './components/homeTabTitle'
import HomeTabRecentWorkspaces from './components/homeTabRecentWorkspaces'
import HomeTabRecentWorkspacesElectron from './components/homeTabRecentWorkspacesElectron'
import HomeTabScamAlert from './components/homeTabScamAlert'
import HomeTabFeaturedPlugins from './components/homeTabFeaturedPlugins'
import { appActionTypes, AppContext, appPlatformTypes, platformContext } from '@remix-ui/app'
import { HomeTabEvent, MatomoEvent } from '@remix-api'
import { TrackingContext } from '@remix-ide/tracking'
import { HomeTabFileElectron } from './components/homeTabFileElectron'
import HomeTabUpdates from './components/homeTabUpdates'
import { FormattedMessage, useIntl } from 'react-intl'
// import { desktopConnectionType } from '@remix-api'
import { desktopConnectionType } from '@remix-api'
import { CustomTooltip } from '@remix-ui/helper'

export interface RemixUiHomeTabProps {
  plugin: any
}

// --- Main Layout ---
export const RemixUiHomeTab = (props: RemixUiHomeTabProps) => {
  const intl = useIntl()
  const platform = useContext(platformContext)
  const appContext = useContext(AppContext)
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)
  const { plugin } = props

  // Component-specific tracker with default HomeTabEvent type
  const trackMatomoEvent = <T extends MatomoEvent = HomeTabEvent>(event: T) => {
    baseTrackEvent?.<T>(event)
  }

  const [state, setState] = useState<{
    themeQuality: { filter: string; name: string }
  }>({
    themeQuality: themes.light
  })

  const [isTerminalHidden, setIsTerminalHidden] = useState<boolean>(false)
  const [hasAuditorPermission, setHasAuditorPermission] = useState<boolean>(true)
  const [hasSkillsPermission, setHasSkillsPermission] = useState<boolean>(true)

  useEffect(() => {
    plugin.call('theme', 'currentTheme').then((theme) => {
      // update theme quality. To be used for for images
      setState((prevState) => {
        return {
          ...prevState,
          themeQuality: theme.quality === 'dark' ? themes.dark : themes.light
        }
      })
    })
    plugin.on('theme', 'themeChanged', (theme) => {
      // update theme quality. To be used for for images
      setState((prevState) => {
        return {
          ...prevState,
          themeQuality: theme.quality === 'dark' ? themes.dark : themes.light
        }
      })
    })

    // Listen to terminal panel visibility events
    plugin.call('terminal', 'isPanelHidden').then((hidden) => {
      setIsTerminalHidden(hidden)
    })
    plugin.on('terminal', 'terminalPanelShown', () => {
      setIsTerminalHidden(false)
    })
    plugin.on('terminal', 'terminalPanelHidden', () => {
      setIsTerminalHidden(true)
    })

    // Check permissions for AI features
    plugin.call('auth', 'hasPermission', 'ai:auditor').then((hasPermission) => {
      setHasAuditorPermission(hasPermission)
    }).catch(() => {
      setHasAuditorPermission(false)
    })

    plugin.call('auth', 'hasPermission', 'ai:skills').then((hasPermission) => {
      setHasSkillsPermission(hasPermission)
    }).catch(() => {
      setHasSkillsPermission(false)
    })
  }, [])

  const startLearnEth = async () => {
    if (await plugin.appManager.isActive('LearnEth')) {
      plugin.verticalIcons.select('LearnEth')
    } else {
      await plugin.appManager.activatePlugin(['LearnEth', 'solidity', 'solidityUnitTesting'])
      plugin.verticalIcons.select('LearnEth')
    }
    trackMatomoEvent({
      category: 'hometab',
      action: 'header',
      name: 'Start Learning',
      isClick: true
    })
  }

  const openTemplateSelection = async () => {
    await plugin.call('templateexplorermodal', 'updateTemplateExplorerInFileMode', false)
    appContext.appStateDispatch({
      type: appActionTypes.showGenericModal,
      payload: true
    })
    trackMatomoEvent({
      category: 'hometab',
      action: 'header',
      name: 'Create a new workspace',
      isClick: true
    })
  }

  const openSkillsSelection = async () => {
    appContext.appStateDispatch({
      type: appActionTypes.showSkillsModal,
      payload: true
    })
    trackMatomoEvent({
      category: 'hometab',
      action: 'header',
      name: 'Explore Skills',
      isClick: true
    })
  }

  const openAuditsSelection = async () => {
    appContext.appStateDispatch({
      type: appActionTypes.showChecklistModal,
      payload: true
    })
    trackMatomoEvent({
      category: 'hometab',
      action: 'header',
      name: 'Explore Audits',
      isClick: true
    })
  }

  const startAudit = async () => {
    await plugin.call('manager', 'activatePlugin', 'remixaiassistant')
    await plugin.call('menuicons', 'select', 'remixaiassistant')
    await plugin.call('remixaiassistant', 'newConversation')
    setTimeout(() => {
      plugin.call('remixaiassistant', 'chatPipe', `Start an audit of the contract. I am going to give you the actual file name.`)
    }, 200)
  }

  const startGasOptimization = async () => {
    await plugin.call('manager', 'activatePlugin', 'remixaiassistant')
    await plugin.call('menuicons', 'select', 'remixaiassistant')
    await plugin.call('remixaiassistant', 'newConversation')
    try {
      await plugin.call('notification', 'toast', 'Loading Gas optimization techniques skills')
      await plugin.call('skillsexplorermodal', 'loadSkill', 'coding-solidity-gas-optimization')
      plugin.call('notification', 'toast', 'Gas optimization techniques skills loaded')
    } catch (e: any) {
      plugin.call('notification', 'toast', `Error loading Gas optimization skills ${e.message}`)
    }
    setTimeout(() => {
      plugin.call('remixaiassistant', 'chatPipe', `Start gas optimization checks. I am going to give you the actual file name.`)
    })
  }

  // if (appContext.appState.connectedToDesktop != desktopConnectionType.disabled) {
  //   return (<></>)
  // }

  return (
    <div className="d-flex flex-column w-100" data-id="remixUIHTAll">
      <ThemeContext.Provider value={state.themeQuality}>
        <div className="container-fluid">
          <div className="row">
            <div className="d-flex w-100 m-3 justify-content-end">
              <CustomTooltip tooltipText="Start Learning">
                <button className="btn btn-secondary btn-md me-3" onClick={startLearnEth}><i className="fa-solid fa-book me-1"></i><FormattedMessage id="home.startLearning" /></button>
              </CustomTooltip>
              <CustomTooltip tooltipText="Create New Workspace">
                <button data-id="landingPageImportFromTemplate" className="btn btn-primary btn-md me-2" onClick={openTemplateSelection}><i className="fa-solid fa-plus me-1"></i><FormattedMessage id="home.createNewWorkspace" /></button>
              </CustomTooltip>
              <CustomTooltip tooltipText={hasSkillsPermission ? "Load Skills" : "Available in Starter plan"}>
                <div>
                  <button data-id="landingPageLoadSkills" className="btn btn-primary btn-md me-2" disabled={!hasSkillsPermission} onClick={openSkillsSelection}><i className="fa-solid fa-cube me-1"></i><FormattedMessage id="home.loadSkills" /></button>
                </div>
              </CustomTooltip>
              <CustomTooltip tooltipText={hasAuditorPermission ? intl.formatMessage({ id: 'home.selectCheckListAndStart' }) : intl.formatMessage({ id: 'home.availableInProPlan' })}>
                <div className="btn-group me-2" role="group">
                  <button data-id="landingPageLoadAudits" className="btn btn-primary btn-md" disabled={!hasAuditorPermission} onClick={openAuditsSelection}><i className="fa-solid fa-cube me-1"></i><FormattedMessage id="home.loadAudits" /></button>
                  <button data-id="landingPageLoadAuditsPlay" className="btn btn-primary btn-md" disabled={!hasAuditorPermission} style={{ borderLeft: '1px solid var(--bs-border-color, var(--bs-secondary))' }} onClick={startAudit}><i className="fa-solid fa-play me-1"></i></button>
                </div>
              </CustomTooltip>
              <CustomTooltip tooltipText={hasAuditorPermission ? intl.formatMessage({ id: 'home.startGasOptimization' }) : intl.formatMessage({ id: 'home.availableInProPlan' }) }>
                <div>
                  <button data-id="landingPageGasOptimization" className="btn btn-primary btn-md me-2" disabled={!hasAuditorPermission} onClick={startGasOptimization}><i className="fa-solid fa-cube me-1"></i><FormattedMessage id="home.startGasOptimizationBtn" /></button>
                </div>
              </CustomTooltip>
            </div>
            <div className="col-lg-8 col-xl-5 col-sm-12 mb-4">
              <HomeTabTitle />
              {!(platform === appPlatformTypes.desktop) ? <HomeTabRecentWorkspaces plugin={plugin} /> : <HomeTabRecentWorkspacesElectron plugin={plugin} />}
            </div>
            <div className="col-lg-4 col-xl-7 col-sm-12 overflow-y-scroll" style={{ overflow: 'hidden', height: isTerminalHidden ? '85vh' : '61vh' }}>
              <HomeTabUpdates plugin={plugin} />
              <HomeTabFeaturedPlugins plugin={plugin} />
            </div>
          </div>
        </div>
      </ThemeContext.Provider>
    </div>
  )
}

export default RemixUiHomeTab
