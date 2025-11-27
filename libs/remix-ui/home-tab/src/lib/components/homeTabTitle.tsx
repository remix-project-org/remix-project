/* eslint-disable @typescript-eslint/no-unused-vars */
// eslint-disable-next-line @nrwl/nx/enforce-module-boundaries
import React, { useRef, useContext } from 'react'
import { FormattedMessage } from 'react-intl'
import { CustomTooltip } from '@remix-ui/helper'
import { ThemeContext } from '../themeContext'
import { TrackingContext } from '@remix-ide/tracking'
import { HomeTabEvent, MatomoEvent } from '@remix-api'
import { Placement } from 'react-bootstrap/esm/types'
import { DesktopDownload } from 'libs/remix-ui/desktop-download' // eslint-disable-line @nrwl/nx/enforce-module-boundaries

type HometabIconSection = {
  textToolip: JSX.Element
  urlLink: string
  iconClass: 'fa-youtube'|'fa-x-twitter'|'fa-linkedin'|'fa-medium'|'fa-discord'
  placement: Placement
  matomoTrackingEntry: string[]
}

const iconButtons: HometabIconSection[] = [
  {
    textToolip: <FormattedMessage id="home.remixYoutubePlaylist" />,
    matomoTrackingEntry: ['trackEvent', 'hometab', 'titleCard', 'youtube'],
    urlLink: 'https://www.youtube.com/channel/UCjTUPyFEr2xDGN6Cg8nKDaA',
    iconClass: 'fa-youtube',
    placement: 'top'
  },
  {
    textToolip: <FormattedMessage id="home.remixTwitterProfile" />,
    matomoTrackingEntry: ['trackEvent', 'hometab', 'titleCard', 'twitter'],
    urlLink: 'https://x.com/EthereumRemix',
    iconClass: 'fa-x-twitter',
    placement: 'top'
  },
  {
    textToolip: <FormattedMessage id="home.remixLinkedinProfile" />,
    matomoTrackingEntry: ['trackEvent', 'hometab', 'titleCard', 'linkedin'],
    urlLink: 'https://www.linkedin.com/company/ethereum-remix/',
    iconClass: 'fa-linkedin',
    placement: 'top'
  },
  {
    textToolip: <FormattedMessage id="home.remixMediumPosts" />,
    matomoTrackingEntry: ['trackEvent', 'hometab', 'titleCard', 'medium'],
    urlLink: 'https://medium.com/remix-ide',
    iconClass: 'fa-medium',
    placement: 'top'
  },
  {
    textToolip: <FormattedMessage id="home.joinUsOnDiscord" />,
    matomoTrackingEntry: ['trackEvent', 'hometab', 'titleCard', 'discord'],
    urlLink: 'https://discord.gg/snsrYVU4Q7',
    iconClass: 'fa-discord',
    placement: 'top'
  }
]

function HomeTabTitle() {
  const remiAudioEl = useRef(null)
  const theme = useContext(ThemeContext)
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)
  const isDark = theme.name === 'dark'

  // Component-specific tracker with default HomeTabEvent type
  const trackMatomoEvent = <T extends MatomoEvent = HomeTabEvent>(event: T) => {
    baseTrackEvent?.<T>(event)
  }

  const playRemi = async () => {
    remiAudioEl.current.play()
    trackMatomoEvent({
      category: 'hometab',
      action: 'titleCard',
      name: 'remiAudio',
      isClick: true
    })
  }

  const openLink = (url = '') => {
    window.open(url, '_blank')
  }

  return (
    <div className="card mb-3 p-5 rounded overflow-hidden border">
      <img src="assets/img/remix-link-illustration.svg" className="home-tab-banner" alt="Remix Logo" style={{ position: 'absolute', top: '-200px', left: '125px', width: 400, height: 400, zIndex: 0 }} />
      <div style={{ backgroundColor: 'var(--bs-body-bg)', opacity: 0.8, position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1 }}></div>
      <div style={{ zIndex: 2 }}>
        <div className="mb-0 d-flex align-items-center">
          <div className="ms-2 d-flex">
            <div onClick={() => playRemi()}>
              <svg id="Ebene_2" data-name="Ebene 2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 105 100" style={{ height: '40px' }}>
                <path fill={`${isDark ? 'white' : 'black'}`} d="M91.84,35a.09.09,0,0,1-.1-.07,41,41,0,0,0-79.48,0,.09.09,0,0,1-.1.07C9.45,35,1,35.35,1,42.53c0,8.56,1,16,6,20.32,2.16,1.85,5.81,2.3,9.27,2.22a44.4,44.4,0,0,0,6.45-.68.09.09,0,0,0,.06-.15A34.81,34.81,0,0,1,17,45c0-.1,0-.21,0-.31a35,35,0,0,1,70,0c0,.1,0,.21,0,.31a34.81,34.81,0,0,1-5.78,19.24.09.09,0,0,0,.06.15,44.4,44.4,0,0,0,6.45.68c3.46.08,7.11-.37,9.27-2.22,5-4.27,6-11.76,6-20.32C103,35.35,94.55,35,91.84,35Z" />
                <path fill={`${isDark ? 'white' : 'black'}`} d="M52,74,25.4,65.13a.1.1,0,0,0-.1.17L51.93,91.93a.1.1,0,0,0,.14,0L78.7,65.3a.1.1,0,0,0-.1-.17L52,74A.06.06,0,0,1,52,74Z" />
                <path fill={`${isDark ? 'white' : 'black'}`} d="M75.68,46.9,82,45a.09.09,0,0,0,.08-.09,29.91,29.91,0,0,0-.87-6.94.11.11,0,0,0-.09-.08l-6.43-.58a.1.1,0,0,1-.06-.18l4.78-4.18a.13.13,0,0,0,0-.12,30.19,30.19,0,0,0-3.65-6.07.09.09,0,0,0-.11,0l-5.91,2a.1.1,0,0,1-.12-.14L72.19,23a.11.11,0,0,0,0-.12,29.86,29.86,0,0,0-5.84-4.13.09.09,0,0,0-.11,0l-4.47,4.13a.1.1,0,0,1-.17-.07l.09-6a.1.1,0,0,0-.07-.1,30.54,30.54,0,0,0-7-1.47.1.1,0,0,0-.1.07l-2.38,5.54a.1.1,0,0,1-.18,0l-2.37-5.54a.11.11,0,0,0-.11-.06,30,30,0,0,0-7,1.48.12.12,0,0,0-.07.1l.08,6.05a.09.09,0,0,1-.16.07L37.8,18.76a.11.11,0,0,0-.12,0,29.75,29.75,0,0,0-5.83,4.13.11.11,0,0,0,0,.12l2.59,5.6a.11.11,0,0,1-.13.14l-5.9-2a.11.11,0,0,0-.12,0,30.23,30.23,0,0,0-3.62,6.08.11.11,0,0,0,0,.12l4.79,4.19a.1.1,0,0,1-.06.17L23,37.91a.1.1,0,0,0-.09.07A29.9,29.9,0,0,0,22,44.92a.1.1,0,0,0,.07.1L28.4,47a.1.1,0,0,1,0,.18l-5.84,3.26a.16.16,0,0,0,0,.11,30.17,30.17,0,0,0,2.1,6.76c.32.71.67,1.4,1,2.08a.1.1,0,0,0,.06,0L52,68.16H52l26.34-8.78a.1.1,0,0,0,.06-.05,30.48,30.48,0,0,0,3.11-8.88.1.1,0,0,0-.05-.11l-5.83-3.26A.1.1,0,0,1,75.68,46.9Z" />
              </svg>
            </div>
            <audio id="remiAudio" muted={false} src="assets/audio/remiGuitar-single-power-chord-A-minor.mp3" ref={remiAudioEl}></audio>
          </div>
          <span className={`h-80 text-uppercase ps-2 ${isDark ? 'text-white' : 'text-black'}`} style={{ fontSize: 'xx-large', fontFamily: 'Noah, sans-serif' }}>
        Remix
          </span>
        </div>
        <div className={`${isDark ? 'text-white' : 'text-black'} mb-3`} style={{ fontSize: '0.7rem' }}><FormattedMessage id="home.projectTemplates"/> <span className="text-primary"><FormattedMessage id="home.projectTemplates2"/></span></div>
        <div className="d-flex mb-3">
          <span className="d-flex flex-nowrap align-self-end">
            {iconButtons.map((button, index) => (
              <CustomTooltip
                key={index}
                placement={button.placement}
                tooltipId="overlay-tooltip"
                tooltipClasses="text-nowrap"
                tooltipText={button.textToolip}
                tooltipTextClasses="border bg-light text-dark p-1 pe-3"
              >
                <button
                  key={index}
                  onClick={() => {
                    openLink(button.urlLink)
                    trackMatomoEvent({
                      category: 'hometab',
                      action: 'titleCard',
                      name: button.matomoTrackingEntry[index],
                      isClick: true
                    })
                  }}
                  className={`border-0 h-100 px-1 btn fab ${button.iconClass} text-dark`}
                ></button>
              </CustomTooltip>
            ))}
          </span>
        </div>
        <div className="d-flex flex-row flex-wrap justify-content-between">
          <a className="btn btn-secondary bg-dark text-decoration-none col-md-5" style={{ fontSize: '0.7rem', minWidth: '125px', color: isDark ? 'white' : 'black' }} href="https://remix-ide.readthedocs.io/en/latest" target="_blank" onClick={() => trackMatomoEvent({
            category: 'hometab',
            action: 'titleCard',
            name: 'documentation',
            isClick: true
          })}><FormattedMessage id="home.documentation" /></a>
          <a className="btn btn-secondary bg-dark text-decoration-none col-md-5" style={{ fontSize: '0.7rem', minWidth: '125px', color: isDark ? 'white' : 'black' }} href="https://remix.live" target="_blank" onClick={() => trackMatomoEvent({
            category: 'hometab',
            action: 'titleCard',
            name: 'webSite',
            isClick: true
          })}><FormattedMessage id="home.website" /></a>
        </div>
        <DesktopDownload className='mt-3' compact trackingContext="hometab" />
      </div>
    </div>
  )
}

export default HomeTabTitle
