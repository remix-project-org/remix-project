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
      <label className="pl-2 text-red-600 dark:text-red-400" style={{ fontSize: '1.2rem' }}>
        <FormattedMessage id="home.scamAlert" />
      </label>
      <div className="py-2 ml-2 mb-1 self-end mb-2 flex border border-red-600 dark:border-red-400">
        <span className="self-center pl-4 mt-1">
          <i style={{ fontSize: 'xxx-large', fontWeight: 'lighter' }} className="pr-2 text-red-600 dark:text-red-400 far fa-exclamation-triangle"></i>
        </span>
        <div className="flex flex-col">
          {platform === appPlatformTypes.web && (
            <span className="pl-4 mt-1">
              <FormattedMessage id="home.scamAlertText" />
            </span>)}
          <span className="pl-4 mt-1">
            <FormattedMessage id="home.scamAlertText2" />:
            <a
              className="pl-2 remixui_home_text"
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
          <span className="pl-4 mt-1">
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
