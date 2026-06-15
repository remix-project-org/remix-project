import React, { useContext, useEffect, useState } from 'react'
import { ThemeContext } from '../themeContext'
import axios from 'axios'
import { HOME_TAB_BASE_URL, HOME_TAB_NEW_UPDATES } from './constant'
import { UpdateInfo } from './types/carouselTypes'
import { HomeTabEvent, MatomoEvent } from '@remix-api'
import { TrackingContext } from '@remix-ide/tracking'
import { FirstTimeUserCard } from './firstTimeUserCard'

interface HomeTabUpdatesProps {
  plugin: any
}

function HomeTabUpdates({ plugin }: HomeTabUpdatesProps) {
  const [selectedUpdate, setSelectedUpdate] = useState<UpdateInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showFirstTime, setShowFirstTime] = useState(false)
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)

  const trackMatomoEvent = <T extends MatomoEvent = HomeTabEvent>(event: T) => {
    baseTrackEvent?.<T>(event)
  }

  useEffect(() => {
    async function getLatestUpdates() {
      try {
        setIsLoading(true)
        const response = await axios.get(HOME_TAB_NEW_UPDATES)
        const updates = response.data

        const hasVisitedHomeBefore = localStorage.getItem('remix-home-visited')
        const isFirstTime = !hasVisitedHomeBefore

        if (isFirstTime) {
          localStorage.setItem('remix-home-visited', 'true')
          setShowFirstTime(true)
          setSelectedUpdate(null)
          setIsLoading(false)
          return
        }

        const allOptions: any[] = ['first-time', 'first-time']
        if (updates && updates.length > 0) allOptions.push(...updates)

        if (allOptions.length > 0) {
          const selected = allOptions[Math.floor(Math.random() * allOptions.length)]
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
    trackMatomoEvent({ category: 'hometab', action: 'updatesActionClick', name: updateInfo.title, isClick: true })
    if (updateInfo.action.type === 'link') {
      window.open(updateInfo.action.url, '_blank')
    } else if (updateInfo.action.type === 'methodCall') {
      plugin.call(updateInfo.action.pluginName, updateInfo.action.pluginMethod, updateInfo.action.pluginArgs)
    }
  }

  function UpdateCard(updateInfo: UpdateInfo) {
    return (
      <>
        <div className="ht-section-header">
          <span className="ht-section-title">What's New</span>
        </div>
        <div className="ht-update-card">
          <div className="ht-update-body">
            <span className="ht-update-badge">{updateInfo.badge}</span>
            <div className="ht-update-title">{updateInfo.title}</div>
            {Array.isArray(updateInfo.descriptionList) && updateInfo.descriptionList.length > 0 ? (
              <ul className="ht-update-list">
                {updateInfo.descriptionList.map((d: string, i: number) => (
                  <li key={i}><i className="far fa-check-circle me-1"></i>{d}</li>
                ))}
              </ul>
            ) : (
              <div className="ht-update-desc">{updateInfo.description}</div>
            )}
            <button className="ht-update-action" onClick={() => handleUpdatesActionClick(updateInfo)}>
              {updateInfo.action.label}
            </button>
          </div>
        </div>
      </>
    )
  }

  function LoadingSkeleton() {
    return (
      <div className="ht-update-card">
        <div className="ht-update-body">
          <span className="ht-skeleton" style={{ height: '18px', width: '40%', marginBottom: '8px' }}></span>
          <span className="ht-skeleton" style={{ height: '14px', width: '65%', marginBottom: '6px' }}></span>
          <span className="ht-skeleton" style={{ height: '11px', width: '90%', marginBottom: '3px' }}></span>
          <span className="ht-skeleton" style={{ height: '11px', width: '75%', marginBottom: '12px' }}></span>
          <span className="ht-skeleton" style={{ height: '30px', width: '100%', borderRadius: '4px' }}></span>
        </div>
      </div>
    )
  }

  return (
    <div className="ht-section">
      {isLoading ? (
        <LoadingSkeleton />
      ) : showFirstTime ? (
        <FirstTimeUserCard plugin={plugin} />
      ) : selectedUpdate ? (
        UpdateCard(selectedUpdate)
      ) : null}
    </div>
  )
}

export default HomeTabUpdates
