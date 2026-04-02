import { appPlatformTypes, platformContext, onLineContext } from '@remix-ui/app';
import React, { useEffect, useState, useRef, useReducer, useContext } from 'react' // eslint-disable-line

export type compilerVersion = {
  path: string,
  longVersion: string,
  isDownloaded: boolean
}

interface compilerDropdownProps {
  customVersions: string[],
  selectedVersion: string,
  defaultVersion: string,
  allversions: compilerVersion[],
  handleLoadVersion: (url: string) => void,
  _shouldBeAdded: (version: string) => boolean,
  onlyDownloaded: boolean
  disabled: boolean
}

export const CompilerDropdown = (props: compilerDropdownProps) => {
  const online = useContext(onLineContext)
  const platform = useContext(platformContext)
  const { customVersions, selectedVersion, defaultVersion, allversions, handleLoadVersion, _shouldBeAdded, onlyDownloaded } = props
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

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

  const getDisplayVersion = () => {
    const customMatch = customVersions.find(url => selectedVersion === url)
    if (customMatch) return 'custom'
    
    const buildMatch = allversions.find(build => (selectedVersion || defaultVersion) === build.path)
    if (buildMatch) return buildMatch.longVersion
    
    return selectedVersion || defaultVersion
  }

  const handleItemClick = (version: string) => {
    handleLoadVersion(version)
    setIsOpen(false)
  }

  return (
    <div className="relative" id="versionSelector" data-id="versionSelector" ref={dropdownRef}>
      <button
        disabled={props.disabled}
        id="dropdown-custom-components"
        className="w-full px-3 py-2 text-left bg-white dark:bg-gray-800 border border-theme rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:opacity-50 disabled:cursor-not-allowed"
        onClick={() => !props.disabled && setIsOpen(!isOpen)}
        style={{
          opacity: props.disabled ? 0.5 : 1,
          cursor: props.disabled ? 'not-allowed' : 'pointer',
          pointerEvents: props.disabled ? 'none' : 'auto'
        }}
      >
        <div className="flex justify-between items-center">
          <div className="flex-1 overflow-hidden">
            <div className={`truncate text-sm ${props.disabled ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-gray-100'}`}>
              <span data-id="selectedVersion">{getDisplayVersion()}</span>
            </div>
          </div>
          <i className={`fas fa-caret-down text-gray-500 dark:text-gray-400 transition-transform ${isOpen ? 'transform rotate-180' : ''}`}></i>
        </div>
      </button>

      {isOpen && (
        <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-theme rounded-md shadow-lg max-h-60 overflow-auto" data-id="custom-dropdown-items">
          <div className="py-1">
            {allversions.length <= 0 && (
              <button
                type="button"
                key={`default`}
                data-id='builtin'
                className="w-full px-3 py-2 text-left text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                onClick={() => handleItemClick(defaultVersion)}
              >
                <div className='flex w-full justify-between items-center'>
                  {selectedVersion === defaultVersion && <span className='fas fa-check text-green-500 mr-2'></span>}
                  <div className="flex-1 overflow-hidden">
                    <div className="truncate">
                      {defaultVersion}
                    </div>
                  </div>
                </div>
              </button>
            )}
            {allversions.length <= 0 && (
              <button
                type="button"
                key={`builtin`}
                data-id='builtin'
                className="w-full px-3 py-2 text-left text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                onClick={() => handleItemClick('builtin')}
              >
                <div className='flex w-full justify-between items-center'>
                  {selectedVersion === "builtin" && <span className='fas fa-check text-green-500 mr-2'></span>}
                  <div className="flex-1 overflow-hidden">
                    <div className="truncate">
                      builtin
                    </div>
                  </div>
                </div>
              </button>
            )}
            {customVersions.map((url, i) => (
              <button
                type="button"
                key={`custom-${i}`}
                data-id={`dropdown-item-${url}`}
                className="w-full px-3 py-2 text-left text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                onClick={() => handleItemClick(url)}
              >
                <div className='flex w-full justify-between items-center'>
                  {selectedVersion === url && <span className='fas fa-check text-green-500 mr-2'></span>}
                  <div className="flex-1 overflow-hidden">
                    <div className="truncate">
                      custom: {url}
                    </div>
                  </div>
                </div>
              </button>
            ))}
            {allversions.map((build, i) => {
              if (onlyDownloaded && !build.isDownloaded) return null
              return _shouldBeAdded(build.longVersion) ? (
                <button
                  type="button"
                  key={`soljson-${i}`}
                  data-id={`dropdown-item-${build.path}`}
                  className="w-full px-3 py-2 text-left text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  onClick={() => handleItemClick(build.path)}
                >
                  <div className='flex w-full justify-between items-center'>
                    {selectedVersion === build.path && <span className='fas fa-check text-green-500 mr-2'></span>}
                    <div className="flex-1 overflow-hidden">
                      <div className="truncate">
                        {build.longVersion}
                      </div>
                    </div>
                    {platform == appPlatformTypes.desktop ? (build.isDownloaded ? <div className='fas fa-arrow-circle-down text-green-500 ml-auto'></div> : <div className='far fa-arrow-circle-down text-gray-400'></div>) : null}
                  </div>
                </button>
              ) : null
            })}
          </div>
        </div>
      )}
    </div>
  );
}