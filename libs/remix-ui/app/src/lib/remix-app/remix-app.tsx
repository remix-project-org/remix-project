/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import React, { useEffect, useReducer, useRef, useState } from 'react'
import './style/remix-app.css'
import 'libs/remix-ui/remix-ai-assistant/src/css/remix-ai-assistant.css'
import { RemixUIMainPanel } from '@remix-ui/panel'
import MatomoDialog from './components/modals/matomo'
import ManagePreferencesDialog from './components/modals/managePreferences'
import { OriginWarning } from './components/modals/origin-warning'
import DragBar from './components/dragbar/dragbar'
import { AppProvider } from './context/provider'
import { AuthProvider } from './context/auth-context'
import AppDialogs from './components/modals/dialogs'
import DialogViewPlugin from './components/modals/dialogViewPlugin'
import { appProviderContextType, onLineContext, platformContext } from './context/context'
import { IntlProvider } from 'react-intl'
import { appReducer } from './reducer/app'
import { appInitialState } from './state/app'
import isElectron from 'is-electron'
import { desktopConnectionType, AppConfig } from '@remix-api'
import { AIChatHistoryPanel } from './components/chatHistory/aiChatHistoryPanel'
import { appActionTypes } from './actions/app'
import { DesktopRedirectOverlay } from '@remix-ui/login'

interface IRemixAppUi {
  app: any
}

type AppConfigEntry = {
  key: string
  value: string | number | boolean | null
}

const normalizeAppConfig = (config: unknown): AppConfig => {
  if (!config) return {}

  if (Array.isArray(config)) {
    return (config as AppConfigEntry[]).reduce((acc, entry) => {
      if (entry && typeof entry.key === 'string') {
        acc[entry.key] = entry.value === null ? undefined : entry.value
      }
      return acc
    }, {} as AppConfig)
  }

  return config as AppConfig
}

const RemixApp = (props: IRemixAppUi) => {
  const [appReady, setAppReady] = useState<boolean>(false)
  const [showManagePreferencesDialog, setShowManagePreferencesDialog] = useState<boolean>(false)
  const [hideSidePanel, setHideSidePanel] = useState<boolean>(false)
  const [hidePinnedPanel, setHidePinnedPanel] = useState<boolean>(props.app.desktopClientMode || true)
  const [maximiseLeftTrigger, setMaximiseLeftTrigger] = useState<number>(0)
  const [enhanceLeftTrigger, setEnhanceLeftTrigger] = useState<number>(0)
  const [resetLeftTrigger, setResetLeftTrigger] = useState<number>(0)
  const [maximiseRightTrigger, setMaximiseRightTrigger] = useState<number>(0)
  const [enhanceRightTrigger, setEnhanceRightTrigger] = useState<number>(0)
  const [resetRightTrigger, setResetRightTrigger] = useState<number>(0)
  const [leftPanelCoeff, setLeftPanelCoeff] = useState<number>(undefined)
  const [rightPanelCoeff, setRightPanelCoeff] = useState<number>(undefined)
  const [themeTracker, setThemeTracker] = useState<{name: string, quality: string, backgroundColor: string, fillColor: string, shapeColor: string, textColor: string, url: string}>(null);
  const [showAiChatHistory, setShowAiChatHistory] = useState<boolean>(false)

  const [online, setOnline] = useState<boolean>(true)
  const [viewportSize, setViewportSize] = useState<{ width: number; height: number }>({
    width: window.innerWidth,
    height: window.innerHeight
  })
  const [locale, setLocale] = useState<{ code: string; messages: any }>({
    code: 'en',
    messages: {}
  })
  const [appConfig, setAppConfig] = useState<AppConfig>({})
  const sidePanelRef = useRef(null)
  const iconPanelRef = useRef<HTMLDivElement>(null)
  const pinnedPanelRef = useRef(null)
  const topBarRef = useRef<HTMLDivElement>(null)
  const [topBarHeight, setTopBarHeight] = useState<number>(0)
  const [appState, appStateDispatch] = useReducer(appReducer, {
    ...appInitialState,
    showPopupPanel: !window.localStorage.getItem('did_show_popup_panel') && !isElectron(),
    connectedToDesktop: props.app.desktopClientMode ? desktopConnectionType.disconnected : desktopConnectionType.disabled,
    genericModalState: {
      id: '',
      title: <div>Default Title</div>,
      message: <div>Default Message</div>,
      footer: <div>Default Footer</div>,
      okLabel: 'Default Ok Label',
      okFn: () => { },
      cancelLabel: 'Default Cancel Label',
      cancelFn: () => { },
      width: '720px',
      height: '720px',
      showModal: false
    },
    aiChatHistoryState: {
      showAiChatHistory: props.app.rightSidePanel.isMaximized,
      toggleIsAiChatMaximized: props.app.remixAiAssistant.isMaximized,
      closeAiChatHistory: props.app.remixAiAssistant.showHistorySidebar
    },
    showSkillsModal: false,
    showChecklistModal: false
  })
  const [isAiWorkspaceBeingGenerated, setIsAiWorkspaceBeingGenerated] = useState<boolean>(false)

  useEffect(() => {
    if (props.app.remixAiAssistant?.setAppStateDispatch) {
      props.app.remixAiAssistant.setAppStateDispatch(appStateDispatch)
    }
    if (props.app.skillExplorerModal?.setAppStateDispatch) {
      props.app.skillExplorerModal.setAppStateDispatch(appStateDispatch)
    }
    if (props.app.checklistExplorerModal?.setAppStateDispatch) {
      props.app.checklistExplorerModal.setAppStateDispatch(appStateDispatch)
    }
  }, [appStateDispatch, props.app.remixAiAssistant])

  useEffect(() => {
    if (props.app.params && props.app.params.activate && props.app.params.activate.split(',').includes('desktopClient')) {
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
  }, [appState.showPopupPanel])

  useEffect(() => {
    const onResize = () => {
      setViewportSize({
        width: window.innerWidth,
        height: window.innerHeight
      })
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
    }
  }, [])

  useEffect(() => {
    const el = topBarRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      setTopBarHeight(el.offsetHeight)
    })
    observer.observe(el)
    setTopBarHeight(el.offsetHeight)
    return () => observer.disconnect()
  }, [topBarRef.current])

  useEffect(() => {
    const theme = props.app.themeModule.currentTheme()
    setThemeTracker((prev) => ({ ...prev, ...theme }))
  }, [])

  useEffect(() => {
    // Define handler with stable reference
    const handleThemeChange = (event: any) => {
      setThemeTracker((prev) => {
        const newTheme = { ...prev, ...event.detail }
        return newTheme
      })
    }

    // Add listener with named function
    window.addEventListener('ideThemeChanged', handleThemeChange)

    // Remove the SAME function reference
    return () => {
      window.removeEventListener('ideThemeChanged', handleThemeChange)
    }
  }, [])

  useEffect(() => {
    const handler = (event: any) => {
      setShowAiChatHistory(event.detail.isMaximized)
    }
    window.addEventListener('rightSidePanelMaximized', handler)
    return () => {
      window.removeEventListener('rightSidePanelMaximized', handler)
    }
  }, [])

  useEffect(() => {
    const authPlugin = props.app?.authPlugin
    if (!authPlugin) return

    let isMounted = true
    let isBound = false
    let interval: number | null = null

    const handleAppConfigChanged = (rawConfig: unknown) => {
      if (!isMounted) return
      setAppConfig(normalizeAppConfig(rawConfig))
    }

    const bindAndFetch = async (): Promise<boolean> => {
      try {
        const isActive = await authPlugin.call('manager', 'isActive', 'auth')
        if (!isActive) return false

        if (!isBound) {
          authPlugin.on('auth', 'appConfigChanged', handleAppConfigChanged)
          isBound = true
        }

        const rawConfig = await authPlugin.call('auth', 'getAppConfig')
        handleAppConfigChanged(rawConfig)
        return true
      } catch {
        return false
      }
    }

    bindAndFetch().then((ready) => {
      if (ready || !isMounted) return

      interval = window.setInterval(async () => {
        const nowReady = await bindAndFetch()
        if (nowReady && interval) {
          window.clearInterval(interval)
          interval = null
        }
      }, 500)
    })

    return () => {
      isMounted = false
      if (interval) {
        window.clearInterval(interval)
      }
      try {
        authPlugin.off('auth', 'appConfigChanged')
      } catch {
        // ignore if plugin is already disposed
      }
    }
  }, [props.app])

  function setListeners() {
    if (!props.app.desktopClientMode) {
      // Listen to explicit panel state events instead of toggle
      props.app.sidePanel.events.on('leftSidePanelHidden', () => {
        setHideSidePanel(true)
      })
      props.app.sidePanel.events.on('leftSidePanelShown', () => {
        setHideSidePanel(false)
      })

      // Keep legacy event listeners for backward compatibility
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

      props.app.layout.event.on('maximisesidepanel', (coeff: number) => {
        setLeftPanelCoeff(coeff)
        setMaximiseLeftTrigger((prev) => {
          return prev + 1
        })
      })
    }

    props.app.layout.event.on('enhancesidepanel', (coeff: number) => {
      setLeftPanelCoeff(coeff)
      setEnhanceLeftTrigger((prev) => {
        return prev + 1
      })
    })

    props.app.layout.event.on('resetsidepanel', () => {
      setResetLeftTrigger((prev) => {
        return prev + 1
      })
    })

    props.app.layout.event.on('maximiseRightSidePanel', (coeff: number) => {
      setRightPanelCoeff(coeff)
      setMaximiseRightTrigger((prev) => {
        return prev + 1
      })
    })

    props.app.layout.event.on('enhanceRightSidePanel', (coeff: number) => {
      setRightPanelCoeff(coeff)
      setEnhanceRightTrigger((prev) => {
        return prev + 1
      })
    })

    props.app.layout.event.on('resetRightSidePanel', () => {
      setResetRightTrigger((prev) => {
        return prev + 1
      })
    })

    props.app.localeModule.events.on('localeChanged', (nextLocale) => {
      setLocale(nextLocale)
    })

    if (!props.app.desktopClientMode) {

      props.app.rightSidePanel.events.on('unPinnedPlugin', () => {
        setHidePinnedPanel(true)
      })

      props.app.rightSidePanel.events.on('pinnedPlugin', (profile, isHidden) => {
        if (!isHidden) setHidePinnedPanel(false)
      })

      props.app.rightSidePanel.events.on('rightSidePanelShown', () => {
        setHidePinnedPanel(false)
      })

      props.app.rightSidePanel.events.on('rightSidePanelHidden', () => {
        setHidePinnedPanel(true)
      })
    }

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
    appStateDispatch: appStateDispatch,
    isAiWorkspaceBeingGenerated: isAiWorkspaceBeingGenerated,
    setIsAiWorkspaceBeingGenerated: setIsAiWorkspaceBeingGenerated,
    appConfig
  }

  const showBetaTestRegisterWidget = appConfig['show_beta_test_register_widget'] !== false

  const iconPanelWidth = iconPanelRef.current?.offsetWidth ?? 50
  const sidePanelWidth = hideSidePanel ? 0 : ((sidePanelRef.current as HTMLDivElement | null)?.offsetWidth ?? 320)
  const verticalSpacing = Math.max(8, Math.round(viewportSize.height * 0.015))
  const horizontalSpacing = Math.max(8, Math.round(viewportSize.width * 0.01))
  const preferredChatWidth = Math.round(
    viewportSize.width * (viewportSize.width < 768 ? 0.86 : viewportSize.width < 1280 ? 0.3 : 0.24)
  )

  return (
    //@ts-ignore
    <IntlProvider locale={locale.code} messages={locale.messages}>
      <platformContext.Provider value={props.app.platform}>
        <onLineContext.Provider value={online}>
          <AuthProvider plugin={props.app.authPlugin}>
            <AppProvider value={value}>
              <DesktopRedirectOverlay />
              <MatomoDialog hide={!appReady} managePreferencesFn={() => setShowManagePreferencesDialog(true)}></MatomoDialog>
              {showManagePreferencesDialog && <ManagePreferencesDialog></ManagePreferencesDialog>}
              <div className="d-flex flex-column col-12 vh-100">
                <OriginWarning />
                {!props.app.desktopClientMode && (
                  <div ref={topBarRef} className='top-bar'>
                    {props.app.topBar.render()}
                  </div>
                )}
                <div className={`remixIDE ${appReady ? '' : 'd-none'}`} data-id="remixIDE">
                  <div ref={iconPanelRef} id="icon-panel" data-id="remixIdeIconPanel" className="custom_icon_panel iconpanel bg-light">
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
                    coeff={leftPanelCoeff}
                  ></DragBar>
                  <div id="main-panel" data-id="remixIdeMainPanel" className="mainpanel d-flex">
                    <RemixUIMainPanel layout={props.app.layout}></RemixUIMainPanel>
                  </div>
                  <div id="right-side-panel" ref={pinnedPanelRef} data-id="remixIdePinnedPanel" className={`flex-row-reverse pinnedpanel border-end border-start ${hidePinnedPanel || showAiChatHistory ? 'd-none' : 'd-flex'}`}>
                    {props.app.rightSidePanel.render()}
                  </div>
                  {showAiChatHistory && (
                    <div id="ai-chat-history-panel" data-id="remixIdeAiChatHistoryPanel" className="pinnedpanel border-end border-start d-flex" style={{ width: '350px', minWidth: '350px' }}>
                      <AIChatHistoryPanel plugin={props.app.remixAiAssistant} theme={themeTracker?.name} />
                    </div>
                  )}
                  {
                    !hidePinnedPanel && !showAiChatHistory &&
                    <DragBar
                      enhanceTrigger={enhanceRightTrigger}
                      resetTrigger={resetRightTrigger}
                      maximiseTrigger={maximiseRightTrigger}
                      minWidth={331}
                      refObject={pinnedPanelRef}
                      hidden={hidePinnedPanel}
                      setHideStatus={setHidePinnedPanel}
                      layoutPosition='right'
                      coeff={rightPanelCoeff}
                    ></DragBar>
                  }
                  <div>{props.app.hiddenPanel.render()}</div>
                </div>
                {/* <div>{props.app.popupPanel.render()}</div> */}
                {/* Overlay Panel - renders on top of everything */}
                <div>{props.app.overlayPanel.render()}</div>
                <div className="statusBar">
                  {props.app.statusBar.render()}
                </div>
              </div>
              <AppDialogs></AppDialogs>
              <DialogViewPlugin></DialogViewPlugin>
              {appState.genericModalState?.showModal && props.app.templateExplorerModal.render()
              }
              {appState.showSkillsModal && props.app.skillExplorerModal.render()}
              {appState.showChecklistModal && props.app.checklistExplorerModal.render()}
              {props.app.invitationManager.render()}
              {props.app.membershipRequest.render()}
              {showBetaTestRegisterWidget && props.app.betaCornerWidget.render()}
              {props.app.nudgePlugin && props.app.nudgePlugin.render()}
            </AppProvider>
          </AuthProvider>
        </onLineContext.Provider>
      </platformContext.Provider>
    </IntlProvider>
  )
}

export default RemixApp
