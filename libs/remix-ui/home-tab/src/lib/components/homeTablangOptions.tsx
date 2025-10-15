import React, { useContext, useEffect, useState } from 'react'
import { Dropdown, DropdownButton } from 'react-bootstrap'
import DropdownItem from 'react-bootstrap/DropdownItem'
import { localeLang } from './types/carouselTypes'
import { FormattedMessage } from 'react-intl'
import { HomeTabEvent, MatomoEvent } from '@remix-api'
import { TrackingContext } from '@remix-ide/tracking'

export function LanguageOptions({ plugin }: { plugin: any }) {
  const [langOptions, setLangOptions] = useState<string>()
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)

  // Component-specific tracker with default HomeTabEvent type
  const trackMatomoEvent = <T extends MatomoEvent = HomeTabEvent>(event: T) => {
    baseTrackEvent?.<T>(event)
  }

  const changeLanguage = async (lang: string) => {
    await plugin.call('locale', 'switchLocale', lang)
  }

  useEffect(() => {
    plugin.call('locale', 'currentLocale').then(opt => {
      setLangOptions(opt.code.toUpperCase())
    })
  }, [langOptions])

  useEffect(() => {
    plugin.on('locale', 'localeChanged', (lang: localeLang) => {
      setLangOptions(lang.code.toUpperCase())
    })
  }, [langOptions])

  return (
    <>
      <div className="d-flex justify-content-between w-100 align-items-center pt-4">
        <label style={{ fontSize: '1.2rem' }} className="ms-2 pb-0 mb-0">
          <FormattedMessage id="home.featured" />
        </label>
        <Dropdown>
          <Dropdown.Toggle title={langOptions} id="languagedropdown" size="sm" style={{ backgroundColor: 'var(--bs-secondary)', color: 'var(--text)' }}>
            {langOptions}
          </Dropdown.Toggle>
          <Dropdown.Menu className="dropdown-menu langSelector" style={{ paddingTop: "0px", paddingBottom: "0px", minWidth: 'fit-content', backgroundColor: 'var(--body-bg)' }}>
            {['EN', 'ES', 'FR', 'IT', 'KO', 'RU', 'ZH'].map((lang, index) => (
              <DropdownItem as={'span'} className={langOptions === lang ? "border border-primary px-2" : "px-2"} onClick={() =>
              {
                changeLanguage(lang.toLowerCase())
                setLangOptions(lang)
                trackMatomoEvent({
                  category: 'hometab',
                  action: 'switchTo',
                  name: lang,
                  isClick: true
                })
              }}
              style={{ color: 'var(--text)', cursor: 'pointer' }}
              key={index}
              >
                {lang}
              </DropdownItem>
            ))}
          </Dropdown.Menu>
        </Dropdown>
      </div>
    </>
  )
}
