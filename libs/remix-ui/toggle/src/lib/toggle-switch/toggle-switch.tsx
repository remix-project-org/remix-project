import React from 'react'
import { FormattedMessage } from 'react-intl'

import './toggle-switch.css'
import { CustomTooltip } from '@remix-ui/helper'

interface IToggleSwitch {
  id: string
  size?: string // 'sm' for the small switch; any other value (lg, 2xl etc) gives the regular one
  tone?: 'primary' | 'ai' // colour of the track when on
  label?: React.ReactNode // text shown after the switch, inside the same clickable button
  tooltipTextId?: string // formatted message id like "remixApp.mpOp1Tooltip" etc
  disabled?: boolean
  isOn?: boolean
  onClick?: () => void
}
export const ToggleSwitch = (props: IToggleSwitch) => {
  const { id, size, tone, label, tooltipTextId, disabled, onClick } = props
  const isOn = props.isOn !== false

  const toggle = (
    <button
      type="button"
      role="switch"
      aria-checked={isOn}
      data-id={ id + "Switch"}
      id={id}
      className={`remix-switch ${size === 'sm' ? 'remix-switch-sm' : ''} ${tone === 'ai' ? 'remix-switch-ai' : ''}`}
      onClick={() => { if (!disabled) onClick()}}
      disabled = {disabled || false}
    >
      <span className="remix-switch-track"><span className="remix-switch-knob"></span></span>
      {label && <span className="remix-switch-label">{label}</span>}
    </button>
  )

  return tooltipTextId ? (
    <CustomTooltip
      placement={"auto"}
      tooltipId={ id + "Tooltip"}
      tooltipClasses="text-nowrap"
      tooltipText={<FormattedMessage id={tooltipTextId} />}
    >
      {toggle}
    </CustomTooltip>
  ) : toggle
}

export default ToggleSwitch
