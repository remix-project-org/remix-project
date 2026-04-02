/* eslint-disable @typescript-eslint/no-unused-vars */
import React from 'react'
import { useContext } from 'react'
import FiltersContext from ".././filtersContext"

interface CustomCheckboxProps {
  label: string
  color?: string
}

export const CustomCheckbox = (props: CustomCheckboxProps) => {
  const filterCon = useContext(FiltersContext)
  let textColor = props.color
  let defChecked = true
  if (filterCon.keyValueMap[props.label]) defChecked = filterCon.keyValueMap[props.label].enabled
  if (!textColor || textColor == '') textColor = filterCon.keyValueMap[props.label].color

  return (
    <div id={textColor + props.label}
      className="h-80 mx-1 items-center form-check"
      style={{ minWidth: '4rem' }}
    >
      <input
        className="form-check-input"
        id={"GVCheckbox" + props.label}
        defaultChecked={defChecked}
        onChange={e => {
          filterCon.updateValue(props.label, e.target.checked, textColor)}}
        type="checkbox"
      />
      <label
        className={"form-check-label whitespace-nowrap text-" + textColor}
        style={{ paddingTop: '0.125rem' }}
        htmlFor={"GVCheckbox" + props.label}
        data-id={"GVCheckboxLabel" + props.label}
      >
        { props.label }
      </label>
    </div>
  )
}

export default CustomCheckbox
