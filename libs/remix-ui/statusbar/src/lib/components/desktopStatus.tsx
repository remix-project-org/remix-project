import React, { useContext } from 'react'
import '../../css/statusbar.css'
import { CustomTooltip } from '@remix-ui/helper'
import { AppContext } from '@remix-ui/app'
import { desktopConnectionType } from '@remix-api'
import { FormattedMessage } from 'react-intl'

export const DesktopStatus = () => {
  const appContext = useContext(AppContext)

  return (
    <div className={`d-flex flex-row ps-3 small text-white justify-content-center align-items-center

      ${appContext.appState.connectedToDesktop === desktopConnectionType.connected ? 'bg-success' : ''}
      ${appContext.appState.connectedToDesktop === desktopConnectionType.alreadyConnected ? 'bg-danger' : ''}
      ${appContext.appState.connectedToDesktop === desktopConnectionType.disconnected ? 'bg-warning' : ''}

     w-100 h-100`}>
      {appContext.appState.connectedToDesktop === desktopConnectionType.connected ? (
        <>
          <span className="fas fa-plug me-1"></span>
          <span className=""><FormattedMessage id="statusbar.connectedToDesktop" /></span>
        </>
      ) : null}
      {appContext.appState.desktopClientConnected === desktopConnectionType.connected ? (
        <>
          <span className="text-success">
            <span className="fas fa-plug me-1"></span>
            <span className=""><FormattedMessage id="statusbar.connectedToBrowser" /></span>
          </span>
        </>
      ) : null}
      {appContext.appState.desktopClientConnected === desktopConnectionType.connectedToInjected ? (
        <>
          <span className="text-success">
            <span className="fas fa-plug me-1"></span>
            <span className=""><FormattedMessage id="statusbar.connectedToMetamask" /></span>
          </span>
        </>
      ) : null}
      {appContext.appState.connectedToDesktop === desktopConnectionType.alreadyConnected ? (
        <>
          <span><i className="fas fa-warning me-1"></i><FormattedMessage id="statusbar.alreadyConnectedError" /></span>
        </>
      ) : null}
      {appContext.appState.connectedToDesktop === desktopConnectionType.disconnected ? (
        <>
          <span className="fas fa-plug me-1"></span>
          <span className=""><FormattedMessage id="statusbar.waitingForDesktop" /></span>
        </>
      ) : null}
    </div>
  )
}
