/* eslint-disable @typescript-eslint/no-unused-vars */
import { AppContext, appPlatformTypes, platformContext } from '@remix-ui/app'
import { HomeTabEvent, MatomoEvent } from '@remix-api'
import { TrackingContext } from '@remix-ide/tracking'
import React, { useContext } from 'react'
import { FormattedMessage } from 'react-intl'

function HomeTabScamAlert() {
  const platform = useContext(platformContext)
  const appContext = useContext(AppContext)
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)

  // Component-specific tracker with default HomeTabEvent type
  const trackMatomoEvent = <T extends MatomoEvent = HomeTabEvent>(event: T) => {
    baseTrackEvent?.<T>(event)
  }
  return (
    <div className="" id="hTScamAlertSection">
      <label className="ps-2 text-danger" style={{ fontSize: '1.2rem' }}>
        <FormattedMessage id="home.scamAlert" />
      </label>
      <div className="py-2 ms-2 mb-1 align-self-end mb-2 d-flex  border border-danger">
        <span className="align-self-center ps-4 mt-1">
          <i style={{ fontSize: 'xxx-large', fontWeight: 'lighter' }} className="pe-2 text-danger far fa-exclamation-triangle"></i>
        </span>
        <div className="d-flex flex-column">
          {platform === appPlatformTypes.web && (
            <span className="ps-4 mt-1">
              <FormattedMessage id="home.scamAlertText" />
            </span>)}
          <span className="ps-4 mt-1">
            <FormattedMessage id="home.scamAlertText2" />:
            <a
              className="ps-2 remixui_home_text"
              onClick={() => trackMatomoEvent({
                category: 'hometab',
                action: 'scamAlert',
                name: 'learnMore',
                isClick: true
              })}
              target="__blank"
              href="https://medium.com/remix-ide/remix-in-youtube-crypto-scams-71c338da32d"
            >
              <FormattedMessage id="home.learnMore" />
            </a>
          </span>
          <span className="ps-4 mt-1">
            <FormattedMessage id="home.scamAlertText3" />: &nbsp;
            <a
              className="remixui_home_text"
              onClick={() => trackMatomoEvent({
                category: 'hometab',
                action: 'scamAlert',
                name: 'safetyTips',
                isClick: true
              })}
              target="__blank"
              href="https://remix-ide.readthedocs.io/en/latest/security.html"
            >
              <FormattedMessage id="home.here" />
            </a>
          </span>
        </div>
      </div>
    </div>
  )
}

export default HomeTabScamAlert
