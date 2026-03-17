import React, { Fragment, useContext, useEffect, useReducer, useRef, useState } from 'react'
import { Plugin } from '@remixproject/engine'
import './remix-ui-vertical-icons-panel.css'
import IconList from './components/IconList'
import Home from './components/Home'
import { verticalScrollReducer } from './reducers/verticalScrollReducer'
import { Chevron } from './components/Chevron'
import { IconRecord } from './types'
import { AppContext, onLineContext } from '@remix-ui/app'
import { CustomTooltip } from '@remix-ui/helper'
import { Registry } from '@remix-project/remix-lib'
import { desktopConnectionType } from '@remix-api'

export interface RemixUiVerticalIconsPanelProps {
  verticalIconsPlugin: Plugin
  icons: IconRecord[]
}

const initialState = {
  scrollHeight: 0,
  clientHeight: 0,
  scrollState: false,
}

const RemixUiVerticalIconsPanel = ({ verticalIconsPlugin, icons }: RemixUiVerticalIconsPanelProps) => {
  const scrollableRef = useRef<any>()
  const iconPanelRef = useRef<any>()
  const [activateScroll, dispatchScrollAction] = useReducer(verticalScrollReducer, initialState)
  const [theme, setTheme] = useState<string>('dark')
  const online = useContext(onLineContext)
  const appContext = useContext(AppContext)

  const evaluateScrollability = () => {
    dispatchScrollAction({
      type: 'resize',
      payload: {
        scrollHeight: scrollableRef.current?.scrollHeight,
        clientHeight: scrollableRef.current?.clientHeight,
        scrollState: false,
      },
    })
  }

  useEffect(() => {
    window.addEventListener('resize', evaluateScrollability)
    evaluateScrollability()
    return () => {
      window.removeEventListener('resize', evaluateScrollability)
    }
  }, [])

  useEffect(() => {
    evaluateScrollability()
  }, [icons, theme])

  useEffect(() => {
    verticalIconsPlugin.call('theme', 'currentTheme').then((th: any) => {
      setTheme(th.quality)
    })
    verticalIconsPlugin.on('theme', 'themeChanged', (th: any) => {
      setTheme(th.quality)
    })
    return () => {
      verticalIconsPlugin.off('theme', 'themeChanged')
    }
  }, [])

  async function itemContextAction(e: any, name: string, documentation: string) {
    verticalIconsPlugin.call('manager', 'deactivatePlugin', name)
  }

  if (appContext.appState.connectedToDesktop !== desktopConnectionType.disabled) {
    return (
      <>
        <div id="iconsP" className="h-100">
          <div className="remixui_icons d-flex flex-column remixui_icons_height" ref={iconPanelRef}>
            <Home disableClick={true} verticalIconPlugin={verticalIconsPlugin} />
          </div>
        </div>
      </>
    )
  }

  return (
    <div id="iconsP" className="h-100">
      <div className="remixui_icons d-flex flex-column remixui_icons_height" ref={iconPanelRef}>
        {/* <Home verticalIconPlugin={verticalIconsPlugin} /> */}
        <div className={scrollableRef.current && scrollableRef.current.scrollHeight > scrollableRef.current.clientHeight ? 'remixui_default-icons-container remixui_requiredSection' : activateScroll && activateScroll.scrollState ? 'remixui_default-icons-container remixui_requiredSection' : 'remixui_requiredSection'}>
          <IconList theme={theme} icons={icons.filter((p) => p.isRequired && p.profile.name !== 'pluginManager')} verticalIconsPlugin={verticalIconsPlugin} itemContextAction={itemContextAction} />
          {scrollableRef.current && scrollableRef.current.scrollHeight > scrollableRef.current.clientHeight ? <Chevron direction="up" divElementRef={scrollableRef} cssRule={'fa fa-chevron-up remixui_icon-chevron my-0'} /> : null}
        </div>
        <div id="remixuiScrollable" className={scrollableRef.current && scrollableRef.current.scrollHeight > scrollableRef.current.clientHeight ? 'remixui_default-icons-container remixui_scrollable-container remixui_scrollbar remixui_hide-scroll' : activateScroll && activateScroll.scrollState ? 'remixui_default-icons-container remixui_scrollable-container remixui_scrollbar remixui_hide-scroll' : 'remixui_scrollable-container remixui_scrollbar remixui_hide-scroll'} ref={scrollableRef}>
          <IconList
            theme={theme}
            icons={icons.filter((p) => {
              return !p.isRequired && p.profile.name !== 'settings' && p.profile.name !== 'walkthrough'
            })}
            verticalIconsPlugin={verticalIconsPlugin}
            itemContextAction={itemContextAction}
          />
          <IconList theme={theme} icons={icons.filter((p) => p.profile.name === 'settings' || p.profile.name === 'walkthrough' || p.profile.name === 'pluginManager')} verticalIconsPlugin={verticalIconsPlugin} itemContextAction={itemContextAction} />
        </div>
        <div className="remixui_default-icons-container border-0 pb-3">
          {scrollableRef.current && scrollableRef.current.scrollHeight > scrollableRef.current.clientHeight ? <Chevron divElementRef={scrollableRef} direction="down" cssRule={'fa fa-chevron-down remixui_icon-chevron my-0'} /> : null}
          {Registry.getInstance().get('platform').api.isDesktop() ? (
            online ? (
              <CustomTooltip placement="top" tooltipText={'You are online'}>
                <i className="fa-solid fa-wifi text-success p-2"></i>
              </CustomTooltip>
            ) : (
              <CustomTooltip placement="top" tooltipText={'You are offline'}>
                <i className="fa-solid fa-wifi-exclamation text-danger p-2"></i>
              </CustomTooltip>
            )
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default RemixUiVerticalIconsPanel
