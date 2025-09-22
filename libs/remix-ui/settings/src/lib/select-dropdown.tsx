import React from 'react'
import { Registry } from "@remix-project/remix-lib"
import { CustomMenu, CustomToggle } from "@remix-ui/helper"
import { Dropdown } from "react-bootstrap"

type SelectDropdownProps = {
    value: string,
    options: {
      label: string,
      value: string
    }[],
    name: string,
    dispatch: React.Dispatch<{ type: string, payload: { name: string, value?: string } }>
  }

const SelectDropdown = ({ value, options, name, dispatch }: SelectDropdownProps) => {
  const handleChange = (name: string, value: string) => {
    dispatch({ type: 'SET_LOADING', payload: { name: name } })
    if (name === 'theme') {
      const themeModule = Registry.getInstance().get('themeModule').api
      const theme = themeModule.getThemes().find((theme) => theme.name === value)

      if (theme) {
        themeModule.switchTheme(theme.name)
        dispatch({ type: 'SET_VALUE', payload: { name: name, value: theme.name } })
      } else {
        console.error('Theme not found: ', value)
      }
    } else {
      dispatch({ type: 'SET_VALUE', payload: { name: name, value: value } })
    }
  }

  return (
    <Dropdown>
      <Dropdown.Toggle as={CustomToggle} className="btn-light btn-block w-100 d-inline-block border border-secondary form-control" icon="fas fa-caret-down text-secondary" useDefaultIcon={false}>
        <div style={{ flexGrow: 1, overflow: 'hidden', display:'flex', justifyContent:'left' }} data-id={`settingsTabDropdownToggle${name}`}>
          <div className="text-truncate text-secondary">
            {<span data-id="selectedVersion">{value}</span>}
          </div>
        </div>
      </Dropdown.Toggle>

      <Dropdown.Menu as={CustomMenu} className="w-100 custom-dropdown-items overflow-hidden bg-light" data-id="custom-dropdown-items">
        {
          options.map((option) => (
            <Dropdown.Item key={option.value} onClick={() => handleChange(name, option.value)} data-id={`settingsTabDropdownItem${option.value}`}>
              <span>{option.label}</span>
            </Dropdown.Item>
          ))
        }
      </Dropdown.Menu>
    </Dropdown>
  )
}

export default SelectDropdown