import React, {useState, useEffect, useContext, useRef, ReactNode, ReactHTMLElement} from 'react' // eslint-disable-line

import './remix-ui-grid-cell.css'
import FiltersContext from "./filtersContext"
import { CustomTooltip } from '@remix-ui/helper'
import { ChildCallbackContext } from './remix-ui-grid-section'

interface RemixUIGridCellProps {
  pinned?: boolean
  pinStateCallback?: any
  logo?: string
  logos?: string[]
  logoURL?: string
  title?: string
  titleTooltip?: string
  hideTitle?: boolean
  tagList?: string[] // max 8, others will be ignored
  classList?: string
  styleList?: any
  children?: ReactNode
  expandViewEl?: any
  handleExpand?: any
  id?: string
  searchKeywords?: string[]
}

export const RemixUIGridCell = (props: RemixUIGridCellProps) => {
  const filterCon = useContext(FiltersContext)
  const callbackContext = useContext(ChildCallbackContext)
  const [anyEnabled, setAnyEnabled] = useState(false)
  const [expand, setExpand] = useState(false)
  const [pinned, setPinned] = useState<boolean>(props.pinned)

  useEffect(() => {
    let enabled = false
    // check for tags
    if (props.tagList && props.tagList.length != 0) {
      enabled = props.tagList.some((key) => filterCon.keyValueMap[key]?.enabled)
    } else if (filterCon?.keyValueMap['no tag']?.enabled || !Object.keys(filterCon?.keyValueMap).length) {
      enabled = true
    }

    // check for filter
    if (filterCon.filter != '')
      enabled = (props.title?.toLowerCase().includes(filterCon.filter?.toLowerCase()) ||
        props.searchKeywords?.map(keyword => keyword?.toLowerCase()).some(searchKeyword => searchKeyword?.toLowerCase().includes(filterCon.filter?.toLocaleLowerCase())))

    setAnyEnabled(enabled)
    if (callbackContext.onChildCallback && (props.id || props.title)) callbackContext.onChildCallback((props.id || props.title), enabled)
  }, [filterCon, props.tagList])

  useEffect(() => {
    if (props.pinned!== pinned) {
      setPinned(props.pinned)
    }
  },[props.pinned])

  /*const listenOnExpand = (key) => {
    if (key === props.key) setExpand(props.toggleExpandView)
    console.log('expand ----> ', key)
  }

  // The expanded widget should go to the grid-segment and be updated based on the expandedItem state variable of the plugin.
  // The state var will work like theme dispattching is working.

  useEffect(() => {
    // TODO should be refactored to update based on state of plugin.
    props.plugin.on(props.plugin.name, 'expandGridCell', listenOnExpand)
  }, [])
  */

  return (
    <div data-values='gridCell' className='' onClick={() => {
      if (props.expandViewEl)
        props.handleExpand(!expand)
      else return
    }}>
      { anyEnabled && <div className='me-2 mt-3 pb-1 d-flex flex-column'>
        <div className='d-flex flex-grid'>
          <div className={ `${pinned ? "" : "border-light "}` + "d-flex mx-0 p-2 bg-light border border-secondary remixui_grid_cell_container " + props.classList || ''} data-id={"remixUIGS" + props.title}>
            <div className="d-flex remixui_grid_cell w-100 space-between justify-content-between flex-column">
              { !props.hideTitle && <div className='d-flex flex-row pb-1 my-1 align-items-end' style={{ minWidth: '8rem', height: '1rem' }}>
                { props.logo ? props.logoURL !== '' ?
                  <a href={props.logoURL} target="__blank">
                    <img className='remixui_grid_view_logo me-1' src={props.logo} style={{ width: '1rem', height: '1rem' }}/>
                  </a> :
                  <img className='remixui_grid_view_logo me-1' src={props.logo} style={{ width: '1rem', height: '1rem' }}/> :
                  <></>
                }
                { props.logos && props.logos.map((logo, index) => <img key={index} className='remixui_grid_view_logo me-1' src={logo} style={{ width: '1rem', height: '1rem' }}/>)}
                { props.title &&
                  <CustomTooltip
                    placement="top"
                    tooltipId={`overlay-tooltip-new${props.title}`}
                    tooltipText={ props.titleTooltip ? props.titleTooltip : props.title }
                  >
                    <label
                      className='m-0 p-0 text-uppercase align-items-left fw-bold text-truncate overflow-hidden whitespace-nowrap'
                      style={{ fontSize: '11px', lineHeight: '12px' }}
                    >{ props.title }
                    </label>
                  </CustomTooltip>
                }
              </div> }
              { props.children }
              { filterCon.showPin && <button
                className={`${pinned ? 'fas fa-toggle-on fa-lg text-dark' : 'fas fa-toggle-off fa-lg text-secondary'}` + ` fa-regular border-0 p-0 mt-2 align-self-end me-1 remixui_grid_cell_pin`}
                style={{ fontSize: 'large' }}
                data-id={`${pinned ? `${props.id}-pinned` : `${props.id}-unpinned`}`}
                onClick={async () => {
                  if (!props.pinStateCallback) setPinned(!pinned)
                  if (await props.pinStateCallback(!pinned)) setPinned(!pinned)
                }}
              ></button>}
            </div>
          </div>

          { props.tagList && <div className={`d-flex flex-column align-items-begin ` +`${filterCon.showPin ? 'remixui_grid_cell_tags' : 'remixui_grid_cell_tags_no_pin'}`}>
            { Object.keys(props.tagList).map((key) => (
              filterCon.keyValueMap[props.tagList[key]]?.enabled && (
                <CustomTooltip
                  placement="right"
                  tooltipId="pluginManagerInactiveTitleLinkToDoc"
                  tooltipClasses="text-nowrap"
                  tooltipText={props.tagList[key]}
                  key={props.tagList[key]}
                >
                  <span key={props.tagList[key]}
                    className={'remixui_grid_cell_tag bg-' + filterCon.keyValueMap[props.tagList[key]].color}
                  >
                  </span>
                </CustomTooltip>
              )
            )) }
          </div> }
          { !props.tagList && <span
            className={'px-1 remixui_grid_cell_tags'}>
          </span> }
        </div>
        { expand && <div>
          { props.expandViewEl }
        </div>
        }
      </div> }
    </div>
  )
}

export default RemixUIGridCell
