import VerticalIconsContextMenu from '../vertical-icons-context-menu'
// eslint-disable-next-line no-use-before-define
import React, { Fragment, SyntheticEvent, useEffect, useReducer, useRef, useState } from 'react'
import { useIntl } from 'react-intl'
import Badge from './Badge'
import { iconBadgeReducer, IconBadgeReducerAction } from '../reducers/iconBadgeReducer'
import { Plugin } from '@remixproject/engine'
import { IconRecord } from '../types'
import { CustomTooltip } from '@remix-ui/helper'

export interface IconStatus {
  key: string | number
  title: string
  type: 'danger' | 'error' | 'success' | 'info' | 'warning'
  pluginName?: string
}

export interface BadgeStatus extends IconStatus {
  text: string | number
}

interface IconProps {
  verticalIconPlugin: Plugin
  iconRecord: IconRecord
  contextMenuAction: (evt: any, profileName: string, documentation: string) => void
  theme: string
}

const initialState = {
  text: '',
  key: '',
  title: '',
  type: null,
  pluginName: ''
}

const Icon = ({ iconRecord, verticalIconPlugin, contextMenuAction, theme }: IconProps) => {
  const intl = useIntl()
  const { displayName, name, icon, documentation } = iconRecord.profile
  const [title] = useState(() => {
    const temp = name ? intl.formatMessage({ id: `${name}.displayName`, defaultMessage: displayName || name }) : null
    // @ts-ignore
    return temp.replace(/^\w/, (word: string) => word.toUpperCase())
  })
  const [links, setLinks] = useState<{
    Documentation: string
    CanDeactivate: boolean
  }>({} as {Documentation: string; CanDeactivate: boolean})
  // @ts-ignore
  const [badgeStatus, dispatchStatusUpdate] = useReducer(iconBadgeReducer, initialState)
  // @ts-ignore
  const [pageX, setPageX] = useState<number>(null)
  // @ts-ignore
  const [pageY, setPageY] = useState<number>(null)
  const [showContext, setShowContext] = useState(false)
  const [canDeactivate] = useState(false)
  const iconRef = useRef<any>(null)

  const handleContextMenu = (e: SyntheticEvent & PointerEvent) => {
    const deactivationState = iconRecord.canbeDeactivated
    if (documentation && documentation.length > 0 && deactivationState) {
      setLinks({ Documentation: documentation, CanDeactivate: deactivationState })
    } else {
      //@ts-ignore
      setLinks({ Documentation: documentation, CanDeactivate: deactivationState })
    }
    setShowContext(false)
    setPageX(e.pageX)
    setPageY(e.pageY)
    setShowContext(true)
  }
  function closeContextMenu() {
    setShowContext(false)
  }

  useEffect(() => {
    verticalIconPlugin.on(name, 'statusChanged', (iconStatus: IconStatus) => {
      iconStatus.pluginName = name
      const action: IconBadgeReducerAction = {
        type: name,
        payload: { status: iconStatus, verticalIconPlugin: verticalIconPlugin }
      }
      //@ts-ignore
      dispatchStatusUpdate(action)
    })
    return () => {
      verticalIconPlugin.off(name, 'statusChanged')
    }
  }, [])

  const stylePC = iconRecord.active ? 'flex-start' : 'center'
  return (
    <>
      <div className='d-flex py-1' style={{ width: 'auto', placeContent: stylePC }}>
        <div
          className={`pt-1 ${iconRecord.active ? 'bg-primary' : 'bg-transparent'}`}
          style={{ width: "6px", height: "36px", position: 'relative', borderRadius: '24%' }}
        ></div>
        <CustomTooltip
          placement={name === 'settings' ? 'right' : name === 'search' ? 'top' : name === 'udapp' ? 'bottom' : 'top'}
          tooltipText={title === 'Help & Guides' ? `${title.split('&')[1]}` : title}
          delay={{ show: 1000, hide: 0 }}
        >
          {
            name === 'remixaiassistant' ? (
              <div
                className={`remixui_icon_ai pt-1`}
                onClick={() => {
                  if (iconRecord.pinned) {
                    verticalIconPlugin.call('rightSidePanel', 'highlight')
                  } else {
                    (verticalIconPlugin as any).toggle(name)
                  }
                }}
                {...{ plugin: name }}
                onContextMenu={(e: any) => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleContextMenu(e)
                }}
                data-id={`verticalIconsKind${name}`}
                id={`verticalIconsKind${name}`}
                ref={iconRef}
              >
                <svg
                  data-id={iconRecord.active ? `selected` : ''}
                  width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"
                  aria-label={name}
                >
                  <path d="M22.4712 0.753375C22.9245 0.711794 23.2873 1.07432 23.2465 1.52779C23.0693 3.49809 22.2893 8.56115 18.8764 12.0004C22.289 15.4397 23.0693 20.5018 23.2465 22.4721C23.2873 22.9256 22.9246 23.2881 22.4712 23.2465C20.5114 23.0668 15.3236 22.2784 11.9145 18.8432C8.50536 22.2788 3.48849 23.0668 1.52877 23.2465C1.07537 23.2881 0.712585 22.9256 0.753378 22.4721C0.930616 20.5018 1.71093 15.4397 5.1235 12.0004C1.71061 8.56115 0.930607 3.49809 0.753378 1.52779C0.71266 1.07434 1.07542 0.711826 1.52877 0.753375C3.48849 0.93311 8.67724 1.72116 12.0864 5.1567C15.4955 1.72158 20.5115 0.933113 22.4712 0.753375ZM9.53365 8.25045L7.00045 15.7504H8.66353L9.20846 14.0395H11.8579L12.4018 15.7504H14.0649L11.5337 8.25045H9.53365ZM14.9477 8.25045V15.7504H16.5004V8.25045H14.9477ZM10.5629 9.96431L11.4653 12.8022H9.60201L10.5053 9.96431H10.5629Z" fill="var(--custom-ai-color)" />
                </svg>
                <Badge badgeStatus={badgeStatus} />
              </div>
            ) : (
              <div
                className={`remixui_icon m-0  pt-1`}
                onClick={() => {
                  if (iconRecord.pinned) {
                    verticalIconPlugin.call('rightSidePanel', 'highlight')
                  } else {
                    (verticalIconPlugin as any).toggle(name)
                  }
                }}
                {...{ plugin: name }}
                onContextMenu={(e: any) => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleContextMenu(e)
                }}
                data-id={`verticalIconsKind${name}`}
                id={`verticalIconsKind${name}`}
                ref={iconRef}
              >
                <img
                  data-id={iconRecord.active ? `selected` : ''}
                  className={`${theme === 'dark' ? 'invert' : ''} ${theme} remixui_image ${iconRecord.active || iconRecord.pinned ? `selected-${theme}-${name}` : ''}`}
                  src={icon}
                  alt={name}
                />
                <Badge badgeStatus={badgeStatus} />
              </div>
            )
          }
        </CustomTooltip>
        {showContext ? (
          <VerticalIconsContextMenu
            pageX={pageX}
            pageY={pageY}
            links={links}
            profileName={name}
            hideContextMenu={closeContextMenu}
            canBeDeactivated={canDeactivate}
            verticalIconPlugin={verticalIconPlugin}
            contextMenuAction={contextMenuAction}
          />
        ) : null}
        <div
          className={`pt-1 ${iconRecord.pinned ? 'bg-primary' : 'bg-transparent'}`}
          style={{ width: "6px", height: "36px", position: 'relative', borderRadius: '24%', marginLeft: 'auto' }}
        ></div>
      </div>
    </>
  )
}

export default Icon
