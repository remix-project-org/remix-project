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
    <div className="flex px-2 pb-2 pt-2 flex flex-col" id="hTLearnSection">
      <div className="flex justify-between">
        <label className="py-2 pt-3 self-center m-0" style={{ fontSize: '1.2rem' }}>
          <FormattedMessage id="home.learn" />
        </label>
        <CustomTooltip
          placement={'top'}
          tooltipId="overlay-tooltip"
          tooltipClasses="whitespace-nowrap"
          tooltipText={<FormattedMessage id="home.seeAllTutorials" />}
          tooltipTextClasses="border bg-light text-dark p-1 pr-3"
        >
          <button
            onClick={async () => {
              await goToLearnEthHome()
            }}
            className="h-full px-2 pt-0 btn"
          >
            <img
              className="self-center"
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
      <div className="flex flex-col">
        <label
          className="flex flex-col px-4 py-2 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-theme rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
          onClick={() =>
            setState((prevState) => {
              return { ...prevState, visibleTutorial: VisibleTutorial.Basics }
            })
          }
        >
          <label className="font-medium self-start m-0 text-left" style={{ fontSize: '1rem' }}>
            <FormattedMessage id="home.learnEth1" />
          </label>
          {state.visibleTutorial === VisibleTutorial.Basics && (
            <div className="pt-2 flex flex-col text-left">
              <span className="py-1" style={{ fontSize: '0.8rem' }}>
                <FormattedMessage id="home.learnEth1Desc" />
              </span>
              <button className="px-3 py-1 bg-gray-600 dark:bg-gray-500 text-white text-sm mt-2 rounded-md hover:bg-gray-700 dark:hover:bg-gray-400 transition-colors" style={{ width: 'fit-content' }} onClick={() => startLearnEthTutorial('basics')}>
                <FormattedMessage id="home.getStarted" />
              </button>
            </div>
          )}
        </label>
        <label
          className="flex flex-col px-4 py-2 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-theme rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
          onClick={() =>
            setState((prevState) => {
              return {
                ...prevState,
                visibleTutorial: VisibleTutorial.Intermediate
              }
            })
          }
        >
          <label className="font-medium self-start m-0 text-left" style={{ fontSize: '1rem' }}>
            <FormattedMessage id="home.learnEth2" />
          </label>
          {state.visibleTutorial === VisibleTutorial.Intermediate && (
            <div className="pt-2 flex flex-col text-left">
              <span className="py-1" style={{ fontSize: '0.8rem' }}>
                <FormattedMessage id="home.learnEth2Desc" />
              </span>
              <button className="px-3 py-1 bg-gray-600 dark:bg-gray-500 text-white text-sm mt-2 rounded-md hover:bg-gray-700 dark:hover:bg-gray-400 transition-colors" style={{ width: 'fit-content' }} onClick={() => startLearnEthTutorial('soliditybeginner')}>
                <FormattedMessage id="home.getStarted" />
              </button>
            </div>
          )}
        </label>
        <label
          className="flex flex-col px-4 py-2 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-theme rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
          onClick={() =>
            setState((prevState) => {
              return { ...prevState, visibleTutorial: VisibleTutorial.Advanced }
            })
          }
        >
          <label className="font-medium self-start m-0 text-left" style={{ fontSize: '1rem' }}>
            <FormattedMessage id="home.remixAdvanced" />
          </label>
          {state.visibleTutorial === VisibleTutorial.Advanced && (
            <div className="pt-2 flex flex-col text-left">
              <span className="py-1" style={{ fontSize: '0.8rem' }}>
                <FormattedMessage id="home.remixAdvancedDesc" />
              </span>
              <button className="px-3 py-1 bg-gray-600 dark:bg-gray-500 text-white text-sm mt-2 rounded-md hover:bg-gray-700 dark:hover:bg-gray-400 transition-colors" style={{ width: 'fit-content' }} onClick={() => startLearnEthTutorial('deploylibraries')}>
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
