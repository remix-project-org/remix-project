import React, {useState, useEffect, useContext, useRef, ReactNode} from 'react' // eslint-disable-line
import './remix-ui-grid-view.css'
import CustomCheckbox from './components/customCheckbox'
import FiltersContext from "./filtersContext"
import { MatomoEvent, GridViewEvent } from '@remix-api'
import { TrackingContext } from '@remix-ide/tracking'

interface RemixUIGridViewProps {
  plugin: any
  logo?: string
  title?: string
  enableFilter?: boolean
  tagList?: [string, string][] // max 8, others will be ignored
  showUntagged?: boolean
  showPin?: boolean
  classList?: string
  styleList?: any
  description?: string
  children?: ReactNode
}

export const RemixUIGridView = (props: RemixUIGridViewProps) => {
  const [keyValueMap, setKeyValueMap] = useState<Record<string, { enabled: boolean; color: string; }>>({});
  const [filter, setFilter] = useState("")
  const showUntagged = props.showUntagged || false
  const showPin = props.showPin || false
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)
  const trackMatomoEvent = <T extends MatomoEvent = GridViewEvent>(event: T) => {
    baseTrackEvent?.<T>(event)
  }
  const updateValue = (key: string, enabled: boolean, color?: string) => {
    if (!color || color === '') color = setKeyValueMap[key].color
    setKeyValueMap((prevMap) => ({
      ...prevMap,
      [key]: { color, enabled },
    }))
  }

  const [state, setState] = useState<{
    searchDisable: boolean
  }>({
    searchDisable: true
  })
  const searchInputRef = useRef(null)

  const handleSearchKeyDown = (e: KeyboardEvent) => {
    if (e.target !== searchInputRef.current) return
    if (e.key === 'Enter') {
      searchInputRef.current.value = ''
    } else {
      setState((prevState) => {
        return {
          ...prevState,
          searchDisable: searchInputRef.current.value === '',
          filter: searchInputRef.current.value
        }
      })
      setFilter(searchInputRef.current.value)
    }
  }

  const addValue = (key: string, enabled: boolean, color: string) => {
    // Check if the key already exists, if so, do not add
    if (key in keyValueMap) {
      return
    }

    // Add the new key-value pair
    setKeyValueMap((prevMap) => ({
      ...prevMap,
      [key]: { enabled, color },
    }))
  }

  // Initialize filters context with data from props
  useEffect(() => {
    document.addEventListener('keyup', (e) => handleSearchKeyDown(e))

    if (props.tagList && Array.isArray(props.tagList)) {
      const initialKeyValueMap: Record<string, { enabled: boolean; color: string; }> = {};

      // Limit to first 8 elements, ignoring the rest
      for (let i = 0; i < props.tagList.length; i++) {
        const [key, color] = props.tagList[i]
        initialKeyValueMap[key] = { enabled: true, color }
      }
      if (showUntagged) initialKeyValueMap['no tag'] = { enabled: true, color: 'primary' }
      setKeyValueMap(initialKeyValueMap)
    }
    return () => {
      document.removeEventListener('keyup', handleSearchKeyDown)
    }
  }, [])

  return (
    <FiltersContext.Provider value={{ showUntagged, showPin, keyValueMap, updateValue, addValue, filter }}>
      <div className={"flex flex-col bg-dark w-full h-full remixui_grid_view_container " + props.classList || ''} data-id="remixUIGV">
        <div className="flex flex-col w-full remixui_grid_view">
          <div className='flex p-4 bg-light flex-col  remixui_grid_view_titlebar'>
            <div className='flex flex-row items-center mb-2'>
              { props.logo && <img className='remixui_grid_view_logo mr-2' src={props.logo} /> }
              { props.title && <h3 className='mb-0'>{ props.title }</h3> }
            </div>
            { props.description && <div className='pb-3 remixui_grid_view_title'>{ props.description }</div> }
            { props.enableFilter && <div className='flex flex-row'>
              <div className="flex flex-row pr-2 pb-1 items-center justify-between">
                <div className='flex' id="GVFilter">
                  <button
                    disabled={state.searchDisable}
                    className="remixui_grid_view_btn text-secondary form-control bg-light border flex items-center p-2 justify-center fas fa-filter bg-light"
                    onClick={(e) => {
                      setFilter(searchInputRef.current.value)
                      trackMatomoEvent({ category: 'gridView', action: 'filterWithTitle', name: props.title || '', value: searchInputRef.current.value, isClick: true })
                    }}
                  ></button>
                  <input
                    ref={searchInputRef}
                    type="text"
                    style={{ minWidth: '100px' }}
                    className="border form-control mr-4"
                    id="GVFilterInput"
                    placeholder={"Filter the list"}
                    data-id="RemixGVFilterInput"
                  />
                </div>
                <div className='flex flex-row'>
                  { Object.keys(keyValueMap).map((key) => (
                    <CustomCheckbox key={key} label={key} />
                  )) }
                </div>
              </div>
            </div> }
          </div>
          { props.children }
        </div>
      </div>
    </FiltersContext.Provider>
  )
}

export default RemixUIGridView
