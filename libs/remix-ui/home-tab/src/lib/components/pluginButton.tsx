/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useContext } from 'react'
import { FormattedMessage } from 'react-intl'
import { ThemeContext } from '../themeContext'
import { CustomTooltip } from '@remix-ui/helper'
interface PluginButtonProps {
  imgPath: string
  envID: string
  envText: string
  callback: any
  l2?: boolean
  description: string
  maintainedBy?: string
}

function PluginButton({ imgPath, envID, envText, callback, l2, description, maintainedBy }: PluginButtonProps) {
  const themeFilter = useContext(ThemeContext)

  return (
    <div className="flex relative remixui_home_envButton">
      <button
        className="flex flex-col items-center justify-center border border-secondary rounded-md pb-2 px-3 mr-2 min-w-0 whitespace-nowrap hover:border-secondary/80 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors remixui_home_envButton"
        data-id={'landingPageStart' + envText}
        onClick={() => callback()}
      >
        <img className="px-2 mb-2 self-center remixui_home_envLogo" id={envID} src={imgPath} alt="" style={{ filter: themeFilter.filter }} />
        <div className="mb-2 h-full flex flex-col">
          <label className="uppercase text-gray-800 dark:text-gray-200 cursor-pointer remixui_home_cursorStyle">{envText}</label>
          <div className="text-xs text-gray-600 dark:text-gray-400 remixui_home_envLogoDescription">{description}</div>
        </div>
      </button>
      {l2 && <label className="bg-light mx-1 px-1 mb-0 mx-2 absolute top-0 right-0 text-xs rounded remixui_home_l2Label">L2</label>}
      { maintainedBy?.toLowerCase() === 'remix' ? (
        <CustomTooltip placement="bottom" tooltipId="overlay-tooltip-by-remix" tooltipText={<FormattedMessage id="home.maintainedByRemix" />}>
          <i className="bg-light text-success mx-1 px-1 mb-0 mx-2 absolute top-0 right-0 fa-solid fa-shield-halved remixui_home_maintainedLabel"></i>
        </CustomTooltip>) :
        maintainedBy ?
          (<CustomTooltip placement="bottom" tooltipId="overlay-tooltip-external" tooltipText={<FormattedMessage id="home.maintainedByExternal" values={{ maintainer: maintainedBy }} />}>
            <i aria-hidden="true" className="bg-light text-secondary mx-1 px-1 mb-0 mx-2 absolute top-0 right-0 fa-solid fa-shield-halved remixui_home_maintainedLabel"></i>
          </CustomTooltip>)
          : (<CustomTooltip placement="bottom" tooltipId="overlay-tooltip-external" tooltipText={<FormattedMessage id="panel.maintainedExternally" />}>
            <i aria-hidden="true" className="bg-light text-secondary mx-1 px-1 mb-0 mx-2 absolute top-0 right-0 fa-solid fa-shield-halved remixui_home_maintainedLabel"></i>
          </CustomTooltip>)
      }
    </div>
  )
}

export default PluginButton
