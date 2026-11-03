import { appPlatformTypes, platformContext, onLineContext } from '@remix-ui/app';

;
import React, { useEffect, useState, useRef, useReducer, useContext } from 'react' // eslint-disable-line
import { Dropdown } from 'react-bootstrap';
import { useIntl } from 'react-intl'
import { CompilerMenu, CompilerMenuToggle } from './compiler-menu';

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
  const intl = useIntl()
  // the newest release (the list is newest first, after "builtin")
  const latestPath = allversions.find((build) => build.path !== 'builtin' && !build.longVersion.includes('nightly'))?.path
  const latest = <span className="sc-muted ms-1">({intl.formatMessage({ id: 'solidity.latest' })})</span>
  return (
    <Dropdown id="versionSelector" data-id="versionSelector">
      <Dropdown.Toggle
        disabled={props.disabled}
        as={CompilerMenuToggle}
        id="dropdown-custom-components"
        className="btn btn-light w-100 d-inline-block border form-select"
        icon={null}
      >
        <div style={{ flexGrow: 1, overflow: 'hidden', display:'flex', justifyContent:'left' }}>
          <div className={`text-truncate font-sm ${props.disabled ? 'text-muted' : ''}`}>
            {customVersions.map((url, i) => {
              if (selectedVersion === url) return (<span data-id="selectedVersion" key={i}>custom</span>)
            })}
            {allversions.map((build, i) => {

              if ((selectedVersion || defaultVersion) === build.path) {
                return (<span key={i}><span data-id="selectedVersion">{build.longVersion}</span>{build.path === latestPath && latest}</span>)
              }
            })}
          </div>
        </div>
      </Dropdown.Toggle>

      <Dropdown.Menu as={CompilerMenu} className="w-100 form-select overflow-hidden" data-id="custom-dropdown-items">
        {allversions.length <= 0 && (
          <Dropdown.Item
            key={`default`}
            data-id='builtin'
            onClick={() => {}}
          >
            <div className='d-flex w-100 justify-content-between'>
              {selectedVersion === defaultVersion ? <span className='fas fa-check text-success me-2'></span> : null}
              <div style={{ flexGrow: 1, overflow: 'hidden' }}>
                <div className="text-truncate">
                  {defaultVersion}
                </div>
              </div>
            </div>
          </Dropdown.Item>
        )}
        {allversions.length <= 0 && (
          <Dropdown.Item
            key={`builtin`}
            data-id='builtin'
            onClick={() => {}}
          >
            <div className='d-flex w-100 justify-content-between'>
              {selectedVersion === "builtin" ? <span className='fas fa-check text-success me-2'></span> : null}
              <div style={{ flexGrow: 1, overflow: 'hidden' }}>
                <div className="text-truncate">
                  builtin
                </div>
              </div>
            </div>
          </Dropdown.Item>
        )}
        {customVersions.map((url, i) => (
          <Dropdown.Item
            key={`custom-${i}`}
            data-id={`dropdown-item-${url}`}
            onClick={() => handleLoadVersion(url)}
          >
            <div className='d-flex w-100 justify-content-between'>
              {selectedVersion === url ? <span className='fas fa-check text-success me-2'></span> : null}
              <div style={{ flexGrow: 1, overflow: 'hidden' }}>
                <div className="text-truncate">
                  custom: {url}
                </div>
              </div>
            </div>
          </Dropdown.Item>
        ))}
        {allversions.map((build, i) => {
          if (onlyDownloaded && !build.isDownloaded) return null
          return _shouldBeAdded(build.longVersion) ? (
            <Dropdown.Item
              key={`soljson-${i}`}
              data-id={`dropdown-item-${build.path}`}
              onClick={() => handleLoadVersion(build.path)}
            >
              <div className='d-flex w-100 justify-content-between'>
                {selectedVersion === build.path ? <span className='fas fa-check text-success me-2'></span> : null}
                <div style={{ flexGrow: 1, overflow: 'hidden' }}>
                  <div className="text-truncate">
                    {build.longVersion}{build.path === latestPath && latest}
                  </div>
                </div>
                {platform == appPlatformTypes.desktop ? (build.isDownloaded ? <div className='fas fa-arrow-circle-down text-success ms-auto'></div> : <div className='far fa-arrow-circle-down'></div>) : null}
              </div>
            </Dropdown.Item>
          ) : null
        })}
      </Dropdown.Menu>
    </Dropdown>
  );
}