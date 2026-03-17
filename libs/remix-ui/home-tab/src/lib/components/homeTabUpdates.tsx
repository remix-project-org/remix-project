/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useContext, useEffect, useState } from 'react'
import { ThemeContext } from '../themeContext'
import axios from 'axios'
import { HOME_TAB_BASE_URL, HOME_TAB_NEW_UPDATES } from './constant'
import { LoadingCard } from './LoaderPlaceholder'
import { UpdateInfo } from './types/carouselTypes'
import { HomeTabEvent, MatomoEvent } from '@remix-api'
import { TrackingContext } from '@remix-ide/tracking'
import { FirstTimeUserCard } from './firstTimeUserCard'

interface HomeTabUpdatesProps {
  plugin: any
}

// exportinterface UpdateInfo {
//   badge: string
//   title: string
//   description: string
//   descriptionList?: string[]
//   icon: string
//   action: {
//     type: 'link' | 'methodCall'
//     label: string
//     url?: string
//     pluginName?: string
//     pluginMethod?: string,
//     pluginArgs?: (string | number | boolean | object | null)[]
//   },
//   theme: string
// }

function HomeTabUpdates({ plugin }: HomeTabUpdatesProps) {
  const [selectedUpdate, setSelectedUpdate] = useState<UpdateInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showFirstTime, setShowFirstTime] = useState(false)
  const theme = useContext(ThemeContext)
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)
  const isDark = theme.name === 'dark'

  // Component-specific tracker with default HomeTabEvent type
  const trackMatomoEvent = <T extends MatomoEvent = HomeTabEvent>(event: T) => {
    baseTrackEvent?.<T>(event)
  }

  useEffect(() => {
    async function getLatestUpdates() {
      try {
        setIsLoading(true)
        const response = await axios.get(HOME_TAB_NEW_UPDATES)
        const updates = response.data

        // Check if this is the first time visiting
        const hasVisitedHomeBefore = localStorage.getItem('remix-home-visited')
        const isFirstTime = !hasVisitedHomeBefore

        if (isFirstTime) {
          localStorage.setItem('remix-home-visited', 'true')
        }

        // Create array including first-time option and regular updates
        const allOptions = []

        // Add first-time card option (higher weight for first-time users)
        if (isFirstTime) {
          setShowFirstTime(true)
          setSelectedUpdate(null)
          setIsLoading(false)
          return
        } else {
          // Still include as option for returning users
          allOptions.push('first-time', 'first-time')
        }

        // Add regular updates if available
        if (updates && updates.length > 0) {
          allOptions.push(...updates)
        }

        // Randomly select from all options
        if (allOptions.length > 0) {
          const randomIndex = Math.floor(Math.random() * allOptions.length)
          const selected = allOptions[randomIndex]

          if (selected === 'first-time') {
            setShowFirstTime(true)
            setSelectedUpdate(null)
          } else {
            setShowFirstTime(false)
            setSelectedUpdate(selected)
          }
        }

        setIsLoading(false)
      } catch (error) {
        console.error('Error fetching plugin list:', error)
        setIsLoading(false)
      }
    }
    getLatestUpdates()
  }, [])

  const handleUpdatesActionClick = (updateInfo: UpdateInfo) => {
    trackMatomoEvent({
      category: 'hometab',
      action: 'updatesActionClick',
      name: updateInfo.title,
      isClick: true
    })
    if (updateInfo.action.type === 'link') {
      window.open(updateInfo.action.url, '_blank')
    } else if (updateInfo.action.type === 'methodCall') {
      plugin.call(updateInfo.action.pluginName, updateInfo.action.pluginMethod, updateInfo.action.pluginArgs)
    }
  }

  function UpdateCard(updateInfo: UpdateInfo) {
    return (
      <div className="card border h-100 d-flex flex-column justify-content-between">
        <div>
          <div className="d-flex align-items-center p-3 overflow-hidden justify-content-between" style={{ height: '80px', backgroundColor: 'var(--bs-body-bg)' }}>
            <span className={`badge bg-info bg-transparent border p-2 rounded-pill text-${updateInfo.theme}`} style={{ fontWeight: 'light', border: `1px solid var(--${updateInfo.theme})` }}>{updateInfo.badge}</span>
            { updateInfo.icon ? <img src={`${HOME_TAB_BASE_URL + updateInfo.icon}`} alt="RemixAI Assistant" style={{ height: '150px', width: '150px' }} />
              : <img src={`${HOME_TAB_BASE_URL + 'images/illusion.svg'}`} alt="RemixAI Assistant" style={{ height: '150px', width: '150px' }} />
            }
          </div>
          <div className="px-3" style={{ fontSize: '1rem', zIndex: 1 }}>
            <span className="d-block my-2" style={{ color: isDark ? 'white' : 'black' }}>
              {updateInfo.title}
            </span>
            {Array.isArray(updateInfo.descriptionList) && updateInfo.descriptionList.length > 0 ? (
              <div className="mb-3 small">
                <ul className="list-unstyled">
                  {updateInfo.descriptionList.map((description: string, index: number) => (
                    <li key={`description-${index}`} className='mb-1'><i className="far fa-check-circle me-2"></i>{description}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="mb-3 small">{updateInfo.description}</div>
            )}
          </div>
        </div>
        <div className="px-3 pb-3">
          <button className={`btn btn-light btn-sm w-100 border ${updateInfo.theme !== 'primary' && `text-${updateInfo.theme}`}`} onClick={() => handleUpdatesActionClick(updateInfo)}>
            {updateInfo.action.label}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="">
      {isLoading ? (
        <div className="">
          <LoadingCard />
        </div>
      ) : showFirstTime ? (
        <div className="">
          <FirstTimeUserCard plugin={plugin} />
        </div>
      ) : selectedUpdate ? (
        <div className="">
          {UpdateCard(selectedUpdate)}
        </div>
      ) : null}
    </div>
  )
}

export default HomeTabUpdates
