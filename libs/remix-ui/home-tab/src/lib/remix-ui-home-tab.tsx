import React, { useContext, useState, useEffect } from 'react'
import './remix-ui-home-tab.css'
import { ThemeContext, themes } from './themeContext'
import HomeTabTitle from './components/homeTabTitle'
import HomeTabRecentWorkspaces from './components/homeTabRecentWorkspaces'
import HomeTabScamAlert from './components/homeTabScamAlert'
import HomeTabFeaturedPlugins from './components/homeTabFeaturedPlugins'
import { AppContext, appPlatformTypes, platformContext } from '@remix-ui/app'
import { HomeTabEvent, MatomoEvent } from '@remix-api'
import { TrackingContext } from '@remix-ide/tracking'
import { HomeTabFileElectron } from './components/homeTabFileElectron'
import HomeTabUpdates from './components/homeTabUpdates'
import { FormattedMessage } from 'react-intl'
// import { desktopConnectionType } from '@remix-api'
import { desktopConnectionType } from '@remix-api'

export interface RemixUiHomeTabProps {
  plugin: any
}

// --- Main Layout ---
export const RemixUiHomeTab = (props: RemixUiHomeTabProps) => {
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
    await plugin.call('manager', 'activatePlugin', 'templateSelection')
    await plugin.call('tabs', 'focus', 'templateSelection')
    trackMatomoEvent({
      category: 'hometab',
      action: 'header',
      name: 'Create a new workspace',
      isClick: true
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
              <button className="btn btn-secondary btn-md me-3" onClick={startLearnEth}><i className="fa-solid fa-book me-1"></i><FormattedMessage id="home.startLearning" /></button>
              <button data-id="landingPageImportFromTemplate" className="btn btn-primary btn-md me-2" onClick={openTemplateSelection}><i className="fa-solid fa-plus me-1"></i><FormattedMessage id="home.createNewWorkspace" /></button>
            </div>
            <div className="col-lg-8 col-xl-5 col-sm-12 mb-4">
              <HomeTabTitle />
              <HomeTabRecentWorkspaces plugin={plugin} />
              {/* {!(platform === appPlatformTypes.desktop) ? <HomeTabFile plugin={plugin} /> : <HomeTabFileElectron plugin={plugin}></HomeTabFileElectron>} */}
            </div>
            <div className="col-lg-4 col-xl-7 col-sm-12" style={{ overflowY: 'auto', maxHeight: '61vh' }}>
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
