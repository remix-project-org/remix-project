import React, { useEffect, useReducer, useRef, useState } from 'react'
import './style/remix-app.css'
import { RemixUIMainPanel } from '@remix-ui/panel'
import MatomoDialog from './components/modals/matomo'
import ManagePreferencesDialog from './components/modals/managePreferences'
import OriginWarning from './components/modals/origin-warning'
import DragBar from './components/dragbar/dragbar'
import { AppProvider } from './context/provider'
import AppDialogs from './components/modals/dialogs'
import DialogViewPlugin from './components/modals/dialogViewPlugin'
import { appProviderContextType, onLineContext, platformContext } from './context/context'
import { IntlProvider } from 'react-intl'
import { appReducer } from './reducer/app'
import { appInitialState } from './state/app'
import isElectron from 'is-electron'
import { desktopConnectionType } from '@remix-api'

interface IRemixAppUi {
  app: any
}
const RemixApp = (props: IRemixAppUi) => {
  const [appReady, setAppReady] = useState<boolean>(false)
  const [showManagePreferencesDialog, setShowManagePreferencesDialog] = useState<boolean>(false)
  const [hideSidePanel, setHideSidePanel] = useState<boolean>(false)
  const [hidePinnedPanel, setHidePinnedPanel] = useState<boolean>(true)
  const [maximiseLeftTrigger, setMaximiseLeftTrigger] = useState<number>(0)
  const [enhanceLeftTrigger, setEnhanceLeftTrigger] = useState<number>(0)
  const [resetLeftTrigger, setResetLeftTrigger] = useState<number>(0)
  const [maximiseRightTrigger, setMaximiseRightTrigger] = useState<number>(0)
  const [enhanceRightTrigger, setEnhanceRightTrigger] = useState<number>(0)
  const [resetRightTrigger, setResetRightTrigger] = useState<number>(0)
  const [online, setOnline] = useState<boolean>(true)
  const [locale, setLocale] = useState<{ code: string; messages: any }>({
    code: 'en',
    messages: {}
  })
  const sidePanelRef = useRef(null)
  const pinnedPanelRef = useRef(null)

  const [appState, appStateDispatch] = useReducer(appReducer, {
    ...appInitialState,
    showPopupPanel: !window.localStorage.getItem('did_show_popup_panel') && !isElectron(),
    connectedToDesktop: props.app.desktopClientMode ? desktopConnectionType .disconnected : desktopConnectionType .disabled
  })

  useEffect(() => {
    if (props.app.params && props.app.params.activate && props.app.params.activate.split(',').includes('desktopClient')){
      setHideSidePanel(true)
    }
    async function activateApp() {
      props.app.themeModule.initTheme(() => {
        setAppReady(true)
        props.app.activate()
        setListeners()
      })
      setLocale(props.app.localeModule.currentLocale())
    }
    if (props.app) {
      activateApp()
    }
  }, [])

  useEffect(() => {
    if (!appState.showPopupPanel) {
      window.localStorage.setItem('did_show_popup_panel', 'true')
    }
  },[appState.showPopupPanel])

  function setListeners() {
    if (!props.app.desktopClientMode){
      props.app.sidePanel.events.on('toggle', () => {
        setHideSidePanel((prev) => {
          return !prev
        })
      })
      props.app.sidePanel.events.on('showing', () => {
        setHideSidePanel(false)
      })

      props.app.layout.event.on('minimizesidepanel', () => {
        // the 'showing' event always fires from sidepanel, so delay this a bit
        setTimeout(() => {
          setHideSidePanel(true)
        }, 1000)
      })

      props.app.layout.event.on('maximisesidepanel', () => {
        setMaximiseLeftTrigger((prev) => {
          return prev + 1
        })
      })
    }

    props.app.layout.event.on('enhancesidepanel', () => {
      setEnhanceLeftTrigger((prev) => {
        return prev + 1
      })
    })

    props.app.layout.event.on('resetsidepanel', () => {
      setResetLeftTrigger((prev) => {
        return prev + 1
      })
    })

    props.app.layout.event.on('maximisepinnedpanel', () => {
      setMaximiseRightTrigger((prev) => {
        return prev + 1
      })
    })

    props.app.layout.event.on('enhancepinnedpanel', () => {
      setEnhanceRightTrigger((prev) => {
        return prev + 1
      })
    })

    props.app.layout.event.on('resetpinnedpanel', () => {
      setResetRightTrigger((prev) => {
        return prev + 1
      })
    })

    props.app.localeModule.events.on('localeChanged', (nextLocale) => {
      setLocale(nextLocale)
    })

    props.app.pinnedPanel.events.on('pinnedPlugin', () => {
      setHidePinnedPanel(false)
    })

    props.app.pinnedPanel.events.on('unPinnedPlugin', () => {
      setHidePinnedPanel(true)
    })

    setInterval(() => {
      setOnline(window.navigator.onLine)
    }, 1000)
  }

  const value: appProviderContextType = {
    settings: props.app.settings,
    showMatomo: props.app.showMatomo,
    appManager: props.app.appManager,
    showEnter: props.app.showEnter,
    modal: props.app.notification,
    appState: appState,
    appStateDispatch: appStateDispatch
  }

  return (
    //@ts-ignore
    <IntlProvider locale={locale.code} messages={locale.messages}>
      <platformContext.Provider value={props.app.platform}>
        <onLineContext.Provider value={online}>
          <AppProvider value={value}>
            <OriginWarning></OriginWarning>
            <MatomoDialog hide={!appReady} managePreferencesFn={() => setShowManagePreferencesDialog(true)}></MatomoDialog>
            {showManagePreferencesDialog && <ManagePreferencesDialog></ManagePreferencesDialog>}
            <div className='d-flex flex-column'>
              <div className='top-bar'>
                {props.app.topBar.render()}
              </div>
              <div className={`remixIDE ${appReady ? '' : 'd-none'}`} data-id="remixIDE">
                <div id="icon-panel" data-id="remixIdeIconPanel" className="custom_icon_panel iconpanel bg-light">
                  {props.app.menuicons.render()}
                </div>
                <div
                  ref={sidePanelRef}
                  id="side-panel"
                  data-id="remixIdeSidePanel"
                  className={`sidepanel border-end border-start ${hideSidePanel ? 'd-none' : ''}`}
                >
                  {props.app.sidePanel.render()}
                </div>
                <DragBar
                  enhanceTrigger={enhanceLeftTrigger}
                  resetTrigger={resetLeftTrigger}
                  maximiseTrigger={maximiseLeftTrigger}
                  minWidth={305}
                  refObject={sidePanelRef}
                  hidden={hideSidePanel}
                  setHideStatus={setHideSidePanel}
                  layoutPosition='left'
                ></DragBar>
                <div id="main-panel" data-id="remixIdeMainPanel" className="mainpanel d-flex">
                  <RemixUIMainPanel layout={props.app.layout}></RemixUIMainPanel>
                </div>
                <div id="pinned-panel" ref={pinnedPanelRef} data-id="remixIdePinnedPanel" className={`flex-row-reverse pinnedpanel border-end border-start ${hidePinnedPanel ? 'd-none' : 'd-flex'}`}>
                  {props.app.pinnedPanel.render()}
                </div>
                {
                  !hidePinnedPanel &&
                  <DragBar
                    enhanceTrigger={enhanceRightTrigger}
                    resetTrigger={resetRightTrigger}
                    maximiseTrigger={maximiseRightTrigger}
                    minWidth={331}
                    refObject={pinnedPanelRef}
                    hidden={hidePinnedPanel}
                    setHideStatus={setHidePinnedPanel}
                    layoutPosition='right'
                  ></DragBar>
                }
                <div>{props.app.hiddenPanel.render()}</div>
              </div>
              {/* <div>{props.app.popupPanel.render()}</div> */}
              <div className="statusBar fixed-bottom">
                {props.app.statusBar.render()}
              </div>
            </div>
            <AppDialogs></AppDialogs>
            <DialogViewPlugin></DialogViewPlugin>
          </AppProvider>
        </onLineContext.Provider>
      </platformContext.Provider>
    </IntlProvider>
  )
}

export default RemixApp
