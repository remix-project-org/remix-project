import { CustomTooltip } from '@remix-ui/helper'
import React, {CSSProperties} from 'react' //eslint-disable-line
import './remix-ui-checkbox.css'
import { Placement } from 'react-bootstrap/esm/types'

/* eslint-disable-next-line */
export interface RemixUiCheckboxProps {
  onClick?: (event) => void
  onChange?: (event) => void
  label?: string
  inputType?: string
  name?: string
  checked?: boolean
  disabled?: boolean
  id?: string
  itemName?: string
  categoryId?: string
  title?: string
  visibility?: string
  display?: string
  tooltipPlacement?: Placement
  optionalClassName?: string
}

export const RemixUiCheckbox = ({
  id,
  label,
  onClick,
  inputType,
  name,
  checked,
  onChange,
  itemName,
  categoryId,
  title,
  visibility,
  optionalClassName = '',
  display = 'flex',
  disabled,
  tooltipPlacement = 'right'
}: RemixUiCheckboxProps) => {
  const childJSXWithTooltip = (
    <CustomTooltip tooltipText={title} tooltipId={`${name}Tooltip`} placement={tooltipPlacement}>
      <div
        className={`listenOnNetwork_2A0YE0 flex items-center ${optionalClassName}`}
        style={
          {
            display: display,
            alignItems: 'center',
            visibility: visibility
          } as CSSProperties
        }
        onClick={onClick}
      >
        <input id={id} type={inputType} onChange={onChange} style={{ verticalAlign: 'bottom' }} name={name} className="w-4 h-4 text-primary bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-primary focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed" checked={checked} disabled={disabled} />
        <label className="ml-1 text-sm font-medium text-gray-900 dark:text-gray-300 cursor-pointer" id={`heading${categoryId}`} style={{ paddingTop: '0.15rem' }} aria-disabled={disabled} htmlFor={id}>
          {name ? <div className="font-bold">{itemName}</div> : ''}
          {label}
        </label>
      </div>
    </CustomTooltip>
  )
  const childJSX = (
    <div
      className="listenOnNetwork_2A0YE0 flex items-center"
      style={
        {
          display: display,
          alignItems: 'center',
          visibility: visibility
        } as CSSProperties
      }
      onClick={onClick}
    >
      <input id={id} type={inputType} onChange={onChange} style={{ verticalAlign: 'bottom' }} name={name} className="w-4 h-4 text-primary bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-primary focus:ring-2" checked={checked} />
      <label className="ml-1 text-sm font-medium text-gray-900 dark:text-gray-300 cursor-pointer" id={`heading${categoryId}`} style={{ paddingTop: '0.15rem' }}>
        {name ? <div className="font-bold">{itemName}</div> : ''}
        {label}
      </label>
    </div>
  )
  return title ? childJSXWithTooltip : childJSX
}

export default RemixUiCheckbox
