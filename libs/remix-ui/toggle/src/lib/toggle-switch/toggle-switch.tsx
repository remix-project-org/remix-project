import React, { useState } from 'react'
import { FormattedMessage } from 'react-intl'

import './toggle-switch.css'
import { CustomTooltip } from '@remix-ui/helper'

interface IToggleSwitch {
  id: string
  onstyle?: string // text-ai, text-primary etc
  offstyle?: string // text-ai, text-secondary etc
  size?: string // lg,xl,2xl etc
  tooltipTextId?: string // formatted message id like "remixApp.mpOp1Tooltip" etc
  disabled?: boolean
  isOn?: boolean
  onClick?: () => void
}
export const ToggleSwitch = (props: IToggleSwitch) => {
  const { id, tooltipTextId, disabled, onClick } = props
  let { onstyle, offstyle, size, isOn } = props
  size = size || 'lg'
  onstyle = onstyle || 'text-primary'
  offstyle = offstyle || 'text-secondary'
  isOn = isOn === false ? isOn : true

  const childJSXWithTooltip = (
    <CustomTooltip
      placement={"auto"}
      tooltipId={ id + "Tooltip"}
      tooltipClasses="whitespace-nowrap"
      tooltipText={<FormattedMessage id={tooltipTextId} />}
    >
      <button
        data-id={ id + "Switch"}
        id={id}
        className={`btn ${isOn ? onstyle : offstyle}`}
        onClick={() => { if (!disabled) onClick()}}
        disabled = {disabled || false}
      >
        { isOn ? <i className={`fas fa-toggle-on ${size ? `fa-${size}` : "fa-lg"}`}></i> : <i className={`fas fa-toggle-off ${size ? `fa-${size}` : "fa-lg"}`}></i> }
      </button>
    </CustomTooltip>
  )

  const childJSXWithoutTooltip = (
    <button
      data-id={ id + "Switch"}
      id={id}
      className={`btn ${isOn ? onstyle : offstyle}`}
      onClick={() => { if (!disabled) onClick()}}
      disabled = {disabled || false}
    >
      { isOn ? <i className={`fas fa-toggle-on ${size ? `fa-${size}` : "fa-lg"}`}></i> : <i className={`fas fa-toggle-off ${size ? `fa-${size}` : "fa-lg"}`}></i> }
    </button>
  )

  return tooltipTextId ? childJSXWithTooltip : childJSXWithoutTooltip
}

export default ToggleSwitch
