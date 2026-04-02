import React, { useState } from 'react'
import { OverlayTrigger, Popover } from 'react-bootstrap'
import { TooltipPopupProps } from '../types'
import './tooltip-popup.module.css'

const popover = (title?: string, content?: string | React.ReactNode) => (
  <div className="relative z-10 max-w-sm bg-white dark:bg-gray-900 border border-theme rounded-lg shadow-lg">
    <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border-b border-theme rounded-t-lg">
      <h3 className="font-semibold text-gray-900 dark:text-gray-100">{title || 'Tooltip'}</h3>
    </div>
    <div className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300">{content}</div>
  </div>
)

export function TooltipPopup(props: TooltipPopupProps) {
  const [show, setShow] = useState<boolean>(false)

  return (
    <OverlayTrigger
      trigger="click"
      placement={'bottom'}
      overlay={popover(props.title, props.children || props.content)}
      show={show}
      onToggle={(nextShow) => {
        setShow(nextShow)
      }}
    >
      <i className={`${props.icon} remixui_menuicon pr-0 mr-2`}></i>
    </OverlayTrigger>
  )
}

export default TooltipPopup
