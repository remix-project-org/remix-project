/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { Fragment, ReactNode, useEffect, useState, useContext } from 'react' // eslint-disable-line no-use-before-define
import { FormattedMessage, useIntl } from 'react-intl'
import { PluginManagerComponent } from '../../types'
import PermisssionsSettings from './permissionsSettings'
import { Profile } from '@remixproject/plugin-utils'
import LocalPluginForm from './LocalPluginForm'
import FilterView from './FilterView'
import { ToggleSwitch } from '@remix-ui/toggle'

interface RootViewProps {
  pluginComponent: PluginManagerComponent
  children: ReactNode
  filterByRemix: boolean
  setFilterByRemix: (value: boolean) => void
  categoryMap: Record<number, string>
  selectedCategories: number[]
  setSelectedCategories: (categories: number[]) => void
}

export interface pluginDeactivated {
  flag: boolean
  profile: Profile
}

export interface pluginActivated {
  flag: boolean
  profile: Profile
}

function RootView({ pluginComponent, children, filterByRemix, setFilterByRemix, categoryMap, selectedCategories, setSelectedCategories }: RootViewProps) {
  const intl = useIntl()
  const [visible, setVisible] = useState<boolean>(true)
  const [filterPlugins, setFilterPlugin] = useState<string>('')
  const [showFilters, setShowFilters] = useState<boolean>(false)

  const openModal = () => setVisible(false)
  const closeModal = () => setVisible(true)

  useEffect(() => {
    pluginComponent.getAndFilterPlugins(filterPlugins)
  }, [filterPlugins])

  return (
    <Fragment>
      <div id="pluginManager" data-id="pluginManagerComponentPluginManager">
        <header className="form-group mb-0 d-flex flex-column bg-light plugins-header pt-3 pb-2 px-3">
          <div className="pb-3 mb-3 border-bottom w-100">
            <button onClick={openModal} className="btn btn-secondary btn-sm d-flex align-items-center justify-content-center w-100" data-id="pluginManagerComponentPluginSearchButton">
              <img className="icon-pluginManager me-1" style={{ filter: "invert(1)" }} src="assets/img/pluginManager.webp" alt="pluginManager" />
              <FormattedMessage id="pluginManager.connectExternal" defaultMessage="Connect to an external plugin" />
            </button>
          </div>

          <div className="d-flex w-100 mb-2">
            <div className="search-bar-container w-100">
              <img className="search-bar-icon" style={{ filter: "invert(0.6)" }} src="assets/img/search_icon.webp" alt={intl.formatMessage({ id: 'pluginManager.search' })} />
              <input
                type="text"
                onChange={(event) => setFilterPlugin(event.target.value.toLowerCase())}
                value={filterPlugins}
                className="form-control form-control-sm"
                placeholder={intl.formatMessage({ id: 'pluginManager.search' })}
                data-id="pluginManagerComponentSearchInput"
              />
            </div>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className="btn btn-sm btn-secondary ml-2 d-flex align-items-center"
              data-id="pluginManagerComponentFilterButton"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 8 8" fill="none" className="me-1">
                <g clipPath="url(#clip0_6001_5069)">
                  <path d="M0.0608558 0.857813C0.163981 0.639063 0.382731 0.5 0.624918 0.5H7.37492C7.61711 0.5 7.83586 0.639063 7.93898 0.857813C8.04211 1.07656 8.01086 1.33438 7.85773 1.52188L4.99992 5.01406V7C4.99992 7.18906 4.89367 7.3625 4.72336 7.44688C4.55304 7.53125 4.35148 7.51406 4.19992 7.4L3.19992 6.65C3.07336 6.55625 2.99992 6.40781 2.99992 6.25V5.01406L0.140543 1.52031C-0.0110192 1.33438 -0.0438317 1.075 0.0608558 0.857813Z" fill="currentColor"/>
                </g>
                <defs>
                  <clipPath id="clip0_6001_5069">
                    <rect width="8" height="8" fill="white"/>
                  </clipPath>
                </defs>
              </svg>
              <span><FormattedMessage id="pluginManager.filters" /></span>
            </button>
          </div>

          {showFilters && (
            <FilterView
              categoryMap={categoryMap}
              selectedCategories={selectedCategories}
              setSelectedCategories={setSelectedCategories}
            />
          )}

          <div className="d-flex align-items-center w-100">
            <label
              htmlFor="filter-by-remix-switch"
              className="m-0 remixui-filter-label text-dark me-2"
              style={{ cursor: 'pointer' }}
            >
              <FormattedMessage id="pluginManager.onlyMaintainedByRemix" />
            </label>
            <div data-id="filter-by-remix-switch">
              <ToggleSwitch
                id="filter-by-remix-switch"
                isOn={filterByRemix}
                onClick={() => setFilterByRemix(!filterByRemix)}
              />
            </div>
          </div>
        </header>
        <div className="plugin-content">
          {children}
        </div>
        <PermisssionsSettings />
      </div>
      <LocalPluginForm closeModal={closeModal} visible={visible} pluginManager={pluginComponent} />
    </Fragment>
  )
}

export default RootView
