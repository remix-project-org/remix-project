import React, { useState, useRef, useEffect } from 'react'
import { Registry } from "@remix-project/remix-lib"

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
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

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
    setIsOpen(false)
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        className="w-full px-3 py-2 text-left bg-white dark:bg-gray-800 border border-theme rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
        data-id={`settingsTabDropdownToggle${name}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex justify-between items-center">
          <span className="block truncate text-gray-700 dark:text-gray-300" data-id="selectedVersion">
            {value}
          </span>
          <i className={`fas fa-caret-down text-gray-500 dark:text-gray-400 transition-transform ${isOpen ? 'transform rotate-180' : ''}`}></i>
        </div>
      </button>

      {isOpen && (
        <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-theme rounded-md shadow-lg" data-id="custom-dropdown-items">
          <div className="py-1 max-h-60 overflow-auto">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                className="w-full px-3 py-2 text-left text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                onClick={() => handleChange(name, option.value)}
                data-id={`settingsTabDropdownItem${option.value}`}
              >
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default SelectDropdown