import { appPlatformTypes, platformContext } from '@remix-ui/app'
import React, { useContext } from 'react'
import { Dropdown } from 'react-bootstrap'
import { useIntl } from 'react-intl'
import { PickerToggle } from './picker'

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
  const platform = useContext(platformContext)
  const { customVersions, selectedVersion, defaultVersion, allversions, handleLoadVersion, _shouldBeAdded, onlyDownloaded } = props
  const intl = useIntl()
  // the newest release (the list is newest first, after "builtin")
  const latestPath = allversions.find((build) => build.path !== 'builtin' && !build.longVersion.includes('nightly'))?.path
  const latest = <span className="sc-muted ms-1">({intl.formatMessage({ id: 'solidity.latest' })})</span>
  return (
    <Dropdown className="w-100" id="versionSelector" data-id="versionSelector">
      <Dropdown.Toggle disabled={props.disabled} as={PickerToggle} id="dropdown-custom-components">
        <span className={`n ${props.disabled ? 'text-muted' : ''}`}>
          {customVersions.map((url, i) => {
            if (selectedVersion === url) return (<span data-id="selectedVersion" key={i}>custom</span>)
          })}
          {allversions.map((build, i) => {
            if ((selectedVersion || defaultVersion) === build.path) {
              return (<span key={i}><span data-id="selectedVersion">{build.longVersion}</span>{build.path === latestPath && latest}</span>)
            }
          })}
        </span>
      </Dropdown.Toggle>

      <Dropdown.Menu className="sc-menu sc-menu-full" data-id="custom-dropdown-items">
        {allversions.length <= 0 && (
          <Dropdown.Item as="button" key="default" data-id="builtin" active={selectedVersion === defaultVersion}>
            <span className="n">{defaultVersion}</span>
          </Dropdown.Item>
        )}
        {allversions.length <= 0 && (
          <Dropdown.Item as="button" key="builtin" data-id="builtin" active={selectedVersion === 'builtin'}>
            <span className="n">builtin</span>
          </Dropdown.Item>
        )}
        {customVersions.map((url, i) => (
          <Dropdown.Item as="button" key={`custom-${i}`} data-id={`dropdown-item-${url}`} active={selectedVersion === url} onClick={() => handleLoadVersion(url)}>
            <span className="n">custom: {url}</span>
          </Dropdown.Item>
        ))}
        {allversions.map((build, i) => {
          if (onlyDownloaded && !build.isDownloaded) return null
          return _shouldBeAdded(build.longVersion) ? (
            <Dropdown.Item as="button" key={`soljson-${i}`} data-id={`dropdown-item-${build.path}`} active={selectedVersion === build.path} onClick={() => handleLoadVersion(build.path)}>
              <span className="n">{build.longVersion}{build.path === latestPath && latest}</span>
              {platform == appPlatformTypes.desktop ? <i className={`${build.isDownloaded ? 'fas text-success' : 'far'} fa-arrow-circle-down ms-auto`}></i> : null}
            </Dropdown.Item>
          ) : null
        })}
      </Dropdown.Menu>
    </Dropdown>
  )
}