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
    return temp.replace(/^\w/, (word: string) => word.toUpperCase())
  })
  const [links, setLinks] = useState<{
    Documentation: string
    CanDeactivate: boolean
  }>({} as {Documentation: string; CanDeactivate: boolean})
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
          tooltipText={title}
          delay={{ show: 1000, hide: 0 }}
        >
          {
            name === 'remixaiassistant' ? (
              <div
                className={`remixui_icon_ai ms-1  pt-1`}
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
                  className={``}
                  src={icon}
                  alt={name}
                />
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
