import React, { useEffect, useState, useContext } from 'react'
import GitStatus from './components/gitStatus'
import AIStatus from './components/aiStatus'
import ScamAlertStatus from './components/scamAlertStatus'
import ScamDetails from './components/scamDetails'
import { FloatingFocusManager, autoUpdate, flip, offset, shift, size, useClick, useDismiss, useFloating, useInteractions, useRole } from '@floating-ui/react'
import axios from 'axios'
// eslint-disable-next-line @nrwl/nx/enforce-module-boundaries
import { StatusBar } from 'apps/remix-ide/src/app/components/status-bar'
import { StatusBarContextProvider } from '../contexts/statusbarcontext'
import DidYouKnow from './components/didYouKnow'
import { AppContext, appPlatformTypes, platformContext } from '@remix-ui/app'
import { DesktopStatus } from './components/desktopStatus'
import { desktopConnectionType } from '@remix-api'

export interface RemixUIStatusBarProps {
  statusBarPlugin: StatusBar
}

export type ScamAlert = {
  message: string
  url: string
}

export function RemixUIStatusBar({ statusBarPlugin }: RemixUIStatusBarProps) {
  const platform = useContext(platformContext)
  const [showScamDetails, setShowScamDetails] = useState(true)
  const [scamAlerts, setScamAlerts] = useState<ScamAlert[]>([])
  const [gitBranchName, setGitBranchName] = useState('')
  const [isAiActive, setIsAiActive] = useState(false)
  const [isTypeLoadingActive, setIsTypeLoadingActive] = useState(false)
  const { refs, context, floatingStyles } = useFloating({
    open: showScamDetails,
    onOpenChange: setShowScamDetails,
    middleware: [offset(10), flip({ fallbackAxisSideDirection: 'end' }), shift({
      mainAxis: true, padding: 10
    }), size({
      apply({ availableWidth, availableHeight, elements, ...state }) {
        Object.assign(elements.floating.style, {
          maxWidth: `${availableWidth}`,
          maxHeight: `auto`
        })
      }
    })],
    whileElementsMounted: autoUpdate,
  })
  const click = useClick(context)
  const dismiss = useDismiss(context)
  const role = useRole(context)
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss, role])
  const appContext = useContext(AppContext)

  useEffect(() => {
    const abortController = new AbortController()
    const signal = abortController.signal
    async function getScamAlerts() {
      const response = await axios.get('https://raw.githubusercontent.com/remix-project-org/remix-dynamics/main/ide/scam-alerts.json', { signal })
      if (signal.aborted) return
      setScamAlerts(response.data.alerts)
    }
    getScamAlerts()

    statusBarPlugin.on('editor', 'typesLoading' as any, (status: string) => {
      status === 'start' ? setIsTypeLoadingActive(true) : setIsTypeLoadingActive(false)
    })

    return () => {
      abortController.abort()
    }
  }, [])

  const lightAiUp = async () => {
    const aiActive = await statusBarPlugin.call('settings', 'get', 'settings/copilot/suggest/activate')
    if (!aiActive) return
    setIsAiActive(aiActive)
    return aiActive
  }

  if (platform !== appPlatformTypes.desktop && appContext.appState.connectedToDesktop !== desktopConnectionType.disabled) {
    return (<><div className="d-flex remixui_statusbar_height flex-row bg-warning justify-content-between align-items-center">
      <DesktopStatus /></div></>)
  }

  return (
    <>
      <StatusBarContextProvider>
        {(platform !== appPlatformTypes.desktop) && showScamDetails && (
          <FloatingFocusManager context={context} modal={false}>
            <ScamDetails
              refs={refs}
              floatStyle={{
                ...floatingStyles,
                minHeight: 'auto',
                alignContent: 'center',
                paddingRight: '0.5rem',
                bottom: '-8,5rem',
                left: '0rem'
              }}
              getFloatingProps={getFloatingProps}
              scamAlerts={scamAlerts}
            />
          </FloatingFocusManager>
        )}
        <div className="d-flex remixui_statusbar_height flex-row bg-info justify-content-between align-items-center">
          {(platform !== appPlatformTypes.desktop) && <div className="remixui_statusbar bg-warning px-2 remixui_statusbar_custom_padding d-flex justify-center align-items-center">
            <ScamAlertStatus refs={refs} getReferenceProps={getReferenceProps} />
          </div>}
          {(platform === appPlatformTypes.desktop) && <div className="remixui_statusbar">
            <DesktopStatus /></div>}

          <div className='d-flex w-100 justify-content-between'>
            <div className="remixui_statusbar remixui_statusbar_gitstatus">
              <GitStatus plugin={statusBarPlugin} gitBranchName={gitBranchName} setGitBranchName={setGitBranchName} />
            </div>
            {isTypeLoadingActive &&
              <div className="remixui_statusbar d-flex w-100 justify-content-start p-0 ms-3 text-white">
                <span className="spinner-border spinner-border-sm me-2" role="status">
                </span>
                <span className="">loading typescript types</span>
              </div>}
          </div>

          <div className="w-100 remixui_statusbar">
            <DidYouKnow />
          </div>

          <div className="remixui_statusbar d-flex w-100 justify-content-end p-0">

            <div className="remixui_statusbar" data-id="remixui_status_bottom_bar">
              <AIStatus plugin={statusBarPlugin} aiActive={lightAiUp} isAiActive={isAiActive} setIsAiActive={setIsAiActive} />
            </div>
          </div>
        </div>
      </StatusBarContextProvider>
    </>
  )
}
