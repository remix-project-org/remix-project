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
    <div className="d-flex remixui_home_envButton">
      <button
        className="btn border-secondary d-flex flex-column  pb-2 text-nowrap justify-content-center align-items-center me-2 remixui_home_envButton"
        data-id={'landingPageStart' + envText}
        onClick={() => callback()}
      >
        <img className="px-2 mb-2 align-self-center remixui_home_envLogo" id={envID} src={imgPath} alt="" style={{ filter: themeFilter.filter }} />
        <div className="mb-2 h-100 d-flex flex-column">
          <label className="text-uppercase text-dark remixui_home_cursorStyle">{envText}</label>
          <div className="remixui_home_envLogoDescription">{description}</div>
        </div>
      </button>
      {l2 && <label className="bg-light mx-1 px-1 mb-0 mx-2 position-absolute remixui_home_l2Label">L2</label>}
      { maintainedBy?.toLowerCase() === 'remix' ? (
        <CustomTooltip placement="bottom" tooltipId="overlay-tooltip-by-remix" tooltipText={<FormattedMessage id="home.maintainedByRemix" />}>
          <i className="bg-light text-success mx-1 px-1 mb-0 mx-2 position-absolute remixui_home_maintainedLabel fa-solid fa-shield-halved"></i>
        </CustomTooltip>) :
        maintainedBy ?
          (<CustomTooltip placement="bottom" tooltipId="overlay-tooltip-external" tooltipText={<FormattedMessage id="home.maintainedByExternal" values={{ maintainer: maintainedBy }} />}>
            <i aria-hidden="true" className="bg-light mx-1 px-1 mb-0 mx-2 position-absolute remixui_home_maintainedLabel text-secondary fa-solid fa-shield-halved"></i>
          </CustomTooltip>)
          : (<CustomTooltip placement="bottom" tooltipId="overlay-tooltip-external" tooltipText={<FormattedMessage id="panel.maintainedExternally" />}>
            <i aria-hidden="true" className="bg-light mx-1 px-1 mb-0 mx-2 position-absolute remixui_home_maintainedLabel text-secondary fa-solid fa-shield-halved"></i>
          </CustomTooltip>)
      }
    </div>
  )
}

export default PluginButton
