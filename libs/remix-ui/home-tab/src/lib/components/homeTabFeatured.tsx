/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useEffect, useState, useRef, useContext } from 'react'
import { FormattedMessage } from 'react-intl'
import { ThemeContext, themes } from '../themeContext'
import { HomeTabEvent, MatomoEvent } from '@remix-api'
import { TrackingContext } from '@remix-ide/tracking'
import Carousel from 'react-multi-carousel'
import 'react-multi-carousel/lib/styles.css'
// import * as releaseDetails from './../../../../../../releaseDetails.json'

// Temporary fallback for missing releaseDetails.json
const releaseDetails = {
  version: 'Latest',
  title: 'Release',
  highlight1: 'New features and improvements',
  highlight2: 'Bug fixes and stability',
  highlight3: 'Enhanced user experience',
  highlight4: 'Better performance',
  moreLink: '#',
  more: 'Learn more'
}

export type HomeTabFeaturedProps = {
  plugin: any
  }

function HomeTabFeatured(props:HomeTabFeaturedProps) {
  const themeFilter = useContext(ThemeContext)
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)

  // Component-specific tracker with default HomeTabEvent type
  const trackMatomoEvent = <T extends MatomoEvent = HomeTabEvent>(event: T) => {
    baseTrackEvent?.<T>(event)
  }
  const handleStartLearneth = async () => {
    await props.plugin.appManager.activatePlugin(['LearnEth', 'solidityUnitTesting'])
    props.plugin.verticalIcons.select('LearnEth')
    trackMatomoEvent({
      category: 'hometab',
      action: 'featuredSection',
      name: 'LearnEth',
      isClick: true
    })
  }
  const handleStartRemixGuide = async () => {
    trackMatomoEvent({
      category: 'hometab',
      action: 'featuredSection',
      name: 'watchOnRemixGuide',
      isClick: true
    })
    await props.plugin.appManager.activatePlugin(['remixGuide'])
    await props.plugin.call('tabs', 'focus', 'remixGuide')
  }
  return (
    <div className="pt-1 ps-2" id="hTFeaturedeSection">
      <div className="mb-2 remix_ui-carousel-container">
        <div className="w-100 d-flex flex-column rounded-3 remix_ui-carouselbox">
          <ThemeContext.Provider value={themeFilter}>
            <Carousel
              arrows={false}
              swipeable={false}
              draggable={true}
              showDots={true}
              responsive={{
                desktop: { breakpoint: { max: 2000, min: 1024 }, items: 1 }
              }}
              renderDotsOutside={true}
              ssr={true} // means to render carousel on server-side.
              infinite={true}
              partialVisible={false}
              centerMode={false}
              autoPlay={true}
              keyBoardControl={true}
              containerClass="border w-full carousel-container d-flex align-items-center"
              sliderClass="h-100 justify-content-between"
              deviceType={'desktop'}
              itemClass=""
              autoPlaySpeed={10000}
              dotListClass="position-relative mt-2"
            >
              {false && <div // no this is not a mistake. keep it false until next year ;)
                className="mx-1 px-1 d-flex d-none" // Please do not delete. just comment this out or keep hidden. To be used every year.
              >
                <a href="https://cryptpad.fr/form/#/2/form/view/pV-DdryeJoYUWvW+gXsFaMNynEY7t5mUsgeD1urgwSE/" target="__blank">
                  <img className="remixui_carouselImage" src={'/assets/img/solSurvey2024.webp'} alt=""></img>
                </a>
                <div className="h6 w-50 p-2 ps-4  align-self-center" style={{ flex: '1' }}>
                  <h5>
                  The Solidity Developer Survey 2024 is live!
                  </h5>
                  <p className='pt-2'>
                    Please take a few minutes of your time to
                    <a
                      className="mx-1"
                      onClick={() => trackMatomoEvent({
                        category: 'hometab',
                        action: 'featuredSection',
                        name: 'soliditySurvey24',
                        isClick: true
                      })}
                      target="__blank"
                      href="https://cryptpad.fr/form/#/2/form/view/9xjPVmdv8z0Cyyh1ejseMQ0igmx-TedH5CPST3PhRUk/"
                    >
                      COMPLETE THE SURVEY.
                    </a>
                  </p>
                  <p style={{ fontSize: '0.8rem' }} className="mb-3">
                    Thank you for your support! Read the full announcement
                    <a
                      className="remixui_home_text mx-1"
                      onClick={() => trackMatomoEvent({
                        category: 'hometab',
                        action: 'featuredSection',
                        name: 'soliditySurvey24',
                        isClick: true
                      })}
                      target="__blank"
                      href="https://soliditylang.org/blog/2024/12/27/solidity-developer-survey-2024-announcement/"
                    >
                      here.
                    </a>
                  </p>
                </div>
              </div> }
              <div className="me-1 pe-1 d-flex align-items-center justify-content-center h-100">
                <a href={releaseDetails.moreLink} target="__blank">
                  <img src={'assets/img/remi_drums_whatsnew.webp'} className="remixui_carouselImage" alt=""></img>
                </a>
                <div className="h6 w-50 p-2 ps-4 align-self-center" style={{ flex: '1' }}>
                  <h5>{releaseDetails.version} {releaseDetails.title}</h5>
                  <div style={{ fontSize: '0.8rem' }} className="mb-3">
                    <ul>
                      { releaseDetails.highlight1 ? <li style={{ padding: '0.15rem' }}>{releaseDetails.highlight1}</li> : '' }
                      { releaseDetails.highlight2 ? <li style={{ padding: '0.15rem' }}>{releaseDetails.highlight2}</li> : '' }
                      { releaseDetails.highlight3 ? <li style={{ padding: '0.15rem' }}>{releaseDetails.highlight3}</li> : '' }
                      { releaseDetails.highlight4 ? <li style={{ padding: '0.15rem' }}>{releaseDetails.highlight4}</li> : '' }
                    </ul>
                  </div>
                  <a
                    className="remixui_home_text btn-sm btn-secondary mt-2 text-decoration-none mb-3"
                    onClick={() => trackMatomoEvent({
                      category: 'hometab',
                      action: 'featuredSection',
                      name: 'seeFullChangelog',
                      isClick: true
                    })}
                    target="__blank"
                    href={releaseDetails.moreLink}
                  >
                    {releaseDetails.more}
                  </a>
                </div>
              </div>
              <div className="me-1 pe-1 d-flex align-items-center justify-content-center h-100">
                <button className='btn' onClick={()=>handleStartLearneth()}>
                  <img src={'assets/img/remi-prof.webp'} className="remixui_carouselImage" alt=""></img>
                </button>
                <div className="h6 w-50 p-2 ps-4  align-self-center" style={{ flex: '1' }}>
                  <h5>
                    <FormattedMessage id="home.learnEthPromoTitle" />
                  </h5>
                  <div style={{ fontSize: '0.8rem', lineHeight: '1.25rem' }} className="mb-3">
                    <FormattedMessage id="home.learnEthPromoText" />
                  </div>
                  <button
                    className="remixui_home_text btn-sm btn-secondary mt-2 text-decoration-none mb-3"
                    onClick={()=>handleStartLearneth()}
                  >
                    <FormattedMessage id="home.learnEthPromoButton" />
                  </button>
                </div>
              </div>
              <div className="me-1 pe-1 d-flex align-items-center justify-content-center h-100">
                <button className="btn" onClick={() => handleStartRemixGuide()}>
                  <img src={'assets/img/YouTubeLogo.webp'} className="remixui_carouselImage" alt=""></img>
                </button>
                <div className="h6 w-50 p-2 ps-4  align-self-center" style={{ flex: '1' }}>
                  <h5>
                    <FormattedMessage id="home.remixYouTube" />
                  </h5>
                  <p style={{ fontStyle: 'italic', fontSize: '1rem' }}>
                    <FormattedMessage id="home.remixYouTubeText1" />
                  </p>
                  <div style={{ fontSize: '0.8rem' }} className="mb-3">
                    <FormattedMessage id="home.remixYouTubeText2" />
                  </div>
                  <button
                    className="remixui_home_text btn-sm btn-secondary mt-2 text-decoration-none mb-3"
                    onClick={() => handleStartRemixGuide()}
                  >
                    <FormattedMessage id="home.remixYouTubeMore" />
                  </button>
                </div>
              </div>
            </Carousel>
          </ThemeContext.Provider>
        </div>
      </div>
    </div>
  )
}

export default HomeTabFeatured
