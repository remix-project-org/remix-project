import React, { useEffect, useState, Fragment } from 'react'
import { OverlayTrigger, Popover } from 'react-bootstrap'
import { CustomTooltipType } from '../../types/customtooltip'
import '../css/helper.css'

export function CustomTooltip({ children, placement, tooltipId, tooltipClasses, tooltipText, tooltipTextClasses, delay, hide, show }: CustomTooltipType) {
  // Global tooltip disable flag for E2E tests (__IS_E2E_TEST__ is set by the
  // Electron preload before any page JS runs; REMIX_DISABLE_TOOLTIPS is set by hideToolTips)
  const [globalDisable, setGlobalDisable] = useState(
    (window as any).REMIX_DISABLE_TOOLTIPS === true || !!(window as any).__IS_E2E_TEST__
  )

  // Listen for custom event when tooltip disable flag changes
  useEffect(() => {
    const handleTooltipToggle = (event: CustomEvent) => {
      setGlobalDisable(event.detail.disabled)
    }

    window.addEventListener('remix-tooltip-toggle', handleTooltipToggle as EventListener)
    return () => {
      window.removeEventListener('remix-tooltip-toggle', handleTooltipToggle as EventListener)
    }
  }, [tooltipId])

  if (typeof tooltipText !== 'string') {
    tooltipText = React.cloneElement(tooltipText, {
      className: ' text-wrap p-1 px-2 '
    })
  }

  // If hidden or globally disabled, just return children without tooltip
  if (hide || globalDisable) {
    return <>{children}</>
  }

  return (
    <OverlayTrigger
      show={show}
      trigger={undefined}
      placement={placement}
      overlay={
        <Popover id={`popover-positioned-${placement}`} className="remixui-tooltip-popover" style={{ zIndex: 10000 }}>
          <Popover.Body
            id={!tooltipId ? (typeof tooltipText === 'string' ? `${tooltipText}Tooltip` : undefined) : tooltipId}
            style={{ minWidth: 'fit-content' }}
            className={`text-wrap p-1 px-2 w-100 ${tooltipClasses || ''}`}
          >
            {typeof tooltipText === 'string' ? <span className={'text-wrap p-1 px-2 ' + tooltipTextClasses}>{tooltipText}</span> : tooltipText}
          </Popover.Body>
        </Popover>
      }>
      {children}
    </OverlayTrigger>
  )
}
