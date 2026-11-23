import React from 'react'
import { Registry } from "@remix-project/remix-lib"
import { Select } from "@remix-ui/helper"

type SelectDropdownProps = {
    value: string,
    options: {
      label: string,
      value: string
    }[],
    name: string,
    dispatch: React.Dispatch<{ type: string, payload: { name: string, value?: string } }>,
    /** Called with the newly chosen value, for side effects like analytics. */
    onChanged?: (value: string) => void
  }

const SelectDropdown = ({ value, options, name, dispatch, onChanged }: SelectDropdownProps) => {
  const handleChange = (name: string, value: string) => {
    dispatch({ type: 'SET_LOADING', payload: { name: name } })
    if (name === 'theme') {
      const themeModule = Registry.getInstance().get('themeModule').api
      const theme = themeModule.getThemes().find((theme: any) => theme.name === value)

      if (theme) {
        themeModule.switchTheme(theme.name)
        dispatch({ type: 'SET_VALUE', payload: { name: name, value: theme.name } })
      } else {
        console.error('Theme not found: ', value)
      }
    } else {
      dispatch({ type: 'SET_VALUE', payload: { name: name, value: value } })
    }
    onChanged?.(value)
  }

  // Show the option's label, not its stored value — a raw value
  // reads fine for a theme name but not for codes like "ask".
  return (
    <Select
      id={`settingsTabDropdownToggle${name}`}
      value={value}
      options={options}
      onChange={(value) => handleChange(name, value)}
      itemDataId={(o) => `settingsTabDropdownItem${o.value}`}
      placeholder={value}
    />
  )
}

export default SelectDropdown
