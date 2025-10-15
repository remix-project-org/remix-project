/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useEffect, useState, useContext } from 'react'
import { FormattedMessage } from 'react-intl'
import { ThemeContext } from '../themeContext'
import { CustomTooltip } from '@remix-ui/helper'
import { HomeTabEvent, MatomoEvent } from '@remix-api'
import { TrackingContext } from '@remix-ide/tracking'

enum VisibleTutorial {
  Basics,
  Intermediate,
  Advanced
}
interface HomeTabLearnProps {
  plugin: any
}

function HomeTabLearn({ plugin }: HomeTabLearnProps) {
  const [state, setState] = useState<{
    visibleTutorial: VisibleTutorial
  }>({
    visibleTutorial: VisibleTutorial.Basics
  })

  const themeFilter = useContext(ThemeContext)
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)

  // Component-specific tracker with default HomeTabEvent type
  const trackMatomoEvent = <T extends MatomoEvent = HomeTabEvent>(event: T) => {
    baseTrackEvent?.<T>(event)
  }

  const startLearnEthTutorial = async (tutorial: 'basics' | 'soliditybeginner' | 'deploylibraries') => {
    await plugin.appManager.activatePlugin(['solidity', 'LearnEth', 'solidityUnitTesting'])
    plugin.verticalIcons.select('LearnEth')
    plugin.call('LearnEth', 'startTutorial', 'remix-project-org/remix-workshops', 'master', tutorial)
    trackMatomoEvent({
      category: 'hometab',
      action: 'startLearnEthTutorial',
      name: tutorial,
      isClick: true
    })
  }

  const goToLearnEthHome = async () => {
    if (await plugin.appManager.isActive('LearnEth')) {
      plugin.verticalIcons.select('LearnEth')
      await plugin.call('LearnEth', 'home')
    } else {
      await plugin.appManager.activatePlugin(['LearnEth', 'solidity', 'solidityUnitTesting'])
      plugin.verticalIcons.select('LearnEth')
      await plugin.call('LearnEth', 'home')
    }
  }

  return (
    <div className="d-flex px-2 pb-2 pt-2 d-flex flex-column" id="hTLearnSection">
      <div className="d-flex justify-content-between">
        <label className="py-2 pt-3 align-self-center m-0" style={{ fontSize: '1.2rem' }}>
          <FormattedMessage id="home.learn" />
        </label>
        <CustomTooltip
          placement={'top'}
          tooltipId="overlay-tooltip"
          tooltipClasses="text-nowrap"
          tooltipText={<FormattedMessage id="home.seeAllTutorials" />}
          tooltipTextClasses="border bg-light text-dark p-1 pe-3"
        >
          <button
            onClick={async () => {
              await goToLearnEthHome()
            }}
            className="h-100 px-2 pt-0 btn"
          >
            <img
              className="align-self-center"
              src="assets/img/learnEthLogo.webp"
              alt=""
              style={{
                filter: themeFilter.filter,
                width: '1rem',
                height: '1ren'
              }}
            />
          </button>
        </CustomTooltip>
      </div>
      <div className="d-flex flex-column">
        <label
          className="d-flex flex-column btn border"
          onClick={() =>
            setState((prevState) => {
              return { ...prevState, visibleTutorial: VisibleTutorial.Basics }
            })
          }
        >
          <label className="card-title align-self-start m-0 float-start" style={{ fontSize: '1rem' }}>
            <FormattedMessage id="home.learnEth1" />
          </label>
          {state.visibleTutorial === VisibleTutorial.Basics && (
            <div className="pt-2 d-flex flex-column text-start">
              <span className="py-1" style={{ fontSize: '0.8rem' }}>
                <FormattedMessage id="home.learnEth1Desc" />
              </span>
              <button className="btn btn-sm btn-secondary mt-2" style={{ width: 'fit-content' }} onClick={() => startLearnEthTutorial('basics')}>
                <FormattedMessage id="home.getStarted" />
              </button>
            </div>
          )}
        </label>
        <label
          className="d-flex flex-column btn border"
          onClick={() =>
            setState((prevState) => {
              return {
                ...prevState,
                visibleTutorial: VisibleTutorial.Intermediate
              }
            })
          }
        >
          <label className="card-title align-self-start m-0 float-start" style={{ fontSize: '1rem' }}>
            <FormattedMessage id="home.learnEth2" />
          </label>
          {state.visibleTutorial === VisibleTutorial.Intermediate && (
            <div className="pt-2 d-flex flex-column text-start">
              <span className="py-1" style={{ fontSize: '0.8rem' }}>
                <FormattedMessage id="home.learnEth2Desc" />
              </span>
              <button className="btn btn-sm btn-secondary mt-2" style={{ width: 'fit-content' }} onClick={() => startLearnEthTutorial('soliditybeginner')}>
                <FormattedMessage id="home.getStarted" />
              </button>
            </div>
          )}
        </label>
        <label
          className="d-flex flex-column btn border"
          onClick={() =>
            setState((prevState) => {
              return { ...prevState, visibleTutorial: VisibleTutorial.Advanced }
            })
          }
        >
          <label className="card-title align-self-start m-0 float-start" style={{ fontSize: '1rem' }}>
            <FormattedMessage id="home.remixAdvanced" />
          </label>
          {state.visibleTutorial === VisibleTutorial.Advanced && (
            <div className="pt-2 d-flex flex-column text-start">
              <span className="py-1" style={{ fontSize: '0.8rem' }}>
                <FormattedMessage id="home.remixAdvancedDesc" />
              </span>
              <button className="btn btn-sm btn-secondary mt-2" style={{ width: 'fit-content' }} onClick={() => startLearnEthTutorial('deploylibraries')}>
                <FormattedMessage id="home.getStarted" />
              </button>
            </div>
          )}
        </label>
      </div>
    </div>
  )
}

export default HomeTabLearn
