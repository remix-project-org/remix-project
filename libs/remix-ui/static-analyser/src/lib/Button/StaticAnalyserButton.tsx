import { CustomTooltip } from '@remix-ui/helper'
import React from 'react' //eslint-disable-line

interface StaticAnalyserButtonProps {
  onClick: (event) => void
  buttonText: string
  disabled?: boolean
  title?: string
  classList?: string
}

const StaticAnalyserButton = ({ onClick, buttonText, disabled, title, classList }: StaticAnalyserButtonProps) => {
  const defaultStyle = 'btn btn-sm btn-block btn-primary'
  const newclassList =
    disabled && classList.length > 0
      ? `${classList} disabled`
      : classList.length === 0 && disabled
        ? `${defaultStyle} disabled`
        : classList.length > 0
          ? `${classList}`
          : defaultStyle

  const buttonWithoutTooltip = () => (
    <button id="staticAnalysisRunBtn" className={newclassList} disabled={disabled} onClick={onClick}>
      <span className="pl-3 pr-4">{buttonText}</span>
    </button>
  )

  const buttonWithTooltip = () => (
    <CustomTooltip placement={'auto-end'} tooltipId="ssaRunButtonTooltip" tooltipClasses="whitespace-nowrap" tooltipText={title}>
      <div id="staticAnalysisWrapper" className={`${newclassList} p-0`}>
        <button id="staticAnalysisRunBtn" className={newclassList} disabled={disabled} onClick={onClick} style={{ pointerEvents: 'none', color: 'white' }}>
          <span className="pl-3 pr-4">{buttonText}</span>
        </button>
      </div>
    </CustomTooltip>
  )

  return title && title.length > 0 ? buttonWithTooltip() : buttonWithoutTooltip()
}

export default StaticAnalyserButton
